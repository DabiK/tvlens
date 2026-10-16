---
id: T204
titre: Characterize the Python producer against the session server
statut: a-faire
bloque_par: T189
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Un filet hors ligne caractérise les livraisons, les pertes et l'arrêt du producteur Python avant
de changer le contrôle TV de l'ADR 0030. Chaque cas nomme le comportement effectivement observé,
y compris les différences avec la cible, sans modifier le produit.

## Sources

- `docs/domaine.md`, sections 3 Capture, 9 et 10 ; ADR 0029/0030 ; ADR 0006 et 0023 pour la
  possession serveur et les reprises. T189 livre les refus structurés et change les suites Python :
  ce filet passe après lui et réutilise `lastRefusal`, sans refaire ses classifications.
- Code vérifié à `dd5efc9` : `tv/transport.py:29` rend statut/code ; `:43` fait les requêtes
  de 5 s ; `:50` livre pendant le TTL de 30 s. `:55` lit `/v1/session` avant `/v1/segments` ;
  `:64` assimile ID changé, ID absent et `accepting:false` à `session-changed`.
- `tv/transport.py:58` et `:61` distinguent stockage plein et lecture seule ; `:76` traite les refus HTTP.
  Un 507 est définitif ; un 410 `session-ended` passe aujourd'hui dans le rejet générique de
  `tv/transport.py:85`, sans arrêt spécifique. Le refus d'une session obsolète vient de
  `runtime/capture-intake.cjs:16`, avant préparation : ce n'est pas ce 410 dans le code courant.
- `tv/capture.py:59` démarre la session ; `:68` prend `elapsedMs` comme décalage initial et une
  origine monotone ; `:86` ajoute le temps local écoulé. `:85` démarre le thread d'envoi ;
  `:137` abandonne un bloc incomplet ; `:149` compte la saturation de la file ;
  `:157` attend la fin de l'envoi et `:158` compte les éléments restants. Les signaux sont traités à `:53`.
- `tests/test_tv_control.py:189` monte déjà un vrai serveur HTTP local pour `Transport` ;
  `tests/test_tv_capture.py:43` monte le serveur et `:113` exécute le vrai `capture.py` avec
  faux `luna-send` et faux `arecord`. `tv/controller.py:51` arrête le sous-processus.
- `package.json:11` lance seulement les tests JavaScript ; `scripts/check.mjs:179` découvre
  les `test_*.py`, uniquement en contrôle complet (`scripts/check.mjs:210`).

## Périmètre

- Étendre `tests/test_tv_control.py` et `tests/test_tv_capture.py`, leurs doubles locaux si nécessaire.
  Garder le vrai transport HTTP et un serveur sur `127.0.0.1`, port éphémère, scénarios pilotés par
  requêtes et barrières. Aucun serveur TVLens réel ni accès réseau externe.
- Maîtriser l'horloge monotone et l'attente du transport depuis le banc pour atteindre le TTL
  sans attendre 30 s. Conserver au moins un parcours sous-processus avec vraie capture Python,
  exécutables TV simulés et arrêt propre ; aucune modification de capture pour faciliter le test.
- Caractériser séparément absence avant livraison, refus d'admission et répétition après accusé
  ambigu. Relier `sent`, `dropped`, `dropReasons`, `retries`, `connection`, `stopReason` et le refus
  structuré livré par T189, sans fusionner leurs significations ni recopier tout le rapport en fixture.
- Ne changer ni transport/capture/contrôleur produit, ni délais, ni file, ni comptabilité, ni arrêt.
  Le filet `session-ended` de l'ADR 0030 n'est pas implémenté ici. Aucun changement de `npm test`
  ou de `check.mjs` : les suites conservent la découverte Python actuelle.

## Critères d'acceptation

1. Une session acceptée conduit à GET session puis POST bloc, avec identité, séquence et intervalle
   inchangés, `sent` augmenté une seule fois. Un accusé ambigu puis renvoi conserve le même bloc ;
   le scénario existant de reprise continue de passer sans affaiblissement.
2. ID changé ou absent : aucun POST et arrêt `session-changed`. Même ID avec `accepting:false` :
   même arrêt actuel, sans l'appeler déjà « pause locale ». Chaque cas compte la même perte
   `sessionChanged`, sans inventer une cause distincte qui n'existe pas aujourd'hui.
3. À identité égale, `readOnly:true`, puis stockage `blocked`, sont testés séparément : arrêt
   lecture seule ou stockage plein, perte comptée une fois, aucun POST. Un 507 reçu au POST,
   avec code puis ancien 507 sans code, est définitif et n'est pas une reconnexion réseau.
4. Un faux serveur répond 410 `session-ended` au POST : le refus est conservé selon T189 et le
   bloc est `deliveryRejected`, sans retry de ce bloc ni arrêt spécifique de capture.
   Un bloc suivant reste livrable tant que la session répond encore accepting. Ce cas décrit
   une réponse simulée pour compatibilité, pas une route qui existerait déjà sur segments.
5. Une panne réseau continue conduit des reprises jusqu'à l'échéance monotone, puis à une unique
   perte `deliveryExpired`, sans POST après expiration et sans succès inventé. Un arrêt demandé
   avant échéance interrompt les nouvelles tentatives ; ne pas prétendre annuler un POST en vol.
6. Le banc de capture couvre un bloc incomplet avant mise en file, un débordement et les éléments
   restant à l'arrêt : causes et total exacts, aucun bloc perdu sans compte. Les barrières du faux
   envoi rendent la saturation déterministe ; aucun sommeil pour espérer remplir la file.
7. Avec un `elapsedMs` initial non nul, les intervalles suivent ce décalage et les deltas monotones,
   sans dépendre de l'heure civile. Le rapport final et la fin du thread/sous-processus sont attendus ;
   serveurs, tubes et processus simulés sont fermés même si une assertion échoue.
8. À l'implémentation, lancer les deux suites en séquentiel avec
   `python3 -B -m unittest discover -s tests -p 'test_tv_control.py'`, puis la même commande pour
   `test_tv_capture.py`, puis `node scripts/check.mjs`. `npm test` et `--changed` seuls ne prouvent
   pas les suites Python. Aucun test existant n'est supprimé.

## Test d'acceptation attendu

La première preuve passe par `Transport.deliver()` contre le faux serveur HTTP existant, avec
lecture d'état puis ingestion relevées. Les tests de `capture.run` et du vrai sous-processus relient
ensuite ce transport au rapport, aux abandons avant envoi, à l'horloge et à l'arrêt.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La livraison caractérisée ici (`tv/transport.py:50-95`) n'est pas modifiée par T189 et vaut pour un
producteur installé avant lui. Le refus au démarrage et `lastRefusal` suivent T189 et ne décrivent
pas une installation antérieure.

Les branches citées sont celles du dépôt, pas une révision déployée établie sur une TV. Après T189,
relire les champs ajoutés et conserver ses corrections de lecture des codes ; ses nouveaux champs
ne justifient aucune suppression des garanties précédentes. La cible d'arrêt sur `session-ended`
changera volontairement la caractérisation du critère 4 dans un ticket ultérieur.

## Journal
