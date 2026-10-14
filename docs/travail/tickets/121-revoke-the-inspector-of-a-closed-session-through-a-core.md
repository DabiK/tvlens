---
id: T121
titre: Revoke the inspector of a closed session through a core decorator
statut: a-faire
bloque_par: T028
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Une session fermée refuse tout nouveau réexamen de ses passages. Aujourd'hui ce refus est un remplacement
de `inspector.inspect` à l'intérieur de `createSessionRuntime`, qu'on ne peut tester qu'en montant une
session entière. Après ce ticket, il est un décorateur de `core/`, `RevocableInspector`, sur le modèle de
`CachedInspector`, testé seul ; le runtime le compose et l'appelle à sa fermeture. Le comportement vu par
les hôtes, les outils vidéo et les tests ne change pas.

## Sources

- Constats : CORE-03
- Risque noté par le relecteur : le décorateur doit garder l'ordre actuel (refus avant l'appel, après un
  rejet et après le résultat, cache vidé à chaque fois), et l'objet rendu doit garder ses champs.
- Code à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `runtime/session-runtime.cjs`, constante `REVOKED`, lignes 45-46 : « Session terminée : ses passages
    ne peuvent plus être réexaminés. »
  - `runtime/session-runtime.cjs`, `createSessionRuntime`, `inspector = new CachedInspector(inspector)`,
    ligne 209, puis le remplacement : `const revocation = new AbortController(), inspectCached = …`,
    `refuseRevoked`, `inspector.inspect = async (input) => …`, lignes 214-232. Le signal passé au décoré
    combine celui de l'appelant et celui de la révocation (`AbortSignal.any`).
  - `runtime/session-runtime.cjs`, méthode `close` de l'objet rendu : `revocation.abort(new
    Error(REVOKED))` puis `inspector.cache.clear()`, lignes 486-487, avant l'ouverture de la fin.
  - `core/cached-inspector.cjs`, classe `CachedInspector` (11 lignes) : champs `inner`, `maxEntries`,
    `cache`, `hits`, `misses` ; `inspect(input)`.
  - Lecteurs des champs de `runtime.inspector` : `runtime/conversation-runtime.cjs`, `makeTools`, lignes
    39 et 45 (passé tel quel à `VideoTools`) ; le test « a closed session runtime re-examines nothing
    more: a late call is refused before its cache and its inspector, one in flight is told and leaves
    nothing behind, a reopened archive inspects again » (aujourd'hui `tests/architecture-f05.test.cjs`,
    ligne 572) lit `live.inspector.inner`, remplace `inner.inspect`, lit `hits` et `cache.size` ; le test
    « the Mac host revokes the external MCP contexts of a session as its end begins… » (même fichier,
    ligne 686) lit `first.inspector.inner` et attend le message `REVOKED`.
- Fiche : `docs/travail/fiches/coeur.md`, étape 2 et invariants 1 et 2.

## Périmètre

- À modifier :
  - nouveau `core/revocable-inspector.cjs` : `class RevocableInspector`, construite avec l'inspecteur
    décoré et le message du refus (fourni par la composition : le texte reste dans
    `runtime/session-runtime.cjs`, arbitrage A6). Méthodes `inspect(input)` et `revoke()`. Elle relaie en
    lecture `inner`, `cache`, `hits` et `misses` du décoré, pour que `runtime.inspector` expose les mêmes
    objets qu'aujourd'hui. Attention au nom : `runtime.inspector.inner` doit rester l'inspecteur placé
    dans le `CachedInspector` (celui que les tests remplacent), pas le `CachedInspector` lui-même ; le
    décoré se garde donc sous un autre nom que `inner`. `revoke()` interrompt le signal passé au décoré
    (raison : une erreur portant le message) et vide aussitôt son cache, comme le font aujourd'hui
    `revocation.abort(new Error(REVOKED))` et `inspector.cache.clear()` ; un second appel ne change rien.
    À chaque refus, elle vide le cache du décoré quand il en a un.
  - `runtime/session-runtime.cjs`, `createSessionRuntime` : le remplacement des lignes 214-232 devient
    `new RevocableInspector(…)` autour du `CachedInspector` ; `close` appelle `revoke()` au même moment
    qu'aujourd'hui (avant la fin, avant tout `await`).
  - nouveau test plat `tests/revocable-inspector.test.cjs`, avec un inspecteur décoré en mémoire.
- À ne pas toucher : `core/cached-inspector.cjs` ; le texte du message ; les autres champs de l'objet rendu
  par `createSessionRuntime` ; `runtime/conversation-runtime.cjs` ; les tests existants.
- Aucun `catch` vide ; le décorateur n'importe rien (`core/` reste pur).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Avant `revoke()`, `inspect` rend ce que rend le décoré et lui passe un signal qui s'interrompt quand
   celui de l'appelant s'interrompt.
2. Après `revoke()`, un appel est refusé avec le message fourni sans que le décoré soit appelé, y compris
   pour une question déjà en cache : `hits` ne bouge pas et le cache est vide.
3. Un appel en vol au moment de `revoke()` voit le signal reçu par le décoré s'interrompre, et il est
   refusé avec ce message, que le décoré rende un résultat (en ignorant le signal) ou rejette ; après lui,
   le cache est vide. Juste après `revoke()`, avant toute fin d'appel en vol, le cache est déjà vide.
4. Un appel interrompu par son appelant, sans révocation, rejette avec l'erreur du décoré, pas avec le
   message de révocation.
5. `runtime.inspector.inner`, `.cache`, `.hits` et `.misses` désignent les mêmes objets et valeurs
   qu'avant (`inner` est l'inspecteur placé dans le `CachedInspector`, `hits` et `misses` sont lus en
   direct, pas copiés à la construction) : les deux tests de révocation cités dans les sources passent sans
   modification.
6. `grep -n "inspector.inspect = " runtime/session-runtime.cjs` ne rend rien.
7. `node --test tests/revocable-inspector.test.cjs` passe ; le fichier de test qui contient les deux tests
   de révocation cités passe ; `tests/session-durable.test.cjs`, `tests/session-delete.test.cjs`,
   `tests/disk-guard.test.cjs` et `tests/mac-ipc-contract.test.cjs` passent, lancés un fichier à la fois ;
   `node scripts/check.mjs --changed` passe ; `tests/architecture.test.cjs` passe (le nouveau fichier de
   `core/` n'importe rien).
8. Mutation : retirer temporairement le refus qui suit le résultat du décoré fait échouer le critère 3 ; la
   mutation est retirée avant la fin et notée au journal avec le résultat observé.

## Test d'acceptation attendu

`tests/revocable-inspector.test.cjs`, test « a revoked inspector refuses a late call before its cache and
its inner inspector, and empties the cache » : un `CachedInspector` réel autour d'un inspecteur en mémoire
qui compte ses appels, un premier appel mis en cache, `revoke()`, puis le même appel ; frontière : l'export
de `core/revocable-inspector.cjs`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
