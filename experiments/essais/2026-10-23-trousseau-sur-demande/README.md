# Trousseau Mac après un choix explicite — 23 octobre 2026

## Question et configuration

TVLens peut-il afficher son assistant sans demande de trousseau au premier lancement,
et expliquer l’accès avant de charger une configuration protégée existante ?

Mac de développement, macOS 26.3, Electron 44.4.5, Node hôte 24.12.0.
Worktree isolé `mac-first-launch`, base `0dc44da`, modifications du parcours de configuration.
L’application de `/Applications`, déjà ouverte, n’est pas remplacée ni fermée.
Aucune capture, inférence, connexion Apple ou modification des protections macOS.

## Résultats

- `node scripts/smoke-config-access.mjs` : trois scénarios PASS dans Electron réel.
  Profil neuf : l’assistant s’affiche sans configuration protégée et sans création de cache.
  Cache factice existant : explication affichée, continuation sans accès au stockage.
  Refus simulé : aucune consultation avant le clic, une après, erreur compréhensible,
  puis continuation possible ; les octets du cache restent identiques.
- `node scripts/smoke-setup.mjs` : PASS, assistant, fin persistée, réouverture,
  outils absents, erreur de téléchargement récupérable.
- `node scripts/smoke-build-info.mjs` : PASS, identité absente annoncée inconnue dans les sources.
- `node scripts/check.mjs --changed --json` final : règles, format, lint, gel et cliquet verts ; 63 tests réussis.
- Architecture, configuration portable, régressions, UI Mac, paquet et index documentaire :
  126 tests réussis après correction de l’import du preload.

## Incidents et limites

Le premier contrôle complet a exécuté 3 313 tests JS : 3 312 réussis, un échec d’architecture,
car le nouveau preload importait directement Electron. Le nouvel écran utilise désormais
le preload existant avec une surface dédiée limitée à son choix. La garde d’architecture
n’a pas été modifiée ; elle passe avec les 126 tests ciblés finaux. Les 71 tests Python ont passé.
Ce contrôle complet initial reste archivé ; aucun second contrôle complet local n’est revendiqué.

Le premier smoke a atteint un délai à la création de la fenêtre du scénario de refus,
avec une instrumentation par redéfinition de la propriété Electron. Celle-ci a été remplacée
par une substitution du port via le chargeur de modules, uniquement dans le bootstrap de test.
Le smoke final n’utilise aucun drapeau de faux trousseau ni de désactivation de protection.
Les fournisseurs et la capture sont simulés ; le refus du trousseau est injecté.
Aucun véritable mot de passe n’a été demandé ou saisi pendant ces scénarios.

Ce Mac est déjà équipé : ce test n’est pas une installation sur un Mac vierge, ni une preuve
qu’une autorisation native ne sera jamais nécessaire après le clic de déverrouillage.
Le chargement réussi de secrets et la conservation des fournisseurs sont vérifiés sous ports
cryptographiques contrôlés dans les tests Node, pas avec des secrets personnels.

## Reproduction et preuves

Scripts : `scripts/smoke-config-access.mjs`, `scripts/smoke-setup.mjs`,
`scripts/smoke-build-info.mjs`. Tests : `tests/config-access.test.cjs`,
`tests/config-welcome.test.cjs`, `tests/mac-ipc-contract.test.cjs`.
Les sorties brutes et l’écran réellement affiché sont dans [preuves](preuves/).
