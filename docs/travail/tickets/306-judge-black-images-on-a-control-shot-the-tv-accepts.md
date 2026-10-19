---
id: T306
titre: Judge black images on a control shot the TV accepts
statut: a-faire
bloque_par: T301
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La capture TV juge le noir sur une image de contrôle que la vraie TV rend : un BMP 256×144, lu par tranches d'octets.
Avec l'image de contrôle actuelle (PNG 160×90), la vraie TV refuse chaque prise : toutes les images de toutes les
applications partiraient en `captureFailed`, YouTube compris.

## Sources

- Constat 4 de la relecture de T301 (`.harness-state/tickets/T301/relecture-1.md`) : le format de l'image de contrôle
  n'avait jamais été vérifié sur la TV.
- Sonde de l'orchestrateur sur la vraie TV, le 19/10 vers 17:20, en lecture seule (YouTube en lecture, charge moyenne
  de la TV vers 30) ; dossier d'essai `2026-10-19-controle-noir-tv` :
  - `executeOneShot` `DISPLAY` en PNG : 160×90, 160×96 et 192×108 refusés (`returnValue: false`, `ERROR_INTERNAL`) ;
    256×144 et au-delà acceptés, PNG RVB 8 bits non entrelacé ; prise de 240 à 270 ms en 256×144, 617 ms en 1280×720 ;
  - décodage PNG en Python pur de `tv/blackness.py` sur le processeur de la TV : 450 à 490 ms en 256×144, 800 ms en
    320×180 ; avec les deux prises et les appels d'état, une image gardée approche les 2 s d'écart entre deux prises ;
  - format `BMP` en 256×144 : accepté, 110 646 octets, en-tête de 54 octets, 24 bits, hauteur négative (lignes de haut
    en bas), lignes de 768 octets sans bourrage ; contrôle par `max()` sur les tranches du rectangle vidéo : 8 à 10 ms.
- Code à intégrer par T301 (relire les lignes après son intégration) : `tv/blackness.py` (`CONTROL_WIDTH`,
  `CONTROL_HEIGHT`, `png_data`, `decode_rows`, `video_bounds`, `is_black`), `tv/capture.py` (prise de l'image de
  contrôle `control.png`, appel `is_black`), `tests/tv_fakes/luna-send` (images de contrôle simulées),
  `tests/test_tv_capture.py` (transitions noir et images, sidebar ouverte).

## Périmètre

- À modifier : `tv/blackness.py`, `tv/capture.py`, `tests/tv_fakes/luna-send`, `tests/test_tv_capture.py`,
  `docs/lg-capture-control.md`.
- Image de contrôle : `format: 'BMP'`, 256×144, méthode `DISPLAY` ; le détecteur lit l'en-tête (taille, 24 bits, sens
  des lignes, décalage des pixels, bourrage des lignes) et refuse tout autre BMP par `ValueError`, comme aujourd'hui
  pour un PNG invalide ; les pixels de bord restent exclus et le seuil nommé reste 16.
- Le décodeur PNG du détecteur disparaît s'il ne sert plus.
- L'image envoyée reste un PNG 1280×720.
- À ne pas toucher : le serveur, `core/`, la cadence de la capture (deux blocs noirs, une image de contrôle par bloc).

## Critères d'acceptation

1. Le faux `luna-send` refuse une prise de contrôle plus petite que 256×144, comme la vraie TV, et rend un BMP 24 bits
   de haut en bas pour `format: 'BMP'`. Les tests de transition et de sidebar de `tests/test_tv_capture.py` passent avec
   ce contrôle. Le test du refus échoue avant la correction.
2. Un BMP de bas en haut (hauteur positive) est lu dans le bon sens ; un BMP d'une autre taille ou profondeur est refusé.
3. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/test_tv_capture.py` : une capture dont le contrôle simulé suit les tailles et le format de la vraie TV.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : ticket ouvert après la sonde du contrôle sur la vraie TV, avant le contrôle réel T302.
