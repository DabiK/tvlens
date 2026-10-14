---
id: T024
titre: Make the remaining static guards tolerant of quotes and line breaks
statut: a-faire
bloque_par: T015
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les gardes statiques légitimes du dépôt (plancher du moteur de la TV, page ambiante sans secret, plafonds
jamais écrits en dur) restent. Quatre d'entre eux tiennent à une écriture précise : des guillemets
doubles, une règle CSS sur une ligne, un nombre sans séparateur, une liste de fichiers recopiée. Après
ce ticket, ils ne dépendent plus de cette écriture, et chacun prouve sur un exemple qu'il voit encore ce
qu'il doit refuser.

## Sources

- Constats : TSTC-15
- Code concerné, à la version `0d5a954` :
  - `tests/tv-app-compat.test.cjs`, test « the ambient page has no secret, no remote client, no
    focusable element and no media » (l.77) : `/html, body \{[^}]*pointer-events: none/` (l.82) et
    `/#ambient \{[^}]*position: fixed[^}]*overflow: hidden/` (l.83) attendent le sélecteur et les
    déclarations dans cette écriture ; `/route\("([a-z]+)"\)/g` (l.92) attend des guillemets doubles et
    doit trouver `ack`, `key`, `wait`.
  - `tests/tv-app-compat.test.cjs`, test « the guard itself refuses a module, a recent API and nested
    CSS » (l.58-67) : modèle d'un garde qui se prouve sur des textes fautifs écrits dans le test.
  - `tests/mac-ui.test.cjs`, test « the renderer talks to the bridge of the contract only, and writes no
    ceiling or retention of its own » (l.685) : `/\b300000\b/` (l.721) et `/\b60000\b/` (l.722, sauf
    `ui/text.mjs` et `ui/card-queue.mjs`) ne voient pas `300_000` ni `60_000`.
  - `tests/tv-panel.test.cjs`, test « no duration literal is left in the panel: every ceiling shown is
    derived » (l.80) : liste de sept fichiers recopiée (l.82) ; `tv/app` en contient dix en `.js` ou
    `.html` (`ambient.html`, `ambient.js` et `surveillance-overlay.js` ne sont pas lus).
- Mesures à `0d5a954` : le motif de la l.84 de `tests/tv-panel.test.cjs`, appliqué par `node -e` aux dix
  fichiers `.js` et `.html` de `tv/app`, ne trouve rien dans aucun ; `/\b(?:300_?000|60_?000)\b/`
  appliqué aux fichiers de la fenêtre Mac ne trouve que `60000` dans `app/ui/card-queue.mjs` (une fois)
  et `app/ui/text.mjs` (quatre fois), les deux exceptions déjà admises.
- Le relecteur de l'audit confirme ces fragilités et qu'aucun de ces tests n'est parmi les cinq que le
  formatage casse. Risque nommé : en élargissant un motif, un garde d'absence peut devenir vacant sans
  échouer ; un auto-test par faute injectée, sur le modèle des l.58-67, le détecte.

## Périmètre

- À modifier : `tests/tv-app-compat.test.cjs` — les motifs des l.82, 83 et 92 acceptent apostrophes ou
  guillemets, et des espaces ou retours à la ligne entre sélecteurs, accolade et déclarations.
- À modifier : `tests/mac-ui.test.cjs` — les deux gardes de plafond voient aussi l'écriture avec
  séparateur `_` ; les deux fichiers exceptés restent les mêmes.
- À modifier : `tests/tv-panel.test.cjs` — la liste de la l.82 devient la lecture des fichiers `.js` et
  `.html` de `tv/app`, avec l'exigence que les sept fichiers d'aujourd'hui y soient.
- Chaque garde élargi est prouvé sur un texte écrit dans le test : une forme admise et la forme fautive
  qu'il doit refuser.
- Non repris ici : le regroupement des gardes dans un fichier commun, le passage des interdits en règles
  de lint, et la datation des gardes de code retiré.
- À ne pas toucher : `tv/app/`, `app/`, les autres assertions de ces trois tests. Les fautes injectées
  pour la preuve du critère 5 sont défaites avant la fin de la session (`git checkout -- <chemin>`) :
  aucun fichier de `app/` ni de `tv/` ne reste modifié par ce ticket.
- Aucun fichier modifié ne gagne de ligne de plus de 160 caractères.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/tv-app-compat.test.cjs tests/tv-panel.test.cjs` et
   `node --test --test-concurrency=1 tests/mac-ui.test.cjs` passent.
2. Dans `tests/tv-app-compat.test.cjs`, des assertions sur des textes écrits dans le test prouvent :
   `route('ack')` et `route("ack")` sont relevés tous deux ; une règle `html,\nbody {\n  pointer-events:
   none;\n}` satisfait le garde et la même règle sans `pointer-events: none` ne le satisfait pas ; de
   même pour `#ambient` avec `position: fixed` et `overflow: hidden`.
3. Dans `tests/mac-ui.test.cjs`, des assertions sur des textes écrits dans le test prouvent que
   `300000`, `300_000`, `60000` et `60_000` sont vus, et que `1300000` ne l'est pas.
4. Dans `tests/tv-panel.test.cjs`, la liste lue compte au moins dix fichiers et contient les sept noms
   de la l.82.
5. Fautes injectées, consignées au journal puis défaites : écrire `300_000` dans `app/renderer.js` fait
   échouer le test de la fenêtre Mac ; écrire « 60 secondes » dans `tv/app/ambient.js` fait échouer le
   test du panneau ; remplacer les guillemets d'un `route("…")` de `tv/app/ambient.js` par des
   apostrophes laisse `tests/tv-app-compat.test.cjs` vert sur la liste des routes.
6. `grep -c "^\s*test(" ` ne baisse dans aucun des trois fichiers (avant : tv-app-compat 5, mac-ui au
   moins 15, tv-panel 19).
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les trois tests existants, élargis, et leurs preuves sur texte écrit. Frontière : les fichiers de
`tv/app` et de la fenêtre Mac lus comme texte — ce sont des gardes d'absence et de plancher, pas des
preuves de comportement.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si lire tout `tv/app` fait apparaître un littéral de durée dans un
fichier jusque-là non lu, ou si un motif élargi ne peut pas refuser sa forme fautive : verdict BLOQUÉ,
avec l'écart constaté.

## Journal
