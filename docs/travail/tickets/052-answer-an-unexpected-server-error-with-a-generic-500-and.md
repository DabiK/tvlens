---
id: T052
titre: Answer an unexpected server error with a generic 500 and journal it
statut: a-faire
bloque_par: T036, T051, T145
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le serveur répond aujourd'hui 400 avec le message brut à toute erreur qu'il ne connaît pas : une
erreur de programmation ou une erreur du système (chemin compris) part vers la TV comme un refus de la
requête, et la TV abandonne un bloc que le serveur aurait pu accepter au tour suivant. Après ce
ticket, une erreur inconnue répond `500` avec un texte et un code génériques, elle est écrite au
journal avec son détail, et tout le reste répond comme avant. Un ADR fixe la règle.

## Sources

- Constats : SEC-01
- Code vérifié à la version `0d5a954` (chercher par nom, les lignes bougeront) :
  - `server/http.cjs`, classe `RemoteServer`, `constructor({ runtime, media, token })` (l.6), `catch`
    général de `handle` (l.275-290), ici resserré :

    ```js
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error?.code === STORAGE_FULL) return send(507, { error: error.message, code: "storage-full" });
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 400;
      send(status, { error: error.message, ...(typeof error?.code === "string" && status !== 400 ? { code: error.code } : {}) });
    }
    ```

    Une valeur levée qui vaut `null` ou `undefined` fait lever ce `catch` lui-même (`error.message`
    sans garde).
  - Erreurs voulues qui doivent garder leur réponse : les refus à statut du runtime
    (`runtime/headless-runtime.cjs`, `refusal(status, message, code)` l.69), dont
    `refusal(400, "Vue d’état inconnue.")` (l.448), le seul texte de 400 que le panneau de la TV
    lit ; les refus des règles applicatives, des `Error` simples avec un message français et sans
    statut (400) ; les erreurs à statut de l'assemblage (`adapters/remote-media.cjs`, `unavailable(message, cause)` l.43 : 503 `media-unavailable`) ;
    `adapters/local-store.cjs`, `refusal(names, cause)` (l.11) : `Error` avec message français et
    `code` d'errno, sans `syscall`.
  - Clients de la TV : `tv/transport.py`, `refusal(error)` (l.22-29) et l'envoi d'un bloc — abandon
    quand `status < 500 and status not in (408, 429)`, nouvel envoi sinon, jusqu'à l'échéance ;
    `tv/app/companion.js`, `tvlensViewRefusal` (l.240-244) — 404, ou 400 dont le texte correspond à
    `/vue d.état inconnue/i` : serveur sans vues ; tout autre 400 : refus passager, l'état complet est
    lu à la place ; tout autre statut : panne, espacée par `TvlensPollPlan` ;
    `tv/app/remote-client.js`, `refusal()` recopie `error` et `code`.
  - Codes publiés par le serveur aujourd'hui, en minuscules avec tirets : `storage-full`,
    `media-unavailable`, `read-only`, `session-closing`.
- Tests modèles : `tests/architecture-f06.test.cjs` (vrai `RemoteServer`, test l.360) ;
  `tests/test_tv_control.py`, `test_recovery_and_ambiguous_ack_retry_same_sequence` (l.105) et
  `test_full_storage_is_an_answer_of_the_server_never_a_network_cut` (l.120), qui pose un refus sur
  le faux serveur (`self.refuse`, l.121) puis le retire (l.128) ; `tests/tv-panel.test.cjs`,
  « a passing 400 on a view is not a server without views… » (l.120) et « an outage backs the polls
  off… » (l.145), avec l'aide `drivePolls` (l.107).

## Périmètre

- À modifier : `server/http.cjs` ; la composition qui construit `RemoteServer` pour lui passer le
  journal livré par le jalon `journal` (`server/main.cjs` l.40, et tout autre appelant trouvé par
  `grep -rn "new RemoteServer(" server runtime app mcp`) ; un fichier de test du serveur ;
  `tests/test_tv_control.py` ; `tests/tv-panel.test.cjs` ; le test de contrat du jalon `contrat-fil`.
- À créer : un ADR dans `docs/adr/`, numéro suivant (0011 à la version `0d5a954`), qui dit ce qu'est
  une erreur inconnue, pourquoi elle répond 500 et ce que les clients en font.
- Forme retenue. Une erreur est inconnue quand elle n'a pas de statut HTTP valide, n'est pas
  `STORAGE_FULL`, et que l'une de ces conditions est vraie : ce n'est pas une instance d'`Error` ;
  c'est un `TypeError`, un `RangeError`, un `ReferenceError` ou un `SyntaxError` ; elle porte un
  `syscall` de type chaîne (erreur brute du système). Elle répond
  `500 { error: "Erreur interne du serveur.", code: "internal-error" }` et le journal reçoit l'erreur
  d'origine avec la méthode et la route. Toute autre erreur garde exactement sa réponse d'aujourd'hui.
- Le code `internal-error` est un ajout dans la famille des codes publiés par le serveur ; aucun code
  existant n'est renommé.
- Conséquence acceptée, à écrire dans l'ADR : une requête dont le corps mal formé fait lever un
  `TypeError` dans une méthode du runtime répondait 400 et répond désormais 500. Le client d'envoi de
  la TV renvoie alors le bloc jusqu'à son échéance au lieu de l'abandonner tout de suite ; le panneau
  tient une vue qui répond 500 pour une panne et espace ses lectures, au lieu de lire l'état complet
  à la place.
- À ne pas toucher : les réponses 400 des refus voulus et leurs textes ; 409, 429, 503, 507 ; la
  lecture du corps (`JSON invalide.`) ; `tv/transport.py` et `tv/app/` (le ticket prouve leur
  comportement, il ne le change pas).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Vrai `RemoteServer` devant un runtime de test dont une méthode lève un `TypeError` : la route
   répond exactement `500 { error: 'Erreur interne du serveur.', code: 'internal-error' }` ; le corps
   ne contient pas le message d'origine. Même réponse quand la méthode lève une valeur qui n'est pas
   une `Error` (une chaîne, puis `null`).
2. Même montage avec une erreur du système réelle (lecture d'un fichier absent, qui porte `syscall` et
   un chemin) : même réponse 500 ; le corps ne contient pas le chemin.
3. Dans les deux cas, le journal de test reçoit une entrée qui porte l'erreur d'origine, la méthode et
   la route ; aucune entrée pour un refus voulu.
4. Inchangés, exigés dans le même test : une `Error` simple sans statut répond 400 avec son message ;
   une erreur de statut 503 avec code répond 503 avec ce code ; `STORAGE_FULL` répond 507
   `storage-full` ; une erreur construite comme celle de `refusal` de `adapters/local-store.cjs`
   (message français, `code: 'EACCES'`, pas de `syscall`) répond 400 avec son message ; une erreur
   de statut 400 portant « Vue d’état inconnue. » répond 400 avec ce texte, que
   `tvlensViewRefusal` reconnaît encore (`'unknown'`).
5. Client d'envoi de la TV : un bloc qui reçoit `500 {"error": "Erreur interne du serveur.", "code":
   "internal-error"}` puis 200 est renvoyé avec la même séquence et compté accepté. Cas ajouté dans
   `tests/test_tv_control.py`, le refus étant posé puis retiré sur le faux serveur comme dans
   `test_full_storage_is_an_answer_of_the_server_never_a_network_cut`.
6. Panneau de la TV : une vue qui répond 500 avec le code `internal-error` est traitée comme une
   panne (`tvlensViewRefusal` rend `null`, les lectures s'espacent), pas comme une vue inconnue. Cas
   ajouté dans `tests/tv-panel.test.cjs`.
7. Le test de contrat livré par le jalon `contrat-fil` exige la réponse du critère 1 (statut, texte
   et code) parmi les réponses de `/v1`.
8. `node --test --test-concurrency=1 tests/architecture-f06.test.cjs tests/server-sessions.test.cjs tests/server-state-views.test.cjs tests/remote-server.test.cjs tests/tv-panel.test.cjs`
   passe sans qu'aucune assertion existante soit modifiée ;
   `python3 -B -m unittest discover -s tests -p "test_tv_control.py"` passe ; `node scripts/check.mjs`
   est vert.

## Test d'acceptation attendu

Un test du serveur par la frontière HTTP d'un vrai `RemoteServer` construit avec un runtime de test et
un journal de test, dans le fichier que le jalon `contrat-fil` consacre au contrat `/v1` (à défaut,
dans `tests/server-sessions.test.cjs`). Les preuves côté client sont les cas ajoutés dans
`tests/test_tv_control.py` et `tests/tv-panel.test.cjs`.

## Hypothèses bloquantes

Aucune décision n'est attendue. La forme est celle retenue par la relecture de l'audit (400 pour un
refus voulu, 500 générique pour l'inconnu). Si un test existant exige 400 avec le message brut pour
une erreur de programmation ou une erreur du système : verdict BLOQUÉ, avec le nom du test ; il n'est
ni affaibli ni supprimé. De même, si l'exploration trouve une route où une erreur brute du système est
l'issue d'un parcours normal du client (par exemple un média demandé qui n'existe plus) : verdict
BLOQUÉ, avec la route ; la réponse voulue pour ce cas est une règle à décider, pas à inventer ici.
Enfin, si le journal livré par le jalon `journal` ne peut pas être passé à `RemoteServer` par son
constructeur, ou si le jalon `contrat-fil` n'a livré aucun test de contrat où ajouter la réponse 500 :
verdict BLOQUÉ, avec l'écart constaté.

## Journal
