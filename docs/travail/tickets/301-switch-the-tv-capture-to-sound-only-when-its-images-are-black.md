---
id: T301
titre: Switch the TV capture to sound only when its images are black
statut: a-faire
bloque_par: T299
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Sur la TV, quand la vidéo suivie rend une image noire, la capture le voit et envoie ses blocs en « son seul »
déclaré au lieu de les perdre ou d'envoyer du noir. Après deux blocs noirs d'affilée, elle ne prend plus qu'une image
de contrôle par bloc, et revient aux images dès que la vidéo n'est plus noire. Netflix entre dans la table des
applications suivies. Le panneau dit « Son seul · image noire ou protégée ».

## Sources

- Décision du propriétaire, le 19/10 : « on peut assez facilement détecter le fait qu'une image est rendue toute
  noire, et de par ça et de par la fréquence […] on bascule en analyse du son ».
- Sonde du 19/10 à 12:25 (dossier d'essai `2026-10-19-son-netflix`) : sur Netflix, `executeOneShot` rend 100 % de
  pixels noirs (deux prises) ; `arecord -D hw:0,13` enregistre un son présent, fond vers −62 dBFS et passages forts
  jusqu'à −29 dBFS.
- Choix de l'orchestrateur, le 19/10, dans la règle du propriétaire :
  - détection sur une **image de contrôle** réduite (par exemple 160×90, méthode `DISPLAY`), entièrement décodée, et
    jugée seulement dans le **rectangle vidéo** (la sidebar ouverte n'est jamais noire) ; « noir » : aucune
    composante au-dessus d'un seuil nommé (par exemple 16 sur 255) ;
  - chaque bloc décide seul : toutes ses images noires, il part en son seul déclaré ; après deux blocs noirs
    d'affilée, une seule image de contrôle par bloc ; une image de contrôle non noire rend les quatre images au bloc
    suivant ;
  - la règle vaut pour toute application suivie : une scène noire de YouTube part aussi en son seul, ce qui est
    honnête ; le libellé dit « image noire ou protégée ».
- Code à `c35cd02`, `tv/capture.py` :
  - `VERIFIED_APPLICATIONS` (`:9-12`) : Netflix absent, compté `foreignApp` ;
  - précédent « N blocs d'affilée » : `LUNA_PATIENCE` (`:7`) et `mute` (`:103`, `:167-168`) ;
  - prise d'image `executeOneShot` (`:137`), méthode (`:47-48`), contrôle de géométrie (`:146-149`), image gardée
    (`:150-157`), refus d'un bloc sans image (`:169`, `noFrames` `:174`), bloc envoyé (`:180`), rapport (`:51-52`) ;
  - piège : le minuteur d'inactivité n'est remis à zéro que par une image gardée (`:102`, `:109`, `:151`) ; en son
    seul, la capture s'arrêterait en `idle` après 600 s ; `tv/controller.py:18-22`.
- Décodage sans dépendance : Python 3.10 sur la TV, `zlib` et `struct` suffisent ; un 160×90 se décode entièrement
  en Python pur en quelques dizaines de millisecondes (Paeth à 1,7 s pour un 1280×720 mesuré sur le Mac).
- `tv/app/sessions-view.js` : `DROP_LABELS` (`:223-240`), `describeCapture` (`:247-349`), `playback()` (`:46-50`).
- Tests : `tests/tv_fakes/luna-send` (le PNG simulé est un pixel bleu : il faut pouvoir écrire un PNG noir),
  `tests/test_tv_capture.py` (`assert_block_media` `:142-157`, `:273` ; clés exactes du rapport `:257-260` ;
  `:301` ; `:529` et `:550` prennent `'netflix'` comme application non vérifiée : changer d'identifiant),
  `tests/fixtures/tv-capture-refusals.json`, `tests/tv-panel.test.cjs:513-563`.
- Coordination : T022 (causes de perte déclarées une fois) passe après ce ticket et suit ses causes.

## Périmètre

- À modifier : `tv/capture.py` (le détecteur peut vivre dans un module voisin, par exemple `tv/blackness.py`),
  `tv/controller.py` (commentaire), `tv/app/sessions-view.js`, `tests/tv_fakes/luna-send`, `tests/test_tv_capture.py`,
  `tests/fixtures/tv-capture-refusals.json`, `tests/tv-panel.test.cjs`, `docs/lg-capture-control.md`.
- Bloc son seul : sans images, avec la déclaration du fil de T299, compté à part dans le rapport (`soundOnly`), pas
  dans `dropped`. Le minuteur d'inactivité compte aussi un bloc son seul envoyé.
- Table : `netflix` → « Netflix ».
- Panneau : « Son seul · image noire ou protégée » tant que la capture est en son seul.
- À ne pas toucher : le serveur, `core/`, `prototypes/lg-remote/`.
- Contrôle réel par l'orchestrateur après intégration : T302.

## Critères d'acceptation

1. Faux `luna-send` qui rend une image noire : les blocs partent en son seul déclaré, sans image, `soundOnly` compte ;
   après deux blocs, une seule image de contrôle par bloc ; une image de contrôle non noire rend quatre images au bloc
   suivant. Le test échoue avant la correction.
2. Sidebar ouverte (rectangle vidéo réduit) : seule la zone vidéo est jugée.
3. Netflix suivi ; une autre application non vérifiée reste `foreignApp`.
4. En son seul, la capture ne s'arrête pas en `idle` tant que des blocs partent.
5. Le libellé du panneau s'affiche en son seul.
6. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/test_tv_capture.py` : une capture qui passe du noir aux images et revient, par le faux `luna-send`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : le chantier « son seul » (T297 à T302) passe en tête de file, après T225.
