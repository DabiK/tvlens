# Fiche — Des livraisons reproductibles (lot L16)

Version du code lue : `0d5a954`, branche `refactor/maintenabilite`. Les tickets citent cette fiche sous le
chemin `docs/travail/fiches/livraison.md`.

Constats du lot : OPS-15, OPS-16, OPS-17 et OUBLI-28. La consigne du lot en annonce trois, mais OUBLI-28 y
figure aussi, et il est traité ici. Les corrections du relecteur priment sur les constats d'origine ; elles
sont reprises ici.

**Règle du lot.** Rien ne se déploie depuis la boucle : ni VPS, ni TV, ni signature. Les tickets livrent des
scripts, des fichiers décrits et leurs essais à blanc. L'exécution réelle reste une action du propriétaire.

Tickets écrits :

- T134 : exemples de réglages complets, et unité dont l'ordre dit la priorité ;
- T135 : identité de construction générée, puis lue ;
- T136 : route `GET /v1/version` ;
- T137 : manifeste des fichiers installés sur la TV, et table de la documentation tenue par un test.

Le reste se découpe plus tard, sur les déclencheurs du § 8.

## 1. État constaté

### 1.1 Serveur : installation à la main, révision en service inconnue (OPS-15, corrigé)

- `docs/server-installation.md` décrit l'installation par des commandes à recopier (l.61-87 : `useradd`,
  `install -d`, fichiers d'environnement, `codex login`, installation de l'unité, `systemd-analyze verify`).
- La section « Mise à jour reproductible » (l.144) est en prose. Elle demande de noter
  `git rev-parse HEAD`, mais rien ne le garde ni ne le montre ensuite.
- Le serveur ne dit pas quelle révision il exécute :
  - `server/http.cjs` n'a aucune route de version (grep de `version` vide) ;
  - le journal de démarrage `server/main.cjs:41` ne nomme que l'URL et le fichier du jeton.
- `deploy/tvlens.service` :
  - les lignes `Environment=` 12-18 viennent avant `EnvironmentFile=/etc/tvlens/runtime.env` (l.19) ;
  - deux autres viennent après : `Environment=TVLENS_PORT=8787` (l.20) et `Environment=PATH=…` (l.21) ;
  - `deploy/runtime.env.example` pose aussi `TVLENS_PORT=8787`.
- D'après `systemd.exec(5)`, `EnvironmentFile=` l'emporte sur `Environment=` quel que soit l'ordre des
  lignes. L'unité laisse donc croire que la ligne 20 fixe le port, alors que `runtime.env` le fixe (non
  vérifié sur un hôte : voir § 9).
- Réglages lus mais absents des exemples. La production (`core`, `adapters`, `runtime`, `server`, `mcp`,
  `app`) cite 39 noms `TVLENS_*` et `OPENROUTER_*`. Treize ne figurent ni dans `.env.example`, ni dans
  `deploy/*.example`, ni dans `deploy/tvlens.service` (relevé par script le 2026-10-14) :
  - dix sont des réglages, ce qui confirme la correction du relecteur (dix et non neuf) :
    - `OPENROUTER_AUDIO_INPUT` (`adapters/config.cjs:14`) ;
    - `TVLENS_INSPECTION_STRATEGY` (`:21`) ;
    - `TVLENS_WHISPER_AUDIO_CTX` et `TVLENS_PERCEPTION_BACKEND` (`SWITCHES`, `:59`) ;
    - `TVLENS_LOCAL_VLM_URL`, `_MODEL`, `_NUM_CTX` et `_KEEP_ALIVE` (`:60`) ;
    - `TVLENS_LOCAL_VLM_TOKEN` (`LOCAL_VLM_TOKEN`, `:61`) ;
    - `TVLENS_CODEX_TRACE` (`adapters/chat-trace.cjs:41`, lu dans `process.env` seulement) ;
  - trois sont des codes d'erreur, pas des réglages :
    - `TVLENS_STORAGE_FULL` (`core/session.cjs:6`, `adapters/disk-guard.cjs:4`) ;
    - `TVLENS_VISION_TRANSIENT` (`core/session.cjs:9`, `adapters/codex-perception.cjs:16`) ;
    - `TVLENS_RECAP_CAPACITY` (`core/living-recap.cjs:5`, `adapters/codex-recap.cjs:5`).
- Les lectures prennent plusieurs formes, ce qui empêche de les repérer par un seul motif :
  - `env.X` ou `environment.X` ;
  - `parent.TVLENS_CODEX_REAL_HOME` (`adapters/codex-confinement.cjs:226`) ;
  - `setting('TVLENS_MEDIA_RETENTION_MS')` (`app/main.cjs:66`) ;
  - `checked('TVLENS_MEDIA_RETENTION_MS', …)` (`server/main.cjs:18`) ;
  - les tableaux de noms `SWITCHES`.
- `loadConfig` fusionne le fichier et l'environnement par décomposition (`{ ...file, ...environment }`,
  `adapters/config.cjs:11`). Un `Proxy` ne peut donc pas enregistrer les lectures. Seule une lecture des
  sources rend la couverture vérifiable.
- Deux réglages lus n'agissent pas comme leur nom le laisse croire. Ce sont des faits du code, pas des
  décisions de ce lot :
  - `TVLENS_INSPECTION_STRATEGY` est lu (`config.cjs:21`, défaut `native-slow`), mais aucun module de
    production ne lit `config.inspectionStrategy`. `runtime/session-runtime.cjs:207` impose
    `sheets-diverse` en service ; en mode d'essai, la stratégie vient de l'argument
    `--inspection-strategy=` (`app/main.cjs:305`). Le réglage est donc sans effet ;
  - `OPENROUTER_AUDIO_INPUT` (`config.cjs:14`) ne remplit, dans l'app, que le champ `audioInput` de la
    configuration rendue à la vue (`app/main.cjs:254`), qu'aucun fichier de `app/` ne relit. Seul
    `scripts/probe-live.cjs:18` en tient compte, en le lisant dans l'environnement du processus.
- La commande de sonde du cloisonnement exige `--out` : sans lui, `scripts/probe-confinement.cjs:59-62`
  sort avec le code 2. `deploy/runtime.env.example:16` la cite déjà correctement :
  `node scripts/probe-confinement.cjs --out <new dir> --steps r --max-turns 0`.
- `prepare` (lot L03) lance `git config core.hooksPath`. Un `npm ci` dans un export sans `.git` échoue
  donc tant que L03 ne l'a pas corrigé.

### 1.2 TV : ce qui est installé n'est écrit nulle part en entier (OPS-16, confirmé)

- La table de `docs/lg-installation.md` (l.16-22) oublie `tv/ambient.py` et `tv/luna.py`. Or :
  - `tv/controller.py:18-19` importe `ambient`, avec un repli `except Exception` ;
  - `tv/capture.py:7-8` importe aussi de `ambient` ;
  - `tv/ambient.py:24` importe `luna`.
- `tv/controller.py:26` lance `capture.py`, voisin de son fichier, en sous-processus.
- Le relais de touches :
  - `prototypes/lg-remote/control.py:6` lance en sous-processus `runtime/tvlens_mapper.py`, avec
    `rakuten.json` (l.31) ;
  - `managed_mapper.py` lit `vendor/upstream.json` (l.29) et importe `magic_mapper` depuis `vendor/` ;
  - `magic_mapper_runtime.py:13` lit `action_catalog.json`.
- `tv/tailscale-service.sh` s'installe sous le nom `service` dans `/media/developer/tvlens-tailscale`.
  Le crochet privé `/var/lib/webosbrew/init.d/25-tvlens-tailscale` l'appelle, mais n'est pas dans le
  dépôt (`docs/lg-tailscale.md:50`).
- Les crochets du dépôt :
  - `30-tvlens-remote` lance `/media/developer/tvlens-remote/control.py boot` ;
  - `tv/35-tvlens-capture-control` lance `/media/developer/tvlens-companion/controller.py` avec son
    `connection.json`.
- Fichiers privés du compagnon, à préserver : `connection.json`, et `ambient.json` et
  `ambient-settings.json` (`tv/controller.py:91-92`, `docs/lg-ambient.md:32`). Le relais lit
  `/media/developer/tvlens-companion/ambient.json` (`runtime/tvlens_mapper.py:5`).
- Rien ne dit quelle version du panneau est installée. `docs/lg-remote-runtime.md:108` : l'enregistrement
  système « peut encore indiquer 0.0.2 ».
- `tv/dist` contient des paquets 0.0.3 et 0.0.4. Le dépôt ne documente pas le chemin physique des applis
  enregistrées sur la TV. L'empaqueteur écrit sous `usr/palm/applications/<id>/`.
- Applications enregistrées : le panneau `org.tvlens.sidebarprobe` (`docs/lg-installation.md:19`) et
  l'affichage ambiant `org.tvlens.ambient` (`docs/lg-ambient.md:12` et `:35`).
- Les replis `except Exception` de `controller.py` et `capture.py` sont voulus : la TV doit tourner sans
  ambiant. Ils restent.

### 1.3 Paquet Mac : signature ad hoc, ni notarisation, ni fusibles, ni identité (OPS-17, corrigé)

- `scripts/package.mjs` :
  - `@electron/packager` sur `dir: '.'` ;
  - `arch: 'arm64'` écrit en dur ;
  - `appBundleId 'dev.tvlens.capture'` ;
  - sept motifs `ignore` ;
  - ni `osxSign`, ni `osxNotarize`.
- `scripts/open-mac.mjs` écrit en dur `dist/TVLens-darwin-arm64/TVLens.app`.
- `node_modules/@electron` contient `osx-sign` et `notarize` (dépendances du packager), mais pas `fuses`.
- Relecteur, deux limites :
  - couper `RunAsNode` casse `adapters/codex-video-agent.cjs:15`, adaptateur hérité (décision OPS-11 et
    ADP-11, lot L09) ;
  - couper `EnableNodeCliInspectArguments` empêche `_electron.launch` de Playwright de s'attacher. Le smoke
    Electron ne peut donc pas servir de contrôle de lancement du paquet fusionné.
- `app/main.cjs:38` : `smoke` n'est possible que hors paquet (`!app.isPackaged`).

### 1.4 Version de Codex non épinglée sur le serveur (OUBLI-28)

- L'unité pointe `/opt/tvlens/codex/node_modules/.bin/codex` (`deploy/tvlens.service:16`).
- `docs/server-installation.md` :
  - l.55 : « Codex 0.158.0, installation npm séparée » ;
  - l.11 : le cloisonnement n'a été mesuré que sur `codex-cli 0.160.1`.
- `adapters/codex-confinement.cjs:182` : `SUB_AGENT_MEASURED_VERSION = "0.160.1"`.
- Aucun `package.json` ni verrou ne fixe la version installée sous `/opt/tvlens/codex`.

## 2. Forme cible

Une seule identité de construction, produite au moment de construire et lue par les deux hôtes. Des
manifestes déclaratifs disent ce qu'on installe. Les scripts d'installation, eux, essaient à blanc avant
d'agir.

| Module | Responsabilité | Dépend de |
| --- | --- | --- |
| `scripts/build-info.mjs` | Décrit une construction depuis Git : version de `package.json`, commit, date du commit, arbre modifié ou non. Écrit `build-info.json` dans un dossier donné. Git est injecté. | `node:` seulement |
| `adapters/build-info.cjs` | `readBuildInfo(dir)` : lit et valide `build-info.json`. Fichier absent : `null` (construction inconnue). Contenu invalide : erreur qui nomme le fichier. Jamais d'appel à Git à l'exécution. | `node:fs` |
| `server/http.cjs` | `GET /v1/version`, authentifiée comme les autres routes. Rend l'identité reçue à la construction, plus `process.version`. | identité injectée |
| `server/main.cjs` | Lit l'identité au démarrage, la passe au serveur et la nomme dans le journal. | `adapters/build-info.cjs` |
| `app/` (plus tard) | Affiche la même identité dans les réglages. | `adapters/build-info.cjs` |
| `deploy/` | Unité, exemples d'environnement, et plus tard scripts d'installation et de mise à jour avec essai à blanc. | identité, `GET /v1/version` |
| `tv/manifest.json` | Pour chaque composant de la TV : ses sources, sa destination, ses points d'entrée ; les crochets ; les applis par identifiant ; ce que l'installation ne touche jamais. | rien |
| `scripts/deploy-tv.mjs` (plus tard) | Compare par SHA-256 (essai à blanc par défaut), puis copie avec `--apply`. Transport injecté. | `tv/manifest.json` |
| `tests/settings-examples.test.cjs` | Tout nom `TVLENS_*` et `OPENROUTER_*` cité en production est un réglage présent dans un exemple, ou un code d'erreur déclaré. | sources |

Sens des dépendances :

- `core/` ne connaît pas l'identité de construction.
- L'adaptateur ne connaît pas Git ; le générateur ne connaît pas les hôtes.
- Les deux hôtes lisent l'identité par le même adaptateur (règle A8 : une seule forme).
- La TV et le serveur restent découplés : le client TV ne lit pas `/v1/version`, et le contrat du fil n'en
  dépend pas.
- Le test de couverture des réglages est le même que celui que propose DOC-15 (lot L10), et il n'y en a
  qu'un. DOC-15 l'étendra à sa table de référence quand ADP-09 (lot L11) aura rendu la configuration
  déclarative.

## 3. Séquence étendre, migrer, contracter

1. **Étendre : exemples et unité (T134).**
   - Ajouter les dix réglages aux exemples, avec le comportement actuel du code.
   - Regrouper toutes les lignes `Environment=` avant `EnvironmentFile=`, avec un commentaire sur la
     priorité.
   - Nouveau test de couverture des réglages, et une assertion d'ordre dans `tests/deploy-unit.test.cjs`.
   - Rien ne change à l'exécution.
2. **Étendre : identité (T135).** Générateur et lecteur, plus une ADR. Personne ne les appelle encore,
   hors tests.
3. **Migrer : le serveur se nomme (T136).**
   - `server/main.cjs` lit l'identité, et la route `GET /v1/version` la rend.
   - Ajout pur au contrat `/v1` (A7), après `jalon:contrat-fil`.
4. **Étendre : manifeste TV (T137).**
   - `tv/manifest.json`, avec un test Python de fermeture des imports et de cohérence avec les crochets.
   - La table de `docs/lg-installation.md` est corrigée et tenue par le même test.
   - Après lot:L09, pour que les chemins `tv/remote/` existent.
5. **Étendre : installation serveur, à découper.**
   - `deploy/install` (idempotent) et `deploy/update <rev>` : `/opt/tvlens/releases/<sha>` construit depuis
     `git archive`, `npm ci --omit=dev`, génération de `build-info.json`, sonde
     `node scripts/probe-confinement.cjs --out <dossier neuf> --steps r --max-turns 0`, bascule du lien
     `/opt/tvlens/app`, redémarrage, lecture de `GET /v1/version`, retour arrière si le commit diffère.
   - Exécuteur de commandes injecté, et essai à blanc par défaut qui imprime le plan.
6. **Migrer : la doc serveur passe aux scripts.** `docs/server-installation.md` remplace les commandes
   recopiées (l.61-87) et la prose de la l.144 par l'appel aux scripts, et garde les commandes manuelles en
   annexe.
7. **Étendre : `deploy-tv`, à découper.**
   - Essai à blanc qui compare les SHA-256 locaux aux sommes lues par ssh, puis `--apply`.
   - Refus tant qu'une capture tourne (`GET /capture` du contrôleur).
   - Ne touche jamais `connection.json`, `ambient.json`, `ambient-settings.json`, `connection.js`,
     `state/`, `bin/` ni le crochet 25.
   - Écrit un fichier `VERSION` (commit et sommes) par composant.
   - Transport injecté.
8. **Migrer : la doc TV renvoie à `deploy-tv`.** La table devient une sortie du manifeste.
9. **Étendre : paquet Mac, à découper.**
   - Architecture par option ou `process.arch`, et `open-mac` qui en déduit le chemin.
   - `build-info.json` inclus dans le paquet, et affiché dans les réglages.
   - Fusibles posés puis paquet re-signé ; identité de signature stable ou Developer ID ; contrôle de
     lancement du paquet construit, qui ne passe pas par Playwright.
10. **Contracter.**
    - Retirer de `docs/server-installation.md` la prose de mise à jour manuelle.
    - Retirer de la doc TV les commandes de copie à la main.
    - Retirer de l'unité tout réglage que `runtime.env` fixe déjà (après décision : voir § 7).
    - Épingler Codex (`deploy/codex/package.json` et son verrou), une fois sa version choisie.

## 4. Invariants à préserver

- Aucun secret dans un fichier généré ni dans un exemple :
  - `build-info.json` ne contient ni chemin d'hôte, ni nom d'utilisateur, ni jeton ;
  - les exemples gardent `OPENROUTER_API_KEY=` vide, et `TVLENS_LOCAL_VLM_TOKEN` commenté sans valeur.
- `GET /v1/version` est authentifiée par le jeton comme toutes les routes : le contrôle 401 précède le
  routage (`server/http.cjs`, `handle`).
- Le contrat `/v1` ne fait que s'étendre (A7). Le client TV n'est pas modifié.
- Le serveur démarre sans `build-info.json` (arbre de développement, tests) et dit alors que la
  construction est inconnue. Il ne démarre pas avec un fichier corrompu présenté comme connu.
- Les replis `except Exception` de `tv/controller.py` et `tv/capture.py` restent.
- Une installation ne touche jamais :
  - `connection.json`, `ambient.json` et `ambient-settings.json` (compagnon) ni `connection.js`
    (panneau) ;
  - l'état Tailscale (`state/`, `bin/`) ni le crochet 25.
- La sonde de cloisonnement passe `--out`.
- Aucune lecture de `process.env` hors `adapters/config.cjs`, `app/main.cjs` et `server/main.cjs` (mesure
  `process_env_hors_config` du cliquet). `server/main.cjs` est un lecteur autorisé.
- Les valeurs en service ne changent pas : regrouper les lignes de l'unité ne change aucune valeur.
- Les codes d'erreur `TVLENS_*` gardent leur nom (A5).
- Les textes français restent écrits où ils le sont (A6).

## 5. Tests qui protègent chaque étape, et ceux qui manquent

| Étape | Tests existants | Tests à ajouter |
| --- | --- | --- |
| 1 | `tests/deploy-unit.test.cjs` (1 test : `TasksMax`, `Restart`, `KillMode`) ; `tests/portable-config.test.cjs` (2 tests) | `tests/settings-examples.test.cjs` (couverture des réglages, codes d'erreur déclarés et non périmés) ; dans `deploy-unit`, l'ordre `Environment=` puis `EnvironmentFile=` |
| 2 | aucun | `tests/build-info.test.cjs` : générateur sur un Git injecté (propre, modifié, sans Git), lecteur (absent, valide, invalide) |
| 3 | `tests/remote-server.test.cjs` (construction `new RemoteServer({runtime,media,token}).listen(0,'127.0.0.1')`, l.14) et les tests de route | `GET /v1/version` : 401 sans jeton, 200 avec, corps exact, identité inconnue ; journal de démarrage |
| 4 | `tests/test_tv_control.py`, `test_tv_ambient.py`, `test_tv_capture_gate.py` (code TV, pas installation) | `tests/test_tv_manifest.py` : fermeture des imports par `ast` et `sys.stdlib_module_names`, sources existantes, aucun fichier privé, destinations uniques, crochets vers des entrées du manifeste, table de la doc d'accord avec le manifeste |
| 5-6 | aucun | essai à blanc des scripts serveur avec un exécuteur injecté : plan exact, refus d'un arbre modifié, retour arrière si `/v1/version` diffère |
| 7-8 | aucun | essai à blanc de `deploy-tv` avec un transport injecté : rien copié sans `--apply`, refus si capture active, fichiers préservés jamais dans le plan |
| 9 | aucun exécutable dans la boucle (Electron interdit) | test de configuration du packager (arch, fusibles déclarés, `build-info.json` dans la liste d'inclusion) ; lancement réel : action du propriétaire |

## 6. Risques

- Un test de couverture borné par motif rate des lectures (formes listées au § 1.1). Le test lit donc tous
  les noms et déclare à part les codes d'erreur. Le risque inverse est qu'un code d'erreur nouveau le fasse
  échouer : le message doit dire de le déclarer.
- Regrouper les lignes de l'unité : si la priorité systemd n'est pas celle de `systemd.exec(5)`, le port
  effectif pourrait changer. La valeur est la même des deux côtés (8787), donc le risque est nul pour la
  valeur de l'exemple. Le changement ne s'applique qu'à la réinstallation de l'unité, par le propriétaire.
- `build-info.json` ignoré par Git, mais oublié de la liste d'inclusion du paquet Mac (OPS-08, lot L09) :
  le paquet se dirait inconnu. À couvrir à l'étape 9.
- Le manifeste TV peut décrire une installation que la TV n'a pas (`ambient.py` et `luna.py` y sont-ils ?).
  Il dit ce que le code exige. L'écart avec la TV réelle se mesure à l'étape 7, en essai à blanc, par le
  propriétaire.
- Lot L09 (OPS-18) déplace `prototypes/lg-remote` vers `tv/remote`. Écrire le manifeste avant ferait citer
  des chemins voués à changer : T137 attend lot:L09.
- Fusibles : couper `RunAsNode` casse l'adaptateur vidéo hérité ; couper l'inspection casse le smoke
  Electron.
- Épingler Codex sans choisir la version ferait perdre la mesure de cloisonnement (0.160.1), ou la
  référence du serveur (0.158.0).

## 7. Décisions qui reviennent au propriétaire

1. Fusion du test de couverture des réglages avec DOC-15 (lot L10) : un seul test, celui de T134, que
   DOC-15 étend. Proposée par cette fiche, à confirmer.
2. Langage des scripts serveur (shell ou Node avec exécuteur injecté) et disposition
   `/opt/tvlens/releases/<sha>` avec un lien `app`.
3. Ce que fait `update` sur un arbre modifié : refus, ou construction marquée `dirty`.
4. Version de Codex à épingler : 0.158.0 (serveur de référence) ou 0.160.1 (cloisonnement mesuré). Le
   verrou se génère en ligne, hors boucle.
5. Installation de `@electron/fuses` (`installe: oui`), et fusibles à couper compte tenu de l'adaptateur
   hérité (`codex-video-agent`) et du smoke.
6. Identité de signature : ad hoc stable, certificat local ou Developer ID avec compte Apple et
   notarisation.
7. Contenu du crochet `25-tvlens-tailscale` : le verser au dépôt, ou le déclarer préservé seulement.
8. Modes et propriétaires des fichiers sur la TV, et chemin physique des applis enregistrées : relevés par
   le propriétaire (`stat` sur la TV).
9. Réglages lus mais sans effet sur le produit (`TVLENS_INSPECTION_STRATEGY`, sans effet nulle part ;
   `OPENROUTER_AUDIO_INPUT`, sans effet dans l'app) : les documenter seulement (T134), ou les retirer
   (lots L09 et L10).
10. Réglages fixés à la fois par l'unité et par `runtime.env` (`TVLENS_PORT`, `TVLENS_BIND`) : garder les
    deux, ou un seul.

## 8. Étapes non découpées et leurs déclencheurs

| Étape | Constats | Se découpe quand |
| --- | --- | --- |
| 5-6 : scripts `install` et `update` du serveur, doc serveur | OPS-15 (reste) | T135 et T136 terminés ; lot:L01 (OPS-01, version de Node refusée en dessous de 24) et lot:L03 (`prepare` sans `.git`) terminés ; décisions 2 et 3 prises |
| 7-8 : `deploy-tv`, fichiers `VERSION`, doc TV | OPS-16 (reste) | T137 terminé ; lot:L09 (paquets TV construits par `npm run package:tv`) terminé ; décisions 7 et 8 prises, avec les relevés `stat` |
| 9 : paquet Mac | OPS-17 | lot:L09 (OPS-08, liste d'inclusion ; ADP-11, sort de l'adaptateur hérité) terminé ; T135 terminé ; décisions 5 et 6 prises |
| 10 : épinglage de Codex | OUBLI-28 | décision 4 prise ; verrou généré en ligne par le propriétaire |
| 10 : contraction de la doc et de l'unité | OPS-15, OPS-16 | étapes 6 et 8 en service une fois réelle sur le VPS et la TV ; décision 10 prise |

## 9. Non vérifié

- La priorité de `EnvironmentFile=` sur `Environment=` vient de `systemd.exec(5)`. Elle n'a pas été
  essayée : ce Mac n'a pas systemd.
- Les valeurs par défaut des fusibles Electron 44, et l'effet de chaque fusible sur le paquet.
- Si macOS redemande les autorisations (capture d'écran, micro) après chaque construction signée ad hoc.
- Le chemin physique des applis enregistrées sur la TV, les modes et propriétaires des fichiers installés,
  et le contenu du crochet `25-tvlens-tailscale`.
- La présence réelle de `ambient.py` et `luna.py` sur la TV de test.
- Le lot L10 ne contient aucun ticket DOC-15 à la date de cette fiche (grep des tickets écrits) : la fusion
  se fait donc ici.
