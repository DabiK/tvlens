# 0021 — Le transport HTTP distribue les routes par groupe

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/174-route-the-server-http-handler-through-one-module-per-route-group.md`
- Statut : acceptée

## Contexte

`server/http.cjs` mêlait contrôles HTTP et 26 routes dans `RemoteServer.handle`
(266 lignes physiques avant extraction). L'ingestion y possédait aussi son registre
de doublons et son créneau unique. Les ADR 0006 et 0007 fixent le moment de
l'admission et de la libération des opérations ; ce découpage conserve ces contrats.

## Décision

`server/routes.cjs` compose une table par serveur à partir des fonctions exportées
par cinq modules à plat : sessions, ingestion, questions, surveillance et état.
Chaque entrée déclare sa méthode, son chemin exact ou son expression régulière
ancrée, et son gestionnaire. Le répartiteur attend le gestionnaire et indique si
une route a été traitée. Les captures des motifs restent sans décodage supplémentaire.

`server/http.cjs` conserve les politiques communes, dans l'ordre : CORS, OPTIONS
avant authentification, authentification, méthodes GET/POST, lecture bornée du
POST et validation JSON objet, puis répartition et 404. Les limites restent
13 000 000 octets pour `/v1/segments` et 12 000 ailleurs ; connaître la table ne
court-circuite aucun refus. L'envoi JSON, les ETag paresseux et les erreurs restent
communs. Le groupe sessions envoie directement les miniatures et réponses média.

Le registre, la séquence, l'époque et le créneau restent sur `RemoteServer`.
Le groupe ingestion reçoit cette même instance par référence, sans copie d'état.
Le runtime conserve l'admission métier et possède l'opération avant assemblage ;
le même `finally` libère le créneau et appelle `finish`, après succès ou échec.

## Alternatives écartées

- Un répartiteur par groupe avec ses propres branches méthode/chemin : les entrées
  explicites permettent de vérifier l'unicité des propriétaires par l'interface.
- Répondre 404 dès la lecture de l'URL : cela changerait la priorité des refus de corps.
- Déplacer l'état de transport dans un singleton de module : plusieurs serveurs
  partageraient alors leurs doublons ou leur créneau.

## Conséquences

Les groupes se testent avec un runtime enregistré sans démarrer HTTP. Le transport
garde une seule chaîne de validations et de traduction des erreurs. Le contexte
du gestionnaire transporte les octets bruts, nécessaires au hachage des doublons,
et les fonctions d'envoi communes. La réponse média reste entièrement préparée
avant envoi, comme dans l'ADR 0010 ; aucune diffusion en flux n'est introduite.

## Protégée par

`tests/server-routes.test.cjs` couvre les cinq interfaces, les 26 propriétaires,
l'ordre des refus, les limites annoncées et lues, les ETag, les binaires, Range et
le cycle d'ingestion par un vrai serveur en boucle locale. Les huit suites HTTP
citées au ticket restent inchangées, dont les courses des ADR 0006 et 0007.
