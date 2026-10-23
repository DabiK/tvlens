# Intégration Mac sur main

## Question et configuration

Intégrer les modèles de transcription, le diagnostic des permissions et les résultats de surveillance
dans le chat, sans perdre les évolutions déjà présentes dans `main`.
Mac Apple Silicon, Electron 44.4.5. Fusion de `fix/mac-live-check-chat` (`c35dd69`) avec
`origin/main` (`0c7797f`), dans un worktree isolé. Les brouillons vidéo et les médias GX10 indépendants
restent dans le checkout initial, hors de cette intégration.

## Comportements conservés

Catalogue de 33 modèles Whisper, langue persistée, téléchargement borné avec SHA-256 et choix depuis
l’assistant. Les erreurs de liste des fenêtres conservent le statut d’autorisation ; une permission
obtenue pendant l’exécution demande une réouverture. Les résultats de surveillance arrivent dans le chat.

Les corrections déjà intégrées sur main restent présentes : accès au trousseau après choix explicite,
assistant terminable sans capture, titre de la source transmis aux questions locales, inspection par
images individuelles, signature du paquet et vérification native. L’ADR de premier lancement est 0071 ;
le brouillon local anciennement numéroté 0067 n’est pas dupliqué. Le packaging conserve l’API
`signingIdentity` et les entitlements de main.

## Validation avant fusion

- `node scripts/check.mjs` : règles, format, lint, gel, cliquet verts ; 3 345 tests JS et 71 tests Python réussis.
- Relecture indépendante ciblée : 106 tests et parcours `test:electron:setup` réussis, avec catalogue
  et continuation sans capture.
- `test:electron`, `test:electron:identity`, `test:electron:config` : PASS, fournisseurs simulés.
- Construction ad hoc et `verify-package.mjs` : signature, inventaire, identité, sources et chargement
  natif de sharp vérifiés avant commit. La construction de validation indique donc `dirty: true`.

Les sorties brutes accompagnent ce rapport. Pas de benchmark ASR ni de capture système audio réelle
pendant cette fusion. Une construction finale propre et signée Developer ID est requise après le commit
pour installer exactement le code fusionné ; elle ne change pas le ZIP de la préversion publique.
