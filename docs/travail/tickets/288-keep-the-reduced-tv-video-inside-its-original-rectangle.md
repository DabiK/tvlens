---
id: T288
titre: Keep the reduced TV video inside its original rectangle
statut: a-faire
bloque_par: T286
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Quand le panneau s'ouvre sur une vidéo à bandes noires, la vidéo réduite reste dans son rectangle d'origine : les bandes
que l'application dessine autour de sa vidéo ne la recouvrent plus.

## Sources

- Contrôle T275 du 19/10 à 00:03, YouTube, vidéo 4:3 (source 320×240, `displayOutput {x: 480, y: 0, width: 2880,
  height: 2160}`) : à l'ouverture, la vidéo passe en `{x: 0, y: 0, width: 2880, height: 2160}`. La capture d'écran
  montre une bande noire sur x < 480 qui masque le sixième gauche de la vidéo réduite. La page de la sidebar est
  transparente hors de sa colonne de droite (`tv/app/style.css:12` et `:15`) : la bande est dessinée par YouTube hors
  de son rectangle vidéo. Observé une fois.
- Code à `c2a35b0`, `prototypes/lg-remote/runtime/panel.py:30-37`, `layout_target` : la zone est fixe,
  `(0, 0, 1440, 1080)` en `chat` et `(0, 0, 1920, 720)` en `timeline`, et la vidéo y est centrée au rapport de la source.
- Tests : `prototypes/lg-remote/test_panel.py`, `Rectangles.test_valid_output_layouts_restore_the_current_rectangle`
  (`:15-44`), `Rectangles.test_bottom_layout_preserves_video_above_lower_third` (`:79-85`),
  `PanelLifecycle.test_letterboxed_video_opens_publishes_geometry_and_restores_saved_output` (`:256-273`).

## Périmètre

- À modifier : `prototypes/lg-remote/runtime/panel.py`, `prototypes/lg-remote/test_panel.py`, la section
  « TV-local action » de `prototypes/lg-remote/README.md`.
- La zone de `layout_target` devient l'intersection de la zone du mode et du rectangle sauvegardé ; la vidéo y garde le
  rapport de la source, aussi grande que possible et centrée. Si l'intersection est vide, la zone du mode seule reste la
  règle, comme aujourd'hui. Les coordonnées suivent la convention existante (demi-pixels logiques admis).
- Les attendus de géométrie des cas où le rectangle sauvegardé déborde de la zone (bandes latérales, petite fenêtre,
  coordonnées impaires, cycle à bandes noires) changent par ce ticket ; les autres assertions de ces tests restent.
- À ne pas toucher : les gardes, la restauration, la surveillance, l'attente de la sidebar (T285), `tv/`.
- Aucun essai réel dans la session. Le contrôle réel est T289.

## Critères d'acceptation

1. Plein écran 16:9 : cibles `chat` et `timeline` inchangées.
2. 4:3 relevé, rectangle logique sauvegardé `{x: 240, y: 0, width: 1440, height: 1080}`, source 320×240 : cible `chat`
   `{x: 240, y: 90, width: 1200, height: 900}`, cible `timeline` `{x: 480, y: 0, width: 960, height: 720}`.
3. Bandes latérales de la recette T233 (sauvegardé `{x: 126, y: 0, width: 1668, height: 1080}`, source 1668×1080) :
   la cible est contenue dans le rectangle sauvegardé et dans la zone `chat`, au rapport de la source.
4. Rectangle sauvegardé hors de la zone (intersection vide) : la cible d'aujourd'hui.
5. `python3 prototypes/lg-remote/test_panel.py`, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

`prototypes/lg-remote/test_panel.py`, `Rectangles` : le 4:3 relevé en réel dans les deux modes, et le cas de la
recette T233.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : les tickets TV T285 à T288 passent avant T283, « de façon prioritaire ».
