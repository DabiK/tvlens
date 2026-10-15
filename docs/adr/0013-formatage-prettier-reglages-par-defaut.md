# 0013 — Prettier applique ses réglages par défaut

- Date : 2026-10-15
- Ticket : `docs/travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md`
- Statut : acceptée

## Contexte

Le contrôle unique sait lancer Prettier, mais signalait jusque-là son absence.
La forme cible de l’arbitrage A8, `runtime/session-closing.cjs`, respecte déjà les réglages par défaut,
comme le code le plus récent. Le test de confinement dans `tests/codex-confinement.test.cjs` attend
des guillemets doubles pour la valeur par défaut `"enforce"` du client Codex.
La mesure au découpage avec Prettier 3.8.1 donne 201 fichiers JavaScript à réécrire sur 214.

## Décision

Prettier 3.8.1 est une dépendance de développement verrouillée en version exacte.
La configuration racine `.prettierrc.json` contient `{}` : largeur de 80 colonnes, guillemets doubles,
`trailingComma: "all"`, `arrowParens: "always"` et fins de ligne LF.
Ces réglages suivent la forme cible A8, préservent l’attente du test de confinement et correspondent
au code le plus récent, déjà conforme.

Les commandes `npm run format` et `npm run format:check` appliquent et contrôlent cette configuration.
Le contrôle unique active automatiquement son étape format dès que le binaire est installé.
La liste `.prettierignore` exclut les sous-projets, les données et le harnais, y compris les dossiers
`.codex/` et `.agents/` ajoutés depuis le découpage du ticket.
Son bloc temporaire final ignore les fichiers `.js`, `.cjs` et `.mjs` jusqu’au ticket de formatage.

## Alternatives écartées

- Style dominant (apostrophes, `arrowParens: "avoid"`, 100 colonnes) : il s’écarte de la forme cible
  et du code récent, et les apostrophes casseraient l’attente textuelle du test de confinement.

## Conséquences

Le ticket de formatage retirera le bloc temporaire et réécrira 201 fichiers selon la mesure au découpage.
Une branche ou un worktree déjà ouvert se remet à niveau en appliquant `prettier --write .` deux fois
avant de fusionner, une fois le bloc temporaire retiré.
La largeur de 80 colonnes reste sous la règle des 160 caractères de `docs/standards.md`.
CSS, HTML, Markdown et harnais ne sont pas formatés pour l’instant ; les sous-projets conservent
leur configuration propre. `.editorconfig` et `.gitattributes` viendront après le commit de formatage.

## Protégée par

`node_modules/.bin/prettier --version`, la version exacte dans `package.json`,
`node_modules/.bin/prettier --find-config-path core/ports.cjs`, les vérifications `--file-info`
et l’extraction du bloc temporaire sont les preuves d’acceptation consignées dans le journal du ticket.
`npm run format:check` et l’étape format de `node scripts/check.mjs` vérifient les fichiers admis.
`tests/quality-check.test.cjs` continue de vérifier le signalement des outils absents dans un dépôt isolé.
