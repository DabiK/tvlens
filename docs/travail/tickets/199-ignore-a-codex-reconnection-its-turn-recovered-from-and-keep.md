---
id: T199
titre: Ignore a Codex reconnection its turn recovered from, and keep every out-of-scope finding of a correction review
statut: termine
bloque_par: T178
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une reconnexion suivie d'un tour Codex terminé laisse la tentative aller en relecture. Les vrais échecs
continuent de la refuser. Une relecture de correction acceptée transmet tous ses constats hors périmètre,
avec leur texte complet et la référence du rapport, au journal et au compte des réserves de l'intégration.

## Sources

- Décision du propriétaire, le 16/10 : corriger ces deux défauts du harnais avant la vague 1.
  `docs/audit-architecture.md`, rapport A, C, ligne « Bruit d'extraction » : neuf clôtures concernées.
- Code vérifié à `8340014`, modules et bancs lus en entier :
  - `scripts/loop/codex.mjs:89` consomme le flux ; à `:99`, `turn.completed` compte le tour, mais
    `:103` met indistinctement `turn.failed` et `error` dans `state.problem`. Rien n'efface ce problème
    après un tour terminé. `:119` archive le flux ; `:112` et `:126` refusent aussi délais et échecs de processus ;
  - `scripts/loop/codex.mjs:247` exige un repère dans le titre d'un constat ; `:254` découpe les blocs,
    `:282` extrait les réserves et remplace les constats par un diagnostic quand le compte diffère ;
  - `scripts/loop/codex.mjs:295` orchestre la session et ses corrections ;
    `scripts/loop/run.mjs:405` réunit les réserves, les écrit au journal, au commit et à l'événement ;
  - `tests/helpers/codex-session.cjs:93` construit les événements du faux Codex ; `:109` ajoute
    actuellement l'échec après le tour terminé. `tests/ticket-loop.test.cjs:2422` protège ce refus ;
  - `tests/ticket-loop.test.cjs:1745` prouve la transmission des réserves de la dernière relecture ;
    `:1790` protège le repli sur discordance, `:1837` les blocs structurés. Le banc de hooks est
    `tests/agent-guards.test.cjs`, avec le dépôt isolé de `tests/helpers/harness-repo.cjs:11`.
- Traces réelles lues en lecture seule dans `/Users/Dabi/Documents/ISN/tvlens/.harness-state/tickets/` :
  `T179/codex-1.jsonl` contient une reconnexion à la ligne 89 puis `turn.completed` à la ligne 152 ;
  `T179/echec-1.txt` ne donne que cette reconnexion comme refus. Ce sont des traces historiques.
- Rapports réels lus dans ce même dossier, exemples de syntaxe et non preuves du produit actuel :
  `T032/relecture-2.md`, `T147/relecture-2.md`, `T148/relecture-2.md`, `T168/relecture-3.md`,
  `T173/relecture-2.md`, `T174/relecture-2.md`, `T177/relecture-2.md`, `T181/relecture-2.md`,
  `T182/relecture-2.md`. Ils annoncent respectivement 2, 2, 2, 2, 1, 1, 1, 1 et 4 hors périmètre.
  Exemples : le titre en gras de T147, la section « Réserves hors périmètre », le titre sans repère
  de T181 suivi d'une ligne « Où », les puces et la section de réserves de T182.
- `.agents/skills/ticket-codex/SKILL.md:55` et `:88` demandent encore de recopier les constats
  hors périmètre dans `reste`, alors que la boucle les extrait déjà du rapport accepté.
- ADR 0012 : session, témoin de hooks, flux cumulé et relecteur séparé restent les garanties du moteur.

## Périmètre

- Modifier `scripts/loop/codex.mjs`, `tests/ticket-loop.test.cjs`, `tests/helpers/codex-session.cjs`
  les éventuelles fixtures de rapports sous `tests/helpers/` et `.agents/skills/ticket-codex/SKILL.md`. Relire les tests de hooks sans
  déplacer leur responsabilité dans le produit. `harnais: oui` se limite à ce traitement du flux
  à cette extraction et à la consigne de `reste` ; aucun contrôle de qualité ou de permissions n'est ouvert.
- Distinguer une erreur de flux suivie d'un tour terminé d'un échec définitif. La décision repose
  sur les événements de cette invocation, pas sur la présence du mot « Reconnecting » dans un message.
  Un problème de processus, de délai, de témoin ou un `turn.failed` reste un refus.
  Chaque reconnexion récupérée émet un événement `reconnexion` et une ligne `[boucle]` identifiant
  ticket, tentative et invocation ; le flux JSONL original reste conservé.
- Étendre le découpage aux formes des rapports réels, repère éventuellement placé dans le corps,
  titre numéroté en gras, puce, section dédiée aux réserves. Conserver les paragraphes et champs
  d'un constat ; ne pas compter ses rappels dans une synthèse, un tableau de suivi ou les critères.
- La skill Codex ne fait garder dans `reste` que ses propres réserves, sans recopier les constats
  hors périmètre du relecteur, que la boucle extrait déjà. La skill ne modifie pas les rapports du relecteur ; le texte d'une
  skill ne se teste pas (`docs/standards.md`), sa règle se vérifie par le scénario de boucle et par une
  commande consignée au journal.
- Conserver le diagnostic de repli quand le rapport reste réellement discordant. Les fixtures sont
  autonomes : les tests ne lisent jamais le dossier d'état du dépôt principal. Les extraits gardent
  leur structure réelle ; leur provenance est consignée dans le journal de ce ticket.
- Ne modifier ni rapports réels, ni clôtures passées, ni règles de verdict, ni nombre de corrections,
  ni contrats du produit. Ce ticket ne répare pas les réserves historiques dans les autres tickets.

## Critères d'acceptation

1. Par `run.mjs --engine codex` dans le dépôt temporaire du banc, le faux Codex produit `turn.started`,
   une ou plusieurs erreurs de reconnexion, puis `turn.completed`, avec témoin valide, verdict TERMINÉ
   et sortie 0. La première tentative est relue et intégrée ; le flux conserve les erreurs, le tour
   et ses jetons sont comptés. L'événement `reconnexion` et la ligne `[boucle]` sont observés par
   le banc, avec ticket/tentative/invocation. Même preuve sur une correction reprise.
2. Un `turn.failed`, une erreur sans tour terminé après elle, une sortie non nulle et un témoin invalide
   refusent toujours la tentative sans intégration. Tester aussi une erreur après un tour déjà terminé
   et un `turn.failed` suivi d'un `turn.completed` : aucun succès ultérieur ne gomme cet échec explicite.
   Une reconnexion récupérée d'une invocation ne couvre pas l'échec de la suivante.
3. Chaque forme réelle citée a un cas construit sur un extrait, au minimum titre en gras, puce et
   section de réserves avec repère dans le corps. Les neuf rapports conservés en fixtures donnent
   leurs comptes annoncés, sans « Nombre de constats discordant ». Les titres sans `chemin:ligne`
   ne disparaissent pas. Les rappels d'un même constat ne créent pas une réserve supplémentaire.
4. Après une première relecture refusée puis une correction acceptée, chaque constat complet de cette
   dernière est dans le journal committé et dans `integre.reserves`, avec `relecture-2.md` ; le commit
   annonce le même nombre. Aucun ancien constat corrigé, résumé ou critère n'est ajouté. Les écarts
   acceptés et les réserves propres à Codex restent conservés. La skill ne fait pas recopier les
   réserves du relecteur dans `reste` : chacune apparaît une seule fois dans le journal,
   `integre.reserves` et le compte `Reserves: N`, en plus des seules réserves propres à Codex.
   La consigne de la skill se vérifie au journal par `rg -n "reste" .agents/skills/ticket-codex/SKILL.md`,
   sortie citée, en plus de ce scénario.
5. Les cas de discordance véritable gardent le repli référencé et les écarts acceptés. Les assertions
   existantes sur les refus de session, la fraîcheur des témoins et l'indépendance du relecteur restent
   actives ; aucun test ne compare le texte du parseur ou du moteur.
6. À l'implémentation, `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs`,
   puis `node scripts/check.mjs`, sont verts. Aucun fournisseur réel n'est appelé.

## Test d'acceptation attendu

Le banc de `tests/ticket-loop.test.cjs` lance la vraie boucle avec le faux Codex de
`tests/helpers/codex-session.cjs` et le faux relecteur. Il observe les tentatives, les appels de
relecture, le journal intégré, le message du commit et les événements. Les fixtures issues des
rapports réels prouvent l'extraction par ce même parcours, sans test limité à une regex exportée.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La fréquence réelle des reconnexions n'est pas mesurée. L'incident historique et la disposition du
code sont établis ; les nouveaux scénarios restent à exécuter pendant le traitement du ticket.
Les intitulés exacts « Hors périmètre (réserve) » et les puces parenthésées du plan ne sont pas tous
retrouvés tels quels dans les neuf rapports : couvrir les formes effectivement relevées, puis ces
variantes comme cas complémentaires, sans les présenter comme des extraits observés.

## Journal

- Exploration : consignes, ADR 0012, moteur, appelant, bancs et neuf rapports historiques lus ; détails dans `.harness-state/tickets/T199/exploration.md`. Aucun écart prévu (`ecarts.md`). Les dossiers non suivis préexistants restent hors périmètre.

- Flux, rouge observé : `node --test --test-concurrency=1 --test-name-pattern='Codex integrates recovered' tests/ticket-loop.test.cjs` : 2 échecs sur assertion (`2 !== 0`), refus pour `transport interrupted`, dans `stream-red.log` du dossier d’état.
- Flux, vert observé : `node --test --test-concurrency=1 --test-name-pattern='Codex integrates recovered|Codex recovery never|recovered invocation|a failed Codex session' tests/ticket-loop.test.cjs` : 9/9 réussis (`stream-green.log`). Les erreurs récupérables restent locales à chaque invocation ; les refus explicites, le processus et le témoin restent bloquants. Chaque récupération porte le ticket, la tentative et l’identifiant de lancement, sur la console et dans `reconnexion`.
- Fixtures autonomes : copies intégrales, sans réécriture, des rapports historiques cités vers `tests/helpers/correction-reports/` : T032/relecture-2 → `lint-comments.md` ; T147/relecture-2 → `state-views.md` ; T148/relecture-2 → `session-rows.md` ; T168/relecture-3 → `browser-capture.md` ; T173/relecture-2 → `session-lifecycle.md` ; T174/relecture-2 → `route-architecture.md` ; T177/relecture-2 → `surveillance-tick.md` ; T181/relecture-2 → `capture-gate.md` ; T182/relecture-2 → `overlay-reserves.md`. `expected.json` conserve les blocs attendus, sélectionnés explicitement dans ces extraits ; les tests ne lisent que ces fixtures suivies, jamais les états historiques. Les variantes parenthésées sont construites séparément et ne sont pas présentées comme historiques.
- Extraction, rouge observé : `node --test --test-concurrency=1 --test-name-pattern='historical correction report|location and class in the body' tests/ticket-loop.test.cjs` : 13 échecs sur assertions (`extraction-red.log`). Les limites de section imbriquées ont aussi leur rouge : `node --test --test-concurrency=1 --test-name-pattern='nested review section' tests/ticket-loop.test.cjs`, 3 échecs sur assertions (`nested-sections-red.log`).
- Consigne de `reste` : `rg -n "reste" .agents/skills/ticket-codex/SKILL.md` rend notamment `55:avec sa raison dans ecarts.md ; le relecteur suivant tranche. Garde dans reste uniquement tes propres`, `57:pas dans reste et ne modifie pas ses rapports. Mets le journal à jour et rends un nouveau verdict.` et `89:Tes réserves dans reste nomment tes propres constats hors périmètre, les écarts à trancher et les` (backticks omis ici pour la lecture ; sortie exacte conservée dans `skill-reste.log`). La skill laisse l’extraction au moteur et interdit de recopier les constats du relecteur ou de modifier ses rapports.

- Extraction, vert observé : `node --test --test-concurrency=1 --test-name-pattern='historical correction report|location and class in the body|nested review section|Codex preserves|finding count disagrees|accepted deviations|last accepted Codex review' tests/ticket-loop.test.cjs` : 29/29 réussis (`extraction-green-complete.log`). Les neuf rapports fournissent leurs 16 constats complets, leurs écarts acceptés et la seule réserve propre à Codex ; chaque entrée apparaît une seule fois dans le journal et `integre.reserves`, et le commit du dépôt temporaire donne le même compte. Les discordances véritables conservent leur diagnostic et les écarts acceptés.
- Premier contrôle : `node scripts/check.mjs --changed` : vert, règles, format, lint, gel et cliquet verts, 188/188 tests JS (`check-changed.log`). Un cas supplémentaire protège ensuite un titre de constat de niveau 2 : `node --test --test-concurrency=1 --test-name-pattern='body: ## 1' tests/ticket-loop.test.cjs` : rouge sur assertion (0 extrait au lieu de 1, `heading-depth-red.log`), puis `node --test --test-concurrency=1 --test-name-pattern='body: ## 1|nested review section' tests/ticket-loop.test.cjs` : 4/4 verts (`heading-depth-green.log`). Le contrôle final ci-dessous porte sur l’ensemble, avec ce cas supplémentaire.

- Banc d’acceptation complet : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs` : vert, 223/223 réussis, aucun ignoré (`loop-and-guards.log`). Il couvre l’état final du moteur, les neuf fixtures, le titre de niveau 2 et les gardes de session et de hooks inchangées. Aucun fournisseur réel appelé.

- Contrôle final : `node scripts/check.mjs` : code 0, `check : vert` ; règles, format, lint, gel du lint et cliquet verts ; 1 560/1 560 tests JS sur 120 fichiers et 22 tests Python OK (`check-full.log`). Aucun contrôle annoncé non lancé. Aucun fournisseur réel appelé. Aucun commit ni push dans le dépôt de travail. Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T199/verdict.json` ; la relecture et l’intégration appartiennent à la boucle.

- Reprise après relecture 1 : rapport, journal, écarts, `git status` et `git diff` lus. Les trois constats à corriger sont acceptés ; reproduction prévue des champs en gras et des listes numérotées avant correction. La réserve documentaire reste portée par le rapport du relecteur. Aucun écart ni contestation supplémentaire ; exploration complétée dans le dossier d’état.

- Reproduction du bloquant : `node --test --test-concurrency=1 --test-name-pattern='historical correction report: latency-reserves|fields and numbered steps' tests/ticket-loop.test.cjs` : 4/4 rouges sur assertions (`correction-1-extraction-red.log`), puis 4/4 verts après correction minimale (`correction-1-extraction-green.log`). Le rapport réel perdait bien ses champs malgré un compte juste ; les variantes `**Attendu.**`, `**Classe** :` et les étapes numérotées en colonne 0 sont désormais conservées dans leur constat.
- Fixture supplémentaire : copie intégrale de `.harness-state/tickets/T178/relecture-3.md` vers `tests/helpers/correction-reports/latency-reserves.md`. `cmp .harness-state/tickets/T178/relecture-3.md tests/helpers/correction-reports/latency-reserves.md` : code 0 (`correction-1-fixture-identity.log`). Les deux blocs attendus sont sélectionnés entre les titres explicites de la section Constats et la section Écarts, indépendamment du parseur. Aucun test ne lit les états historiques.
- Nettoyage des deux mineurs : une fonction `locations(text)` définit le repère et sert au découpage comme à la déduplication ; le callback `reportRecovery` nomme le signalement d’une récupération déjà survenue. Les scénarios comportementaux existants restent la preuve du signalement et des refus.
- Vérification de consigne : `rg -n "reste" .agents/skills/ticket-codex/SKILL.md` : code 0, sortie exacte ci-dessous et dans `correction-1-skill-reste.log`.

```text
18:`hooks.json` reste figé : changer un script appelé conserve l'approbation ; changer la définition
55:avec sa raison dans `ecarts.md` ; le relecteur suivant tranche. Garde dans `reste` uniquement tes propres
57:pas dans `reste` et ne modifie pas ses rapports. Mets le journal à jour et rends un nouveau verdict.
60:La première relecture d'une tentative reste complète. Les suivantes sont des relectures de
63:code inchangé devient une réserve hors périmètre ; un bloquant reste possible partout.
81:  "reste": []
85:`TERMINÉ` signifie que les critères sont couverts par les preuves disponibles ; la relecture reste
88:reste manquant : ne contourne pas la protection et ne le déclare pas livré.
89:Tes réserves dans `reste` nomment tes propres constats hors périmètre, les écarts à trancher et les
```

- Vérification après nettoyage : `node --test --test-concurrency=1 --test-name-pattern='historical correction report|fields and numbered steps|location and class in the body|nested review section|Codex preserves|finding count disagrees|accepted deviations|last accepted Codex review|Codex integrates recovered|Codex recovery never|recovered invocation|a failed Codex session' tests/ticket-loop.test.cjs` : 43/43 verts (`correction-1-targeted-green.log`). Les dix rapports historiques et les refus discriminants restent couverts.
- Contrôle intermédiaire : `node scripts/check.mjs --changed` : rouge uniquement sur une ligne ajoutée de plus de 160 caractères après le renommage ; format, lint, gel, cliquet et 193/193 tests JS verts (`correction-1-check-changed.log`). L’appel trop long est simplifié par une variable `request`. `node scripts/check.mjs --changed --no-tests` : code 0, règles, format, lint, gel et cliquet verts (`correction-1-check-rules.log`) ; cette commande ne lance pas les tests. Les bancs d’acceptation et le contrôle complet final ci-dessous portent sur cette dernière version.
- Banc d’acceptation après correction : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs` : code 0, 227/227 réussis, aucun ignoré (`correction-1-loop-and-guards.log`). Les dix fixtures transmettent leurs constats complets, avec les réserves propres à Codex et les écarts acceptés ; les gardes de session, de témoin et de relecteur restent actives. Aucun fournisseur réel appelé.
- Contrôle final après correction : `node scripts/check.mjs` : code 0, `check : vert` ; règles, format, lint, gel et cliquet verts ; 1 564/1 564 tests JS sur 120 fichiers, 22 tests Python OK (`correction-1-check-full.log`). Le contrôle complet couvre la dernière version du code, après simplification de l’appel. Aucun fournisseur réel appelé.
- Nouveau verdict : `TERMINÉ` dans `.harness-state/tickets/T199/verdict.json`. Le bloquant et les deux mineurs de la relecture 1 sont corrigés, sans contestation ni écart restant. La réserve documentaire demeure dans le rapport du relecteur, sans copie dans `reste`. Aucun rapport historique modifié, aucun commit ni push dans le dépôt de travail ; la boucle reprend la relecture indépendante et l’intégration.

- Reprise après relecture 2 : rapport, ticket et journal, écarts, `git status` et `git diff` lus. Bloquant accepté : les listes de repères dans un constat tronquent silencieusement son corps. Reproduction par la boucle prévue avant correction ; aucun écart ni contestation. Détails dans `exploration.md` du dossier d’état.
- Reproduction du blocage de la relecture 2 : `node --test --test-concurrency=1 --test-name-pattern='location lists inside a finding body' tests/ticket-loop.test.cjs` : 6/6 rouges sur `deepStrictEqual` (`correction-2-extraction-red.log`), puis 6/6 verts (`correction-2-extraction-green.log`). Sous un titre sans repère, du gras ou une puce en gras, les listes de repères à puces et numérotées perdaient leurs champs malgré un compte exact. Chaque cas passe par la correction reprise, puis observe le texte complet avec `relecture-2.md` dans `integre.reserves`, son occurrence unique au journal committé et `Reserves: 1` dans le commit du dépôt jetable.
- Correction : le découpage conserve la forme d’ouverture du constat. Une liste du corps ne redécoupe plus un titre ou du gras ; les constats successifs à puces ou numérotés restent séparables. `findingForm` nomme désormais la forme renvoyée. `node --test --test-concurrency=1 --test-name-pattern='historical correction report|fields and numbered steps|location and class in the body|location lists inside a finding body|nested review section|Codex preserves|finding count disagrees|accepted deviations|last accepted Codex review' tests/ticket-loop.test.cjs` : 40/40 verts (`correction-2-targeted-green.log`), dont les dix rapports réels, les puces successives, les formes `numbered` et `fields`, les champs et le repli référencé sur les discordances véritables.
- Contrôle des fichiers modifiés : `node scripts/check.mjs --changed` : code 0, `check : vert`, règles, format, lint, gel et cliquet verts, 199/199 tests JS réussis (`correction-2-check-changed.log`). Ce contrôle porte sur le parseur renommé `findingForm`.
- Banc d’acceptation : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs` : code 0, 233/233 tests verts, aucun ignoré (`correction-2-loop-and-guards.log`). Les garanties de flux, de témoins et de relecteur restent actives ; tous les fournisseurs sont des doublures.
- Contrôle final : `node scripts/check.mjs` : code 0, `check : vert`, règles, format, lint, gel et cliquet verts ; 1 570/1 570 tests JS sur 120 fichiers et 22 tests Python OK (`correction-2-check-full.log`). `git diff --check` : code 0. Aucun contrôle requis manquant et aucun fournisseur réel appelé.
- Nouveau verdict : `TERMINÉ` écrit dans `.harness-state/tickets/T199/verdict.json`. Le blocage de la relecture 2 est corrigé, sans écart ni contestation. La réserve documentaire demeure portée par le rapport du relecteur, sans copie dans `reste`. Aucun commit ni push dans le dépôt de travail ; la boucle assure la relecture et l’intégration.

### Réserves à la clôture

- .harness-state/tickets/T199/relecture-3.md : `docs/travail/README.md:275` et `docs/adr/0012-la-boucle-separe-codex-et-son-relecteur-claude.md:67-68` : hors périmètre

  - **Ce qui ne va pas.**
    - Le README dit toujours qu'« une erreur du flux ou un processus Codex en échec refuse la tentative ». Je l'ai vérifié à la ligne 275.
    - L'ADR décrit toujours une erreur après le début d'un tour comme un refus.
    - L'événement `reconnexion` n'est documenté nulle part.
  - **Attendu.** Un ticket documentaire qui aligne le README et l'ADR 0012 sur la reconnexion récupérée. Ce ticket est en `adr: non` et ne liste pas ces fichiers.
  - **Classe.** Hors périmètre.
