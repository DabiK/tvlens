---
id: T222
titre: Add the historical session archive variants to the reference corpus
statut: termine
bloque_par: T037, T194
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le corpus de référence couvre les formes historiques que le prochain convertisseur doit lire.
Les attentes sont établies contre les lecteurs actuels avant tout changement d'écrivain, avec
provenance et sommes séparées de la génération originale.

## Sources

- Coupe de T208, relecture A, constat 9 ; `docs/domaine.md`, section 9 ; ADR 0029.
  T037 livre le témoin réel, ses attentes et ses sommes après T193. T194 conserve les questions
  historiques après retrait des chemins morts ; relire leurs fixtures et leurs livraisons.
- Code vérifié à `dd5efc9` : `core/session.cjs:438` restaure, `:443` distingue l'absence de
  `retention`, `:445` reprend toutes les clés d'un passage, `:456-462` termine les analyses
  interrompues, `:465-474` reprend les compteurs et seconds essais, `:476-481` garde history,
  questions et séquence au-delà des orphelins.
- `adapters/session-library.cjs:26` reconnaît rolling/until-deleted, `:43` classe les anciennes
  archives sans manifeste ; `:97-112` valide, récupère les paires à intervalle et compte les orphelins.
  `runtime/session-lifecycle.cjs:3` adopte cet inventaire ; `runtime/session-runtime.cjs:52` valide
  avant composition. `core/session.cjs:513` écrit encore le snapshot sans format/version.
- Tests existants : `tests/session-durable.test.cjs:236`, `tests/session-lifecycle.test.cjs:186`,
  server-sessions, clip-unreadable et architecture-f08 ; ADR 0002/0003/0006/0008/0023.

## Périmètre

- Sans changement produit, compléter `tests/fixtures/archives/` et `tests/archive-compat.test.cjs`
  de T037. Couvrir huit variantes nommées : non versionnée ; history textuel sans média ; absence
  de retention et de manifeste ; rétention moderne sans manifeste final ; rolling avec history
  indisponible ; questions historiques T194 ; analyses interrompues ; compteurs de nouvel essai.
- Chaque variante ajoute attentes, sommes et provenance : génération réelle ou transformation
  explicitement documentée de la référence, jamais revendiquée comme capture d'une version
  déployée non disponible. Réutiliser les fixtures T194 si pertinentes. La génération originale
  et ses sommes restent intactes. L'archive réellement élaguée et sa reprise relèvent de T215.
- Caractériser aussi la rétention inconnue sans la corriger, les paires récupérables, demi-paires
  et paires sans intervalle, l'ordre et les identifiants. Employer les vrais lecteurs publics
  `SessionLibrary.read()` et le runtime sur copies temporaires, sans fournisseur ni index réel.
- Aucun convertisseur, format nouveau, renommage, test existant supprimé ou harnais modifié.
  Ne pas retoucher le témoin pour accepter un défaut ; rapporter tout défaut de lecture rencontré.

## Critères d'acceptation

1. Chaque variante est lisible par la bibliothèque puis le runtime réel : identités, ordre,
   bornes, observations, questions, compteurs et motifs média correspondent aux attentes.
   Les clés et valeurs de passage, dont `topicSummary`, statuts, miniature et horodatages,
   sont explicites. Sommes et octets ne changent pas à l'ouverture/fermeture sans reprise.
2. history reste sans média, missing ne devient pas disponible, unreadable garde ses images
   possibles, l'absence historique de retention reste not-kept sans média. Sans manifeste,
   ancienne archive et session moderne interrompue gardent classement et dates distincts.
3. Une paire inconnue avec intervalle valide est récupérée ; demi-paire et paire sans intervalle
   restent des orphelins comptés. Une reprise explicite donne un identifiant supérieur à tous
   ceux déjà utilisés, orphelins compris. La restauration seule n'analyse, n'indexe et n'écrit rien.
4. Sommes, provenance et attentes sont vérifiées pour chaque variante, indépendamment de tout
   futur `toArchive`. Jouer archive-compat, session-durable, session-lifecycle, server-sessions
   et clip-unreadable en séquentiel, puis `node scripts/check.mjs` à l'implémentation.

## Test d'acceptation attendu

`tests/archive-compat.test.cjs` lit chaque témoin sur le code actuel via `SessionLibrary` puis
`HeadlessRuntime.open()`, et compare attentes et sommes avant/après sur des copies temporaires.
Le test ne génère pas son archive et ne dépend pas du convertisseur que T208 écrira ensuite.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les formes couvertes sont celles établies par les sources et témoins disponibles. Une forme
historique nouvelle doit fournir son témoin avant d'étendre le lecteur. Le résumé vivant a son
propre format ; il reste hors de ce corpus de variantes de `session.json`.

## Journal

- Exploration : lecteurs publics, corpus T037 et cas historique T194 relus ; transformations
  figées dans un corpus séparé, sans changement produit. Plan et écarts consignés dans
  `.harness-state/tickets/T222/`. Témoin de hooks présent ; aucun sous-agent lancé.

- Rouge puis vert du corpus :
  `node --test --test-name-pattern='the historical corpus freezes' tests/archive-compat.test.cjs`
  échoue sur la liste vide, puis passe après ajout de dix témoins (les huit variantes demandées,
  rétention inconnue et compteurs invalides). Logs `red-corpus.log`, `green-corpus.log`.
- Rouge Git : `node --test --test-name-pattern='Git ignore rules' tests/archive-compat.test.cjs`
  refuse le WebM ignoré ; exception limitée au nouveau corpus ajoutée, contrôle ensuite vert
  dans `characterization.log`. Génération originale et ses sommes inchangées.
- Première caractérisation : 19 cas réussis, reprise refusée car le banc omettait sessionId
  (`stale-session`). Correction du banc et horloge de capture explicite ; aucun lecteur modifié.
  Les README locaux décrivent les différences actuelles entre classement et rétention restaurée.

- Contrôles ciblés exécutés une suite à la fois, tous codes 0 :
  `node --test tests/archive-compat.test.cjs` : 20/20 ;
  `node --test tests/session-durable.test.cjs` : 23/23 ;
  `node --test tests/session-lifecycle.test.cjs` : 15/15 ;
  `node --test tests/server-sessions.test.cjs` : 29/29 ;
  `node --test tests/clip-unreadable.test.cjs` : 5/5.
  Sorties conservées dans `.harness-state/tickets/T222/<suite>.log`.
  La reprise crée moment-71 sans écraser les paires, demi-paires ni miniatures existantes.
- `node scripts/check.mjs --changed --no-tests` puis `node scripts/check.mjs --changed` :
  verts, code 0 ; le second exécute 20 tests réussis. `git diff --check` : code 0.
  `git diff --exit-code -- tests/fixtures/archives/durable-v1 scripts/fixtures/write-reference-archive.cjs`
  confirme l'absence de modification de la génération originale et de son générateur.

- Contrôle complet final : `node scripts/check.mjs` : vert, code 0 ; règles, format,
  lint, gel et cliquet verts ; 2313/2313 tests JavaScript (133 fichiers), 47 tests Python
  réussis (`check-full.log`). Aucun contrôle déclaré réussi sans résultat observé.
- Livraison : dix variantes figées, attentes bibliothèque/runtime distinctes, provenance et
  sommes locales et globales vérifiées ; ouverture, pause et fermeture sans réécriture,
  index désactivé et fournisseurs interdits. Les comportements existants de rolling ouvert
  avec configuration par défaut et de retention inconnue sont documentés sans correction.
  Aucun code produit ni harnais modifié, aucun test supprimé, aucun commit ni push.
  Verdict `TERMINÉ` remis à la boucle pour relecture.

- Reprise après `relecture-1.md` : les trois constats mineurs sont acceptés. Préparation
  des rouges sur l'énumération inversée, l'ordre temporel et le history textuel sans observation.
  Écarts et exploration complétés ; sauvegarde des octets additionnels avant correction dans
  `.harness-state/tickets/T222/corpus-before-correction/`. durable-v1 reste intact.

- Constat 1 : `node --test --test-name-pattern='the frozen modern-without-manifest|an explicit resume' tests/archive-compat.test.cjs`
  échoue sur les deux assertions avec l'énumération média inversée par fs.readdir
  (`correction-1-red-enumeration.log`). Après tri non mutant de partial et orphans,
  la même commande passe 2/2 (`correction-1-green-enumeration.log`). L'inversion est
  conservée dans le banc ; aucun ordre de système de fichiers n'est présumé.
- Constat 2 : `node --test --test-name-pattern='recovered passages in the frozen archive' tests/archive-compat.test.cjs`
  échoue sur l'ancien ordre (3,4,9), puis passe après correction des intervalles du témoin :
  9 = 16000–24000, 3 et 4 = 24000–32000. Attentes, provenance et sommes mises à jour ;
  la variante, le cas d'ordre et la reprise passent 3/3 (`correction-1-green-order.log`).
  Qualification supplémentaire : la même commande, préchargée avec
  `--require ./.harness-state/tickets/T222/probe-without-temporal-sort.cjs`, échoue
  sur l'assertion d'ordre (`correction-1-red-without-sort.log`). Aucun produit modifié.
- Constat 3 : `node --test --test-name-pattern='the frozen text history restores' tests/archive-compat.test.cjs`
  échoue sur les clés surnuméraires de l'ancien history, puis passe avec la forme historique
  id/startMs/endMs/status/summary, sans observation ni available. Le runtime garde ce texte
  avec expired ; topicSummary non nul reste vérifié sur le second passage. Le cas dédié
  et le cas de variante passent 2/2 (`correction-1-green-text-history.log`). README,
  provenance, attentes et sommes révisés pour la couverture, sans correction de lecteur.
- Après correction, suites jouées en séquentiel, tous codes 0 : archive-compat 22/22,
  session-durable 23/23, session-lifecycle 15/15, server-sessions 29/29 et clip-unreadable 5/5
  par `node --test tests/<suite>.test.cjs` (`correction-1-<suite>.log`).
  `node scripts/check.mjs --changed` : vert, code 0, 22 tests réussis
  (`correction-1-check-changed.log`).
- Contrôle complet de la correction : `node scripts/check.mjs` : vert, code 0 ;
  règles, format, lint, gel et cliquet verts ; 2315/2315 tests JavaScript dans 133 fichiers,
  47 tests Python réussis (`correction-1-check-full.log`).
- Les trois mineurs sont corrigés. L'interdiff des témoins est conservé dans
  `correction-1-corpus-interdiff.txt` : seuls les deux dossiers concernés et les README/sommes
  parent ont changé depuis la relecture. Aucun fichier de témoin ajouté ou supprimé.
  Le constat hors périmètre reste transmis par la boucle depuis son rapport de relecture.
  Nouveau verdict `TERMINÉ`, sans commit ni push ; aucun produit, harnais ou témoin durable-v1 modifié.
- Vérification finale : `git diff --check` et `git diff --exit-code` ciblé sur durable-v1,
  son générateur, core/adapters/runtime et le harnais : codes 0. Nouveau verdict.json
  relu comme JSON valide, statut `TERMINÉ`.

- Reprise après `relecture-2.md` : nouveau mineur documentaire accepté. Les faits des deux
  témoins sont conservés ; le récit de relecture et les renvois au dossier local sont retirés
  des README versionnés. Écarts et exploration complétés, aucun nouveau périmètre.
- Contrôle éditorial temporaire, sans ajout de test permanent pour ce texte :
  `python3 .harness-state/tickets/T222/check-corpus-readmes.py` échoue sur les passages
  de récit dans chacun des deux README (`correction-2-red-readmes.log`), puis passe après
  nettoyage en vérifiant aussi les faits conservés (`correction-2-green-readmes.log`).
- Les deux SHA256SUMS locaux ont chacun leur ligne README actualisée ; le SHA256SUMS
  parent reprend les sommes des deux README et des deux SHA256SUMS locaux. Les données
  JSON, les médias et les attentes restent identiques à l'état relu.
- `node --test tests/archive-compat.test.cjs` : 22/22, code 0 ;
  `node scripts/check.mjs --changed` : vert, code 0, 22 tests réussis
  (`correction-2-archive-compat.log`, `correction-2-check-changed.log`).
  L'interdiff par empreintes confirme cinq fichiers modifiés dans le corpus, sans ajout
  ni suppression, et aucune modification du fichier de test (`correction-2-corpus-interdiff.txt`).
- Contrôle complet de cette correction : `node scripts/check.mjs` : vert, code 0 ;
  règles, format, lint, gel et cliquet verts ; 2315/2315 tests JavaScript dans 133 fichiers
  et 47 tests Python réussis (`correction-2-check-full.log`).
- Le nouveau mineur documentaire est corrigé. Les trois corrections précédentes restent
  couvertes par les mêmes tests et les mêmes données. L'historique demeure dans ce journal ;
  les README ne décrivent que les témoins. Le constat hors périmètre reste transmis par la boucle.
  Nouveau verdict `TERMINÉ`, sans commit ni push. durable-v1, son générateur, le produit,
  les tests et le harnais n'ont pas été modifiés par cette correction documentaire.

### Réserves à la clôture

- Comportement existant caractérisé sans correction, hors changement produit autorisé : une archive rolling ouverte avec la configuration par défaut expose until-deleted et retentionMs null dans le runtime.
- .harness-state/tickets/T222/relecture-3.md : 1. `adapters/session-library.cjs:47` face à `core/session.cjs:375` et `:385` — hors périmètre (réserve reprise)

  Ce constat reprend le constat 4 de `relecture-1.md`, déjà reporté en relecture 2. Il reste vrai : le diff ne touche aucun code produit.

  **Problème.** Une `retention` inconnue est classée différemment selon le lecteur :
  - la bibliothèque la classe comme ancienne : `former = !RETENTIONS.includes(...)`, donc `legacy` et `archived` ;
  - le cœur ne réserve `not-kept` qu'au cas `retention === undefined` (`:375`). Il expose donc `missing` ou `expired` (`:385`).

  **Ce que fait le ticket.** Il caractérise ce comportement sans le corriger, comme demandé. Le README `unknown-retention` le décrit.

  **Attendu.** Une correction dans un ticket produit. À reporter en réserve.
- .harness-state/tickets/T222/relecture-3.md : **Écarts acceptés en relecture 1**, qui restent acceptés :
    - l'exception `.gitignore` limitée aux WebM de `historical-v1` ;
    - les variantes supplémentaires `unknown-retention` et `invalid-retry-counters`.
