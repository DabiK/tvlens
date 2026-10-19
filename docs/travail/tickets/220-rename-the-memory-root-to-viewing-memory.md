---
id: T220
titre: Move the memory root to core/memory/viewing-memory.cjs as ViewingMemory
statut: termine
bloque_par: T225, T223, T216, T217, T218, T301, T303, T304, T305, T306, T309
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
- 19/10, Codex : condition préalable non satisfaite à `8d64bb6` : `core/session.cjs` conserve
  `complexity: 3` et `no-nested-ternary: 1` dans `eslint-suppressions.json` ; aucune entrée au chemin cible.
  Arrêt avant déplacement conformément au périmètre. Relevé JSON, commande exacte, inventaire des importeurs
  et proposition de nettoyage séparé consignés dans `.harness-state/tickets/T220/`.
- 19/10, Codex : `node scripts/check.mjs` : `check : vert`, 154 fichiers JavaScript,
  3 031 tests JS et 71 tests Python réussis ; sortie dans `.harness-state/tickets/T220/check-complet.log`.
  Verdict `BLOQUÉ` déposé : nettoyage séparé des quatre suppressions requis avant reprise, aucun code modifié.
- 19/10, orchestrateur : nettoyage préalable confié à T309 ; ce ticket repart à faire après lui.
- 19/10, Codex : reprise à `f86df64` après T309 ; relevé source/cible sans aucune suppression.
  Inventaire actualisé : runtime, bibliothèque, HTTP, quatre bancs, générateur historique et 16 suites.
  Exploration et adaptations d'import consignées dans `.harness-state/tickets/T220/` avant implémentation.
- 19/10, Codex : test de construction publique rouge sur `typeof ViewingMemory` (`undefined`),
  puis vert après déplacement et migration des importeurs. Huit fixtures de garde rouges sur le refus
  attendu, puis vertes pour la nouvelle racine et l'homonyme. Aucun alias ni façade conservé ; ADR 0063 rédigé.
- 19/10, Codex : premier `node scripts/check.mjs --changed` rouge : une ligne longue dans le nouveau
  fichier, neuf fixtures des voies restées à l'ancien chemin et un compteur branché sur l'ancien export.
  Corrections du format et des coutures ; les douze cas ciblés passent, avec les mêmes comptes attendus
  (4 snapshots, 9 vues complètes, 2 lectures unitaires, 1 lecture par identifiants, 1 lecture de fin de liste).
- 19/10, Codex : suites mémoire/archive/fil/ADR/gardes exécutées en séquentiel : 861 tests réussis,
  puis outils/Mac/runtime : 79 réussis. Le corpus figé est lu depuis ses copies temporaires ; les tests
  conservent données, médias, motifs et numérotation après orphelins. Sorties et commandes dans le dossier d'état.
- 19/10, Codex : `node scripts/check.mjs --changed` final : `check : vert`, 18 fichiers de tests,
  754 tests réussis. Format, lint, gel et cliquet verts ; aucun gel déplacé ni ajouté.
- 19/10, Codex : premier contrôle complet de reprise rouge uniquement sur l'index documentaire
  (ADR 0063 absent de la section Décisions). Les 3 033 autres tests JS et les 73 tests Python passent.
  Lien et phrase ajoutés à `docs/architecture.md`, carte actuelle de la racine mise à jour ;
  `node --test tests/documentation-index.test.cjs` : 12 tests réussis. Nouvelle passe complète lancée.
- 19/10, Codex : `node scripts/check.mjs` final : `check : vert`, 154 fichiers de tests JS,
  3 034 tests JS et 73 tests Python réussis (Python : 66,394 s). Règles, format, lint, gel et cliquet verts.
  `git diff --check` sans anomalie. Verdict `TERMINÉ` déposé dans `.harness-state/tickets/T220/verdict.json` ;
  relecture et intégration laissées à la boucle, sans commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T220/relecture-1.md : **1. `tests/architecture.test.cjs:545-554`, `docs/architecture.md:39-40` et ADR 0063 (« La garde des services du cœur refuse l'import direct… »)** — hors périmètre

  - **Le problème :** la règle « les services du cœur n'importent pas la racine » ne bloque plus que l'import direct. `core/memory/index.cjs` exporte désormais `ViewingMemory`. Un service plat du cœur peut donc écrire `require('./memory/index.cjs').ViewingMemory` sans faire échouer aucune garde. Avant ce ticket, l'index n'exposait pas `WatchSession`, et ce chemin n'existait pas.
  - **La règle est devenue redondante :** dans la vraie politique, l'import direct par un module plat est déjà refusé par `context-private-import`. Elle ne protège plus que contre les autres modules internes de Mémoire.
  - **La documentation suit ce relâchement :** `docs/architecture.md:39-40` présente l'index comme la voie d'accès des services (« Les services du cœur accèdent à la racine… par l'entrée publique »). Elle ne dit plus que les services ne dépendent pas de la racine.
  - **Pourquoi hors périmètre :** le ticket impose ce dessin. Il demande d'exporter la racine par l'index et seulement d'« adapter » des gardes qu'il décrit comme fondées sur le chemin. Le résultat livré est conforme à cette lettre et à l'ADR.
  - **Attendu, dans un ticket ultérieur :** une garde au niveau de l'identifiant, en ignorant les commentaires (`core/ports.cjs:120` cite `ViewingMemory` en JSDoc) :
    - aucun module de `core/` hors `core/memory/` ne référence `ViewingMemory` ;
    - une fixture rejette un service qui l'obtient par l'index ;
    - la phrase de `docs/architecture.md` redevient une interdiction.
- .harness-state/tickets/T220/relecture-1.md : **2. `docs/domaine.md:72`, `:92` et `:99`** — hors périmètre

  - **Le problème :** le document dit encore « aujourd'hui `WatchSession`, `core/session.cjs:47` » et cite `core/session.cjs:293`, `:351`. Ces lignes sont désormais fausses.
  - **Pourquoi hors périmètre :** `domaine.md` est la cible DDD figée et le ticket ne l'ouvre pas à la modification.
  - **Attendu :** mettre à jour ces mentions « aujourd'hui » lors d'une révision de ce document.
- .harness-state/tickets/T220/relecture-1.md : **3. `core/memory/viewing-memory.cjs:116-117`, `:241` et `:325`** — hors périmètre

  - **Le problème :** le code déplacé garde des lignes à plusieurs instructions, par exemple `this.landing = new Set(); this.unplacedMedia = 0;` ou `this.emit(); this.drain();`. C'est contraire à la règle « une instruction par ligne », que seule la relecture vérifie.
  - **Pourquoi hors périmètre :** la phrase des standards « Du code déplacé… y arrive sans infraction » s'applique, dans son contexte, au gel ESLint. Ce gel est bien vide aux deux chemins. Le ticket limite par ailleurs le déplacement au nom, au chemin, aux importeurs et aux gardes.
  - **Attendu :** corriger ces lignes quand T226 ou T227 retouchent la racine.
