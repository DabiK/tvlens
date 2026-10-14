---
id: T086
titre: Name the remaining Codex connection tests after their behaviour
statut: a-faire
bloque_par: T085
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Une fois ses tests de l'index, des preuves, des réglages et de Whisper rangés ailleurs,
`tests/review-regressions.test.cjs` ne contient plus que des tests de la connexion Codex, sous un nom
qui dit encore l'occasion de leur écriture (une revue). Après ce ticket, le test de la perception
rejoint les tests de perception de `tests/codex-thread-rotation.test.cjs`, et le fichier s'appelle
`tests/codex-client-lifecycle.test.cjs` : il prouve qu'un client Codex garde un seul processus vivant
et reste fermé une fois fermé. Son en-tête dit ce comportement. Les deux documents de livraison qui
citent l'ancien chemin disent où sont les tests. Aucun test n'est perdu ni réécrit. La mesure
`tests_nommes_par_chantier` baisse de 1.

## Sources

- Constats : TSTA-06, DOC-06
- Règle : `docs/standards.md`, section « Tests » (« Un fichier de test porte le nom d'un module ou d'un
  comportement » ; « Le nombre de cas de test ne baisse pas »).
- Code vérifié à la version `0d5a954`. Les tickets qui précèdent celui-ci ont formaté le fichier,
  remplacé des aides locales par celles de `tests/helpers/`, et en ont sorti treize tests : se fier aux
  titres.
  - Tests qui restent dans le fichier renommé, tous sur `CodexSessionClient` ou `CodexSessionAgent`
    derrière le double local `appServer({ handle })` (`tests/review-regressions.test.cjs:27`) :
    - « an App Server dying during the handshake leaves neither its directory nor its dead transport
      on the client » (`:52`) ;
    - « a client closed while its process is being recycled stays closed » (`:66`) ;
    - « two prepare calls around a dead connection end with a single live process » (`:78`) ;
    - « a chat answer that had to connect says so, and the next one does not » (`:91`) ;
    - « a client closed while a turn is removing a dead connection stays closed » (`:308`).
  - Test qui part : « after the agent reconnected, a description is the first turn of its thread, not
    the nth » (`:102`). Il construit `CodexPerception` sur un double d'agent écrit dans le test et
    n'utilise aucune aide du fichier.
  - `tests/codex-thread-rotation.test.cjs` : 14 tests ; importe déjà `CodexPerception` ; ses tests de
    perception commencent à « perception resets the model context on topic change… » (`:282`).
  - En-tête du fichier d'origine : « Defects found by the independent review of the latency branch,
    each pinned by its failing case. » (`:20`). C'est la seule ligne du fichier qui contient
    « review ».
  - Aucun fichier `tests/codex-client-lifecycle.test.cjs` n'existe.
  - `docs/backend-latency-optimization.md` cite l'ancien chemin quatre fois : dans « Changements »
    (`:56`, `:62`, `:69`) et dans « Revue indépendante » (`:293`, « la plupart dans
    `tests/review-regressions.test.cjs` (dix-neuf tests) »).
  - `docs/night-features-delivery.md`, tableau « Tests existants adaptés sciemment » (`:820`) : cite
    l'ancien chemin pour des assertions sur `visionDuringAsk`.
  - Citations qui restent telles quelles : `tests/agent-guards.test.cjs:103` (le nom sert d'exemple de
    nom refusé, dans un dépôt factice) ; le commentaire de `scripts/quality/metrics.mjs:12` (exemples
    de la règle) ; les décomptes datés de `docs/architecture-improvements/history/`.
- Où sont partis les treize autres tests du fichier, pour la note des documents (à vérifier par
  `grep` sur les titres) : index des passages dans `tests/moment-index.test.cjs` ; branchement de
  l'index dans `tests/session-runtime.test.cjs` et `tests/server-state-views.test.cjs` ; preuves relues
  dans `tests/evidence-refresh.test.cjs` ; transcription échouée dans
  `tests/reinspection-transcript-reuse.test.cjs` ; réglages dans `tests/portable-config.test.cjs` ;
  Whisper dans `tests/transcriber-sharing.test.cjs`. À `0d5a954`, les assertions sur
  `visionDuringAsk` du fichier d'origine sont dans les deux tests des réglages et dans le test du
  runtime de session : elles sont donc parties vers `tests/portable-config.test.cjs` et
  `tests/session-runtime.test.cjs`.
- Risque relevé par la relecture de l'audit : fusionner les doubles d'App Server de plusieurs fichiers
  changerait ce que les tests prouvent. Le double `appServer` reste donc local au fichier renommé.
- Mécanique de la boucle, vérifiée dans `scripts/loop/run.mjs` : une entrée de `git status` qui contient
  « D » sous `tests/` est refusée quand `supprime_tests` vaut non. Un renommage fait par `git mv`
  apparaît en « R » : il passe. Le fichier renommé garde cinq de ses six tests et son double.
- Mécanique du contrôle, vérifiée dans `scripts/check.mjs` (fonction `fileRules`) : dans un fichier
  renommé, la moindre ligne de plus de 160 caractères rend le contrôle rouge ; dans un fichier
  existant, le nombre de ces lignes ne doit pas monter.

## Périmètre

- À modifier :
  - `tests/codex-thread-rotation.test.cjs` : reçoit le test de la perception, à la fin du fichier ou
    à la suite de ses tests de perception. Ses aides et ses autres tests ne changent pas.
  - `tests/review-regressions.test.cjs` → `tests/codex-client-lifecycle.test.cjs`, par `git mv` (le
    fichier renommé n'est pas ré-indexé ensuite, pour que Git le voie toujours comme un renommage).
    Dans le fichier renommé :
    - l'en-tête dit le comportement prouvé, sans le mot « review » ;
    - les imports et les aides que plus aucun test n'utilise sont retirés ; le double `appServer`
      reste ;
    - aucune ligne de plus de 160 caractères : chaînes et commentaires trop longs sont coupés sans
      changer leur texte.
  - `docs/backend-latency-optimization.md` : une ligne ajoutée sous le paragraphe de « Revue
    indépendante » qui cite l'ancien chemin dit que ces tests sont depuis rangés par comportement, et
    nomme les fichiers d'arrivée. Le reste du document n'est pas réécrit.
  - `docs/night-features-delivery.md` : une ligne ajoutée sous le tableau « Tests existants adaptés
    sciemment » dit que le fichier s'appelle `tests/codex-client-lifecycle.test.cjs` et que ses
    assertions sur `visionDuringAsk` sont dans `tests/portable-config.test.cjs` et
    `tests/session-runtime.test.cjs` (les fichiers nommés sont ceux où
    `grep -l 'visionDuringAsk' tests/*.test.cjs` les trouve).
- Les tests gardent leur titre au caractère près, leurs assertions et leurs valeurs attendues ; seule
  la mise en forme du formateur peut différer dans le test déplacé.
- Aucune ligne de plus de 160 caractères n'est ajoutée dans `tests/codex-thread-rotation.test.cjs`.
- À ne pas toucher : le code de production ; les corps des cinq tests qui restent ; les autres fichiers
  `tests/codex-*.test.cjs` ; `tests/agent-guards.test.cjs` ; `scripts/quality/` ; l'historique
  `docs/architecture-improvements/history/`.
- Hors périmètre : réunir les petits fichiers `tests/codex-*.test.cjs` ou leurs doubles d'App Server.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande. « Commande des titres » désigne, lancée fichier
par fichier :

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/<fichier>.test.cjs \
  | grep -E '^ *(not )?ok [0-9]+ - ' | sed -E 's/^ *(not )?ok [0-9]+ - //; s/ # (SKIP|TODO).*$//' | sort
```

1. Avant toute modification, la commande des titres et `grep -cE '^\s*test\(' ` sont lancés sur
   `tests/review-regressions.test.cjs` et `tests/codex-thread-rotation.test.cjs` ; sorties conservées
   dans le dossier d'état du ticket (`.harness-state/tickets/<id>/`, hors Git), avec une copie de
   `tests/codex-thread-rotation.test.cjs`. Si le premier fichier
   contient d'autres tests que les six cités dans « Sources », voir « Hypothèses bloquantes ».
2. `test -e tests/review-regressions.test.cjs` échoue ;
   `test -e tests/codex-client-lifecycle.test.cjs` réussit.
3. `grep -cE '^\s*test\(' ` rend, par rapport au critère 1 : le nombre du fichier d'origine moins 1
   pour `tests/codex-client-lifecycle.test.cjs` ; 1 de plus pour
   `tests/codex-thread-rotation.test.cjs`.
4. La commande des titres, lancée sur les deux fichiers et réunie puis triée, rend exactement la
   réunion triée des deux listes du critère 1 : aucun titre perdu, ajouté, modifié ou en double.
   Comparaison (`diff`) dans le journal.
5. Le test déplacé passe seul, par `--test-name-pattern` sur `tests/codex-thread-rotation.test.cjs` ;
   puis `node --test --test-concurrency=1` passe sans échec sur chacun des deux fichiers.
6. `diff <copie du critère 1> tests/codex-thread-rotation.test.cjs | grep '^<'` ne sort rien : le
   fichier d'arrivée ne perd ni test ni assertion.
7. `awk 'length($0) > 160' tests/codex-client-lifecycle.test.cjs | wc -l` rend 0.
8. `grep -ciE 'review|CodexPerception' tests/codex-client-lifecycle.test.cjs` rend 0.
9. `grep -c 'codex-client-lifecycle.test.cjs' docs/backend-latency-optimization.md` et
   `grep -c 'codex-client-lifecycle.test.cjs' docs/night-features-delivery.md` rendent au moins 1 ;
   `grep -c 'tests/portable-config.test.cjs' docs/night-features-delivery.md` rend au moins 1.
10. `node -e "import('./scripts/quality/metrics.mjs').then((m) => console.log(m.measure('.')))"` :
    `tests_nommes_par_chantier` vaut la valeur de `scripts/quality/baseline.json` moins 1 ;
    `cas_de_test` n'est pas sous sa valeur du plancher ; aucune autre mesure n'est au-dessus de la
    sienne.
11. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les six tests existants, inchangés : cinq dans `tests/codex-client-lifecycle.test.cjs` (client et agent
Codex derrière le double `appServer`), un dans `tests/codex-thread-rotation.test.cjs` (`CodexPerception`
sur un double d'agent).

## Hypothèses bloquantes

Aucune décision n'est attendue. Si `tests/review-regressions.test.cjs` contient encore un test qui ne
porte pas sur la connexion Codex (un test de l'index, des preuves, des réglages ou de Whisper), si
`git mv` est refusé à la session, ou si le test déplacé passe dans son fichier d'origine et échoue dans
son fichier d'arrivée : verdict BLOQUÉ, avec le test, le refus ou l'échec constaté.

## Journal
