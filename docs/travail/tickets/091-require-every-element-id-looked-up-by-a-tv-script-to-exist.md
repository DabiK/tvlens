---
id: T091
titre: Require every element id looked up by a TV script to exist in its page
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les scripts de `tv/app` cherchent leurs éléments par identifiant. Un identifiant renommé ou retiré dans la
page casse l'écran de la TV sans qu'aucun test échoue, alors que l'application Mac a déjà cette garde.

Après ce ticket, un test statique exige que chaque identifiant cherché littéralement par un script TV existe
dans la page qui charge ce script, et que les identifiants de chaque page soient uniques.

## Sources

- Constats : OUBLI-45
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `tv/app/index.html` : 93 identifiants, tous uniques ; scripts chargés par des balises `<script src>`
    lignes 191-198 (`connection.js`, `remote-client.js`, `surveillance-overlay.js`, `surveillance-view.js`,
    `sessions-view.js`, `capture-control.js`, `timeline-view.js`, `companion.js`). `tv/app/ambient.html`
    charge `surveillance-overlay.js` et `ambient.js` (lignes 10-11) et porte `id="ambient"`.
  - `tv/app/connection.js` est chargé par `index.html` mais n'existe pas dans le dépôt : c'est le secret
    d'appairage installé localement, ignoré par Git (`.gitignore`, ligne 26). `tests/tv-app-compat.test.cjs`
    l'écarte déjà de sa lecture (commentaire ligne 12, filtre ligne 13).
  - Recherches par identifiant : fonction locale `el` définie dans `tv/app/capture-control.js` (ligne 7),
    `companion.js` (ligne 380), `sessions-view.js` (ligne 373), `surveillance-view.js` (ligne 549),
    `timeline-view.js` (ligne 3) ; `doc.getElementById("ambient")` dans `tv/app/ambient.js` (ligne 13).
    Mesure : 280 appels littéraux `el("…")` et 1 appel `getElementById("…")`, commentaires non retirés ;
    aucun identifiant manquant à `0d5a954`. Commande :
    `node -e 'for (const f of ["capture-control","companion","sessions-view","surveillance-view","timeline-view","ambient"]) console.log(f, (require("fs").readFileSync("tv/app/"+f+".js","utf8").match(/\bel\(\s*["\x27][^"\x27]+["\x27]\s*\)|getElementById\(\s*["\x27][^"\x27]+["\x27]\s*\)/g)||[]).length)'`
  - Modèle de garde : `tests/mac-ui.test.cjs`, test « the renderer parses, imports only what its modules
    export, and finds every element it asks for » (ligne 664), lignes 676-680.
  - Garde statique existante pour la TV : `tests/tv-app-compat.test.cjs` (tests lignes 48, 58, 69, 77, 102) ;
    le test ligne 58 éprouve la garde sur des textes construits par le test.
- Voisins : le lot L02 introduit `tests/helpers/source-shape.cjs` et touche `tests/tv-app-compat.test.cjs` ;
  si l'aide sait déjà relever des appels dans un texte source, la session la réutilise plutôt que d'écrire
  une seconde expression.

## Périmètre

- À modifier : `tests/tv-app-compat.test.cjs` — un test de la garde des identifiants, et un test qui prouve
  que la garde refuse un identifiant absent (sur un texte construit par le test, comme le test ligne 58).
- À ne pas toucher : le code de production (`tv/app/`, les pages HTML) ; les tests existants du fichier.
- Hors de la garde, à dire dans un commentaire du test : les recherches d'identifiant non littérales
  (identifiant calculé), et `connection.js`, absent du dépôt par conception. Tout autre script chargé par une
  page et absent du disque fait échouer le test en le nommant.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/tv-app-compat.test.cjs` passe. Le nouveau test lit les scripts chargés par chaque page
   (`index.html`, `ambient.html`) depuis ses balises `<script src>`, pas depuis une liste écrite à la main ;
   il relève les identifiants cherchés littéralement par `el("…")` et `getElementById("…")`, et exige que
   chacun existe dans la page qui charge le script. Il exige aussi que les identifiants de chaque page soient
   uniques, et que le nombre d'appels vérifiés soit au moins 281.
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
