// Menus des cosmétiques: BeltariaContent's config.yml rules ported to window.CosmeticsLogic.
// PARITY cases replay BeltariaContent's own JUnit cases (src/test/java/fr/beltaria/content/config/
// CosmeticsConfigTest.java, menu/MenuLayoutTest.java) plus the checks of CosmeticsConfig.java,
// PackConfig.java and Swarm.java they do not cover; each case cites the Java test or source line.
// Expected strings are the exact ConfigException messages BC logs after
// "config.yml invalide, plugin desactive : " (BeltariaContent.java:146-148).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = '/cosmetics-config.html';
// Screenshots: COSMETICS_SHOTS when set, else this test's output folder.
const shotPath = (info, name) => (process.env.COSMETICS_SHOTS ? path.join(process.env.COSMETICS_SHOTS, name) : info.outputPath(name));

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  return errors;
}
async function open(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.CosmeticsApp && window.CosmeticsLogic && window.jsyaml);
}
/** First BC error message for a config.yml text (null when BC accepts it). */
const firstError = (page, yaml) => page.evaluate(y => {
  const L = window.CosmeticsLogic;
  const p = L.parseYaml(y);
  if (p.error) return 'YAML: ' + p.error;
  const r = L.validate(p.data, { index: L.indexYaml(y) });
  return r.errors.length ? r.errors[0].message : null;
}, yaml);
const reportOf = (page, yaml, pack) => page.evaluate(([y, pk]) => {
  const L = window.CosmeticsLogic;
  const p = L.parseYaml(y);
  const pack = pk ? L.packFromPaths(pk.paths, pk.json) : null;
  const r = L.validate(p.data, { index: L.indexYaml(y), pack });
  return JSON.parse(JSON.stringify(r, (k, v) => (v instanceof Set ? [...v] : v)));
}, [yaml, pack || null]);

const W = body => 'wings:\n  x:\n' + body;
const TRAIL = motes => 'trails:\n  arcane:\n    motes:\n' + motes;

/* [case, config.yml, expected first message or null (accepted), source] */
const PARITY = [
  ['marker-key without colon', 'marker-key: sans-deux-points\n', 'marker-key : Cle de marqueur attendue sous la forme namespace:cle, recu sans-deux-points', 'CosmeticsConfigTest.java:37-47, CosmeticMarker.java:45-49'],
  ['marker-key upper-case namespace', 'marker-key: "Beltaria:id"\n', 'marker-key : Invalid namespace. Must be [a-z0-9._-]: Beltaria', 'CosmeticsConfig.java:66-71, API NamespacedKey.java:57'],
  ['marker-key upper-case key', 'marker-key: "beltaria:Id"\n', 'marker-key : Invalid key. Must be [a-z0-9/._-]: Id', 'API NamespacedKey.java:58'],
  ['marker-key empty', 'marker-key: ""\n', 'marker-key : Cle de marqueur vide', 'CosmeticMarker.java:42-44'],
  ['marker-key trailing colon', 'marker-key: "beltaria:"\n', 'marker-key : Cle de marqueur attendue sous la forme namespace:cle, recu beltaria:', 'CosmeticMarker.java:46-49'],
  ['marker-key with a slash', 'marker-key: "beltaria:a/b"\n', null, 'API NamespacedKey.java:41'],
  ['base-material unknown', 'base-material: WOOL_X\n', 'base-material : matiere inconnue : WOOL_X', 'CosmeticsConfig.java:72-74, ConfigValues.java:149-158'],
  ['update-interval-ticks 0', 'update-interval-ticks: 0\n', 'update-interval-ticks : valeur strictement positive attendue, recu 0', 'CosmeticsConfig.java:75-76, ConfigValues.java:50-57'],
  ['update-interval-ticks 2.9 truncates to 2', 'update-interval-ticks: 2.9\n', null, 'API MemorySection.java:299-302 (toInt)'],
  ['view-distance 0', 'view-distance: 0\n', 'view-distance : distance strictement positive attendue, en blocs, recu 0.0', 'CosmeticsConfigTest.java:51-60, CosmeticsConfig.java:77-81'],
  ['view-distance -5', 'view-distance: -5\n', 'view-distance : distance strictement positive attendue, en blocs, recu -5.0', 'CosmeticsConfigTest.java:52'],
  ['view-distance -0.5', 'view-distance: -0.5\n', 'view-distance : distance strictement positive attendue, en blocs, recu -0.5', 'CosmeticsConfigTest.java:52'],
  ['view-distance .inf', 'view-distance: .inf\n', 'view-distance : distance strictement positive attendue, en blocs, recu Infinity', 'CosmeticsConfig.java:78'],
  ['view-distance 12', 'view-distance: 12\n', null, 'CosmeticsConfigTest.java:59'],
  ['menu title: 16 colour codes = 32 chars', 'menu:\n  title: "' + '&a'.repeat(16) + '"\n', null, 'CosmeticsConfigTest.java:438-449'],
  ['menu title: 33 chars', 'menu:\n  title: "' + '&a'.repeat(16) + 'x"\n', 'menu.title : au plus 32 caracteres, codes couleur compris, recu 33', 'CosmeticsConfigTest.java:446-452, CosmeticsConfig.java:255-265'],
  ['options-title over the limit', 'menu:\n  options-title: "' + 'x'.repeat(40) + '"\n', 'menu.options-title : au plus 32 caracteres, codes couleur compris, recu 40', 'CosmeticsConfig.java:87, 255-265'],
  ['pack.send-delay-ticks negative', 'pack:\n  send-delay-ticks: -1\n', 'pack.send-delay-ticks : delai negatif : -1', 'PackConfig.java:79-83'],
  ['pack.hosting unknown', 'pack:\n  hosting: cdn\n', 'pack.hosting : valeur inconnue pour Hosting : cdn', 'PackConfig.java:90-92, ConfigValues.java:185-194'],
  ['pack.self.port out of range', 'pack:\n  self:\n    port: 70000\n', 'pack.self.port : port entre 1 et 65535 attendu, recu 70000', 'PackConfig.java:95-99'],
  ['port not checked in external hosting', 'pack:\n  hosting: external\n  self:\n    port: 70000\n  external:\n    url: https://cdn.example.org/pack.zip\n', null, 'PackConfig.java:96'],
  ['external hosting without URL (value trimmed)', 'pack:\n  hosting: " External "\n', 'pack.external.url : URL attendue avec hosting: external', 'PackConfig.java:105-111, ConfigValues.java:190'],
  ['external hosting with ftp URL', 'pack:\n  hosting: external\n  external:\n    url: ftp://x/pack.zip\n', 'pack.external.url : URL http:// ou https:// attendue, recu ftp://x/pack.zip', 'PackConfig.java:112-117'],
  ['wings as a list', 'wings:\n  - fairy_wings\n', 'wings : bloc attendu (identifiant: reglages)', 'CosmeticsConfigTest.java:413-422, CosmeticsConfig.java:116-118'],
  ['id with upper case and space', 'wings:\n  Fairy Wings: {}\n', 'wings.Fairy Wings : identifiant attendu en minuscules, chiffres, _ ou -', 'CosmeticsConfigTest.java:145-155, CosmeticsConfig.java:121-126'],
  ['id with digits, _ and -', 'wings:\n  8bit-wings_2: {}\n', null, 'CosmeticsConfig.java:36'],
  ['entry that is a string', 'wings:\n  x: abc\n', 'wings.x : bloc attendu (cle: valeur), recu : abc', 'CosmeticsConfig.java:127, ConfigValues.java:138-140'],
  ['entry that is a list', 'wings:\n  x: [a, b]\n', 'wings.x : bloc attendu (cle: valeur), recu : [a, b]', 'ConfigValues.java:138-140'],
  ['icon unknown', W('    icon: NOT_A_MATERIAL\n'), 'wings.x.icon : matiere inconnue : NOT_A_MATERIAL', 'CosmeticsConfigTest.java:158-175, README Configuration'],
  ['icon AIR', W('    icon: AIR\n'), "wings.x.icon : l'air n'a pas d'icone", 'CosmeticsConfigTest.java:164-174, CosmeticsConfig.java:143-145'],
  ['icon 0 is AIR by id', W('    icon: 0\n'), "wings.x.icon : l'air n'a pas d'icone", 'API Material.java:670-677 (int id first)'],
  ['icon 288 is FEATHER by id', W('    icon: 288\n'), null, 'API Material.java:675'],
  ['icon lower case with a space', W('    icon: diamond sword\n'), null, 'API Material.java:679-682'],
  ['icon with a dash', W('    icon: Gold-Ingot\n'), 'wings.x.icon : matiere inconnue : Gold-Ingot', 'API Material.java:682 (\\W dropped: GOLDINGOT)'],
  ['icon empty string is no icon', W('    icon: ""\n'), null, 'CosmeticsConfigTest.java:104-119, CosmeticsConfig.java:141'],
  ['icon WOOL with icon-data 14', W('    icon: WOOL\n    icon-data: 14\n    permission: rank.vip\n'), null, 'CosmeticsConfigTest.java:122-134'],
  ['icon-data -1', W('    icon-data: -1\n'), 'wings.x.icon-data : valeur entre 0 et 32767 attendue, recu -1', 'CosmeticsConfigTest.java:178-190, CosmeticsConfig.java:147-151'],
  ['icon-data 40000', W('    icon-data: 40000\n'), 'wings.x.icon-data : valeur entre 0 et 32767 attendue, recu 40000', 'CosmeticsConfigTest.java:184-189'],
  ['icon-data as text is ignored (getInt default)', W('    icon-data: "40000"\n'), null, 'API MemorySection.java:299-302'],
  ['permission empty', W('    permission: ""\n'), 'wings.x.permission : noeud de permission vide', 'CosmeticsConfigTest.java:193-204, CosmeticsConfig.java:159-162'],
  ['name empty', W('    name: ""\n'), 'Nom vide pour les ailes x', 'Wing.java:52-54 (no path)'],
  ['motes under an aura', 'auras:\n  halo:\n    motes:\n      - model: rune_mote\n', 'auras.halo.motes : les objets volants se declarent sous trails:, pas sous auras:', 'CosmeticsConfigTest.java:282-301, CosmeticsConfig.java:164-170'],
  ['motes under wings', W('    motes:\n      - model: rune_mote\n'), 'wings.x.motes : les objets volants se declarent sous trails:, pas sous wings:', 'CosmeticsConfig.java:164-170'],
  ['trail without motes', 'trails:\n  nothing: {}\n', "trails.nothing.motes : une trainee a besoin d'au moins un essaim (- model: ...)", 'CosmeticsConfigTest.java:289-300, CosmeticsConfig.java:173-177'],
  ['trail with an empty motes list', 'trails:\n  t:\n    motes: []\n', "trails.t.motes : une trainee a besoin d'au moins un essaim (- model: ...)", 'CosmeticsConfig.java:173-177'],
  ['motes not a list', TRAIL('      model: rune_mote\n'), 'trails.arcane.motes : liste attendue (- model: ...)', 'CosmeticsConfigTest.java:389-409, CosmeticsConfig.java:194-197'],
  ['a mote that is not a block', TRAIL('      - rune\n'), 'trails.arcane.motes[0] : bloc attendu (cle: valeur), recu : rune', 'ConfigValues.java:109-116'],
  ['a mote without model', TRAIL('      - motion: orbit\n'), 'trails.arcane.motes[0].model : identifiant de modele attendu (pack/motes/<modele>), en minuscules, chiffres, _ ou -', 'CosmeticsConfigTest.java:369-404, CosmeticsConfig.java:209-214'],
  ['a mote with 500 objects', TRAIL('      - model: rune_mote\n      - model: rune_mote\n        count: 500\n'), 'trails.arcane.motes[1] : Entre 1 et 12 objets, recu 500', 'CosmeticsConfigTest.java:376-406, Swarm.java:122-125'],
  ['an unknown motion (message upper-cased)', TRAIL('      - model: rune_mote\n        motion: teleport\n'), 'trails.arcane.motes[0].motion : valeur inconnue pour Motion : TELEPORT', 'CosmeticsConfigTest.java:383-408, CosmeticsConfig.java:215-217'],
  ['an unknown trigger', TRAIL('      - model: rune_mote\n        trigger: boom\n'), 'trails.arcane.motes[0].trigger : valeur inconnue pour Trigger : BOOM', 'CosmeticsConfig.java:218-220'],
  ['Motion keys are case-insensitive', TRAIL('      - Model: rune_mote\n        MOTION: Spiral\n'), null, 'ConfigValues.java:117-121'],
  ['radius 5', TRAIL('      - model: rune_mote\n        radius: 5\n'), 'trails.arcane.motes[0] : radius entre 0.0 et 3.0, recu 5.0', 'Swarm.java:126, 212-217'],
  ['turn -50', TRAIL('      - model: rune_mote\n        turn: -50\n'), 'trails.arcane.motes[0] : turn entre -45.0 et 45.0, recu -50.0', 'Swarm.java:129'],
  ['a swarm in front of the body', TRAIL('      - model: rune_mote\n        height: 2.5\n      - model: rune_mote\n        height: 1.2\n'), 'trails.arcane.motes[1] : la trajectoire va de 1.10 a 1.30 bloc au-dessus des pieds : elle doit rester sous la ceinture (0.70 au plus) ou au-dessus de la tete (2.10 au moins), un objet devant le corps gene', 'CosmeticsConfigTest.java:333-349, Swarm.java:161-168'],
  ['a spiral starting above the head', TRAIL('      - model: gold_spark\n        motion: spiral\n        base: 2.1\n        height: 2.9\n'), null, 'CosmeticsConfigTest.java:352-366'],
  ['a spiral living 3 ticks', TRAIL('      - model: m\n        motion: spiral\n        lifetime-ticks: 3\n        interval-ticks: 1\n'), 'trails.arcane.motes[0] : Duree de vie entre 5 et 200 ticks, recu 3', 'Swarm.java:135-139'],
  ['a spiral every tick', TRAIL('      - model: m\n        motion: spiral\n        interval-ticks: 1\n'), 'trails.arcane.motes[0] : Intervalle de 2 ticks au moins, recu 1', 'Swarm.java:140-145'],
  ['a burst on landing ignores interval-ticks', TRAIL('      - model: m\n        motion: burst\n        interval-ticks: 1\n'), null, 'Swarm.java:140-141'],
  ['a burst on interval checks it', TRAIL('      - model: m\n        motion: burst\n        trigger: interval\n        interval-ticks: 1\n'), 'trails.arcane.motes[0] : Intervalle de 2 ticks au moins, recu 1', 'Swarm.java:140-145'],
  ['orbit defaults', TRAIL('      - model: m\n        motion: orbit\n'), null, 'CosmeticsConfigTest.java:318-330'],
  ['spiral defaults', TRAIL('      - model: m\n        motion: spiral\n'), null, 'CosmeticsConfigTest.java:318-330'],
  ['trail defaults', TRAIL('      - model: m\n        motion: trail\n'), null, 'CosmeticsConfigTest.java:318-330'],
  ['burst defaults', TRAIL('      - model: m\n        motion: burst\n'), null, 'CosmeticsConfigTest.java:318-330'],
  ['an aura named like a pair of wings', 'wings:\n  halo: {}\nauras:\n  halo: {}\n', "auras.halo : deja le nom d'une paire d'ailes : le pack les reconnait par le meme marqueur", 'CosmeticsConfigTest.java:240-251, CosmeticsConfig.java:98-106'],
  ['a trail may share a wing id', 'wings:\n  halo: {}\ntrails:\n  halo:\n    motes:\n      - model: m\n', null, 'CosmeticsConfig.java:108-109']
];

test.describe('validation parity with CosmeticsConfig', () => {
  test('every case gives BC\'s exact first message', async ({ page }) => {
    await open(page);
    for (const [name, yaml, expected, ref] of PARITY) {
      expect.soft(await firstError(page, yaml), `${name} (${ref})`).toBe(expected);
    }
  });

  test('errors come in BC\'s order: settings, titles, pack, wings, auras, shared ids, trails', async ({ page }) => {
    await open(page);
    // CosmeticsConfig.java:62-109: marker-key before the catalogues, titles (:85-89) before pack (:93) and wings (:96).
    const r = await reportOf(page, 'marker-key: bad\nmenu:\n  title: "' + 'x'.repeat(33) + '"\npack:\n  hosting: cdn\nwings:\n  Bad: {}\n  halo: {}\nauras:\n  halo: {}\n  x:\n    icon: NOPE\ntrails:\n  t: {}\n');
    expect(r.errors.map(e => e.path)).toEqual(['marker-key', 'menu.title', 'pack.hosting', 'wings.Bad', 'auras.x.icon', 'auras.halo', 'trails.t.motes']);
    expect(r.consoleLine).toBe('config.yml invalide, plugin desactive : marker-key : Cle de marqueur attendue sous la forme namespace:cle, recu bad');
  });

  test('accepted entries carry what BC builds: names, permissions, icons, swarms, file order', async ({ page }) => {
    await open(page);
    // CosmeticsConfigTest.java:104-134
    let r = await reportOf(page, 'wings:\n  plain: {}\n  blank:\n    icon: ""\n  vip_wings:\n    icon: WOOL\n    icon-data: 14\n    permission: rank.vip\n');
    const [plain, blank, vip] = r.slots.wings.entries;
    expect(plain).toMatchObject({ id: 'plain', name: 'plain', icon: null, iconData: 0, lore: [], permission: 'beltaria.content.wings.plain' });
    expect(blank.icon).toBeNull();
    expect(vip).toMatchObject({ permission: 'rank.vip', icon: { name: 'WOOL', id: 35 }, iconData: 14 });
    // CosmeticsConfigTest.java:207-226: auras have their own catalogue and permission prefix
    r = await reportOf(page, 'enabled: true\nwings:\n  fairy_wings: {}\nauras:\n  electric_aura:\n    name: "&bAura electrique"\n  vip_aura:\n    permission: rank.vip\n');
    expect(r.slots.auras.entries.map(e => [e.id, e.name, e.permission])).toEqual([['electric_aura', '\u00a7bAura electrique', 'beltaria.content.auras.electric_aura'], ['vip_aura', 'vip_aura', 'rank.vip']]);
    // CosmeticsConfigTest.java:254-279
    r = await reportOf(page, TRAIL('      - model: rune_mote\n        motion: orbit\n        count: 4\n        radius: 1.2\n      - model: gold_spark\n        motion: burst\n        trigger: interval\n        interval-ticks: 60\n'));
    const t = r.slots.trails.entries[0];
    expect(t.permission).toBe('beltaria.content.trails.arcane');
    expect(t.swarms.map(s => [s.model, s.motion, s.count, s.radius, s.trigger, s.intervalTicks])).toEqual([['rune_mote', 'ORBIT', 4, 1.2, 'LAND', 0], ['gold_spark', 'BURST', 8, 0.3, 'INTERVAL', 60]]);
    expect(t.model).toBe('rune_mote');
    // CosmeticsConfigTest.java:425-435: more than a page, file order kept (w0 first) even for digit-only keys
    let yaml = 'wings:\n';
    for (let i = 0; i < 2 * 45 + 3; i++) yaml += '  w' + i + ': {}\n';
    yaml += '  "123": {}\n  "7": {}\n';
    r = await reportOf(page, yaml);
    expect(r.slots.wings.entries.length).toBe(95);
    expect(r.slots.wings.entries[0].id).toBe('w0');
    expect(r.slots.wings.entries.slice(-2).map(e => e.id)).toEqual(['123', '7']);
    // CosmeticsConfig.java:286-289 / CosmeticsConfigTest.java:137-142
    r = await reportOf(page, 'enabled: true\n');
    expect(r.warnings.some(w => w.text.includes('le plugin se considère désactivé'))).toBe(true);
  });

  test('swarm geometry matches Swarm.verticalRange (README: burst summit 0,46)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const L = window.CosmeticsLogic;
      const burst = { model: 'm', motion: 'BURST', trigger: 'LAND', count: 8, radius: 0.3, base: 0, height: 0.1, turn: 0, spin: 15, bob: 0, speed: 0.12, lift: 0.17, gravity: 0.04, lifetimeTicks: 30, intervalTicks: 40 };
      return { range: L.verticalRange(burst), problem: L.swarmProblem(burst), fixed: [L.javaFixed2(1.005), L.javaFixed2(0.125), L.javaFixed2(-1.1), L.javaFixed2(0.7)], doubles: [L.javaDouble(5), L.javaDouble(-0.5), L.javaDouble(1e-4), L.javaDouble(1.5e21), L.javaDouble(0)] };
    });
    expect(r.range[0]).toBeCloseTo(0, 12);            // max(0, ...) of the same IEEE sum Java computes
    expect(r.range[1]).toBeCloseTo(0.46125, 10);       // CosmeticsConfig.java:251 defaults, Swarm.java:190-201
    expect(r.problem).toBeNull();
    expect(r.fixed).toEqual(['1.01', '0.13', '-1.10', '0.70']);   // String.format("%.2f") is HALF_UP
    expect(r.doubles).toEqual(['5.0', '-0.5', '1.0E-4', '1.5E21', '0.0']); // Double.toString
  });

  test('Bukkit loading quirks BC inherits are reported', async ({ page }) => {
    await open(page);
    // YAML 1.1 booleans (SnakeYAML 1.33): yes / on are true
    let r = await reportOf(page, 'enabled: on\nshow-to-self: yes\nwings:\n  a: {}\n');
    expect(r.settings.enabled).toBe(true);
    expect(r.settings.showToSelf).toBe(true);
    // enabled absent: CosmeticsConfig.java:61 reads false
    r = await reportOf(page, 'wings:\n  a: {}\n');
    expect(r.settings.enabled).toBe(false);
    expect(r.warnings.find(w => w.path === 'enabled').ref).toContain('CosmeticsConfig.java:61');
    // An entry without value is removed by MemorySection.set(null) (MemorySection.java:186-191)
    r = await reportOf(page, 'enabled: true\nwings:\n  a:\n  b:\n    name: B\n');
    expect(r.slots.wings.entries.map(e => e.id)).toEqual(['b']);
    expect(r.warnings.some(w => w.path === 'wings.a' && w.dropped)).toBe(true);
    // fairy_wings without lore shows the shipped lore (defaults: MemorySection.java:105-107, 372-380; config.yml:176-187)
    r = await reportOf(page, 'wings:\n  fairy_wings:\n    name: F\n  bat_wings:\n    lore: []\n');
    expect(r.slots.wings.entries[0].lore).toEqual(['\u00a77Legeres et lumineuses.']);
    expect(r.slots.wings.entries[1].lore).toEqual([]);
    // lore as a plain string is not a list: no line (getList returns the default, null)
    r = await reportOf(page, 'wings:\n  a:\n    lore: "une ligne"\n');
    expect(r.slots.wings.entries[0].lore).toEqual([]);
    expect(r.warnings.some(w => w.path === 'wings.a.lore')).toBe(true);
    // a dotted key is a path for Bukkit: "my.wings" becomes the entry "my" holding a key "wings"
    r = await reportOf(page, 'wings:\n  my.wings:\n    name: x\n');
    expect(r.slots.wings.entries.map(e => [e.id, e.name])).toEqual([['my', 'my']]);
    // duplicate keys: the second value wins (SnakeYAML allows duplicates)
    r = await reportOf(page, 'wings:\n  a:\n    name: one\n  a:\n    name: two\n');
    expect(r.slots.wings.entries.map(e => e.name)).toEqual(['two']);
    expect(r.warnings.some(w => w.text.startsWith('clé en double'))).toBe(true);
    // base-material must be a block for the 1.8.9 head layer (config.yml:32-33, Material.java:585-587)
    r = await reportOf(page, 'base-material: feather\n');
    expect(r.errors).toEqual([]);
    expect(r.warnings.find(w => w.path === 'base-material').text).toContain("FEATHER n'est pas un bloc");
    // unknown entry keys are not read by BC
    r = await reportOf(page, W('    icon_data: 3\n'));
    expect(r.warnings.find(w => w.path === 'wings.x.icon_data').text).toContain('icon-data');
  });
});

test.describe('menu titles: the 32-character rule', () => {
  test('colour codes are translated like ChatColor and counted', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const L = window.CosmeticsLogic;
      return ['&8&lAiles', '&&a', '&g', '&A', 'a&', '§8x'].map(s => [L.translateColors(s), L.translateColors(s).length]);
    });
    // API ChatColor.java:323-332
    expect(r).toEqual([['\u00a78\u00a7lAiles', 9], ['&\u00a7a', 3], ['&g', 2], ['\u00a7a', 2], ['a&', 2], ['\u00a78x', 3]]);
  });

  test('defaults come from the Java fallbacks when menu: is absent', async ({ page }) => {
    await open(page);
    const r = await reportOf(page, 'wings:\n  a: {}\n');
    // CosmeticsConfig.java:38-42: "Ailes" without &8 (the shipped file says &8Ailes)
    expect(Object.values(r.settings.titles).map(t => t.colored)).toEqual(['Ailes', '\u00a78Items', "\u00a78Preferences d'affichage", '\u00a78Auras', '\u00a78Trainees']);
  });

  test('typing a 33-character title flags it everywhere', async ({ page }) => {
    await open(page);
    const input = page.locator('#set_menu__title');
    await input.fill('&8' + 'x'.repeat(30));
    await expect(page.locator('#set_menu__title_n')).toHaveText('32/32');
    await expect(page.locator('#consoleLine')).toContainText('BC accepte');
    await input.fill('&8' + 'x'.repeat(31));
    await expect(page.locator('#set_menu__title_n')).toHaveText('33/32');
    await expect(page.locator('#set_menu__title_n')).toHaveClass(/bad/);
    await expect(page.locator('#consoleLine')).toContainText('config.yml invalide, plugin desactive : menu.title : au plus 32 caracteres, codes couleur compris, recu 33');
    await expect(page.locator('#titleNote')).toBeVisible();
    expect(await page.evaluate(() => window.CosmeticsApp.text())).toContain('  title: "&8' + 'x'.repeat(31) + '"');
    await input.fill('');
    await expect(page.locator('#set_menu__title_s')).toContainText('défaut du code « Ailes »');
    expect(await page.evaluate(() => window.CosmeticsApp.text())).not.toMatch(/^ {2}title:/m);
  });
});

const PACK_PATHS = [
  'pack-src/pack.json',
  'pack-src/wings/fairy_wings/model.json', 'pack-src/wings/fairy_wings/texture.png', 'pack-src/wings/fairy_wings/icon.png',
  'pack-src/wings/extra_wings/model.json',
  'pack-src/auras/frost_aura/model.json',
  'pack-src/motes/rune_mote/model.json', 'pack-src/motes/unused_mote/model.json',
  'pack-src/items/egypt_key/model.json'
];
const PACK_JSON = JSON.stringify({ 'marker-key': 'beltaria:other', 'base-item': 'stone', wings: { declared_only: {} } });
const PACK_CONFIG = 'enabled: true\nwings:\n  fairy_wings:\n    name: "&dFee"\n  bat_wings:\n    name: "&8Chauve-souris"\nauras:\n  electric_aura: {}\ntrails:\n  rune_trail:\n    motes:\n      - model: rune_mote\n      - model: star_mote\n        height: 0.2\n';

test.describe('pack cross-check', () => {
  test('pack ids come from folders and pack.json, as PackBuild discovers them', async ({ page }) => {
    await open(page);
    const p = await page.evaluate(([paths, json]) => {
      const pk = window.CosmeticsLogic.packFromPaths(paths, json);
      return { root: pk.rootDir, wings: [...pk.ids.wings].sort(), auras: [...pk.ids.auras], motes: [...pk.ids.motes].sort(), icons: [...pk.icons.keys()], marker: pk.markerKey };
    }, [PACK_PATHS, PACK_JSON]);
    // PackBuild.java:1341-1372: declared entries plus discovered folders; items/ is not a cosmetic
    expect(p).toEqual({ root: 'pack-src/', wings: ['declared_only', 'extra_wings', 'fairy_wings'], auras: ['frost_aura'], motes: ['rune_mote', 'unused_mote'], icons: ['wings/fairy_wings'], marker: 'beltaria:other' });
    const noJson = await page.evaluate(() => window.CosmeticsLogic.packFromPaths(['srv/plugins/BeltariaContent/pack/wings/a/model.json', 'srv/plugins/BeltariaContent/pack/motes/m/model.json'], null).rootDir);
    expect(noJson).toBe('srv/plugins/BeltariaContent/pack/');
  });

  test('config entries without pack content and pack content not offered are flagged', async ({ page }) => {
    await open(page);
    const r = await reportOf(page, PACK_CONFIG, { paths: PACK_PATHS, json: PACK_JSON });
    const byKind = k => r.pack.filter(w => w.kind === k).map(w => w.path || w.slot + ':' + w.packId);
    expect(byKind('missing')).toEqual(['wings.bat_wings', 'auras.electric_aura', 'trails.rune_trail.motes[1].model']);
    expect(r.pack.filter(w => w.kind === 'unoffered').map(w => w.slot + ':' + w.packId)).toEqual(['wings:declared_only', 'wings:extra_wings', 'auras:frost_aura', 'trails:unused_mote']);
    expect(r.pack.find(w => w.path === 'marker-key').text).toContain('« beltaria:other » ≠ config.yml « beltaria:id »');
    expect(r.pack.find(w => w.path === 'wings.bat_wings').text).toContain('le support reste en pierre');
    // PackBuild.java:1286-1288 / 1381-1392: one id in two categories breaks the pack assembly
    const shared = await reportOf(page, PACK_CONFIG, { paths: PACK_PATHS.concat(['pack-src/auras/fairy_wings/model.json']), json: PACK_JSON });
    expect(shared.pack.find(w => w.kind === 'pack' && w.level === 'error').text).toContain('auras/fairy_wings : deja le nom de wings/fairy_wings ; le pack les reconnait par le meme marqueur');
  });

  test('the folder picker loads a real pack folder and offers its content', async ({ page }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-pack-'));
    const root = path.join(dir, 'pack-src');
    for (const p of PACK_PATHS) {
      const f = path.join(dir, p);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, p.endsWith('pack.json') ? PACK_JSON : '{}');
    }
    try {
      await open(page);
      await page.evaluate(c => window.CosmeticsApp.loadText(c, 'config.yml'), PACK_CONFIG);
      await page.locator('#filePackDir').setInputFiles(root);
      await expect(page.locator('#status')).toContainText('Pack « pack-src/ » chargé : 3 ailes, 1 auras, 2 modèles');
      await expect(page.locator('#entryList li[data-id="bat_wings"] .chip.warn')).toHaveText('pierre');
      await expect(page.locator('#entryList li[data-id="fairy_wings"] .chip.ok')).toHaveText('modèle');
      await page.locator('#packSuggest button', { hasText: '+ extra_wings' }).click();
      const text = await page.evaluate(() => window.CosmeticsApp.text());
      expect(text).toContain('  bat_wings:\n    name: "&8Chauve-souris"\n  extra_wings:\n    name: "&fExtra Wings"\nauras:');
      await expect(page.locator('#issueList')).toContainText('aucun modèle wings/bat_wings dans le pack');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

const COMMENTED = [
  '# En-tête : ne pas toucher.',
  'enabled: true',
  '',
  '# Titres',
  'menu:',
  '  title: "&8Ailes" # le menu /wings',
  '',
  'pack:',
  '  self:',
  '    port: 8163',
  '    public-address: "play.example.org" # adresse publique',
  '',
  '# Les ailes, dans l\'ordre du menu.',
  'wings:',
  '  fairy_wings:',
  '    name: "&dAiles de fee"',
  '    lore:',
  '      - "&7Legeres et lumineuses."',
  '  bat_wings:',
  '    name: "&8Ailes de chauve-souris"',
  '  # Importées : noms à traduire.',
  '  ghoul_wings:',
  '    name: "&dGhoul Wings"',
  '',
  '# Auras : aucune pour l\'instant.',
  'auras: {}',
  '',
  'trails:',
  '  rune_trail:',
  '    name: "&dRunes"',
  '    motes:',
  '      - model: rune_mote',
  '        motion: orbit',
  '        count: 3',
  '        height: 0.45',
  '        bob: 0.05',
  '# fin du fichier',
  ''
].join('\n');

/** Runs edits in the page; returns the text after each step. */
const edits = (page, start, steps) => page.evaluate(([text, steps]) => {
  const L = window.CosmeticsLogic;
  const out = [];
  let t = text;
  for (const [op, p, v] of steps) {
    if (op === 'set') t = L.setValue(t, p, v === '__undefined__' ? undefined : v);
    else if (op === 'rename') t = L.renameKey(t, p, v);
    else if (op === 'move') t = L.moveKey(t, p, v);
    out.push(t);
  }
  return out;
}, [start, steps]);
const commentLines = t => t.split('\n').filter(l => /^\s*#/.test(l) || /\s#\s/.test(l));

test.describe('comment-preserving round trip', () => {
  test('no edit: the file comes out byte for byte, LF and CRLF', async ({ page }) => {
    await open(page);
    for (const text of [COMMENTED, COMMENTED.replace(/\n/g, '\r\n')]) {
      await page.evaluate(t => window.CosmeticsApp.loadText(t, 'config.yml'), text);
      expect(await page.evaluate(() => window.CosmeticsApp.text())).toBe(text);
      await expect(page.locator('#diffCount')).toHaveText('0 ligne(s)');
    }
    const crlf = await edits(page, COMMENTED.replace(/\n/g, '\r\n'), [['set', ['wings', 'bat_wings', 'name'], '&7Ailes']]);
    expect(crlf[0]).toBe(COMMENTED.replace('"&8Ailes de chauve-souris"', '"&7Ailes"').replace(/\n/g, '\r\n'));
  });

  test('each edit touches only its own lines', async ({ page }) => {
    await open(page);
    const [rename1, lore, aura, port, comment, motes, removed, renamed, moved, declined, newSection] = await edits(page, COMMENTED, [
      ['set', ['wings', 'bat_wings', 'name'], '&7Ailes sombres'],
      ['set', ['wings', 'ghoul_wings', 'lore'], ['&7Une', '&8Deux']],
      ['set', ['auras', 'electric_aura'], { name: '&bAura electrique' }],
      ['set', ['pack', 'self', 'port'], 9000],
      ['set', ['pack', 'self', 'public-address'], 'mc.example.org'],
      ['set', ['trails', 'rune_trail', 'motes'], [{ model: 'rune_mote', motion: 'spiral', count: 2 }]],
      ['set', ['wings', 'ghoul_wings', 'lore'], '__undefined__'],
      ['rename', ['wings', 'bat_wings'], 'night_wings'],
      ['move', ['wings', 'ghoul_wings'], -1],
      ['set', ['pack', 'kick-messages', 'declined'], '&cRefusé.\n&7Reconnectez-vous.'],
      ['set', ['menu', 'auras-title'], '&8Mes auras']
    ]);
    expect(rename1).toBe(COMMENTED.replace('    name: "&8Ailes de chauve-souris"', '    name: "&7Ailes sombres"'));
    expect(lore).toContain('  ghoul_wings:\n    name: "&dGhoul Wings"\n    lore:\n      - "&7Une"\n      - "&8Deux"\n\n# Auras');
    expect(aura).toContain("# Auras : aucune pour l'instant.\nauras:\n  electric_aura:\n    name: \"&bAura electrique\"\n\ntrails:");
    expect(port).toContain('    port: 9000\n    public-address: "play.example.org" # adresse publique');
    expect(comment).toContain('    public-address: "mc.example.org" # adresse publique');
    expect(motes).toContain('    motes:\n      - model: rune_mote\n        motion: spiral\n        count: 2\n# fin du fichier');
    expect(removed).not.toContain('- "&7Une"');
    expect(renamed).toContain('  night_wings:\n    name: "&7Ailes sombres"');
    // the swap keeps the comment between the two entries where it was
    expect(moved).toContain('  ghoul_wings:\n    name: "&dGhoul Wings"\n  # Importées : noms à traduire.\n  night_wings:\n    name: "&7Ailes sombres"\n');
    expect(moved.indexOf('  ghoul_wings:')).toBeLessThan(moved.indexOf('  night_wings:'));
    expect(declined).toContain('  self:\n    port: 9000\n    public-address: "mc.example.org" # adresse publique\n  kick-messages:\n    declined: |-\n      &cRefusé.\n      &7Reconnectez-vous.\n');
    expect(newSection).toContain('  title: "&8Ailes" # le menu /wings\n  auras-title: "&8Mes auras"\n');
    // every comment of the original survives every step
    for (const c of commentLines(COMMENTED)) expect(newSection).toContain(c.trim().startsWith('#') ? c.trim() : '# ');
    for (const c of ['# En-tête : ne pas toucher.', '# Titres', "# Les ailes, dans l'ordre du menu.", '# Importées : noms à traduire.', "# Auras : aucune pour l'instant.", '# fin du fichier', '# le menu /wings', '# adresse publique']) expect(newSection).toContain(c);
    // and js-yaml reads back exactly the intended values
    const data = await page.evaluate(t => window.CosmeticsLogic.parseYaml(t).data, newSection);
    expect(data.pack).toEqual({ self: { port: 9000, 'public-address': 'mc.example.org' }, 'kick-messages': { declined: '&cRefusé.\n&7Reconnectez-vous.' } });
    expect(Object.keys(data.wings)).toEqual(['fairy_wings', 'ghoul_wings', 'night_wings']);
    expect(data.auras).toEqual({ electric_aura: { name: '&bAura electrique' } });
  });

  test('removing the last key keeps the entry (x: {}), a missing parent is created, refused edits leave the text', async ({ page }) => {
    await open(page);
    const [noName, created] = await edits(page, COMMENTED, [
      ['set', ['wings', 'bat_wings', 'name'], '__undefined__'],
      ['set', ['pack', 'external', 'url'], 'https://cdn.example.org/pack.zip']
    ]);
    // a bare "bat_wings:" would be null, and Bukkit drops null keys (MemorySection.java:186-191)
    expect(noName).toContain('  bat_wings: {}\n  # Importées');
    expect(created).toContain('    public-address: "play.example.org" # adresse publique\n  external:\n    url: "https://cdn.example.org/pack.zip"\n');
    const refused = await page.evaluate(t => { try { window.CosmeticsLogic.setValue(t, ['menu', 'title', 'x'], 1); return 'accepted'; } catch (e) { return e.name + ': ' + e.message; } }, COMMENTED);
    expect(refused).toMatch(/^EditError: menu\.title n'est pas un bloc/);
    // through the UI: a refused edit leaves the text untouched
    await page.evaluate(t => window.CosmeticsApp.loadText(t, 'config.yml'), COMMENTED);
    const ok = await page.evaluate(() => window.CosmeticsApp.edit((t, L) => L.setValue(t, ['menu', 'title', 'x'], 1)));
    expect(ok).toBe(false);
    expect(await page.evaluate(() => window.CosmeticsApp.text())).toBe(COMMENTED);
    await expect(page.locator('#status')).toHaveClass(/st-note-error/);
  });

  test('property: random edits keep comments, untouched keys, and land exactly', async ({ page }) => {
    await open(page);
    const res = await page.evaluate(start => {
      const L = window.CosmeticsLogic;
      let seed = 1234567;
      const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
      const comments = start.split('\n').filter(l => l.trim().startsWith('#')).map(l => l.trim());
      const ids = ['fairy_wings', 'bat_wings', 'ghoul_wings'];
      const words = ['&dX', '&7deux mots', 'plain', '"quote"', "l'apostrophe", '# pas un commentaire', 'a: b', '&8&lGras', 'é à ç', ''];
      let t = start, failures = [];
      for (let step = 0; step < 150; step++) {
        const id = ids[rnd(ids.length)];
        const before = L.parseYaml(t).data;
        const kind = rnd(5);
        let p, v;
        if (kind === 0) { p = ['wings', id, 'name']; v = words[rnd(words.length - 1)]; }
        else if (kind === 1) { p = ['wings', id, 'lore']; v = rnd(3) ? Array.from({ length: 1 + rnd(3) }, () => words[rnd(words.length)]) : undefined; }
        else if (kind === 2) { p = ['wings', id, 'icon-data']; v = rnd(4) ? rnd(16) : undefined; }
        else if (kind === 3) { p = ['wings', id, 'permission']; v = rnd(2) ? 'rank.' + rnd(9) : undefined; }
        else { p = ['menu', 'title']; v = words[rnd(words.length - 1)]; }
        try { t = L.setValue(t, p, v); } catch (e) { failures.push(step + ': ' + e.message); continue; }
        const after = L.parseYaml(t).data;
        const got = L.rawAt(after, p);
        if (v === undefined ? got !== undefined : !L.deepEqual(got, v)) failures.push(step + ': value ' + JSON.stringify(got) + ' != ' + JSON.stringify(v));
        // untouched keys: everything outside the edited key is unchanged
        const strip = (d) => { const c = JSON.parse(JSON.stringify(d)); let o = c; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; delete o[p[p.length - 1]]; return c; };
        if (JSON.stringify(strip(before)) !== JSON.stringify(strip(after))) failures.push(step + ': other keys changed');
        for (const c of comments) if (t.indexOf(c) < 0) failures.push(step + ': lost comment ' + c);
      }
      return { failures, text: t };
    }, COMMENTED);
    expect(res.failures).toEqual([]);
    expect(res.text).toContain('# fin du fichier');
  });

  test('the editor writes targeted edits and the snippet shows the entry', async ({ page }) => {
    await open(page);
    await page.evaluate(t => window.CosmeticsApp.loadText(t, 'config.yml'), COMMENTED);
    await page.locator('#entryList li[data-id="bat_wings"] .main').click();
    await page.locator('#edName').fill('&5Ailes de nuit');
    await page.locator('#edLore').fill('&7Ligne 1\n&7Ligne 2');
    await page.locator('#edIcon').fill('feather');
    await expect(page.locator('#diffCount')).toHaveText('6 ligne(s)');
    const text = await page.evaluate(() => window.CosmeticsApp.text());
    expect(text).toBe(COMMENTED.replace('    name: "&8Ailes de chauve-souris"', '    name: "&5Ailes de nuit"\n    lore:\n      - "&7Ligne 1"\n      - "&7Ligne 2"\n    icon: feather'));
    await expect(page.locator('#snippetBox')).toHaveText('wings:\n  bat_wings:\n    name: "&5Ailes de nuit"\n    lore:\n      - "&7Ligne 1"\n      - "&7Ligne 2"\n    icon: feather');
    // move up, then undo
    await page.locator('#entryList li[data-id="bat_wings"] button[data-dir="-1"]').click();
    expect(await page.locator('#entryList li .eid').allTextContents()).toEqual(['bat_wings', 'fairy_wings', 'ghoul_wings']);
    await page.locator('#undoBtn').click();
    expect(await page.locator('#entryList li .eid').allTextContents()).toEqual(['fairy_wings', 'bat_wings', 'ghoul_wings']);
    // trail swarm editor writes the motes list
    await page.locator('#slotTabs button[data-slot="trails"]').click();
    await page.locator('#edMotes .swarm [data-k="count"]').fill('5');
    expect(await page.evaluate(() => window.CosmeticsApp.text())).toContain('      - model: rune_mote\n        motion: orbit\n        count: 5\n        height: 0.45\n        bob: 0.05\n# fin du fichier');
  });
});

test.describe('menu preview', () => {
  test('MenuLayout parity (MenuLayoutTest.java)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const L = window.CosmeticsLogic;
      const m = (n, p) => L.menuLayout(n, p);
      const throws = f => { try { f(); return false; } catch (e) { return true; } };
      const invariant = [];
      for (let count = 0; count <= 135; count++) {
        const pages = m(count).pages;
        let seen = 0;
        for (let page = 0; page < pages; page++) {
          const c = m(count, page);
          if (c.size % 9 || c.size > 54 || c.removeSlot >= c.size) invariant.push('size ' + count + '/' + page);
          for (let local = 0; local < c.onPage; local++) { if (local >= c.size - 9) invariant.push('in controls ' + count); seen++; }
          if ((c.previousSlot >= 0) !== (page > 0) || (c.nextSlot >= 0) !== (page < pages - 1)) invariant.push('arrows ' + count + '/' + page);
        }
        if (seen !== count) invariant.push('seen ' + count);
      }
      return {
        small: [m(0).size, m(1).size, m(9).size, m(9).pages],                       // :15-20
        rows: [m(10).size, m(18).size, m(19).size],                                 // :48-52
        options: [m(9).optionsSlot, m(9).removeSlot, m(100).optionsSlot],          // :34-45
        full: [m(45).size, m(45).removeSlot, m(45).previousSlot, m(45).nextSlot],  // :55-64
        paged: [m(47).pages, m(47).size, m(47, 1).size, m(47).onPage, m(47, 1).onPage, m(47, 1).firstIndex], // :67-86
        arrows: [m(100).previousSlot, m(100).nextSlot, m(100, 1).previousSlot, m(100, 1).nextSlot, m(100, 2).nextSlot, m(100, 2).onPage], // :89-106
        remove3: m(3).removeSlot,                                                   // :109-115
        refused: [throws(() => m(-1)), throws(() => m(2, 1)), throws(() => m(2, -1))], // :152-163
        invariant
      };
    });
    expect(r.small).toEqual([18, 18, 18, 1]);
    expect(r.rows).toEqual([27, 27, 36]);
    expect(r.options).toEqual([15, 13, 51]);
    expect(r.full).toEqual([54, 49, -1, -1]);
    expect(r.paged).toEqual([2, 54, 54, 45, 2, 45]);
    expect(r.arrows).toEqual([-1, 53, 45, 53, -1, 10]);
    expect(r.remove3).toBe(13);
    expect(r.refused).toEqual([true, true, true]);
    expect(r.invariant).toEqual([]);
  });

  test('the chest is drawn at GuiChest size with BC\'s items and 1.8 tooltips', async ({ page }) => {
    await open(page);
    // example: 4 wings -> 2 rows -> ySize 114 + 2*18 = 150 GUI px at scale 2
    const size = await page.evaluate(() => { const c = document.getElementById('chest'); return [c.width, c.height]; });
    expect(size).toEqual([352, 300]);
    const menu = await page.evaluate(() => { const m = window.CosmeticsApp.menu(); return { size: m.layout.size, kinds: m.items.map(i => (i ? i.kind : null)) }; });
    expect(menu.size).toBe(18);
    expect(menu.kinds.slice(0, 4)).toEqual(['entry', 'entry', 'entry', 'entry']);
    expect([menu.kinds[13], menu.kinds[15]]).toEqual(['remove', 'options']);
    // tooltip of fairy_wings: rarity + italic before the name, purple italic lore, status line (WingsMenu.java:204-237)
    expect(await page.evaluate(() => window.CosmeticsApp.tooltip())).toEqual(['\u00a7f\u00a7o\u00a7dAiles de fee', '\u00a77\u00a75\u00a7o\u00a77Legeres et lumineuses.', '\u00a77\u00a75\u00a7o', '\u00a77\u00a75\u00a7o\u00a7eCliquez pour equiper']);
    // click slot 0 on the canvas: equipped, glint (aqua name), chat message
    const at = async k => {                       // centre of slot k, GUI px -> CSS px
      const guiW = await page.evaluate(() => document.getElementById('chest').width / 2);
      const box = await page.locator('#chest').boundingBox();
      const f = box.width / guiW;
      const gx = 8 + (k % 9) * 18 + 8, gy = 18 + Math.floor(k / 9) * 18 + 8;
      await page.mouse.click(box.x + gx * f, box.y + gy * f);
    };
    await at(0);
    let tip = await page.evaluate(() => window.CosmeticsApp.tooltip());
    expect(tip[0]).toBe('\u00a7b\u00a7o\u00a7dAiles de fee');
    expect(tip[tip.length - 1]).toBe('\u00a77\u00a75\u00a7o\u00a7aEquipees');
    expect(await page.evaluate(() => window.CosmeticsApp.state.chat)).toBe('\u00a76Ailes equipees : \u00a7r\u00a7dAiles de fee');
    // the remove button now says how to take them off
    expect(await page.evaluate(() => window.CosmeticsApp.menu().items[13].lore)).toEqual(["\u00a77Cliquez pour ne plus porter d'ailes."]);
    // a player without permission: locked, and the click is denied
    await page.selectOption('#viewer', 'none');
    await at(1);
    tip = await page.evaluate(() => window.CosmeticsApp.tooltip());
    expect(tip[tip.length - 1]).toBe('\u00a77\u00a75\u00a7o\u00a7cVerrouillees');
    expect(await page.evaluate(() => window.CosmeticsApp.state.chat)).toBe("\u00a7cVous n'avez pas acces a ces ailes.");
    // custom nodes: the node itself or the slot wildcard
    await page.selectOption('#viewer', 'custom');
    await page.locator('#viewerNodes').fill('beltaria.content.wings.bat_wings');
    expect(await page.evaluate(() => window.CosmeticsApp.menu().items.slice(0, 4).map(i => i.allowed))).toEqual([false, true, false, false]);
    await page.locator('#viewerNodes').fill('BELTARIA.content.wings.*');
    expect(await page.evaluate(() => window.CosmeticsApp.menu().items.slice(0, 4).map(i => i.allowed))).toEqual([true, true, true, true]);
  });

  test('pagination: 47 wings make two 54-slot pages with arrows', async ({ page }) => {
    await open(page);
    let yaml = 'enabled: true\nwings:\n';
    for (let i = 0; i < 47; i++) yaml += '  w' + i + ':\n    name: "&fW' + i + '"\n';
    await page.evaluate(t => window.CosmeticsApp.loadText(t, 'config.yml'), yaml);
    let m = await page.evaluate(() => { const m = window.CosmeticsApp.menu(); return { size: m.layout.size, next: m.items[53] && m.items[53].lore, prev: m.items[45] }; });
    expect(m).toEqual({ size: 54, next: ['\u00a77Vers la page 2 sur 2.'], prev: null });
    expect(await page.evaluate(() => [document.getElementById('chest').width, document.getElementById('chest').height])).toEqual([352, (114 + 6 * 18) * 2]);
    await page.evaluate(() => window.CosmeticsApp.clickSlot(53));
    m = await page.evaluate(() => { const m = window.CosmeticsApp.menu(); return { page: m.layout.page, entries: m.items.filter(i => i && i.kind === 'entry').map(i => i.entry.id), prev: m.items[45].lore, next: m.items[53] }; });
    expect(m).toEqual({ page: 1, entries: ['w45', 'w46'], prev: ['\u00a77Vers la page 1 sur 2.'], next: null });
    await expect(page.locator('#pgInfo')).toHaveText('page 2 / 2');
  });
});

test.describe('page', () => {
  test('phone width: no horizontal scroll, with the pack and the swarm editor open', async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page);
    await page.locator('#demoPackBtn').click();
    await expect(page.locator('#status')).toContainText('Pack « pack d\'exemple » chargé');
    for (const slot of ['wings', 'auras', 'trails']) {
      await page.locator(`#slotTabs button[data-slot="${slot}"]`).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, slot).toBeLessThanOrEqual(1);
    }
    await page.locator('details:has(#source) > summary').click();
    await page.locator('#set_menu__title').fill('&8Un titre bien trop long pour le coffre');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const chest = await page.locator('#chest').boundingBox();
    expect(chest.x + chest.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: shotPath(info, 'phone-375.png'), fullPage: true });
  });

  test('no console errors through a full session; desktop screenshots', async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);
    await page.locator('#demoPackBtn').click();
    await page.locator('#entryList li[data-id="angel_wings"] .main').click();
    await page.locator('#edLore').fill('&7Plumes blanches');
    await page.locator('#chest').hover({ position: { x: 40, y: 50 } });
    await page.screenshot({ path: shotPath(info, 'desktop-wings.png'), fullPage: true });
    await page.locator('#slotTabs button[data-slot="trails"]').click();
    await page.locator('#edAddSwarm').click();
    await page.locator('#slotTabs button[data-slot="auras"]').click();
    await page.locator('#addId').fill('frost_aura');
    await page.locator('#addBtn').click();
    await page.locator('#viewer').selectOption('none');
    await page.locator('#set_pack__hosting').selectOption('external', { force: true }).catch(async () => {
      await page.locator('details:has(#set_pack__hosting) > summary').click();
      await page.locator('#set_pack__hosting').selectOption('external');
    });
    await expect(page.locator('#consoleLine')).toContainText('pack.external.url : URL attendue avec hosting: external');
    await page.locator('#undoBtn').click();
    await page.locator('#resetBtn').click();
    await page.locator('#exampleBtn').click();
    await page.screenshot({ path: shotPath(info, 'desktop-diagnostic.png'), fullPage: true });
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
});
