# Icône Mac de TVLens

`tvlens.png` est le master transparent généré avec l’outil intégré `imagegen`, le 23 octobre 2026. La direction retenue est volontairement simple : écran et lentille, gris anthracite et blanc cassé, sans vert ni relief. `tvlens.icns` contient les tailles 16 à 1 024 pixels utilisées par macOS.

Le paquet utilise directement l’ICNS via l’option `icon` de `scripts/package.mjs`. Ces sources graphiques restent hors de l’ASAR ; seule l’icône native est copiée dans `Contents/Resources` par Electron Packager.

## Conversion sur Mac

Depuis la racine du dépôt, dans un dossier temporaire `TVLens.iconset`, produire les fichiers `icon_16x16.png`, `icon_32x32.png`, `icon_128x128.png`, `icon_256x256.png`, `icon_512x512.png` et leurs versions `@2x` avec `sips -z hauteur largeur assets/macos/tvlens.png --out destination`. La version `@2x` utilise le double de la résolution nominale. Puis :

```sh
iconutil -c icns /chemin/temporaire/TVLens.iconset -o assets/macos/tvlens.icns
```

## Prompt retenu

> Use case: logo-brand. Create a single extremely simple, quiet macOS application icon for TVLens, a companion for watching video. A flat warm graphite rounded-square tile (#303234) on actual transparent background. Inside, one centered off-white (#f0efeb) geometric mark: the outline of a wide rounded rectangular screen, with a single simple circular lens ring integrated into its right side. Only two flat solid colors. Bold consistent stroke weight, carefully balanced spacing, large negative space. Modern restrained editorial design, understated and functional. Front-facing, absolutely flat 2D, crisp clean silhouette, legible at 24 pixels. The tile fills approximately 82 percent of the square canvas. No green, no saturated colors, no neon, no glow, no glass, no gradients, no shadows, no metallic effects, no 3D, no antenna, no stand, no play triangle, no camera handle, no sparkles, no AI symbols, no text or letters, no multiple variations or mockup. A single polished minimalist application icon.
