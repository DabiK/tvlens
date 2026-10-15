---
id: T166
titre: Remove the ambient supervisor, its relay and their routes
statut: termine
bloque_par: T165
adr: non
installe: non
harnais: non
supprime_tests: oui
niveau: sensible
---

## Ce que le ticket livre

Après décision écrite du propriétaire, le superviseur ambient, le relais des touches et leurs routes
locales disparaissent. Rakuten ouvre toujours le panneau, ses dispositions et son watchdog restent
fonctionnels. Le gate de capture attend T181 ; les intégrations de page et documents attendent T182.

## Sources

- `docs/audit-points-chauds.md`, section D « Coupes », ambient panneau fermé.
  Décision du propriétaire, le 15/10 : séparer superviseur/relais/routes, gate, puis page/documents.
- Repères vérifiés à `e92c6a6`, avant T165 :
  - `tv/ambient.py:528` définit `Supervisor`, `tv/ambient.py:463` son watchdog et
    `tv/ambient.py:1032` son entrée ; `tv/ambient.py:58` livre le profil `off` ;
  - `tv/controller.py:18` importe ambient, `tv/controller.py:73` définit `SettingsStore`,
    `tv/controller.py:85` `AmbientController`, `tv/controller.py:292` les routes de page et
    `tv/controller.py:355` la composition locale ;
  - `prototypes/lg-remote/runtime/ambient_relay.py:1` porte le relais ;
    `prototypes/lg-remote/runtime/tvlens_mapper.py:13` l’installe et
    `prototypes/lg-remote/runtime/managed_mapper.py:39` déclare le hook, installé par
    `prototypes/lg-remote/runtime/tvlens_mapper.py:27` ;
  - `prototypes/lg-remote/runtime/panel.py:122` coordonne le panneau avec ambient ; son verrou
    propre, sa géométrie, ses modes chat/frise et sa restauration ne sont pas dédiés à ambient ;
  - `tests/test_tv_ambient.py:25` charge le superviseur et son contrôleur ;
    `prototypes/lg-remote/test_ambient_relay.py:308` mêle une preuve indépendante de boucle sans
    hook aux cas du relais ; `prototypes/lg-remote/test_panel.py:55` protège aussi le panneau ;
    `tests/test_tv_control.py:18` protège le contrôleur de capture et ses routes ;
  - frontière avec T181 : `tv/capture.py:7` importe encore `AmbientPaths`, `read_gate`, `GATE_STALE` ;
    `tests/test_tv_capture_gate.py:31` utilise `BOXES`/`RECT_MARGIN`, et sa ligne 112 `read_gate`.
    Ces dépendances interdisent de supprimer tout `tv/ambient.py` dans cette première étape.
- L’ADR de retrait créé par T165 couvre les quatre étapes, leurs capacités abandonnées et la route
  serveur conservée. Retrouver son numéro livré et le citer au journal ; aucun nouvel ADR ici.

## Périmètre

- Retirer le superviseur, ses files dédiées, watchdog, recovery et entrée de `tv/ambient.py`.
  Conserver temporairement dans ce même fichier les seules primitives transitivement nécessaires
  au lecteur de gate de capture et à ses tests : chemins, lecture/validation, constantes de gate et
  géométrie des fixtures. Aucun lancement ni écrivain de gate n’y reste. T181 supprime ce reliquat ;
  aucun nouveau module provisoire n’est créé.
- Retirer de `tv/controller.py` l’import ambient, `SettingsStore`, `AmbientController`, tables et
  parseurs dédiés, exceptions de page sans jeton et composition/recovery du superviseur. Conserver
  capture, authentification, CORS, `/capture`, `/panel` et changements de disposition.
- Supprimer `prototypes/lg-remote/runtime/ambient_relay.py`, son installation, ses variables de
  statut et son hook dans `tvlens_mapper.py` et `managed_mapper.py`. Conserver Rakuten vers
  `open_panel`, evdev, touches non liées et Back. Ne pas modifier les modules du fournisseur mapper.
- Retirer de `prototypes/lg-remote/runtime/panel.py` la coordination ambient : notice, verrou
  d’écran partagé, attente/fermeture de carte et relance liée à cette carte. Conserver verrou propre
  du panneau, géométrie, watchdog, restauration et modes chat/frise.
- `supprime_tests: oui`, après décision : supprimer `tests/test_tv_ambient.py` et les seuls cas
  dédiés au relais dans `prototypes/lg-remote/test_ambient_relay.py`. Avant suppression de ce
  dernier fichier, transférer sa preuve générique sans hook et ses aides utiles vers
  `prototypes/lg-remote/test_mapper.py` (à créer) ou un fichier générique existant, avec les mêmes
  attentes indépendantes. Dans `test_panel.py`, retirer seulement les cas de coordination ambient.
- Adapter `tests/test_tv_control.py` à l’absence des routes, sans affaiblir capture, jeton ou CORS.
  Avant tout retrait de fichier mixte, conserver ses preuves génériques avec leurs assertions
  et noter les anciens/nouveaux emplacements au journal.
  Laisser inchangés `tv/capture.py`, ses tests de gate, les vues TV et les documents actifs : T181
  et T182 en possèdent le retrait. La page peut encore recevoir le 404 qu’elle sait déjà traiter.
- Les suppressions de cas sont exclusivement Python : aucun cas JavaScript `test(` n’est supprimé,
  donc n = 0. Le plancher `cas_de_test` ne bouge pas et le harnais reste fermé ; aucune modification
  de `scripts/quality/baseline.json` ni aucun cas de remplissage.
- Conserver `/v1/surveillance/overlay`, sa projection runtime, ses champs et ses ETags : leur retrait
  attend un cadrage distinct, décrit dans l’ADR de T165. Aucun accès TV, VPS, identifiant ou fournisseur.

## Critères d'acceptation

1. `rg -n 'class (Supervisor|AmbientController)|ambient_relay|install_ambient' tv prototypes/lg-remote`
   ne trouve aucune définition, import ou lancement actif. Les éventuels tests d’absence sont classés
   au journal. Le reliquat de `tv/ambient.py` ne contient que les dépendances de lecture de T181.
2. Par le vrai `DeviceServer`, avec processus simulés, `/capture` et `/panel` gardent réponses et
   authentification. `/ambient`, `/ambient/start`, `/ambient/ack/<nonce>` et `/ambient/wait/<nonce>`
   passent par la voie inconnue : 404 avec jeton valide, 401 sans jeton. Aucun superviseur ni recovery
   ne part au démarrage ou à l’arrêt.
3. La boucle mapper sans hook garde ses événements attendus indépendamment : touches non liées
   transmises une fois, Back rejoué comme avant, Rakuten ouvrant le panneau une fois. Le journal
   associe chaque preuve générique déplacée à son ancien et son nouvel emplacement. Géométrie,
   restauration, fermeture voulue et watchdog du panneau restent testés sans faux ambient.
4. `tests/test_tv_capture_gate.py` reste exécutable avec ses assertions : son lecteur de gate n’est
   pas supprimé avant T181. Aucun cas JavaScript n’est retiré ici : n = 0. Le journal consigne les
   mesures initiales M et P et le comptage final, égal à M. Le plancher P ne bouge pas ;
   `git diff --exit-code -- scripts/quality/baseline.json` rend 0, sortie consignée au journal.
5. Les tests de contrôle/capture et ceux de mapper/panneau sont exécutés en séquentiel, puis
   `node scripts/check.mjs` est vert. Lancer explicitement les tests du prototype mapper/panneau :
   la découverte Python du contrôle ne couvre que `tests/`. Aucun smoke natif ni packaging n’est lancé.

## Test d'acceptation attendu

Frontières : vrai serveur local dans `tests/test_tv_control.py`, événements enregistrés dans
`prototypes/lg-remote/test_mapper.py`, cycle du panneau dans `prototypes/lg-remote/test_panel.py`.
La suite de gate encore présente prouve que l’étape intermédiaire conserve ses dépendances.

## Hypothèses bloquantes

Décision du propriétaire, le 15/10 (« Oui », en réponse à la question posée) : oui. Supprimer définitivement l’affichage ambient panneau fermé, son superviseur, son relais et ses outils dédiés, tout en conservant la surveillance et les cartes du panneau ouvert.

La décision doit figurer au début de cette section, même si T165 a été tranché. Elle ne couvre que
les cas des capacités supprimées ; les preuves génériques sont conservées. Les suppressions sont
Python : n = 0 et le plancher JavaScript ne bouge pas.
T181 puis T182 achèvent la suppression sous la même décision à inscrire dans chacune de leurs fiches.
Les tests hors ligne n’établissent ni l’état installé ni les propriétés matérielles de focus/capture.

## Journal

### Cadrage et exploration

- Consignes et code concernés lus ; exploration dans `.harness-state/tickets/T166/exploration.md`, écarts dans `ecarts.md` : aucun prévu.
- Décision applicable : ADR **0017**, `docs/adr/0017-retrait-de-l-affichage-ambient-panneau-ferme.md`, livré par T165. Aucun nouvel ADR.
- État initial : statut du ticket déjà modifié ; `design/continuous-context/` et `experiments/` hors périmètre, laissés intacts.
- Commande : `node --input-type=module -e 'import fs from "node:fs"; import { measure } from "./scripts/quality/metrics.mjs"; const result = { M: measure(process.cwd()).cas_de_test, P: JSON.parse(fs.readFileSync("scripts/quality/baseline.json", "utf8")).cas_de_test }; fs.writeFileSync(".harness-state/tickets/T166/initial-metrics.json", JSON.stringify(result, null, 2) + "\n"); console.log(result);'` → **M = 1096, P = 1096**. Retrait JavaScript prévu : **n = 0**.

### Routes et cycle du contrôleur

- `python3 -B -m unittest discover -s tests -p test_tv_control.py -k test_removed_display_routes` : rouge observé sur **6 assertions 404 != 401**, puis vert après retrait des routes et exceptions sans jeton (`routes-red.log`, `routes-green.log`).
- `python3 -B -m unittest discover -s tests -p test_tv_control.py -k test_startup_and_shutdown` : rouge sur le thread lancé par `AmbientController.watch`, dans les deux modes d'arrêt ; composition et recovery supprimées.
- `python3 -B -m unittest discover -s tests -p test_tv_control.py` : **11 tests OK**, y compris capture réelle simulée, concurrence des dispositions et livraison (`controller-green.log`).

### Conservation des preuves et retrait Python

- Avant suppression du fichier mixte : `test_ambient_relay.py::InputLoop.test_without_the_hook_the_loop_writes_what_it_wrote_before_byte_for_byte` → `test_mapper.py::InputLoop.test_unbound_keys_back_and_rakuten_keep_their_expected_events`. Aides `Clock`, `pack`, `unpack`, `tap`, `BACK_REPLAYED`, `run_loop` et séquence `EVERYDAY` transférées. Mêmes attentes indépendantes sur tous les événements, Back, action Rakuten unique, zéro toast, entrée intacte, alignement des octets et comparaison au mapper historique `9758633`. Les branches avec relais et l'assertion sur le texte du hook sont retirées avec la capacité dédiée.
- `python3 -B -m unittest discover -s prototypes/lg-remote -p test_mapper.py -v` : **1 test OK avant suppression** (`mapper-transfer.log`). Après retrait de l'installation/hook/statut, **2 tests OK** (`mapper-green.log`). Le nouveau test du point d'entrée est d'abord rouge sur `ambientRelay` encore publié (`mapper-startup-red.log`).
- `test_panel.py::AmbientYield.test_free_screen_opens_as_before_with_a_notice_the_lock_and_the_video_rectangle` → `PanelLifecycle.test_open_panel_publishes_video_geometry_and_restores_on_exit` : assertions de lancement/fermeture uniques, rectangle, état final et restauration gardées ; seules notice et verrou partagé sont retirés.
- `test_panel.py::AmbientYield.test_panel_closed_by_the_viewer_is_not_relaunched_when_no_card_was_in_the_way` → `PanelLifecycle.test_panel_closed_by_the_viewer_is_not_relaunched` : mêmes assertions de lancement unique et réduction/restauration ; seconde variante avec carte retirée. Les quatre autres cas AmbientYield sont dédiés à la coordination supprimée. `Rectangles`, `LunaReplies` et `Watchdog` gardent leurs assertions.
- `python3 -B -m unittest discover -s prototypes/lg-remote -p test_panel.py -k test_panel_lifecycle` : rouge sur la notice créée ; le panneau n'écrit ensuite que son propre état. Suite panneau : **14 tests OK** (`panel-green.log`), avec avertissement de descripteur non fermé sur refus du verrou propre. Cette fuite est reproduite par assertion (`panel-lock-red.log`), puis corrigée par fermeture explicite : cas vert (`panel-lock-green.log`).
- Retraits autorisés : intégralité de `tests/test_tv_ambient.py` ; cas relais/installation et cas d'événements avec hook de `test_ambient_relay.py`, après transfert ci-dessus ; seuls cas/parties de coordination de `test_panel.py`. Aucun cas JavaScript supprimé. Inventaire Python dans `python-test-inventory.json`.

### Validation finale du périmètre

- `python3 -B -m unittest discover -s tests -p test_tv_control.py -v` : **13 tests OK** (`control-final.log`). Anciennes routes via vrai DeviceServer : 404 authentifié, 401 sans jeton ou mauvais jeton ; capture et dispositions authentifiées, CORS et lancement/arrêt simulés conservés.
- `python3 -B -m unittest discover -s tests -p test_tv_capture_gate.py -v` : **20 cas, OK, 1 ignoré** (`gate-final.log`). Le scénario lent reste ignoré par défaut, sans modification du fichier ; 19 cas exécutés. Aucun smoke natif ni packaging.
- `python3 -B -m unittest discover -s prototypes/lg-remote -p 'test_*.py' -v` : **18 tests OK**, après nettoyage final (`prototype-final.log`). Événements mapper, action réelle Rakuten vers le lanceur simulé, géométrie, dispositions, fermeture voulue, restauration et watchdog sans faux ambient.
- `rg -n 'class (Supervisor|AmbientController)|ambient_relay|install_ambient' tv prototypes/lg-remote` : **sortie vide, code 1**. Aucune définition, import ou installation active, aucun test d'absence trouvé par cette expression. Les assertions d'absence de champs `ambientRelay`/`panelYield` dans `test_mapper.py` sont des preuves comportementales de statut ; la configuration expérimentale de sa fixture vérifie qu'elle n'est plus installée.
- Reliquat `tv/ambient.py` : uniquement json/os/Path, `BOXES`, `RECT_MARGIN`, `GATE_STALE`, `GATE_STATES`, `AmbientPaths.gate`, `read_gate`. Aucun écrivain, lancement, queue, watchdog ou recovery.
- `git diff --exit-code -- tv/capture.py tests/test_tv_capture_gate.py tv/app prototypes/lg-remote/vendor runtime server` : **code 0, sortie vide**. Capture, gate testé, vues et projection/API overlay inchangés.
- Mesure finale : `node --input-type=module -e 'import fs from "node:fs"; import { measure } from "./scripts/quality/metrics.mjs"; const result = { M: measure(process.cwd()).cas_de_test, P: JSON.parse(fs.readFileSync("scripts/quality/baseline.json", "utf8")).cas_de_test, n: 0 }; fs.writeFileSync(".harness-state/tickets/T166/final-metrics.json", JSON.stringify(result, null, 2) + "\n"); console.log(result);'` → **M = 1096, P = 1096, n = 0**, égal au comptage initial.
- `git diff --exit-code -- scripts/quality/baseline.json` : **code 0, sortie vide**, plancher inchangé. `git diff --check` : **code 0** (`absence-and-scope.log`).
- `node scripts/check.mjs --changed` : **vert** (`check-changed.log`). Aucun fichier de test JavaScript modifié : cette commande ne lance donc aucun test JS ni Python ; les suites Python explicites sont consignées ci-dessus. Tests et contrôles exécutés en séquentiel.
- `node scripts/check.mjs` : **vert**, code 0 (`check-full.log`) : règles, format, lint, gel, cliquet ; **1260 tests JS réussis dans 103 fichiers** ; **33 cas Python, OK, 1 ignoré** (scénario lent inchangé). Aucune relance d'échec instable.
- Livraison : superviseur, relais, routes et coordination ambient supprimés ; dépendances de lecture de capture conservées jusqu'à T181. Journal et verdict remis à la boucle pour relecture ; aucun commit ni push.

### Reprise après relecture 1

- Rapport `.harness-state/tickets/T166/relecture-1.md`, ticket/journal, écarts, `git status` et diff relus ; reprise du travail existant. Constat mineur 1 accepté, sans contestation : annuler le correctif hors périmètre du descripteur du verrou propre et retirer l'assertion interne, en gardant les preuves de comportement. Décision inscrite dans `ecarts.md` avant modification.
- Tests d'abord : le cas existant sera ramené aux assertions publiques (propriétaire présent, aucun appel Luna, aucun watchdog), puis exécuté avant et après l'annulation. Aucun nouveau comportement ne nécessite une assertion rouge ; aucun test sur le texte du code n'est ajouté.
- Réserve hors périmètre 2 : `tv/luna.py` n'a plus d'importeur après ce retrait. La fiche `docs/travail/fiches/tv-et-python.md` prévoit son usage par la capture. T181 ou un cadrage distinct décidera de le raccorder avec un test ou de le retirer ; le module reste inchangé ici. Cette réserve figurera dans `reste` du nouveau verdict.
- `python3 -B -m unittest discover -s prototypes/lg-remote -p test_panel.py -k test_panel_owner_lock -v` : **1 test OK avant et après annulation** (`correction-1-lock-before.log`, `correction-1-lock-after.log`). Le test n'utilise plus de remplacement de `open` ni d'assertion sur le descripteur. Le chemin de refus du verrou propre est identique à HEAD ; le `ResourceWarning` préexistant est de nouveau observé, sans échec ni masquage.
- `python3 -B -m unittest discover -s prototypes/lg-remote -p 'test_*.py' -v` : **18 tests OK**, avec le même avertissement connu (`correction-1-prototype.log`).
- `python3 -B -m unittest discover -s tests -p 'test_*.py' -v` : **33 cas Python, OK, 1 ignoré** (scénario lent déjà ignoré), en séquentiel après le prototype (`correction-1-control-capture.log`).
- `node scripts/check.mjs --changed` : **vert, code 0** (`correction-1-check-changed.log`) ; aucun test JavaScript modifié à lancer dans ce mode.
- Recherche du critère 1 : sortie vide, code 1. `git diff --exit-code -- scripts/quality/baseline.json` : code 0, sortie vide. `git diff --exit-code -- tv/capture.py tv/luna.py tests/test_tv_capture_gate.py tv/app prototypes/lg-remote/vendor runtime server` : code 0, sortie vide. `git diff --check` : code 0 (`correction-1-scope.log`).
- Mesure via la même fonction `measure()` : **M = 1096, P = 1096, n = 0**, inchangés (`correction-1-metrics.json`). `rg -n '(from luna import|import luna)' tv prototypes/lg-remote tests` : sortie vide, code 1, en accord avec la réserve sur le module.
- `node scripts/check.mjs` : **vert, code 0** (`correction-1-check-full.log`) : règles, format, lint, gel, cliquet ; **1260 tests JS réussis dans 103 fichiers** ; **33 cas Python, OK, 1 ignoré**. Contrôles exécutés une fois, en séquentiel.
- Correction du constat mineur 1 livrée ; réserve du constat hors périmètre 2 conservée dans `reste`. Nouveau verdict remis à la boucle pour relecture, sans commit ni push.

### Réserves à la clôture

- Réserve hors périmètre, relecture 1 constat 2 : tv/luna.py n’a plus d’importeur ni de test après le retrait du superviseur. T181 ou un cadrage distinct décidera de le raccorder à la capture avec un test, conformément à docs/travail/fiches/tv-et-python.md, ou de le retirer. Module laissé inchangé dans T166.
- .harness-state/tickets/T166/relecture-2.md : `tv/luna.py:1` : hors périmètre (repris du rapport 1)

  **Ce qui ne va pas.** Plus rien n'importe `tv/luna.py`, et plus aucun test ne le couvre. Ses seuls consommateurs étaient le superviseur et `tests/test_tv_ambient.py`, retirés tous les deux. Le ticket n'en parle pas, et `docs/travail/fiches/tv-et-python.md` prévoit que `capture.py` l'utilise.

  **Ce qui est attendu.** Garder ce point en réserve. T181, ou un cadrage à part, choisira : brancher la capture dessus avec un test, ou supprimer le module. L'implémenteur a bien inscrit cette réserve dans le champ `reste` de `verdict.json`, et `tv/luna.py` n'a pas changé : `git diff --exit-code` sur ce chemin rend 0, d'après `correction-1-scope.log`.
