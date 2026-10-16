# 0028 — Une mesure synthétique corrèle la capture et la remise aux vues

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/178-report-a-deterministic-capture-to-display-latency.md`
- Statut : acceptée

## Contexte

Le cœur conserve des estampilles de perception et de question, mais elles ne couvrent pas la remise
aux cartes. Le Mac regroupe ses dessins par frame avec secours à 100 ms ; la TV reçoit des corps
par polling, avec des 304 sans corps. Additionner les délais des doublures ne prouverait pas cette
chaîne. Les coutures et les documents minimaux permettent maintenant de la conduire hors ligne.

## Décision

`scripts/measure-latency.cjs` compose le contrôleur Mac, `RollingRecorder`, `WatchSession`,
`DeepAsk`, `VideoTools`, le checkpoint partagé, la livraison Mac et les cartes Mac/TV réelles.
Les effets navigateur, transport, préparation, stockage et fournisseurs sont simulés. La commande
utilise `manualClock({ turns: 2 })`, sans sommeil réel. Les minuteries globales de `DeepAsk` sont
liées à cette horloge dans une VM exécutant son module inchangé. La vue TV est aussi chargée
inchangée dans une VM dont l'horloge murale peut être décalée, pour protéger sa lecture monotone.
Le DOM Mac global est installé seulement pendant le dessin synchrone puis restauré.
Le conducteur publie l'instantané initial réel de la session avant le premier polling TV.
`transport.refused` est réservé au refus explicitement simulé, identifié par le code stable
`SIMULATED_TRANSPORT_REFUSAL`. Une exception imprévue du transport ou de ses callbacks reste
une erreur du banc : elle est conservée puis propagée au conducteur avec sa cause originale.
La fabrique des vues peut être injectée au conducteur pour éprouver ce chemin sans modifier le produit.

Le schéma JSON version 1 nomme trois domaines en millisecondes : passage/session (origine zéro),
mural serveur (origine fixe 1800000000000), monotone client (origine fixe 70000).
Le scénario établit explicitement la correspondance `temps scénario = estampille − origine`,
avec vitesse identique et sans pause. Seule cette correspondance autorise les cumuls entre domaines.
La TV conserve `serverNowMs` et extrapole par delta monotone depuis le dernier corps reçu.
`receivedMs`, repris comme `coreIngestedMs`, date l'ingestion après la préparation simulée ;
il ne date jamais une réception HTTP brute. Les estampilles client s'appellent `clientReceivedMs` et
`clientAppliedMs`. `clocks.fields` nomme les domaines par chemin de champ : les bornes et disponibilités
des questions relèvent de la session, leurs étapes de traitement du mural serveur. Les intervalles
sont des durées. Une étape non observée vaut `null`.

Les constantes du banc vivent dans `scripts/latency-fixture.cjs` ; les origines d'horloge restent
exportées par l'environnement. Les durées audio/vision sont lues sur l'horloge autour des attentes.
La porte `asking` émet à chaque transition comme les hôtes et reprend la vision en microtâche
uniquement à sa libération. Sa duplication entre hôtes reste une réserve pour un ticket dédié.

Les événements de transport et de préparation gardent `closedAtMs` et se rapprochent de la borne
réelle `endMs` du passage. Aucune formule ne devine son identifiant avant attribution par le cœur.
Les identifiants de cas, session, passage et question sont stables. Chaque publication reçoit
un compteur local, les réceptions et applications gardent ce compteur et leur émission locale.
Les révisions des passages voyagent avec les publications. Les liens d'une question viennent
du journal de consultations de `VideoTools` ; ils ne sont pas déduits de son ancre.
La disponibilité reste celle figée à l'acceptation, même si la perception progresse ensuite.
Le premier callback sans texte, le premier texte et la fin validée restent distincts.

Une application Mac est le callback de `state-delivery` après retour du vrai dessin des cartes.
Une application TV est enregistrée après retour de `chat-view.receive`. Le texte du DOM et le
nombre d'articles accompagnent les observations. Un 304 n'appelle pas `receive` ; il ne crée
aucun corps appliqué ni rendu de carte. La progression peut continuer par `tick`.
La libération annule les attentes, ferme la session, révoque les questions et éprouve les callbacks
retenus et une réponse réseau tardive portant un corps déjà publié, dont les cartes finales seraient
réappliquées si le polling continuait. Le bilan lit les minuteries après cette résolution et avant
le nettoyage de sécurité de l'horloge ; tout événement après libération est compté par `lateEvents`.
Une mutation retirant l'arrêt du polling doit produire une carte tardive, des événements et une
minuterie réarmée, puis faire échouer les assertions. La libération s'exécute aussi après refus. Sans publication, elle ne crée ni lecture tardive ni corps.
Elle ferme le cœur et annule les attentes simulées des fournisseurs et de l'ingestion avant d'attendre
le contrôleur de capture ; les livraisons Mac et réponses TV encore en attente sont annulées par
leur propriétaire. Le nettoyage de sécurité de l'environnement s'exécute dans un `finally`.

## Alternatives écartées

- Additionner les délais configurés : ne traverse ni les files ni les vues.
- Charger les pages complètes ou `HeadlessRuntime` : introduit des intervalles et effets étrangers.
- Modifier le produit pour ajouter une surface de mesure HTTP, IPC ou disque : inutile aux observations locales.
- Remplacer les minuteries globales du processus : perturberait les autres tests et les chargements asynchrones.

## Conséquences

Les valeurs sont reproductibles et synthétiques : ordonnancement et remise au DOM, sans mesure
du réseau réel, de Codex/Whisper, de la dictée LG ni des pixels physiques. Le banc réutilise
volontairement des helpers de test et se lance depuis le dépôt de développement.
La décision ambient attendue par la chaîne T171→T170→T169→T182 est livrée par l'ADR 0017.
Ce scénario ne traverse pas `HeadlessRuntime` et ne constitue pas une référence pour les
déplacements T179/T180. Aucune cible de performance ni optimisation produit n'en découle.

## Protégée par

- `tests/capture-display-latency.test.cjs` : reproductibilité, causalité des quatre délais,
  disponibilité figée, consultations multiples, texte utile et fin, 304, regroupement et secours,
  horloge murale TV décalée, cartes finales de chaque question sur les deux clients, libération
  après refus et détection d'un arrêt de polling omis. Le décalage d'une attente injectée vérifie
  que les durées de fournisseur sont observées plutôt que recopiées. Les cas nominaux excluent
  tout refus de transport ; la libération avant `run()` et la propagation d'erreurs de réception
  injectées à trois étapes protègent aussi les chemins de refus précoce.
- `tests/state-delivery.test.cjs`, capture, latence, polling et vues : contrats produit conservés.
- `node scripts/check.mjs` : contrôle complet avant remise à la boucle.
