---
id: T038
titre: Exercise the /v1 wire with the real TV client and write its compatibility rule
statut: a-faire
bloque_par: T189
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le vrai client JavaScript TV parle au vrai serveur HTTP dans un banc hors ligne. Un ADR fixe la
compatibilité de `/v1` sur les comportements, les refus et les séquences d'appels, avec des preuves
qui protégeront les projections et le contrôle des sessions pendant la vague structurelle.

## Sources

- `docs/domaine.md`, section 9 ; ADR 0029 et 0030. Le contrat précède les changements du contrôle TV.
  T145 n'est pas un prérequis. T188 transporte les codes ; T201, transitif par T189, complète leurs
  émetteurs ; T189 fait lire ces codes à la page TV. Relire leurs livraisons avant de figer le contrat.
- Code vérifié à `dd5efc9` : `server/http.cjs:6` et `:7` fixent les corps à 12 000/13 000 000 octets,
  `:8` et `:9` les délais à 20 s/10 s ; `server/http.cjs:44` traite ETag/304 ; `:123` ordonne
  CORS, authentification, méthode, corps puis routage. Le 413 est encore sans code avant T188.
- `tv/app/remote-client.js:13` conserve statut et code ; `:19` borne l'envoi à 8 s ; `:70` garde le
  corps sur 304 ; `:89` expose les vues ; `:159` et `:162` listent et commandent les sessions.
  Les exports Node conditionnels sont à `tv/app/remote-client.js:171`.
- `PollPlan` et `mergeState` vivent dans `tv/app/chat-model.js:225` et `:303`, réexportés par
  `tv/app/companion.js:20`. Le classement courant de vue inconnue lit encore le message à
  `tv/app/chat-model.js:219` : T189 le remplace par les codes, avec repli 404 historique conservé.
- `runtime/state-views.cjs:6` définit `VIEWS`. `runtime/headless-runtime.cjs:269` valide la vue,
  `:280` produit l'état ; ses exports à `:571` n'exportent pas `VIEWS`.
- `tv/app/sessions-view.js:469` met éventuellement en pause avant une action de bibliothèque ;
  `tv/app/capture-control.js:52` reprend avant capture locale, `:60` ferme avant nouvelle capture.
  `tv/app/companion.js:330` arrête la capture locale avant la fin serveur ;
  `server/session-routes.cjs:54`, `:56`, `:63` et `:64` exposent start/pause/end et l'alias close.
- Bancs lus : server-sessions, server-state-views, tv-panel et tv-poll-controller sous `tests/` ;
  `scripts/bench-perceived.cjs:100` et `:126` composent déjà serveur et vrai client, hors suite de tests.
  ADR 0006, décisions 12/13, et ADR 0021/0026 : statuts, admission, ordre HTTP et polling.

## Périmètre

- Créer ou compléter `tests/helpers/server-host.cjs`, la fabrique partagée prévue par T064 :
  runtime headless smoke, stockage temporaire, horloges et
  fournisseurs maîtrisés, assembleur simulé, vrai `RemoteServer` sur `127.0.0.1` et port éphémère,
  vrai `RemoteClient` auquel on injecte le `fetch` Node. Fermer serveur, runtime et répertoire même
  après échec. Réutiliser les aides d'horloge et de promesses existantes.
- Créer `tests/wire-contract.test.cjs`. Les appels passent par le vrai client (`state`, `request`,
  `sessionAction`, `closeSession`) ; la fusion et le repli passent par le vrai `PollPlan`/`mergeState`.
  Un fetcher enveloppé peut relever requêtes et réponses sans les remplacer ni changer les globales.
- Écrire un ADR court au premier numéro libre, prolongeant ADR 0006, 0029 et 0030 : ajouts compatibles
  sur `/v1`, maintien des routes, champs, codes, statuts et sens des actions déjà lus ; tests puis
  serveur puis client pour un ajout. Une évolution incompatible exige un autre contrat ou une preuve
  explicite que les anciens clients ont encore un comportement défini. Aucun changement de produit ici.
- L'ADR distingue message affichable et identité de refus : statut/code pilotent les décisions après
  T189. Il ne transforme pas les anciennes regex françaises en contrat immuable de formulation.
  Il décrit revalidation, refus avant admission, doublons et ordre des commandes, pas seulement JSON.
- Documenter qui appelle quoi : panneau JavaScript, contrôleur TV local et producteur Python.
  Le démarrage `/v1/session/start` et `GET /v1/session` de Python ne sont pas attribués au client JS.
  T204 couvre ce producteur ; ce ticket n'installe ni TV ni VPS. L'annonce de capacités/version
  de la cible reste à ajouter par un autre ticket ; ne pas inventer qu'elle existe aujourd'hui.
- Conserver les bornes et délais observés et renvoyer à ADR 0006 pour la préparation et le TTL Python.
  Ne fixer aucune révision installée ni plancher de déploiement sans preuve du propriétaire.
  Aucun changement de `server/`, `runtime/`, `tv/`, scripts de mesure, harnais ou tests existants.

## Critères d'acceptation

1. Pour l'état complet et chaque vue de `runtime/state-views.cjs`, le client reçoit une valeur
   fusionnable contenant la bonne session. À état stabilisé, la seconde lecture conserve la valeur
   avec `notModified:true` ; après ingestion puis publication contrôlée, elle rend un nouvel état.
   Les tags de deux vues ne sont pas interchangeables ; aucune attente murale n'ordonne l'analyse.
2. Une vue inconnue donne 400 `unknown-view`, transmis au client puis reconnu par `PollPlan` livré
   par T189. Authentification fausse, route absente et corps excessif donnent respectivement
   401 `unauthenticated`, 404 `route-not-found`, 413 `request-too-large`, sans perdre leurs statuts.
   Le repli d'un ancien serveur 404 sans code reste couvert par les tests de T189.
3. Une séquence réelle démarre, reçoit un bloc, met en pause, termine, liste puis ouvre l'archive.
   Le démarrage et les blocs sont émis par le banc comme le producteur Python
   (`tv/capture.py:59`, `tv/transport.py:55`, `:69`). Pause, fin, liste, ouverture, reprise et
   fermeture passent par `RemoteClient` (`tv/app/sessions-view.js:473`, `tv/app/companion.js:340`,
   `tv/app/remote-client.js:159` et `:168`).
   Ouverte en lecture seule, elle refuse start par 409 `read-only` ; seule une reprise explicite
   relance l'admission. Les identités, méthodes et ordre des requêtes sont vérifiés via le fetcher.
   Tester les enveloppes distinctes de `/v1/session/end` et `/v1/sessions/close` sans les fusionner.
4. Rejouer le même bloc donne le même identifiant et `duplicate:true`, sans nouveau passage ;
   même séquence avec contenu différent et séquence ancienne gardent leurs refus codés de T188.
   L'ordre des contrôles n'est pas corrigé par le banc. Les tests d'ingestion existants gardent
   les preuves d'annulation et de possession des ADR 0006/0023.
5. Le contrat écrit recense les séquences locales pause/action et arrêt capture/fin serveur à partir
   des appelants cités. Il distingue ce que prouve ce banc HTTP et ce que prouvent les bancs de page
   et Python ; aucune orchestration locale n'est prétendue testée par le seul `RemoteClient`.
6. À l'implémentation, exécuter en séquentiel wire-contract, server-state-views, server-ingest-path,
   tv-panel et tv-poll-controller, puis `node scripts/check.mjs`. Aucun test ni réponse produit
   n'est modifié pour satisfaire cette caractérisation.

## Test d'acceptation attendu

`tests/wire-contract.test.cjs` joint le vrai client au vrai serveur local et au runtime smoke.
Il observe à la fois état, statut/code et séquence de requêtes ; les tests unitaires séparés du
client et du serveur ne remplacent pas cette preuve. La capture locale reste hors de ce banc.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le positionnement après T189 est volontaire : les attentes figent les lecteurs de codes livrés par
la vague 1, sans réintroduire leurs anciens tests de messages. Une incompatibilité réellement trouvée
est rapportée avant toute modification produit. Les versions effectivement installées sur la TV et
le VPS ne sont pas établies ; ce contrat porte sur les sources relues, pas sur un déploiement supposé.

## Journal
