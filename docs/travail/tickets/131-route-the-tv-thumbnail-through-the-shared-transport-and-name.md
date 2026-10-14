---
id: T131
titre: Route the TV thumbnail through the shared transport and name every /v1 call
statut: a-faire
bloque_par: T028
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le panneau TV a un transport (`RemoteClient` dans `tv/app/remote-client.js`), mais la miniature le
contourne (son propre `fetch`, son propre délai par `AbortSignal.timeout`, une erreur sans statut) et trois
routes `/v1` sont écrites à la main hors du transport, dans `companion.js` et `sessions-view.js`. Après ce
ticket, toute requête du panneau vers le serveur passe par `send` (même délai de 8 s, même distinction entre
hôte injoignable et refus), et chaque route `/v1` a une méthode nommée dans `RemoteClient`. Aucune requête ne
change de méthode, de route ni de corps ; le serveur n'est pas touché.

## Sources

- Constats : TV-06
- Hors de ce ticket : le client du contrôleur local (`/capture`, `/panel`, `/ambient`, port 8788) et son
  instance unique.
- Code concerné, à la version `0d5a954` :
  - `tv/app/remote-client.js`, `RemoteClient.prototype.send` (l.19-50) : `AbortController` et `setTimeout` de
    8 000 ms, en-têtes `Authorization` et `Content-Type`, échec réseau en `network: true` ;
    `RemoteClient.prototype.thumbnail` (l.116-130) : `this.fetch` direct, en-tête `Authorization` seul,
    `signal: AbortSignal.timeout(8000)`, `Error("Miniature indisponible")` sans statut,
    `URL.createObjectURL(await response.blob())`.
  - `tv/app/companion.js`, `el("transcription-language").onclick` (l.582-593) :
    `client.request("/v1/settings/transcription", {language: …})` (l.588).
  - `tv/app/companion.js`, option `onEnd` de la frise (l.672-686) : `client.request("/v1/session/end", {})`
    (l.683).
  - `tv/app/sessions-view.js`, `SessionsView.prototype.settle` (l.490-493) :
    `this.options.client.request("/v1/session/pause", {})` (l.492).
  - `tv/app/timeline-view.js`, `TimelineView.prototype.loadThumbnail` (l.300) : en cas d'échec, seul
    `image.alt = "Miniature indisponible"` est écrit ; le message de l'erreur n'est pas affiché.
  - `server/http.cjs`, branche `OPTIONS` (l.42-50) : `Authorization, Content-Type, If-None-Match` autorisés
    pour toutes les routes ; route des miniatures (l.107-125) : 200 `image/jpeg` ou 410 `{error}`.
  - `tests/tv-panel.test.cjs`, test `the transport revalidates with If-None-Match, keeps the body on 304 and
    never sends a tag it was not given` (l.188-224) : faux `fetch` et `reply()`, modèle du nouveau test.
  - `tests/tv-app-compat.test.cjs`, commentaire d'en-tête (l.9) : le plancher « autour de Chrome 103 » y est
    rattaché à `AbortSignal.timeout` dans `remote-client.js`.

## Périmètre

- À modifier :
  - `tv/app/remote-client.js` : `thumbnail` passe par `send` (lecture `GET`) ; un refus garde son statut
    (`refusal`) ; la réponse reste `URL.createObjectURL(blob)`. Trois méthodes ajoutées :
    `setTranscriptionLanguage(language)` (POST `/v1/settings/transcription`, corps `{language}`),
    `pauseSession()` (POST `/v1/session/pause`, corps `{}`), `endSession()` (POST `/v1/session/end`, corps
    `{}`). Les noms peuvent changer si un nom plus juste s'impose.
  - `tv/app/companion.js` et `tv/app/sessions-view.js` : les trois appels utilisent ces méthodes.
  - `tests/tv-panel.test.cjs` : un test ajouté pour le transport (aucun test existant modifié).
  - `tests/tv-app-compat.test.cjs` : seulement le commentaire d'en-tête, pour qu'il ne cite plus un appel
    disparu tout en gardant le plancher annoncé et son origine ; aucune expression ni assertion ne change.
- À ne pas toucher : `server/`, les routes et corps envoyés, `capture-control.js`, les appels au contrôleur
  local (`control.request(...)`), les textes affichés, la liste des exports de `companion.js` fixée par
  `tests/chat-error-ui.test.cjs`.
- Les scripts restent des scripts classiques sous le plancher de `tests/tv-app-compat.test.cjs`.
- Aucune ligne de plus de 160 caractères ajoutée ; aucun `catch` vide ajouté.

## Critères d'acceptation

1. Un nouveau test de `tests/tv-panel.test.cjs`, par un faux `fetch`, prouve :
   - `thumbnail("s-1", "moment-2")` appelle `http://server.test/v1/thumbnail/s-1/moment-2` en `GET`, avec
     `Authorization: Bearer …` et un `signal`, sans corps, et rend une adresse `blob:` (révoquée ensuite par le
     test) ;
   - une réponse 410 `{error: "Session terminée."}` rejette avec `status === 410` ;
   - un hôte injoignable rejette avec `network === true` et le message « Connexion impossible. » ;
   - `setTranscriptionLanguage("en")`, `pauseSession()` et `endSession()` envoient un `POST` sur leur route
     avec exactement les corps `{"language":"en"}`, `{}` et `{}`.
2. Écrit avant la modification, ce test échoue sur `0d5a954` (méthodes absentes, refus sans statut), sortie
   au journal.
3. `grep -nE "[\"']/v1/" tv/app/*.js | grep -v "^tv/app/remote-client.js"` ne sort rien (3 lignes à
   `0d5a954` : `sessions-view.js:492`, `companion.js:588`, `companion.js:683`) et
   `grep -c "AbortSignal" tv/app/remote-client.js` rend 0 (1 à `0d5a954`).
4. Les tests existants de `tests/tv-panel.test.cjs`, `tests/chat-error-ui.test.cjs`,
   `tests/tv-app-compat.test.cjs` et, s'il est intégré, `tests/tv-remote-navigation.test.cjs` passent sans
   modification de leurs assertions.
5. Le nombre de tests de `tests/tv-panel.test.cjs` ne baisse pas (`grep -c "^test(" tests/tv-panel.test.cjs`
   avant et après, au journal ; 19 à `0d5a954`).
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/tv-panel.test.cjs`, à la frontière de `RemoteClient` importé de `tv/app/remote-client.js` avec un
faux `fetch` injecté par le constructeur, comme le test de revalidation existant.

## Hypothèses bloquantes

Aucune décision n'est attendue. La lecture de la miniature gagne l'en-tête `Content-Type: application/json`,
comme toutes les lectures de `state()` aujourd'hui, et le serveur l'autorise en prévol pour toutes les routes :
le contrat `/v1` ne change pas. Si un test ou un appelant montre qu'un client TV installé dépend de l'ancienne
forme de la requête de miniature : verdict BLOQUÉ, avec l'écart constaté.

## Journal
