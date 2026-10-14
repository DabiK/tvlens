---
id: T057
titre: Launch the Mac host from the shared bench in the two remaining test files
statut: a-faire
bloque_par: T056
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Deux fichiers de test gardent leur propre copie réduite du banc de l'hôte Mac : faux `electron`, liste
des réglages d'hôte, interception de `Module._load` liée au nom `app/main.cjs`. Après ce ticket, ils
lancent l'hôte par `tests/helpers/mac-host.cjs` ; il ne reste qu'un faux Electron et qu'une interception
de `Module._load` dans les tests, celle du module partagé, qui vérifie ses substitutions.

## Sources

- Constats : TSTA-04, OUBLI-01, TSTC-16
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/architecture-f05.test.cjs` : `const HOST_SETTINGS`, ligne 620 ; `function loadPreload(invoke)`,
    ligne 621 ; `async function launchMac(t, wrap = {})`, ligne 628 — minuteries réelles, `class
    BrowserWindow`, ligne 633, liste `failures`, `Module._load = function`, ligne 657, limitée par
    `parent?.filename?.endsWith(path.join('app', 'main.cjs'))`, ligne 660, balayage remplacé,
    `wrap.conversation` et `wrap.session` ; un seul appelant, ligne 688 ; `async function captured(host,
    sessionId)`, ligne 677 (geste de scénario, reste local).
  - `tests/architecture-f07.test.cjs` : `const HOST_SETTINGS`, ligne 214 ; `function loadPreload(invoke)`,
    ligne 215 ; `async function macHost(t)`, ligne 221 — `t.mock.timers.enable({ apis: ['setTimeout',
    'setInterval'] })`, `class BrowserWindow`, ligne 227, `journal` propre, liste `order`,
    `Module._load = function`, ligne 254, même condition ligne 257, avec deux substitutions de plus :
    `../adapters/video-bridge.cjs` (`VideoBridge.revoke` inscrit « contextes MCP » dans `order`) et
    `../runtime/surveillance-runtime.cjs` (`createSurveillanceRuntime`) ; la doublure de conversation
    remplace `conversation.agent.answer` et `close` ; appelants : `const HOSTS`, ligne 311,
    `onBothHosts`, ligne 312, et les lignes 532 et 552.
  - Commentaire des deux fichiers : « The harness of tests/mac-ipc-contract.test.cjs, reduced to what
    this file needs ».
  - `grep -n "Module._load" tests/*.test.cjs` : seulement ces deux fichiers et
    `tests/mac-ipc-contract.test.cjs` (déjà migré par le ticket précédent).
- Tests protecteurs : le test de `tests/architecture-f05.test.cjs` qui appelle `launchMac` (ligne 688) ;
  les scénarios `onBothHosts` et les deux tests des lignes 532 et 552 de
  `tests/architecture-f07.test.cjs`.

## Périmètre

- À modifier :
  - `tests/helpers/mac-host.cjs` : ce qui manque pour servir les deux fichiers, sous forme d'options
    nommées de `launch` — minuteries réelles ou figées laissées au choix de l'appelant, journal fourni
    par l'appelant, substitutions supplémentaires par l'option `substitutions` ;
  - `tests/architecture-f05.test.cjs` : `launchMac` devient un appel au banc partagé ; `HOST_SETTINGS`,
    `loadPreload` et l'interception locale disparaissent ;
  - `tests/architecture-f07.test.cjs` : `macHost` garde sa signature et ce qu'il rend (les scénarios
    `onBothHosts` ne changent pas), mais se construit sur le banc partagé ; `loadPreload`, le faux
    `electron` et l'interception locale disparaissent ;
  - `tests/mac-ipc-contract.test.cjs` seulement si une option ajoutée change un appel existant.
- À ne pas toucher : `app/` et tout le code de production ; `serverHost` de
  `tests/architecture-f07.test.cjs` ; `transportOn` de `tests/architecture-f05.test.cjs` ; les titres des
  tests et les valeurs attendues.
- Les substitutions de `video-bridge` et de `surveillance-runtime` restent déclarées par
  `tests/architecture-f07.test.cjs`, par leur chemin dans le dépôt (`adapters/video-bridge.cjs`,
  `runtime/surveillance-runtime.cjs`) : le banc ne connaît que le mécanisme. Elles passent par la
  vérification « chaque substitution attendue a été appliquée » ; `app/main.cjs` demande lui-même ces
  deux modules (lignes 26 et 3), comme `runtime/conversation-runtime.cjs` et
  `runtime/session-runtime.cjs` (lignes 1 et 2).
- Le banc garde sa règle : une substitution ne vaut que pour les demandes des fichiers d'hôte qu'il
  recharge à chaque lancement. Ce ticket n'élargit pas les demandeurs.
- Aucune ligne de plus de 160 caractères ajoutée.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -ln "Module._load" tests/*.test.cjs` ne sort aucun fichier ; `grep -rn "Module._load" tests/helpers/`
   ne cite que `mac-host.cjs`.
2. `grep -nE "HOST_SETTINGS = |loadPreload = |function loadPreload|BrowserWindow" tests/architecture-f05.test.cjs
   tests/architecture-f07.test.cjs` ne sort rien.
3. `grep -c "^\s*test(" ` donne toujours 15 pour `tests/architecture-f05.test.cjs` et 12 pour
   `tests/architecture-f07.test.cjs`.
4. `git diff -U0 HEAD -- tests/architecture-f05.test.cjs tests/architecture-f07.test.cjs | grep -E "^-.*assert\."`
   ne sort que des lignes des bancs locaux supprimés. Sortie dans le journal.
5. Dans `tests/architecture-f07.test.cjs`, une assertion ajoutée dans `macHost` exige à chaque
   lancement que `replaced`, rendu par le banc, contient `adapters/codex-confinement.cjs` et les quatre
   modules que ce fichier remplace : `adapters/video-bridge.cjs`, `runtime/conversation-runtime.cjs`,
   `runtime/surveillance-runtime.cjs` et `runtime/session-runtime.cjs`.
6. `node --test --test-concurrency=1 tests/architecture-f05.test.cjs tests/architecture-f07.test.cjs
   tests/mac-ipc-contract.test.cjs` passe.
7. `node scripts/check.mjs` est vert.

Si un autre lot a renommé ces fichiers d'après leur comportement, les retrouver par
`grep -ln "launchMac\|async function macHost" tests/*.test.cjs`.

## Test d'acceptation attendu

Les tests existants, sans changement d'exigence : dans `tests/architecture-f05.test.cjs`, le test qui
lance l'hôte Mac par `launchMac` ; dans `tests/architecture-f07.test.cjs`, les scénarios `onBothHosts`
joués sur l'hôte Mac. Frontière : le pont `window.tvlens` d'un hôte Mac lancé sans Electron, comme
aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'un des deux fichiers a besoin d'un comportement du banc que
l'autre contredit et qu'aucune option nommée ne sépare, ou si la migration exige de modifier `app/` :
verdict BLOQUÉ, avec l'écart constaté.

## Journal
