---
id: T268
titre: Open the TV panel on any YouTube video layout and say when it cannot
statut: a-faire
bloque_par: T274
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Sur la TV, le bouton Rakuten ouvre le panneau quelle que soit la disposition de la vidéo YouTube : 16:9 plein écran,
vidéo d'un autre format avec bandes noires, ou fenêtre plus petite. La vidéo est réduite depuis son rectangle actuel,
puis rendue exactement à ce rectangle à la fermeture. Quand le panneau ne peut vraiment pas s'ouvrir, le spectateur voit
un court message en français à l'écran, au lieu de rien.

## Sources

- Recette T233 du 18/10 sur la LG 75QNED87T : après une question, YouTube est passé à une vidéo de 1668×1080.
  `com.webos.service.videooutput/getStatus` rendait `displayOutput {x: 252, y: 0, width: 3336, height: 2160}` et
  `fullScreen: false`. Chaque appui sur Rakuten finissait par `ValueError: Requires tested full-screen 4K layout`
  dans `/tmp/tvlens-panel.log`, sans aucun retour visible.
- Décision du propriétaire, le 18/10 : « il faut un message et l'ouvrir peu importe la résolution ».
- Code à `97fb54c`, `prototypes/lg-remote/runtime/panel.py` :
  - `:74-85` `rectangles` : la garde `:77-78` exige `displayOutput == {x: 0, y: 0, width: 3840, height: 2160}` ; le
    rectangle de restauration `:80-83` est toujours le plein écran logique 1920×1080 ;
  - `:14-20` `layout_target` garde déjà le rapport de la source pour n'importe quel format, centré dans la zone
    `chat` (1440×1080) ou `timeline` (1920×720) ;
  - `:22-23` `physical_rect` : coordonnées logiques ×2, la convention d'un écran 4K ;
  - `:55-72` `reported_source` refuse une source rognée ou dont le rapport diffère de l'image décodée ;
  - `:91-98` `restore_original` ne restaure que si le contexte vidéo n'a pas changé ;
  - `:100-144` `main` : la boucle ferme le panneau sur un changement de contexte ou de géométrie (`:122-125`).
- `prototypes/lg-remote/README.md`, section « TV-local action » : « accepts the tested YouTube/full-screen/4K geometry
  only ».
- Tests : `prototypes/lg-remote/test_panel.py` (`Rectangles`, `PanelLifecycle` avec l'écran simulé `Screen`).
  Aucun test n'affirme aujourd'hui qu'un rectangle valide hors plein écran est refusé.
- Écart d'installation constaté le 18/10 : la TV exécute une version antérieure de `panel.py` (empreinte différente,
  avec `ambient_yield`, retirée du dépôt par T166). Le déploiement après ce ticket remplace tout
  `/media/developer/tvlens-remote/runtime` depuis un tag.

## Périmètre

- À modifier : `prototypes/lg-remote/runtime/panel.py`, `prototypes/lg-remote/test_panel.py`,
  `prototypes/lg-remote/README.md` (section « TV-local action ») et `docs/lg-installation.md` s'il décrit cette
  limite.
- Accepter toute vidéo YouTube `MAIN` connectée dont `displayOutput` est un rectangle d'entiers positifs contenu dans
  l'écran 3840×2160. Le rectangle de restauration est le rectangle courant, en coordonnées logiques (physiques ÷ 2,
  la convention de `physical_rect`), avec son indicateur `fullScreen`. La cible reste celle de `layout_target`, qui
  garde le rapport de la source.
- Garder les refus existants : autre application, lecture absente, source rognée ou incohérente (`reported_source`),
  rectangle hors de l'écran, nul ou mal formé. Chaque refus laisse la vidéo intacte, ne lance pas l'application et
  affiche une seule notification système (`com.webos.notification/createToast`) en français. Elle nomme la cause en
  une phrase, par exemple « TVLens : lance une vidéo YouTube pour ouvrir le panneau. ». La raison technique reste
  écrite dans le journal du panneau.
- L'échec de la notification est avalé : rien ne doit empêcher le gestionnaire de touches de continuer.
- La boucle de surveillance, la fermeture sur changement de média et le verrou ne changent pas.
- À ne pas toucher : `tvlens_mapper.py`, le mapper fourni par l'amont (`vendor/`), la page `tv/app/`, le contrôleur et
  la capture du compagnon. Pas de nouveau format de fichier d'état.
- Aucun essai réel dans la session : ni `luna-send`, ni la TV ; les tests passent par l'écran simulé.
- Hors boucle, par l'orchestrateur, après intégration :
  1. déployer `prototypes/lg-remote/runtime` depuis un tag vers `/media/developer/tvlens-remote/runtime`, avec
     sauvegarde ;
  2. ouvrir puis fermer le panneau sur une vidéo 16:9 et sur une vidéo d'un autre format, et vérifier que la vidéo
     retrouve son rectangle précédent ;
  3. appuyer hors de YouTube et vérifier que le message s'affiche.

## Critères d'acceptation

1. `rectangles` accepte une vidéo avec bandes noires : `displayOutput {x: 252, y: 0, width: 3336, height: 2160}`,
   source 1668×1080, `fullScreen: false`. Le rectangle de restauration vaut `{x: 126, y: 0, width: 1668, height: 1080}`,
   avec `fullScreen: false`, et la cible garde le rapport de la source dans la zone `chat`. La vidéo 16:9 plein écran
   donne exactement les mêmes rectangles qu'avant : les tests existants passent sans modification.
2. Un format plus large que 16:9 (bandes en haut et en bas) et une fenêtre plus petite centrée sont acceptés, avec la
   restauration au rectangle courant.
3. Par l'écran simulé de `PanelLifecycle`, ouvrir sur la disposition à bandes noires puis fermer : la géométrie publiée
   est la cible, et le dernier `setDisplayWindow` rend le rectangle à bandes noires sauvegardé.
4. Autre application, lecture coupée, source rognée et rectangle hors de l'écran : `main()` se termine sans
   `setDisplayWindow`, sans lancement de l'application, avec un seul `createToast` dont le message nomme la cause.
   Une notification qui échoue ne lève rien.
5. `python3 prototypes/lg-remote/test_panel.py`, `python3 -m py_compile prototypes/lg-remote/runtime/panel.py`, puis
   `node scripts/check.mjs`.

## Test d'acceptation attendu

`prototypes/lg-remote/test_panel.py` : la disposition relevée en recette, à travers `rectangles` puis le cycle de vie
complet de `main()` sur l'écran simulé, jusqu'à la restauration.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 18/10, propriétaire : un contrôle réel sur le Mac suit chaque ticket critique (T269 à T275). Ce ticket attend
  aussi T274.
