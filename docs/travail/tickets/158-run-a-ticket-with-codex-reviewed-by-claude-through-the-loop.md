---
id: T158
titre: Run a ticket with Codex, reviewed by Claude, through the loop
statut: a-faire
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
