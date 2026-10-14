---
id: T038
titre: Exercise the /v1 wire with the real TV client and write its compatibility rule
statut: a-faire
bloque_par: T145
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Aucun test ne fait parler le client de la TV au vrai serveur : aucun fichier `tests/*.test.cjs` ne cite
à la fois `RemoteServer` et un chemin de `tv/app`. Et aucune règle écrite ne dit ce qu'un ticket
a le droit de changer sur `/v1`. Après ce ticket, un test monte le vrai serveur et le fait interroger par
le vrai client du panneau, et un ADR écrit la règle de compatibilité, les bornes et les délais qui font
partie du contrat, et l'ordre dans lequel serveur et TV se livrent. Le ticket ne change aucune réponse.

## Sources

- Constats : GAP3-01, GAP3-02, OUBLI-49
- Livre : jalon:contrat-fil
- Code vérifié à la version `0d5a954` :
  - `server/http.cjs`, classe `RemoteServer` : constructeur lignes 6-17 (`requestTimeout = 20000`
    ligne 15, `headersTimeout = 10000` ligne 16) ; `handle` : 401 lignes 52-58, 405 lignes 60-65,
    `revalidated` (304) lignes 73-80, `GET /v1/session` lignes 82-95, `/v1/state` lignes 96-99, 404
    ligne 152, 415 lignes 154-159, limite de corps `route === "/v1/segments" ? 13000000 : 12000`
    ligne 160, 413 lignes 161-170 (sans code), 400 « JSON invalide. » lignes 179-180.
  - `runtime/headless-runtime.cjs` : `viewName` lignes 446-450 (400 « Vue d'état inconnue. ») ;
    `etag(view)` lignes 453-456 ; exports `HeadlessRuntime`, `VIEWS`.
  - `tv/app/remote-client.js` : `RemoteClient(config, fetcher)` lignes 4-10 ; `refusal(response, value)`
    lignes 13-18 (garde le statut et le code) ; `send` lignes 19-50 (délai de 8000 ms ligne 23) ;
    `poll(route)` lignes 68-85 : rend `{ value, notModified }`, et sur un 304 la valeur tenue avec
    `notModified: true` ; `state(view)` lignes 87-89 ; `module.exports = { RemoteClient }` lignes 170-171.
  - `tv/app/companion.js` : `tvlensViewRefusal` lignes 240-245 (un 404, ou un 400 dont le message dit
    « vue d'état inconnue », est classé `unknown`) ; `TvlensPollPlan` ligne 248, dont `refused(error,
    now)` rend vrai et pose `legacy` à vrai pour un refus `unknown` ; exports `pollPolicy`, `PollPlan`,
    `mergeState` lignes 363-373.
  - `tv/transport.py` : `Transport.request(route, data=None, timeout=5)` ligne 43 ;
    `deliver(item, created, ttl=30)` ligne 50.
  - `scripts/bench-perceived.cjs` lignes 86-100 : gabarit existant, hors `npm test`, qui monte déjà
    `RemoteServer` et `HeadlessRuntime` devant le vrai `tv/app/remote-client.js`.
  - `tests/server-sessions.test.cjs` : `fixture` ligne 73 — modèle d'un hôte hors ligne.
- Documentation vérifiée : `docs/adr/0006-…md`, décision 12 (ligne 48) et décision 13 (ligne 57), fixe
  déjà les statuts de `POST /v1/segments` et les délais (5 s côté TV, 15 s par commande, 30 s de vie d'un
  bloc). `docs/architecture.md:100` : « GET /v1/state reste compatible… ». `docs/architecture.md:104` :
  des écrans TV écrits dans `tv/app/` ne sont pas encore déployés. `docs/vps-deployment.md:101` : le VPS
  part de `7015a64` avec des correctifs déployés hors commit. Ce qui est installé n'est donc pas ce que
  porte le dépôt.

## Périmètre

À créer :

- `tests/helpers/wire-host.cjs` : monte, hors ligne et sur un dossier temporaire, un `HeadlessRuntime`
  en mode `smoke` derrière un `RemoteServer` écoutant sur `127.0.0.1`, et rend le vrai `RemoteClient` de
  `tv/app/remote-client.js` configuré sur lui, avec de quoi l'arrêter. Les tickets suivants du contrat de
  fil s'en servent.
- `tests/wire-contract.test.cjs` : les cas ci-dessous.
- Un ADR dans `docs/adr/`, au premier numéro libre, qui étend l'ADR 0006 sans le redire :
  1. La règle : sur `/v1`, on ajoute, on ne retire ni ne renomme un chemin, un champ, un code ou un
     message ; une cause ne change pas de classe de statut. Tant que le plancher n'est pas relevé, tout
     ce que `/v1` rend aujourd'hui est tenu pour lu par un client installé.
  2. Qui lit quoi : le panneau (`tv/app/remote-client.js`), la capture (`tv/transport.py`) ; l'app Mac
     n'appelle pas `/v1`.
  3. Les bornes et délais du contrat, chacun avec son emplacement des deux côtés : 12 000 et
     13 000 000 octets de corps, 20 s de requête côté serveur, 8 s côté panneau, 5 s par requête et 30 s
     de vie d'un bloc côté capture ; un 413 n'a pas de code.
  4. L'ordre de livraison d'un ajout : les tests du contrat, puis le serveur, puis le client qui lit
     l'ajout ; un changement de statut ou de champ ne vient qu'ensuite, sous preuve que le client actuel
     traite encore la réponse.
  5. Ce que l'ADR ne fixe pas : la révision plancher. Les révisions installées sur la TV et le VPS ne
     sont lisibles que par le propriétaire ; l'ADR dit où les noter et n'en affirme aucune.

À ne pas toucher :

- Le code de production : `server/`, `runtime/`, `tv/`. Aucune réponse, aucun délai ne change.
- `scripts/bench-perceived.cjs` et les tests existants.
- Les aides d'attente et d'horloge de `tests/helpers/` (`wait.cjs`, `clock.cjs`) : elles appartiennent à
  lot:L05. Ce test attend les promesses des requêtes HTTP et ne crée aucune aide d'attente.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/wire-contract.test.cjs` passe, hors ligne. Avec le vrai `RemoteClient` devant le
   vrai serveur, le fichier prouve :
   - chaque vue de `VIEWS` est rendue par `client.state(view)` (`notModified: false`) et sa valeur est
     acceptée par `mergeState` ; l'état fusionné porte l'identifiant de la session en cours ;
   - une vue redemandée sans changement rend `notModified: true` et la valeur déjà tenue ; après un bloc
     reçu par `POST /v1/segments`, la même demande rend `notModified: false` et un état nouveau ;
   - une vue inconnue est refusée : `client.state` lève un refus qui porte le statut 400 et le message du
     serveur ; pour ce refus, `PollPlan.refused` rend vrai et `legacy` passe à vrai ;
   - un jeton faux donne un refus de statut 401 ; une route inconnue, 404 ;
   - un corps de plus de 12 000 octets sur une route de commande donne un refus de statut 413, sans code ;
   - un refus qui porte un code (au moins `read-only` sur `/v1/session/start` d'une archive rouverte)
     arrive au client avec son statut et son code.
2. Le test ne remplace ni `fetch` ni une globale : le client reçoit le `fetch` de Node et l'adresse du
   serveur monté.
3. `grep -n "0006" docs/adr/<nouvel ADR>` montre que l'ADR renvoie aux décisions 12 et 13 de l'ADR 0006
   au lieu de recopier leur table de statuts.
4. `grep -owE "[0-9a-f]{7,40}" docs/adr/<nouvel ADR> | grep "[a-f]"` ne rend rien : l'ADR ne cite aucune
   révision Git, ni comme installée ni comme plancher.
5. `node --test tests/server-state-views.test.cjs tests/tv-panel.test.cjs` passe sans qu'une ligne de ces
   deux fichiers ait changé.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/wire-contract.test.cjs`, nouveau. Frontière : HTTP réel sur `127.0.0.1`, entre le `RemoteClient`
de `tv/app/remote-client.js` (avec `PollPlan` et `mergeState` de `tv/app/companion.js`) et un
`RemoteServer` devant un `HeadlessRuntime`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si le vrai client ne peut pas être chargé hors navigateur sans modifier
`tv/app`, ou si un cas révèle une réponse que le client actuel ne sait pas lire : verdict BLOQUÉ, avec
l'écart constaté ; le test n'est pas plié à la réponse et la réponse n'est pas corrigée dans ce ticket.

## Journal
