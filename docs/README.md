# Documentation TVLens

## Découvrir et utiliser

| Document | Contenu |
| --- | --- |
| [Présentation du projet](../README.md) | Expérience, fonctionnalités Mac/TV, état livré et objectif GX10 |
| [Installation Mac](installation.md) | Prérequis, configuration, autorisations, modèles et dépannage |
| [Interface](interface.md) | Direct, Mémoire, mode flottant et companion LG |
| [Installation LG](lg-installation.md) | Parcours complet TV → Mac/VPS, composants, appairage et limites |
| [Frise LG](lg-timeline.md) | Navigation télécommande, sujets, miniatures, détail et questions attachées |
| [Capture LG](lg-capture-control.md) | Démarrage manuel, pause/reprise, tampon et incidents réseau |
| [Alertes LG panneau fermé](lg-ambient.md) | Mode ambiant : profils, sûreté des touches, protection de la capture, protocole de validation native. Code livré, affichage désactivé par défaut, **non validé sur la TV** |
| [Installer son serveur](server-installation.md) | Configuration portable Linux, outils, systemd et appairage |
| [VPS privé](vps-deployment.md) | Runtime Linux, systemd, appairage, mesures et retour au Mac |
| [Tailscale sur LG](lg-tailscale.md) | Installation, coexistence LAN/VPN, persistance et retrait |

## Comprendre, développer, vérifier

| Document | Contenu |
| --- | --- |
| [Architecture](architecture.md) | Domaine, ports, adaptateurs et hôtes Mac/Linux |
| [Rôles des agents](refactor-runtime.md) | Codex chat/perception, outils directs, MCP et indexation |
| [Latence du backend](backend-latency-optimization.md) | Chemin d’un bloc, changements de la branche de latence, mesures Mac/VPS, simulation et limites |
| [Livrable de la nuit du 13 octobre 2026](night-features-delivery.md) | Questions de cinq minutes, sessions conservées, suppression et disque, cloisonnement, surveillance, cartes regroupées, overlay TV : ce qui est livré, prouvé, et ce qui ne l’est pas. Rien n’est déployé |
| [Réexamen : réutiliser la transcription](reinspection-transcript-reuse.md) | Cause, correction, contrat d’`inspect_clip` (`exactSpeech`, intervalles images et paroles), mesures et réserves d’une autre session, intégrées par fusion |
| [Confidentialité et cloisonnement](../SECURITY.md) | Ce qui est empêché, détecté après coup ou inconnu pour les agents Codex ; à faire avant tout déploiement |
| [Audit avant publication](publication-audit.md) | Périmètre, anonymisation de l’historique et contrôles |
| [Validation](validation.md) | Résultats actuels, essais réels, échecs et limites |
| [Contribuer](../CONTRIBUTING.md) | Organisation et vérifications à lancer |
| [Résumé progressif](living-recap.md) | Chapitres, provenance et conservation |
| [Vérification externe](verification.md) | Port de vérification manuelle, rôle du vérificateur, isolation |
| [Captures du README](../screenshots/current/README.md) | Protocole, médias et crédits |

## Mission du 13 octobre 2026

- [Demandes produit et neuf décisions](features-proactives-et-retention-2026-10-13.md) : le contrat de la mission.
- [Objectif de la nuit](night-hackathon-objective.md) et [index des tickets](tvlens-night-tickets.md), avec l’état de chacun.
- [Livrable](night-features-delivery.md) : à lire avant tout déploiement.

## Candidature et prochaines expériences

- [PRD / roadmap V2 — trois jours](PRD-V2.md) : référence de livraison backend, tranche locale GX10, décisions et replis.
- [Expérimentations perception et contexte](../experiments/README.md) : intentions, hypothèses et protocoles non exécutés sur mouvement, traitements asynchrones et navigation agentique.
- [Roadmap companion LG](lg-companion-roadmap.md) : état livré, différences avec le contrat initial et critères restant ouverts.
- [Exploration d’un moteur dans la TV](lg-on-device-exploration.md) : expérience future distincte du runtime Mac/VPS.
- Inférence locale GX10, capture caméra/micro et embeddings multimodaux : pistes à valider, pas des fonctionnalités livrées.

## Recherche et historique

Ces documents décrivent des étapes antérieures. Leurs modèles, budgets et hypothèses peuvent différer de l’état actuel présenté ci-dessus.

- [Premier runtime TV → Mac](lg-remote-runtime.md), [premiers essais de sidebar](lg-sidebar-validation.md).
- [Optimisation de session](session-optimization.md), [actions et latence](friction-latency.md), [fonctions de visionnage](viewing-upgrade.md).
- [Réexamen](reexamen-validation.md), [comparaison des stratégies](strategy-comparison.md), [grille d’évaluation](action-evaluation-rubric.md).
- [Recherche temporelle](temporal-research.md), [recherche vidéo](video-temporal-research.md).
- [Décisions initiales](product-decisions-original.md), [roadmap initiale](roadmap-original.md), [tickets initiaux](ticket-drafts-original.json).
- [Exploration PicCap](lg-piccap-exploration.md), [ancien plan TV non rootée](lg-piccap-test-plan.md) et [VPN LG, composant indépendant](lg-openvpn.md).

Les rapports JSON sont des relevés d’essais, pas des garanties générales de performance. Les échecs restent conservés ; un score historique Gemini n’est pas une validation automatique de Luna ou d’un futur modèle local.
