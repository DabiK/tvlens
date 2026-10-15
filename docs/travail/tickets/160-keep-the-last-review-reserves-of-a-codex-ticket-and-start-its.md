---
id: T160
titre: Keep the last review's reserves of a Codex ticket, read its stream in the retrospective, and start it on Sol
statut: termine
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

### Exploration

Consignes, ticket, ADR 0012, modules concernés, appelants et tests lus. État initial observé avec
`git status --short` et `git diff` : ticket déjà en cours, fichiers non suivis étrangers conservés.
Plan et absence d’écart consignés dans `.harness-state/tickets/T160/exploration.md` et `ecarts.md`.

### Comportements implémentés, tests rouges puis verts

Sorties intégrales conservées dans `.harness-state/tickets/T160/`, avec la commande et son code de sortie.
Chaque commande ci-dessous utilise `node --test --test-name-pattern='<motif>' <fichier>`.

| Étape | Motif exact et fichier | Résultat observé | Sorties rouge / verte |
| --- | --- | --- | --- |
| Réserves du dernier rapport | `the last accepted Codex review carries`, `tests/ticket-loop.test.cjs` | rouge : jalon absent ; vert : 1 test | `reserves-red.txt`, `reserves-green.txt` |
| Liste initiale des non suivis | `the gates refuse.*untracked list change`, `tests/ticket-loop.test.cjs` | rouge : 6 intégrations indues ; vert : 6 refus attendus | `untracked-red.txt`, `untracked-green.txt` |
| Rétrospective Codex | `the retrospective of a Codex attempt`, `tests/ticket-loop.test.cjs` | rouge : flux Claude et compactions undefined ; vert : 1 test | `retro-red.txt`, `retro-green.txt` |
| Palier et départ sensible | `Codex dry run\|sensitive Codex ticket\|four rejected Codex reviews`, `tests/ticket-loop.test.cjs` | rouge : Astra high au palier 1 ; vert : 3 tests | `models-red.txt`, `models-green.txt` |
| Portée, hook | `the instructions scope opens`, `tests/agent-guards.test.cjs` | rouge : écriture Codex refusée ; vert avec `the instructions scope opens\|a session scoped` : 3 tests | `scope-hook-red.txt`, `scope-hook-green.txt` |
| Portée, intégration | `a tuning session can integrate a change`, `tests/ticket-loop.test.cjs` | rouge : harmonisation refusée ; vert avec les refus existants : 5 tests | `scope-loop-red.txt`, `scope-loop-green.txt` |
| Dossiers inscriptibles | `Codex only adds its configuration`, `tests/ticket-loop.test.cjs` | rouge : arguments absents pour harnais ; vert : 2 tests, corrections comprises | `writable-dirs-red.txt`, `writable-dirs-green.txt` |
| Skill dans les hooks | `the startup and missing verdict messages`, `tests/agent-guards.test.cjs` | rouge : 2 messages erronés ; vert : 3 tests | `hook-skills-red.txt`, `hook-skills-green.txt` |
| Écarts et réserves multilignes | `Codex preserves accepted deviations`, `tests/ticket-loop.test.cjs` | rouge : titre compté et texte tronqué ; vert avec le premier test de réserves : 2 tests | `deviations-red.txt`, `deviations-green.txt` |

Le verdict de session n'est pas réécrit : les réserves du rapport sont transmises séparément à l'intégration.
Les fichiers fermés de l'harmonisation restent refusés. Trois assertions de messages de portée nomment désormais
le troisième dossier ouvert ; les assertions sur les refus restent strictes.

### Mutation de l'intégration

Mutation temporaire dans `integrate` : retirer `...reviewReserves` de la liste intégrée.
Commande : `node --test --test-name-pattern='the last accepted Codex review carries' tests/ticket-loop.test.cjs`.
Sortie rouge observée :

```text
✖ the last accepted Codex review carries both out-of-scope findings into the committed journal and reserve count
ℹ tests 1
ℹ pass 0
ℹ fail 1
AssertionError [ERR_ASSERTION] : jalon « Réserves à la clôture » absent (actual: undefined, expected: true).
exit=1
```

Sortie intégrale : `.harness-state/tickets/T160/mutation-reserves-red.txt`. Mutation retirée immédiatement après la preuve.

### Contrôle des fichiers modifiés

`node scripts/check.mjs --changed` : code 0, **vert**. Règles, format et cliquet verts ;
153 tests JS réussis sur les deux fichiers modifiés, zéro échec. La mutation est donc retirée et
le test de ses réserves est de nouveau vert dans cette suite. ESLint : **non lancé**, absent ou non configuré.
Sortie : `.harness-state/tickets/T160/check-changed.txt`.

`git diff --check` : code 0, aucune erreur d'espacement.

### Contrôle complet et remise à la boucle

`node scripts/check.mjs` : code 0, **vert**. Règles, format et cliquet verts ; **1 017 tests JS
réussis** dans 90 fichiers, zéro échec ; **84 tests Python**, succès avec **un test ignoré**.
ESLint : **non lancé**, absent ou non configuré. Sortie intégrale du contrôle :
`.harness-state/tickets/T160/check-full.txt`.

`git diff --check` : code 0. Contrat du ticket vérifié inchangé au-dessus du journal, hormis son
statut déjà passé à `en-cours` avant cette session. Fichiers non suivis initiaux conservés, aucun
changement du produit, de `scripts/check.mjs`, de `scripts/quality/` ou du plancher du cliquet.

Verdict écrit dans `.harness-state/tickets/T160/verdict.json` : `TERMINÉ`. Aucun commit ni push du
dépôt de travail ; aucune relecture lancée par cette session. La boucle enregistre et fait relire.

### Reprise après la relecture 1 — exploration

Relecture, ticket et journal, écarts, état Git et diff lus ; travail existant conservé. Le constat
bloquant du parseur est accepté. Exploration et état d’entrée archivés dans
`.harness-state/tickets/T160/exploration.md`, `reprise-status.txt` et `reprise-diff.patch`.
Correction prévue, tests d’abord : préserver les constats structurés, reconnaître « Écarts acceptés »
et signaler tout désaccord avec le nombre annoncé par `CONSTATS`. Aucun nouvel écart demandé.
Les trois constats hors périmètre restent à reporter dans les réserves du verdict.

### Reprise — constat bloquant corrigé, rouges puis verts

Toutes les commandes ciblées utilisent `node --test --test-name-pattern='<motif>' tests/ticket-loop.test.cjs`.
Sorties intégrales avec commande et code dans `.harness-state/tickets/T160/`.

| Motif exact | Rouge observé | Vert observé | Preuves |
| --- | --- | --- | --- |
| `Codex preserves complete structured findings` | 4 échecs : synthèse et critères comptés, corps absent | 6 réussites avec les deux tests existants de réserves | `structured-reserves-red.txt`, `structured-reserves-green.txt` |
| `Codex retains singular and plural` | 1 échec : pluriel absent | 1 réussite | `plural-deviations-red.txt`, `plural-deviations-green.txt` |
| `Codex references the report when the finding count disagrees` | 4 échecs : aucun repli explicite | 11 réussites avec les tests de structure et d’écarts | `reserve-count-red.txt`, `reserve-count-green.txt` |
| `Codex retains singular and plural` (trois titres de section) | 2 échecs : sections « Décisions sur les écarts » ignorées | 3 réussites | `deviation-sections-red.txt`, `deviation-sections-green.txt` |

La commande verte de structure ajoute au premier motif `|Codex preserves accepted deviations|the last accepted Codex review carries`.
La commande verte du compte ajoute `|Codex retains singular and plural|Codex preserves complete structured findings|Codex preserves accepted deviations|the last accepted Codex review carries`.
Un essai intermédiaire du pluriel a montré que `\b` après « accepté » rejette le singulier accentué ;
il a été remplacé par une borne Unicode. Échec conservé dans `plural-deviations-intermediate-red.txt`.

Le parseur garde chaque constat jusqu’au suivant ou à la section suivante, y compris les champs en
puces non indentées et les paragraphes vides. Les titres Markdown ne partent plus en clair dans la
réserve. Les synthèses et les critères restent exclus. Les écarts acceptés au singulier et au pluriel
sont conservés, y compris sous « Décisions sur les écarts ». Le nombre de constats est rapproché de
`CONSTATS` ; en cas de désaccord, une réserve unique donne les deux nombres et renvoie au rapport,
à la place de l’extraction incertaine. Les écarts acceptés restent distincts. Le README décrit ce repli.

### Reprise — rejeu des six rapports archivés

`node --test .harness-state/tickets/T160/replay-archived-reports.cjs` : code 0, **6 tests réussis**.
Chaque rapport original passe par `run.mjs --engine codex --no-push --no-retro --attempts 1` dans un
dépôt temporaire, avec les deux fournisseurs simulés. Le test vérifie les comptes exacts, le contenu
des constats, les références au rapport, le message du commit temporaire et le verdict non réécrit.

| Rapport | Constats complets | Réserves d’écarts acceptés |
| --- | --- | --- |
| `T018/relecture-2.md` | 2 | 0 |
| `T156/relecture-2.md` | 3 | 6 |
| `T159/relecture-2.md` | 1 | 10 |
| `T017/relecture-2.md` | 1 | 2 |
| `T157/relecture-1.md` | 2 | 2 |
| `T127/relecture-1.md` | 1 | 0 |

Aucun repli nécessaire sur ces six rapports. Sortie : `archived-reports.txt` ; script de preuve
conservé hors Git dans le dossier d’état. Aucun fournisseur réel ni relecteur lancé.

### Reprise — contrôle des fichiers modifiés

`node scripts/check.mjs --changed` : code 0, **vert**. Règles, format et cliquet verts ;
**164 tests JS réussis sur 164**, dans deux fichiers, zéro échec. ESLint : **non lancé**,
absent ou non configuré. Sortie : `.harness-state/tickets/T160/reprise-check-changed.txt`.
`git diff --check` : code 0, aucune erreur d’espacement.

### Reprise — contrôle complet et nouveau verdict

`node scripts/check.mjs` : code 0, **vert**. Règles, format et cliquet verts ; **1 028 tests JS
réussis sur 1 028**, dans 90 fichiers, zéro échec ; **84 tests Python**, succès avec **un test ignoré**.
ESLint : **non lancé**, absent ou non configuré. Sortie complète :
`.harness-state/tickets/T160/reprise-check-full.txt`. Tests lancés en séquentiel.

`git diff --check` : code 0. La comparaison par `spec` avec HEAD confirme le contrat inchangé
au-dessus du journal ; `git status --short` contient exactement les mêmes chemins qu’à la reprise.
Les fichiers non suivis initiaux sont conservés. Aucun commit ni push dans le dépôt de travail,
aucun état relu enregistré par cette session, aucun relecteur lancé.

Le constat bloquant 1 est corrigé et couvert par les tests rouges puis verts. Nouveau verdict
d’implémentation : `TERMINÉ`, écrit dans `.harness-state/tickets/T160/verdict.json`.
Les trois constats hors périmètre de `relecture-1.md` restent dans `reste` :

- Constat 2, `.claude/agents/harmoniseur.md:30` et `.claude/skills/harmonisation/SKILL.md:17` :
  ces consignes fermées limitent encore l’harmonisation aux deux dossiers Claude. Leur mise à jour
  pour `.agents/skills/` demande un ticket qui les ouvre, sur décision du propriétaire.
- Constat 3, `.claude/hooks/guard-write.mjs:51` : l’énumération utilise « et » entre chaque dossier ;
  la formulation « A, B et C » reste à traiter dans un ticket qui ouvre ce fichier.
- Constat 4, `.claude/hooks/session-context.mjs:11-12` et `.claude/hooks/stop-gate.mjs:59-60` :
  le choix de la skill reste dupliqué. La fonction commune attendue demande d’ouvrir
  `.claude/hooks/lib.mjs` dans un autre ticket.

La boucle assure la nouvelle relecture et décide de l’intégration.

### Réserves à la clôture

- .harness-state/tickets/T160/relecture-1.md, constat 2 — hors périmètre : .claude/agents/harmoniseur.md:30 et .claude/skills/harmonisation/SKILL.md:17 limitent encore les consignes de l’harmonisation aux dossiers Claude. Le propriétaire doit ouvrir ces fichiers fermés pour autoriser .agents/skills/.
- .harness-state/tickets/T160/relecture-1.md, constat 3 — hors périmètre : .claude/hooks/guard-write.mjs:51 énumère les trois dossiers avec « et » entre chacun. La formulation « A, B et C » demande un ticket qui ouvre ce fichier.
- .harness-state/tickets/T160/relecture-1.md, constat 4 — hors périmètre : choix du moteur et chemin de la skill dupliqués dans .claude/hooks/session-context.mjs:11-12 et .claude/hooks/stop-gate.mjs:59-60. La fonction commune attendue dans .claude/hooks/lib.mjs demande un autre ticket qui ouvre ce fichier.
