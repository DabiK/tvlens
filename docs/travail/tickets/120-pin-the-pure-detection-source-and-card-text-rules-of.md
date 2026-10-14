---
id: T120
titre: Pin the pure detection, source and card text rules of surveillance in tests
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`core/surveillance.cjs` sera découpé en plusieurs fichiers (fiche `docs/travail/fiches/coeur.md`, étape 7).
Quatre de ses règles pures sont exportées mais aucun test ne les appelle directement : on ne les voit qu'à
travers la classe `Surveillance`. Après ce ticket, un fichier de test fixe leur comportement actuel, sans
monter de surveillance. Le code de production ne change pas.

## Sources

- Constats : CORE-07
- Correction du relecteur sur CORE-07 : `validateDetection`, `composeSignalText` et `acceptableText` ne
  figurent dans aucun fichier de `tests/` ; elles ne sont couvertes qu'à travers la classe.
- Code à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `core/surveillance.cjs`, fonction `validateDetection(result, passages, limits)`, ligne 181 : lève
    « Résultat de détection invalide. » si `result.claims` n'est pas un tableau ; compte et note chaque
    rejet par cause (`invalid`, `unknownPassage`, `quoteNotFound`, `overflow`) ; rend
    `{ accepted, raw, rejected, overflowed, rejects }`. Limite `maxClaimsPerBatch` de `DEFAULT_LIMITS`
    (ligne 45). Constantes `KINDS` (ligne 65) et `MIN_QUOTE_CHARS` (ligne 74).
  - `core/surveillance.cjs`, fonction `sourceKey(value)`, ligne 220 : URL `https:` sans identifiants, sans
    fragment ; `null` sinon.
  - `core/surveillance.cjs`, fonction `acceptableText(text)`, ligne 317 : 1 à 3 phrases, 420 caractères au
    plus (`TEXT_LIMITS`, ligne 71), ni adresse, ni Markdown, ni verdict binaire.
  - `core/surveillance.cjs`, fonction `composeSignalText(statements)`, ligne 345 : au-delà de trois
    éléments, les deux premiers et une phrase qui compte le reste.
- Exports : `module.exports` en fin de `core/surveillance.cjs` (les quatre fonctions y sont).
- Tests existants : `tests/surveillance.test.cjs` importe `claimKey`, `sameClaim`, `applyVerdicts`,
  `composeLotText` et `sentences`, mais aucune des quatre fonctions ci-dessus ;
  `grep -rlE "validateDetection|composeSignalText|acceptableText|sourceKey" tests` ne rend rien à `0d5a954`.
  Les cas de test s'écrivent avec `test(` : c'est ce que compte la mesure `cas_de_test` du cliquet.

## Périmètre

- À modifier :
  - un nouveau fichier plat `tests/surveillance-rules.test.cjs` (arbitrage A1), nommé d'après ce qu'il
    teste, qui importe les quatre fonctions depuis `core/surveillance.cjs`.
- À ne pas toucher : `core/surveillance.cjs` et tout code de production ; `tests/surveillance.test.cjs`.
- Les valeurs attendues sont celles que le code rend aujourd'hui, observées en lançant le fichier de test,
  jamais déduites d'une règle qu'on croit juste. Une valeur qui surprend est notée au journal, pas corrigée.
- Lignes de 160 caractères au plus.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `validateDetection` : un test par cause de rejet. Un élément qui n'est pas un objet est compté
   `invalid` avec `passageId: null` ; un `passageId` inconnu est compté `unknownPassage` avec
   `passageId: null` ; une affirmation d'exactement 7 caractères (un de moins que le minimum de 8), tous
   ses autres champs valides et sa citation présente dans le passage, est comptée `invalid` avec
   l'identifiant du passage ; une citation d'au moins 6 caractères utiles absente du passage est comptée
   `quoteNotFound` (plus courte, elle serait comptée `invalid`) ; au-delà de `maxClaimsPerBatch` (limite
   passée en argument, petite), l'élément est compté `overflow` et son passage est dans `overflowed`.
   Chaque rejet figure aussi dans `rejects`, et `raw` vaut le nombre d'éléments reçus.
2. `validateDetection` : un élément accepté a `action: 'verify'` et `checkable: true` quand ils sont
   absents ; un élément `action: 'signal'` est accepté avec `checkable: false`. Un résultat sans tableau
   `claims` lève « Résultat de détection invalide. ».
3. `sourceKey` : une adresse `https:` est rendue sans son fragment ; une adresse `http:`, une adresse avec
   identifiants et une valeur qui n'est pas une URL rendent `null`.
4. `acceptableText` : une à trois phrases sous la limite sont acceptées ; un texte avec une adresse, du
   Markdown, un verdict (« c'est vrai »), quatre phrases, plus de 420 caractères ou une valeur qui n'est pas
   une chaîne sont refusés.
5. `composeSignalText` : trois éléments ou moins donnent une phrase par élément ; cinq éléments donnent les
   deux premiers puis la phrase qui compte les trois autres ; le texte rendu tient dans 420 caractères.
6. `node --test tests/surveillance-rules.test.cjs` passe ; `node scripts/check.mjs --changed` passe
   (cliquet : `cas_de_test` augmente, aucune ligne longue ajoutée).
7. Mutation : remplacer temporairement `statement.length < 8` par `statement.length < 7` dans
   `validateDetection` fait échouer au moins un test du fichier (celui de l'affirmation de 7 caractères) ;
   la mutation est retirée avant la fin et notée au journal avec le résultat observé.

## Test d'acceptation attendu

`tests/surveillance-rules.test.cjs`, test « a detection answer drops each invalid element under its own
cause and keeps a record of it » : appel direct de `validateDetection` avec deux passages et une liste
d'éléments couvrant les quatre causes, frontière : l'export de `core/surveillance.cjs`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
