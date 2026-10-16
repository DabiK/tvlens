---
id: T222
titre: Add the historical session archive variants to the reference corpus
statut: a-faire
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
