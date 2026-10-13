---
id: T001
titre: Prove the duplicate answer to a resent block without racing the ingestion lane
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le test « a client that leaves while its block is prepared cancels nothing… » échoue par intermittence
sous charge : il reçoit 429 là où il attend 200. Après ce ticket, il prouve le même comportement sans
dépendre du moment où le serveur libère sa voie d'ingestion, et il ne perd aucune de ses exigences.

## Sources

- Constats d'audit TSTA-01 et FLK-01. Échec observé une fois le 2026-10-13, sur les 602 tests lancés
  en parallèle.
- Code concerné, à la version `932b8e0` :
  - `tests/architecture-f06.test.cjs:514-532` : le test ; attente ligne 529, assertion ligne 530.
  - `server/http.cjs:247-248` : réponse 429 tant que `ingesting` est vrai ; `:258` appel à
    `runtime.ingest` ; `:262` inscription du bloc dans `accepted` ; `:270` libération de la voie.
  - `core/session.cjs:117` : le passage devient visible ; `:126-128` écriture d'état du premier
    passage, attendue ; `:133-134` écriture de la vignette, attendue.
  - `tv/transport.py:85` : le client réel renvoie un bloc refusé par 408 ou 429.
- Mécanisme : le passage est visible dans `/v1/state` dès `segments.push`, alors que le serveur
  n'inscrit le bloc comme accepté qu'au retour de `runtime.ingest`. Entre les deux, un renvoi ne trouve
  pas de bloc accepté et reçoit 429, la réponse prévue du produit (« à renvoyer »). C'est l'attente du
  test qui est fausse, pas le serveur.
- Reproduction établie le 2026-10-14 sur `932b8e0` : avec la sonde ci-dessous et `FLK_MS=10`, le test
  échoue trois fois sur trois avec 429 ; sans elle, il passe. Charge pendant la mesure : load 5,3,
  mémoire d'échange 23,8 Go utilisés sur 24,6.

## Sonde de reproduction

À enregistrer dans `.harness-state/tickets/T001/slow-fs.cjs` (hors Git). Elle retarde les écritures
du disque comme le ferait une machine chargée, sans toucher au code de production.

```js
const fsp = require("node:fs/promises");
const realSetTimeout = globalThis.setTimeout;
const names = (process.env.FLK_SLOW || "mkdir,writeFile,rename").split(",").filter(Boolean);
const ms = Number(process.env.FLK_MS || 5);
if (ms > 0) {
  for (const name of names) {
    const original = fsp[name];
    if (typeof original !== "function") continue;
    fsp[name] = function (...args) {
      return new Promise((resolve) => realSetTimeout(resolve, ms)).then(() => original.apply(this, args));
    };
  }
}
```

Commande, appelée « commande de sonde » dans les critères :

```sh
FLK_MS=10 node --require ./.harness-state/tickets/T001/slow-fs.cjs --test \
  --test-name-pattern="a client that leaves" tests/architecture-f06.test.cjs
```

## Périmètre

- À modifier : `tests/architecture-f06.test.cjs` — ce test et, si nécessaire, les aides locales du
  fichier.
- À ne pas toucher : le code de production (`server/`, `core/`, `runtime/`, `adapters/`) et les autres
  tests.
- Aucun délai n'est allongé. Le test n'est jamais relancé jusqu'à ce qu'il passe.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Reproduction avant correction : la commande de sonde échoue cinq fois sur cinq avec 429 sur le test
   dans sa forme actuelle. Commande et sortie dans le journal.
2. Le test corrigé renvoie le bloc comme le fait un client : de nouveau tant que la réponse est 429,
   dans une attente bornée. Il exige ensuite exactement
   `{ status: 200, value: { id: 'moment-1', duplicate: true } }`, `stored: ['moment-1']`,
   `prepared: 1` et `cancelled: false`. Il ne lit aucun état interne du serveur ou du runtime
   (`ingesting`, `admitted`…) pour décider quand renvoyer.
3. La commande de sonde passe cinq fois sur cinq sur le test corrigé. Commande et sortie dans le
   journal.
4. Sans sonde, `node --test --test-concurrency=1 tests/architecture-f06.test.cjs` passe vingt fois de
   suite. Commande et sortie dans le journal.
5. `git status --porcelain` ne montre que `tests/architecture-f06.test.cjs` et ce ticket.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Le test existant, corrigé, dans `tests/architecture-f06.test.cjs`. Frontière : la route HTTP
`POST /v1/segments` d'un vrai `RemoteServer` devant un vrai `HeadlessRuntime`, comme aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si la correction exige de modifier le code de production, ou si la
sonde ne reproduit pas l'échec : verdict BLOQUÉ, avec l'écart constaté.

## Journal

