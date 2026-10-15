---
id: T161
titre: Review a correction against the previous review, and escalate when a finding is not fixed
statut: termine
bloque_par: T160
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Aujourd'hui, chaque relecture après une correction est une relecture complète par un relecteur neuf. Il ne sait pas
ce qu'on lui a demandé de vérifier, relit tout le code, et trouve souvent de nouveaux constats mineurs sur du code que
la correction n'a pas touché. La correction suivante en appelle une autre, et le ticket tourne sans converger.

L'escalade arrive aussi trop tard. Une tentative peut enchaîner trois corrections sur le même palier. Un sujet trop dur
pour le modèle du palier coûte donc jusqu'à quatre relectures avant de monter d'un palier.

Après ce ticket, la première relecture d'une tentative reste complète. Chaque relecture suivante est une **relecture
de correction**. Le relecteur reçoit son rapport précédent et le diff exact entre l'état relu précédent et l'état
actuel. Il fait trois choses :
- il dit, pour chaque constat bloquant ou mineur du rapport précédent, s'il est corrigé ;
- il cherche les régressions dans le code que la correction a changé ;
- il classe un nouveau constat sur du code que la correction n'a pas touché « hors périmètre », comme réserve, sauf
  s'il est bloquant.

Une tentative compte deux corrections au plus. Un constat que la relecture de correction déclare non corrigé refuse la
tentative tout de suite : la boucle passe au palier suivant au lieu de redemander la même correction au même modèle.
Les deux moteurs suivent ces règles.

## Sources

- Décision du propriétaire, le 15/10 : faire converger les corrections. Une relecture de correction ne relit que ce qui
  a changé, et l'escalade se déclenche quand un constat revient.
- Constaté le 15/10 sur l'outil `watch-loop`, relu hors ticket :
  - cinq relectures complètes par des relecteurs neufs, avec chaque fois de nouveaux mineurs sur du code inchangé ;
  - la relecture de correction faite ensuite à l'essai a pris 4 minutes au lieu de 10, et elle a trouvé le seul
    défaut réel du tour, un débordement sur une section du README.
- T141 : une session de ticket ne reprend pas un relecteur. Le regard neuf est gardé : le relecteur de correction est
  un relecteur neuf, qui reçoit le rapport précédent et le diff, et non le précédent relecteur repris.
- Code concerné, à la version `39e6cfb` :
  - `scripts/loop/codex.mjs` : `review`, la boucle des corrections, `MAX_CORRECTIONS` ;
  - `scripts/loop/reviewed-state.mjs` : `record` (`revue-<n>.diff`, `revue-<n>.fichiers`, `reviewed-state.json`),
    `recordReview`, `reviewVerdict`, `lastReviewReport`, la commande `record` ;
  - `.claude/agents/relecteur.md` : ce que vérifie le relecteur et la forme de son rapport (`VERDICT : …`,
    `CONSTATS : …`) ;
  - `.claude/hooks/record-review.mjs` : lecture du verdict dans le rapport d'un relecteur Claude ;
  - `.claude/skills/ticket/SKILL.md`, étapes 5 et 6 (« Trois tours au plus ») ;
  - `.agents/skills/ticket-codex/SKILL.md`, section « Reprendre après une relecture » ;
  - `tests/ticket-loop.test.cjs`, `tests/agent-guards.test.cjs`, `tests/helpers/codex-session.cjs`.

## Périmètre

- À modifier :
  - `scripts/loop/reviewed-state.mjs` :
    - `record` garde une empreinte Git de l'état relu, fichiers nouveaux du ticket compris, sans toucher à l'index ni à
      l'arbre de travail (par exemple un index temporaire et `git write-tree`) ;
    - à partir du deuxième état relu d'un ticket, `record` écrit `revue-<n>.interdiff` : le diff entre l'état relu
      précédent et l'état actuel. La commande `record` en affiche le chemin ;
    - une fonction lit, dans un rapport de relecture de correction, la ligne `NON CORRIGÉS : <n>` ;
  - `scripts/loop/codex.mjs` :
    - à partir de la deuxième relecture d'une tentative, la consigne du relecteur nomme le rapport précédent
      (`relecture-<n>.md`) et `revue-<n>.interdiff`, et demande une relecture de correction ;
    - `MAX_CORRECTIONS` passe à 2 ;
    - une relecture de correction qui déclare au moins un constat non corrigé refuse la tentative sans nouvelle
      correction. La raison nomme le rapport et dit que la boucle passe au palier suivant. Une ligne `NON CORRIGÉS`
      absente ou illisible dans une relecture de correction compte comme un constat non corrigé ;
  - `.claude/agents/relecteur.md` : une section « Relecture de correction » avec les trois règles ci-dessus, et la ligne
    `NON CORRIGÉS : <n>` du rapport, juste après `CONSTATS : …`. Une relecture complète n'a pas cette ligne ;
  - `.claude/skills/ticket/SKILL.md` : le nouveau relecteur reçoit le rapport précédent et l'interdiff, deux tours au
    plus, et un constat non corrigé donne un verdict PARTIEL avec ce constat dans `reste` ;
  - `.agents/skills/ticket-codex/SKILL.md` : la limite de deux corrections et l'escalade sur un constat non corrigé ;
  - `docs/travail/README.md` : la relecture de correction et la nouvelle limite ;
  - les tests des critères, et le faux relecteur des tests s'il doit rendre une ligne `NON CORRIGÉS`.
- À ne pas toucher :
  - la première relecture d'une tentative, qui reste complète ;
  - le refus de reprendre un relecteur (T141) ;
  - `scripts/check.mjs`, `scripts/quality/`, le plancher du cliquet ;
  - le code du produit.

## Critères d'acceptation

1. Après deux `record` séparés par une correction, `revue-2.interdiff` contient le fichier modifié par la correction et
   un fichier nouveau qu'elle a créé, et aucun des fichiers qu'elle n'a pas touchés. `git status` et l'index sont les
   mêmes avant et après chaque `record`.
2. `run.mjs --engine codex`, avec le faux `codex` et un faux relecteur qui refuse puis accepte : la consigne de la
   deuxième relecture nomme `relecture-1.md` et `revue-2.interdiff`. Celle de la première ne nomme aucun interdiff.
3. Une relecture de correction qui rend `NON CORRIGÉS : 1` refuse la tentative sans troisième session Codex, avec une
   raison qui nomme le rapport. Avec `--attempts 2`, la tentative suivante démarre sur le palier suivant.
4. Une relecture de correction sans ligne `NON CORRIGÉS` refuse aussi la tentative.
5. Deux corrections refusées avec `NON CORRIGÉS : 0` refusent la tentative : aucune troisième correction n'est
   demandée.
6. Mutation temporaire : la boucle ignore la ligne `NON CORRIGÉS`. Le test du critère 3 échoue. La sortie rouge va au
   journal, puis la mutation est retirée.
7. Le flux Claude : ses tests existants passent sans changer d'assertion, en dehors de celles qui comptent trois tours,
   déclarées dans `ecarts.md`.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs`, frontière : `run.mjs --engine codex` dans le dépôt temporaire des tests, avec le faux
`codex` et un faux relecteur réglable ; la commande `record` de `reviewed-state.mjs` pour le critère 1. Les consignes
(`relecteur.md`, skills) ne se testent pas par leur texte : le relecteur de ce ticket les vérifie à la lecture.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Un relecteur neuf, avec le rapport et le diff, plutôt que le précédent repris.** Le regard neuf de T141 est gardé,
  et la relecture se concentre sur ce qui a changé.
- **Un bloquant reste possible partout.** Seuls les mineurs sur du code inchangé deviennent des réserves.
- **Une ligne `NON CORRIGÉS` absente compte comme un constat non corrigé.** Un rapport qui ne dit pas si la correction
  a tenu ne doit pas faire durer la tentative.
- **Niveau `standard`, proposé par l'orchestrateur le 15/10, comme T159 et T160** : Sol 6.1 high implémente, et Opus
  relit.
- **Pas d'ADR.** Ces règles complètent la boucle de relecture décrite par l'ADR 0012 et la skill `ticket`.

## Journal

### Exploration

- Lu les consignes, les standards, l'ADR 0012, les modules concernés, leurs appelants et leurs tests.
- `git status --short` et `git diff` : statut du ticket modifié par la boucle ; deux dossiers non suivis préexistants, hors périmètre.
- Le code actuel conserve trois corrections et des diffs contre HEAD. Les frontières du ticket restent applicables à e92c6a6.
- Plan et écarts consignés dans `.harness-state/tickets/T161/exploration.md` et `ecarts.md` ; aucun écart aux critères.

### États Git et relecture de correction

- `node --test --test-name-pattern='record interdiff' tests/ticket-loop.test.cjs` : rouge observé sur l'absence de `revue-2.interdiff` (sortie `red-interdiff.log`).
- `node --test --test-name-pattern='record interdiff|recording a review' tests/ticket-loop.test.cjs` : vert, 3 tests ; index réel identique octet par octet et statut Git inchangé, fichiers exclus absents, suppression et retour à HEAD couverts (`green-interdiff.log`).
- `node --test --test-name-pattern='correction reviewer receives' tests/ticket-loop.test.cjs` : rouge sur la consigne encore complète, puis vert après ajout du rapport précédent et de l'interdiff (`red-review-prompt.log`, `green-review-prompt.log`).

### Refus immédiat et limite

- `node --test --test-name-pattern='unresolved|correction count' tests/ticket-loop.test.cjs` : rouge, 7 assertions comportementales ; le compte était ignoré (`red-uncorrected.log`).
- `node --test --test-name-pattern='unresolved|correction count|correction reviewer receives|fresh guarded correction' tests/ticket-loop.test.cjs` : vert, 9 tests ; compte positif, absent ou illisible refuse immédiatement, rapport nommé, palier suivant et nouvelle relecture complète vérifiés (`green-uncorrected.log`).
- `node --test --test-name-pattern='exhaust two corrections' tests/ticket-loop.test.cjs` : rouge sur le palier resté identique après deux corrections (`red-correction-limit.log`).
- `node --test --test-name-pattern='exhaust two corrections|failed Claude reviewer' tests/ticket-loop.test.cjs` : vert, 2 tests après passage à deux corrections et actualisation du compte attendu (`green-correction-limit.log`).
- Le premier lancement de cette dernière commande a révélé que le faux relecteur en échec fournissait bien `NON CORRIGÉS : 0` : ses trois relectures correspondent donc à la limite de deux corrections. L'attendu a été corrigé, sans changer les assertions du flux Claude.
- Consignes du relecteur, des deux moteurs et documentation mises à jour dans le périmètre autorisé.

### Mutation et suite de boucle

- `node --test tests/ticket-loop.test.cjs` : vert, 140 tests, dont le flux Claude sans changement d'assertion (`ticket-loop.log`).
- Mutation temporaire de `codex.mjs` : remplacement du compte lu par `const uncorrected = 0;` ; `node --test --test-name-pattern='Codex escalates immediately' tests/ticket-loop.test.cjs` échoue sur son assertion de palier, code 1 (`mutation-uncorrected.log`) :

  ```text
  ✖ Codex escalates immediately after an unresolved correction and starts a complete review on the next rung
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
    assert.ok(calls[2].args.includes('model_reasoning_effort="xhigh"'))
  tests 1 ; pass 0 ; fail 1
  ```

- Mutation retirée dans un `finally` avant les contrôles finaux. La sortie du premier ajustement du compte des processus relecteurs est conservée dans `correction-limit-intermediate.log`.

### Contrôles finaux

- `node scripts/check.mjs --changed` : vert ; règles, format et cliquet verts, 140 tests JS réussis. ESLint non lancé : absent ou non configuré (`check-changed.log`). Ce contrôle après retrait de la mutation confirme le retour au vert.
- `git diff --check` : aucune erreur d'espacement.
- `node scripts/check.mjs` : vert ; règles, format et cliquet verts, 1 037 tests JS réussis dans 90 fichiers ; 84 tests Python, résultat OK avec un test ignoré. ESLint non lancé : absent ou non configuré (`check-full.log`).
- Verdict d'implémentation TERMINÉ écrit dans le dossier d'état ; les vérifications non exécutées sont signalées dans `reste`. Aucun commit ni push ; la boucle conserve la responsabilité de la relecture et de l'intégration.

### Reprise après relecture 1

- Rapport `.harness-state/tickets/T161/relecture-1.md`, ticket et journal, écarts, `git status --short` et `git diff` relus. Travail existant repris ; exploration et précision de reprise consignées dans le dossier d'état.
- Trois constats à corriger, sans contestation : reprise de `record`, chemins AD/RD dans l'index temporaire et complexité de `review`. L'ADR 0012 reste une réserve hors périmètre.
- `node --test --test-name-pattern='record recovers' tests/ticket-loop.test.cjs` : rouge sur les quatre assertions de réussite, puis vert (4 tests). États corrompu, ancien et absent reconstruits ; interdiff disponible dès l'enregistrement suivant (`red-record-recovery.log`, `green-record-recovery.log`).
- `node --test --test-name-pattern='Codex correction refuses a missing interdiff' tests/ticket-loop.test.cjs` : rouge (3 tests), exception `TypeError` observée au lieu du refus attendu (`red-correction-interdiff.log`).
- `node --test --test-name-pattern='Codex correction refuses a missing interdiff|complete Codex review can restart|correction reviewer receives' tests/ticket-loop.test.cjs` : vert (5 tests). Refus nommé sans nouveau relecteur, première relecture complète possible avec l'ancien état, consigne de correction conservée (`green-correction-interdiff.log`).
- Construction de la consigne extraite dans `reviewRequest`, ce qui retire ses branches de `review` (constat 3). Les tests passent par les processus de la boucle.
- `node --test --test-name-pattern='record accepts a staged path|record names add' tests/ticket-loop.test.cjs` : rouge (3 tests). Échecs AD et RD confirmés par Git ; le diagnostic affichait `--literal-pathspecs` (`red-record-deleted-staged.log`).
- `node --test --test-name-pattern='record accepts a staged path|record names add|record interdiff' tests/ticket-loop.test.cjs` : vert (4 tests). Arbres sans les cibles supprimées, index réel inchangé octet par octet, statut identique et diagnostic `add` vérifiés (`green-record-deleted-staged.log`).
- `node scripts/check.mjs --changed` : vert ; règles, format et cliquet conformes, 151 tests JS réussis (`check-changed-correction.log`).
- `node scripts/check.mjs` : vert ; 1 048 tests JS réussis dans 90 fichiers, 84 tests Python exécutés, résultat OK avec un test ignoré (`check-full-correction.log`). ESLint non lancé dans les deux contrôles : absent ou non configuré.
- Les trois constats dans le périmètre sont corrigés. L'ADR 0012 annonce toujours trois corrections : réserve hors périmètre du nouveau verdict, pour un ticket ultérieur. Aucun commit ni push ; l'état relu et la nouvelle relecture restent à la charge de la boucle.

### Reprise après relecture 2

- Consignes, rapport `.harness-state/tickets/T161/relecture-2.md`, ticket et journal, écarts, `git status --short` et `git diff` relus ; exploration et écarts précisés avant implémentation.
- Les quatre constats dans le périmètre seront corrigés, sans contestation. Les deux réserves (ADR 0012 et hook Claude) restent hors périmètre.

- `node --test --test-name-pattern='record recovers' tests/ticket-loop.test.cjs` : rouge observé sur les objets absent et de type blob (code 2 au lieu de 0) et sur la création du fichier par `--output=…` (`red-record-tree-recovery.log`). Le premier scénario de diff en échec ne changeait aucun contenu : Git rendait un diff vide sans appeler l'outil externe ; le scénario a été corrigé en ajoutant un fichier avant comparaison.
- `node --test --test-name-pattern='record recovers a diff-failure' tests/ticket-loop.test.cjs` : rouge sur le refus de `record` lorsque l'outil de diff externe échoue réellement (`red-record-diff-failure.log`).
- `node --test --test-name-pattern='record recovers|record accepts a staged path' tests/ticket-loop.test.cjs` : vert, 10 tests (`green-record-tree-recovery.log`). Identifiant validé avant Git, objet arbre vérifié, reconstruction sans interdiff en cas d'historique inutilisable ou de comparaison en échec ; reprise vérifiée par l'interdiff suivant.
- Constat 3 : les tests de reprise ne lisent plus les champs internes de l'état. Les scénarios AD/RD prouvent par les interdiffs suivants que les cibles supprimées et la source renommée étaient absentes de l'arbre relu ; statut et index réel restent vérifiés.
- `node --test --test-name-pattern='record includes a force-added|record names add' tests/ticket-loop.test.cjs` : rouge sur l'ajout ignoré déjà forcé dans l'index ; le test indépendant du diagnostic `add`, avec filtre Git local requis en échec, est vert (`red-record-ignored-staged.log`).
- `node --test --test-name-pattern='record includes a force-added|record names add|record recovers|record accepts a staged path|record interdiff' tests/ticket-loop.test.cjs` : vert, 13 tests après ajout de `-f` aux chemins sélectionnés (`green-record-relecture-2.log`). Le fichier forcé figure dans les diffs et interdiffs successifs ; le fichier ignoré non ajouté reste exclu ; index réel et statut inchangés.
- Constat 4 : tableau des fichiers d'état complété avec `revue-<n>.interdiff` et l'arbre Git conservé dans `reviewed-state.json`.

- `node scripts/check.mjs --changed` : vert, 156 tests JS réussis ; règles, format et cliquet conformes (`check-changed-relecture-2.log`). ESLint non lancé : absent ou non configuré.
- Preuve de mutation existante `mutation-uncorrected.log` relue et conservée ; la mutation n'a pas été réappliquée pendant cette reprise, qui ne change pas la logique d'escalade.

- `node scripts/check.mjs` : vert, 1 053 tests JS réussis dans 90 fichiers ; 84 tests Python exécutés, résultat OK avec un test ignoré (`check-full-relecture-2.log`). Règles, format et cliquet conformes ; ESLint non lancé, absent ou non configuré.
- `git diff --check` : aucune erreur d'espacement. Les quatre constats bloquant et mineurs de la relecture 2 sont corrigés ; aucun test du flux Claude n'a changé d'assertion pendant cette reprise.
- Nouveau verdict d'implémentation TERMINÉ écrit dans `.harness-state/tickets/T161/verdict.json`. Réserves : ADR 0012 annonçant trois corrections, hook Claude sans application mécanique de NON CORRIGÉS, et ESLint non lancé. Aucun commit ni push ; l'enregistrement de l'état relu et la nouvelle relecture restent à la charge de la boucle.

### Réserves à la clôture

- Relecture 2, constat 5 hors périmètre : docs/adr/0012-la-boucle-separe-codex-et-son-relecteur-claude.md annonce encore trois corrections ; à traiter dans un ticket ultérieur.
- Relecture 2, constat 6 hors périmètre : .claude/hooks/record-review.mjs enregistre reviewVerdict seul ; dans le flux Claude, NON CORRIGÉS repose encore sur la skill, sans application mécanique par le hook. À traiter dans un ticket ultérieur.
- ESLint non lancé par les contrôles : absent ou non configuré.
- .harness-state/tickets/T161/relecture-3.md : L'ADR 0012 annonce toujours trois corrections (`docs/adr/0012-la-boucle-separe-codex-et-son-relecteur-claude.md:20`)

  **Ce qui ne va pas.** L'ADR dit « dans la limite de trois corrections par tentative ». La boucle en autorise maintenant deux (`scripts/loop/codex.mjs:13`), et le README et les deux skills le disent. Le ticket ne liste pas l'ADR dans « À modifier » et précise « Pas d'ADR ».

  **Attendu.** Une réserve, à traiter dans un ticket ultérieur : nouvel ADR, ou ADR 0012 mis à jour.

  **Classe : hors périmètre.**
- .harness-state/tickets/T161/relecture-3.md : Dans le flux Claude, rien n'applique mécaniquement `NON CORRIGÉS` (`.claude/hooks/record-review.mjs:14`)

  **Ce qui ne va pas.** Le hook enregistre le verdict avec `reviewVerdict` seul. Une relecture de correction qui rendrait « accepté » avec `NON CORRIGÉS : 1`, ou sans cette ligne, serait enregistrée « accepté ». Côté Codex, le même rapport est enregistré « à corriger » et la tentative est refusée (`codex.mjs:193-195` et `:274-279`). Dans le flux Claude, la règle ne repose que sur la skill (`.claude/skills/ticket/SKILL.md:83-87`) et sur la consigne du relecteur. Le hook n'est pas dans « À modifier ».

  **Attendu.** Une réserve, à traiter dans un ticket ultérieur.

  **Classe : hors périmètre.**
- .harness-state/tickets/T161/relecture-3.md : **Écart accepté, critères 5 et 7.** Les tests Codex qui comptaient quatre relectures et trois corrections en comptent trois et deux. Les rapports attendus des relectures de correction contiennent `NON CORRIGÉS : 0`. Les deux changements suivent la nouvelle règle sans assouplir la preuve : épuisement, escalade et absence de commit restent vérifiés. Aucune assertion du flux Claude ne change.
- .harness-state/tickets/T161/relecture-3.md : **Écart accepté, critère 1 (précision).** Sans état précédent lisible et muni d'un arbre utilisable, `record` reconstruit l'état et omet seulement l'interdiff. Une relecture de correction Codex sans interdiff refuse alors la tentative en le disant. Le critère porte sur deux `record` séparés par une correction, et il est tenu.
