---
id: T299
titre: Accept a declared sound-only block on the server
statut: a-faire
bloque_par: T298
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le serveur accepte un bloc de capture qui déclare « son seul » : sans image, avec son obligatoire. Il en fabrique un
clip audio rejouable et le remet au cœur comme passage son seul (T298). Un bloc sans image et sans déclaration reste
refusé comme aujourd'hui.

## Sources

- Décision du propriétaire, le 19/10 : analyser le son seul quand l'image est noire ; chantier en premier.
- Choix de l'orchestrateur, le 19/10 : la déclaration voyage dans le bloc (un champ facultatif, précédent de
  `overlay` ignoré en `adapters/remote-media.cjs:149` et ADR 0038) ; le passage garde un clip, audio seul en WebM
  Opus, pour ne toucher ni au stockage ni aux baux (`adapters/local-store.cjs:37-43`, `:53`, `:105-117`).
- Code à `c35cd02` :
  - `server/ingest-routes.cjs` : `validateRemote(body)` (`:9`), empreinte (`:22-23`), `media.assemble` (`:41`),
    `runtime.ingest` (`:42`) ;
  - `adapters/remote-media.cjs` : images obligatoires (`:26-27`), ordre et cadrage (`:28-41`), son facultatif (`:42`,
    `:107`), clip fabriqué à partir des images (`:122-131`, avec zéro image `:127` écrirait `file '-1.jpg'`) ;
  - `server/http.cjs:75-76` : `TVLENS_MEDIA_BLOCK_INVALID` en 400 `invalid-media-block` ;
  - `adapters/session-thumbnails.cjs:25-29` : miniature refusée sans image ;
  - contrat de segment de T297 (`runtime/segment-contract.cjs`).
- Un ancien serveur répond 400 `invalid-media-block` à un bloc son seul ; la TV le compte `deliveryRejected`
  (`tv/transport.py:79`, `:88-91`) : ADR 0042, ajout au fil dans l'ordre tests, serveur, client.
- Tests : `tests/remote-media.test.cjs:63`, `tests/server-ingest-path.test.cjs:166-195`,
  `tests/wire-contract.test.cjs:230-260` (cas `:246`), `tests/local-stream-replay.test.cjs:337`.

## Périmètre

- À modifier : `adapters/remote-media.cjs`, `runtime/segment-contract.cjs`, `server/ingest-routes.cjs` si besoin, leurs
  tests, et la documentation du fil si elle décrit le bloc (`docs/` ; `tv/` n'est pas touché ici).
- Un bloc qui déclare son seul : zéro image exigée, son exigé et décodable ; clip WebM audio seul ; passage remis au
  cœur avec la déclaration de T298 ; aucune miniature tentée.
- Un bloc sans image et sans déclaration : refus actuel, même code et même message.
- Un bloc qui déclare son seul mais porte des images : refus nommé (déclaration incohérente).
- À ne pas toucher : la capture TV (T301), le Mac, `core/` hors de ce que T298 expose.

## Critères d'acceptation

1. Par le chemin HTTP réel (`tests/server-ingest-path.test.cjs`), un bloc son seul est accepté, son clip audio se
   relit, et le passage du cœur est déclaré son seul. Le test échoue avant la correction.
2. Les refus existants pour un bloc sans image non déclaré passent sans modification.
3. Son seul sans son, ou son seul avec images : refus 400 avec un code nommé.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/server-ingest-path.test.cjs` : un bloc son seul, du corps HTTP au passage du cœur.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : le chantier « son seul » (T297 à T302) passe en tête de file, après T225.
