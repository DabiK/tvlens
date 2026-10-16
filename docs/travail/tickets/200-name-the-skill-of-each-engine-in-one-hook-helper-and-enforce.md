---
id: T200
titre: Name the skill of each engine in one hook helper and enforce NOT FIXED in the Claude review hook
statut: termine
bloque_par: T199
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les hooks choisissent la skill du moteur par une seule fonction partagée. Le flux Claude enregistre
« à corriger » pour une relecture de correction qui annonce un constat non corrigé, ou omet son compte.
Les consignes d'harmonisation décrivent aussi le dossier des skills Codex que les gardes ouvrent déjà.

## Sources

- Décision du propriétaire, le 16/10 : solder les réserves du harnais de T159, T160 et T161 après T199.
  T178 est une dépendance transitive. Rapports historiques lus en lecture seule :
  `/Users/Dabi/Documents/ISN/tvlens/.harness-state/tickets/T159/relecture-2.md`,
  `/Users/Dabi/Documents/ISN/tvlens/.harness-state/tickets/T160/relecture-1.md` (constat 2) et
  `/Users/Dabi/Documents/ISN/tvlens/.harness-state/tickets/T161/relecture-3.md`.
- Réserve d'harmonisation versionnée dans
  `docs/travail/tickets/160-keep-the-last-review-reserves-of-a-codex-ticket-and-start-its.md:277`
  et `:290`. La seconde relecture de T160 porte le doublon de constante ci-dessous et le doublon
  de `reste` ; ce dernier est traité par T199, pas par ce ticket.
- Code vérifié à `8340014`, modules et bancs lus en entier :
  - `.claude/hooks/session-context.mjs:11` et `.claude/hooks/stop-gate.mjs:59` recopient la sélection
    moteur/skill. `.claude/hooks/lib.mjs:7` centralise déjà d'autres fonctions de hooks ;
  - `.claude/hooks/record-review.mjs:11` accepte les deux formes de réponse du sous-agent et `:14`
    appelle uniquement `reviewVerdict`, sans contrôler `NON CORRIGÉS` ;
  - `scripts/loop/reviewed-state.mjs:155` lit le verdict ; `:164` fournit déjà `uncorrectedFindings`,
    où une ligne absente ou non entière vaut un constat. `scripts/loop/codex.mjs:231` l'applique
    aux seules corrections et `:312` refuse alors la tentative ;
  - `.claude/skills/ticket/SKILL.md:61` demande explicitement une relecture de correction avec le
    rapport et l'interdiff. Sa première relecture de chaque tentative est complète, même si d'autres
    rapports existent déjà dans le dossier. L'harmonisation fait des relectures complètes ;
  - `scripts/loop/harness-scopes.mjs:8` ouvre déjà `.agents/skills/` ; les exclusions sont à `:14`.
    `.claude/agents/harmoniseur.md:9` et `:30`, `.claude/skills/harmonisation/SKILL.md:17` ne décrivent
    encore que les deux dossiers Claude ;
  - `tests/agent-guards.test.cjs:223` couvre l'enregistrement, `:386` les messages selon le moteur,
    `:192` la portée Codex. `tests/ticket-loop.test.cjs:2222` et `:2258` protègent le refus Codex ;
    `:880` protège l'intégration d'une skill Codex par l'harmonisation.
- `scripts/loop/run.mjs:311` à `:322` recopie `untracked-before.json` et sa lecture ;
  `scripts/loop/reviewed-state.mjs:16` définit déjà `UNTRACKED_BEFORE` et `:63`
  `readUntrackedBefore`. Garder le contrôle d'identité en mémoire, pas une seconde constante.
- Précision vieillie du plan, vérifiée : `docs/adr/0012-la-boucle-separe-codex-et-son-relecteur-claude.md:20`
  dit déjà « deux corrections par tentative », comme `scripts/loop/codex.mjs:13`. La réserve historique
  sur les trois corrections n'est donc plus à corriger dans ce worktree. `adr: non` : aucune nouvelle
  décision d'architecture n'est nécessaire pour appliquer les règles déjà écrites.

## Périmètre

- Modifier `.claude/hooks/lib.mjs`, `session-context.mjs`, `stop-gate.mjs`, `record-review.mjs`,
  `scripts/loop/run.mjs`, `scripts/loop/reviewed-state.mjs`, les deux consignes d'harmonisation citées,
  `tests/reviewed-state.test.cjs`, `tests/agent-guards.test.cjs` et les scénarios nécessaires
  de `tests/ticket-loop.test.cjs`. Réutiliser le lecteur de compte de `reviewed-state.mjs` ; une
  factorisation minimale de la règle commune y est permise si les deux moteurs l'exercent.
- Réutiliser la constante et le lecteur de `reviewed-state.mjs` dans `untrackedListChange`,
  en conservant les diagnostics absent/illisible/modifié et la comparaison à la référence en mémoire.
  Le doublon de `reste` est corrigé par T199 ; aucune seconde extraction n'est ajoutée ici.
- Reconnaître le type de relecture par la demande explicite reçue par le hook, conformément à la
  skill ticket ; figer la formule de demande de correction dans cette skill. Ne pas déduire « correction »
  du seul rang du rapport, de l'existence d'un interdiff ou de la présence de `NON CORRIGÉS` dans sa réponse.
- Décrire les trois dossiers de consignes dans les deux documents d'harmonisation, descriptions
  comprises. Conserver les exclusions des arbitres et la limite propre des tours d'harmonisation.
- Ne changer ni les définitions de hooks, ni les permissions, ni les paliers, ni les limites de
  corrections. L'ADR 0012 déjà exact reste inchangé. `harnais: oui` est limité à ce périmètre.

## Critères d'acceptation

1. Les tests des deux hooks exercent la même sélection : Codex explicite, y compris avec une racine
   Claude présente ; Codex implicite sans cette racine ; Claude avec sa racine. Le démarrage et le refus
   d'un verdict manquant nomment la bonne skill, en boucle comme en interactif lorsque le message existe.
   Le témoin `{ session, run }` et le comportement de Stop restent couverts.
2. Pour une demande explicite de relecture de correction, le vrai hook reçoit un rapport « accepté »
   et zéro constat bloquant/mineur. Avec `NON CORRIGÉS : 1`, ligne absente ou valeur illisible, il écrit
   « à corriger » dans `relectures.jsonl`, en conservant intégralement le rapport et son modèle.
   Avec `NON CORRIGÉS : 0`, il conserve « accepté ». Couvrir `handbackReport.text` et `content`.
3. Une relecture complète sans cette ligne peut être acceptée, y compris après une tentative précédente
   et pendant une harmonisation. Le test distingue explicitement ce cas d'une correction sans ligne.
   Les rapports illisibles et les verdicts comptant un bloquant ou un mineur ne deviennent jamais acceptés.
4. Un scénario du faux Claude dans `tests/ticket-loop.test.cjs` passe par le hook, rend TERMINÉ malgré
   une correction non résolue, puis se voit refuser l'intégration. Aucun commit de ce changement n'est
   produit. Le scénario résolu s'intègre ; le flux Codex garde ses refus et son escalade existants.
5. Les deux consignes énumèrent `.claude/skills/`, `.claude/agents/` et `.agents/skills/` avec les mêmes
   exclusions que la portée. Les tests de gardes et de boucle continuent de refuser les arbitres et
   les contrôles, et d'accepter une skill Codex. Le journal constate que l'ADR dit déjà deux corrections.
6. Les cas de liste initiale absente, illisible ou modifiée restent refusés avec les mêmes
   diagnostics ; une liste identique passe. Les tests du lecteur partagé et de la vraie boucle
   prouvent ces cas, sans comparaison du texte source.
7. À l'implémentation, `node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs`,
   complétés par `tests/reviewed-state.test.cjs`, puis `node scripts/check.mjs`, sont verts.
   Pas de test de forme du source pour prouver les hooks.

## Test d'acceptation attendu

`tests/agent-guards.test.cjs` exécute les vrais hooks par leur entrée JSON et observe leurs sorties et
fichiers enregistrés. `tests/ticket-loop.test.cjs` prouve le refus final par la vraie boucle et ses
processus factices ; le faux Codex de `tests/helpers/codex-session.cjs` reste la preuve de non-régression
de l'autre moteur. Aucun appel à Claude ou Codex réel n'est requis.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La règle de refus existe déjà dans les consignes ; le ticket la rend mécanique côté Claude. Il ne
prétend pas que le hook, à lui seul, peut empêcher un orchestrateur de lancer un autre sous-agent :
il doit empêcher une correction non résolue d'être enregistrée comme acceptée et intégrée.

## Journal

### Exploration

Lecture des consignes, hooks, lecteurs d’état, boucle et bancs concernés ; état initial limité au statut du ticket et aux deux dossiers personnels non suivis. Le hook Claude ignore encore le compte des corrections ; la portée des skills Codex est déjà ouverte. L’ADR 0012 dit déjà « deux corrections par tentative » et reste inchangé. Exploration et absence d’écart consignées dans `.harness-state/tickets/T200/`.

### Hook de correction

- `node --test --test-concurrency=1 --test-name-pattern='review hook enforces' tests/agent-guards.test.cjs` : rouge observé, six acceptations indues sur les assertions (compte positif, absent ou illisible dans les deux formats). Sortie : `hook-red.log`.
- `node --test --test-concurrency=1 --test-name-pattern='review hook enforces|resolved correction|complete review after' tests/agent-guards.test.cjs` : vert, 14 cas. Sortie : `hook-green.log`.
- `node --test --test-concurrency=1 --test-name-pattern='Claude cannot integrate|complete Claude review after' tests/ticket-loop.test.cjs` : vert, 5 cas. La vraie boucle refuse les corrections non résolues malgré TERMINÉ, sans commit ; le compte zéro et une nouvelle tentative complète s’intègrent dans les dépôts jetables. Sortie : `loop-correction-green.log`.
- `node --test --test-concurrency=1 tests/reviewed-state.test.cjs` : vert, 27 cas, lecteur partagé et comptes conservateurs. Sortie : `reader-green.log`.

Les sorties citées sont conservées dans `.harness-state/tickets/T200/`. La sélection moteur/skill est extraite dans un helper ; les consignes décrivent les trois dossiers et gardent les exclusions et les trois tours propres à l’harmonisation.

### Régressions ciblées

`node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs tests/reviewed-state.test.cjs` : vert, 282 tests, zéro échec (`targeted.log`). Les refus de liste initiale absente/illisible/modifiée et les refus/escalades Codex existants passent. Deux cas complémentaires prouvent ensuite la réécriture identique de la liste initiale pour les deux moteurs ; ils sont inclus dans les contrôles suivants.

`node scripts/check.mjs --changed --no-tests` : règles, format, lint, gel et cliquet verts (`static.log`) ; aucun test lancé par cette commande.

### Contrôle des fichiers modifiés

`node scripts/check.mjs --changed` : vert, règles, format, lint, gel, cliquet et 284 tests JS réussis, zéro échec (`check-changed.log`). Les deux cas de liste identique passent. Le plancher du cliquet n’est pas modifié à la main.

### Contrôle complet et remise à la boucle

`node scripts/check.mjs` : vert, règles, format, lint, gel et cliquet ; 2 017 tests JavaScript sur 128 fichiers, zéro échec ; 22 tests Python réussis (`check-full.log`). `git diff --check` est également vert.

Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T200/verdict.json`. Aucun écart ni réserve propre à l’implémentation. Aucun commit ni push ; relecture et intégration laissées à la boucle. Les dossiers personnels non suivis sont préservés.

### Reprise après la première relecture

Rapport `relecture-1.md`, ticket, journal, écarts, `git status` et `git diff` relus. Les deux constats
mineurs sont acceptés : préciser les diagnostics attendus dans les tests de la vraie boucle et rétablir
les apostrophes droites de l'agent harmoniseur. Exploration et absence d'écart consignées avant correction.

### Preuves rouges des diagnostics

Les assertions sont renforcées avant toute autre correction : suppression de la liste → « est absent »,
ajout ou retrait d'une entrée → « a été modifié depuis le démarrage », corruption → « est illisible »
en début de ligne, pour distinguer la porte du diagnostic secondaire de l'état relu.

- `node .harness-state/tickets/T200/correction-diagnostic-mutations.cjs` : dans une copie jetable,
  retrait de la branche `before.missing` ; les deux tests Claude et Codex échouent bien sur l'assertion
  « est absent », avec « a été modifié » reçu (`correction-missing-red.log`, tests : code 1).
  Le script de collecte s'est ensuite arrêté parce qu'il attendait le résumé TAP alors que Node rendait
  le format spec ; son lecteur de résumé a été corrigé, sans relancer ces deux tests.
- `node .harness-state/tickets/T200/correction-diagnostic-mutations.cjs unreadable` : dans une seconde
  copie jetable, retrait de la branche `before.unreadable` ; un échec sur l'assertion ancrée est observé,
  bien que le diagnostic secondaire reste dans le rapport (`correction-unreadable-red.log`, tests : code 1,
  collecte des résultats attendus : code 0). Les copies sont supprimées ; aucun code de production muté dans l'arbre.

Les deux apostrophes droites de `.claude/agents/harmoniseur.md` sont rétablies et vérifiées par
`rg -n "l'harmonisation" .claude/agents/harmoniseur.md` (lignes 3 et 10). Aucun test de texte source ajouté.

### Régressions de la correction

`node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs tests/reviewed-state.test.cjs` :
vert, 284 tests réussis, zéro échec (`correction-targeted.log`). Les diagnostics précis passent dans la
vraie boucle et les autres critères du ticket restent couverts. `git diff --check` est vert.

`node scripts/check.mjs --changed` : vert, règles, format, lint, gel, cliquet et 284 tests JS réussis,
zéro échec (`correction-check-changed.log`). Le plancher du cliquet reste inchangé.

### Contrôle complet après correction et nouveau verdict

`node scripts/check.mjs` : vert, règles, format, lint, gel et cliquet ; 2 017 tests JavaScript réussis
sur 128 fichiers, zéro échec, puis 22 tests Python réussis (`correction-check-full.log`).

Les deux constats mineurs de `relecture-1.md` sont corrigés. Nouveau verdict `TERMINÉ` dans
`.harness-state/tickets/T200/verdict.json`, sans réserve propre ni écart. Aucun commit ni push ;
la boucle garde la responsabilité de la relecture et de l'intégration.
