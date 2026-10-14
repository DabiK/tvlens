---
id: T067
titre: Hold the session clock of the Mac host in its tests instead of pausing
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les tests de l'hôte Mac lisent l'horloge réelle du processus : pour qu'un passage ait une durée, ils
dorment 20 ms puis vérifient que « l'horloge a bougé », et pour sortir un passage d'une fenêtre de
50 ms ils dorment 150 ms. Sous charge, ces durées ne garantissent rien. Après ce ticket, le banc de
l'hôte Mac donne à chaque session une horloge que le test tient et avance lui-même, sans changer le
code de production ; un test garde l'hôte sur sa propre horloge pour que ce chemin reste prouvé.

## Sources

- Constats : FLK-04, FLK-10, TSTA-13
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `runtime/session-runtime.cjs` : `createSessionRuntime({ … readClock = () => performance.now(),
    wallClock = Date.now, … })`, lignes 48-70 (les deux options aux lignes 64 et 65) ;
    `new SessionClock(readClock, …)`, lignes 233-236. L'option existe déjà : aucun changement de
    production n'est nécessaire. `readClock` cadence aussi la réécriture du manifeste (`manifestAt =
    readClock()`, ligne 339, et `readClock() - manifestAt >= MANIFEST_EVERY_MS`, ligne 402) : sur une
    horloge tenue, le manifeste n'est réécrit par cette voie que si le test avance l'horloge.
  - `core/session.cjs` : la fenêtre de conservation se compte sur l'horloge de session (`const cutoff
    = this.now() - this.retentionMs;`, ligne 185 ; `available`, ligne 398) : un passage ne sort de la
    fenêtre que si cette horloge avance.
  - `app/main.cjs` : `const { createSessionRuntime, validateSegment } =
    require('../runtime/session-runtime.cjs')`, ligne 2 ; `const compose = (id, restore) =>
    createSessionRuntime({…})`, lignes 303-306, qui ne passe ni `readClock` ni `wallClock` — c'est le seul endroit où l'hôte Mac compose une
    session ;
    `pruneTimer = setInterval(sweep, 5000)`, lignes 406 et 459.
  - `tests/mac-ipc-contract.test.cjs` : `const pause` (durée réelle), ligne 19 ; `async function
    launch(userData, { env = {}, sweep = async () => [], disk = null, wrap = {} } = {})`, ligne 141,
    qui remplace `Module._load`, ligne 170 ; `t.mock.timers.enable({ apis: ['setTimeout',
    'setInterval'] })`, ligne 198 (l'horloge de session, lue par `performance.now()`, n'est pas
    simulée) ; `async function capture(host, sessionId, { after = 0, frames = 1 } = {})`, ligne 216 —
    `await pause(20)`, ligne 218, puis `assert.ok(endMs > startMs, 'the session clock moved')` ;
    `const first` avec `await pause(20)`, ligne 676 ; `await pause(20)`, ligne 494, suivi de « the
    session clock stopped with the capture », ligne 495 (l'horloge ne doit pas avoir avancé pendant
    que la capture est refusée) ; test « an archive kept until deletion keeps that
    contract on a Mac host set to a rolling window… », ligne 533 — `launch({ env: {
    TVLENS_MEDIA_RETENTION_MS: '50' } })`, ligne 545, `const sweep = async () => { await pause(150);
    t.mock.timers.tick(5000); await pause(30); }`, ligne 553, puis l'attente « the passage of a
    rolling session expires », ligne 574, qui compte sur 60 ms réels par tour pour que le passage
    sorte de la fenêtre ; test « the loaded Mac session is pushed
    every five seconds while it captures… », ligne 719 — `const sweep`, ligne 725, relevé des
    `elapsedMs` poussés, ligne 732 (ils doivent croître à chaque balayage), second lancement à fenêtre
    de 50 ms, ligne 748, `await pause(150)`, ligne 751, « out of the window, and not swept yet »,
    ligne 752.
  - `tests/architecture-f07.test.cjs` : `send` de `macHost`, `await pause(20)`, ligne 290, suivi de
    la même assertion « the session clock moved ».
  - `tests/architecture-f05.test.cjs` : `async function captured(host, sessionId)`, ligne 677,
    `await pause(20)`, ligne 678, même assertion.
- Aides du lot L05 dont ce ticket dépend, citées par leur nom : `tests/helpers/mac-host.cjs` —
  `launch` y accepte `substitutions` (chemin d'un module du dépôt → fabrique qui reçoit le vrai module
  et rend son remplaçant, appliquée aux seules demandes de `app/main.cjs`) et expose `host.replaced` ;
  `tests/helpers/wait.cjs` — `until(check, what, { timeoutMs })`, qui échoue en nommant ce qui manque.
  Les bancs de `tests/architecture-f05.test.cjs` et `tests/architecture-f07.test.cjs` sont alors sur
  ce module.
- Risque nommé par la relecture d'audit : une horloge tenue cache un défaut qui n'apparaît qu'en temps
  réel ; d'où le test conservé sur l'horloge propre de l'hôte.

## Périmètre

- À modifier :
  - `tests/helpers/mac-host.cjs` : `launch` donne par défaut à chaque `createSessionRuntime` de l'hôte
    un `readClock` tenu par le test, au moyen de `substitutions` sur `runtime/session-runtime.cjs`, et
    l'expose (`host.clock.advance(ms)`) ; une option laisse l'hôte sur sa propre horloge.
  - `tests/mac-ipc-contract.test.cjs` : `capture` et `first` avancent l'horloge tenue au lieu de
    dormir ; les deux tests à fenêtre de 50 ms sortent le passage de la fenêtre en avançant l'horloge
    au lieu de `pause(150)` ; l'attente « the passage of a rolling session expires » (ligne 574)
    avance l'horloge au-delà de la fenêtre avant de balayer, au lieu de compter sur 60 ms réels ;
    avant « the session clock stopped with the capture » (ligne 495), le test avance l'horloge tenue
    au lieu de dormir 20 ms, sans quoi l'assertion ne prouverait plus rien ; le test de la ligne 719
    avance l'horloge avant chaque balayage.
  - `tests/architecture-f07.test.cjs` (`send` de `macHost`) et `tests/architecture-f05.test.cjs`
    (`captured`) : même geste.
  - Un test ajouté dans `tests/mac-ipc-contract.test.cjs` : l'hôte lancé sur sa propre horloge mesure
    une session qui avance, attendu par `until` borné, sans pause fixe.
- À ne pas toucher : `app/`, `runtime/`, `core/`. Les autres pauses de ces trois fichiers (attente
  d'un balayage, d'un silence, d'une écriture) ne relèvent pas de l'horloge : elles restent telles
  quelles et ne sont pas allongées.
- L'assertion « the session clock moved » reste, et reste vraie parce que le test a avancé l'horloge.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "pause(20)" tests/architecture-f07.test.cjs tests/architecture-f05.test.cjs` ne sort plus
   les lignes de `send` et de `captured` ; dans `tests/mac-ipc-contract.test.cjs`, `capture` et `first`
   ne contiennent plus de `pause(`, et `grep -n "pause(60)" tests/mac-ipc-contract.test.cjs` ne sort
   plus l'attente « the passage of a rolling session expires ».
2. `grep -n "pause(150)" tests/mac-ipc-contract.test.cjs` ne sort rien : les deux tests à fenêtre de
   50 ms avancent l'horloge tenue d'au moins la fenêtre, puis gardent leurs assertions (« out of the
   window, and not swept yet », puis le passage expiré).
3. Le test de la ligne 719 garde son assertion sur les `elapsedMs` poussés, croissants à chaque
   balayage ; l'assertion « the session clock stopped with the capture » reste, précédée d'une avance
   de l'horloge tenue.
4. Le test ajouté passe avec l'hôte sur sa propre horloge, et `launch` rejette si la substitution de
   `runtime/session-runtime.cjs` n'a pas été appliquée (comportement de `substitutions`, à constater
   par une assertion sur `host.replaced`).
5. Un test ajouté dans `tests/mac-ipc-contract.test.cjs` prouve que la session lit bien l'horloge
   tenue : pendant une capture, `elapsedMs` rendu par `host.state()` augmente d'exactement la durée
   passée à `host.clock.advance(ms)`, et ne bouge pas entre deux lectures séparées par une attente
   réelle sans avance. Une session restée sur l'horloge réelle ferait échouer les deux égalités.
6. `node --test --test-concurrency=1 tests/mac-ipc-contract.test.cjs tests/architecture-f07.test.cjs
   tests/architecture-f05.test.cjs` passe trois fois de suite, sans relance sélective. Durée de chaque
   fichier avant et après dans le journal.
7. `node scripts/check.mjs` est vert ; le nombre de cas de test ne baisse pas.

## Test d'acceptation attendu

Les tests existants de `tests/mac-ipc-contract.test.cjs` qui capturent un passage, et le test ajouté
sur l'horloge propre de l'hôte. Frontière : les canaux IPC du vrai `app/main.cjs` chargé par le banc,
comme aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'horloge ne peut pas être tenue sans modifier `app/main.cjs` ou
`runtime/session-runtime.cjs`, ou si `tests/helpers/mac-host.cjs` n'offre pas `substitutions` sous la
forme annoncée par le lot L05 : verdict BLOQUÉ, avec l'écart constaté.

## Journal
