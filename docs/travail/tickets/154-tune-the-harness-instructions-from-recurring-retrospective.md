---
id: T154
titre: Tune the harness instructions from recurring retrospective findings every few tickets
statut: termine
bloque_par: T155
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Après chaque ticket, la rétrospective propose des améliorations du harnais. Aujourd'hui, elles attendent
qu'une personne les trie (`node scripts/loop/retro.mjs liste`), et le harnais ne bouge pas pendant une
nuit de tickets. Après ce ticket, `node scripts/loop/run.mjs --tune-every N` lance une session
d'harmonisation tous les N tickets intégrés.
- La session reprend les problèmes qui reviennent dans les rétrospectives et corrige les consignes du
  harnais : la skill `ticket` et les agents.
- Le changement passe par un relecteur neuf et le contrôle complet, puis il est committé et poussé, et la
  file reprend.
- Elle ne peut pas toucher aux contrôles : `scripts/check.mjs`, `scripts/quality/`, `scripts/loop/`, les
  hooks et les réglages. Une proposition qui les vise, ou qui retirerait une vérification, reste en
  attente pour le propriétaire.

## Sources

- Décision du propriétaire, le 14/10 : le harnais doit évoluer avec ce dont les tickets ont besoin,
  pendant la phase autonome, par un agent dédié lancé tous les N tickets, N étant une option du script.
  Les consignes changent seules ; les contrôles restent à sa décision.
- Code concerné, à la version `621a5a1` :
  - `scripts/loop/run.mjs` :
    - options l. 30-42 ;
    - `runSession` (l. 230-270) : lancement de `claude -p`, variables `TVLENS_LOOP`, `TVLENS_TICKET`,
      `TVLENS_HARNESS` (l. 250), `TVLENS_REVIEW_MODEL` ;
    - `gates` (l. 283-309) ;
    - `integrate` (l. 336-361) ;
    - `retrospective` (l. 417-429) ;
    - boucle principale (l. 431-458), qui compte les tickets traités ;
  - `scripts/loop/retro.mjs` : journal `.harness-state/retours/observations.jsonl`, `liste` qui groupe les
    observations en attente (`statut: propose`), `decider <id> accepte|refuse|ticket:T…` (l. 145-158,
    qui refuse toute autre décision). Une observation a un `type` (`bien`, `probleme`), un `impact`
    (`faible`, `moyen`, `fort`), un `sujet` et le `ticket` qui l'a produite. La rétrospective demande de
    reprendre mot pour mot le sujet d'une proposition déjà ouverte (l. 94) : « Réserves de la revue
    laissées en « reste » au lieu d'être corrigées dans la session » apparaît pour T144, T004 et T005 ;
  - `.claude/hooks/guard-write.mjs` : `PROTECTED`, et l'écriture autorisée quand `TVLENS_HARNESS=1` ;
  - `.claude/agents/explorateur.md`, `implementeur.md`, `relecteur.md` : forme d'un agent (en-tête `name`,
    `description`, `tools`, `model`) ;
  - `.claude/skills/ticket/SKILL.md` : forme d'une skill d'orchestration, `verdict.json`, enregistrement de
    l'état relu, relecteur neuf, ligne `CONSTATS` (T153).
- Tests qui simulent une session : `tests/ticket-loop.test.cjs`. La fausse session (`FAKE_SESSION`,
  l. 22-60) joue un scénario par variable d'environnement, comme la rétrospective
  (`TVLENS_RETRO=1`). Le binaire se choisit par `TVLENS_CLAUDE_BIN`. Les hooks se testent dans
  `tests/agent-guards.test.cjs`.

## Périmètre

- À modifier :
  - `scripts/loop/run.mjs` :
    - option `--tune-every <n>`, `0` par défaut, ce qui veut dire jamais. `--dry-run` dit si
      l'harmonisation est active, et tous les combien ;
    - après la rétrospective de chaque ticket intégré, quand le nombre de tickets intégrés depuis le
      lancement est un multiple de N, une étape d'harmonisation, avant le ticket suivant ;
    - sélection, faite par le code et non par un modèle : les observations en attente de type
      `probleme` dont le `sujet` revient sur au moins deux tickets différents, ou d'impact `fort`. Au plus
      trois sujets, les plus fréquents d'abord. Sans observation retenue, la boucle affiche « Rien à
      harmoniser » et continue ;
    - une session `claude -p`, une seule tentative, sur le palier Opus de l'échelle (`models.mjs`). Elle
      a un identifiant propre (`H001`, `H002`, …) et son dossier d'état
      `.harness-state/tickets/<id>/`, où la boucle écrit les observations retenues. Variables :
      - `TVLENS_LOOP=1` ;
      - `TVLENS_TICKET=<id>` ;
      - `TVLENS_TUNE=1` ;
      - `TVLENS_HARNESS=1` ;
      - `TVLENS_HARNESS_SCOPE=consignes` ;
      - `TVLENS_REVIEW_MODEL`.
      `--budget-usd` et `--timeout-min` s'appliquent comme à un ticket ;
    - contrôles, après la session :
      - un verdict TERMINÉ ;
      - un diff limité à `.claude/skills/` et `.claude/agents/` ;
      - la dernière relecture acceptée sur l'état final (`unacceptedReview`) ;
      - `node scripts/check.mjs` vert.

      Tout passe : un commit `Tune the harness: <résumé du verdict>`. Un paragraphe y liste les
      identifiants des observations traitées, avec la ligne `Co-Authored-By` du modèle. Puis le push, et
      ces observations sont marquées `harmonisation:<commit>` dans le journal des retours ;
    - un refus, ou une session sans verdict :
      - la boucle remet les fichiers suivis modifiés dans leur état de `HEAD`, et retire les fichiers
        nouveaux absents avant la session ;
      - elle dit pourquoi et continue la file ;
      - les observations restent en attente ;
    - les observations que la session déclare différées restent en attente, et la boucle les affiche
      avec leur raison ;
  - `scripts/loop/retro.mjs` : `decider` accepte aussi `harmonisation:<commit>` ; `liste` continue de ne
    montrer que les observations en attente ;
  - `.claude/hooks/guard-write.mjs` : avec `TVLENS_HARNESS_SCOPE=consignes`, une écriture dans un chemin
    protégé hors de `.claude/skills/` et `.claude/agents/` est refusée, même si `TVLENS_HARNESS=1` ;
  - créer `.claude/agents/harmoniseur.md`, outils `Read`, `Grep`, `Glob`, `Edit`, `Write`. Il reçoit les
    observations retenues et modifie au plus juste la skill ou l'agent qu'elles visent. Chaque
    changement cite l'observation qui le motive. Il ne retire aucune vérification, aucune preuve exigée et
    aucune règle de refus. Une proposition qui demanderait de toucher aux contrôles, ou de vérifier moins,
    est différée avec sa raison ;
  - créer `.claude/skills/harmonisation/SKILL.md`, la marche de la session :
    1. lire les observations ;
    2. déléguer à `harmoniseur` ;
    3. enregistrer l'état relu (`reviewed-state.mjs record`) ;
    4. faire relire par un `relecteur` neuf, contre les observations et contre la règle « ne retire
       aucune vérification » ;
    5. corriger, trois tours au plus ;
    6. lancer `node scripts/check.mjs` ;
    7. écrire `verdict.json` avec `statut`, `resume`, `observations` (traitées) et `differees`
       (identifiant et raison) ;
  - `tests/ticket-loop.test.cjs` : un scénario `TVLENS_TUNE=1` de la fausse session, et les tests des
    critères 1 à 5 ;
  - `tests/agent-guards.test.cjs` : le test du critère 6 ;
  - `docs/travail/README.md` : une section qui décrit l'option, ce que l'harmonisation peut modifier, ce
    qu'elle ne peut pas modifier, et comment en annuler une (`git revert` de son commit).
- À ne pas toucher :
  - `scripts/check.mjs`, `scripts/quality/`, le plancher du cliquet ;
  - `gates` et `integrate` pour les tickets, en dehors d'une extraction commune si elle s'impose ;
  - la rétrospective elle-même (`runRetro`), en dehors des décisions qu'accepte `decider` ;
  - les tickets.

## Critères d'acceptation

1. Avec `--tune-every 2`, deux tickets intégrés et des observations récurrentes :
   - une session d'harmonisation est lancée après le second ticket, avec `TVLENS_TUNE=1` et
     `TVLENS_HARNESS_SCOPE=consignes` ;
   - son commit ne contient que des fichiers sous `.claude/skills/` ou `.claude/agents/` ;
   - les observations traitées sont marquées `harmonisation:<commit>`.
2. Sans `--tune-every`, aucune session d'harmonisation n'est lancée.
3. Sans observation récurrente ni d'impact `fort`, aucune session n'est lancée, et la sortie contient
   « Rien à harmoniser ».
4. Une session d'harmonisation qui modifie `scripts/check.mjs`, ou dont la dernière relecture n'est pas
   acceptée, est refusée :
   - après le refus, `git status --porcelain` ne montre plus aucun de ses fichiers ;
   - le ticket suivant est lancé ;
   - les observations restent en attente.
5. `--dry-run --tune-every 4` dit que l'harmonisation est active tous les 4 tickets.
6. `guard-write.mjs`, avec `TVLENS_LOOP=1`, `TVLENS_HARNESS=1` et `TVLENS_HARNESS_SCOPE=consignes` :
   - refuse `scripts/check.mjs`, `scripts/loop/run.mjs`, `.claude/hooks/guard-write.mjs` et
     `.claude/settings.json` ;
   - accepte `.claude/skills/ticket/SKILL.md` et `.claude/agents/relecteur.md`.
7. Mutation temporaire : la sélection ignore la règle « au moins deux tickets ». Le test du critère 3
   échoue ; la sortie rouge va au journal, puis la mutation est retirée.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs`, frontière : `scripts/loop/run.mjs` lancé dans le dépôt temporaire des tests
(`tests/helpers/harness-repo.cjs`). La fausse session joue l'harmonisation, comme elle joue déjà la
rétrospective. Le test du critère 4 prouve qu'une harmonisation qui touche aux contrôles ne laisse aucune
trace.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Une permission par session, pas par agent ni par durée.** La boucle donne déjà ses droits à une
  session par ses variables d'environnement (`TVLENS_HARNESS`), et elle vérifie le diff ensuite.
  L'harmonisation reçoit un droit plus étroit, `TVLENS_HARNESS_SCOPE=consignes`, vérifié deux fois :
  par le hook pendant la session, par la boucle après. Le déverrouillage limité dans le temps
  (`.harness-state/harnais-ouvert`) reste réservé aux sessions interactives : une session de la boucle
  l'ignore.
- **Les consignes seulement.** Les contrôles sont l'arbitre des tickets. Les assouplir est une décision du
  propriétaire : une proposition qui les vise reste dans le journal des retours, visible par
  `retro.mjs liste`.
- **La sélection par le code.** Le seuil (deux tickets, ou impact `fort`) et la limite de trois sujets
  sont fixes et testés ; le modèle ne choisit pas ce qu'il traite.
- **Une tentative, et le refus ne bloque pas la file.** Une harmonisation refusée est annulée et la nuit
  continue avec les tickets, qui restent la priorité.
- **Pas d'ADR.** L'étape suit le modèle de la rétrospective, déjà en place, et la règle de permission
  existante (`TVLENS_HARNESS`). Elle ne choisit pas entre deux architectures.

## Journal

### 14/10 — Cadrage et exploration

Session neuve, pas de reprise (journal vide, aucun rapport d'échec). Rapport complet dans
`.harness-state/tickets/T154/exploration.md`. En cinq lignes :
- `run.mjs` fait 457 lignes ; l'étape s'insère après `if (run.code !== 0) stop(run.code);` dans le corps de la boucle ;
  aucune remise à `HEAD` n'existe aujourd'hui, elle est à écrire (listes `-z`, snapshot frais, index).
- `reviewed-state.mjs record` répond « Ticket inconnu » pour un id `H…` sans `TVLENS_TICKET_FILE` ; les hooks
  `record-review` et `stop-gate` fonctionnent avec un id `H…`.
- `retro.mjs` n'exporte ni lecture ni décision ; `decider` n'accepte que `accepte|refuse|ticket:T…`.
- `guard-write` ignore déjà `harnais-ouvert` en boucle ; `guard-bash` ne protège aucun chemin, la portée ne tient
  que pour Edit et Write, le verrou réel est le contrôle du diff par la boucle.
- La fausse rétro produit toujours un `probleme` d'impact fort : le critère 3 et sa mutation demandent un journal
  semé avec `--no-retro`. Les tests ne poussent jamais (`--no-push`, pas de remote).

Décisions de l'orchestrateur avant l'implémentation, déclarées dans `.harness-state/tickets/T154/ecarts.md`
(neuf points) : `TVLENS_TICKET_FILE` vers `observations.json` du dossier H ; module dédié dans `scripts/loop/` ;
premier palier Opus (opus/high) ; règle de sélection précisée ; citation des observations dans le rapport, le
verdict et le commit, pas dans les consignes ; `unreviewedChange` en plus d'`unacceptedReview` ; diff contrôlé
avant `check.mjs` ; cas non précisés (TERMINÉ sans diff, PARTIEL, ordre commit, marquage, push) ; hook plus strict
sous la portée (`_gabarit.md`, portée inconnue fermée). Aucun écart ne sort du périmètre ni n'affaiblit un critère.

### 14/10 — Implémentation (premier passage de l'implémenteur)

- Nouveau `scripts/loop/tune.mjs` (sélection `selectSubjects`, étape `tuneInstructions`) ; `run.mjs` : option
  `--tune-every` validée, ligne du dry-run, `launchSession`, `commitPaths` et `pushBranch` extraits, compteur des
  tickets intégrés ; `retro.mjs` : `pendingObservations`, `decide`, décision `harmonisation:<commit>` ;
  `reviewed-state.mjs` : `statusEntries` exporté ; `guard-write.mjs` : portée `TVLENS_HARNESS_SCOPE` ; nouveaux
  `.claude/agents/harmoniseur.md` et `.claude/skills/harmonisation/SKILL.md` ; section du README.
- Rapporté par l'implémenteur : avant tout changement, `node --test --test-concurrency=1 tests/agent-guards.test.cjs
  tests/ticket-loop.test.cjs` 67/67 ; après, 82/82 ; chaque incrément vu rouge avant le vert ;
  `node scripts/check.mjs --changed` vert (`cas_de_test` 648 → 661) ; `node scripts/check.mjs` complet vert
  (704 tests JS, 84 Python dont 1 sauté ; Prettier et ESLint non lancés, non installés), lancé avant deux retouches
  du README.
- Deux écarts ajoutés à `ecarts.md` : `statusEntries` exporté de `reviewed-state.mjs` ; push testé par un dépôt nu
  local, événement `harmonisation-sans-changement`.

### 14/10 — Mutation du critère 7

Mutation temporaire dans `scripts/loop/tune.mjs` : `MIN_TICKETS = 2 -> 1` (la sélection ignore la règle « au moins
deux tickets »). Commande : `node --test --test-concurrency=1 --test-name-pattern="there is nothing to tune"
tests/ticket-loop.test.cjs`. Sortie rouge (complète dans `.harness-state/tickets/T154/mutation-7.txt`) :

```text
✖ with no problem that recurs or has a strong impact, the loop says there is nothing to tune and starts no session
ℹ tests 1 / pass 0 / fail 1
test at tests/ticket-loop.test.cjs:656:1
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Rien à harmoniser/. Input:
'[boucle] T001 intégré (60c940b) en 1 tentative(s), 0.00 $.\n' +
'[boucle] Harmonisation H001 : « slow review », « noisy hook » (R-T008-1, R-T008-2, R-T008-3).\n' +
'[boucle] Harmonisation H001 intégrée (247c28c) : 3 observation(s) traitée(s).\n'
# code de sortie : 1
```

Mutation retirée : empreinte SHA-1 de `tune.mjs` identique avant et après, le test repasse au vert (rapporté par
l'implémenteur ; `tune.mjs:13` vaut de nouveau 2, constaté par le relecteur).

### 14/10 — Relecture 1 : à corriger

`node scripts/loop/reviewed-state.mjs record` → `revue-1`. Relecteur neuf : « à corriger », 0 bloquant, 2 mineurs,
2 hors périmètre. Écarts 1 à 11 acceptés. Critères 1 à 6 tenus selon lui ; 7 sans trace au journal ; 8 non vérifié
par lui (pas de shell).
- Mineur 1 : un journal des retours illisible fait lever `pendingObservations` ou `decide` sans garde ; la boucle
  meurt après un ticket intégré (code 1), au lieu de sauter l'harmonisation et de continuer → implémenteur.
- Mineur 2 : la sortie rouge de la mutation absente du journal → jalon « Mutation du critère 7 » ci-dessus.
- Hors périmètre : sujets différés re-sélectionnés à chaque harmonisation ; la portée ouvre aussi `relecteur.md`,
  `harmoniseur.md` et `harmonisation/SKILL.md` → réserves.

### 14/10 — Correction du mineur 1 (second passage de l'implémenteur)

- `tune.mjs` : un journal des retours illisible à la lecture saute l'harmonisation (événement `harmonisation-sautee`,
  « Harmonisation sautée … La file continue. », code 0) ; un marquage impossible après le commit est signalé avec la
  commande pour le faire à la main, et le push a lieu quand même (`marquage_echoue`). README mis à jour.
- Rapporté par l'implémenteur : rouge avant, `node --test --test-concurrency=1 --test-name-pattern="feedback
  journal|cannot be marked|push is refused" tests/ticket-loop.test.cjs` → 3 tests, 2 échecs (`SyntaxError` levée par
  `pendingObservations` puis par `decide`, code ≠ 0) ; vert après, `tests/agent-guards.test.cjs
  tests/ticket-loop.test.cjs` 84/84 ; `node scripts/check.mjs --changed` vert (`cas_de_test` 648 → 663). Contrôle
  complet non relancé par lui.

### 14/10 — Contrôle complet sur l'état de la revue 2, puis relecture 2 : à corriger

- `node scripts/check.mjs` lancé juste après `reviewed-state.mjs record` (`revue-2`), sortie dans
  `.harness-state/tickets/T154/check-complet-1.txt` : `check : vert`, code 0 ; règles par fichier ✔, cliquet ✔
  (`cas_de_test` 648 → 663), tests JS 706/706 (76 fichiers), Python 84 OK (1 sauté) ; format et lint non lancés
  (Prettier et ESLint non installés).
- Relecteur neuf sur `revue-2` : « à corriger », 0 bloquant, 1 mineur, 3 hors périmètre. Écarts 1 à 11 acceptés ;
  critères 1 à 7 tenus ; mineurs de la revue 1 corrigés.
- Mineur : la liste des dossiers de la portée « consignes » est écrite deux fois (`guard-write.mjs` et `tune.mjs`),
  contre la règle « une constante vit à un seul endroit » → implémenteur : une seule définition dans un petit module
  de `scripts/loop/`, importée par les deux.
- Hors périmètre (réserves) : différées re-sélectionnées ; la portée ouvre les consignes du relecteur et de
  l'harmonisation ; `session-context.mjs` et `stop-gate.mjs` citent la skill `ticket` en session d'harmonisation.

### 14/10 — Correction du mineur de la relecture 2 (troisième passage de l'implémenteur)

- Nouveau `scripts/loop/harness-scopes.mjs` (sans import) : seule définition de la portée « consignes », importée par
  `guard-write.mjs` et `tune.mjs` ; écart 12 déclaré. Rapporté par l'implémenteur : `tests/agent-guards.test.cjs
  tests/ticket-loop.test.cjs` 84/84 sans changement de test ; `node scripts/check.mjs --changed` vert.

### 14/10 — Contrôle complet sur l'état de la revue 3, puis relecture 3 : à corriger

- `node scripts/check.mjs` lancé juste après `reviewed-state.mjs record` (`revue-3`), sortie dans
  `.harness-state/tickets/T154/check-complet-2.txt` : `check : vert`, code 0 ; cliquet ✔ (`cas_de_test` 648 → 663),
  tests JS 706/706, Python 84 OK (1 sauté) ; format et lint non lancés.
- Relecteur neuf sur `revue-3` : « à corriger », 0 bloquant, 1 mineur, 4 hors périmètre. Écarts 1 à 12 acceptés ;
  critères 1 à 7 tenus.
- Mineur : un refus annonce la remise à `HEAD` avant de la vérifier, et lance le ticket suivant même si elle a échoué
  (par exemple un `.git/index.lock` resté en place) ; un `check.mjs` modifié par la session refusée serait alors
  exécuté par le ticket suivant → implémenteur (troisième tour de correction) : vérifier ce qui reste, et s'il reste
  des fichiers, arrêter la boucle avec un code documenté.
- Hors périmètre de plus : `.harness-state/` n'est pas protégé, une session peut trancher elle-même une observation.

### 14/10 — Correction du mineur de la relecture 3 (troisième tour de correction)

- `tune.mjs` : la remise à `HEAD` relève le code de chaque commande Git puis revérifie l'arbre avant toute annonce ;
  remise incomplète → événement `harmonisation-non-defaite`, message (fichiers restants, quoi examiner), arrêt de la
  boucle avec le code 4 (`DIRTY_TREE_EXIT`), aucun ticket lancé. En-tête de `run.mjs` et README (codes de sortie,
  « Lire un échec », événements) mis à jour.
- Rapporté par l'implémenteur : rouge avant, `node --test --test-concurrency=1 --test-name-pattern="cannot be undone"
  tests/ticket-loop.test.cjs` → 1 échec sur `assert.equal(result.code, 4)` (« remises à HEAD ; la file continue »
  affiché, puis T002 lancé et ses quatre tentatives refusées) ; vert après, `tests/agent-guards.test.cjs
  tests/ticket-loop.test.cjs` 85/85 ; `node scripts/check.mjs --changed` vert (`cas_de_test` 648 → 664).

### 14/10 — Contrôle complet sur l'état de la revue 4, relecture 4 : acceptée

- `node scripts/loop/reviewed-state.mjs record` → `revue-4` (17:49:50) ; `node scripts/check.mjs` lancé juste après,
  sans modification depuis (sortie terminée à 17:51:56, `.harness-state/tickets/T154/check-complet-3.txt`) :
  `check : vert`, code 0 ; règles par fichier ✔, cliquet ✔ (`cas_de_test` 648 → 664), tests JS 707/707 (76 fichiers),
  Python 84 OK (1 sauté) ; format et lint non lancés (Prettier et ESLint non installés).
- Relecteur neuf sur `revue-4` : « accepté », 0 bloquant, 0 mineur, 4 hors périmètre ; critères 1 à 8 tenus (le 8 sur
  la sortie du contrôle, sans shell) ; écarts 1 à 12 acceptés. Les hors périmètre et ce qui n'a pas été vérifié vont
  en réserves dans le verdict.

### Réserves à la clôture

- Hors périmètre : .harness-state/ n'est pas protégé ; une session (ticket ou harmonisation) peut ajouter un « accepté » à relectures.jsonl, ajouter un chemin à untracked-before.json (le fichier est alors exclu de la revue mais intégré, changedSince utilisant la liste gardée en mémoire) ou trancher elle-même une observation du journal des retours.
- Hors périmètre, décision du propriétaire : la portée « consignes » ouvre aussi relecteur.md, harmoniseur.md et harmonisation/SKILL.md ; une harmonisation peut réécrire les consignes de son propre relecteur (le critère 6 exige que relecteur.md soit accepté). Garde-fous restants : relecteur neuf, règle « ne retire aucune vérification », annulation du commit d'harmonisation.
- Hors périmètre, question pour le propriétaire : une observation différée reste « propose » et est re-sélectionnée à chaque harmonisation ; sur le journal réel, des sujets récurrents de cible controle ou boucle occuperaient durablement des places et coûteraient une session Opus tous les N tickets. Filtrer la sélection par cible (skill, agent), ou ajouter un statut « différée » ?
- Hors périmètre : session-context.mjs (« Suis la skill ticket ») et stop-gate.mjs:59 citent la skill ticket pendant une harmonisation ; harmonisation/SKILL.md le neutralise par une phrase.
- Écarts acceptés par le relecteur (ecarts.md, points 1 à 12) : TVLENS_TICKET_FILE vers observations.json en plus des variables du ticket ; modules scripts/loop/tune.mjs et scripts/loop/harness-scopes.mjs, extraction de launchSession, commitPaths et pushBranch ; premier palier Opus (opus/high, relecteur opus) ; règle de sélection précisée ; citation des observations dans le rapport, le verdict et le message d'intégration, pas dans les consignes ; unreviewedChange en plus d'unacceptedReview ; diff contrôlé avant check.mjs ; TERMINÉ sans diff sans intégration, PARTIEL ou BLOQUÉ traités en refus, marquage avant le push ; hook plus strict (gabarit, portée inconnue) ; statusEntries exporté ; push testé par un dépôt nu local.
- Comportement non prévu par le ticket, demandé par les relectures : une remise à HEAD incomplète après un refus arrête la boucle avec le code 4 (documenté) au lieu de lancer le ticket suivant ; un journal des retours illisible saute l'harmonisation et la file continue ; un marquage impossible après intégration est signalé et le push a lieu.
- Non vérifié : aucune vraie session claude -p n'a suivi la skill harmonisation (seule la fausse session est testée) ; le push vers le vrai origin n'est pas exercé (dépôt nu local seulement).
- Non vérifié : le commentaire de scripts/loop/harness-scopes.mjs « un hook qui plante laisse passer l'écriture » est peut-être inexact, .claude/settings.json déclarant "onFailure": "block" pour guard-write ; sans effet sur le comportement.
- Question pour le propriétaire : l'harmonisation tourne en opus/high, alors que les tickets harnais: oui partent en opus/xhigh (niveau critique) ; garder high ?
