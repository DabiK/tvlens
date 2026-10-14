---
id: T089
titre: Pin the Codex transport protocol with a scripted app server
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le transport Codex (`CodexRpc`) lit un flux de lignes JSON, répond aux demandes du serveur et rejette les
requêtes en attente à la fermeture. Les tests exigent aujourd'hui le décodage d'un caractère accentué coupé
et trois messages d'erreur (transport non démarré, échéance, fermeture par `close()`) ; le découpage des
lignes, les réponses aux demandes du serveur et la sortie d'un serveur qui s'arrête seul ne le sont pas.
Après ce ticket, une table de cas, jouée contre un faux serveur d'application lancé comme un vrai binaire,
exige le comportement actuel du protocole sur les points qu'aucun test n'exige encore : un refactor de
l'adaptateur Codex ne peut plus le changer sans qu'un test nommé échoue.

Aucun code de production n'est modifié.

## Sources

- Constats : TSTB-07
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `adapters/codex-rpc.cjs`, classe `CodexRpc` (ligne 56) :
    - `start()` (ligne 58) ; lecture de la sortie standard (ligne 67) : le tampon est découpé par ligne,
      chaque ligne est passée à `receive(JSON.parse(line))` dans un `try`/`catch` vide ; au-delà de
      4 000 000 caractères sans fin de ligne, le transport se ferme (`close()`) ;
    - `send(value)` (ligne 71) : « Codex déconnecté. » quand l'entrée du processus n'est pas ouverte ;
    - `request(method, params, timeoutMs = 15000)` (ligne 72) : « Codex : délai de connexion dépassé
      (<méthode>). » à l'échéance ;
    - `receive(message)` (ligne 73) : une demande du serveur (`method` et `id`) est passée à `onRequest`
      dans un `Promise.resolve(...)` et reçoit `{ id, result }` (`{}` quand `onRequest` ne rend rien) ou, si la
      promesse rendue par `onRequest` est rejetée, `{ id, error: { code: -32601, message: 'Action non
      autorisée.' } }` (ligne 74) ; une exception levée de façon synchrone par `onRequest` sort de `receive`
      et finit dans le `catch` vide de la lecture : rien n'est répondu ; une notification
      (`method` seul) est passée à `onEvent` (ligne 75) ; une réponse à un identifiant inconnu est ignorée,
      une réponse portant `error` rejette la requête par « Codex : requête refusée. Vérifie le modèle
      sélectionné et la connexion. » (ligne 76) ;
    - `fail()` (ligne 78) : rejette les requêtes en attente par « Connexion Codex interrompue. » et émet
      `connection/closed` ; appelée à la sortie du processus (`child.on('exit')`, ligne 64) et par `close()`
      (lignes 82-89). Après un débordement, le tampon n'est jamais vidé : chaque bloc reçu ensuite rappelle
      `close()`, donc `connection/closed` peut être émis plusieurs fois.
  - Modèle de test : `tests/codex-stream-decoding.test.cjs`, test « an accented character split across two
    pipe chunks reaches the client intact » (ligne 8) — un script Node écrit dans un dossier temporaire
    (ligne 12) tient lieu de serveur, `new CodexRpc({ binary, args: [], cwd: dir, env: process.env,
    onEvent })` (ligne 22).
- Mesure du constat : `grep -ln "codex-rpc" tests/*.test.cjs` rend quatre fichiers :
  `tests/codex-stream-decoding.test.cjs`, `tests/codex-confinement.test.cjs`,
  `tests/architecture-f05.test.cjs` et `tests/architecture-f08.test.cjs`.
- Déjà exigé, à ne pas doubler : le test « the messages the adapter relies on are the ones the Codex pipe
  really writes; the one a closed process also answers is left out » de `tests/architecture-f08.test.cjs`
  (ligne 291) exige « Codex déconnecté. » sur un transport jamais démarré, « Codex : délai de connexion
  dépassé (<méthode>). » à l'échéance et « Connexion Codex interrompue. » pour une requête en attente quand
  `close()` est appelé.
- Voisins qui changeront ce transport, à ne pas figer ici : le lot L04 fait rejeter le tour actif quand le
  gestionnaire d'événement lève une exception (en gardant ignorée une ligne qui n'est pas du JSON et en
  laissant sans réponse une exception synchrone de `onRequest`), et ajoute une cause aux refus et à la
  fermeture par débordement.

## Périmètre

- À créer : `tests/codex-transport-protocol.test.cjs`.
- À modifier si nécessaire : rien d'autre. Le faux serveur est un script écrit par le test dans un dossier
  temporaire, comme dans le modèle ; il n'est pas ajouté au dépôt.
- À ne pas toucher : `adapters/codex-rpc.cjs`, tout autre code de production, les tests existants.
- Ce que le ticket ne fige pas, parce que le lot L04 le change : ce qui arrive quand `onEvent` lève une
  exception ; ce qui arrive quand `onRequest` lève de façon synchrone ; l'absence de `cause` sur une erreur ;
  le texte de l'erreur reçue par une requête en attente au moment d'un débordement ; les paramètres et le
  nombre d'émissions de `connection/closed`.
- Ce que le ticket ne double pas : les trois cas déjà exigés par `tests/architecture-f08.test.cjs` (voir
  Sources). Un cas qui toucherait un de ces points
  n'exige que ce qui est stable (voir critère 3).
- Aucune attente à durée fixe pour deviner un état : le test attend un événement (`connection/closed`, une
  notification d'écho, la fin d'une promesse). Chaque `test(` porte un `{ timeout }`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/codex-transport-protocol.test.cjs` passe. Le faux serveur renvoie en notification
   chaque ligne qu'il reçoit sur son entrée, ce qui permet d'exiger ce que le transport lui écrit. Un
   `test(` par règle :
   - une ligne qui n'est pas du JSON, placée entre deux notifications, n'arrête pas la lecture : les deux
     notifications arrivent dans l'ordre ;
   - plusieurs messages dans un même bloc d'écriture arrivent tous, dans l'ordre ;
   - une réponse `{ id, result }` résout la requête correspondante avec ce résultat ;
   - une réponse `{ id, error }` rejette la requête par la phrase fixe de la ligne 76, sans le détail envoyé
     par le serveur dans `message` ;
   - une réponse à un identifiant jamais émis ne produit ni événement ni rejet, et la requête en cours reste
     en attente jusqu'à sa propre réponse ;
   - une demande du serveur reçoit `{ id, result }` avec ce que rend `onRequest`, et `{ id, result: {} }`
     quand `onRequest` ne rend rien ;
   - une demande du serveur dont `onRequest` rend une promesse rejetée reçoit `{ id, error: { code: -32601,
     message: 'Action non autorisée.' } }` ;
   - une réponse qui arrive après l'échéance de sa requête (`timeoutMs` de quelques dizaines de
     millisecondes passé en argument, réponse envoyée par le faux serveur sur ordre du test une fois le rejet
     observé) ne produit ni événement ni second règlement, et la requête suivante est servie normalement ;
   - quand le serveur s'arrête de lui-même (sans `close()`), les requêtes en attente sont rejetées par
     « Connexion Codex interrompue. » et `connection/closed` est émis.
2. Le cas du débordement : le faux serveur écrit plus de 4 000 000 caractères sans fin de ligne, puis une
   notification. Le test exige que `connection/closed` soit émis au moins une fois, que la requête en attente
   soit rejetée par une `Error`, et, une fois la sortie du processus observée (`exit` de `rpc.child` capté
   avant le débordement), que la notification suivante ne soit jamais arrivée. Il n'exige ni le texte de
   cette erreur, ni les paramètres, ni le nombre d'émissions de l'événement.
3. `grep -n "cause" tests/codex-transport-protocol.test.cjs` ne montre aucune assertion sur l'absence d'une
   cause, et aucun cas n'exige l'issue d'une exception levée par `onEvent` ni d'une exception synchrone de
   `onRequest`.
4. Preuve que les tests protègent, à consigner au journal avec commande et sortie : en remplaçant
   provisoirement `code:-32601` par `code:-32600` dans `receive` de `adapters/codex-rpc.cjs`, le cas correspondant
   échoue. Le remplacement est retiré avant la fin de la session.
5. `node --test --test-concurrency=1 tests/codex-transport-protocol.test.cjs` passe dix fois de suite ;
   commande et décompte au journal. Aucun processus du faux serveur ne survit à la fin du fichier
   (`close()` attendu dans un `t.after`).
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/codex-transport-protocol.test.cjs`, neuf. Frontière : la classe publique `CodexRpc` devant un vrai
processus enfant qui joue un scénario écrit par le test.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si le lot L04 a déjà modifié `adapters/codex-rpc.cjs` quand la session
commence, les cas sont écrits contre le comportement lu dans le code à ce moment-là et le journal note les
écarts avec ce ticket. Si un cas ne peut être rendu déterministe sans modifier le code de production :
verdict BLOQUÉ pour ce cas, avec la sortie qui le montre ; le test n'est ni relancé ni assoupli.

## Journal
