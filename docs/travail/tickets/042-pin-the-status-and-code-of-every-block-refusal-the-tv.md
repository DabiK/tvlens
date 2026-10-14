---
id: T042
titre: Pin the status and code of every block refusal the TV capture reads
statut: a-faire
bloque_par: T038, T145
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
- Code vérifié à la version `0d5a954` :
  - `server/http.cjs`, `handle`, bloc `POST /v1/segments` lignes 220-273 : `validateRemote` ligne 221 ;
    `runtime.admit` ligne 224 ; « Horodatage futur. » lignes 225-226 ; doublon et 409 « Séquence déjà
    utilisée avec un autre contenu. » lignes 238-244 ; 409 « Séquence ancienne. » lignes 245-246 ; 429
    « Préparation du passage précédent. » lignes 247-248 ; `catch` lignes 275-290 : 507 `storage-full`
    lignes 278-279, statut par défaut 400 lignes 280-283, code retiré d'un 400 ligne 286. 413 lignes
    161-170, sans code ; 401 lignes 52-58.
  - `runtime/headless-runtime.cjs` : `refusal(status, message, code)` lignes 69-70 ; `closing()` (503
    `session-closing`) lignes 73-74 ; `start()` lignes 658-663 (409 `read-only` ligne 663) ;
    `admit(sessionId)` lignes 695-708 (409 `read-only` ligne 697, stockage plein lignes 699-706, « La
    session est arrêtée. » sans statut propre ligne 707) ; `ingest`, 409 `capture-changed` lignes
    783-787.
  - `adapters/remote-media.cjs` : `validateRemote` ligne 29 ; `unavailable` (503 `media-unavailable`)
    ligne 43. `adapters/disk-guard.cjs` : `STORAGE_FULL` ligne 4.
  - `tv/transport.py`, `Transport.deliver` lignes 50-95 : 507 ou code `storage-full` arrête pour
    stockage (lignes 79-81) ; 409 avec code `read-only` arrête pour lecture seule (lignes 82-84) ; tout
    autre statut sous 500, hors 408 et 429, rejette le bloc et note `HTTP <statut>` (lignes 85-88) ; le
    reste est renvoyé (lignes 89-92).
  - Tests qui provoquent déjà ces refus, à prendre pour modèles sans les modifier :
    `tests/architecture-f06.test.cjs` lignes 323 (capture relancée), 343 (session en cours d'arrêt), 360
    (outil média indisponible), 536 (doublons, anciens numéros, corps bornés) ;
    `tests/server-sessions.test.cjs`, aides `refusing` ligne 21 et `disk` ligne 32.
- `docs/adr/0006-…md`, décisions 12 et 13 (lignes 48 et 57) : la table des statuts de `POST /v1/segments`
  y est déjà décidée. Le ticket la fige par un test, il ne la redécide pas.
- Livré par T038 : `tests/helpers/wire-host.cjs`.

## Périmètre

À créer :

- `tests/fixtures/wire-v1/refusals.json` : une ligne par refus, avec `route`, `cause` (un nom stable, en
  anglais), `status`, `code` (ou `null`), `message`, et `capture` : ce que la capture en fait
  aujourd'hui, l'une de `retry`, `rejected`, `stop-storage`, `stop-read-only`. Y figurent au moins, pour
  `POST /v1/segments` : bloc fautif (400), horodatage futur (400), session arrêtée, séquence réutilisée
  avec un autre contenu (409), séquence ancienne (409), capture relancée (409 `capture-changed`), archive
  en lecture seule (409 `read-only`), préparation du bloc précédent (429), session en cours d'arrêt (503
  `session-closing`), outil média indisponible (503 `media-unavailable`), stockage plein (507
  `storage-full`), corps trop grand (413), jeton faux (401) ; et pour `POST /v1/session/start` : archive
  en lecture seule (409 `read-only`). La valeur de `capture` est lue dans `tv/transport.py`, pas devinée.
- `tests/fixtures/wire-v1/README.md` : d'où vient la table, la règle « un statut, un code ou un message
  ne s'y modifie pas pour faire passer un test », et qui peut y ajouter une ligne.
- `tests/wire-refusals.test.cjs`.

À ne pas toucher :

- Le code de production : `server/`, `runtime/`, `adapters/`, `tv/`. Si le serveur rend autre chose que
  ce que l'ADR 0006 décide, la table note ce que le serveur rend et le journal du ticket signale l'écart.
- Les tests existants.
- Les aides d'attente et d'horloge de `tests/helpers/` (`wait.cjs`, `clock.cjs`) : elles appartiennent à
  lot:L05. Une cause qui demande un assembleur différé attend la promesse de son double, sans aide
  d'attente partagée.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/wire-refusals.test.cjs` passe, hors ligne. Pour chaque ligne de `refusals.json`, il provoque la cause sur
   un vrai `RemoteServer` devant un vrai `HeadlessRuntime` et exige que la réponse HTTP ait exactement le
   statut, le code (présent ou absent) et le message de la ligne. Aucune ligne n'est sautée.
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
