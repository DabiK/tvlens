---
name: research-phoenix
description: "Étudier ou préparer une observabilité Phoenix locale pour TVLens : traces, latences et évaluations ; aucune instrumentation automatique."
license: MIT
metadata:
  upstream: Orchestra-Research/AI-Research-SKILLs
  upstream-commit: 773a52944ba4747a18bd4ae9ade53fff041adcbc
---

## Application TVLens

Partir de `campaign.json`, de son journal et des relevés système existants. Ils restent la preuve primaire.
La présence de cette skill n'installe pas Phoenix et ne crée aucun span.
Décrire d'abord ce qui manque : attente, transcription, perception, recherche, réexamen, génération ou transport.
Ne jamais reconstruire un premier token, une file ou un span absent comme s'il avait été observé.

Pour une intégration autorisée, choisir un collecteur local, corréler campagne/session/question/passage,
et mesurer le surcoût de l'instrumentation dans un essai séparé avant comparaison.
Lire les exemples techniques dans [la fiche amont](UPSTREAM.md) et ses références selon le besoin ;
ils sont principalement Python et ne constituent pas une instrumentation Node/Ollama prête à l'emploi.
Vérifier les API actuelles via ctx7 selon AGENTS.md avant de coder.
Les évaluateurs LLM sont des juges auxiliaires à calibrer contre les médias ; pas une vérité de référence.
Ne pas exporter médias, prompts ou réponses vers Arize Cloud ou un juge distant dans un protocole entièrement local.

## Cadre local

Adaptation française pour TVLens ; l'original anglais est conservé dans `UPSTREAM.md`.
Les consignes du dépôt et le périmètre demandé priment sur les exemples amont.
Les essais réels laissent protocole, scripts, configuration et bruts dans `experiments/essais/<date>-<sujet>/`.
Ne pas perturber une campagne active, supprimer des résultats, committer ou pousser sans demande.
L'installation de cette skill fournit des instructions, pas une autorisation d'exécution supplémentaire.
