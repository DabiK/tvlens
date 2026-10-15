---
id: T130
titre: Pin the remote walk of the TV chat column in a page harness without a browser
statut: termine
bloque_par: T157
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le parcours à la télécommande du panneau TV (flèches, OK, Retour) n'est protégé aujourd'hui que par les
smokes, qui demandent un navigateur réel et ne tournent pas dans la boucle. Après ce ticket, un harnais Node
charge les scripts de `tv/app/index.html` dans un contexte `vm`, sur un faux document écrit à la main, et un
fichier de tests fixe le comportement actuel du panneau non appairé : démarrage, colonne de conversation,
lecture des messages, champ de question, dialogues modaux. Aucun code de production ne change. Ce filet
protège les extractions qui suivent dans le panneau (`text.js` au ticket T132, puis la navigation).

Ce qui rend le harnais petit, d'après le code à `0d5a954` : sans appairage, `companion.js` rend la main juste
après l'installation de ses écouteurs (l.568-572), si bien que seuls `dialogKeys` et le parcours de la colonne
de conversation reçoivent les touches ; aucune requête n'est lancée. Les cas des critères ont été relevés à la
lecture du code : le test fixe ce qu'il observe (voir « Hypothèses bloquantes »).

## Sources

- Constats : TV-01, TV-02
- Code concerné, à la version `0d5a954` :
  - `tv/app/companion.js`, fermeture du navigateur : `leaveReading` (l.427), écouteurs `focus`/`blur` de
    `conversation` (l.433-440), écouteur `keyboardStateChange` (l.444), écouteur `mousedown` (l.451),
    `dialogKeys` (l.457-481), gestionnaire `keydown` (l.482-566 : Retour l.489-500, conversation l.501-522,
    question l.523-529, table de la colonne l.530-565), démarrage non appairé (l.567-572).
  - `tv/app/capture-control.js`, `setupCaptureControl` : sortie anticipée sans jeton (« Appairage requis pour
    la capture. »).
  - `tv/app/index.html` : identifiants des éléments, attributs `hidden`/`disabled`, trois `dialog` avec leurs
    boutons et `data-cancel`, ordre des balises `script` (l.191-198).
  - `scripts/smoke-lg-ui.mjs` (en-tête) et `scripts/smoke-tv-timeline.mjs` : la page est toujours chargée sans
    `connection.js`, fichier d'appairage qui contient le jeton.
  - `tests/helpers/fake-dom.cjs` n'existe pas à `0d5a954` ; le lot L05 prévoit de le créer comme aide
    partagée sans sélecteurs. S'il existe au moment du ticket, il n'est ni modifié ni étendu : ce harnais est un
    module distinct.

## Périmètre

- À créer :
  - `tests/helpers/tv-page.cjs` : construit un faux `window`/`document` à partir de `tv/app/index.html`, puis
    charge dans un seul contexte `vm`, dans l'ordre des balises `script`, chaque script listé sauf
    `connection.js`. Il fournit seulement ce que lit le code chargé : `getElementById` sur les identifiants de
    la page (nom de balise, `hidden`, `disabled`, `dataset`, `textContent`, `scrollTop`, `focus`, `blur`,
    `click`, `contains`, écouteurs), `document.activeElement`, `document.body`, `document.documentElement`,
    écouteurs du document, `querySelector("dialog[open]")`, et sur un dialogue `querySelector("[data-cancel]")`
    et `querySelectorAll("button")`, `window.close` enregistré, `performance.now`. Il rend de quoi appuyer sur
    une touche (code et nom), lire l'élément actif, l'appel à `preventDefault`, ouvrir un dialogue et émettre
    `keyboardStateChange` ou `mousedown`.
  - `tests/tv-remote-navigation.test.cjs` : les cas des critères.
- À ne pas toucher : tout `tv/app/` ; `tests/helpers/fake-dom.cjs` ; les autres fichiers de tests.
- `tv/app/connection.js` n'est jamais lu, ni même ouvert : le harnais l'écarte par son nom avant toute
  lecture. Le harnais ne passe par aucun réseau et ne laisse aucune minuterie active.
- Aucune assertion ne porte sur le texte d'un script : `index.html` sert seulement d'entrée pour construire la
  page. L'analyse de `index.html` tolère des attributs répartis sur plusieurs lignes (la mise en forme du lot
  L03 peut les déplacer).
- Aucune ligne de plus de 160 caractères dans les fichiers créés.

## Critères d'acceptation

1. `tests/tv-remote-navigation.test.cjs` passe sur le code de `0d5a954` sans modification de production et
   fixe, pour le panneau non appairé :
   - démarrage : focus sur `dictate`, `connection` vaut « Appairage requis sur cet appareil. », `send`
     désactivé, `document.body.dataset.mode` vaut `chat`, `capture-state` vaut « Appairage requis pour la
     capture. » ;
   - colonne, avec `send`, `capture` et `transcription-language` activés par le test et `cancel-question`
     caché : `dictate` → donne `send`, `send` ← donne `dictate`, `send` ↑ et `dictate` ← et `dictate` ↑ donnent
     `conversation`, `dictate` ↓ donne `capture`, `capture` ↓ ou → donne `transcription-language`,
     `transcription-language` → reste, ↑ donne `capture`, `capture` ↑ donne `dictate` ; `conversation` ↑ donne
     `show-timeline`, `show-timeline` → donne `show-surveillance`, `show-surveillance` ← donne `show-timeline`,
     ↓ depuis l'un ou l'autre donne `conversation`, `conversation` ↓ ou → donne `dictate` ;
   - `cancel-question` visible : `dictate` ↓ le donne, puis ↓ donne `capture`, → reste, ↑ donne `dictate`, et
     `capture` ↑ revient sur lui ; `clear-moment` ↓ donne `dictate`, ↑ donne `conversation` ;
   - cible désactivée : au démarrage, `dictate` → et `dictate` ↓ laissent le focus sur `dictate` ;
   - lecture : focus sur `conversation` affiche « OK · lire les messages » ; OK y passe
     `dataset.reading` à `"true"` et affiche « Haut / Bas · lire — Retour · actions » ; ↓ puis ↑ défilent de
     180 ; Retour revient sur `dictate`, `reading` à `"false"`, « Retour · fermer » ;
   - question : ↑ ou ↓ clavier caché ramène sur `dictate` ; après `keyboardStateChange` avec
     `detail.visibility` vrai, ↓ reste sur `question` sans `preventDefault` ; Retour (code 461 ou nom
     `Escape`) ramène sur `dictate` et remet le clavier à « caché » ;
   - Retour ailleurs que dans la conversation ou la question appelle `window.close` ;
   - dialogue ouvert (`end-session-dialog`) : → et ← parcourent ses boutons en boucle, un bouton désactivé est
     sauté, un focus hors des boutons revient au premier, Retour clique le bouton `data-cancel` sans fermer la
     fenêtre ;
   - `mousedown` sur `body` : `preventDefault` appelé si l'élément actif n'est pas un champ de saisie, pas
     appelé quand `question` a le focus.
2. Faute injectée puis défaite : la cible de `show-timeline` → remplacée par `conversation` dans
   `tv/app/companion.js` fait échouer au moins un test, sortie au journal ; la faute est défaite à la main et
   le test relancé passe, sortie au journal.
3. `grep -n "connection.js" tests/helpers/tv-page.cjs` montre que le nom n'apparaît que dans le filtre qui
   l'écarte.
4. `node --test tests/tv-remote-navigation.test.cjs` se termine seul (aucune minuterie ni écouteur réseau
   laissé), durée au journal.
5. `node scripts/check.mjs` est vert ; la mesure `cas_de_test` augmente.

## Test d'acceptation attendu

`tests/tv-remote-navigation.test.cjs`, à la frontière « touche appuyée sur la page » : le test charge la page
par `tests/helpers/tv-page.cjs`, envoie des événements `keydown`, `keyboardStateChange` ou `mousedown` au
faux document, et lit l'élément actif, les textes et les appels enregistrés. Il n'appelle aucune fonction
interne de `companion.js`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un cas des critères ne correspond pas au comportement observé sur
`0d5a954`, le test fixe le comportement observé et l'écart est noté au journal ; si un script de
`index.html` ne peut pas se charger sans modifier la production : verdict BLOQUÉ, avec l'erreur constatée.

## Journal

- **Exploration** (explorateur, lecture seule ; rapport dans `.harness-state/tickets/T130/exploration.md`) :
  - T157 est terminé, `bloque_par` levé ; `tv/app` inchangé depuis `0d5a954` ; `tests/helpers/fake-dom.cjs` absent.
  - Les 7 scripts (hors fichier d'appairage) se chargent dans un contexte `vm` sans modifier la production ; sans
    appairage ni minuterie, ni requête, ni écouteur réseau (retours à `capture-control.js:22` et `companion.js:571`).
  - Aucun écart entre les critères et le comportement observé ; précisions : ↑/↓ naviguent aussi dans un dialogue,
    `capture` ← donne `transcription-language`, la branche `selectedMoment` est inatteignable sans appairage.
  - Piège : `index.html` a des balises et attributs sur plusieurs lignes (`</button\n ><button`), analyse sur la
    chaîne entière ; `window` doit être le global du contexte, sans `module`/`require`.
  - Mutation du critère 2 : `companion.js:539`, cible → de `show-timeline`.
- **Implémentation** (implémenteur) : `tests/helpers/tv-page.cjs` et `tests/tv-remote-navigation.test.cjs` créés ;
  `tv/app/` et `tests/helpers/fake-dom.cjs` non touchés. Le faux ne modélise pas `focus()` ignoré sur un bouton
  désactivé, pour que la garde `!target.disabled` de la production reste observable.
  - `node --test tests/tv-remote-navigation.test.cjs` : 20 tests, 20 verts, 0 échec, `duration_ms` 49,99 ; le processus
    se termine seul (le contexte `vm` ne reçoit que des espions de minuterie et de requête, comptés à zéro sans
    appairage). Critère 4.
  - `grep -n "connection.js" tests/helpers/tv-page.cjs` : une seule ligne, 136, le filtre. Critère 3.
  - Lignes de plus de 160 caractères dans les deux fichiers : aucune.
  - Aucun écart de comportement avec les cas du critère 1. Cas ajoutés hors critères, observés : `capture` ←,
    `conversation` →, `cancel-question` →, `mousedown` sur `documentElement` et sur un contrôle.
- **Critère 2, mutation** : `companion.js:539`, cible → de `show-timeline` remplacée par `el("conversation")` :
  `node --test` rouge, 19 verts et 1 échec, « the header buttons lead to each other and down to the conversation »,
  `AssertionError: show-timeline right` (actual `'conversation'`, expected `'show-surveillance'`). Faute défaite à la
  main : `git diff --stat -- tv/app` vide, `node --test` de nouveau 20 sur 20 verts.
- **Relecture 1** (relecteur neuf) : à corriger, 0 bloquant, 1 mineur : ternaire imbriqué à `tv-page.cjs:28`
  (standards : pas de ternaires imbriqués). Critères 1 à 4 vérifiés contre le code, aucun écart. Corrigé par
  `match[2] ?? match[3] ?? match[4]` ; `node --test` 20 sur 20 verts, `check.mjs --changed` vert.
- **Relecture 2** (relecteur neuf, `revue-2`) : accepté, 0 bloquant, 0 mineur, 0 hors périmètre.
- **Contrôle complet** : `node scripts/check.mjs` vert en 131 s (règles, cliquet `cas_de_test` 751 → 771, 814 tests
  JS dans 83 fichiers, 84 tests Python dont 1 ignoré ; format et lint non lancés, outils non installés).

### Réserves à la clôture

- Le faux laisse volontairement focus() atteindre un bouton désactivé (un navigateur l'ignorerait) pour que la garde !target.disabled de companion.js reste observable.
- Sans appairage, la branche selectedMoment (↑ depuis dictate/send vers clear-moment) est inatteignable : non couverte par ce harnais.
- Format et lint non lancés : Prettier et ESLint ne sont pas installés.
