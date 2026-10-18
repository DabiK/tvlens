---
id: T285
titre: Keep the TV panel open while the sidebar takes time to appear
statut: termine
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
- 19/10, Codex : exploration terminée (consignes, code, appelant, tests et ADR 0017/0039) ;
  cause confirmée : l'absence initiale de fenêtre est interprétée comme une fermeture après une seconde.
  Exploration et absence d'écart consignées dans `.harness-state/tickets/T285/` ; début des tests simulés.
- 19/10, Codex : `python3 prototypes/lg-remote/test_panel.py PanelLifecycle.test_delayed_sidebar_stays_open_until_the_viewer_closes_it`
  rouge observé sur l'absence de panneau actif ; après attente initiale bornée, `python3 prototypes/lg-remote/test_panel.py`
  vert (23 tests). Apparition à 2,5 s simulées, maintien puis fermeture par le spectateur couverts.
- 19/10, Codex : `python3 prototypes/lg-remote/test_panel.py PanelLifecycle.test_missing_sidebar_is_closed_after_timeout_with_one_notification_and_restore`
  rouge observé (aucune fermeture applicationManager), puis `python3 prototypes/lg-remote/test_panel.py` vert (24 tests)
  après fermeture protégée et notification à 8 s. Sorties conservées dans le dossier d'état.
  Les deux suites signalent aussi un ResourceWarning du test préexistant de verrou (fichier ouvert par le second appel).
- 19/10, Codex : couverture complémentaire verte dès son ajout : arrêt à 2 s simulées, borne 8 s,
  refus et exception de fermeture et de notification. `python3 prototypes/lg-remote/test_panel.py` : 27 tests verts,
  tests préexistants inchangés ; même ResourceWarning du verrou, hors périmètre explicite.
  Section « TV-local action » actualisée. `node scripts/check.mjs --changed` : vert.
- 19/10, Codex : `node scripts/check.mjs` : vert (règles, format, lint, gel, cliquet,
  153 fichiers JS / 2 901 tests réussis, 47 tests Python réussis). Les 27 tests du panneau ont été exécutés
  séparément. Vérification AST : les 12 méthodes préexistantes de `PanelLifecycle` sont inchangées,
  cinq tests ajoutés. `git diff --check` : vert. Aucun essai réel, aucun commit ni push.
  Verdict `TERMINÉ` et preuves déposés dans `.harness-state/tickets/T285/` pour relecture par la boucle.
- 19/10, Codex, reprise de relecture 1 : rapport, ticket/journal, écarts, témoin renouvelé et diff relus.
  Les deux mineurs sont acceptés : injection locale de l'horloge et nom d'action pour la fermeture à expiration.
  Aucun écart ni contestation. Le scénario préexistant de fermeture au premier sondage emprunte désormais
  l'expiration ; la fermeture après apparition reste couverte par le nouveau test de sidebar retardée.
  Ce scénario reste inchangé conformément au critère 3 ; les réserves hors périmètre du rapport restent à la boucle.
- 19/10, Codex, correction des mineurs 1 et 2 :
  `python3 prototypes/lg-remote/test_panel.py PanelLifecycle.test_sidebar_timeout_uses_an_isolated_clock` rouge observé
  sur l'identité de l'horloge standard remplacée ; ajout de `clock=time.monotonic`, injection de `panel.clock`
  dans `Screen`, puis `python3 prototypes/lg-remote/test_panel.py` : 28 tests verts, délai de 8 s conservé.
  Renommage de l'action en `abandon_unshown_sidebar`, couvert par les scénarios publics d'expiration existants.
  `node scripts/check.mjs --changed` : vert. Même ResourceWarning préexistant du verrou, sans modification de cette zone.
  Sorties dans `clock-isolation-red.log`, `panel-correction-1.log` et `check-changed-correction-1.log` du dossier d'état.
- 19/10, Codex, fin de correction : `node scripts/check.mjs` : vert, 153 fichiers JS / 2 901 tests réussis,
  47 tests Python réussis, règles/format/lint/gel/cliquet verts (`check-full-correction-1.log`).
  Vérification AST contre HEAD : 12 méthodes préexistantes inchangées, six tests ajoutés au total.
  `git diff --check` : vert. Les deux mineurs sont corrigés ; nouveau verdict `TERMINÉ` pour la boucle.
  Aucun essai réel, aucun commit ni push.

### Réserves à la clôture

- ResourceWarning non bloquant dans le test préexistant du verrou : le second appel quitte main après BlockingIOError sans fermeture explicite du fichier. Le verrou est explicitement exclu du périmètre ; comportement laissé inchangé.
- .harness-state/tickets/T285/relecture-2.md : 1. `prototypes/lg-remote/test_panel.py:409-414` — hors périmètre (repris de la relecture 1)
  - **Problème :** `test_panel_closed_by_the_viewer_is_not_relaunched` (`vanish={1:[]}`) n'arrive plus jamais à voir la fenêtre.
    - Il passe maintenant par l'expiration à 8 s, puis la fermeture par `applicationManager` et la notification.
    - Ses deux assertions restent vraies par hasard.
    - Le vrai cas « le spectateur ferme le panneau » est couvert par `test_delayed_sidebar_stays_open_until_the_viewer_closes_it`.
  - **Attendu :** un ticket ultérieur rend à ce test son sens (fenêtre vue, puis disparue) ou le renomme. Le critère 3 interdit de le toucher ici.
- .harness-state/tickets/T285/relecture-2.md : 2. `prototypes/lg-remote/runtime/panel.py:201-204` avec `restore_original` (`:140-147`) — hors périmètre (repris de la relecture 1)
  - **Problème :** si le signal d'arrêt arrive pendant l'attente, le contrôleur rend la vidéo sans appeler `applicationManager/closeByAppId`. Il n'appelle que `surfacemanager/closeByAppId`. Une sidebar lente peut donc encore s'afficher ensuite au-dessus de la vidéo.
    - Ce n'est pas une régression : l'ancien code sortait de toute façon après 1 s.
    - Le ticket interdit de toucher à la restauration.
  - **Attendu :** le contrôle réel T289 doit regarder ce cas.
