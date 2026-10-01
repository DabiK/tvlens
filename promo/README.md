# TVLens — film promotionnel

Version principale : **teaser de 34 secondes centré sur la vérification pendant un débat** (`TVLens-Teaser`). La présentation V1 de 64 secondes reste disponible (`TVLens`).

Film français de **64 secondes**, 1920 × 1080, 30 images/s. Direction sobre : bleu nuit, blanc cassé, menthe, typographie Manrope, captures Mac et aperçus LG. Aucun visuel de lentille ni asset généré n’est utilisé dans le montage final.

Ce projet Remotion est indépendant du runtime TVLens : ses dépendances et son verrou npm restent dans ce dossier.

## Prévisualiser et exporter

```sh
cd promo
npm ci
npm run dev
# Ouvrir la composition TVLens dans le Studio.
npm run lint
npm run review
npm run render
```

Export : `out/tvlens-promo-1080p.mp4`. Les sorties et médias régénérables sont ignorés par Git. Les scripts recopient les captures du dépôt et synthétisent la musique avant le lancement et le rendu. Aucun appel à un fournisseur d’inférence n’est nécessaire.

## Découpage

| Temps | Séquence | Intention |
| --- | --- | --- |
| 00–06 s | La vidéo continue. Le contexte reste. | Promesse |
| 06–12 s | Une question sur les deux dernières minutes | Usage temporel |
| 12–22 s | Conversation sur Mac | Réponses ancrées dans les passages |
| 22–30 s | Mode flottant | Discrétion pendant le visionnage |
| 30–40 s | Chat puis frise LG | Expérience sur le téléviseur |
| 40–48 s | Passage → recherche → sources | Esprit critique |
| 48–58 s | Ambition ASUS Ascent GX10 | Distinguer POC actuel et objectif local |
| 58–64 s | TVLens et lien GitHub | Signature |

Chaque scène possède son fichier et sa composition éditable dans le Studio. Les animations sont déterministes et pilotées par les frames. Les coupes sont calées sur les temps de la musique à 120 BPM.

## Provenance et honnêteté de présentation

- Captures Mac : [protocole réel et crédits Spring](../screenshots/current/README.md). Les textes des réponses et les délais affichés ne sont pas remplacés. Zooms, recadrages et composition de captures sont des effets de montage, pas un enregistrement live continu.
- Aperçus LG fournis par le propriétaire : [provenance et anonymisation](../screenshots/lg/README.md). Ils sont montrés comme des vues du companion, sans reconstituer une fausse interaction ni une fausse latence.
- La séquence « sources » illustre le parcours de vérification ; elle ne fabrique ni article ni résultat d’enquête.
- Le GX10 est explicitement une **étape à valider**. Le POC actuel utilise Codex distant et Whisper sur l’hôte de calcul.
- Musique instrumentale originale synthétisée par `scripts/score.mjs`, sans sample ni morceau tiers. Pas de voix off dans cette version ; le message est porté par les titres.
- Police Manrope : Google Fonts, licence SIL OFL incluse dans `public/fonts/OFL.txt`.
- *Spring* (2019), Andy Goralczyk, © Blender Foundation, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [source](https://cloud.blender.org/spring). Les captures sont redimensionnées et recadrées dans le montage.
- Les programmes et marques visibles dans les aperçus LG appartiennent à leurs ayants droit respectifs.

## Contrôles

`npm run lint` vérifie ESLint et TypeScript. `npm run review` rend dix images clés pour inspection. Vérifier aussi les raccords et les dimensions/durée/pistes audio du MP4 final ; le contrôle des images fixes ne valide pas à lui seul le rythme ou le ressenti musical.

### Validation du 30 septembre 2026

- Version verrouillée sur Remotion **4.0.530**. Le premier lancement en 4.0.531 échouait avec `getRenderQueue is not a function` : son archive npm contenait `dist/render-queue/queue.js` vide. Le retour à 4.0.530 évite ce défaut sans patcher les dépendances.
- Dix images clés inspectées ; cadrages Mac et TV corrigés après la première passe. Les erreurs de syntaxe de construction ont été corrigées avant livraison.
- Studio vérifié dans Chrome : composition TVLens chargée, aucune erreur JavaScript.
- Score stéréo : 64 secondes, niveau moyen mesuré −18,8 dBFS, crête −3,1 dBFS avant le gain du montage. Ces mesures ne remplacent pas une validation artistique à l’écoute.
- `npm run validate` contrôle H.264 8 bits 4:2:0 (yuv420p ou son équivalent pleine plage yuvj420p), 1080p, 30 fps, 1 920 images, 64 secondes, AAC stéréo et décodage intégral sans erreur. Le rapport technique est écrit dans `out/validation.json`.
- Montage réalisé avec des captures fixes animées, sans voix off ni nouvelle démonstration live. Le jugement final sur le rythme et la musique reste à faire au visionnage.

## V2 — Vérifier pendant le débat

Le message principal est « Regarde le débat. Vérifie ce qui se dit. ». La mémoire sert à retrouver l’affirmation exacte ; les films constituent un usage secondaire. Le montage présente un parcours, sans inventer d’article, de verdict ou de délai de recherche.

- 0–2 s : problème immédiatement lisible (« Un débat. Un chiffre. Tu veux vérifier. »), avec l’app visible dès la frame 0.
- 2–6 s : solution explicite (« TVLens regarde et écoute avec toi. Et cherche les sources pour vérifier. »).
- 6–12 s : recherche de preuves, retour au passage et esprit critique.
- 12–16 s : le débat continue pendant la vérification ; passage, recherche et sources.
- 16–22 s : captures Mac, companion LG et frise.
- 22–24 s : usage secondaire pour les films, extrait animé de Spring.
- 24–30 s : une seule séquence ASUS : garder l’image et le son chez soi, répondre plus vite, explorer d’autres architectures. Ce sont des objectifs à valider.
- 30–34 s : signature et dépôt GitHub.

Treize plans, titres animés, recadrages mobiles et musique originale à 120 BPM. Les captures produit restent inchangées ; les titres sont éditoriaux, pas des réponses générées pour une fausse démonstration. Les aperçus LG ne constituent pas un enregistrement continu d’un débat vérifié.

```sh
npm run assets:teaser
npm run lint
npm run render:teaser
npm run validate:teaser
```

Le script d’assets requiert FFmpeg et `../media/samples/spring.mp4` pour extraire 12 secondes du film (25–37 s). Les médias générés restent hors Git. Sur ce Mac, on peut passer `--browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` à la commande de rendu pour éviter le téléchargement d’un autre navigateur.

Export : `out/tvlens-teaser-34s.mp4`. Validation technique : `out/validation-v2.json`. L’export contrôle 1 020 images, 34 secondes, H.264, AAC stéréo et le décodage intégral. Le ressenti musical reste à valider au visionnage.

La section GX10 décrit des objectifs expérimentaux. Aucun benchmark GX10 ni résultat local n’est présenté comme acquis. La recherche web reste une fonction connectée ; le local concerne le traitement audiovisuel et sa mémoire.

### Contraintes rencontrées pour la V2

Deux exports complets ont échoué avec `ENOSPC` sur le Mac presque plein, y compris après réduction de la qualité JPEG intermédiaire. Le rendu a donc été découpé en segments de 60 images (JPEG 85, H.264 CRF 18, concurrence 1, Chrome installé). L’assemblage conserve la vidéo sans réencodage et ajoute la musique continue, pour éviter des coupures audio entre segments. Ces échecs sont liés au stockage temporaire, pas aux tests TypeScript/ESLint, qui passent.

L’ouverture a été raccourcie en problème → solution explicite : le texte et l’app sont visibles dès la frame 0, puis quatre secondes expliquent la perception image/son et la recherche de sources. Les nouveaux exports ont aussi rencontré des fichiers de bundle tronqués et des échecs d’encodage faute de place. Le mode facultatif `TVLENS_PROMO_LOW_DISK=1` désactive les source maps du bundle de rendu ; le dernier export de l’ouverture utilise des segments muets de 30 images, puis réintègre la musique continue à l’assemblage.
