---
id: T123
titre: Let a watch session raise its own ending and close its intake
statut: a-faire
bloque_par: T028
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

La fin d'une session est aujourd'hui annoncée par des écritures directes dans les drapeaux de
`WatchSession`, depuis deux modules de `runtime/`. Après ce ticket, la session expose deux transitions
nommées, `beginEnding()` et `closeIntake()`, que ces modules appellent, et un test d'architecture refuse
qu'un hôte écrive encore `ending`, `accepting`, `readOnly` ou `closed` d'une session. Ce que la session
publie, stocke et refuse pendant sa fin ne change pas.

## Sources

- Constats : CORE-06
- Correction du relecteur sur CORE-06 (elle prime) : c'est `close()` du runtime, non `WatchSession.close()`,
  qui force `asking` à vrai ; une phase exclusive ne décrit pas l'état réel (`ending` coexiste avec
  `accepting`, `readOnly` avec `ending`) ; forme retenue : deux axes, plus `holdVision(reason)` et
  `beginEnding()`.
- Code à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `runtime/session-closing.cjs`, `closeSession`, `if (session) session.watch.ending = true;`, ligne 73,
    avant l'étape `begin` : `accepting` reste vrai, un passage qui arrive pendant la fin est encore stocké.
  - `runtime/session-runtime.cjs`, méthode `close` de l'objet rendu par `createSessionRuntime`, dans
    `ending ||= (async () => {…})()` : `watch.asking = true;` ligne 489, `watch.accepting = false;` ligne
    492, `watch.ending = true;` ligne 495, puis `await watch.landed();`. Aucune publication entre ces
    écritures.
  - `core/session.cjs`, constructeur de `WatchSession` (lignes 47-73, `ending` ligne 57, `accepting` et
    `asking` ligne 65) ; accesseur `asking`, lignes 75-77 (le setter arrête la mesure du temps où la vision
    est tenue) ; `ingest`, ligne 83 (refus « La session est arrêtée. » sans `accepting`) ; `drain`, ligne 225
    (rien si `closed` ou `ending`) ; `retriesVision`, ligne 300 ; `ask`, ligne 374 (refus « Une réponse est
    déjà en cours. » quand `asking`) ; `emit`, ligne 494.
  - Écritures de `asking` par les hôtes, hors de ce ticket : `app/main.cjs`, `onChange` passé à
    `createConversationRuntime`, ligne 167 ; `runtime/headless-runtime.cjs`, `onChange`, lignes 290-300.
    Le lot L11 les met en commun (porte `asking`).
  - Tests : `tests/session-durable.test.cjs`, test « a passage that lands while its session is being ended
    is kept and saved, but starts no analysis only to have it abandoned » (ligne 539) ; le test « nothing is
    described again once the session is ending, read-only or closed » (aujourd'hui
    `tests/architecture-f08.test.cjs`, ligne 100).
- Fiche : `docs/travail/fiches/coeur.md`, étape 4 et invariants 3 et 4.

## Périmètre

- À modifier :
  - `core/session.cjs`, `WatchSession` : `beginEnding()` lève `ending` et rien d'autre ; `closeIntake()`
    met `asking` à vrai puis `accepting` à faux, dans cet ordre, en passant par le setter existant. Aucune
    des deux ne publie. Un commentaire dit ce que chacune refuse ensuite.
  - `runtime/session-closing.cjs`, `closeSession` : `session.watch.beginEnding()` à la place de
    l'affectation.
  - `runtime/session-runtime.cjs`, `close` : `watch.closeIntake()` puis `watch.beginEnding()` à la place
    des trois affectations, à la même place, avant `await watch.landed()`, commentaires gardés.
  - `tests/architecture.test.cjs` : un test de plus, nommé d'après le comportement (arbitrage A3), qui lit
    les fichiers `.cjs` de `app/`, `runtime/`, `server/` et `mcp/` et refuse toute affectation de
    `ending`, `accepting`, `readOnly` ou `closed` sur une session (`watch.<drapeau> =`, sans `==`). `asking`
    n'est pas couvert tant que la porte du lot L11 n'est pas en place (fiche, étape 5).
  - nouveau test plat `tests/watch-session-ending.test.cjs`.
- À ne pas toucher : les écritures de `asking` dans `app/main.cjs` et `runtime/headless-runtime.cjs` ; les
  tests et scripts qui écrivent les drapeaux (fiche, étape 6) ; `WatchSession.close()`, `stop()`,
  `restore()` ; ce que publie `snapshot()`.
- Aucun `catch` vide ; lignes de 160 caractères au plus.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `beginEnding()` lève `ending` ; `accepting`, `asking`, `readOnly` et `closed` gardent leur valeur ;
   `onChange` n'est pas appelé ; un second appel ne change rien. Un `ingest` qui suit est accepté : le
   passage est dans `segments`, pas dans `queue`.
2. `closeIntake()` met `asking` à vrai et `accepting` à faux, laisse `ending` tel quel, n'appelle pas
   `onChange` ; ensuite `ingest` est refusé avec « La session est arrêtée. » et `ask` avec « Une réponse est
   déjà en cours. ».
3. Le test d'architecture ajouté échoue si l'on remet temporairement `session.watch.ending = true` dans
   `closeSession`, et passe une fois la ligne retirée ; résultat noté au journal.
4. `grep -nE "watch\??\.(ending|accepting|readOnly|closed)\s*=[^=]" app/*.cjs runtime/*.cjs server/*.cjs
   mcp/*.cjs` ne rend rien.
5. Le test de `tests/session-durable.test.cjs` et celui de `tests/architecture-f08.test.cjs` cités dans les
   sources passent sans modification, ainsi que `tests/split-perception.test.cjs` et
   `tests/session-latency.test.cjs`, lancés un fichier à la fois.
6. `node --test tests/watch-session-ending.test.cjs` passe ; `node scripts/check.mjs --changed` passe.

## Test d'acceptation attendu

`tests/watch-session-ending.test.cjs`, test « beginning its ending publishes nothing and leaves a session
open to passages, which are stored but queued for no analysis » : une `WatchSession` construite avec des
doublures minimales, `onChange` qui compte ses appels ; `beginEnding()` n'ajoute aucun appel à
`onChange` ; un `ingest` qui suit rend un identifiant, le passage figure dans `segments` et la file
d'analyse reste vide (la publication que fait `ingest` pour le passage stocké est celle d'aujourd'hui,
elle n'est pas comptée contre `beginEnding()`). Frontière : la classe exportée par `core/session.cjs`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
