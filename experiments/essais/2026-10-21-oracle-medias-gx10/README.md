# Matériaux de l'oracle v2 — transcriptions complètes et images de référence

## Question

Constituer, indépendamment de TVLens, une référence médias pour établir automatiquement l'oracle v2 des
trente questions : transcription de qualité supérieure à celle des campagnes, et images régulières des
six vidéos.

## Configuration

| Élément | Valeur |
| --- | --- |
| Machine | GX10 `gx10-e9a5`, session `tmux -L tvlens-claude`, 21 octobre 2026, 10:14–10:56 UTC |
| Médias | `/srv/tvlens-gx10/videos/`, SHA-256 dans [`media.sha256`](media.sha256), conformes au manifeste du corpus |
| Transcription | whisper.cpp `whisper-cli`, `ggml-large-v3-turbo` (SHA `1fc70f77…`, voir `started.txt`), **CPU seul** (`-ng`, 16 fils, `nice 10`), langue fixée par vidéo, sortie JSON complète (`-ojf`) |
| Images | ffmpeg 6.1.1, `fps=1/2`, 640 px de large, JPEG qualité 4 ; l'image n correspond à environ (n − 1) × 2 s |
| Charge | aucun GPU ; pas d'essai chronométré en même temps (E1 attendait la fin de ce travail) ; téléchargement de modèles Ollama en parallèle (réseau) |

Script : [`oracle_media.sh`](oracle_media.sh). Mise en forme des transcriptions :
[`preparer_oracle.py`](preparer_oracle.py).

## Résultats

| Vidéo | Durée audio | Temps ASR CPU | Segments | Images |
| --- | ---: | ---: | ---: | ---: |
| Kennedy | 7:00 | 183,1 s | 53 | 210 |
| CNRS | 14:40 | 431,1 s | 190 | 440 |
| Bœuf | 12:17 | 345,6 s | 131 | 369 |
| Tears of Steel | 12:14 | 359,7 s | 261 | 367 |
| Artemis | 35:00 | 1 168,5 s | 1 090 | 1 050 |
| Spring | 7:44 | — (sans dialogue) | — | 232 |

Les transcriptions horodatées lisibles sont dans [`transcriptions/`](transcriptions/). Elles sont tirées
de médias sous licence CC BY ou du domaine public : CNRS, Learn With A Champion, Blender Foundation,
NASA, et le discours de Kennedy. Les 2 683 fichiers de sortie (JSON complets et images) sont listés avec
leur SHA-256 dans [`sha256-sorties.txt`](sha256-sorties.txt). Ils restent hors Git, dans
`/Users/Dabi/Documents/TVLens-GX10/essais/oracle-medias-20261021T101402Z/` (copie vérifiée fichier par
fichier) et sur la GX10 (`/home/nvidia/tvlens-setup/oracle-medias-20261021T101402Z/`).

## Lecture

Le CPU de la GX10 transcrit `large-v3-turbo` à environ 2,0–2,4 fois le temps réel avec 16 fils. C'est
assez pour une référence hors ligne, et c'est un indice pour l'hypothèse « ASR sur CPU » qui libérerait
le GPU. Ce dernier point reste à mesurer en flux avec le modèle `base` et ses 8 fils.

## Limites et incidents

- Transcription automatique : elle sert de référence de travail pour l'oracle, recoupée avec les
  images, le SRT officiel de Tears et la frise NASA. Ce n'est pas une vérité terrain humaine.
- L'image toutes les 2 s peut manquer un événement plus bref.
- Aucun incident d'exécution.
