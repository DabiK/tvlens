# Essai du 18/10/2026 — une vraie vidéo convertie en blocs TV, rejouée et envoyée au serveur

Contrôle réel T273, après T262. Deux extraits des échantillons du dépôt, une exécution : premier passage réel de la
source vidéo qui doit alimenter G1 et les trente minutes de G3 sur le GX10.

## Question

Un fichier vidéo se convertit-il en blocs acceptés par `/v1/segments` et en manifeste lisible par le rejeu de
perception, avec une provenance complète, y compris pour un dernier bloc partiel et un format plus large que le 16:9 ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | `c13fd0e` (T262), `scripts/prepare-video-replay.cjs`, ffmpeg 9.0.2 (Homebrew) |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, boucle arrêtée |
| Vidéo 1 | `media/samples/kennedy-rice-7min.mp4` (discours de Rice, 1962, anglais, domaine public), 0 à 65 s |
| Vidéo 2 | `media/samples/spring.mp4` (Blender Foundation, CC BY 4.0, sans dialogue, 1280×536), 60 à 90 s |
| Paramètres | blocs de 8 s, 5 images par bloc, qualité JPEG 3, mise à l'échelle dans 1280×720 sans déformation, WAV mono 16 kHz |
| Rejeu | runner de T257, `--backend local`, Ollama 0.33.2, `gemma3:4b` |
| Serveur | headless local, session neuve, 4 blocs rattachés (identifiant, séquence, temps translatés) et envoyés au rythme réel par `envoyer-blocs.mjs` ; Whisper local et vision Codex par défaut |
| Données brutes | `preparation-*.json`, `manifeste-*.json`, `blocs-*.json`, `rejeu-local-*.json`, `envoi-serveur.json` |

## Résultats

| Étape | Kennedy | Spring |
| --- | --- | --- |
| Conversion | 65 s en 9 blocs (8 × 8 s, puis 1 s), 3 s de calcul | 30 s en 4 blocs (3 × 8 s, puis 6 s), 1 s |
| Images | 1280×720, 5 par bloc | 1280×536, format conservé |
| Empreinte de la source | identique à `media/samples/README.md` | identique |
| Validation de la préparation et du manifeste | code 0 | code 0 |
| Rejeu local `gemma3:4b` | 9 / 9, 4,0 à 5,8 s par bloc | 4 / 4, 4,6 à 4,9 s |
| Envoi au serveur | 4 / 4 acceptés (200), 3 passages prêts et 1 partiel à l'archivage | — |

Chaque cas porte la provenance `converted-video` : empreinte de la source, intervalle source, version et arguments
d'ffmpeg. Le dernier cas de Kennedy couvre 64 à 65 s.

## Lecture

- **La source vidéo fonctionne de bout en bout** : conversion rapide, contrat de `/v1/segments` respecté, manifeste
  directement rejouable. Les trente minutes de G3 se préparent en environ une minute.
- **Le 4B décrit juste** (Kennedy au pupitre, drapeau, foule ; la fille, le chien et le nid de *Spring*), mais répond
  en anglais sur 2 des 9 blocs de Kennedy : le respect de la langue est à mesurer en G2.
- **La langue de transcription compte** : réglée sur le français par défaut, Whisper déforme le discours anglais
  (« un temps de banane de 50 000 ans ») ; les résumés Codex le signalent. Un extrait anglais exige « Audio · Anglais ».

## Limites et incidents

- Des blocs convertis ne mesurent ni la capture LG, ni ses pertes, ni le rythme réel de ses prises d'images.
- Envoi de 4 blocs seulement : la tenue sur trente minutes est l'objet de T259 et T261.
- Le premier essai de conversion a été refusé (`TVLENS_VIDEO_CLI_INVALID`) : `--jpeg-quality` est obligatoire.
