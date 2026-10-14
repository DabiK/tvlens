---
id: T079
titre: Name the description retry tests after their behaviour
statut: a-faire
bloque_par: T005, T006, T008, T010, T011, T013, T014, T047, T048, T049, T050, T052, T054, T065, T067, T068, T069, T070, T074, T076, T077
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tests/architecture-f08.test.cjs` porte le numéro d'un chantier alors qu'il teste un seul
comportement : une description qui échoue sur une erreur passagère est redemandée une fois. Après ce
ticket, le fichier s'appelle `tests/vision-retry.test.cjs`, son en-tête cite l'ADR et plus aucun
identifiant de chantier n'y figure. Aucun test n'est perdu, déplacé ou réécrit. La mesure
`tests_nommes_par_chantier` baisse de 1.

## Sources

- Constats : TSTA-05, DOC-06
- Règle : `docs/standards.md`, section « Tests » (« Un fichier de test porte le nom d'un module ou d'un
  comportement »).
- Code vérifié à la version `0d5a954`. Les tickets qui précèdent celui-ci (formatage, aides de test
  partagées, attentes) ont pu déplacer les lignes, remplacer des aides locales et retoucher des tests :
  se fier aux noms et aux titres.
  - `tests/architecture-f08.test.cjs` : 19 tests, 414 lignes. En-tête « // F08: a description that
    failed on a passing error is asked for once more, in line, and only then. » (`:11`), seule
    occurrence de « F08 » dans le fichier.
  - Onze tests sur `WatchSession` avec l'aide `fixture` (`:26`), de « a description that fails once on
    a passing error is asked for once more in line… » (`:39`) à « reopening brings the two counters
    back only as counts this session can have written… » (`:200`).
  - Quatre tests sur le marquage par `CodexPerception`, avec les aides `impatient`, `afterAbort`,
    `marked` (`:231` à `:234`) : `:236`, `:242`, `:261`, `:291`.
  - Quatre tests derrière les émetteurs réels, avec les aides `appServer` (`:307`) et `codex` (`:333`) :
    « behind the real Codex client: … » (`:342`, `:355`), « behind the real local agent: … » (`:375`),
    « end to end behind the real Codex client: … » (`:394`).
  - Sept titres dépassent 160 caractères (`:242`, `:261`, `:291`, `:342`, `:355`, `:375`, `:394`) ;
    65 lignes de plus de 160 caractères avant formatage.
  - ADR : `docs/adr/0008-description-redemandee-une-fois-apres-un-echec-passager.md`.
  - Historique : `docs/architecture-improvements/history/F08.md`, section « Fichiers », ligne du
    tableau `:160`, cite l'ancien chemin.
- Mécanique du contrôle, vérifiée dans `scripts/check.mjs` (fonction `fileRules`) : un fichier renommé
  n'a pas de version de `HEAD` à son nouveau chemin ; la moindre ligne de plus de 160 caractères y est
  comptée comme ajoutée et rend le contrôle rouge.
- Mécanique de la boucle, vérifiée dans `scripts/loop/run.mjs` : une entrée de `git status` qui contient
  « D » sous `tests/` est refusée quand `supprime_tests` vaut non. Un renommage fait par `git mv`
  apparaît en « R » : il passe.
- Ordre : des tickets des lots L01, L04, L05 et L06 citent ce fichier par son ancien chemin dans leurs
  critères ; ce ticket passe après eux.

## Périmètre

- À modifier :
  - `tests/architecture-f08.test.cjs` → `tests/vision-retry.test.cjs`, par `git mv` (le fichier
    renommé n'est pas ré-indexé ensuite, pour que Git le voie toujours comme un renommage).
  - Dans le fichier renommé : l'en-tête garde sa description, perd son préfixe « F08: » et cite le
    chemin de l'ADR (« Decision: docs/adr/0008-….md ») ; aucune ligne de plus de 160 caractères. Un
    titre de test dont la ligne dépasse encore 160 caractères après formatage est raccourci : il garde
    le sujet et l'exigence principale, et le détail retiré devient un commentaire juste au-dessus du
    test. Les autres titres ne changent pas d'un caractère. Chaînes et commentaires trop longs sont
    coupés sans changer leur texte.
  - `docs/architecture-improvements/history/F08.md` : sous le tableau de la section « Fichiers », une
    ligne ajoutée dit le nouveau nom du fichier de test. Le reste de l'historique n'est pas réécrit.
- À ne pas toucher : le code de production ; les corps, assertions et aides des tests ; les autres
  fichiers de test ; les tickets déjà terminés.
- Aucun test n'est déplacé vers un autre fichier : les trois groupes (session, adaptateur, émetteurs
  réels) restent ensemble, ils prouvent la même décision.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande. « Commande des titres » désigne :

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/<fichier>.test.cjs \
  | grep -E '^ *(not )?ok [0-9]+ - ' | sed -E 's/^ *(not )?ok [0-9]+ - //; s/ # (SKIP|TODO).*$//' | sort
```

1. Avant toute modification, la commande des titres et `grep -cE '^\s*test\(' ` sont lancés sur
   `tests/architecture-f08.test.cjs` ; sorties conservées dans le dossier d'état du ticket
   (`.harness-state/tickets/<id>/`, hors Git). À `0d5a954` : 19 titres, 19 déclarations. Si un ticket
   antérieur en a ajouté, les nombres relevés ici font foi pour les critères 3, 4 et 8.
2. `test -e tests/architecture-f08.test.cjs` échoue ; `test -e tests/vision-retry.test.cjs` réussit.
3. `grep -cE '^\s*test\(' tests/vision-retry.test.cjs` rend le nombre relevé au critère 1.
4. Après modification, la commande des titres sur `tests/vision-retry.test.cjs` rend le même nombre
   de titres qu'au critère 1, sans doublon. Les seules différences sont les titres raccourcis, et
   chacun figure dans une table « ancien titre → nouveau titre » du journal.
5. `awk 'length($0) > 160' tests/vision-retry.test.cjs | wc -l` rend 0.
6. `grep -ciE 'f08' tests/vision-retry.test.cjs` rend 0 et
   `grep -c 'docs/adr/0008' tests/vision-retry.test.cjs` rend au moins 1.
7. `grep -c 'vision-retry.test.cjs' docs/architecture-improvements/history/F08.md` rend au moins 1.
8. `node --test --test-concurrency=1 tests/vision-retry.test.cjs` : autant de tests qu'au critère 1,
   aucun échec.
9. `node -e "import('./scripts/quality/metrics.mjs').then((m) => console.log(m.measure('.')))"` :
   `tests_nommes_par_chantier` vaut la valeur de `scripts/quality/baseline.json` moins 1 ;
   `cas_de_test` n'est pas sous sa valeur du plancher.
10. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants du fichier (19 à `0d5a954`), inchangés dans leur corps, dans
`tests/vision-retry.test.cjs`. Frontières inchangées : `WatchSession` sur des doubles de perception,
`CodexPerception` seul, puis le vrai client Codex et le vrai agent local derrière des doubles de
transport.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un titre ne peut pas être raccourci sans perdre l'exigence qu'il
énonce, si `git mv` est refusé à la session, ou si un test échoue après le seul renommage : verdict
BLOQUÉ, avec le titre, le refus ou l'échec constaté.

## Journal
