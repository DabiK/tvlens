# Développer TVLens

Commencer par [l’installation](docs/installation.md) et [l’architecture](docs/architecture.md).

## Frontières à conserver

- `core/` contient les règles applicatives et les contrats. Aucun import Electron, SDK de modèle ou accès disque.
- `adapters/` implémente les ports : modèles, transcription, stockage, recherche, transport MCP.
- `app/main.cjs` compose les dépendances et valide les entrées IPC ; `preload.cjs` expose une interface limitée.
- `app/renderer.js` orchestre les interactions. `app/ui/` porte la présentation : navigation, pictogrammes, rendu du récapitulatif et helpers texte.
- `scripts/` contient les outils de développement, packaging et essais. `tests/` couvre le comportement avec des dépendances injectées.

Passer les effets nécessaires aux vues sous forme de callbacks. Garder une seule source de vérité pour la session et la conversation. Afficher le contenu des modèles comme du texte, jamais comme du HTML de confiance.

La [garde d’architecture](tests/architecture.test.cjs), éprouvée par des violations dans des copies
temporaires dans [son banc](tests/architecture-guard.test.cjs), contrôle les imports avec une seule
table de couches et leur résolution relative :

- Dans `core/`, `adapters/`, `runtime/`, `server/`, `mcp/` et `app/`, les imports externes littéraux
  visent `node:` ou un paquet de `dependencies`, sous-chemins et paquets à portée compris.
  Les builtins sans préfixe et les paquets de développement sont refusés. Le cœur refuse tout import
  externe. `electron` fait exception aux paquets de développement, uniquement dans `app/main.cjs`
  et `app/preload.cjs`.
- `app/ui/` importe uniquement dans son dossier. L’unique exception est
  `app/ui/browser-capture.mjs` vers `app/recording.js`, pour la capture injectée de l’[ADR 0018](docs/adr/0018-un-controleur-injecte-possede-la-capture-du-mac.md).
- `tv/app/` conserve des scripts classiques, sans syntaxe ES `import` ou `export`, y compris
  `import()` et `import.meta`. Les chargements `require` et `module.require` ont une cible relative
  littérale dans `tv/app/`, sous la garde `typeof module === "object" && module && module.exports`
  de l’[ADR 0011](docs/adr/0011-un-script-partage-du-panneau-tv-est-une-iife-exposee-sur-la-page-et-par-commonjs.md)
  (branche vraie d’un ternaire ou bloc `if`). Les exports CommonJS conditionnels restent permis.
- Dans les compositions `.cjs` de `app/`, `runtime/`, `server/` et `mcp/`, les écritures directes
  des drapeaux `watch.ending`, `watch.accepting`, `watch.readOnly`, `watch.closed` et `watch.asking`
  sont refusées. Les lectures, comparaisons et appels à `watch.setQuestionPending` restent permis ;
  ces transitions appartiennent au domaine.

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
