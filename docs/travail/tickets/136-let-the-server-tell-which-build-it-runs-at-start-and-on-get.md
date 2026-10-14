---
id: T136
titre: Let the server tell which build it runs, at start and on GET /v1/version
statut: a-faire
bloque_par: T038, T135, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Après une mise à jour du VPS, rien ne permet de vérifier quelle révision tourne vraiment.

Après ce ticket, le serveur lit son identité de construction au démarrage, par l'adaptateur de T135, et
il la nomme dans son journal. Une nouvelle route authentifiée, `GET /v1/version`, la rend avec la version
de Node. Le futur script de mise à jour comparera ce commit à celui qu'il vient d'installer (fiche, § 3,
étape 5).

C'est un ajout pur au contrat `/v1`. Le panneau TV ne change pas.

## Sources

- Constats : OPS-15
- Fiche du lot : `docs/travail/fiches/livraison.md`, § 2 (lignes `server/http.cjs` et `server/main.cjs`),
  § 3, étape 3, et § 4 (invariants : route authentifiée, ajout seulement, démarrage sans fichier).
- Arbitrage A7 : les changements de `/v1` sont des ajouts seulement.
- Code vérifié à la version `0d5a954` :
  - `server/http.cjs` :
    - `class RemoteServer` (l.5), `constructor({ runtime, media, token })` (l.6-17) ;
    - `handle` : contrôle du jeton (l.52-58), qui répond 401 avant tout routage ;
    - dans `handle`, la fonction locale `revalidated = (tag, build) => …` (l.73) a déjà un paramètre
      nommé `build` : la route lit donc l'identité par `this.build`, jamais par un nom local ;
    - début des routes `GET` (l.81), avec `/v1/session` (l.82) ;
    - aucune route ni champ de version.
  - `server/main.cjs` :
    - `async function main()` (l.22) ;
    - construction du serveur `new RemoteServer({runtime,media:…,token:…})` (l.40) ;
    - journal de démarrage `console.log('TVLens server '+server.url+' — device token stored in '+tokenFile)`
      (l.41) ;
    - `module.exports={settings,main}` (l.48), avec la garde `require.main===module` (l.47).
  - Construction du serveur dans les tests, sans identité :
    `new RemoteServer({runtime,media,token}).listen(0,'127.0.0.1')`, dans `tests/remote-server.test.cjs:14`
    et d'autres fichiers de test. Le nouveau paramètre doit donc être facultatif.
  - `adapters/build-info.cjs`, `readBuildInfo(dir)` : livré par T135. Rend `null` si le fichier manque, et
    lève une erreur qui nomme le fichier s'il est invalide.
  - `docs/server-installation.md:132` : la phrase « Routes ajoutées, toutes authentifiées par le jeton : … ».

## Périmètre

- À modifier :
  - `server/http.cjs` :
    - le constructeur accepte `build`, facultatif, `null` par défaut, et le garde ;
    - la route `GET /v1/version` répond 200 avec `{ build, node: process.version }`, où `build` est l'objet
      reçu ou `null` ;
    - la route est placée dans le bloc `GET`, donc après le contrôle du jeton. Aucun autre comportement ne
      change.
  - `server/main.cjs` :
    - `main()` lit `readBuildInfo(path.join(__dirname, '..'))` avant de construire le serveur, et le passe
      en `build`. Un fichier invalide fait échouer le démarrage, par le chemin d'erreur existant de la
      garde l.47 ;
    - une fonction pure exportée, `startupLine({ url, tokenFile, build })`, rend la ligne du journal : la
      ligne actuelle, suivie de ` — build <12 premiers caractères du commit>`, de ` (modified)` si
      `dirty`, ou de ` — build unknown` si `build` vaut `null`. `main()` l'affiche à la place de la l.41 ;
    - `module.exports` ajoute `startupLine`.
  - `docs/server-installation.md:132` : `GET /v1/version` ajoutée à la liste des routes, avec une phrase
    qui dit que `build` vaut `null` hors construction identifiée.
  - Si `jalon:contrat-fil` a livré une liste des routes `/v1` vérifiée par un test, la route y est ajoutée,
    sans retirer ni modifier aucune entrée.
- À créer : `tests/server-version.test.cjs`, voir « Test d'acceptation attendu ».
- À ne pas toucher :
  - `tv/`, le client TV ;
  - les autres routes et leurs réponses ;
  - les tests existants de `RemoteServer` ;
  - `adapters/build-info.cjs`, sauf correction d'un défaut prouvé par un test, notée au journal ;
  - le VPS.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/server-version.test.cjs` passe.
2. `node --test tests/remote-server.test.cjs tests/server-sessions.test.cjs` passe, sans modification de ces
   fichiers.
3. Preuve que le client TV fonctionne toujours (arbitrage A7) : `node --test tests/tv-panel.test.cjs` puis
   `node --test tests/tv-app-compat.test.cjs` passent, sans modification de ces fichiers.
4. `grep -n "process.env" server/http.cjs` ne rend rien.
5. `grep -n "readBuildInfo" server/main.cjs` rend l'import de `../adapters/build-info.cjs` en tête de
   module (chargé, donc, par le test qui importe `startupLine`) et un appel dans `main()`, situé avant
   `new RemoteServer`.
6. Le cliquet ne régresse pas, en particulier `process_env_hors_config`. Commande :
   `node scripts/check.mjs --changed`, verte ; format et lint sont rapportés « non lancés » s'ils le sont.

## Test d'acceptation attendu

`tests/server-version.test.cjs`, nouveau. Frontière : HTTP, sur un `RemoteServer` construit comme dans
`tests/remote-server.test.cjs` (un runtime minimal suffit si la route n'y touche pas) et écouté sur
`127.0.0.1`, port 0.

- Sans en-tête `Authorization` : 401.
- Avec le jeton, et une identité passée au constructeur : 200, et le corps vaut exactement `build` plus
  `node`, égal à `process.version`.
- Serveur construit sans `build` : 200 et `build: null`.
- `startupLine` : identité propre, identité modifiée, et `null`. Les trois lignes commencent par la ligne de
  journal actuelle.

## Hypothèses bloquantes

Aucune décision n'est attendue.

- La forme du corps (`build` et `node`) est un ajout. Si `jalon:contrat-fil` impose une convention de
  nommage ou d'enveloppe des réponses `/v1` qui la contredit, on suit la convention et le journal le note.
- Si le jalon a figé la liste des routes dans un test que ce ticket ne peut étendre sans modifier le
  harnais : verdict BLOQUÉ, avec le fichier.

## Journal
