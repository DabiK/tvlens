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

### Contrôle du paquet et ressources de l’accueil

La première ouverture du paquet a révélé que la liste explicite des ressources n’incluait pas
le HTML et le CSS du nouvel accueil. L’inspection de l’ASAR a confirmé leur absence ; aucun ZIP
n’avait été publié. Le test `the protected settings window and its local styles and scripts survive packaging`
a reproduit le défaut avant correction, puis passe après ajout des deux fichiers à la liste autorisée.
La garde reste restrictive. Un échec de chargement de cet accueil ne peut plus faire démarrer
silencieusement l’app avec d’autres réglages. Les 67 tests de configuration, IPC et vérification
d’archive passent après ce changement ; le contrôle modifié et les 7 tests de contenu passent aussi.

Le script `scripts/smoke-package-startup.mjs` vérifie désormais l’application empaquetée elle-même,
avec profil neuf puis cache factice conservé. Il rejoint la CI après construction et inspection.
Une première assertion du script comparait `/var` à `/private/var`, alias macOS du même dossier ;
elle compare désormais les chemins résolus, sans relâcher l’exigence d’un profil isolé.

### Paquet signé final

Construction depuis `7d312794fc73c6838a190e88c3af31a0b40213f7`, checkout propre,
avec `package:mac --require-clean --sign-identity`, puis `verify:mac --require-clean` : réussite.
Le paquet est signé Developer ID, sans notarisation. Le smoke `smoke-package-startup.mjs` a
ensuite passé les deux scénarios sur cette application empaquetée (`app.isPackaged=true`), avec
identité propre vérifiée, profil temporaire isolé résolu par `realpath`, assistant visible,
aucune capture demandée, et cache factice conservé après continuation.

Archive `v0.1.0-mac-preview.3`, SHA-256 :
`3e3df2ba5d843149558e69ba878f349d92b9adc36ed726c22691094f5293ca06`.
Le script `v0.1.0-mac-installer.2` épingle cette archive ; les liens README et guide sont alignés.

### Téléchargement public

Le script a été téléchargé sans authentification depuis l’asset GitHub `v0.1.0-mac-installer.2`.
Comparaison octet par octet avec la source : identique ; SHA-256 du script :
`f544e4ef498006db3f4a6cea94951f4b059a3580ec5a97a1aac7e7d2325c75d6`.
Son exécution `--yes --app-only --no-open` a téléchargé le ZIP public (135 Mio), contrôlé son
empreinte et sa signature, puis reconnu l’app déjà construite dans la destination de validation.
C’est une vérification publique et une réexécution idempotente, pas une nouvelle installation
sur un Mac vierge. L’app active dans `/Applications` n’a pas été fermée ni remplacée.
