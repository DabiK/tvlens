---
id: T202
titre: Keep the core's global timers from growing and guard the pure modules in one rule
statut: termine
bloque_par: T030
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La garde d'architecture refuse tout nouvel accès global au temps dans le cœur, avec un stock
compté par opération qui ne peut que baisser. Une table unique garde les modules purs, avec les
interdictions propres à chacun, à la place des assertions dispersées.

## Sources

- `docs/audit-architecture.md`, rapport A, A.1, B8 et D3.
  Décision du propriétaire, le 16/10 : sortir ces deux règles de T030 ; T025/T190/T199/T178 sont transitifs.
- Code vérifié à `8340014` : `tests/architecture.test.cjs:16` garde déjà les globales du cœur ;
  `tests/architecture-guard.test.cjs:18` charge la vraie garde dans un arbre temporaire.
- Pureté dispersée : `tests/question-checkpoint.test.cjs:243` interdit imports, process et réseau ;
  `tests/architecture-f07.test.cjs:590` interdit aussi les minuteries au protocole de fermeture.
  Le checkpoint a des minuteries par défaut injectables à `runtime/question-checkpoint.cjs:13` :
  sa pureté ne signifie pas absence de toute minuterie. ADR 0015 et 0007.
- Temps global du cœur : `core/deep-ask.cjs:15`, `core/deep-ask.cjs:85`, `core/deep-ask.cjs:91`,
  `core/deep-ask.cjs:157` ; `core/living-recap.cjs:12`, `core/living-recap.cjs:107`,
  `core/living-recap.cjs:121` ; `core/moment-index.cjs:21`, `core/moment-search.cjs:26` ;
  `core/saved-moments.cjs:3`, `core/saved-moments.cjs:9`, `core/surveillance.cjs:364`,
  `core/video-tools.cjs:17`, `core/verification.cjs:11`.

## Périmètre

- Modifier `tests/architecture.test.cjs`, `tests/architecture-guard.test.cjs`,
  `tests/question-checkpoint.test.cjs`, `tests/architecture-f07.test.cjs` et `CONTRIBUTING.md`.
  Réutiliser parcours, relevé d'imports et résolution de T025/T030, sans seconde table de couches.
- Interdire toute hausse des accès globaux `Date.now`, set/clearTimeout, set/clearInterval et
  `AbortSignal.timeout` dans core/. Inventorier par fichier, opération et multiplicité, commentaires
  ignorés ; figer ce stock dans le test, sans exemption de fichier entier ni plafond global compensable.
  Une exception devenue inutile échoue aussi. Ne retirer ni minuterie existante ni défaut injectable.
- Centraliser une table pour `runtime/session-closing.cjs` (aucun import, process, réseau ou minuterie)
  et `runtime/question-checkpoint.cjs` (aucun import, process ou réseau ; défauts injectables des
  minuteries permis). Le mot « pur » ne prétend pas interdire au checkpoint ses défauts de timer.
- Déplacer le cas entièrement consacré à la pureté de `tests/question-checkpoint.test.cjs:243`
  dans la garde : un cas retiré, un cas ajouté, planchers `cas_de_test_produit` et `cas_de_test_harnais` constants (T196 a séparé le cliquet). Retirer seulement
  l'assertion de pureté de `tests/architecture-f07.test.cjs:590` ; son cas de composition et toutes
  ses assertions sur les fermetures restent. Retirer les imports disque devenus inutiles du checkpoint.
- Conserver les règles de T030 et les preuves comportementales. Aucun code produit, standard,
  harnais, plancher ou dépendance ne change ; fautes injectées uniquement en copies temporaires.

## Critères d'acceptation

1. Consigner le relevé exact au début et la table retenue, par fichier et opération. Commande
   d'exploration reproductible, dont les résultats sont relus hors commentaires :

   ```sh
   rg -n 'Date\.now|setTimeout|clearTimeout|setInterval|clearInterval|AbortSignal\.timeout' core
   ```

   La garde réelle compte les occurrences, pas seulement les lignes. Un nouveau setTimeout dans
   un fichier nouveau, puis un second identique dans un fichier déjà excepté, échouent séparément.
   Retirer un accès impose de retirer son exception ; les diagnostics nomment opération et fichier.
2. Dans les arbres isolés du banc, chaque module pur refuse un import, process et fetch. Le
   protocole refuse aussi une minuterie ; les défauts injectables du checkpoint restent permis.
   Chaque faute retirée rend le cas vert. Les sorties rouge et verte vont au journal.
3. Le journal rapproche le cas de pureté déplacé de son nouveau cas : un retrait pour un ajout,
   sans baisse de `cas_de_test_produit` ni de `cas_de_test_harnais`, et sans modification du plancher. Les autres scénarios du checkpoint
   et de fermeture conservent leurs assertions et valeurs. Aucun cas comportemental n'est supprimé.
4. À l'implémentation, exécuter en séquentiel architecture, architecture-guard, question-checkpoint
   et architecture-f07, puis `node scripts/check.mjs`. CONTRIBUTING décrit ces règles et renvoie
   à leur garde ; aucune promesse d'un cœur déjà sans minuterie n'est ajoutée.

## Test d'acceptation attendu

Le banc `tests/architecture-guard.test.cjs` exécute la vraie garde sur des arbres temporaires.
Le second accès identique prouve une limite par multiplicité ; les violations distinctes des deux
modules prouvent que la table ne leur impose pas une pureté uniforme fausse.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T030 livre les autres frontières et implique T025, T190, T199 et T178. La dette des minuteries est
figée, pas corrigée dans ce ticket. Les compteurs se recalculent après les dépendances ; les repères
ci-dessus servent à retrouver les émetteurs et ne figent pas un ancien nombre d'occurrences.

## Journal

- Exploration initiale : règles et tests lus, témoin de hooks présent. Le relevé exact de
  `rg -n 'Date\.now|setTimeout|clearTimeout|setInterval|clearInterval|AbortSignal\.timeout' core`
  est conservé dans `.harness-state/tickets/T202/releve-initial.txt` ; table relue hors commentaires
  dans `exploration.md` : 18 accès sur huit fichiers (Date.now 7, setTimeout 5, clearTimeout 5,
  AbortSignal.timeout 1 ; aucun intervalle). Aucun écart prévu (`ecarts.md`).

- Tests d'abord : `node --test --test-concurrency=1 --test-name-pattern='core time stock|pure module table' tests/architecture-guard.test.cjs`
  sort avec le code 1 avant les nouvelles gardes : 38 cas rouges sur l'assertion de présence des règles
  attendues (`gardes-rouge-initial.log`). Après implémentation, même commande : 38/38 verts
  (`gardes-vert-initial.log`). Les sorties de chaque vraie violation et de son retrait sont incluses :
  nouvelle opération dans un nouveau fichier, second setTimeout sur la même ligne du fichier déjà
  excepté, baisse d'effectif ou fichier disparu, compensation entre opérations ou fichiers ; imports
  sous sept formes, require dynamique, process et fetch dans chacun des deux modules ; six opérations
  temporelles refusées au protocole, défauts du checkpoint conservés.
- Compléments du banc : même commande, 40/40 verts (`gardes-vert.log`) ; références via globalThis
  et global, commentaires entre jetons, littéraux ignorés. Dans les copies temporaires, retirer
  l'exception Date.now de video-tools rend aussi verte la suppression de son accès ou de son fichier.
- Déplacement du cas de pureté : retrait de « the module loads nothing and reads neither the process,
  nor a disk, nor a network » du checkpoint ; ajout de « pure module table enforces each module
  dependency and timer policy » dans architecture. Ce déplacement est neutre pour le compteur produit
  et ne touche pas au compteur harnais. Le cas de composition des fermetures conserve ses assertions
  hors pureté ; les 12 cas comportementaux du checkpoint gardent leurs assertions et valeurs.
  Le nouveau cas de stock et les cas du banc s'ajoutent à cette couverture ; aucun plancher n'est modifié.

- Vérification séquentielle : `node --test --test-concurrency=1 tests/architecture.test.cjs` :
  10/10 verts ; `node --test --test-concurrency=1 tests/architecture-guard.test.cjs` : 337/337 verts ;
  `node --test --test-concurrency=1 tests/question-checkpoint.test.cjs` : 12/12 verts ;
  `node --test --test-concurrency=1 tests/architecture-f07.test.cjs` : 26/26 verts.
  Commandes, sorties rouges/vertes des violations isolées et codes de sortie conservés dans les
  fichiers du même nom sous `.harness-state/tickets/T202/`.
- Mesures par `measure(process.cwd())` de `scripts/quality/metrics.mjs` : produit 1163 → 1174,
  harnais 381 → 381 ; planchers inchangés. Le déplacement de pureté est un retrait pour un ajout ;
  les onze occurrences textuelles supplémentaires correspondent au cas de stock et au banc étendu.
  `metriques-initiales.json` et `metriques-finales.json` conservent le détail.
  CONTRIBUTING décrit le stock et les deux politiques de pureté, avec renvoi à leur garde.

- Contrôle des fichiers modifiés : `node scripts/check.mjs --changed`, code 0, vert : règles,
  format, lint, gel du lint, cliquet et 385/385 tests JS (`check-changed.log`).
- Contrôle final complet : `node scripts/check.mjs`, code 0, vert : règles, format, lint,
  gel du lint, cliquet ; 2181/2181 tests JS dans 132 fichiers et 30/30 tests Python
  (`check-complet.log`). `git diff --check` est vert. Comparaison directe avec HEAD : assertions
  comportementales inchangées dans les deux fichiers dont la pureté a été retirée ; seuls les
  cinq fichiers prévus et le journal du ticket sont modifiés (`perimetre-verifie.txt`).
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T202/verdict.json`. Aucun code produit,
  standard, harnais, plancher ni dépendance modifié ; aucun commit ni push. Relecture et intégration
  laissées à la boucle.

- Reprise après `relecture-1.md` : les quatre constats bloquants et mineurs sont acceptés,
  sans contestation ni écart prévu. Nouveau témoin de hooks présent ; rapport, journal, écarts,
  `git status --short` et `git diff` relus. Exploration de correction dans
  `.harness-state/tickets/T202/exploration-correction-1.md`. Reproduction des contournements
  par gabarits et accès calculés, puis des diagnostics et exceptions mortes, avant correction.

- Reprise après `echec-1.txt` : indisponibilité du modèle, sans nouvel échec de test signalé.
  Le rapport de relecture 1 et les corrections interrompues sont repris ; exploration et état
  détaillés dans `exploration-reprise-2.md`. Les rouges/verts des interpolations et accès calculés
  sont conservés ; diagnostics et validation des exceptions restent à terminer. Aucun écart prévu.

- Corrections des diagnostics et du stock, tests d'abord :
  `node --test --test-concurrency=1 --test-reporter=tap --test-name-pattern='core time stock gives an actionable' tests/architecture-guard.test.cjs`
  donne 2/2 rouges avant correction puis 2/2 verts ;
  `node --test --test-concurrency=1 --test-reporter=tap --test-name-pattern='core time stock rejects (the invalid frozen count|an empty exception)' tests/architecture-guard.test.cjs`
  donne 9/9 rouges puis 9/9 verts. Effectifs 0, négatif, fractionnaire, NaN, infini, chaîne et booléen
  refusés ; entrée vide refusée pour un fichier présent ou absent. Chaque retrait de faute est vert.
  Commandes, sorties et codes dans `reprise-{diagnostics,exceptions}-{rouge,vert}.log`.
- Vérification des corrections interrompues :
  `node --test --test-concurrency=1 --test-reporter=tap --test-name-pattern='(core time stock|pure module table).*?(literal computed|interpolated)' tests/architecture-guard.test.cjs`
  donne 75/75 verts (`reprise-interpolations-calcules-vert.log`). CONTRIBUTING précise les formes
  comptées, les expressions des gabarits, les propriétés calculées littérales et les exceptions mortes.
- Complément sur les mêmes accès globaux :
  `node --test --test-concurrency=1 --test-reporter=tap --test-name-pattern='(core time stock|pure module table) rejects optional' tests/architecture-guard.test.cjs`
  donne 14/14 rouges puis 14/14 verts (`reprise-optionnels-{rouge,vert}.log`). Les propriétés
  optionnelles directes et calculées sont normalisées ; les membres des dépendances injectées restent permis.
- Suites de reprise jouées une par une avec
  `node --test --test-concurrency=1 --test-reporter=tap tests/<suite>.test.cjs` : architecture 10/10,
  architecture-guard 437/437, question-checkpoint 12/12, architecture-f07 26/26, toutes code 0
  (`reprise-<suite>.log`). Comparaison avec HEAD : assertions comportementales intactes dans les
  deux suites dont la pureté a été déplacée (`reprise-perimetre-verifie.txt`).
- Mesures recalculées : produit 1163 → 1186, harnais 381 → 381 (`reprise-metriques.json`).
  Le déplacement de pureté reste un retrait pour un ajout ; le reste augmente le banc et ajoute
  la garde du stock. Aucun plancher, harnais, standard ou code produit modifié.
- Contrôles de reprise : `node scripts/check.mjs --changed`, code 0, vert : règles, format,
  lint, gel du lint, cliquet et 485/485 tests JS (`reprise-check-changed.log`).
  Puis `node scripts/check.mjs`, code 0, vert : mêmes contrôles, 2281/2281 tests JS dans
  132 fichiers et 30/30 tests Python (`reprise-check-complet.log`).
- Les quatre constats bloquants et mineurs de la relecture 1 sont corrigés : interpolations,
  propriétés calculées littérales, diagnostics distincts pour hausse et baisse, validation des
  exceptions. Le stock initial reste à 18 accès ; les défauts injectables du checkpoint restent
  permis. Verdict `TERMINÉ` dans `.harness-state/tickets/T202/verdict.json` ; relecture et
  intégration laissées à la boucle, sans commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T202/relecture-2.md : **1. `tests/architecture.test.cjs:59-61`, utilisé à `:381-384` — hors périmètre (réserve)**
  - **Le problème :** pour le protocole de fermeture, la table ignore les accès membres, par exemple `deps.setTimeout(fn)`.
    - L'ancienne assertion de `architecture-f07` refusait le mot `setTimeout` partout (`/\b(?:setTimeout|setInterval|…)\b/`), donc aussi un minuteur injecté qui portait ce nom.
    - Ce n'était qu'un contrôle sur le nom : un minuteur injecté sous un autre nom (`wait`, `schedule`) passait déjà.
    - La nouvelle règle traite le protocole comme le stock du cœur : seuls les accès globaux sont interdits.
  - **Pourquoi ce n'est pas bloquant :** dans le ticket, « minuterie » se lit comme les six accès globaux, et les membres des dépendances injectées sont explicitement permis. La correction n'a pas touché ce comportement, déjà présent à la relecture 1.
  - **Attendu :** rien dans ce ticket. Si le propriétaire veut un protocole sans aucun minuteur, même injecté, il faut une règle explicite ailleurs.
