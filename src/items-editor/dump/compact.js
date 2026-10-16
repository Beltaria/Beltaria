// Builds the compact MC 1.8 data block embedded in lore-preview.html.
// Inputs: materials.json (Bukkit 1.8.8 Material.java), items.json (ItemDump on MCP 1.8.9 / Forge 11.15.1.2318),
// en_US.lang (1.8.9 client jar), fr_FR.lang (1.8 asset index).
const fs = require('fs');
const mats = require('./materials.json');
const items = require('./items.json');
const RAR = { COMMON: 'C', UNCOMMON: 'U', RARE: 'R', EPIC: 'E' };
const NUM = /%(\d+\$)?[\d.]*[df]/g;
function lang(p) {
  const m = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const i = line.indexOf('=');
    if (i > 0) m[line.slice(0, i)] = line.slice(i + 1).replace(NUM, '%$1s');
  }
  return m;
}
const en = lang('../lang/en_US.lang');
const fr = Object.assign({}, en, lang('../lang/fr_FR.lang'));
const keys = Object.keys(en).filter(k => /^enchantment\./.test(k) || k === 'item.unbreakable' || /^attribute\.(modifier|name\.generic\.attackDamage)/.test(k));
const L = { en: {}, fr: {} };
for (const k of keys) { L.en[k] = en[k]; L.fr[k] = fr[k]; }

const out = { mats: [], items: {}, lang: L };
for (const [name, id, stack, dur] of mats) out.mats.push([name, id, stack, dur]);
for (const id of Object.keys(items)) {
  const d = items[id];
  const o = { r: d.reg.replace(/^minecraft:/, ''), md: d.maxDamage, ra: RAR[d.rarity], re: RAR[d.rarityEnch] };
  if (d.sub) o.s = 1;
  if (d.mods.length) o.m = d.mods.map(([k, a, op, base]) => [k, a, op, base ? 1 : 0]);
  const n = {}, inf = {};
  const base = d.en['0'][0] + '\u0000' + d.fr['0'][0];
  for (const meta of Object.keys(d.en)) {
    const e = d.en[meta], f = d.fr[meta];
    const nm = e[0] + '\u0000' + f[0];
    if (meta === '0' || nm !== base) n[meta] = [e[0], f[0]];
    const ei = e.slice(1).filter(x => !x.startsWith('!')), fi = f.slice(1).filter(x => !x.startsWith('!'));
    if (ei.length || fi.length) inf[meta] = [ei, fi];
    if (e.slice(1).some(x => x.startsWith('!'))) o.x = 1; // addInformation needs a world (maps)
  }
  o.n = n;
  if (Object.keys(inf).length) o.i = inf;
  out.items[id] = o;
}
const json = JSON.stringify(out);
fs.writeFileSync('mcdata.json', json);
console.log('bytes', json.length);
