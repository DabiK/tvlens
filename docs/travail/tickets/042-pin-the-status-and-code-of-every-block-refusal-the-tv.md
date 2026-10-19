---
id: T042
titre: Pin the status and code of every block refusal the TV capture reads
statut: a-faire
bloque_par: T038, T294
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

La capture de la TV décide de renvoyer, de jeter ou d'arrêter d'après la classe du statut et, pour deux
causes, d'après le code. Aucun test ne tient ensemble la cause, le statut et le code que le vrai serveur
rend : un ticket qui déplacerait une cause de 400 vers 503, ou donnerait un 409 de plus au démarrage de
session, laisserait les deux suites vertes. Après ce ticket, une table figée liste chaque refus d'un
bloc, et un test prouve que le vrai serveur rend exactement cette table. Aucune réponse ne change.

## Sources

- Constats : GAP3-05, GAP3-02
- Code vérifié à la version `1178657` (le constat d'origine porte sur `0d5a954` ; depuis, l'ingestion a
  quitté `server/http.cjs` et l'admission `runtime/headless-runtime.cjs`) :
  - `server/ingest-routes.cjs`, `ingestBlock` (l.8-56) : `validateRemote` l.9 ; `runtime.admit` l.11 ;
    400 `invalid-capture-time` « Horodatage futur. » l.12-13 ; doublon rendu 200, ou 409
    `sequence-conflict` « Séquence déjà utilisée avec un autre contenu. », l.24-31 ; 409
    `stale-sequence` « Séquence ancienne. » l.32-33 ; 429 `preparation-busy` « Préparation du passage
    précédent. » l.34-35 ; `runtime.accept` l.38, assemblage l.41, `runtime.ingest` l.42.
  - `server/http.cjs` : 401 `unauthenticated` l.227-228 ; `readJSON` l.134-167 (415 `json-required`
    l.136, 413 `request-too-large` l.141 et l.149, 400 `invalid-json` l.163) ; `sendError` l.177-199 :
    507 `storage-full` l.191-192, 500 `internal-error` l.193-194, sinon le statut de l'erreur ou 400,
    avec son code public ou `unclassified-error` (l.195-198). Un code n'est public que s'il figure dans
    `PUBLIC_CODES` (l.57-78, par exemple `invalid-media-block`) ou `APPLICATION_CODES` (l.79-89) ;
    `publicCode` l.169-171. Depuis `0d5a954`, chaque refus porte donc un code.
  - `runtime/errors.cjs` : `refusal(status, message, code)` l.2-3.
  - `runtime/capture-intake.cjs` : `closing()` (503 `session-closing`) l.9 ; `admit` l.15-29 (400
    `stale-session` l.17, 409 `read-only` l.18, stockage plein l.20-27, 400 `session-stopped` « La
    session est arrêtée. » l.28) ; `accept` l.33-47 (session en cours d'arrêt l.35) ; `ingest` l.99-128
    (409 `capture-changed` l.101-104, session en cours d'arrêt l.107).
  - `runtime/headless-session-lifecycle.cjs`, `start()` l.84 : 400 `session-closing` l.86, 409
    `read-only` l.89, garde de disque `assertRoom` l.92 (507 `storage-full`).
    `runtime/headless-runtime.cjs` délègue `start` (l.381) et `admit`, `accept`, `ingest` (l.394-413).
  - `adapters/remote-media.cjs` : `validateRemote` l.20 (code `TVLENS_MEDIA_BLOCK_INVALID`, publié
    `invalid-media-block`) ; `unavailable` (503 `media-unavailable`) l.58. `adapters/disk-guard.cjs` :
    `STORAGE_FULL` l.4.
  - `tv/transport.py`, `Transport.deliver` l.50-98 : `GET /v1/session` avant chaque envoi (l.55-66) ;
    dernier refus noté dans `lastRefusal` (l.78-79) ; code `storage-full`, ou 507 sans code, arrête pour
    stockage (l.80-84) ; 409 avec code `read-only` arrête pour lecture seule (l.85-87) ; tout autre
    statut sous 500, hors 408 et 429, rejette le bloc et note `HTTP <statut>` (l.88-91) ; le reste est
    renvoyé (l.92-95), y compris un 507 qui porte un autre code. Changé par T189 (`8d3933e`, ADR 0041) :
    à `0d5a954`, tout 507 arrêtait pour stockage.
  - `tv/capture.py`, refus du démarrage l.73-81 : code `read-only` arrête pour lecture seule, code
    `storage-full` ou 507 sans code pour stockage plein, tout autre refus arrête sur une erreur. Depuis
    T189, un 409 sans code n'est plus une lecture seule.
  - Tests qui provoquent déjà ces refus, à prendre pour modèles sans les modifier :
    `tests/architecture-f06.test.cjs` l.316 (capture relancée), l.336 (session en cours d'arrêt), l.353
    (outil média indisponible), l.575 (doublons, anciens numéros, corps bornés) ;
    `tests/server-sessions.test.cjs`, aides `refusing` l.26 et `disk` l.37, et test du 507 l.506
    (`DiskGuard` dont `freeBytes` est injecté ; 507 au démarrage l.533) ;
    `tests/wire-contract.test.cjs` l.119 (401, 404, 413), l.142 (409 `read-only` au démarrage, l.173)
    et l.230 (`sequence-conflict`, `stale-sequence`, `invalid-media-block`, `invalid-capture-time`,
    `session-stopped`).
- `docs/adr/0006-…md`, décisions 12 et 13 (lignes 48 et 57) : la table des statuts de `POST /v1/segments`
  y est déjà décidée. `docs/adr/0042-…md` (T038) caractérise huit refus (table l.78-87) ;
  `docs/adr/0041-…md` (T189) fixe la lecture des codes par la capture. Le ticket fige ces décisions par
  un test, il ne les redécide pas.
- Livré par T038 : `tests/helpers/server-host.cjs` (`createServerHost(t)`, l.89 : runtime smoke,
  horloge injectée, assembleur simulé, vrai `RemoteServer` sur `127.0.0.1`, vrai `RemoteClient`) et
  `tests/wire-contract.test.cjs`. L'hôte ne pose ni garde de disque ni assembleur différé ; aucun
  de ces tests ne lit une table figée ni ce que la capture fait de chaque refus.

## Périmètre

À créer :

- `tests/fixtures/wire-v1/refusals.json` : une ligne par refus, avec `route`, `cause` (un nom stable, en
  anglais), `status`, `code` (ou `null`), `message`, et `capture` : ce que la capture en fait
  aujourd'hui, l'une de `retry`, `rejected`, `stop-storage`, `stop-read-only`. Y figurent au moins, pour
  `POST /v1/segments` (codes lus à `1178657`) : bloc fautif (400 `invalid-media-block`), horodatage
  futur (400 `invalid-capture-time`), session arrêtée (400 `session-stopped`), séquence réutilisée avec
  un autre contenu (409 `sequence-conflict`), séquence ancienne (409 `stale-sequence`), capture relancée
  (409 `capture-changed`), archive en lecture seule (409 `read-only`), préparation du bloc précédent
  (429 `preparation-busy`), session en cours d'arrêt (503 `session-closing`), outil média indisponible
  (503 `media-unavailable`), stockage plein (507 `storage-full`), corps trop grand (413
  `request-too-large`), jeton faux (401 `unauthenticated`) ; et pour `POST /v1/session/start` : archive
  en lecture seule (409 `read-only`). La valeur de `capture` est lue dans `tv/transport.py` pour les
  blocs et dans `tv/capture.py` (l.73-81) pour le démarrage, pas devinée.
- `tests/fixtures/wire-v1/README.md` : d'où vient la table, la règle « un statut, un code ou un message
  ne s'y modifie pas pour faire passer un test », et qui peut y ajouter une ligne.
- `tests/wire-refusals.test.cjs`.

À ne pas toucher :

- Le code de production : `core/`, `server/`, `runtime/`, `adapters/`, `tv/`. Si le serveur rend autre
  chose que ce que les ADR 0006 et 0042 décident, la table note ce que le serveur rend et le journal du
  ticket signale l'écart.
- Les tests existants.
- Les aides d'attente et d'horloge de `tests/helpers/` (`wait.cjs`, `clock.cjs`) : livrées depuis par
  T055 et T058, elles s'importent telles quelles et ne se modifient pas dans ce ticket.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/wire-refusals.test.cjs` passe, hors ligne. Pour chaque ligne de `refusals.json`,
   il provoque la cause sur un vrai `RemoteServer` devant un vrai `HeadlessRuntime` et exige que la
   réponse HTTP ait exactement le statut, le code (présent ou absent) et le message de la ligne. Aucune
   ligne n'est sautée.
2. Le même fichier prouve trois invariants sur la table entière :
   - le statut 507 et le code `storage-full` n'apparaissent que pour la cause de stockage plein ;
   - sur `/v1/session/start`, le statut 409 n'apparaît que pour la lecture seule ;
   - sur `/v1/segments`, toute cause marquée `retry` a un statut 408, 429 ou d'au moins 500, et toute
     cause marquée `rejected` a un statut de 400 à 499 hors 408 et 429.
3. Le même fichier prouve que chaque refus qui porte un code arrive au vrai `RemoteClient` de
   `tv/app/remote-client.js` avec ce statut et ce code.
4. Le test n'écrit rien sous `tests/fixtures/` et ne régénère pas la table.
5. `node --test tests/architecture-f06.test.cjs` passe sans qu'une ligne de ce fichier ait changé.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/wire-refusals.test.cjs`, nouveau.
Frontière : HTTP réel sur `127.0.0.1` devant un `RemoteServer` et un `HeadlessRuntime`, les causes
provoquées par les moyens que les tests existants emploient déjà (horloge injectée, garde de disque
factice, assembleur différé).

## Hypothèses bloquantes

Aucune décision n'est attendue. Si une cause de la liste ne peut être provoquée qu'en modifiant le code
de production : verdict BLOQUÉ, avec la cause nommée. Si deux causes que la capture devrait distinguer
arrivent avec le même statut et le même code, la table les note telles quelles et le journal du ticket
le signale ; rien n'est corrigé dans ce ticket.

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à
  jour à `1178657` : ingestion dans `server/ingest-routes.cjs`, admission dans
  `runtime/capture-intake.cjs`, démarrage dans `runtime/headless-session-lifecycle.cjs`, codes désormais
  portés par chaque refus, règle du 507 de la capture changée par T189, ADR 0041 et 0042 et
  `tests/wire-contract.test.cjs` ajoutés aux sources. T038 a livré `tests/helpers/server-host.cjs`, pas
  `wire-host.cjs`. Les aides `wait.cjs` et `clock.cjs` existent : elles se réutilisent sans
  modification. `core/` ajouté au code de production à ne pas toucher : des codes publics y naissent.
  Critère 1 seulement remis à la ligne. Bloqueurs revus : T145 retiré (file rouverte), T038 gardé
  (terminé), T294 ajouté (le ticket passe après la file en cours).
