> Archive de cadrage initial : certaines décisions ont évolué. Voir [état actuel](viewing-upgrade.md) et le README.

# TVLens — Synthèse du grill, rounds 01 à 05

Statut : cadrage validé explicitement par l’utilisateur, puis complété par le choix d’une app Mac Electron et d’un overlay. Aucun code applicatif, test de capture ou appel d’inférence réalisé dans cette session ; aucun formulaire soumis.

## Promesse
TVLens construit une mémoire de ce que l’utilisateur regarde pour répondre sur le présent et retrouver le contexte du passé, sans demander à l’utilisateur de le reformuler. Débats et films sont deux scénarios de validation au même niveau.

## POC
- Développement solo sur six jours. Codex Pro ×20 est l’outil de développement ; l’inférence applicative utilise des API distinctes.
- Capture réelle de l’image et du son d’un onglet sur Mac ; un extrait YouTube est la première piste, à tester. Netflix et accès direct à la TV LG ne sont pas promis.
- Architecture hexagonale pour remplacer la source de capture et les traitements par des adaptateurs TV/GX10 ultérieurement. Pas de garantie d’équivalence de qualité ou de vitesse avant mesure.
- OpenRouter est le fournisseur d’accès API choisi pour le POC, avec les ressources déjà disponibles. Aucun montant chiffré ni autorisation de rechargement n’a été fourni. Vérifier le solde et estimer la consommation avant un fonctionnement continu.
- Le modèle multimodal précis reste à sélectionner par essai. NVIDIA demeure une piste, sans supposer qu’un modèle particulier soit accessible via OpenRouter ou compatible avec le futur GX10.
- Les choix de transcription, vision et recherche externe restent à vérifier ; « OpenRouter » ne désigne pas à lui seul une chaîne complète déjà validée.

## Mémoire
- Fenêtre détaillée configurable, réglée à cinq minutes pour le POC. Les passages de cette fenêtre peuvent être réexaminés.
- Toute la session reste représentée par des résumés ; les détails absents des résumés et dont la preuve a expiré ne sont pas récupérables.
- Résumés et réponses sauvegardés entre sessions ; le détail audiovisuel n’est pas une archive permanente.
- Chronologie = ordre de ce qui a été observé, y compris après retour arrière dans le lecteur. Aucune connaissance supposée d’un passage sauté.

## Ask
- Saisie texte sur Mac dans le POC. Speech-to-text utilisateur prévu ultérieurement sur Mac/TV ; à distinguer de la transcription nécessaire au flux vidéo.
- Réponse sur le contexte présent ou passé. Distinguer observation, explication générale et vérification externe ; préserver le contrat sans spoiler.
- Le moment source fait partie de la validation acceptée. Présentation retenue dans la synthèse validée : cartes horodatées avec citation/image et accès au passage tant qu’il existe ; afficher « détail expiré » ensuite.
- En cas d’ambiguïté ou d’information absente, demander une précision ou s’abstenir au lieu d’inventer.

## Auto
- Une consigne active, formulée par l’utilisateur, couvrant surveillance, extraction, explication ou vérification. Exemple : « Vérifie les chiffres du débat ».
- Reformulation de la tâche avant activation ; prise en charge bornée à ces capacités.
- Effet à partir de l’activation uniquement. Le passé peut être interrogé via Ask.
- Capture et questions Ask prioritaires sur le travail automatique. Éviter les recherches répétées et distinguer les résultats d’une ancienne consigne.
- Les seuils de fréquence et la stratégie de file d’attente sont des choix techniques à mesurer, pas des garanties déjà fixées.

## Validation acceptée
- Deux extraits préparés : débat et fiction ; dix questions non préécrites au total.
- Inclure au moins deux questions visuelles sans réponse dans les dialogues, deux références au passé et une question sans réponse dans le contexte.
- Cible : au moins huit réponses correctement contextualisées avec le bon moment source ; aucune invention sur le cas sans réponse.
- Montrer une consigne Auto et une vérification sourcée pendant que la capture continue.
- Inclure une question sur un résumé ancien et une demande de détail expiré.
- Mesurer les délais. Les cibles proposées dans l’option sélectionnée au round 03 étaient cinq secondes pour le contexte et trente pour les preuves ; elles ne sont pas des résultats observés.

## Challenge — texte fourni par l’utilisateur
- Candidature avant le 4 octobre 2026 ; heure et fuseau de clôture non fournis.
- Huit projets sélectionnés par ASUS et Defend Intelligence obtiennent un accès distant à un GX10 pour développer, tester ou valider.
- Un gagnant final remporte un GX10 et une mise en avant.
- Quatorze questions obligatoires ; réponse envoyée définitive ; candidature complétable en plusieurs fois.
- Le texte décrit une sélection de projets avant la phase de test ; il n’établit pas une obligation de POC déjà local à la candidature. L’utilisateur a depuis fourni dix-sept intitulés de champs, archivés dans champs-candidature.md. Ne pas déduire lesquels sont facultatifs de la mention « quatorze questions obligatoires ».

## Ce que chaque étape peut prouver
| Étape | Preuve possible | Non démontré à ce stade |
| --- | --- | --- |
| POC Mac + API | Utilité de la mémoire, capture, Ask/Auto et traçabilité | Performances GX10 et confidentialité locale de bout en bout |
| Accès distant GX10 | Inférence sur GX10 et mesures sur des extraits de test | Flux domestique restant dans le logement : la machine est distante |
| GX10 physiquement local, futur | Traitement audiovisuel sur place, avec recherche externe distincte | À réaliser et mesurer ; pas une propriété du POC actuel |

## Priorité de réalisation acceptée
Préparer le dossier tôt, puis rendre le POC aussi convaincant que possible en parallèle. Ne pas sacrifier la candidature pour terminer une intégration. Le formulaire exact reste à consulter pour connaître les limites de longueur, les formats et les champs effectivement obligatoires ; les intitulés fournis ne fixent pas ces détails.

## Hypothèse GX10 acceptée
Tester si le système peut tenir le rythme d’un visionnage continu : perception, mise à jour de mémoire et réponses fonctionnent simultanément sans prendre un retard croissant. Comparer la précision et les délais à la référence API sur les mêmes extraits et questions. Mesurer aussi les ressources consommées. Aucun résultat de performance n’est promis avant ces mesures.

## Comportements par défaut validés avec la synthèse
- Afficher les preuves sous forme de cartes horodatées ; une demande ambiguë peut proposer quelques moments à choisir.
- Sessions distinctes, créées et terminées manuellement ; résumés/réponses consultables après fermeture et supprimables par session. Ne pas conserver une archive audiovisuelle permanente.
- Auto reste borné à une consigne active et aux quatre capacités retenues. Les changements de consigne ne réécrivent pas les résultats déjà produits.
- Si une capture ou une analyse manque, signaler le trou de contexte ; ne pas fabriquer la continuité.
- Continuer la capture pendant une question ou une recherche ; priorité Ask. Une saturation doit être visible et les tâches Auto anciennes peuvent être écartées plutôt que de prétendre travailler en direct avec un retard croissant.

## Inconnues techniques à résoudre par essais, sans nouvelle décision produit requise
- Modèle et fournisseur effectif derrière OpenRouter ; modalités acceptées, quotas, disponibilité, coût et délais réels.
- Capture effective de l’onglet vidéo et de son audio sur le Mac.
- Stratégie d’échantillonnage, compression et indexation ; fiabilité des citations et images réexaminées.
- Recherche externe et qualité des preuves ; gestion des désaccords, informations manquantes et citations incomplètes.
- Runtime, compatibilité et capacités de la machine GX10 accessible à distance.
- Langues de validation proposées : français pour le débat et les questions ; adapter au contenu fiction choisi.

## Positionnement proposé, non soumis
« TVLens transforme le flux audiovisuel que vous regardez en mémoire interrogeable. Posez une question sur ce qui vient de se passer ou confiez-lui une consigne de suivi. Le prototype API valide l’expérience ; l’expérimentation sur ASUS Ascent GX10 évaluera une exécution multimodale continue sur une machine destinée à un déploiement local. »

## Fin du grill
Les arbitrages produit sont validés. Cette validation ne vaut pas autorisation de dépenses supplémentaires ni d’envoi de candidature. La demande actuelle porte sur une roadmap de tickets avant implémentation.

## Décisions après le grill

- Livraison initiale : app macOS avec interface web embarquée via Electron et domaine indépendant de l’enveloppe.
- Ajouter un overlay discret pour Ask et les résultats Auto ; partager la session avec la fenêtre principale.
- Le mode de capture exact est à tester : Electron expose notamment fenêtres/écrans ; ne pas promettre une isolation d’onglet Chrome non vérifiée.
- Réutiliser le domaine sur un moteur séparé et proposer ensuite un second écran web pour l’usage TV.
- [Roadmap proposée](../ROADMAP.md) : 33 tickets verticaux, non publiés tant que leur découpage n’est pas validé.
