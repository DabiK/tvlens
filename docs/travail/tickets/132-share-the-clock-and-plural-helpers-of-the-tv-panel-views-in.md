---
id: T132
titre: Share the clock and plural helpers of the TV panel views in one classic script
statut: a-faire
bloque_par: T028, T130
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Quatre scripts du panneau TV ont chacun leur copie de la mise en forme d'une durée (« 1:32:15 ») et du pluriel
(« 3 passages »), avec des écarts : la frise n'a pas de garde pour une valeur non finie, le pluriel de
`companion.js` n'a pas de forme par défaut. Après ce ticket, `tv/app/text.js` les définit une fois, avec des
tests, et `companion.js`, `surveillance-view.js`, `sessions-view.js` et `timeline-view.js` s'en servent. La
manière de partager un script classique entre les vues (exposition, résolution sous Node et dans la page,
ordre de chargement, exclusion de la page ambiante) est consignée dans un ADR, que suivront les prochains
scripts partagés du panneau. La page ambiante (`surveillance-overlay.js`, `ambient.js`) garde ses copies.

Seuls changements de comportement admis, à noter au journal : la frise affiche « 0:00 » au lieu de
« NaN:NaN » pour une position non finie ; `plural` de `companion.js` gagne la forme par défaut `one + "s"`,
alors qu'aucun de ses appels n'omet la forme plurielle.

## Sources

- Constats : TV-04, TV-03
- Règle de partage retenue (consignée par l'ADR de ce ticket) : un script partagé du panneau est une IIFE
  `(function (root) { … })(typeof window !== "undefined" ? window : globalThis)`, comme
  `surveillance-view.js`, sans dépendance, qui s'expose sur `root.TVLensText` et, si
  `typeof module === "object" && module && module.exports`, par `module.exports` ; un consommateur le résout
  par `typeof module === "object" && module && module.exports ? require("./text.js") : root.TVLensText` ;
  `index.html` le charge avant son premier consommateur ; la page ambiante n'en charge aucun.
- Code concerné, à la version `0d5a954` :
  - `tv/app/companion.js`, niveau du fichier : `tvlensFinite` (l.28), `tvlensClock` (l.32), `tvlensPlural`
    (l.323, `count + " " + (count > 1 ? many : one)`) ; export `clock: tvlensClock` (l.375) ;
    `var time = tvlensClock` (l.390).
  - `tv/app/surveillance-view.js`, moitié modèle : `finite` (l.47), `clock` (l.53), `plural` (l.66,
    `many || one + "s"`) ; garde CommonJS (l.544) ; `clock` n'est pas exporté.
  - `tv/app/sessions-view.js`, moitié modèle : `finite` (l.6), `plural` (l.9), `two` (l.12), `clock` (l.15) ;
    garde CommonJS (l.368) ; `clock` exporté.
  - `tv/app/timeline-view.js` : `var time = function (ms)` (l.7), sans garde de valeur non finie ; script
    terminé par `})(window)`, jamais chargé sous Node.
  - `tv/app/surveillance-overlay.js` : `finite` (l.33), `clock` (l.67), `plural` (l.87) — hors périmètre.
  - `tv/app/index.html`, balises `script` (l.191-198) ; `tv/app/ambient.html` ;
    `scripts/package-tv-ambient.mjs`, constante `SHARED` (l.23).
  - `tests/chat-error-ui.test.cjs`, test `companion.js exposes the pure view model without touching the
    browser` (l.10-18) : chargement des scripts sans `window` et liste exacte des exports de `companion.js`.
  - `tests/tv-app-compat.test.cjs` : découverte des scripts de `tv/app` et liste exacte des scripts de
    `ambient.html`.
  - `tests/mac-ui.test.cjs`, test de comparaison croisée (l.69) : formats Mac et TV différents par choix.
  - `scripts/bench-perceived.cjs`, `load` (l.25) : charge `companion.js` par `require`.
  - Modèle d'un module par comportement partagé : `runtime/session-closing.cjs`.

## Périmètre

- À créer :
  - `tv/app/text.js` : script classique en IIFE, sans dépendance, qui définit `finite`, `clock` et `plural`
    (comportement de `surveillance-view.js` à `0d5a954`), les expose sur `root.TVLensText` et, sous CommonJS,
    par `module.exports` ;
  - `tests/tv-text.test.cjs` ;
  - `docs/adr/NNNN-…md` au prochain numéro libre (0011 à `0d5a954`, où `docs/adr/` va de 0000 à 0010), en
    français, sur le gabarit `docs/adr/0000-gabarit.md` : la règle de partage ci-dessus, et pourquoi la page
    ambiante n'en charge aucun (elle n'embarque que `surveillance-overlay.js` et `ambient.js`).
- À modifier :
  - `tv/app/index.html` : `text.js` chargé avant son premier consommateur ;
  - `tv/app/companion.js`, `surveillance-view.js`, `sessions-view.js` : résolution
    `typeof module === "object" && module && module.exports ? require("./text.js") : root.TVLensText`
    (`window.TVLensText` au niveau du fichier de `companion.js`), et leurs copies supprimées. Les fonctions de
    `text.js` sont lues au chargement (par exemple `var clock = text.clock`), si bien qu'un oubli dans
    `index.html` échoue dès le chargement. Les noms locaux (`tvlensFinite`, `tvlensClock`, `tvlensPlural`,
    `time`, `finite`, `clock`, `plural`) peuvent rester comme alias pour limiter le diff. Le haut de
    `companion.js` n'est pas dans une IIFE : toute variable qu'on y ajoute devient une variable globale de la
    page et porte le préfixe `tvlens` (par exemple `tvlensText`). `two` reste dans `sessions-view.js`, où
    `duration` s'en sert ;
  - `tv/app/timeline-view.js` : `time` lit `root.TVLensText.clock`.
- À ne pas toucher : `surveillance-overlay.js`, `ambient.js`, `ambient.html`, `scripts/package-tv-ambient.mjs`,
  le côté Mac (`app/`), les textes passés à `plural`, les fonctions propres à une vue (`duration`, `bytes`,
  `range`, `host`…), la liste des exports de `companion.js`, de `surveillance-view.js` et de `sessions-view.js`.
- Aucune ligne de plus de 160 caractères ajoutée ; aucun `catch` vide ajouté.

## Critères d'acceptation

1. `tests/tv-text.test.cjs` passe et prouve, en important `tv/app/text.js` :
   - `clock` : 0 → « 0:00 », 61 000 → « 1:01 », 59 999 → « 0:59 », 3 723 000 → « 1:02:03 », −5 000 → « 0:00 »,
     et `NaN`, `Infinity`, `undefined`, `"12"` → « 0:00 » ;
   - `plural` : (1, « passage », « passages ») → « 1 passage », (0, …) → « 0 passage », (2, …) → « 2 passages »,
     (2, « image ») → « 2 images » ;
   - les mêmes cas de `clock` donnent la même sortie par `require("../tv/app/companion.js").clock` et par
     `require("../tv/app/sessions-view.js").clock` (sorties observées sur `0d5a954` par `companion.js` : celles
     listées ci-dessus).
2. Faute injectée puis défaite : la balise `script` de `text.js` retirée de `tv/app/index.html` fait échouer
   `tests/tv-remote-navigation.test.cjs` au chargement de la page, sortie au journal ; la faute est défaite et
   le test relancé passe.
3. `grep -nE "function (tvlensClock|tvlensPlural|tvlensFinite|clock|plural|finite)\(" tv/app/companion.js
   tv/app/surveillance-view.js tv/app/sessions-view.js` et `grep -n "var time = function" tv/app/timeline-view.js`
   ne sortent rien.
4. `grep -c "TVLensText\|text.js" tv/app/surveillance-overlay.js tv/app/ambient.js tv/app/ambient.html` rend 0
   pour chaque fichier.
5. Passent sans modification de leurs assertions : `tests/chat-error-ui.test.cjs` (exports et chargement sans
   `window`), `tests/tv-app-compat.test.cjs` (plancher, liste de `ambient.html`), `tests/tv-panel.test.cjs`,
   `tests/mac-ui.test.cjs`, `tests/tv-remote-navigation.test.cjs`.
6. Un nouveau fichier `docs/adr/NNNN-…md` existe et décrit la forme de partage, l'ordre de chargement et
   l'exclusion de la page ambiante.
7. `node scripts/check.mjs` est vert ; la mesure `cas_de_test` ne baisse pas.

## Test d'acceptation attendu

`tests/tv-text.test.cjs`, à la frontière du script `tv/app/text.js` chargé par `require`, plus les exports
publics existants (`clock` de `companion.js` et de `sessions-view.js`) pour l'équivalence. L'ordre de
chargement dans la page est prouvé par `tests/tv-remote-navigation.test.cjs` (ticket T130).

## Hypothèses bloquantes

Aucune décision n'est attendue. La forme de partage est celle décrite aux sources et suit la garde CommonJS
déjà présente dans les scripts ; l'ADR la consigne. Si un appelant dépend d'un écart entre copies
autre que les deux admis plus haut (par exemple un texte affiché qui changerait) : verdict BLOQUÉ, avec
l'écart constaté.

## Journal
