---
id: T166
titre: Remove the ambient supervisor, its relay and their routes
statut: a-faire
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

Décision attendue du propriétaire : Supprimer définitivement l’affichage ambient panneau fermé, son superviseur, son relais et ses outils dédiés, tout en conservant la surveillance et les cartes du panneau ouvert ?

La décision doit figurer au début de cette section, même si T165 a été tranché. Elle ne couvre que
les cas des capacités supprimées ; les preuves génériques sont conservées. Les suppressions sont
Python : n = 0 et le plancher JavaScript ne bouge pas.
T181 puis T182 achèvent la suppression sous la même décision à inscrire dans chacune de leurs fiches.
Les tests hors ligne n’établissent ni l’état installé ni les propriétés matérielles de focus/capture.

## Journal
