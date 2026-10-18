---
id: T231
titre: Stop the loop clearly when the Codex quota is exhausted
statut: termine
bloque_par: T230
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Un quota Codex épuisé remet le ticket à faire et arrête la boucle en donnant la reprise annoncée,
sans compter d'échec ni monter de palier. Ce ticket modifie le harnais ; le travail et les traces
restent en place, avec un message qui signale l'état de l'arbre laissé sur disque.

## Sources

- Plan du 17/10, T231, et relecture A, constats 5 et 6 : séparer l'arrêt pour quota de la relève
  sur Claude, livrée par T251. L'incident T208 n'avait produit aucun travail :
  `/Users/Dabi/Documents/ISN/tvlens/.harness-state/loop/events.jsonl:487` et `:490`
  comptent zéro tour et zéro jeton, en 72 s puis 4 s.
- Message réel : `/Users/Dabi/Documents/ISN/tvlens/.harness-state/loop/events.jsonl:488` et
  `:491` du dépôt principal ; apostrophe U+2019, date « Oct 22nd, 2026 8:41 AM » sans fuseau,
  URL dans le texte. Les JSONL bruts de T208 sont dans
  `/Users/Dabi/Documents/ISN/tvlens/.harness-state/archives/T208-quota-codex-1792226582141/etat/codex-1.jsonl:47-48`
  et dans `codex-2.jsonl:7-8` du même dossier : événements `error` puis `turn.failed`.
  Consultation en lecture seule.
- Code vérifié à `1d8aa48` : `scripts/loop/codex.mjs:105` traite `error` et
  `scripts/loop/codex.mjs:106` traite `turn.failed` sans catégorie quota ;
  `scripts/loop/codex.mjs:378` renvoie notamment `problem`. T230 livre la classification
  structurée et la reprise de capacité dans ce module.
- `scripts/loop/run.mjs:436` marque en cours, `:453` compte une tentative et `:478` finit par
  bloquer. Son en-tête `:15-16` documente les codes de sortie ; `:105-106` refuse un arbre suivi sale.
- Bancs : `tests/helpers/codex-session.cjs:94`, `tests/ticket-loop.test.cjs:2634` ;
  ADR 0012 pour l'indépendance de la relecture. T229 conserve verrou, lancement et compteurs.

## Périmètre

- Modifier `scripts/loop/codex.mjs`, `scripts/loop/run.mjs`, leurs helpers et
  `tests/ticket-loop.test.cjs`. Adapter les lecteurs de boucle si nécessaire pour rendre l'arrêt
  visible. Autorisation de harnais limitée à ces raccords, sans changement de permissions des agents.
- Reconnaître le quota seulement dans les événements Codex `error` et `turn.failed`. Propager
  une catégorie stable et une `reprise` bornée, absente représentée par `null`. Préférer les
  champs structurés établis ; la reconnaissance de phrase fournisseur reste dans ce décodeur.
  Ni contenu de fichier, ni sortie d'outil, ni réponse agent ne prouvent le quota. Distinguer
  débit passager, surcharge T230 et authentification ; ne pas classer tout 429.
- Un même refus livré par les deux événements produit une seule issue. Préserver T199 si le
  tour récupère et finit ; un échec terminal de quota prime sur une reprise de capacité.
  La reconnaissance accepte les deux apostrophes ; la reprise reste le texte annoncé. Garder
  la date sans inventer fuseau, échéance ou date locale quand sa normalisation est incertaine.
  Ne jamais recopier URL, secret ou message brut dans le diagnostic public.
- Intercepter cette issue avant l'ajout à l'historique des échecs : pas d'escalade, de blocage,
  de `tentative-refusee`, de contrôle/intégration, de relecture ni de rétrospective sur cette
  interruption. Remettre le ticket en `a-faire`, garder diff, journal et consommations des
  invocations déjà effectuées. L'arbre reste tel quel ; le message dit s'il contient du travail modifié.
- Émettre une fois `quota-epuise {ticket, reprise}` et un message français avec la reprise quand
  elle existe, sinon dire qu'elle n'est pas fournie. Documenter le nouveau code de sortie dans
  l'en-tête de `scripts/loop/run.mjs:15-16`. Libérer proprement l'enfant et le verrou.
- La relève Claude, son option et la reprise d'un arbre modifié appartiennent à T251. Ce lot
  ne change pas la garde d'arbre propre ni le mécanisme de relève de T229.

## Critères d'acceptation

1. Quota reçu par `error` seul, `turn.failed` seul et les deux : une seule issue, statut `a-faire`,
   aucune tentative refusée, aucun palier supplémentaire, aucune relecture ni commit ; le verrou
   est rendu. Le diagnostic donne la reprise annoncée ou son absence et un code de sortie documenté.
   Avant ou après écriture par le faux agent, le diff reste intact et son existence est signalée.
2. Une phrase identique dans un outil, un fichier ou une réponse ne change pas l'issue normale.
   Capacité T230, débit passager, 401 et erreur inconnue gardent leurs catégories. Les reconnexions
   récupérées et les échecs terminaux de T199 conservent leurs assertions. La fixture réelle T208
   avec U+2019 et sa variante ASCII sont reconnues sans diffuser l'URL ni interpréter le fuseau.
3. À l'implémentation, jouer `tests/ticket-loop.test.cjs` et les suites des lecteurs modifiés en
   séquentiel, puis `node scripts/check.mjs`. Aucun contrôle de revue, test ou plancher affaibli.

## Test d'acceptation attendu

Dans `tests/ticket-loop.test.cjs`, le faux Codex émet les deux formes d'événement quota avant
et après écriture d'un fichier. Le banc observe événement, statut, code de sortie, diagnostic,
diff conservé et absence d'escalade ; aucun moteur réel ni attente jusqu'à la date de reprise.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le message et sa provenance réels sont ceux de T208 cités ci-dessus : apostrophe U+2019,
date « Oct 22nd, 2026 8:41 AM » sans fuseau, URL dans le texte, événements `error` puis
`turn.failed`. La reconnaissance accepte les deux apostrophes ; la reprise reste le texte
annoncé. Les formes fournisseur non caractérisées ne sont pas devinées. Le lancement ordinaire
continue à refuser un arbre modifié ; sa reprise contrôlée sera livrée séparément par T251.

## Journal

- 18/10, orchestrateur : la première tentative a livré l'implémentation complète (2 661 tests JS et 47 tests Python
  verts) et ne s'est bloquée que sur un fichier hors dépôt : la sonde `experiments/essais/…/sonde.cjs`, déposée par
  l'orchestrateur avant le lancement, avait deux lignes de plus de 160 caractères. L'orchestrateur l'a corrigée ;
  `node scripts/check.mjs --changed` est vert sans ce ticket. Le travail est archivé dans
  `.harness-state/archives/T231-bloque-1/` : `code.patch`, `fichiers/scripts/loop/codex-quota.mjs`,
  `ticket-journal.patch` et `etat/` (preuves). Le réappliquer, le vérifier contre le code du moment, puis passer la
  relecture.
- Reprise : archive de la première tentative, traces et code courant relus, ainsi que les ADR 0012 et 0056.
  `git apply --check .harness-state/archives/T231-bloque-1/code.patch` : code 0.
  Exploration et absence d’écart consignées dans `.harness-state/tickets/T231/` ; preuves rejouées dans cette session.
- Rouge observé après restauration des tests :
  `node --test --test-name-pattern='Codex stops on quota after work: both' tests/ticket-loop.test.cjs` :
  code 1, assertion `0 !== 5` ; la boucle escalade puis intègre après le quota dans le dépôt jetable.
  Les quatre suites de lecteurs avec `--test-concurrency=1 --test-name-pattern='quota'` échouent sur
  5 assertions (phase de contrôle et diagnostic brut). Commandes et sorties dans `commandes.json`,
  `quota-stop-red.log` et `quota-readers-red.log` du dossier d’état.
- Implémentation archivée restaurée, helper `codex-quota.mjs` inclus ; aucun conflit avec le code courant.
  Arrêt avant l’historique des échecs, code 5 documenté, statut à faire, traces et travail conservés ;
  reconnaissance limitée aux événements fournisseur et diagnostics français dans les lecteurs.
- Vert ciblé observé : `node --test --test-name-pattern='quota' tests/ticket-loop.test.cjs` :
  26 tests réussis, 0 échec (`quota-green.log`). Formes des événements, date bornée sans fuseau,
  absence d’URL, distinction des erreurs, reprises de capacité/correction et conservation des consommations couvertes.
- Suites complètes observées, en séquentiel : `node --test tests/ticket-loop.test.cjs` :
  304 tests réussis, 0 échec, en 244 s (`ticket-loop.log`). Les suites
  `tests/loop-view-events.test.cjs tests/loop-view-state.test.cjs tests/loop-view-feed.test.cjs tests/loop-view-codex.test.cjs`,
  lancées par `node --test --test-concurrency=1` : 91 tests réussis, 0 échec (`readers.log`).
  Commandes exactes dans `commandes.json` du dossier d’état.
- `node scripts/check.mjs --changed` : code 0, contrôle vert ; règles, format, lint, gel,
  cliquet et 395 tests JS réussis (`check-changed.log`). Le refus expérimental de la première tentative
  ne se reproduit plus. Aucun contrôle ni plancher affaibli.
- `node scripts/check.mjs` : code 0, contrôle complet vert ; règles, format, lint, gel et cliquet verts,
  2 661 tests JavaScript (145 fichiers) et 47 tests Python réussis (`check-full.log`).
  `git diff --check` : code 0. Les fichiers préexistants hors périmètre restent intacts ; aucun commit ni push effectué par cette session.
- Des commits documentaires concurrents ont avancé HEAD pendant la validation : leurs chemins concernent
  d’autres tickets et leur index, sans toucher le code restauré ni T231 (`branche.log`).
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T231/verdict.json`, sans réserve restante.
  Travail prêt pour la relecture et l’intégration par la boucle ; statut en-cours conservé pour cette remise.
- Après remise, le contrôle Stop est ROUGE : `node scripts/check.mjs --changed`, exécuté par le hook
  avec `TVLENS_TEST_BUDGET_MS=240000`, interrompt les tests JS à 240 s (`hook-stop-failure.log`).
  La suite autonome précédente durait déjà 244,48 s ; les contrôles standards verts ci-dessus ne prouvent
  pas le respect de ce budget. Diagnostic dans `diagnostic-controle-stop.md` du dossier d’état.
- Verdict corrigé en `PARTIEL` : implémentation conservée, validation finale sous 240 s restante.
  Il faut réduire la durée du banc en conservant ses assertions, puis observer ce contrôle vert.
  Aucun budget, contrôle, test ou plancher assoupli ; aucune relance opportuniste, aucun commit ni push.

- Reprise après `echec-1.txt` : rouge du contrôle Stop confirmé par les traces. Profilage
  du banc : premier lancement de chaque copie de faux agent à 122–168 ms, suivants à
  19–23 ms ; script partagé dans trois dépôts jetables à 180/18/21 ms. Préparation
  des exécutables immuables à mutualiser, avec processus et état isolés par scénario.
  Exploration et absence d’écart consignées avant modification ; aucune assertion retirée.
- Mutualisation limitée aux scripts des doublures dans `tests/ticket-loop.test.cjs` :
  deux fichiers temporaires en lecture seule, liens par dépôt, nettoyage après la suite.
  Aucun scénario, appel de hook, assertion ou contrôle modifié.
- `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/loop-view-events.test.cjs
  tests/loop-view-state.test.cjs tests/loop-view-feed.test.cjs tests/loop-view-codex.test.cjs` :
  code 0, 395 tests réussis, 0 échec, 196,14 s. Commande, sortie et durée conservées dans
  `commandes-reprise.jsonl` et `suites-reprise.log` du dossier d’état. Les 13 empreintes
  des fichiers préexistants hors périmètre sont inchangées (`preexisting-reprise.log`).
- `TVLENS_TEST_BUDGET_MS=240000 node scripts/check.mjs --changed` : code 0,
  contrôle vert, 395 tests JS réussis ; durée totale 196,10 s, sous le budget de 240 s
  des tests du hook. Règles, format, lint, gel et cliquet verts (`check-stop-reprise.log`).
  Le rouge de durée est corrigé sans modifier de budget ni retirer de preuve.
- `node scripts/check.mjs` : code 0, contrôle complet vert en 380,90 s ;
  2 661 tests JavaScript sur 145 fichiers et 47 tests Python réussis, règles, format,
  lint, gel et cliquet verts (`check-full-reprise.log`). `git diff --check` : code 0.
- Verdict `TERMINÉ` réécrit dans `.harness-state/tickets/T231/verdict.json`, sans réserve.
  Le refus de durée de `echec-1.txt` est corrigé et sa preuve conservée. Ticket laissé
  en cours pour la relecture et l’intégration par la boucle ; aucun commit ni push.

- Reprise après `relecture-1.md` : trois constats mineurs confirmés, aucune contestation.
  Consignes, ticket, journal, écarts, statut, diff, code, bancs et ADR concernés relus.
  Exploration et correction prévue consignées avant modification dans le dossier d’état.
- Constat 1, rouge observé :
  `node --test --test-name-pattern='Codex stops on quota before work' tests/ticket-loop.test.cjs` :
  code 1, trois échecs sur le message d’arbre attendu avec un fichier non suivi préexistant
  (`correction-1-tree-red.log`). Filtrage de `context.untracked` ajouté au diagnostic quota.
  `node --test --test-name-pattern='Codex stops on quota' tests/ticket-loop.test.cjs` :
  code 0, six cas avant/après verts (`correction-1-tree-green.log`).
- Constat 2 : le test exige maintenant deux entrées `warn` avant d’examiner leur texte.
  `python3 .harness-state/tickets/T231/check-feed-mutation.py` : code 1 attendu dans
  une copie jetable privée des avertissements, assertion `[]` contre `["warn", "warn"]`
  (`correction-1-feed-mutation-red.log`). Aucun module du dépôt altéré par cette mutation.
  `node --test tests/loop-view-feed.test.cjs` : code 0, 11 tests verts (`correction-1-feed-green.log`).
- Constat 3 : renommage du booléen en `afterWork` après le vert des six scénarios.
  `node --test --test-concurrency=1 --test-name-pattern=quota tests/ticket-loop.test.cjs
  tests/loop-view-feed.test.cjs` : code 0, 27 tests verts (`correction-1-quota-green.log`).
  Commandes, codes et durées conservés dans `commandes-reprise.jsonl` du dossier d’état.
- `TVLENS_TEST_BUDGET_MS=240000 node scripts/check.mjs --changed` : code 0,
  395 tests JS réussis dans les cinq suites modifiées, exécutées en séquentiel ; règles,
  format, lint, gel et cliquet verts, durée totale 214,04 s (`correction-1-check-changed.log`).
  Les 13 empreintes des fichiers préexistants hors périmètre sont inchangées
  (`correction-1-preexisting.json`). Aucun contrôle ni budget affaibli.
- `node scripts/check.mjs` : code 0, contrôle complet vert en 397,32 s ; 2 661 tests
  JavaScript sur 145 fichiers et 47 tests Python réussis. Règles, format, lint, gel et
  cliquet verts (`correction-1-check-full.log`). `git diff --check` : code 0.
- Verdict `TERMINÉ` réécrit dans `.harness-state/tickets/T231/verdict.json` : les trois
  constats mineurs sont corrigés, sans réserve propre ni écart à trancher. Le diff de
  cette correction est conservé dans `correction-1.diff` du dossier d’état.
  Ticket laissé en cours pour la relecture de correction par la boucle ; aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T231/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 2 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
