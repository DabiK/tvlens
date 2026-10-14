---
id: T045
titre: Replay the server refusals through the TV transport
statut: a-faire
bloque_par: T042, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les tests de la capture Python rejouent des refus écrits à la main dans le test : un couple statut et
code qui ne vient pas du serveur. Si le serveur change une réponse, ces tests restent verts. Après ce
ticket, un test Python lit la table des refus que le vrai serveur rend, figée par T042, sert chaque
ligne au vrai transport de la capture, et vérifie ce que la capture en fait : renvoyer, rejeter, arrêter
pour stockage plein ou arrêter pour lecture seule. Le code de la TV ne change pas.

## Sources

- Constats : GAP3-05, GAP3-02
- Code vérifié à la version `0d5a954` :
  - `tv/transport.py` : `refusal(error)` lignes 22-29 (rend statut, code et message) ; `drop` lignes
    31-35 ; `Transport.request(route, data=None, timeout=5)` lignes 43-48 ;
    `Transport.deliver(item, created, ttl=30)` lignes 50-95 : 507 ou code `storage-full` lève
    `StorageFull` (lignes 79-81) ; 409 avec code `read-only` lève `ReadOnly` (lignes 82-84) ; un statut
    sous 500, hors 408 et 429, ajoute `'HTTP ' + statut` à `errors` et compte `deliveryRejected` (lignes
    85-88) ; sinon `connection` passe à `reconnecting`, `retries` augmente (lignes 89-92) et le renvoi
    attend au plus une seconde par `self.stop.wait(…)`. `Transport(config, stop, report)` reçoit `stop`
    de son appelant.
  - `tests/test_tv_control.py`, classe `DeliveryTests` ligne 82 : `setUp` lignes 83-103 monte un faux
    serveur HTTP dont `self.refuse` fixe la réponse à `POST` ;
    `test_full_storage_is_an_answer_of_the_server_never_a_network_cut` ligne 120 et
    `test_archive_open_read_only_stops_by_name_and_a_plain_conflict_stays_a_rejected_block` ligne 131
    écrivent leurs refus à la main (lignes 121, 132, 135).
  - `scripts/check.mjs`, `pythonTests` lignes 127-133 : le contrôle complet lance
    `python3 -B -m unittest discover -s tests -p test_*.py` ; un nouveau fichier `tests/test_*.py` est
    donc lancé par la boucle.
- Livré par T042 : `tests/fixtures/wire-v1/refusals.json`, dont chaque ligne porte `route`, `cause`,
  `status`, `code`, `message` et `capture` (`retry`, `rejected`, `stop-storage`, `stop-read-only`).

## Périmètre

À créer :

- `tests/test_tv_wire_refusals.py` : pour chaque ligne de `refusals.json` dont la route est
  `/v1/segments`, un faux serveur HTTP local répond à `POST` par le statut et le corps de la ligne
  (`error`, et `code` quand la ligne en porte un), et le vrai `Transport.deliver` est appelé. Pour une
  ligne `retry`, le faux serveur refuse une fois puis accepte, afin que le test ne dure pas le temps de
  vie d'un bloc.

À ne pas toucher :

- `tv/` : aucun fichier.
- `tests/test_tv_control.py` : ses tests et leurs refus écrits à la main restent tels quels.
- `tests/fixtures/wire-v1/refusals.json` : la table n'est pas modifiée pour faire passer ce test.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `python3 -B -m unittest discover -s tests -p "test_tv_wire_refusals.py"` passe, hors ligne. Pour
   chaque ligne de la table sur `/v1/segments`, le test exige :
   - `stop-storage` : `StorageFull` est levée après une seule tentative, sans renvoi, et la cause
     comptée est `storageFull` ;
   - `stop-read-only` : `ReadOnly` est levée après une seule tentative, sans renvoi, et la cause comptée
     est `readOnly` ;
   - `rejected` : `deliver` rend faux après une seule tentative, `errors` porte `HTTP <statut>` et la
     cause comptée est `deliveryRejected` ;
   - `retry` : le bloc est renvoyé avec la même séquence, `retries` vaut 1, et la livraison aboutit.
2. Le test échoue si une ligne de la table porte une valeur de `capture` qu'il ne connaît pas, et si la
   table ne contient aucune ligne pour l'une des quatre valeurs.
3. Le test lit la table par un chemin relatif à son propre fichier ; il ne dépend pas du dossier d'où il
   est lancé.
4. Aucun cas n'attend l'expiration d'un bloc : pour chaque ligne `retry`, le faux serveur compte
   exactement deux `POST` (un refus, puis l'acceptation). Le test peut passer à `Transport` un `stop` dont
   `wait` rend aussitôt, pour ne pas dormir une seconde par renvoi.
5. `node scripts/check.mjs` est vert, et sa sortie montre les tests Python lancés.

## Test d'acceptation attendu

`tests/test_tv_wire_refusals.py`, nouveau. Frontière : `Transport.deliver` de `tv/transport.py` devant
un faux serveur HTTP local, sur le modèle de `DeliveryTests.setUp`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si la capture actuelle ne fait pas d'une ligne ce que la table annonce
dans `capture` : verdict BLOQUÉ, avec la ligne et le comportement constaté ; ni la table ni
`tv/transport.py` ne sont corrigés dans ce ticket.

## Journal
