# 0048 — Les hôtes et les archives reprises conservent les médias jusqu’à suppression

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/215-remove-rolling-media-retention-and-preserve-old-archives.md`
- Statut : acceptée

## Contexte

La décision Q18 retire la rétention glissante. Les points d’entrée Mac et serveur pouvaient encore
la réactiver, et la composition partagée acceptait une durée. La restauration ne protégeait que les
archives déjà marquées until-deleted. Le timer Mac rafraîchissait aussi l’horloge et donnait des
occasions d’écrire le manifeste, même quand aucune analyse n’était prête.

## Décision

Le retrait se fait en deux lots. Ce premier lot retire les lectures de `TVLENS_MEDIA_RETENTION_MS`
et `--retention-ms=`, ainsi que le paramètre de durée de la composition partagée. Les anciennes
valeurs, même invalides, sont ignorées. La configuration Mac et les sessions publient
`retention: 'until-deleted'`, `retentionMs: null`.

`WatchSession.restore()` décode d’abord le document historique et ses disponibilités, puis impose
une durée infinie. L’absence historique de retention continue donc de signifier not-kept ; expired,
missing et unreadable restent distincts. Le convertisseur ne normalise pas le document, et une
ouverture sans reprise ne réécrit rien. Une reprise conserve les identifiants, textes, trous,
révisions et compteurs, puis ajoute des médias durables sans réutiliser un identifiant.

Le serveur perd son timer d’élagage ; ses autres maintenances restent en place. Le Mac publie
explicitement l’état toutes les cinq secondes pendant la capture, ce qui entretient l’horloge et
la cadence du manifeste. La pause ne publie rien par ce timer. Le passage du manifeste aux
événements relève de T209. Les libellés n’annoncent plus de durée d’expiration active ; les motifs
historiques restent affichés quand ils sont connus.

T223 retirera l’API d’élagage interne, les simulateurs concernés et les tests qui lui sont dédiés.
Le présent lot garde ces API et tests, les baux média, les barrières de sauvegarde et le scellement.
Les tests mixtes d’hôte conservent leurs garanties de questions, disque, lecture, inspection et fin.

## Alternatives écartées

- Normaliser retention dans le convertisseur : ferait perdre le marqueur historique not-kept.
- Supprimer tout timer Mac : figerait l’horloge et retarderait le manifeste sans passage prêt.
- Supprimer l’élagage du cœur dans ce lot : mélangerait compatibilité des archives et retrait des
  tests dédiés, dont l’autorisation appartient au second lot.

## Conséquences

Une ancienne configuration ne peut plus demander d’expiration automatique. Un disque plein suspend
l’admission ; aucune suppression ne libère de place sans demande explicite. Les archives qui ont
déjà perdu leurs médias gardent leurs textes et motifs ; cette décision ne restaure aucun fichier.
Le témoin pruned-v1 a été produit avant le changement par le cœur historique avec une fenêtre
injectée, puis figé avec provenance et sommes. Les corpus durable-v1 et historical-v1 restent intacts.

## Protégée par

`archive-compat` compare le témoin figé, l’ouverture sans effets, la recherche, la reprise et la
réouverture après une grande avance de temps. `session-durable` vérifie aussi la restauration
historique avec une durée finie au constructeur. `mac-ipc-contract` et `server-sessions` couvrent
les réglages retirés, les questions et le disque. Le banc Mac vérifie le manifeste pendant une
analyse bloquée et le silence en pause. `remote-server` et `architecture-f10` lisent le 410 et les
plages historiques ; `architecture-f05`, `architecture-f07`, `session-lifecycle` et
`session-manifest` gardent baux, admission, confirmation et scellement.

## Complément — retrait du balayage interne

L’[ADR 0055](0055-la-memoire-conserve-les-passages-sans-balayage-temporel.md) complète ce premier lot :
la durée interne, le balayage et ses suppressions à retenter disparaissent. Les preuves mixtes
restent actives et les refus historiques passent par restauration. Les corpus et le convertisseur
ne changent pas.
