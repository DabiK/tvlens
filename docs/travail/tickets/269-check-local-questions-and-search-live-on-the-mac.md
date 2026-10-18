---
id: T269
titre: Check local questions live on the Mac
statut: termine
bloque_par: T263, T264
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel, sur le Mac, boucle arrêtée. Les tests du
dépôt simulent les modèles et les appareils ; avant de construire la suite dessus, l'orchestrateur vérifie en réel
les questions répondues par Ollama (T263) ; la recherche par embeddings Ollama (T264) est contrôlée par T276. Tant
que ce ticket n'est pas terminé, T255 attend.

## Sources

- Décision du propriétaire, le 18/10 : « je veux un test sur le Mac pour chaque ticket critique ». Un ticket est
  critique quand son comportement dépend d'un modèle, d'un outil ou d'un appareil réel que les tests simulent.
- Précédent : T233, point de contrôle réel fermé le 18/10 par l'orchestrateur.
- Réserve de la relecture de T263 : chaque requête envoie `tools` et `format` ; un schéma JSON imposé peut empêcher
  tout appel d'outil, sans qu'un faux serveur le montre.
- `ollama show`, le 18/10 : `gemma3:4b` et `gemma3:12b` n'ont pas la capacité `tools` ; `qwen3.8:27b` l'a.
  La recherche par embeddings Ollama (T264) est contrôlée à part, par T276.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. Ollama local, `qwen3.8:27b` pour les questions ;
  2. sonde du vrai `OllamaQuestionAgent` : trois questions qui exigent un outil, avec `format` à chaque tour (tel que
     livré), puis seulement au dernier tour proposé sans outils ; relever les appels d'outils, la validité du JSON
     et les durées ;
  3. une session réelle archivée du Mac, ouverte avec `TVLENS_QUESTIONS_BACKEND=local` : une question répondue avec
     au moins un appel d'outil, des citations acceptées par `DeepAsk` et le backend `ollama` dans son résultat ;
  4. écrire le résultat dans le journal de ce ticket, avec le commit exercé et les chiffres relevés. Un écart devient
     un ticket correctif sans bloqueur ; ce ticket reste à faire jusqu'à ce que le correctif soit intégré et le
     contrôle refait. Quand le contrôle est concluant : statut `termine`, commit de ce seul fichier, boucle relancée.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T255 ni aucun ticket
   qui en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T263 et T264 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal

- 18/10, orchestrateur : contrôle réel concluant au commit `dbcbf79`, sur le Mac (M5 Max, 36 Go), Ollama 0.33.2,
  `qwen3.8:27b`, seul modèle local du Mac capable d'outils (`gemma3:4b` et `gemma3:12b` n'ont pas la capacité `tools`).
  - Sonde du vrai `OllamaQuestionAgent`, trois questions qui exigent un outil, outils simulés. Avec `format` à chaque
    tour, tel que livré : 3 sur 3 avec appels d'outils (1 à 2), JSON valide, citations justes, 13 à 22 s par question
    (8,5 s de chargement au premier appel). Avec `format` au seul dernier tour : 3 sur 3 aussi, mais 2 à 4 appels et 23
    à 62 s. La réserve de relecture de T263 ne se vérifie pas pour ce modèle : aucun correctif. À revérifier avec le
    modèle retenu sur le GX10.
  - Session réelle du 17/10 (`ec55a89c`, 19 passages, copie temporaire), serveur headless avec
    `TVLENS_QUESTIONS_BACKEND=local`. « Que dit exactement l'intervenant sur la mobilisation des lycéens ? » :
    `insufficient` après deux recherches et une lecture de paroles, 38 s ; vérifié, aucun des 19 passages n'en parle.
    « Qu'est-ce qui est écrit à l'écran au début du live ? » : `observation` après un réexamen (backend d'inspection par
    défaut, Codex) et une recherche, une citation acceptée, limite explicite sur une date illisible, 30 s. Backend publié
    dans chaque résultat : rôle `questions`, `ollama`, `qwen3.8:27b`, hôte local.
  - Mémoire : swap passé de 15 à 28,7 Go pendant la sonde ; modèle déchargé ensuite.
  - La recherche par embeddings Ollama passe dans T276 : aucun modèle d'embeddings n'est installé sur le Mac, et son
    téléchargement attend l'accord du propriétaire. Statut `termine`.
