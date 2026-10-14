---
id: T078
titre: Name the context release, recap capacity and clip range tests by behaviour
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Trois fichiers de test portent le numéro d'un chantier (`architecture-f04`, `architecture-f09`,
`architecture-f10`) alors qu'ils testent chacun un comportement décidé par un ADR. Après ce ticket, ils
portent le nom de ce comportement, leur en-tête cite l'ADR, plus aucun identifiant de chantier n'y
figure, et les trois messages « sonde F03 » de deux fichiers voisins disent ce qu'ils mesurent. Aucun
test n'est perdu, déplacé ou réécrit. La mesure `tests_nommes_par_chantier` baisse de 3.

## Sources

- Constats : TSTA-05, DOC-06
- Règle : `docs/standards.md`, section « Tests » (« Un fichier de test porte le nom d'un module ou d'un
  comportement ») et section sur les noms (« aucune référence à un ticket ou à un chantier dans le
  code »).
- Code vérifié à la version `0d5a954`. Les tickets qui précèdent celui-ci (formatage, aides de test
  partagées) ont pu déplacer les lignes et remplacer des aides locales : se fier aux noms et aux titres.
  - `tests/architecture-f10.test.cjs` : 10 tests, de « one byte asked of a two-megabyte clip reads one
    byte of it » (`:92`) à « a client that gives up while its range is being read… » (`:273`) ;
    en-tête « // F10: a range of a stored clip reads the bytes it answers with, and no others. »
    (`:12`) ; préfixes de dossiers temporaires `'tvlens-f10-'` dans `stored` (`:66`) et
    `'tvlens-f10-http-'` dans `served` (`:76`). Aucun titre de plus de 160 caractères ; 20 lignes de
    plus de 160 caractères avant formatage.
  - `tests/architecture-f04.test.cjs` : 8 tests, de « twenty finished questions on a hundred
    passages… » (`:56`) à « once released, a context refuses every consultation… » (`:225`) ; en-tête
    « // F04: a finished question keeps its answer, not its working memory… » (`:6`) ; identifiant
    `'session-f04'` dans `stage` (`:36`), qu'aucune assertion ne compare ; six messages `t.diagnostic`
    qui commencent par « F04 » (`:70` à `:74`, `:210`). Quatre titres dépassent 160 caractères (`:56`,
    `:92`, `:127`, `:150`) ; 22 lignes de plus de 160 caractères avant formatage.
  - `tests/architecture-f09.test.cjs` : 9 tests, de « the adapter still sends an input of exactly
    240 000 characters… » (`:57`) à « the Mémoire view says a ceiling as a ceiling… » (`:242`) ;
    en-tête « // F09: a session too long for one synthesis is refused for its size… » (`:9`). Un titre
    dépasse 160 caractères (`:57`) ; 20 lignes de plus de 160 caractères avant formatage.
  - `tests/session-durable.test.cjs` : deux `t.diagnostic` « sonde F03, synthétique, … » (`:870`,
    `:871`) dans le test « a disk slower than the states it is handed writes the latest one… »
    (`:842`).
  - `tests/server-sessions.test.cjs` : un `t.diagnostic` « sonde F03, synthétique, hôte serveur… »
    (`:770`) dans le test « synthetic probe of the ticket at the host… » (`:753`).
  - Aucun script ni document ne lit ces messages de diagnostic.
  - ADR : `docs/adr/0004-contexte-de-question-rendu-quand-l-agent-a-fini.md`,
    `docs/adr/0009-synthese-refusee-pour-sa-taille-retentee-seulement-si-son-entree-change.md`,
    `docs/adr/0010-une-plage-de-clip-ne-lit-que-les-octets-qu-elle-renvoie.md`.
  - Historique : `docs/architecture-improvements/history/F04.md` (section « Fichiers », ligne du
    tableau `:175`), `F09.md` (`:189`), `F10.md` (`:187`) citent l'ancien chemin.
- Mécanique du contrôle, vérifiée dans `scripts/check.mjs` (fonction `fileRules`) : un fichier est
  comparé à sa version de `HEAD` au même chemin. Un fichier renommé n'a pas de version de `HEAD` à son
  nouveau chemin : la moindre ligne de plus de 160 caractères y est comptée comme ajoutée et rend le
  contrôle rouge. D'où le prérequis `jalon:format`, puis le traitement des lignes que Prettier ne coupe
  pas (titres, chaînes, commentaires).
- Mécanique de la boucle, vérifiée dans `scripts/loop/run.mjs` : une entrée de `git status` qui contient
  « D » sous `tests/` est refusée quand `supprime_tests` vaut non. Un renommage fait par `git mv`
  apparaît en « R » : il passe.
- Ordre : les tickets des lots L02 et L05 citent ces trois fichiers par leur ancien chemin dans leurs
  critères ; ce ticket passe après eux.

## Périmètre

- À modifier, d'abord par renommage avec `git mv` (le fichier renommé n'est pas ré-indexé ensuite, pour
  que Git le voie toujours comme un renommage) :
  - `tests/architecture-f04.test.cjs` → `tests/question-context-release.test.cjs`
  - `tests/architecture-f09.test.cjs` → `tests/recap-capacity.test.cjs`
  - `tests/architecture-f10.test.cjs` → `tests/clip-byte-range.test.cjs`
- Dans chacun des trois fichiers renommés :
  - l'en-tête garde sa description et perd son préfixe « F0N: » ; il cite le chemin de l'ADR
    (« Decision: docs/adr/00NN-….md ») ;
  - plus aucune occurrence de « f04 », « f09 », « f10 » (majuscules ou minuscules) : préfixes de
    dossiers temporaires, identifiant de session, messages `t.diagnostic` ; le numéro est retiré ou
    remplacé par le sujet du test, le reste de chaque chaîne est conservé ;
  - aucune ligne de plus de 160 caractères. Un titre de test dont la ligne dépasse encore 160
    caractères après formatage est raccourci : il garde le sujet et l'exigence principale, et le détail
    retiré devient un commentaire juste au-dessus du test. Les autres titres ne changent pas d'un
    caractère. Chaînes et commentaires trop longs sont coupés sans changer leur texte.
- `tests/session-durable.test.cjs` et `tests/server-sessions.test.cjs` : dans les trois messages,
  « sonde F03, synthétique » devient « sonde des écritures d'état, synthétique ». Rien d'autre ne change
  dans ces deux fichiers, et aucune ligne de plus de 160 caractères n'y est ajoutée.
- `docs/architecture-improvements/history/F04.md`, `F09.md`, `F10.md` : sous le tableau de la section
  « Fichiers », une ligne ajoutée dit le nouveau nom du fichier de test. Le reste de l'historique n'est
  pas réécrit.
- À ne pas toucher : le code de production ; les corps, assertions et aides des tests ; les fixtures
  `tests/agent-guards.test.cjs` et `tests/quality-check.test.cjs`, qui citent
  `tests/architecture-f04.test.cjs` comme nom d'exemple dans un dépôt factice ; le commentaire de
  `scripts/quality/metrics.mjs` ; les tickets déjà terminés.
- Aucun test n'est déplacé vers un autre fichier : la répartition plus fine par module n'est pas dans ce
  ticket.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande. « Commande des titres » désigne, lancée fichier
par fichier :

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/<fichier>.test.cjs \
  | grep -E '^ *(not )?ok [0-9]+ - ' | sed -E 's/^ *(not )?ok [0-9]+ - //; s/ # (SKIP|TODO).*$//' | sort
```

1. Avant toute modification, la commande des titres et `grep -cE '^\s*test\(' ` sont lancés sur les
   trois fichiers d'origine ; sorties conservées dans le dossier d'état du ticket
   (`.harness-state/tickets/<id>/`, hors Git). À `0d5a954` : 8, 9 et 10 titres, autant de
   déclarations. Si un ticket antérieur en a ajouté, les nombres relevés ici font foi pour les
   critères 3 et 4.
2. `test -e` échoue sur les trois anciens chemins et réussit sur les trois nouveaux.
3. `grep -cE '^\s*test\(' ` rend, pour `tests/question-context-release.test.cjs`,
   `tests/recap-capacity.test.cjs` et `tests/clip-byte-range.test.cjs`, les nombres relevés au
   critère 1 pour le fichier d'origine correspondant.
4. Après modification, la commande des titres sur les trois nouveaux fichiers rend le même nombre de
   titres qu'au critère 1, sans doublon. Les seules différences sont les titres raccourcis, et chacun
   figure dans une table « ancien titre → nouveau titre » du journal.
5. `awk 'length($0) > 160' <fichier> | wc -l` rend 0 pour chacun des trois nouveaux fichiers.
6. `grep -ciE 'f04|f09|f10' <fichier>` rend 0 pour chacun des trois nouveaux fichiers, et
   `grep -c 'docs/adr/00' <fichier>` rend au moins 1 pour chacun.
7. `grep -c 'sonde F03' tests/session-durable.test.cjs` et
   `grep -c 'sonde F03' tests/server-sessions.test.cjs` rendent 0 ;
   `grep -c "sonde des écritures d'état" tests/session-durable.test.cjs` rend 2 et
   `grep -c "sonde des écritures d'état" tests/server-sessions.test.cjs` rend 1.
8. `grep -c 'question-context-release.test.cjs' docs/architecture-improvements/history/F04.md`,
   `grep -c 'recap-capacity.test.cjs' docs/architecture-improvements/history/F09.md` et
   `grep -c 'clip-byte-range.test.cjs' docs/architecture-improvements/history/F10.md` rendent chacun
   au moins 1.
9. `node --test --test-concurrency=1` sur les trois nouveaux fichiers puis sur
   `tests/session-durable.test.cjs` et `tests/server-sessions.test.cjs` : aucun échec.
10. `node -e "import('./scripts/quality/metrics.mjs').then((m) => console.log(m.measure('.')))"` :
    `tests_nommes_par_chantier` vaut la valeur de `scripts/quality/baseline.json` moins 3 ;
    `cas_de_test` n'est pas sous sa valeur du plancher.
11. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants des trois fichiers (27 à `0d5a954`), inchangés dans leur corps, dans
`tests/question-context-release.test.cjs`, `tests/recap-capacity.test.cjs` et
`tests/clip-byte-range.test.cjs`. Frontières inchangées : la composition de conversation partagée par
les deux hôtes, le récap vivant derrière son adaptateur, le store de session et la route
`GET /v1/media`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un titre ne peut pas être raccourci sans perdre l'exigence qu'il
énonce, si `git mv` est refusé à la session, ou si un test échoue après le seul renommage : verdict
BLOQUÉ, avec le titre, le refus ou l'échec constaté.

## Journal
