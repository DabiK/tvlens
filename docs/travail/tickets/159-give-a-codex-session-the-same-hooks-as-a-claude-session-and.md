---
id: T159
titre: Give a Codex session the same hooks as a Claude session, and prove they run
statut: termine
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
- Constats de l'orchestrateur contre le vrai Codex, le 15/10 :
  - `.harness-state/tickets/T159/constat-reprise.md` : `codex exec resume` ne lance aucun hook du projet ;
  - `.harness-state/tickets/T159/constat-config.md` : sous `--ignore-user-config`, aucun hook du projet ne tourne.
    L'approbation des hooks, donnée par le propriétaire avec `/hooks`, vit dans la config de l'utilisateur et vaut
    pour le chemin absolu du dépôt. Le constat donne les réglages qui neutralisent le reste de cette config ;
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
    - passer `-c 'projects."<racine>".trust_level="trusted"'` à chaque `codex exec` ;
    - charger la config de l'utilisateur, où vit l'approbation des hooks : plus de `--ignore-user-config`. Neutraliser
      ce qu'elle apporte : `--disable plugins`, `--disable apps`, `--disable memories`, `--disable image_generation`,
      `-c 'notify=[]'`, et `-c mcp_servers.<nom>.enabled=false` pour chaque serveur actif que liste
      `codex mcp list --json` avec les mêmes `--disable`. Si cette liste échoue ou n'est pas lisible, la session est
      refusée sans lancement ;
    - une seule fonction construit ces arguments, et la preuve réelle du critère 7 s'en sert ;
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

1. Les arguments de chaque `codex exec`, enregistrés par le faux `codex` :
   - contiennent la confiance du projet pour la racine et les réglages qui neutralisent la config de l'utilisateur ;
   - contiennent `-c mcp_servers.<nom>.enabled=false` pour chaque serveur actif de la liste que rend le faux `codex`,
     et pour aucun serveur inactif ;
   - ne contiennent pas `--ignore-user-config`.

   Si le faux `codex` fait échouer `mcp list`, la session est refusée sans aucun `exec`, et la raison nomme la liste
   des serveurs MCP.
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
   une vraie session `codex exec`, en mode boucle, avec les arguments que construit la boucle elle-même, modèle
   `gpt-6-luna` et effort `low`. Il tourne dans le dépôt donné, et non dans une copie : l'approbation des hooks ne vaut
   que pour le chemin du dépôt approuvé. Il lui demande d'écrire une ligne dans `scripts/check.mjs`, puis vérifie deux
   choses : l'écriture est refusée par `guard-write`, et le témoin de démarrage existe. Il refuse de démarrer si
   `scripts/check.mjs` a des modifications non committées. Si le fichier a changé à la fin, il le restaure et échoue.
   Le script est vu fonctionner sur un faux `codex`.

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
- **`.codex/hooks.json` reste figé, décidé par le propriétaire le 15/10.** Chaque événement appelle un script de
  `.claude/hooks/`, où vit toute la logique : un script modifié reste approuvé (`constat-config.md`, point 4). Changer
  la définition d'un hook demande que le propriétaire l'approuve de nouveau (`codex`, puis `/hooks`). D'ici là, le
  témoin fait refuser les sessions, et le message de refus dit comment approuver.
- **La boucle Codex ne tourne que dans le dépôt approuvé.** L'approbation porte sur le chemin absolu de
  `.codex/hooks.json`. Dans un worktree, aucun hook ne tourne et le témoin refuse la session.
- **Pas de `guard-agent` ni de `record-review` pour Codex.** La session Codex n'a pas de sous-agents. La relecture est
  lancée et enregistrée par la boucle (T158).
- **Niveau `standard`, décidé par le propriétaire le 15/10** : Sol 6.1 high implémente, et Opus relit, comme pour
  T158.
- **Pas d'ADR.** Le choix d'architecture est celui de l'ADR 0012 ; ce ticket l'achève.

## Journal

- Exploration : lectures des consignes, de l'ADR 0012, des hooks, du moteur Codex, de ses appelants et tests. État initial : statut déjà `en-cours`, dossiers `design/continuous-context/` et `experiments/` étrangers au ticket. Analyse et écarts prévus dans `.harness-state/tickets/T159/`. Le témoin devra être propre à chaque lancement, reprise comprise ; `stop-gate` paraît déjà compatible et sera vérifié par entrée Codex.
- Contrôle après patch : `node --test --test-name-pattern='after a Codex patch' tests/agent-guards.test.cjs` rouge observé sur l'absence de signalement du fichier non conforme (`after-edit-red.log`). Extraction du parseur commun dans `lib.mjs`, réutilisée par les deux hooks. `node --test --test-name-pattern='after a Codex patch|Codex Stop' tests/agent-guards.test.cjs` : 2 tests verts (`edit-stop-green.log`). `Stop` était déjà compatible : aucun changement à sa logique.
- Démarrage : `node --test --test-name-pattern='Codex start hook' tests/agent-guards.test.cjs` rouge sur la skill attendue, puis vert après ajout du contexte et du témoin (`start-red.log`, `start-green.log`).
- Confiance et moteur : `node --test --test-name-pattern='Codex trusts the project' tests/ticket-loop.test.cjs` rouge sur l'argument de confiance manquant, puis vert pour exec et resume (`trust-red.log`, `trust-green.log`).
- Preuve par lancement : `node --test --test-name-pattern='without its startup hook|fresh hook witness' tests/ticket-loop.test.cjs` : 2 rouges sur une intégration indue. Après vérification du témoin (session et identifiant unique de lancement), `node --test --test-name-pattern='without its startup hook|fresh hook witness|Codex trusts the project|accepted on its first review' tests/ticket-loop.test.cjs` : 4 verts (`witness-red.log`, `witness-green.log`).
- Configuration : `node --test --test-name-pattern='all six shared' tests/agent-guards.test.cjs` rouge sur les événements manquants (`config-red.log`). L'édition autorisée de `.codex/hooks.json` a été refusée par le bac à sable : « writing outside of the project; rejected by user approval settings ». Aucun contournement ; le fichier reste inchangé. Le patch complet est préparé dans `.harness-state/tickets/T159/codex-hooks.patch` pour un contexte habilité. Le test conserve toutes ses exigences.
- Preuve réelle préparée : `.harness-state/tickets/T159/prouver-les-hooks.sh` crée un worktree jetable, impose les réglages demandés et observe la sortie du vrai `guard-write` par un relais `node` sans modifier les hooks. `node --test .harness-state/tickets/T159/validate-proof.cjs` : 3 rouges avec un script vide, puis 3 verts (`proof-red.log`, `proof-green.log`) pour succès, démarrage absent et refus absent ; fichier du dépôt source intact et worktree supprimé dans chaque cas. Aucun vrai Codex lancé. L'orchestrateur exécutera le script après intégration ; un échec ouvre un suivi.
- `node scripts/check.mjs --changed` : code 1 ; règles, format et cliquet verts, ESLint non lancé (absent ou non configuré), 126 tests verts sur 127. Seul échec : les six hooks attendus ne sont pas encore déclarés dans `.codex/hooks.json`, resté protégé (`check-changed.log`). `git apply --check .harness-state/tickets/T159/codex-hooks.patch` et `bash -n .harness-state/tickets/T159/prouver-les-hooks.sh` : code 0. Le patch n'a pas été appliqué.
- Premier `node scripts/check.mjs` complet : code 1, 849 tests JS verts sur 850, seul échec sur la configuration protégée ; tests Python verts (84 exécutés, un cas ignoré), règles/format/cliquet verts, lint non lancé (`check-full.log`). Dernier ajustement : `node --test --test-name-pattern='does not inherit the Codex startup' tests/ticket-loop.test.cjs` rouge puis vert après retrait de `TVLENS_ENGINE` de l'environnement du relecteur Claude (`reviewer-engine-red.log`, `reviewer-engine-green.log`). Aucun comportement Claude existant ni aucune assertion existante affaiblis.
- Contrôle final après cet ajustement : `node scripts/check.mjs` code 1 (`check-final.log`). 84 fichiers de tests JS, 851 tests : 850 verts, seul échec `Codex declares all six shared lifecycle hooks with executable commands independent of Claude`, dû au fichier `.codex/hooks.json` non modifié. Python : 84 tests, succès avec un cas ignoré. Règles, format et cliquet verts ; ESLint non lancé. `git diff --check` : code 0.
- Verdict **PARTIEL** écrit dans `.harness-state/tickets/T159/verdict.json`. À reprendre depuis un contexte habilité : appliquer `codex-hooks.patch`, relancer le contrôle complet et faire relire par la boucle. La preuve avec le vrai Codex reste celle de l'orchestrateur après intégration. Aucun commit, push ni relecteur lancé par cette session.
- Relecture 1 : rapport `.harness-state/tickets/T159/relecture-1.md` lu en entier ; quatre mineurs acceptés, aucune contestation, un constat hors périmètre à conserver en réserve. L'orchestrateur a appliqué la configuration des six hooks et communiqué des contrôles verts. Le diff actuel confirme l'application. Écarts de reprise consignés dans `ecarts.md` avant correction ; preuves préfixées `r1-`.
- R1, constat 1 : ajout d'un faux Prettier toujours en échec et d'un test qui exige le silence pour `notes.md`, mais un signalement pour un `.cjs` conforme. Avec le filtre JavaScript temporairement retiré, `node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs` : code 1, 128/129 verts ; seul échec sur l'assertion `notes.md` attendu silencieux (`r1-non-js-red.log`). Filtre rétabli ensuite sans modification de sa règle.
- R1, constat 2 : nouveau scénario `allowed-before-denial` dans `validate-proof.cjs`, avec appel autorisé silencieux avant le refus du vrai garde. `node --test --test-concurrency=1 .harness-state/tickets/T159/validate-proof.cjs` : code 1, 3/4 verts ; le nouveau cas échoue bien avec « Unexpected end of JSON input » (`r1-proof-red.log`). Correction : ignorer les sorties vides et les autres outils avant l'analyse JSON. Dossier temporaire renommé `tvlens-hooks-XXXXXX`, nom observé et vérifié dans les quatre cas.
- R1, constats 3 et 4 : paragraphe ponctuel sur le script ignoré retiré du README permanent ; explications des hooks, de la confiance et du témoin conservées. En-tête de `after-edit.mjs` corrigé pour `Edit|Write|apply_patch` et chaque fichier JavaScript écrit. Vérification par lecture du diff, sans test de texte source.
- R1, constat 5 hors périmètre : réserve à la clôture. L'orchestrateur vérifiera contre le vrai Codex que `codex exec resume` déclenche `SessionStart` et que son `session_id` correspond au `thread_id` attendu par la boucle. Le script du critère 7 reste limité au démarrage ; aucune preuve réelle de reprise revendiquée ici.
- R1, validation du script corrigé : `node --test --test-concurrency=1 .harness-state/tickets/T159/validate-proof.cjs` code 0, 4/4 verts (`r1-proof-green.log`). Le scénario autorisé puis refusé réussit ; l'absence de témoin ou de refus reste rejetée. Nom temporaire sans point, fichier source intact et worktree supprimé vérifiés dans les quatre cas. Diff documentaire conservé dans `r1-documentation.diff` ; `git diff --check` code 0.
- R1, filtre rétabli et corrections en place : `node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs` code 0, 129/129 verts (`r1-targeted-green.log`). Le test du constat 1 est donc rouge sans le filtre, vert avec lui ; les assertions existantes restent présentes.
- R1, contrôle final : `node scripts/check.mjs` code 0, vert (`r1-check-full.log`) ; 852/852 tests JS, Python OK (84 cas dont un ignoré), règles/format/cliquet verts ; ESLint non lancé car absent ou non configuré. Verdict **TERMINÉ** écrit avec le constat 5 dans `reste`. Les constats 1 à 4 sont corrigés ; aucune contestation, aucun commit, push, relecteur ni vrai Codex lancé. La boucle garde la responsabilité de la prochaine relecture et de l'intégration.
- R2, exploration : session neuve, toutes les consignes, le journal, la relecture 1, le constat réel et le diff courant lus. Le propriétaire remplace `exec resume` par `exec` neuf après chaque relecture refusée ou illisible : aucun hook ne se charge sur la reprise réelle. Décision et adaptations de tests déclarées avant implémentation dans `ecarts.md` ; exploration dans `r2-exploration.md`. Corrections R1 conservées ; skill préparée en patch uniquement.
- R2, rouge observé : `node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs` code 1, 125/130 verts (`r2-sessions-red.log`). Cinq assertions échouent sur `exec resume` au lieu du nouvel `exec` attendu, dont le nouveau cas de rapport illisible et le refus de correction sans témoin. Adaptation décidée par le propriétaire, sans retrait des gardes. Le moteur partage désormais les arguments de lancement, nomme le rapport enregistré et reprend le travail dans l’arbre ; trois corrections et cumul du flux conservés.
- R2, vert puis mutation du témoin : même commande ciblée code 0, 130/130 verts (`r2-sessions-green.log`). Retrait temporaire de la seule vérification de correction : code 1, 127/130 verts (`r2-witness-red.log`) ; la correction sans témoin est intégrée à tort (code 0 au lieu de 2), deux tests détectent aussi le lancement non renouvelé. Moteur rétabli exactement ensuite. Les diffs antérieurs des hooks et tests de gardes sont conservés (`r2-preservation.log`). ADR et README mis à jour ; `skill.patch` préparé sans modifier `.agents/`, `git apply --check .harness-state/tickets/T159/skill.patch` code 0. La réserve R1 n° 5 est traitée par la décision du propriétaire.
- R2, validation finale ciblée : `node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs` code 0, 130/130 verts après rétablissement (`r2-targeted-green.log`). `node --test --test-concurrency=1 .harness-state/tickets/T159/validate-proof.cjs` code 0, 4/4 verts (`r2-proof-green.log`), y compris le scénario autorisé avant refus de R1. `git diff --check` code 0. Aucun vrai Codex lancé.
- R2, contrôle final et verdict : `node scripts/check.mjs` code 0, check vert (`r2-check-full.log`) ; 853/853 tests JS dans 84 fichiers, Python OK (84 cas dont un ignoré), règles/format/cliquet verts ; ESLint non lancé car absent ou non configuré. Verdict **TERMINÉ** : sessions neuves gardées après refus ou rapport illisible, rapport nommé et complet, arbre repris, flux cumulé et limite de trois corrections conservés. Skill livrée en `skill.patch`, à appliquer par l’orchestrateur ; réserve R1 n° 5 résolue, constats 1 à 4 conservés. Preuves détaillées dans `r2-preuves.md`. Aucun commit, push, relecteur ni vrai Codex lancé ; preuve réelle du critère 7 laissée à l’orchestrateur après intégration.
- R3, exploration : nouvelle session, consignes, ticket et journal, écarts, relecture 1, constat-config.md et diff lus. Retrait de `--ignore-user-config` décidé par le propriétaire sur constat réel ; adaptations des assertions déclarées avant implémentation dans `ecarts.md`. Les corrections R1/R2 sont conservées. Preuve revue pour le dépôt approuvé et arguments partagés ; aucun vrai Codex ne sera lancé. Exploration dans `r3-exploration.md`.
- R3, configuration : `node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs` code 1, 128/131 verts (`r3-config-red.log`) : les deux assertions adaptées et le nouveau cas startup/correction détectent `--ignore-user-config`. Premier essai d'intégration en échec : environnement ticket oublié pour la découverte MCP (`r3-config-integration-error.log`), corrigé sans changer les assertions. Même commande : code 1, 129/135 verts (`r3-refusals-red.log`) ; configuration sur succès verte, quatre nouveaux refus MCP rouges (échec même avec JSON valide, JSON illisible, structure invalide, activation ambiguë), et deux assertions rouges sur le remède d'approbation manquant.
- R3, preuve : `node --test --test-concurrency=1 .harness-state/tickets/T159/validate-proof.cjs` code 1, 0/6 verts (`r3-proof-red.log`). Les scénarios existants détectent le mauvais dépôt ; le nouveau cas `dirty-check` détecte un exec indu, `changes-check` l'absence de restauration signalée. Script réécrit : dépôt donné, constructeur exporté, contrôle préalable et restauration sur sortie. Premier essai refusé par l'import depuis stdin (`r3-proof-import-error.log`) ; pilote déplacé dans un fichier temporaire, sans modifier les modules hors périmètre. Même commande code 0, 6/6 verts (`r3-proof-green.log`). Aucun vrai Codex lancé.
- R3, premier vert ciblé : `node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs` code 0, 135/135 verts (`r3-targeted-green.log`). Découverte MCP avec le même binaire et les mêmes `--disable` avant chaque session, serveurs actifs seulement neutralisés, refus sans exec/relecture sur liste en échec ou illisible. Diagnostic d'approbation présent sans témoin, startup et correction.
- R3, erreur et témoin absent ensemble : test supplémentaire vu rouge, même commande ciblée code 1, 135/136 verts (`r3-failed-witness-red.log`) : l'erreur du processus masquait le remède d'approbation. La correction conserve l'erreur et ajoute le diagnostic « hooks Codex non chargés », sa cause probable et `codex`, puis `/hooks`. Aucun test affaibli.
- R3, documentation : ADR 0012 et section Codex du README décrivent la config utilisateur conservée, ses neutralisations, l'approbation par dépôt et la définition figée des hooks. Sessions neuves et corrections R1 conservées. `skill.patch` complété, sans écrire dans `.agents/` ; `git apply --check` code 0. `bash -n` du script de preuve et `git diff --check` codes 0. `scripts/check.mjs`, `scripts/quality/` et `.agents/` n'ont aucun diff.
- R3, validation finale ciblée : `node --test --test-concurrency=1 tests/agent-guards.test.cjs tests/ticket-loop.test.cjs` code 0, 136/136 verts (`r3-final-targeted-green.log`), y compris le cumul erreur de processus et diagnostic d'approbation. Preuve sur faux Codex : 6/6 verts (`r3-proof-green.log`), sans worktree et avec restauration vérifiée. Les six nouveaux tests de boucle et les deux nouveaux scénarios de preuve ont chacun été vus rouges puis verts ; preuves détaillées dans `r3-preuves.md`.
- R3, contrôle complet : `node scripts/check.mjs` code 0, check vert (`r3-check-full.log`) ; 859/859 tests JS dans 84 fichiers ; Python OK, 84 cas dont un ignoré ; règles/format/cliquet verts ; ESLint non lancé car absent ou non configuré. Verdict **TERMINÉ** écrit dans `.harness-state/tickets/T159/verdict.json`. Les décisions du propriétaire et l'adaptation des anciennes assertions sont dans `ecarts.md`. Skill livrée en patch applicable, à appliquer par l'orchestrateur ; preuve réelle préparée pour le dépôt approuvé, à lancer par l'orchestrateur après intégration. Aucun vrai Codex, commit, push, sous-agent ni relecteur lancé ; corrections R1/R2 conservées.
- Orchestrateur, intégration :
  - `skill.patch` appliqué à `.agents/skills/ticket-codex/SKILL.md` (`git apply --check` puis `git apply`). `codex-hooks.patch` l'avait été avant la relecture 1.
  - Témoin de la dernière session de correction, lu par l'orchestrateur pendant qu'elle tournait : `{"session":"01a13ea9-…","run":"a595259a-…"}`, égal à son `thread_id` et à son lancement. C'est la première session Codex de ce dépôt qui a tourné avec ses hooks.
  - Preuve réelle avant intégration : `prouver-les-hooks.sh .` contre le vrai Codex, code 0, « Preuve réussie : témoin de démarrage et refus par guard-write, fichier intact » (`preuve-reelle.log`). Le `verdict.json` du ticket, que la preuve réécrit, a été sauvegardé puis restauré.
- Relecture 2 (Opus) : **accepté**, 0 bloquant, 0 mineur (`relecture-2.md`). Réserves de clôture :
  - `stop-gate.mjs:59` et `session-context.mjs:11` nomment encore la skill `ticket` à une session Codex : en boucle quand le verdict manque, et en session Codex interactive, sans `TVLENS_ENGINE`. Elles doivent nommer la skill selon le moteur.
  - Le constat sur la reprise était faussé par `--ignore-user-config` (`constat-reprise.md`, correction de 10 h 55). Dans le dépôt approuvé, avec les réglages de la boucle, `codex exec resume` lance `SessionStart` et écrit le témoin, avec le même identifiant de session. Le README, l'ADR 0012 et la skill disent encore qu'une reprise ne charge aucun hook. Les sessions neuves restent sûres, mais plus lentes : la reprise d'une session pour une correction est à décider dans un ticket de suivi.
  - `docs/adr/0012-la-boucle-separe-codex-et-son-relecteur-claude.md:47` fait 162 caractères.
