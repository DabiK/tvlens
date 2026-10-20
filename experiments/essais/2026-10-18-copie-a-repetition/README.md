# Essai du 18/10/2026 — répétition de la copie A du GX10, tout en local sur le Mac

Contrôle réel T274 et reprise de T276, au commit `318c711`, tag `gx10-copie-a` (`6d8a1b9`). Répétition de bout en
bout de ce qui tournera sur le GX10 : identité des questions, rejeu noté, session en direct tout en local. Une
exécution par cas, attendus rédigés par l'orchestrateur (répétition, pas G2).

## Question

La copie A tient-elle en réel, de la vidéo convertie jusqu'aux questions, avec tous les rôles sur Ollama, et ses
mesures (identité des moteurs, notation G2) sont-elles exploitables ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, boucle arrêtée, Ollama 0.33.2 |
| Modèles | perception et réexamen `gemma3:4b` ; questions `qwen3.8:27b` (contexte 16 384) ; embeddings `qwen3-embedding:0.6b` ; référence Codex `gpt-6-luna` |
| Corpus noté | 4 blocs de 8 s de `media/samples/kennedy-rice-7min.mp4` (65 à 97 s), convertis par T262 ; `manifeste.json` ; attendus figés avant toute inférence (`attendus.json`) |
| Session en direct | serveur headless local, langue de transcription `en`, 4 blocs envoyés au rythme réel, puis deux questions (`envoyer-blocs-questions.mjs`) |
| Identité des questions | session réelle du 17/10 (`ec55a89c`), une question par Ollama, par Codex, puis par un Ollama injoignable |

## Résultats

**Identité des questions (T267).**

| Moteur | Issue | Durée | Identité publiée |
| --- | --- | --- | --- |
| Ollama `qwen3.8:27b` | réponse, 2 outils, 2 citations | 44 s | réglage `local`, agent composé, modèle, hôte, contexte ; 2 requêtes |
| Codex | réponse, 1 outil, 2 citations | 11 s | réglage `codex`, agent composé ; modèle `null` |
| Ollama injoignable | erreur nommée | 2 s | identité conservée, hôte `:11999` ; 1 requête tentée |

**Rejeu noté par le scoreur de T258** (revues dans `revue-*.json`, résultat dans `note-4b-vs-codex.json`).

| Rejeu | Issue | Réussites notées | Constats de revue |
| --- | --- | --- | --- |
| `gemma3:4b` | 4 / 4, tous en français (une tentative chacun) | 0 / 4 | « insigne de l'Élysée », drapeau « tenu », sceau en arrière-plan ; Kennedy nommé sans preuve, incertitude « Aucune » |
| Codex | 4 / 4 | 4 / 4 | description juste, identité déclarée non établie, détail exact (tissu blanc) |
| `qwen3.8:27b` en vision | 4 / 4 refusés à 45 s (délai de l'agent vision) | — | en direct : 25 s pour 5 images avec raisonnement, sceau lu juste, nom nuancé |

Le scoreur vérifie toutes les empreintes (manifeste, attendus, rapports, revues) et ne relève aucune violation de
causalité ou de provenance ; il compte 4 régressions du local face à la référence.

Sortie brute de la sonde `qwen-vision.cjs` (`qwen-vision-sortie.jsonl`), mêmes 5 images, une exécution chacune :
avec raisonnement 25 193 ms (chargement 2 080, lecture des images 14 872, génération 8 167 ms pour 187 jetons) ;
sans raisonnement 4 064 ms (chargement 6, lecture 226, génération 3 769 ms pour 81 jetons). La seconde exécution a
trouvé les images déjà lues en cache : l'écart mesure surtout le cache et la longueur de réponse, pas le seul
raisonnement. La seconde réponse nomme aussi Kennedy sans nuance. Mesure appariée prévue par T284.

**Session en direct tout en local.**

| Étape | Résultat |
| --- | --- |
| Blocs | 4 / 4 acceptés, perception 5,0 à 6,1 s par bloc |
| Transcription (anglais) | juste : « electric lights, and telephones, and automobiles, and airplanes… », « penicillin and television and nuclear power » |
| Index d'embeddings | construit en 3,1 s avec la perception résidente ; cache écrit |
| « Que voit-on à l'écran pendant ce discours ? » | répondue, 2 réexamens et 1 lecture de paroles, 84 s |
| « Que dit l'orateur sur l'histoire de l'humanité ? » | répondue, paroles et recherche, 51 s ; reprend fidèlement la métaphore du discours |
| Mémoire du Mac | swap 26 Go, 13 % de mémoire libre |

Reprise de T276 : l'adaptateur réel, délai de 30 s, indexe 19 passages en 1,1 s avec `gemma3:12b` résident. Le
chargement lent de l'après-midi (12,7 s) ne s'est pas reproduit.

## Lecture

- **Tout TVLens peut tourner en local**, de la capture aux questions, avec des réponses citées et justes. C'est la
  démonstration que le GX10 doit chiffrer à plus grande échelle.
- **La qualité visuelle du 4B est le point faible** : français tenu, mais inventions de détails et identités
  affirmées sans preuve. La chaîne G2 (attendus figés, revue, scoreur) le rend mesurable.
- **Le 27B voit juste mais trop lentement pour la perception continue sur le Mac** ; il convient aux questions et
  sans doute au réexamen. Sur le GX10, la question est de savoir s'il tient le rythme d'un passage.
- **Le Mac est à sa limite** avec trois modèles résidents : la répétition complète passe, une campagne de trente
  minutes demandera une configuration plus légère (T280).

## Limites et incidents

- Quatre blocs et deux questions : aucune statistique. Les attendus et les revues sont de l'orchestrateur.
- Premier essai de la session en direct : deux questions refusées `400 invalid-anchor`, parce que le script envoyait
  un repère vide ; corrigé dans le script, aucun défaut produit.
- Un passage relevé « partiel » pendant son traitement était « prêt » à la fin : état transitoire.
- Le modèle des questions Codex est publié `null` (réserve de relecture de T267).
