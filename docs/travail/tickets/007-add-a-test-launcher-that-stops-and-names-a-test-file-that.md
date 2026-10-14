---
id: T007
titre: Add a test launcher that stops and names a test file that hangs
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Aujourd'hui rien ne dit quel fichier de test est resté bloqué : `npm test` n'a aucun délai, et le
contrôle qualité ne connaît qu'un budget global de vingt minutes. Après ce ticket, un lanceur
`scripts/quality/run-tests.mjs` existe et est prouvé par ses propres tests : un processus par fichier,
en séquentiel par défaut, un délai par test, un chien de garde qui arrête et nomme le fichier encore
vivant après son dernier test, et un budget global qu'il applique lui-même. Rien ne l'appelle encore :
le branchement sur `npm test` et sur `scripts/check.mjs` est le ticket suivant.

## Sources

- Constats : FLK-05, FLK-13, OUBLI-37
- Code concerné, à la version `0d5a954` :
  - `package.json`, script `test` (ligne 11) : `node --test tests/*.test.cjs`, sans `--test-timeout` ni
    `--test-concurrency`.
  - `scripts/check.mjs`, fonction `jsTests(files)` (ligne 114) : `node --test --test-concurrency=1` sur
    les fichiers, sous `TEST_BUDGET_MS` (ligne 27, vingt minutes, variable `TVLENS_TEST_BUDGET_MS`). Son
    résumé ne garde que les lignes `ℹ tests`, `ℹ pass`, `ℹ fail` et celles qui commencent par `✖`.
  - `scripts/check.mjs`, fonction `run(command, commandArgs, budgetMs)` (ligne 29) : avec un budget, la
    commande mène son groupe de processus et tout le groupe reçoit `SIGKILL` à l'échéance. Le message
    `overBudget` (ligne 45), « Délai dépassé (N s) : … ne se termine pas. Ses processus ont été
    arrêtés. », ne nomme pas le fichier.
  - `scripts/check.mjs`, ligne 17 : `const root = process.cwd()`. Le contrôle travaille dans le dossier
    courant ; le lanceur fait de même.
  - `tests/helpers/harness-repo.cjs`, constante `HARNESS` (ligne 9) : le dépôt jetable des tests du
    harnais copie `scripts/check.mjs`, `scripts/quality`, `scripts/loop` et `.claude/hooks`. Un lanceur
    placé dans `scripts/quality/` y est donc présent sans autre changement. La même aide retire
    `NODE_TEST_CONTEXT` de l'environnement de ses commandes (lignes 20 à 24) : sans cela, un test lancé
    depuis un test change de sortie.
  - `tests/media-asr-options.test.cjs`, aide `privateTmp(t)` (lignes 27 à 33) : un test qui remplace
    `process.env.TMPDIR`. Exemple de ce qui impose un processus par fichier.
- Mesures du découpage, Node 24.12.0, sur un fichier d'essai hors dépôt arrêté par une garde de 5 s. Le
  fichier contient un test vide, un test bloqué dans `do { await tick(); } while (true)` (`tick` = un
  tour de `setImmediate`) et un test qui échoue en laissant une minuterie réarmée
  (`const arm = () => setTimeout(arm, 1000)`).
  - `node --test --test-timeout=500 --test-reporter=tap <fichier>` et
    `node --test-timeout=500 --test-reporter=tap <fichier>` (fichier lancé directement) donnent la même
    chose : `ok 1` aussitôt, `not ok 2` et `not ok 3` vers 520 à 550 ms, puis le processus ne se termine
    jamais.
  - Conclusions : `--test-timeout` borne un test, pas un fichier ; un fichier encore vivant écrit quand
    même le résultat de chaque test au fil de l'eau, ce qui permet de savoir qu'aucun test n'est en
    cours ; le résumé final (`tests`, `pass`, `fail`) d'un fichier bloqué n'arrive jamais, le lanceur
    doit donc compter lui-même.

## Périmètre

- À créer : `scripts/quality/run-tests.mjs`, et un fichier de test à plat, `tests/test-launcher.test.cjs`,
  qui écrit ses fichiers d'essai dans un dépôt jetable (`harnessRepo`) et y lance le lanceur par
  `repo.node` — ou par un `spawn` dans `repo.root`, sans `NODE_TEST_CONTEXT`, quand le test doit agir
  pendant le lancement (critère du signal). `tests/helpers/harness-repo.cjs` n'est pas modifié.
- À ne pas modifier dans ce ticket : `scripts/check.mjs`, `package.json`, `CONTRIBUTING.md`, les tests
  existants. Le lanceur est livré et prouvé seul.
- `harnais: oui` parce que `scripts/quality/` est protégé. Le ticket ajoute un outil au harnais ; il ne
  retire ni n'assouplit aucun contrôle.
- Comportement attendu du lanceur :
  - `node scripts/quality/run-tests.mjs [fichiers…]` ; sans argument, tous les `tests/*.test.cjs` du
    dossier courant, triés.
  - Un processus Node par fichier, chacun meneur de son propre groupe de processus : arrêter un fichier
    arrête aussi les processus qu'il a lancés. L'environnement reçu, `NODE_OPTIONS` compris, est
    transmis tel quel aux fichiers.
  - Un fichier à la fois par défaut ; `TVLENS_TEST_CONCURRENCY=<n>` en lance jusqu'à `n` ensemble.
  - Un délai par test, 60 s par défaut, réglable par `TVLENS_TEST_TIMEOUT_MS`. Un test hors délai est
    un échec.
  - Chien de garde : un fichier dont un test au moins est terminé, dont plus aucun n'est en cours et
    dont le processus vit encore après un sursis (10 s par défaut, `TVLENS_TEST_LINGER_MS`) est arrêté
    avec son groupe et compté en échec, avec la ligne « ✖ <fichier> : encore vivant <N> s après son
    dernier test. Ses processus ont été arrêtés. ». Un test long encore en cours n'est pas un fichier
    bloqué.
  - Budget global : `TVLENS_TEST_BUDGET_MS` (vingt minutes par défaut, la valeur de `scripts/check.mjs`).
    À l'échéance, le lanceur arrête tous les fichiers en cours avec leurs groupes, ne lance pas les
    suivants et écrit, pour chaque fichier arrêté, « ✖ <fichier> : Délai dépassé (<N> s) : le fichier
    ne se termine pas. Ses processus ont été arrêtés. ».
  - Signal : le lanceur qui reçoit `SIGINT` ou `SIGTERM` arrête ses fichiers en cours avec leurs
    groupes avant de sortir, code non nul. Sans cela, un Ctrl-C laisserait vivre des fichiers qui ne
    sont plus dans le groupe du terminal.
  - Résumé final, que le lanceur calcule lui-même : trois lignes `ℹ tests <n>`, `ℹ pass <n>`,
    `ℹ fail <n>` sur tous les fichiers, et une ligne commençant par `✖` par test et par fichier en
    échec. Code de sortie 0 seulement si tout passe.
- À ne pas faire : `--test-force-exit` (il masque le fichier qui retient son processus) ; corriger ici
  les attentes sans borne des tests existants (elles dépendent des aides d'un autre lot).
- Le fichier de test nouveau lance des processus : chaque test enregistre par `t.after` l'arrêt de ce
  qu'il a lancé, et utilise des délais courts passés par les variables (par exemple 300 ms par test,
  500 ms de sursis), jamais les défauts.

## Critères d'acceptation

Tous les critères sauf le dernier se vérifient par des tests de `tests/test-launcher.test.cjs`, qui
lancent le lanceur comme un processus sur des fichiers d'essai écrits dans un dépôt jetable. Un fichier
d'essai écrit son numéro de processus dans un fichier quand le critère demande qu'il ait disparu.

1. Un fichier dont un test échoue en laissant une minuterie réarmée : le lanceur se termine, code non
   nul, nomme le fichier avec « encore vivant », et le processus du fichier a disparu.
2. Un fichier dont un test ne finit jamais : le test est déclaré en échec au délai par test, puis le
   fichier est arrêté et nommé comme au critère 1.
3. Un fichier dont un test dure plus longtemps que le sursis du chien de garde, après un premier test
   rapide : il n'est pas arrêté et passe.
4. Un fichier vert et un fichier rouge : code non nul, totaux `tests`, `pass`, `fail` exacts sur les
   deux fichiers, fichier rouge nommé sur une ligne qui commence par `✖`.
5. Par défaut, deux fichiers ne se chevauchent jamais ; avec `TVLENS_TEST_CONCURRENCY=2`, deux fichiers
   qui s'attendent l'un l'autre, chacun dans une attente bornée, passent tous les deux.
6. Une variable d'environnement posée au lancement du lanceur est lue par le test d'un fichier.
7. Budget global, `TVLENS_TEST_BUDGET_MS=2000` et un délai par test plus long : un fichier dont le test
   ne finit jamais et qui a lancé un processus enfant. Le lanceur sort avant 10 s, code non nul, avec
   « Délai dépassé (2 s) » et le nom du fichier ; ni le processus du fichier ni son enfant ne vivent
   encore ; un second fichier placé après lui n'a pas été lancé.
8. Signal : le lanceur, arrêté par `SIGTERM` pendant qu'un fichier est bloqué, sort, et le processus
   du fichier a disparu.
9. Sans argument, le lanceur joue tous les `tests/*.test.cjs` du dépôt jetable et aucun autre fichier.
10. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un nouveau fichier de test nommé d'après le comportement, `tests/test-launcher.test.cjs`, dont par
exemple « a test file still alive after its last test is stopped and named ». Frontière :
`scripts/quality/run-tests.mjs` lancé comme un processus, observé par son code de sortie, sa sortie et
les processus qu'il laisse.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le drapeau `harnais: oui` a été posé au découpage et attend la relecture
du propriétaire avant le premier lancement. Si le lanceur ne peut pas savoir, depuis la sortie d'un
fichier encore vivant, qu'aucun test n'y est en cours : verdict BLOQUÉ, avec l'essai qui le montre.

## Journal
