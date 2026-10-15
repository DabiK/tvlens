---
id: T158
titre: Run a ticket with Codex, reviewed by Claude, through the loop
statut: termine
bloque_par:
adr: oui
installe: non
harnais: oui
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Aujourd'hui, `node scripts/loop/run.mjs` ne sait lancer que Claude Code (`claude -p`). Après ce ticket,
`node scripts/loop/run.mjs --engine codex` traite un ticket avec l'agent Codex d'OpenAI (`codex exec`), et le fait
relire par le relecteur Claude, sur Opus, comme aujourd'hui. Sans `--engine`, rien ne change : le moteur par défaut
reste Claude.

Le moteur Codex n'a pas les sous-agents Claude. C'est donc la boucle qui orchestre :
1. une session Codex explore et implémente, tests d'abord ;
2. la boucle enregistre l'état relu et lance une relecture Claude séparée, avec l'agent `relecteur` ;
3. si la relecture demande des corrections, la boucle reprend la même session Codex en lui passant les constats ;
4. puis les contrôles de la boucle, inchangés.

## Sources

- Décision du propriétaire, le 15/10 : faire travailler Codex dans ce dépôt, à travers le harnais, sur de vrais
  tickets. Pour l'instant, le relecteur reste Claude Opus.
- Recherche du 15/10 sur Codex CLI 0.162.1 (documentation officielle et `--help`), vérifiée sur ce Mac :
  - `codex exec --json` écrit du JSONL sur stdout. Les événements sont `thread.started` {thread_id}, `turn.started`,
    `item.started` / `item.completed` {item}, `turn.completed` {usage: input_tokens, cached_input_tokens,
    output_tokens, reasoning_output_tokens}, `turn.failed` {error}, `error`. Les items sont `agent_message` {text},
    `command_execution` {command, aggregated_output, exit_code, status}, `file_change` {changes[{path, kind}],
    status}, `todo_list`. Le flux ne donne aucun coût en dollars.
  - Une session réelle lancée ce soir a écrit exactement ces lignes.
  - `codex exec` attend stdin s'il n'est pas fermé (« Reading additional input from stdin… ») : le lancer avec stdin
    ignoré.
  - Options utiles : `-m <modèle>`, `-c model_reasoning_effort="<effort>"`, `-s workspace-write`,
    `-c approval_policy="never"`, `-c sandbox_workspace_write.network_access=true` (sans lui, les tests qui ouvrent un
    port local peuvent échouer), `-C <racine>`, `--ignore-user-config` (la config de l'utilisateur est en
    `danger-full-access` avec dix serveurs MCP ; il faut l'écarter), `--dangerously-bypass-hook-trust` (sinon un hook
    de projet non approuvé est ignoré en silence), `-o <fichier>` (dernier message).
  - Reprise : `codex exec resume <thread_id> "<message>"`. Elle n'accepte ni `-s` ni `-C` : il faut repasser le bac à
    sable par `-c sandbox_mode="workspace-write"` et lancer le processus dans la racine. Ne pas utiliser `--ephemeral`,
    qui rend la reprise impossible.
  - Sous `workspace-write`, `.git`, `.codex` et `.agents` sont en lecture seule : la session ne peut ni committer ni
    modifier ses propres hooks.
  - Hooks Codex : `<racine>/.codex/hooks.json`, même forme que les hooks de `.claude/settings.json`. `PreToolUse`
    refuse avec `hookSpecificOutput.permissionDecision: "deny"`, ce que fait déjà `.claude/hooks/lib.mjs`. L'outil
    d'édition s'appelle `apply_patch` (alias `Edit`, `Write`), et son entrée est `tool_input.command`, le texte du
    patch (`*** Add File: <chemin>`, `*** Update File: <chemin>`, `*** Delete File: <chemin>`, `*** Move to:
    <chemin>`), pas un `file_path`. Le shell s'appelle `Bash`. Un hook en erreur laisse passer l'appel : les contrôles
    de la boucle restent le dernier mur.
  - Codex lit `AGENTS.md`, pas `CLAUDE.md`.
- Correspondance des modèles, d'après Terminal-Bench 4.0, DeepSWE et SWE-bench Pro, à calibrer sur de vrais tickets :
  - palier 0, Sonnet 5.5 high → `gpt-6.1-sol` high ;
  - palier 1, Opus 5.5 high → `gpt-6-astra` high ;
  - palier 2, Opus 5.5 xhigh → `gpt-6-astra` xhigh ;
  - palier 3, Fable 5.1 high → `gpt-6-astra` max.
- Code concerné, à la version `1385aae` :
  - `scripts/loop/run.mjs` :
    - options (l. 30-55) ;
    - `streamSession` (l. 173-218), `actions` (l. 147-163), `sessionReport` (l. 127-145) : lecture du flux Claude ;
    - `sessionPlan` (l. 220-225), `launchSession` (l. 238-272), `runSession` (l. 274-290) ;
    - `readVerdict` (l. 292-300), `gates` (l. 302-327), `integrate` (l. 375-391), `processTicket` (l. 402-446) ;
    - `--dry-run` ;
  - `scripts/loop/models.mjs` : `LADDER`, `LEVELS`, `plan`, `displayName` ;
  - `scripts/loop/reviewed-state.mjs` : `record`, `reviewVerdict`, `recordReview` (qui écrit aussi
    `relecture-<n>.md`), `unreviewedChange`, `unacceptedReview` ;
  - `.claude/agents/relecteur.md` : le relecteur, qui rend `VERDICT : …` puis `CONSTATS : …` ;
  - `.claude/skills/ticket/SKILL.md` : la marche d'un ticket côté Claude (exploration, écarts déclarés avant
    l'implémentation, tests vus rouges, journal, verdict) ;
  - `.claude/hooks/guard-write.mjs`, `guard-bash.mjs`, `lib.mjs` ;
  - `tests/ticket-loop.test.cjs` : fausse session (`FAKE_SESSION`, choisie par `TVLENS_CLAUDE_BIN`) ;
  - `tests/agent-guards.test.cjs`.
- `claude --help` : `--agent <agent>` lance la session comme cet agent (ici `relecteur`).

## Périmètre

- À modifier :
  - `scripts/loop/run.mjs` :
    - option `--engine claude|codex`, `claude` par défaut. Toute autre valeur est refusée au démarrage ;
    - `--dry-run` dit le moteur et le modèle de chaque palier ;
    - avec `--engine codex`, la tentative passe par le nouveau module (ci-dessous) au lieu de `runSession`. Le reste
      ne change pas : la tentative refusée monte d'un palier, puis viennent `gates`, `integrate`, la rétrospective et
      l'harmonisation, qui restent sur Claude ;
  - un nouveau module `scripts/loop/codex.mjs`, qui ne dépend pas de `run.mjs` :
    - lancement de `codex exec --json` avec, au minimum : `-m`, l'effort, `-s workspace-write`,
      `-c approval_policy="never"`, `-c sandbox_workspace_write.network_access=true`, `--ignore-user-config`,
      `--dangerously-bypass-hook-trust`, `-C <racine>`, et stdin ignoré. Le binaire se choisit par
      `TVLENS_CODEX_BIN` (défaut `codex`). Les variables `TVLENS_LOOP`, `TVLENS_TICKET`, `TVLENS_TICKET_FILE`,
      `TVLENS_HARNESS` et `TVLENS_ALLOW_INSTALL` sont passées comme pour Claude. Le flux est copié dans
      `.harness-state/tickets/<ID>/codex-<tentative>.jsonl` ;
    - la consigne de la session : traiter le ticket en suivant `.agents/skills/ticket-codex/SKILL.md` ;
    - lecture du flux : une ligne affichée par `command_execution` et par `file_change` terminés, au format des
      actions de `run.mjs` ; `thread_id` ; somme des jetons des `turn.completed` ; nombre de tours ; durée mesurée par
      la boucle ; `turn.failed` ou `error` rendent la session en échec ;
    - après la session : la boucle enregistre l'état relu (`record` de `reviewed-state.mjs`). Elle lance ensuite le
      relecteur Claude : `claude -p --agent relecteur --model <relecteur> --output-format json --strict-mcp-config`,
      avec une consigne qui nomme le ticket, `revue-<n>.diff` et `revue-<n>.fichiers`. Le modèle est celui du
      relecteur pour ce palier (`plan(…).reviewModel`, donc au moins Opus pour un ticket standard). Puis elle lit le
      texte du rapport, en tire le verdict avec `reviewVerdict` et l'enregistre avec `recordReview` ;
    - si le verdict est « à corriger » ou « illisible » : reprise de la même session Codex
      (`codex exec resume <thread_id>`, avec les mêmes réglages passés par `-c`), avec le rapport complet du relecteur,
      puis nouvel enregistrement et nouvelle relecture. Trois corrections au plus, constante nommée. Au-delà, la
      tentative est refusée avec le dernier rapport ;
    - la session écrit elle-même `verdict.json` (`statut`, `resume`, `preuves`, `reste`), comme côté Claude. La boucle
      ne le réécrit pas ;
    - événements : `session` avec `moteur: "codex"`, et `session-terminee` avec `jetons`, `tours`, `duree_s`,
      `relectures` et `cout_usd: null` ;
  - `scripts/loop/models.mjs` : une échelle Codex, `CODEX_LADDER`, de même longueur que `LADDER`, avec les quatre
    paliers des Sources. `plan` sait rendre le palier de l'un ou l'autre moteur. `displayName` rend « Codex (GPT-6.1
    Sol) » pour `gpt-6.1-sol` et « Codex (GPT-6 Astra) » pour `gpt-6-astra`. La ligne `Co-Authored-By` d'un commit
    Codex utilise ce nom et `noreply@openai.com` ;
  - créer `.agents/skills/ticket-codex/SKILL.md` : la marche d'un ticket pour Codex, tirée de
    `.claude/skills/ticket/SKILL.md` sans les sous-agents :
    - lire `AGENTS.md`, le ticket et le code cité ;
    - écrire les écarts dans `.harness-state/tickets/<ID>/ecarts.md` avant d'implémenter ;
    - tests d'abord, suivant `.claude/skills/tests/SKILL.md`, chaque test vu rouge ;
    - un jalon de journal par étape, dans le ticket ;
    - ne pas lancer de relecteur, ne pas committer : la boucle s'en charge ;
    - à la reprise après une relecture, corriger chaque constat bloquant et mineur ;
    - avant de rendre la main, `node scripts/check.mjs` en entier, puis `verdict.json` ;
  - créer `AGENTS.md` : un lien symbolique vers `CLAUDE.md`, pour une seule source de consignes. Ajouter à
    `CLAUDE.md`, section « Ce qui ne se fait pas », `.codex/` et `.agents/` à la liste du harnais ;
  - créer `.codex/hooks.json`. `PreToolUse` sur `apply_patch|Edit|Write` appelle `guard-write.mjs`, et `PreToolUse`
    sur `Bash` appelle `guard-bash.mjs`, avec des chemins de commande qui ne dépendent pas de `CLAUDE_PROJECT_DIR`
    (`git rev-parse --show-toplevel`) ;
  - `.claude/hooks/guard-write.mjs` : sans `tool_input.file_path`, lire les chemins dans le texte du patch
    (`tool_input.command`) et appliquer la même règle à chacun. Un seul chemin protégé suffit à refuser ;
  - `.claude/hooks/guard-write.mjs`, `PROTECTED`, et `scripts/loop/run.mjs`, sa liste des chemins du harnais :
    ajouter `.codex/`, `.agents/` et `AGENTS.md` ;
  - un ADR, `docs/adr/` (numéro suivant) : la boucle orchestre explorateur-implémenteur et relecteur en processus
    séparés pour Codex, pourquoi, et ce que cela change par rapport au flux Claude ;
  - `docs/travail/README.md` : l'option, le flux Codex, les réglages imposés, la reprise, l'échelle Codex, les limites
    (pas de coût en dollars, hooks qui échouent ouverts) ;
  - `tests/ticket-loop.test.cjs` : un faux `codex` (choisi par `TVLENS_CODEX_BIN`), qui écrit le flux JSONL et joue un
    scénario par variable d'environnement ; un mode relecteur du faux `claude`, reconnu à `--agent relecteur`, qui rend
    une suite de rapports choisie par le test ; les tests des critères 1 à 6 ;
  - `tests/agent-guards.test.cjs` : le test du critère 7.
- À ne pas toucher :
  - le flux Claude par défaut, sans `--engine` : les tests existants de la boucle passent sans changer d'assertion ;
  - `scripts/check.mjs`, `scripts/quality/` et le plancher du cliquet. `cas_de_test` peut monter, jamais baisser ;
  - la rétrospective et l'harmonisation, qui restent sur Claude ;
  - le code du produit.

## Critères d'acceptation

1. Avec `--engine codex --no-push`, un ticket dont la relecture est acceptée du premier coup est intégré. Le test le
   vérifie ainsi :
   - le faux `codex` a reçu `exec --json`, `-s workspace-write`, `-c approval_policy="never"`, `--ignore-user-config`,
     le modèle et l'effort du palier 0 de `CODEX_LADDER`, et un stdin fermé ;
   - le faux relecteur a reçu `--agent relecteur` et un modèle Opus ;
   - `relectures.jsonl` contient « accepté » ;
   - le commit porte `Co-Authored-By: Codex (GPT-6.1 Sol) <noreply@openai.com>`.
2. Une relecture « à corriger », puis une « acceptée » : le faux `codex` a été repris avec `resume`, le `thread_id` du
   flux et le texte du premier rapport. Deux relectures sont enregistrées, et le ticket est intégré.
3. Quatre relectures « à corriger » de suite : la tentative est refusée après trois corrections. La tentative suivante
   tourne sur le palier 1 de `CODEX_LADDER`.
4. Une session Codex qui modifie `scripts/check.mjs` dans un ticket sans `harnais` est refusée par `gates`, comme
   pour Claude.
5. `--dry-run --engine codex` affiche le moteur et le modèle de chaque palier. `--engine autre` est refusé au
   démarrage.
6. Sans `--engine`, tous les tests existants de `tests/ticket-loop.test.cjs` passent sans modification d'assertion.
7. `guard-write.mjs`, en mode boucle, avec une entrée Codex (`tool_name: "apply_patch"`, `tool_input.command` =
   patch) :
   - refuse un patch qui touche `scripts/check.mjs`, ou `.codex/hooks.json`, ou un fichier normal et
     `scripts/loop/run.mjs` à la fois ;
   - accepte un patch qui ne touche que `core/`.
8. `AGENTS.md` est un lien symbolique qui se résout vers `CLAUDE.md`, et `.codex/hooks.json` est un JSON valide qui
   déclare les deux hooks.
9. Mutation temporaire : la reprise ne transmet plus le rapport du relecteur. Le test du critère 2 échoue ; la sortie
   rouge va au journal, puis la mutation est retirée.
10. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs`, frontière : `scripts/loop/run.mjs --engine codex` lancé dans le dépôt temporaire des
tests (`tests/helpers/harness-repo.cjs`), avec un faux `codex` et un faux relecteur `claude`, comme la fausse session
d'aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **La boucle orchestre, pas la session.** Les sous-agents Codex héritent du bac à sable de leur parent et n'ont pas
  de liste d'outils : un relecteur en lecture seule ne s'impose pas à l'intérieur d'une session qui écrit. Un
  relecteur lancé à part par la boucle est indépendant de l'implémenteur par construction.
- **Relecteur Claude.** C'est la décision du propriétaire, pour juger Codex avec le même arbitre que Claude.
- **Les réglages de sûreté en ligne de commande, pas dans `.codex/`.** La config de l'utilisateur ouvre tout, et un
  hook non approuvé ou en erreur laisse passer. Les contrôles de la boucle restent le dernier mur.
- **Pas de coût en dollars côté Codex.** Le flux ne le donne pas. Les jetons sont enregistrés, et le coût reste vide
  plutôt qu'inventé.

## Journal

### Cadrage et exploration

Commandes : `git status --short --branch`, lectures par `cat` et `sed` du ticket, des consignes,
des sources citées, de leurs tests et des appelants ; `codex exec --help`, `codex exec resume --help`.
Résultat : branche `feat/codex-engine`, arbre initialement propre ; options CLI confirmées par les aides.
Le moteur Codex peut réutiliser l'enregistrement d'état relu sans modifier ses fonctions.
Les contrôles et l'intégration restent communs ; rétrospective et harmonisation restent sur Claude.
Les hooks doivent examiner tous les chemins du patch, destinations de déplacement comprises.
Rapport : `.harness-state/tickets/T158/exploration.md` ; écarts déclarés dans `ecarts.md` avant implémentation.

### engine-dry-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='a Codex dry run' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, voir sortie.
Sortie : `.harness-state/tickets/T158/engine-dry-red.log`.

### engine-dry-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='a Codex dry run' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, voir sortie.
Sortie : `.harness-state/tickets/T158/engine-dry-green.log`.

### engine-invalid-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='an unknown engine' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, voir sortie.
Sortie : `.harness-state/tickets/T158/engine-invalid-red.log`.

### engine-invalid-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='an unknown engine' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, voir sortie.
Sortie : `.harness-state/tickets/T158/engine-invalid-green.log`.

### baseline

Commande : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs`.
Résultat observé : code 0, voir sortie.
Sortie : `.harness-state/tickets/T158/baseline.log`.

### codex-first-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='a Codex ticket accepted' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, voir sortie.
Sortie : `.harness-state/tickets/T158/codex-first-red.log`.

### codex-first-assertion-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='a Codex ticket accepted' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, voir sortie.
Sortie : `.harness-state/tickets/T158/codex-first-assertion-red.log`.

### codex-first-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='a Codex ticket accepted' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, voir sortie.
Sortie : `.harness-state/tickets/T158/codex-first-green.log`.

### codex-resume-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex resumes the same thread' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 558.01825.
Sortie : `.harness-state/tickets/T158/codex-resume-red.log`.

### codex-resume-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex resumes the same thread' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 763.506708.
Sortie : `.harness-state/tickets/T158/codex-resume-green.log`.

### codex-correction-limit-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='four rejected Codex' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 762.993958.
Sortie : `.harness-state/tickets/T158/codex-correction-limit-red.log`.

### codex-correction-limit-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='four rejected Codex' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 985.667042.
Sortie : `.harness-state/tickets/T158/codex-correction-limit-green.log`.

### codex-gates-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='a Codex session that edits' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 695.182375.
Sortie : `.harness-state/tickets/T158/codex-gates-red.log`.

### codex-gates-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='a Codex session that edits' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 808.003958.
Sortie : `.harness-state/tickets/T158/codex-gates-green.log`.

### codex-protected-paths-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='the loop protects Codex' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 732.622292.
Sortie : `.harness-state/tickets/T158/codex-protected-paths-red.log`.

### codex-protected-paths-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='the loop protects Codex' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 1971.235583.
Sortie : `.harness-state/tickets/T158/codex-protected-paths-green.log`.

### patch-guard-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='a Codex patch is refused' tests/agent-guards.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 145.819667.
Sortie : `.harness-state/tickets/T158/patch-guard-red.log`.

### patch-guard-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='a Codex patch is refused' tests/agent-guards.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 261.146875.
Sortie : `.harness-state/tickets/T158/patch-guard-green.log`.

### codex-config-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex loads the shared' tests/agent-guards.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 29.054833.
Sortie : `.harness-state/tickets/T158/codex-config-red.log`.

### codex-config-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex loads the shared' tests/agent-guards.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 29.35925.
Sortie : `.harness-state/tickets/T158/codex-config-green.log`.

### Configuration refusée par le bac à sable

Commandes : `mkdir -p .codex .agents/skills/ticket-codex`, `ln -s CLAUDE.md AGENTS.md`.
Résultat réel : `Operation not permitted` pour `.codex` et `.agents` ; lien AGENTS.md créé.
Le test de configuration reste rouge ; la sortie nommée `codex-config-green.log` est un essai
infructueux, pas une preuve verte. Préparation des contenus manquants dans le dossier d'état.

### codex-fixed-model-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='a fixed Codex model' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 747.410208.
Sortie : `.harness-state/tickets/T158/codex-fixed-model-red.log`.

### codex-fixed-model-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='a fixed Codex model' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 721.637584.
Sortie : `.harness-state/tickets/T158/codex-fixed-model-green.log`.

### codex-cost-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex usage remains unknown' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 849.532125.
Sortie : `.harness-state/tickets/T158/codex-cost-red.log`.

### codex-cost-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex usage remains unknown' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 785.943667.
Sortie : `.harness-state/tickets/T158/codex-cost-green.log`.

### codex-actions-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex prints a single' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 870.857333.
Sortie : `.harness-state/tickets/T158/codex-actions-red.log`.

### codex-actions-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex prints a single' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 874.106334.
Sortie : `.harness-state/tickets/T158/codex-actions-green.log`.

### reviewer-failure-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='a failed Claude reviewer' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 825.466458.
Sortie : `.harness-state/tickets/T158/reviewer-failure-red.log`.

### reviewer-failure-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='a failed Claude reviewer' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 1681.594167.
Sortie : `.harness-state/tickets/T158/reviewer-failure-green.log`.

### mutation-review-report-red

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex resumes the same thread' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 1128.1845.
Sortie : `.harness-state/tickets/T158/mutation-review-report-red.log`.

### mutation-review-report-restored-green

Commande : `node --test --test-concurrency=1 --test-name-pattern='Codex resumes the same thread' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 737.811084.
Sortie : `.harness-state/tickets/T158/mutation-review-report-restored-green.log`.

### Consignes, ADR et documentation

Commandes : écriture de `docs/adr/0011-la-boucle-separe-codex-et-son-relecteur-claude.md`, mise à jour
de `CLAUDE.md` et de `docs/travail/README.md`, préparation des contenus sous `.harness-state/tickets/T158/`.
Résultat : ADR et documentation écrits, lien `AGENTS.md -> CLAUDE.md` créé. Les fichiers manquants sont
préparés dans `hooks.json`, `ticket-codex-SKILL.md` et `protected-files.patch` ; ils ne sont pas installés.
La documentation officielle OpenAI du mode non interactif a été consultée, ainsi que les aides locales.
Aucune installation ni aucun fournisseur réel lancé.

### Mutation du critère 9

Commande : suppression temporaire de `${reviewed.report}` dans la consigne de reprise de
`scripts/loop/codex.mjs`, puis test ciblé `Codex resumes the same thread` (commandes et sorties ci-dessus).
Résultat : le test échoue sur l'assertion qui exige le rapport complet ; mutation retirée dans un `finally`,
puis même test vert. Le code final transmet de nouveau le rapport complet.

### regression-targeted

Commande : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs`.
Résultat observé : code 1, ℹ tests 111; ℹ pass 110; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 71163.519084.
Sortie : `.harness-state/tickets/T158/regression-targeted.log`.

### Examen local et état relu

Commandes : `git diff --check`, contrôle local des longueurs des ajouts et `node --check` sur
`codex.mjs`, `run.mjs`, `guard-write.mjs`, `models.mjs` et le helper Codex.
Résultat : aucune erreur d'espacement ni ligne ajoutée de plus de 160 caractères ; cinq codes 0
pour la syntaxe. Comparaisons par Python : rien avant `## Journal` n'a changé dans le ticket,
`scripts/check.mjs` et `scripts/quality/` sont inchangés.
Commande : `node scripts/loop/reviewed-state.mjs record --ticket T158`.
Résultat : `revue-1.diff`, `revue-1.fichiers` et `reviewed-state.json` écrits ; aucune relecture
indépendante réelle n'est prétendue.
Essai avec l'outil natif `apply_patch` sur `.codex/hooks.json` : refus par les réglages d'approbation,
comme pour le shell. Les contenus préparés restent dans le dossier d'état.

### final-targeted

Commande : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs`.
Résultat observé : code 1, ℹ tests 111; ℹ pass 110; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 69791.395167.
Sortie : `.harness-state/tickets/T158/final-targeted.log`.

### Validation des fichiers préparés

Commande : `git apply --check .harness-state/tickets/T158/protected-files.patch`.
Résultat : code 0, sans application du patch. Le patch contient seulement `.codex/hooks.json` et
`.agents/skills/ticket-codex/SKILL.md`.
Commande : lecture de `hooks.json` par `JSON.parse` avec Node.
Résultat : `JSON proposé valide : 2 hooks`. Cette preuve concerne le contenu préparé, pas son installation.

### Verdict de la session

Commande finale : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs`.
Résultat observé : 111 tests, 110 réussis, 1 échec, 0 ignoré, code 1 (69,79 s).
Échec unique : `Codex must load its project hooks`, car `.codex/hooks.json` n'a pas pu être créé.
Les 98 tests préexistants restent verts, sans modification de leurs assertions.
La mutation du critère 9 est retirée ; son test est vert dans ce résultat final.

Verdict écrit dans `.harness-state/tickets/T158/verdict.json` : PARTIEL.
Restent les deux fichiers protégés à installer, puis le test de configuration et le contrôle complet.
Aucune relecture indépendante réelle, aucun smoke, aucun fournisseur réel, aucune installation,
aucun commit ni push dans ce worktree. Les commits des tests sont confinés à leurs dépôts temporaires.

### Reprise après relecture Claude Opus

Commandes : lecture intégrale de `relecture-1.md`, de la skill Codex installée, des sources concernées,
des hooks et des tests ; `git status --short --branch`.
Résultat : branche `feat/codex-engine`, modifications précédentes présentes ; `.codex/` et `.agents/`
sont désormais installés. Le rapport compte 2 bloquants, 6 mineurs et 3 hors périmètre.
Les constats 1 à 8 sont pris en correction ; 9 à 11 restent des réserves. Plan et écarts de reprise
écrits dans `ecarts.md` avant toute correction. Le constat 4 sera livré sous forme de patch protégé.

### r1-finding1-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=the separate Claude reviewer runs outside' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 948.553583.
Sortie : `.harness-state/tickets/T158/r1-finding1-red.log`.

### r1-finding1-green

Commande : `node --test --test-concurrency=1 '--test-name-pattern=the separate Claude reviewer runs outside' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 667.3825.
Sortie : `.harness-state/tickets/T158/r1-finding1-green.log`.

### r1-finding2-blocked-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a blocked Codex verdict preserves' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 1562.106458.
Sortie : `.harness-state/tickets/T158/r1-finding2-blocked-red.log`.

### r1-finding2-blocked-green

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a blocked Codex verdict preserves' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 361.902916.
Sortie : `.harness-state/tickets/T158/r1-finding2-blocked-green.log`.

### r1-finding2-unfinished-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=Codex hands back an absent' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 605.469625.
Sortie : `.harness-state/tickets/T158/r1-finding2-unfinished-red.log`.

### r1-finding2-unfinished-green

Commande : `node --test --test-concurrency=1 '--test-name-pattern=Codex hands back an absent' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 1046.202.
Sortie : `.harness-state/tickets/T158/r1-finding2-unfinished-green.log`.

### r1-finding2-resumed-blocked-mutation-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a Codex correction that becomes blocked' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 731.786625.
Sortie : `.harness-state/tickets/T158/r1-finding2-resumed-blocked-mutation-red.log`.

### r1-finding2-resumed-blocked-green

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a Codex correction that becomes blocked' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 520.0455.
Sortie : `.harness-state/tickets/T158/r1-finding2-resumed-blocked-green.log`.

### r1-finding3-inherit-mutation-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=Codex receives a null input device' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 778.734125.
Sortie : `.harness-state/tickets/T158/r1-finding3-inherit-mutation-red.log`.

### r1-finding3-pipe-mutation-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=Codex receives a null input device' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 669.797708.
Sortie : `.harness-state/tickets/T158/r1-finding3-pipe-mutation-red.log`.

### r1-finding3-green

Commande : `node --test --test-concurrency=1 '--test-name-pattern=Codex receives a null input device' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 656.958958.
Sortie : `.harness-state/tickets/T158/r1-finding3-green.log`.

### Constat 4 — correction protégée préparée

Commande : génération d'un diff unifié depuis la skill installée vers `ticket-codex-SKILL-2.md`, puis
`git apply --check .harness-state/tickets/T158/protected-files-2.patch`.
Résultat : code 0. Le patch retire l'exception au contrôle complet et impose le contrôle puis le verdict.
Le fichier `.agents/skills/ticket-codex/SKILL.md` reste inchangé ; l'application revient à l'orchestrateur.

### r1-finding5-events-mutation-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a failed Codex session cannot be reviewed' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 805.488167.
Sortie : `.harness-state/tickets/T158/r1-finding5-events-mutation-red.log`.

### r1-finding5-exit-mutation-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a failed Codex session cannot be reviewed' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 1331.775292.
Sortie : `.harness-state/tickets/T158/r1-finding5-exit-mutation-red.log`.

### r1-finding5-green

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a failed Codex session cannot be reviewed' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 1011.108875.
Sortie : `.harness-state/tickets/T158/r1-finding5-green.log`.

### r1-finding6-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=indented Codex patch markers' tests/agent-guards.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 140.291875.
Sortie : `.harness-state/tickets/T158/r1-finding6-red.log`.

### r1-finding6-green

Commande : `node --test --test-concurrency=1 '--test-name-pattern=indented Codex patch markers' tests/agent-guards.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 238.462708.
Sortie : `.harness-state/tickets/T158/r1-finding6-green.log`.

### r1-finding7-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a custom Codex model signs' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 711.0225.
Sortie : `.harness-state/tickets/T158/r1-finding7-red.log`.

### r1-finding7-green

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a custom Codex model signs' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 663.542042.
Sortie : `.harness-state/tickets/T158/r1-finding7-green.log`.

### r1-finding8-red

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a fixed Claude model dry run uses' tests/ticket-loop.test.cjs`.
Résultat observé : code 1, ℹ tests 1; ℹ pass 0; ℹ fail 1; ℹ skipped 0; ℹ duration_ms 203.291459.
Sortie : `.harness-state/tickets/T158/r1-finding8-red.log`.

### r1-finding8-green

Commande : `node --test --test-concurrency=1 '--test-name-pattern=a fixed Claude model dry run uses' tests/ticket-loop.test.cjs`.
Résultat observé : code 0, ℹ tests 1; ℹ pass 1; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 210.9115.
Sortie : `.harness-state/tickets/T158/r1-finding8-green.log`.

### Bilan des corrections de la relecture 1

1. Relecteur lancé sans `TVLENS_LOOP` ; test d'environnement rouge puis vert.
2. Verdict relu avant chaque relecture, reprises comprises : BLOQUÉ préserve sa raison ; seuls les
   TERMINÉ vont en relecture. Tests rouge/vert pour BLOQUÉ initial et verdicts non terminés ;
   mutation rouge pour un BLOQUÉ après reprise, puis vert après retrait.
3. Doublure : observation du type de fd 0 avant lecture. Mutations `inherit` puis `pipe` rouges sur
   l'assertion, sans attente de fermeture ; réglage `ignore` restauré et test vert.
4. Retrait de l'exception dans `protected-files-2.patch`, contrôlé applicable, non appliqué.
5. Doublure : `turn.failed`, `error` et code de sortie non nul, avec verdict TERMINÉ présent.
   Deux mutations retirent la gestion des événements puis des codes de sortie : chacune rouge.
   Gestion restaurée : test vert sur les trois scénarios, sans relecture ni intégration.
6. Marqueurs de patch indentés reconnus : test rouge puis vert, y compris déplacement, autre ticket
   et nom de test interdit ; contrôle sur un fichier core autorisé.
7. Modèle Codex non reconnu : signature de repli Codex ; test rouge puis vert à la frontière du commit.
8. Dry-run Claude avec modèle fixé : effort « par défaut » et relecteur « hérité » ; test rouge puis vert.

Les sorties de chaque commande sont dans les journaux `r1-finding*.log`, cités aux jalons ci-dessus.
README et ADR précisent le traitement des verdicts et l'environnement du relecteur.
Les mutations des constats 2, 3 et 5 ont été retirées dans des blocs `finally` avant les preuves vertes.
Les constats 9, 10 et 11 sont laissés intacts et seront repris dans `reste`.

### r1-final-targeted

Commande : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs`.
Résultat observé : code 0, ℹ tests 120; ℹ pass 120; ℹ fail 0; ℹ skipped 0; ℹ duration_ms 68711.490541.
Sortie : `.harness-state/tickets/T158/r1-final-targeted.log`.

### Vérifications locales après corrections

Commandes : `git diff --check`, `node --check` sur `codex.mjs`, `run.mjs`, `models.mjs`,
`guard-write.mjs`, le helper Codex et les deux fichiers de tests ; contrôle des ajouts par Python.
Résultats : espacement sans erreur, sept codes 0 de syntaxe, aucune ligne ajoutée au-delà de 160 caractères.
Comparaisons : ticket intact avant `## Journal` ; contrôles, plancher, rétrospective et portées inchangés.
La skill protégée garde son SHA256 initial : la correction du constat 4 n'est pas appliquée.

### Verdict après corrections de la relecture 1

Commande finale : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs`.
Résultat observé : code 0, 120 tests réussis sur 120, 0 échec, 0 ignoré (68,71 s).
Sortie complète : `.harness-state/tickets/T158/r1-final-targeted.log`.
Les tests préexistants restent verts ; les neuf nouveaux tests ont tous une preuve rouge avant leur vert.
Les preuves par mutation sont distinguées dans les noms des journaux et toutes les mutations sont retirées.

`verdict.json` réécrit : PARTIEL, car la correction protégée du constat 4 est préparée mais non appliquée,
la dernière relecture reste « à corriger » et le contrôle complet est non lancé sur instruction.
Les constats 9, 10 et 11 sont dans `reste`, sans correction de leurs sources.
Les fichiers protégés initialement manquants sont présents : cette ancienne réserve est levée.
Aucun contrôle complet du worktree, aucun smoke, aucune installation, aucun fournisseur réel,
aucun commit ni push dans le worktree ; seuls les tests utilisent leurs dépôts temporaires.

### Clôture, par l'orchestrateur (Claude Opus 5.5), le 15/10

- Implémenté par Codex (GPT-6.1 Sol, effort high) en deux sessions : 13 min 34 s, puis 9 min 14 s après la relecture 1.
- Fichiers `.codex/hooks.json` et `.agents/skills/ticket-codex/SKILL.md` posés par l'orchestrateur, à l'identique de `protected-files.patch` et `protected-files-2.patch` : le bac à sable de Codex rend `.codex/` et `.agents/` non inscriptibles.
- Relecture 1 (Opus) : à corriger, 2 bloquants, 6 mineurs, 3 hors périmètre. Relecture 2 (Opus, relecteur neuf) : accepté, 0 bloquant, 0 mineur, 5 hors périmètre.
- `node scripts/check.mjs` : vert, 805 tests JS sur 805, tests Python OK, `cas_de_test` 740 → 762. Format et lint non lancés : Prettier et ESLint ne sont pas installés.
- Réserves à la clôture (hors périmètre, tickets de suivi) :
  - les réserves de la relecture qui accepte ne vont ni au journal ni au commit (`codex.mjs` écrit le verdict avant la relecture) ;
  - `untracked-before.json` n'est pas protégé : une session peut retirer un fichier nouveau du diff relu ;
  - la rétrospective cite `session-<n>.jsonl` au lieu de `codex-<n>.jsonl` pour une tentative Codex ;
  - la portée « consignes » de l'harmonisation n'ouvre pas `.agents/skills/` ;
  - `CLAUDE.md`, lu par Codex à travers `AGENTS.md`, lui dit de suivre la skill `ticket` des sous-agents.
- Non vérifié en session réelle : le chargement de `.codex/hooks.json` sous `--ignore-user-config`, la forme réelle de `tool_input.command` pour `apply_patch`, l'effort `max` sur `gpt-6-astra`, l'alias `fable` du relecteur au palier 3.
