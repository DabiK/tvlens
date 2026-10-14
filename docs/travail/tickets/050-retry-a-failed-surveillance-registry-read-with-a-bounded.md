---
id: T050
titre: Retry a failed surveillance registry read with a bounded backoff
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Sur le Mac, quand la lecture du registre de surveillance échoue, l'erreur est avalée et la clé de
l'état est tout de même mémorisée : le registre n'est plus relu tant que l'état ne change pas, et rien
ne le dit. Après ce ticket, un échec est signalé une fois, la même lecture est retentée avec un délai
borné, et la clé n'est mémorisée qu'après une lecture réussie.

## Sources

- Constats : UI-04
- Code vérifié à la version `0d5a954` (chercher par nom, les lignes bougeront) :
  - `app/renderer.js`, `refreshRegistry()` (l.649-659) : `bridge.surveillanceHistory().then(…)
    .catch(() => {}).finally(() => { registryBusy = false; registryKey = key; scheduleSurveillance(); })`.
    L'échec est avalé et `registryKey = key` s'exécute dans tous les cas ; la garde
    `if (key === registryKey) return;` (l.652) empêche ensuite toute nouvelle lecture.
  - `app/renderer.js` : `REGISTRY_EVERY_MS = 2000` (l.19) ; état du registre l.592
    (`registryKey`, `registryAt`, `registryBusy`, `registryTimer`) ; remise à vide de `registryKey`
    l.188, l.542 et l.724 ; `reason = error => cleanError(error)` (l.32) ; `notice` (l.35).
  - Modules purs existants de l'interface : `app/ui/card-queue.mjs`, `app/ui/text.mjs` (`cleanError`,
    l.80-83) et les autres fichiers de `app/ui/`, importés par `app/renderer.js` l.1-14.
  - `tests/mac-ui.test.cjs` : charge les modules purs par `ui = name => import('../app/ui/${name}.mjs')`
    (l.10). Le renderer ne se charge pas sans Electron : il est gardé par des tests qui lisent son
    texte source (l.660-724), et ces gardes s'appliquent d'office à tout fichier de `app/ui/`
    (`rendererFiles`, l.661), donc au module créé ici :
    - « the renderer parses, imports only what its modules export, and finds every element it asks
      for » (l.664) : un nom importé doit être déclaré dans le module par `export function`,
      `export const` ou `export class` (pas de `export { … }` groupé), et chaque fichier doit se
      compiler ;
    - « the renderer talks to the bridge of the contract only, and writes no ceiling or retention of
      its own » (l.685) : entre autres, le littéral `60000` est interdit hors de `ui/text.mjs` et
      `ui/card-queue.mjs` (l.722), et plusieurs motifs du texte de `app/renderer.js` sont exigés
      (l.705-716).

## Périmètre

- À créer : `app/ui/registry-refresh.mjs`, module pur : il tient les comptes, reçoit l'heure en
  nombre, ne pose aucune minuterie et n'accède ni au DOM ni au pont IPC.
- À modifier : `app/renderer.js` (`refreshRegistry` s'appuie sur le module), `tests/mac-ui.test.cjs`.
- Règles du module :
  - Une clé n'est mémorisée qu'après une lecture réussie ; la même clé ne déclenche alors plus de
    lecture.
  - Après un échec, la même clé est relue. Le délai minimal depuis le début de la lecture précédente
    vaut 2000 ms après une réussite, puis 2000 ms × 2^n après n échecs consécutifs, plafonné à
    30 000 ms.
  - Le premier échec d'une série demande un signalement ; les suivants non ; une réussite clôt la
    série.
  - Une remise à zéro (onglet affiché, session changée : les trois endroits où `registryKey` est vidé
    aujourd'hui) efface la clé mémorisée et la série d'échecs.
- Dans le renderer : le signalement passe par `notice(reason(error))` ; la minuterie existante
  `registryTimer` applique le délai demandé par le module. Le bandeau n'est pas effacé par une lecture
  réussie ensuite : c'est le comportement existant de `notice`, inchangé.
- À ne pas toucher : les autres gestionnaires du renderer ; le retrait du préfixe IPC
  (`app/preload.cjs` l.5-7, `cleanError`) ; l'absence d'écouteur global `unhandledrejection` (reportés) ;
  les gardes statiques existantes de `tests/mac-ui.test.cjs`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Après une lecture réussie pour une clé, le module ne demande plus de lecture pour cette clé ; une
   clé différente en demande une, au plus tôt 2000 ms après le début de la précédente.
2. Après un échec, le module redemande une lecture pour la même clé ; les délais minimaux successifs
   après 1, 2, 3, 4 et 5 échecs consécutifs sont 4000, 8000, 16 000, 30 000 et 30 000 ms.
3. Le premier échec d'une série rend une demande de signalement ; les échecs suivants n'en rendent
   pas ; après une réussite, un nouvel échec en rend une de nouveau.
4. Après une remise à zéro, la clé mémorisée est oubliée et le délai minimal revient à 2000 ms.
5. Garde statique ajoutée à côté des gardes existantes, sur le texte de `app/renderer.js` : le corps
   de `refreshRegistry` ne contient plus `.catch(() => {})`, et le renderer importe le module
   `./ui/registry-refresh.mjs`.
6. `node --test --test-concurrency=1 tests/mac-ui.test.cjs` passe, gardes existantes comprises, sans
   qu'aucune assertion existante soit modifiée.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/mac-ui.test.cjs`, par les exports de `app/ui/registry-refresh.mjs` chargés avec
`ui('registry-refresh')`, l'heure étant fournie par le test. Le câblage dans `refreshRegistry` ne
s'exécute pas hors ligne à cette version (le renderer ne se charge pas sans Electron) : la garde
statique du critère 5 prouve seulement que l'échec n'est plus avalé et que le module est branché ; le
reste du câblage (délai appliqué par `registryTimer`, signalement, remises à zéro) est relu.

## Hypothèses bloquantes

Aucune décision n'est attendue. La règle de recul (doublement, plafond de 30 000 ms) est choisie par
ce ticket, sur le modèle du recul des lectures de la TV.

## Journal
