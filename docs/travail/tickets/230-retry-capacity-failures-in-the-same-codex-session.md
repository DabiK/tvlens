---
id: T230
titre: Retry capacity failures in the same Codex session
statut: termine
bloque_par: T229
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une indisponibilité de capacité Codex provoque des reprises bornées de la session au même palier
avant de compter un échec. Le harnais distingue ce cas d'un refus d'implémentation ou de relecture,
sans perdre le travail, les traces ou les contrôles de confinement de la session.

## Sources

- Plan du 17/10, T230 ; T199 et son journal fixent la reconnexion rattrapée.
  Trace réelle dans le dépôt principal, où tourne la boucle :
  `/Users/Dabi/Documents/ISN/tvlens/.harness-state/tickets/T202/codex-1.jsonl:157-158`
  (`error` puis `turn.failed`, même message « Selected model is at capacity. Please try a different model. »),
  pendant la correction qui reprend le fil (`:100`) après une première relecture.
  La fixture reproduit ces deux lignes et cite leur provenance.
- Code vérifié à `1d8aa48` : `scripts/loop/codex.mjs:89` décode les événements JSONL ;
  `scripts/loop/codex.mjs:99` efface les erreurs récupérées seulement sur `turn.completed` ;
  `scripts/loop/codex.mjs:106` rend `turn.failed` terminal et `scripts/loop/codex.mjs:130`
  reprend la dernière erreur non récupérée à la sortie de l'enfant.
- `scripts/loop/codex.mjs:138` vérifie l'identité et `scripts/loop/codex.mjs:142` le témoin
  des hooks, appelés à chaque invocation par `scripts/loop/codex.mjs:174` ;
  `scripts/loop/codex.mjs:182` reprend une correction ; `scripts/loop/codex.mjs:329` pilote la
  tentative et ses relectures. Une correction n'est pas une reprise de capacité.
- `scripts/loop/run.mjs:453` ajoute toute issue à l'historique avant classification ;
  `scripts/loop/run.mjs:472` écrit le refus. `scripts/loop/models.mjs:50` choisit le palier
  d'après le numéro de tentative. T229 stabilise les mêmes fichiers et le même banc.
- `tests/helpers/codex-session.cjs:94` construit les événements du faux Codex ;
  `tests/ticket-loop.test.cjs:2599` couvre les reconnexions récupérées et
  `tests/ticket-loop.test.cjs:2634` les erreurs terminales qui doivent rester des échecs.

## Périmètre

- Modifier `scripts/loop/codex.mjs`, son raccord à `scripts/loop/run.mjs` si nécessaire,
  `tests/helpers/codex-session.cjs` et `tests/ticket-loop.test.cjs`. Autorisation de harnais
  limitée à cette politique et aux aides nécessaires ; ne pas changer les échelles de modèles.
- Classer à la frontière du flux les erreurs explicites de capacité/surcharge. Conserver un
  résultat structuré distinct de `problem`. Établir les variantes reconnues par des fixtures
  d'événements `error`/`turn.failed` ; le texte d'un outil, d'un fichier lu, d'une réponse agent,
  stderr seul ou la seule sortie non nulle ne suffit jamais à classer la capacité.
- Si Codex récupère déjà dans la même invocation et termine son tour, garder T199 : aucune
  invocation supplémentaire. Sinon attendre la sortie réelle de l'enfant, puis retenter avec
  attente, au même modèle, effort, relecteur et numéro de tentative. Réutiliser l'identité du
  fil quand elle est connue et validée, y compris pendant une correction après relecture.
- Nommer à un seul endroit un nombre maximal de reprises et les attentes correspondantes.
  Injecter attente/temps dans l'aide de reprise pour les tests. `--timeout-min` borne aujourd'hui
  chaque invocation (`scripts/loop/codex.mjs:115`, `:343`, `:373`), pas la tentative. Les reprises
  de capacité d'une même invocation partagent son délai : une reprise ne reçoit que le temps restant.
  Ne pas consommer le budget des corrections de relecture pour une indisponibilité du fournisseur.
- Garder les témoins de hooks neufs par invocation, le contrôle d'identité, les options de reprise
  et les protections d'outils. Une identité absente ne permet pas d'inventer une session ; ne
  démarrer à neuf que si aucun travail n'a pu commencer, sinon rendre un refus explicite.
  Un échec de confinement ou une reprise impossible ne devient pas une boucle de capacité.
- Journaliser ticket, tentative, invocation, reprise et attente, avec diagnostic borné. Conserver
  toutes les invocations et leur consommation dans le rapport de la tentative ; ne pas écraser
  le JSONL lors d'une reprise. Après épuisement seulement, compter un échec et laisser la boucle
  suivre sa politique ordinaire d'escalade. Le quota épuisé sera traité séparément par T231.

## Critères d'acceptation

1. Capacité puis succès, avec `--attempts 1` : le ticket est intégré en une tentative ; les appels
   de reprise gardent fil, modèle et effort, et la relecture n'est lancée qu'après un vrai succès.
   Les attentes observées sont celles de la politique bornée, sans attente murale dans le test.
   Le banc fixe les attentes du vrai chemin de boucle par une couture nommée
   (option ou variable lue par `scripts/loop/codex.mjs`).
2. Une série de surcharges s'arrête à la borne ou au plafond de durée ; elle produit exactement
   un refus compté, puis une escalade ordinaire si une tentative reste. Aucun troisième chemin
   de correction ou compteur infini n'est ajouté.
3. Une capacité pendant une correction reprend cette correction et conserve le rapport précédent,
   son interdiff et le nombre de corrections utiles. Le travail déjà écrit demeure ; aucune
   relecture antérieure ne suffit à accepter l'état nouveau.
4. Les erreurs rattrapées de T199 ne déclenchent pas la nouvelle reprise ; échec inconnu,
   authentification, hook absent, identité étrangère, arrêt ou délai gardent leur issue terminale.
   Une phrase de capacité dans un résultat d'outil ou une réponse agent n'active pas la politique.
5. Chaque invocation a sa trace et sa consommation, même si elle n'a pas abouti. Pas de relecteur
   sur une invocation échouée, pas de processus laissé vivant avant la suivante.
6. À l'implémentation, jouer `tests/ticket-loop.test.cjs` en séquentiel, avec les cas T199 et T229,
   puis `node scripts/check.mjs`. Aucun test, contrôle de reprise ou plancher n'est affaibli.

## Test d'acceptation attendu

Le faux exécutable de `tests/helpers/codex-session.cjs` émet des suites déterministes de capacité,
reprise et succès ou refus. `tests/ticket-loop.test.cjs` observe arguments, témoins, journaux,
nombre de relectures et commits du dépôt temporaire. Un banc de l'aide injectée prouve les
attentes et le plafond ; il complète la preuve par le vrai chemin de boucle.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le plan ne donne pas de taxonomie fournisseur exhaustive. La liste reconnue sera limitée aux
formes explicitement caractérisées, dont la forme de la trace de T202, jamais à tout `rate_limit`, 429
ou échec réseau. Les bornes choisies sont une politique technique documentée, pas une mesure
du temps de retour du fournisseur. Aucun appel Codex réel n'est requis pour cette preuve.

## Journal

- Exploration : consignes, moteur, appelants, bancs, ADR 0012/0056, journal T199 et trace T202 lus. Politique prévue : trois reprises (15, 30, 60 secondes), délai partagé et reconnaissance limitée aux événements du message fournisseur caractérisé. Détails et justification des deux aides nécessaires dans `.harness-state/tickets/T230/exploration.md` et `ecarts.md`. Les fichiers non suivis préexistants sont hors périmètre.

- Premier rouge : `node --test --test-concurrency=1 --test-name-pattern='Codex retries a capacity' tests/ticket-loop.test.cjs` : un échec sur assertion (blocage au lieu d'intégration), puis un succès après l'implémentation minimale (`capacity-red.log`, `capacity-green.log`). La fixture exportée par `tests/helpers/codex-session.cjs` reproduit exactement les événements T202:157–158 du 17 octobre ; aucun test ne lit les traces du dépôt principal.
- Délai : le banc à horloge injectée observe les attentes 15 000, 30 000 et 60 000 ms et les budgets restants, sans attente murale. `node --test --test-concurrency=1 --test-name-pattern='capacity|useful corrections' tests/ticket-loop.test.cjs` : un rouge sur un succès après échéance, puis 12/12 verts (`capacity-policy-red.log`, `capacity-policy-green.log`). La découverte des options/MCP et l'exécution partagent aussi ce délai.
- Confinement : `node --test --test-concurrency=1 --test-name-pattern='capacity|useful corrections|resume failure' tests/ticket-loop.test.cjs` : deux rouges, sur le diagnostic d'identité absente après travail et une régression du repli historique avant tour (`capacity-confinement-red.log`). Correction : refus explicite sans inventer de fil, distinction entre panne non récupérée et arrêt physique. La commande élargie aux cas T199 et aux échecs de session donne 30/30 verts (`capacity-confinement-green.log`).
- Fin réelle : `node --test --test-concurrency=1 --test-name-pattern='standalone capacity|capacity retry without' tests/ticket-loop.test.cjs` : deux verts et un rouge sur une reprise sans `turn.completed` pourtant déclarée TERMINÉE (`completion-red.log`). Après correction, la sélection capacité, corrections, reprises et T199 donne 32/32 verts (`completion-green.log`). Les invocations sont attendues jusqu'à leur fermeture, gardent leurs traces propres et leur flux cumulé ; chaque reprise a un témoin neuf et les jetons disponibles sont cumulés, même avant un échec.
- Contrôle intermédiaire : `node scripts/check.mjs --changed --no-tests` : code 0, règles, format, lint, gel et cliquet verts (`rules-final.log`). Cette commande ne lance pas les tests ; les bancs et le contrôle complet sont encore à exécuter sur l'état final.
- Banc de boucle complet : `node --test --test-concurrency=1 tests/ticket-loop.test.cjs` : code 0, 257/257 réussis, aucun ignoré (`loop-full.log`), dont les cas T199 et T229. Les deux corrections utiles sont aussi vérifiées sur des contenus distincts : travail intermédiaire conservé et interdiff relu avant chaque acceptation.
- Dernière borne de diagnostic : `node --test --test-concurrency=1 --test-name-pattern='oversized capacity' tests/ticket-loop.test.cjs` : rouge sur assertion (4 147 caractères dans le refus, `diagnostic-red.log`). Une identité trop longue est désormais invalide ; le refus reste court, sans invocation supplémentaire. Après cette correction et le découpage des consommateurs d'événements, `node --test --test-concurrency=1 --test-name-pattern='capacity|useful corrections|resume failure|Codex integrates recovered|Codex recovery never|recovered invocation' tests/ticket-loop.test.cjs` : code 0, 33/33 verts (`diagnostic-green.log`). Le contrôle complet ci-dessous couvre cette version finale.
- Contrôle complet final : `node scripts/check.mjs` : code 0, `check : vert` ; règles par fichier, format, lint, gel et cliquet verts ; 2 610/2 610 tests JavaScript sur 145 fichiers, aucun échec, et 47 tests Python OK (`check-full.log`). Il porte sur la version finale, avec le cas d'identité trop longue et les consommateurs d'événements découpés. Aucun fournisseur réel appelé, aucun test ou plancher affaibli.
- Livraison : politique et frontière JSONL isolées dans les deux aides annoncées, raccord sans changement de `run.mjs` ni des paliers. Exploration, écarts, couverture des critères et sorties conservés dans `.harness-state/tickets/T230/`. Verdict `TERMINÉ` écrit dans ce dossier ; aucun écart ni contrôle requis restant. Aucun commit ni push dans le dépôt de travail ; relecture et intégration laissées à la boucle.
- Reprise après relecture 1 : rapport, ticket, journal, écarts, état Git et diff relus. Trois constats mineurs acceptés ; preuves à renforcer sur les échecs non capacitaires, la minuterie du raccord et la fermeture réelle de l'enfant. Frontières et méthode consignées dans `exploration.md` ; aucun nouvel écart prévu. Le constat documentaire hors périmètre reste à la boucle.
- Classification : `node --test --test-concurrency=1 --test-name-pattern='Codex refuses a non-capacity' tests/ticket-loop.test.cjs` : 4/4 verts. Les phrases d'outil et de réponse agent sont associées à des événements `error`/`turn.failed` d'authentification ou inconnus : une invocation, aucun événement de reprise, un refus et aucune relecture. Une mutation temporaire reconnaissant tous les diagnostics fournisseur donne 4 rouges sur assertion, puis est restaurée (`correction-classification-red.log`, `correction-classification-green.log`).
- Minuterie : `node --test --test-concurrency=1 --test-name-pattern='passes each capacity delay' tests/ticket-loop.test.cjs` : un rouge sur l'interrupteur encore inconnu (`correction-timer-red.log`), puis deux verts après renommage en `TVLENS_CODEX_SKIP_CAPACITY_WAIT=1`. La vraie commande de boucle charge une doublure de la minuterie externe et observe les appels 15 000, 30 000 et 60 000 ms entre les invocations ; une mutation remplaçant `sleep(delay)` par une promesse immédiate donne un rouge sur les attentes absentes (`correction-timer-no-wait-red.log`). Aucune attente murale n'est ajoutée.
- Fermeture : `node --test --test-concurrency=1 --test-name-pattern='a capacity stream stays pending' tests/ticket-loop.test.cjs` : un vert avec un enfant gardé vivant après ses événements et sa fermeture de stdout. Un signal explicite le libère ; la promesse reste pendante jusque-là et le PID a disparu à sa résolution. Une mutation résolvant dès `turn.failed` donne un rouge sur l'assertion de promesse pendante (`correction-close-red.log`, `correction-close-green.log`), puis est restaurée.
- Régressions ciblées après restauration des mutations : `node --test --test-concurrency=1 --test-name-pattern='capacity|useful corrections|resume failure|Codex integrates recovered|Codex recovery never|recovered invocation' tests/ticket-loop.test.cjs` : code 0, 40/40 verts, aucun ignoré (`correction-focused-green.log`). Les contrôles complets restent à lancer sur cette correction.
- Validation de la correction : `node scripts/check.mjs --changed` : code 0, règles, format, lint, gel et cliquet verts ; le banc complet `tests/ticket-loop.test.cjs` est exécuté en séquentiel par ce contrôle, 265/265 tests réussis (`correction-check-changed.log`), cas T199 et T229 compris. Puis `node scripts/check.mjs` : code 0, `check : vert`, 2 617/2 617 tests JavaScript sur 145 fichiers et 47 tests Python OK (`correction-check-full.log`). Le compteur de tests harnais passe de 396 à 414, sans modification du plancher.
- Remise après correction : trois constats mineurs traités, aucune contestation ni réserve propre restante. Verdict `TERMINÉ` réécrit dans `.harness-state/tickets/T230/verdict.json`. Les mutations de preuve sont restaurées ; aucun fournisseur réel, commit ou push dans le dépôt de travail. Relecture de correction et intégration laissées à la boucle.
- Contrôle d'arrêt ultérieur (`stop:5`) : ROUGE. Le hook `.claude/hooks/stop-gate.mjs` impose `TVLENS_TEST_BUDGET_MS=240000` au contrôle des fichiers modifiés ; le banc de boucle est interrompu à 240 secondes, après des scénarios encore réussis, avant le résultat global. Les contrôles directs verts ci-dessus utilisaient le budget par défaut de `check.mjs` (20 minutes) et ne prouvent pas le respect de cette borne plus courte. Ce rouge n'est ni écarté ni relancé jusqu'au vert. Aucun budget, hook, contrôle, test ou plancher n'est modifié pour le contourner. Verdict remplacé par `PARTIEL`, avec le dépassement comme réserve propre ; la validation sous le budget du hook reste manquante malgré les suites directes vertes.
- Reprise après `echec-1.txt` : rapport, journal, relecture et état du travail relus. Diagnostic du dépassement engagé avec le budget exact du hook : `TVLENS_TEST_BUDGET_MS=240000 /usr/bin/time -p node scripts/check.mjs --changed` (`resume-check-budget.log`). Aucun changement des sources ni relèvement du budget avant cette mesure ; résultat encore en attente.

- Reproduction sous le budget du hook : `TVLENS_TEST_BUDGET_MS=240000 /usr/bin/time -p node scripts/check.mjs --changed` : code 0, `check : vert`, 265/265 tests réussis, commande entière en 218,55 s (`resume-check-budget.log`). Une seule exécution de diagnostic, aucune modification de source ni de budget. Le dépassement précédent n'est pas reproduit ; sa cause exacte n'est pas démontrée et n'est pas déclarée corrigée. Le journal historique mesure 220,09 s cumulées, dont 13,53 s pour les 22 cas de capacité ; analyse conservée dans `resume-duration-analysis.json`. Le contrôle complet requis est lancé (`resume-check-full.log`), résultat en attente.

- Validation complète de la reprise : `/usr/bin/time -p node scripts/check.mjs` : code 0, `check : vert`, 2 617/2 617 tests JavaScript sur 145 fichiers et 47 tests Python OK ; durée totale 386,38 s (`resume-check-full.log`). Les contrôles ont tourné en séquentiel. Les empreintes des cinq fichiers de code et de tests sont inchangées depuis la reprise (`resume-tested-files.json`) ; aucun nouveau correctif de code n'était nécessaire pour obtenir ces résultats.
- Remise de la reprise : verdict `TERMINÉ` écrit dans `.harness-state/tickets/T230/verdict.json`, preuves courantes et réserve propre conservées. Le contrôle exact sous 240 s est désormais prouvé vert ; l'ancien dépassement reste un incident non reproduit dont la cause exacte n'est pas démontrée, sans correctif de durée revendiqué. Aucun test, budget, hook ou plancher modifié, aucun commit ni push. Relecture et intégration laissées à la boucle.

- Reprise après relecture 2 : rapport, journal, écarts, état Git et diff relus ; les trois constats bloquant et mineurs sont acceptés. Exploration et cycles prévus consignés dans `exploration.md`, aucun nouvel écart. Les corrections portent sur les avertissements de démarrage, les preuves de confinement pendant une vraie correction et la borne commune des diagnostics.
- Avertissements : `node --test --test-concurrency=1 --test-name-pattern='startup warnings preserve|Codex refuses a missing identity' tests/ticket-loop.test.cjs` : deux rouges sur assertion, avec et sans fil, et trois gardes de travail vertes (`correction-2-startup-red.log`). Après exclusion des items `error`, la sélection élargie par `|resume failure` donne 7/7 verts (`correction-2-startup-green.log`). La fixture conserve les quatre avertissements T202:101–104 ; le banc vérifie le repli neuf, la même consigne et un témoin propre.
- Confinement pendant correction : `node --test --test-concurrency=1 --test-name-pattern='a capacity retry during correction' tests/ticket-loop.test.cjs` : 3/3 verts sur options, hooks et identité après une première relecture refusée et une capacité. Une mutation temporaire retirant `retry === 0 &&` donne 3/3 rouges sur l’apparition de `reprise-impossible`, puis la source est restaurée (`correction-2-confinement-baseline.log`, `correction-2-confinement-red.log`). Les tests initiaux restent présents avec des noms exacts.
- Diagnostics : `node --test --test-concurrency=1 --test-name-pattern='invocation diagnostics remain bounded' tests/ticket-loop.test.cjs` : deux rouges sur 12 853 et 2 257 caractères (`correction-2-diagnostic-red.log`). La borne nommée du flux est partagée avec le raccord et appliquée avant tout rapport d’invocation. La sélection `invocation diagnostics remain bounded|a capacity retry during correction` donne 5/5 verts après restauration de la mutation (`correction-2-diagnostic-confinement-green.log`).
- Régressions ciblées : `node --test --test-concurrency=1 --test-name-pattern='capacity|useful corrections|resume failure|Codex integrates recovered|Codex recovery never|recovered invocation|invocation diagnostics' tests/ticket-loop.test.cjs` : code 0, 49/49 verts, aucun ignoré (`correction-2-focused-green.log`). La comparaison indépendante de la fixture aux quatre événements réels est verte (`correction-2-fixture-check.log`). Le contrôle des fichiers modifiés est lancé avec le budget du hook inchangé à 240 s (`correction-2-check-changed.log`).
- Contrôle des fichiers modifiés : `TVLENS_TEST_BUDGET_MS=240000 /usr/bin/time -p node scripts/check.mjs --changed` : code 0, `check : vert`, règles, format, lint, gel et cliquet verts ; banc complet de boucle en séquentiel, 274/274 réussis, commande en 219,44 s (`correction-2-check-changed.log`). Aucun budget ni plancher modifié. Le contrôle complet requis est lancé sur les mêmes sources.
- Contrôle complet de la correction 2 : `/usr/bin/time -p node scripts/check.mjs` : code 0, `check : vert`, règles, format, lint, gel et cliquet verts ; 2 626/2 626 tests JavaScript sur 145 fichiers et 47 tests Python OK, durée totale 392,10 s (`correction-2-check-full.log`). Les cinq empreintes de `correction-2-tested-files.json` sont inchangées depuis les validations ciblées. Les suites ont tourné en séquentiel.
- Remise après relecture 2 : le constat bloquant et les deux mineurs sont corrigés, avec les rouges et verts observés. Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T230/verdict.json` ; aucune contestation ni réserve propre nouvelle. Les deux constats hors périmètre de la relecture restent transmis par la boucle. Aucun fournisseur réel appelé, aucun test ou contrôle affaibli, aucun commit ni push dans le dépôt de travail ; relecture et intégration laissées à la boucle.

- Reprise après relecture 3 : rapport, ticket et journal, écarts, état Git et diff relus. Le constat bloquant de perte du motif de confinement est accepté ; exploration et preuves prévues consignées dans le dossier d’état, sans nouvel écart. Cycle rouge puis vert prévu sur le flux long, le stderr long et les trois motifs de refus pendant une correction.
- Diagnostic de confinement : `node --test --test-concurrency=1 --test-name-pattern='invocation diagnostics remain bounded|a bounded correction diagnostic|a failed Codex process with long stderr' tests/ticket-loop.test.cjs` : 5 rouges sur assertion de motif absent, 1 vert (`correction-3-diagnostic-red.log`). Après placement du motif avant le diagnostic fournisseur, même commande : code 0, 6/6 verts (`correction-3-diagnostic-green.log`). Le cas stderr conserve aussi sa trace complète ; les trois motifs sont vérifiés dans les rapports de correction et dans le repli ou le fichier d’échec.
- Contrôle des fichiers modifiés lancé : `TVLENS_TEST_BUDGET_MS=240000 /usr/bin/time -p node scripts/check.mjs --changed` (`correction-3-check-changed.log`). Le budget du hook est conservé ; résultat en attente.
- Contrôle des fichiers modifiés : `TVLENS_TEST_BUDGET_MS=240000 /usr/bin/time -p node scripts/check.mjs --changed` : code 0, `check : vert` ; règles, format, lint, gel et cliquet verts ; banc complet de boucle en séquentiel, 278/278 tests réussis, commande en 225,39 s (`correction-3-check-changed.log`). Le contrôle complet est lancé ensuite sur les mêmes sources.
- Contrôle complet de la correction 3 : `/usr/bin/time -p node scripts/check.mjs` : code 0, `check : vert` ; règles, format, lint, gel et cliquet verts ; 2 630/2 630 tests JavaScript sur 145 fichiers, 47 tests Python OK, commande en 399,87 s (`correction-3-check-full.log`). Les cinq empreintes de `correction-3-tested-files.json` sont inchangées depuis les tests ciblés ; les contrôles ont tourné en séquentiel.
- Remise après relecture 3 : constat bloquant corrigé, cinq pertes de motif reproduites avant correction puis six cas ciblés verts. Les motifs et le remède restent lisibles sous la borne dans les événements, les rapports et les fichiers d’échec. Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T230/verdict.json`, aucune contestation ni réserve propre nouvelle. Les constats hors périmètre restent transmis par la boucle. Aucun fournisseur réel appelé, aucun test, contrôle ou budget affaibli, aucun commit ni push ; relecture et intégration laissées à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T230/relecture-4.md : 1. `.claude/hooks/stop-gate.mjs:17` : la marge sous le budget du contrôle d'arrêt continue de baisser (hors périmètre)

  - **Ce qui ne va pas.** Le hook coupe le banc de boucle à 240 s. La durée du contrôle `--changed` monte d'une correction à l'autre :

    | Mesure | Durée | Tests |
    | --- | --- | --- |
    | `resume-check-budget.log` | 218,55 s | 265 |
    | `correction-2-check-changed.log` | 219,44 s | 274 |
    | `correction-3-check-changed.log` | 225,39 s | 278 |

    - Il reste environ 14,6 s de marge, soit 6 %.
    - Les quatre tests ajoutés par cette correction coûtent environ 3,5 s (`correction-3-diagnostic-green.log`).
    - Un dépassement donnerait un refus sans rapport avec le comportement du ticket, comme `echec-1.txt`.
  - **Attendu.** Suivre cette durée sous charge dans un ticket de harnais : découper le banc, l'accélérer ou revoir le budget du hook. Rien n'est à changer dans ce ticket.
  - **Classe.** Hors périmètre (constat 3 de la relecture 3, mesuré de nouveau).
- .harness-state/tickets/T230/relecture-4.md : 2. `docs/adr/0012-la-boucle-separe-codex-et-son-relecteur-claude.md:64-70` et `docs/travail/README.md:211-213` : la documentation ne décrit pas la reprise de capacité (hors périmètre)

  - **Ce qui manque.** Aucune page ne décrit encore :
    - les trois reprises après 15, 30 et 60 s ;
    - le délai partagé entre une invocation et ses reprises ;
    - les événements `capacite-reprise`, `capacite-epuisee` et `invocation-terminee` ;
    - les traces `codex-<n>-<invocation>.jsonl` ;
    - le refus sans session neuve quand le confinement échoue pendant une reprise ;
    - la règle nouvelle : dans un refus, le motif de confinement passe avant le diagnostic.
  - **Attendu.** Un ticket autorisé à modifier la documentation.
  - **Classe.** Hors périmètre (constat 2 de la relecture 3).
- .harness-state/tickets/T230/relecture-4.md : **Écart accepté (périmètre, aucun critère visé).** Les aides `codex-capacity.mjs` et `codex-stream.mjs` restent des « aides nécessaires » autorisées. `revue-4.fichiers` ne liste que les cinq fichiers déjà acceptés ; cette correction ne touche que `codex.mjs`, `codex-session.cjs` et `ticket-loop.test.cjs`.
