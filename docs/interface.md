# Interface Direct, Mémoire et mode flottant

## Direct

L’aperçu de la source et la conversation occupent deux colonnes. Le démarrage conserve le mode de fenêtre choisi. Le contexte récent vient du résumé automatique du dernier passage analysé : il ne constitue pas une vérification indépendante.

Le statut compact affiche l’attente ou les lacunes ; un clic dévoile la couverture détaillée. Les réglages IA, autorisations, import de configuration et compteurs se trouvent dans Réglages.

« Explique ce moment » ancre la demande immédiatement, termine le segment disponible puis lance l’explication sans dialogue de confirmation. Le raccourci global existant conserve son aperçu d’instant et ses choix avancés.

## Mémoire

L’onglet ouvre une vue dédiée aux résumés, passages récents, moments conservés et sessions. La capture continue et le chat conserve son historique et son brouillon quand cette vue est ouverte. La recherche reste accessible depuis la loupe. « Nouvelle session » se trouve dans Mémoire et reste indisponible pendant la capture ; elle **archive** la session en cours, elle ne supprime rien.

### Sessions

Le panneau **Sessions** liste les sessions conservées sur ce Mac, avec leur durée, leur volume et l’état de leurs médias. Une session ancienne, d’avant la conservation des médias, est marquée « Texte seul ».

- **Ouvrir** charge une session en lecture seule. Un bandeau « ARCHIVE · LECTURE SEULE » reste affiché. La frise, la relecture et les questions fonctionnent ; rien n’est capturé.
- **Reprendre la capture** demande confirmation, puis continue la session là où elle s’était arrêtée.
- **Supprimer** ouvre un dialogue qui dit ce qui part (médias, miniatures, textes, registre de surveillance de cette session) et ce qui reste (moments gardés, anciennes vérifications). La session en cours de capture ne peut pas être supprimée.

Un bandeau persistant annonce un espace disque faible ou bloqué. Sous le plancher, la capture s’arrête ; rien n’est supprimé pour faire de la place.

## Surveillance

L’onglet **Surveillance** remplace l’ancien mode Auto. On y écrit une consigne libre, avec des exemples proposés (« Vérifie les chiffres annoncés », « Préviens-moi quand ils parlent de… »), puis on démarre ou on arrête. La surveillance lit ce qui commence après son activation. Poser une question ne la suspend pas.

- Une ligne d’activité discrète dit ce qui se passe : écoute, lecture des passages, vérification, retard avec le nombre en attente. Si la lecture des passages échoue, elle le dit avec le nombre de passages non lus.
- Les **résultats sourcés** apparaissent en cartes : deux ou trois phrases, un libellé (« Concorde avec les sources », « Contredit par les sources », « Sources partagées »), l’intervalle de la vidéo et les sources, ouvrables. Jamais de badge vrai ou faux.
- Les cartes « **Repéré dans la vidéo** » sont des signalements : une observation de la vidéo, sans source web. Elles restent dans le panneau et l’historique.
- L’**historique** classe les affirmations par état : sourcée, indéterminée, relevée, en erreur, en attente. Une affirmation en erreur ou un passage non lu peut être relancé.

Hors de ce panneau, les cartes sourcées s’empilent **en bas à gauche** de la fenêtre, 14 secondes par défaut (8, 14 ou 20 au choix), sans prendre le focus. Une pastille sur l’onglet compte les nouveautés. Dans la barre flottante repliée, la carte tient en une ligne cliquable. Un signalement n’entre jamais dans cette pile, et aucun réglage ne le permet.

## Questions longues

Une question peut être traitée jusqu’à cinq minutes. Sa carte affiche le temps écoulé sur le plafond (« 01:12 / 05:00 »), sa place dans la file si elle attend, et ce qu’elle pouvait consulter au moment de l’envoi (« Mémoire disponible jusqu’à 00:29 au moment de l’envoi »). Un délai dépassé, une erreur technique ou une annulation sont dits comme tels, jamais comme « preuves insuffisantes ».

## Mode flottant

La barre propose Demander, Garder, pause/reprise et un menu. Demander déploie/replie le même chat ; fermer le chat ne stoppe pas la capture. Le brouillon reste conservé. Le menu donne accès à la fenêtre complète, l’explication, la surveillance, la recherche, au changement de source, au résumé et au repère de rattrapage.

Pour rendre le menu utilisable sans débordement, son ouverture depuis la barre repliée déploie la fenêtre. Changer de source met l’observation en pause et ouvre Direct pour choisir la nouvelle source. La pause concerne TVLens, pas le lecteur vidéo d’origine.

Les actions de la barre font 36 px de haut. La hauteur de la fenêtre tient compte de la décoration native macOS, afin de réserver réellement 64 px de contenu à la barre.

## Organisation du code

- `app/ui/shell.js` : adaptateur de présentation (navigation, état visuel, chrome de fenêtre), sans accès à Codex, au stockage ou aux API.
- `app/ui/recap-view.js` : rendu du récapitulatif avec effets de relecture et notification injectés.
- `app/ui/format.js` : helpers de création DOM et temps affichés.
- `app/ui/icons.js` : pictogrammes locaux fixes, sans SVG externe ou contenu généré interprété.
- `app/ui/shell.css` : composition des deux vues et du mode flottant.
- `app/style.css` : fondations et composants existants (réponses, sources, dialogues, relecture).
- `app/renderer.js` : orchestration des interactions via les interfaces du preload.
- `app/ui/job-view.mjs`, `surveillance-view.mjs`, `sessions-view.mjs`, `card-queue.mjs`, `list-view.mjs`, `text.mjs` : modèles de vue purs, testés sans DOM (`tests/mac-ui.test.cjs`).
- `app/ui/job-card.js`, `surveillance-dom.js`, `sessions-dom.js` : rendu DOM de ces modèles. Le chat et la frise sont redessinés par entrée ; le défilement ne suit que si le lecteur est déjà en bas ; la frise affiche les 40 passages les plus récents.

Un seul arbre DOM de conversation est partagé entre les modes : aucune copie d’historique ni deuxième état conversationnel.

## Validation

`npm test` couvre les services métier et les modèles de vue. `npm run test:electron` parcourt la vraie interface Electron avec capture audiovisuelle synthétique et adaptateurs IA déterministes : démarrage, navigation, sauvegarde, relecture, chat, vérification, file, pause/reprise, explication ancrée, rattrapage, surveillance, sessions (archivage, ouverture en lecture seule, reprise, suppression), puis un second lancement sous le plancher disque. Il vérifie également la taille de la barre, l’uniformité des boutons, le focus et la conservation du brouillon après repli.

Ces tests d’interface ne mesurent pas la qualité ou la latence réelle de Codex : les fournisseurs y sont simulés, et les sources affichées y sont marquées « Source simulée ». L’état de ce parcours après la mission du 13 octobre 2026 est dans [le livrable](night-features-delivery.md).

## Companion LG : chat ou frise

L’app Mac ci-dessus reste autonome. Sur la LG de test, Rakuten ouvre le companion à côté de YouTube ; la vidéo est réduite sans nouveau lecteur. Dicter ouvre le champ utilisant le clavier/micro LG, puis Envoyer ajoute la question à la file. Retour quitte d’abord le détail ou le mode de lecture ciblé, puis le panneau.

> **Ce qui suit distingue la version installée sur la TV de test et le code du 13 octobre 2026.** Ce dernier a été installé sur la TV de test et le VPS le 13 octobre 2026 au matin par la supervision, et n’y a connu que des essais courts : voir [le livrable](night-features-delivery.md).

La frise remplace le chat et occupe le tiers inférieur : cartes par sujet/événement sur toute la session, miniatures dès réception puis texte IA, détail et paroles à la demande. Questionner ce moment ouvre le chat avec un intervalle attaché. Une sélection dans le passé reste stable jusqu’au retour au direct. Aucune relecture n’est ajoutée dans cette vue.

Arrêter la capture conserve le contexte. **Dans la version installée**, « Terminer la session » clôt la session et purge ses miniatures et médias de travail. **Dans le code du 13 octobre**, « Terminer et archiver » arrête la capture et archive : vidéos, miniatures, résumés et réponses restent consultables dans « Sessions » jusqu’à leur suppression.

Le code du 13 octobre ajoute au panneau, sans qu’aucun de ces écrans n’ait encore été vu sur la TV :

- **Sessions**, depuis la frise : ouvrir en lecture seule, reprendre la capture, supprimer, nouvelle session, état du stockage. Lancer la capture sur une archive ouverte demande de choisir entre « Reprendre ici » et « Nouvelle session ».
- **Surveillance** : activer, arrêter, historique, détail et sources en texte ; durée des alertes de 8, 14 ou 20 secondes.
- **Alertes en bas à gauche**, panneau ouvert : la carte d’un résultat sourcé, hors du rectangle de la vidéo.
  L’affichage panneau fermé décrit dans la livraison du 13 octobre est désormais retiré du dépôt (voir ci-dessous).
- **Question de cinq minutes** : écoulé sur plafond calculé à l’heure du serveur, bouton fixe « Annuler la question en cours » dans le parcours des flèches.
- **Sondage allégé** : vues légères de l’état et réponses `304` quand rien n’a changé.

**État du dépôt au 16 octobre 2026.** L’[ADR 0017](adr/0017-retrait-de-l-affichage-ambient-panneau-ferme.md) retire l’affichage ambient panneau fermé :
page et outils, superviseur et relais, gate de capture, puis intégrations de page et documents.
La surveillance serveur et les cartes du panneau ouvert restent utilisables, avec activité, compteur
local des cartes vues, alertes et durée enregistrées sur cette TV. Le panneau ne lit plus d’état fermé
et ne synchronise plus ses choix avec le contrôleur. Les signalements restent dans l’historique.
Ces changements sont exercés dans le banc de page appairée ; ils n’établissent aucun état installé
ni rendu physique de la TV. Voir [le retrait et ses preuves datées](lg-ambient.md).

Les marques-pages durables, le résumé progressif et la recherche dédiée du Mac ne sont pas portés dans le panneau TV.

Le serveur actif peut être le Mac ou le VPS configuré. Après modification de l’appairage, fermer puis rouvrir le panneau. Le retour utilisateur a confirmé les deux chemins et la frise. Voir [navigation détaillée](lg-timeline.md) et [déploiement privé](vps-deployment.md).
