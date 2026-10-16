---
id: T196
titre: Count the harness test cases apart from the product's in the ratchet
statut: termine
bloque_par: T199
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le cliquet protège séparément le nombre de cas du produit et celui du harnais. Ajouter un scénario de
boucle ne peut plus compenser la suppression d'un scénario produit, et l'inverse reste également
interdit. La mesure garde sa définition textuelle actuelle : elle ne prétend pas compter les tests
effectivement exécutés ni mesurer leur couverture.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 et F8. Décision du propriétaire, le 16/10 : proposer
  cette séparation avec deux planchers indépendants, après T199 ; T178 est transitif.
- Code vérifié à `8340014`, métriques, cliquet, contrôle, boucle et tests de qualité lus en entier :
  - `scripts/quality/metrics.mjs:45` définit le sens des compteurs ; `:60` mesure l'arbre des tests,
    `:72` sélectionne les fichiers et `:74` additionne les lignes commençant par `test(` ;
  - `scripts/quality/baseline.json:8` porte un plancher unique de 1 305 ;
    `scripts/quality/ratchet.mjs:16` compare, `:32` resserre, `:42` écrit les clés connues ;
  - `scripts/check.mjs:160` applique cette comparaison en contrôle complet et en `--changed` ;
    `scripts/loop/run.mjs:408` resserre le plancher à l'intégration ;
  - `tests/quality-check.test.cjs:105` vérifie le comptage, `:127` les deux sens de comparaison,
    `:136` le resserrement. `tests/ticket-loop.test.cjs:562` protège le resserrement à l'intégration ;
  - `docs/standards.md:45` annonce encore un seul compteur. `scripts/coverage.mjs:7` importe
    seulement les racines produit depuis les métriques : son rapport de couverture reste distinct.
- Relevé textuel reproduit en lecture seule sur ce worktree : 1 305 cas, dont 333 dans les douze
  fichiers ci-dessous, donc 972 dans les autres. Ce ne sont ni des résultats de tests ni les valeurs
  à figer après les dépendances : T199 et T200 peuvent déjà ajouter des cas de harnais. Refaire l'inventaire à l'exécution ;
  la liste de classification suit la responsabilité des fichiers alors présents.

  | Fichiers actuels sous `tests/`, suffixe `.test.cjs` | Cas textuels |
  | --- | ---: |
  | ticket-loop | 124 |
  | loop-view, loop-view-codex, loop-view-events, loop-view-state | 106 |
  | watch-loop, watch-loop-render | 35 |
  | agent-guards | 32 |
  | coverage-report | 16 |
  | quality-check | 15 |
  | npm-scripts | 4 |
  | reviewed-state | 1 |

  `tests/reviewed-state.test.cjs:63` teste `scripts/loop/reviewed-state.mjs` : une ligne `test(`
  génère dix cas exécutables ; la mesure reste une occurrence textuelle.

## Périmètre

- Modifier `scripts/quality/metrics.mjs`, `ratchet.mjs` si nécessaire, `baseline.json`, les tests
  de qualité et d'intégration de boucle, et la ligne correspondante de `docs/standards.md`.
  `check.mjs` et `run.mjs` ne changent que si leur raccord aux deux mesures l'exige.
- Remplacer le compteur unique par deux compteurs minimums clairement nommés produit et harnais.
  Garder la même reconnaissance des lignes `test(`, les mêmes extensions et le parcours récursif.
  Les tests Python et le comptage réel de Node restent hors de cette mesure, comme aujourd'hui.
- Centraliser la classification : les douze fichiers énumérés sont du harnais ; les nouveaux
  fichiers de mesure créés ici le sont aussi. Un fichier de test non déclaré est produit par défaut.
  Les tests d'architecture du produit ne deviennent pas du harnais parce qu'ils sont des gardes.
- Migrer le plancher une seule fois, avec inventaire par fichier et somme conservée. Recalculer à
  l'exécution après T199 et les éventuels autres tickets déjà intégrés, notamment T200, et T194 si son retrait a
  été autorisé. Aucun assouplissement implicite ni prise des valeurs approximatives du rapport.
- Aucun test supprimé, aucun renommage de fichiers de tests, aucune modification des scénarios
  produit. Les autres mesures, le gel ESLint et les règles de permissions restent inchangés.

## Critères d'acceptation

1. Des fixtures avec tests produit, tests de harnais, fichier nouveau inconnu et sous-dossiers
   donnent deux comptes exacts et disjoints. Leur somme est l'ancien total calculé par la même
   définition. Les helpers sans suffixe de test et les fichiers non JavaScript ne créent aucun cas.
2. Retirer un cas produit et ajouter un cas harnais, à total constant, rend le contrôle rouge sur
   le plancher produit. Le scénario inverse rend rouge le plancher harnais. Les deux preuves passent
   par `scripts/check.mjs`, en mode complet et `--changed`, dans des dépôts temporaires isolés.
3. `compare` détecte chaque baisse séparément ; `tighten` conserve chaque meilleur plancher sans
   le relâcher quand l'autre mesure progresse. L'écriture/relecture garde les deux clés. La vraie
   intégration de boucle resserre la mesure améliorée et conserve l'autre, avec un test par frontière.
4. Le journal consigne l'ancien plancher, l'ancien total mesuré, l'inventaire refait par responsabilité et les comptes par fichier, les deux
   nouveaux planchers et leur somme. La migration ne masque aucune régression déjà présente : un
   total sous l'ancien plancher demande d'abord une explication autorisée, pas sa réinitialisation.
   Toutes les autres valeurs de `baseline.json` restent identiques.
5. La définition écrite dans les standards nomme les deux mesures et leur classification par
   responsabilité. Les tests existants du comptage sont adaptés sans diminuer leurs exigences ;
   le rapport de couverture conserve son périmètre et son fonctionnement.
6. À l'implémentation, `node --test --test-concurrency=1 tests/quality-check.test.cjs tests/ticket-loop.test.cjs`,
   complété des nouveaux tests de la mesure, puis `node scripts/check.mjs`, sont verts. Aucun test
   ne se contente de lire le texte des scripts de mesure pour prouver leur résultat.

## Test d'acceptation attendu

`tests/quality-check.test.cjs` utilise `harnessRepo` pour construire les deux familles de tests,
initialiser leurs planchers et provoquer les deux compensations interdites. Les compteurs observés
viennent de `measure` et du JSON du vrai contrôle. Le test de boucle vérifie le plancher committé.

## Hypothèses bloquantes

Décision du propriétaire, le 16/10 (« Oui, séparer », en réponse à la question posée) : oui. Le cliquet compte à part les tests du produit et ceux du harnais, chacun avec son plancher.

Question posée : séparer les deux mesures du cliquet, chacune avec son plancher ?
Recommandation : oui.

La classification et la migration proposées sont celles de ce ticket. Elles ne donnent aucune
autorisation générale de supprimer des tests produit, ni de baisser leurs planchers ensuite.

## Journal

- Exploration : consignes, code, appelants, tests et ADR 0012/0014 lus ; témoin de hooks présent. `git status --short` et `git diff` : seul le statut du ticket préexiste comme changement suivi ; les dossiers non suivis préexistants restent hors travail. Détails dans `.harness-state/tickets/T196/exploration.md`, précision de classification dans `ecarts.md`.
- Inventaire avant modification : ancien plancher **1460**, ancien total mesuré par `measure` **1460**. Classification refaite : **1093 produit + 367 harnais = 1460**. Les douze fichiers cités sont complétés par `loop-view-feed`, `loop-web` et `loop-web-model`, vues de la boucle désormais présentes. Les gardes d’architecture du produit restent produit. Inventaire exhaustif par fichier ci-dessous et dans `inventory-before.json` du dossier d’état.

| Fichier | Responsabilité | Cas textuels avant migration |
| --- | --- | ---: |
| `tests/active-instruction.test.cjs` | produit | 7 |
| `tests/adapters.test.cjs` | produit | 1 |
| `tests/agent-guards.test.cjs` | harnais | 32 |
| `tests/architecture-f04.test.cjs` | produit | 8 |
| `tests/architecture-f05.test.cjs` | produit | 15 |
| `tests/architecture-f06.test.cjs` | produit | 17 |
| `tests/architecture-f07.test.cjs` | produit | 12 |
| `tests/architecture-f08.test.cjs` | produit | 23 |
| `tests/architecture-f09.test.cjs` | produit | 10 |
| `tests/architecture-f10.test.cjs` | produit | 10 |
| `tests/architecture-guard.test.cjs` | produit | 41 |
| `tests/architecture.test.cjs` | produit | 8 |
| `tests/archive-compat.test.cjs` | produit | 7 |
| `tests/budget.test.cjs` | produit | 3 |
| `tests/capture-controller.test.cjs` | produit | 35 |
| `tests/capture-display-latency.test.cjs` | produit | 25 |
| `tests/capture-intake.test.cjs` | produit | 15 |
| `tests/capture-sources.test.cjs` | produit | 8 |
| `tests/capture-storage.test.cjs` | produit | 1 |
| `tests/chat-codex.test.cjs` | produit | 6 |
| `tests/chat-error-ui.test.cjs` | produit | 7 |
| `tests/chat-instruction.test.cjs` | produit | 2 |
| `tests/chat-sources.test.cjs` | produit | 4 |
| `tests/chat-trace.test.cjs` | produit | 7 |
| `tests/clip-audio.test.cjs` | produit | 4 |
| `tests/clip-unreadable.test.cjs` | produit | 5 |
| `tests/codex-abandoned-turn.test.cjs` | produit | 1 |
| `tests/codex-confinement.test.cjs` | produit | 18 |
| `tests/codex-connect-race.test.cjs` | produit | 2 |
| `tests/codex-handler-failure.test.cjs` | produit | 14 |
| `tests/codex-session-events.test.cjs` | produit | 11 |
| `tests/codex-session-run.test.cjs` | produit | 13 |
| `tests/codex-stream-decoding.test.cjs` | produit | 1 |
| `tests/codex-thread-rotation.test.cjs` | produit | 14 |
| `tests/conversation-runtime.test.cjs` | produit | 1 |
| `tests/coverage-report.test.cjs` | harnais | 16 |
| `tests/deep-ask-restore.test.cjs` | produit | 14 |
| `tests/deploy-unit.test.cjs` | produit | 1 |
| `tests/disk-guard.test.cjs` | produit | 4 |
| `tests/empty-session.test.cjs` | produit | 1 |
| `tests/evidence-refresh.test.cjs` | produit | 10 |
| `tests/headless-session-lifecycle.test.cjs` | produit | 14 |
| `tests/host-error-handling.test.cjs` | produit | 5 |
| `tests/inspection-strategies.test.cjs` | produit | 4 |
| `tests/latency.test.cjs` | produit | 7 |
| `tests/living-recap.test.cjs` | produit | 17 |
| `tests/local-vlm-agent.test.cjs` | produit | 9 |
| `tests/loop-view-codex.test.cjs` | harnais | 28 |
| `tests/loop-view-events.test.cjs` | harnais | 20 |
| `tests/loop-view-feed.test.cjs` | harnais | 10 |
| `tests/loop-view-state.test.cjs` | harnais | 28 |
| `tests/loop-view.test.cjs` | harnais | 30 |
| `tests/loop-web-model.test.cjs` | harnais | 8 |
| `tests/loop-web.test.cjs` | harnais | 8 |
| `tests/mac-capture-actions.test.cjs` | produit | 7 |
| `tests/mac-ipc-contract.test.cjs` | produit | 25 |
| `tests/mac-ui.test.cjs` | produit | 44 |
| `tests/media-asr-options.test.cjs` | produit | 8 |
| `tests/moment-actions.test.cjs` | produit | 16 |
| `tests/moment-index.test.cjs` | produit | 25 |
| `tests/npm-scripts.test.cjs` | harnais | 4 |
| `tests/opened-pages.test.cjs` | produit | 2 |
| `tests/perception-context.test.cjs` | produit | 7 |
| `tests/portable-config.test.cjs` | produit | 2 |
| `tests/quality-check.test.cjs` | harnais | 15 |
| `tests/question-ceiling.test.cjs` | produit | 4 |
| `tests/question-checkpoint.test.cjs` | produit | 13 |
| `tests/question-freshness.test.cjs` | produit | 3 |
| `tests/recording.test.cjs` | produit | 6 |
| `tests/refactor-boundaries.test.cjs` | produit | 6 |
| `tests/reinspection-transcript-reuse.test.cjs` | produit | 8 |
| `tests/remote-media.test.cjs` | produit | 2 |
| `tests/remote-server.test.cjs` | produit | 3 |
| `tests/review-regressions.test.cjs` | produit | 19 |
| `tests/reviewed-state.test.cjs` | harnais | 1 |
| `tests/revocable-inspector.test.cjs` | produit | 11 |
| `tests/server-ingest-path.test.cjs` | produit | 7 |
| `tests/server-routes.test.cjs` | produit | 19 |
| `tests/server-sessions.test.cjs` | produit | 23 |
| `tests/server-state-views.test.cjs` | produit | 1 |
| `tests/server-surveillance.test.cjs` | produit | 3 |
| `tests/server-warm-up.test.cjs` | produit | 3 |
| `tests/session-delete.test.cjs` | produit | 3 |
| `tests/session-durable.test.cjs` | produit | 23 |
| `tests/session-latency.test.cjs` | produit | 21 |
| `tests/session-lifecycle.test.cjs` | produit | 13 |
| `tests/session-manifest.test.cjs` | produit | 7 |
| `tests/session-optimization.test.cjs` | produit | 5 |
| `tests/session-providers.test.cjs` | produit | 10 |
| `tests/session-rows.test.cjs` | produit | 5 |
| `tests/session-timeline.test.cjs` | produit | 4 |
| `tests/session-warm-up.test.cjs` | produit | 8 |
| `tests/session.test.cjs` | produit | 2 |
| `tests/simulated-clock.test.cjs` | produit | 4 |
| `tests/simulated-providers.test.cjs` | produit | 9 |
| `tests/source-shape.test.cjs` | produit | 10 |
| `tests/split-perception.test.cjs` | produit | 15 |
| `tests/state-delivery.test.cjs` | produit | 12 |
| `tests/state-views.test.cjs` | produit | 5 |
| `tests/stream-simulation.test.cjs` | produit | 8 |
| `tests/surveillance-runtime.test.cjs` | produit | 22 |
| `tests/surveillance.test.cjs` | produit | 17 |
| `tests/temporal-target.test.cjs` | produit | 1 |
| `tests/ticket-loop.test.cjs` | harnais | 132 |
| `tests/timeline-server.test.cjs` | produit | 2 |
| `tests/topic-summary.test.cjs` | produit | 10 |
| `tests/transcriber-sharing.test.cjs` | produit | 3 |
| `tests/transcription-language.test.cjs` | produit | 2 |
| `tests/tv-app-compat.test.cjs` | produit | 3 |
| `tests/tv-chat-model.test.cjs` | produit | 3 |
| `tests/tv-chat-view.test.cjs` | produit | 17 |
| `tests/tv-overlay-queue.test.cjs` | produit | 10 |
| `tests/tv-paired-page.test.cjs` | produit | 11 |
| `tests/tv-panel.test.cjs` | produit | 18 |
| `tests/tv-poll-controller.test.cjs` | produit | 11 |
| `tests/tv-remote-navigation.test.cjs` | produit | 21 |
| `tests/tv-text.test.cjs` | produit | 7 |
| `tests/verification.test.cjs` | produit | 11 |
| `tests/video-research.test.cjs` | produit | 11 |
| `tests/viewing-actions.test.cjs` | produit | 8 |
| `tests/viewing-features.test.cjs` | produit | 6 |
| `tests/wait-helpers.test.cjs` | produit | 13 |
| `tests/watch-loop-render.test.cjs` | harnais | 13 |
| `tests/watch-loop.test.cjs` | harnais | 22 |
| `tests/watch-session-ending.test.cjs` | produit | 5 |
| `tests/whisper-diagnostics.test.cjs` | produit | 4 |
| `tests/window-mode.test.cjs` | produit | 4 |

- Migration unique : `cas_de_test: 1460` devient `cas_de_test_produit: 1093` et `cas_de_test_harnais: 367` ; **1093 + 367 = 1460**. Les six autres valeurs du plancher sont strictement conservées. `node .harness-state/tickets/T196/inventory.mjs` : code 0, assertions de conservation et de classification exactes (`inventory.log`, `inventory-after.json`). Après les ajouts de preuves, mesure réelle : **1093 produit + 371 harnais = 1464** ; les quatre occurrences nouvelles sont exclusivement dans les deux fichiers de test du harnais. Le resserrement ultérieur revient à la boucle.
- Rouge/vert initial : `node --test --test-concurrency=1 --test-name-pattern='measures count long lines' tests/quality-check.test.cjs` : rouge sur `deepStrictEqual` (ancien compteur unique), puis 1/1 vert avec les deux clés (`count-red.log`, `count-green.log`). Le test conserve toutes ses exigences sur les autres mesures.
- Classification et compensations : `node --test --test-concurrency=1 --test-name-pattern='test case measures classify|compensated by the other family' tests/quality-check.test.cjs` : 5/5 rouges sur les assertions des comptes avant classification (`classification-red.log`). Après la liste centralisée : `node --test --test-concurrency=1 --test-name-pattern='test case measures classify|compensated by the other family|a measure that gets worse|baseline only ever tightens|writing and reading' tests/quality-check.test.cjs` : 8/8 verts (`classification-green.log`). Fixtures : les quinze chemins de harnais, fichier nouveau, sous-dossiers, trois extensions, homonyme imbriqué, garde d’architecture produit, helpers sans suffixe et non-JavaScript. Somme égale à l’ancien comptage textuel. Les quatre scénarios de compensation passent par le vrai contrôle JSON en dépôt isolé (complet et `--changed`, dans les deux sens).
- Intégration réelle : `node --test --test-concurrency=1 --test-name-pattern='integrating an added' tests/ticket-loop.test.cjs` : 2/2 rouges sur les comptes initiaux, puis 2/2 verts (`integration-red.log`, `integration-green.log`). Chaque frontière ajoute un cas à une famille et observe le JSON du plancher dans le commit du dépôt temporaire ; l’autre famille et les autres mesures sont conservées. Aucun commit dans le dépôt de travail.
- Implémentation : classification explicite dans `metrics.mjs` et deux directions minimums ; `ratchet.mjs`, `check.mjs` et `run.mjs` utilisent déjà les clés génériquement. Standards alignés sur les deux mesures textuelles ; rapport de couverture inchangé. Aucun test supprimé, renommé ou scénario produit modifié. Le contrôle rapide a détecté une ligne de test ajoutée de plus de 160 caractères ; elle a été découpée avant les contrôles suivants, sans modifier les règles.

- Banc d’acceptation : `node --test --test-concurrency=1 tests/quality-check.test.cjs tests/ticket-loop.test.cjs` : code 0, **240/240 tests réussis**, aucun ignoré, en séquentiel (`acceptance.log`). Les nouveaux tests sont dans ces deux fichiers. Les derniers ajustements portent uniquement sur les libellés anglais des noms de tests ; les contrôles suivants les couvrent.
- Contrôle des fichiers modifiés : `node scripts/check.mjs --changed` : code 0, `check : vert`, règles, format, lint, gel et cliquet verts ; **240/240 tests JS réussis** sur les deux fichiers, aucun échec (`check-changed.log`). Le cliquet observe seulement l’amélioration `cas_de_test_harnais : 367 → 371`.
- Contrôle final : `node scripts/check.mjs` : code 0, **check : vert** ; règles, format, lint, gel et cliquet verts, **1934/1934 tests JS réussis sur 127 fichiers**, dont les tests existants du rapport de couverture, et **22 tests Python OK** (`check-full.log`). Aucun fournisseur réel appelé. `git diff --check` : code 0.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T196/verdict.json`, sans réserve ni contrôle requis manquant. La précision d’inventaire des trois vues de boucle est documentée dans `ecarts.md` ; aucun critère affaibli. Aucun commit ni push dans le dépôt de travail ; la boucle reprend la relecture indépendante et l’intégration.

- Reprise après relecture 1 : rapport, ticket et journal, écarts, état Git et diff relus ; détails dans `exploration.md`. Le constat bloquant impose les raccords autorisés de `check.mjs` et `run.mjs` : refuser les clés inconnues et resserrer avec les modules sur disque. Les écarts sont déclarés avant implémentation. Le processus de boucle courant ne peut pas se mettre à jour : décision d'intégration réservée à l'orchestrateur dans `ecarts.md`. Le constat mineur sera couvert par une attente littérale pour l'écriture/relecture. Le constat hors périmètre reste inchangé.
- Clés inconnues, rouge puis vert : `node --test --test-concurrency=1 --test-name-pattern='unknown baseline key' tests/quality-check.test.cjs` : code 1, les deux assertions attendent le refus mais le vrai contrôle rend 0 (`unknown-key-red.log`). Après correction de `check.mjs`, `node --test --test-concurrency=1 --test-name-pattern='unknown baseline key|writing and reading' tests/quality-check.test.cjs` : code 0, **3/3 réussis** (`unknown-key-green.log`). Les deux modes refusent explicitement `cas_de_test` dans le plancher.
- Migration pendant la session, rouge puis vert : `node --test --test-concurrency=1 --test-name-pattern='measure definitions migrated' tests/ticket-loop.test.cjs` : code 1 sur le plancher committé, qui contient encore `cas_de_test: 3` et perd les deux nouvelles clés (`migration-red.log`). La fixture charge l'ancien total au démarrage, puis une session `harnais: oui` migre le module et le plancher sur disque, et ajoute un cas harnais. Après correction de `run.mjs`, `node --test --test-concurrency=1 --test-name-pattern='measure definitions migrated|integrating an added|improves a measure' tests/ticket-loop.test.cjs` : code 0, **4/4 réussis** (`migration-green.log`). Le commit temporaire conserve le produit à 1 et resserre le harnais à 2 ; les autres mesures restent identiques. Le CLI neuf est appelé à l'intégration ; son échec interdit le commit.
- Écriture/relecture, preuve renforcée : attente littérale `{ catch_vides_prod: 0, cas_de_test_produit: 12, cas_de_test_harnais: 7 }`, comparée au résultat de `readBaseline` et au JSON sur disque. `node .harness-state/tickets/T196/prove-baseline-roundtrip.cjs` : code 0 (`roundtrip-proof.log`). Dans une copie jetable, retirer la direction harnais laisse l'ancien test faussement vert (`roundtrip-mutation-before.log`), rend le test littéral rouge sur la clé perdue (`roundtrip-mutation-red.log`), puis le module intact donne le vert (`roundtrip-green.log`). Aucune mutation du module dans le dépôt de travail.
- Précision à la conclusion précédente : les imports étaient génériques, mais leur durée de vie empêchait la migration à l'intégration. Les raccords de `check.mjs` et `run.mjs` sont donc corrigés dans le périmètre autorisé. `git show HEAD:scripts/quality/baseline.json` confirme l'ancien plancher 1460. Les planchers migrés restent **1093 + 367 = 1460** ; la mesure actuelle est **1093 produit + 373 harnais = 1466**, soit deux occurrences textuelles supplémentaires après correction. La boucle actuelle conserve encore l'ancienne intégration : la procédure requise et la décision réservée à l'orchestrateur sont dans `ecarts.md`.
- Banc d'acceptation après correction : `node --test --test-concurrency=1 tests/quality-check.test.cjs tests/ticket-loop.test.cjs` : code 0, **243/243 réussis**, aucun ignoré, en séquentiel (`correction-acceptance.log`). Les trois scénarios exécutés supplémentaires sont les deux refus de clé inconnue et la migration de mesure pendant une session autorisée.
- Contrôle des fichiers modifiés après correction : `node scripts/check.mjs --changed` : code 0, **check : vert**, règles, format, lint, gel et cliquet verts ; **243/243 tests JS réussis**, aucun échec (`correction-check-changed.log`). Seule amélioration de mesure : `cas_de_test_harnais : 367 → 373`. Assertions complémentaires observées : spécification au-dessus du journal intacte, somme migrée conservée et six autres planchers identiques à `HEAD`.
- Contrôle final après correction : `node scripts/check.mjs` : code 0, **check : vert** ; règles, format, lint, gel et cliquet verts, **1937/1937 tests JavaScript réussis sur 127 fichiers**, **22 tests Python OK** (`correction-check-full.log`). Les tests existants du rapport de couverture sont inclus. `git diff --check` : code 0. Aucun fournisseur réel ni machine externe sollicité.
- Nouveau verdict : **BLOQUÉ pour l'intégration**, corrections livrées et vérifiées. Le constat bloquant et le mineur sont corrigés dans le code et les preuves ; aucune contestation. Le processus de boucle courant conserve son ancienne fonction d'intégration : un verdict `TERMINÉ` le laisserait committer un plancher sans les nouvelles clés. L'orchestrateur doit reprendre l'intégration avec une boucle démarrée après le changement, ou vérifier et restaurer le plancher committé avant tout autre ticket. Attendu après resserrement : **1093 produit, 373 harnais**, six autres valeurs identiques, aucune clé `cas_de_test`. Détails dans `ecarts.md` ; cette décision est la seule réserve propre à la session. Aucun commit ni push dans le dépôt de travail ; aucune relecture lancée ni état relu enregistré par la session.

### Réserves à la clôture

- Décision et opération réservées à l'orchestrateur (ecarts.md) : intégrer T196 avec une boucle démarrée après le changement. Sinon, vérifier git show HEAD:scripts/quality/baseline.json après l'intégration et restaurer les deux planchers avant tout autre ticket. Après resserrement des preuves présentes : cas_de_test_produit=1093, cas_de_test_harnais=373, sans cas_de_test, six autres valeurs inchangées.
- .harness-state/tickets/T196/relecture-2.md : `docs/travail/tickets/INDEX.md:303`, `202-…:48`, `:70` et `223-…:88`, `:123`, `:128` nomment encore le plancher `cas_de_test`, qui n’existe plus ; à renommer `cas_de_test_produit` ou selon la famille concernée, dans un ticket qui autorise ces fichiers.
- Intégration faite à la main par l’orchestrateur, le 16/10 : la boucle en mémoire gardait l’ancienne fonction d’intégration (`run.mjs:22-23` avant ce ticket). Relecture de la correction acceptée (relecture-2.md), `ratchet.mjs --tighten` avec le nouveau code (produit 1093, harnais 373, aucun `cas_de_test`, six autres valeurs identiques), `node scripts/check.mjs` vert, 1937/1937 JS et 22 Python (integration-check-full.log).
