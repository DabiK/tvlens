---
id: T306
titre: Judge black images on a control shot the TV accepts
statut: termine
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
  `docs/lg-capture-control.md`, `docs/lg-installation.md`.
- `docs/lg-installation.md` (réserve de clôture de T301) : le tableau d'installation (`:22`) cite `blackness.py`, que
  `capture.py` importe ; les lignes `:70-72` disent les applications suivies (Netflix comprise) et le son seul quand
  l'image est noire, au lieu de « dix minutes sans image ».
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
3. `docs/lg-installation.md` liste les quatre modules Python et décrit le son seul.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/test_tv_capture.py` : une capture dont le contrôle simulé suit les tailles et le format de la vraie TV.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : ticket ouvert après la sonde du contrôle sur la vraie TV, avant le contrôle réel T302.

- 19/10, Codex : exploration consignée dans `.harness-state/tickets/T306/exploration.md` ; aucun écart prévu, arbre initial conservé.
- 19/10, Codex : `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_control_shots_smaller` :
  rouge observé (5 assertions `returnValue`), puis vert après refus des tailles trop petites par le faux (`minimum-{red,green}.log`).
- 19/10, Codex : `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_block_without_a_card` :
  rouge observé (`0 != 1` bloc envoyé), puis vert après passage du contrôle en BMP 256×144 (`capture-{red,green}.log`).
- 19/10, Codex : `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_bmp_orientation` :
  rouge observé (4 assertions de BMP valide refusé) ; `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k ControlBlackness` :
  vert, 4 tests (`bmp-{red,green}.log`). En-têtes, orientation, décalage, seuil, pixel tardif et rectangles couverts.
- 19/10, Codex : `python3 -B -m unittest discover -s tests -p test_tv_capture.py -v` : vert, 38 tests en 49,560 s,
  transitions et sidebar comprises (`capture-suite.log`). Guides mis à jour ; aucun essai matériel ni déploiement.
- 19/10, Codex : `node scripts/check.mjs --changed` : `check : vert` (`check-changed.log`). Contrôle complet lancé séparément.
- 19/10, Codex : `node scripts/check.mjs` : `check : vert`, 154 fichiers JavaScript, 3 025 tests réussis,
  70 tests Python réussis en 66,147 s (`.harness-state/tickets/T306/check-full.log`). Critères couverts par simulation ;
  validation TV après intégration laissée au contrôle réel prévu séparément. Aucun commit ni push.

- 19/10, Codex, reprise de relecture 1 : mineur 1 accepté ; correction du format des réponses scriptées du faux Luna, tests d’abord.
- 19/10, Codex, correction 1 : `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_a_scripted_png` :
  rouge observé sur l’égalité des octets (PNG écrit à la place du BMP), puis vert après condition sur `format == 'PNG'`.
  Traces : `.harness-state/tickets/T306/correction-1-format-{red,green}.log`. Aucun test existant modifié ou assoupli.
- 19/10, Codex, correction 1 : `node scripts/check.mjs --changed` : `check : vert` (`correction-1-check-changed.log`).
- 19/10, Codex, correction 1 : `node scripts/check.mjs` : `check : vert`, 154 fichiers JavaScript,
  3 025 tests réussis, 71 tests Python réussis en 65,544 s (`correction-1-check-full.log`).
  Mineur 1 corrigé ; nouveau verdict remis à la boucle, sans commit, push ni essai matériel.
