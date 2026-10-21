# Programme d'optimisation pertinence/vitesse — GX10, 21 au 23 octobre 2026

Préenregistré le 21 octobre 2026 vers 10:30 UTC, avant toute mesure des essais qu'il décrit. Chaque essai a son
dossier `experiments/essais/2026-10-21-<sujet>/`, son plan JSON figé par SHA-256 et ses bruts.

## Question

Quelles combinaisons de modèles, de réglages et d'architecture augmentent, **par vidéo**, la part de réponses
pertinentes rendues en moins de 20 s (cible 15 s), sans inventions supplémentaires ni perte de rappel ancien ?

## Évaluation (commune à tous les essais)

1. **Oracle v2 automatique.** Pour chaque question telle qu'elle a été posée (texte et instant inchangés), deux
   relecteurs indépendants (sous-agents Claude) établissent depuis les médias seulement — transcription
   `large-v3-turbo` complète, SRT officiel de Tears, images toutes les 2 s, frise NASA — les faits attendus,
   leur preuve horodatée, leur disponibilité au moment de la pose compte tenu des blocs de 8 s, les inventions
   à sanctionner et la politique d'abstention. Un arbitre réconcilie. Les réponses des modèles évalués ne sont
   jamais montrées aux relecteurs. L'oracle v1 gelé n'est pas modifié ; v2 est un fichier distinct, avec SHA.
   *Limite déclarée :* oracle établi par des modèles, sans relecture humaine, à la demande du propriétaire.
2. **Notation à l'aveugle.** Les réponses sont regroupées par question, mélangées, sans configuration ni délai.
   Deux juges indépendants notent chaque réponse (0–3, invention, preuve temporelle, abstention justifiée) avec
   la grille de la question ; un troisième tranche les désaccords (écart ≥ 2 ou invention divergente).
   L'accord entre juges est publié. La correspondance n'est ouverte qu'après notation.
3. **Métriques par vidéo et configuration :** part pertinente (note ≥ 2 sans invention) sous 20 s et sous 15 s,
   p50/p95 du délai HTTP complet (délais individuels publiés), inventions, abstentions justifiées ou non,
   couverture visuelle, publications perdues, fraîcheur des preuves. Aucune moyenne qui masque une vidéo.

## Essais GPU (un seul à la fois, verrous coopératifs, budget et arrêt préenregistrés)

| Essai | Hypothèse | Variation | Coût |
| --- | --- | --- | --- |
| E1 Référence instrumentée | Mesure : où passe le temps d'une question et d'un bloc (préremplissage, génération, chargement, attente) | Aucune : configuration produit, proxy de mesure | 6 vidéos, ~1 h 50 |
| E2 Modèle de questions hors ligne | Un modèle MoE (~3–4 B actifs) ou la variante MTP du modèle actuel réduit fortement le délai à pertinence égale | Seul le modèle, sur les requêtes exactes capturées en E1, GPU sans autre charge | ~1 h |
| E3 Modèle de vision hors ligne | Un VLM plus petit ou MoE tient la cadence de 8 s sans perdre les faits visuels | Seul le modèle (puis 3/5 images), sur les requêtes vision capturées | ~1 h |
| E4 Confirmations de bout en bout | Les gagnants des composants améliorent la part pertinente sous 20 s dans le flux réel | Combinaisons retenues contre la référence, ordre A/B/B/A | 2–4 h |
| E5 Contention | Whisper sur CPU et/ou pause vision réduisent la file sans perte de couverture | Une variable à la fois | ~2 h |

Les essais E2/E3 isolent l'effet du modèle ; E4/E5 confirment dans le flux complet, avec la validation des
preuves de TVLens. Un gain de composant n'est pas un gain du produit avant E4.

## Règles d'arrêt et de décision

Arrêt au premier échec non corrigible, au plafond de temps ou à l'échéance, sorties partielles conservées, sans
relance automatique. Une configuration n'est recommandée que si sa part pertinente sous 20 s progresse sur la
majorité des vidéos sans hausse des inventions ; sinon, la frontière vitesse–pertinence est publiée sans gagnant.
