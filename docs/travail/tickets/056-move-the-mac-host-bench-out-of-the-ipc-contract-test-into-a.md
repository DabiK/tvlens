---
id: T056
titre: Move the Mac host bench out of the IPC contract test into a shared helper
statut: a-faire
bloque_par: T055
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le banc qui lance l'hôte Mac sans Electron (faux `electron`, preload évalué, substitution de modules)
vit aujourd'hui dans un fichier de test, et une substitution qui ne s'applique plus — parce que
`app/main.cjs` a écrit son `require` autrement, ou l'a déplacé — disparaît sans bruit : l'hôte tourne
alors avec le vrai module. Après ce ticket, ce banc est un module partagé `tests/helpers/mac-host.cjs` :
il reconnaît un module à remplacer par son fichier, il refuse de démarrer l'hôte en nommant le module
quand une substitution attendue n'a pas eu lieu, et il expose la liste des modules effectivement
remplacés. `tests/mac-ipc-contract.test.cjs` en est le premier utilisateur.

## Sources

- Constats : TSTA-04, TSTC-16, OUBLI-01
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite), dans
  `tests/mac-ipc-contract.test.cjs` :
  - `const realTimeout`, ligne 18, qui ne sert qu'à `const pause`, ligne 19 ;
  - `function loadBridge(invoke)`, ligne 45 : `app/preload.cjs` évalué par `new Function` ;
  - `const HOST_SETTINGS`, ligne 134 : six noms `TVLENS_*` ;
  - `async function launch(userData, { env = {}, sweep = async () => [], disk = null, wrap = {} } = {})`,
    ligne 141 : faux `electron` à douze clés, dont `whenReady: () => Promise.resolve()` ; sauvegarde et
    restauration de `process.argv`, `process.env` et `console.error` ; ajout de `--smoke-test` ;
    interception `Module._load = function`, ligne 170, active pendant le seul `require` de
    `app/main.cjs` et limitée par `parent?.filename?.endsWith(path.join('app', 'main.cjs'))`, ligne 173 ;
    elle compare la demande à son texte (`'../adapters/codex-confinement.cjs'`…) ; elle remplace
    `sweepStaleContexts` de `adapters/codex-confinement.cjs`, `DiskGuard` de `adapters/disk-guard.cjs`
    quand `disk` est donné, et enveloppe `runtime/conversation-runtime.cjs` et
    `runtime/session-runtime.cjs` quand `wrap.conversation` ou `wrap.session` sont donnés ; seul
    `app/main.cjs` est retiré de `require.cache` avant chaque lancement ;
  - `async function stage(t)`, ligne 197 ; `async function until(t, check, label, stepMs = 0)`,
    ligne 204 : 600 tours, chacun contrôle, avance `t.mock.timers` de `stepMs` puis fait `pause(5)` ;
    échoue par « never happened: » suivi du libellé ;
  - `async function capture(host, sessionId, …)`, ligne 216 et `const analysed`, ligne 224 : gestes de
    scénario propres au fichier ;
  - le premier test du fichier (ligne 227) exige déjà `host.sweeps` égal à `[[]]`, ligne 236.
  - Décomptes d'appels : `launch(` 17, `stage(` 11, `until(` 41, `loadBridge(` 7, `pause(` 20 ; 12 tests.
- `app/main.cjs` : les `require` substitués sont en tête de fichier, lignes 1 à 26 (`DiskGuard`
  ligne 16, `sweepStaleContexts` ligne 18) ; `smoke`, ligne 38 ; l'hôte ne démarre que dans
  `app.whenReady().then(…)`, ligne 46, et y lance le balayage, ligne 50.
- Les modules substitués sont aussi demandés par des fichiers qui restent dans `require.cache` d'un
  lancement à l'autre : `adapters/disk-guard.cjs` par `runtime/session-runtime.cjs` (ligne 14) et
  `adapters/local-store.cjs` (ligne 3) ; `adapters/codex-confinement.cjs` par
  `adapters/codex-session-client.cjs` (ligne 25), `adapters/codex-video-agent.cjs` (ligne 5) et
  `adapters/codex-verifier.cjs` (ligne 2). `core/session.cjs` est demandé par
  `runtime/session-runtime.cjs` (ligne 4) et pas par `app/main.cjs`.
- Risque nommé par la relecture : un banc qui perd une substitution laisse les tests balayer le vrai
  répertoire temporaire ou lire le vrai disque, sans erreur.

## Périmètre

- À modifier :
  - `tests/helpers/mac-host.cjs` (nouveau) : `HOST_SETTINGS`, `loadBridge`, `launch`, `stage`, déplacés
    sans changer leurs paramètres ni ce qu'ils rendent, aux ajouts ci-dessous près ;
  - `tests/helpers/wait.cjs` : ajout de `advanceUntil(t, check, what, stepMs = 0, rounds = 600)`, le
    `until` à horloge simulée de la ligne 204 sous un nom distinct de `until`, avec le même ordre dans
    un tour (contrôle, avance, `pause(5)`) et le même message d'échec ;
  - `tests/wait-helpers.test.cjs` : preuve de `advanceUntil` ;
  - `tests/mac-ipc-contract.test.cjs` : importe le banc, `pause` et `advanceUntil` ; ses définitions
    locales disparaissent, `realTimeout` compris ; `capture` et `analysed` restent dans le fichier.
- À ne pas toucher : `app/main.cjs`, `app/preload.cjs` et tout le code de production ;
  `tests/architecture-f05.test.cjs` et `tests/architecture-f07.test.cjs` (ticket suivant) ; les titres
  des tests, leurs valeurs attendues, le découpage des tests longs.
- Comportements nouveaux du banc, et seulement ceux-là :
  - un module à remplacer est déclaré par son chemin dans le dépôt (`adapters/codex-confinement.cjs`) et
    reconnu par son fichier résolu (`Module._resolveFilename(request, parent)`), et non plus par le
    texte de la demande ;
  - `launch` accepte une option `substitutions` (chemin du module dans le dépôt → fabrique qui reçoit le
    vrai module et rend le remplaçant), qui s'ajoute aux substitutions fixes : elle sert le test du
    critère 2 et les deux autres bancs au ticket suivant ;
  - une fois `app/main.cjs` chargé, `launch` vérifie que chaque substitution attendue (les fixes que ses
    options demandent, plus celles de `substitutions`) a été appliquée au moins une fois ; sinon il
    rejette avec un message qui nomme le module, après avoir rétabli `Module._load`, `process.argv`,
    `process.env` et `console.error` ;
  - le `whenReady` du faux `electron` ne se règle qu'une fois cette vérification passée : un hôte
    auquel il manque une substitution ne démarre pas (ni balayage, ni mesure du disque) ;
  - l'hôte rendu expose `replaced`, la liste des chemins des modules effectivement remplacés.
- Ce qui ne change pas, et pourquoi : une substitution ne vaut que pour les demandes des fichiers
  d'hôte que le banc recharge à chaque lancement — une liste nommée dans le banc, aujourd'hui
  `app/main.cjs` seul. Les autres demandeurs reçoivent le vrai module : ils restent dans
  `require.cache`, et leur servir le remplaçant d'un lancement le ferait durer dans les lancements
  suivants, selon l'ordre des tests. La perte silencieuse que ce couplage permettait est fermée par la
  vérification, pas par un élargissement des demandeurs.
- Aucune ligne de plus de 160 caractères dans `tests/helpers/mac-host.cjs` ni ajoutée ailleurs.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -nE "Module\._load|^(const|function|async function) (loadBridge|launch|stage|until|pause|realTimeout) ?[=(]|^const HOST_SETTINGS"
   tests/mac-ipc-contract.test.cjs` ne sort rien, et le fichier importe `./helpers/mac-host.cjs` et
   `./helpers/wait.cjs`.
2. Un test nouveau de `tests/mac-ipc-contract.test.cjs` lance l'hôte avec une substitution attendue pour
   un module que l'hôte charge sans que `app/main.cjs` le demande lui-même (à `0d5a954` :
   `core/session.cjs`) et exige : le lancement est rejeté avec un message qui nomme ce module ; le
   balayage de l'hôte n'a pas été appelé (la doublure `sweep` passée au lancement compte zéro appel) ;
   un lancement normal fait ensuite dans le même test réussit (rien n'est resté détourné).
3. Un test exige qu'après un lancement normal `host.replaced` contient `adapters/codex-confinement.cjs`
   et pas `adapters/disk-guard.cjs`, et qu'il contient les deux quand `disk` est donné.
4. `tests/wait-helpers.test.cjs` prouve que `advanceUntil` avance `t.mock.timers` du pas donné à chaque
   tour, rend la valeur vraie, échoue en nommant le libellé, et s'arrête au nombre de tours donné.
5. `grep -c "^\s*test(" tests/mac-ipc-contract.test.cjs` vaut au moins 13, et
   `git diff -U0 HEAD -- tests/mac-ipc-contract.test.cjs | grep -E "^-.*assert\."` ne sort que des lignes
   des aides déplacées. Sortie dans le journal.
6. `node --test --test-concurrency=1 tests/mac-ipc-contract.test.cjs tests/wait-helpers.test.cjs` passe.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/mac-ipc-contract.test.cjs`, à la frontière de `launch` : un lancement dont une substitution
attendue n'est pas appliquée est rejeté en nommant le module, sans que l'hôte ait démarré (critère 2).
Les douze tests existants du fichier, inchangés, prouvent que le banc déplacé lance l'hôte comme avant.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si retenir `whenReady` jusqu'à la vérification change le résultat d'un
test existant, ou si le déplacement exige de modifier `app/` : verdict BLOQUÉ, avec le test et le
module en cause.

## Journal
