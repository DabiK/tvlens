---
id: T276
titre: Check local search with Ollama embeddings live on the Mac
statut: termine
bloque_par: T264
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel, sur le Mac, boucle arrêtée. Les tests du
dépôt simulent Ollama ; avant de taguer la copie A du GX10, l'orchestrateur vérifie en réel la recherche par
embeddings Ollama (T264). Tant que ce ticket n'est pas terminé, le contrôle de la copie A (T274) attend.

## Sources

- Décision du propriétaire, le 18/10 : « je veux un test sur le Mac pour chaque ticket critique ». Un ticket est
  critique quand son comportement dépend d'un modèle, d'un outil ou d'un appareil réel que les tests simulent.
- T269, journal du 18/10 : les questions locales sont contrôlées ; aucun modèle d'embeddings n'est installé sur le Mac.
- ADR 0058 : les vecteurs sont liés au fournisseur et à son identité.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. un modèle d'embeddings Ollama installé avec l'accord du propriétaire ;
  2. une session réelle archivée du Mac, copiée, ouverte avec `TVLENS_EMBEDDINGS_BACKEND=local` : l'index est construit
     par Ollama et lié à son modèle ; une recherche rend des passages pertinents ;
  3. un autre modèle, ou le retour au fournisseur distant, reconstruit l'index au lieu de mélanger les vecteurs ;
  4. écrire le résultat dans le journal de ce ticket, avec le commit exercé et les chiffres relevés. Un écart devient
     un ticket correctif sans bloqueur ; ce ticket reste à faire jusqu'à ce que le correctif soit intégré et le
     contrôle refait. Quand le contrôle est concluant : statut `termine`, commit de ce seul fichier.

## Critères d'acceptation

1. Tant que ce ticket est à faire, le contrôle T274 reste à faire, et la copie A n'est pas taguée.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T264 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal


- 18/10, orchestrateur : contrôle refait en partie au commit `258d910`, avec `qwen3-embedding:0.6b` (téléchargé avec
  l'accord du propriétaire). Sonde de la recherche sur les 19 passages réels : index en 2,3 s, trois paraphrases
  retrouvées (hybride, environ 20 ms chacune), recherche temporelle sans appel ; une seconde instance ouvre un autre
  cache et signale le premier comme « modèle différent », aucun vecteur mélangé.
  - Écart par le serveur headless : avec `gemma3:12b` résident, le premier appel d'embeddings dépasse le délai de 8 s
    (reproduit : 13,2 s dont 12,7 s de chargement, contre 1,1 s modèle seul) ; aucun index construit, réponse par
    classement textuel, rien dans le journal du serveur. Correctif : T278. Ce contrôle reste à faire jusqu'à son
    intégration, puis sera refait par le serveur avec un autre modèle local résident.
- 18/10, orchestrateur : contrôle refait au commit `318c711` (T278 intégré), boucle arrêtée. Par le serveur headless,
  session tout en local (perception `gemma3:4b` résidente) : index construit en 3,1 s, cache
  `embeddings-<identité>.json` écrit, recherches servies aux questions. Adaptateur réel, délai par défaut de 30 s, avec
  `gemma3:12b` résident : 19 passages en 1,1 s. Le chargement lent de 12,7 s de l'après-midi ne s'est pas reproduit ;
  la marge de 30 s reste prouvée par les tests de T278 (faux serveur lent), pas en réel. Statut `termine`.
