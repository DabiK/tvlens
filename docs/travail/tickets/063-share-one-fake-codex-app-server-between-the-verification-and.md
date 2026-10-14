---
id: T063
titre: Share one fake Codex App Server between the verification and surveillance tests
statut: a-faire
bloque_par: T061, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le faux App Server Codex est réécrit dans chaque fichier qui en a besoin. Les deux copies les plus
proches, celles qui répondent comme un serveur confiné, diffèrent déjà par le nom de leurs
enregistrements, leurs identifiants de fil et la forme de leurs réponses. Après ce ticket,
`tests/helpers/fake-app-server.cjs` porte une seule fois le déroulé du protocole (démarrage de fil
confiné, tour, interruption), et ces deux fichiers l'utilisent. Les autres fichiers qui écrivent leur
propre faux serveur ne sont pas touchés ici.

## Sources

- Constats : TSTA-03, TSTB-08
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/verification.test.cjs` : `function appServer(script, { gate, config } = {})`, ligne 88 —
    rend `{ processes, rpcFactory, sent }` ; un enregistrement `{ options, requests, closed }` par
    processus ; `config/read` répond d'après les arguments de lancement (`CONTROL_KEYS`, ligne 82),
    « in the shape measured on codex 0.160.1 », sauf si `config` répond à sa place ; `thread/start`
    répond `{ thread: { id: 'thread', environments: [] }, approvalPolicy: 'never', sandbox: { type:
    'readOnly', networkAccess: false }, runtimeWorkspaceRoots: [], instructionSources: [] }` ;
    `turn/interrupt` émet `turn/completed` au statut `interrupted` ; `turn/start` émet `turn/started`,
    joue `script({ id, item, prompt, request })`, publie la valeur rendue en `agentMessage` puis
    `turn/completed` ; `gate` retient une requête. 11 lignes citent `appServer(` ; 10 tests.
  - `tests/surveillance-runtime.test.cjs` : `function appServer(script)`, ligne 81 — rend
    `{ connections, rpcFactory, sent }` ; fils `thread-1`, `thread-2`… ; `thread/start` sans
    `runtimeWorkspaceRoots` ni `instructionSources` ; `config/read` répond `{}` ; `script({ connection,
    options, turnId, threadId, prompt, web })` rend un pas `{ listed, open, hang, forbidden, result }`
    que la copie traduit en événements ; `const refuseTool`, ligne 113. 5 lignes citent `appServer(` ;
    14 tests.
  - Les deux copies jouent le tour un tour de boucle après avoir répondu à `turn/start`
    (`setImmediate(async () => {`, ligne 104 de `tests/verification.test.cjs` et ligne 95 de
    `tests/surveillance-runtime.test.cjs`) ; les tests de ces fichiers comptent des tours de boucle.
  - Aucune assertion des deux fichiers ne compare un identifiant de fil à une valeur littérale
    (`grep -n "'thread'" tests/verification.test.cjs` ne sort que la copie elle-même).
  - Dans `tests/surveillance-runtime.test.cjs`, `connections` apparaît sur 17 lignes : la copie
    (lignes 82, 86 et 111) et les tests, dont neuf lignes d'assertion.
- Autres fichiers qui écrivent leur propre `rpcFactory`, hors de ce ticket :
  `tests/codex-confinement.test.cjs`, `tests/architecture-f05.test.cjs`,
  `tests/architecture-f08.test.cjs`, `tests/review-regressions.test.cjs`,
  `tests/codex-thread-rotation.test.cjs`, `tests/codex-connect-race.test.cjs`,
  `tests/refactor-boundaries.test.cjs`, `tests/chat-sources.test.cjs` et
  `tests/session-optimization.test.cjs`.

## Périmètre

- À modifier :
  - `tests/helpers/fake-app-server.cjs` (nouveau) : `fakeAppServer(playTurn, { gate, config } = {})`
    rend `{ processes, rpcFactory, sent }` ;
  - `tests/verification.test.cjs` et `tests/surveillance-runtime.test.cjs` : leur `appServer` local
    disparaît ou se réduit à ce qui est propre au fichier, écrit sur l'aide.
- À ne pas toucher : `adapters/`, `runtime/` et tout le code de production ; les autres copies du faux
  App Server ; les titres des tests et les valeurs attendues.
- Forme de l'aide, à respecter :
  - un enregistrement `{ options, requests, closed }` par processus, dans `processes` (un seul nom :
    `connections` disparaît) ; `sent(process, method)` rend les paramètres des requêtes de cette méthode ;
  - `thread/start` répond la forme confinée complète de `tests/verification.test.cjs`, avec un
    identifiant de fil distinct par fil (`thread-1`, `thread-2`…) ; la forme et la version de Codex où
    elle a été mesurée (0.160.1) sont nommées une fois, en tête du module ;
  - `config/read` répond d'après les arguments de lancement, comme dans `tests/verification.test.cjs`,
    sauf si `config` est donné ;
  - `turn/start` répond d'abord, puis, un tour de boucle plus tard (un seul `setImmediate`, comme les
    deux copies), émet `turn/started` et appelle `playTurn(turn)` avec `{ process, options, id,
    threadId, prompt, emit(event, item), item(item, events), request(method, extra) }` ; une valeur
    rendue est publiée en `agentMessage` puis `turn/completed` ; un tour qui ne rend jamais la main
    reste ouvert ; `turn/interrupt` clôt le tour au statut `interrupted` sur son fil ;
  - l'aide n'ajoute aucun autre tour de boucle ni aucune attente entre une requête et sa réponse ou
    ses événements : l'ordre et le nombre de tours restent ceux des deux copies.
- Les pas `{ listed, open, hang, forbidden, result }` restent une convention de
  `tests/surveillance-runtime.test.cjs` : une petite fonction locale les traduit en appels à `emit`. Si
  un test de ce fichier change de résultat parce que `config/read` ne répond plus `{}`, il passe
  `config: () => ({})` et le journal le dit.
- Aucune ligne de plus de 160 caractères dans le fichier créé ni ajoutée ailleurs.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -nE "rpcFactory = \(?options\)? =>" tests/verification.test.cjs tests/surveillance-runtime.test.cjs`
   ne sort rien, et les deux fichiers importent `./helpers/fake-app-server.cjs`.
2. `grep -n "connections" tests/surveillance-runtime.test.cjs` ne sort rien.
3. `grep -nE "method === .thread/start." tests/verification.test.cjs tests/surveillance-runtime.test.cjs` ne
   sort rien, et le même motif sort une seule ligne dans `tests/helpers/fake-app-server.cjs` : la
   réponse confinée est écrite une seule fois.
4. `grep -c "^\s*test(" ` donne toujours 10 pour `tests/verification.test.cjs` et 14 pour
   `tests/surveillance-runtime.test.cjs`.
5. `git diff -U0 HEAD -- tests/verification.test.cjs tests/surveillance-runtime.test.cjs | grep -E "^-.*assert\."`
   ne sort que des lignes où seul le nom `connections` devient `processes`. Sortie dans le journal.
6. `node --test --test-concurrency=1 tests/verification.test.cjs tests/surveillance-runtime.test.cjs`
   passe.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants des deux fichiers, sans changement d'exigence : à la frontière `rpcFactory` du
client Codex, ils prouvent que le rôle de vérification et le rôle de surveillance tiennent les mêmes
exigences devant le faux serveur partagé.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un test ne tient qu'avec une réponse du faux serveur que l'autre
fichier contredit et qu'aucune option nommée ne sépare (par exemple un test de
`tests/surveillance-runtime.test.cjs` qui dépendrait de l'absence de `runtimeWorkspaceRoots` ou
d'`instructionSources` dans la réponse à `thread/start`), ou si la migration exige de modifier le code
de production : verdict BLOQUÉ, avec la réponse en cause. Un test n'est jamais relancé jusqu'à ce
qu'il passe.

## Journal
