# Ordre des essais GX10 et suite du corpus

État relevé le 20 octobre 2026 vers minuit, heure de Paris. L'objectif de sélection est la
**frontière pertinence–vitesse** : comparer la justesse des réponses et leur délai complet, sans
présenter un gain de temps seul comme une amélioration. Les fiches restent `readyForScoring=false` ;
les réponses brutes peuvent être annotées plus tard, mais aucun classement de pertinence n'est validé.

| Rang | Essai | État au relevé | Condition de passage |
| --- | --- | --- | --- |
| 1 | Référence Whisper `base`, `small`, `large-v3-turbo` × CNRS, Kennedy, Spring | 9 campagnes terminées, traces rapatriées | Résultats conservés |
| 2 | Ablation contrôlée 5 contre 3 images sur CNRS | Terminée et vérifiée techniquement | Interprétation vitesse et réponses à faire |
| 3 | Vision maintenue ou suspendue pendant les questions, sur CNRS | En cours | Fin, vérification et scellé |
| 4 | Sonde questions Ollama puis vLLM | Prévue dans le même lanceur nocturne | Rang 3 terminé ; même jeu de questions ; ne pas conclure sur le flux TV complet |
| 5 | Sonde visuelle Qwen BF16 sur vLLM, puis Ollama si le créneau le permet | File déployée, en attente | Nuit scellée, conteneurs nettoyés, verrous et GPU libres |
| 6 | Pré-vol puis pilote StreamingVLM sur Spring | Préparation de la file | Rangs précédents clos et scellés ; image ARM, dépendances, GPU et budget validés |

Les rangs 3 à 5 restent soumis à l'arrêt du 21 octobre à 07 h, heure de Paris. Le rang 6 est
autorisé dès que le rang 5 se clôt, même dans la nuit, avec une borne propre au pilote et sans
inférence concurrente. Un échec de compatibilité est un résultat à conserver, pas un feu vert pour
modifier le modèle ou multiplier les essais de façon implicite.

## Extension du corpus après ce premier tri

Le corpus prévu comporte six vidéos : CNRS et Bœuf bourguignon en français, Kennedy, Tears of Steel
et Artemis I en anglais, Spring sans dialogue. Les trois premières vidéos du tri actuel sont CNRS,
Kennedy et Spring. **Bœuf, Tears et Artemis restent à rejouer** ; ils testent respectivement procédure
visuelle et parole française, dialogues de fiction, et commentaire en direct avec nombres. Ce sont des
tests hors du trio qui a servi au premier choix, pas des preuves déjà acquises.

Les candidats suivants sont une ablation 3/5 images étendue à Kennedy et Spring, une comparaison de
vision pendant les questions sur ces deux vidéos, puis une mesure « shadow » d'indices ASR/OCR avant
toute suppression d'appels visuels. Chacun doit avoir des entrées, questions, versions, limites de
temps et métriques figées dans un dossier d'essai distinct avant lancement. L'OCR et le filtrage des
appels demanderaient du code expérimental supplémentaire ; ils ne sont pas déjà en file automatique.
Les fiches des six vidéos exigent encore une relecture contre les médias pour noter la pertinence.

La [revue critique d'Opus](../../gx10/research/2026-10-20-architectures-continu/revue-opus.md)
est reçue. Elle renforce la mesure de cadence soutenue, de fraîcheur et de qualité annotée à l'aveugle,
sans changer silencieusement les campagnes déjà lancées. Ses seuils proposés ne sont pas adoptés
comme critères d'acceptation sans données et décision explicites.
