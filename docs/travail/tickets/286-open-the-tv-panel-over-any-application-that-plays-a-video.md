---
id: T286
titre: Open the TV panel over any application that plays a video
statut: termine
bloque_par: T285
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le bouton de la télécommande ouvre le panneau TVLens sur la vidéo de n'importe quelle application au premier plan, et
plus seulement sur YouTube. Sur l'accueil ou sans vidéo, le message ne nomme plus YouTube.

## Sources

- Décision du propriétaire, le 19/10 : « faire sauter cette limitation de que YouTube et le rendre dispo peu importe
  l'app ».
- Sonde du 19/10 à 00:15, lecteur de fichiers LG (`com.webos.app.mediadiscovery`) : vidéo `MAIN` connectée,
  `displayOutput {x: 0, y: 40, width: 3840, height: 2080}`, source 1920×1040 ; `setDisplayWindow` accepté, rapport
  gardé, lecture continue derrière la sidebar.
- Contrôle T275 du 18/10, sur l'accueil : `videooutput/getStatus` déclare deux vidéos `MAIN` connectées, l'aperçu de
  l'accueil (`com.webos.app.home`, 1600×900 en (300, 46)) et la TV en direct (`com.webos.app.livetv`, rectangle 0×0) ;
  `applicationManager/getForegroundAppInfo` renvoie `com.webos.app.home`.
- Code à `c2a35b0`, `prototypes/lg-remote/runtime/panel.py` :
  - `:20` `PLAYBACK_MESSAGE` nomme YouTube ;
  - `:68-72` `video()` prend la première vidéo `MAIN`, y compris dans la boucle de surveillance (`:174`) ;
  - `:111-113` `rectangles` refuse toute application autre que `youtube.leanback.v4`.
- Tests : `prototypes/lg-remote/test_panel.py`, `Rectangles.test_refuses_foreign_or_cropped_source` (`:86`),
  `PanelLifecycle.test_refused_opening_names_the_cause_once_and_leaves_video_intact` (`:192`).
- Non vérifié : les applications protégées (Netflix, Prime). Le panneau s'y ouvrira ; la réduction de leur vidéo et la
  poursuite de la lecture derrière la sidebar seront observées par T289 ou une sonde ultérieure.

## Périmètre

- À modifier : `prototypes/lg-remote/runtime/panel.py`, `prototypes/lg-remote/test_panel.py`, la section
  « TV-local action » de `prototypes/lg-remote/README.md`, et `docs/lg-installation.md` s'il décrit la limite YouTube.
- À l'ouverture, la vidéo retenue est la vidéo `MAIN` connectée de l'application au premier plan
  (`getForegroundAppInfo`), quelle qu'elle soit, sauf le lanceur de l'accueil `com.webos.app.home`. Pas
  d'application au premier plan, l'accueil, ou aucune vidéo `MAIN` connectée de cette application : refus
  `TVLENS_PANEL_PLAYBACK_REQUIRED`, avec le message « TVLens : lance une vidéo pour ouvrir le panneau. ».
- Après l'ouverture, la sidebar est au premier plan : la surveillance suit la vidéo du contexte sauvegardé, pas
  l'application au premier plan.
- Les autres gardes (`reported_source`, `logical_output`), la cible et la restauration ne changent pas.
- À ne pas toucher : l'attente de la sidebar (T285), `layout_target` (T288), `tv/capture.py` (T287),
  `tvlens_mapper.py`, `vendor/`.
- Aucun essai réel dans la session : ni `luna-send`, ni la TV. Le contrôle réel est T289.

## Critères d'acceptation

1. Lecteur LG au premier plan, avec les valeurs relevées : ouverture, cible au rapport 1920×1040 dans la zone `chat`,
   restauration du rectangle logique `{x: 0, y: 20, width: 1920, height: 1040}`.
2. Accueil au premier plan avec les deux vidéos relevées : aucun `setDisplayWindow`, aucun lancement, un seul
   `createToast` « TVLens : lance une vidéo pour ouvrir le panneau. ».
3. YouTube au premier plan : rectangles et cycle de vie identiques à aujourd'hui.
4. Sidebar au premier plan après l'ouverture : la surveillance ne ferme pas le panneau tant que la vidéo du contexte
   sauvegardé garde sa géométrie ; un changement de contexte le ferme comme aujourd'hui.
5. `python3 prototypes/lg-remote/test_panel.py`, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

`prototypes/lg-remote/test_panel.py` : `Screen` répond aussi à `getForegroundAppInfo` ; cycle complet de `main()` sur
le lecteur LG, puis refus sur l'accueil.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : les tickets TV T285 à T288 passent avant T283, « de façon prioritaire ».
- 19/10, Codex : exploration consignée dans `.harness-state/tickets/T286/exploration.md`, aucun écart prévu.
  Sélection initiale par application au premier plan, puis surveillance/restauration par contexte sauvegardé ; essais simulés uniquement.
- 19/10, Codex : test d’acceptation LG écrit avant correction. Commande
  `python3 prototypes/lg-remote/test_panel.py PanelLifecycle.test_lg_player_selects_its_connected_main_video_and_restores_with_sidebar_in_foreground` :
  rouge observé sur l’absence de lancement, puis vert après sélection de la vidéo connectée et suivi du contexte.
  Sorties dans `lg-player-red.log` et `lg-player-green.log` du dossier d’état.
- 19/10, Codex : commande
  `python3 prototypes/lg-remote/test_panel.py PanelLifecycle.test_home_with_preview_and_live_tv_refuses_opening_without_changing_video PanelLifecycle.test_missing_foreground_application_refuses_even_with_a_connected_video` :
  rouge observé sur le texte affiché, corrigé avec le message générique. Sortie rouge dans `playback-red.log`.
- 19/10, Codex : `python3 prototypes/lg-remote/test_panel.py` : 33 tests réussis, dont les transitions de contexte,
  déconnexion, disparition et géométrie, et les applications sans liste autorisée. Documentation du panneau actualisée.
  Sortie dans `panel-final.log` ; avertissement de ressource sur le scénario de verrou concurrent à examiner séparément.
- 19/10, Codex : `node scripts/check.mjs --changed` : vert (`check-changed.log`) ; `git diff --check` : code 0.
  L’avertissement de fichier de verrou non fermé est reproduit sur les deux fichiers extraits de `HEAD`, avec
  `python3 <dossier-temporaire>/test_panel.py PanelLifecycle.test_panel_owner_lock_prevents_a_second_launch` :
  1 test réussi, même avertissement (`baseline-lock-warning.log`). Réserve préexistante, hors périmètre.
- 19/10, Codex : `node scripts/check.mjs` : vert, 2 901 tests JavaScript (153 fichiers) et 47 tests Python réussis
  (`check-full.log`). `git diff --check` final : code 0. Aucun essai réel ni déploiement ; contrôle matériel réservé à T289.
  Verdict `TERMINÉ` dans `.harness-state/tickets/T286/verdict.json` ; aucune modification du harnais, aucun commit ni push.
- 19/10, Codex, reprise après relecture 1 : les trois constats dans le périmètre sont acceptés. Le filtre `connected`
  après ouverture sera retiré, avec test dédié avant correction ; sélection initiale et recherche par contexte seront
  séparées et l’identifiant de l’accueil nommé. Plan et absence de contestation consignés dans le dossier d’état.
- 19/10, Codex, correction :
  `python3 prototypes/lg-remote/test_panel.py PanelLifecycle.test_disconnected_saved_video_keeps_panel_open_and_restores_unchanged_geometry` :
  rouge observé sur `1 != 3` tours de surveillance, puis vert après retrait du filtre `connected` pour le contexte
  sauvegardé. Journaux `correction-1-disconnected-red.log` et `correction-1-disconnected-green.log`.
  Le test remplace l’ancien sous-cas erroné ; les refus d’ouverture sur déconnexion restent couverts.
- 19/10, Codex, correction : sélection initiale et recherche par contexte séparées en `foreground_video()` et
  `saved_video(context)` ; constante `HOME_APP` partagée par les deux gardes d’accueil.
  `python3 prototypes/lg-remote/test_panel.py` : 34 tests réussis (`correction-1-panel.log`).
  `node scripts/check.mjs --changed` : vert (`correction-1-check-changed.log`) ; `git diff --check` : code 0.
- 19/10, Codex, fin de correction : `node scripts/check.mjs` : vert, 2 901 tests JavaScript dans 153 fichiers et
  47 tests Python réussis (`correction-1-check-full.log`). `git diff --check` final : code 0.
  Les constats 1 à 3 sont corrigés sans contestation ; nouveau verdict `TERMINÉ` dans le dossier d’état.
  Les constats hors périmètre restent transmis par la boucle depuis la relecture. Aucun essai TV, commit ou push.

### Réserves à la clôture

- .harness-state/tickets/T286/relecture-2.md : 1. `prototypes/lg-remote/README.md:92` — hors périmètre (repris de la relecture 1)

  - **Le problème.** « Offset crops, mismatched aspect ratios, invalid dimensions, foreign apps … remain rejected » est faux depuis ce ticket pour « foreign apps ».
  - **Pourquoi hors périmètre.** La phrase est dans la section historique « Adaptive YouTube resolution », alors que le ticket n'autorise que la section « TV-local action ». La correction ne la touche pas.
  - **Attendu.** Une réserve, puis une note datée dans un ticket de documentation.
- .harness-state/tickets/T286/relecture-2.md : 2. `prototypes/lg-remote/runtime/panel.py:186` — hors périmètre (repris de la relecture 1)

  - **Le problème.** `except BlockingIOError:return` laisse le fichier de verrou ouvert. On voit le `ResourceWarning` dans `correction-1-panel.log`, sur `test_panel_owner_lock_prevents_a_second_launch`.
  - **Pourquoi hors périmètre.** Le problème existait avant ce ticket : il est reproduit sur `HEAD` dans `baseline-lock-warning.log`. Le ticket ne couvre pas le verrou, et la correction ne touche pas cette ligne.
  - **Attendu.** Une réserve.
