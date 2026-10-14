---
id: T043
titre: Name the surveillance registry version and report an unknown one when reopened
statut: a-faire
bloque_par: T037, T038
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le registre de surveillance porte une version, écrite `1` à trois endroits sans constante. À
l'activation, un registre d'une autre version est dit illisible et son fichier est protégé. À la
réouverture d'une archive, le même registre est vidé sans rien dire, et l'état publié annonce
`status: 'ready'` : l'archive s'affiche sans surveillance et sans message. Le Mac vérifie que le
registre est bien celui de la session, le serveur non. Après ce ticket, la version a un nom unique, le
contrôle d'identité vit dans le runtime partagé, et un registre refusé à la réouverture est dit
illisible, avec le message qui existe déjà, sans que son fichier change.

## Sources

- Constats : GAP2-04
- Code vérifié à la version `0d5a954` :
  - `core/surveillance.cjs`, classe `Surveillance` ligne 362 : `restore(saved)` ligne 518, avec
    `saved.version === 1 && typeof saved.sessionId === 'string'` ligne 521 — sinon le registre est vidé
    sans exception ; `snapshot`, `version: 1` ligne 885.
  - `runtime/surveillance-runtime.cjs`, `createSurveillanceRuntime` ligne 43 : `REGISTRY_MESSAGES`
    lignes 18-26 (message `unreadable`) ; `registry()` lignes 106-130 — `const id =
    surveillance.sessionId` ligne 107, et `!id` rend `ready` : après un refus l'identifiant est nul,
    donc le statut ne peut rien dire ; `unbind()` lignes 281-288 remet `unreadable` à zéro ;
    `unread(pending, error)` lignes 294-304 ; `restorable` ligne 320 (vrai dès que le cœur ne lève pas) ;
    `answered`, `saved.version === 1 && saved.sessionId === pending.id` lignes 345-346 ; méthode
    `restore(saved)` lignes 502-513.
  - `runtime/headless-runtime.cjs`, `open(id)` : `this.surveillance.restore(archive.surveillance)`
    ligne 1012, sans contrôle d'identité.
  - `app/main.cjs` : `surveillance.restore(archive.surveillance?.sessionId === id ?
    archive.surveillance : null)` ligne 447.
  - `tv/app/companion.js` ligne 320 et `tv/app/surveillance-overlay.js` ligne 281 : la TV ne lit de
    `registry` que `ready === false`.
  - `tests/surveillance-runtime.test.cjs` (14 tests) : lignes 250-275 (registre illisible, étranger ou
    non restaurable à l'activation) ; lignes 537-546 (registre remis par l'hôte, non restaurable en
    entier : rien n'est tenu, `persistence.failures` vaut 1, l'activation suivante le dit illisible et
    le fichier ne change pas). Ces assertions restent vraies. Les appels `restore(…)` des lignes 245 et
    541 ne passent qu'un argument.
- Livré par T037 : `tests/archive-compat.test.cjs`, qui rouvre par `HeadlessRuntime.open` une archive
  figée dont le registre porte la version 1 et exige qu'il soit dit `ready`. Livré par T038 :
  `tests/helpers/wire-host.cjs` et `tests/wire-contract.test.cjs`.

## Périmètre

À modifier :

- `core/surveillance.cjs` : `REGISTRY_VERSION`, exporté, utilisé à l'écriture et à la lecture.
- `runtime/surveillance-runtime.cjs` : la constante remplace le littéral de `answered`. La méthode
  `restore(saved, sessionId)` reçoit l'identifiant de la session rouverte. Sans second argument, aucun
  contrôle d'identité n'est fait : les appels à un argument gardent leur comportement. Un registre non
  nul qu'elle refuse — version inconnue, autre session, ou non restaurable en entier — n'est pas tenu,
  même en partie, compte une lecture en échec (`persistence.failures`, comme le fait déjà le cas non
  restaurable), et l'état rendu dit `registry.status: 'unreadable'` avec le message existant de
  `REGISTRY_MESSAGES`, jusqu'à ce que la session soit remplacée ou qu'une activation relise le dossier.
  Pour le dire, `registry()` ne dépend plus de `surveillance.sessionId`, nul après un refus. Un registre
  nul reste un registre absent : rien n'est dit illisible.
- `runtime/headless-runtime.cjs` (`open`) et `app/main.cjs` (ligne 447) : passent l'identifiant et
  laissent le contrôle d'identité au runtime.
- `tests/surveillance-runtime.test.cjs` : un test ajouté. `tests/wire-contract.test.cjs` : un cas ajouté.

À ne pas toucher :

- Le format du registre et sa version : elle reste 1. Aucune valeur nouvelle de `registry.status`,
  aucun champ nouveau, aucun message nouveau.
- Le chemin d'activation (`answered`, `unread`) hors le remplacement du littéral.
- Les tests existants : aucune assertion n'est retirée ni assouplie.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "version === 1\|version: 1" core/surveillance.cjs runtime/surveillance-runtime.cjs` ne rend
   rien : les trois endroits lisent `REGISTRY_VERSION`.
2. Un test ajouté à `tests/surveillance-runtime.test.cjs` prouve, par le runtime de surveillance :
   - un registre de version 2 remis à la réouverture n'est pas tenu (aucune affirmation), l'état dit
     `registry.status: 'unreadable'`, `registry.persisted: false`, `registry.ready: true` et le message
     existant ; `persistence.failures` vaut 1 ; rien n'est écrit dans le dossier ;
   - un registre de version 1 d'une autre session, remis avec l'identifiant de la session rouverte, est
     traité de même ;
   - un registre nul donne l'état d'aujourd'hui, sans message ;
   - après le refus, une activation relit le dossier, dit le registre illisible et laisse le fichier
     identique octet pour octet ;
   - une session ouverte ensuite avec un registre lisible ne garde rien du refus précédent.
3. Un cas ajouté à `tests/wire-contract.test.cjs` prouve, par HTTP : une archive dont
   `surveillance.json` porte la version 2 est rouverte par le serveur, le vrai `RemoteClient` reçoit
   l'état, `mergeState` l'accepte, et le panneau ne se croit pas en restauration (`registry.ready` n'est
   pas faux).
4. `node --test tests/surveillance-runtime.test.cjs tests/surveillance.test.cjs tests/mac-ui.test.cjs`
   passe ; dans ces fichiers, aucune ligne existante n'a changé, hors l'ajout du test.
5. `node --test tests/archive-compat.test.cjs` passe sans qu'une ligne de ce fichier ni de la génération
   figée ait changé : un registre de version 1 de la bonne session se rouvre comme avant.
6. `grep -n "sessionId === id ? archive.surveillance" app/main.cjs` ne rend rien, et
   `grep -n "surveillance.restore(" app/main.cjs runtime/headless-runtime.cjs` montre l'identifiant de la
   session passé en second argument aux deux appels de réouverture. Aucun test ne charge `app/main.cjs` :
   cet appel n'est constaté que par ces commandes.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un test ajouté à `tests/surveillance-runtime.test.cjs`. Frontière : `createSurveillanceRuntime`
(`restore`, `snapshot`, `start`, `ready`), avec le faux dossier de session que ce fichier emploie déjà.
Le cas HTTP s'appuie sur `tests/helpers/wire-host.cjs`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un test existant exige qu'un registre refusé à la réouverture reste
annoncé `ready`, ou si le dire illisible bloque ou réécrit quoi que ce soit à l'activation suivante :
verdict BLOQUÉ, avec le test et la ligne en cause.

## Journal
