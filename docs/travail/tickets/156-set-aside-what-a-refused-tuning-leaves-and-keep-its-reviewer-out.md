---
id: T156
titre: Set aside what a refused tuning leaves, keep its reviewer out of its reach and brief the next one
statut: a-faire
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
