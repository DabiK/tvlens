---
id: T160
titre: Keep the last review's reserves of a Codex ticket, read its stream in the retrospective, and start it on Sol
statut: a-faire
bloque_par: T159
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Plusieurs écarts séparent encore le moteur Codex (T158) du flux Claude :

- **Les réserves de la relecture qui accepte se perdent.** Quand le relecteur accepte en notant des constats hors
  périmètre ou des écarts acceptés, ceux-ci ne vont ni au journal du ticket ni au commit : Codex a écrit son verdict
  avant la relecture. Côté Claude, l'orchestrateur les reporte.
- **La rétrospective lit mal une tentative Codex.** Elle cite `session-<n>.jsonl` au lieu de `codex-<n>.jsonl`, et
  écrit « undefined compaction(s) ».
- **Un ticket sensible démarre sur Astra**, le modèle Codex le plus cher, alors que GPT-6.1 Sol en effort xhigh est
  proche pour environ un cinquième du coût.
- **L'harmonisation ne peut pas faire évoluer la skill Codex**, `.agents/skills/ticket-codex/`, en même temps que la
  skill Claude.
- **Une session, Claude ou Codex, peut modifier `untracked-before.json`.** Elle retire alors un fichier nouveau du diff
  relu, et ce fichier part quand même dans le commit.
- **Une session Codex ne peut pas écrire dans `.codex/` ni dans `.agents/`, même sur un ticket de harnais.** Le bac à
  sable `workspace-write` les garde en lecture seule. T158 et T159 ont dû livrer ces fichiers en patch, appliqués à la
  main.
- **Deux messages nomment encore la skill `ticket` à une session Codex** (réserve de T159) : celui de `stop-gate` quand
  le verdict manque, et celui de `session-context` dans une session Codex interactive, sans `TVLENS_ENGINE`.

Après ce ticket, les réserves de la dernière relecture vont au journal et au commit, la rétrospective lit le flux
Codex, l'échelle Codex démarre un ticket sensible sur Sol 6.1 xhigh, l'harmonisation peut ajuster la skill Codex, et
la boucle refuse une session qui a touché à la liste des fichiers non suivis. Une session Codex d'un ticket de harnais
écrit elle-même dans `.codex/` et `.agents/`, et chaque message nomme la skill du moteur qui le reçoit.

## Sources

- Décision du propriétaire, le 15/10 : Codex au même niveau que Claude dans le harnais avant les tickets suivants.
- Réserves de T158, dans son journal : réserves de la relecture qui accepte, `untracked-before.json`, rétrospective,
  portée de l'harmonisation.
- Correspondance des modèles (recherche du 15/10) : Sol 6.1 « égale » Astra pour environ un cinquième du coût
  (DeepSWE). Le quota d'Astra est de 5 à 45 messages par fenêtre de 5 h.
- Code concerné, à la version `b122db2` :
  - `scripts/loop/codex.mjs` : la relecture (`review`), l'enregistrement du verdict, `relecture-<n>.md` ;
  - `scripts/loop/run.mjs` : `integrate` (l. 387-405), qui prend les réserves dans `verdict.reste`,
    `withReserves`, `commitMessage`, `gates`, `preflight` (la liste `untracked` gardée en mémoire) ;
  - `scripts/loop/reviewed-state.mjs` : `record`, `unreviewedChange`, `readUntrackedBefore` ;
  - `scripts/loop/retro.mjs` : le résumé d'une tentative (l. 60-80) ;
  - `scripts/loop/models.mjs` : `CODEX_LADDER` ;
  - `scripts/loop/harness-scopes.mjs` : la portée `consignes` et ses fichiers fermés (T156) ;
  - `.claude/agents/relecteur.md` : la forme du rapport (constats classés `bloquant`, `mineur`, `hors périmètre`,
    section des écarts) ;
  - `tests/ticket-loop.test.cjs`, `tests/agent-guards.test.cjs`.
- Réserves de T159, dans son journal : `stop-gate.mjs:59` et `session-context.mjs:11`. Une session Claude a
  `CLAUDE_PROJECT_DIR` dans l'environnement de ses hooks ; une session Codex ne l'a pas.
- Observé le 15/10 avec Codex CLI 0.162.1 : sous `workspace-write`, `.codex/` et `.agents/` sont en lecture seule, et
  `--add-dir <racine>/.codex` rend `.codex/` inscriptible pour la session (`codex exec --help` : « Additional
  directories that should be writable alongside the primary workspace »). Les gardes du projet décident toujours de ce
  que la session a le droit d'écrire.

## Périmètre

- À modifier :
  - `scripts/loop/codex.mjs` et `scripts/loop/run.mjs` :
    - quand la dernière relecture d'une tentative Codex est acceptée, ses constats hors périmètre et ses écarts
      acceptés s'ajoutent aux réserves que reçoit `integrate`. Chaque réserve renvoie à `relecture-<n>.md`. Ils vont
      donc au journal (« Réserves à la clôture ») et au compte du commit ;
    - **la liste des non suivis.** `gates` compare la liste `untracked-before.json` lue sur disque à celle gardée en
      mémoire depuis `preflight`. Si elles diffèrent, la tentative est refusée. Cela vaut pour les deux moteurs ;
  - `scripts/loop/codex.mjs`, arguments de session : sur un ticket `harnais: oui`, `--add-dir <racine>/.codex` et
    `--add-dir <racine>/.agents`. Sur un autre ticket, aucun `--add-dir` ;
  - `.claude/hooks/session-context.mjs` et `.claude/hooks/stop-gate.mjs` : la skill nommée est celle du moteur. C'est
    `.agents/skills/ticket-codex/SKILL.md` avec `TVLENS_ENGINE=codex`, ou sans `CLAUDE_PROJECT_DIR`, et la skill
    `ticket` sinon ;
  - `scripts/loop/retro.mjs` : pour une tentative Codex, le résumé cite `codex-<n>.jsonl` et n'écrit plus de
    compactions inconnues ;
  - `scripts/loop/models.mjs` : `CODEX_LADDER`, palier 1 = `gpt-6.1-sol` effort `xhigh`. Les paliers 0, 2 et 3 ne
    changent pas ;
  - `scripts/loop/harness-scopes.mjs` : la portée `consignes` ouvre aussi `.agents/skills/`. Les fichiers fermés par
    T156 restent fermés. `.agents/skills/` n'a pas d'équivalent de la skill `harmonisation` à fermer ;
  - `docs/travail/README.md` : l'échelle Codex, les réserves de la dernière relecture, la liste des non suivis ;
  - les tests des critères.
- À ne pas toucher :
  - le flux Claude, sauf la comparaison de la liste des non suivis, qui le protège aussi : ses tests existants passent
    sans changer d'assertion ;
  - `scripts/check.mjs`, `scripts/quality/`, le plancher du cliquet ;
  - le code du produit.

## Critères d'acceptation

1. Une tentative Codex dont la dernière relecture est acceptée avec deux constats hors périmètre est intégrée. Les
   deux constats figurent dans « Réserves à la clôture » du ticket et dans le compte du commit.
2. Une session, Claude ou Codex, qui ajoute un chemin à `untracked-before.json` est refusée par `gates`, avec une
   raison qui le nomme.
3. La rétrospective d'un ticket Codex cite `codex-1.jsonl`, et sa sortie ne contient pas « undefined ».
4. `--dry-run --engine codex` affiche le palier 1 sur `gpt-6.1-sol`, effort `xhigh`. Un ticket `sensible` démarre sur
   ce palier.
5. La portée `consignes` accepte `.agents/skills/ticket-codex/SKILL.md`, et refuse toujours les fichiers fermés par
   T156.
6. Mutation temporaire : `integrate` ignore les réserves de la dernière relecture. Le test du critère 1 échoue ; la
   sortie rouge va au journal, puis la mutation est retirée.
7. Les arguments de `codex exec` enregistrés par le faux `codex` contiennent `--add-dir <racine>/.codex` et
   `--add-dir <racine>/.agents` pour un ticket `harnais: oui`, et aucun `--add-dir` pour un autre ticket.
8. `session-context.mjs` nomme `.agents/skills/ticket-codex/SKILL.md` sans `TVLENS_ENGINE` ni `CLAUDE_PROJECT_DIR`,
   et la skill `ticket` avec `CLAUDE_PROJECT_DIR`. `stop-gate.mjs` en mode boucle, sans verdict et avec
   `TVLENS_ENGINE=codex`, nomme la skill Codex.
9. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs`, frontière : `run.mjs --engine codex` dans le dépôt temporaire des tests, avec le faux
`codex` et un faux relecteur dont le rapport compte des constats hors périmètre. `tests/agent-guards.test.cjs` pour la
portée.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Les réserves viennent du rapport, pas d'une reprise de Codex.** Reprendre Codex après une acceptation changerait
  l'état relu. La boucle lit le dernier rapport, qu'elle a déjà enregistré.
- **La liste des non suivis est vérifiée, pas seulement protégée.** Une écriture par le shell échappe aux hooks ; la
  comparaison faite par la boucle ne dépend pas d'eux.
- **Niveau `standard`, décidé par le propriétaire le 15/10** : Sol 6.1 high implémente, et Opus relit.
- **`--add-dir` seulement pour un ticket de harnais.** Le bac à sable reste le premier mur pour les autres tickets ;
  pour un ticket de harnais, les gardes décident, comme pour une session Claude.
- **Pas d'ADR.** Ces changements complètent le moteur décrit par l'ADR 0012.

## Journal
