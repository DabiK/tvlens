---
id: T223
titre: Remove the rolling pruning from the viewing memory
statut: a-faire
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
