---
id: T081
titre: Name the session closing tests after their behaviour
statut: a-faire
bloque_par: T067, T068, T069, T070, T074, T076, T077, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tests/architecture-f07.test.cjs` porte le numéro d'un chantier alors qu'il teste un comportement : la
fin d'une session suit le même protocole sur les deux hôtes. Après ce ticket, le fichier s'appelle
`tests/session-closing.test.cjs`, du nom du module qu'il prouve (`runtime/session-closing.cjs`), son
en-tête cite l'ADR et plus aucun identifiant de chantier n'y figure. Aucun test n'est perdu, déplacé ou
réécrit. La mesure `tests_nommes_par_chantier` baisse de 1.

## Sources

- Constats : TSTA-05, DOC-06
- Règle : `docs/standards.md`, section « Tests » (« Un fichier de test porte le nom d'un module ou d'un
  comportement ») et section sur les noms (« aucune référence à un ticket ou à un chantier dans le
  code »).
- Code vérifié à la version `0d5a954`. Les tickets qui précèdent celui-ci (formatage, banc Mac partagé,
  aides d'attente, tests sans texte source) ont pu déplacer les lignes, remplacer des aides locales et
  retoucher des tests : se fier aux noms et aux titres.
  - `tests/architecture-f07.test.cjs` : 591 lignes. 12 déclarations `test(` en début de ligne et 7
    appels à `onBothHosts(`, qui déclare chaque scénario une fois par hôte : 26 tests exécutés.
  - Sept tests du protocole seul, de « the closing protocol raises the end of the session and runs
    what its host must not delay before anything is awaited… » (`:75`) à « settling the questions
    cancels them with the reason of the end… » (`:154`).
  - `HOSTS` et `onBothHosts` (`:311`, `:312`) : le titre exécuté est « Mac host (IPC) — … » ou
    « server host (HTTP) — … ». Sept scénarios, de « a question still running when its session ends
    reaches its final state… » (`:322`) à « the closing steps of a session are entered in the order
    this host keeps for itself… » (`:460`).
  - Cinq tests propres à un hôte ou aux deux : « server host (HTTP) — … » (`:499`, `:517`),
    « Mac host (IPC) — … » (`:531`, `:551`), « both hosts end a session through the shared
    protocol… » (`:578`).
  - En-tête « // F07: the end of a loaded session follows one protocol on both hosts
    (runtime/session-closing.cjs)… » (`:14`).
  - Deux autres occurrences du numéro : les préfixes de dossiers temporaires `'tvlens-f07-server-'`
    dans `serverHost` (`:170`) et `'tvlens-f07-mac-'` dans `macHost` (`:223`).
  - Dix-huit titres dépassent 160 caractères, jusqu'à plus de 400 ; 97 lignes de plus de 160
    caractères avant formatage.
  - ADR : `docs/adr/0007-fin-de-session-par-un-meme-protocole-sur-les-deux-hotes.md`.
  - Historique : `docs/architecture-improvements/history/F07.md`, section « Fichiers », ligne du
    tableau `:319`, cite l'ancien chemin.
- Mécanique du contrôle, vérifiée dans `scripts/check.mjs` (fonction `fileRules`) : un fichier renommé
  n'a pas de version de `HEAD` à son nouveau chemin ; la moindre ligne de plus de 160 caractères y est
  comptée comme ajoutée et rend le contrôle rouge.
- Mécanique de la boucle, vérifiée dans `scripts/loop/run.mjs` : une entrée de `git status` qui contient
  « D » sous `tests/` est refusée quand `supprime_tests` vaut non. Un renommage fait par `git mv`
  apparaît en « R » : il passe.
- Mesure `cas_de_test`, vérifiée dans `scripts/quality/metrics.mjs` : elle compte les lignes qui
  commencent par `test(`. Selon la coupe du formateur, l'appel à `test` écrit dans `onBothHosts` peut
  compter pour une déclaration de plus : le nombre relevé au critère 1 fait foi.
- Ordre : des tickets des lots L02, L05 et L06 citent ce fichier par son ancien chemin dans leurs
  critères ; ce ticket passe après eux.

## Périmètre

- À modifier :
  - `tests/architecture-f07.test.cjs` → `tests/session-closing.test.cjs`, par `git mv` (le fichier
    renommé n'est pas ré-indexé ensuite, pour que Git le voie toujours comme un renommage).
  - Dans le fichier renommé :
    - l'en-tête garde sa description, perd son préfixe « F07: » et cite le chemin de l'ADR
      (« Decision: docs/adr/0007-….md ») ;
    - les deux préfixes de dossiers temporaires ne portent plus le numéro (par exemple
      `'tvlens-closing-server-'` et `'tvlens-closing-mac-'`) ;
    - aucune ligne de plus de 160 caractères. Un titre dont la ligne dépasse encore 160 caractères
      après formatage est raccourci : il garde le sujet et l'exigence principale, et le détail retiré
      devient un commentaire juste au-dessus du test ou du scénario. Pour un scénario `onBothHosts`,
      le titre raccourci vaut pour les deux hôtes : deux lignes dans la table du journal. Les autres
      titres ne changent pas d'un caractère. Chaînes et commentaires trop longs sont coupés sans
      changer leur texte.
  - `docs/architecture-improvements/history/F07.md` : sous le tableau de la section « Fichiers », une
    ligne ajoutée dit le nouveau nom du fichier de test. Le reste de l'historique n'est pas réécrit.
- À ne pas toucher : le code de production ; les corps, assertions et aides des tests, `HOSTS` et
  `onBothHosts` compris ; les préfixes « Mac host (IPC) — » et « server host (HTTP) — » des titres ;
  les autres fichiers de test ; les tickets déjà terminés.
- Aucun test n'est déplacé vers un autre fichier : le protocole seul, les scénarios sur les deux hôtes
  et les tests propres à un hôte prouvent la même décision.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande. « Commande des titres » désigne :

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/<fichier>.test.cjs \
  | grep -E '^ *(not )?ok [0-9]+ - ' | sed -E 's/^ *(not )?ok [0-9]+ - //; s/ # (SKIP|TODO).*$//' | sort
```

1. Avant toute modification, la commande des titres, `grep -cE '^\s*test\(' ` et
   `grep -cE '^\s*onBothHosts\(' ` sont lancés sur `tests/architecture-f07.test.cjs` ; sorties
   conservées dans le dossier d'état du ticket (`.harness-state/tickets/<id>/`, hors Git). À
   `0d5a954` : 26 titres, 12 déclarations, 7 scénarios. Si un ticket antérieur en a ajouté ou si le
   formatage a changé le décompte, les nombres relevés ici font foi pour les critères 3, 4 et 8.
2. `test -e tests/architecture-f07.test.cjs` échoue ; `test -e tests/session-closing.test.cjs` réussit.
3. `grep -cE '^\s*test\(' tests/session-closing.test.cjs` et
   `grep -cE '^\s*onBothHosts\(' tests/session-closing.test.cjs` rendent les nombres relevés au
   critère 1.
4. Après modification, la commande des titres sur `tests/session-closing.test.cjs` rend le même nombre
   de titres qu'au critère 1, sans doublon. Les seules différences sont les titres raccourcis, et
   chacun figure dans une table « ancien titre → nouveau titre » du journal.
5. `awk 'length($0) > 160' tests/session-closing.test.cjs | wc -l` rend 0.
6. `grep -ciE 'f07' tests/session-closing.test.cjs` rend 0 et
   `grep -c 'docs/adr/0007' tests/session-closing.test.cjs` rend au moins 1.
7. `grep -c 'session-closing.test.cjs' docs/architecture-improvements/history/F07.md` rend au moins 1.
8. `node --test --test-concurrency=1 tests/session-closing.test.cjs` : autant de tests qu'au critère 1,
   aucun échec.
9. `node -e "import('./scripts/quality/metrics.mjs').then((m) => console.log(m.measure('.')))"` :
   `tests_nommes_par_chantier` vaut la valeur de `scripts/quality/baseline.json` moins 1 ;
   `cas_de_test` n'est pas sous sa valeur du plancher.
10. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants du fichier (26 exécutés à `0d5a954`), inchangés dans leur corps, dans
`tests/session-closing.test.cjs`. Frontières inchangées : le protocole de `runtime/session-closing.cjs`
sur des doubles, puis les gestes des deux hôtes (IPC de l'hôte Mac, HTTP de l'hôte serveur).

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un titre ne peut pas être raccourci sans perdre l'exigence qu'il
énonce, si `git mv` est refusé à la session, ou si un test échoue après le seul renommage : verdict
BLOQUÉ, avec le titre, le refus ou l'échec constaté.

## Journal
