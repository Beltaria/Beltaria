# Beltaria Studio

Outils pixel art Minecraft 1.8 de Beltaria, utilisables directement dans le navigateur :
**https://beltaria.github.io/Beltaria/**

Tout tourne en local dans la page : aucune image n'est envoyée sur un serveur.

| Outil | Lien |
|---|---|
| MC AnimForge — animations (glint, particules, gouttes, aura) + `.mcmeta` | [animforge.html](https://beltaria.github.io/Beltaria/animforge.html) |
| PixelPalette Studio — recoloriage intelligent | [pixelpalette_studio.html](https://beltaria.github.io/Beltaria/pixelpalette_studio.html) |
| Fusion armure & lingot | [armor_and_ingot_fusion.html](https://beltaria.github.io/Beltaria/armor_and_ingot_fusion.html) |
| Aperçu d'armure 3D (layer 1 / layer 2, enchantement animé) | [armor_layer_preview.html](https://beltaria.github.io/Beltaria/armor_layer_preview.html) |
| Items 3D & animations | [item-3d-maker.html](https://beltaria.github.io/Beltaria/item-3d-maker.html) |
| Lore & tooltips (codes `&` / `§`) | [lore-preview.html](https://beltaria.github.io/Beltaria/lore-preview.html) |
| GIF vers spritesheet | [gif_to_spritesheet.html](https://beltaria.github.io/Beltaria/gif_to_spritesheet.html) |

## Ajouter un outil

1. Déposer le fichier `.html` (autonome) à la racine du dépôt.
2. Ajouter sa carte dans `index.html` et le lien retour `← Beltaria Studio` en haut du `<body>`.
3. Lancer les tests : le test vérifie que chaque page est listée dans l'index.

## Tests

Tests de fumée Playwright (chargement sans erreur JS, pas de défilement horizontal à 375 px, lien retour) :

```sh
npm ci
npx playwright install chromium
npm test
```

Ils tournent aussi automatiquement sur GitHub Actions à chaque push.
