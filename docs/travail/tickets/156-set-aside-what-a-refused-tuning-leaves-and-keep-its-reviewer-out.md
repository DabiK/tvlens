---
id: T156
titre: Set aside what a refused tuning leaves, keep its reviewer out of its reach and brief the next one
statut: termine
bloque_par: T154
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Depuis T154, `node scripts/loop/run.mjs --tune-every N` lance une harmonisation des consignes tous les N
tickets intégrés, sans personne pour regarder. Quatre défauts la rendent risquée ou inutilement chère :

- **Une suppression définitive.** Une harmonisation refusée est défaite. La boucle supprime alors par
  `rm -rf` tout fichier non suivi apparu pendant la session, même s'il ne vient pas d'elle : un fichier que
  le propriétaire ou une autre session crée dans `experiments/` pendant ce temps disparaît.
- **Le relecteur à portée de main.** La portée « consignes » ouvre `.claude/agents/relecteur.md`,
  `.claude/agents/harmoniseur.md` et `.claude/skills/harmonisation/`. Une harmonisation peut donc
  réécrire les consignes de son propre relecteur et sa propre marche.
- **Des places perdues.** La sélection retient des sujets qui visent les contrôles ou la boucle,
  `controle` et `boucle` par exemple. L'harmonisation doit les différer. Comme une observation différée
  reste `propose`, elle est reprise à chaque harmonisation et occupe une place pour rien.
- **Une reprise à l'aveugle.** Une harmonisation refusée ne laisse rien à la suivante, qui ignore pourquoi
  la précédente a échoué.

Après ce ticket, la boucle met de côté au lieu de supprimer, et la portée « consignes » ferme le relecteur
et l'harmonisation elle-même. La sélection ne retient que ce qu'une harmonisation peut corriger. Une
observation différée sort de la sélection et attend le propriétaire, et une harmonisation qui suit un
refus lit la raison de ce refus et le dernier rapport du relecteur.

## Sources

- Décision du propriétaire, le 14/10 : corriger ces quatre points avant la première harmonisation de la
  nuit. Le propriétaire a demandé qu'une harmonisation refusée laisse à la suivante « les commentaires de
  la review ».
- Réserves de T154, dans son journal et son commit `fc528f9` : la portée qui ouvre `relecteur.md`, et
  l'observation différée reprise à chaque harmonisation.
- Simulation de la sélection sur le vrai journal des retours, le 14/10 : sur trois sujets retenus, deux
  visaient `controle` et `boucle`. Le propriétaire les a tranchés à la main avec `retro.mjs decider`.
- Code concerné, à la version `d27ae57` :
  - `scripts/loop/tune.mjs` :
    - `pendingProblemsBySubject` (l. 26-38) et `selectSubjects` (l. 45-51) : la sélection, sans regard
      sur la `cible` ;
    - `prepare` (l. 73-83) et `tunePrompt` (l. 85-92) : le dossier d'état et la consigne de la session ;
    - `deferredOf` (l. 113-117) : les différées, aujourd'hui seulement affichées ;
    - `removeAdded` (l. 157-170) : `fs.rmSync(…, { recursive: true, force: true })` sur chaque fichier non
      suivi absent de la liste d'avant la session ;
    - `restore` (l. 176-191), `refuse` (l. 208-215), `integrateTuning` (l. 241-259) et
      `tuneInstructions` (l. 267-298) ;
  - `scripts/loop/harness-scopes.mjs` : `SCOPES`, `scopeDirs` et `inScope`, la seule définition de la
    portée. Le hook et la boucle l'importent ;
  - `.claude/hooks/guard-write.mjs` (l. 44-51) : le refus hors de la portée ;
  - `scripts/loop/retro.mjs` :
    - `TARGETS` (l. 15) : `skill`, `agent`, `hook`, `boucle`, `ticket`, `controle`, `autre` ;
    - `listCommand` (l. 132-144) ;
    - `DECISION` (l. 147) ;
    - `pendingObservations` (l. 151-153) ;
    - `decide` (l. 159-168) ;
  - `scripts/loop/reviewed-state.mjs` : `recordReview`, qui n'écrit que le verdict dans `relectures.jsonl` ;
  - `.claude/hooks/record-review.mjs` : il lit le texte du rapport (`report`) pour en tirer le verdict, puis
    le jette ;
  - `.claude/skills/harmonisation/SKILL.md` : étape 1 et étape 7 (« Elle reste en attente »), et
    `.claude/agents/harmoniseur.md` ;
  - `tests/agent-guards.test.cjs` (l. 148-157) : le test du critère 6 de T154, qui accepte aujourd'hui
    `.claude/agents/relecteur.md` sous la portée « consignes » ;
  - `tests/ticket-loop.test.cjs` : la fausse session d'harmonisation (`FAKE_TUNE`, l. 68-130) et les tests
    de l'harmonisation ;
  - `docs/travail/README.md`, section « Harmonisation des consignes » (l. 206-265).

## Périmètre

- À modifier :
  - `scripts/loop/tune.mjs` :
    - **mettre de côté.** Une harmonisation refusée déplace chaque fichier non suivi apparu pendant la
      session vers `.harness-state/tickets/<id>/mis-de-cote/`, sous son chemin relatif, au lieu de le
      supprimer. La boucle affiche la liste de ces fichiers et leur dossier, et l'événement de refus les
      porte. La vérification de `restore` ne change pas : un arbre resté sale arrête toujours la boucle ;
    - **sélection.** Seules comptent les observations dont la `cible` est `skill` ou `agent`, liste
      nommée une fois. Un sujet qui mêle plusieurs cibles n'apporte que ses observations `skill` et `agent`,
      et les tickets distincts se comptent sur celles-là. Les autres restent en attente pour le
      propriétaire ;
    - **différées.** Quand l'harmonisation est intégrée, ou terminée sans changement, chaque observation
      différée, parmi celles que la boucle a retenues, passe à `differee:<id>`. Sa raison va dans la note.
      Après un refus, aucune n'est marquée ;
    - **reprise après un refus.** Si l'harmonisation précédente, celle au numéro juste inférieur, a été
      refusée, la consigne de la session nomme son `refus.txt` et, s'il existe, le dernier rapport du
      relecteur de cette harmonisation (voir `recordReview`). Après une harmonisation intégrée, ou pour la
      première, la consigne n'en nomme aucun ;
  - `scripts/loop/harness-scopes.mjs` : la portée « consignes » ouvre `.claude/skills/` et
    `.claude/agents/`, sauf `.claude/agents/relecteur.md`, `.claude/agents/harmoniseur.md` et
    `.claude/skills/harmonisation/`. L'exception vit dans ce seul module, que le hook et la boucle lisent ;
  - `scripts/loop/retro.mjs` :
    - `decide` accepte aussi `differee:H<nnn>` ;
    - `liste` montre les observations `propose` et `differee:…`, toutes deux en attente du propriétaire,
      la seconde avec sa décision et sa note ;
    - la sélection continue de ne lire que les `propose` ;
  - `scripts/loop/reviewed-state.mjs` et `.claude/hooks/record-review.mjs` : chaque relecture enregistrée
    garde aussi le texte de son rapport, dans `relecture-<n>.md` du dossier d'état, `n` étant le rang de sa
    ligne dans `relectures.jsonl`. Cela vaut pour les tickets comme pour les harmonisations ;
  - `.claude/skills/harmonisation/SKILL.md` :
    - étape 1 : lire d'abord le refus précédent quand la consigne le nomme ;
    - étape 7 : une différée passe à `differee:<ID>` et attend le propriétaire ;
    - les fichiers que la portée ferme ;
  - `.claude/agents/harmoniseur.md` : une observation qui demanderait de modifier un fichier fermé par la
    portée est différée, avec sa raison ;
  - `tests/ticket-loop.test.cjs` : de nouveaux scénarios de la fausse session et les tests des critères 1 et
    3 à 6 ;
  - `tests/agent-guards.test.cjs` : le test du critère 2. Le cas `.claude/agents/relecteur.md` passe de
    « accepté » à « refusé » : c'est un contrôle plus strict, décidé par le propriétaire ;
  - `docs/travail/README.md`, section « Harmonisation des consignes » et tableau des fichiers d'état :
    - ce qui est mis de côté, et où ;
    - les fichiers fermés ;
    - les cibles retenues ;
    - le statut `differee:<id>` et comment le trancher ;
    - la reprise après un refus ;
    - `relecture-<n>.md`.
- À ne pas toucher :
  - `scripts/check.mjs`, `scripts/quality/` et le plancher du cliquet. `cas_de_test` peut monter, jamais
    baisser ;
  - les seuils de la sélection (`MIN_TICKETS`, `STRONG_IMPACT`, `MAX_SUBJECTS`) et l'ordre des contrôles
    de `refusal` ;
  - `gates` et `integrate` des tickets dans `scripts/loop/run.mjs`, et la rétrospective (`runRetro`) ;
  - les autres tickets.

## Critères d'acceptation

1. Une harmonisation refusée, parce que son diff touche `scripts/check.mjs`, pendant laquelle deux fichiers
   non suivis apparaissent, `notes/extra.md` et `experiments/idea.md` :
   - après le refus, `git status --porcelain` ne montre plus aucun de ces fichiers ;
   - les deux sont dans `.harness-state/tickets/H001/mis-de-cote/`, sous leur chemin, avec leur contenu
     d'origine ;
   - la sortie de la boucle les nomme ;
   - le ticket suivant est lancé.
2. `guard-write.mjs`, avec `TVLENS_LOOP=1`, `TVLENS_HARNESS=1` et `TVLENS_HARNESS_SCOPE=consignes` :
   - refuse `.claude/agents/relecteur.md`, `.claude/agents/harmoniseur.md` et
     `.claude/skills/harmonisation/SKILL.md` ;
   - accepte toujours `.claude/skills/ticket/SKILL.md` et `.claude/agents/explorateur.md`.
   Une harmonisation dont le diff touche `.claude/agents/relecteur.md` est refusée par la boucle, et
   défaite.
3. Sélection :
   - un problème en attente qui revient sur deux tickets avec la cible `controle` ne lance aucune session,
     et la sortie contient « Rien à harmoniser » ;
   - un sujet aux cibles `skill` et `boucle` n'apporte à `observations.json` que ses observations `skill`.
4. Différées : une harmonisation intégrée qui traite une observation et en diffère une autre.
   - La première passe à `harmonisation:<commit>`, la seconde à `differee:H001`, avec sa raison en note.
   - Une harmonisation suivante, sur le même journal, ne retient plus la différée.
   - `node scripts/loop/retro.mjs liste` la montre, avec sa décision.
   - Après un refus, aucune observation ne passe à `differee:…`.
5. Reprise :
   - après une harmonisation H001 refusée, la consigne de H002 nomme
     `.harness-state/tickets/H001/refus.txt` et le dernier `relecture-<n>.md` de H001 ;
   - après une H001 intégrée, la consigne de H002 n'en nomme aucun.
6. Une relecture enregistrée par `record-review.mjs` écrit le texte du rapport dans `relecture-<n>.md`, avec
   le bon rang, pour un ticket comme pour une harmonisation.
7. Mutation temporaire : la sélection ignore la `cible`. Le premier test du critère 3 échoue. La sortie
   rouge va au journal, puis la mutation est retirée.
8. Les tests existants de l'harmonisation restent verts, sans qu'aucune assertion soit affaiblie. Seul
   change le cas `.claude/agents/relecteur.md` du critère 2, qui devient plus strict.
9. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs`, frontière : `scripts/loop/run.mjs` lancé dans le dépôt temporaire des tests
(`tests/helpers/harness-repo.cjs`), avec la fausse session d'harmonisation (`FAKE_TUNE`). Le test du
critère 1 crée les deux fichiers pendant la session refusée, puis les retrouve mis de côté, intacts.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Mettre de côté, pas supprimer.** La boucle ne peut pas savoir qui a créé un fichier pendant la
  session. Le déplacer dans `.harness-state/`, hors Git, nettoie l'arbre sans rien perdre ; le
  propriétaire le récupère à la main.
- **Le relecteur et l'harmonisation hors de portée.** Ce sont les arbitres d'une harmonisation, comme les
  contrôles sont ceux d'un ticket. Les modifier reste la décision du propriétaire, par un ticket
  `harnais: oui`. La skill `ticket` reste ouverte : c'est elle que visent la plupart des problèmes qui
  reviennent. La règle « ne retire aucune vérification » et le relecteur neuf la gardent.
- **`skill` et `agent` seulement.** Ce sont les seules cibles qu'une harmonisation peut modifier. Les
  autres (`hook`, `boucle`, `controle`, `ticket`, `autre`) sont pour le propriétaire, par
  `retro.mjs liste`.
- **Un statut `differee:<id>`.** Une différée attend une décision humaine. La reprendre à chaque
  harmonisation coûte une session et ne change rien.
- **La seule harmonisation précédente.** Une reprise lit le refus juste avant elle, pas tout l'historique :
  une consigne courte, un contexte borné.
- **Pas d'ADR.** Ces changements resserrent une étape existante, sans choisir entre deux architectures.

## Journal

### 14/10 — Cadrage et exploration

Session neuve, pas de reprise (journal vide, aucun rapport d'échec). Rapport complet dans
`.harness-state/tickets/T156/exploration.md`. En cinq lignes :
- Les numéros de ligne du ticket tombent juste sur `df302a3` ; `run.mjs` (503 lignes) n'a pas à changer, tout se
  branche dans `tune.mjs` (`pendingProblemsBySubject`, `prepare`/`tunePrompt`, `restore`/`refuse`, `integrateTuning`).
- Reprise : seul `refus.txt` distingue un H refusé d'un H intégré ; la fausse session passe par le vrai hook
  `record-review`, donc `relecture-1.md` existera dans H001 pour les scénarios relus.
- `retro.mjs` : `DECISION` doit accepter `differee:H\d+` avant tout marquage ; `liste` affiche déjà la décision et la
  note d'un statut autre que `propose`.
- Deux tests existants (l. 836-851, 853-863) affirment `propose` pour une différée, contre le critère 4 ; la fausse
  rétrospective sème un problème `cible: "boucle"` dont dépendent sept exécutions de tests d'harmonisation.
- Le message de refus de périmètre est vérifié au format exact (l. 734) ; des passages du README hors des sections
  citées deviendront faux.

Décisions avant l'implémentation, déclarées dans `.harness-state/tickets/T156/ecarts.md` : quatre écarts (assertions
`propose` → `differee:H001` des deux tests existants ; `FAKE_RETRO_TARGET` dans la fausse rétrospective, sans
changer d'assertion ; volet boucle du critère 2 et critère 6 dans `ticket-loop` ; passages du README hors section)
et cinq précisions (message de refus, signal de reprise, différées marquées une par une, rang de
`relecture-<n>.md`, erreurs de déplacement). Aucun ne sort du périmètre ni n'affaiblit un critère.

### 14/10 — Implémentation (premier passage de l'implémenteur)

- `harness-scopes.mjs` : liste fermée de la portée `consignes` (`relecteur.md`, `harmoniseur.md`, `harmonisation/`),
  `closedLine` pour le message ; `guard-write.mjs` ajoute cette ligne. `tune.mjs` : `TUNABLE_TARGETS` (`skill`,
  `agent`) avant le regroupement ; `markDeferred` après intégration et sans changement ; `setAsideAdded` remplace
  `removeAdded` ; `previousRefusal` dans `prepare`, nommé par `tunePrompt`. `retro.mjs` : `differee:H<n>`, `liste`
  montre `propose` et `differee:…`. `reviewed-state.mjs` : `recordReview` écrit `relecture-<n>.md`,
  `lastReviewReport` ; `record-review.mjs` passe le texte. Consignes de l'harmonisation et README à jour.
- Rapporté par l'implémenteur : avant tout changement, `node --test --test-concurrency=1 tests/agent-guards.test.cjs
  tests/ticket-loop.test.cjs` 85/85 ; après, 98/98 ; chaque incrément vu rouge avant le vert (deux tests vus rouges
  par une mutation temporaire après coup, un test négatif de la reprise vert dès le départ) ;
  `node scripts/check.mjs --changed` vert (`cas_de_test` 664 → 677) ; `node scripts/check.mjs` complet vert (720
  tests JS, 84 Python dont 1 sauté ; Prettier et ESLint non lancés, non installés), lancé avant une dernière retouche
  de mise en forme du README.
- Deux points ajoutés à `ecarts.md` (10 et 11) : un passage de plus du README ; noms de deux tests d'`agent-guards`
  et texte de deux messages.

### 14/10 — Mutation du critère 7

Mutation temporaire dans `scripts/loop/tune.mjs`, `pendingProblemsBySubject` : `|| !TUNABLE_TARGETS.has(o.cible)`
retiré (la sélection ignore la cible). Commande : `node --test --test-concurrency=1 --test-name-pattern="a problem
that recurs on two tickets but targets the checks starts no tuning session" tests/ticket-loop.test.cjs`. Sortie rouge
(complète dans `.harness-state/tickets/T156/mutation-7.txt`) :

```text
✖ a problem that recurs on two tickets but targets the checks starts no tuning session: there is nothing to tune
ℹ tests 1 / pass 0 / fail 1
test at tests/ticket-loop.test.cjs:700:1
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Rien à harmoniser/. Input:
'[boucle] T001 intégré (02a9fa2) en 1 tentative(s), 0.00 $.\n' +
'[boucle] Harmonisation H001 : « slow check » (R-T008-1, R-T009-1).\n' +
'[boucle] Harmonisation H001 intégrée (e1769e9) : 2 observation(s) traitée(s).\n'
# Code de sortie : 1
```

Mutation retirée : empreinte SHA-256 de `tune.mjs` identique avant et après (`fcc3af66…66d1d38f`), le test repasse au
vert (1/1), rapporté par l'implémenteur.

### 14/10 — Relecture 1 : à corriger

`node scripts/loop/reviewed-state.mjs record` → `revue-1`. Relecteur neuf : « à corriger », 0 bloquant, 1 mineur,
2 hors périmètre. Écarts 1 à 4 et 10 à 11, précisions 5 à 9 acceptés. Critères 1 à 7 couverts selon lui ; 8 et 9
non vérifiés par lui (pas de shell). Il note que la mutation du critère 7 a été faite sur un état intermédiaire
(lignes décalées, empreinte qui n'est pas celle du `tune.mjs` final).
- Mineur 1 : `.claude/hooks/guard-write.mjs` modifié (seconde ligne du message de refus) sans être dans le
  périmètre ni déclaré. Décision : déclaré (point 12 de `ecarts.md`) plutôt que retiré, car sans lui le message de
  refus de `relecteur.md` se contredit ; l'exception reste dans le seul `harness-scopes.mjs`. Aucun changement de code.
- Hors périmètre : `.harness-state/` non protégé, une session peut écrire un faux `refus.txt` ou rapport que la
  reprise lira ; comparaison de la portée sensible à la casse sur un disque qui ne l'est pas → réserves.
- Mutation du critère 7 refaite sur l'état final par l'implémenteur, sans autre modification (jalon suivant).

### 14/10 — Mutation du critère 7, refaite sur l'état final

Même mutation (`tune.mjs:39`, `|| !TUNABLE_TARGETS.has(o.cible)` retiré), même commande, test désormais en
`tests/ticket-loop.test.cjs:746`. Sortie complète dans `.harness-state/tickets/T156/mutation-7-final.txt` :

```text
✖ a problem that recurs on two tickets but targets the checks starts no tuning session: there is nothing to tune
ℹ tests 1 / pass 0 / fail 1
test at tests/ticket-loop.test.cjs:746:1
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Rien à harmoniser/. Input:
'[boucle] Harmonisation H001 : « slow check » (R-T008-1, R-T009-1).\n' +
'[boucle] Harmonisation H001 intégrée (c90228d) : 2 observation(s) traitée(s).\n'
# Code de sortie : 1
```

Mutation retirée : SHA-256 de `tune.mjs` `a585f1f8…0bf5fdfa` avant et après (constaté par l'orchestrateur avec
`shasum -a 256` après coup), empreinte de `git diff` identique avant et après, le test repasse au vert (1/1).
Constat au passage : la session réelle a déjà écrit `.harness-state/tickets/T156/relecture-1.md` par le hook modifié.

### 14/10 — Contrôle complet

`node scripts/check.mjs`, lancé par l'orchestrateur sur l'état final (après la mutation refaite, avant
l'enregistrement de `revue-2`) : vert. Règles par fichier vertes ; cliquet vert, `cas_de_test` 664 → 677 ; tests JS
720/720 sur 76 fichiers ; tests Python 84, OK (1 sauté). Format et lint non lancés : Prettier et ESLint ne sont pas
installés.

### 14/10 — Relecture 2 : acceptée

`node scripts/loop/reviewed-state.mjs record` → `revue-2` (même code que `revue-1`, écart 12 ajouté à `ecarts.md`).
Relecteur neuf : « accepté », 0 bloquant, 0 mineur, 3 hors périmètre. Écarts 1 à 4 et 10 à 12, précisions 5 à 9
acceptés ; le mineur de la relecture 1 tombe avec l'écart 12. Critères 1 à 7 couverts selon lui (7 sur la mutation
refaite) ; 8 tenu à la lecture du diff ; 8 et 9 non lancés par lui (pas de shell). Verdict enregistré dans
`relectures.jsonl` (`revue-2.diff`, « accepté ») et rapport dans `relecture-2.md`.
- Hors périmètre, en réserves : `.harness-state/` non protégé (faux `refus.txt` ou rapport lus par la reprise) ;
  comparaison de la portée sensible à la casse ; fermeture par chemin, pas par `name` d'agent ou de skill.

### Réserves à la clôture

- Écart accepté, critère 8 : deux tests existants de l'harmonisation affirmaient « propose » pour une différée, contre le critère 4 ; ils affirment désormais differee:H001 avec la raison en note (plus strict), et leurs noms décrivent ce comportement.
- Écart accepté, critère 8 : la fausse rétrospective des tests lit sa cible dans FAKE_RETRO_TARGET (défaut boucle) ; les tests d'harmonisation qui dépendent de son problème la fixent à skill, sans changer d'assertion existante.
- Écart accepté, critères 2 et 6 : le volet boucle du critère 2 et le critère 6 sont prouvés dans tests/ticket-loop.test.cjs par run.mjs ; le volet hook du critère 2 et les rangs du hook record-review dans tests/agent-guards.test.cjs.
- Écart accepté, périmètre : des passages de docs/travail/README.md hors de la section « Harmonisation des consignes » (« Rétrospective », « Garde-fous », « Lire un échec », « Ce que fait la boucle ») sont mis à jour, sinon ils devenaient faux.
- Écart accepté, critère 8 : deux tests d'agent-guards renommés (portée, hook record-review) et le texte de deux messages de la boucle retouché, sans assertion retirée ni relâchée.
- Écart accepté, périmètre : .claude/hooks/guard-write.mjs ajoute à son message de refus une ligne qui nomme les fichiers fermés (closedLine de harness-scopes.mjs) ; la décision reste inScope et la liste n'est pas recopiée.
- Hors périmètre : .harness-state/ n'est pas protégé des écritures de session ; une harmonisation intégrée pourrait déposer un faux refus.txt ou un faux relecture-<n>.md que la reprise de la suivante lui ferait lire en premier (même famille que la réserve de T154). Proposition : un ticket harnais: oui qui protège .harness-state/tickets/<ID>/ dans PROTECTED.
- Hors périmètre : la portée et PROTECTED comparent les chemins en tenant compte de la casse alors qu'APFS n'en tient pas compte ; une écriture vers .claude/agents/Relecteur.md passe le hook (la boucle la rattrape et défait la session, qui est perdue).
- Hors périmètre, question pour le propriétaire : la fermeture se fait par chemin ; un nouveau .claude/agents/<autre>.md déclarant name: relecteur (ou une skill déclarant name: harmonisation) reste dans la portée. Non vérifié : comment Claude Code choisit entre deux agents du même nom. Faut-il aussi fermer par nom ?
- Non vérifié : un déplacement impossible (rename en échec) n'est pas testé directement ; le code 4 avec mise de côté est testé par un index.lock.
- Non vérifié : une skill mise de côté sous .harness-state/tickets/H…/mis-de-cote/.claude/skills/… pourrait être découverte par Claude Code comme skill imbriquée.
- Observation pour le propriétaire : le hook guard-bash a refusé une commande de l'implémenteur parce que le texte « git checkout HEAD » figurait dans un heredoc, pas dans une commande (faux positif, rien n'a été exécuté).
