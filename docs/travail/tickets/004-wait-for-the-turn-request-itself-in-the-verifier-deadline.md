---
id: T004
titre: Wait for the turn request itself in the verifier deadline test
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Sous un disque ralenti, le test du délai maximal du vérificateur échoue (« condition never reached »),
puis son fichier ne se termine plus : le contrôle reste bloqué jusqu'à son budget global. Après ce
ticket, le test attend l'événement lui-même — la demande `turn/start` reçue par le faux App Server — au
lieu de compter des tours de boucle, et il libère ses vérificateurs même quand une assertion échoue.

## Sources

- Constats : FLK-02, OUBLI-36, OUBLI-37
- Code concerné, à la version `0d5a954` :
  - `tests/verification.test.cjs`, test « cancelling a verification while it is being prepared sends no
    turn; the deadline stops a turn that never ends » (ligne 207, corps `async () =>`, sans `t`).
    Partie « délai » : lignes 232 à 242, vérificateur `verifier` créé ligne 235, attente ligne 238.
    Partie « annulation pendant le tour » : lignes 243 à 251, vérificateur `other` créé ligne 245,
    attente ligne 248. Aucun des deux n'est libéré si une assertion lève avant la fin de sa partie.
  - `tests/verification.test.cjs`, aide `until(check, rounds = 2000)` (ligne 77) : 2 000 tours de
    `setImmediate`, puis `assert.fail('condition never reached')`. Elle n'a que ces deux usages.
  - `tests/verification.test.cjs`, aide `appServer(script, { gate, config } = {})` (lignes 88 à 116) :
    le faux App Server appelle `gate(method)` à chaque demande reçue. C'est le point d'observation
    déjà disponible pour savoir que `turn/start` est arrivé.
  - `adapters/codex-confinement.cjs`, fonction `createContext` (ligne 237) : avant tout tour, le client
    crée son arbre privé sur disque (`mkdtemp`, trois `mkdir`, un `writeFile`). C'est ce travail que le
    disque ralenti allonge au-delà des 2 000 tours.
  - `adapters/codex-session-client.cjs`, méthode `run`, promesse `interrupted` (lignes 781 à 791) : la
    minuterie de garde se réarme chaque seconde tant que le tour vit. Un tour abandonné par le test
    retient donc le processus du fichier.
  - `adapters/codex-verifier.cjs`, méthode `cancel()` (ligne 62).
- Mesure de l'audit, lue dans ses journaux et non relancée au découpage : avec la sonde ci-dessous et
  `FLK_MS=10`, le fichier échoue deux fois sur deux (load 13,6 puis 7,1). Le test est déclaré en échec
  après 231 ms, puis le processus reste vivant 324 s. Avec une attente sur l'événement, dix réussites
  sur dix sous la même sonde.

### Sonde et garde

À enregistrer dans le dossier d'état du ticket, `.harness-state/tickets/<id du ticket>/` (hors Git),
noté `$ETAT` dans les commandes.

`$ETAT/slow-fs.cjs` — retarde les écritures du disque comme une machine chargée :

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

`$ETAT/garde.cjs` — lance une commande et arrête tout son groupe de processus si elle vit encore après
le délai donné :

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

Commande, appelée « commande de sonde » dans les critères :

```sh
FLK_MS=10 node $ETAT/garde.cjs 60 node --require ./$ETAT/slow-fs.cjs --test tests/verification.test.cjs
```

## Périmètre

- À modifier : `tests/verification.test.cjs` — ce test et, si nécessaire, les aides locales `until` et
  `appServer`.
- À ne pas toucher : le code de production (`adapters/`, `core/`, `runtime/`, `server/`) et les autres
  fichiers de test. La minuterie de garde du client fait l'objet d'un autre ticket.
- Aucun délai n'est allongé, aucun nombre de tours n'est relevé. Le test n'est jamais relancé jusqu'à
  ce qu'il passe. Aucune ligne de plus de 160 caractères n'est ajoutée.
- Les aides partagées de `tests/helpers/` (attente bornée) viennent d'un autre lot : ce ticket n'en
  crée pas.

## Critères d'acceptation

Chaque critère se vérifie par une commande, sortie dans le journal.

1. Reproduction avant correction : la commande de sonde, lancée trois fois sur le fichier non modifié,
   échoue trois fois avec « condition never reached » sur le test visé. Le journal dit, pour chaque
   lancement, si la garde a dû arrêter le fichier (ligne « GARDE »).
2. Dans le test corrigé, les deux attentes (lignes 238 et 248) attendent une promesse que le faux App
   Server résout à la réception de `turn/start`. Plus aucune attente du test ne compte des tours de
   boucle ; `until` disparaît du fichier s'il n'a plus d'usage. Le test ne lit aucun état interne du
   vérificateur ou du client pour décider quand continuer.
3. Toutes les assertions des lignes 207 à 251 restent, avec les mêmes valeurs attendues, dont
   `[timers.length, timers[0].ms, …]` égal à `[1, 180000, 1]` et les deux messages de rejet.
4. Le test reçoit `t` et inscrit `t.after(() => verifier.cancel())` dès la création du vérificateur de
   la partie « délai » (ligne 235), puis `t.after(() => other.cancel())` dès la création de `other`
   (ligne 245). Les vérificateurs de la boucle `for` (lignes 211 à 230) ne sont pas concernés. Preuve
   en deux temps, avec une ligne temporaire `assert.fail('preuve')` placée juste après l'attente de la
   ligne 238 (`turn/start` reçu, tour en vol) et la commande
   `node $ETAT/garde.cjs 30 node --test tests/verification.test.cjs` :
   - avant d'inscrire les `t.after`, la commande affiche la ligne « GARDE » : le tour abandonné retient
     le fichier ;
   - une fois les `t.after` inscrits, elle se termine seule, en échec, sans ligne « GARDE ».
   La ligne temporaire est ensuite retirée ; le journal garde les deux sorties.
5. La commande de sonde passe cinq fois sur cinq sur le test corrigé : `fail 0`, dix tests, aucune ligne
   « GARDE ».
6. Sans sonde, `node --test --test-concurrency=1 tests/verification.test.cjs` passe vingt fois de suite,
   dix tests à chaque fois.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Le test existant, corrigé, dans `tests/verification.test.cjs`. Frontière : `CodexVerifier.verify` et
`CodexVerifier.cancel` devant le faux App Server injecté par `rpcFactory`, comme aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si la sonde ne reproduit l'échec sur aucun des trois lancements, ou si
la correction exige de modifier le code de production : verdict BLOQUÉ, avec l'écart constaté. Si le
premier temps de la preuve du critère 4 n'affiche pas la ligne « GARDE » (le tour abandonné ne retient
pas le fichier), le journal le dit avec la sortie et les `t.after` sont inscrits quand même.

## Journal
