# CI et construction Mac

Le workflow `.github/workflows/ci.yml` contrôle les pull requests, les pushes sur `main` et les lancements manuels. Son activation nécessite que ce fichier soit poussé sur GitHub. La branche peut ensuite exiger le statut **CI complète** dans ses règles de protection ; le workflow ne configure pas ces règles à lui seul.

## Contrôles

| Étape | Garantie |
| --- | --- |
| Ubuntu 24.04 et macOS 15 Apple Silicon | Node épinglé dans `.node-version`, Python 3.14.2, FFmpeg présent, installation par `npm ci` |
| `npm run ci:check` | Contrôle complet existant : règles, format, lint, gel, cliquet, suites JavaScript séquentielles et Python |
| Comparaison à la base | Refus d’un gel augmenté, d’un plancher relâché/supprimé et d’infractions par fichier ajoutées, même après commit |
| Python télécommande | Suite `prototypes/lg-remote`, hors découverte du contrôle racine ; historique Git complet pour ses fixtures |
| Smoke Electron Mac | Parcours de l’interface avec capture synthétique et fournisseurs simulés, puis identité vérifiée via IPC jusque dans les détails techniques et assistant de premier lancement (succès, dépendances absentes, échec récupérable) |
| Construction et inspection | Dépôt propre, inventaire ASAR, identité, sources identiques, dépendances de production, fichiers natifs décompressés et chargement de `sharp` |

Les actions sont épinglées par SHA. Les permissions du workflow se limitent à la lecture du dépôt. Aucun fournisseur, identifiant privé, TV ou VPS n’est requis. Une étape qualité « non lancée » fait échouer le wrapper. Les cas conditionnels internes aux tests restent gouvernés par la suite ; installer FFmpeg évite les exclusions dues à son absence.

Pour une PR, la comparaison utilise le SHA de la branche de base fourni par GitHub. Pour un push, elle utilise le précédent SHA ; pour un lancement manuel ou une première poussée, le parent du checkout (ou le checkout lui-même s’il n’a pas de parent). Le harnais `scripts/check.mjs` reste inchangé. Le wrapper réutilise les mesures de `scripts/quality/metrics.mjs` et complète leur comparaison Git.

## Reproduire localement

Depuis la racine, avec Node de `.node-version`, Python et FFmpeg :

```sh
npm ci
npm run ci:check -- --base SHA_COMPLET_DE_LA_BASE --report /tmp/tvlens-quality.json
python3 -B -m unittest discover -s prototypes/lg-remote -p 'test_*.py'
# Sur le Mac, après le contrôle, sans modèle local chargé :
npm run test:electron
npm run test:electron:identity
npm run test:electron:setup
npm run package:mac
npm run verify:mac -- dist/TVLens-darwin-arm64/TVLens.app --report /tmp/tvlens-package.json
```

Sans `--base`, le wrapper exécute et exige toutes les étapes du contrôle complet, mais ne fait pas de comparaison avec une autre révision. `--changed` n’est jamais utilisé en CI : il sélectionnerait zéro test sur un checkout propre. Un test instable s’explique et se corrige ; il n’est pas relancé automatiquement.

## Contenu du paquet

`scripts/package-filter.cjs` admet le JavaScript de `app/`, `core/`, `adapters/` et `runtime/`, ainsi que les ressources statiques explicitement listées : HTML, feuille principale, feuille de la coque UI et feuille de l’assistant d’installation. Le worklet audio est du JavaScript et reste inclus. Les liens symboliques dans les sources sont refusés.

S’y ajoutent `package.json`, l’identité générée et les dépendances de production installées depuis le lockfile. Le packager retire les dépendances et métadonnées de développement. La vérification refuse les paquets de développement ou absents du lockfile. Les modules `@img` de `sharp` restent décompressés pour le chargement natif.

Les autres racines sont exclues, dont `docs`, `tests`, `scripts`, `experiments`, `design`, `server`, `mcp`, `tv`, les médias et le harnais. Les fichiers cachés, configurations privées usuelles, clés, sessions et moments gardés sont exclus. Un nouveau fichier statique utile nécessite une modification explicite de la liste et un test. Cette politique de chemins ne remplace pas la relecture du contenu du code et des dépendances.

`verify:mac` vérifie chaque source livrée octet par octet contre le checkout, le manifeste et l’identité, puis compare le dossier `app.asar.unpacked` à l’inventaire de l’archive. Il lance ensuite **le binaire Electron du paquet en mode Node**, charge son lecteur d’identité et produit un PNG avec son `sharp`. Il ne démarre ni session ni fournisseur. Le rapport conserve l’inventaire, la taille et l’empreinte SHA-256 de l’ASAR.

Cette sonde native ne remplace pas une recette de l’application installée via Finder, avec autorisations et vraie capture audio/vidéo. Le smoke UI utilise encore les sources, pas la `.app` empaquetée.

## Identité de construction

`build-info.json` contient uniquement `name`, `version`, le SHA complet `commit`, sa date `commitDate` et `dirty`. La date est celle du commit, pas celle de l’horloge de construction : la génération est stable pour un même état Git. Cela ne promet pas un binaire bit à bit reproductible. Les fichiers non suivis comptent dans `dirty` ; les fichiers ignorés par Git n’y comptent pas.

Le packager génère l’identité dans sa copie de travail, sans écrire à la racine du dépôt. Une identité locale antérieure n’est jamais recopiée. `package:mac -- --require-clean` et `verify:mac -- … --require-clean`, utilisés en CI, refusent les modifications locales.

À l’exécution, seul le JSON est lu : aucun appel Git. L’absence signifie « Construction inconnue », utile pour le développement. Un fichier présent mais illisible ou invalide arrête le démarrage avec un diagnostic, au lieu de masquer le problème.

- Mac : **Réglages IA → Détails techniques**, version, SHA court et mention « modifiée ».
- Serveur : journal de démarrage et `GET /v1/version`, sous la même authentification Bearer que les autres routes. Réponse `{ "build": …, "node": "v…" }`, sans configuration privée ni état de session.
- Export serveur : exécuter `npm run build:info -- --out /chemin/de/l-export` depuis le checkout de construction, puis conserver le JSON à la racine de l’export. Le JSON n’est pas régénéré au démarrage. Après une mise à jour des sources, il doit être régénéré avant redémarrage.

## Artefact téléchargeable et suite de la livraison

Après succès des deux plateformes et du smoke Mac, GitHub conserve pendant 14 jours un artefact nommé `TVLens-mac-arm64-<SHA>`. Il contient `TVLens-mac-arm64.zip`, `SHA256SUMS` et `package-report.json`. Le ZIP créé avec `ditto` conserve la structure et les permissions de la `.app` ; télécharger des fichiers d’application bruts via l’upload d’artefacts pourrait les perdre.

Il s’agit d’une construction de validation Apple Silicon, sans signature de distribution Developer ID ni notarisation. Le workflow ne publie pas de GitHub Release et ne produit pas de DMG ni de mise à jour automatique. L’assistant de premier lancement vérifie les outils et guide leur installation ; le modèle Whisper peut être téléchargé depuis l’application. FFmpeg, Whisper et Codex restent des outils externes, conformément au [guide Mac](installation.md). Le ZIP n’est pas encore une distribution signée ou une installation entièrement automatique.

Décision : [ADR 0066](adr/0066-la-livraison-controle-le-paquet-et-son-identite.md).

## Téléchargement depuis le README

La [préversion Mac 0.1.0](https://github.com/DabiK/tvlens/releases/tag/v0.1.0-mac-preview.1) fournit un [ZIP directement téléchargeable](https://github.com/DabiK/tvlens/releases/download/v0.1.0-mac-preview.1/TVLens-mac-arm64.zip), accompagné de `SHA256SUMS` et `package-report.json`. Elle reste disponible indépendamment de l’expiration des artefacts Actions et ne nécessite pas de compte GitHub.

Cette première publication est manuelle : paquet construit depuis le commit propre `0c0fcbd305321fe7d0360d7510fccf6004710027`, avec `package:mac -- --require-clean`, puis inspecté avec `verify:mac -- --require-clean`. Les contrôles locaux complets et les recettes Electron de cette révision sont consignés dans le [rapport d’intégration](../experiments/essais/2026-10-23-installation-mac-reelle/README.md). Le job qualité Mac GitHub a réussi ; le statut global du [run de cette révision](https://github.com/DabiK/tvlens/actions/runs/39885144148) se consulte séparément. Le ZIP publié ne provient pas de l’artefact CI.

Pour la prochaine version, publier sous un nouveau tag, conserver les anciennes archives et mettre à jour ensemble les liens du README et du guide Mac. Ne pas remplacer silencieusement un ZIP déjà publié. Les outils Codex, FFmpeg et Whisper restent externes à cette préversion.
