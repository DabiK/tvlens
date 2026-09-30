# POC exploratoire — agent et LLM dans la TV

**Statut : roadmap uniquement, aucune installation ou inférence lancée pour cette piste.**

Demande du 30 septembre 2026 : explorer un TVLens capable de fonctionner sans Mac ni VPS, avec un moteur agentique embarqué dans l’application LG. Cette exploration ne remplace pas le premier livrable hybride TV → Mac, puis éventuellement VPS.

## Deux hypothèses distinctes

1. **Agent embarqué, inférence distante.** Porter un harness Codex compatible ou un orchestrateur léger sur la TV : outils de capture, mémoire et logique de session locaux, appels de modèles vers OpenAI. Cela supprime le serveur personnel intermédiaire mais conserve Internet, l’authentification, les quotas et la dépendance au fournisseur. Vérifier l’accès permis par l’abonnement et les modalités d’intégration ; un abonnement ne fournit pas les poids du modèle pour une exécution hors ligne.
2. **Inférence réellement locale.** Évaluer séparément si un petit modèle peut rendre un service limité sur le matériel de la TV, sans appels cloud. Ne pas présumer qu’il pourra assurer vision, transcription continue et raisonnement de qualité équivalente. Un résultat négatif documenté est acceptable.

La dictée par le clavier LG fonctionne dans le prototype, mais n’est pas une preuve de transcription locale ni d’autonomie hors ligne.

## Point de départ mesuré

Sur la LG 75QNED87T, webOS 25 / 10.3.2-33, pendant le visionnage :

- `free -m` : 1688 MiB de mémoire totale exposée au système, 289 MiB disponibles et 524 MiB de swap utilisés à cet instant ; ce n’est pas un budget stable garanti.
- Noyau `aarch64`, environnement utilisateur rapporté 32 bits.
- Node 16.20.2 et Python 3.10.13 présents.

Codex n’a pas été installé ni testé sur la TV. La compatibilité des exécutables, bibliothèques et mécanismes d’isolation reste à démontrer ; la présence d’un noyau ARM64 ne suffit pas.

## Expériences à prévoir

- Inventorier ABI, mémoire, stockage, CPU et dépendances sans modifier le firmware. Tester d’abord le lancement minimal du runtime retenu, puis une seule question texte.
- Brancher les ports existants dans un adaptateur TV, sans fork du domaine et sans confier au modèle un accès root général. Exposer seulement les outils TVLens nécessaires.
- Comparer à l’hybride sur les mêmes extraits/questions : première réponse utile, délai total, RAM/CPU, consommation réseau, pression mémoire, qualité et continuité de YouTube.
- Ajouter progressivement une image, un historique court, puis le contexte détaillé de cinq minutes. Mesurer séparément le coût de la transcription du programme.
- Tester expiration d’authentification, quotas, coupure Internet, veille et redémarrage. Documenter précisément les fonctions disponibles hors ligne.
- Pour la branche locale : choisir un modèle après mesure des ressources, vérifier sa licence et ses modalités réelles, puis benchmarker avant d’en faire une promesse produit.
- Conserver les échecs ; prévoir un retour au moteur Mac/VPS par configuration et nettoyer les artefacts d’essai.

## Critère de décision

Retenir l’agent embarqué seulement si le parcours Rakuten → dictée → réponse contextualisée reste fiable pendant un visionnage prolongé, sans dégradation notable de la lecture, avec gestion bornée de la mémoire et des médias. Fixer les seuils chiffrés et le budget de campagne avant l’expérimentation. Ne pas présenter une inférence OpenAI distante comme un LLM local.

## Priorité

Exploration après la première boucle complète TV → moteur Mac → sidebar. Cette boucle donnera un baseline mesuré et un runtime réutilisable. Le POC embarqué ne bloque pas la livraison hybride. Les embeddings multimodaux restent une piste indépendante, toujours hors implémentation actuelle.

Références consultées : [Codex App Server](https://learn.chatgpt.com/docs/app-server), [inférence avec accès au plan ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server). Revalider les conditions d’accès au moment du POC, notamment pour une intégration distribuée ou hébergée.
