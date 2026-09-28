# Échantillons vidéo TVLens

Téléchargés directement depuis YouTube le 28 septembre 2026, pour des tests locaux reproductibles. Aucun contournement de DRM ni cookie de compte utilisé. Les deux fichiers dépassent cinq minutes pour tester la fenêtre détaillée et son expiration. Aucun appel d'inférence effectué.

## Fiction : Spring

- Fichier : `spring.mp4`
- Titre : **Spring – Blender Open Movie** (2019), Andy Goralczyk / Blender Foundation.
- Source originale : https://www.youtube.com/watch?v=WhWc3b3KhnY (Blender Studio).
- Film complet, sans dialogue : son d'ambiance et musique. Adapté au rappel de gestes, objets, personnages et changements de scène ; ne valide pas la transcription de dialogues de fiction.
- Licence : [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Attribution : **© Blender Foundation | cloud.blender.org/spring**. Réalisation : Andy Goralczyk.
- Provenance et licence documentées : https://commons.wikimedia.org/wiki/File:Spring_-_Blender_Open_Movie.webm (renvoie à la page officielle, indisponible lors de cette vérification : https://studio.blender.org/films/spring/pages/about/).
- Modifications : sélection de la version YouTube 720p maximum ; réencodage AV1 vers H.264 pour compatibilité de lecture ; audio AAC conservé. Aucun montage narratif.

## Discours : Kennedy à Rice University

- Fichier : `kennedy-rice-7min.mp4`
- Titre original : **President Kennedy's Speech at Rice University**, 12 septembre 1962.
- Source originale : https://www.youtube.com/watch?v=WZyRbnpGyzQ (NASA Video).
- Extrait demandé : de **02:00 à 09:00** de la vidéo source. Langue : **anglais**. Discours historique avec assertions, dates, ordres de grandeur et objectifs : il ne remplace pas encore un test de débat français à plusieurs locuteurs.
- Provenance / statut : domaine public aux États-Unis, documenté sur https://commons.wikimedia.org/wiki/File:President_Kennedy%27s_Speech_at_Rice_University.ogv ; la notice cite NASA et JFK Library.
- Référence historique complémentaire : https://www.nasa.gov/history/60-years-ago-president-kennedy-reaffirms-moon-landing-goal-in-rice-university-speech/
- Les assertions doivent être interprétées à la date du discours, pas comme des chiffres actuels.

## Acquisition et vérification

Outils : `yt-dlp 2026.8.19` installé dans un environnement temporaire `/tmp/tvlens-video-tools` et `ffmpeg` déjà présent sur la machine. Aucun outil n'a été ajouté aux dépendances du projet. Téléchargement limité à 720p. Les durées, codecs, tailles et SHA-256 ci-dessous sont mesurés sur les fichiers livrés, pas déduits des titres YouTube.

Kennedy : extrait réencodé en H.264 à 30 images/s et AAC 96 kbit/s, durée de sortie limitée à 420 secondes. Découpe initiale à proximité des images clés : ne pas utiliser le décalage source de 02:00 comme référence à la milliseconde.

### Fichiers livrés

- **spring.mp4** : 464.166893 s, 62,548,137 octets (62.55 MB).
  - Flux : `[{"codec_name": "h264", "width": 1280, "height": 536}, {"codec_name": "aac", "sample_rate": "44100"}]`
  - SHA-256 : `c2c678f2a70338c060b33608bc34d0a1050cd284e249814b3dac0d85eaaa443a`
- **kennedy-rice-7min.mp4** : 420.000000 s, 92,433,328 octets (92.43 MB).
  - Flux : `[{"codec_name": "h264", "width": 1280, "height": 720}, {"codec_name": "aac", "sample_rate": "44100"}]`
  - SHA-256 : `f542af18fda70d00bef6d4c167a9af4aa239a7a064fd306c6f1aa45035b2c611`

Les deux fichiers possèdent une piste vidéo et une piste audio ; décodage intégral vérifié avec FFmpeg. Aucun visionnage humain complet ni annotation de vérité terrain effectué.
