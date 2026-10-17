# Documentation TVLens

L’[architecture](architecture.md) décrit le code présent. Les rapports ci-dessous gardent leurs
dates, leurs conditions d’essai et leurs limites ; ils n’établissent pas l’état d’une installation.
L’inventaire porte sur les documents suivis par Git ; les brouillons locaux n’y figurent pas.

## Référence : utiliser et développer

| Document | Contenu |
| --- | --- |
| [Présentation](../README.md) | Expérience Mac/TV et présentation du projet |
| [Installation Mac](installation.md) | Prérequis, configuration, autorisations et dépannage |
| [Interface](interface.md) | Direct, Mémoire, mode flottant et interactions |
| [Installation LG](lg-installation.md) | Composants, appairage et parcours TV vers hôte |
| [Installation serveur](server-installation.md) | Configuration Linux et service ; relevés historiques identifiés dans le guide |
| [Frise LG](lg-timeline.md) | Navigation, sujets, miniatures et questions attachées ; essais datés dans le document |
| [Capture LG](lg-capture-control.md) | Commandes et incidents réseau ; conserve le bilan de livraison du 30 septembre 2026 |
| [Identité du companion](lg-companion-design.md) | Présentation et navigation du panneau LG |
| [Retrait des alertes panneau fermé](lg-ambient.md) | Retrait achevé dans le dépôt selon l’ADR 0017 ; cartes du panneau ouvert conservées |
| [Tailscale sur LG](lg-tailscale.md) | Installation, coexistence réseau et retrait |
| [VPN Internet sur LG](lg-openvpn.md) | Composant indépendant du transport TVLens |
| [Résumé progressif](living-recap.md) | Chapitres, provenance, réouverture et limites |
| [Vérification externe](verification.md) | Port de vérification manuelle et rôle actif App Server |
| [Architecture](architecture.md) | Couches, propriétaires, chemins de perception et de question, cycle des hôtes |
| [Standards](standards.md) | Règles de code et contrôles associés |
| [Contribuer](../CONTRIBUTING.md) | Frontières et vérifications de développement |
| [Travail et tickets](travail/README.md) | Consignes de boucle et file de remédiation |
| [Confidentialité](../SECURITY.md) | Cloisonnement des agents, limites et preuves datées |
| [Décisions d’architecture](adr/) | ADR datés ; chaque décision est expliquée dans la carte d’architecture |
| [Diagrammes](diagrams/README.md) | Schémas et statut de leurs représentations |
| [Captures de présentation](../screenshots/current/README.md) | Protocole, médias et crédits |

## Cibles, contrats et explorations

Ces documents cadrent des intentions ou une cible. Leur présence dans l’index ne les déclare pas réalisés.

- [Domaine et cible d’architecture](domaine.md) : cible figée le 16 octobre 2026, ADR 0029 et 0030.
- [PRD V2](PRD-V2.md) : cadrage du 12 octobre 2026, backend et essai local GX10 à réaliser.
- [Roadmap companion LG](lg-companion-roadmap.md) : proposition du 30 septembre 2026, puis bilan et critères ouverts.
- [Exploration d’un moteur dans la TV](lg-on-device-exploration.md) : demande du 30 septembre 2026, distincte du runtime distant.
- [Analyse dgx-spark-qwen38](research-dgx-spark-qwen38-2026-10-12.md) : recherche du 12 octobre 2026, limites et pistes locales.

## Rapports datés et historique

Les affirmations de branche, de déploiement et les mesures de ces documents valent pour leurs relevés.
Un résultat ancien avec Gemini ne valide pas automatiquement Codex ou un modèle local.
Les anciens bancs d’évaluation ont été retirés selon l’ADR 0016 ; leurs rapports restent consultables.

### Relevés et audits d’octobre 2026

- [Validation](validation.md) : relevé du 4 octobre 2026 et compléments datés, essais réels et échecs conservés.
- [Latence du backend](backend-latency-optimization.md) : rapport des 12 et 13 octobre 2026, mesures et simulation.
- [Réutilisation de transcription au réexamen](reinspection-transcript-reuse.md) : rapport du 13 octobre 2026.
- [Demandes produit et rétention](features-proactives-et-retention-2026-10-13.md) : contrat confirmé le 13 octobre 2026.
- [Objectif de la nuit](night-hackathon-objective.md) : mission du 13 octobre 2026.
- [Tickets de la nuit](tvlens-night-tickets.md) : état relevé le 13 octobre 2026.
- [Livrable de la nuit](night-features-delivery.md) : preuves, limites et faits de mise en service du 13 octobre 2026.
- [Audit de maintenabilité](audit-maintenabilite.md) : nuit du 13 au 14 octobre 2026.
- [Audit des points chauds](audit-points-chauds.md) : lecture du 15 octobre 2026.
- [Audit d’architecture](audit-architecture.md) : lectures du 16 octobre 2026 ; constats à confronter au code du moment.
- [Première boucle d’architecture](architecture-improvements/index.md) : fiches et historiques des 13 et 14 octobre 2026.

### Relevés et cadrages de septembre 2026

- [Réexamen vidéo](reexamen-validation.md) : validation du 28 septembre 2026.
- [Comparaison des stratégies](strategy-comparison.md) : résultats du 28 septembre 2026, banc retiré.
- [Grille du corpus temporel](action-evaluation-rubric.md) : critères de lecture de ces évaluations historiques.
- [Recherche temporelle](temporal-research.md) et [recherche vidéo](video-temporal-research.md) : recherches du 28 septembre 2026.
- [Contrat original du réexamen](reexamen-contract-original.md) : cadrage de la campagne de septembre 2026.
- [Optimisation de session](session-optimization.md) : rapport du 29 septembre 2026.
- [Chat et outils de visionnage](viewing-upgrade.md) : rapport du 29 septembre 2026.
- [Goal fiabilité et outils](active-goal.md) : bilan historique du 29 septembre 2026.
- [Chat et interface flottante](chat-overlay-validation.md) : validations de septembre 2026, dont correction du 29 septembre.
- [Visionnage sans interruption](friction-latency.md) : parcours et mesures de l’étape de septembre 2026.
- [Refactor des runtimes](refactor-runtime.md) : responsabilités et validation du 30 septembre 2026.
- [Premier runtime LG vers Mac](lg-remote-runtime.md) : premier branchement du 30 septembre 2026.
- [Essais de sidebar](lg-sidebar-validation.md) : faisabilité du 30 septembre 2026.
- [Préparation avant root](lg-pre-root-safety.md) : relevé du 30 septembre 2026, échecs et limites de sauvegarde.
- [Exploration PicCap](lg-piccap-exploration.md) : recherche du 29 septembre 2026.
- [Plan TV sans modification système](lg-piccap-test-plan.md) : plan initial de septembre 2026, antérieur au companion rooté.
- [Relevé VPS](vps-deployment.md) : installation initiale de septembre 2026 et compléments datés d’octobre.
- [Préparation du dépôt public](publication-audit.md) : audit du 30 septembre 2026.
- [Décisions produit initiales](product-decisions-original.md), [roadmap initiale](roadmap-original.md)
  et [tickets initiaux](ticket-drafts-original.json) : cadrage de septembre 2026, antérieur aux évolutions suivantes.

Les rapports JSON liés depuis ces pages sont des traces d’essais ; leurs échecs et limites font partie
des résultats. Les archives documentaires, lorsqu’elles auront un index, seront ajoutées ici.
