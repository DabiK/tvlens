# 0059 — La fenêtre Mac lit la projection applicative partagée

- Date : 2026-10-19
- Ticket : `docs/travail/tickets/224-deliver-the-mac-window-state-from-the-same-projection.md`
- Statut : acceptée ; complète l'ADR 0054

## Contexte

Le serveur utilise la projection applicative de Mémoire, mais le Mac lit encore `watch.snapshot()`
et étale l'argument complet de `onChange` dans ses messages IPC. Une ancienne publication peut
être reçue après une bascule. Les lectures initiales et d'archive du renderer peuvent également
revenir après reset ou adoption d'une autre session, malgré les gardes deep/vérification existantes.

## Décision

`app/main.cjs` utilise un lecteur commun pour lecture IPC et push : la session de
`runtime.memoryProjection.read()`, enrichie du titre chargé et de la disponibilité de transcription.
Chaque push construit une projection ; ses destinataires reçoivent le même message. Une lecture
explicite relit les ports, notamment l'usage acquis avant sa prochaine publication.

Le callback complet reste une invalidation dont l'argument est ignoré. La fermeture liée au runtime
refuse de publier après son remplacement, y compris lors d'une réouverture du même identifiant.
Les drapeaux closing/switching bloquent aussi les notifications pendant la fin. Les champs absents
de MemoryView restent lus par les ports de publication de l'ADR 0054. Résumé et surveillance
gardent leurs abonnements spécialisés ; aucun nouveau fait de passage ne sert aux changements de file.

`RendererWiring` protège lecture initiale et lecture explicite par une fraîcheur de session.
Une poussée de la même vie de session écarte seulement l'état lu dépassé : les accompagnements
deep/résumé/surveillance et le défilement de l'archive se poursuivent avec l'état courant.
Chaque adoption d'une autre identité et chaque reset changent aussi une génération locale :
le chargement vérifie cette génération au retour de la lecture d'état, puis le lot secondaire
la vérifie après son `Promise.all`.
La garde deep conserve son propre contrôle à cet endroit. La livraison de l'ADR 0025 demeure
inchangée : adoption immédiate, dessins regroupés, concurrence frame/secours et libération.

## Alternatives écartées

- Recopier la projection dans le Mac : ferait diverger les champs et leurs sources publiques.
- Ne suivre que les événements de passage : perdrait les invalidations de file, activité ou sauvegarde.
- Conserver le dernier état pour toute lecture IPC : masquerait l'usage acquis entre deux publications.
- Filtrer uniquement par identifiant de session : autoriserait le callback d'une ancienne vie après réouverture.

## Conséquences

Les contrats IPC, titre, transcription et URL média restent identiques. La construction héritée dans
`WatchSession.emit()` demeure jusqu'à sa contraction ; les lectures de fin et les sauvegardes gardent
leur propriétaire. La génération du renderer ne modifie aucun champ publié ni persisté.
Les preuves sous Electron simulé ne mesurent ni peinture physique ni capture native.

## Protégée par

`mac-ipc-contract` observe le vrai hôte/preload, les constructions snapshot/projection séparées,
les files sans texte, coûts, latence, historique, stockage, refus de sauvegarde et publications tardives.
`mac-ui` retient les lectures initiales et d'archive pendant reset/bascule et conserve les gardes existantes.
Il vérifie aussi les accompagnements et le défilement après une poussée de la même archive pendant la lecture d'état.
`state-delivery` vérifie trois poussées et les courses frame/secours ; la mutation retirant la garde
de lot provoque des dessins supplémentaires. `memory-projection`, `server-state-views` et les gardes
conservent le lecteur partagé, les corps HTTP figés et les frontières du domaine.
