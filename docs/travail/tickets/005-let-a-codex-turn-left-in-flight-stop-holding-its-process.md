---
id: T005
titre: Let a Codex turn left in flight stop holding its process alive
statut: a-faire
bloque_par: T004
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Pendant un tour, le client Codex réarme chaque seconde une minuterie de garde qui retient le processus.
Un test qui abandonne un tour en cours — une assertion levée avant `cancel` ou `close` — bloque donc son
fichier sans fin. Après ce ticket, cette minuterie garde son rôle mais ne retient plus à elle seule un
processus qui n'a plus rien d'autre à faire.

## Sources

- Constats : OUBLI-11
- Code concerné, à la version `0d5a954` :
  - `adapters/codex-session-client.cjs`, méthode `run({ jobId, sessionId, instructions, … })`, promesse
    `interrupted` (lignes 781 à 791) : `watchdog = setTimeout(…, 1000)` réarmé par `check()`, sans
    `unref` ; effacé seulement dans le `finally` (`clearTimeout(watchdog)`, ligne 812).
  - `adapters/codex-session-client.cjs`, précédent dans le même fichier : `draining.timer = setTimeout(…)`
    suivi de `draining.timer.unref?.()` (lignes 492 à 500).
  - `adapters/codex-session-client.cjs`, fonction `exitOf(answer)` et son commentaire (lignes 33 à 42) :
    `const hold = setInterval(() => {}, 1000)` retient volontairement un hôte qui attend la fin d'un
    groupe de processus. Ce maintien-là est voulu et reste tel quel.
  - `adapters/codex-rpc.cjs` : `watchTimer` et `killTimer` sont déjà détachés (lignes 41, 42, 48). Le
    processus Codex et ses tubes ne le sont pas : un vrai tour retient son hôte par eux, pas par la
    minuterie de garde. Le changement ne touche donc que les transports de substitution.
  - `tests/architecture-f05.test.cjs`, test « every way a transport is left holds the reconnection until
    its group is gone: a foreign thread, a refused turn that never ends, a cancelled turn that does not
    stop » (ligne 289) : il avance la minuterie de garde par `t.mock.timers.tick(1000)` et exige
    `closed by the watchdog` (lignes 322 à 331). C'est le test qui protège le rôle de la minuterie.
  - `tests/codex-connect-race.test.cjs`, aide `fixture(gate)` (ligne 19) : le plus petit transport de
    substitution du dépôt (`rpcFactory` sans processus), avec un `authHome` absent (ligne 9).
- Fait lié, mesuré par l'audit sur `tests/verification.test.cjs` : après l'échec d'une attente, le tour
  abandonné a tenu le processus du fichier 324 s.
- Mesure du découpage, Node 24.12.0, par un essai ponctuel qui charge le module du dépôt sans le
  modifier : un processus enfant qui crée un `CodexSessionClient` sur un `rpcFactory` minimal et
  appelle `run({ jobId, sessionId, instructions, signal })` sans jamais finir le tour vit encore après
  6 s ; `process.getActiveResourcesInfo()` y donne `["PipeWrap", "PipeWrap", "Timeout"]`. Le même
  enfant, lancé avec un `setTimeout` enveloppé qui détache toute minuterie de 1 000 ms, écrit
  `turn-started` et sort seul, code 0, en moins d'une seconde. Deux effets de bord observés : l'enfant
  écrit sur sa sortie d'erreur « TVLens : confinement Codex non vérifié (réponse de thread/start
  incomplète). », et il laisse un arbre `tvlens-codex-session-…` dans son dossier temporaire.
- Ordre : ce ticket passe après celui qui libère les vérificateurs de `tests/verification.test.cjs`,
  dont la preuve s'appuie sur le comportement actuel de la minuterie.

## Périmètre

- À modifier : `adapters/codex-session-client.cjs`, la minuterie de garde de `run` uniquement
  (`unref?.()` à chaque armement, comme le précédent du fichier) ; un nouveau fichier de test à plat
  dans `tests/`, nommé d'après le comportement, par exemple `tests/codex-abandoned-turn.test.cjs` ;
  `scripts/quality/baseline.json` n'est pas à toucher (la boucle resserre le plancher elle-même).
- À ne pas toucher : `exitOf` et son `hold`, le délai `DRAIN_MS`, `adapters/codex-rpc.cjs`, la logique
  de la garde (seuil de 3 000 ms, `this.rpc.close()`, `fail(signal.reason)`), les tests existants.
- Le test nouveau lance un processus Node enfant : `t.after` l'arrête s'il vit encore, et l'enfant
  reçoit un `TMPDIR` privé que le test supprime, car l'arbre `tvlens-codex-session-…` d'un tour
  abandonné n'est par définition pas nettoyé.
- Dans l'enfant : `run` exige un `signal` (`new AbortController().signal` suffit) ; `authHome` est un
  chemin situé dans le `TMPDIR` privé de l'enfant et que le test ne crée pas, sans recopier le chemin
  littéral « dossier Codex absent » des autres fichiers de test. Le test n'exige pas une sortie
  d'erreur vide : la ligne « confinement Codex non vérifié » y est attendue avec un transport minimal.

## Critères d'acceptation

1. Rouge d'abord : sur le code de production non modifié, le test nouveau échoue parce que l'enfant vit
   encore à l'échéance, après avoir écrit `turn-started`. Sortie dans le journal.
2. Le test nouveau passe : un processus enfant crée un `CodexSessionClient` sur un transport de
   substitution (`rpcFactory`, `authHome` absent), lance un tour par `run`, écrit `turn-started` une
   fois `turn/start` demandé, puis rend la main sans `cancel`, sans `close` et sans `process.exit`.
   L'enfant se termine seul, code 0, dans une borne de 10 s que le test n'attend jamais en entier quand
   tout va bien.
3. Le test « every way a transport is left holds the reconnection… » passe sans modification :
   `node --test --test-name-pattern="every way a transport is left" tests/architecture-f05.test.cjs`.
4. `node --test --test-concurrency=1 tests/architecture-f05.test.cjs tests/codex-confinement.test.cjs
   tests/codex-connect-race.test.cjs tests/verification.test.cjs` : aucun échec.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un test nommé d'après le comportement — par exemple « a host that leaves a turn in flight on a transport
double still exits by itself ». Frontière : `CodexSessionClient.run` dans un vrai processus Node, observé
de l'extérieur par sa sortie standard et son événement `exit`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'enfant vit encore une fois la minuterie détachée, le journal donne
la sortie de `process.getActiveResourcesInfo()` dans l'enfant. Quand ce qui le retient est une autre
minuterie de garde armée pour ce tour par le même client, le même geste s'y applique et le journal le
dit. Quand c'est un maintien voulu (`hold` de `exitOf`) ou autre chose : verdict BLOQUÉ, avec la liste.

## Journal
