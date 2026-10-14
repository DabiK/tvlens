---
id: T101
titre: Remove unreachable TV panel code and let test fixtures escape the webm ignore
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

L'app de la TV porte deux morceaux de code qui ne s'exécutent jamais.

- Dans la vue chronologique, une branche gère le dialogue de fin de session. Elle ne peut pas être atteinte,
  parce que l'écouteur du panneau donne d'abord la touche au gestionnaire commun des dialogues, qui la garde
  pour lui.
- `surveillance-overlay.js` crée cinq variables globales que plus aucune page ne lit.

Le dépôt a aussi deux pièges discrets.

- La règle `*.webm` de `.gitignore` masque toute nouvelle fixture `.webm` déposée dans `tests/fixtures/`.
  Les trois fixtures existantes ne sont suivies que parce qu'elles ont été ajoutées de force.
- Deux interfaces ne disent pas pourquoi elles existent : la liste `KEPT` du contrat IPC du Mac, dont le
  commentaire parle d'une « mission » passée, et le crochet d'observation `window.tvlensPanel`, que le smoke
  lit sans dire ce qu'il est.

Après ce ticket, le code mort est retiré, une fixture `.webm` nouvelle n'est plus ignorée, et les deux
commentaires décrivent le comportement et non l'historique.

## Sources

- Constats : TV-07, TSTC-20
- Code vérifié à la version `0d5a954` :
  - `tv/app/companion.js` :
    - `dialogKeys` lignes 457-481 : dès qu'un `dialog[open]` existe, la fonction traite Retour et les
      flèches, puis rend `true` pour toute touche ;
    - écouteur `keydown` ligne 482 : `if (dialogKeys(event)) return;` ligne 483, avant
      `timeline.handleKey(event)` ligne 485.
  - `tv/app/timeline-view.js`, `TimelineView.prototype.handleKey` ligne 393 :
    - branche `if (el("end-session-dialog").open) {…return true;}` lignes 399-411, que l'ordre ci-dessus rend
      inatteignable ;
    - `git grep -n "handleKey"` ne trouve aucun autre appelant que `companion.js:484-486`.
  - `tv/app/index.html:163-171` : le dialogue porte `end-cancel` (`data-cancel`) et `end-confirm`, que
    `dialogKeys` sait déjà parcourir. Aucun test ne pilote ce dialogue ; seul `scripts/smoke-tv-timeline.mjs`
    le fait, lignes 269-278.
  - `tv/app/surveillance-overlay.js` :
    - ligne 494, commentaire « The names the pages use, as globals of a classic script. » ;
    - lignes 495-499, `var OverlayQueue = TVLensOverlay.OverlayQueue, describeCard, describeActivity,
      parseAmbientParams, renderCard` ;
    - ligne 500, `module.exports`, gardé.
    Une recherche des cinq noms sans préfixe dans `tv/app/*.js`, `tv/app/*.html` et `scripts/` ne trouve que
    le commentaire de `surveillance-view.js:565-566`. Les pages passent toutes par `TVLensOverlay.` ou par
    l'objet exporté (`ambient.js:38`, `:101`, `surveillance-view.js:580-584`, `package-tv-ambient.mjs:167`).
  - `.gitignore:15` : `*.webm`. Trois fixtures suivies malgré elles : `tests/fixtures/chromium-webm-head.webm`,
    `chromium-webm-no-frame.webm`, `ffmpeg-webm-head.webm`.
  - `tests/mac-ipc-contract.test.cjs:38` : « What the bridge already offered before the mission and still
    offers. » au-dessus de `KEPT`, lignes 39-42.
  - `tv/app/companion.js:1253` documente déjà `window.tvlensPanel` côté panneau.
    `scripts/smoke-tv-overlay.mjs:241` le lit sans commentaire.

## Périmètre

À modifier :

- `tv/app/timeline-view.js`, dans `TimelineView.prototype.handleKey` : supprimer la branche
  `if (el("end-session-dialog").open) {…}` (lignes 399-411 à la version citée). La variable `active`
  déclarée juste avant reste : la suite de la fonction la lit.
- `tv/app/surveillance-overlay.js` : supprimer le commentaire « The names the pages use… » et la
  déclaration `var OverlayQueue = …, renderCard` qui le suit (lignes 494-499 à la version citée).
  `module.exports` reste.
- `.gitignore` : ajouter `!tests/fixtures/*.webm` juste après `*.webm`.
- `tests/mac-ipc-contract.test.cjs`, le commentaire au-dessus de `KEPT` : il dit ce qu'est `KEPT`, à savoir
  les canaux que le pont doit continuer d'offrir et qui font la référence du contrat. La liste ne change pas.
- `scripts/smoke-tv-overlay.mjs`, au premier `tools.until(() => window.tvlensPanel …)` : un commentaire qui
  dit que `window.tvlensPanel` est l'interface d'observation du panneau, documentée dans
  `tv/app/companion.js` juste au-dessus de son affectation. Le code ne change pas.

À ne pas toucher :

- `tv/app/companion.js` et `dialogKeys`.
- La liste de fichiers du test « no duration literal is left in the panel… » de `tests/tv-panel.test.cjs` :
  un autre lot la remplace (lot:L02).
- Les fixtures `.webm` elles-mêmes.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "end-session-dialog" tv/app/timeline-view.js` ne rend rien.
2. `grep -nE "^var (OverlayQueue|describeCard)|as globals of a classic script" tv/app/surveillance-overlay.js`
   ne rend rien.
3. `git check-ignore -q tests/fixtures/nouvelle-fixture.webm` sort avec le code 1 (le nom n'est pas ignoré),
   alors que `git check-ignore -q enregistrement.webm` sort avec le code 0 (la règle s'applique toujours
   ailleurs). Aucun fichier n'est créé pour cette vérification.
4. `grep -n "before the mission" tests/mac-ipc-contract.test.cjs` ne rend rien. Le commentaire « Section 5.2
   of the mission contract », plus haut dans le fichier, n'est pas dans le périmètre.
5. `node --test tests/tv-panel.test.cjs tests/tv-overlay-queue.test.cjs tests/tv-ambient-params.test.cjs
   tests/tv-app-compat.test.cjs tests/chat-error-ui.test.cjs tests/mac-ipc-contract.test.cjs` passe, sans
   qu'une ligne de ces fichiers ait changé, hormis le commentaire du critère 4.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants du panneau et de la couche d'overlay, inchangés. Frontière : les modules `tv/app` chargés
par `require`, comme aujourd'hui. Aucun test nouveau : on retire du code inatteignable, et le
`git check-ignore` du critère 3 prouve la règle `.gitignore`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le parcours réel du dialogue de fin de session sur l'écran n'est prouvé que
par `scripts/smoke-tv-timeline.mjs`, qui lance un navigateur : la session ne le lance pas, et le journal le
dit comme non vérifié. Si un lecteur des globales retirées apparaît (une page, un script, un test) : verdict
BLOQUÉ, avec le lecteur.

## Journal
