---
id: T152
titre: Run the Mac and TV smokes in the full quality check
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Seuls les smokes chargent la fenêtre Mac et le panneau TV, et personne ne les lance pendant qu'un
ticket tourne. Un ticket qui casse l'ordre d'initialisation de la fenêtre, ou le dessin d'une vue de la
TV, passe donc tous les contrôles de la boucle. Après ce ticket, le contrôle complet
(`node scripts/check.mjs`) lance les six smokes l'un après l'autre, après les tests. Un smoke rouge, ou
qui dépasse son délai, rend le contrôle rouge et le nomme. La boucle refuse donc le ticket sans que
personne regarde, de jour comme de nuit.

## Sources

- Décision du propriétaire, le 14/10 : un script plutôt qu'un agent de QA, pour automatiser les tests de
  l'interface du Mac et de la TV où qu'on soit.
- Plan court : section « Plan court » de `docs/travail/tickets/INDEX.md`.
- Smokes à lancer, mesurés sur ce Mac à la version `f2cd5c1` : tous rendent 0.
  - `scripts/smoke-electron.mjs`, 72 s : la vraie fenêtre Electron pilotée par Playwright, avec
    `--smoke-test` et les faux fournisseurs ; le dossier de données est temporaire (`app/main.cjs:42`) ;
  - `scripts/smoke-lg-ui.mjs`, 4 s ;
  - `scripts/smoke-tv-timeline.mjs`, 5 s ;
  - `scripts/smoke-tv-overlay.mjs`, 24 s ;
  - `scripts/smoke-tv-ambient.mjs`, 13 s ;
  - `scripts/smoke-tv-end-to-end.mjs`, créé par T151.
- `scripts/check.mjs` :
  - l'en-tête dit que la règle s'écrit là une seule fois, pour les hooks, la boucle et la CI ;
  - `TEST_BUDGET_MS` (l. 27) et `run` (l. 29-45) montrent comment un budget arrête tout un groupe de
    processus ;
  - un outil absent est signalé « non lancé ».
- `scripts/loop/run.mjs`, `gates` (l. 283-309) : la boucle lance `scripts/check.mjs` sans option. Elle
  n'a pas besoin de changer.
- Qui lance le contrôle complet pendant un ticket : l'implémenteur, avant de rendre la main
  (`.claude/agents/implementeur.md:26-27`), l'orchestrateur à la fin (`.claude/skills/ticket/SKILL.md:72`),
  puis la boucle. Ces trois lancements se suivent, jamais en même temps : il n'y a jamais deux Electron à
  la fois.
- Tests du contrôle : `tests/quality-check.test.cjs`. Ils lancent `scripts/check.mjs` dans un dépôt
  temporaire ; le test l. 99 prouve déjà qu'un budget dépassé arrête tout et ne laisse aucun processus.
- `CLAUDE.md`, section « Contrôler ».
- Première tentative, le 14/10 : bloquée. Le premier contrôle complet avec les smokes a été rouge sur
  `smoke-electron.mjs`, qui attendait le moment gardé 30 s pendant une suite de transcriptions. T157 rend cette
  attente fiable. La relecture ne laissait que le bloquant des critères 2 et 4, et la session tenait les
  critères 1, 3, 5 et 6. Son travail est gardé hors Git, dans `.harness-state/archives/T152-bloque-1/` :
  - `code.patch` : le diff de `scripts/check.mjs`, `tests/quality-check.test.cjs` et `CLAUDE.md` ;
  - `ticket.patch` : son journal et ses écarts acceptés ;
  - `etat/` : exploration, écarts, relectures et journaux de contrôle.

  On peut repartir de ce diff, en l'appliquant par `git apply`. Il se revérifie alors en entier : tests vus
  rouges sans lui, mutation du critère 3, relecteur neuf sur l'état final, puis les critères 2 et 4.
- Deuxième tentative, le 14/10 : arrêtée par le propriétaire avant ses contrôles complets. T157 n'a pas établi la
  cause de l'échec de `smoke-electron.mjs` : au clic, une seule transcription est en cours, et une transcription qui
  dépasse son plafond de 15 s fait abandonner la conservation sans que le smoke le sache. Le ticket est parqué
  derrière T145 tant que ce smoke n'est pas fiable. Travail gardé dans `.harness-state/archives/T152-arrete-2/`.

## Périmètre

- À modifier :
  - `scripts/check.mjs`, en mode complet seulement :
    - une étape `smokes`, après les tests JS et Python, qui lance les six smokes dans l'ordre des
      Sources, un à la fois, par `node <script>`, sans argument ;
    - chaque smoke a un budget nommé (5 minutes par défaut, réglable par une variable `TVLENS_` comme
      `TEST_BUDGET_MS`). Au-delà, tout son groupe de processus est arrêté ;
    - l'étape affiche chaque smoke avec sa durée. Si un smoke rend autre chose que 0 ou dépasse son
      budget, l'étape est rouge : elle nomme ce smoke, dit s'il a échoué ou dépassé son délai, et montre
      la fin de sa sortie. Les smokes suivants sont lancés quand même ;
    - une option `--no-smokes` saute l'étape, signalée « non lancé (--no-smokes) » ;
    - `--changed` et `--file` ne lancent aucun smoke ;
    - l'en-tête du script décrit l'étape et l'option ;
  - `tests/quality-check.test.cjs`, dans le dépôt temporaire de ses tests :
    - un smoke qui rend 1 rend le contrôle complet rouge et le nomme ;
    - un smoke qui ne se termine pas est arrêté à son budget, nommé, et ne laisse aucun processus ;
    - `--changed` ne lance aucun smoke ;
    - `--no-smokes` le signale « non lancé » ;
  - `CLAUDE.md`, section « Contrôler » : le contrôle complet lance aussi les smokes du Mac et de la TV ;
    `--no-smokes` existe pour aller plus vite pendant le travail, jamais à la place du contrôle final.
- À ne pas toucher :
  - les smokes eux-mêmes, `scripts/loop/run.mjs`, `scripts/quality/` et le plancher du cliquet ;
  - les autres tests ;
  - les agents et la skill `ticket` : ils lancent déjà le contrôle complet aux bons moments.
- Jamais de drapeau `--live-*`, ni de script `*:live` : aucun fournisseur réel, aucun quota.

## Critères d'acceptation

1. Les quatre tests ajoutés à `tests/quality-check.test.cjs` passent. Ceux du smoke rouge, du délai et de
   `--no-smokes` échouent si l'on retire l'étape `smokes`, sortie rouge au journal.
2. `node scripts/check.mjs` sur le dépôt affiche l'étape `smokes`, avec les six smokes et leur durée,
   et finit vert. Sortie au journal.
3. Mutation temporaire : `app/renderer.js` lève une erreur au chargement. Le contrôle complet est rouge,
   et l'étape nomme `smoke-electron.mjs`. Sortie au journal, puis la mutation est retirée.
4. Stabilité : trois contrôles complets de suite, chacun vert, avec la durée de chaque smoke notée au
   journal. Un échec n'est pas relancé jusqu'au vert. Il est reproduit et expliqué, et le ticket s'arrête
   BLOQUÉ s'il vient d'un smoke instable.
5. `grep -nE "live" scripts/check.mjs` ne montre aucun drapeau `--live` passé à un smoke. Sortie au
   journal.
6. `git diff --stat` ne cite que `scripts/check.mjs`, `tests/quality-check.test.cjs`, `CLAUDE.md` et le
   ticket.

## Test d'acceptation attendu

`tests/quality-check.test.cjs`, frontière : `scripts/check.mjs` lancé dans le dépôt temporaire des tests,
avec des smokes factices qui échouent ou ne se terminent pas. La mutation du critère 3 prouve que la
vraie étape voit une vraie panne de la fenêtre.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Dans `scripts/check.mjs`, pas dans la boucle.** Le contrôle complet est la règle unique : la boucle,
  l'implémenteur et l'orchestrateur voient le même verdict. Une étape propre à `run.mjs` ne serait vue
  qu'après la session, donc trop tard pour la corriger dans la même tentative.
- **Tous les smokes à chaque contrôle complet**, pas une règle qui choisit selon les dossiers touchés.
  Ils prennent environ deux minutes, et une règle par dossier manquerait les modules partagés par les
  deux hôtes (`runtime/`, `core/`).
- **Un navigateur absent rend l'étape rouge.** Le smoke échoue de lui-même, et l'étape ne le change pas
  en « non lancé ». Une CI sans Chrome lancera `--no-smokes`, ce qui se voit.
- **Pas d'ADR.** L'étape s'ajoute au contrôle existant, sans choisir entre deux architectures. L'en-tête
  de `scripts/check.mjs` et `CLAUDE.md` la décrivent.

## Journal
