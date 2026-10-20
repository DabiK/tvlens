# Essai du 18/10/2026 — questions répondues par Ollama sur le Mac

Contrôle réel T269, après T263. Sonde de composant puis session réelle, une exécution chacune, sans annotation
humaine : les chiffres valent pour cette machine et ce moment.

## Question

L'agent de questions Ollama de T263 appelle-t-il vraiment ses outils vidéo quand chaque requête impose aussi le schéma
JSON de la réponse (`format`) ? Répond-il juste sur une vraie session, avec des citations acceptées ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | `dbcbf79` (T264 intégré), chemin `OllamaQuestionAgent` → Ollama `/api/chat` |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, boucle arrêtée |
| Runtime | Ollama 0.33.2 |
| Modèle | `qwen3.8:27b` (27,3 B), seul modèle local du Mac capable d'outils : `gemma3:4b` et `gemma3:12b` n'ont pas la capacité `tools` |
| Contexte | 8 192 jetons (sonde), 16 384 (session) |
| Sonde | `sonde-outils-format.cjs` : 3 questions qui exigent un outil, outils vidéo simulés (paroles et images écrites pour la sonde) |
| Conditions | A : `format` à chaque tour, tel que livré ; B : `format` au seul dernier tour, proposé sans outils |
| Session réelle | `ec55a89c` du 17/10 (live YouTube en français, 19 passages), copie temporaire, serveur headless avec `TVLENS_QUESTIONS_BACKEND=local` (`questions-session.mjs`) |
| Données brutes | `resultats-sonde.json`, `resultats-session.json` |

## Résultats

Sonde, par question :

| Question | A : outils appelés | A : durée | B : outils appelés | B : durée |
| --- | --- | --- | --- | --- |
| Chiffre exact du chômage | paroles, réexamen | 22 s (dont 8,5 s de chargement) | paroles, réexamen | 23 s |
| Ce qu'on voit derrière l'invité | réexamen | 14 s | réexamen, recherche | 31 s |
| Mot pour mot avant la pause | paroles | 11 s | paroles ×2, réexamen, recherche | 62 s |

Dans les deux conditions : réponses justes, JSON valide, citation du bon passage.

Session réelle :

| Question | Résultat | Outils | Durée |
| --- | --- | --- | --- |
| « Que dit exactement l'intervenant sur la mobilisation des lycéens ? » | `insufficient` : aucun passage n'en parle | 2 recherches, 1 lecture de paroles | 38 s |
| « Qu'est-ce qui est écrit à l'écran au début du live ? » | `observation`, 1 citation acceptée, date illisible signalée | réexamen, recherche | 30 s |

Chaque résultat publie son moteur : rôle `questions`, `ollama`, `qwen3.8:27b`, hôte local.

## Lecture

- **Le schéma imposé n'empêche pas les appels d'outils avec ce modèle.** La réserve de relecture de T263 ne se vérifie
  pas ; la version livrée (A) est aussi la plus rapide.
- **L'abstention est juste** : vérifié, aucun des 19 passages ne mentionne les lycéens, malgré le titre de la vidéo.
- **Le choix du modèle compte** : sur le Mac, seul le 27B sait appeler des outils. Ce point est à refaire avec les
  modèles retenus sur le GX10.

## Limites et incidents

- Une exécution, ordre fixe, outils simulés dans la sonde, aucune annotation : aucune statistique.
- Dans la session réelle, le réexamen passait par le backend d'inspection par défaut (Codex) : T265 n'était pas encore
  intégré.
- Mémoire : le swap du Mac est passé de 15 à 28,7 Go pendant la sonde ; modèle déchargé ensuite.
