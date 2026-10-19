---
id: T091
titre: Require every element id looked up by a TV script to exist in its page
statut: a-faire
bloque_par: T294
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les scripts de `tv/app` cherchent leurs éléments par identifiant. Un identifiant renommé ou retiré dans la
page casse l'écran de la TV. Seul un parcours du banc appairé qui passe par cet élément échoue, alors que
l'application Mac a déjà une garde statique.

Après ce ticket, un test statique exige que chaque identifiant cherché littéralement par un script TV existe
dans la page qui charge ce script, et que les identifiants de chaque page soient uniques.

## Sources

- Constats : OUBLI-45
- Code vérifié à la version `1178657` (nom d'abord, la ligne suit et bougera au formatage) :
  - `tv/app/index.html` : 94 identifiants, tous uniques ; scripts chargés par des balises `<script src>`
    lignes 192-203 (`connection.js`, `remote-client.js`, `surveillance-overlay.js`, `text.js`, `chat-model.js`,
    `poll-controller.js`, `chat-view.js`, `surveillance-view.js`, `sessions-view.js`, `capture-control.js`,
    `timeline-view.js`, `companion.js`). C'est la seule page de `tv/app` : `ambient.html` et `ambient.js` ont été
    retirés avec l'affichage ambient (ADR 0017).
  - `tv/app/connection.js` est chargé par `index.html` mais n'existe pas dans le dépôt : c'est le secret
    d'appairage installé localement, ignoré par Git (`.gitignore`, ligne 30). `tests/tv-app-compat.test.cjs`
    l'écarte déjà de sa lecture (commentaire ligne 11, filtre ligne 12).
  - Recherches par identifiant : fonction locale `el` définie dans `tv/app/capture-control.js` (ligne 7),
    `companion.js` (ligne 37), `sessions-view.js` (ligne 366), `surveillance-view.js` (ligne 447),
    `timeline-view.js` (ligne 3) ; `chat-view.js` reçoit l'`el` du companion (`elements: el`, `companion.js:634`)
    et l'appelle `context.el("…")` (`chat-view.js:222`). Aucun appel littéral `getElementById("…")` ne reste.
    Mesure : 277 appels littéraux `el("…")` (capture-control 11, chat-view 20, companion 91, sessions-view 40,
    surveillance-view 58, timeline-view 57), commentaires non retirés ; aucun identifiant manquant à `1178657`.
    Commande :
    `node -e 'for (const f of ["capture-control","chat-view","companion","sessions-view","surveillance-view","timeline-view"]) console.log(f, (require("fs").readFileSync("tv/app/"+f+".js","utf8").match(/\bel\(\s*["\x27][^"\x27]+["\x27]\s*\)|getElementById\(\s*["\x27][^"\x27]+["\x27]\s*\)/g)||[]).length)'`
  - Modèle de garde : `tests/mac-ui.test.cjs`, test « the renderer parses, imports only what its modules
    export, and finds every element it asks for » (ligne 1606), lignes 1620-1624 ; relevé par `elementPatterns`
    et `scanned` (lignes 1537-1552), qui refuse un relevé vide en nommant le fichier.
  - Garde statique existante pour la TV : `tests/tv-app-compat.test.cjs` (tests lignes 45, 56, 67) ; le test
    ligne 56 éprouve la garde sur des textes construits par le test.
- Voisins : `tests/helpers/tv-document.cjs`, `readPage` (lignes 196-217), lit `tv/app/index.html` et rend les
  scripts de ses balises `<script src>`, hors `connection.js` ; il ne lit que cette page.
  `tests/helpers/source-shape.cjs` compare la forme de deux textes et ne relève pas d'appels. Si une aide sait
  déjà relever les scripts ou les identifiants d'une page, la session la réutilise plutôt que d'écrire une
  seconde expression.

## Périmètre

- À modifier : `tests/tv-app-compat.test.cjs` — un test de la garde des identifiants, et un test qui prouve
  que la garde refuse un identifiant absent (sur un texte construit par le test, comme le test ligne 56).
- À ne pas toucher : le code de production (`tv/app/`, les pages HTML) ; les tests existants du fichier.
- Hors de la garde, à dire dans un commentaire du test : les recherches d'identifiant non littérales
  (identifiant calculé), et `connection.js`, absent du dépôt par conception. Tout autre script chargé par une
  page et absent du disque fait échouer le test en le nommant.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/tv-app-compat.test.cjs` passe. Le nouveau test lit les scripts chargés par chaque page
   `.html` de `tv/app` (`index.html` seule à `1178657`) depuis ses balises `<script src>`, pas depuis une liste
   écrite à la main ; il relève les identifiants cherchés littéralement par `el("…")` et `getElementById("…")`,
   et exige que chacun existe dans la page qui charge le script. Il exige aussi que les identifiants de chaque
   page soient uniques, et que le nombre d'appels vérifiés soit au moins 277.
2. Le test de la garde elle-même montre qu'un script qui cherche `el("absent")` contre une page sans cet
   identifiant est refusé, avec un message qui nomme le fichier et l'identifiant, et qu'une page qui porte deux
   fois le même identifiant est refusée.
3. Preuve que la garde protège, à consigner au journal avec commande et sortie : en renommant
   provisoirement un identifiant cherché dans `tv/app/index.html`, le test échoue en le nommant. Le renommage
   est retiré avant la fin de la session.
4. Les tests qui existaient dans `tests/tv-app-compat.test.cjs` gardent leur titre et leurs assertions.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les deux tests ajoutés à `tests/tv-app-compat.test.cjs`. Frontière : le texte des pages et des scripts de
`tv/app`, lu sur le disque.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si une page charge un script par un autre moyen qu'une balise `<script src>`,
la session le note au journal et l'ajoute à la garde sans liste écrite à la main. Si un identifiant cherché
manque déjà dans sa page quand la session commence : le test n'est pas ajusté pour passer ; verdict BLOQUÉ
avec le script et l'identifiant, car corriger la page ou le script est une décision du propriétaire.

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à jour à
  `1178657` ; bloqueurs revus : T145 retiré (file rouverte) ; T028 retiré (reformatage Prettier jamais lancé, encore
  à faire : ce ticket n'a pas besoin de son code) ; T294 ajouté (passe après la file en cours). `ambient.html` et
  `ambient.js` sont retirés : `index.html` est la seule page, elle charge douze scripts dont `chat-model.js`,
  `poll-controller.js` et `chat-view.js`, nouveaux. Le plancher du critère 1 suit la mesure de `1178657` : 277
  appels, contre 281 à `0d5a954` (280 `el` et le `getElementById` d'`ambient.js`), sans changer ce qu'il garde.
  Aucun identifiant ne manque à cette version.
