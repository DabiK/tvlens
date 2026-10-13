# TV Lens — boucle architecturale séquentielle

Autorisation Dabi13octobre2026 : créer les issues issues de l’audit fusionné, une session Opus5.5ultracode fraîche par sujet ; strictement séquentiel ; exploration forcée avant toute modification ; review après chaque dev.

## Contrat de la boucle

Une seule issue en développement. Session nouvelle par issue, exploration Read/Grep/Glob uniquement, rapport de chaîne d’appels/risques/coutures/tests avant dev. Développement dans son propre worktree depuis la dernière intégration validée, sans réinitialiser les autres arbres. Test de régression rouge/verte proportionné. Puis reviewers indépendants standards et spécification, contextes frais, séquentiels ; corrections par l’implémenteur jusqu’à validation. Un merger séparé vérifie et intègre uniquement après les deux reviews et tests. Le sujet suivant se base sur cette intégration.

## Périmètre

Tous les sujets F01àF10 de docs/architecture-improvements. Ordre F01,F02,F03,F04,F05,F06,F08,F09,F10,F07. F07 mutualise la fermeture seule, en expand/migrate/contract ; ne refactorise pas toute l’application. F09 traite le plafond et les retries impossibles, pas une nouvelle synthèse récursive.

## Contraintes

Dabi est absent. Aucun SSH/TV/VPS/déploiement/push/fournisseur applicatif/installation lourde. Ne lance aucun script live, aucun Codex de l’application, aucun test sur médias utilisateur ; garde tous les tests hors ligne avec doubles et données synthétiques. Authentification, appairage, VPN, données utilisateur, services et sources des autres sessions intouchables. Les sessions Claude explicitement demandées utilisent uniquement la connexion déjà présente, aucun nouveau budget/achat.

Tu n’es pas seul dans le dépôt : les autres sessions ont leurs propres worktrees. Ne revert pas leurs modifications, ne travaille que dans ton arbre et les fichiers attribués. Pas de reset --hard, clean, force push ou suppression de branche. Pas de sous-agents ou nouvelle session depuis un implémenteur ; le superviseur les gère.

## Invariants produit

Conserver jusqu’à suppression explicite, archives en lecture seule et reprise explicite, limites des questions5min, chat et surveillance parallèles, citations/baux/périmètre temporel figés, garde de contexte vidéo, files bornées et pertes visibles, idempotence et atomicité/scellement, cloisonnement failclosed, distinction résultats sourcés/indéterminés. Ne présente jamais simulation comme terrain ou estimation comme mesure de latence. SOLID sert les problèmes prouvés : pas d’interface/classe par objet, de framework, base vectorielle ou machine globale inutiles.

## Documentation et tests

Lire contrat local, sources réelles et tests existants avant modification. Quand une signature ou le comportement d’une bibliothèque/SDK/CLI doit être vérifié, utiliser ctx7 CLI : résoudre la bibliothèque puis sa documentation,3commandesmaximum, pas de secret dans requête ; quota en erreur doit être rapporté sans inventer de documentation. Pas besoin de nouvelle dépendance par défaut. Régression à la couture publique. Ne supprimer ou assouplir aucun test pour cacher un défaut ; documenter toute adaptation légitime.

Livrer commit local ciblé, fichiers modifiés, commandes et preuves rouges/vertes, critères couverts et limites. Ne ferme aucun ticket GitHub et ne publie pas de commentaire : supervision garde les tickets ouverts jusqu’à publication du code.
