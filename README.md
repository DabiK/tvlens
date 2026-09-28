# TVLens

Compagnon de visionnage macOS : capture, mémoire temporelle, chat contextuel et
recherche web. [Architecture hexagonale](docs/architecture.md).

## Démarrer

```sh
npm install
npm run setup:speech
npm run setup:codex
npm start
```

Codex CLI doit être installé et connecté. FFmpeg et Whisper utilisent Homebrew sur
Apple Silicon. La clé `OPENROUTER_API_KEY` dans `.env.local` est facultative pour le
chat et la vision ; elle active les embeddings de recherche. Ne jamais committer
ce fichier. [Installation complète](docs/installation.md).

## Utiliser

1. Choisir une fenêtre/écran et lancer l’analyse, ou utiliser **● Analyser** dans
   le mode flottant. Capture par segments de huit secondes.
2. Poser une question : Codex reçoit les résumés récents, peut chercher un passage,
   le réexaminer ou chercher sur Internet. Les étapes et le début de réponse sont
   visibles pendant l’attente.
3. **■ Pause / ● Reprendre** conserve la mémoire, les passages et le même fil de
   discussion. Le temps de capture s’arrête pendant la pause.
4. **Nouvelle session** repart de zéro, après arrêt de la capture. Fermer l’app
   termine aussi le fil Codex en mémoire ; les archives textuelles restent sur disque.
5. **Réglages IA** choisit le modèle du chat et ceux de la perception.

## Exécution actuelle

- Chat : processus Codex App Server maintenu ouvert, un fil par session de visionnage.
- Images/résumés et réexamen : **GPT-6 Luna via Codex** par défaut.
- Paroles : **Whisper base multilingue en local**, puis texte envoyé à Codex.
- Réexamen visuel : planches de six images horodatées avec sélection adaptative.
- OpenRouter : uniquement les embeddings texte, avec cache des descriptions et
  requêtes identiques. Les anciens essais d’inférence restent comptabilisés.
- Capture indépendante, références limitées au préfixe observé, questions en file FIFO et
  annulation ciblée, limite de 60 secondes de traitement hors attente. Cinq minutes de média en temps observé,
  puis résumés conservés pour la session.

Les images et les transcriptions vont à Codex. Ce POC ne fait donc pas encore
l’inférence visuelle localement sur GX10. Les embeddings audio/image restent dans
la roadmap. Les anciennes stratégies OpenRouter restent des adaptateurs historiques,
mais ne sont plus utilisées par l’app.

## Vérification

```sh
npm test
npm run test:electron
npm run test:electron:full-live
npm run test:codex:speed
npm run package:mac
npm run open:mac
```

Les essais live consomment le quota Codex et éventuellement les embeddings OpenRouter.
[Mesures et limites actuelles](docs/session-optimization.md).
Les [comparaisons vidéo/planches historiques](docs/strategy-comparison.md) utilisaient
Gemini : leur score ne constitue pas une mesure de qualité de Luna.


Fonctions de visionnage : moments gardés sur disque avec suppression explicite,
recherche de passages avec aperçu, et Auto sur consigne à partir de l’activation.
Le raccourci « Garde ce moment » se configure dans la bibliothèque. La réserve
Codex est fixée à 55 % disponibles par fenêtre de quota exposée. Voir
[comportements et validation](docs/viewing-upgrade.md).
