# 0030 — Un seul coordinateur de sessions pour les deux hôtes, qui déclarent leurs capacités

- Date : 2026-10-16
- Ticket : aucun ; décision de conception du propriétaire, décrite dans `docs/domaine.md`
- Statut : acceptée ; amende l'ADR 0007

## Contexte

L'ADR 0007 a mis en commun le protocole de fin (`runtime/session-closing.cjs`), mais chaque hôte garde son propre
cycle de vie : `runtime/headless-session-lifecycle.cjs` côté serveur, et `app/main.cjs:344-499` côté Mac. Une même
règle est donc écrite deux fois, et les copies divergent : dans un cas où le serveur garde l'archive, le Mac l'efface.
Arrêter la capture met la session en pause sur le Mac, pas sur la TV. Sur la TV, la page arrête la capture locale, la
voit s'arrêter, puis termine la session (`tv/app/companion.js:329-343`). Les commandes de pause et de fin visent la
session courante, quelle qu'elle soit (`server/session-routes.cjs:56`, `:63`).

## Décision

- **Un seul `SessionCoordinator`**, dans `runtime/library/`, issu du coordinateur headless (ADR 0024). Il porte toutes
  les transitions : ouvrir, mettre en pause, reprendre, finir, archiver, rouvrir, supprimer.
- **Le coordinateur appelle lui-même les étapes obligatoires.** Avant sa première attente, il ferme l'admission,
  invalide les préparations et révoque les accès concernés. Les événements de fin annoncent un état déjà établi ; ils
  ne portent seuls aucune obligation. Le résultat distingue archivage confirmé, ressources scellées et session
  effectivement déchargée.
- **Il garde le cycle de ressources propre à chaque session** (ADR 0020), sans le fondre dans celui de l'hôte.
- **Chaque hôte déclare ses capacités et ses étapes propres** : révocation des contextes MCP et résumé vivant sur le
  Mac, préparations HTTP des blocs sur le serveur. L'ordre des étapes communes est celui du serveur.
- **Décharger une session annule et sauvegarde sa file de questions.** Seule la session chargée soumet des questions.
- **La pause est la même partout** : elle arrête la capture, l'admission et l'horloge de session. Les analyses et les
  questions déjà lancées vont au bout. À la reprise, la capture repart sur l'horloge du serveur.
- **Sur la TV, la page pilote la capture et le serveur décide de la fin.** La page arrête la capture locale, puis
  demande la fin. Deux confirmations restent distinctes : la fermeture côté serveur et l'arrêt de la capture côté TV.
  Les nouvelles commandes nomment la session visée. En filet de sécurité, Python s'arrête aussi sur un refus codé
  `session-ended`. Un ancien client garde un comportement défini.
- Le protocole de l'ADR 0007 reste vrai : la fin est levée avant toute attente, chaque étape est tentée, rien n'est
  effacé sans scellement.

## Alternatives écartées

- Deux cycles de vie aux mêmes garanties, avec leurs différences documentées : chaque règle resterait à maintenir en
  double, et les divergences actuelles montrent que cela ne tient pas.
- Des abonnés à `EndStarted` pour révoquer, annuler ou sauvegarder : un abonné isolé peut échouer sans arrêter la fin.
- Une fin TV orchestrée par le serveur : le serveur n'atteint pas le contrôleur de capture de la TV ; il faudrait un
  nouveau protocole distribué.

## Conséquences

- Une règle de session n'est écrite qu'une fois, et un correctif atteint les deux hôtes.
- `app/main.cjs` perd sa fin de session et ne garde que des appels au coordinateur.
- Les restrictions de non-fusion posées par T191 et T192 cessent quand cette décision commence à s'appliquer.
- Les fonctions du Mac (résumé vivant, moments gardés, recherche, vérification manuelle) peuvent arriver sur la TV sans
  second cycle de vie ; chacune garde son propre coût de conservation et d'accès distant.
- La migration du Mac se fait par étapes (démarrer et mettre en pause, ouvrir, finir et supprimer), après les bancs par
  coutures du Mac (T195, T203). Le changement du contrôle TV passe après des tests du producteur Python et du client
  déjà déployé.

## Protégée par

Les tests du coordinateur, exécutés pour chacun des deux hôtes, une fois la migration faite ; un test de contrat qui
fait échouer une étape obligatoire et vérifie que la fin ne se déclare pas réussie.
