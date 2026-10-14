---
id: T082
titre: Name the Codex process ownership tests after their behaviour
statut: a-faire
bloque_par: T005, T006, T008, T010, T011, T013, T014, T040, T041, T043, T044, T045, T047, T048, T049, T050, T052, T054, T065, T067, T068, T069, T070, T074, T076, T077, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tests/architecture-f05.test.cjs` porte le numéro d'un chantier alors qu'il teste un comportement : un
groupe de processus Codex a un seul propriétaire jusqu'à sa disparition, une reconnexion attend le
groupe qu'elle remplace, et les contextes MCP d'une session sont révoqués à sa fin. Après ce ticket, le
fichier s'appelle `tests/codex-process-ownership.test.cjs`, son en-tête cite l'ADR et plus aucun
identifiant de chantier n'y figure. Aucun test n'est perdu, déplacé ou réécrit. La mesure
`tests_nommes_par_chantier` baisse de 1.

## Sources

- Constats : TSTA-05, DOC-06
- Règle : `docs/standards.md`, section « Tests » (« Un fichier de test porte le nom d'un module ou d'un
  comportement ») et section sur les noms (« aucune référence à un ticket ou à un chantier dans le
  code »).
- Code vérifié à la version `0d5a954`. Les tickets qui précèdent celui-ci (formatage, banc Mac partagé,
  aides d'attente, erreurs du client Codex) ont pu déplacer les lignes, remplacer des aides locales et
  retoucher des tests : se fier aux noms et aux titres.
  - `tests/architecture-f05.test.cjs` : 15 tests, 739 lignes, de « closing a transport answers once
    its process group is gone… » (`:73`) à « the Mac host revokes the external MCP contexts of a
    session as its end begins… » (`:686`).
  - Quatre sujets : le transport et son groupe (`:73`, `:105`, `:158`, `:190`) ; la reconnexion du
    client (`:256`, `:289`, `:335`, `:350`, `:382`, et `:431` sur le vrai transport, sauté quand
    l'hôte ne s'y prête pas) ; l'hôte et la surveillance (`:464`, `:500`) ; la révocation des contextes
    MCP (`:527`, `:572`, `:686`).
  - En-tête « // F05: a Codex process group has one owner until it is gone, a reconnection waits for
    the group it replaces… » (`:20`).
  - Huit autres lignes portent le numéro : sept préfixes de dossiers ou de binaires temporaires
    `'tvlens-f05-…'` (`:106`, `:205`, `:432`, `:465`, `:528`, `:573`, `:629`) et l'identifiant
    `'session-f05'` (`:501`), qu'aucune assertion ne compare.
  - Un journal commun au fichier est posé par `before` et `after`.
  - Onze titres dépassent 160 caractères ; 60 lignes de plus de 160 caractères avant formatage.
  - ADR :
    `docs/adr/0005-groupe-codex-attendu-avant-d-etre-remplace-et-contextes-revoques-en-fin-de-session.md`.
  - Historique : `docs/architecture-improvements/history/F05.md`, section « Fichiers », ligne du
    tableau `:265`, cite l'ancien chemin.
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
  - `tests/architecture-f05.test.cjs` → `tests/codex-process-ownership.test.cjs`, par `git mv` (le
    fichier renommé n'est pas ré-indexé ensuite, pour que Git le voie toujours comme un renommage).
  - Dans le fichier renommé :
    - l'en-tête garde sa description, perd son préfixe « F05: » et cite le chemin de l'ADR
      (« Decision: docs/adr/0005-….md ») ;
    - les préfixes temporaires et l'identifiant de session ne portent plus le numéro : il est remplacé
      par le sujet (par exemple `'tvlens-codex-launcher-'`, `'session-codex'`), le suffixe de chaque
      préfixe est conservé ;
    - aucune ligne de plus de 160 caractères. Un titre de test dont la ligne dépasse encore 160
      caractères après formatage est raccourci : il garde le sujet et l'exigence principale, et le
      détail retiré devient un commentaire juste au-dessus du test. Les autres titres ne changent pas
      d'un caractère. Chaînes et commentaires trop longs sont coupés sans changer leur texte.
  - `docs/architecture-improvements/history/F05.md` : sous le tableau de la section « Fichiers », une
    ligne ajoutée dit le nouveau nom du fichier de test. Le reste de l'historique n'est pas réécrit.
- À ne pas toucher : le code de production ; les corps, assertions et aides des tests ; le journal posé
  par `before` et `after` ; les autres fichiers de test ; les tickets déjà terminés.
- Aucun test n'est déplacé vers un autre fichier : les quatre sujets partagent le journal du fichier et
  l'état du client Codex ; les séparer changerait ce que chaque processus de test partage.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande. « Commande des titres » désigne :

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/<fichier>.test.cjs \
  | grep -E '^ *(not )?ok [0-9]+ - ' | sed -E 's/^ *(not )?ok [0-9]+ - //; s/ # (SKIP|TODO).*$//' | sort
```

1. Avant toute modification, la commande des titres et `grep -cE '^\s*test\(' ` sont lancés sur
   `tests/architecture-f05.test.cjs` ; sorties conservées dans le dossier d'état du ticket
   (`.harness-state/tickets/<id>/`, hors Git), avec le résumé du lancement (`pass`, `fail`, `skipped`).
   À `0d5a954` : 15 titres, 15 déclarations. Si un ticket antérieur en a ajouté, les nombres relevés
   ici font foi pour les critères 3, 4 et 8.
2. `test -e tests/architecture-f05.test.cjs` échoue ;
   `test -e tests/codex-process-ownership.test.cjs` réussit.
3. `grep -cE '^\s*test\(' tests/codex-process-ownership.test.cjs` rend le nombre relevé au critère 1.
4. Après modification, la commande des titres sur `tests/codex-process-ownership.test.cjs` rend le
   même nombre de titres qu'au critère 1, sans doublon. Les seules différences sont les titres
   raccourcis, et chacun figure dans une table « ancien titre → nouveau titre » du journal.
5. `awk 'length($0) > 160' tests/codex-process-ownership.test.cjs | wc -l` rend 0.
6. `grep -ciE 'f05' tests/codex-process-ownership.test.cjs` rend 0 et
   `grep -c 'docs/adr/0005' tests/codex-process-ownership.test.cjs` rend au moins 1.
7. `grep -c 'codex-process-ownership.test.cjs' docs/architecture-improvements/history/F05.md` rend au
   moins 1.
8. `node --test --test-concurrency=1 tests/codex-process-ownership.test.cjs` : aucun échec, et les
   mêmes nombres de tests passés et sautés qu'au critère 1.
9. `node -e "import('./scripts/quality/metrics.mjs').then((m) => console.log(m.measure('.')))"` :
   `tests_nommes_par_chantier` vaut la valeur de `scripts/quality/baseline.json` moins 1 ;
   `cas_de_test` n'est pas sous sa valeur du plancher.
10. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants du fichier (15 à `0d5a954`), inchangés dans leur corps, dans
`tests/codex-process-ownership.test.cjs`. Frontières inchangées : le transport `CodexRpc` sur des
doubles de processus, le client Codex, puis les deux hôtes pour la révocation des contextes MCP.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un titre ne peut pas être raccourci sans perdre l'exigence qu'il
énonce, si `git mv` est refusé à la session, ou si un test échoue après le seul renommage : verdict
BLOQUÉ, avec le titre, le refus ou l'échec constaté.

## Journal
