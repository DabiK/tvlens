# Essai du 19/10/2026 — image de contrôle du noir sur la vraie TV

Sonde de 17:16 à 17:25, en lecture seule, pendant la relecture de T301 : la TV rend-elle l'image de contrôle que le
détecteur de noir de T301 attend, et en combien de temps le processeur de la TV la juge-t-il ? Aucune action sur
l'écran ni sur la lecture ; les fichiers pris sont supprimés de `/tmp` après lecture. Une exécution par mesure.

## Question

T301 juge le noir sur une prise `executeOneShot` `DISPLAY` en PNG 160×90, décodée en Python pur sur la TV. La relecture
de T301 (constat 4) a relevé que ce format n'avait jamais été vérifié : s'il est refusé, chaque image de chaque
application part en `captureFailed`, YouTube compris.

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| TV | LG 75QNED87T, webOS, Python 3.10 ; YouTube en lecture plein écran (`displayOutput` 3840×2160) ; charge moyenne de la TV vers 30 |
| Appels | `luna-send -t 1 -w 3000`, comme `tv/luna.py` ; `com.webos.service.capture/executeOneShot`, méthode `DISPLAY` |
| Détecteur | `tv/blackness.py` de l'arbre de travail de T301 (non intégré), tailles de contrôle changées dans la sonde |
| Scripts | `scripts/tailles.py`, `scripts/formats.py`, `scripts/bmp.py`, `scripts/decodage.py.md` ; sorties dans `brut/` |

## Résultats

| Prise | Réponse | Durée de la prise | Rendu |
| --- | --- | --- | --- |
| PNG 160×90, 160×96, 192×108 | refusée, `ERROR_INTERNAL` | 250 à 270 ms | aucun fichier |
| PNG 256×144 | acceptée | 240 à 270 ms | PNG RVB 8 bits, non entrelacé, 40 Ko |
| PNG 320×180, 640×360, 960×540 | acceptée | 290, 365, 484 ms | PNG RVB 8 bits |
| PNG 1280×720 (image envoyée) | acceptée | 617 ms | 505 Ko |
| BMP 256×144 | acceptée | 240 à 270 ms | 110 646 octets : en-tête 54, 24 bits, hauteur négative, lignes de 768 octets |
| `RGB` 256×144 | acceptée | 256 ms | 110 592 octets bruts, sans en-tête |
| `JPEG`, `RAW`, `YUV`, `NV12` 256×144 | acceptées | 250 à 270 ms | JPEG d'environ 5 Ko dans tous les cas |

| Jugement du noir sur la TV | Durée |
| --- | --- |
| Décodage PNG en Python pur (`png_data` puis `decode_rows`), 256×144 | 486 ms (`is_black` complet : 448 ms) |
| Idem, 320×180 | 797 ms (825 ms) |
| BMP 256×144, `max()` sur les tranches d'octets du rectangle vidéo | 8 à 10 ms (trois prises) |

## Lecture

- **Le contrôle de T301 ne marche pas sur la vraie TV** : 160×90 est refusé. Tous les tests de T301 passaient, avec un
  faux `luna-send` qui accepte toute taille.
- **La plus petite prise acceptée est 256×144** (entre 192 et 256 de large).
- **Le décodage PNG en Python pur est trop lent pour la cadence** : avec la prise de contrôle, la prise de l'image et les
  appels d'état, une image gardée approcherait les 2 s d'écart entre deux prises.
- **Un BMP se juge en moins de 10 ms**, sans décodage : c'est le choix retenu pour T306.

## Limites et incidents

- Une seule scène YouTube, non noire : la sonde ne vérifie pas le jugement sur une vraie scène noire ni sur Netflix.
  Le contrôle réel T302 le fera.
- Durées mesurées avec YouTube en lecture et une charge de la TV vers 30 : elles varient avec la charge.
- Deux premiers essais ratés sans effet sur la TV : `date +%s%N` absent du shell de la TV, puis une lecture de réponse
  Luna différente de celle de `tv/luna.py`.
