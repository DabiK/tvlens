# Comprendre une explication technique en français

Vidéo : [Comment s'entraîne une intelligence artificielle ? — CNRS FIDLE](https://www.youtube.com/watch?v=W_8OhdeQs4Y),
14 min 40 s. Fichier prévu du corpus : `04-cnrs-entrainement-ia.mp4`.
Statut : transcription française automatique, récupérée via `transcriptsyoutube.com` car l'accès direct
aux sous-titres YouTube retournait un corps vide. Images non examinées. Attendus à relire contre le média.
Les chiffres sont les propos de la vidéo, pas des vérités universelles sur toutes les IA.

[Métadonnées de récupération et pistes exposées](../preuves/fr/retrieval-metadata.json) ;
[contrôle des intervalles dans les sous-titres](../preuves/fr/evidence-check.json).
Ces contrôles textuels ne valident pas l'exactitude des paroles ni des images.

## Résumés de sections

| Section | Résumé attendu |
| --- | --- |
| 00:00–03:25 | Distinction entre petites et grandes IA par leur taille et leurs besoins ; introduction d'un exemple de classification chat/lapin et de données d'apprentissage et d'évaluation. |
| 03:25–05:05 | Des exemples annotés sont soumis au modèle ; ses prédictions sont comparées aux attendus et les erreurs conduisent à des ajustements répétés. Analogie avec les exercices scolaires. |
| 05:05–07:45 | Une époque parcourt les données d'apprentissage ; l'évaluation sur des données distinctes aide à repérer le surapprentissage et à choisir quand arrêter. |
| 07:45–08:20 | Transition non annotée ; ne pas exiger de détail particulier. |
| 08:20–10:35 | Le pré-entraînement exploite une grande quantité de données pour apprendre le langage et la complétion ; il produit un modèle de fondation et demande beaucoup de calcul. |
| 10:35–12:05 | Le fine-tuning développe la capacité à répondre aux questions ; présentation d'un modèle instruit. |
| 12:05–14:10 | L'alignement vise des règles éthiques et professionnelles ; l'inférence correspond ensuite à l'utilisation du modèle. |
| 14:10–fin | Non annoté. |

## Questions candidates

| ID | Pose | Question | Éléments attendus | Preuves audio |
| --- | --- | --- | --- | --- |
| cnrs-01 | 01:36 | Selon cette vidéo, qu'est-ce qui distingue une petite IA d'une grande ? | Taille en paramètres et ressources requises ; une petite IA peut fonctionner sur un portable. Ne pas exiger l'ordre de grandeur exact issu de l'ASR. | 00:39–01:25 |
| cnrs-02 | 03:52 | Pourquoi séparer les données d'apprentissage et d'évaluation ? | Évaluer sur des exemples non vus pendant l'apprentissage ; le cours cite des répartitions comme 80/20 ou 70/30. | 02:35–03:40 |
| cnrs-03 | 05:12 | Résume une boucle d'apprentissage. | Prédire, comparer à l'annotation attendue, identifier l'erreur, ajuster, recommencer. | 03:40–05:00 |
| cnrs-04 | 07:52 | Comment le cours explique-t-il le surapprentissage ? | La performance sur les données nouvelles peut se dégrader alors que l'apprentissage se poursuit ; surveiller l'évaluation et arrêter au bon moment. | 05:30–07:40 |
| cnrs-05 | 10:48 | Qu'apprend le modèle pendant le pré-entraînement décrit ici ? | Régularités du langage à partir de nombreuses données ; complétion de mots ou phrases ; production d'un modèle de fondation. | 08:30–10:35 |
| cnrs-06 | 13:12 | Quelle différence le cours fait-il entre fine-tuning et alignement ? | Apprendre à répondre/les compétences d'un côté ; règles de comportement et contraintes éthiques de l'autre. | 10:35–13:00 |
| cnrs-07 | 14:24 | Que signifie passer à l'inférence dans cette explication ? | Utiliser le modèle entraîné et aligné pour répondre aux requêtes ; distinguer cet usage de l'apprentissage. | 12:00–14:10 |

Sous-ensemble proposé après relecture humaine : 01, 02, 04, 05 et 06. Autres questions en réserve, mêmes choix pour tous les modèles.
Question visuelle en réserve à 02:12 : « Où sont placés le chat et le lapin dans l'exemple ? ».
Attendu proposé par la transcription : chat à gauche, lapin à droite vers 01:45–02:00.
**Exclue de la notation jusqu'à examen des images.**

Question d'abstention candidate à 14:24, dans une variante : « Quel taux d'apprentissage numérique exact
est utilisé pour entraîner ce modèle ? ». Ne l'activer qu'après confirmation de son absence dans le
préfixe audio ET les diapositives. Une valeur plausible issue des connaissances du modèle serait une invention.

Empreinte du média : à relever après téléchargement du fichier exact sur la machine de préparation.
Aucun classement ne doit être publié tant que son identité et son alignement avec les sous-titres ne sont pas vérifiés.
