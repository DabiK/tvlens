---
id: T011
titre: Declare the Node version the project runs on and refuse older ones
statut: a-faire
bloque_par: T294
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les documents demandent « Node.js 24+ », mais rien dans le dépôt ne le déclare : `npm ci` s'installe sur
n'importe quelle version et les tests y échouent sans dire pourquoi. Après ce ticket, la version est
déclarée une fois dans `package.json`, reprise par `.nvmrc`, et `npm` refuse d'installer sur une version
plus ancienne.

## Sources

- Constats : OPS-01, TSTC-11, FLK-14
- État relu à la version `1178657` (le constat d'origine porte sur `0d5a954`) :
  - `package.json` : pas de champ `engines`. Ni `.nvmrc` ni `.npmrc` à la racine.
  - `README.md` ligne 119, `docs/installation.md` ligne 9, `docs/server-installation.md` ligne 9 :
    « Node.js 24+ ». `docs/vps-deployment.md` ligne 9 : Node 24.13.0 sur le serveur.
  - `package-lock.json` : `electron` 44.4.5 et `@electron/packager` 20.3.0 déclarent `node >= 22.12.0`,
    `sharp` 0.35.5 `>= 20.9.0`. D'après l'audit, Electron 44.4.5 embarque Node 24.21.0.
  - `CONTRIBUTING.md`, section « Vérifier une modification » (lignes 86 à 92) : `npm ci`, `npm test`,
    `npm run test:electron`, sans version de Node.
- Mesures du découpage, Node 24.12.0 et npm 11.6.2, sur une copie hors dépôt de `package.json` et
  `package-lock.json` :
  - À `0d5a954`, 131 paquets verrouillés déclaraient `engines.node`. Relu à `1178657` par le script
    ci-dessous : 190 paquets le déclarent (ESLint, `@eslint/js`, `globals` et Prettier sont entrés depuis) ; tous
    acceptent 24.0.0, 24.12.0 et 24.13.0, sauf un : `@img/sharp-win32-ia32` (`^20.9.0`), optionnel et
    réservé à Windows 32 bits.
  - Les deux mesures `npm ci` qui suivent datent de `0d5a954` ; elles n'ont pas été rejouées à
    `1178657`.
  - Avec `"engines": { "node": ">=24" }` et un `.npmrc` contenant `engine-strict=true`,
    `npm ci --dry-run --offline --ignore-scripts` se termine avec le code 0 (146 paquets) : le paquet
    optionnel ne bloque pas.
  - Avec `"engines": { "node": ">=99" }`, la même commande échoue : `npm error code EBADENGINE`,
    « Not compatible with your version of node/npm: tvlens@0.1.0 », code 1. `npm` vérifie donc bien le
    paquet racine.

  Script de mesure du premier point, à enregistrer dans le dossier d'état du ticket
  (`.harness-state/tickets/<id du ticket>/engines.cjs`, hors Git) et à lancer depuis la racine par
  `node .harness-state/tickets/<id du ticket>/engines.cjs 24.0.0`. Il affiche chaque paquet verrouillé qui
  refuse la version donnée ; sa lecture des plages suffit pour celles du verrou, ce n'est pas un
  analyseur semver complet.

  ```js
  const lock = require(process.cwd() + "/package-lock.json");
  const floor = process.argv[2] || "24.0.0";
  const have = floor.split(".").map(Number);
  const one = (c) => {
    const m = c.match(/^(\^|~|>=|>|<=|<|=)?v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
    if (!m) return c === "*" || c === "";
    const want = [m[2], m[3] || 0, m[4] || 0].map(Number);
    const cmp = have[0] - want[0] || have[1] - want[1] || have[2] - want[2];
    const same = { "^": have[0] === want[0], "~": have[0] === want[0] && have[1] === want[1] };
    if (m[1] === "^" || m[1] === "~") return cmp >= 0 && same[m[1]];
    return { ">=": cmp >= 0, ">": cmp > 0, "<=": cmp <= 0, "<": cmp < 0 }[m[1]] ?? cmp === 0;
  };
  const ok = (range) => range.split("||").some((part) => part.trim().replace(/([\^~<>=])\s+/g, "$1").split(/\s+/).every(one));
  let seen = 0;
  for (const [name, p] of Object.entries(lock.packages)) {
    if (!p.engines?.node) continue;
    seen++;
    if (!ok(p.engines.node)) console.log(name, "|", p.engines.node, "|", p.optional ? "optionnel" : "REQUIS");
  }
  console.log(`${seen} paquets déclarent engines.node ; plancher essayé : ${floor}`);
  ```

## Périmètre

- À modifier : `package.json` (`"engines": { "node": ">=24" }`) ; l'entrée racine `packages[""]` de
  `package-lock.json`, qui reçoit le même champ `engines` et rien d'autre ; `CONTRIBUTING.md` (la
  version requise et `nvm use`).
- À créer : `.nvmrc` (une ligne : `24`) et `.npmrc` (une ligne : `engine-strict=true`).
- Le plancher est celui que les documents annoncent déjà. Les quatre documents cités ne changent pas de
  version ; une phrase peut y renvoyer à `.nvmrc`.
- À ne pas faire : lancer `npm install`, `npm ci` ou toute commande qui écrit dans `node_modules` ou
  touche au réseau ; ajouter un `.python-version` (le lanceur `pyenv` du poste casserait sur une version
  non installée) ; toucher à `deploy/`, à la TV, au VPS ; ajouter une règle de lint ou un workflow
  d'intégration continue.

## Critères d'acceptation

Chaque critère se vérifie par une commande, sortie dans le journal.

1. `node -p "require('./package.json').engines.node"` affiche `>=24`, et
   `node -p "require('./package-lock.json').packages[''].engines.node"` aussi.
2. `cat .nvmrc` affiche `24`. `npm config get engine-strict`, lancé à la racine, affiche `true`.
3. Le script de mesure des sources, lancé avec `24.0.0`, n'affiche aucune ligne « REQUIS ».
4. Dans une copie de `package.json`, `package-lock.json` et `.npmrc` placée dans le dossier d'état du
   ticket (`.harness-state/tickets/<id du ticket>/npm/`, hors Git, sans `node_modules`),
   `npm ci --dry-run --offline --ignore-scripts` se termine avec le code 0.
5. Dans la même copie, après avoir remplacé `>=24` par `>=99` dans `package.json` seulement, la même
   commande échoue avec `EBADENGINE` et nomme `tvlens`.
6. `grep -n "nvmrc\|Node.js 24" CONTRIBUTING.md` montre la version requise et le renvoi à `.nvmrc`.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Aucun test de code : ce ticket ne change que de la configuration. La preuve est faite par les critères 4
et 5 — `npm` accepte la version courante et refuse un plancher non satisfait — rejoués dans une copie
sans `node_modules`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si le critère 4 échoue hors ligne pour une raison autre que la version
(cache `npm` absent, verrou jugé incohérent) : verdict BLOQUÉ, avec la sortie, sans passer en ligne.

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à
  jour à `1178657` (README ligne 119, `CONTRIBUTING.md` lignes 86 à 92, 190 paquets déclarant
  `engines.node`, toujours la seule exception optionnelle) ; bloqueurs revus : T145 retiré (file
  rouverte), T294 ajouté (le ticket passe après la file en cours). Critères inchangés.
