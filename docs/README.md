# Documentation TVLens

## Découvrir et utiliser

| Document | Contenu |
| --- | --- |
| [Présentation du projet](../README.md) | Expérience, fonctionnalités Mac/TV, état livré et objectif GX10 |
| [Installation Mac](installation.md) | Prérequis, configuration, autorisations, modèles et dépannage |
| [Interface](interface.md) | Direct, Mémoire, mode flottant et companion LG |
| [Frise LG](lg-timeline.md) | Navigation télécommande, sujets, miniatures, détail et questions attachées |
| [Capture LG](lg-capture-control.md) | Démarrage manuel, pause/reprise, tampon et incidents réseau |
| [VPS privé](vps-deployment.md) | Runtime Linux, systemd, appairage, mesures et retour au Mac |
| [Tailscale sur LG](lg-tailscale.md) | Installation, coexistence LAN/VPN, persistance et retrait |

## Comprendre, développer, vérifier

| Document | Contenu |
| --- | --- |
| [Architecture](architecture.md) | Domaine, ports, adaptateurs et hôtes Mac/Linux |
| [Rôles des agents](refactor-runtime.md) | Codex chat/perception, outils directs, MCP et indexation à la demande |
| [Validation](validation.md) | Résultats actuels, essais réels, échecs et limites |
| [Contribuer](../CONTRIBUTING.md) | Organisation et vérifications à lancer |
| [Résumé progressif](living-recap.md) | Chapitres, provenance et expiration |
| [Captures du README](../screenshots/current/README.md) | Protocole, médias et crédits |

## Candidature et prochaines expériences

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
