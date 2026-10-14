---
id: T006
titre: Read the session folder only after the store has finished writing
statut: termine
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Sous un disque ralenti, le test du nettoyage des médias liste le dossier de la session pendant que le
magasin écrit encore son manifeste : il y trouve `manifest.json.tmp` et échoue. Après ce ticket, le test
attend la fin des écritures du magasin par sa méthode publique avant de lire le dossier, et garde toutes
ses exigences.

## Sources

- Constats : FLK-03, OUBLI-36
- Code concerné, à la version `0d5a954` :
  - `tests/session-durable.test.cjs`, test « the cleanup of a former version cannot erase durable media,
    and media it left behind are read in place » (ligne 271). Ligne 273 : `await live.watch.ingest(…);
    await settle(live.watch);`. Ligne 274 : `await cleanupRawMedia(f.sessionsRoot);`. Ligne 277 : le
    `readdir` du dossier, filtré sur les fichiers non `.json`, attendu égal à `['media', 'thumbs']`.
  - `tests/session-durable.test.cjs`, aide `settle(watch)` (lignes 18 et 19) : elle attend la fin de
    l'ingestion (`watch.running`), pas celle des écritures.
  - `adapters/local-store.cjs`, méthode `flush()` (lignes 202 à 207) : attend la file d'écriture jusqu'à
    ce qu'elle soit stable, puis signale une écriture d'état refusée. L'écriture du manifeste passe
    par `persist('manifest', …)` (ligne 197), donc par la même file `this.serial` (ligne 163) :
    `flush()` l'attend aussi, même si un refus du manifeste n'y est pas signalé.
- Mécanisme : `manifest.json.tmp` est le fichier temporaire d'une écriture atomique en cours. Il ne finit
  pas par `.json` : il passe le filtre de la ligne 277 et s'ajoute à la liste attendue.
- Mesure de l'audit, lue dans ses journaux et non relancée au découpage : avec la sonde ci-dessous à
  `FLK_MS=5` puis `FLK_MS=20`, le test échoue avec `manifest.json.tmp` en trop à la ligne 277 ; sans
  sonde, 24 tests sur 24. Avec `await live.store.flush()` après la ligne 273, 24 sur 24 sous les deux
  réglages.

### Sonde et garde

À enregistrer dans le dossier d'état du ticket, `.harness-state/tickets/<id du ticket>/` (hors Git),
noté `$ETAT` dans les commandes.

`$ETAT/slow-fs.cjs` :

```js
const fsp = require("node:fs/promises");
const realSetTimeout = globalThis.setTimeout;
const names = (process.env.FLK_SLOW || "mkdir,writeFile,rename").split(",").filter(Boolean);
const ms = Number(process.env.FLK_MS || 5);
if (ms > 0) {
  for (const name of names) {
    const original = fsp[name];
    if (typeof original !== "function") continue;
    fsp[name] = function (...args) {
      return new Promise((resolve) => realSetTimeout(resolve, ms)).then(() => original.apply(this, args));
    };
  }
}
```

`$ETAT/garde.cjs` — le fichier contient des attentes sans borne (`settle`) : la garde évite qu'un
lancement sous sonde ne reste bloqué.

```js
const { spawnSync } = require("node:child_process");
const [seconds, ...command] = process.argv.slice(2);
const options = { stdio: "inherit", timeout: Number(seconds) * 1000, killSignal: "SIGKILL", detached: true };
const result = spawnSync(command[0], command.slice(1), options);
const hung = result.error?.code === "ETIMEDOUT";
if (hung) {
  try {
    process.kill(-result.pid, "SIGKILL");
  } catch (error) {
    // Le groupe a déjà disparu : il n'y a plus rien à arrêter.
  }
  console.log(`GARDE : encore vivant après ${seconds} s, groupe de processus arrêté`);
}
process.exit(hung ? 124 : (result.status ?? 1));
```

Commande, appelée « commande de sonde » dans les critères, avec `FLK_MS` à 5 ou à 20 :

```sh
FLK_MS=20 node $ETAT/garde.cjs 120 node --require ./$ETAT/slow-fs.cjs --test tests/session-durable.test.cjs
```

## Périmètre

- À modifier : `tests/session-durable.test.cjs`, ce seul test.
- À ne pas toucher : le code de production, l'aide `settle`, les autres tests du fichier. Les autres
  lectures de `store.serial` dans les tests (une quarantaine) relèvent d'un autre chantier : elles
  demandent une barrière commune, pas ce geste.
- Aucun délai n'est ajouté. Le test n'est jamais relancé jusqu'à ce qu'il passe.

## Critères d'acceptation

Chaque critère se vérifie par une commande, sortie dans le journal.

1. Reproduction avant correction : la commande de sonde à `FLK_MS=20`, lancée trois fois sur le fichier
   non modifié, échoue trois fois sur le test visé, avec `manifest.json.tmp` dans la liste lue.
2. Le test corrigé attend `live.store.flush()` après l'ingestion de la ligne 273 et avant
   `cleanupRawMedia`. L'assertion de la ligne 277 et toutes les autres assertions du test sont
   inchangées. Le test ne lit pas `store.serial`.
3. La commande de sonde passe cinq fois sur cinq à `FLK_MS=5` et cinq fois sur cinq à `FLK_MS=20` :
   `fail 0`, 24 tests, aucune ligne « GARDE ».
4. Sans sonde, `node --test --test-concurrency=1 tests/session-durable.test.cjs` passe vingt fois de
   suite, 24 tests à chaque fois.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Le test existant, corrigé, dans `tests/session-durable.test.cjs`. Frontière : le runtime de session et
son `LocalStore` réels sur un dossier temporaire, comme aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si la sonde ne reproduit l'échec ni à 20 ms ni à 5 ms, si un autre test
du fichier échoue sous sonde, ou si `flush()` rejette dans ce scénario : verdict BLOQUÉ, avec la sortie.
Un autre test en échec sous sonde n'est pas corrigé ici.

## Journal

- Reproduction (critère 1) : `FLK_MS=20 node $ETAT/garde.cjs 120 node --require ./$ETAT/slow-fs.cjs --test tests/session-durable.test.cjs`
  sur le fichier non modifié, trois fois : 24 tests, 1 échec chaque fois, le test visé, avec
  `[ 'manifest.json.tmp', 'media', 'thumbs' ]` dans la liste lue.
- Exploration : aucun écart avec le ticket ; `live.store` est le `LocalSessionStore` du runtime, `flush()`
  attend la file qui porte le manifeste et ne rejette pas ici. Limite connue : `embeddings.json.tmp` passe
  par une autre file, non déclenchée dans ce test.
- Implémentation (critère 2) : une ligne `await live.store.flush();` entre l'ingestion et
  `cleanupRawMedia`, dans `tests/session-durable.test.cjs`. Aucune assertion modifiée.
- Sonde après correction (critère 3) : `FLK_MS=5` cinq fois et `FLK_MS=20` cinq fois, chaque fois 24 tests,
  `fail 0`, aucune ligne « GARDE ».
- Sans sonde (critère 4) : `node --test --test-concurrency=1 tests/session-durable.test.cjs` vingt fois,
  24 tests, `fail 0` à chaque fois.
- Relecture : accepté, premier tour.

### Réserves à la clôture

- check.mjs signale « format » et « lint » non lancés : Prettier et ESLint ne sont pas installés sur cette machine.
- embeddings.json.tmp passe par une file d'écriture que store.flush() n'attend pas ; non déclenché dans ce test, à garder pour le chantier de barrière commune.
