# 0011 — Un script partagé du panneau TV est une IIFE exposée sur la page et par CommonJS

- Date : 2026-10-15
- Ticket : `docs/travail/tickets/132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md`
- Statut : acceptée

## Contexte

Le panneau TV n'a pas d'outil de construction : `tv/app/index.html` charge des scripts classiques
dans l'ordre de ses balises, et les tests Node lisent les mêmes fichiers par `require`. La mise en forme
d'une durée et le pluriel existaient en quatre copies (`companion.js`, `surveillance-view.js`,
`sessions-view.js`, `timeline-view.js`), avec des écarts : la frise rendait « NaN:NaN » pour une position
non finie, et le pluriel de `companion.js` n'avait pas de forme par défaut. Il fallait une manière de
partager un script entre les vues, qui marche à la fois dans la page et sous Node.

## Décision

Un script partagé du panneau, ici `tv/app/text.js`, est une IIFE
`(function (root) { … })(typeof window !== "undefined" ? window : globalThis)`, sans dépendance. Il
s'expose sur `root` sous un nom `TVLens…` (`root.TVLensText`) et, si
`typeof module === "object" && module && module.exports`, aussi par `module.exports`.

Un consommateur le résout par
`typeof module === "object" && module && module.exports ? require("./text.js") : root.TVLensText`
(`window.TVLensText` dans le haut de `companion.js`, qui n'est pas dans une IIFE ; une variable qui s'y
ajoute porte le préfixe `tvlens`). Il lit les fonctions dont il a besoin au chargement
(`var clock = shared.clock`), si bien qu'un script partagé absent de la page échoue dès le chargement
plutôt qu'au premier affichage.

`index.html` charge le script partagé avant son premier consommateur (`text.js` avant
`surveillance-view.js`). La page ambiante (`ambient.html`, empaquetée par `scripts/package-tv-ambient.mjs`)
n'embarque que `surveillance-overlay.js` et `ambient.js` : elle ne charge aucun script partagé du panneau,
et `surveillance-overlay.js` garde ses propres copies.

## Alternatives écartées

- Modules ES (`import`/`export`) : le panneau tourne dans le navigateur de webOS sans construction, et
  `tests/tv-app-compat.test.cjs` exige des scripts classiques.
- Lecture paresseuse (`function clock(ms) { return root.TVLensText.clock(ms); }`) : un oubli dans
  `index.html` ne se verrait qu'au premier affichage d'une durée, qu'aucun test de page n'exerce.
- Exposition seulement par `module.exports` sous Node, comme les vues qui font `return` avant `root` : le
  script partagé n'a pas d'état de page à protéger, et poser `root.TVLensText` dans les deux cas garde une
  seule forme, celle de `remote-client.js`.
- Charger `text.js` dans la page ambiante : elle n'a besoin que de l'incrustation, et l'ajouter changerait
  son paquet et son test de liste pour trois fonctions déjà présentes dans `surveillance-overlay.js`.

## Conséquences

Une mise en forme commune au panneau s'écrit une fois, et tous ses cas se testent sous Node à la frontière
du script. En contrepartie, l'ordre des balises d'`index.html` porte une dépendance : un nouveau
consommateur doit venir après le script partagé, et un nouveau script partagé doit être ajouté à la page.
Le nom local du script partagé ne doit pas masquer une fonction de la vue (`surveillance-view.js` a déjà
une fonction `text`, d'où le nom `shared`). Les copies de la page ambiante restent à part et peuvent
diverger.

## Protégée par

- `tests/tv-text.test.cjs` : comportement de `clock` et de `plural`, et même sortie par `companion.js` et
  `sessions-view.js`.
- `tests/tv-remote-navigation.test.cjs` : charge les scripts d'`index.html` dans l'ordre, sans `module` ;
  sans la balise de `text.js`, les vingt tests échouent au chargement.
- `tests/tv-app-compat.test.cjs` : scripts classiques dans `tv/app`, et liste exacte des scripts
  d'`ambient.html`.
- `tests/chat-error-ui.test.cjs` : chargement des vues sous Node sans `window`, et liste des exports de
  `companion.js`.
