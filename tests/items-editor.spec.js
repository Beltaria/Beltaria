// Éditeur d'items (lore-preview.html) : items.yml tel que BeltariaContent le lit.
// PARITY tests rejouent les cas d'ItemsConfigTest (BeltariaContent,
// src/test/java/fr/beltaria/content/items/ItemsConfigTest.java), mêmes entrées, mêmes chemins
// d'erreur ; les messages attendus sont ceux d'ItemsConfig.java / ConfigValues.java /
// BlockPlacement.java, cités ligne par ligne.
const { test, expect } = require('@playwright/test');

const URL = '/lore-preview.html';
const SHOTS = process.env.ITEMS_SHOTS || '';

test('la page publiée est exactement celle que produisent src/items-editor (npm run build:items)', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const root = path.resolve(__dirname, '..');
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'items-')), 'lore-preview.html');
  execFileSync(process.execPath, [path.join(root, 'src/items-editor/build.js'), out]);
  const norm = s => s.replace(/\r\n/g, '\n');
  expect(norm(fs.readFileSync(out, 'utf8')) === norm(fs.readFileSync(path.join(root, 'lore-preview.html'), 'utf8')),
    'lore-preview.html diffère de ses sources : lancer npm run build:items').toBe(true);
});

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  return errors;
}
async function open(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ItemsLogic && window.ItemsEditor);
}
/** Valide un items.yml et renvoie, par entrée, erreurs / avertissements. */
const check = (page, yaml) => page.evaluate(src => {
  const r = window.ItemsLogic.validateFile(src);
  if (r.fatal) return { fatal: r.fatal.fatal, message: r.fatal.error.message };
  return {
    first: r.firstError ? r.firstError.error.message : null,
    entries: r.entries.map(e => ({ id: e.id, errors: e.errors.map(x => x.message), refs: e.errors.map(x => x.ref), warnings: e.warnings.map(x => x.message), infos: e.infos.map(x => x.message) }))
  };
}, yaml);
const tooltip = (page, yaml, lang) => page.evaluate(([src, l]) => {
  const r = window.ItemsLogic.validateFile(src);
  return window.ItemsLogic.tooltip(r.entries[0].item, l).lines;
}, [yaml, lang]);

// Copie synthétique de la structure de BeltariaContent/src/main/resources/items.yml.
const REAL = [
  '# BeltariaContent : items personnalises, a donner avec /content give.',
  '#',
  '#   material     : matiere Bukkit 1.8 (DIAMOND_SWORD, WOOL...). Obligatoire.',
  '',
  'beltarium_helmet:',
  '  material: DIAMOND_HELMET',
  '  name: "&bCasque en beltarium"',
  '  flags:',
  '    - HIDE_ATTRIBUTES',
  '  unbreakable: true',
  '',
  '# Temoins de diagnostic.',
  'temoin_modele:',
  '  material: DIRT',
  '  name: "&eTemoin de modele"',
  '  lore:',
  '    - "&7Doit s\'afficher comme un modele temoin,"',
  '    - "&7sans condition de marqueur."',
  '  marker: ""',
  '',
  '# Les caisses.',
  'crate_gold:',
  '  material: STONE',
  '  name: "&6Caisse doree"',
  '  block:',
  '    anchor: NOTE_BLOCK',
  '    spin: 1.5',
  '    bob: 1.0',
  '',
  'legendary_key:',
  '  material: TRIPWIRE_HOOK',
  '  name: "&fLegendary Key"',
  ''
].join('\n');

test.describe('validation : parité avec ItemsConfig', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('le catalogue au format livré se charge (ItemsConfigTest.java:41-79)', async ({ page }) => {
    const r = await check(page, REAL);
    expect(r.first).toBeNull();
    expect(r.entries.map(e => e.id)).toEqual(['beltarium_helmet', 'temoin_modele', 'crate_gold', 'legendary_key']);
    for (const e of r.entries) expect(e.errors).toEqual([]);
    const items = await page.evaluate(src => window.ItemsLogic.validateFile(src).entries.map(e => e.item), REAL);
    expect(items[0].material.name).toBe('DIAMOND_HELMET');      // ItemsConfigTest.java:55
    expect(items[0].unbreakable).toBe(true);                     // :56
    expect(items[0].flags).toEqual(['HIDE_ATTRIBUTES']);         // :57
    expect(items[0].marker).toBe('beltarium_helmet');            // :51 marqueur = identifiant
    expect(items[1].marker).toBeNull();                          // :60 marker: "" -> aucun
    expect(items[2].block.anchor.name).toBe('NOTE_BLOCK');       // :71
    expect(items[2].block.spin).toBe(1.5);                       // :72 animée
    expect(items[3].block).toBeNull();                           // :78-79
  });

  test('identifiant invalide (ItemsConfigTest.java:137-141 ; ItemsConfig.java:72-75)', async ({ page }) => {
    const r = await check(page, 'Epee Sacree:\n  material: STONE\n');
    expect(r.first).toBe('Epee Sacree : identifiant attendu en minuscules, chiffres, _ ou -');
  });

  test('matière absente, inconnue, AIR (ItemsConfigTest.java:144-156)', async ({ page }) => {
    expect((await check(page, 'x:\n  name: sans matiere\n')).first).toBe('x.material : matiere absente');          // ConfigValues.java:150-152
    expect((await check(page, 'x:\n  material: NETHERITE_SWORD\n')).first).toBe('x.material : matiere inconnue : NETHERITE_SWORD'); // :153-156
    expect((await check(page, 'x:\n  material: AIR\n')).first).toBe("x.material : l'air ne se donne pas");        // ItemsConfig.java:90-93
    // Material.matchMaterial (Material.java:670-687) : identifiant numérique et nom filtré.
    const r = await check(page, 'x:\n  material: 276\ny:\n  material: diamond sword\n');
    expect(r.first).toBeNull();
  });

  test('quantité bornée à la pile (ItemsConfigTest.java:159-166 ; ItemsConfig.java:101-106)', async ({ page }) => {
    expect((await check(page, 'x:\n  material: DIAMOND_SWORD\n  amount: 2\n')).first).toBe('x.amount : quantite entre 1 et 1 pour DIAMOND_SWORD, recu 2');
    expect((await check(page, 'x:\n  material: STONE\n  amount: 64\n')).first).toBeNull();
    expect((await check(page, 'x:\n  material: STONE\n  data: 40000\n')).first).toBe('x.data : valeur entre 0 et 32767 attendue, recu 40000'); // ItemsConfig.java:95-99
  });

  test('enchantement ou drapeau inconnu, niveau nul (ItemsConfigTest.java:169-186)', async ({ page }) => {
    expect((await check(page, 'x:\n  material: STONE\n  enchantments:\n    SHARPNESS: 5\n')).first)
      .toBe('x.enchantments.SHARPNESS : enchantement inconnu : SHARPNESS (utiliser les noms Bukkit, ex : PROTECTION_ENVIRONMENTAL, DURABILITY, ARROW_DAMAGE)'); // ConfigValues.java:172-183
    expect((await check(page, 'x:\n  material: STONE\n  enchantments:\n    DAMAGE_ALL: 0\n')).first)
      .toBe('x.enchantments.DAMAGE_ALL : valeur strictement positive attendue, recu 0'); // ConfigValues.java:66-75
    expect((await check(page, 'x:\n  material: STONE\n  enchantments:\n    DAMAGE_ALL: "5"\n')).first)
      .toBe('x.enchantments.DAMAGE_ALL : nombre entier attendu, recu : 5');
    expect((await check(page, 'x:\n  material: STONE\n  flags:\n    - HIDE_EVERYTHING\n')).first)
      .toBe('x.flags : valeur inconnue pour ItemFlag : HIDE_EVERYTHING'); // ConfigValues.java:185-194
    expect((await check(page, 'x:\n  material: STONE\n  enchantments: [DAMAGE_ALL]\n')).first)
      .toBe('x.enchantments : bloc attendu (cle: valeur), recu : [DAMAGE_ALL]'); // ConfigValues.java:138-140
  });

  test('niveaux au-delà du maximum vanilla acceptés, avertis au-delà de X (ItemsConfigTest.java:189-195)', async ({ page }) => {
    const r = await check(page, 'x:\n  material: STONE\n  enchantments:\n    DAMAGE_ALL: 32767\n    durability: 11\n    DIG_SPEED: 7\n');
    expect(r.first).toBeNull();
    expect(r.entries[0].warnings.join('\n')).toContain('enchantment.level.32767');
    expect(r.entries[0].warnings.join('\n')).toContain('enchantment.level.11');
    expect(r.entries[0].infos.join('\n')).toContain('DIG_SPEED 7 dépasse le maximum vanilla (5)');
  });

  test('un bloc sans marqueur, un ancrage sans tuile (ItemsConfigTest.java:83-90 ; BlockPlacement.java:69-91)', async ({ page }) => {
    const r = await check(page, 'x:\n  material: STONE\n  marker: ""\n  block:\n    anchor: NOTE_BLOCK\n');
    expect(r.first.startsWith('x.block : ')).toBe(true);
    expect(r.first).toContain('marqueur');
    const b = await check(page, 'x:\n  material: STONE\n  block:\n    anchor: STONE\n    spin: 50\n    bob: -1\n    height: 3\n');
    expect(b.entries[0].errors).toEqual([
      "x.block.anchor : STONE n'a pas de tuile, donc nulle part ou ranger l'identifiant du bloc. Ancrages possibles : DISPENSER, NOTE_BLOCK, MOB_SPAWNER, CHEST, FURNACE, BURNING_FURNACE, SIGN_POST, WALL_SIGN, JUKEBOX, BREWING_STAND, COMMAND, BEACON, SKULL, TRAPPED_CHEST, HOPPER, DROPPER, STANDING_BANNER, WALL_BANNER",
      'x.block.spin : rotation entre -45.0 et 45.0 degres par tick attendue, recu 50.0',
      'x.block.bob : amplitude entre 0 et 8.0 seiziemes attendue, recu -1.0'
    ]);
    expect(b.entries[0].warnings.join('\n')).toContain('block.height ignorée');
  });

  test('ce que Bukkit avale en silence est signalé (MemorySection getInt/getStringList/getBoolean)', async ({ page }) => {
    const r = await check(page, 'x:\n  material: STONE\n  data: abc\n  lore: "&7oops"\n  flags: HIDE_ENCHANTS\n  unbreakable: maybe\n  Name: "&cX"\n  name: &bAncre\n');
    const w = r.entries[0].warnings.join('\n');
    expect(r.first).toBeNull();
    expect(w).toContain('Bukkit prend 0');              // MemorySection.java:299-302
    expect(w).toContain('lore vaut un texte');          // MemorySection.java:377-380, 387-392
    expect(w).toContain('flags vaut un texte');
    expect(w).toContain('Bukkit prend false');          // MemorySection.java:314-317
    expect(w).toContain('Clé « Name » ignorée');
    expect(w).toContain('ancre');                       // name: &bAncre -> ancre YAML
    // YAML 1.1 de SnakeYAML : « yes » est un booléen.
    expect((await check(page, 'x:\n  material: STONE\n  unbreakable: yes\n')).entries[0].warnings).toEqual([]);
  });

  test('entrée vide, clé en double, syntaxe, racine non-mapping', async ({ page }) => {
    const empty = await check(page, 'x:\ny:\n  material: STONE\n');
    expect(empty.entries[0].warnings[0]).toContain('BC ne la voit pas');
    const dup = await check(page, 'x:\n  material: NOPE\nx:\n  material: DIRT\n');
    expect(dup.first).toBeNull();                       // SnakeYAML garde la dernière
    expect(dup.entries[0].warnings[0]).toContain('en double');
    expect((await check(page, 'a: b: c\n')).fatal).toBe('yaml');
    expect(await check(page, '- a\n')).toEqual({ fatal: 'top', message: 'Top level is not a Map.' });
  });
});

test.describe('registres Bukkit 1.8.8', () => {
  test('matières, enchantements, drapeaux', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const L = window.ItemsLogic;
      return {
        mats: L.MATERIALS.length, sword: L.BY_NAME.get('DIAMOND_SWORD'), netherite: !!L.BY_NAME.get('NETHERITE_INGOT'),
        ench: L.ENCHANTS.map(e => e.key), flags: L.FLAGS, upper: L.enchantmentByName(' damage_all ').key, frSharp: L.tr('fr', 'enchantment.damage.all')
      };
    });
    expect(r.mats).toBe(385);                                         // Material.java (beltariaspigot-api 1.8.8)
    expect(r.sword).toMatchObject({ name: 'DIAMOND_SWORD', id: 276, stack: 1, dur: 1561 });
    expect(r.netherite).toBe(false);
    expect(r.ench).toEqual(['PROTECTION_ENVIRONMENTAL', 'PROTECTION_FIRE', 'PROTECTION_FALL', 'PROTECTION_EXPLOSIONS', 'PROTECTION_PROJECTILE', 'OXYGEN', 'WATER_WORKER', 'THORNS', 'DEPTH_STRIDER', 'DAMAGE_ALL', 'DAMAGE_UNDEAD', 'DAMAGE_ARTHROPODS', 'KNOCKBACK', 'FIRE_ASPECT', 'LOOT_BONUS_MOBS', 'DIG_SPEED', 'SILK_TOUCH', 'DURABILITY', 'LOOT_BONUS_BLOCKS', 'ARROW_DAMAGE', 'ARROW_KNOCKBACK', 'ARROW_FIRE', 'ARROW_INFINITE', 'LUCK', 'LURE']); // CraftEnchantment.getName
    expect(r.flags).toEqual(['HIDE_ENCHANTS', 'HIDE_ATTRIBUTES', 'HIDE_UNBREAKABLE', 'HIDE_DESTROYS', 'HIDE_PLACED_ON', 'HIDE_POTION_EFFECTS']); // ItemFlag.java
    expect(r.upper).toBe('DAMAGE_ALL');                               // ConfigValues.java:176 trim + toUpperCase
    expect(r.frSharp).toBe('Tranchant');                              // fr_FR.lang 1.8
  });
});

test.describe('infobulle 1.8.9 (ItemStack.getTooltip + GuiScreen.renderToolTip)', () => {
  const SWORD = 'x:\n  material: DIAMOND_SWORD\n  name: "&bEpee"\n  lore:\n    - "&7Forgee"\n  enchantments:\n    DAMAGE_ALL: 5\n    FIRE_ASPECT: 2\n    DURABILITY: 3\n  unbreakable: true\n';
  test.beforeEach(async ({ page }) => { await open(page); });

  test('épée : nom, enchantements, lore, attaque (+ Tranchant), Incassable, dans cet ordre', async ({ page }) => {
    expect(await tooltip(page, SWORD, 'en')).toEqual([
      '§b§o§bEpee§r',                 // rareté RARE (enchantée) + §o du nom perso ; &b annule l'italique
      '§7Sharpness V', '§7Fire Aspect II', '§7Unbreaking III',
      '§7§5§o§7Forgee',               // lore préfixé §5§o
      '§7',                           // ligne vide avant les attributs
      '§7§9+13.25 Attack Damage',     // 4 + 3 (EMERALD) + 5 × 1.25
      '§7§9Unbreakable'
    ]);
    expect(await tooltip(page, SWORD, 'fr')).toContain("§7§9+13.25 points d'attaque");
  });

  test('les drapeaux masquent leurs lignes', async ({ page }) => {
    const y = SWORD + '  flags: [HIDE_ENCHANTS, HIDE_ATTRIBUTES, HIDE_UNBREAKABLE]\n';
    expect(await tooltip(page, y, 'en')).toEqual(['§b§o§bEpee§r', '§7§5§o§7Forgee']);
  });

  test('nom vanilla, rareté, niveau en short, pomme dorée', async ({ page }) => {
    expect(await tooltip(page, 'x:\n  material: STONE\n', 'fr')).toEqual(['§fRoche§r']);
    expect(await tooltip(page, 'x:\n  material: WOOL\n  data: 14\n', 'en')).toEqual(['§fRed Wool§r']);
    expect(await tooltip(page, 'x:\n  material: GOLDEN_APPLE\n  data: 1\n', 'en')).toEqual(['§dGolden Apple§r']); // ItemAppleGold.java:31
    expect(await tooltip(page, 'x:\n  material: STONE\n  enchantments:\n    DURABILITY: 11\n', 'en')).toEqual(['§bStone§r', '§7Unbreaking enchantment.level.11']);
    expect(await tooltip(page, 'x:\n  material: STONE\n  enchantments:\n    DURABILITY: 40000\n', 'en')).toEqual(['§bStone§r', '§7Unbreaking enchantment.level.-25536']);
  });

  test('ordre des enchantements = HashMap de CraftMetaItem (mesuré sur OpenJDK 25)', async ({ page }) => {
    // HashOrder.java : HashMap(4) puis deux copies new HashMap(map), JDK 25.0.4.
    const got = await page.evaluate(() => [[16, 20, 34], [34, 16], [16, 34, 20, 21, 19], [32, 33, 34, 35, 48], [61, 62, 16], [17, 1], [34, 16, 20, 21, 19, 17, 18, 0]].map(window.ItemsLogic.enchantOrder));
    expect(got).toEqual([[16, 20, 34], [16, 34], [16, 34, 19, 20, 21], [32, 48, 33, 34, 35], [16, 61, 62], [17, 1], [16, 0, 17, 34, 18, 19, 20, 21]]);
    expect(await tooltip(page, 'x:\n  material: STONE\n  enchantments:\n    DURABILITY: 1\n    DAMAGE_ALL: 1\n', 'en')).toEqual(['§bStone§r', '§7Sharpness I', '§7Unbreaking I']);
  });

  test('une icône s\'affiche en case dans le canevas', async ({ page }) => {
    const icon = String.fromCharCode(0xF901);
    await page.evaluate(src => window.ItemsEditor.load(src), 'x:\n  material: PAPER\n  name: "&f\\uF901 Gemme"\n');
    expect(await page.evaluate(() => window.ItemsEditor.current().item.name)).toBe('§f' + icon + ' Gemme');
    await expect(page.locator('#tipNotes')).toContainText('Vérificateur d\'icônes');
    await expect(page.locator('#fName')).toHaveValue('&f\\uF901 Gemme');
    expect(await page.locator('#tipCanvas').getAttribute('data-lines')).toBe('1');
  });
});

test.describe('écriture YAML ciblée', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('modifier une clé ne touche ni les commentaires ni les autres entrées', async ({ page }) => {
    const out = await page.evaluate(src => {
      const L = window.ItemsLogic;
      let t = L.setChild(src, { index: 0, id: 'beltarium_helmet' }, 'name', { t: 'str', v: '&cCasque "rouge"' }).text;
      t = L.setChild(t, { index: 2, id: 'crate_gold' }, 'enchantments', { t: 'map', entries: [['DAMAGE_ALL', { t: 'plain', v: '5' }]] }).text;
      t = L.setChild(t, { index: 1, id: 'temoin_modele' }, 'marker', null).text;
      return t;
    }, REAL);
    const lines = out.split('\n');
    expect(lines).toContain('  name: "&cCasque \\"rouge\\""');
    expect(lines.filter(l => l.startsWith('#'))).toEqual(REAL.split('\n').filter(l => l.startsWith('#')));
    expect(out).toContain('    bob: 1.0\n  enchantments:\n    DAMAGE_ALL: 5\n');
    expect(out).not.toContain('marker: ""');
    expect(out).toContain('legendary_key:\n  material: TRIPWIRE_HOOK\n  name: "&fLegendary Key"\n');
    const r = await check(page, out);
    expect(r.first).toBeNull();
  });

  test('aller-retour : relu par le validateur à l\'identique ; icônes et & écrits entre guillemets', async ({ page }) => {
    const r = await page.evaluate(() => {
      const L = window.ItemsLogic;
      const icon = String.fromCharCode(0xF901);
      const t = L.addEntry('# tete\n', 'neu', [['material', { t: 'plain', v: 'PAPER' }], ['name', { t: 'str', v: '&b' + icon + ' x' }], ['lore', { t: 'list', items: [{ t: 'str', v: '&7a' }, { t: 'str', v: '' }] }]]);
      const v = L.validateFile(t).entries[0].item;
      return { t, name: v.name === '§b' + icon + ' x', lore: v.lore };
    });
    expect(r.t).toBe('# tete\n\nneu:\n  material: PAPER\n  name: "&b\\uF901 x"\n  lore:\n    - "&7a"\n    - ""\n');
    expect(r.name).toBe(true);
    expect(r.lore).toEqual(['§7a', '']);
  });

  test('renommer, dupliquer (commentaires compris), supprimer', async ({ page }) => {
    const r = await page.evaluate(src => {
      const L = window.ItemsLogic;
      return {
        ren: L.renameEntry(src, { index: 3, id: 'legendary_key' }, 'epic_key'),
        dup: L.duplicateEntry('a:\n  material: STONE # pierre\n  # note\n', { index: 0, id: 'a' }, 'b'),
        del: L.deleteEntry(src, { index: 1, id: 'temoin_modele' })
      };
    }, REAL);
    expect(r.ren).toContain('epic_key:\n  material: TRIPWIRE_HOOK');
    expect(r.dup).toBe('a:\n  material: STONE # pierre\n  # note\n\nb:\n  material: STONE # pierre\n  # note\n');
    expect(r.del).not.toContain('temoin_modele');
    expect(r.del).toContain('# Temoins de diagnostic.\n# Les caisses.');
  });

  test('une entrée en flux est réécrite seule, avec avertissement ; CRLF gardé', async ({ page }) => {
    const r = await page.evaluate(() => window.ItemsLogic.setChild('a: {material: STONE}\r\n# garde\r\nb:\r\n  material: DIRT\r\n', { index: 0, id: 'a' }, 'amount', { t: 'plain', v: '3' }));
    expect(r.rewritten).toBe('entry');
    expect(r.text).toBe('a:\r\n  material: STONE\r\n  amount: 3\r\n# garde\r\nb:\r\n  material: DIRT\r\n');
  });

  test('le formulaire écrit dans le fichier', async ({ page }) => {
    await page.evaluate(src => window.ItemsEditor.load(src), REAL);
    await page.locator('#itemList [data-i="0"]').click();
    await page.locator('#fName').fill('&dCasque');
    await page.locator('#fMaterial').fill('GOLD_HELMET');
    await page.locator('#flagBoxes input[value="HIDE_ENCHANTS"]').check();
    await page.locator('#enchSelect').selectOption('PROTECTION_ENVIRONMENTAL');
    await page.locator('#enchLevel').fill('4');
    await page.locator('#enchAdd').click();
    await expect.poll(() => page.evaluate(() => window.ItemsEditor.text())).toContain('    PROTECTION_ENVIRONMENTAL: 4');
    const text = await page.evaluate(() => window.ItemsEditor.text());
    expect(text).toContain('beltarium_helmet:\n  material: GOLD_HELMET\n  name: "&dCasque"\n  flags:\n    - HIDE_ENCHANTS\n    - HIDE_ATTRIBUTES\n  unbreakable: true\n  enchantments:\n');
    expect(text).toContain('# Temoins de diagnostic.\ntemoin_modele:');
    await expect(page.locator('#entryYaml')).toContainText('GOLD_HELMET');
    // Une erreur BC s'affiche au champ, avec sa source.
    await page.locator('#fAmount').fill('5');
    await expect(page.locator('[data-msgs="amount"] .ie-msg.err')).toContainText('beltarium_helmet.amount : quantite entre 1 et 1 pour GOLD_HELMET, recu 5');
    await expect(page.locator('[data-msgs="amount"] .ie-msg.err')).toContainText('ItemsConfig.java:101-106');
    await expect(page.locator('#verdict')).toContainText('refuserait');
  });
});

test.describe('pack et page', () => {
  test('dossier du plugin : items.yml et identifiants du pack', async ({ page }) => {
    await open(page);
    await page.evaluate(async src => {
      const enc = new TextEncoder();
      const f = (path, text) => ({ path, read: async () => enc.encode(text) });
      await window.ItemsEditor.loadTree([
        f('BeltariaContent/items.yml', src),
        f('BeltariaContent/pack/pack.json', JSON.stringify({ 'base-item': 'stone', items: { beltarium_helmet: { material: 'diamond_helmet' }, axe: { material: 'diamond_axe' } }, armor: { zeus: { material: 'diamond' } } })),
        f('BeltariaContent/pack/items/beltarium_helmet/texture.png', ''),
        f('BeltariaContent/pack/items/axe/texture.png', ''),
        f('BeltariaContent/pack/blocks/crate_gold/model.json', '{}'),
        f('BeltariaContent/pack/armor/zeus/helmet.png', '')
      ], 'test');
    }, REAL);
    await expect(page.locator('#packCount')).toHaveText('4');
    const r = await page.evaluate(() => {
      const L = window.ItemsLogic, S = window.ItemsEditor.state;
      return { axe: S.pack.ids.get('axe').material.name, zeus: S.pack.ids.get('zeus_helmet').material.name, warn: S.res.entries.find(e => e.id === 'legendary_key').warnings.map(w => w.message) };
    });
    expect(r.axe).toBe('DIAMOND_AXE');
    expect(r.zeus).toBe('DIAMOND_HELMET');
    expect(r.warn.join('\n')).toContain('Aucune règle du pack pour le marqueur « legendary_key »'); // CatalogueMatchesPackTest.java:56-67
    await page.locator('#packDetails summary').click();
    await page.locator('[data-pack="axe"]').click();
    expect(await page.evaluate(() => window.ItemsEditor.text())).toContain('axe:\n  material: DIAMOND_AXE\n  name: "&fAxe"\n');
  });

  test('sans erreur console, sans défilement horizontal à 375 px', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page);
    await page.evaluate(src => window.ItemsEditor.load(src), REAL);
    await page.locator('#itemList [data-i="2"]').click();
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/phone-crate.png', fullPage: true });
    expect(errors).toEqual([]);
  });

  test('page par défaut : exemple chargé, épée sélectionnée, infobulle dessinée', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);
    await expect(page.locator('#fId')).toHaveValue('beltarium_sword');
    await expect(page.locator('#verdict')).toContainText('chargerait');
    expect(Number(await page.locator('#tipCanvas').getAttribute('data-lines'))).toBe(6);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/desktop-default.png', fullPage: true });
    expect(errors).toEqual([]);
  });
});
