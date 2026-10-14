---
id: T039
titre: Journal every refused HTTP request with its route, status and block identity
statut: a-faire
bloque_par: T036
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Quand le serveur refuse un bloc de capture, la cause part dans la réponse et n'est gardée par personne :
après coup, rien ne dit quel bloc de quelle session a été refusé, ni pourquoi. Après ce ticket, chaque
réponse de statut 400 ou plus laisse une ligne au journal, avec la route, le statut, le code, et pour un
bloc sa session et sa séquence ; un bloc stocké laisse une ligne de niveau `debug`. Aucune réponse ne
change : ni statut, ni code, ni message.

## Sources

- Constats : GAP1-02
- Code vérifié à la version `0d5a954` :
  - `server/http.cjs`, classe `RemoteServer` : constructeur lignes 6-17 ; `handle` lignes 26-291 ;
    `send` local lignes 34-41 ; 401 lignes 52-58 ; `try` ligne 66, avec `url`, `route` et `runtime`
    déclarés dans le `try` (lignes 68-70) et `body` ligne 174 : le `catch` (lignes 275-290) ne les voit
    pas ; miniature, `catch` muet lignes 122-124 ; bloc `/v1/segments` lignes 220-273 (`validateRemote`
    ligne 221, `runtime.admit` ligne 224, 409 lignes 238-246, 429 lignes 247-248, `runtime.ingest`
    ligne 258, `accepted.set` ligne 262, 200 ligne 267) ; dans le `catch`, 507 lignes 278-279, statut
    par défaut 400 lignes 280-283, code retiré quand le statut est 400 ligne 286.
  - `server/main.cjs` : `main()` lignes 22-45 ; `new RemoteServer({runtime, media, token})` ligne 40.
  - `runtime/headless-runtime.cjs` : `this.boot` ligne 250.
  - `tests/test_tv_control.py`, `DeliveryTests`,
    `test_archive_open_read_only_stops_by_name_and_a_plain_conflict_stays_a_rejected_block` ligne 131 :
    la capture attend `errors == ['HTTP 409']` (ligne 137) ; ce que la TV écrit de son côté n'est pas
    l'objet de ce ticket.
- Livré par T036 : `runtime/journal.cjs` (`createJournal`, clé de borne facultative de `event`),
  `adapters/journal-stderr.cjs`, `tests/helpers/journal.cjs`.

## Périmètre

À modifier :

- `server/http.cjs` : `RemoteServer` reçoit une option `journal` (un `JournalPort`) ; sans elle, rien
  n'est écrit. `send` émet `http.refused` quand le statut est 400 ou plus, avec `route`, `status`, `code`
  quand la réponse en porte un, et pour `/v1/segments` `sessionId` et `sequence` quand le corps les
  donne. Le `catch` n'ajoute que `error`. `route` et `body` sont déclarés avant le `try`, pour que le
  `catch` les lise sans lever. La route écrite est normalisée : un identifiant placé dans le chemin
  (session, passage, miniature) est remplacé par un marqueur, jamais écrit dans `route`. Les 401 sont
  émis avec une clé de borne constante (quatrième argument de `event`, livré par T036) : une TV mal
  appairée interroge chaque seconde. Tout autre refus sort sans clé de borne, donc à chaque fois. Après
  `accepted.set`, `ingest.stored` est émis en `debug` avec `sessionId`, `sequence` et `passageId`.
- `server/main.cjs` : compose le journal (`createJournal` avec le puits de `adapters/journal-stderr.cjs`
  et la base `{ host: 'server', boot: runtime.boot }`) et le passe à `RemoteServer`. Le mode service du
  puits n'est pas activé et aucune variable d'environnement nouvelle n'est lue. Les lignes existantes de
  `console.log` et `console.error` restent telles quelles.

À créer :

- `tests/http-refusal-journal.test.cjs`. Il monte son hôte hors ligne sur le modèle de `fixture`
  (`tests/server-sessions.test.cjs` ligne 73) ; il ne dépend pas de `tests/helpers/wire-host.cjs`, que
  livre un autre ticket.

À ne pas toucher :

- Le texte, le statut et le code de toute réponse ; le retrait du code des 400 (ligne 286).
- `tv/`, `runtime/`, `core/`. Les tests existants.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/http-refusal-journal.test.cjs` passe, hors ligne. Le fichier monte un `RemoteServer`
   devant un `HeadlessRuntime` avec le puits mémoire et prouve, par des requêtes HTTP réelles :
   - un bloc refusé pour séquence ancienne (409) laisse exactement une ligne `http.refused` portant
     `route: '/v1/segments'`, `status: 409`, `sessionId` et `sequence` du bloc ;
   - un bloc refusé avec un code (507 `storage-full` ou 409 `read-only`) laisse une ligne qui porte ce
     code ;
   - un corps qui n'est pas du JSON (400) et un corps trop grand (413) laissent chacun une ligne, sans
     `sessionId` ;
   - une route inconnue (404) et une miniature absente laissent une ligne dont `route` ne contient aucun
     identifiant de session ni de passage ;
   - dix requêtes sans jeton valide dans la même fenêtre laissent une seule ligne `http.refused` de
     statut 401 ; l'horloge du journal avancée au-delà de la fenêtre, la onzième laisse une ligne portant
     `repeated: 9` ; deux blocs refusés 409 dans la même fenêtre laissent deux lignes ;
   - un bloc accepté laisse une ligne `ingest.stored` de niveau `debug` et aucune ligne `http.refused` ;
   - aucune ligne ne porte de texte du corps reçu : ni question, ni image, ni transcription.
2. Le même test compare, pour chaque cas, la réponse HTTP reçue (statut et corps) à celle qu'un serveur
   monté sans journal rend pour la même requête : elles sont identiques.
3. Une erreur levée avant la lecture du corps (une vue d'état inconnue sur `GET /v1/state`, refusée 400)
   est répondue comme aujourd'hui, laisse une ligne portant `route: '/v1/state'` sans `sessionId`, et la
   requête suivante est servie.
4. `node --test tests/server-sessions.test.cjs tests/architecture-f06.test.cjs` passe sans qu'une ligne
   de ces fichiers ait changé.
5. `grep -n "createJournal" server/main.cjs` et `grep -n "journal" server/main.cjs` montrent le journal
   composé et passé à `RemoteServer` ; `grep -n "JOURNAL_STREAM" server/main.cjs` ne rend rien. Aucun
   test ne lance `main()` : ce câblage n'est constaté que par ces commandes.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/http-refusal-journal.test.cjs`, nouveau.
Frontière : HTTP réel sur `127.0.0.1` devant un `RemoteServer` et un `HeadlessRuntime`, le journal
observé par le puits mémoire passé en option.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si émettre la ligne oblige à changer une réponse, ou si un test existant
compare les options de `RemoteServer` d'une façon que l'option `journal` casse : verdict BLOQUÉ, avec
l'écart constaté.

## Journal
