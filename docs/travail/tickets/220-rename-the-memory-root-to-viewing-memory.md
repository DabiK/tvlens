---
id: T220
titre: Move the memory root to core/memory/viewing-memory.cjs as ViewingMemory
statut: a-faire
bloque_par: T225, T223, T216, T217, T218, T301, T303
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La racine s'appelle `ViewingMemory` et vit dans `core/memory/viewing-memory.cjs`, atteinte par
son entrée publique. Le déplacement reste limité au nom de la classe, au chemin, aux importeurs
et aux gardes ; vocabulaire des passages et politique des questions ont chacun leur lot suivant.

## Sources

- Premier lot de T220, relecture B, constats 6 et 24 ; `docs/domaine.md`, sections 3 Mémoire,
  6 à 9 et 11 ; ADR 0029/0030. T225 a sorti le snapshot de notification ; T223 a retiré
  l'élagage après T215 ; T216/T217/T218 ont extrait couverture/états et rangé les modules propres.
- Code vérifié à `dd5efc9` : `core/session.cjs:47` déclare `WatchSession`, `:438` restaure,
  `:538` exporte validation et récupération. `eslint-suppressions.json:239` gèle encore
  complexity:7, max-lines:1, no-nested-ternary:2 ; le solde après prérequis n'est pas établi.
- Importeurs produit : `runtime/session-runtime.cjs:4`, `adapters/session-library.cjs:4`.
  Scripts : `scripts/simulate-stream.cjs:90`, `scripts/bench-backend.cjs:55`,
  `scripts/bench-perceived.cjs:276`, `scripts/latency-model.cjs:1`.
- Importeurs de tests : question-ceiling, watch-session-ending, session-lifecycle, session-durable,
  session-optimization, session, topic-summary, clip-unreadable, session-latency, session-timeline,
  split-perception et architecture-f08 sous `tests/`, suffixe `.test.cjs`. Certains cas peuvent
  avoir disparu sous T194/T223 : refaire l'inventaire sur les livraisons, sans les réintroduire.
- Gardes par chemin : `tests/architecture.test.cjs:183-190`,
  `tests/architecture-guard.test.cjs:211-222` et `:323-335` ; elles distinguent racine réelle
  et homonyme local. Les exceptions exactes et le point d'entrée suivent T205/T207.
- ADR 0002/0003/0004/0006/0008/0023 et livraison Mac ADR 0025 : garanties conservées.

## Périmètre

- Condition préalable : plus aucune entrée `core/session.cjs` dans `eslint-suppressions.json`.
  Relever le gel après tous les prérequis. S'il en reste une, s'arrêter et proposer un ticket
  de nettoyage séparé ; ne pas absorber ce nettoyage, déplacer le gel ou ajouter une suppression cible.
- Déplacer le fichier propre vers `core/memory/viewing-memory.cjs`, renommer la classe/export
  `WatchSession` en `ViewingMemory`. Les noms internes de listes et la politique des questions
  ne changent pas ici : T226 puis T227 les prennent séparément.
- Exporter racine, validation et récupération nécessaires via `core/memory/index.cjs`, corriger
  composition, bibliothèque, scripts et importeurs de tests. Aucun appelant extérieur ne vise
  le module interne ; les imports internes évitent un cycle via l'index de leur propre contexte.
- Retirer l'ancien fichier quand tous ses appelants sont migrés. Si un réexport temporaire est
  indispensable, déclarer l'exception T205 exacte (fichier, arête, raison, condition de retrait),
  sans métier ni nouveau consommateur ; la garde échoue dès qu'elle devient inutile.
- Adapter les gardes de racine et leurs fixtures, sans retirer la règle ni autoriser un domaine
  étranger à importer Mémoire. Aucun répertoire entier exempté ; le banc garde l'homonyme local.
- Conserver archives, noms de champs, identifiants, outils, URL média et canaux. Ne pas modifier
  les cycles de vie, ports ou projections déjà livrés. Écrire l'ADR du nom/chemin public et
  de l'éventuelle façade temporaire ; élaguer les suppressions déjà devenues inutiles.

## Critères d'acceptation

1. L'entrée publique construit une `ViewingMemory` ; tous les importeurs actifs utilisent cette
   entrée. La recherche de `WatchSession` actif est vide, sauf façade transitoire nommée si
   indispensable. Les documents historiques et titres de tests existants ne sont pas renommés en masse.
2. Aucun gel au chemin source avant déplacement ni au chemin cible après. Le journal donne
   inventaire des importeurs et résultat du relevé ; un solde non nul arrête ce lot avant déplacement.
3. Ouvrir, consulter, reprendre, ingérer, mettre en pause puis archiver les variantes T222/T215
   conserve données et motifs, identifiants et fichiers. Le numéro suivant dépasse aussi les orphelins.
4. Les outils gardent ancrage/révisions/baux, les voies leurs bornes/pertes/unique nouvel essai,
   et la fin ses publications silencieuses, sauvegardes et barrières. Aucun enrichissement tardif
   de mémoire fermée ; les corps T213 et les bancs Mac conservent leur contrat.
5. Les fixtures de garde refusent l'accès interdit à la nouvelle racine et acceptent un homonyme
   interne ; toute exception temporaire est contrôlée jusqu'à son retrait.
6. À l'implémentation, jouer tests affectés, contrats mémoire/archive/fil, preuves ADR et gardes
   en séquentiel, puis `node scripts/check.mjs`. Aucun test ni plancher n'est supprimé.

## Test d'acceptation attendu

Les suites existantes construisent la racine par son nouveau point d'entrée et conduisent les
commandes publiques et le runtime réel. Le corpus figé est lu depuis une copie temporaire avec
comparaison des données/médias ; les gardes exécutent leurs arbres temporaires et l'homonyme.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le gel futur n'est pas établi : sa disparition est une condition d'arrêt vérifiable au démarrage,
pas une permission de nettoyer sans limite dans ce déplacement. La dépendance T223 porte le
second lot de retrait de rétention et la décision déjà reçue.

## Journal
- 19/10, propriétaire : attend le chantier « son seul » (T297 à T301), traité en premier.
