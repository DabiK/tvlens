---
id: T269
titre: Check local questions and search live on the Mac
statut: a-faire
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
les questions répondues par Ollama (T263) et la recherche par embeddings Ollama (T264). Tant que ce ticket n'est pas
terminé, T255 attend.

## Sources

- Décision du propriétaire, le 18/10 : « je veux un test sur le Mac pour chaque ticket critique ». Un ticket est
  critique quand son comportement dépend d'un modèle, d'un outil ou d'un appareil réel que les tests simulent.
- Précédent : T233, point de contrôle réel fermé le 18/10 par l'orchestrateur.
- Réserve de la relecture de T263 : chaque requête envoie `tools` et `format` ; un schéma JSON imposé peut empêcher
  tout appel d'outil, sans qu'un faux serveur le montre.
- `ollama show`, le 18/10 : `gemma3:4b` et `gemma3:12b` n'ont pas la capacité `tools` ; `qwen3.8:27b` l'a. Aucun
  modèle d'embeddings n'est installé sur le Mac.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. Ollama local, `qwen3.8:27b` pour les questions et un modèle d'embeddings installé avec l'accord du propriétaire ;
  2. sonde du vrai `OllamaQuestionAgent` : trois questions qui exigent un outil, avec `format` à chaque tour (tel que
     livré), puis seulement au dernier tour proposé sans outils ; relever les appels d'outils, la validité du JSON
     et les durées ;
  3. une session réelle archivée du Mac, ouverte avec `TVLENS_QUESTIONS_BACKEND=local` : une question répondue avec
     au moins un appel d'outil, des citations acceptées par `DeepAsk` et le backend `ollama` dans son résultat ;
  4. recherche : l'index de cette session construit par les embeddings Ollama et lié à leur modèle ; une recherche rend
     des passages pertinents ; un autre modèle reconstruit l'index au lieu de mélanger les vecteurs ;
  5. écrire le résultat dans le journal de ce ticket, avec le commit exercé et les chiffres relevés. Un écart devient
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
