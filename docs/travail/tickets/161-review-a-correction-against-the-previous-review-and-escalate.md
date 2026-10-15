---
id: T161
titre: Review a correction against the previous review, and escalate when a finding is not fixed
statut: a-faire
bloque_par: T160
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Aujourd'hui, chaque relecture après une correction est une relecture complète par un relecteur neuf. Il ne sait pas
ce qu'on lui a demandé de vérifier, relit tout le code, et trouve souvent de nouveaux constats mineurs sur du code que
la correction n'a pas touché. La correction suivante en appelle une autre, et le ticket tourne sans converger.

L'escalade arrive aussi trop tard. Une tentative peut enchaîner trois corrections sur le même palier. Un sujet trop dur
pour le modèle du palier coûte donc jusqu'à quatre relectures avant de monter d'un palier.

Après ce ticket, la première relecture d'une tentative reste complète. Chaque relecture suivante est une **relecture
de correction**. Le relecteur reçoit son rapport précédent et le diff exact entre l'état relu précédent et l'état
actuel. Il fait trois choses :
- il dit, pour chaque constat bloquant ou mineur du rapport précédent, s'il est corrigé ;
- il cherche les régressions dans le code que la correction a changé ;
- il classe un nouveau constat sur du code que la correction n'a pas touché « hors périmètre », comme réserve, sauf
  s'il est bloquant.

Une tentative compte deux corrections au plus. Un constat que la relecture de correction déclare non corrigé refuse la
tentative tout de suite : la boucle passe au palier suivant au lieu de redemander la même correction au même modèle.
Les deux moteurs suivent ces règles.

## Sources

- Décision du propriétaire, le 15/10 : faire converger les corrections. Une relecture de correction ne relit que ce qui
  a changé, et l'escalade se déclenche quand un constat revient.
- Constaté le 15/10 sur l'outil `watch-loop`, relu hors ticket :
  - cinq relectures complètes par des relecteurs neufs, avec chaque fois de nouveaux mineurs sur du code inchangé ;
  - la relecture de correction faite ensuite à l'essai a pris 4 minutes au lieu de 10, et elle a trouvé le seul
    défaut réel du tour, un débordement sur une section du README.
- T141 : une session de ticket ne reprend pas un relecteur. Le regard neuf est gardé : le relecteur de correction est
  un relecteur neuf, qui reçoit le rapport précédent et le diff, et non le précédent relecteur repris.
- Code concerné, à la version `39e6cfb` :
  - `scripts/loop/codex.mjs` : `review`, la boucle des corrections, `MAX_CORRECTIONS` ;
  - `scripts/loop/reviewed-state.mjs` : `record` (`revue-<n>.diff`, `revue-<n>.fichiers`, `reviewed-state.json`),
    `recordReview`, `reviewVerdict`, `lastReviewReport`, la commande `record` ;
  - `.claude/agents/relecteur.md` : ce que vérifie le relecteur et la forme de son rapport (`VERDICT : …`,
    `CONSTATS : …`) ;
  - `.claude/hooks/record-review.mjs` : lecture du verdict dans le rapport d'un relecteur Claude ;
  - `.claude/skills/ticket/SKILL.md`, étapes 5 et 6 (« Trois tours au plus ») ;
  - `.agents/skills/ticket-codex/SKILL.md`, section « Reprendre après une relecture » ;
  - `tests/ticket-loop.test.cjs`, `tests/agent-guards.test.cjs`, `tests/helpers/codex-session.cjs`.

## Périmètre

- À modifier :
  - `scripts/loop/reviewed-state.mjs` :
    - `record` garde une empreinte Git de l'état relu, fichiers nouveaux du ticket compris, sans toucher à l'index ni à
      l'arbre de travail (par exemple un index temporaire et `git write-tree`) ;
    - à partir du deuxième état relu d'un ticket, `record` écrit `revue-<n>.interdiff` : le diff entre l'état relu
      précédent et l'état actuel. La commande `record` en affiche le chemin ;
    - une fonction lit, dans un rapport de relecture de correction, la ligne `NON CORRIGÉS : <n>` ;
  - `scripts/loop/codex.mjs` :
    - à partir de la deuxième relecture d'une tentative, la consigne du relecteur nomme le rapport précédent
      (`relecture-<n>.md`) et `revue-<n>.interdiff`, et demande une relecture de correction ;
    - `MAX_CORRECTIONS` passe à 2 ;
    - une relecture de correction qui déclare au moins un constat non corrigé refuse la tentative sans nouvelle
      correction. La raison nomme le rapport et dit que la boucle passe au palier suivant. Une ligne `NON CORRIGÉS`
      absente ou illisible dans une relecture de correction compte comme un constat non corrigé ;
  - `.claude/agents/relecteur.md` : une section « Relecture de correction » avec les trois règles ci-dessus, et la ligne
    `NON CORRIGÉS : <n>` du rapport, juste après `CONSTATS : …`. Une relecture complète n'a pas cette ligne ;
  - `.claude/skills/ticket/SKILL.md` : le nouveau relecteur reçoit le rapport précédent et l'interdiff, deux tours au
    plus, et un constat non corrigé donne un verdict PARTIEL avec ce constat dans `reste` ;
  - `.agents/skills/ticket-codex/SKILL.md` : la limite de deux corrections et l'escalade sur un constat non corrigé ;
  - `docs/travail/README.md` : la relecture de correction et la nouvelle limite ;
  - les tests des critères, et le faux relecteur des tests s'il doit rendre une ligne `NON CORRIGÉS`.
- À ne pas toucher :
  - la première relecture d'une tentative, qui reste complète ;
  - le refus de reprendre un relecteur (T141) ;
  - `scripts/check.mjs`, `scripts/quality/`, le plancher du cliquet ;
  - le code du produit.

## Critères d'acceptation

1. Après deux `record` séparés par une correction, `revue-2.interdiff` contient le fichier modifié par la correction et
   un fichier nouveau qu'elle a créé, et aucun des fichiers qu'elle n'a pas touchés. `git status` et l'index sont les
   mêmes avant et après chaque `record`.
2. `run.mjs --engine codex`, avec le faux `codex` et un faux relecteur qui refuse puis accepte : la consigne de la
   deuxième relecture nomme `relecture-1.md` et `revue-2.interdiff`. Celle de la première ne nomme aucun interdiff.
3. Une relecture de correction qui rend `NON CORRIGÉS : 1` refuse la tentative sans troisième session Codex, avec une
   raison qui nomme le rapport. Avec `--attempts 2`, la tentative suivante démarre sur le palier suivant.
4. Une relecture de correction sans ligne `NON CORRIGÉS` refuse aussi la tentative.
5. Deux corrections refusées avec `NON CORRIGÉS : 0` refusent la tentative : aucune troisième correction n'est
   demandée.
6. Mutation temporaire : la boucle ignore la ligne `NON CORRIGÉS`. Le test du critère 3 échoue. La sortie rouge va au
   journal, puis la mutation est retirée.
7. Le flux Claude : ses tests existants passent sans changer d'assertion, en dehors de celles qui comptent trois tours,
   déclarées dans `ecarts.md`.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs`, frontière : `run.mjs --engine codex` dans le dépôt temporaire des tests, avec le faux
`codex` et un faux relecteur réglable ; la commande `record` de `reviewed-state.mjs` pour le critère 1. Les consignes
(`relecteur.md`, skills) ne se testent pas par leur texte : le relecteur de ce ticket les vérifie à la lecture.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Un relecteur neuf, avec le rapport et le diff, plutôt que le précédent repris.** Le regard neuf de T141 est gardé,
  et la relecture se concentre sur ce qui a changé.
- **Un bloquant reste possible partout.** Seuls les mineurs sur du code inchangé deviennent des réserves.
- **Une ligne `NON CORRIGÉS` absente compte comme un constat non corrigé.** Un rapport qui ne dit pas si la correction
  a tenu ne doit pas faire durer la tentative.
- **Niveau `standard`, proposé par l'orchestrateur le 15/10, comme T159 et T160** : Sol 6.1 high implémente, et Opus
  relit.
- **Pas d'ADR.** Ces règles complètent la boucle de relecture décrite par l'ADR 0012 et la skill `ticket`.

## Journal
