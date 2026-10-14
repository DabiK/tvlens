---
id: T093
titre: Test the DOM builders of the Mac panels on the shared fake document
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les fonctions qui construisent le DOM des panneaux Mac (sessions, cartes et historique de la surveillance,
questions et vérifications) ne sont couvertes que par une lecture de leur texte source et par la fumée
Electron, qui ne tourne pas dans la boucle. Un refactor du rendu peut perdre un bouton, un attribut
`data-action` ou un texte sans qu'un test échoue.

Après ce ticket, ces constructeurs sont appelés pour de vrai, sur le faux document partagé par les tests, avec
des entrées produites par les vrais modèles de vue ; les tests exigent les nœuds, classes, textes et actions
que l'utilisateur voit et déclenche.

## Sources

- Constats : UI-07
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `app/ui/format.js` : `element(tag, className, text)` (ligne 4, utilise `document.createElement`),
    `action(className, text, name, data)` (ligne 17), `keepOpen(previous, next)` (ligne 26, utilise
    `querySelectorAll('details[open][data-key]')` et `matches`).
  - `app/ui/sessions-dom.js` : `sessionEntry(row)` (ligne 4) — boutons `session-resume`, `session-open`,
    `session-delete`, désactivés selon `canOpen` et `canDelete`, avec leur raison en `title`.
  - `app/ui/surveillance-dom.js` : `cardNode(card, { compact })` (ligne 20), `cardEntry` (ligne 47),
    `historyEntry` (ligne 52, `document.createTextNode` ligne 64, `childElementCount`), `filterEntry`
    (ligne 76), `gapEntry` (ligne 84, `document.createTextNode` ligne 87).
  - `app/ui/job-card.js` : `passageButton` (ligne 21, `document.createTextNode` ligne 27), `jobBlocks`
    (ligne 34), `jobEntry(job, context)` (ligne 176, réutilise le nœud précédent et une `KeyedList` de
    `app/ui/list-view.mjs`, qui demande `children`, `insertBefore`, `replaceChild`, `removeChild`),
    `verificationEntry` (ligne 196), `pendingEntry` (ligne 227).
  - Chargement sous Node : un `node -e` ponctuel a montré à `0d5a954` que `import('./app/ui/<nom>.js')` charge
    `format`, `sessions-dom`, `surveillance-dom`, `job-card`, `shell`, `recap-view` et `icons` sous Node
    v24.12.0 (avertissement `MODULE_TYPELESS_PACKAGE_JSON`, sans erreur).
  - Seul `tests/mac-ui.test.cjs` cite ces fichiers, et toujours comme texte lu sur le disque : `job-card.js`
    ligne 137, le test ligne 664 (garde des identifiants et des imports du rendu), `surveillance-dom.js`
    ligne 707, `job-card.js` lignes 716 et 724. Aucun test n'appelle ces constructeurs.
- Aide partagée livrée par le lot L05 : `tests/helpers/fake-dom.cjs` (`fakeDocument()`, `installDocument(t)`),
  testée par `tests/fake-dom.test.cjs`, sans sélecteurs par conception. Il lui manque aujourd'hui, pour ces
  constructeurs, `createTextNode`, `insertBefore`, `replaceChild` et `childElementCount`.

## Périmètre

- À modifier : `tests/helpers/fake-dom.cjs` (ajout de `createTextNode` au document, de `insertBefore`,
  `replaceChild` et `childElementCount` aux nœuds ; rien n'est retiré, toujours aucun sélecteur) et
  `tests/fake-dom.test.cjs` (un test par ajout).
- À créer : `tests/mac-panel-dom.test.cjs`.
- Entrées des constructeurs : produites par les modèles de vue réels de `app/ui/` (`sessions-view.mjs`,
  `surveillance-view.mjs`, `job-view.mjs`) à partir de données de la même forme que celles de
  `tests/mac-ui.test.cjs`, jamais des objets de vue écrits à la main quand un modèle les fabrique.
- Hors du ticket, à dire dans un commentaire d'en-tête du test : `app/ui/shell.js` (il demande `closest`,
  `querySelector`, `classList` et des événements) et le report de l'état ouvert par `keepOpen` (il demande des
  sélecteurs). Ils restent couverts par la fumée Electron, lancée hors de la boucle.
- À ne pas toucher : `app/`, tout le code de production ; `tests/mac-ui.test.cjs`. Aucune dépendance
  installée : une bibliothèque de DOM serait une décision du propriétaire, pas de ce ticket.
- Textes attendus : ceux que les constructeurs produisent aujourd'hui, figés en littéraux. Aucun texte n'est
  déplacé ni reformulé.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/fake-dom.test.cjs` passe, et chaque ajout au faux document a son test : un nœud texte
   porte son texte, reste lisible à sa place parmi les nœuds de son parent, et n'est pas compté par
   `childElementCount`, comme dans un vrai DOM ; `insertBefore` place un nœud avant la référence et l'ajoute
   en fin quand la référence est nulle ; `replaceChild` remplace en place ; `childElementCount` suit les
   ajouts et retraits d'éléments. Si la forme partagée ne distingue pas encore éléments et nœuds texte, la
   distinction est ajoutée sans changer ce que les tests existants du faux document exigent. `grep -n "require(" tests/helpers/fake-dom.cjs`
   ne sort toujours rien.
2. `node --test tests/mac-panel-dom.test.cjs` passe, avec au moins un `test(` pour chacun de :
   - `sessionEntry` : session courante (pas de bouton d'ouverture), session ouvrable, session dont
     l'ouverture et la suppression sont bloquées (boutons désactivés, raison en `title`), session à reprendre ;
     chaque bouton porte l'action et l'identifiant attendus ;
   - `cardNode` en mode compact et complet : bouton de fermeture seulement en compact, deux origines au plus
     en compact, `data-kind` distinct pour une vérification et un signal, aucune zone de sources sur un
     signal ;
   - `historyEntry`, `filterEntry`, `gapEntry` : textes et actions des lignes d'historique, d'un filtre et
     d'un trou de capture ;
   - `jobEntry` : une question en cours, une réponse avec passages cités (boutons de relecture avec leur
     instant), puis la même entrée rendue une seconde fois à partir du nœud précédent sans doubler ses
     blocs ; `verificationEntry` et `pendingEntry`.
3. Aucun test de `tests/mac-panel-dom.test.cjs` n'appelle `shell.js` ni n'exige le report de l'état ouvert :
   `grep -n "shell\|keepOpen" tests/mac-panel-dom.test.cjs` ne rend que le commentaire d'en-tête.
4. Preuve que les tests protègent, au journal avec commande et sortie : en remplaçant provisoirement
   `'session-delete'` par `'session-remove'` dans `app/ui/sessions-dom.js`, un test échoue en le nommant. Le
   remplacement est retiré avant la fin de la session.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/mac-panel-dom.test.cjs`, neuf, et les tests ajoutés à `tests/fake-dom.test.cjs`. Frontière : les
fonctions exportées des modules de `app/ui/`, appelées sur `globalThis.document` posé par
`installDocument(t)`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un constructeur demande une capacité du DOM qui n'est pas listée ici et qui
suppose des sélecteurs ou des événements : ce constructeur est sorti du ticket, nommé au journal et laissé à
la fumée Electron ; le ticket n'installe aucune bibliothèque. Si `tests/helpers/fake-dom.cjs` n'existe pas
quand la session commence : verdict BLOQUÉ, le lot L05 n'est pas intégré.

## Journal
