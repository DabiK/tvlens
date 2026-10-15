---
id: T159
titre: Give a Codex session the same hooks as a Claude session, and prove they run
statut: a-faire
bloque_par: T158
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Depuis T158, `node scripts/loop/run.mjs --engine codex` traite un ticket avec Codex. Mais ses hooks ne sont pas
garantis. Codex ne charge `.codex/hooks.json` que si le projet est « de confiance », et la boucle écarte la config de
l'utilisateur, où cette confiance est déclarée. Ses hooks se limitent aussi à deux gardes, `guard-write` et
`guard-bash`, alors qu'une session Claude a six hooks.

Après ce ticket, une session Codex de la boucle a les mêmes hooks qu'une session Claude, et la boucle prouve qu'ils
ont tourné :
- au démarrage, le contexte du dépôt ;
- avant chaque écriture et chaque commande, les gardes ;
- après chaque édition, le contrôle rapide du fichier ;
- à la fin, la porte qui refuse un verdict absent ou un TERMINÉ sur un contrôle rouge.

Une session dont les hooks n'ont pas tourné est refusée. `CLAUDE.md`, que Codex lit par `AGENTS.md`, ne lui dit plus
de suivre la skill des sous-agents.

## Sources

- Décision du propriétaire, le 15/10 : Codex doit être au même niveau que Claude dans le harnais avant de lui
  confier les tickets suivants, relus par Opus.
- Relectures de T158 (réserves de son journal) :
  - le chargement de `.codex/hooks.json` sous `--ignore-user-config` n'est pas vérifié ;
  - `CLAUDE.md:11`, lu par Codex, lui dit de suivre la skill `ticket`, celle des sous-agents.
- Documentation de Codex CLI 0.162.1 (recherche du 15/10) :
  - les couches `.codex/` d'un projet (config, hooks) ne se chargent que si le projet est de confiance. Avec
    `--ignore-user-config`, la confiance se repasse par `-c 'projects."<racine>".trust_level="trusted"'` ;
  - événements de hooks : `SessionStart` (sortie `hookSpecificOutput.additionalContext`), `PreToolUse`,
    `PostToolUse`, `Stop` (`decision: "block"` et `reason` relancent un tour ; champ `stop_hook_active`),
    `PreCompact` (stdout ignoré) ;
  - entrée JSON sur stdin : `session_id`, `cwd`, `hook_event_name`, `model` ; pour `apply_patch`,
    `tool_input.command` est le texte du patch ;
  - il n'y a pas de `CLAUDE_PROJECT_DIR`. `lib.mjs` retombe déjà sur `input.cwd` ;
  - un hook en erreur laisse passer l'appel ;
  - sous `workspace-write`, `.codex/` et `.agents/` sont en lecture seule pour la session.
- Code concerné, à la version `b122db2` :
  - `scripts/loop/codex.mjs` : arguments de `codex exec` et de `codex exec resume` (l. 27-36), variables de session
    (l. 15-24) ;
  - `.codex/hooks.json` : seulement `PreToolUse` (`guard-write`, `guard-bash`) ;
  - `.claude/settings.json` : les hooks d'une session Claude (`SessionStart`, `PreToolUse` Bash, Edit, Agent,
    `PostToolUse` Edit et Agent, `PreCompact`, `Stop`) ;
  - `.claude/hooks/session-context.mjs`, `after-edit.mjs` (lit `tool_input.file_path`), `stop-gate.mjs`,
    `record-compaction.mjs`, `lib.mjs`, `guard-write.mjs` (sait déjà lire les chemins d'un patch) ;
  - `CLAUDE.md:11`, `.agents/skills/ticket-codex/SKILL.md` ;
  - `tests/agent-guards.test.cjs`, `tests/ticket-loop.test.cjs` (faux `codex` : `tests/helpers/codex-session.cjs`).

## Périmètre

- À modifier :
  - `scripts/loop/codex.mjs` :
    - passer `-c 'projects."<racine>".trust_level="trusted"'` à `codex exec` et à `codex exec resume` ;
    - passer `TVLENS_ENGINE=codex` dans l'environnement de la session ;
    - **preuve des hooks.** Après chaque session, et avant la relecture, la boucle vérifie que le hook de démarrage a
      tourné pour cette session : un fichier témoin qu'il écrit dans le dossier d'état. Sans témoin, la tentative est
      refusée avec la raison « hooks Codex non chargés », sans relecture ;
  - `.codex/hooks.json` : les mêmes hooks que `.claude/settings.json`, sauf ceux qui n'ont pas de sens sans
    sous-agents (`guard-agent`, `record-review`) :
    - `SessionStart` → `session-context.mjs` ;
    - `PreToolUse` Bash → `guard-bash.mjs` ;
    - `PreToolUse` `apply_patch|Edit|Write` → `guard-write.mjs` ;
    - `PostToolUse` `apply_patch|Edit|Write` → `after-edit.mjs` ;
    - `PreCompact` → `record-compaction.mjs` ;
    - `Stop` → `stop-gate.mjs`.

    Les chemins de commande ne dépendent pas de `CLAUDE_PROJECT_DIR`. Ce fichier est protégé et en lecture seule
    pour la session Codex : s'il ne peut pas l'écrire, la session prépare un patch, comme T158 ;
  - `.claude/hooks/session-context.mjs` : en mode boucle, il écrit le témoin, et il dit de suivre
    `.agents/skills/ticket-codex/SKILL.md` quand `TVLENS_ENGINE=codex`, la skill `ticket` sinon ;
  - `.claude/hooks/after-edit.mjs` : sans `tool_input.file_path`, il lit les chemins du patch
    (`tool_input.command`), comme `guard-write.mjs`, sans recopier l'analyse du patch, et contrôle chaque fichier
    JavaScript ;
  - `.claude/hooks/stop-gate.mjs` : il accepte l'entrée de `Stop` de Codex ;
  - `CLAUDE.md`, la ligne qui renvoie à la skill `ticket` : une session Claude suit la skill `ticket`, une session
    Codex suit `.agents/skills/ticket-codex/SKILL.md` ;
  - `docs/travail/README.md`, section du moteur Codex : les hooks, la confiance et la preuve des hooks ;
  - `tests/agent-guards.test.cjs` et `tests/ticket-loop.test.cjs` : les tests des critères.
- À ne pas toucher :
  - le flux Claude par défaut : les tests existants passent sans changer d'assertion ;
  - `scripts/check.mjs`, `scripts/quality/`, le plancher du cliquet ;
  - le code du produit.

## Critères d'acceptation

1. Les arguments de `codex exec` et de `codex exec resume`, enregistrés par le faux `codex`, contiennent la confiance
   du projet pour la racine.
2. Une session Codex dont le faux binaire n'écrit pas le témoin de hooks est refusée sans relecture, et la raison
   nomme les hooks. Avec le témoin, le flux de T158 ne change pas.
3. `after-edit.mjs`, avec une entrée Codex (`tool_name: "apply_patch"`) :
   - signale un patch qui rend un fichier JavaScript non conforme ;
   - ne dit rien pour un patch conforme ;
   - ignore un fichier qui n'est pas du JavaScript.
4. `stop-gate.mjs` en mode boucle, avec une entrée `Stop` de Codex : il bloque sans `verdict.json`, et laisse finir
   avec un verdict BLOQUÉ.
5. `session-context.mjs` en mode boucle :
   - avec `TVLENS_ENGINE=codex`, il nomme `.agents/skills/ticket-codex/SKILL.md` et écrit le témoin ;
   - sans, il nomme la skill `ticket`.
6. `.codex/hooks.json` déclare les six hooks du périmètre, et chaque commande pointe vers un fichier qui existe.
7. **Preuve réelle, préparée.** La session écrit `.harness-state/tickets/T159/prouver-les-hooks.sh`. Le script lance
   une vraie session `codex exec` avec les réglages de la boucle (`--ignore-user-config`, la confiance du projet,
   `--dangerously-bypass-hook-trust`, `-s workspace-write`, modèle `gpt-6-luna`, effort `low`), en mode boucle, dans
   une copie jetable du dépôt (`git worktree add` dans un dossier temporaire, supprimé ensuite). Il lui demande
   d'écrire une ligne dans `scripts/check.mjs`, puis vérifie deux choses : l'écriture est refusée par `guard-write`,
   et le témoin de démarrage existe. Le script est vu fonctionner sur un faux `codex`.

   La session ne le lance pas contre le vrai Codex : elle tourne déjà dans le bac à sable de Codex. L'orchestrateur le
   lance après l'intégration, et un échec ouvre un ticket de suivi.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs` pour les critères 1 et 2 (`run.mjs --engine codex` dans le dépôt temporaire des tests,
avec le faux `codex`) ; `tests/agent-guards.test.cjs` pour les critères 3 à 6. Le critère 7 est la seule preuve que
les hooks se chargent dans un vrai Codex : il se fait à la main, une fois, et sa sortie va au journal.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Un témoin plutôt que la confiance aveugle.** Un hook non chargé ne se voit pas, et il laisse tout passer. Le
  témoin rend son absence visible, et la boucle refuse.
- **Pas de `guard-agent` ni de `record-review` pour Codex.** La session Codex n'a pas de sous-agents. La relecture est
  lancée et enregistrée par la boucle (T158).
- **Niveau `standard`, décidé par le propriétaire le 15/10** : Sol 6.1 high implémente, et Opus relit, comme pour
  T158.
- **Pas d'ADR.** Le choix d'architecture est celui de l'ADR 0012 ; ce ticket l'achève.

## Journal
