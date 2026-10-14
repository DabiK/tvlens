---
id: T130
titre: Pin the remote walk of the TV chat column in a page harness without a browser
statut: a-faire
bloque_par: T152
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
