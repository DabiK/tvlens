---
id: T241
titre: Target pause and end commands at the named session
statut: a-faire
bloque_par: T240, T232
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une nouvelle commande de pause ou de fin nomme la session visée : elle ne peut plus agir sur
celle chargée entre-temps. Les anciennes commandes sans identité conservent leur comportement `/v1`.

## Sources

- `docs/domaine.md`, sections 9 et 10 ; ADR 0030. Le fil évolue par ajouts et garde les séquences
  de l'ancien client ; T038 le teste avec le vrai client JavaScript.
- Code vérifié à `1d8aa48` : `server/session-routes.cjs:59` ignore le corps de pause,
  `:66` fait de même pour end et `:67` fournit l'alias `/v1/sessions/close`.
- `runtime/headless-runtime.cjs:384` vérifie déjà une identité avec `stale-session`, mais
  `:392` et `:460` délèguent pause/end sans cible. Le propriétaire des transitions est
  `runtime/headless-session-lifecycle.cjs:119` et `:186`, à remplacer par la livraison T236.
- `runtime/session-lifecycle.cjs:162` pause déjà horloge et admission ; il ne faut pas réécrire
  cette règle dans la route. `runtime/headless-session-lifecycle.cjs:187` coalesce actuellement les fins.
- Tests lus : `tests/wire-contract.test.cjs:158` et `:195` envoient encore `{}` ;
  `tests/server-routes.test.cjs:239` couvre les commandes sans identité et leur enveloppe historique.
  Client courant : `tv/app/sessions-view.js:475` et `tv/app/companion.js:340`, sans identité.
- `server/http.cjs:72` traduit déjà le refus d'identifiant en `invalid-session-id` ; `:136`
  et `:163` refusent un POST sans JSON requis ou avec JSON invalide. Un corps vide n'est pas `{}`.

## Périmètre

- Modifier `server/session-routes.cjs`, la traduction HTTP seulement si nécessaire, les délégations headless et les commandes du coordinateur
  partagé ; étendre server-routes, les tests de transitions et wire-contract. T240 ordonne les
  changements du même coordinateur ; il implique T227 et donc T226 qui modifie aussi cette route.
- Accepter le champ facultatif `sessionId` dans le JSON de pause et end ; l'appliquer aussi à
  l'alias close pour qu'une commande nommée ne perde pas sa cible en passant par la bibliothèque.
  Conserver les clés de succès historiques et les faits supplémentaires de T250 conservés par T236.
- Distinguer champ absent et champ présent invalide. Une identité présente vide, nulle ou de
  mauvais type est refusée en `invalid-session-id`, par la validation d'identité déjà livrée ;
  elle ne retombe jamais sur « session courante ».
  Une identité différente ou sans session chargée est refusée avec le code existant `stale-session`.
- Valider la cible dans la transition sérialisée, juste avant ses effets. Une lecture de l'hôte
  avant mise en file ne suffit pas ; une requête pour A exécutée après adoption de B n'agit pas
  sur B. Deux fins ne partagent leur promesse que si cela respecte aussi leur cible explicite.
- La route traduit les refus applicatifs en HTTP selon le mécanisme existant. Réutiliser les codes
  déclarés par leur émetteur, sans texte d'erreur reconnu, sans statut HTTP ajouté dans le domaine
  ou le nouveau coordinateur. La pause appelle le cycle ADR 0020, sans annuler les travaux lancés.
- Garder le chemin sans identité et ses résultats, y compris sans session chargée et via close.
  Ne pas modifier ici les commandes de la page ou Python, ni rendre l'identité obligatoire aux
  anciens clients. Le transport continue de demander un objet JSON valide pour ces POST.
- Aucune modification de capture, de format d'archive, de canal Mac ou de harnais. Élaguer les
  suppressions ESLint devenues inutiles dans les seuls fichiers affectés.

## Critères d'acceptation

1. Pause/end avec le `sessionId` chargé affectent cette session. Pause fige horloge et admission,
   conserve les questions et analyses lancées ; end conserve le résultat détaillé de T250.
2. Identité étrangère ou absente de l'hôte : refus codé `stale-session`, sans pause, révocation,
   sauvegarde de fin, changement d'époque ou déchargement de la session chargée. Une identité
   présente invalide est un refus codé distinct de l'absence facultative.
3. Retenir une transition, mettre en file une commande nommant A, adopter B avant son exécution :
   la commande refuse sans modifier B. Une fin de B déjà en cours ne transforme pas une fin
   nommant A en succès par coalescence. Tester pause, end et l'alias close.
4. Les mêmes requêtes sans `sessionId`, avec `{}` comme aujourd'hui,
   conservent statut, clés historiques et séquence de l'ancien client, session chargée ou non.
   Corps absent, non JSON ou invalide gardent leurs refus HTTP actuels. Le vrai client de T038
   continue à fonctionner ; ses témoins ne sont pas réécrits pour masquer un changement.
5. À l'implémentation, jouer en séquentiel server-routes, wire-contract, server-sessions,
   `tests/headless-session-lifecycle.test.cjs` (ou le fichier du coordinateur nommé au journal de T236) et le contrat
   T234, puis `node scripts/check.mjs`.
   Aucune garantie de l'ADR 0006/0023 sur l'admission des blocs n'est modifiée.

## Test d'acceptation attendu

`tests/wire-contract.test.cjs` fait parler le vrai client TV au vrai serveur local avec et sans
identité. `tests/headless-session-lifecycle.test.cjs` (ou le fichier du coordinateur nommé au journal de T236)
retiennent sa chaîne pour imposer la course A → B et la
coalescence concurrente. Les assertions observent refus, horloge, session et effets ; une simple
validation unitaire du JSON de requête ne prouve pas l'identité au moment de l'exécution.

## Hypothèses bloquantes

Aucune décision n'est attendue.

`stale-session` réutilise le refus existant d'identité obsolète ; ce n'est pas une nouvelle règle
métier. Le champ facultatif est un ajout au fil. Les anciens appels non nommés restent pris en
charge ; la protection contre les changements de session est celle des nouvelles commandes nommées.

## Journal
