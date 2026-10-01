# Film de présentation TVLens

[Voir le film sur YouTube](https://youtu.be/jOrcdLZsqT8) · 58 secondes · 1920 × 1080 · 30 images/s.

Projet Remotion indépendant de `../promo/`. Les interfaces sont reconstituées en React ; les captures de l’application servent uniquement de références visuelles. La partie ASUS GX10 présente une expérimentation future.

```sh
cd film
npm ci
npm run check
npm run dev
```

## Médias locaux

Les WAV générés, l’extrait de débat et les exports MP4 ne sont pas versionnés. Le MP3 de narration complet est dans `public/audio/imports/`. Pour recréer les pistes avec Python 3, FFmpeg et la voix macOS Thomas disponible :

```sh
python3 scripts/audio.py
python3 scripts/prepare-audio.py
```

Le premier script produit les effets et une voix guide séparée ; le second découpe la narration Yann approuvée, compose le fond musical et active la narration finale. Son contrôle SHA-256 empêche de réutiliser les timings avec une autre prise.

Placer l’extrait source dans `public/debate.mp4` : plage 4050–4180 secondes du débat référencé dans `production-notes.json`, à 30 images/s. Les horodatages du montage sont relatifs à cet extrait. Ce média doit être fourni séparément.

```sh
npm run render
```

Sortie : `out/tvlens-context.mp4`. La provenance du débat, les sources Insee et les choix de narration sont documentés dans `production-notes.json`. Les clés API et caches restent exclus de Git.
