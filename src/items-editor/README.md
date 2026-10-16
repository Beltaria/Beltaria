# Sources de l'éditeur d'items (`lore-preview.html`)

`lore-preview.html` est **généré** : ne pas le modifier à la main. Modifier les sources ici, puis :

```sh
npm run build:items
```

| Fichier | Rôle |
|---|---|
| `page.html` | gabarit de la page (en-tête Studio, panneaux, styles) |
| `logic.js` | logique pure : règles d'`ItemsConfig` (BeltariaContent), YAML façon SnakeYAML/Bukkit, infobulle 1.8.9 |
| `ui.js` | interface |
| `example.yml` | exemple chargé par défaut (écrit pour Studio, pas le `items.yml` privé) |
| `mcdata.json` | données 1.8 compactées : matières Bukkit, noms en/fr, rareté, dégâts d'attaque |
| `build.js` | assemble la page (sortie en CRLF) |

`dump/` garde les extracteurs qui ont produit `mcdata.json` (`ItemDump.java` lancé sur les sources
MCP 1.8.9 / Forge 11.15.1.2318, `materials.js` sur `Material.java` de l'API BeltariaSpigot,
`compact.js` qui assemble le tout avec les fichiers de langue du client). Les sources Minecraft et
les fichiers de langue ne sont pas dans le dépôt : il faut les fournir pour régénérer `mcdata.json`.

`tests/items-editor.spec.js` vérifie que la page publiée est identique à ce que produisent ces sources.
