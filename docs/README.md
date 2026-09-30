# Documentation TVLens

## Utiliser et développer la version actuelle

| Document | Contenu |
| --- | --- |
| [Installation](installation.md) | Prérequis Mac, configuration, permissions, modèles, MCP et diagnostic |
| [Interface](interface.md) | Direct, Mémoire, overlay et actions de visionnage |
| [Refactor des runtimes](refactor-runtime.md) | Rôles Codex, outils directs/MCP, indexation et validation |
| [Architecture](architecture.md) | Domaine, ports, adaptateurs et cycle de vie |
| [Validation](validation.md) | Tests actuels et résultats historiques, avec leurs limites |
| [Contribuer](../CONTRIBUTING.md) | Organisation du dépôt et vérifications à lancer |
| [Captures de présentation](../screenshots/current/README.md) | Reproduction, provenance et crédits |
| [Résumé progressif](living-recap.md) | Provenance, chapitres, expiration et limites de capacité |

## Prochaine tranche

- [Contrôle de capture LG et reprise réseau](lg-capture-control.md) — boutons TV, tampon, dédoublonnage et résultats des essais.

- [Runtime distant LG → Mac](lg-remote-runtime.md) — installation, transport réel testé, résultats et validation TV restante.

- [Companion LG : roadmap et 13 tickets](lg-companion-roadmap.md) — tests TV → Mac, puis service VPS ; faisabilité sidebar et voix à établir.

- [POC agent / LLM embarqué dans la TV](lg-on-device-exploration.md) — exploration future, distincte de l’inférence cloud.

## Recherche et historique

Ces documents décrivent une étape du projet ; leurs choix de modèles, budgets et interfaces ne remplacent pas l’architecture actuelle.

- [Optimisation de session](session-optimization.md), [actions et latence](friction-latency.md), [fonctions de visionnage](viewing-upgrade.md).
- [Réexamen](reexamen-validation.md), [comparaison historique des stratégies](strategy-comparison.md), [grille d’évaluation](action-evaluation-rubric.md).
- [Recherche temporelle](temporal-research.md), [recherche vidéo](video-temporal-research.md).
- [Décisions initiales](product-decisions-original.md), [roadmap initiale](roadmap-original.md), [tickets initiaux](ticket-drafts-original.json).
- [Exploration LG / PicCap](lg-piccap-exploration.md) et [plan TV tenant compte de la contrainte sans root](lg-piccap-test-plan.md).

Les fichiers JSON de cette arborescence sont des relevés d’essais. Conserver les erreurs et essais interrompus ; ne pas interpréter un score ancien obtenu avec Gemini comme une validation du fournisseur Codex actuel.
