---
id: T088
titre: Pin the refusals of capture blocks, budget ledger and MCP clients
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Trois frontières refusent une entrée par une phrase fixe qu'aucun test n'exige : la validation d'un bloc de
capture (côté Mac et côté TV), le registre du budget d'essai, et l'admission des clients MCP externes. Après
ce ticket, chaque refus a un test à sa valeur limite. Un refactor des hôtes ou des adaptateurs qui perd un de
ces refus fait échouer un test nommé.

Aucun code de production n'est modifié.

## Sources

- Constats : TSTB-06
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `runtime/session-runtime.cjs`, fonction `validateSegment(input, now)` (lignes 597-631, exportée ligne 635),
    appelée par `runtime/headless-runtime.cjs` (`ingest`, ligne 789) et `app/main.cjs` (ligne 415). Quatre
    phrases : « Horodatage de capture invalide. » (entrée absente, `startMs` ou `endMs` non finis, `endMs`
    au-delà de `now + 3000`) ; « Segment vidéo trop volumineux ou vide. » (clip qui n'est pas un `Uint8Array`,
    vide, ou de plus de 20 000 000 octets) ; « Audio invalide. » (audio qui n'est pas un `Uint8Array` ou de
    plus de 2 100 000 octets) ; « Images de capture invalides. » (pas un tableau, aucune image, plus de 8
    images, `dataUrl` hors du format JPEG base64 ou de plus de 1 000 000 caractères, `atMs` hors de
    `[startMs - 100, endMs + 100]`).
  - `adapters/remote-media.cjs`, fonction `validateRemote(input)` (ligne 29, exportée ligne 122) : « Séquence
    invalide. » (ligne 30), « Intervalle invalide. » (ligne 31 : bornes non finies, `startMs < 0`,
    `endMs <= startMs`, durée de plus de 10 000 ms), « Nombre d’images invalide. » (ligne 32 : de 1 à 5),
    « Ordre des images invalide. » (ligne 34), « Cadrage invalide. » (ligne 35 : entiers, largeur et hauteur
    d'au moins 16, dans 1280×720). Le contrôle du cadrage vient après celui des données base64 de l'image
    (ligne 34) : un cas de cadrage porte des données valides. `tests/remote-media.test.cjs` (lignes 13-14)
    exige déjà « Intervalle » et « Ordre » par une expression partielle, dans un test qui demande `sharp` et
    FFmpeg. Déjà exigées et à ne pas doubler : « Média encodé invalide. » et « Média trop volumineux. » par le
    test « remote payloads are still refused when malformed or oversized, without being decoded for the
    check » de `tests/server-ingest-path.test.cjs` (ligne 60).
  - `adapters/trial-budget.cjs`, classe `TrialBudget` : `transaction(fn)` (ligne 9) — verrou `.lock` déjà
    pris : « Le compteur de budget est occupé. Réessaie dans un instant. » (ligne 13) ; registre illisible :
    « Compteur de budget illisible : appels suspendus. » (ligne 17) ; registre incohérent : « Compteur de
    budget invalide. » (ligne 21) ; `settle(id, cost)` (ligne 39) sur une réservation inconnue : « Réservation
    de budget introuvable. » (ligne 42). `tests/budget.test.cjs` (lignes 13 et 19) n'exige aujourd'hui que
    `/plafond/`.
  - `adapters/video-bridge.cjs`, classe `VideoBridge`, serveur de `start()` (ligne 10) : un client externe
    s'identifie par l'en-tête `x-tvlens-client` (ligne 22) ; un cinquième client distinct est refusé par
    « Trop de clients MCP. » (ligne 26, `this.external.size >= 4`) ; les erreurs répondent 400
    `{ error: <phrase> }` (ligne 33) ; `close()` (ligne 48). « Client MCP invalide. » est déjà exigé par
    `tests/architecture-f05.test.cjs` (ligne 564) et n'est pas doublé. Modèles : construction d'un pont sur un
    dossier temporaire dans le test ligne 527 du même fichier (`new VideoBridge({ descriptor, makeTools })`,
    ligne 530) ; en-têtes d'un client externe lignes 694-696 (`Authorization: Bearer <token>`,
    `X-TVLens-Client`).
- Voisin qui changera cette frontière, à ne pas figer ici : le lot L04 répond un texte fixe là où
  `validateRemote` lève aujourd'hui une exception brute (image `null`). Aucun cas de ce ticket ne porte une
  image qui n'est pas un objet.
- Écart connu, à écrire tel quel dans les tests sans le corriger : un bloc venu de la TV admet 5 images au
  plus (`validateRemote`), un bloc venu du Mac en admet 8 (`validateSegment`).
- Mesure du constat, à reproduire avant d'écrire chaque cas : `grep -rn "<début de la phrase>" tests/`.

## Périmètre

- À créer : `tests/capture-block-validation.test.cjs` (tables de `validateSegment` et de `validateRemote`,
  fonctions pures : ni `sharp`, ni FFmpeg, ni serveur) et `tests/video-bridge-clients.test.cjs` (admission
  des clients externes, sur un `VideoBridge` réel écoutant sur la boucle locale, avec un `makeTools` factice
  et un descriptif dans un dossier temporaire).
- À modifier : `tests/budget.test.cjs` (ajout des quatre refus du registre).
- À ne pas toucher : `runtime/`, `adapters/`, `app/`, `server/`, tout autre code de production ;
  `tests/remote-media.test.cjs` et `tests/server-ingest-path.test.cjs` ; les assertions des tests existants.
- Valeurs attendues en littéraux (3000, 20000000, 2100000, 8, 1000000, 100, 10000, 5, 16, 1280, 720, 4).
  Phrases actuelles comparées en entier.
- Un gros tampon (20 000 001 octets) est alloué une fois par cas avec `new Uint8Array(n)` et n'est ni copié
  ni écrit sur disque.
- Un refus déjà exigé par un test existant à sa valeur limite n'est pas doublé : le journal cite ce test.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/capture-block-validation.test.cjs` passe. Pour chacune des quatre phrases, au moins un cas
   refusé et le cas voisin accepté : `endMs` égal à `now + 3000` accepté et `now + 3001` refusé ; clip de
   20 000 000 octets accepté et de 20 000 001 refusé, clip vide refusé ; audio de 2 100 000 octets accepté et
   de 2 100 001 refusé ; 8 images acceptées et 9 refusées, aucune image refusée, `atMs` à `startMs - 100`
   accepté et à `startMs - 101` refusé, `dataUrl` qui n'est pas un JPEG base64 refusé.
2. Le même fichier exige, comparées en entier, les cinq phrases « Séquence invalide. », « Intervalle
   invalide. », « Nombre d’images invalide. », « Ordre des images invalide. » et « Cadrage invalide. », chacune
   avec son cas voisin accepté (séquence 0 acceptée et -1 refusée ; durée de 10 000 ms acceptée et de 10 001
   refusée ; 5 images acceptées, 0 et 6 refusées ; images dans l'ordre acceptées, à rebours refusées ;
   cadrage de 16×16 accepté et de 15×16 refusé).
3. Un test de `tests/capture-block-validation.test.cjs` nomme l'écart entre les deux frontières : 8 images sont
   admises par `validateSegment` et 6 sont refusées par `validateRemote`. Son titre dit qu'il s'agit d'un
   écart connu, pas d'une règle voulue.
4. `node --test tests/budget.test.cjs` passe et exige : un registre au contenu illisible refuse toute
   réservation par la phrase de la ligne 17 ; un registre dont `spentUsd` est négatif est refusé par celle
   de la ligne 21 ; `settle` d'un identifiant inconnu par celle de la ligne 42 ; un fichier `.lock` déjà
   présent par celle de la ligne 13, et la réservation repasse une fois le verrou retiré.
5. `node --test tests/video-bridge-clients.test.cjs` passe : quatre clients distincts ouvrent un contexte par
   `search_moments` (200), le cinquième reçoit 400 « Trop de clients MCP. », un des quatre premiers est
   encore servi ensuite. Le pont est fermé par `close()` dans un `t.after` ; aucun minuteur ne retient le
   processus.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/capture-block-validation.test.cjs` et `tests/video-bridge-clients.test.cjs` (neufs), plus les cas
ajoutés à `tests/budget.test.cjs`. Frontières : les fonctions exportées
`validateSegment` et `validateRemote`, les méthodes publiques de `TrialBudget` sur un dossier temporaire, la
route HTTP locale du pont MCP.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un refus ne peut être atteint sans modifier le code de production, ou si le
comportement observé à une limite contredit la valeur ou la phrase citée ici : verdict BLOQUÉ, avec la
commande et la sortie. L'écart 5/8 images n'est pas corrigé par ce ticket.

## Journal
