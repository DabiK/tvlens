# Premier lancement Mac — 23 octobre 2026

## Question et configuration

Vérifier que l’application guide une première installation, conserve les emplacements choisis et reste utilisable après une erreur de préparation. Mac Apple Silicon de développement, macOS 26.3 (25D2125), Node 24.12.0, Electron 44.4.5 installé par le verrou npm ; base Git `c7f04f4`, modifications locales de cette étape. Aucun outil ni modèle réel installé par la recette, aucun appel fournisseur, TV ou VPS.

Le script [smoke-setup.mjs](../../../scripts/smoke-setup.mjs) ouvre réellement Electron avec `--smoke-test --smoke-setup` et des données temporaires, supprimées à la fin. Les états des dépendances, la capture et les fournisseurs sont simulés. Deux vues couvrent les prérequis satisfaits et les outils absents. Les tests de téléchargement utilisent un flux de fixture ; ils ne téléchargent pas le modèle Hugging Face.

## Protocole

```sh
node scripts/check.mjs --json
node --test tests/desktop-setup.test.cjs tests/mac-setup.test.cjs tests/speech-model-download.test.cjs tests/mac-ipc-contract.test.cjs tests/documentation-index.test.cjs
npm run test:electron
npm run test:electron:identity
npm run test:electron:setup
npm run package:mac -- --out dist/setup-validation
npm run verify:mac -- dist/setup-validation/TVLens-darwin-arm64/TVLens.app --report /tmp/tvlens-setup-package-report.json
```

## Résultats

| Contrôle | Résultat observé |
| --- | --- |
| Régressions et index documentaire | 71 tests réussis, zéro échec |
| Interface Mac et contrat renderer | 60 tests réussis, zéro échec |
| Style, règles, lint et cliquet | Réussite |
| Recette Electron principale | Réussite : capture, questions, vérification, surveillance et sessions simulées |
| Identité dans Electron de développement | Réussite : absence de métadonnées annoncée comme construction inconnue |
| Premier lancement Electron | Réussite : affichage initial sans liste de captures, fin persistée, réouverture, dépendances absentes et récupération après erreur de téléchargement |
| Construction Mac et inspection | Réussite : 3 613 fichiers vérifiés, 166 fichiers sources, Sharp 0.35.5 chargé dans Electron 44.4.5 |
| Contrôle complet après corrections | Réussite : 3 074 tests JS dans 165 fichiers, 71 tests Python, aucun échec ; règles, format, lint, gel et cliquet réussis |

Les sorties brutes sont dans `preuves/`, avec les empreintes des sources de cette étape. [Vue prête](preuves/installation-prete.png) et [vue incomplète](preuves/installation-incomplete.png) ont été inspectées visuellement. Le paquet local est dans `dist/setup-validation/TVLens-darwin-arm64/TVLens.app` (ignoré par Git).

## Incidents et corrections

La relecture a révélé l’absence de demande macOS explicite sur une installation vierge, une divergence du compte Codex après import et des erreurs disque insuffisamment normalisées. Les régressions rouges sont conservées, puis corrigées. Une doublure du test d’autorisation utilisait directement `granted` comme état de diagnostic au lieu de `ready` ; elle a été corrigée pour reproduire la frontière réelle de l’adaptateur, sans changer l’assertion attendue.

Le premier contrôle complet a terminé avec 3 071 tests JS réussis et deux échecs : cette doublure et la cardinalité attendue du bridge, passée de 57 à 60 méthodes avec les trois appels d’installation. Le contrat conserve une cardinalité exacte ; les nouveaux appels et les identifiants du dialogue sont également vérifiés. Les 71 tests Python de ce passage réussissaient déjà. Le contrôle complet a réussi après ces corrections identifiées, sans modifier le harnais ni ses seuils.

## Lecture et limites

Cette recette valide le parcours dans un vrai processus Electron, avec sondes contrôlées. Elle ne prouve pas l’installation depuis Gatekeeper sur un Mac vierge, l’apparition native du dialogue TCC, l’autorisation réelle du son système, la connexion interactive Codex, ni une transcription réelle. Le paquet reste sans signature de distribution Apple ni notarisation. La construction locale porte une identité `dirty` ; elle ne constitue pas une release publiée.
