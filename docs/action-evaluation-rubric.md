# Critères de lecture du corpus temporel

Corpus de développement figé par `scripts/generate-action-fixtures.py` avant les
inférences. Les dix clips n'ont pas été changés entre les stratégies. Les réponses
attendues restent dans le banc d'essai, jamais dans les requêtes de perception ou
les outils fournis à Codex. Les images à 0 et 5 secondes servent au comparateur Ask.

Une réponse est correcte si :

1. Elle décrit l'action centrale : direction, variation, échange ou répétitions
   selon le cas. Décrire seulement la présence d'une forme ne suffit pas.
2. Elle n'ajoute pas d'action contradictoire : mouvement vertical absent,
   second objet déclaré immobile alors qu'il bouge, rencontre inexistante,
   répétition inventée, etc. Une action correcte accompagnée d'une invention
   ne passe pas.
3. Les références pointent vers le bon clip et la période de l'action.
   Une tolérance de 500 ms aux frontières est admise pour ce corpus à 10 fps
   analysé par échantillonnage ; aucune précision à l'image près n'est revendiquée.
   Pour les apparitions répétées, les références doivent couvrir les deux épisodes.

Les formulations équivalentes sont acceptées (s'élargir / s'étirer horizontalement).
« Rectangle » pour un carré n'invalide pas à lui seul une réponse dont la question
porte sur son changement de couleur. En revanche une mauvaise trajectoire invalide
une réponse, même si elle contient les mots-clés attendus.

Les booléens `*KeywordHint` du rapport brut sont uniquement des aides de lecture.
Le score accepté doit provenir d'une revue explicite, avec justification pour
chaque cas, liée au rapport exact. Une nouvelle exécution exige une nouvelle revue.

Ce corpus a servi au développement et à plusieurs comparaisons. Ce n'est pas un
jeu de test indépendant : un résultat de 8/10 ne prédit pas 80 % de réussite sur
les films, les gestes humains, les scènes complexes ou des bruits réels.
