---
id: T094
titre: Pin the answer of every server command route to a malformed request
statut: a-faire
bloque_par: T047, T048, T049, T050, T052, T054, T065
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le serveur HTTP de la TV expose, hors `/v1/segments`, seize routes de commande en `POST`. Les tests les appellent avec des corps
valides ; aucune table ne dit ce que chacune répond à un corps mal formé, à un champ du mauvais type, à un
identifiant inconnu ou à une commande hors de son état. Un refactor des hôtes ou du serveur peut changer un
statut, laisser passer une exception brute ou répondre 200 à une requête absurde sans qu'un test échoue.

Après ce ticket, une table de cas exige, route par route, le statut, le code (quand la réponse en porte un)
et l'absence de tout texte d'exception brut dans la réponse. Les refus des blocs vidéo (`/v1/segments`),
figés par le lot L17, n'y sont pas repris.

## Sources

- Constats : TSTB-05
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `server/http.cjs`, classe `RemoteServer` : constructeur (ligne 6) qui refuse par « Device token
    required » un jeton qui n'est pas un texte d'au moins 32 caractères (lignes 7-8) ; `handle(req, res)`
    (ligne 26) : 401 (lignes 52-58), 405 (lignes 60-65), 415 « JSON requis. » (lignes 154-159), 413 au-delà
    de 12 000 octets hors `/v1/segments` (lignes 160-170), corps illisible ou qui n'est pas un objet : 400
    « JSON invalide. » (lignes 174-180) ; routes de commande (lignes 181-219) :
    - lisent le corps : `/v1/settings/transcription` (`body.language`), `/v1/moments/detail`,
      `/v1/questions`, `/v1/surveillance/start`, `/stop`, `/retry`, `/history`, `/detail` ;
    - ne lisent pas le corps : `/v1/session/start`, `/v1/session/pause`, `/v1/session/end`,
      `/v1/sessions/close` ;
    - prennent un identifiant dans le chemin : `/v1/sessions/<id>/open|resume|delete` (identifiant pris tel
      qu'envoyé, jamais décodé), `/v1/questions/deep-<n>/cancel` ;
    - bloc `catch` final (lignes 275-290) : 507 `storage-full`, statut par défaut 400, code omis quand le
      statut est 400.
  - `runtime/headless-runtime.cjs` : `refusal(status, message, code)` (lignes 69-70) ;
    `setTranscriptionLanguage(language)` (lignes 342-351), qui appelle
    `this.options.transcriptionSettings.save(language)` (ligne 346) : un hôte monté sans
    `transcriptionSettings` ne peut pas servir cette route ; `ask` (ligne 810), `detail` (ligne 830),
    `cancel` (ligne 835), `located` (ligne 912, 404 `not-found`), `open` (ligne 983), `resume` (ligne 1018),
    `remove` (ligne 1044), `startSurveillance` (ligne 1075) à `surveillanceDetail` (ligne 1107).
  - Modèle d'hôte réglé pour la langue : `tests/transcription-language.test.cjs`, test ligne 9
    (`TranscriptionSettings` sur un dossier temporaire).
- Aides et voisins :
  - `tests/helpers/server-host.cjs`, livré par le lot L05 : `startServerHost(t, { …, runtimeOptions })`, où
    `runtimeOptions` est une fonction de l'hôte qui rend les options du runtime (par défaut `() => ({})`) ;
    rend notamment `raw(route, init)` et `req(route, body)` → `{ status, value }`.
  - Le lot L04 fixe d'abord ce que le serveur répond à un contenu refusé et à une erreur inattendue (texte
    fixe, 500 générique) : ce ticket vient après pour ne figer aucune réponse brute.
  - Le lot L17 fige les refus de `/v1/segments`, 401 et 404 compris, et le refus 409 `read-only` de
    `POST /v1/session/start` (`tests/wire-refusals.test.cjs`, fixtures `wire-v1/refusals.json`) ; ce ticket
    ne les double pas.

## Périmètre

- À créer : `tests/server-command-refusals.test.cjs`. Une table de cas en tête du fichier ; un `test(` par
  cas, généré par une boucle sur la table, chaque cas sur un hôte neuf (`startServerHost`) pour qu'aucun
  ne dépende de l'ordre. Le montage de `/v1/settings/transcription` passe une fonction `runtimeOptions` qui
  rend un `TranscriptionSettings` sur le dossier de l'hôte.
- Cas minimum de la table :
  - pour chacune des seize routes : type de contenu absent (415), corps qui n'est pas du JSON et corps
    tableau (400 « JSON invalide. ») ;
  - pour chaque route qui lit le corps : chaque champ lu, envoyé d'un mauvais type ou absent (la session
    relève les champs lus en lisant chaque méthode citée) ;
  - pour chaque route qui prend un identifiant : identifiant inconnu, identifiant contenant `..` ou `%2F`,
    identifiant de plus de 200 caractères ;
  - pour les commandes d'état : pause, fin et fermeture sans session en cours ;
  - le constructeur de `RemoteServer` avec un jeton de 31 caractères et un jeton non texte.
- Chaque cas exige en littéraux : le statut, le code s'il y en a un, et que `error`, s'il est présent, ne
  contienne ni `Error`, ni `TypeError`, ni `Cannot read`, ni `undefined`, ni un chemin absolu de la machine
  (`os.homedir()`, `os.tmpdir()`, le dossier de l'hôte). Pour une requête qui laisse la session en place, le test exige aussi que l'état
  lu ensuite par `GET /v1/state` n'a pas changé.
- À ne pas toucher : `server/`, `runtime/`, tout le code de production ; les tests existants ;
  `tests/helpers/server-host.cjs` (cité, pas modifié).
- Les statuts attendus sont ceux que le serveur répond quand la session commence, observés une fois puis
  figés. Un cas où la réponse observée est une erreur générique (500) ou un 200 pour une requête absurde est
  écrit tel quel, son titre commence par « known gap: » et dit ce qui manque ; la validation de ces champs
  à la frontière relève d'un lot ultérieur. `test.todo` n'est employé que si un cas ne peut pas être observé
  de façon stable, et chaque `todo` est listé au journal avec sa raison.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/server-command-refusals.test.cjs` passe. Sa sortie compte au moins 80 tests ; le
   décompte exact et la liste des cas « known gap: » sont consignés au journal.
2. Les seize routes de commande (hors `/v1/segments`) sont dans la table : un test du fichier compare la liste des routes de la
   table à une liste écrite en littéral des seize routes, et échoue en nommant la route manquante.
3. Aucun cas n'exige un message d'exception brut : `grep -n "TypeError\|Cannot read" tests/server-command-refusals.test.cjs`
   ne montre que la liste des textes interdits.
4. Preuve que la table protège, au journal avec commande et sortie : en remplaçant provisoirement
   `return send(415, { error: "JSON requis." });` par une réponse 400 dans `server/http.cjs`, les cas 415
   échouent ; en retirant provisoirement le refus d'un corps tableau (ligne 179), les cas « corps tableau »
   échouent. Les deux modifications sont retirées avant la fin de la session.
5. `node --test --test-concurrency=1 tests/server-command-refusals.test.cjs` passe cinq fois de suite ;
   commande, durée et décompte au journal. Aucun délai n'est allongé pour y arriver.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/server-command-refusals.test.cjs`, neuf. Frontière : les routes HTTP d'un vrai `RemoteServer` devant un
vrai `HeadlessRuntime`, montés par `startServerHost`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si `tests/helpers/server-host.cjs` n'existe pas, ou si une réponse du serveur
contient encore un texte d'exception brut alors que le lot L04 est intégré : verdict BLOQUÉ avec la route, la
requête et la réponse observées. Ce ticket ne corrige aucune route.

## Journal
