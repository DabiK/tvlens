# Développer TVLens

Commencer par [l’installation](docs/installation.md) et [l’architecture](docs/architecture.md).

## Frontières à conserver

- `core/` contient les règles applicatives et les contrats. Aucun import Electron, SDK de modèle ou accès disque.
- `adapters/` implémente les ports : modèles, transcription, stockage, recherche, transport MCP.
- `app/main.cjs` compose les dépendances et valide les entrées IPC ; `preload.cjs` expose une interface limitée.
- `app/renderer.js` orchestre les interactions. `app/ui/` porte la présentation : navigation, pictogrammes, rendu du récapitulatif et helpers texte.
- `scripts/` contient les outils de développement, packaging et essais. `tests/` couvre le comportement avec des dépendances injectées.

Passer les effets nécessaires aux vues sous forme de callbacks. Garder une seule source de vérité pour la session et la conversation. Afficher le contenu des modèles comme du texte, jamais comme du HTML de confiance.

## Vérifier une modification

```sh
npm ci
npm test
npm run test:electron
```

Pour une modification de l’interface, vérifier Direct, Mémoire, l’overlay replié/déployé et la taille minimale de fenêtre. Le parcours Electron ouvre une instance isolée et utilise une capture synthétique ainsi que des modèles simulés.

Les commandes `*:live` et `screenshots:live` utilisent des fournisseurs réels. Elles consomment le quota Codex et peuvent entraîner des frais d’embeddings OpenRouter. Documenter le modèle, le média, les échecs et les limites avant de publier un résultat.

## Documents et médias

Le README présente l’état actuel du produit. Garder les mesures détaillées dans `docs/` et les captures courantes dans `screenshots/current/`. Les anciennes captures et évaluations restent des archives datées.

Ne pas ajouter `.env.local`, clés, profils de session, vidéos brutes ou données personnelles. Les exemples de configuration doivent contenir des valeurs fictives. Créditer les médias visibles dans les captures.
