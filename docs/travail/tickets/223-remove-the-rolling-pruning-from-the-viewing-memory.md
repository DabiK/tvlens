---
id: T223
titre: Remove the rolling pruning from the viewing memory
statut: termine
bloque_par: T215
adr: oui
installe: non
harnais: oui
supprime_tests: oui
niveau: critique
---

## Ce que le ticket livre

La Mémoire ne contient plus l'élagage glissant ni ses suppressions à retenter. Le code, les outils
hors ligne et les tests reflètent la conservation jusqu'à suppression explicite ; les preuves
historiques d'indisponibilité et les baux restent actifs.

## Sources

- Coupe de T215 selon relecture B, constats 1, 4 et 7 ; décision du propriétaire du 16/10 « ok go »,
  texte repris ci-dessous ; `docs/domaine.md`, sections 9 et 10 ; ADR 0029/0030.
- Code vérifié à `dd5efc9` : `core/session.cjs:48-52` normalise la durée, `:64` crée `unremoved`,
  `:73` la chaîne de balayage, `:153` balaie après ingestion, `:192-235` expire/défile/supprime,
  `:484-486` restaure la politique et `:492` la projette. Les hôtes sont déjà durables après T215.
- `app/session-rows.cjs:23-24` et `runtime/headless-session-lifecycle.cjs:62-67` calculent encore
  la politique depuis la durée du cœur. `adapters/local-store.cjs:95-116` possède les baux et
  suppressions différées explicites : ce mécanisme reste ; il ne dépend pas de `prune()`.
- Toutes les simulations portent une fenêtre : `scripts/simulate-stream.cjs:54`, `:58`, `:61`,
  `:64`, `:67`, `:72` ; construction à `:220`, lecture de séquence à `:294`, timer à `:300`.
  `scripts/bench-perceived.cjs:132` et `:236` déduisent le jeu historique de `retentionMs`.
- Tests à inventorier selon le tableau ci-dessous ; ADR 0002/0003/0004/0006/0008/0023.
  T194 a déjà retiré l'ancien ask et ses cas propres ; ne pas compter son retrait une seconde fois.
  T214 peut avoir extrait les files et leur retrait : relire ce propriétaire s'il est livré.

## Périmètre

- Retirer durée active, normalisation, `prune()`, `unremoved`, chaîne et appels qui ne servent
  qu'à l'élagage. Ne plus déplacer automatiquement un passage vers history. Garder sa lecture
  historique et ses motifs. Les champs publiés restent constants until-deleted/null et les
  champs persistés restent décodés par T208, sans réactiver de suppression.
- Simplifier les lignes de session Mac/headless citées ; aucune dépendance au champ interne
  `retentionMs`. Conserver les rafraîchissements d'horloge et de manifeste de T215/T209.
  Ne pas réécrire l'ordonnanceur des voies si T214 l'a déjà extrait.
- Supprimer les fenêtres de tous les scénarios hors ligne. Les parcours de cadences, files,
  recherche et longue durée utilisent la conservation durable ; les médias expirés et la
  recherche de leurs textes se prouvent sur archive historique, avec description honnête.
  Les dispositions rolling du banc de mesure restent éventuellement des jeux historiques
  explicitement nommés, jamais une politique active ni déduite de la configuration du cœur.
- Relever au démarrage, après prérequis, tous les cas encore concernés. Tableau initial vérifié,
  « dédié » = seul élagage actif, « mixte » = garanties indépendantes conservées ; ne supprimer
  aucun fichier entier. Les entrées d'hôte déjà adaptées par T215 restent des contrôles de compatibilité.

  | Fichier et repère à `dd5efc9` | Classe | Sort de la preuve |
  | --- | --- | --- |
  | `tests/session-latency.test.cjs:335` | dédié | Retirer `a passage that expires while still waiting for its transcription is counted on both lanes` ; compteurs expirés lus sur archive |
  | `tests/split-perception.test.cjs:79` | dédié | Retirer `retention preserves completed speech while expiring queued vision and does not lose active enrichment` après preuve équivalente paroles/enrichissement |
  | `tests/clip-unreadable.test.cjs:172` | dédié | Retirer `a rolling window still expires an unreadable passage, and removes its files then` ; illisibilité et baux restent prouvés |
  | `tests/session-latency.test.cjs:213` | dédié | Retirer `a failed media removal or a rejected sweep never poisons later prunes and ingests` ; continuation après publication refusée T186 reste prouvée hors balayage |
  | `tests/stream-simulation.test.cjs:47` | dédié | Retirer le scénario d'expiration active ; déplacer sa garantie refus média/recherche de résumé vers l'archive historique |
  | `tests/session-latency.test.cjs:176` | mixte | Retirer seulement la branche expiration, garder la fin de retenue à fermeture |
  | `tests/session-durable.test.cjs:568` | mixte | Ordre, dédoublonnage et numérotation après history historique restent prouvés |
  | `tests/session-durable.test.cjs:967` | mixte | Garder l'état figé dans une écriture coalescée, sans provoquer la mutation par élagage |
  | `tests/mac-ipc-contract.test.cjs:461`, `:543`, `:729` | mixte | T215 adapte réglages, ouverture/reprise et cadence/pause, sans supprimer les cas |
  | `tests/server-sessions.test.cjs:357` | mixte | T215 garde HTTP, reprise, inspection et médias durables |
  | `tests/remote-server.test.cjs:11-45` | mixte | T215 garde le flux HTTP et le 410 média sur archive historique |
  | `tests/architecture-f10.test.cjs:75`, `:265-267` | mixte | T215 adapte le helper partagé, garde plages, abandon et baux ; expiration remplacée par archive |
  | `tests/evidence-refresh.test.cjs:63` | mixte | Garder bail autoritatif et refus d'inspection après indisponibilité, sans expiration active |
  | `tests/topic-summary.test.cjs:91` | mixte | Garder résumé cumulatif, transcription et pause/reprise sur archive historique |
  | `tests/question-ceiling.test.cjs:36` | mixte | Retirer la fenêtre incidente, garder plafond des questions et capture |
  | `tests/architecture-f05.test.cjs:612`, `tests/architecture-f07.test.cjs:208` | mixte | T215 retire seulement la variable de rétention des tableaux de réglages |
  | `tests/headless-session-lifecycle.test.cjs:74` | mixte | Retirer l'option devenue inutile, garder le cycle de vie |
  | `tests/session-manifest.test.cjs:285` | mixte | Garder le décodage rolling historique et la priorité des patches, contrôlés en T215 |
  | `tests/mac-ui.test.cjs:515-522` | mixte | Garder les libellés historiques ; l'hôte ne publie plus de réglage rolling après T215 |
  | `tests/stream-simulation.test.cjs:20` | mixte | Garder le déterminisme passage par passage |
  | `tests/stream-simulation.test.cjs:25` | mixte | Garder cadences LG/Mac, annulation et concurrence |
  | `tests/stream-simulation.test.cjs:36` | mixte | Garder pertes audio et bornes de files pendant ralentissement |
  | `tests/stream-simulation.test.cjs:56` | mixte | Garder recherche de longue durée et budgets d'indexation |
  | `tests/stream-simulation.test.cjs:67` | mixte | Garder concurrence de vision pendant questions |
  | `tests/stream-simulation.test.cjs:79` | mixte | Garder budget de première recherche après 110 min |
  | `tests/stream-simulation.test.cjs:95` | mixte | Garder comptage du recyclage des processus |
  | `tests/split-perception.test.cjs:117` | mixte | Garder absence de fausse preuve à partir du placeholder, sur archive historique |

- Conserver aussi les cas mixtes de tampons/miniatures de session-latency, coalescence et
  restauration de session-durable, frise et nouvel essai ADR 0008 ; leur inventaire exact est
  établi par recherche `retentionMs`, `prune`, `unremoved` et relu dans chaque fichier. Le cas
  `tests/session.test.cjs:24` appartient à T194 : ne pas le recompter ici.
- `harnais: oui` n'autorise que la ligne `cas_de_test_produit` de `scripts/quality/baseline.json` : T196 a
  séparé le cliquet, et seul le plancher des tests du produit baisse. Aucun autre compteur ou fichier protégé ne change.
  Compléter l'ADR de retrait T215, élaguer les suppressions ESLint devenues inutiles.

## Critères d'acceptation

1. Une grande avance de temps, capture ou pause, ne supprime ni ne déplace les nouveaux passages.
   Aucun réglage actif ni champ d'archive ne rétablit l'élagage. La recherche dans le code actif
   ne trouve plus sa durée, ses chaînes et appels, hors décodeurs/témoins historiques nommés.
2. L'archive élaguée T215 reste consultable puis reprenable : anciens motifs, trous et textes
   restent, nouveaux médias conservés, identifiants non réutilisés. Elle publie until-deleted/null.
   L'ouverture seule reste sans écriture ni fournisseur ; corpus et sommes inchangés.
3. Baux jusqu'au retour effectif, refus missing/expired/unreadable, suppression explicite,
   stockage plein et scellement restent prouvés. Le 410 de `/v1/media` reste prouvé par archive.
4. Les cas mixtes gardent leurs assertions utiles ; journal de chaque attente modifiée et de
   chaque garantie déplacée, sans cas de remplissage. Les deux preuves paroles/enrichissement
   du cas split-perception sont actives avant son retrait.
5. Retirer exactement les n cas classés dédiés, n établi au démarrage après T215 et T194.
   Le journal donne fichier, nom exact, ancien comportement et remplacement éventuel pour chacun.
   Si P est le plancher et a les ajouts utiles, le nouveau plancher est P − n et la mesure
   vérifie M ≥ P − n + a. Aucun retrait déjà fait par une dépendance n'entre dans n.
6. Le diff du harnais ne touche que la ligne autorisée, avec cette baisse exacte. À l'implémentation,
   jouer les suites affectées, stream-simulation, archive-compat et les preuves ADR citées en
   séquentiel, puis `node scripts/check.mjs`. Aucun autre comportement ni test n'est affaibli.

## Test d'acceptation attendu

Conduire le vrai cœur par ingestion, pause, reprise et fermeture avec horloge injectée et médias
maîtrisés : comparer inventaire et octets après une grande avance de temps et une réouverture.
Les outils de questions lisent ensuite l'archive historique pour prouver refus média, recherche
textuelle et absence de fausse citation. Les baux utilisent `store.remove(id)` pendant une lecture.

## Hypothèses bloquantes

Décision du propriétaire, le 16/10 (« ok go », en réponse à la question posée) : oui. Les tests propres à
l'élagage glissant sont supprimés avec lui, et le plancher `cas_de_test` est abaissé du nombre exact de
cas supprimés, avec `harnais: oui` limité à cette ligne, comme pour T139 et T194. Si T196 a déjà séparé
le cliquet, c'est le plancher des tests du produit qui baisse, et lui seul.

Question posée : autoriser le retrait des trois cas nommés et la baisse exacte de trois du seul
plancher `cas_de_test` (produit si T196 est livré), avec `harnais: oui` limité à cette ligne ?
La décision reçue porte sur le nombre exact des cas propres à l'élagage effectivement supprimés,
pas sur le compte initial incomplet de trois. Le tableau est revalidé au démarrage ; aucun nouveau
choix de conservation ou de suppression de garanties indépendantes n'est autorisé.

## Journal

### Exploration — 17/10/2026

- Lectures : consignes, standards, skill tests, ADR concernés, racine Mémoire, voies extraites, projections,
  stockage, outils hors ligne et inventaire des usages. `git status --short` et `git diff` : statut en-cours
  préexistant ; design/continuous-context/ et experiments/ préexistants, hors travail.
- `rg` sur `retentionMs`, `prune`, `pruneChain`, `unremoved` : inventaire dans
  `.harness-state/tickets/T223/inventaire-initial.txt`, classement dans `exploration.md`.
- Huit cas dédiés présents (les cinq du tableau et trois de session-events) : n = 8 ; P = 1378,
  nouveau plancher produit prévu 1370. Compteur harnais 381 inchangé. Aucun retrait de dépendance recompté.
- Aucun écart de périmètre ; précisions consignées dans `ecarts.md` avant implémentation.

### Conservation durable — preuves avant retrait

- `node --test --test-name-pattern='legacy retention option|completed speech and active enrichment survive' tests/session-durable.test.cjs tests/split-perception.test.cjs`
  : rouge observé sur les deux assertions attendues (premier passage retiré, média annoncé indisponible).
  Sortie : `red-conservation.log` dans le dossier d’état.
- Retrait dans la racine de la durée active, de sa normalisation, de `unremoved`, `pruneChain`, `prune`
  et de son appel après ingestion. Aucun déplacement automatique vers history ; les miniatures tardives
  enrichissent le passage conservé. Décodeur historique et ordonnanceur des voies inchangés.
- `node --test --test-concurrency=1 --test-name-pattern='legacy retention option|completed speech and active enrichment survive' tests/session-durable.test.cjs tests/split-perception.test.cjs`
  : 2/2 verts, avant suppression du cas split-perception. Le premier compare les octets et dates des
  médias après capture, avances longues, pause, reprise et réouverture ; le second garde les paroles
  des trois passages et l’enrichissement actif puis libère les visions en attente sans perte.
- `node --test --test-concurrency=1 tests/session-rows.test.cjs` : 3 verts / 2 rouges sur la politique
  encore dérivée du champ interne, puis 5/5 verts après publication constante until-deleted/null dans
  les façades Mac/headless. Sorties : `red-session-rows.log`, `green-session-rows.log`.

### Cas dédiés effectivement supprimés — n = 8

Aucun fichier de test supprimé. Les noms ci-dessous sont ceux présents au démarrage ; le texte retiré
est conservé dans `cas-dedies-retires.txt`. Les trois cas session-events complètent l’inventaire initial
du ticket. Aucun retrait déjà intégré par une dépendance n’est recompté.

| Fichier sous tests/ | Nom exact | Ancien comportement | Remplacement ou preuve conservée |
| --- | --- | --- | --- |
| session-latency.test.cjs | a passage that expires while still waiting for its transcription is counted on both lanes | Expiration des files audio/vision | Compteurs historiques restaurés ; surcharge audio indépendante conservée |
| split-perception.test.cjs | retention preserves completed speech while expiring queued vision and does not lose active enrichment | Vision en attente expirée, enrichissement actif | Nouveau cas durable paroles/enrichissement vert avant retrait |
| clip-unreadable.test.cjs | a rolling window still expires an unreadable passage, and removes its files then | Suppression à échéance d’un clip illisible | Illisibilité, réexamen sur images et suppression explicite restent couverts |
| session-latency.test.cjs | a failed media removal or publication never poisons later prunes and ingests | Retrait retenté et continuation du balayage | Continuation après publication refusée, ingestions et sauvegardes : cas split-perception existant |
| stream-simulation.test.cjs | an expired medium is refused with an explicit limit while its summary stays searchable | Expiration active dans le scénario expiry | Recherche et transcription via VideoTools, refus expired/missing et rejet de citation sur pruned-v1 dans archive-compat |
| session-events.test.cjs | expiry announces only the queued lane losses and the later handoff loss of the active transcription | Faits et pertes d’expiration | Compteurs/motifs historiques ; faits des autres pertes conservés |
| session-events.test.cjs | a transcription finishing during media removal gets its own revision after the consultable expiry | Révision d’expiration puis audio | Révisions ordinaires audio/vision/miniature et faits avant publication conservés |
| session-events.test.cjs | expired queued vision and active enrichment keep their final versions in history without repeating removal losses | Expiration, enrichissement tardif et retrait retenté | Enrichissement durable, versions persistées et restauration silencieuse conservés |

P = 1378, n = 8, a = 2 nouvelles preuves utiles : seul `cas_de_test_produit` passe à 1370.
Mesure du contrôle ciblé : M = 1372 = P − n + a. `cas_de_test_harnais` reste à 381.

### Cas mixtes — attentes adaptées et garanties conservées

- `session-latency` : horodatages et diagnostics par appel toujours vérifiés après analyses conduites ;
  restauration d’une forme historique sans diagnostics volumineux, révision 2 au lieu de 3 car aucune
  expiration nouvelle. Le drapeau d’échec audio survit à fermeture/restauration. Pertes audio et retenue
  de 2500 ms restent vérifiées ; les visions en attente restent queued, sans faux trou ni compteur
  d’expiration. Les compteurs audioExpired/visionExpired sont vérifiés sur état historique restauré.
  Seule la branche de fin de retenue par expiration disparaît : fermeture à 800 ms et libération à
  600 ms restent. Deux ingestions attendent leur miniature tandis que leurs analyses avancent ; refus
  de miniature conservé. La miniature tardive est sauvegardée à fermeture après une pause.
- `session-durable` : appels de balayage remplacés par publications d’horloge, sans retrait d’assertion
  sur octets, reprise, numérotation, disque, index ou manifeste. L’assertion interne Infinity devient
  l’assertion publique until-deleted/null. Le dédoublonnage après history part d’une archive historique
  restaurée : aucun put pour le doublon, numéro suivant moment-2. La coalescence se prouve par un second
  bloc admis pendant la fermeture : l’écriture demandée avant ce bloc reste figée sur moment-1 ; la
  sauvegarde finale contient les deux passages. Aucun élagage ne prépare ces cas.
- `split-perception` : placeholder expiré préparé par restauration historique ; contexte, preuves
  mémoire et preuves de transcription restent vides. Le cas de publication refusée reste intact.
- `session-events` : émissions répétées à la place du balayage, mêmes faits drainés une seule fois.
  Miniatures tardives conservées dans segments : révision initiale 2, finale 3 si disponible, sinon 2 ;
  quatre ou trois événements, sans révision d’expiration artificielle. Version et disponibilité finale
  toujours comparées à la sauvegarde ; pas de pertes ajoutées.
- `session-event-consumers` : cadence à 30/60 s inchangée, trois demandes de manifeste. Suppression de
  l’émission finale du balayage : snapshots 14 → 13, notifications hôte 10 → 9 ; bornes de projections
  inchangées. Totaux d’historique et refus de réindexer des faits tardifs partent de passages historiques
  restaurés ; enrichissement de thème et octets de miniature tardive restent vérifiés.
- `memory-projection` : fraîcheur avant publication hôte conduite au fait d’illisibilité d’un nouveau
  média ; le corps complet égale le snapshot courant dès ce fait, avant tout onChange.
- `architecture-f08` / `memory-lanes` : refus de relire conservé dans le premier ; indisponibilité
  avant/après relecture déplacée dans le cas existant du propriétaire des voies, avec son port injecté.
  Les quatre combinaisons lecture seule/indisponibilité et échec/relecture vérifient un seul appel,
  deux/trois lectures, aucune relance et une seule perte portant l’erreur initiale. Ordonnanceur inchangé.
- `session-timeline` : suppression explicite par media.remove à la place de l’expiration ; miniature
  conservée malgré la disparition du média, pause, reprise et fermeture, puis supprimée explicitement.
- `topic-summary` : résumé cumulatif placé dans l’historique avant restore ; pause/reprise, transcription,
  bornes temporelles et absence de mutation du cumul restent vérifiées.
- `archive-compat` : recherche directe remplacée par les vrais outils de questions sur pruned-v1,
  avec transcription, refus d’inspection expired/missing sans inspecteur appelé, et réponse inventée
  sur le placeholder rejetée sans citation. L’ouverture reste sans écriture ni fournisseur ; reprise,
  compteurs, trous, textes, numéro moment-5 et conservation des anciens octets restent vérifiés.
- `remote-server`, `server-sessions`, `timeline-server` : publications explicites après avance d’horloge ;
  parcours HTTP, conservation, inspection et reprise inchangés. Le 410 historique reste exercé par
  remote-server et architecture-f10. Aucun corpus ni somme modifié.
- `session-rows` : politique publique constante même avec un ancien champ interne ; mêmes métadonnées,
  ordre et équivalence Mac/headless. `headless-session-lifecycle` et `question-ceiling` perdent seulement
  l’option incidente. `clip-unreadable` garde ingestion, parole, images, motifs et réexamen sans balayage.
- `stream-simulation` : tous les scénarios restants sont durables ; mêmes assertions de déterminisme,
  cadence, surcharge, files, concurrence, recherche après 110 minutes, budgets et recyclage. Le Mac
  conserve son rafraîchissement périodique. `bench-perceived` propose durable par défaut ou la disposition
  synthétique explicitement nommée historical-pruned, sans lecture d’une durée du cœur.
- Les cas déjà adaptés de mac-ipc-contract, architecture-f05/f07/f10, evidence-refresh, session-manifest
  et mac-ui restent présents. Baux autoritatifs, indisponibilité, suppression explicite, disque plein et
  scellement restent testés. ADR 0055 ajoutée ; ADR 0048 complétée par un lien. Une suppression ESLint
  complexity devenue inutile est retirée (4 → 3) ; aucune suppression ajoutée.

### Exécutions ciblées

Les sorties complètes sont dans `.harness-state/tickets/T223/` ; aucune commande live exécutée.

- `node --test --test-concurrency=1 tests/session-latency.test.cjs` : 19/19 verts (`session-latency.log`).
- `node --test --test-concurrency=1 tests/split-perception.test.cjs tests/session-events.test.cjs tests/session-event-consumers.test.cjs`
  : 60/62 verts (`memory-suites.log`). Deux attentes à adapter : émission supprimée et préparation
  historique restée en segments. Corrections décrites ci-dessus ; aucune relance sans explication.
- `node --test --test-concurrency=1 tests/session-durable.test.cjs tests/session-event-consumers.test.cjs tests/topic-summary.test.cjs tests/session-timeline.test.cjs tests/memory-projection.test.cjs`
  : 63/63 verts (`mixed-suites.log`).
- `node --test --test-concurrency=1 tests/memory-lanes.test.cjs` : 2/2 verts, quatre combinaisons du refus
  de relance conduites avant retrait des branches d’expiration dans architecture-f08 (`retry-availability.log`).
- `node --test --test-concurrency=1 tests/stream-simulation.test.cjs` : 7/7 verts (`stream-simulation.log`).
- `node --test --test-concurrency=1 tests/archive-compat.test.cjs tests/architecture-f04.test.cjs tests/architecture-f06.test.cjs tests/architecture-f08.test.cjs tests/architecture-f10.test.cjs tests/evidence-refresh.test.cjs tests/capture-intake.test.cjs tests/session-lifecycle.test.cjs tests/watch-session-ending.test.cjs tests/session-manifest.test.cjs`
  : 151/151 verts (`compatibility-and-barriers.log`), dont les outils sur pruned-v1, corpus/sommes,
  baux, annulation, reprise, admission et fermeture.
- `node scripts/bench-perceived.cjs --only bytes --sizes 75 --layout durable --out .harness-state/tickets/T223/bench-durable.json`
  et `node scripts/bench-perceived.cjs --only bytes --sizes 75 --layout historical-pruned --out .harness-state/tickets/T223/bench-historical-pruned.json`
  : sorties 0, rapports portant respectivement durable et historical-pruned, serveur local et agent simulé.
- Premier `node scripts/check.mjs --changed` : 252/252 tests verts ; règles, format et cliquet verts,
  lint rouge sur paramètre inutilisé et suppression obsolète (`check-changed-initial.log`). Paramètre
  retiré puis `node_modules/.bin/eslint --prune-suppressions core/session.cjs scripts/simulate-stream.cjs scripts/bench-perceived.cjs runtime/headless-session-lifecycle.cjs tests/session-durable.test.cjs tests/session-latency.test.cjs tests/session-events.test.cjs tests/architecture-f08.test.cjs tests/clip-unreadable.test.cjs tests/session-rows.test.cjs`
  : sortie 0 (`prune-eslint.log`).
- Second `node scripts/check.mjs --changed` : vert, 252/252 tests, règles/format/lint/gel/cliquet verts
  (`check-changed.log`). Mesure produit 1372, plancher 1370 ; aucune hausse du gel.
- Audit des occurrences `test(` avant/après HEAD : delta total −6 = −8 + 2 (`audit-final.json`).
  Seul fichier protégé modifié : scripts/quality/baseline.json, seule ligne cas_de_test_produit.
  `git diff --check` : sortie 0 ; aucun fichier du corpus modifié. Recherche finale conservée dans
  `usages-restants.txt` : plus de balayage actif, uniquement les champs publics constants, leur lecture,
  les compatibilités historiques et le générateur nommé du témoin pruned-v1.
- Premier `node scripts/check.mjs` : règles/format/lint/gel/cliquet verts, 2559/2560 tests JS verts
  et 47 tests Python verts (`check-full.log`). Seul refus : lien vers la nouvelle ADR absent de
  la section Décisions de docs/architecture.md. `node --test --test-concurrency=1 tests/documentation-index.test.cjs`
  reproduit exactement ce diagnostic (11/12 verts, `red-documentation-index.log`). Ajout du lien
  et mise à jour des mentions du second lot achevé, puis même commande : 12/12 verts
  (`green-documentation-index.log`). Aucun test ni règle d’index documentaire modifié.
- Second `node scripts/check.mjs` : **vert**, 2560/2560 tests JavaScript (144 fichiers), 47 tests
  Python, règles, format, lint, gel et cliquet verts (`check-full-final.log`). Exécution séquentielle,
  aucune vérification déclarée sur TV, VPS ou fournisseur réel. Verdict TERMINÉ écrit dans le dossier
  d’état ; relecture et intégration laissées à la boucle. Aucun commit ni push.

### Reprise après relecture 1 — 17/10/2026

- Rapport, journal, écarts, état Git et diff relus ; les trois constats mineurs sont acceptés.
  Exploration et validation prévues dans `exploration-correction-1.md`, précisions dans `ecarts.md`.
  Le générateur doit refuser avant écriture avec le commit producteur ; les deux corrections de
  test retirent uniquement une assertion tautologique et un commentaire périmé. Corpus figés.
- `node --test --test-concurrency=1 tests/write-pruned-archive.test.cjs` : **rouge observé** sur
  l'assertion d'absence d'écriture, avec `archive` présent dans le dossier temporaire au lieu de `[]`.
  Sortie : `red-generator-correction-1.log`. Le test lance la vraie commande, sans fournisseur.
- `node --test --test-concurrency=1 tests/session-latency.test.cjs tests/session-durable.test.cjs` :
  44/44 verts avant nettoyage (`before-cleanup-correction-1.log`). Les constats 2 et 3 n'ajoutent
  aucun comportement à tester ; aucun test de comparaison de source n'a été ajouté.
- Constat 1 corrigé : contrôle de l'API historique avant `mkdir`, refus avec le code stable
  `TVLENS_HISTORICAL_PRUNING_REQUIRED` et le commit producteur `5e3f479`. Le commentaire du
  générateur donne également cette provenance. Le test vérifie sortie 1, dossier parent vide,
  code stable et commit dans le diagnostic.
- Constat 2 corrigé : seule l'assertion `archived.metrics === undefined` et son message sont retirés.
  Horodatages, révision, `ingest`, durées et diagnostics du passage vivant restent vérifiés.
  Constat 3 corrigé : commentaire Infinity/JSON retiré ; assertion until-deleted/null conservée.
- `node --test --test-concurrency=1 tests/write-pruned-archive.test.cjs tests/session-latency.test.cjs tests/session-durable.test.cjs tests/archive-compat.test.cjs` :
  **72/72 verts** (`green-correction-1.log`), dont les sommes et la compatibilité des corpus figés.
- `node scripts/check.mjs --changed` : **vert**, 253/253 tests JS, règles, format, lint, gel et
  cliquet verts (`check-changed-correction-1.log`). Mesure produit 1373, plancher 1370 inchangé.
- Audit `audit-correction-1.json` : n = 8 retraits inchangés, a = 3 ajouts utiles avec le test du
  générateur, delta total −5 ; M = 1373 = P − n + a. Seul fichier protégé modifié : la ligne déjà
  autorisée de `scripts/quality/baseline.json`. Aucun fichier de corpus ni somme modifié.
- `node scripts/check.mjs` : **vert**, 2561/2561 tests JavaScript (145 fichiers), 47 tests Python,
  règles, format, lint, gel et cliquet verts (`check-full-correction-1.log`). Exécution séquentielle.
  Les trois constats mineurs sont corrigés ; aucune contestation. Verdict `TERMINÉ` écrit dans le
  dossier d'état, sans réserve propre. La boucle assure la relecture de correction et l'intégration.
  Aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T223/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
- .harness-state/tickets/T223/relecture-2.md : **Écart accepté, critère 5 :** n = 8 au lieu de 5. Je maintiens la décision de la relecture 1 : l'inventaire refait au démarrage est exigé par le ticket, et les trois cas session-events ne portaient que l'élagage.
