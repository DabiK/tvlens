---
id: T288
titre: Keep the reduced TV video inside its original rectangle
statut: termine
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
- 19/10, Codex : exploration terminée ; cause confirmée dans la zone fixe de `layout_target`.
  Périmètre conservé, aucun écart prévu ; détails dans `.harness-state/tickets/T288/exploration.md` et `ecarts.md`.
- 19/10, Codex : rouge observé avec
  `python3 prototypes/lg-remote/test_panel.py Rectangles.test_four_three_video_fits_inside_saved_output_in_both_layouts`
  (cible chat en x=0 au lieu de x=240), puis `python3 prototypes/lg-remote/test_panel.py` : 38 tests, 7 échecs
  d’assertion sur les géométries attendues. Sorties : `red-four-three.log`, `red-panel.log` dans le dossier d’état.
- 19/10, Codex : intersection appliquée uniquement dans `layout_target`, repli conservé si elle est vide.
  `python3 prototypes/lg-remote/test_panel.py` : 38 tests réussis (`green-panel.log`). Plein écran, restauration,
  gardes et attente inchangés ; un `ResourceWarning` de verrou non fermé dans le cas de double lancement reste
  hors périmètre. Documentation de « TV-local action » mise à jour ; aucun essai réel.
- 19/10, Codex : `node scripts/check.mjs --changed` : vert (`check-changed.log`).
  `node scripts/check.mjs` : vert, 153 fichiers JS, 2 903 tests JS réussis, 54 tests Python réussis
  (`check-full.log`). Verdict `TERMINÉ` déposé dans `.harness-state/tickets/T288/verdict.json` ;
  relecture et intégration laissées à la boucle, aucun commit ni push. Validation TV réservée à T289.
- 19/10, Codex, reprise : lecture de `echec-1.txt`, du journal et de la relecture acceptée.
  Le contrôle de boucle a échoué dans le test JS d’annulation sous transport retenu, hors des fichiers du ticket.
  Un diagnostic ciblé inchangé passe (1 test) ; il ne résout pas cet échec intermittent.
  La reproduction à écritures de corps différées échoue sur l’absence de perte vision : le temps simulé
  atteint 4 000 ms avant le premier envoi. L’assertion exacte de l’échec de boucle n’a pas été conservée.
  Sorties : `reprise-cancellation-diagnostic.log`, `reprise-cancellation-slow-io.log` dans le dossier d’état.
- 19/10, Codex, reprise : proposition de synchronisation préparée dans `proposition-synchronisation.patch`,
  sans modifier le test du dépôt. Elle passe le même diagnostic (1 test, `reprise-proposition-slow-io.log`).
  Écart déclaré dans `ecarts.md` et autorisation d’élargissement demandée au propriétaire.
  `python3 prototypes/lg-remote/test_panel.py` : 38 tests réussis (`reprise-panel.log`) ;
  `node scripts/check.mjs --changed` : vert (`reprise-check-changed.log`). Aucun essai réel.
- 19/10, Codex, reprise : `node scripts/check.mjs` : vert, 153 fichiers JS, 2 903 tests JS et
  54 tests Python réussis (`reprise-check-full.log`). Ce résultat n’efface pas la course reproduite.
  Le test JS du dépôt reste inchangé ; application de la proposition hors périmètre en attente
  d’une décision du propriétaire, sans réponse reçue dans la session. Verdict `BLOQUÉ` déposé ;
  aucune modification du harnais, aucun essai réel, commit ou push.
- 19/10, orchestrateur, propriétaire absent : décision sur le blocage. La synchronisation proposée de
  `tests/local-stream-replay.test.cjs` entre dans ce ticket et ferme T291 : avancer de 1 000 ms, attendre l'envoi retenu
  et la perte vision de `moment-1`, puis avancer de 500 ms ; aucune assertion retirée ni élargie. Cause : `advance`
  n'accorde que quelques tours entre deux minuteries, et l'horloge virtuelle peut dépasser l'écriture réelle du premier
  envoi ; en usage réel, l'horloge est le vrai temps.
- 19/10, orchestrateur : `node --require ./.harness-state/tickets/T288/slow-upload-diagnostic.cjs --test
  --test-name-pattern='cancellation while upload transport is held' tests/local-stream-replay.test.cjs` : rouge sans la
  synchronisation, vert avec ; `node --test tests/local-stream-replay.test.cjs` : 43 tests réussis ;
  `node scripts/check.mjs` : vert, 2 903 tests JS sur 2 903 et 54 tests Python. Relecture du correctif (agent
  relecteur) : acceptée. Le code du ticket avait été accepté à la relecture de la tentative 1. Intégré hors boucle.

### Réserves à la clôture

- Une sortie sauvegardée à coordonnées physiques impaires donne une cible à demi-pixel ; si Luna l'arrondit, la
  surveillance, qui compare à l'égalité stricte, refermerait le panneau. À observer en T289.
- Une intersection d'un pixel logique de large donne une vidéo de taille nulle ; un refus de Luna restaure alors la
  vidéo sans message. Géométrie très improbable ; la règle de repli revient au propriétaire.
- Le verrou n'est pas fermé quand le panneau est lancé en double (`ResourceWarning`, défaut antérieur, déjà relevé
  en T268).
