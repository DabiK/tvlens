---
id: T153
titre: Accept a review only when no finding is left in the ticket's scope
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Aujourd'hui, un relecteur peut accepter un diff tout en y laissant un constat « mineur ». La session
range alors ce constat en réserve, et la boucle intègre et pousse quand même. Un critère tenu « à la
lettre près » part aussi en réserve, et le propriétaire ne le découvre qu'après l'intégration. Après ce
ticket :
- un relecteur n'accepte que s'il ne reste aucun constat dans le périmètre du ticket, et la boucle le
  vérifie sur son rapport ;
- un écart à un critère est déclaré avant l'implémentation, puis accepté ou refusé explicitement par le
  relecteur ;
- seuls les constats hors périmètre deviennent des réserves.

## Sources

- Décision du propriétaire, le 14/10 : boucher cette fuite avant les tickets de structure du plan court.
- Rétrospectives, `node scripts/loop/retro.mjs liste` :
  - même défaut sur trois tickets, des constats de relecture dans le périmètre laissés en réserve :
    R-T144-6, R-T004-4, R-T005-4. Le cas de T005 : un `.catch(() => {})` de
    `tests/codex-abandoned-turn.test.cjs` peut laisser passer le test sans qu'il prouve rien ;
  - un critère tranché seul par l'implémentation et signalé après coup : R-T004-2 (critère 2 de T004),
    R-T003-13 (critère 4 de T003).
- Code concerné, à la version `1829344` :
  - `.claude/agents/relecteur.md`, section « Ce que tu rends ». Elle impose la première ligne
    `VERDICT : accepté` ou `VERDICT : à corriger`, et dit : « Les constats mineurs n'empêchent pas
    d'accepter. » ;
  - `.claude/skills/ticket/SKILL.md` :
    - § 2 « Explorer » (l. 20-26) ;
    - § 5 « Relire » (l. 39-57), où le relecteur ne reçoit que le ticket et les deux fichiers
      `revue-<n>` ;
    - § 6 « Corriger » (l. 59-63), qui ne renvoie à l'implémenteur que les constats bloquants ;
    - § 8 « Conclure » (l. 84-88), qui admet en réserve « un critère rempli à la lettre près » ;
  - `scripts/loop/reviewed-state.mjs`, `reviewVerdict` (l. 138-141) : il lit la ligne `VERDICT`.
    `recordReview` l'enregistre dans `relectures.jsonl`, par le hook `.claude/hooks/record-review.mjs`.
    `unacceptedReview` refuse l'intégration si le dernier verdict n'est pas « accepté » ;
  - `docs/travail/README.md:165` : « Un verdict TERMINÉ peut garder des réserves dans `reste` ».
- Tests qui fabriquent un rapport de relecteur : `tests/agent-guards.test.cjs:169-173`,
  `tests/ticket-loop.test.cjs:62` et `:181`.

## Périmètre

- À modifier :
  - `.claude/agents/relecteur.md` :
    - chaque constat est classé `bloquant`, `mineur` ou `hors périmètre`. `mineur` signifie : dans le
      périmètre du ticket et corrigeable dans le ticket. `hors périmètre` signifie : réel, mais hors de
      ce que le ticket autorise à modifier ;
    - la deuxième ligne du rapport est exactement
      `CONSTATS : <n> bloquant, <n> mineur, <n> hors périmètre` ;
    - « accepté » exige zéro `bloquant` et zéro `mineur` ;
    - si `.harness-state/tickets/<ID>/ecarts.md` existe, le relecteur le lit. Il accepte ou refuse chaque
      écart déclaré et chaque constat contesté, explicitement. Un écart à un critère qu'il découvre sans
      qu'il ait été déclaré est un constat `bloquant` ;
  - `.claude/skills/ticket/SKILL.md` :
    - § 2 : si l'exploration montre qu'un critère ne peut pas être tenu à la lettre, l'orchestrateur
      tranche avant l'implémentation. Tenir le critère demanderait de sortir du périmètre, ou l'écart
      affaiblirait ce que le critère prouve : verdict BLOQUÉ. Sinon, il écrit l'écart dans `ecarts.md`,
      avec la preuve qui le remplace ;
    - § 5 : le relecteur reçoit aussi `ecarts.md` quand ce fichier existe ;
    - § 6 : tout constat `bloquant` ou `mineur` retourne à l'implémenteur. L'orchestrateur peut aussi
      contester un constat dans `ecarts.md`, avec une raison précise, et le relecteur suivant tranche.
      Les trois tours au plus restent ;
    - § 8 : une réserve est un constat `hors périmètre`, un écart accepté par le relecteur (écrit
      « Écart accepté, critère N : … »), ce qui n'a pas pu être vérifié, ou une question pour le
      propriétaire. La phrase « un critère rempli à la lettre près » disparaît ;
  - `scripts/loop/reviewed-state.mjs`, `reviewVerdict` :
    - « accepté » n'est rendu que si la ligne `CONSTATS` existe et compte zéro `bloquant` et zéro
      `mineur` ;
    - un rapport qui accepte sans ligne `CONSTATS` donne « illisible » ;
    - un rapport qui accepte avec un `bloquant` ou un `mineur` compté donne « à corriger » ;
  - les tests de `reviewVerdict`, dans `tests/ticket-loop.test.cjs` ou un fichier voisin. Les rapports
    fabriqués par `tests/agent-guards.test.cjs` et `tests/ticket-loop.test.cjs` reçoivent la ligne
    `CONSTATS` qui correspond à ce qu'ils décrivent. Aucune assertion n'est retirée ni assouplie ;
  - `docs/travail/README.md` : à la ligne 165, ce qu'une réserve peut contenir ; dans la table des
    fichiers d'état (l. 156-163), une ligne pour `ecarts.md`.
- À ne pas toucher :
  - `unacceptedReview`, `recordReview` et le hook `record-review.mjs`, en dehors de ce qu'impose le
    nouveau `reviewVerdict` ;
  - le nombre de tours de relecture, l'échelle des modèles, `scripts/check.mjs`, le plancher du
    cliquet ;
  - les autres agents.

## Critères d'acceptation

1. Les tests de `reviewVerdict` couvrent au moins :
   - `accepté` avec `CONSTATS : 0 bloquant, 0 mineur, 2 hors périmètre` : « accepté » ;
   - `accepté` avec un `mineur` compté : « à corriger » ;
   - `accepté` avec un `bloquant` compté : « à corriger » ;
   - `accepté` sans ligne `CONSTATS` : « illisible » ;
   - `à corriger`, avec ou sans ligne `CONSTATS` : « à corriger » ;
   - aucune ligne `VERDICT` : « illisible », comme aujourd'hui.
   Mutation temporaire : `reviewVerdict` ignore la ligne `CONSTATS`. Au moins deux de ces tests
   échouent ; la sortie rouge va au journal, puis la mutation est retirée.
2. `grep -n "Les constats mineurs n'empêchent pas d'accepter" .claude/agents/relecteur.md` et
   `grep -n "à la lettre près" .claude/skills/ticket/SKILL.md` ne rendent rien. Sorties (vides) au
   journal.
3. `grep -n "CONSTATS :" .claude/agents/relecteur.md .claude/skills/ticket/SKILL.md` montre le format
   exact de la ligne. `grep -n "ecarts.md" .claude/agents/relecteur.md .claude/skills/ticket/SKILL.md`
   le montre aux § 2, 5 et 6 et dans le contrat du relecteur. Sorties au journal.
4. `git diff` sur `tests/agent-guards.test.cjs` et `tests/ticket-loop.test.cjs` n'ajoute que des lignes
   `CONSTATS` dans des rapports fabriqués, et de nouveaux tests. Aucune ligne `assert` n'est retirée ni
   changée. Sortie au journal.
5. `git diff --stat` ne cite que les fichiers du périmètre et le ticket.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests de `reviewVerdict`, frontière : la fonction exportée par `scripts/loop/reviewed-state.mjs`,
appelée sur des rapports de relecteur écrits dans le test, comme le hook l'appelle. La règle tient donc
même quand un relecteur se contredit : un rapport qui accepte avec un constat mineur compté n'est pas
enregistré comme une acceptation.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **La règle est vérifiée par la boucle, pas seulement écrite.** La ligne `CONSTATS` rend le rapport
  lisible par une machine, comme la ligne `VERDICT` aujourd'hui. Un relecteur qui accepte avec un
  constat mineur, ou qui oublie la ligne, n'est pas compté comme une acceptation.
- **Un constat se corrige ou se conteste, jamais ne se tait.** La contestation passe par `ecarts.md` et
  c'est le relecteur suivant qui tranche : l'orchestrateur ne s'accepte pas lui-même.
- **Un écart à un critère se déclare avant l'implémentation.** S'il affaiblit la preuve, c'est un
  BLOQUÉ, donc une décision du propriétaire. Sinon, c'est le relecteur qui l'accepte, et l'écart reste
  visible dans les réserves.
- **Le coût attendu** : une relecture de plus sur les tickets qui avaient un mineur, de l'ordre de
  0,5 $. Un ticket qui dépasse les trois tours finit PARTIEL, et la boucle le relance sur le palier
  suivant, comme aujourd'hui.
- **Pas d'ADR.** La règle de relecture change dans les fichiers qui la portent déjà : le contrat du
  relecteur, la skill et la fonction qui lit son verdict.

## Journal
