# 0042 — Le fil /v1 conserve les comportements lus par les clients TV

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md`
- Statut : acceptée

## Contexte

La TV et le serveur peuvent être mis à jour séparément. Les ADR 0029 et 0030 demandent de protéger
les comportements et les séquences avant de déplacer projections et contrôle de sessions.
Le transport et les lecteurs de refus des ADR 0034, 0039 et 0041 sont désormais structurés.
Ce contrat caractérise les sources à `8d3933e`, sans établir les versions installées sur TV ou VPS.

## Décision

Sur `/v1`, une évolution compatible ajoute des possibilités en maintenant routes, méthodes, champs,
codes, statuts et sens des actions déjà lus. Elle conserve aussi revalidation, priorité des refus,
doublons et ordre des commandes. Un ajout arrive dans l'ordre **tests, serveur, client** : l'ancien
client doit garder un comportement défini avec le nouveau serveur. Une évolution incompatible
exige un autre contrat ou une preuve explicite que les anciens clients se comportent encore de
façon définie. Un simple JSON de même forme ne constitue pas cette preuve.

L'annonce de version et de capacités prévue au domaine §9 reste à ajouter par un autre ticket.
Aucune négociation actuelle, révision installée ou borne minimale de déploiement n'est établie ici.

### Appelants et séquences actuels

| Acteur | Appels et ordre |
| --- | --- |
| Producteur Python (`tv/capture.py`, `tv/transport.py`) | POST `/v1/session/start` ; avant chaque tentative de bloc, GET `/v1/session`, puis POST `/v1/segments` si l'identité et l'admission le permettent. |
| Panneau JS (`remote-client.js`, `companion.js`, `sessions-view.js`) | GET `/v1/state` et vues `chat`/`panel` ; POST pause et fin ; GET sessions ; POST ouverture/reprise/suppression par identifiant et fermeture de la session chargée. |
| Contrôleur TV local (`capture-control.js`, `companion.js`, `tv/controller.py`) | Le panneau lui demande `/capture`, `/capture/start` et `/capture/stop`, sur une autre adresse. Il possède le processus Python et son rapport, pas les transitions du serveur distant. |

La ligne « Panneau JS » ci-dessus décrit l'état et les sessions caractérisés par ce banc. Le panneau
utilise aussi POST `/v1/questions` et `/v1/questions/:id/cancel`, POST `/v1/moments/detail`,
GET `/v1/thumbnail/:sessionId/:id`, POST `/v1/surveillance/start`, `/v1/surveillance/stop`,
`/v1/surveillance/history` et `/v1/surveillance/detail`, ainsi que POST `/v1/settings/transcription`.
Ces routes sont également consommées par la TV et protégées par la décision de compatibilité ;
`wire-contract` ne les caractérise pas.

`start` et GET `/v1/session` font partie du chemin Python ; le panneau JS ne les émet pas dans
son parcours normal. Dans le banc, un producteur synthétique les émet avec la même authentification
et la même forme de bloc. L'essai JS de `start` sur une archive est une sonde de refus.

- Bibliothèque : si le serveur accepte encore mais que cette TV ne capture plus, `SessionsView.settle`
  attend POST `/v1/session/pause` avant l'ouverture, ou avant la suppression de la session courante.
  Une capture locale active interdit ces actions ; elle ne s'arrête pas comme effet secondaire.
- Reprise ici : `capture-control.js` attend `sessionAction(id, "resume")` avant `/capture/start` local.
  Nouvelle session : il attend `closeSession()` avant ce démarrage local ; Python demande ensuite `start`.
- Fin depuis la frise : `companion.js` demande `/capture/stop`, relit `/capture` jusqu'à l'arrêt
  confirmé, puis demande `/v1/session/end`. Sans confirmation, il garde la session. L'arrêt local
  et la fin distante sont deux confirmations distinctes, comme le demande l'ADR 0030.
- Pause, fin et fermeture actuelles portent `{}` et visent la session chargée. Ouverture, reprise
  et suppression portent l'identifiant dans l'URL. Cet ADR n'introduit pas les futures commandes ciblées.

Le cycle distant conserve l'identité : démarrer, recevoir un bloc, mettre en pause, terminer,
lister, ouvrir en lecture seule, reprendre explicitement, recevoir la suite, fermer.
L'ouverture n'admet aucun bloc et un `start` rend 409 `read-only` ; seule la reprise explicite
de cette archive rétablit l'admission. `/v1/session/end` rend `{ ended: true, id, archived }` ;
`/v1/sessions/close` rend `{ closed: true, id, archived }`. Les erreurs éventuelles restent possibles
dans ces résultats ; `archived` ne se déduit pas de `ended` ou de `closed`.

### État, refus et admission

- L'état complet et chaque vue exportée par `runtime/state-views.cjs` restent fusionnables par
  `mergeState`. La vue chat conserve ce que la vue panel a livré ; les questions se fusionnent par
  identifiant, une absence n'étant pas une suppression. Un changement de session remplace l'état.
- Chaque ressource possède son ETag : le tag d'une autre vue ne valide rien. Après une publication,
  un tag tenu reçoit un nouveau corps ; à état stabilisé il reçoit 304 sans corps. `RemoteClient`
  conserve alors la même valeur avec `notModified: true`. Les tags dépendent aussi du processus ;
  celui de l'état complet peut bouger avec les compteurs auxiliaires. Le temps seul ne renouvelle
  pas les vues légères : la page extrapole les horloges déjà reçues.
- `error` est un message affichable ; **statut et code identifient le refus**, pas sa formulation.
  `RemoteClient` conserve les deux. `PollPlan` reconnaît 400 `unknown-view` et 404 sans code ou
  `route-not-found` pour un repli permanent vers l'état complet. Les autres 400 ont un repli temporaire ;
  401 et 5xx ne deviennent pas une vue inconnue. Les anciennes regex françaises ne sont pas un contrat.

| Refus caractérisé | Statut et code |
| --- | --- |
| Vue inconnue | 400 `unknown-view` |
| Authentification fausse | 401 `unauthenticated` |
| Route absente après validation HTTP | 404 `route-not-found` |
| Corps excessif | 413 `request-too-large` |
| Archive ouverte en lecture seule | 409 `read-only` |
| Numéro déjà accepté avec d'autres octets JSON | 409 `sequence-conflict` |
| Numéro ancien, hors doublon connu | 409 `stale-sequence` |
| Session en pause, même pour un doublon connu | 400 `session-stopped` |

L'ordre HTTP reste celui de l'ADR 0021 : CORS, OPTIONS avant authentification, authentification,
méthode, lecture bornée et objet JSON, routage puis 404. Un POST trop gros sur une route absente
rend donc 413 ; avec un mauvais jeton il rend d'abord 401.

Pour les blocs, validation du contenu, admission et horodatage précèdent le registre de doublons,
puis viennent séquence ancienne, créneau de préparation et acceptation avant assemblage (ADR 0006/0023).
Un rejeu identique rend le même `id` avec `duplicate: true`, sans nouveau passage ni assemblage.
Le hash compare les octets JSON reçus ; le registre conserve les cent dernières acceptations de
l'époque de capture. Un démarrage ou une reprise peut renouveler cette époque : l'ordre d'observation
de la session continue alors de protéger les passages antérieurs. Le banc ne réordonne aucun contrôle.

Les bornes restent 12 000 octets JSON, 13 000 000 pour `/v1/segments`, 20 s de délai de requête
et 10 s pour les en-têtes côté serveur ; l'envoi JS se borne à 8 s. Python borne chaque requête
à 5 s, dans les 30 s de vie du bloc. La préparation média (15 s par commande), sa possession,
son annulation et sa borne d'attente restent décrites par les ADR 0006 et 0023. Aucun délai n'est changé.

### Ajout compatible du 19 octobre 2026 : bloc déclaré son seul

POST `/v1/segments` accepte le champ facultatif `media: { video: false, audio: true }`, avec `frames: []`
et `audio` obligatoire : base64 d'un WAV décodable contenant des échantillons, dans les bornes existantes.
Seul `media.video === false` déclare le son seul, selon l'ADR 0062. Une déclaration `media.audio === false`
ou la présence d'images contredit ce bloc et rend 400 `invalid-media-block`. L'absence de son, un encodage
invalide et un son non WAV portent aussi ce code ; un WAV sans échantillon ou refusé par FFmpeg rend
400 `media-tool-refused`. Les pannes de l'hôte gardent leurs refus propres.

Le serveur conserve un clip WebM Opus audio seul et le WAV mono 16 kHz, avec les mêmes fichiers et baux.
Le cœur reçoit la déclaration, ne lance ni vision ni miniature et compte l'absence d'images. Le clip peut
être décodé en audio depuis le stockage ; la route de rejeu vidéo garde sa règle de disponibilité vidéo.
Un bloc sans déclaration exige toujours des images et conserve son refus 400 `invalid-media-block`,
« Nombre d’images invalide. ». Les identités, séquences, empreintes et doublons sont inchangés.

Un ancien serveur refuse ce nouveau bloc en 400 `invalid-media-block`, compté par la TV comme livraison
rejetée. Cet ajout côté serveur ne modifie pas encore la capture TV et n'établit aucune capacité déployée.

## Alternatives écartées

- Figer uniquement les schémas JSON : ne détecte ni un changement d'admission ni un ordre de commandes cassé.
- Figer les phrases françaises : empêcherait une reformulation sans renforcer l'identité des refus.
- Déduire un plancher de déploiement des sources : aucune preuve des versions installées n'est disponible.

## Conséquences

Les migrations de projections et de sessions doivent conserver les preuves du fil et ajouter celles
de chaque nouvelle possibilité. Le banc HTTP protège le cycle distant ; il ne prouve pas l'orchestration
de capture locale, le moteur webOS, le réseau TV/VPS, ni une installation. Le producteur Python réel
reste à couvrir dans le banc prévu par T204 avant le changement de son contrôle.

## Protégée par

- `tests/wire-contract.test.cjs` : vrai `RemoteClient`, `PollPlan` et `mergeState`, vrai `RemoteServer`
  et runtime smoke en boucle locale ; 200/304, vues, publication pilotée, refus, cycle, traces des
  méthodes/identités/ordre, doublons et priorité d'admission. La sélection d'une vue inconnue passe
  par un adaptateur de lecture du plan ; les réponses HTTP ne sont jamais remplacées.
- `tests/helpers/server-host.cjs` : répertoire temporaire, port éphémère, horloges injectées,
  perception pilotée par promesses et assembleur simulé. Le fetcher observe les réponses par copie,
  sans changer la requête, la réponse originale ou les globales. Le nettoyage libère les promesses,
  ferme serveur et runtime et retire le répertoire, y compris après échec.
- `server-state-views`, `server-ingest-path`, `tv-panel` et `tv-poll-controller` gardent leurs preuves,
  dont le repli 404 historique. Les bancs d'ingestion des ADR 0006/0023 restent responsables des
  courses d'annulation et de possession.
- `server-ingest-path` vérifie aussi le bloc déclaré son seul avec le vrai assembleur : corps HTTP,
  passage prêt sans vision ni miniature, clip Opus décodé sans vidéo, doublon et refus structurés.
  `segment-contract` protège les exigences de son et de liste d'images vide après assemblage.
- Les bancs de page (`tv-paired-page`, `tv-remote-navigation`) vérifient scripts, polling, commandes
  de surveillance, navigation et diagnostics locaux sur doublures ; les tests Python
  (`test_tv_capture.py`, `test_tv_control.py`) conduisent capture et livraison sur doublures.
  Ces preuves ne couvrent pas à elles seules les séquences locales de fin/reprise décrites ci-dessus,
  établies ici par lecture des appelants.
