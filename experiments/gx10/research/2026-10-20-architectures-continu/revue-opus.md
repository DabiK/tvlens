# Revue critique de la suite GX10 — Opus 5.5

Consultation locale du 21 octobre 2026, modèle `claude-opus-5-5`, effort `xhigh`, sans outil ni accès
aux fichiers. La première requête longue a expiré sans réponse ; une requête ciblée a abouti. Sa
[sortie JSON complète](preuves/opus-roadmap-review-20261021.json) est conservée comme avis de modèle,
**pas comme mesure GX10 ni comme source scientifique indépendante**.

## Points retenus

1. Mesurer une **cadence soutenue** : proportion de blocs livrés avant le bloc suivant, blocs perdus,
   fraîcheur des preuves à la question (médiane et p95), longueur de file et délai complet de réponse.
   La médiane d'un appel visuel à 7,272 s ne suffit pas à garantir une période de huit secondes ; la
   moyenne observée à 8,280 s et un bloc perdu justifient ce contrôle, sans démontrer à eux seuls
   une saturation universelle sur toutes les vidéos.
2. Préparer une relecture **à l'aveugle** des mêmes blocs à trois et cinq images, ordre mélangé et
   notes d'erreurs/omissions, avant de publier une frontière pertinence–vitesse. Les fiches de référence
   restent à corriger et figer ; `readyForScoring=false` jusqu'à cette étape. En attendant, seules les
   mesures techniques de l'ablation contrôlée sont comparables.
3. Vérifier les configurations candidates sur un **replay complet** avec Whisper et questions
   horodatées, puis sur les vidéos non utilisées pour le premier tri. Les deux langues parlées et la
   vidéo sans dialogue doivent être rapportées séparément ; les trois autres vidéos complètent le
   test hors échantillon initial.

## Corrections apportées à l'avis

La réponse d'Opus décrit les sondes Ollama/vLLM comme un essai du « moteur seul ». Ce n'est pas le
protocole réel : la sonde des questions change aussi le format/quantification de la pile, et la sonde
visuelle Qwen mesure le composant vision sur des blocs figés, sans replay TVLens complet. Aucun effet
causal du seul moteur ne sera revendiqué. Le seuil de 95 % de blocs livrés à temps qu'il propose n'a
pas été validé comme critère d'acceptation ; les taux seront d'abord rapportés sans seuil inventé.
Le démarrage froid et le régime chaud restent séparés et leurs traces sont conservées.

## Incidence sur l'ordre

Les campagnes déjà lancées gardent leur ordre figé. En parallèle, préparer l'annotation aveugle de
l'ablation 3/5 images ; après la file StreamingVLM, étendre les replays au corpus français, anglais
et sans dialogue. Un balayage expérimental `3/5 images × 8/12 s` en flux complet est un **candidat** à
préenregistrer avec budgets, mêmes questions et entrées, pas un essai déjà autorisé par un lanceur.
Son intérêt sera jugé sur le couple qualité–délai complet, la fraîcheur et les pertes.
