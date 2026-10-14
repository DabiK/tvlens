---
id: T154
titre: Tune the harness instructions from recurring retrospective findings every few tickets
statut: a-faire
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
