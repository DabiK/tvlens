---
id: T285
titre: Keep the TV panel open while the sidebar takes time to appear
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Sur la TV, le panneau reste ouvert même quand la sidebar met quelques secondes à s'afficher. S'il ne s'affiche
vraiment pas, le contrôleur referme la sidebar qu'il a lancée, rend la vidéo et le dit en une phrase, au lieu de laisser
une sidebar orpheline au-dessus d'une vidéo en plein écran.

## Sources

- Sonde du 19/10 à 00:16 sur la LG 75QNED87T, vidéo du lecteur de fichiers LG (`com.webos.app.mediadiscovery`),
  relevés toutes les 0,5 s : `setDisplayWindow` est appliqué (2880×1560 en (0, 300)), puis la fenêtre
  `org.tvlens.sidebarprobe` n'apparaît dans `surfacemanager/getForegroundWindowInfo` qu'environ 2,5 s après le
  lancement. Le contrôleur s'était déjà arrêté et avait rendu le plein écran ; la sidebar restait ouverte, sans
  contrôleur (`applicationManager/running` la listait encore). Journal du panneau : seulement
  `restore {"returnValue": true}`. Sur YouTube (contrôle T275 du 18/10), la fenêtre apparaît en moins d'une seconde.
- Code à `c2a35b0`, `prototypes/lg-remote/runtime/panel.py` :
  - `:168` lancement de la sidebar, `:172` `pause(1)` ;
  - `:176-179` la boucle s'arrête dès que `APP` manque des fenêtres au premier plan : c'est aussi ainsi qu'elle voit
    le spectateur fermer le panneau ;
  - `:190-195` le `finally` restaure la vidéo sans fermer l'application lancée.
- Tests : `prototypes/lg-remote/test_panel.py`, écran simulé `Screen` (`:109`, fenêtres au premier plan `:168`),
  `PanelLifecycle` (`:175`), dont `test_panel_closed_by_the_viewer_is_not_relaunched` (`:298`).

## Périmètre

- À modifier : `prototypes/lg-remote/runtime/panel.py`, `prototypes/lg-remote/test_panel.py`, la section
  « TV-local action » de `prototypes/lg-remote/README.md`.
- Après le lancement, attendre que la fenêtre de la sidebar figure parmi les fenêtres au premier plan, au plus un délai
  borné et nommé (8 s), avant de surveiller sa disparition. Le signal d'arrêt reste pris en compte pendant l'attente.
- Si la fenêtre n'apparaît pas dans le délai : fermer l'application lancée
  (`com.webos.applicationManager/closeByAppId`), restaurer le rectangle sauvegardé, écrire un code stable au journal
  (`TVLENS_PANEL_SIDEBAR_TIMEOUT`) et afficher une seule notification en français, par exemple « TVLens : le panneau
  n'a pas pu s'afficher. ». Un échec de fermeture ou de notification est journalisé, jamais levé.
- Une fois la fenêtre vue, sa disparition garde son sens actuel : le spectateur a fermé le panneau, la vidéo est
  restaurée et l'application n'est pas relancée.
- À ne pas toucher : la garde d'application (T286), `layout_target` (T288), le verrou, la récupération `restore`,
  `tvlens_mapper.py`, `vendor/`, `tv/`.
- Aucun essai réel dans la session : ni `luna-send`, ni la TV. Le contrôle réel est T289, par l'orchestrateur.

## Critères d'acceptation

1. Écran simulé dont la fenêtre de la sidebar apparaît 2,5 s simulées après le lancement : le panneau reste ouvert, la
   géométrie publiée est la cible ; quand la fenêtre disparaît ensuite, la vidéo est restaurée comme aujourd'hui.
2. Écran simulé dont la fenêtre n'apparaît jamais : après le délai, un seul `closeByAppId` de la sidebar, le dernier
   `setDisplayWindow` rend le rectangle sauvegardé, un seul `createToast` nomme la cause et le code figure au journal ;
   aucun second lancement.
3. Les tests existants de `PanelLifecycle` passent sans modification.
4. `python3 prototypes/lg-remote/test_panel.py`, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

`prototypes/lg-remote/test_panel.py`, `PanelLifecycle` : un `Screen` dont la fenêtre de la sidebar apparaît en retard,
le temps passant par `pause` simulé, puis un `Screen` dont elle n'apparaît jamais.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : les tickets TV T285 à T288 passent avant T283, « de façon prioritaire » ; leur contrôle réel
  T289 ne bloque rien.
