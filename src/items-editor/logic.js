/* ===================== ItemsLogic : items.yml tel que BeltariaContent le lit ===================== */
// Chaque règle cite sa source : BeltariaContent (src/main/java/fr/beltaria/content/...), l'API
// beltariaspigot 1.8.8 (org/bukkit/...), CraftBukkit de BeltariaSpigot, et MCP 1.8.9 (stable_22).
(function () {
  'use strict';
  const MC = JSON.parse(document.getElementById('mc-data').textContent);
  const Y = window.jsyaml;

  /* ---------- citations ---------- */
  const R = {
    id: 'ItemsConfig.java:53, 72-75',
    entryBlock: 'ItemsConfig.java:76 ; ConfigValues.java:130-147',
    materialAbsent: 'ItemsConfig.java:87-89 ; ConfigValues.java:149-152',
    materialUnknown: 'ConfigValues.java:153-156 ; Material.matchMaterial (Material.java:670-687)',
    air: 'ItemsConfig.java:90-93',
    data: 'ItemsConfig.java:95-99',
    amount: 'ItemsConfig.java:101-106',
    getInt: 'MemorySection.getInt (MemorySection.java:299-302)',
    getString: 'MemorySection.getString (MemorySection.java:284-287)',
    getDouble: 'MemorySection.getDouble (MemorySection.java:329-332)',
    getBoolean: 'MemorySection.getBoolean (MemorySection.java:314-317)',
    getList: 'MemorySection.getList (MemorySection.java:377-380)',
    getStringList: 'MemorySection.getStringList (MemorySection.java:387-403)',
    name: 'ItemsConfig.java:108-109, 161-163 ; ChatColor.translateAlternateColorCodes',
    lore: 'ItemsConfig.java:111-115 ; ConfigValues.java:95-101',
    enchBlock: 'ItemsConfig.java:117-120 ; ConfigValues.java:130-147',
    enchName: 'ItemsConfig.java:121-123 ; ConfigValues.java:172-183',
    enchLevel: 'ItemsConfig.java:124 ; ConfigValues.java:66-75',
    flags: 'ItemsConfig.java:127-132 ; ConfigValues.java:185-194',
    marker: 'ItemsConfig.java:134-140',
    blockMarker: 'ItemsConfig.java:142-148',
    blockSection: 'ItemsConfig.java:149-150 ; ConfigValues.java:130-147',
    anchor: 'BlockPlacement.java:41-47, 70-77',
    spin: 'BlockPlacement.java:52, 79-84',
    bob: 'BlockPlacement.java:53, 85-89',
    unbreakable: 'ItemsConfig.java:155',
    nullDrop: 'YamlConfiguration.convertMapsToSections (YamlConfiguration.java:86-98) ; MemorySection.set (MemorySection.java:186-191)',
    dotSplit: 'MemorySection.createSection / set (MemorySection.java:162-262) : le point sépare les sections',
    yamlFatal: 'YamlConfiguration.loadConfiguration (YamlConfiguration.java:188-203) ; BeltariaContent.loadItems (BeltariaContent.java:347-353)',
    duplicate: 'SnakeYAML 1.33 SafeConstructor.processDuplicateKeys (allowDuplicateKeys par défaut)',
    shortLevel: 'CraftMetaItem.applyEnchantments (CraftMetaItem.java:648, shortValue)',
    levelLang: 'Enchantment.getTranslatedName (Enchantment.java:196-200) ; StringTranslate.tryTranslateKey (StringTranslate.java:126-130) ; en_US.lang:1383-1392',
    noItem: 'CraftItemStack.asNMSCopy (CraftItemStack.java:40-44)',
    unknownKey: 'ItemsConfig.java:86-159 ne lit que ces clés',
    readme: 'README « Blocs personnalisés et caisses » : height et radius ignorées',
    pack: 'CatalogueMatchesPackTest.java:56-67',
    hideFlags: 'CraftMetaItem.getBitModifier (CraftMetaItem.java:776-778) ; ItemStack.getTooltip (ItemStack.java:696-704, 797-850)'
  };

  /* ---------- Java value model (what SnakeYAML hands to Bukkit) ---------- */
  const INT_MIN = -(2n ** 31n), INT_MAX = 2n ** 31n - 1n, LONG_MIN = -(2n ** 63n), LONG_MAX = 2n ** 63n - 1n;
  class JNum {
    constructor(kind, big, dbl) { this.kind = kind; this.big = big; this.dbl = dbl; }
    get [Symbol.toStringTag]() { return 'JavaNumber'; }
    toString() { return this.kind === 'Double' ? javaDouble(this.dbl) : this.big.toString(); }
    /** Number.intValue() : Integer tel quel, Long/BigInteger tronqués à 32 bits, Double comme (int). */
    intValue() {
      if (this.kind === 'Double') {
        const d = this.dbl;
        if (Number.isNaN(d)) return 0;
        if (d >= 2147483647) return 2147483647;
        if (d <= -2147483648) return -2147483648;
        return Math.trunc(d);
      }
      return Number(BigInt.asIntN(32, this.big));
    }
    doubleValue() { return this.kind === 'Double' ? this.dbl : Number(this.big); }
  }
  class JDate {
    constructor(s) { this.s = s; }
    get [Symbol.toStringTag]() { return 'JavaDate'; }
    toString() { return this.s; }
  }
  function intKind(big) { return big >= INT_MIN && big <= INT_MAX ? 'Integer' : (big >= LONG_MIN && big <= LONG_MAX ? 'Long' : 'BigInteger'); }
  function jInt(n) { const b = BigInt(n); return new JNum(intKind(b), b, null); }

  /** Double.toString (JDK 19+ : plus courte écriture, comme JavaScript). */
  function javaDouble(d) {
    if (Number.isNaN(d)) return 'NaN';
    if (d === Infinity) return 'Infinity';
    if (d === -Infinity) return '-Infinity';
    if (d === 0) return Object.is(d, -0) ? '-0.0' : '0.0';
    const a = Math.abs(d);
    if (a >= 1e-3 && a < 1e7) {
      let s = String(d);
      if (/e/.test(s)) s = d.toFixed(20).replace(/0+$/, '');
      if (!s.includes('.')) s += '.0';
      if (s.endsWith('.')) s += '0';
      return s;
    }
    let [m, e] = d.toExponential().split('e');
    if (!m.includes('.')) m += '.0';
    return m + 'E' + (e[0] === '+' ? e.slice(1) : e);
  }

  /* ---------- SnakeYAML 1.33 implicit resolver (YAML 1.1), as js-yaml types ---------- */
  const RE_BOOL = /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/;
  const RE_INT = /^(?:[-+]?0b_*[0-1]+[0-1_]*|[-+]?0_*[0-7]+[0-7_]*|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x_*[0-9a-fA-F]+[0-9a-fA-F_]*|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/;
  const RE_FLOAT = /^(?:[-+]?(?:\.[0-9]+|[0-9_]+(?:\.[0-9_]*)?)(?:[eE][-+]?[0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
  const RE_NULL = /^(?:~|null|Null|NULL| )$/;
  const RE_TS = /^(?:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]|[0-9][0-9][0-9][0-9]-[0-9][0-9]?-[0-9][0-9]?(?:[Tt]|[ \t]+)[0-9][0-9]?:[0-9][0-9]:[0-9][0-9](?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9][0-9]?(?::[0-9][0-9])?))?)$/;
  // Resolver.addImplicitResolvers : un résolveur n'est essayé que si le premier caractère figure dans sa liste.
  const FIRST_BOOL = 'yYnNtTfFoO', FIRST_NUM = '-+0123456789', FIRST_FLOAT = '-+0123456789.', FIRST_NULL = '~nN\0', FIRST_TS = '0123456789';

  function implicitTag(s) {
    if (s === '') return 'null';
    const c = s[0];
    if (FIRST_BOOL.includes(c) && RE_BOOL.test(s)) return 'bool';
    if (FIRST_NUM.includes(c) && RE_INT.test(s)) return 'int';
    if (FIRST_FLOAT.includes(c) && RE_FLOAT.test(s)) return 'float';
    if (s === '<<') return 'merge';
    if (FIRST_NULL.includes(c) && RE_NULL.test(s)) return 'null';
    if (FIRST_TS.includes(c) && RE_TS.test(s)) return 'timestamp';
    return 'str';
  }
  /** SafeConstructor.ConstructYamlInt + createNumber (Integer, puis Long, puis BigInteger). */
  function constructInt(s) {
    let v = s.replace(/_/g, ''), neg = false;
    if (v[0] === '-') { neg = true; v = v.slice(1); } else if (v[0] === '+') v = v.slice(1);
    let big;
    if (v === '0') big = 0n;
    else if (v.startsWith('0b')) big = BigInt('0b' + v.slice(2));
    else if (v.startsWith('0x')) big = BigInt('0x' + v.slice(2));
    else if (v.startsWith('0')) big = BigInt('0o' + v.slice(1));
    else if (v.includes(':')) {
      const d = v.split(':');
      let bes = 1n, val = 0n;
      for (let i = 0; i < d.length; i++) { val += BigInt(d[d.length - 1 - i]) * bes; bes *= 60n; }
      big = val;
    } else big = BigInt(v);
    if (neg) big = -big;
    return new JNum(intKind(big), big, null);
  }
  /** SafeConstructor.ConstructYamlFloat. */
  function constructFloat(s) {
    let v = s.replace(/_/g, ''), sign = 1;
    const low = v.toLowerCase();
    if (low === '.inf' || low === '+.inf') return new JNum('Double', null, Infinity);
    if (low === '-.inf') return new JNum('Double', null, -Infinity);
    if (low === '.nan') return new JNum('Double', null, NaN);
    if (v.includes(':')) {
      if (v[0] === '-') { sign = -1; v = v.slice(1); } else if (v[0] === '+') v = v.slice(1);
      const d = v.split(':');
      let bes = 1, val = 0;
      for (let i = 0; i < d.length; i++) { val += parseFloat(d[d.length - 1 - i]) * bes; bes *= 60; }
      return new JNum('Double', null, sign * val);
    }
    return new JNum('Double', null, Number(v));
  }
  const T = Y.Type;
  const tNull = new T('tag:yaml.org,2002:null', { kind: 'scalar', resolve: s => s === null || s === '' || RE_NULL.test(s), construct: () => null, predicate: o => o === null, represent: () => '~' });
  const tBool = new T('tag:yaml.org,2002:bool', { kind: 'scalar', resolve: s => s !== null && RE_BOOL.test(s), construct: s => /^(?:yes|true|on)$/i.test(s), predicate: o => typeof o === 'boolean', represent: o => String(o) });
  const tInt = new T('tag:yaml.org,2002:int', { kind: 'scalar', resolve: s => s !== null && RE_INT.test(s), construct: constructInt, instanceOf: JNum, represent: o => o.toString() });
  const tFloat = new T('tag:yaml.org,2002:float', { kind: 'scalar', resolve: s => s !== null && RE_FLOAT.test(s), construct: constructFloat, predicate: o => o instanceof JNum && o.kind === 'Double', represent: o => o.toString() });
  const tTs = new T('tag:yaml.org,2002:timestamp', { kind: 'scalar', resolve: s => s !== null && RE_TS.test(s), construct: s => new JDate(s), instanceOf: JDate, represent: o => o.s });
  const SNAKE = Y.FAILSAFE_SCHEMA.extend({
    implicit: [tNull, tBool, tInt, tFloat, Y.types.merge, tTs],
    explicit: [Y.types.binary, Y.types.omap, Y.types.pairs, Y.types.set]
  });

  /** yaml.load comme Bukkit : null pour un fichier vide, erreur pour une syntaxe fautive. */
  function parseYaml(text) {
    try {
      const v = Y.load(text, { schema: SNAKE, json: true, filename: 'items.yml' });
      return { ok: true, value: v === undefined ? null : v };
    } catch (e) {
      const m = e.mark;
      return { ok: false, error: { message: e.reason || e.message, line: m ? m.line + 1 : null, column: m ? m.column + 1 : null, snippet: m && m.snippet ? m.snippet : '' } };
    }
  }

  function isMap(v) { return v !== null && typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]' && !(v instanceof Sec); }
  /** Object.toString côté Java (ce que getString et les messages de ConfigValues affichent). */
  function javaString(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return String(v);
    if (v instanceof JNum || v instanceof JDate || v instanceof Sec) return v.toString();
    if (Array.isArray(v)) return '[' + v.map(javaString).join(', ') + ']';
    if (isMap(v)) return '{' + Object.keys(v).map(k => k + '=' + javaString(v[k])).join(', ') + '}';
    if (v instanceof Uint8Array || (typeof Buffer !== 'undefined' && v instanceof Buffer)) return '[B@…';
    return String(v);
  }

  /* ---------- Bukkit MemorySection, as YamlConfiguration.convertMapsToSections builds it ---------- */
  class Sec {
    constructor(path) { this.path = path; this.map = new Map(); }
    get [Symbol.toStringTag]() { return 'MemorySection'; }
    toString() { return "MemorySection[path='" + this.path + "', root='YamlConfiguration']"; }
    get(k) { return this.map.has(k) ? this.map.get(k) : null; }
    has(k) { return this.map.has(k); }
    keys() { return [...this.map.keys()]; }
  }
  function childPath(sec, key) { return sec.path ? sec.path + '.' + key : key; }
  function walk(sec, path, problems) {
    if (path === '') { problems.push('chemin vide'); return null; }
    const parts = path.split('.');
    let s = sec;
    for (let i = 0; i < parts.length - 1; i++) {
      const node = parts[i];
      if (node === '') { problems.push('chemin vide dans « ' + path + ' »'); return null; }
      const sub = s.get(node);
      if (sub instanceof Sec) s = sub;
      else { const c = new Sec(childPath(s, node)); s.map.set(node, c); s = c; }
    }
    return { s, key: parts[parts.length - 1] };
  }
  function createSection(sec, path, problems) {
    const w = walk(sec, path, problems);
    if (!w || w.key === '') { if (w) problems.push('chemin vide dans « ' + path + ' »'); return null; }
    const c = new Sec(childPath(w.s, w.key));
    w.s.map.set(w.key, c);
    return c;
  }
  function setValue(sec, path, value, problems) {
    const w = walk(sec, path, problems);
    if (!w || w.key === '') { if (w) problems.push('chemin vide dans « ' + path + ' »'); return; }
    if (value === null || value === undefined) w.s.map.delete(w.key);
    else w.s.map.set(w.key, value);
  }
  function convert(input, sec, problems) {
    for (const key of Object.keys(input)) {
      const value = input[key];
      if (isMap(value)) { const c = createSection(sec, key, problems); if (c) convert(value, c, problems); }
      else setValue(sec, key, value, problems);
    }
  }
  /** YamlConfiguration.loadFromString : syntaxe, racine en bloc, conversion en sections. */
  function loadConfiguration(text) {
    const p = parseYaml(text);
    const root = new Sec('');
    if (!p.ok) return { ok: false, fatal: 'yaml', error: p.error, root };
    if (p.value === null) return { ok: true, root, empty: true };
    if (!isMap(p.value)) return { ok: false, fatal: 'top', error: { message: 'Top level is not a Map.' }, root };
    const problems = [];
    convert(p.value, root, problems);
    if (problems.length) return { ok: false, fatal: 'path', error: { message: 'Cannot set to an empty path (' + problems[0] + ')' }, root };
    return { ok: true, root };
  }

  /* ---------- Bukkit 1.8.8 registries ---------- */
  const MATERIALS = MC.mats.map(([name, id, stack, dur], ordinal) => ({ name, id, stack, dur, ordinal }));
  const BY_NAME = new Map(MATERIALS.map(m => [m.name, m]));
  const BY_ID = [];
  for (const m of MATERIALS) BY_ID[m.id] = m;                  // Material static block (Material.java:689-697)
  /** Material.matchMaterial (Material.java:670-687) : identifiant numérique, puis nom filtré. */
  function matchMaterial(name) {
    if (/^[-+]?\d+$/.test(name)) {
      const n = Number(name);
      if (Number.isSafeInteger(n) && n >= -2147483648 && n <= 2147483647 && n >= 0 && BY_ID[n]) return BY_ID[n];
    }
    const filtered = name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
    return BY_NAME.get(filtered) || null;
  }
  // CraftEnchantment.getName (ids NMS) ; clés de langue et maxima : MCP net/minecraft/enchantment/*.java.
  const ENCHANTS = [
    ['PROTECTION_ENVIRONMENTAL', 0, 'enchantment.protect.all', 4], ['PROTECTION_FIRE', 1, 'enchantment.protect.fire', 4],
    ['PROTECTION_FALL', 2, 'enchantment.protect.fall', 4], ['PROTECTION_EXPLOSIONS', 3, 'enchantment.protect.explosion', 4],
    ['PROTECTION_PROJECTILE', 4, 'enchantment.protect.projectile', 4], ['OXYGEN', 5, 'enchantment.oxygen', 3],
    ['WATER_WORKER', 6, 'enchantment.waterWorker', 1], ['THORNS', 7, 'enchantment.thorns', 3],
    ['DEPTH_STRIDER', 8, 'enchantment.waterWalker', 3], ['DAMAGE_ALL', 16, 'enchantment.damage.all', 5],
    ['DAMAGE_UNDEAD', 17, 'enchantment.damage.undead', 5], ['DAMAGE_ARTHROPODS', 18, 'enchantment.damage.arthropods', 5],
    ['KNOCKBACK', 19, 'enchantment.knockback', 2], ['FIRE_ASPECT', 20, 'enchantment.fire', 2],
    ['LOOT_BONUS_MOBS', 21, 'enchantment.lootBonus', 3], ['DIG_SPEED', 32, 'enchantment.digging', 5],
    ['SILK_TOUCH', 33, 'enchantment.untouching', 1], ['DURABILITY', 34, 'enchantment.durability', 3],
    ['LOOT_BONUS_BLOCKS', 35, 'enchantment.lootBonusDigger', 3], ['ARROW_DAMAGE', 48, 'enchantment.arrowDamage', 5],
    ['ARROW_KNOCKBACK', 49, 'enchantment.arrowKnockback', 2], ['ARROW_FIRE', 50, 'enchantment.arrowFire', 1],
    ['ARROW_INFINITE', 51, 'enchantment.arrowInfinite', 1], ['LUCK', 61, 'enchantment.lootBonusFishing', 3],
    ['LURE', 62, 'enchantment.fishingSpeed', 3]
  ].map(([key, id, lang, max]) => ({ key, id, lang, max }));
  const ENCH_BY_NAME = new Map(ENCHANTS.map(e => [e.key, e]));
  /** Enchantment.getByName(raw.trim().toUpperCase(Locale.ROOT)) (ConfigValues.java:176). */
  function enchantmentByName(raw) { return ENCH_BY_NAME.get(javaTrim(raw).toUpperCase()) || null; }
  const FLAGS = ['HIDE_ENCHANTS', 'HIDE_ATTRIBUTES', 'HIDE_UNBREAKABLE', 'HIDE_DESTROYS', 'HIDE_PLACED_ON', 'HIDE_POTION_EFFECTS']; // ItemFlag.java (ordre = bit)
  const ANCHOR_NAMES = ['NOTE_BLOCK', 'JUKEBOX', 'CHEST', 'TRAPPED_CHEST', 'FURNACE', 'BURNING_FURNACE', 'DISPENSER', 'DROPPER', 'HOPPER', 'BEACON', 'BREWING_STAND', 'COMMAND', 'MOB_SPAWNER', 'SIGN_POST', 'WALL_SIGN', 'SKULL', 'STANDING_BANNER', 'WALL_BANNER'];
  const ANCHORS = ANCHOR_NAMES.map(n => BY_NAME.get(n)).sort((a, b) => a.ordinal - b.ordinal); // EnumSet : ordre de l'énumération
  const ENTRY_KEYS = ['material', 'data', 'amount', 'name', 'lore', 'enchantments', 'flags', 'unbreakable', 'marker', 'block'];
  const BLOCK_KEYS = ['anchor', 'spin', 'bob'];
  const ID_RE = /^[a-z0-9_-]+$/;                               // ItemsConfig.java:53
  function javaTrim(s) { let a = 0, b = s.length; while (a < b && s.charCodeAt(a) <= 32) a++; while (b > a && s.charCodeAt(b - 1) <= 32) b--; return s.slice(a, b); }
  /** ChatColor.translateAlternateColorCodes('&', raw) (ChatColor.java:323-332). */
  function colored(raw) {
    const b = raw.split('');
    for (let i = 0; i < b.length - 1; i++) {
      if (b[i] === '&' && '0123456789AaBbCcDdEeFfKkLlMmNnOoRr'.indexOf(b[i + 1]) > -1) { b[i] = '§'; b[i + 1] = b[i + 1].toLowerCase(); }
    }
    return b.join('');
  }
  const isIcon = c => c >= 0xE000 && c <= 0xFDFF;             // GlyphText.isIcon (GlyphText.java:19-25), Glyph.java:47-50
  function hasIcon(s) { for (let i = 0; i < s.length; i++) if (isIcon(s.charCodeAt(i))) return true; return false; }

  /* ---------- ItemsConfig.parse, pas à pas ---------- */
  function isNumber(v) { return v instanceof JNum; }
  function isPrimitiveWrapper(v) { return typeof v === 'boolean' || (v instanceof JNum && v.kind !== 'BigInteger'); } // MemorySection.java:710-715
  function describe(v) {
    if (v instanceof Sec) return 'un bloc';
    if (Array.isArray(v)) return 'une liste';
    if (typeof v === 'boolean') return 'un booléen (' + v + ')';
    if (v instanceof JNum) return v.kind === 'Double' ? 'un décimal (' + v + ')' : 'un entier (' + v + ')';
    if (v instanceof JDate) return 'une date YAML';
    if (typeof v === 'string') return 'un texte « ' + v + ' »';
    return 'une valeur ' + javaString(v);
  }
  /** ConfigValues.stringList + MemorySection.getStringList, avec ce qui disparaît en silence. */
  function stringList(sec, key) {
    const out = { values: [], dropped: [], notList: false };
    if (!sec.has(key)) return out;
    const v = sec.get(key);
    if (!Array.isArray(v)) { out.notList = true; return out; }
    v.forEach((o, i) => {
      if (typeof o === 'string' || isPrimitiveWrapper(o)) out.values.push(typeof o === 'string' ? o : javaString(o));
      else out.dropped.push({ index: i, value: o });
    });
    return out;
  }

  /**
   * Une entrée telle que ItemsConfig.parse la lit. errors : dans l'ordre où BC les rencontre (la
   * première arrête le chargement) ; warnings/infos : ce que BC accepte en silence.
   */
  function validateEntry(id, raw) {
    const errors = [], warnings = [], infos = [];
    const err = (field, path, problem, ref) => errors.push({ field, path, message: path + ' : ' + problem, ref });
    const warn = (field, text, ref) => warnings.push({ field, message: text, ref });
    const info = (field, text, ref) => infos.push({ field, message: text, ref });
    const item = { id, material: null, data: 0, amount: 1, name: null, rawName: null, lore: [], rawLore: [], enchants: [], flags: [], unbreakable: false, marker: id, block: null };
    if (!ID_RE.test(id)) err('id', id, 'identifiant attendu en minuscules, chiffres, _ ou -', R.id);
    if (raw === null || raw === undefined) return { errors, warnings, infos, item: null };
    if (!(raw instanceof Sec)) {
      err('entry', id, 'bloc attendu (cle: valeur), recu : ' + javaString(raw), R.entryBlock);
      return { errors, warnings, infos, item: null };
    }
    const P = k => id + '.' + k;
    for (const k of raw.keys()) {
      if (!ENTRY_KEYS.includes(k)) {
        const near = ENTRY_KEYS.find(x => x.toLowerCase() === k.toLowerCase());
        warn('unknown', 'Clé « ' + k + ' » ignorée par BeltariaContent' + (near ? ' (les clés sont sensibles à la casse : « ' + near + ' »)' : '') + '.', R.unknownKey);
      }
    }
    // material (ItemsConfig.java:87-93)
    const mv = raw.get('material');
    const mString = mv === null ? null : javaString(mv);
    let material = null;
    if (mString === null) err('material', P('material'), 'matiere absente', R.materialAbsent);
    else {
      material = matchMaterial(mString);
      if (!material) err('material', P('material'), 'matiere inconnue : ' + mString, R.materialUnknown);
      else if (material.id === 0) { err('material', P('material'), "l'air ne se donne pas", R.air); }
      else {
        if (typeof mv !== 'string' || material.name !== mString) info('material', 'Lu comme ' + material.name + ' (Material.matchMaterial accepte l\'identifiant numérique, la casse et les espaces).', R.materialUnknown);
        if (!MC.items[material.id]) warn('material', material.name + ' est un bloc sans forme d\'item en 1.8 : asNMSCopy renvoie null, aucun item à donner ni à afficher.', R.noItem);
      }
    }
    if (material && material.id === 0) material = null;
    item.material = material;
    // data (ItemsConfig.java:95-99)
    if (raw.has('data')) {
      const v = raw.get('data');
      if (!isNumber(v)) warn('data', 'data vaut ' + describe(v) + ' : pas un nombre, Bukkit prend 0 sans rien dire.', R.getInt);
      else {
        const d = v.intValue();
        if (v.kind === 'Double' && d !== v.dbl) warn('data', 'data ' + v + ' est tronqué en ' + d + ' (Number.intValue).', R.getInt);
        if (v.kind !== 'Double' && v.kind !== 'Integer') warn('data', 'data ' + v + ' dépasse un int : Number.intValue le ramène à ' + d + '.', R.getInt);
        if (d < 0 || d > 32767) err('data', P('data'), 'valeur entre 0 et 32767 attendue, recu ' + d, R.data);
        else item.data = d;
      }
    }
    // amount (ItemsConfig.java:101-106)
    let amount = 1;
    if (raw.has('amount')) {
      const v = raw.get('amount');
      if (!isNumber(v)) warn('amount', 'amount vaut ' + describe(v) + ' : pas un nombre, Bukkit prend 1 sans rien dire.', R.getInt);
      else {
        amount = v.intValue();
        if (v.kind === 'Double' && amount !== v.dbl) warn('amount', 'amount ' + v + ' est tronqué en ' + amount + '.', R.getInt);
      }
    }
    if (material && (amount < 1 || amount > material.stack)) err('amount', P('amount'), 'quantite entre 1 et ' + material.stack + ' pour ' + material.name + ', recu ' + amount, R.amount);
    else item.amount = amount;
    // name (ItemsConfig.java:108-109)
    if (raw.has('name')) {
      const v = raw.get('name');
      item.rawName = javaString(v);
      if (typeof v !== 'string') warn('name', 'name vaut ' + describe(v) + ' : Bukkit en fait le texte « ' + item.rawName + ' ».', R.getString);
      item.name = colored(item.rawName);
      if (item.rawName === '') info('name', 'Nom vide : Bukkit ne pose pas de nom (CraftMetaItem.hasDisplayName, CraftMetaItem.java:684-686), le nom vanilla s\'affiche.', 'CraftMetaItem.java:684-686');
    }
    // lore (ItemsConfig.java:111-115)
    const lore = stringList(raw, 'lore');
    if (lore.notList) warn('lore', 'lore vaut ' + describe(raw.get('lore')) + ' et non une liste : getStringList renvoie une liste vide, aucune ligne en jeu.', R.getList);
    for (const d of lore.dropped) warn('lore', 'Ligne ' + (d.index + 1) + ' du lore (' + describe(d.value) + ') ignorée par getStringList.', R.getStringList);
    item.rawLore = lore.values;
    item.lore = lore.values.map(colored);
    // enchantments (ItemsConfig.java:117-125)
    if (raw.has('enchantments')) {
      const v = raw.get('enchantments');
      if (!(v instanceof Sec)) err('enchantments', P('enchantments'), 'bloc attendu (cle: valeur), recu : ' + javaString(v), R.enchBlock);
      else {
        const seen = new Map();
        for (const key of v.keys()) {
          const path = P('enchantments') + '.' + key;
          const e = enchantmentByName(key);
          if (!e) { err('enchantments', path, 'enchantement inconnu : ' + key + ' (utiliser les noms Bukkit, ex : PROTECTION_ENVIRONMENTAL, DURABILITY, ARROW_DAMAGE)', R.enchName); continue; }
          const lv = v.get(key);
          if (!isNumber(lv)) { err('enchantments', path, 'nombre entier attendu, recu : ' + javaString(lv), R.enchLevel); continue; }
          const level = lv.intValue();
          if (level <= 0) { err('enchantments', path, 'valeur strictement positive attendue, recu ' + level, R.enchLevel); continue; }
          if (seen.has(e.key)) { warn('enchantments', key + ' et ' + seen.get(e.key).key + ' désignent ' + e.key + ' : le niveau de la dernière remplace l\'autre, à la place de la première (LinkedHashMap.put).', R.enchName); seen.get(e.key).level = level; continue; }
          const rec = { ench: e, key, level };
          seen.set(e.key, rec);
          item.enchants.push(rec);
        }
        for (const rec of item.enchants) {
          const shown = (rec.level << 16) >> 16;
          if (rec.level > 32767) warn('enchantments', rec.key + ' ' + rec.level + ' : le niveau est écrit en short dans le NBT, le client lit ' + shown + '.', R.shortLevel);
          else if (rec.level > 10) warn('enchantments', rec.key + ' ' + rec.level + ' : le client 1.8 n\'a de chiffres romains que de I à X, il affichera « enchantment.level.' + rec.level + ' ».', R.levelLang);
          else if (rec.level > rec.ench.max) info('enchantments', rec.key + ' ' + rec.level + ' dépasse le maximum vanilla (' + rec.ench.max + ') : accepté, addEnchant(…, true) lève la limite (CustomItem.java:183).', 'CustomItem.java:183');
        }
      }
    }
    // flags (ItemsConfig.java:127-132)
    const flags = stringList(raw, 'flags');
    if (flags.notList) warn('flags', 'flags vaut ' + describe(raw.get('flags')) + ' et non une liste : getStringList renvoie une liste vide, aucun drapeau posé.', R.getList);
    for (const d of flags.dropped) warn('flags', 'Élément ' + (d.index + 1) + ' de flags (' + describe(d.value) + ') ignoré par getStringList.', R.getStringList);
    for (const f of flags.values) {
      const up = javaTrim(f).toUpperCase();
      if (!FLAGS.includes(up)) err('flags', P('flags'), 'valeur inconnue pour ItemFlag : ' + f, R.flags);
      else if (!item.flags.includes(up)) item.flags.push(up);
    }
    for (const f of item.flags) {
      if (f === 'HIDE_DESTROYS' || f === 'HIDE_PLACED_ON') info('flags', f + ' n\'a aucun effet visible : BC ne pose ni CanDestroy ni CanPlaceOn.', R.hideFlags);
    }
    // marker (ItemsConfig.java:137-140)
    if (raw.has('marker')) {
      const v = raw.get('marker');
      const s = javaString(v);
      if (typeof v !== 'string') warn('marker', 'marker vaut ' + describe(v) + ' : Bukkit en fait le texte « ' + s + ' ».', R.getString);
      item.marker = s === '' ? null : s;
    }
    // block (ItemsConfig.java:142-151)
    if (raw.has('block')) {
      if (item.marker === null) err('block', P('block'), "un bloc a besoin d'un marqueur : c'est lui qu'on ecrit dans la tuile, et sans lui rien ne sait quoi redessiner", R.blockMarker);
      else {
        const v = raw.get('block');
        if (!(v instanceof Sec)) err('block', P('block'), 'bloc attendu (cle: valeur), recu : ' + javaString(v), R.blockSection);
        else {
          for (const k of v.keys()) {
            if (!BLOCK_KEYS.includes(k)) warn('block', 'Clé block.' + k + ' ignorée' + (k === 'height' || k === 'radius' ? ' : un bloc personnalisé n\'occupe plus qu\'une case' : '') + '.', k === 'height' || k === 'radius' ? R.readme : R.unknownKey);
          }
          const block = { anchor: null, spin: 0, bob: 0 };
          const av = v.get('anchor');
          const aString = av === null ? 'NOTE_BLOCK' : javaString(av);
          const anchor = matchMaterial(aString);
          let ok = true;
          if (!anchor) { err('block', P('block') + '.anchor', 'matiere inconnue : ' + aString, R.anchor); ok = false; }
          else if (!ANCHORS.includes(anchor)) { err('block', P('block') + '.anchor', anchor.name + " n'a pas de tuile, donc nulle part ou ranger l'identifiant du bloc. Ancrages possibles : " + ANCHORS.map(a => a.name).join(', '), R.anchor); ok = false; }
          block.anchor = anchor;
          const dbl = (k, dflt) => {
            const x = v.get(k);
            if (x === null) return dflt;
            if (!isNumber(x)) { warn('block', 'block.' + k + ' vaut ' + describe(x) + ' : pas un nombre, Bukkit prend ' + javaDouble(dflt) + '.', R.getDouble); return dflt; }
            return x.doubleValue();
          };
          const spin = dbl('spin', 0);
          if (Number.isNaN(spin) || Math.abs(spin) > 45) { err('block', P('block') + '.spin', 'rotation entre -45.0 et 45.0 degres par tick attendue, recu ' + javaDouble(spin), R.spin); ok = false; }
          const bob = dbl('bob', 0);
          if (Number.isNaN(bob) || bob < 0 || bob > 8) { err('block', P('block') + '.bob', 'amplitude entre 0 et 8.0 seiziemes attendue, recu ' + javaDouble(bob), R.bob); ok = false; }
          block.spin = spin; block.bob = bob;
          if (ok) item.block = block;
        }
      }
    }
    // unbreakable (ItemsConfig.java:155)
    if (raw.has('unbreakable')) {
      const v = raw.get('unbreakable');
      if (typeof v !== 'boolean') warn('unbreakable', 'unbreakable vaut ' + describe(v) + ' : pas un booléen, Bukkit prend false.', R.getBoolean);
      else item.unbreakable = v;
    }
    for (const [field, s] of [['name', item.rawName || '']].concat(item.rawLore.map(l => ['lore', l]))) {
      if (/%[A-Za-z0-9_]+%/.test(s)) warn(field, 'Texte entre % : items.yml ne passe pas par PlaceholderAPI, il restera tel quel en jeu.', R.name);
    }
    if (hasIcon(item.rawName || '') || item.rawLore.some(hasIcon)) info(item.rawName && hasIcon(item.rawName) ? 'name' : 'lore', 'Caractères d\'icône (\\uE000-\\uFDFF) : rendus ici comme des cases ; leur dessin vient du pack, à vérifier dans le Vérificateur d\'icônes.', 'GlyphText.java:19-25');
    return { errors, warnings, infos, item: material ? item : null };
  }

  /* ---------- texte du fichier : repérage des entrées et des clés, pour des éditions ciblées ---------- */
  function splitText(text) {
    const crlf = (text.match(/\r\n/g) || []).length, lf = (text.match(/\n/g) || []).length;
    return { lines: text.split(/\r?\n/), eol: crlf > 0 && crlf * 2 >= lf ? '\r\n' : '\n' };
  }
  const indentOf = s => { const m = /^[ ]*/.exec(s); return m[0].length; };
  const isBlank = s => /^\s*$/.test(s);
  const isComment = s => /^\s*#/.test(s);
  /** Retire un commentaire de fin de ligne (hors guillemets). */
  function stripComment(s) {
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q === '"') { if (c === '\\') i++; else if (c === '"') q = null; }
      else if (q === "'") { if (c === "'") { if (s[i + 1] === "'") i++; else q = null; } }
      else if (c === '"' || c === "'") { if (i === 0 || /[\s\[{,:]/.test(s[i - 1])) q = c; }
      else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
    }
    return s;
  }
  /** Une clé simple de mapping en bloc, à la colonne i ; null si la ligne n'en est pas une. */
  function parseKeyAt(line, i) {
    const c = line[i];
    let j;
    if (c === '"') {
      j = i + 1;
      while (j < line.length && line[j] !== '"') { if (line[j] === '\\') j++; j++; }
      if (j >= line.length) return null;
      j++;
    } else if (c === "'") {
      j = i + 1;
      while (j < line.length) { if (line[j] === "'") { if (line[j + 1] === "'") { j += 2; continue; } break; } j++; }
      if (j >= line.length) return null;
      j++;
    } else {
      if (c === undefined || '[]{}#&*!|>%@`,'.includes(c)) return null;
      if ('-?:'.includes(c) && /^(\s|$)/.test(line.slice(i + 1, i + 2) || ' ')) return null;
      j = i;
      while (j < line.length) {
        if (line[j] === ':' && (j + 1 >= line.length || /\s/.test(line[j + 1]))) break;
        if (line[j] === '#' && /\s/.test(line[j - 1] || ' ')) return null;
        j++;
      }
      if (j >= line.length) return null;
      while (j > i && /\s/.test(line[j - 1])) j--;
    }
    const raw = line.slice(i, j);
    let k = j;
    while (k < line.length && (line[k] === ' ' || line[k] === '\t')) k++;
    if (line[k] !== ':' || (k + 1 < line.length && !/\s/.test(line[k + 1]))) return null;
    const rest = stripComment(line.slice(k + 1)).trim();
    return { raw, start: i, end: j, colon: k, rest };
  }
  const keyCache = new Map();
  /** La clé telle que Bukkit la voit (Object.toString de la clé SnakeYAML). */
  function decodeKey(raw) {
    if (keyCache.has(raw)) return keyCache.get(raw);
    let out = raw;
    try {
      const v = Y.load(raw + ': 0', { schema: SNAKE });
      if (isMap(v)) out = Object.keys(v)[0];
    } catch (e) { /* clé illisible : on garde le texte */ }
    keyCache.set(raw, out);
    return out;
  }
  /**
   * Repère les entrées (clés de colonne 0) et leurs clés filles. complex : raison pour laquelle le
   * fichier ne se prête pas aux éditions ciblées (il est alors réécrit en entier).
   */
  function scanDoc(text) {
    const { lines, eol } = splitText(text);
    const entries = [];
    let complex = null, seenContent = false;
    for (let n = 0; n < lines.length; n++) {
      const L = lines[n];
      if (isBlank(L) || isComment(L)) continue;
      if (/^\s/.test(L)) { if (!entries.length) complex = complex || 'contenu indenté avant la première entrée'; continue; }
      if (/^---(\s|$)/.test(L)) { if (!seenContent && /^---\s*(#.*)?$/.test(L)) { seenContent = true; continue; } complex = 'plusieurs documents YAML'; continue; }
      if (/^\.\.\.(\s|$)/.test(L) || L[0] === '%') { complex = complex || 'marqueur de document ou directive YAML'; continue; }
      seenContent = true;
      const k = parseKeyAt(L, 0);
      if (!k) { complex = complex || 'racine qui n\'est pas un mapping en bloc (ligne ' + (n + 1) + ')'; continue; }
      entries.push({ raw: k.raw, id: decodeKey(k.raw), line: n, keyEnd: k.end, rest: k.rest, children: [], childIndent: null, bad: null });
    }
    for (let x = 0; x < entries.length; x++) {
      const e = entries[x];
      const limit = x + 1 < entries.length ? entries[x + 1].line - 1 : lines.length - 1;
      let end = e.line;
      for (let n = e.line + 1; n <= limit; n++) if (/^\s+\S/.test(lines[n])) end = n;
      e.bodyEnd = end;
      if (e.rest !== '') { e.bad = /^[&!]\S*$/.test(e.rest) ? 'ancre ou étiquette YAML sur l\'entrée' : 'valeur écrite sur la ligne de la clé'; continue; }
      for (let n = e.line + 1; n <= end; n++) {
        const L = lines[n];
        if (isBlank(L) || isComment(L)) continue;
        if (/^ *\t/.test(L)) { e.bad = 'tabulation dans l\'indentation'; continue; }
        const ind = indentOf(L);
        if (e.childIndent === null) e.childIndent = ind;
        if (ind < e.childIndent) { e.bad = 'indentation irrégulière'; continue; }
        if (ind > e.childIndent) continue;
        if (L[ind] === '-' && /^(\s|$)/.test(L.slice(ind + 1, ind + 2) || ' ')) { e.bad = 'liste à la place d\'un bloc'; continue; }
        const k = parseKeyAt(L, ind);
        if (!k) { e.bad = 'clé non simple (ligne ' + (n + 1) + ')'; continue; }
        e.children.push({ raw: k.raw, key: decodeKey(k.raw), line: n, rest: k.rest, keyStart: ind, keyEnd: k.end });
      }
      for (let c = 0; c < e.children.length; c++) {
        const ch = e.children[c];
        let cend = c + 1 < e.children.length ? e.children[c + 1].line - 1 : end;
        while (cend > ch.line && (isBlank(lines[cend]) || (isComment(lines[cend]) && indentOf(lines[cend]) <= e.childIndent))) cend--;
        ch.end = cend;
      }
      if (e.id.includes('.')) e.bad = e.bad || 'point dans l\'identifiant';
    }
    // Style du fichier : retrait des clés, des tirets de liste et des sous-blocs.
    const style = { indent: 2, list: 2, map: 2, flowFlags: false };
    const firstWithChild = entries.find(e => e.childIndent);
    if (firstWithChild) style.indent = firstWithChild.childIndent;
    outer: for (const e of entries) for (const ch of e.children) {
      if (ch.rest === '' && ch.line + 1 <= ch.end) {
        const nxt = lines.slice(ch.line + 1, ch.end + 1).find(l => !isBlank(l) && !isComment(l));
        if (nxt && /^\s*- /.test(nxt)) { style.list = Math.max(0, indentOf(nxt) - e.childIndent); break outer; }
      }
    }
    outer2: for (const e of entries) for (const ch of e.children) {
      if (ch.rest === '' && ch.line + 1 <= ch.end) {
        const nxt = lines.slice(ch.line + 1, ch.end + 1).find(l => !isBlank(l) && !isComment(l));
        if (nxt && !/^\s*- /.test(nxt) && indentOf(nxt) > e.childIndent) { style.map = indentOf(nxt) - e.childIndent; break outer2; }
      }
    }
    for (const e of entries) for (const ch of e.children) if (ch.key === 'flags' && /^\[/.test(ch.rest)) style.flowFlags = true;
    return { lines, eol, entries, complex, style };
  }

  /* ---------- écriture YAML ---------- */
  /** Chaîne entre guillemets doubles : & n'y est jamais lu comme une ancre ; icônes et contrôles en \uXXXX. */
  function dq(s) {
    let o = '"';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], c = s.charCodeAt(i);
      if (ch === '"') o += '\\"';
      else if (ch === '\\') o += '\\\\';
      else if (c === 9) o += '\\t';
      else if (c === 10) o += '\\n';
      else if (c === 13) o += '\\r';
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xDC00 && s.charCodeAt(i + 1) <= 0xDFFF) { o += ch + s[i + 1]; i++; }
      else if (c < 0x20 || c === 0x7f || (c >= 0x80 && c < 0xa0) || c === 0x2028 || c === 0x2029 || c === 0xfeff || (c >= 0xD800 && c <= 0xDFFF) || isIcon(c)) o += '\\u' + c.toString(16).toUpperCase().padStart(4, '0');
      else o += ch;
    }
    return o + '"';
  }
  /** Écrit nu si SnakeYAML relit exactement la même chaîne, sinon entre guillemets. */
  function plainOrQuoted(s) {
    if (s === '' || s !== s.trim() || implicitTag(s) !== 'str') return dq(s);
    if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) || /: |:$| #|[\t\n\r]/.test(s)) return dq(s);
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x20 || c > 0x7e) return dq(s); }
    return s;
  }
  /** Lignes d'une clé fille. v : {t:'str'|'plain', v} | {t:'list', items, flow} | {t:'map', entries}. */
  function serKey(key, v, ind, style) {
    const pad = ' '.repeat(ind), k = plainOrQuoted(key);
    if (v.t === 'str') return [pad + k + ': ' + dq(v.v)];
    if (v.t === 'plain') return [pad + k + ': ' + v.v];
    if (v.t === 'list') {
      if (!v.items.length) return [pad + k + ': []'];
      if (v.flow) return [pad + k + ': [' + v.items.map(scalar).join(', ') + ']'];
      return [pad + k + ':'].concat(v.items.map(x => ' '.repeat(ind + style.list) + '- ' + scalar(x)));
    }
    if (v.t === 'map') {
      if (!v.entries.length) return [pad + k + ': {}'];
      return [pad + k + ':'].concat(...v.entries.map(([ck, cv]) => serKey(ck, cv, ind + style.map, style)));
    }
    throw new Error('valeur YAML inconnue');
  }
  const scalar = x => (x.t === 'str' ? dq(x.v) : x.v);
  /** Valeur Bukkit quelconque -> valeur typée pour serKey (réécriture complète d'une entrée). */
  function typed(v) {
    if (typeof v === 'string') return { t: 'str', v };
    if (typeof v === 'boolean') return { t: 'plain', v: String(v) };
    if (v instanceof JNum) return { t: 'plain', v: v.kind === 'Double' && !Number.isFinite(v.dbl) ? (Number.isNaN(v.dbl) ? '.nan' : (v.dbl > 0 ? '.inf' : '-.inf')) : v.toString() };
    if (v instanceof JDate) return { t: 'plain', v: v.s };
    if (v instanceof Sec) return { t: 'map', entries: v.keys().map(k => [k, typed(v.get(k))]) };
    if (Array.isArray(v)) return { t: 'list', items: v.map(x => (Array.isArray(x) || isMap(x) || x === null ? { t: 'plain', v: x === null ? '~' : flowOf(x) } : typed(x))) };
    if (isMap(v)) return { t: 'map', entries: Object.keys(v).map(k => [k, typed(v[k])]) };
    if (v === null) return { t: 'plain', v: '~' };
    return { t: 'str', v: javaString(v) };
  }
  function flowOf(v) {
    if (Array.isArray(v)) return '[' + v.map(flowOf).join(', ') + ']';
    if (isMap(v)) return '{' + Object.keys(v).map(k => plainOrQuoted(k) + ': ' + flowOf(v[k])).join(', ') + '}';
    if (v === null) return '~';
    const t = typed(v);
    return t.t === 'str' ? dq(t.v) : t.v;
  }
  /** Ordre BC des clés connues, pour une entrée réécrite. */
  function serEntry(id, fields, style) {
    const out = [plainOrQuoted(id) + ':'];
    for (const [k, v] of fields) out.push(...serKey(k, v, style.indent, style));
    return out;
  }

  /* ---------- éditions ciblées ---------- */
  // target = { index (rang dans scanDoc), id (clé Bukkit) }. Un fichier que scanDoc ne sait pas
  // découper (complex) est réécrit en entier ; une entrée non découpable (bad) est réécrite seule.
  function joinLines(lines, eol) { return lines.join(eol); }
  /** Valeur typée d'une clé connue lue dans Bukkit, pour la réécriture : matières et drapeaux nus. */
  function typedKnown(key, v) {
    if (typeof v === 'string' && (key === 'material' || key === 'anchor')) return { t: 'plain', v: plainOrQuoted(v) };
    if (key === 'flags' && Array.isArray(v)) return { t: 'list', items: v.map(x => (typeof x === 'string' ? { t: 'plain', v: plainOrQuoted(x) } : typed(x))) };
    if (v instanceof Sec) return { t: 'map', entries: v.keys().map(k => [k, typedKnown(k, v.get(k))]) };
    return typed(v);
  }
  function entryFields(sec) { return sec instanceof Sec ? sec.keys().map(k => [k, typedKnown(k, sec.get(k))]) : []; }
  function fileModel(text) {
    const conf = loadConfiguration(text);
    if (!conf.ok) throw new Error('Le fichier doit être lisible pour être modifié.');
    return conf.root.keys().map(id => [id, entryFields(conf.root.get(id))]);
  }
  function serializeModel(model, s) {
    const out = [];
    model.forEach(([id, f], i) => { if (i) out.push(''); out.push(...serEntry(id, f, s.style)); });
    out.push('');
    return out.join(s.eol);
  }
  function applyField(fields, key, newV) {
    const i = fields.findIndex(f => f[0] === key);
    if (newV === null) { if (i >= 0) fields.splice(i, 1); return; }
    if (i >= 0) fields[i][1] = newV; else fields.push([key, newV]);
  }
  function modelEdit(text, s, target, op) {
    const model = fileModel(text);
    const i = model.findIndex(m => m[0] === target.id);
    if (op.kind === 'add') model.push([op.id, op.fields]);
    else if (i < 0) throw new Error('entrée introuvable : ' + target.id);
    else if (op.kind === 'set') applyField(model[i][1], op.key, op.value);
    else if (op.kind === 'rename') model[i][0] = op.id;
    else if (op.kind === 'delete') model.splice(i, 1);
    else if (op.kind === 'duplicate') model.splice(i + 1, 0, [op.id, JSON.parse(JSON.stringify(model[i][1]))]);
    return serializeModel(model, s);
  }
  /** Remplace (newV), ajoute, ou supprime (null) une clé fille d'une entrée. */
  function setChild(text, target, key, newV) {
    const s = scanDoc(text);
    if (s.complex) return { text: modelEdit(text, s, target, { kind: 'set', key, value: newV }), rewritten: 'file' };
    const e = s.entries[target.index];
    if (!e) throw new Error('entrée introuvable');
    const lines = s.lines.slice();
    if (e.bad) {
      const conf = loadConfiguration(text);
      if (!conf.ok) throw new Error('Le fichier doit être lisible pour être modifié.');
      const id = e.id.split('.')[0];
      const f = entryFields(conf.root.get(id));
      applyField(f, key, newV);
      lines.splice(e.line, e.bodyEnd - e.line + 1, ...serEntry(id, f, s.style));
      return { text: joinLines(lines, s.eol), rewritten: 'entry' };
    }
    const ind = e.childIndent || s.style.indent;
    const matches = e.children.filter(c => c.key === key);
    const ch = matches[matches.length - 1];             // SnakeYAML garde la dernière occurrence
    const fresh = newV ? serKey(key, newV, ind, s.style) : [];
    if (ch) lines.splice(ch.line, ch.end - ch.line + 1, ...fresh);
    else if (fresh.length) {
      const after = e.children.length ? e.children[e.children.length - 1].end : e.line;
      lines.splice(after + 1, 0, ...fresh);
    }
    return { text: joinLines(lines, s.eol), rewritten: null };
  }
  function renameEntry(text, target, newId) {
    const s = scanDoc(text);
    if (s.complex) return modelEdit(text, s, target, { kind: 'rename', id: newId });
    const e = s.entries[target.index];
    const lines = s.lines.slice();
    lines[e.line] = plainOrQuoted(newId) + lines[e.line].slice(e.keyEnd);
    return joinLines(lines, s.eol);
  }
  function deleteEntry(text, target) {
    const s = scanDoc(text);
    if (s.complex) return modelEdit(text, s, target, { kind: 'delete' });
    const e = s.entries[target.index];
    const lines = s.lines.slice();
    let to = e.bodyEnd;
    while (to + 1 < lines.length - 1 && isBlank(lines[to + 1])) to++;
    let from = e.line;
    if (target.index === s.entries.length - 1) while (from > 0 && isBlank(lines[from - 1])) from--;
    lines.splice(from, to - from + 1);
    return joinLines(lines, s.eol);
  }
  function duplicateEntry(text, target, newId) {
    const s = scanDoc(text);
    if (s.complex) return modelEdit(text, s, target, { kind: 'duplicate', id: newId });
    const e = s.entries[target.index];
    const lines = s.lines.slice();
    const block = lines.slice(e.line, e.bodyEnd + 1);
    block[0] = plainOrQuoted(newId) + block[0].slice(e.keyEnd);
    lines.splice(e.bodyEnd + 1, 0, '', ...block);
    return joinLines(lines, s.eol);
  }
  function addEntry(text, id, fields) {
    const s = scanDoc(text);
    if (s.complex) return modelEdit(text, s, {}, { kind: 'add', id, fields });
    const lines = s.lines.slice();
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (lines.length) lines.push('');
    lines.push(...serEntry(id, fields, s.style), '');
    return joinLines(lines, s.eol);
  }

  /* ---------- fichier entier : ce que BC en ferait ---------- */
  function validateFile(text) {
    const conf = loadConfiguration(text);
    const scan = scanDoc(text);
    const res = { conf, scan, entries: [], fatal: null, firstError: null };
    if (!conf.ok) {
      res.fatal = conf;
      return res;
    }
    const lastIdx = new Map();
    scan.entries.forEach((e, i) => lastIdx.set(e.id.split('.')[0], i));
    const bukkitIds = conf.root.keys();
    if (!scan.complex && scan.entries.length) {
      scan.entries.forEach((e, i) => {
        const id = e.id.split('.')[0];
        const raw = conf.root.get(id);
        const r = validateEntry(id, raw);
        const rec = { index: i, id: e.id, bukkitId: id, scan: e, raw, ...r, shadowed: lastIdx.get(id) !== i, invisible: raw === null };
        if (rec.shadowed) rec.warnings.unshift({ field: 'id', message: 'Clé « ' + id + ' » en double : SnakeYAML ne garde que la dernière, cette entrée est ignorée.', ref: R.duplicate });
        if (raw === null) rec.warnings.unshift({ field: 'id', message: 'Entrée vide : sa valeur null est effacée au chargement, BC ne la voit pas.', ref: R.nullDrop });
        if (e.id.includes('.')) rec.warnings.unshift({ field: 'id', message: 'Le point découpe « ' + e.id + ' » en sections : BC lit l\'entrée « ' + id + ' ».', ref: R.dotSplit });
        if (e.raw !== e.id && !/^["']/.test(e.raw)) rec.warnings.unshift({ field: 'id', message: 'La clé « ' + e.raw + ' » est relue par SnakeYAML comme « ' + e.id + ' » (nombre, booléen…).', ref: 'SnakeYAML Resolver (YAML 1.1)' });
        if (e.children.some((c, j) => e.children.findIndex(d => d.key === c.key) !== j)) rec.warnings.push({ field: 'entry', message: 'Clé répétée dans l\'entrée : SnakeYAML garde la dernière.', ref: R.duplicate });
        res.entries.push(rec);
      });
    } else {
      bukkitIds.forEach((id, i) => {
        const raw = conf.root.get(id);
        res.entries.push({ index: i, id, bukkitId: id, scan: null, raw, ...validateEntry(id, raw), shadowed: false, invisible: false });
      });
    }
    // Ancres YAML non citées (name: &bNom) : la valeur devient null.
    scan.lines.forEach((L, n) => {
      if (!/^\s*(?:-\s+|[^#'"\s-][^#]*?:\s+)&\S/.test(L)) return;
      const owner = res.entries.filter(r => r.scan && r.scan.line <= n && r.scan.bodyEnd >= n).pop();
      const ctx = lineKeyContext(scan.lines, n);
      if (owner) owner.warnings.push({ field: ENTRY_KEYS.includes(ctx) ? ctx : 'entry', message: 'Ligne ' + (n + 1) + ' : valeur non citée qui commence par & : YAML y lit une ancre ; la valeur devient le texte après l\'ancre, ou null. Mettre le texte entre guillemets.', ref: 'YAML 1.1 : & introduit une ancre' });
    });
    // Ordre de BC : celui des clés que garde SnakeYAML ; la première erreur arrête tout.
    const order = res.entries.filter(r => !r.shadowed && !r.invisible).sort((a, b) => a.index - b.index);
    for (const r of order) if (r.errors.length) { res.firstError = { entry: r, error: r.errors[0] }; break; }
    res.loaded = res.firstError ? 0 : order.length;
    return res;
  }
  function guessField(L) { const m = /^\s*([A-Za-z_]+)\s*:/.exec(L); return m ? m[1] : 'entry'; }
  function lineKeyContext(lines, n) { for (let i = n; i >= 0; i--) { const m = /^\s*([A-Za-z_]+)\s*:/.exec(lines[i]); if (m) return m[1]; } return ''; }

  /* ---------- infobulle 1.8.9 : ItemStack.getTooltip + GuiScreen.renderToolTip ---------- */
  const RARITY = { C: '§f', U: '§e', R: '§b', E: '§d' }; // EnumRarity.java:7-10
  function tableSizeFor(c) { let n = 1; while (n < c) n *= 2; return n; }
  /**
   * Ordre des enchantements dans le NBT : CraftMetaItem.addEnchant les range dans un HashMap(4)
   * (CraftMetaItem.java:712-714), puis chaque clone de la meta en fait une copie
   * (CraftMetaItem.java:874 ; ItemStack.setItemMeta0 :640 ; getItemMeta :602) que
   * applyEnchantments parcourt (CraftMetaItem.java:644). Clé = id (Enchantment.hashCode).
   * Copie : capacité tableSizeFor(ceil(n / 0.75)) (HashMap.putMapEntries, JDK 19+ ; le serveur
   * tourne en OpenJDK 25).
   */
  function enchantOrder(ids) {
    let cap = 4;
    ids.forEach((id, i) => { if (i + 1 > cap * 0.75) cap *= 2; });
    const byBucket = (list, c) => list.map((id, i) => ({ id, i })).sort((a, b) => ((a.id & (c - 1)) - (b.id & (c - 1))) || (a.i - b.i)).map(x => x.id);
    let order = byBucket(ids, cap);
    if (order.length) order = byBucket(order, tableSizeFor(Math.ceil(order.length / 0.75)));
    return order;
  }
  function tr(lang, key) { const L = MC.lang[lang] || MC.lang.en; return key in L ? L[key] : (key in MC.lang.en ? MC.lang.en[key] : key); }
  function jformat(fmt, args) { let i = 0; return fmt.replace(/%(?:(\d+)\$)?([s%])/g, (m, pos, c) => (c === '%' ? '%' : String(pos ? args[Number(pos) - 1] : args[i++]))); }
  /** DecimalFormat("#.###") (ItemStack.java:40), séparateur décimal « . ». */
  function decimal(d) { let s = (Math.round(d * 1000) / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' ? '0' : s; }
  /**
   * Lignes de l'infobulle, codes § compris, pour un item validé.
   * @return {lines, notes, mc} ; lines vide si la matière n'a pas d'item.
   */
  function tooltip(item, lang) {
    const notes = [];
    const mc = item.material ? MC.items[item.material.id] : null;
    if (!mc) return { lines: [], notes: ['Pas de forme d\'item pour cette matière en 1.8 : rien à afficher.'], mc: null };
    const L = lang === 'en' ? 0 : 1;
    const data = item.data;
    let names = mc.n[String(data)];
    if (!names) { names = mc.n['0']; if (mc.s) notes.push('Variante data=' + data + ' non répertoriée : nom de la variante 0 affiché.'); }
    const hide = item.flags.reduce((b, f) => b | (1 << FLAGS.indexOf(f)), 0);    // CraftMetaItem.java:776-778
    const hasName = !!item.name;                                // CraftMetaItem.hasDisplayName (:684-686)
    const ordered = enchantOrder(item.enchants.map(e => e.ench.id)).map(id => item.enchants.find(e => e.ench.id === id));
    const hasTag = hasName || item.lore.length > 0 || ordered.length > 0 || hide !== 0 || item.unbreakable || item.marker !== null;
    let rarity = ordered.length ? mc.re : mc.ra;               // Item.getRarity (Item.java:425-428)
    if (item.material.id === 322) rarity = data === 0 ? 'R' : 'E'; // ItemAppleGold.java:31
    let first = (hasName ? '§o' + item.name : names[L]) + '§r'; // ItemStack.java:658-665
    if (!hasName && item.material.id === 358) first += ' #' + data;       // ItemStack.java:688-691
    const lines = [RARITY[rarity] + first];                    // GuiScreen.renderToolTip (GuiScreen.java:158)
    const rest = [];
    if ((hide & 32) === 0) {                                   // ItemStack.java:701-704 : Item.addInformation
      const inf = mc.i && mc.i[String(data)];
      if (inf) rest.push(...inf[L]);
      if (mc.x) notes.push('Les informations propres à cet item (carte) dépendent du monde : non simulées.');
    }
    if (hasTag) {
      if ((hide & 1) === 0) for (const e of ordered) {          // ItemStack.java:708-725
        const shown = (e.level << 16) >> 16;                   // short dans le NBT (CraftMetaItem.java:648)
        rest.push(tr(lang, e.ench.lang) + ' ' + tr(lang, 'enchantment.level.' + shown)); // Enchantment.java:196-200
      }
      for (const l of item.lore) rest.push('§5§o' + l); // ItemStack.java:743-754
    }
    if (mc.m && mc.m.length && (hide & 2) === 0) {              // ItemStack.java:758-795
      rest.push('');
      let bonus = 0;
      for (const e of ordered) if (e.ench.id === 16) bonus = Math.fround(bonus + Math.fround(((e.level << 16) >> 16) * 1.25)); // EnchantmentDamage.java:62-65
      for (const [attr, amount, op, base] of mc.m) {
        let d0 = amount + (base ? bonus : 0);
        let d1 = op !== 1 && op !== 2 ? d0 : d0 * 100;
        const nameKey = tr(lang, 'attribute.name.' + attr);
        if (d0 > 0) rest.push('§9' + jformat(tr(lang, 'attribute.modifier.plus.' + op), [decimal(d1), nameKey]));
        else if (d0 < 0) rest.push('§c' + jformat(tr(lang, 'attribute.modifier.take.' + op), [decimal(-d1), nameKey]));
      }
    }
    if (item.unbreakable && (hide & 4) === 0) rest.push('§9' + tr(lang, 'item.unbreakable')); // ItemStack.java:797-800
    for (const r of rest) lines.push('§7' + r);           // GuiScreen.java:162
    return { lines, notes, mc };
  }

  /* ---------- pack : identifiants des règles CIT ---------- */
  const PIECES = ['helmet', 'chestplate', 'leggings', 'boots'];   // PackBuild.java:263-264
  /** Matière Bukkit d'un nom de registre 1.8.9 (pack.json : « diamond_sword »). */
  function materialForRegistry(reg) {
    if (!reg) return null;
    const r = String(reg).replace(/^minecraft:/, '');
    for (const id of Object.keys(MC.items)) if (MC.items[id].r === r) return BY_ID[Number(id)] || null;
    return null;
  }
  /** paths : chemins relatifs à la racine du pack (pack.json, items/<id>/…). */
  function packIndex(paths, packJson) {
    const ids = new Map();
    const add = (id, cat, file, mat) => { if (!ids.has(id)) ids.set(id, { id, cat, texture: null, material: mat || null }); const o = ids.get(id); if (file && !o.texture && /\.png$/i.test(file)) o.texture = file; if (file && /\/texture\.png$/i.test(file)) o.texture = file; };
    const desc = packJson || {};
    const items = desc.items || {}, armor = desc.armor || {};
    const base = desc['base-item'] || 'stone';
    for (const p of paths) {
      let m;
      if ((m = /^items\/([^/]+)\/(.+)$/.exec(p))) add(m[1], 'item', p, materialForRegistry(items[m[1]] && items[m[1]].material));
      else if ((m = /^blocks\/([^/]+)\/(.+)$/.exec(p))) add(m[1], 'bloc', p, materialForRegistry(base));
      else if ((m = /^armor\/([^/]+)\/(helmet|chestplate|leggings|boots)\.png$/i.exec(p))) {
        const set = m[1], piece = m[2].toLowerCase();
        const mat = armor[set] && armor[set].material ? materialForRegistry(armor[set].material + '_' + piece) : null;
        add(set + '_' + piece, 'armure', p, mat);
      }
    }
    const sets = new Set(paths.map(p => (/^armor\/([^/]+)\//.exec(p) || [])[1]).filter(Boolean));
    return { ids, sets, items, base, desc };
  }
  /** La règle du pack qui reconnaîtrait ce marqueur (CatalogueMatchesPackTest, PackBuild.java:719-735). */
  function packRuleFor(pack, marker) {
    if (!pack || marker === null) return null;
    if (pack.ids.has(marker)) return pack.ids.get(marker);
    for (const set of pack.sets) if (marker.startsWith(set + '_')) return { id: set, cat: 'armure (pattern:' + set + '_*)' };
    return null;
  }
  function packWarnings(pack, rec) {
    const out = [];
    if (!pack || !rec.item) return out;
    const it = rec.item;
    if (it.marker !== null && !packRuleFor(pack, it.marker)) out.push({ field: 'marker', message: 'Aucune règle du pack pour le marqueur « ' + it.marker + ' » : l\'item sortira en ' + it.material.name + ' vanilla.', ref: R.pack });
    const decl = it.marker !== null ? pack.items[it.marker] : null;
    if (decl && decl.material) {
      const want = materialForRegistry(decl.material);
      if (want && want !== it.material) out.push({ field: 'material', message: 'pack.json : la règle de « ' + it.marker + ' » ne vise que ' + decl.material + ' (' + want.name + ') ; sur ' + it.material.name + ' elle ne s\'appliquera pas.', ref: 'PackBuild.java:96-104' });
    }
    if (it.marker !== null && pack.ids.has(it.marker) && pack.ids.get(it.marker).cat === 'bloc') {
      const want = materialForRegistry(pack.base);
      if (want && want !== it.material) out.push({ field: 'material', message: 'Bloc du pack : la matière doit rester base-item (' + pack.base + ', soit ' + want.name + '), sinon la caisse reste un caillou.', ref: 'items.yml, en-tête des caisses' });
    }
    return out;
  }

  window.ItemsLogic = {
    MC, R, JNum, JDate, Sec, javaDouble, javaString, implicitTag, parseYaml, loadConfiguration,
    MATERIALS, BY_NAME, matchMaterial, ENCHANTS, enchantmentByName, FLAGS, ANCHORS, ENTRY_KEYS, ID_RE, colored, isIcon,
    validateEntry, validateFile, scanDoc, dq, plainOrQuoted, serKey, serEntry, typed,
    setChild, renameEntry, deleteEntry, duplicateEntry, addEntry,
    enchantOrder, tooltip, tr, decimal, materialForRegistry, packIndex, packRuleFor, packWarnings, jInt
  };
})();
