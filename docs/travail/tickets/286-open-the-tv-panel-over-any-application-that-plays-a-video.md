---
id: T286
titre: Open the TV panel over any application that plays a video
statut: a-faire
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
