---
id: T085
titre: Move the evidence, settings and Whisper regression tests to behaviour files
statut: a-faire
bloque_par: T084
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Six tests de `tests/review-regressions.test.cjs` portent sur des comportements qui ont déjà leur
fichier : la version d'un passage retenue comme preuve, la transcription échouée, les réglages lus au
démarrage, le partage d'un lancement de Whisper. Après ce ticket, chacun est à côté des tests du même
comportement, avec son corps et ses assertions. Le fichier d'origine ne garde que les tests de la
connexion Codex et garde son nom pour l'instant : la mesure `tests_nommes_par_chantier` ne bouge pas
ici, elle baisse quand le fichier sera renommé.

## Sources

- Constats : TSTA-06
- Règle : `docs/standards.md`, section « Tests » (« Un fichier de test porte le nom d'un module ou d'un
  comportement » ; « Le nombre de cas de test ne baisse pas » ; « aucune ligne de plus de 160
  caractères »).
- Code vérifié à la version `0d5a954`. Les tickets qui précèdent celui-ci (formatage, aides d'attente
  partagées, attentes, réglages) ont déplacé les lignes, remplacé des aides locales par celles de
  `tests/helpers/` et retouché certains de ces tests : se fier aux titres, et déplacer chaque test dans
  l'état où il se trouve.
  - Vers `tests/evidence-refresh.test.cjs` (9 tests, `DeepAsk` et `VideoTools`, dont « the latest
    consulted version is the recorded evidence… », `:106`) :
    - « an older read returned late never replaces the newer consulted version, even at the same
      revision » (`tests/review-regressions.test.cjs:199`) ;
    - « with the session clock stopped by a pause, an older read returned late still does not replace
      the newer one » (`:337`).
  - Vers `tests/reinspection-transcript-reuse.test.cjs` (8 tests, dont « a failed or shed
    transcription is not a transcript: it is retried and never taken for silence », `:152`) :
    « a passage whose transcription failed says so wherever its empty transcript is read » (`:324`,
    `VideoTools` et `momentDetail` de `core/session-timeline.cjs`).
  - Vers `tests/portable-config.test.cjs` (2 tests : la résolution d'un exécutable dans le `PATH`, et
    une installation neuve lue par `loadConfig`) :
    - « runtime switches reach the packaged app too… » (`:215`, `loadConfig` et
      `createSessionRuntime`) ; sa ligne de titre dépasse 160 caractères ;
    - « the switches of an imported file persist without any provider key… » (`:356`, `loadConfig`).
  - Vers `tests/transcriber-sharing.test.cjs` (3 tests sur `LocalTranscriber`) : « an abandoned
    Whisper run settling late does not unregister the run that replaced it » (`:114`), qui écrit son
    propre faux binaire Whisper.
  - Aides du fichier d'origine dont ces tests se servent, à `0d5a954` : `settle` (`:22`, qui appelle
    `tick`, `:21`), dans les deux tests des preuves seulement ; les quatre autres tests n'utilisent
    aucune aide du fichier. `tests/evidence-refresh.test.cjs` n'a ni `settle` ni `tick`, et des tests
    qui restent dans le fichier d'origine s'en servent encore.
  - `tests/evidence-refresh.test.cjs` et `tests/reinspection-transcript-reuse.test.cjs` importent
    déjà `VideoTools` ; `tests/transcriber-sharing.test.cjs` a son propre `until` et importe déjà
    `LocalTranscriber` ; `tests/portable-config.test.cjs` importe déjà `loadConfig`.
- Risque relevé par la relecture de l'audit : des tests réunis dans un même fichier partagent un
  processus ; chaque test déplacé est donc lancé seul, puis avec son fichier.
- Mécanique du contrôle, vérifiée dans `scripts/check.mjs` (fonction `fileRules`) : dans un fichier
  existant, le nombre de lignes de plus de 160 caractères ne doit pas monter.
- Ordre : des tickets des lots L04, L05 et L06 citent `tests/portable-config.test.cjs` ou
  `tests/transcriber-sharing.test.cjs` avec leur nombre de tests, et modifient certains des tests
  déplacés ici ; ce ticket passe après eux.

## Périmètre

- À modifier :
  - `tests/review-regressions.test.cjs` : perd les six tests cités, et les aides et imports que plus
    aucun de ses tests n'utilise. Il garde son nom, son en-tête et ses autres tests.
  - `tests/evidence-refresh.test.cjs` : reçoit deux tests, à la fin du fichier.
  - `tests/reinspection-transcript-reuse.test.cjs` : reçoit un test, après celui de la transcription
    échouée ou à la fin du fichier ; importe `momentDetail`.
  - `tests/portable-config.test.cjs` : reçoit deux tests, à la fin du fichier ; importe
    `createSessionRuntime`.
  - `tests/transcriber-sharing.test.cjs` : reçoit un test, à la fin du fichier.
- Aides :
  - une aide que le fichier d'origine importe de `tests/helpers/` est importée de la même façon dans
    le fichier d'arrivée ; aucune aide partagée n'est créée ni modifiée ;
  - une aide locale du fichier d'origine qui porte le nom d'une aide différente du fichier d'arrivée
    suit ses tests sous un autre nom, qui dit sa différence ; les aides du fichier d'arrivée ne
    changent pas ;
  - une aide locale encore utilisée par un test qui reste est copiée dans le fichier d'arrivée qui ne
    l'a pas, pas retirée du fichier d'origine (à `0d5a954` : `settle` et `tick`, vers
    `tests/evidence-refresh.test.cjs`).
- Un test déplacé garde son titre au caractère près, ses assertions et ses valeurs attendues. Les seuls
  changements permis dans son corps : le nom d'un import ou d'une aide renommée comme ci-dessus, la
  mise en forme du formateur, et la coupe en plusieurs morceaux concaténés d'une chaîne dont la ligne
  dépasse encore 160 caractères, sans changer son texte (à `0d5a954`, le fichier d'environnement
  écrit par le test « the switches of an imported file persist… » tient en une chaîne de près de
  200 caractères).
- Seule exception sur les titres : si la ligne du titre « runtime switches reach the packaged app
  too… » dépasse encore 160 caractères, ce titre est raccourci ; il garde le sujet et l'exigence
  principale, le détail retiré devient un commentaire juste au-dessus du test, et l'ancien et le
  nouveau titre sont notés dans le journal.
- Aucune ligne de plus de 160 caractères n'est ajoutée dans les fichiers d'arrivée.
- À ne pas toucher : le code de production ; les tests déjà présents dans les fichiers d'arrivée ; les
  tests qui restent dans le fichier d'origine (six à `0d5a954`, tous sur la connexion Codex) ; le nom
  de `tests/portable-config.test.cjs`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande. « Commande des titres » désigne, lancée fichier
par fichier :

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/<fichier>.test.cjs \
  | grep -E '^ *(not )?ok [0-9]+ - ' | sed -E 's/^ *(not )?ok [0-9]+ - //; s/ # (SKIP|TODO).*$//' | sort
```

1. Avant toute modification, la commande des titres et `grep -cE '^\s*test\(' ` sont lancés sur les
   cinq fichiers (`review-regressions`, `evidence-refresh`, `reinspection-transcript-reuse`,
   `portable-config`, `transcriber-sharing`) ; sorties conservées dans le dossier d'état du ticket
   (`.harness-state/tickets/<id>/`, hors Git), avec une copie des quatre fichiers d'arrivée.
2. `grep -cE '^\s*test\(' ` rend, par rapport au critère 1 : 6 de moins pour
   `tests/review-regressions.test.cjs` ; 2 de plus pour `tests/evidence-refresh.test.cjs` ; 1 de plus
   pour `tests/reinspection-transcript-reuse.test.cjs` ; 2 de plus pour
   `tests/portable-config.test.cjs` ; 1 de plus pour `tests/transcriber-sharing.test.cjs`.
3. La commande des titres, lancée sur les cinq fichiers et réunie puis triée, rend la réunion triée des
   cinq listes du critère 1, sans doublon ; la seule différence permise est le titre raccourci noté
   dans le journal. Comparaison (`diff`) dans le journal.
4. Chacun des six titres cités dans « Sources » (ou son titre raccourci) sort une fois de la commande
   des titres de son fichier d'arrivée, et ne sort plus de celle de
   `tests/review-regressions.test.cjs`.
5. Chacun des six tests déplacés passe seul, par `--test-name-pattern` sur son fichier d'arrivée ;
   puis `node --test --test-concurrency=1` passe sans échec sur chacun des cinq fichiers.
6. Pour chacun des quatre fichiers d'arrivée (`tests/evidence-refresh.test.cjs`,
   `tests/reinspection-transcript-reuse.test.cjs`, `tests/portable-config.test.cjs`,
   `tests/transcriber-sharing.test.cjs`), `diff <copie du critère 1> <fichier> | grep '^<'` ne sort
   rien, ou seulement des lignes d'import complétées : les fichiers d'arrivée ne perdent ni test ni
   assertion. Sortie dans le journal.
7. `grep -cE 'VideoTools|loadConfig|LocalTranscriber|momentDetail' tests/review-regressions.test.cjs`
   rend 0.
8. `node -e "import('./scripts/quality/metrics.mjs').then((m) => console.log(m.measure('.')))"` :
   aucune mesure n'est au-dessus de sa valeur de `scripts/quality/baseline.json` (pour `cas_de_test`,
   aucune en dessous).
9. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les six tests existants, inchangés, dans leurs fichiers d'arrivée. Frontières inchangées : `VideoTools`
sur des instantanés écrits à la main ; `loadConfig` sur un dossier temporaire ; `LocalTranscriber`
devant un faux binaire Whisper.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un test déplacé passe dans son fichier d'origine et échoue dans son
fichier d'arrivée, seul ou avec le fichier : verdict BLOQUÉ, avec l'échec constaté ; le test n'est ni
modifié ni relancé jusqu'à ce qu'il passe.

## Journal
