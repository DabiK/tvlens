# Installateur Mac depuis GitHub — 23 octobre 2026

## Question et configuration

Peut-on préparer TVLens et ses dépendances depuis un seul bloc du README, sans dépôt ni Node.js,
en conservant les données existantes et le choix d’une distribution sans notarisation ?

Mac Apple Silicon de développement, Bash système 3.2, outils Codex/Whisper/FFmpeg déjà installés.
Checkout isolé `codex/mac-first-launch`, base `01acddf` ; le checkout principal modifié n’est pas utilisé.
L’archive livrée reste celle de `v0.1.0-mac-preview.2`, construction propre `d190c322`, Developer ID
TVLens, Team ID `NNBW4BZ8T4`, bundle ID `dev.tvlens.capture`. Aucun nouveau paquet n’est envoyé à Apple.

## Résultats observés

- Exécution réelle de `scripts/install-mac.sh --yes --no-open --destination …/dist/installer-validation` :
  téléchargement public du ZIP, SHA-256 correct, signature complète et identité acceptées,
  outils présents conservés, modèle existant conservé, application installée. Code de sortie 0.
- Réexécution avec `--app-only --no-open` : téléchargement contrôlé à nouveau, app identique reconnue
  et conservée, aucun remplacement. Code de sortie 0.
- Téléchargement réel du modèle par `prepare_model` dans un HOME d’essai sans modèle, distinct des données
  utilisateur : 142 Mio environ, SHA-256 attendu vérifié, fichier final créé. Code de sortie 0.
- `/usr/bin/open` du paquet installé retourne 0 ; le processus principal de ce chemin est observé
  pendant plus d’une minute. Le contrôle d’interface échoue avec `AXError.cannotComplete` :
  **fenêtre et assistant non confirmés visuellement pour cet essai**. L’inventaire UI voit TVLens actif.
  Le seul processus lancé par cet essai est ensuite arrêté par SIGTERM, sans démarrer de capture.
- 21 tests ciblés passent, dont la vérification réelle macOS refusant un exécutable signé ad hoc,
  même avec le bundle ID TVLens. Les autres cas substituent les frontières réseau/système.
- `shellcheck scripts/install-mac.sh` et `/bin/bash -n scripts/install-mac.sh` passent.
  Un premier passage ShellCheck signalait les apostrophes typographiques dans des chaînes à quotes
  simples ; elles sont maintenant à quotes doubles. Un premier appel manuel `codesign -R` a révélé
  le préfixe `=` requis pour une expression littérale ; le script et le test réel emploient ce préfixe.

Les sorties brutes sont dans `preuves/`. Les contrôles complets et la publication sont consignés
à la fin de ce rapport après leur exécution.

## Lecture et limites

L’installation et la reprise sont validées sur ce Mac déjà équipé. La branche Homebrew absent est
couverte avec des outils simulés ; aucune désinstallation des outils du propriétaire n’a été faite.
Une installation sur Mac vierge, la saisie d’un mot de passe Homebrew, la connexion d’un nouveau compte
Codex et les confirmations de sécurité macOS restent à qualifier par un utilisateur.

Le téléchargement via curl ne reproduit pas nécessairement la quarantaine appliquée par un navigateur.
Aucun attribut de quarantaine ni protection macOS n’a été retiré. Le script ne promet pas l’absence
d’alerte Gatekeeper. La signature et le SHA-256 prouvent l’identité/l’intégrité du paquet contrôlé,
pas son approbation par Apple. La recette fonctionnelle audiovisuelle antérieure reste distincte
([rapport](../2026-10-23-installation-mac-reelle/README.md)) ; elle n’est pas rejouée ici.

## Reproduire

```sh
/bin/bash -n scripts/install-mac.sh
shellcheck scripts/install-mac.sh
node --test tests/mac-installer.test.cjs
# Réseau réel, prépare les outils si absents ; aucun fournisseur d’inférence appelé
/bin/bash scripts/install-mac.sh --yes --no-open --destination "$PWD/dist/installer-validation"
```

## Contrôle complet et correction documentaire

Le contrôle complet initial termine avec **3296/3297 tests JavaScript réussis**, **71 tests Python
réussis**, et les règles, format, lint, gel et cliquet verts. Son seul échec est l’absence du lien
vers l’ADR 0073 dans la section Décisions de l’architecture. Le lien est ajouté ; les **12 tests
documentaires** repassent tous, et le contrôle des modifications réussit avec les 21 tests du script.
La sortie initiale reste conservée : elle n’est pas présentée comme un contrôle complet vert.
La CI GitHub doit confirmer le contrôle complet du commit corrigé sur Linux et Mac.

## Installateur public

Le commit `77796c891a18d95c804da3d0127fd7f7f157dd2e` est poussé sur `main`.
Le tag [v0.1.0-mac-installer.1](https://github.com/DabiK/tvlens/releases/tag/v0.1.0-mac-installer.1)
pointe sur ce commit et fournit `install-mac.sh` et `SHA256SUMS`.

Le script téléchargé publiquement est identique octet pour octet au fichier du checkout :
`07b1d3c53422c059bdb11c6f6bd568ca8a44b3b09c64c26be39a49917621cb33` (SHA-256).
Son exécution réelle avec `--yes --no-open --destination …/dist/installer-validation` réussit,
reconnaît la version installée et conserve outils/modèle. Sortie brute : `preuves/installateur-public.txt`.

La première création du tag a été refusée par GitHub car son API exigeait le SHA complet, et non
son abréviation ; aucune livraison n’avait été créée. La création avec le SHA complet a réussi.
La CI du commit de livraison est suivie sur GitHub ; son résultat final est donné dans le bilan du chat.
