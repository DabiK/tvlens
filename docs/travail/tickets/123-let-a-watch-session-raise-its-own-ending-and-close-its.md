---
id: T123
titre: Let a watch session raise its own ending and close its intake
statut: a-faire
bloque_par: T163
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La fin d'une session est annoncée par des écritures directes dans `WatchSession` depuis deux modules de
`runtime/`. La session expose deux transitions nommées, `beginEnding()` et `closeIntake()`, que ces modules
appellent. Une garde d'architecture refuse les écritures de `ending`, `accepting`, `readOnly` ou `closed`
depuis les compositions. Les passages acceptés pendant la fin restent stockés sans lancer d'analyse ;
les états publiés, les archives et les refus gardent leur comportement.

## Sources

- Constat CORE-06 : rendre au domaine la propriété de ses transitions. Décision du propriétaire, le 15/10 : ouverture sélective après T150, sans dépendance au formatage T028.
- Code vérifié à la version `e92c6a6` :
  - `runtime/session-closing.cjs:73`, `closeSession` lève `session.watch.ending` avant le début synchrone
    et la première attente ; il ne ferme pas l'admission des passages à ce moment ;
  - `runtime/session-runtime.cjs:461`, `close` : après révocation de l'inspecteur, le bloc partagé
    `ending ||= …` écrit `asking = true` à la ligne 471, `accepting = false` à la ligne 474, puis
    `ending = true` à la ligne 477, avant `watch.landed()` à la ligne 478. Aucune publication entre elles ;
  - `core/session.cjs:47`, constructeur de `WatchSession` ; setter `asking` à `core/session.cjs:77` ;
    refus d'admission à `core/session.cjs:83` ; exclusion de la file d'analyse pendant la fin à
    `core/session.cjs:122` ; gardes de fin dans `drain`, `drainAudio`, `drainVision` et `retriesVision`
    à `core/session.cjs:225`, `core/session.cjs:259`, `core/session.cjs:305`, `core/session.cjs:300` ;
    refus de question à `core/session.cjs:374`, publication à `core/session.cjs:494` ;
  - appelants du protocole : `app/main.cjs:343` et `runtime/headless-runtime.cjs:809` ; composition
    de la session : `app/main.cjs:293` et `runtime/headless-runtime.cjs:617` ;
  - les deux hôtes écrivent toujours `asking` lors des changements de questions : `app/main.cjs:157`
    et `runtime/headless-runtime.cjs:292`. Leur mutualisation n'est pas livrée et ne bloque pas ce ticket ;
  - `tests/architecture.test.cjs:5` et `tests/architecture.test.cjs:15` portent les gardes de couches ;
    `tests/architecture-f07.test.cjs:64` construit une doublure de session dont `watch` n'a encore que
    le champ `ending`, à adapter à la nouvelle méthode ;
  - tests protecteurs : `tests/session-durable.test.cjs:540` (« a passage that lands while its session
    is being ended is kept and saved, but starts no analysis only to have it abandoned »),
    `tests/architecture-f08.test.cjs:100` (« nothing is described again once the session is ending,
    read-only or closed »), `tests/split-perception.test.cjs` et `tests/session-latency.test.cjs`.
- ADR 0005 (révocation des ressources), 0006 (possession des blocs) et 0007 (protocole partagé de fin) :
  leur ordre et leurs garanties restent applicables.

## Périmètre

- `core/session.cjs`, `WatchSession` :
  - `beginEnding()` lève seulement `ending`, sans publication ;
  - `closeIntake()` met `asking` à vrai par le setter existant, puis `accepting` à faux, sans publication.
  Ces méthodes sont synchrones et idempotentes. Leurs commentaires expliquent ce qu'elles empêchent.
- `runtime/session-closing.cjs` : remplacer l'affectation par `session.watch.beginEnding()` au même endroit.
- `runtime/session-runtime.cjs`, `close` : remplacer les trois écritures par `watch.closeIntake()` puis
  `watch.beginEnding()`, avant `await watch.landed()`. Garder la révocation et l'ordre des fermetures.
- `tests/architecture.test.cjs` : ajouter une garde distincte parcourant les fichiers `.cjs` de `app/`,
  `runtime/`, `server/` et `mcp/`, sous-dossiers compris. Elle refuse les affectations directes aux quatre
  drapeaux via `watch`, y compris `session.watch`, sans confondre une comparaison avec une affectation.
  `asking` reste hors de cette garde : les deux hôtes en ont encore la charge.
- Créer `tests/watch-session-ending.test.cjs` pour les deux transitions publiques.
- `tests/architecture-f07.test.cjs` : seule adaptation autorisée, donner `beginEnding()` à la doublure
  `stage`, avec le même effet sur son champ `ending`. Conserver toutes les assertions et tous les cas.
- À ne pas toucher : les affectations de `asking` des hôtes, les écritures de drapeaux des autres tests
  et scripts, `WatchSession.close()`, `stop()`, `restore()`, `snapshot()` et les formats sur disque.

## Critères d'acceptation

1. Un test public vérifie que `beginEnding()` lève `ending`, conserve `accepting`, `asking`, `readOnly`
   et `closed`, ne publie rien et reste idempotente. Un `ingest` suivant est accepté : son passage est
   dans `segments`, absent des files d'analyse, et aucun fournisseur n'est appelé.
2. Un test public vérifie que `closeIntake()` lève `asking` puis ferme `accepting`, laisse les autres
   drapeaux inchangés, ne publie rien et reste idempotente. Une ingestion est ensuite refusée avec
   « La session est arrêtée. » et une question valide avec « Une réponse est déjà en cours. ».
3. La garde ajoutée échoue quand `session.watch.ending = true` est temporairement réintroduit dans
   `closeSession`, et passe après son retrait. Les deux résultats sont inscrits au journal. Elle accepte
   les lectures et comparaisons des mêmes drapeaux.
4. Aucune affectation directe de `ending`, `accepting`, `readOnly` ou `closed` d'une session ne reste dans
   les quatre dossiers de compositions parcourus par la garde.
5. `tests/watch-session-ending.test.cjs`, `tests/architecture.test.cjs`, `tests/architecture-f07.test.cjs`,
   `tests/session-durable.test.cjs`, `tests/architecture-f08.test.cjs`, `tests/split-perception.test.cjs`
   et `tests/session-latency.test.cjs` passent, lancés un fichier à la fois. Les assertions existantes
   sont inchangées ; seule la doublure du périmètre est adaptée.
6. `node scripts/check.mjs --changed` est vert.

## Test d'acceptation attendu

`tests/watch-session-ending.test.cjs` construit une `WatchSession` avec horloge et ports simulés, compte
les publications autour de chaque transition et pilote une ingestion. Il distingue les publications
de la transition (zéro) de celles de l'ingestion. Les tests de durabilité et du protocole partagé
conservent les garanties au niveau du runtime et des deux hôtes.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Deux axes restent nécessaires : `ending` peut coexister avec `accepting` ou `readOnly`. Aucune phase
exclusive ni mutualisation de la porte des questions n'est ajoutée. Le niveau est `sensible`, car les
appels remplacés participent à la fermeture de session et à l'admission des passages.

## Journal

Rafraîchi le 15/10 contre `e92c6a6` : repères corrigés, T028/T145 remplacés par T150, écritures de `asking`
encore présentes nommées, adaptation nécessaire de la doublure du protocole explicitée. Lecture seule
pour le code et les tests ; aucun test exécuté pendant ce rafraîchissement.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.
