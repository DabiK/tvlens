---
id: T131
titre: Route the TV thumbnail through the shared transport and name every /v1 call
statut: a-faire
bloque_par: T294
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
- Hors de ce ticket : le client du contrôleur local (`/capture`, `/panel`, port 8788) et son instance unique.
- Code concerné, à la version `1178657` :
  - `tv/app/remote-client.js`, `RemoteClient.prototype.send` (l.19-50) : `AbortController` et `setTimeout` de
    8 000 ms, en-têtes `Authorization` et `Content-Type`, échec réseau en `network: true` ; `refusal` (l.13-18)
    garde le statut et le code du serveur ; `RemoteClient.prototype.thumbnail` (l.118-132) : `this.fetch` direct,
    en-tête `Authorization` seul, `signal: AbortSignal.timeout(8000)` (l.127), `Error("Miniature indisponible")`
    sans statut (l.130), `URL.createObjectURL(await response.blob())` (l.131). `closeSession()` (l.168-170) vise
    une autre route, `/v1/sessions/close` : la fin depuis la frise garde `/v1/session/end`.
  - `tv/app/companion.js`, `el("transcription-language").onclick` (l.252-263) :
    `client.request("/v1/settings/transcription", {language: …})` (l.258).
  - `tv/app/companion.js`, option `onEnd` de la frise (l.344-358) : `client.request("/v1/session/end", {})`
    (l.355).
  - `tv/app/sessions-view.js`, `SessionsView.prototype.settle` (l.483-486) :
    `this.options.client.request("/v1/session/pause", {})` (l.485).
  - `tv/app/timeline-view.js`, `TimelineView.prototype.loadThumbnail` (l.291-330) : en cas d'échec, seul
    `image.alt = "Miniature indisponible"` est écrit (l.325) ; le message de l'erreur n'est pas affiché.
  - `server/http.cjs`, `preflight` (l.108-116) : `Authorization, Content-Type, If-None-Match` autorisés pour
    toutes les routes. `server/session-routes.cjs`, `serveThumbnail` (l.1-14) et sa route (l.42-46) : 200
    `image/jpeg`, ou 410 `{error, code}` (`session-ended` ou `thumbnail-unavailable`).
  - ADR 0042 (`docs/adr/0042-le-fil-v1-conserve-les-comportements-lus-par-les-clients-tv.md`) : GET
    `/v1/thumbnail/:sessionId/:id`, POST `/v1/settings/transcription`, pause et fin sont lus par la TV et protégés
    par la décision de compatibilité.
  - `tests/tv-panel.test.cjs`, test `the transport revalidates with If-None-Match, keeps the body on 304 and never
    sends a tag it was not given` (l.192-228) : faux `fetch` et `reply()`, modèle du nouveau test.
  - `tests/tv-app-compat.test.cjs`, commentaire d'en-tête (l.8) : le plancher « autour de Chrome 103 » y est
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
  local (`control.request(...)`), les textes affichés, les listes d'exports de `companion.js` fixées par
  `tests/chat-error-ui.test.cjs` et `tests/tv-chat-model.test.cjs`.
- Les scripts restent des scripts classiques sous le plancher de `tests/tv-app-compat.test.cjs`.
- Aucune ligne de plus de 160 caractères ajoutée ; aucun `catch` vide ajouté.
- Hors boucle, par l'orchestrateur, après intégration : contrôle réel sur la TV :
  1. déployer `tv/app` depuis un tag, avec sauvegarde et retour arrière prêt, sans toucher au fichier d'appairage ;
  2. frise : les miniatures des moments s'affichent, dans la liste et dans le détail d'un moment ;
  3. bouton de langue de transcription : le changement est enregistré, puis la langue d'origine est remise ;
     ouvrir une archive depuis « Sessions » quand la TV ne capture pas (pause d'abord) ; terminer une session
     d'essai depuis la frise ;
  4. écrire le résultat dans `experiments/essais/`.

## Critères d'acceptation

1. Un nouveau test de `tests/tv-panel.test.cjs`, par un faux `fetch`, prouve :
   - `thumbnail("s-1", "moment-2")` appelle `http://server.test/v1/thumbnail/s-1/moment-2` en `GET`, avec
     `Authorization: Bearer …` et un `signal`, sans corps, et rend une adresse `blob:` (révoquée ensuite par le
     test) ;
   - une réponse 410 `{error: "Session terminée.", code: "session-ended"}` rejette avec `status === 410` et ce
     code ;
   - un hôte injoignable rejette avec `network === true` et le message « Connexion impossible. » ;
   - `setTranscriptionLanguage("en")`, `pauseSession()` et `endSession()` envoient un `POST` sur leur route
     avec exactement les corps `{"language":"en"}`, `{}` et `{}`.
2. Écrit avant la modification, ce test échoue sur `1178657` (méthodes absentes, refus sans statut), sortie
   au journal.
3. `grep -nE "[\"']/v1/" tv/app/*.js | grep -v "^tv/app/remote-client.js"` ne sort rien (3 lignes à
   `1178657` : `companion.js:258`, `companion.js:355`, `sessions-view.js:485`) et
   `grep -c "AbortSignal" tv/app/remote-client.js` rend 0 (1 à `1178657`).
4. Les tests existants de `tests/tv-panel.test.cjs`, `tests/chat-error-ui.test.cjs`, `tests/tv-chat-model.test.cjs`,
   `tests/tv-app-compat.test.cjs`, `tests/tv-remote-navigation.test.cjs` et `tests/tv-paired-page.test.cjs`
   passent sans modification de leurs assertions.
5. Le nombre de tests de `tests/tv-panel.test.cjs` ne baisse pas (`grep -c "^test(" tests/tv-panel.test.cjs`
   avant et après, au journal ; 21 à `1178657`).
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

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à jour à
  `1178657` ; bloqueurs revus : T145 retiré (file rouverte) ; T028 retiré (reformatage Prettier jamais lancé, encore
  à faire : ce ticket n'a pas besoin de son code) ; T294 ajouté (passe après la file en cours). Le constat tient :
  la miniature contourne toujours `send` et les trois routes restent écrites à la main. Lignes recalées ; route
  des miniatures passée dans `server/session-routes.cjs`, dont le 410 porte aussi un code, repris au critère 1 ;
  `/ambient` n'existe plus côté contrôleur local ; ADR 0042 cité ; `tests/tv-remote-navigation.test.cjs` est
  intégré et le banc appairé charge le vrai transport : les deux rejoignent le critère 4, avec
  `tests/tv-chat-model.test.cjs`, qui épingle aussi les exports de `companion.js`. Contrôle réel sur la TV ajouté
  au périmètre.
