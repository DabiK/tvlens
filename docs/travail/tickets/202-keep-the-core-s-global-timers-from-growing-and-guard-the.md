---
id: T202
titre: Keep the core's global timers from growing and guard the pure modules in one rule
statut: a-faire
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
