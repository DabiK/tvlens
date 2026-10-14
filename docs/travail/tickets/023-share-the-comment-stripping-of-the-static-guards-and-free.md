---
id: T023
titre: Share the comment stripping of the static guards and free one from quote style
statut: a-faire
bloque_par: T015
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Quatre gardes statiques retirent les commentaires du code qu'ils lisent par la même paire de
remplacements, recopiée dans quatre fichiers de test ; et le garde qui exige que le mode de confinement
ne soit lu qu'une fois tient à des guillemets doubles. Après ce ticket, le retrait des commentaires est
une fonction d'aide testée que les quatre gardes appellent, et le garde de confinement rend le même
verdict avec des apostrophes ou des guillemets, tout en refusant toujours une seconde lecture. Aucun
code de production n'est modifié. C'est le prérequis de la table des règles de couches.

## Sources

- Constats : TSTA-08
- Code concerné, à la version `0d5a954` :
  - La paire `.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')` est recopiée à
    `tests/architecture.test.cjs` l.8, `tests/architecture-f07.test.cjs` l.579,
    `tests/codex-confinement.test.cjs` l.463, `tests/mac-ui.test.cjs` l.713. Elle retire les
    commentaires en bloc et les lignes entières de commentaire ; un commentaire en fin de ligne de code
    reste.
  - `tests/codex-confinement.test.cjs`, test « no product code injects a transport or a feature answer,
    nor passes a weaker mode than the default; a transport double never claims a block » (l.457) :
    parcours récursif `walk` (l.459-466), puis l'assertion de la l.481, qui relève dans tout le code
    produit les usages de `TVLENS_CODEX_CONFINEMENT` par
    `/[\w.]*TVLENS_CODEX_CONFINEMENT\W{1,6}\w*/g`, garde ceux qui contiennent `env` et exige qu'ils
    soient exactement `['process.env.TVLENS_CODEX_CONFINEMENT || "enforce']` : une seule lecture, comme
    valeur par défaut de l'option, aucune écriture.
  - Lecture réelle : `adapters/codex-session-client.cjs`, l.107,
    `confinementMode = process.env.TVLENS_CODEX_CONFINEMENT || "enforce",`. La valeur par défaut et la
    lecture de l'environnement sont prouvées par le comportement (l.335-338) ; l'unicité de la lecture
    et l'absence d'écriture ne le sont que par la l.481.
- Mesure à `0d5a954` : `grep -lF '[\s\S]*?\*\/' tests/*.test.cjs` liste cinq fichiers, les quatre
  ci-dessus et `tests/tv-app-compat.test.cjs` (commentaires CSS, autre usage, non repris).
- Le relecteur de l'audit : ne pas retirer l'assertion de la l.481 mais la rendre indifférente aux
  guillemets ; garder les assertions du protocole de fermeture de `tests/architecture-f07.test.cjs`.

## Périmètre

- À modifier : `tests/helpers/source-shape.cjs` (créé par le premier ticket du lot) — y ajouter et
  exporter une fonction qui retire les commentaires d'un texte JavaScript par la même paire de
  remplacements, à l'identique, avec ses cas dans `tests/source-shape.test.cjs`.
- À modifier : `tests/architecture.test.cjs` (l.8), `tests/architecture-f07.test.cjs` (l.579),
  `tests/codex-confinement.test.cjs` (l.463), `tests/mac-ui.test.cjs` (l.713) — la paire recopiée
  devient un appel de cette fonction. Rien d'autre ne change dans ces quatre tests.
- À modifier : `tests/codex-confinement.test.cjs`, assertion de la l.481 — la comparaison ne dépend plus
  du signe qui ouvre `enforce` (apostrophe ou guillemet) ni d'un retour à la ligne autour de `||` ;
  elle exige toujours un seul usage lié à l'environnement dans tout le code produit, et que cet usage
  soit la lecture par défaut.
- À ne pas toucher : le code de production ; les autres assertions de ces tests ;
  `tests/tv-app-compat.test.cjs`. Aucun cas de test n'est retiré ni renommé.
- Les fautes injectées pour la preuve du critère 3 sont défaites avant la fin de la session
  (`git checkout -- adapters/codex-session-client.cjs`) : aucun fichier de `adapters/` ne reste
  modifié par ce ticket.
- Aucun fichier modifié ne gagne de ligne de plus de 160 caractères.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/source-shape.test.cjs` passe et prouve, sur des textes écrits dans le test : un
   commentaire en bloc sur plusieurs lignes est retiré ; une ligne entière de commentaire est retirée ;
   un commentaire en fin de ligne de code reste, comme aujourd'hui ; le code hors commentaire est rendu
   inchangé.
2. `grep -lF '[\s\S]*?\*\/' tests/*.test.cjs` ne liste plus que `tests/tv-app-compat.test.cjs`.
3. `node --test tests/codex-confinement.test.cjs` passe. Fautes injectées, consignées au journal puis
   défaites : remplacer les guillemets de `adapters/codex-session-client.cjs` l.107 par des apostrophes
   laisse le test vert ; ajouter dans ce même fichier une seconde lecture de
   `process.env.TVLENS_CODEX_CONFINEMENT` le fait échouer ; y écrire
   `process.env.TVLENS_CODEX_CONFINEMENT = 'observe'` le fait échouer.
4. `node --test tests/architecture.test.cjs tests/architecture-f07.test.cjs` et
   `node --test --test-concurrency=1 tests/mac-ui.test.cjs` passent.
5. `grep -c "^\s*test(" ` ne baisse dans aucun des quatre fichiers de test modifiés (à `0d5a954` :
   architecture 3, architecture-f07 12, codex-confinement 17, mac-ui 15).
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les cas ajoutés à `tests/source-shape.test.cjs` pour la fonction d'aide, et le test existant de
`tests/codex-confinement.test.cjs`. Frontière : des textes écrits par le test pour l'aide ; le texte du
code produit, lu récursivement comme aujourd'hui, pour le garde de confinement.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'un des quatre gardes change de verdict en passant par la fonction
commune, ou si le garde de confinement ne peut pas refuser une seconde lecture sans dépendre des
guillemets : verdict BLOQUÉ, avec l'écart constaté.

## Journal
