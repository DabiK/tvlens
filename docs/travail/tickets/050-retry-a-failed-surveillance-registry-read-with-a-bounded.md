---
id: T050
titre: Retry a failed surveillance registry read with a bounded backoff
statut: a-faire
bloque_par: T294
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
- Code vérifié à la version `1178657` (chercher par nom, les lignes bougeront) :
  - `app/renderer.js`, `refreshRegistry()` (l.455-465) : `bridge.surveillanceHistory().then(…)
    .catch(() => {}).finally(() => { registryBusy = false; registryKey = key; scheduleSurveillance(); })`
    (l.463-464). L'échec est avalé et `registryKey = key` s'exécute dans tous les cas ; la garde
    `if (key === registryKey) return;` (l.458) empêche ensuite toute nouvelle lecture. Elle est appelée par
    `drawSurveillanceChrome` (l.431-451, appel l.450).
  - `app/renderer.js` : `REGISTRY_EVERY_MS = 2000` (l.21) ; état du registre l.424 (`registryKey`, `registryAt`,
    `registryBusy`, `registryTimer`) ; remise à vide de `registryKey` l.144 (`adoptedState`, session changée),
    l.361 (`resetSessionChrome`) et l.515 (`shell.onShow`, onglet Surveillance affiché) ;
    `reason = error => cleanError(error)` (l.26) ; `notice` (l.29) ; `scheduleSurveillance` (l.452) délègue à
    `wiring.scheduleSurveillance()` (`app/ui/renderer-wiring.mjs:324`).
  - Modules purs existants de l'interface : `app/ui/card-queue.mjs`, `app/ui/text.mjs` (`cleanError`,
    l.80-83) et les autres fichiers de `app/ui/`, importés par `app/renderer.js` l.1-16.
  - ADR 0043 (`docs/adr/0043-les-raccords-du-renderer-mac-passent-par-une-composition-importable.md`) : la
    composition importable `createRendererWiring` porte les raccords ciblés ; l'historique détaillé de surveillance
    reste composé à son emplacement actuel, dans `app/renderer.js`.
  - `tests/mac-ui.test.cjs` : charge les modules purs par `ui = name => import('../app/ui/${name}.mjs')` (l.15).
    Le banc `rendererHarness` (`tests/helpers/mac-renderer.cjs`) exerce `app/ui/renderer-wiring.mjs`, pas
    `app/renderer.js` : le renderer est seulement compilé (`vm.Script`, l.1617-1619), jamais exécuté sans
    Electron. Des gardes lisent son texte source, et elles s'appliquent d'office à tout fichier de `app/ui/`
    (`rendererFiles`, l.1534), donc au module créé ici :
    - « the renderer parses, imports only what its modules export, and finds every element it asks for »
      (l.1606-1627) : chaque fichier de `app/ui/` s'importe sans DOM (l.1607-1609) ; chaque nom importé par
      `renderer.js` figure parmi les exports réels du module importé (l.1610-1616) ; `renderer.js` se compile ;
    - « the renderer talks to the bridge of the contract only, and writes no ceiling or retention of its own »
      (l.1629-1665) : entre autres, `surveillanceHistory` doit rester appelé par un fichier du renderer
      (l.1634-1635), le littéral `300000` est interdit partout (l.1661) et `60000` hors de `ui/text.mjs` et
      `ui/card-queue.mjs` (l.1662) ;
    - les gardes de contenu comparent des formes de texte par `shaped` et `holds` (l.18-20, aide
      `tests/helpers/source-shape.cjs`), qui ignorent la mise en forme.
  - `tests/architecture-guard.test.cjs` (l.1287-1316) : un module de `app/ui/` n'importe rien hors de ce dossier.

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
  les gardes statiques existantes de `tests/mac-ui.test.cjs` ; `app/ui/renderer-wiring.mjs` (ADR 0043).
- Hors boucle, par l'orchestrateur, après intégration : contrôle réel sur le Mac, dans l'application Electron
  lancée depuis le commit intégré : onglet Surveillance ouvert pendant une surveillance active, l'historique suit
  les changements d'état, et le registre n'est pas relu en boucle quand rien ne change. Compte rendu dans
  `experiments/essais/`.

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
s'exécute pas hors ligne à cette version (le renderer ne s'exécute pas sans Electron, et le banc
`rendererHarness` ne le charge pas) : la garde statique du critère 5 prouve seulement que l'échec n'est plus
avalé et que le module est branché ; le reste du câblage (délai appliqué par `registryTimer`, signalement,
remises à zéro) est relu.

## Hypothèses bloquantes

Aucune décision n'est attendue. La règle de recul (doublement, plafond de 30 000 ms) est choisie par
ce ticket, sur le modèle du recul des lectures de la TV.

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à jour à
  `1178657` ; bloqueurs revus : T145 retiré (file rouverte) ; T028 retiré (reformatage Prettier jamais lancé, encore
  à faire : ce ticket n'a pas besoin de son code) ; T294 ajouté (passe après la file en cours). Le défaut est
  toujours là (`app/renderer.js:463-464`). Lignes recalées ; gardes de `tests/mac-ui.test.cjs` relues à cette
  version : la règle « pas de `export { … }` groupé » n'existe plus (la garde lit les exports réels), celle sur
  `surveillanceHistory` s'ajoute ; ADR 0043 cité. Contrôle réel sur le Mac ajouté au périmètre.
