---
id: T080
titre: Name the ingest block ownership tests after their behaviour
statut: a-faire
bloque_par: T001, T005, T006, T008, T010, T011, T013, T014, T040, T041, T043, T044, T045, T047, T048, T049, T050, T052, T054, T065, T067, T068, T069, T070, T074, T076, T077, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tests/architecture-f06.test.cjs` porte le numéro d'un chantier alors qu'il teste un comportement : un
bloc accepté par le transport appartient à l'hôte dès son admission, et sa préparation est annulée
quand sa session part. Après ce ticket, le fichier s'appelle `tests/ingest-block-ownership.test.cjs`,
son en-tête cite l'ADR et plus aucun identifiant de chantier n'y figure. Aucun test n'est perdu,
déplacé ou réécrit. La mesure `tests_nommes_par_chantier` baisse de 1.

## Sources

- Constats : TSTA-05, DOC-06
- Règle : `docs/standards.md`, section « Tests » (« Un fichier de test porte le nom d'un module ou d'un
  comportement ») et section sur les noms (« aucune référence à un ticket ou à un chantier dans le
  code »).
- Code vérifié à la version `0d5a954`. Les tickets qui précèdent celui-ci (formatage, aides de test
  partagées, attentes, erreurs du média) ont pu déplacer les lignes, remplacer des aides locales et
  ajouter des tests : se fier aux noms et aux titres.
  - `tests/architecture-f06.test.cjs` : 17 tests, 580 lignes, de « a block still being prepared when
    its session ends is cancelled through its signal and answered that the session is closing… »
    (`:149`) à « what the transport already guaranteed stays: one preparation at a time, duplicates
    and old numbers answered without media work… » (`:536`).
  - En-tête « // F06: a block the transport has accepted belongs to the host from before its media are
    prepared until it is answered… » (`:15`).
  - Deux autres occurrences du numéro : le préfixe de dossier temporaire `'tvlens-f06-'` dans l'aide
    `bench` (`:87`) ; le commentaire « … the block it interrupts is refused as before (kept out of
    F06). » (`:561`).
  - Aides locales : `scratch`, `bench`, `assembly`, `host`, `assemblerOn` (`:415`).
  - Le test « a client that leaves while its block is prepared cancels nothing… » (`:514`) est celui
    que le ticket T001, terminé, a corrigé ; ce ticket-ci ne le modifie pas.
  - Treize titres dépassent 160 caractères ; 48 lignes de plus de 160 caractères avant formatage.
  - ADR : `docs/adr/0006-bloc-possede-des-son-admission-et-preparation-annulee-quand-sa-session-part.md`.
  - Historique : `docs/architecture-improvements/history/F06.md`, section « Fichiers », ligne du
    tableau `:302`, cite l'ancien chemin.
- Mécanique du contrôle, vérifiée dans `scripts/check.mjs` (fonction `fileRules`) : un fichier renommé
  n'a pas de version de `HEAD` à son nouveau chemin ; la moindre ligne de plus de 160 caractères y est
  comptée comme ajoutée et rend le contrôle rouge.
- Mécanique de la boucle, vérifiée dans `scripts/loop/run.mjs` : une entrée de `git status` qui contient
  « D » sous `tests/` est refusée quand `supprime_tests` vaut non. Un renommage fait par `git mv`
  apparaît en « R » : il passe.
- Ordre : des tickets des lots L01, L04, L05, L06 et L17 citent ce fichier par son ancien chemin dans
  leurs critères ; ce ticket passe après eux.

## Périmètre

- À modifier :
  - `tests/architecture-f06.test.cjs` → `tests/ingest-block-ownership.test.cjs`, par `git mv` (le
    fichier renommé n'est pas ré-indexé ensuite, pour que Git le voie toujours comme un renommage).
  - Dans le fichier renommé :
    - l'en-tête garde sa description, perd son préfixe « F06: » et cite le chemin de l'ADR
      (« Decision: docs/adr/0006-….md ») ;
    - le préfixe de dossier temporaire ne porte plus le numéro (par exemple `'tvlens-ingest-block-'`) ;
    - le commentaire sur la pause dit la même chose sans le numéro (par exemple « kept out of this
      decision ») ;
    - aucune ligne de plus de 160 caractères. Un titre de test dont la ligne dépasse encore 160
      caractères après formatage est raccourci : il garde le sujet et l'exigence principale, et le
      détail retiré devient un commentaire juste au-dessus du test. Les autres titres ne changent pas
      d'un caractère. Chaînes et commentaires trop longs sont coupés sans changer leur texte.
  - `docs/architecture-improvements/history/F06.md` : sous le tableau de la section « Fichiers », une
    ligne ajoutée dit le nouveau nom du fichier de test. Le reste de l'historique n'est pas réécrit.
- À ne pas toucher : le code de production ; les corps, assertions et aides des tests ; les autres
  fichiers de test ; `docs/travail/tickets/001-resent-block-duplicate-without-race.md` et les autres
  tickets terminés, qui citent l'ancien chemin comme un fait daté.
- Aucun test n'est déplacé vers un autre fichier.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande. « Commande des titres » désigne :

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/<fichier>.test.cjs \
  | grep -E '^ *(not )?ok [0-9]+ - ' | sed -E 's/^ *(not )?ok [0-9]+ - //; s/ # (SKIP|TODO).*$//' | sort
```

1. Avant toute modification, la commande des titres et `grep -cE '^\s*test\(' ` sont lancés sur
   `tests/architecture-f06.test.cjs` ; sorties conservées dans le dossier d'état du ticket
   (`.harness-state/tickets/<id>/`, hors Git). À `0d5a954` : 17 titres, 17 déclarations. Si un ticket
   antérieur en a ajouté, les nombres relevés ici font foi pour les critères 3, 4 et 8.
2. `test -e tests/architecture-f06.test.cjs` échoue ; `test -e tests/ingest-block-ownership.test.cjs`
   réussit.
3. `grep -cE '^\s*test\(' tests/ingest-block-ownership.test.cjs` rend le nombre relevé au critère 1.
4. Après modification, la commande des titres sur `tests/ingest-block-ownership.test.cjs` rend le même
   nombre de titres qu'au critère 1, sans doublon. Les seules différences sont les titres raccourcis,
   et chacun figure dans une table « ancien titre → nouveau titre » du journal.
5. `awk 'length($0) > 160' tests/ingest-block-ownership.test.cjs | wc -l` rend 0.
6. `grep -ciE 'f06' tests/ingest-block-ownership.test.cjs` rend 0 et
   `grep -c 'docs/adr/0006' tests/ingest-block-ownership.test.cjs` rend au moins 1.
7. `grep -c 'ingest-block-ownership.test.cjs' docs/architecture-improvements/history/F06.md` rend au
   moins 1.
8. `node --test --test-concurrency=1 tests/ingest-block-ownership.test.cjs` : autant de tests qu'au
   critère 1, aucun échec.
9. `node -e "import('./scripts/quality/metrics.mjs').then((m) => console.log(m.measure('.')))"` :
   `tests_nommes_par_chantier` vaut la valeur de `scripts/quality/baseline.json` moins 1 ;
   `cas_de_test` n'est pas sous sa valeur du plancher.
10. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants du fichier (17 à `0d5a954`), inchangés dans leur corps, dans
`tests/ingest-block-ownership.test.cjs`. Frontière inchangée : la route `POST /v1/segments` d'un vrai
`RemoteServer` devant un vrai `HeadlessRuntime`, et l'assembleur de média derrière ses doubles d'outil.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un titre ne peut pas être raccourci sans perdre l'exigence qu'il
énonce, si `git mv` est refusé à la session, ou si un test échoue après le seul renommage : verdict
BLOQUÉ, avec le titre, le refus ou l'échec constaté.

## Journal
