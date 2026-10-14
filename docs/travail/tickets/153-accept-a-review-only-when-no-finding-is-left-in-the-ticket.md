---
id: T153
titre: Accept a review only when no finding is left in the ticket's scope
statut: termine
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

### 14/10 — Cadrage et exploration

Session neuve, pas de reprise (journal vide, aucun rapport d'échec). Rapport complet dans
`.harness-state/tickets/T153/exploration.md`. En cinq lignes :
- `reviewVerdict` (`scripts/loop/reviewed-state.mjs:137-141`) n'a aucun test unitaire : ils sont à créer, dans
  `tests/reviewed-state.test.cjs`, un `test()` par cas pour que la mutation du critère 1 en fasse échouer plusieurs.
- Le hook, `recordReview` et `unacceptedReview` restent intacts : la nouvelle règle ne sort pas de {accepté, à corriger, illisible}.
- Les rapports fabriqués à compléter : `ticket-loop.test.cjs:62` (rapport par défaut, environ 17 tests en dépendent)
  et `:181`, `agent-guards.test.cjs:169` et `:170` ; aucun ne tient sur une ligne `assert`.
- Critère 4 : `agent-guards.test.cjs:170` dépasserait 160 caractères avec la ligne `CONSTATS` et doit être scindée.
- Le ticket s'applique à sa propre relecture : le relecteur final est jugé par le nouveau `reviewVerdict`.

Décisions de l'orchestrateur avant l'implémentation :
- Écart 1 déclaré dans `.harness-state/tickets/T153/ecarts.md` : remaniement de `agent-guards.test.cjs:170`, preuve
  de remplacement par le diff des tests. Il ne sort pas du périmètre et n'affaiblit pas ce que prouve le critère 4.
- Format lu par `reviewVerdict` : première ligne qui commence par `CONSTATS :`, n'importe où dans le rapport comme
  `VERDICT`, casse ignorée, espaces souples, pluriel toléré (`bloquants`, `mineurs`) ; une ligne mal formée compte
  comme absente.

### 14/10 — Implémentation (un passage de l'implémenteur)

- `reviewVerdict` lit `VERDICT` puis, pour un « accepté », la première ligne `CONSTATS :` ; nouveau
  `tests/reviewed-state.test.cjs`, dix cas générés en `test()` séparés ; lignes `CONSTATS` ajoutées aux rapports
  fabriqués ; `relecteur.md`, SKILL.md §§ 2, 5, 6, 8 et `docs/travail/README.md` mis à jour.
- Rouge avant la règle, rapporté par l'implémenteur : `node --test --test-concurrency=1 tests/reviewed-state.test.cjs`,
  10 tests, 5 échecs (`actual: 'accepté'`).
- Vert après, rapporté par l'implémenteur : `node --test --test-concurrency=1 tests/reviewed-state.test.cjs
  tests/agent-guards.test.cjs tests/ticket-loop.test.cjs`, 77 tests, 0 échec ; `node scripts/check.mjs --changed`
  vert ; `node scripts/check.mjs` complet vert (689 tests JS, 84 tests Python, format et lint non lancés).
- Critère 1, mutation (`reviewVerdict` ne lit plus que `VERDICT`), sortie complète dans
  `.harness-state/tickets/T153/mutation.txt`, que j'ai relue :

```
✔ a report that accepts with only out-of-scope findings counts as accepted
✖ a report that accepts while counting a minor finding counts as to be fixed
✖ a report that accepts while counting a blocking finding counts as to be fixed
✖ a report that accepts without a findings line is unreadable
✖ a report that accepts with a malformed findings line is unreadable
✖ a report that accepts is judged on its first findings line only
✔ the verdict and findings lines are read anywhere, ignoring case, extra spaces and plurals
✔ a report that asks for fixes with a findings line counts as to be fixed
✔ a report that asks for fixes without a findings line still counts as to be fixed
✔ a report without a verdict line is unreadable, even with a findings line
ℹ tests 10
ℹ pass 5
ℹ fail 5
exit=1
```

  Les échecs sont des `AssertionError` (`+ 'accepté'` contre `- 'à corriger'` ou `- 'illisible'`). La mutation est
  retirée : `git diff scripts/loop/reviewed-state.mjs` ne montre que la nouvelle règle.
- Critère 2, lancé par moi : les deux `grep -n` (« Les constats mineurs n'empêchent pas d'accepter » dans
  `relecteur.md`, « à la lettre près » dans SKILL.md) ne rendent rien, code de sortie 1.
- Critère 3, lancé par moi :

```
$ grep -n "CONSTATS :" .claude/agents/relecteur.md .claude/skills/ticket/SKILL.md
.claude/skills/ticket/SKILL.md:61:`CONSTATS : <n> bloquant, <n> mineur, <n> hors périmètre`. Un « accepté » qui compte un bloquant ou un
.claude/agents/relecteur.md:44:`CONSTATS : <n> bloquant, <n> mineur, <n> hors périmètre`
$ grep -n "ecarts.md" .claude/agents/relecteur.md .claude/skills/ticket/SKILL.md
.claude/skills/ticket/SKILL.md:30:  (§ 2) critère prouve : verdict BLOQUÉ. Sinon, écris l'écart dans `.harness-state/tickets/<ID>/ecarts.md` : le
.claude/skills/ticket/SKILL.md:56:  (§ 5) fichiers `revue-<n>` et `.harness-state/tickets/<ID>/ecarts.md` quand il existe, rien d'autre. Ton avis
.claude/skills/ticket/SKILL.md:57:  (§ 5) ne lui parvient que par `ecarts.md` (un écart déclaré, un constat contesté avec sa raison), jamais par
.claude/skills/ticket/SKILL.md:73:  (§ 6) au lieu de le faire corriger : écris-le dans `.harness-state/tickets/<ID>/ecarts.md` avec une raison
.claude/agents/relecteur.md:9:s'il existe, le fichier des écarts `.harness-state/tickets/<ID>/ecarts.md`.
.claude/agents/relecteur.md:27:Si `.harness-state/tickets/<ID>/ecarts.md` existe, lis-le avant de juger. L'orchestrateur y déclare,
```

  (les repères « (§ n) » sont ajoutés par moi ; § 2 = l. 20-33, § 5 = l. 45-67, § 6 = l. 69-76).
- Critère 4, lancé par moi : `git diff tests/agent-guards.test.cjs tests/ticket-loop.test.cjs | grep -c '^-.*assert'`
  rend `0`. Le diff ne change que quatre rapports fabriqués, en y ajoutant leur ligne `CONSTATS`. Seul
  `agent-guards.test.cjs:170` est scindé sur trois lignes : c'est l'écart 1 de `ecarts.md`.

```
-  handback("relecteur", "VERDICT : à corriger\n- constat");
-  handback("relecteur", "VERDICT : accepté", { content: [{ type: "text", text: "VERDICT : accepté\nRien à signaler." }] });
+  handback("relecteur", "VERDICT : à corriger\nCONSTATS : 1 bloquant, 0 mineur, 0 hors périmètre\n- constat");
+  handback("relecteur", "VERDICT : accepté", {
+    content: [{ type: "text", text: "VERDICT : accepté\nCONSTATS : 0 bloquant, 0 mineur, 0 hors périmètre\nRien à signaler." }],
+  });
-const review = (text = "VERDICT : accepté") => {
+const review = (text = "VERDICT : accepté\\nCONSTATS : 0 bloquant, 0 mineur, 0 hors périmètre") => {
-    review("VERDICT : à corriger\\n- the greeting is untested");
+    review("VERDICT : à corriger\\nCONSTATS : 1 bloquant, 0 mineur, 0 hors périmètre\\n- the greeting is untested");
```

### 14/10 — Relecture 1 : à corriger, puis correction

- `node scripts/loop/reviewed-state.mjs record` → `revue-1.diff`, `revue-1.fichiers`. Relecteur neuf, avec le ticket,
  ces deux fichiers et `ecarts.md`. Son rapport porte bien les deux lignes du nouveau contrat :
  `VERDICT : à corriger` et `CONSTATS : 0 bloquant, 1 mineur, 1 hors périmètre`. `relectures.jsonl` enregistre
  `"revue":"revue-1.diff","verdict":"à corriger"`.
- Constat mineur : au § 2 de SKILL.md, la phrase « Si le tenir demanderait…, ou si l'écart affaiblirait… » met un
  conditionnel après « si ». Renvoyé à l'implémenteur, corrigé en « demande » et « affaiblit » ;
  `node scripts/check.mjs --changed` : vert, 77 tests, 0 échec.
- Constat hors périmètre : la skill ne dit pas quoi faire d'un rapport enregistré « illisible ». Il est gardé en réserve.
- « Écart accepté, critère 4 : `tests/agent-guards.test.cjs:170` passe sur trois lignes ». Le relecteur juge que seule
  la ligne `CONSTATS` est ajoutée au rapport et qu'aucune assertion ne change.

### 14/10 — Relecture 2 : acceptée

- `node scripts/loop/reviewed-state.mjs record` → `revue-2.diff`, `revue-2.fichiers`. Relecteur neuf, avec le ticket,
  ces deux fichiers et `ecarts.md`. Rapport : `VERDICT : accepté`, `CONSTATS : 0 bloquant, 0 mineur, 1 hors périmètre`.
  `relectures.jsonl` enregistre `"revue":"revue-2.diff","verdict":"accepté"`.
- Écart accepté, critère 4 : `tests/agent-guards.test.cjs:170` passe sur trois lignes, et seule la ligne `CONSTATS`
  s'ajoute au rapport.
- Constat hors périmètre, le même qu'à la relecture 1 : la skill ne dit pas quoi faire d'un rapport « illisible ».
- Après la relecture, seul le journal a changé. `unreviewedChange` et `unacceptedReview`, appelés sur l'état final,
  rendent tous deux `null`.

### 14/10 — Contrôle final : rouge sur un test hors périmètre, reproduit et expliqué

- `node scripts/check.mjs` (sortie dans `.harness-state/tickets/T153/check-final.txt`) : **ROUGE**. Règles par fichier ✔,
  cliquet ✔ (`cas_de_test : 647 → 648`), tests Python ✔ (84, 1 sauté). Tests JS : 689 tests, 688 réussis, **1 échec** :
  `tests/server-sessions.test.cjs:640`, « a slow disk holds back neither what a client reads nor the analysis… »,
  en 16 ms. Format et lint : non lancés (Prettier et ESLint absents). Le résumé du contrôle ne garde pas le message
  d'erreur.
- Lancements qui ont suivi, tous rapportés ; aucun n'est compté comme une preuve de vert :
  - `node --test --test-concurrency=1 tests/server-sessions.test.cjs` seul : 14/14 (`server-sessions-run1.txt`) ;
  - la suite JS entière, dans la commande du contrôle, pour capturer le message d'erreur : 689/689, 0 échec
    (`js-suite-repro1.txt`). L'échec ne s'est pas reproduit et son message est perdu.
- Analyse en lecture seule, par un explorateur. La durée de 16 ms est normale pour ce test sans sonde (15 à 19 ms).
  L'hypothèse la plus probable : `:664` n'attend qu'un nombre fixe de tours (`turns()`) avant l'assertion de `:666`.
  Celle-ci exige `moment-3` `ready`, alors que l'analyse de `moment-3` passe par une lecture sur le vrai disque
  (`adapters/local-store.cjs`). Sur une machine chargée, la lecture peut arriver après l'assertion. Aucun lien avec le
  diff : le test n'importe rien de `scripts/loop/`, et aucun fichier de `runtime/`, `server/`, `adapters/` ou `core/`
  n'est modifié.
- Reproduction déterministe de cette hypothèse, avec la sonde d'audit
  `.harness-state/audit/flaky/slow-fs.cjs` (sorties `h1-*.txt`). Un premier essai n'avait rien ralenti : en zsh,
  `set -- $cfg` ne découpe pas la chaîne. Il a été refait avec des paramètres explicites :
  - `FLK_SLOW=readFile FLK_MS=200 node --require ./.harness-state/audit/flaky/slow-fs.cjs --test --test-concurrency=1
    --test-name-pattern="a slow disk holds back" tests/server-sessions.test.cjs` : **exit=1**, échec à
    `tests/server-sessions.test.cjs:666`, « both passages are published analysed while the save of the first is
    still on its way to the disk », `'moment-3'` avec `+ 'analyzing'` contre `- 'ready'` ;
  - témoin `FLK_SLOW=readFile FLK_MS=0` : exit=0, 1/1 ;
  - témoin `FLK_SLOW=mkdir FLK_MS=200` : exit=0, 1/1.
- Conclusion : il s'agit d'une course qui existait avant ce ticket, dans `tests/server-sessions.test.cjs:664-666`.
  Ce fichier est hors du périmètre du ticket (critère 5) : la course n'y est donc pas corrigée. Je ne peux pas
  affirmer qu'elle a causé l'échec observé, faute de message d'erreur ; c'est la seule dépendance au temps réel que
  l'analyse ait trouvée sur ce chemin. Aucun ticket ouvert ne la vise. FLK-08 (`docs/audit-maintenabilite.md`) cite
  `:664` comme une preuve d'absence, sans relever le fait positif qu'affirme `:666`.

### 14/10 — Critère 5

```
$ git diff --stat
 .claude/agents/relecteur.md                        |  38 +++++++-
 .claude/skills/ticket/SKILL.md                     |  38 +++++---
 docs/travail/README.md                             |   5 +-
 ...w-only-when-no-finding-is-left-in-the-ticket.md | 101 ++++++++++++++++++++-
 scripts/loop/reviewed-state.mjs                    |  20 +++-
 tests/agent-guards.test.cjs                        |   6 +-
 tests/ticket-loop.test.cjs                         |   4 +-
$ git status --porcelain   (non suivis)
?? design/continuous-context/      (déjà là avant la session, untracked-before.json)
?? experiments/                    (déjà là avant la session, untracked-before.json)
?? tests/reviewed-state.test.cjs   (nouveau test du périmètre)
```

### 14/10 — Verdict

Verdict TERMINÉ dans `.harness-state/tickets/T153/verdict.json`. Les critères 1 à 5 sont couverts et vérifiés, et la
dernière relecture est acceptée. Le critère 6 est rapporté tel qu'observé : le contrôle complet de l'implémenteur était
vert, celui de l'état final est rouge sur un seul test, hors périmètre. Cet échec vient d'une course qui existait avant
le ticket ; elle est reproduite de façon déterministe et expliquée plus haut. Le vert reste donc à observer par le
contrôle de la boucle. La course de `server-sessions.test.cjs:664-666` et le cas du rapport « illisible » sont en
réserve, avec une recommandation chacun.

### Réserves à la clôture

- Non vérifié : le dernier contrôle complet sur l'état final est rouge, sur tests/server-sessions.test.cjs:640, hors périmètre. Cause la plus probable, reproduite de façon déterministe : :664 attend un nombre fixe de tours alors que l'analyse de moment-3 lit le vrai disque, puis :666 exige moment-3 ready. Le message de l'échec observé est perdu, car scripts/check.mjs ne garde que les lignes de résumé. Le vert reste à observer par le contrôle de la boucle.
- Constat hors périmètre (relectures 1 et 2), question pour le propriétaire : la course de server-sessions.test.cjs:664-666 n'est visée par aucun ticket ouvert. Recommandation : un ticket qui remplace l'attente à tours fixes par une attente bornée du fait publié (moment-3 ready), sur le modèle de published() (:650-653). Preuves : la reproduction avec readFile ralenti passe au vert ; la mutation de core/session.cjs:254 la fait toujours échouer.
- Constat hors périmètre (relectures 1 et 2), question pour le propriétaire : la skill ne dit pas quoi faire d'un rapport enregistré « illisible ». Ce cas devient plus probable avec la nouvelle règle. Un « accepté » sans ligne CONSTATS est illisible, et le parseur est strict : une ligne en gras, entre backticks ou finie par un point est mal formée. Recommandation : au § 6, « un rapport illisible se refait relire par un relecteur neuf, et compte comme un tour ».
- Écart accepté, critère 4 : tests/agent-guards.test.cjs:170 est scindée sur trois lignes pour rester sous 160 caractères. Seule la ligne CONSTATS s'ajoute au rapport fabriqué, et aucune assertion ne change.
- Non vérifié : format (Prettier) et lint (ESLint) non lancés, outils absents du dépôt.
