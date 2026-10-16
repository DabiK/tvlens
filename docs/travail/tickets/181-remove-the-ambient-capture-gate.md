---
id: T181
titre: Remove the ambient capture gate
statut: termine
bloque_par: T166
adr: non
installe: non
harnais: non
supprime_tests: oui
niveau: sensible
---

## Ce que le ticket livre

Après décision écrite du propriétaire et retrait du superviseur, la capture TV ne consulte plus de
gate ambient et ne produit plus ses métadonnées d’occultation. Elle conserve images selon la géométrie
vidéo, son, transport, limites et refus explicites, avec leurs preuves génériques.

## Sources

- `docs/audit-points-chauds.md`, section D « Coupes », ambient panneau fermé.
  Décision du propriétaire, le 15/10 : retirer le gate après superviseur/relais/routes, avant la page.
- Repères vérifiés à `e92c6a6`, avant les suppressions T165/T166 :
  - `tv/capture.py:7` importe le gate depuis ambient ; `tv/capture.py:37` définit `safe_crop`,
    `tv/capture.py:52` `frame_decision` et `tv/capture.py:73` `settle_block` ;
  - `tv/capture.py:115` prépare le chemin du gate ; `tv/capture.py:184` et `tv/capture.py:186`
    le lisent autour des clichés ; le rapport et les blocs portent les métadonnées d’occultation ;
  - `tv/ambient.py:120` définit les chemins et `tv/ambient.py:169` la lecture du gate ; T166
    conserve seulement les primitives nécessaires à la capture et à ses tests, à supprimer ici ;
  - `tests/test_tv_capture_gate.py:21` importe ambient ; les cas génériques commencent à
    `tests/test_tv_capture_gate.py:235` (sans fichier de gate), `:256` (stockage plein),
    `:266` (lecture seule), `:274` (arrêt au démarrage), `:294` (idle), `:306` (géométrie)
    et `:341` (durée). Les aides `Server` et `CaptureRun` sont à `:156` et `:182` ;
  - `tests/tv_fakes/luna-send:57` simule aussi les changements de gate pendant un cliché ;
    ses autres réponses et le faux `arecord` servent les tests génériques ;
  - `tv/app/sessions-view.js:337` affiche encore les compteurs retirés et
    `tests/tv-panel.test.cjs:517` en vérifie un libellé : T182 possède leur nettoyage.
- Appliquer et citer l’ADR de retrait livré par T165, qui prévoit cette étape et le maintien de
  `/v1/surveillance/overlay`. `adr: non` : aucun nouvel ADR ni nouvelle décision d’architecture ici.

## Périmètre

- Retirer de `tv/capture.py` import et lecture du gate, états/epochs, recadrage d’occultation et
  métadonnées dédiées : `gate`, `gatePath`, `gateStale`, `framesCropped`, `framesWithheld`,
  `withheldReasons`, `overlay` de bloc/frame et causes uniquement liées aux cartes.
- Supprimer le reliquat `tv/ambient.py` conservé par T166. Conserver les coordonnées `frames[].crop`
  de géométrie vidéo, `framesMoved`, audio, timestamps, file d’envoi et transport, verrou, bornes,
  arrêt et changement de session. Une modification du rectangle pendant un cliché coûte seulement
  cette image ; un changement de contexte vidéo garde le refus de bloc actuel.
- `supprime_tests: oui`, après décision : avant de supprimer `tests/test_tv_capture_gate.py`,
  transférer ses aides et preuves génériques dans `tests/test_tv_capture.py` (à créer). Conserver
  leurs titres, attentes et assertions sur les comportements maintenus ; retirer seulement les
  assertions sur les champs du gate abandonnés. Inventorier chaque cas supprimé ou transféré.
- Adapter les seuls crochets de gate de `tests/tv_fakes/luna-send`, sans retirer ses capacités
  génériques ni changer les assertions de transport, saturation, arrêt ou géométrie.
- Laisser présentations TV et documents à T182 ; les vues tolèrent déjà l’absence des champs.
  Ne pas modifier le contrat serveur d’ingestion ou celui de `/v1/surveillance/overlay`.
- Les suppressions de cas sont exclusivement Python : aucun cas JavaScript `test(` n’est supprimé,
  donc n = 0. Le plancher `cas_de_test` ne bouge pas et le harnais reste fermé ; aucune modification
  de `scripts/quality/baseline.json`, aucun test de remplissage, aucune installation ou opération TV/VPS.

## Critères d'acceptation

1. `tv/ambient.py` et `tests/test_tv_capture_gate.py` sont absents. Une recherche `rg -n` de
   `AmbientPaths|read_gate|frame_decision|safe_crop|gatePath|gateStale|framesCropped|framesWithheld|withheldReasons`
   dans `tv/capture.py`, `tests/test_tv_capture.py` et `tests/tv_fakes/` ne trouve aucun lecteur ou
   producteur actif du gate. Classer les éventuels tests d’absence ; les présentations attendent T182.
2. Le vrai programme de capture, avec `tests/tv_fakes/` et un récepteur local, transmet images,
   son, timestamps et transport comme avant sans lire de fichier de gate. Un ancien fichier de gate
   fermé placé dans l’arbre temporaire n’a aucun effet sur les images ou le rapport.
3. Les cas transférés gardent stockage plein, lecture seule, arrêt pendant le démarrage, idle,
   durée bornée et rectangle changeant pendant un cliché avec `framesMoved`. Les causes des pertes
   et limites restent explicites ; le changement de contexte vidéo refuse toujours le bloc.
4. Le journal relie chaque cas générique à son nouvel emplacement et chaque retrait à la capacité
   abandonnée. Aucun cas JavaScript n’est retiré : n = 0. Le journal consigne les mesures initiales
   M et P et le comptage final, égal à M. Le plancher P ne bouge pas ;
   `git diff --exit-code -- scripts/quality/baseline.json` rend 0, sortie consignée au journal.
5. Les tests de capture, transport et contrôle sont lancés en séquentiel, puis
   `node scripts/check.mjs` est vert. Pas de scénario au rythme réel, smoke natif, TV ou fournisseur.

## Test d'acceptation attendu

`tests/test_tv_capture.py` conduit le vrai `capture.py` dans un processus isolé avec faux Luna/arecord
et récepteur local. Ses preuves génériques proviennent du fichier mixte supprimé ; un cas de gate
résiduel prouve l’absence de consultation sans comparer le texte du programme.

## Hypothèses bloquantes

Décision du propriétaire, le 15/10 (« Oui », en réponse à la question posée) : oui. Supprimer définitivement l’affichage ambient panneau fermé, son superviseur, son relais et ses outils dédiés, tout en conservant la surveillance et les cartes du panneau ouvert.

La décision doit être inscrite dans cette section, même si T165 et T166 ont été tranchés. Les
suppressions sont Python : n = 0 et le plancher JavaScript ne bouge pas. T182 achève page et documents ;
les tests simulés ne prouvent pas les propriétés matérielles d’une TV installée.

## Journal

### Exploration

- ADR appliqué : [0017, étape 3](../../adr/0017-retrait-de-l-affichage-ambient-panneau-ferme.md).
  Capture, transport, contrôleur, faux et tests lus ; exploration détaillée dans `.harness-state/tickets/T181/exploration.md`.
- État initial : statut du ticket déjà en cours ; dossiers non suivis `design/continuous-context/` et `experiments/` préexistants.
- Mesure initiale : `node --input-type=module -e 'import {measure} from "./scripts/quality/metrics.mjs"; import fs from "node:fs"; console.log(JSON.stringify({M:measure(process.cwd()).cas_de_test,P:JSON.parse(fs.readFileSync("scripts/quality/baseline.json")).cas_de_test}))'`
  → `{"M":1242,"P":1242}`. Suppressions JavaScript prévues : **n = 0** ; plancher inchangé.
- Aucun écart prévu ; détails consignés dans `.harness-state/tickets/T181/ecarts.md` avant implémentation.

### Tests d’abord et retrait

- Rouge observé : `python3 -B tests/test_tv_capture.py CaptureRun.test_an_old_closed_gate_is_never_opened_and_does_not_change_media_or_report -v`
  → 1 test, échec d’assertion `0 != 4` sur les blocs reçus avec l’ancien gate fermé.
  Sortie conservée : `.harness-state/tickets/T181/capture-red.log`.
- Vert observé après retrait : `python3 -B tests/test_tv_capture.py -v`
  → **9 tests, OK** (10,303 s), sortie `.harness-state/tickets/T181/capture-green.log`.
- `capture.py` ne lit plus le gate et n’émet plus de métadonnées d’occultation. `crop` vidéo,
  `framesMoved`, audio, timestamps, transport, verrou, bornes et fins explicites restent.
  Suppression de `tv/ambient.py` et du fichier mixte seulement après transfert et vert des preuves génériques.
- Le nouveau cas résiduel transmet quatre blocs, 16 PNG et quatre WAV, contrôle timestamps/séquences,
  forme exacte du rapport et des blocs, fichier inchangé et zéro ouverture observée par audit Python.
  C’est une preuve comportementale d’absence, sans comparaison du texte de production.
- Aides `Server` et `CaptureRun` transférées ; événement explicite de démarrage à la place de la boucle d’attente.
  Le seul crochet retiré du faux Luna est l’écriture du gate par `oneshot.json` ; réponses, journal, fenêtres et PNG restent.
- Inventaire : **20 cas Python initiaux = 8 transférés + 12 retirés**, puis **1 nouveau = 9 finaux**.
  Les assertions des sept cas génériques `CaptureRun` sont conservées, hors champs de gate abandonnés
  (comparaison AST consignée dans `.harness-state/tickets/T181/assertions-transfer.log`).
  Le cas pur de bloc sans carte passe à la frontière publique ; sa forme de média est vérifiée dans `assert_block_media`.

| Cas initial dans `tests/test_tv_capture_gate.py` | Destination | Preuve maintenue ou capacité abandonnée |
| --- | --- | --- |
| `Crop.test_four_boxes_keep_the_announced_share_of_a_full_screen_frame` | Retiré | Recadrage des quatre cartes/pastilles fermées. |
| `Crop.test_crop_never_intersects_the_card_whatever_the_geometry` | Retiré | Non-intersection avec les cartes et occultation géométrique aléatoire. |
| `Crop.test_too_little_left_or_unknown_rectangle_keeps_nothing` | Retiré | Seuil de taille après occultation et rectangle de carte inconnu. |
| `Decision.test_table_of_gate_readings` | Retiré | Décisions selon états/epochs, cycles, cartes et gate illisible. |
| `Decision.test_gate_file_states_are_read_as_the_table_expects` | Retiré | Validation et lecture des enregistrements du gate. |
| `Decision.test_a_gate_closed_for_31_seconds_still_crops_and_says_it_is_stale` | Retiré | Péremption sans réouverture du gate. |
| `Blocks.test_block_without_a_card_is_exactly_the_block_of_before` | `tests/test_tv_capture.py:149` (même titre) | Preuve de forme des quatre images sans carte transférée au vrai processus ; atMs bornés et ordonnés, PNG exact et WAV vérifiés. |
| `Blocks.test_one_cut_frame_cuts_its_neighbours_to_the_same_size_and_each_is_declared` | Retiré | Propagation du recadrage de carte au bloc et métadonnées overlay. |
| `Blocks.test_withheld_frames_do_not_void_the_block_and_are_counted_with_their_cause` | Retiré | Pertes dues au gate et compteurs dédiés. |
| `Blocks.test_mixed_video_rectangles_never_leave_two_sizes_in_one_block` | Retiré | Uniformisation des tailles après occultation ; géométrie vidéo conservée par le cas du panneau. |
| `CaptureRun.test_card_shown_during_a_block_is_cropped_out_declared_and_the_sound_still_leaves` | Retiré | Arrivée/départ de carte pendant les clichés et compteurs dédiés ; audio/durée couverts par le nouveau cas résiduel. |
| `CaptureRun.test_same_scenario_at_the_real_pace_of_the_tv` | Retiré | Même scénario dédié au gate, au rythme réel, non exécuté. |
| `CaptureRun.test_without_a_gate_file_the_capture_sends_what_it_sent_before` | `tests/test_tv_capture.py:188` (même titre) | Seule l’assertion sur framesCropped/framesWithheld/gateStale est retirée ; forme, crops et absence de fichier conservées. |
| `CaptureRun.test_a_block_whose_frames_are_all_withheld_is_dropped_with_its_cause` | Retiré | Bloc totalement occulté, overlayVisible et péremption du gate. |
| `CaptureRun.test_full_storage_ends_the_capture_cleanly_and_is_never_called_a_network_cut` | `tests/test_tv_capture.py:200` (même titre) | Attentes et assertions conservées. |
| `CaptureRun.test_archive_open_read_only_refuses_the_start_in_plain_words` | `tests/test_tv_capture.py:212` (même titre) | Attentes et assertions conservées. |
| `CaptureRun.test_stop_asked_while_the_session_start_is_still_pending_ends_with_its_cause_like_any_other` | `tests/test_tv_capture.py:222` (même titre) | Attentes et assertions conservées. |
| `CaptureRun.test_no_youtube_playback_stops_the_capture_as_idle_and_counts_every_block` | `tests/test_tv_capture.py:250` (même titre) | Attentes et assertions conservées. |
| `CaptureRun.test_a_panel_opened_during_one_shot_costs_that_frame_not_the_whole_block` | `tests/test_tv_capture.py:267` (même titre) | Attentes et assertions conservées. |
| `CaptureRun.test_duration_bounds` | `tests/test_tv_capture.py:314` (même titre) | Attentes et assertions conservées. |

### Contrôles finaux et remise à la boucle

- Après capture, `python3 -B -m unittest discover -s tests -p test_tv_control.py -v`
  → **13 tests de contrôle et transport, OK** (7,115 s), sortie `.harness-state/tickets/T181/control-transport.log`.
  Suites exécutées en séquentiel.
- `rg -n 'AmbientPaths|read_gate|frame_decision|safe_crop|gatePath|gateStale|framesCropped|framesWithheld|withheldReasons' tv/capture.py tests/test_tv_capture.py tests/tv_fakes/`
  → code **1**, sortie vide : aucun résultat, lecteur, producteur ou symbole de gate dans ces fichiers.
  Le test résiduel est une preuve comportementale d’absence ; il vérifie le schéma complet du rapport sans ces noms.
  `tv/ambient.py` et `tests/test_tv_capture_gate.py` sont absents.
- `node scripts/check.mjs --changed` → **vert**, code 0 ; sortie `.harness-state/tickets/T181/check-changed.log`.
  Aucun fichier de test JS modifié ; les suites Python ont été lancées explicitement puis par le contrôle complet.
- `node scripts/check.mjs` → **vert**, code 0 : règles, format, lint, gel et cliquet verts ;
  **114 fichiers JavaScript, 1430 tests passés, 0 échec ; 22 tests Python, OK** (17,854 s).
  Sortie `.harness-state/tickets/T181/check-full.log`.
- Mesure finale par `measure(process.cwd()).cas_de_test` et lecture du plancher :
  **M final = 1242 = M initial ; P = 1242 inchangé ; n = 0**. Sortie `.harness-state/tickets/T181/count-final.json`.
- `git diff --exit-code -- scripts/quality/baseline.json` → **code 0, sortie vide**,
  conservée dans `.harness-state/tickets/T181/absence-baseline.log`.
- `git diff --exit-code -- 'tests/*.cjs' tv/app server runtime scripts/quality/baseline.json`
  → code 0, sortie vide : aucun cas JS retiré, aucun changement des présentations ou des contrats serveur.
- `git diff --check` → code 0, sortie vide. Aucun scénario au rythme réel, smoke natif, fournisseur,
  accès TV/VPS, installation, commit ou push. Présentations et documentation de retrait laissées à T182.
- Verdict **TERMINÉ** écrit dans `.harness-state/tickets/T181/verdict.json` ; relecture et intégration confiées à la boucle.

### Reprise après relecture 1 — exploration

- `.harness-state/tickets/T181/relecture-1.md`, ticket, journal, écarts, consignes, `git status --short`
  et `git diff` relus ; témoin de hooks présent. Travail initial repris dans l’arbre.
- Deux mineurs acceptés : restaurer les commentaires génériques de géométrie/démarrage et retirer
  l’affectation inutilisée de `report`. Aucun cas ni assertion ne change.
- Tests existants exécutés avant correction puis après : pas de rouge fonctionnel à fabriquer pour
  des commentaires et une variable inutilisée. Justification consignée dans `ecarts.md` avant modification.
- Réserve hors périmètre : la fixture de gate dans `tests/test_tv_control.py:168-186` reste à traiter
  dans un ticket ultérieur ; elle sera inscrite dans `reste` du nouveau verdict.

### Reprise après relecture 1 — corrections

- Avant modification : `python3 -B tests/test_tv_capture.py CaptureRun.test_a_panel_opened_during_one_shot_costs_that_frame_not_the_whole_block CaptureRun.test_stop_asked_while_the_session_start_is_still_pending_ends_with_its_cause_like_any_other CaptureRun.test_without_a_gate_file_the_capture_sends_what_it_sent_before -v`
  → **3 tests, OK** (5,248 s), sortie `.harness-state/tickets/T181/correction-1-before.log`.
- Constat 1 corrigé : docstring de l’incident (2 blocs sur 10 en 85 s, puis 3 sur 5), jeux de lectures avant/après
  avec répétition finale, ouverture pendant la deuxième prise, rectangle propre à chaque image,
  bloc sans image et refus sur changement de contexte rétablis. Commentaires de `Server.hold`, arrêt pendant
  le démarrage, option VIDEO à valider sur TV et cause des pertes par déplacement rétablis sans mention du gate.
- Constat 2 corrigé : appel de `run_capture(server)` sans affectation dans le test sans fichier de gate.
  Aucune assertion retirée ni modifiée ; titres et nombre de cas conservés. Références de lignes de l’inventaire actualisées.
- Après modification : `python3 -B tests/test_tv_capture.py -v`
  → **9 tests, OK** (10,728 s), sortie `.harness-state/tickets/T181/correction-1-capture.log`.
- Constat 3 : réserve hors périmètre conservée pour un ticket ultérieur ; `tests/test_tv_control.py` inchangé.

### Reprise après relecture 1 — contrôles et verdict

- Après capture, `python3 -B -m unittest discover -s tests -p test_tv_control.py -v`
  → **13 tests, OK** (7,126 s), sortie `.harness-state/tickets/T181/correction-1-control-transport.log`.
- Puis `node scripts/check.mjs --changed` → **vert**, code 0,
  sortie `.harness-state/tickets/T181/correction-1-check-changed.log`.
- Puis `node scripts/check.mjs` → **vert**, code 0 : règles, format, lint, gel et cliquet verts ;
  **114 fichiers JS, 1430 tests passés, 0 échec ; 22 tests Python, OK** (17,360 s).
  Sortie `.harness-state/tickets/T181/correction-1-check-full.log`. Exécutions séquentielles.
- Recherche ciblée des neuf symboles du gate, avec la même commande `rg -n` que précédemment : code 1, sortie vide.
  `git diff --exit-code -- scripts/quality/baseline.json` et `git diff --exit-code -- tests/test_tv_control.py`
  → code 0, sortie vide ; `git diff --check` → code 0, sortie vide.
  Sorties conservées dans `.harness-state/tickets/T181/correction-1-static.log`.
- Même commande de mesure que lors de l’exploration → `{"M":1242,"P":1242}` : M final = M initial,
  P inchangé, n = 0. Neuf cas capture et treize cas contrôle/transport conservés.
- Constats mineurs 1 et 2 corrigés, aucune contestation. Le constat 3 est inscrit comme réserve hors périmètre
  dans `reste` : fixture de gate résiduelle du test du contrôleur, à traiter dans un ticket ultérieur.
- Nouveau verdict **TERMINÉ** dans `.harness-state/tickets/T181/verdict.json`.
  Aucun commit, push, changement du harnais, scénario au rythme réel ni accès TV/VPS/fournisseur.
  Relecture de correction et intégration laissées à la boucle.

### Réserves à la clôture

- Réserve hors périmètre (relecture 1, constat 3) : tests/test_tv_control.py:168-186 conserve une fixture tvlens-ambient-gate.json et vérifie que le contrôleur ne la modifie pas. À traiter dans un ticket ultérieur ; ce fichier reste inchangé.
- .harness-state/tickets/T181/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
