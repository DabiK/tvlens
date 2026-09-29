# Captures de présentation

Ces images montrent l'interface réelle de TVLens avec le court-métrage **Spring**, et non une maquette générée ou une animation synthétique.

| Fichier | Vue |
| --- | --- |
| `direct.png` | Vidéo, contexte récent et réponse du chat avec passages cités |
| `memory.png` | Récapitulatif progressif, passages et moment gardé |
| `floating-bar.png` | Barre flottante repliée |
| `floating-chat.png` | Conversation déployée |

## Protocole

```sh
npm run screenshots:live
```

Prérequis : installation TVLens fonctionnelle, compte Codex connecté, Whisper local et `media/samples/spring.mp4` obtenu depuis la source documentée dans [les échantillons](../../media/samples/README.md).

Le script `scripts/capture-showcase.mjs` ouvre une instance Electron isolée. Il lit le vrai MP4 à partir de 00:25 et fournit les images du lecteur à MediaRecorder via un canvas, avec l'audio original. Il ne capture pas le bureau personnel. Le libellé de la source indique ce fichier.

Les descriptions, le chat et le récapitulatif sont produits par les adaptateurs Codex réels ; la transcription utilise Whisper local. Les réponses ne sont pas injectées dans le DOM. Le mode de test sert à isoler le profil et à fournir la source, avec les fournisseurs concernés explicitement activés en mode réel.

Cette procédure consomme le quota Codex et peut effectuer des embeddings OpenRouter. Les résultats et images changent d'une exécution à l'autre. Les détails du dernier essai restent dans `.scratch/showcase/report.json`, ignoré par Git ; le profil temporaire est supprimé à la fermeture.

## Limites visibles

La vidéo continue pendant la réponse : l'image de l'aperçu peut être plus récente que les passages cités. Les captures conservent le retard d'analyse affiché et les réserves de la réponse. Elles ne prouvent pas une capture système macOS de toute application, une compréhension sans erreur ou une performance générale.

Spring ne contient pas de dialogue : cet essai ne valide pas la transcription d'un débat. Les autres workflows sont couverts séparément par les tests d'intégration synthétiques.

## Crédit

*Spring* (2019), réalisation Andy Goralczyk — **© Blender Foundation | cloud.blender.org/spring**.

- Film : https://cloud.blender.org/spring
- Licence : https://creativecommons.org/licenses/by/4.0/
- Source du fichier et transformations : [fiche des médias](../../media/samples/README.md).

Les images du film sont reproduites à l'intérieur de captures de l'application, redimensionnées par son aperçu. Le MP4 n'est pas ajouté au dépôt. Les captures plus anciennes dans le dossier parent restent des archives d'interfaces précédentes.
