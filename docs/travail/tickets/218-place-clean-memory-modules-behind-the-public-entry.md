---
id: T218
titre: Place clean memory modules behind the public entry and share topic continuity
statut: termine
bloque_par: T214
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les modules admissibles rejoignent leur contexte sans transporter d'infraction gelée. Une seule
règle de rupture de sujet sert la perception et la frise ; le service de recherche s'appelle
`MemorySearch`, avec les mêmes résultats et données historiques.

## Sources

- Cible : `docs/domaine.md`, sections 6, 7, 9 et 11 ; ADR 0029/0030. La règle du déplacement
  sans dette est à `docs/standards.md:71-72`. Le plan du 16/10 nomme sept modules candidats.
- Code vérifié à `dd5efc9` : `core/topic-summary.cjs` et `core/passage-text.cjs` n'ont pas d'entrée
  dans `eslint-suppressions.json`. Les cinq autres sont gelés :

  | Module qui reste à son adresse tant que son gel subsiste | Stock vérifié |
  | --- | --- |
  | `core/perception-context.cjs` | complexity : 1 |
  | `core/living-recap.cjs` | complexity : 3 ; no-nested-ternary : 5 |
  | `core/moment-search.cjs` | complexity : 1 ; max-lines-per-function : 1 |
  | `core/moment-index.cjs` | complexity : 2 |
  | `core/session-timeline.cjs` | complexity : 1 ; no-nested-ternary : 3 |

  Repères du gel : `eslint-suppressions.json:205`, `eslint-suppressions.json:213`,
  `eslint-suppressions.json:218`, `eslint-suppressions.json:226`, `eslint-suppressions.json:231`.
- `core/perception-context.cjs:26` sépare les suites par sujet exact, rupture ou trou supérieur
  à 1000 ms ; `core/perception-context.cjs:42` et `core/perception-context.cjs:55` répètent la
  règle pour le contexte actif et le résumé antérieur. `core/session-timeline.cjs:3` normalise
  le sujet avant le regroupement, puis applique les ruptures à `core/session-timeline.cjs:19`.
  Ces deux lecteurs ne comparent donc pas aujourd'hui les libellés de la même manière.
- Importeurs de topic-summary : `core/session.cjs:2`, `core/perception-context.cjs:1`,
  `core/session-timeline.cjs:1`, `adapters/codex-perception.cjs:1`. Importeurs de passage-text :
  session, living-recap, moment-index, moment-search et video-tools sous `core/`, et
  `runtime/session-providers.cjs:17`.
- `core/moment-search.cjs:21` déclare `MomentSearch` ; `core/moment-search.cjs:146` rend `moments`.
  `runtime/session-providers.cjs:199` construit le service ; `tests/session-providers.test.cjs:193`
  injecte le constructeur sous cette clé. `scripts/probe-retrieval.cjs:2` l'importe aussi.
  Les usages de recherche dans les scripts et tests seront renommés, pas les noms et champs des
  moments gardés. La sonde avec fournisseur réel est seulement adaptée, jamais exécutée ici.
- Importeurs à ne pas manquer : `scripts/simulate-stream.cjs:94` et `:96` chargent recherche et
  texte par un `require` calculé (`:89`), invisible pour la garde ; `tests/review-regressions.test.cjs:14`
  et `:16`, `tests/moment-index.test.cjs:7-8`, `tests/refactor-boundaries.test.cjs:9`,
  `tests/video-research.test.cjs:2`. `core/ports.cjs:25` déclare `MomentSearchPort`, à renommer aussi.
  `adapters/codex-perception.cjs:1` doit passer par `core/memory/index.cjs` selon T205.
- Tests lus : topic-summary, perception-context, session-timeline, moment-index, video-research,
  stream-simulation et session-providers sous `tests/`, suffixe `.test.cjs`.
- État attendu : T207 a créé l’entrée publique et la sous-zone `core/memory/` ; T214 les a
  complétées selon T205. Les migrations T210/T213
  peuvent avoir changé les signatures : relire le code livré et le gel réel, sans déplacer un
  module encore gelé pour atteindre un nombre de fichiers prévu à l'avance.

## Périmètre

- Déplacer `topic-summary.cjs` dans `core/memory/` et corriger ses importeurs. Déplacer
  `passage-text.cjs` dans `core/shared/` et corriger ses importeurs. Ne laisser aucun réexport durable à l'ancien
  chemin ; tests et scripts passent à la nouvelle adresse ou au point d'entrée public approprié.
- Garder les cinq modules gelés nommés dans le tableau à leur adresse actuelle. La correction de
  la règle de continuité peut réduire leur gel, mais ce ticket n'ouvre pas la remise en forme
  complète du résumé, de l'index ou de la recherche. Un autre candidat devenu entièrement propre
  après les prérequis est à signaler pour le lot suivant, sans agrandir celui-ci silencieusement.
- Extraire la décision de rupture/continuité dans une aide pure de `core/memory/`, utilisée par
  les suites de perception et de frise. Nommer la tolérance de 1000 ms une seule fois. Les lecteurs
  gardent leur extraction/normalisation de sujet : l'aide reçoit une identité déjà préparée et
  applique rupture explicite et trou. Pour le contexte actif, le résumé antérieur et la frise,
  l'absence de sujet coupe ; le plan des sujets saute ce passage avant d'appeler l'aide et mesure
  le trou depuis le dernier passage avec sujet. Ne pas uniformiser les libellés en douce.
- Conserver le contrat distinct de `completeTopicSummary` : `continue` explicite, sujet précédent
  et résumé cumulatif valide. Il ne doit pas devenir une preuve propre au passage, ni autoriser
  une continuité au travers d'une analyse manquante. Ne pas fusionner les projections elles-mêmes.
- Renommer la classe/export `MomentSearch` en `MemorySearch` et tous ses usages dans code, tests
  et scripts, y compris `MomentSearchPort` dans `core/ports.cjs:25`, la clé d'injection du
  constructeur dans session-providers et son banc.
  Tant que le module est gelé, son fichier reste `core/moment-search.cjs` : renommer
  le fichier déplacerait le gel. Les champs `moments`, identifiants `moment-N`, fichiers, URL et
  valeurs d'intention persistées gardent exactement leur orthographe.
- Mettre à jour `core/memory/index.cjs`, les zones `core/memory/**` et `core/shared/**` si nécessaire,
  leurs permissions et les exceptions temporaires exactes des modules encore plats, selon T205.
  Aucun domaine étranger n'importe un module interne de Mémoire. Toute exception supprimée est
  retirée de la garde ; aucune réexportation ne masque une arête interdite.
- Corriger les infractions du code extrait et élaguer les suppressions inutiles. Les compteurs de
  temps T202 ne changent pas pour les fichiers gelés restés en place. Un ADR court consigne le
  placement retenu de passage-text et le maintien des deux préparations d'identité de sujet.

## Critères d'acceptation

1. L'ancien chemin topic-summary n'est plus importé ; ses fonctions, bornes, provenance et limites
   gardent leurs résultats. Le fichier déplacé n'a aucune suppression ni nouvelle infraction.
   Le journal donne les deux déplacements retenus et les cinq modules laissés sur place.
2. La règle partagée coupe sur absence de sujet, `change`, `uncertain` et trou strictement supérieur
   à 1000 ms. Tester 1000 et 1001 ms, un passage non analysé et un sujet qui revient après rupture.
   La frise garde sa normalisation, la perception sa comparaison exacte, avec des cas de casse
   et d'accents discriminants. Le regroupement de l'une ne devient pas celui de l'autre. Le plan
   des sujets garde son saut d'un passage sans sujet (`core/perception-context.cjs:24`) et mesure
   le trou depuis le dernier passage avec sujet (`:26`) : tester un passage sans sujet de moins
   de 1000 ms entre deux passages du même sujet.
3. Les reprises de résumé cumulatif et la borne de contexte historique conservent les attentes
   de topic-summary et perception-context ; aucune donnée future ou synthèse cumulée n'est
   transformée en preuve d'un passage.
4. La recherche publique, temporelle, lexicale et hybride garde scores, budgets et avertissements.
   Aucun symbole actif `MomentSearch` ne subsiste ; `moments` et les données figées du corpus
   restent inchangés. Les anciennes adresses de modules déplacés n'ont aucun réexport durable.
5. La garde accepte les seuls accès déclarés et refuse un import interne depuis un contexte
   étranger. À l'implémentation, jouer les suites citées et la garde en séquentiel, puis
   `node scripts/check.mjs`, sans suppression de cas ni hausse du gel ou du plancher.

## Test d'acceptation attendu

Les suites existantes de sujets et de frise appellent leurs vraies projections ; ajouter les cas
de frontière et de normalisation qui distinguent leurs contrats. Les tests de recherche utilisent
le nouvel export et comparent ses résultats publics, pas son nom dans le source. Le corpus T037
et les tests de moments gardés protègent les noms historiques.

## Hypothèses bloquantes

Aucune décision n'est attendue. `passage-text.cjs` va dans `core/shared/passage-text.cjs`
(`docs/domaine.md:267`, règle 2 à `:234`).

L'inventaire du gel vaut avant les prérequis. Aucun changement métier de comparaison des sujets
n'est demandé : si une identité unifiée est souhaitée, elle demande une décision séparée.

## Journal


- Exploration : règles, skill, code et contrats relus ; état initial conservé dans
  `.harness-state/tickets/T218/exploration.md`. Aucun écart prévu.
  Déplacements retenus : `topic-summary` vers `core/memory/`, `passage-text` vers `core/shared/`.
  `perception-context`, `living-recap`, `moment-search`, `moment-index`, `session-timeline`
  restent sur place avec leur gel actuel.

- Placement, rouge puis vert :
  `node --test --test-name-pattern='topic summaries belong' tests/architecture.test.cjs`
  échoue sur l'assertion de présence de l'ancien `core/topic-summary.cjs`.
  Après déplacement et suppression des trois exceptions devenues inutiles,
  `node --test --test-concurrency=1 tests/topic-summary.test.cjs tests/perception-context.test.cjs tests/session-timeline.test.cjs tests/architecture.test.cjs`
  passe (sorties `placement-red.log` et `placement-green.log` dans le dossier d'état).
- Continuité : `node --test tests/perception-context.test.cjs` passe avant extraction
  avec les nouveaux cas 1000/1001 ms, casse/accents, passage sans sujet court et retour après rupture.
  Après extraction de `continuesTopic`,
  `node --test --test-concurrency=1 tests/perception-context.test.cjs tests/topic-summary.test.cjs tests/session-timeline.test.cjs`
  passe : 32 tests, 0 échec. Les résultats existants servent de caractérisation du refactoring.
- Recherche, rouge observé :
  `node --test --test-name-pattern='indexing selects embeddings' tests/session-providers.test.cjs`
  échoue sur l'assertion des arguments du constructeur injecté sous `MemorySearch`.
  Classe, export, port, injection, tests et scripts sont ensuite renommés ; le fichier gelé et
  toutes les données historiques restent inchangés. Sonde réelle adaptée sans exécution.
- ADR 0053 ajouté : placement du texte partagé et maintien des identités propres aux projections.
  `node_modules/.bin/eslint --prune-suppressions core/perception-context.cjs core/session-timeline.cjs core/memory/topic-summary.cjs core/memory/topic-continuity.cjs core/shared/passage-text.cjs`
  passe ; aucune suppression devenue inutile, gel inchangé.

- Vérification séquentielle :
  `node --test --test-concurrency=1 tests/session-providers.test.cjs tests/moment-index.test.cjs tests/video-research.test.cjs tests/refactor-boundaries.test.cjs tests/review-regressions.test.cjs tests/stream-simulation.test.cjs tests/architecture.test.cjs tests/architecture-guard.test.cjs`
  passe : 622 tests, 0 échec (sortie `search-guard-green.log`).
- `node scripts/check.mjs --changed` : vert ; règles, format, lint, gel et cliquet verts,
  131 tests JS, 0 échec (sortie `check-changed.log`). `git diff --check` passe.
  Les deux fichiers déplacés sont identiques octet par octet à leur contenu dans HEAD.
  Aucun symbole actif `MomentSearch` ne reste dans le code, les tests ou les scripts.

- Premier `node scripts/check.mjs` : règles, format, lint, gel, cliquet et Python verts
  (47 tests Python). JS : 2557 réussites sur 2558, un échec documentaire déterministe :
  index de l'ADR 0053 absent dans `docs/architecture.md` (sortie `check-full.log`).
  `node --test tests/documentation-index.test.cjs` reproduit l'assertion rouge précise
  (`documentation-red.log`). L'index, la carte de placement et le nom du service dans
  `docs/architecture.md` sont complétés ; aucune modification des tests.

- `node --test tests/documentation-index.test.cjs` après correction : 12 tests réussis,
  0 échec (`documentation-green.log`). Relance complète en séquentiel, sortie conservée dans
  `check-full-final.log`.

- Contrôle final `node scripts/check.mjs` : vert. Règles, format, lint, gel et cliquet conformes ;
  2558 tests JS réussis dans 143 fichiers, 0 échec ; 47 tests Python réussis.
  Sortie : `.harness-state/tickets/T218/check-full-final.log`.
  Aucun cas supprimé, aucune hausse du gel ou modification du plancher.
  Verdict `TERMINÉ` enregistré pour la relecture par la boucle ; aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T218/relecture-1.md : `docs/domaine.md:99` et `docs/domaine.md:322` citent encore `core/topic-summary.cjs` et `core/passage-text.cjs:8`, deux chemins qui n'existent plus. Ce document est la cible figée du découpage, et le ticket ne l'ouvre pas à la modification. Il faudra mettre ces références à jour lors d'une prochaine révision de la cible. Classe : **hors périmètre**.
