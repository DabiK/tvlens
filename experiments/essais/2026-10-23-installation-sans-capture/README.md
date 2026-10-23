# Terminer l’installation sans capture

## Question et configuration

Mac de développement Apple Silicon, macOS 26.3, app signée preview.3 dans /Applications.
L’accès écran restait refusé malgré l’interrupteur activé. Le menu macOS « Afficher dans le Finder »
pointait vers cette même application. App Use a reproduit 5/6 après vérification et
« Failed to get sources » après sortie de l’assistant. Une réinitialisation ciblée autorisée
avec tccutil a réussi, sans démontrer la résolution. L’utilisateur rapporte toujours le blocage.
Aucune observation ni envoi d’images à un fournisseur pendant ce diagnostic.

## Changement et contrôles

La fin de l’assistant peut être mémorisée sans autorisation écran si les outils sont prêts.
Les états ready/canObserve restent faux, la capture conserve ses contrôles natifs.

- Deux tests de régression rouges avant le correctif, verts ensuite.
- 21 tests ciblés réussis : mac-setup, capture-sources, source-menu.
- check --changed vert : règles, format, lint, gel, cliquet, 10 tests modifiés.
- npm run test:electron:setup : PASS, parcours Continuer sans capture activé à 5/6,
  toujours activé après vérification, fermeture possible et bandeau fidèle.
  Ce smoke utilise Electron et des permissions simulées ; il ne modifie pas macOS.

## Limites

La cause du désaccord macOS n’est pas établie. Ce correctif supprime le blocage de
l’installation, sans prétendre réparer la capture. Le ZIP preview.3 existant n’est pas
reconstruit par ce commit. Aucun contrôle complet ni test de capture réelle du correctif.
Le scénario reproductible d’interface est dans scripts/smoke-setup.mjs.
