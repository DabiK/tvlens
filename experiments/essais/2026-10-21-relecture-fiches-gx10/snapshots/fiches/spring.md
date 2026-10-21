# Spring comme témoin visuel sans dialogue

Statut : référence provisoire fondée sur des images réellement extraites et examinées, à des positions explicites du fichier (voir les preuves conservées). Ce relevé ne décrit pas les actions entre deux images et ne constitue pas un visionnage complet.
Fichier : `media/samples/spring.mp4`, 464,166893 secondes. SHA-256 :
`c2c678f2a70338c060b33608bc34d0a1050cd284e249814b3dac0d85eaaa443a`.
[Provenance et attribution](../../../../media/samples/README.md) : Blender Foundation, Andy Goralczyk,
CC BY 4.0. La qualification « sans dialogue » vient de la notice du média ; le son n'a pas été réécouté ici.

Extraction de contrôle : `ffmpeg -ss SECONDES -i spring.mp4 -frames:v 1 -vf scale=640:-1 image.jpg`.
Les images aux secondes 60, 180, 210, 230, 250, 360 et 390 ont été examinées individuellement et sont
conservées dans [les preuves](../preuves/spring/). Elles fixent des observations ponctuelles, pas la durée
exacte d'une action. Ne pas utiliser ces images comme entrée du modèle testé : employer le pipeline normal.

## Résumés de sections à relire

| Section approximative | Constats visibles, sans causalité ajoutée |
| --- | --- |
| 00:00–01:30 | Paysage froid, stalactites ; un petit chien et une jeune fille portant un bâton ; vue sur une vallée brumeuse, puis forêt sombre. |
| 01:30–03:00 | La jeune fille tient un bâton dans la forêt ; grandes formes sombres parmi les arbres et lumière bleutée. |
| 03:00–04:30 | Présence d'une grande forme animale lumineuse bleue ; le bâton apparaît ensuite lumineux orange ; la jeune fille tient ce bâton lumineux. |
| 04:30–06:30 | La forêt reste sombre à 05:30 ; à 06:00, une vallée verte et des nuages sont visibles ; à 06:30, fille et chien dominent un paysage montagneux lumineux. |
| 06:30–fin | Fin et générique non annotés. Ne pas noter de contenu supplémentaire sans examen. |

## Questions candidates

| ID | Pose | Question | Attendu minimal | Preuves visuelles échantillonnées |
| --- | --- | --- | --- | --- |
| spring-01 | 01:12 | Qui accompagne la jeune fille au début ? | Un petit chien. Ne pas inventer son nom. | 01:00 |
| spring-02 | 03:12 | Quel objet tient-elle dans la forêt ? | Un bâton en bois, à extrémité sculptée/enroulée. | 03:00 |
| spring-03 | 03:42 | Quelle couleur domine la lumière de la grande forme près d'elle ? | Bleu/cyan. Ne pas exiger un nom d'espèce. | 03:30 |
| spring-04 | 04:28 | Comment apparaît maintenant le haut du bâton ? | Il émet une lumière orange, contrairement aux lumières bleutées précédentes. | 04:10 |
| spring-05 | 05:12 | Rappelle deux éléments visuels de la traversée de la forêt. | Fille au bâton, chien, forêt sombre, grande forme bleutée ou bâton orange ; au moins deux éléments attestés. | 03:00, 03:30 et 04:10 |
| spring-06 | 06:12 | Qu'est-ce qui a changé dans l'aspect du paysage depuis le début ? | Plus lumineux, végétation verte, par contraste avec le froid et la brume du début. Ne pas attribuer de cause non observée. | 00:30 et 06:00 |

Les questions 03 et 04 sont particulièrement sensibles à l'échantillonnage : les exclure du score si
les preuves ne figurent pas dans les images effectivement envoyées à TVLens. Valider les temps sur
la vidéo avant d'exporter ce calendrier. Réponse attendue dans la langue de la question, ici le français.

Question d'abstention candidate en fin de film : « Quel est le nom du village de la jeune fille ? »
Attendu : impossible à établir à partir des preuves consultées. Elle reste exclue de la notation tant
qu'une vérification de tout le préfixe, générique compris si déjà disponible, n'a pas confirmé l'absence.
