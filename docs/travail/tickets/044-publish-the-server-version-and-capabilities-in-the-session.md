---
id: T044
titre: Publish the server version and capabilities in the session answer
statut: a-faire
bloque_par: T038
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le serveur ne dit nulle part quelle version il est ni ce qu'il sait faire : la seule identité qu'il
publie est quatre octets aléatoires dans un ETag, et une TV reconnaît un serveur plus ancien à un 404.
Après ce ticket, `GET /v1/session` porte, avec ou sans session, un bloc `server` : version, révision,
numéro d'interface, capacités et vues. C'est un ajout : aucun champ existant ne bouge, et l'absence du
bloc continue de vouloir dire « serveur d'avant les capacités ». Aucun client ne le lit encore.

## Sources

- Constats : GAP3-03
- Code vérifié à la version `0d5a954` :
  - `server/http.cjs`, `handle`, `GET /v1/session` lignes 82-95 : rend `{ id, accepting, readOnly,
    storage: { state } }`, ou `{}` sans session ; constructeur de `RemoteServer` lignes 6-17 ; code
    retiré des refus 400 ligne 286 (c'est pourquoi aucune capacité ne promet de codes de refus).
  - `runtime/headless-runtime.cjs` : `VIEWS = ["chat", "panel"]` ligne 30, exporté ; `this.boot`
    ligne 250 ; `etag(view)` lignes 453-456.
  - `tv/transport.py`, `Transport.deliver` lignes 55-66 : la capture lit de cette réponse `id`,
    `storage.state`, `readOnly` et `accepting`, par `.get` ; rien d'autre.
  - `tv/app/remote-client.js` : aucun appel à `GET /v1/session` (les routes `/v1/session/…` de
    commande ne sont pas concernées).
  - `scripts/replay-lg-stream.cjs` ligne 177 lit aussi `GET /v1/session` ; `scripts/` n'est pas lancé par
    `node scripts/check.mjs` et n'est pas modifié ici.
  - `server/http.cjs`, `handle` : `GET /v1/surveillance/overlay` ligne 100, `GET /v1/surveillance`
    ligne 102, `GET /v1/sessions` ligne 104.
  - `docs/vps-deployment.md:11` : le serveur s'installe par `npm ci --omit=dev`, donc `package.json` est
    présent là où il tourne. Aucun fichier de production ne le lit aujourd'hui.
  - `tests/server-sessions.test.cjs` lignes 159 et 308 : `deepEqual` sur le corps entier de
    `GET /v1/session`. `tests/test_tv_control.py`, `DeliveryTests.setUp` lignes 83-103 : faux serveur dont
    la réponse de session se complète par `self.state`.
  - `server/main.cjs` : `new RemoteServer({runtime, media, token})` ligne 40 ; seul fichier de `server/`
    autorisé à lire `process.env` (`scripts/quality/metrics.mjs`, `ENV_READERS` ligne 15).
  - `package.json` : `"version": "0.1.0"` ligne 3.
- Règle écrite par T038 (ADR du contrat de fil) : sur `/v1`, on ajoute.

## Périmètre

À créer :

- `runtime/wire-contract.cjs` : `API = 1`, `VIEWS` (domicile unique de la liste ;
  `runtime/headless-runtime.cjs` l'importe et continue de l'exporter) et `CAPABILITIES` :
  `state-views`, `state-etag`, `sessions`, `surveillance`, `surveillance-overlay`. Chaque capacité nomme
  une chose que le serveur fait déjà à cette version.

À modifier :

- `server/http.cjs` : `GET /v1/session` ajoute, avec ou sans session,
  `server: { version, revision, api, capabilities, views }`. `version` est celle de `package.json`.
  `revision` vient d'une option de `RemoteServer` et vaut `unknown` par défaut.
- `server/main.cjs` : passe la révision lue dans `TVLENS_REVISION` ; si une lecture de cette variable
  existe déjà dans le fichier, elle est réutilisée, pas doublée. `settings()` n'est pas modifié : un test
  compare son retour entier (`tests/server-sessions.test.cjs` ligne 621).
- `tests/server-sessions.test.cjs` : les deux attendus des lignes 159 et 308 gagnent le bloc `server` ;
  aucune clé n'en sort. `tests/wire-contract.test.cjs` : cas ajoutés. `tests/test_tv_control.py` : un
  test ajouté à `DeliveryTests`.
- `docs/architecture.md`, paragraphe « État interrogé par la TV » (ligne 100) : une phrase ajoutée, qui
  nomme le bloc `server` de `GET /v1/session` et son domicile `runtime/wire-contract.cjs`.

À ne pas toucher :

- Les champs existants de la réponse, les en-têtes, le preflight : aucun en-tête n'est ajouté ni exigé.
- `tv/` : aucun client ne lit le bloc dans ce ticket.
- L'ETag et `boot`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `tests/wire-contract.test.cjs` prouve, par HTTP sur le vrai serveur :
   - sans session, `GET /v1/session` rend exactement `{ server: {…} }` ; avec une session, les quatre
     champs d'aujourd'hui, inchangés, plus `server` ;
   - `server.version` est la version de `package.json`, `server.api` vaut 1, `server.views` égale la
     liste que le runtime accepte, et `server.revision` vaut `unknown` sans option, la valeur passée
     sinon ;
   - chaque capacité publiée correspond à une route qui répond sur ce serveur : une vue d'état pour
     `state-views`, un 304 pour `state-etag`, `GET /v1/sessions`, `GET /v1/surveillance`,
     `GET /v1/surveillance/overlay`.
2. `node --test tests/server-sessions.test.cjs` passe ; les deux comparaisons des lignes 159 et 308
   restent des `deepEqual` sur le corps entier.
3. Un test ajouté à `DeliveryTests` (`tests/test_tv_control.py`) prouve que la capture actuelle traite
   encore la réponse. Le faux serveur de `setUp` complète sa réponse de session par `self.state` : avec
   un bloc `server` ajouté par ce moyen, un bloc est livré comme sans lui ; avec une réponse dont `id` est
   nul (posé par `self.state`) et qui porte le bloc `server`, `deliver` rend le même résultat et compte
   la même cause que pour la même réponse sans le bloc — le test exécute les deux et les compare.
   Commande : `python3 -B -m unittest discover -s tests -p "test_tv_control.py"`.
4. `grep -rn "process.env" runtime/wire-contract.cjs server/http.cjs` ne rend rien.
5. `grep -n "VIEWS *= *\[" runtime/headless-runtime.cjs` ne rend rien : la liste littérale n'y est plus.
   `tests/wire-contract.test.cjs` prouve que `VIEWS` exporté par `runtime/headless-runtime.cjs` égale
   celui de `runtime/wire-contract.cjs`.
6. `grep -n "wire-contract" docs/architecture.md` rend au moins une ligne.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Cas ajoutés à `tests/wire-contract.test.cjs` (frontière : HTTP réel devant un `RemoteServer` et un
`HeadlessRuntime`) et un test ajouté à `DeliveryTests` de `tests/test_tv_control.py` (frontière :
`Transport.deliver` devant le faux serveur du fichier).

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un lecteur de `GET /v1/session` autre que `tv/transport.py` compare
le corps entier, ou si la capture actuelle ne traite pas la réponse augmentée : verdict BLOQUÉ, avec le
lecteur et la ligne en cause.

## Journal
