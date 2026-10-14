---
id: T146
titre: Serve the simulated providers of the smoke mode from one adapter module
statut: a-faire
bloque_par: T121
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: simple
---

## Ce que le ticket livre

En mode smoke, les deux hôtes remplacent les fournisseurs (inspection, perception, agent vidéo,
vérificateur, synthèse) par des faux. Aujourd'hui, ces faux sont écrits en ligne dans la composition de
production, au milieu du câblage réel. Après ce ticket, ils vivent dans un seul module,
`adapters/simulated-providers.cjs`, testé seul, comme `adapters/simulated-surveillance-agent.cjs`. La
composition choisit entre le faux et le vrai en une ligne. Ce que rendent les faux ne change pas :
les tests qui composent en `smoke: true` passent sans modification.

## Sources

- Constats : CORE-04 (`docs/audit-maintenabilite.md`, ancre `CORE-04`) et la part « doublures en ligne »
  d'ADP-06. Ce ticket ne fait que le déplacement. Le simulateur à deux voies (`transcribe` et
  `observeVisual`, décision D6) change la forme des passages publiés dans 16 fichiers de tests : il reste
  hors du ticket.
- Plan court : section « Plan court » de `docs/travail/tickets/INDEX.md`.
- Code concerné, à la version `0d4c495` (le nom d'abord, la ligne ensuite) :
  - `runtime/session-runtime.cjs`, `createSessionRuntime` :
    - `inspectionModel`, faux avec `localInspection`, lignes 161-180 : `inspect` rend une observation
      « Un cercle est visible dans les planches du test. » par segment et la limite « Modèle simulé pour
      le test local. » ; `selectRegion` rend un rectangle fixe ;
    - `inspector`, faux en smoke sans `liveInspection` ni `localInspection`, lignes 188-202 : une
      observation « Le cercle effectue un bref saut entre deux images. » par segment, bornée à
      l'intervalle demandé, `sampledFrames: 12` ;
    - `perception`, faux en smoke sans `liveObservation` et sans `overrides.perception`, lignes 237-258 :
      `observe` (résumé « Un cercle se déplace sur un fond bleu. », nombre d'images, audio reçu ou non) et
      `ask`, qui cite le dernier passage du contexte.
  - `app/main.cjs` :
    - `videoAgent`, faux en smoke sans `--live-video-agent`, lignes 130-138 : `search_moments`, attente de
      2500 ms annulable par le signal, puis `inspect_clip` sur le premier moment ;
    - `verifierAdapter`, faux en smoke sans `--live-verifier`, lignes 227-235 : attente de 2500 ms, erreur
      « Recherche indisponible (test). » pour l'affirmation `FAIL_TEST`, sinon une conclusion sur
      Apollo 11 avec une source NASA ouverte ;
    - `newRecapAdapter`, faux en smoke sans `--live-recap`, lignes 296-301.
  - Modèle à suivre : `adapters/simulated-surveillance-agent.cjs`, déjà importé par les deux hôtes.
- Tests qui composent en `smoke: true` (16 fichiers, `grep -ln "smoke: true\|smoke:true" tests/*.cjs`) :
  `architecture-f05`, `-f06`, `-f07`, `-f10`, `chat-instruction`, `clip-unreadable`, `disk-guard`,
  `server-ingest-path`, `remote-server`, `session-delete`, `server-sessions`, `server-state-views`,
  `review-regressions`, `session-durable`, `server-surveillance`, `timeline-server`.
- Bancs du Mac : `tests/mac-ipc-contract.test.cjs`, `tests/architecture-f05.test.cjs` et
  `tests/architecture-f07.test.cjs` chargent `app/main.cjs` sous `Module._load`. Ils ne substituent que
  certains modules requis depuis `app/main.cjs`. Un nouveau module requis par `main.cjs` est chargé tel
  quel.

## Périmètre

- À modifier :
  - créer `adapters/simulated-providers.cjs`, qui exporte une fabrique par faux :
    `simulatedInspectionModel()`, `simulatedInspector()`, `simulatedPerception()`,
    `simulatedVideoAgent()`, `simulatedVerifier()`, `simulatedRecap()`. Les textes, délais et formes
    rendus sont ceux d'aujourd'hui, au caractère près. Un délai porte un nom ;
  - `runtime/session-runtime.cjs` et `app/main.cjs` : remplacer chaque faux en ligne par l'appel de sa
    fabrique, sous la même condition qu'aujourd'hui ;
  - créer `tests/simulated-providers.test.cjs`.
- À ne pas toucher :
  - les conditions de choix (`smoke`, `liveInspection`, `localInspection`, `liveObservation`, les
    drapeaux `--live-*`) et le paramètre `overrides`, que des tests et
    `scripts/replay-reinspection.cjs` utilisent ;
  - `adapters/simulated-surveillance-agent.cjs` et sa ligne de composition dans `app/main.cjs`, qu'une
    garde de `tests/mac-ipc-contract.test.cjs` lit (`agent: smoke && … new SimulatedSurveillanceAgent(`) ;
  - le faux de `runtime/headless-runtime.cjs` pour la surveillance, qui est déjà
    `SimulatedSurveillanceAgent` ;
  - les 16 fichiers de tests en `smoke: true`, `tests/mac-ipc-contract.test.cjs` et `tests/mac-ui.test.cjs`.
- Le module ne lit ni `process.env` ni `process.argv` : les deux hôtes décident, le module fabrique.

## Critères d'acceptation

1. `tests/simulated-providers.test.cjs` vérifie chaque fabrique par sa méthode publique :
   - l'inspecteur borne chaque observation à l'intervalle demandé et rend `sampledFrames: 12` ;
   - la perception dit si l'audio est reçu ou non, et `ask` cite le dernier passage du contexte ;
   - le vérificateur rejette `FAIL_TEST` avec « Recherche indisponible (test). » et, sinon, rend une
     source dont l'adresse figure dans `research.openedUrls` ;
   - l'agent vidéo appelle `search_moments` puis `inspect_clip`, et s'arrête sur un signal annulé
     pendant son attente.
   Les attentes de 2500 ms sont pilotées par une horloge maîtrisée (`mock.timers` de `node:test`, ou
   le délai injecté), jamais attendues.
2. Plus aucun faux n'est écrit en ligne dans la composition : `grep -cE "Un cercle|FAIL_TEST|Apollo"
   runtime/session-runtime.cjs app/main.cjs` rend 0 pour chacun des deux fichiers. Sortie dans le journal.
3. Les 16 fichiers de tests en `smoke: true`, `tests/mac-ipc-contract.test.cjs` et `tests/mac-ui.test.cjs`
   passent sans aucune modification : `git diff --stat` ne les cite pas.
4. `grep -c "process\." adapters/simulated-providers.cjs` rend 0.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/simulated-providers.test.cjs`, frontière : les fabriques de `adapters/simulated-providers.cjs`,
appelées comme la composition les appelle. Le critère 3 prouve que le déplacement ne change rien aux
deux hôtes.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Un seul module, pas un par faux.** Les six faux font ensemble une centaine de lignes et servent le
  même mode. Un module par faux multiplierait les fichiers sans rien isoler de plus.
- **Le déplacement seul.** Le simulateur à deux voies de CORE-04 change ce que publient 16 fichiers de
  tests. Il attend la décision D6 et reste derrière T145.
- **Après T121**, qui modifie les lignes voisines de l'inspecteur dans `createSessionRuntime`.

## Journal
