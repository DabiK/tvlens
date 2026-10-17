---
id: T238
titre: Open Mac archives through the session coordinator
statut: a-faire
bloque_par: T237
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le Mac ouvre et rouvre ses archives par le coordinateur partagé, sans écriture ni fournisseur
à la simple consultation. La mémoire reste figée ; les questions explicites restent autorisées et sauvegardées.

## Sources

- `docs/domaine.md`, sections 3 Bibliothèque/Questions et 9 ; ADR 0029/0030.
  T237 raccorde le Mac et sérialise ses transitions ; T236 fournit l'ouverture commune.
- Code vérifié à `1d8aa48` : `app/main.cjs:462` porte l'ouverture ; `:466` traite la réouverture
  de la même archive, `:469` lit l'autre archive avant de quitter la session courante, `:471`
  relit la session courante après sa fermeture. Une archive illisible ne doit pas évincer la session chargée.
- `app/main.cjs:472` restaure le runtime ; `:475`, `:476` et `:478` restaurent silencieusement
  questions, résumé et surveillance, puis `:480` à `:484` publient leur état.
  `:213` interdit la sauvegarde automatique du résumé d'une archive seulement lue.
- `runtime/headless-session-lifecycle.cjs:207` possède déjà la variante serveur : lecture avant
  libération, adoption des questions à `:230`, registre à `:232`. Le résumé est une capacité Mac.
- `runtime/session-runtime.cjs:264` ouvre une archive ; `runtime/session-lifecycle.cjs:3`
  restaure inventaire et mémoire ; `core/deep-ask.cjs:69` restaure sans publication.
  Les formats passent déjà par le convertisseur T208 et ne changent pas ici.
- Tests lus : `tests/mac-ipc-contract.test.cjs:388` et `:410`,
  `tests/headless-session-lifecycle.test.cjs:329` et `:373`,
  `tests/session-lifecycle.test.cjs:187`, server-sessions et deep-ask-restore.

## Périmètre

- Modifier l'appel `sessions:open` dans `app/main.cjs`, les capacités Mac déclarées par la
  composition de `app/`, l'ouverture du coordinateur dans `runtime/library/`, ainsi que leurs bancs. Le gestionnaire
  IPC ne garde que l'appel applicatif
  et la réponse historique `{ id, readOnly, elapsedMs }`.
- Base attendue, transitive par T237/T227 : vue publique, projection, événements et formats
  versionnés sont déjà livrés. Les données restaurées du résumé et de la surveillance sont
  réinitialisées par leurs accès spécialisés, sans retour aux listes privées de la Mémoire.
- Préserver validation et lecture avant abandon de la session courante. Pour ouvrir la session
  qui est encore chargée, attendre sa sauvegarde de fin avant de relire son archive. La lecture
  seule ne signifie ni reprise de capture, ni préchauffage, ni indexation, ni synthèse.
- Déclarer restauration du résumé, détachement de son ancien abonnement et publication Mac
  comme capacités/étapes du coordinateur. Celui-ci effectue l'adoption cohérente de la session,
  des questions et des métadonnées T235, sans état intermédiaire appartenant à deux sessions.
- Réutiliser la couture de fin transitoire de T237 pour quitter l'ancienne session tant que
  T239 n'a pas migré la fin Mac. Ne recopier ni `closeSession`, ni son ordre dans le chemin d'ouverture.
  Toute obligation de révocation ou de sauvegarde reste un appel explicite, jamais un abonné.
- Conserver replay, miniatures, titres, questions historiques et nouveaux identifiants. Ne pas
  réécrire le corpus historique, ajouter de format ni déplacer la recherche ou le protocole média.
  Élaguer les suppressions ESLint devenues inutiles ; aucun nouveau fichier ne reçoit de gel.

## Critères d'acceptation

1. Ouvrir une archive avec passages, questions, résumé et registre restitue leur contenu et leur
   disponibilité dès la première consultation. La session est chargée, en lecture seule, non
   accueillante à la capture ; aucun fournisseur, embedding, préchauffage ou synthèse ne démarre.
2. Les octets, identités de fichiers et dates du dossier restent identiques après ouverture,
   temps virtuel écoulé, réouverture de la même archive et fermeture sans question ni reprise.
   Une archive vide préexistante survit, même après reprise explicite puis pause (règle T191).
3. Une archive inconnue, invalide ou future est refusée avant de quitter la session chargée :
   session, questions et résumé précédents restent consultables. Ouvrir pendant capture ou analyse
   conserve le refus Mac caractérisé, sans inventer une permission de changement en cours d'analyse.
4. Une question explicite sur l'archive est répondue et sauvegardée dans son `deep-answers.json`,
   sans reprise de capture ni changement des autres documents hors enrichissement déjà autorisé.
   Les questions de la session précédente ne sont ni montrées ni sauvegardées dans celle ouverte.
5. Une restauration ou notification tardive de A ne remplace pas B ; réouvrir B déjà chargée
   ne la ferme pas et ne crée ni nouvel abonnement ni nouvelle vie de capture.
6. À l'implémentation, jouer en séquentiel mac-ipc-contract, `tests/headless-session-lifecycle.test.cjs` (ou le
fichier du coordinateur nommé au journal de T236), archive-compat,
   session-lifecycle, deep-ask-restore, les tests du résumé et le contrat T234, puis `node scripts/check.mjs`.
   La preuve complète de migration de fin Mac reste à T239 ; aucune assertion de durabilité n'est diminuée.

7. `tests/mac-ipc-contract.test.cjs` enveloppe la fabrique du coordinateur comme ses fabriques
   actuelles (`:226-235`) et observe que `sessions:open` passe par ses commandes et sa chaîne,
   réouverture de la même archive comprise ; ce test échoue sur la base d'avant ce ticket.

## Test d'acceptation attendu

Le banc `tests/mac-ipc-contract.test.cjs` conduit le vrai preload et compare l'empreinte du dossier
avant/après consultation ; le corpus T222/T215 sert sur copie temporaire. Retenir une lecture
et changer de session prouve l'isolation. Le test observe les appels des fournisseurs et les
écritures réelles, sans régénérer les témoins ni lire la forme de l'hôte.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T237 implique T227 et les migrations de phase 1 des mêmes fichiers. L'ouverture de la session
chargée doit relire son dernier état après fin ; elle ne peut réutiliser une lecture antérieure.
Les interfaces de restauration sont celles effectivement livrées par les prérequis.

## Journal
