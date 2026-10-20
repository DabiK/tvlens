---
name: research-autoresearch
description: "Structurer les comparaisons expérimentales TVLens : hypothèses, protocoles bornés, vitesse, pertinence et synthèse des résultats."
license: MIT
metadata:
  upstream: Orchestra-Research/AI-Research-SKILLs
  upstream-commit: 773a52944ba4747a18bd4ae9ade53fff041adcbc
---

## Protocole TVLens

1. Lire `experiments/gx10/evaluation/README.md`, `selection.json` et le rapport de la campagne concernée.
2. Écrire avant exécution une hypothèse, la référence, la variation unique, les métriques, le budget et les conditions d'arrêt.
   Figer les fichiers par horodatage et SHA-256 ; aucun commit nécessaire pour cette fixation.
3. Réutiliser les runners du dépôt. Même média, questions, images, préfixe accessible et conditions de charge entre variantes.
4. Séparer froid et chaud, première exploration et confirmation. Garder tous les essais, y compris négatifs, incomplets et interrompus.
5. Analyser pertinence, inventions, citations, abstentions, délais complets et retard de perception séparément.
   Publier la proportion pertinente sous 15/20 s uniquement quand les références sont validées.
6. Synthétiser ce que les résultats permettent de conclure, les incertitudes et le prochain essai justifié.
   Arrêter au budget ou à la fin du lot autorisé. Pas de recherche illimitée, cron, message externe ou commit automatique.

Les templates amont peuvent servir de point de départ dans le dossier d'essai, sans recréer une arborescence concurrente.
`UPSTREAM.md` conserve la méthode originale ; ses sections de continuité, Git et messagerie ne sont pas applicables ici.
Les autres skills citées par l'amont ne sont pas installées implicitement : utiliser les capacités disponibles.

## Cadre local

Adaptation française pour TVLens ; l'original anglais est conservé dans `UPSTREAM.md`.
Les consignes du dépôt et le périmètre demandé priment sur les exemples amont.
Les essais réels laissent protocole, scripts, configuration et bruts dans `experiments/essais/<date>-<sujet>/`.
Ne pas perturber une campagne active, supprimer des résultats, committer ou pousser sans demande.
L'installation de cette skill fournit des instructions, pas une autorisation d'exécution supplémentaire.
