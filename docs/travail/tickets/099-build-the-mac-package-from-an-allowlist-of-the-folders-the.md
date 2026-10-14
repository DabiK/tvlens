---
id: T099
titre: Build the Mac package from an allowlist of the folders the app loads
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`npm run package:mac` met dans l'asar tout l'arbre de travail, sauf sept motifs. Y entrent donc `docs/`,
`tests/`, `film/`, `promo/`, `screenshots/`, `.claude/`, `.harness-state/`, `experiments/`, et aussi ce que
`.gitignore` déclare privé : `tv/app/connection.js` (secret d'appairage), `deploy/*.env`, `auth.json`,
`device-token`, `docs/candidature-draft.md`. Une liste d'exclusion ne protège pas d'un fichier qu'on n'a
pas prévu. Après ce ticket, le paquet se construit à partir d'une liste blanche : la racine, `package.json`
et les dossiers que l'app charge réellement. Tout le reste est refusé par construction. Un test prouve deux
choses : la liste couvre tout ce que l'app importe, et elle refuse tout le reste de la racine. Le paquet
n'est pas construit dans ce ticket.

## Sources

- Constats : DOC-09, OPS-08, OUBLI-17
- Code vérifié à la version `0d5a954` :
  - `scripts/package.mjs`, 11 lignes. Ligne 2 : `await packager({...})` au chargement du module. Ligne 3 :
    `dir: '.'`. Ligne 5 : `asar: { unpackDir: 'node_modules/@img' }`. Ligne 6 : `ignore`, sept expressions
    (`.env*`, `env.local`, `.local`, `.scratch`, `challenge`, `media`, `dist`, `.git`). Lignes 7-10 :
    `extendInfo`.
  - Comportement de `@electron/packager` avec `ignore` sous forme de fonction : la fonction reçoit `""` pour
    la racine, puis des chemins qui commencent par `/`. Elle est appelée aussi pour les dossiers, et un
    dossier refusé n'est pas parcouru. `node_modules` est trié à part par son élagueur, qui retire les
    dépendances de développement. Un fichier de `node_modules` qui n'est pas un module (par exemple sous
    `node_modules/.bin`) passe, lui, par la fonction.
  - Dans `@electron/packager` (`copy-filter.js`), les refus par défaut (`DEFAULT_IGNORES` : fichiers de
    verrouillage `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `/.git`, `/node_modules/.bin`,
    `\.o(bj)?$`, `/node_gyp_bins`) ne sont ajoutés que quand `ignore` est une liste. Avec une fonction, ils
    ne s'appliquent plus.
  - Ce que l'app lit hors des imports : `app/main.cjs:52`, `.env.local` seulement quand l'app n'est pas
    empaquetée ; `:81`, `preload.cjs` ; `:546`, `index.html`. `app/index.html` référence `style.css`,
    `ui/shell.css` et `renderer.js`. `app/recording.js` importe `../core/frame-policy.mjs`.
  - La fermeture des `require` et `import` relatifs depuis `app/main.cjs`, `app/preload.cjs`,
    `app/renderer.js` et `app/recording.js` touche 80 fichiers, tous sous `app/`, `runtime/`, `core/` et
    `adapters/` (mesure ponctuelle par `node -e` à la version citée).
  - `mcp/server.cjs` n'est lancé que par `adapters/codex-video-agent.cjs:8`, l'adaptateur hérité que l'app
    ne charge pas.
  - `.gitignore` lignes 25-41 : `tv/app/connection.js`, `/docs/candidature-draft.md`, `/deploy/runtime.env`,
    `/deploy/server.env`, `/publication-audit/`, `auth.json`, `auth.txt`, `device-token`, `*.ovpn` ;
    ligne 44 `.harness-state/`.
  - Modèle de garde d'exécution directe : `scripts/package-tv-ambient.mjs`, dernière instruction du
    fichier (`if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href)`).

## Périmètre

À créer :

- `scripts/package-filter.cjs`, qui exporte `keeps(name)`. La fonction admet `""`, `/package.json`, puis
  `/app`, `/core`, `/adapters`, `/runtime`, `/node_modules`, et tout ce qui se trouve sous ces dossiers. Elle
  refuse tout le reste, y compris un nom qui ne fait que commencer comme un dossier admis (`/appendix`,
  `/core-old`). Elle refuse aussi, sous `/app`, `/core`, `/adapters` et `/runtime`, les noms que `.gitignore`
  déclare privés (`connection.js`, `auth.json`, `auth.txt`, `device-token`, `.env*`, `*.ovpn`).
  Elle refuse partout ce que le packager refusait par défaut et qu'une fonction lui fait perdre : les
  fichiers de verrouillage, `.git`, `node_modules/.bin`, `node_gyp_bins` et les fichiers `.o`/`.obj`.
  `node_modules` reste trié par l'élagueur du packager, comme aujourd'hui.
- `tests/package-content.test.cjs`, qui vérifie :
  - que chaque fichier de la fermeture des imports relatifs depuis les quatre entrées de l'app, plus les
    fichiers référencés par `app/index.html`, est gardé, avec chacun de ses dossiers ancêtres ;
  - que chaque entrée de la racine du dépôt hors de la liste est refusée ;
  - que chaque nom privé de `.gitignore` est refusé, à la racine comme placé sous `/app` ou `/adapters` ;
  - que les refus par défaut du packager tiennent toujours : `/package-lock.json`,
    `/node_modules/.bin/electron`, `/node_modules/x/build/node_gyp_bins/python3`, `/node_modules/x/a.o` et
    `/.git/config` sont refusés, alors que `/node_modules/x/index.js` est gardé ;
  - que `packagerOptions().ignore` est bien la fonction de refus tirée de `keeps`.

À modifier :

- `scripts/package.mjs` : il exporte `packagerOptions()`, qui rend les options actuelles avec `ignore`
  remplacé par la fonction de refus. Il n'appelle `packager` qu'en exécution directe, sur le modèle de
  `scripts/package-tv-ambient.mjs`. `dir`, `out`, `name`, `platform`, `arch`, `appBundleId`, `overwrite`,
  `asar` et `extendInfo` ne changent pas.

À ne pas toucher :

- `app/`, `core/`, `adapters/`, `runtime/`. `package.json`, dont les dépendances (le déplacement du SDK MCP
  et de zod en développement est reporté).
- Le contenu de `media/` reste hors du paquet, comme aujourd'hui.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/package-content.test.cjs` passe.
2. Le test échoue si l'on retire `/runtime` de la liste : la fermeture des imports n'est plus couverte. Il
   échoue aussi si l'on retire le refus de `node_modules/.bin`. L'agent constate les deux une fois en local,
   note les sorties dans le journal, puis remet le code.
3. `node -e 'import("./scripts/package.mjs").then(m=>console.log(typeof m.packagerOptions))'` affiche
   `function` sans lancer de construction (aucun dossier `dist/TVLens-darwin-arm64` créé par cette commande).
4. `grep -c "packager(" scripts/package.mjs` rend 1, et cet appel se trouve dans la garde d'exécution
   directe.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/package-content.test.cjs`, nouveau. Frontière : la fonction de refus que reçoit `@electron/packager`,
appliquée aux chemins réels du dépôt et aux chemins de la fermeture des imports de l'app. Le packager n'est
pas lancé.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si la fermeture des imports touche un dossier hors des quatre dossiers cités
(un `require` vers `server/` ou `mcp/` ajouté entre-temps), le ticket l'ajoute à la liste et le note au
journal. Si l'app lit à l'exécution un fichier qu'aucun import ni `index.html` ne nomme, le test ne peut pas
le voir : verdict BLOQUÉ, avec le fichier et la ligne qui le lit. Construire le paquet pour regarder l'asar
est hors du ticket : le journal le dit comme non vérifié.

## Journal
