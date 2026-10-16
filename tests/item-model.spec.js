// Item 3D Maker : réglage d'entrée BeltariaContent (pack.json + model.json).
// La logique pure (window.ItemModel) est comparée aux règles du code Java de BeltariaContent
// (fichier:ligne cités dans item-3d-maker.html) et à des valeurs produites par son propre
// assembleur (gradlew buildPack) ; l'interface est testée par ses vrais champs de fichiers.
// Fixtures synthétiques, générées ici : aucune texture ni modèle de BeltariaContent n'est copié.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { test, expect } = require('@playwright/test');

const PAGE = '/item-3d-maker.html';

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  return errors;
}

// --- Fixtures ---------------------------------------------------------------
const face = (uv, extra) => Object.assign({ uv, texture: '#0' }, extra || {});
const WING_MODEL = {
  credit: 'Blockbench',
  textures: { 0: './texture', particle: './texture' },
  elements: [
    { from: [-8, 0, 8], to: [8, 16, 8], rotation: { origin: [8, 8, 8], axis: 'y', angle: 22.5 },
      faces: { north: face([0, 0, 8, 16]), south: face([8, 0, 0, 16]) } },
    { from: [8, 0, 8], to: [24, 16, 8], faces: { north: face([8, 0, 16, 16]), south: face([16, 0, 8, 16], { rotation: 90 }) } }
  ],
  display: {
    head: { rotation: [-7, 0, 0], translation: [0, -40, 2], scale: [2, 2, 2] },
    gui: { rotation: [30, -180, 0], translation: [0, -7, 0], scale: [0.5, 0.5, 0.5] }
  }
};
// pack.json au style de pack-src, avec des clés et des entrées voisines à préserver à l'octet
const PACK = `{
  "description": "§6Test - cosmetiques 1.8.8",
  "marker-key": "beltaria:id",
  "base-item": "stone",
  "folders": { "wings": "beltaria/cosmetiques", "items": "beltaria/gear", "blocks": "beltaria/blocs" },
  "wings": {
    "other_wings": {   "head" : {"scale":[1,1,1]} , "weird":  true },
    "test_wings": {
      "shift": [0, -4, 0],
      "head": { "translation": [0, -23, 0] },
      "gui": { "front": true, "fit": 20 },
      "source": "blockbench"
    }
  },
  "items": {
    "temoin": { "material": "dirt", "marker": false },
    "flat_sword": { "material": "diamond_sword", "gui": { "fit": 12 } }
  },
  "zzz_unknown": [1, 2, {"a": "b"}]
}
`;
const PACK_OBJ = JSON.parse(PACK);

// Valeurs produites par l'assembleur de BeltariaContent (gradlew buildPack, pack-src réel) pour
// trois entrées ; seules les entrées de BC qui déterminent ces valeurs sont reprises : la boîte
// englobante brute des éléments (ModelFit.Bounds ignore les rotations d'élément), le display de
// model.json et l'entrée de pack.json. La géométrie et les textures restent dans BeltariaContent.
const BC_PARITY = [
  { category: 'wings', id: 'fairy_wings', min: [-13.94759, 4, 9.69759], max: [29.94759, 32, 31.69759],
    display: { thirdperson: { rotation: [69, 180, 0], translation: [0, -1.25, -1.25], scale: [0.275, 0.275, 0.275] }, firstperson: { rotation: [0, 143, 0], translation: [3, 0, 0], scale: [0.2, 0.2, 0.2] }, head: { rotation: [-7, 0, 0], translation: [-1, -76.75, 2.5], scale: [2.4, 2.4, 2.4] }, gui: { rotation: [30, -180, 0], translation: [0, -7, 0], scale: [0.5, 0.5, 0.5] }, ground: { rotation: [0, 0, 0], translation: [0, 3, 0], scale: [0.25, 0.25, 0.25] }, fixed: { rotation: [0, 180, 0], translation: [0, -4.75, 2], scale: [0.5, 0.5, 0.5] } },
    entry: { shift: [0, -10, 0], head: { translation: [0, -23, 0], scale: [2, 2, 2] }, gui: { front: true, fit: 20 } },
    built: { thirdperson: { rotation: [69, 180, 0], translation: [0, -1.25, -1.25], scale: [0.275, 0.275, 0.275] }, firstperson: { rotation: [0, 143, 0], translation: [3, 0, 0], scale: [0.2, 0.2, 0.2] }, head: { rotation: [-7, 0, 0], translation: [0, -23, 0], scale: [2, 2, 2] }, gui: { rotation: [-30, 135, 0], translation: [-2.2865255, -1.86694, 2.2865255], scale: [0.5881242, 0.5881242, 0.5881242] }, ground: { rotation: [0, 0, 0], translation: [0, 3, 0], scale: [0.25, 0.25, 0.25] }, fixed: { rotation: [0, 180, 0], translation: [0, -4.75, 2], scale: [0.5, 0.5, 0.5] } } },
  { category: 'blocks', id: 'crate_goldwood', min: [-1.16694, -0.05, -0.30102], max: [17.16694, 14.26991, 16.30102],
    display: { thirdperson: { rotation: [73.57, 29.1, 2.38], translation: [-1.25, 2.5, 0], scale: [0.375, 0.375, 0.375] }, firstperson: { rotation: [180, 74.5, 180], translation: [2, 2.75, 0], scale: [0.4, 0.4, 0.4] }, head: { rotation: [0, 0, 0], translation: [0, -18.75, 0], scale: [3, 3, 3] }, gui: { rotation: [30, 225, 0], translation: [0, 0.5, 0], scale: [0.625, 0.625, 0.625] }, ground: { rotation: [0, 0, 0], translation: [0, 2.75, 0], scale: [0.7, 0.7, 0.7] }, fixed: { rotation: [-90, 0, 0], translation: [0, 0, -16], scale: [2, 2, 2] } },
    entry: { tuned: true, head: { translation: [0, -8, 0] }, gui: { front: true, fit: 16 }, shift: [0, -0.82, 0] },
    built: { thirdperson: { rotation: [73.57, 29.1, 2.38], translation: [-1.25, 2.5, 0], scale: [0.375, 0.375, 0.375] }, firstperson: { rotation: [180, 74.5, 180], translation: [2, 2.75, 0], scale: [0.4, 0.4, 0.4] }, head: { rotation: [0, 0, 0], translation: [0, -8, 0], scale: [3, 3, 3] }, gui: { rotation: [-30, 135, 0], translation: [-0.27448797, 0.67235583, 0.27448818], scale: [0.90801084, 0.90801084, 0.90801084] }, ground: { rotation: [0, 0, 0], translation: [0, 2.75, 0], scale: [0.7, 0.7, 0.7] }, fixed: { rotation: [-90, 0, 0], translation: [0, 0, -16], scale: [2, 2, 2] } } },
  { category: 'items', id: 'legendary_key', min: [6.95, -7.28921, -6.25], max: [9, 27, 22.25],
    display: { thirdperson: { rotation: [140, 0, 0], translation: [0, 1, -0.5], scale: [0.25, 0.25, 0.25] }, firstperson: { rotation: [102, 0, 0], translation: [0, 0.75, 0], scale: [0.25, 0.25, 0.25] }, head: { rotation: [0, 90, 0], translation: [0, 6, 0], scale: [1, 1, 1] }, gui: { rotation: [-67, 34, 60], translation: [1.75, -1.5, 0], scale: [0.45, 0.45, 0.45] }, ground: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [0.25, 0.25, 0.25] }, fixed: { rotation: [0, 90, 0], translation: [0, -1.75, -0.75], scale: [0.5, 0.5, 0.5] } },
    entry: { material: 'tripwire_hook', shift: [0, -1.9, 0], thirdperson: { rotation: [0, 90, -35], translation: [0, 1.25, -3.5], scale: [0.85, 0.85, 0.85], turn: [0, 0, -45] }, firstperson: { rotation: [0, -135, 25], translation: [0, 4, 2], scale: [1.4, 1.4, 1.4], turn: [0, 0, -45] }, gui: { front: true, turn: [0, 0, -45], fit: 15 } },
    built: { thirdperson: { rotation: [0, 90, -80], translation: [0, 1.25, -3.5], scale: [0.85, 0.85, 0.85] }, firstperson: { rotation: [0, -135, -20], translation: [0, 4, 2], scale: [1.4, 1.4, 1.4] }, head: { rotation: [0, 90, 0], translation: [0, 6, 0], scale: [1, 1, 1] }, gui: { rotation: [-30, 135, -45], translation: [-0.010907014, 0.0032981457, -0.008214188], scale: [0.5494251, 0.5494251, 0.5494251] }, ground: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [0.25, 0.25, 0.25] }, fixed: { rotation: [0, 90, 0], translation: [0, -1.75, -0.75], scale: [0.5, 0.5, 0.5] } } }
];

// PNG généré dans la page : moitié haute rouge, moitié basse bleue, sur `frames` images (bande verticale)
async function pngBuffer(page, w, h, frames) {
  const b64 = await page.evaluate(([w, h, frames]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h * frames;
    const g = c.getContext('2d');
    for (let f = 0; f < frames; f++) {
      g.fillStyle = f === 0 ? '#ff0000' : '#00ff00'; g.fillRect(0, f * h, w, h / 2);
      g.fillStyle = f === 0 ? '#0000ff' : '#ffff00'; g.fillRect(0, f * h + h / 2, w, h / 2);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h, frames]);
  return Buffer.from(b64, 'base64');
}

// Archive .zip minimale (stockée ou deflate), écrite ici pour ne dépendre de rien
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function makeZip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const comp = f.store ? data : zlib.deflateRawSync(data);
    const method = f.store ? 0 : 8;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

async function packSrcFiles(page) {
  const tex = await pngBuffer(page, 16, 16, 2); // animée : 16 × 32, première image rouge / bleu
  return [
    { name: 'pack-src/pack.json', data: PACK },
    { name: 'pack-src/wings/test_wings/model.json', data: JSON.stringify(WING_MODEL, null, 2) },
    { name: 'pack-src/wings/test_wings/texture.png', data: tex, store: true },
    { name: 'pack-src/wings/test_wings/texture.png.mcmeta', data: '{"animation":{"frametime":2}}' },
    { name: 'pack-src/items/flat_sword/texture.png', data: await pngBuffer(page, 16, 16, 1) }
  ];
}

async function openPanel(page) {
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.check('#bcToggle');
  await expect(page.locator('#bcPanel')).toBeVisible();
}

// Fin d'une lecture : le panneau porte aria-busy="true" dès l'événement de fichier, jusqu'au rendu
async function settled(page) { await expect(page.locator('#bcPanel')).toHaveAttribute('aria-busy', 'false'); }

const evalM = (page, fn, arg) => page.evaluate(fn, arg);

// --- Logique pure : lecture comme BC -----------------------------------------------------------
test.describe('lecture de model.json et pack.json comme BeltariaContent', () => {
  test.beforeEach(async ({ page }) => { await page.goto(PAGE, { waitUntil: 'load' }); });

  test('model.json : refus de ModelReader / ModelElement / ItemModel avec la règle et la ligne BC', async ({ page }) => {
    const r = await evalM(page, (base) => {
      const tryRead = m => { try { ItemModel.readModel(JSON.stringify(m)); return null; } catch (e) { return { msg: e.message, ref: e.ref }; } };
      const b = () => JSON.parse(JSON.stringify(base));
      const out = {};
      out.ok = tryRead(b());
      let m = b(); m.parent = 'item/generated'; out.parent = tryRead(m);
      m = b(); m.display.thirdperson_righthand = { rotation: [0, 0, 0] }; out.ctx = tryRead(m);
      m = b(); m.elements[1].to = [33, 16, 8]; out.bounds = tryRead(m);
      m = b(); m.elements[0].rotation.angle = 30; out.angle = tryRead(m);
      m = b(); m.elements[0].faces.north.rotation = 45; out.faceRot = tryRead(m);
      m = b(); m.elements[0].faces.north.texture = '#peau'; out.ref = tryRead(m);
      m = b(); m.elements = []; out.empty = tryRead(m);
      m = b(); m.display.gui.scale = [0.5, 0, 0.5]; out.scale0 = tryRead(m);
      m = b(); m.elements[0].rotation.axis = 'w'; out.axis = tryRead(m);
      out.syntax = (() => { try { ItemModel.readModel('{ "elements": [ }'); return null; } catch (e) { return { msg: e.message, ref: e.ref }; } })();
      return out;
    }, WING_MODEL);
    expect(r.ok).toBeNull();
    expect(r.parent.msg).toContain('« parent » refusé');
    expect(r.parent.ref).toBe('ModelReader.java:292-295');
    expect(r.ctx.msg).toContain('display.thirdperson_righthand : contexte d\'affichage inconnu en 1.8');
    expect(r.ctx.ref).toBe('ModelReader.java:389-397');
    expect(r.bounds.msg).toContain('hors bornes à l\'indice 0 : 33, attendu entre -16 et 32');
    expect(r.bounds.ref).toBe('ModelElement.java:78-82');
    expect(r.angle.msg).toContain('angle 30 refusé, seuls -45 / -22,5 / 0 / 22,5 / 45');
    expect(r.angle.ref).toBe('ElementRotation.java:167-170');
    expect(r.faceRot.msg).toContain('rotation de face 45 refusée');
    expect(r.ref.msg).toContain('texture #peau absente');
    expect(r.ref.ref).toBe('ItemModel.java:89-103');
    expect(r.empty.msg).toContain('sans aucun élément');
    expect(r.scale0.msg).toContain('strictement positive');
    expect(r.scale0.ref).toBe('DisplayTransform.java:86-90');
    expect(r.axis.msg).toContain('axe de rotation inconnu');
    expect(r.syntax.msg).toContain('JSON invalide');
  });

  test('pack.json : exclusions front / rotation et fit / translation-scale, bornes de fit, forme de turn', async ({ page }) => {
    const r = await evalM(page, () => {
      const read = (e, cat) => { try { const x = ItemModel.readEntry(cat || 'wings', 'w', e, 'beltaria/c'); return { ok: true, fits: x.fits }; } catch (err) { return { msg: err.message, ref: err.ref }; } };
      return {
        frontRot: read({ gui: { front: true, rotation: [0, 0, 0] } }),
        frontFalseRot: read({ gui: { front: false, rotation: [1, 2, 3] } }),
        fitTr: read({ gui: { fit: 16, translation: [0, 0, 0] } }),
        fitScale: read({ gui: { fit: 16, scale: [1, 1, 1] } }),
        fit0: read({ gui: { fit: 0 } }),
        fit33: read({ gui: { fit: 33 } }),
        fit32: read({ gui: { fit: 32 } }),
        fitRot: read({ gui: { fit: 10, rotation: [0, 45, 0] } }),
        turn1: read({ thirdperson: { turn: [0, 0, -45] } }),
        turnList: read({ thirdperson: { turn: [[0, 90, 0], [0, 0, -45]] } }),
        turnEmpty: read({ thirdperson: { turn: [] } }),
        turnBad: read({ thirdperson: { turn: [[0, 90]] } }),
        frontStr: read({ gui: { front: 'yes' } }),
        ctxNotObj: read({ head: [0, 0, 0] }),
        shift2: read({ shift: [0, 1] }),
        id: (() => { try { ItemModel.readEntry('wings', 'Fairy Wings', {}, 'x'); return null; } catch (e) { return { msg: e.message, ref: e.ref }; } })(),
        material: read({}, 'items'),
        folder: read({ folder: 'beltaria/../x' }),
        marker: read({ marker: 'non' }),
        unknownIgnored: read({ tuned: true, source: 'x', gui: { fit: 12, note: 'y' } })
      };
    });
    expect(r.frontRot.msg).toContain('« front » et « rotation » s\'excluent');
    expect(r.frontRot.ref).toBe('PackBuild.java:1592-1594');
    expect(r.frontFalseRot.ok).toBe(true);
    expect(r.fitTr.msg).toContain('« fit » calcule translation et scale');
    expect(r.fitTr.ref).toBe('PackBuild.java:1599-1602');
    expect(r.fitScale.ref).toBe('PackBuild.java:1599-1602');
    expect(r.fit0.msg).toContain('hors de ]0 ; 32]');
    expect(r.fit0.ref).toBe('ModelFit.java:414-417');
    expect(r.fit33.ref).toBe('ModelFit.java:414-417');
    expect(r.fit32.ok).toBe(true);
    expect(r.fitRot.fits.slots.gui.rotation).toEqual([0, 45, 0]);
    expect(r.turn1.fits.slots.thirdperson.turns).toEqual([[0, 0, -45]]);
    expect(r.turnList.fits.slots.thirdperson.turns).toEqual([[0, 90, 0], [0, 0, -45]]);
    expect(r.turnEmpty.ref).toBe('PackBuild.java:1626-1629');
    expect(r.turnBad.msg).toContain('trois nombres attendus, reçu 2');
    expect(r.frontStr.ref).toBe('PackBuild.java:1642-1647');
    expect(r.ctxNotObj.ref).toBe('PackBuild.java:1576-1578');
    expect(r.shift2.msg).toContain('shift : trois nombres attendus, reçu 2');
    expect(r.id.ref).toBe('PackBuild.java:1515-1519');
    expect(r.material.msg).toContain('« material » attendu');
    expect(r.folder.msg).toContain('segments relatifs sont interdits');
    expect(r.marker.ref).toBe('PackBuild.java:1544-1550');
    expect(r.unknownIgnored.ok).toBe(true);
  });

  test('exclusions appliquées à l\'édition (setSlotComponent) : refus, ordre et clés inconnues conservés', async ({ page }) => {
    const r = await evalM(page, (entry) => {
      const M = ItemModel;
      const a = M.setSlotComponent(entry, 'gui', 'rotation', [0, 0, 0]);
      const b = M.setSlotComponent(entry, 'gui', 'translation', [0, 0, 0]);
      const c = M.setSlotComponent(entry, 'gui', 'front', null);
      const d = M.setSlotComponent(c.entry, 'gui', 'rotation', [10, 20, 30]);
      const e = M.setSlotComponent(entry, 'gui', 'fit', null);
      const f = M.setSlotComponent(e.entry, 'gui', 'scale', [2, 2, 2]);
      const g = M.setSlotComponent(f.entry, 'gui', 'fit', 12);
      const h = M.setSlotComponent(entry, 'head', 'scale', [1, 0, 1]);
      const i = M.setSlotComponent(entry, 'thirdperson_righthand', 'scale', [1, 1, 1]);
      const j = M.setSlotComponent(entry, 'head', 'translation', null);
      return { a, b, d: d.entry, f: f.entry, g, h, i, jKeys: Object.keys(j.entry), keys: Object.keys(d.entry) };
    }, PACK_OBJ.wings.test_wings);
    expect(r.a.ok).toBe(false);
    expect(r.a.ref).toBe('PackBuild.java:1592-1594');
    expect(r.b.ok).toBe(false);
    expect(r.b.ref).toBe('PackBuild.java:1599-1602');
    expect(r.d.gui).toEqual({ fit: 20, rotation: [10, 20, 30] });
    expect(r.keys).toEqual(['shift', 'head', 'gui', 'source']);
    expect(r.f.gui).toEqual({ front: true, scale: [2, 2, 2] });
    expect(r.g.ok).toBe(false);
    expect(r.h.ref).toBe('DisplayTransform.java:86-90');
    expect(r.i.ok).toBe(false);
    expect(r.jKeys).toEqual(['shift', 'gui', 'source']); // contexte vidé : retiré
  });
});

// --- Logique pure : fusion, validation, parité ---------------------------------------------------
test.describe('fusion ModelFit.apply et validation après fusion', () => {
  test.beforeEach(async ({ page }) => { await page.goto(PAGE, { waitUntil: 'load' }); });

  test('PARITÉ : valeurs finales identiques à celles de l\'assembleur de BC (gradlew buildPack)', async ({ page }) => {
    const results = await evalM(page, (cases) => cases.map(c => {
      const face = { uv: [0, 0, 16, 16], texture: '#0' };
      const model = { textures: { 0: './texture' }, elements: [{ from: c.min, to: c.max, faces: { north: face } }], display: c.display };
      const r = ItemModel.buildEntry({ category: c.category, id: c.id, entry: c.entry, folders: { wings: 'beltaria/cosmetiques', blocks: 'beltaria/blocs', items: 'beltaria/gear' }, modelText: JSON.stringify(model), files: ['model.json', 'texture.png'] });
      return { id: c.id, ok: r.ok, errors: r.errors, display: r.merged && r.merged.display, written: r.written };
    }), BC_PARITY);
    let compared = 0;
    for (const res of results) {
      const c = BC_PARITY.find(x => x.id === res.id);
      expect(res.errors, res.id).toEqual([]);
      expect(res.written).toEqual(Object.keys(c.built));
      for (const ctx of Object.keys(c.built)) for (const k of ['rotation', 'translation', 'scale']) for (let i = 0; i < 3; i++) {
        expect(Math.abs(res.display[ctx][k][i] - c.built[ctx][k][i]), `${res.id} ${ctx}.${k}[${i}]`).toBeLessThanOrEqual(1e-4);
        compared++;
      }
    }
    expect(compared).toBe(3 * 6 * 9);
  });

  test('remplacement composante par composante, front, turn composé, contextes écrits = model.json ∪ pack.json', async ({ page }) => {
    const r = await evalM(page, ([model, entry]) => {
      const res = ItemModel.buildEntry({ category: 'wings', id: 'test_wings', entry, folders: { wings: 'x' }, modelText: JSON.stringify(model), files: ['model.json', 'texture.png', 'texture.png.mcmeta'] });
      const turned = ItemModel.applySlot({ rotation: [0, 90, -35], translation: null, scale: null, fit: 0, front: false, turns: [[0, 0, -45]] }, null, null);
      const two = ItemModel.applySlot({ rotation: null, translation: null, scale: null, fit: 0, front: false, turns: [[0, 90, 0], [0, 0, -45]] }, { rotation: [0, 0, 0], translation: [1, 2, 3], scale: [1, 1, 1] }, null);
      return { res, turned, two };
    }, [WING_MODEL, PACK_OBJ.wings.test_wings]);
    const d = r.res.merged.display;
    expect(r.res.ok).toBe(true);
    expect(d.head).toEqual({ rotation: [-7, 0, 0], translation: [0, -23, 0], scale: [2, 2, 2] }); // seule la translation est imposée
    expect(d.gui.rotation).toEqual([-30, 135, 0]); // front : ModelFit.GUI_FRONT_ROTATION
    expect(r.res.written).toEqual(['head', 'gui']); // ni « toujours les six » : seuls model.json ∪ pack.json
    expect(r.res.overrides).toEqual(['head.translation', 'gui.rotation', 'gui.translation', 'gui.scale']);
    expect(r.res.overridden[0]).toEqual({ ctx: 'head', comp: 'translation', model: [0, -40, 2], final: [0, -23, 0] });
    expect(r.res.notes.map(n => n.text).join(' ')).toContain('pack.json impose, et model.json ne peut rien y changer');
    expect(r.turned.rotation).toEqual([0, 90, -80]); // Ry·Rx·Rz composé puis redécomposé (legendary_key)
    expect(r.two.translation).toEqual([1, 2, 3]);
    expect(r.two.rotation.length).toBe(3);
  });

  test('validation après fusion : refuse (sans borner) translation > 24, scale > 4 ou ≤ 0, élément hors [-16 ; 32] après shift', async ({ page }) => {
    const r = await evalM(page, ([model, entry]) => {
      const run = (e, m) => ItemModel.buildEntry({ category: 'wings', id: 'test_wings', entry: e, folders: { wings: 'x' }, modelText: JSON.stringify(m || model), files: ['model.json', 'texture.png'] });
      const m24 = JSON.parse(JSON.stringify(model)); m24.display.head.translation = [0, -24, 24];
      const mScale = JSON.parse(JSON.stringify(model)); mScale.display.gui.scale = [4, 4, 4]; mScale.display.head.translation = [0, -20, 0];
      return {
        modelOver24Overridden: run(entry), // model.json : head.translation -40, remplacée par -23 : accepté
        modelOver24Kept: run({}),           // sans remplacement : -40 refusé
        exactly24: run({}, m24),
        exactly4: run({ gui: {} }, mScale),
        over4: run({ head: { scale: [4.5, 4.5, 4.5] } }),
        scaleNeg: run({ head: { scale: [1, -1, 1] } }),
        shiftOut: run({ shift: [0, 0, 25] }),
        shiftOrigin: run({ shift: [1, -2, 3] })
      };
    }, [WING_MODEL, PACK_OBJ.wings.test_wings]);
    expect(r.modelOver24Overridden.ok).toBe(true);
    expect(r.modelOver24Kept.ok).toBe(false);
    expect(r.modelOver24Kept.errors[0].text).toContain('display.head.translation[1] = -40 hors de [-24 ; 24]');
    expect(r.modelOver24Kept.errors[0].ref).toBe('ModelFit.java:211-215');
    expect(r.modelOver24Kept.merged.display.head.translation).toEqual([0, -40, 2]); // jamais bornée
    expect(r.exactly24.ok).toBe(true);
    expect(r.exactly4.ok).toBe(true);
    expect(r.over4.errors.map(e => e.ref)).toContain('ModelFit.java:216-219');
    expect(r.over4.errors.find(e => e.ref === 'ModelFit.java:216-219').text).toContain('au-delà de 4');
    expect(r.scaleNeg.ok).toBe(false);
    expect(r.scaleNeg.errors.map(e => e.text).join(' ')).toContain('display.head : échelle -1 à l\'indice 1, strictement positive attendue');
    expect(r.shiftOut.ok).toBe(false);
    expect(r.shiftOut.errors[0].text).toContain('élément 0 hors bornes après décalage [0 ; 0 ; 25]');
    expect(r.shiftOut.errors[0].ref).toContain('ModelFit.java:174-181');
    // shift : chaque coin ET chaque origine de rotation d'élément (ModelFit.java:165-182)
    expect(r.shiftOrigin.merged.elements[0].from).toEqual([-7, -2, 11]);
    expect(r.shiftOrigin.merged.elements[0].to).toEqual([9, 14, 11]);
    expect(r.shiftOrigin.merged.elements[0].rotation.origin).toEqual([9, 6, 11]);
    expect(r.shiftOrigin.merged.elements[1].from).toEqual([9, -2, 11]);
  });

  test('textures : ./texture[_n] présentes dans le dossier, noms de fichiers texture*.png, damier', async ({ page }) => {
    const r = await evalM(page, (model) => {
      const run = (m, files) => ItemModel.buildEntry({ category: 'wings', id: 'w', entry: { head: { translation: [0, -23, 0] } }, folders: { wings: 'x' }, modelText: JSON.stringify(m), files });
      const bad = JSON.parse(JSON.stringify(model)); bad.textures['0'] = 'beltaria/wing';
      const second = JSON.parse(JSON.stringify(model)); second.textures['1'] = './texture_2';
      return {
        path: run(bad, ['model.json', 'texture.png']),
        missing: run(second, ['model.json', 'texture.png']),
        present: run(second, ['model.json', 'texture.png', 'texture_2.png', 'texture_2.png.mcmeta']),
        badName: run(model, ['model.json', 'texture.png', 'texture_old.png']),
        none: ItemModel.buildEntry({ category: 'wings', id: 'w', entry: {}, folders: { wings: 'x' }, modelText: null, files: ['notes.txt'] })
      };
    }, WING_MODEL);
    expect(r.path.errors[0].text).toContain('attendue en ./texture[_<n>], reçu beltaria/wing');
    expect(r.path.errors[0].ref).toBe('PackBuild.java:866-869');
    expect(r.missing.errors[0].text).toContain('texture_2.png est absent du dossier');
    expect(r.present.ok).toBe(true);
    expect(r.badName.errors[0].text).toContain('texture_old.png attendu sous la forme texture[_<n>].png[.mcmeta]');
    expect(r.none.errors[0].ref).toBe('PackBuild.java:646-649');
  });

  test('item plat (texture.png seule) : pas de modèle, placements vanilla, rien à régler', async ({ page }) => {
    const r = await evalM(page, () => ({
      flat: ItemModel.buildEntry({ category: 'items', id: 'flat_sword', entry: { material: 'diamond_sword' }, folders: { items: 'beltaria/gear' }, modelText: null, files: ['texture.png'] }),
      flatTuned: ItemModel.buildEntry({ category: 'items', id: 'flat_sword', entry: { material: 'diamond_sword', gui: { fit: 12 } }, folders: { items: 'beltaria/gear' }, modelText: null, files: ['texture.png'] }),
      bow: ItemModel.buildEntry({ category: 'items', id: 'arc', entry: { material: 'bow' }, folders: { items: 'g' }, modelText: null, files: ['bow_standby.png', 'bow_pulling_0.png'] }),
      kind: [ItemModel.vanillaKind('diamond_sword'), ItemModel.vanillaKind('bow'), ItemModel.vanillaKind('apple')]
    }));
    expect(r.flat.ok).toBe(true);
    expect(r.flat.flat).toBe(true);
    expect(r.flat.merged).toBeNull();
    expect(r.flat.notes[0].text).toContain('placements vanilla, rien à régler');
    expect(r.flatTuned.warnings[0].text).toContain('jamais appliqués');
    expect(r.bow.flat).toBe(true);
    expect(r.kind).toEqual(['outil', 'arc', 'simple']);
  });

  test('pack.json réécrit : seule l\'entrée change, tout le reste est conservé à l\'octet (LF et CRLF)', async ({ page }) => {
    const r = await evalM(page, (pack) => {
      const M = ItemModel;
      const obj = JSON.parse(pack);
      const crlf = pack.replace(/\n/g, '\r\n');
      const edited = M.setSlotComponent(obj.wings.test_wings, 'head', 'translation', [0, -20, 0]).entry;
      return {
        same: M.replaceEntry(pack, 'wings', 'test_wings', obj.wings.test_wings) === pack,
        edited: M.replaceEntry(pack, 'wings', 'test_wings', edited),
        editedCrlf: M.replaceEntry(crlf, 'wings', 'test_wings', edited),
        added: M.replaceEntry(pack, 'wings', 'new_wings', { shift: [0, 1, 0], gui: { front: true, fit: 20 } }),
        newCat: M.replaceEntry(pack, 'auras', 'halo', { head: { scale: [1, 1, 1] } }),
        snippet: M.entrySnippet('test_wings', edited)
      };
    }, PACK);
    expect(r.same).toBe(true);
    expect(r.edited).toBe(PACK.replace('"head": { "translation": [0, -23, 0] }', '"head": { "translation": [0, -20, 0] }'));
    expect(r.editedCrlf).toBe(PACK.replace(/\n/g, '\r\n').replace('"head": { "translation": [0, -23, 0] }', '"head": { "translation": [0, -20, 0] }'));
    const added = JSON.parse(r.added);
    expect(Object.keys(added.wings)).toEqual(['other_wings', 'test_wings', 'new_wings']);
    expect(r.added.startsWith(PACK.slice(0, PACK.indexOf('"source": "blockbench"')))).toBe(true);
    expect(r.added.endsWith(PACK.slice(PACK.indexOf('\n  },\n  "items"')))).toBe(true);
    const nc = JSON.parse(r.newCat);
    expect(Object.keys(nc)).toEqual([...Object.keys(PACK_OBJ), 'auras']);
    expect(r.newCat.startsWith(PACK.slice(0, PACK.lastIndexOf('\n}')))).toBe(true);
    expect(r.snippet).toContain('"test_wings": {\n      "shift": [0, -4, 0],\n      "head": { "translation": [0, -20, 0] },');
  });
});

// --- Chaîne de rendu client 1.8.9 ------------------------------------------------------------------
test.describe('chaîne de rendu client (MCP 1.8.9)', () => {
  test.beforeEach(async ({ page }) => { await page.goto(PAGE, { waitUntil: 'load' }); });

  test('RÉGRESSION 3e personne : l\'épée vanilla tenue sort de la main, devant et au-dessus, longueur réelle', async ({ page }) => {
    const r = await evalM(page, () => {
      const M = ItemModel;
      const t = M.VANILLA.outil.display.thirdperson; // diamond_sword.json 1.8.9
      const m = M.contextMatrix('thirdperson', t, { gui3d: false }); // item plat (builtin/generated)
      const px = (x, y) => M.apply(m, [x / 16, 1 - y / 16, 0.5]); // pixel de la texture
      const tip = px(15.5, 0.5), pommel = px(0.5, 15.5);
      const arm = M.partBoxMatrix(M.playerMatrix(), M.PLAYER_PARTS[2]);
      const corners = []; for (let i = 0; i < 8; i++) corners.push([i & 1, (i >> 1) & 1, (i >> 2) & 1]);
      const armBox = M.bbox(arm, corners);
      const handBottom = M.apply(arm, [0.5, 1, 0.5]);
      const box = M.bbox(m, [[0, 0, 0.5], [1, 0, 0.5], [0, 1, 0.5], [1, 1, 0.5]]);
      // l'ancien éditeur oubliait RenderItem.preTransform (×2 d'un item plat) : même chaîne sans ce ×2
      const old = M.chain(m, M.m4T(0.5, 0.5, 0.5), M.m4S(0.5, 0.5, 0.5), M.m4T(-0.5, -0.5, -0.5));
      const oldLen = Math.hypot(...[0, 1, 2].map(i => M.apply(old, [15.5 / 16, 15.5 / 16, 0.5])[i] - M.apply(old, [0.5 / 16, 0.5 / 16, 0.5])[i]));
      return { tip, pommel, armBox, handBottom, box, len: Math.hypot(tip[0] - pommel[0], tip[1] - pommel[1], tip[2] - pommel[2]), oldLen };
    });
    // 15 px de diagonale × √2 / 16 × 0,5 (renderItem) × 0,85 × 2 (preTransform) × 0,9375 (joueur)
    expect(r.len).toBeCloseTo(15 * Math.SQRT2 / 16 * 0.5 * 0.85 * 2 * 0.9375, 3);
    expect(r.len).toBeGreaterThan(1.0);
    expect(r.oldLen).toBeLessThan(0.55); // la moitié : l'épée « cachée dans le bras »
    expect(r.tip[2] - r.armBox.max[2]).toBeGreaterThan(0.6); // pointe 0,6 bloc devant la face avant du bras
    expect(r.tip[1]).toBeGreaterThan(r.handBottom[1]); // et au-dessus du bas de la main
    expect((r.box.min[2] + r.box.max[2]) / 2).toBeGreaterThan(r.armBox.max[2]); // centre de l'item devant le bras
    expect(r.pommel[2]).toBeGreaterThan(r.armBox.min[2]); // le pommeau reste dans le poing, pas derrière le dos
    expect(r.pommel[1]).toBeGreaterThan(r.handBottom[1] - 0.1);
  });

  test('tête : porte-armure qui chevauche le joueur à 1,35 bloc, tête +1,4453, unité 1,25/16', async ({ page }) => {
    const r = await evalM(page, () => {
      const M = ItemModel;
      const t = { rotation: [0, 0, 0], translation: [0, -23, 0], scale: [2, 2, 2] };
      const rider = M.apply(M.contextMatrix('head', t, { support: 'rider' }), [0.5, 0.5, 0.5]);
      const block = M.apply(M.contextMatrix('head', M.identityT(), { support: 'block' }), [0.5, 0.5, 0.5]);
      const back = M.apply(M.contextMatrix('head', M.identityT(), { support: 'rider' }), [0.5, 0.5, 1]); // +Z modèle
      return { rider, block, back, headSupport: ['wings', 'auras', 'blocks', 'items'].map(M.headSupport) };
    });
    expect(r.rider[1]).toBeCloseTo(1.35 + 1.5078125 - 1 / 16 + 0.25 - 23 * 1.25 / 16, 6);
    expect(r.block[1]).toBeCloseTo(1.5078125 - 1 / 16 + 0.25, 6);
    expect(r.back[2]).toBeLessThan(0); // +Z du modèle = derrière le joueur (qui regarde +Z)
    expect(r.headSupport).toEqual(['rider', 'rider', 'block', 'player']);
  });

  test('inventaire : un modèle « front » + fit est centré dans la case et vu de face, debout', async ({ page }) => {
    const r = await evalM(page, () => {
      const M = ItemModel;
      const f = { uv: [0, 0, 16, 16], texture: '#0' };
      const model = { textures: { 0: './texture' }, elements: [{ from: [0, 0, 6], to: [16, 8, 10], faces: { south: f, north: f } }, { from: [4, 8, 6], to: [12, 16, 10], faces: { south: f } }] };
      const res = M.buildEntry({ category: 'blocks', id: 'b', entry: { gui: { front: true, fit: 16 } }, folders: { blocks: 'x' }, modelText: JSON.stringify(model), files: ['texture.png'] });
      const m = M.contextMatrix('gui', res.merged.display.gui, {});
      const box = M.bbox(m, M.quadPoints(M.bakeQuads(res.merged.elements)));
      const top = M.apply(m, [0.5, 1, 0.5]), bottom = M.apply(m, [0.5, 0, 0.5]);
      const south = M.bakeQuads(res.merged.elements).find(q => q.face === 'south');
      return { box, topY: top[1], bottomY: bottom[1], southZ: M.apply(m, south.pos[0])[2] };
    });
    expect((r.box.min[0] + r.box.max[0]) / 2).toBeCloseTo(8, 2);
    expect((r.box.min[1] + r.box.max[1]) / 2).toBeCloseTo(8, 2);
    expect(r.topY).toBeLessThan(r.bottomY); // repère GUI : Y vers le bas, le haut du modèle reste en haut
    expect(r.southZ).toBeGreaterThan(0); // face sud vers l'écran
  });
});

// --- Interface --------------------------------------------------------------------------------------
test.describe('interface du réglage d\'entrée', () => {
  test('page intacte : visualiseur d\'origine, lien Beltaria Studio, aucun message d\'erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(PAGE, { waitUntil: 'load' });
    await expect(page.locator('a.st-back[href="index.html"]')).toHaveText('← Beltaria Studio');
    await page.setInputFiles('#itemUpload', { name: 'epee.png', mimeType: 'image/png', buffer: await pngBuffer(page, 16, 16, 1) });
    await expect(page.locator('#statusText')).toHaveText('Item simple : 16x16');
    await expect(page.locator('#bcPanel')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('.zip de pack-src : entrées listées, texture animée (1re image), table, remplacements, rendu 16 px', async ({ page }) => {
    const errors = collectErrors(page);
    await openPanel(page);
    const zip = makeZip(await packSrcFiles(page));
    await page.setInputFiles('#bcFiles', { name: 'pack-src.zip', mimeType: 'application/zip', buffer: zip });
    await settled(page);
    await expect(page.locator('#bcEntry')).toHaveValue('wings/test_wings');
    const s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.packPath).toBe('pack-src/pack.json');
    expect(s.entries.map(e => e.key)).toEqual(expect.arrayContaining(['wings/test_wings', 'wings/other_wings', 'items/flat_sword', 'items/temoin']));
    expect(s.ok, JSON.stringify(s.errors)).toBe(true);
    expect(s.textures).toEqual(['']);
    await expect(page.locator('#bcMsg')).toContainText('Accepté par BC');
    await expect(page.locator('#bcTable tbody tr')).toHaveCount(6);
    await expect(page.locator('#bcTable tr[data-ctx="ground"]')).toContainText('non écrit');
    await expect(page.locator('#bcTable tr[data-ctx="gui"]')).toContainText('r [-30, 135, 0]');
    await expect(page.locator('#bcOver')).toContainText('display.head.translation : model.json [0, -40, 2] → [0, -23, 0]');
    // première image d'une texture animée 16 × 32 : moitié haute rouge, moitié basse bleue, jamais le vert
    const tex = await page.evaluate(() => {
      const st = ItemModelUI.getState();
      return st.textures;
    });
    expect(tex).toEqual(['']);
    // vue inventaire : la vignette 16 px montre la face rouge (haut) et bleue (bas) du modèle
    await page.click('#bcTabs button[data-ctx="gui"]');
    await page.waitForFunction(() => {
      const d = document.getElementById('bcSlot16').getContext('2d').getImageData(0, 0, 16, 16).data;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 90) return true;
      return false;
    });
    const px = await page.evaluate(() => {
      const d = document.getElementById('bcSlot16').getContext('2d').getImageData(0, 0, 16, 16).data;
      let red = 0, blue = 0, green = 0, redY = 0, blueY = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        if (d[i] > 120 && d[i + 1] < 90 && d[i + 2] < 90) { red++; redY += y; }
        if (d[i + 2] > 120 && d[i] < 90 && d[i + 1] < 90) { blue++; blueY += y; }
        if (d[i + 1] > 150 && d[i] < 90) green++;
      }
      return { red, blue, green, redY: redY / Math.max(1, red), blueY: blueY / Math.max(1, blue) };
    });
    expect(px.red).toBeGreaterThan(3);
    expect(px.blue).toBeGreaterThan(3);
    expect(px.green).toBe(0); // la 2e image (verte) de l'animation n'est jamais affichée
    expect(px.redY).toBeLessThan(px.blueY); // debout : le haut de la texture en haut de la case
    expect(errors).toEqual([]);
  });

  test('exclusions dans l\'interface, refus en français avec la limite BC, export mis à jour', async ({ page }) => {
    const errors = collectErrors(page);
    await openPanel(page);
    await page.setInputFiles('#bcFiles', { name: 'pack-src.zip', mimeType: 'application/zip', buffer: makeZip(await packSrcFiles(page)) });
    await settled(page);
    await expect(page.locator('#bcEntry')).toHaveValue('wings/test_wings');
    await page.click('#bcTabs button[data-ctx="gui"]');
    // front coché : rotation indisponible ; fit coché : translation et scale indisponibles
    await expect(page.locator('#bc-on-front')).toBeChecked();
    await expect(page.locator('#bc-on-rotation')).toBeDisabled();
    await expect(page.locator('#bc-on-fit')).toBeChecked();
    await expect(page.locator('#bc-on-translation')).toBeDisabled();
    await expect(page.locator('#bc-on-scale')).toBeDisabled();
    await expect(page.locator('#bcCtxEditor')).toContainText('« front » l\'exclut (PackBuild.java:1592)');
    // l'API refuse aussi
    const refused = await page.evaluate(() => ItemModelUI.setComponent('gui', 'rotation', [0, 0, 0]));
    expect(refused.ok).toBe(false);
    await expect(page.locator('#bcMsg')).toContainText('PackBuild.java:1592-1594');
    // décocher front libère rotation
    await page.uncheck('#bc-on-front');
    await expect(page.locator('#bc-on-rotation')).toBeEnabled();
    await expect(page.locator('#bc-on-front')).toBeEnabled();
    await page.check('#bc-on-rotation');
    await expect(page.locator('#bc-on-front')).toBeDisabled();
    // décocher fit libère translation / scale
    await page.uncheck('#bc-on-fit');
    await expect(page.locator('#bc-on-translation')).toBeEnabled();
    await page.check('#bc-on-scale');
    await expect(page.locator('#bc-on-fit')).toBeDisabled();
    // tête : translation 30 refusée par BC (et non bornée), message français + limite + ligne
    await page.click('#bcTabs button[data-ctx="head"]');
    await page.fill('#bc-translation-1', '30');
    await page.locator('#bc-translation-1').dispatchEvent('change');
    await expect(page.locator('#bcMsg')).toContainText('Refusé par BeltariaContent');
    await expect(page.locator('#bcMsg')).toContainText('display.head.translation[1] = 30 hors de [-24 ; 24] (ModelFit.MAX_TRANSLATION');
    await expect(page.locator('#bcMsg')).toContainText('ModelFit.java:211-215');
    await expect(page.locator('#bcOut')).toHaveValue(/"head": \{ "translation": \[0, 30, 0\] \}/);
    await expect(page.locator('#bcTable tr[data-ctx="head"]')).toHaveClass(/bad/);
    // 24 tout juste : accepté
    await page.fill('#bc-translation-1', '24');
    await page.locator('#bc-translation-1').dispatchEvent('change');
    await expect(page.locator('#bcMsg')).toContainText('Accepté par BC');
    // shift : la géométrie bouge, le pack l'écrit
    await page.check('#bc-on-shift');
    await page.fill('#bc-shift-1', '-6');
    await page.locator('#bc-shift-1').dispatchEvent('change');
    const s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.shift).toEqual([0, -6, 0]);
    expect(s.elements[1].from).toEqual([8, -6, 8]);
    expect(errors).toEqual([]);
  });

  test('pack.json complet téléchargé : seule l\'entrée modifiée change', async ({ page }) => {
    await openPanel(page);
    await page.setInputFiles('#bcFiles', { name: 'pack-src.zip', mimeType: 'application/zip', buffer: makeZip(await packSrcFiles(page)) });
    await settled(page);
    await expect(page.locator('#bcEntry')).toHaveValue('wings/test_wings');
    await expect(page.locator('#bcExportInfo')).toContainText('pack.json inchangé');
    await page.evaluate(() => ItemModelUI.setComponent('head', 'translation', [0, -20, 0]));
    await expect(page.locator('#bcExportInfo')).toContainText('seule cette entrée change');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#bcDlPack')]);
    const text = fs.readFileSync(await download.path(), 'utf8');
    expect(download.suggestedFilename()).toBe('pack.json');
    expect(text).toBe(PACK.replace('"head": { "translation": [0, -23, 0] }', '"head": { "translation": [0, -20, 0] }'));
  });

  test('dossier pack-src (sélecteur de dossier) et fichiers isolés d\'une entrée plate', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openPanel(page);
    const root = testInfo.outputPath('pack-src');
    for (const f of await packSrcFiles(page)) {
      const p = path.join(testInfo.outputPath(), f.name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.data);
    }
    await page.setInputFiles('#bcDir', root);
    await settled(page);
    await expect(page.locator('#bcEntry')).toHaveValue('wings/test_wings');
    await page.selectOption('#bcEntry', 'items/flat_sword');
    await settled(page);
    await expect(page.locator('#bcCtxEditor')).toContainText('Placements vanilla, rien à régler');
    await expect(page.locator('#bcMsg')).toContainText('jamais appliqués');
    // fichiers isolés : texture.png seule + pack.json, associée à items/flat_sword
    await page.setInputFiles('#bcFiles', [
      { name: 'texture.png', mimeType: 'image/png', buffer: await pngBuffer(page, 16, 16, 1) },
      { name: 'pack.json', mimeType: 'application/json', buffer: Buffer.from(PACK) }
    ]);
    await expect(page.locator('#bcLoose')).toBeVisible();
    await page.selectOption('#bcCat', 'items');
    await page.fill('#bcId', 'flat_sword');
    await page.locator('#bcId').dispatchEvent('change');
    await settled(page);
    await expect(page.locator('#bcEntry')).toHaveValue('*loose');
    const s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current).toMatchObject({ category: 'items', id: 'flat_sword' });
    expect(s.flat).toBe(true);
    expect(s.ok, JSON.stringify(s.errors)).toBe(true);
    await expect(page.locator('#bcCtxEditor')).toContainText('Placements vanilla, rien à régler');
    await expect(page.locator('#bc-on-rotation')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('RÉGRESSION chargement : ores/armor ignorés, entrées non chargées à part et sans faux refus, fichiers isolés expliqués', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openPanel(page);
    // Dossier « pack » du serveur : mêmes sous-dossiers que pack-src, plus ores/ et armor/ que ce réglage ne traite pas
    const files = (await packSrcFiles(page)).map(f => ({ ...f, name: f.name.replace(/^pack-src\//, 'pack/') }));
    files.push({ name: 'pack/ores/oak_wood/texture.png', data: await pngBuffer(page, 16, 16, 1) });
    files.push({ name: 'pack/armor/demo/layer_1.png', data: await pngBuffer(page, 64, 32, 1) });
    for (const f of files) {
      const p = path.join(testInfo.outputPath(), f.name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.data);
    }
    await page.setInputFiles('#bcDir', testInfo.outputPath('pack'));
    await settled(page);
    // pas de fausse entrée « fichiers isolés » tirée de ores/oak_wood : la première vraie aile est choisie
    await expect(page.locator('#bcEntry')).toHaveValue('wings/test_wings');
    await expect(page.locator('#bcEntry option[value="*loose"]')).toHaveCount(0);

    // Seuls quelques fichiers chargés : les autres entrées de pack.json sont regroupées à part…
    await page.setInputFiles('#bcFiles', [
      { name: 'pack.json', mimeType: 'application/json', buffer: Buffer.from(PACK) },
      { name: 'model.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(WING_MODEL)) }
    ]);
    await settled(page);
    const group = page.locator('#bcEntry optgroup[label="Dans pack.json — fichiers non chargés"]');
    await expect(group.locator('option[value="items/flat_sword"]')).toHaveCount(1);
    // … et des fichiers sans leur dossier sont expliqués (identifiant inconnu)
    await expect(page.locator('#bcMsg')).toContainText('Fichiers chargés sans leur dossier');
    // choisir une entrée non chargée : avertissement, jamais « Refusé par BeltariaContent »
    await page.selectOption('#bcEntry', 'items/flat_sword');
    await settled(page);
    await expect(page.locator('#bcMsg')).toContainText('ne sont pas chargés');
    await expect(page.locator('#bcMsg')).not.toContainText('Refusé par BeltariaContent');
    await expect(page.locator('#bcMsg')).not.toContainText('dossier absent');
    expect(errors).toEqual([]);
  });

  test('téléphone 375 px : aucun défilement horizontal, tous contextes', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await openPanel(page);
    await page.setInputFiles('#bcFiles', { name: 'pack-src.zip', mimeType: 'application/zip', buffer: makeZip(await packSrcFiles(page)) });
    await settled(page);
    await expect(page.locator('#bcEntry')).toHaveValue('wings/test_wings');
    for (const ctx of ['thirdperson', 'firstperson', 'head', 'gui', 'ground', 'fixed']) {
      await page.click(`#bcTabs button[data-ctx="${ctx}"]`);
      const w = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth, body: document.body.scrollWidth,
        sidebar: document.getElementById('sidebar').scrollWidth, sidebarClient: document.getElementById('sidebar').clientWidth
      }));
      expect(w.doc, ctx).toBeLessThanOrEqual(375);
      expect(w.body, ctx).toBeLessThanOrEqual(375);
      expect(w.sidebar, ctx).toBeLessThanOrEqual(w.sidebarClient);
    }
    await page.evaluate(() => ItemModelUI.setComponent('head', 'translation', [0, 99, 0])); // longs messages d'erreur
    expect(await page.evaluate(() => document.getElementById('sidebar').scrollWidth <= document.getElementById('sidebar').clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});

// --- Manipulation directe : inverse exacte de la chaîne de rendu (logique pure) ------------------------
test.describe('poignée 3D : inverse exacte de la chaîne de rendu (MCP 1.8.9)', () => {
  test.beforeEach(async ({ page }) => { await page.goto(PAGE, { waitUntil: 'load' }); });

  test('INVERSE EXACTE : translation, rotation, échelle et shift dans tous les contextes (écart ≤ 1e-6)', async ({ page }) => {
    const r = await evalM(page, () => {
      const M = ItemModel;
      const sub = (a, b) => a.map((v, i) => v - b[i]);
      const add = (a, b) => a.map((v, i) => v + b[i]);
      const err = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      const mul = (m, v) => [0, 1, 2].map(i => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
      const cases = [['thirdperson', {}], ['head', { support: 'rider' }], ['head', { support: 'player' }], ['head', { support: 'block' }],
        ['head', { support: 'stand' }], ['gui', {}], ['ground', {}], ['fixed', {}], ['firstperson', {}]];
      const t0 = { rotation: [12.5, -33, 71], translation: [1.5, -6.25, 3], scale: [0.8, 1.3, 0.6] };
      const pts = [[0, 0, 0], [1, 1, 1], [0.2, 0.9, 0.4], [-0.5, 1.5, 0.3]];
      const worst = { translate: 0, rotate: 0, scale: 0, shift: 0, rotateMoved: 0 };
      for (const [ctx, opts] of cases) {
        const W = t => M.sceneMatrix(ctx, t, opts);
        const unit = ctx === 'gui' ? 1 : 1 / 16; // le repère GUI est en pixels
        const dw = [0.137, -0.071, 0.052].map(v => v * (ctx === 'gui' ? 16 : 1));
        // translation : chaque point du modèle bouge exactement de dw
        const t1 = M.gizmoInverse(ctx, t0, opts, { mode: 'translate', world: dw });
        pts.forEach(p => { worst.translate = Math.max(worst.translate, err(sub(M.apply(W(t1), p), M.apply(W(t0), p)), dw)); });
        // rotation autour de l'ancre : W'(p) = A + Q (W(p) - A)
        const axis = [0.3, -0.8, 0.5], ang = 37;
        const t2 = M.gizmoInverse(ctx, t0, opts, { mode: 'rotate', axis, angle: ang });
        const A = M.gizmoFrame(ctx, t0, opts).anchor, Q = M.axisAngle3(axis, ang);
        pts.forEach(p => {
          const want = add(A, mul(Q, sub(M.apply(W(t0), p), A)));
          worst.rotate = Math.max(worst.rotate, err(M.apply(W(t2), p), want));
          worst.rotateMoved = Math.max(worst.rotateMoved, err(M.apply(W(t2), p), M.apply(W(t0), p)) / unit);
        });
        // échelle dans les axes du modèle : chaque arête du modèle est multipliée par son facteur
        const f = [1.5, 0.75, 2];
        const t3 = M.gizmoInverse(ctx, t0, opts, { mode: 'scale', factor: f });
        [0, 1, 2].forEach(k => {
          const e = [0, 0, 0]; e[k] = 1;
          const before = sub(M.apply(W(t0), e), M.apply(W(t0), [0, 0, 0])), after = sub(M.apply(W(t3), e), M.apply(W(t3), [0, 0, 0]));
          worst.scale = Math.max(worst.scale, err(after, before.map(v => v * f[k])));
        });
        // shift : la géométrie décalée de Δs px se dessine exactement dw plus loin
        const ds = M.gizmoInverse(ctx, t0, opts, { mode: 'shift', world: dw }).shift;
        pts.forEach(p => { worst.shift = Math.max(worst.shift, err(sub(M.apply(W(t0), add(p, ds.map(v => v / 16))), M.apply(W(t0), p)), dw)); });
      }
      // casque porté par le porte-armure : 1 unité JSON = 1,25/16 bloc, X et Z inversés (le porte-armure regarde le joueur de dos)
      const rider = { support: 'rider' };
      const up = M.gizmoInverse('head', t0, rider, { mode: 'translate', world: [1.25 / 16, 1.25 / 16, 1.25 / 16] }).translation;
      const unitHead = M.gizmoFrame('head', t0, rider).unit;
      // avec des pivots (turn) : la « rotation » rendue est celle du contexte, composée par BC avec les pivots
      const turns = [[0, 0, -45]];
      const base = M.applySlot({ rotation: [0, 90, -35], translation: [0, 1.25, -3.5], scale: [0.85, 0.85, 0.85], fit: 0, front: false, turns }, null, null);
      const tt = { rotation: base.rotation, translation: base.translation, scale: base.scale };
      const rt = M.gizmoInverse('thirdperson', tt, {}, { mode: 'rotate', axis: [0, 1, 0], angle: 30 }, turns);
      const rebuilt = M.applySlot({ rotation: rt.contextRotation, translation: tt.translation, scale: tt.scale, fit: 0, front: false, turns }, null, null);
      const A = M.gizmoFrame('thirdperson', tt, {}).anchor, Q = M.axisAngle3([0, 1, 0], 30);
      const turnErr = Math.max(...[[0, 0, 0], [1, 1, 1], [1, 0, 0.5]].map(p => err(M.apply(M.sceneMatrix('thirdperson', rebuilt, {}), p),
        add(A, mul(Q, sub(M.apply(M.sceneMatrix('thirdperson', tt, {}), p), A))))));
      return { worst, up, unitHead, turnErr, rebuiltRot: rebuilt.rotation, rtRot: rt.rotation };
    });
    expect(r.worst.translate).toBeLessThanOrEqual(1e-6);
    expect(r.worst.rotate).toBeLessThanOrEqual(1e-6);
    expect(r.worst.rotateMoved).toBeGreaterThan(0.1); // la rotation déplace vraiment les points
    expect(r.worst.scale).toBeLessThanOrEqual(1e-6);
    expect(r.worst.shift).toBeLessThanOrEqual(1e-6);
    expect(r.unitHead).toBeCloseTo(1.25 / 16, 12);
    expect(r.up.map(v => Math.round(v * 1e9) / 1e9)).toEqual([0.5, -5.25, 2]); // [1,5 - 1 ; -6,25 + 1 ; 3 - 1]
    expect(r.turnErr).toBeLessThanOrEqual(1e-4); // BC arrondit la rotation composée au millième de degré
  });

  test('mannequin 1.8 : ModelBox (UV, gonflement, miroir) et pièces de LayerBipedArmor', async ({ page }) => {
    const r = await evalM(page, () => {
      const M = ItemModel;
      const front = M.modelBoxQuads([-4, 0, -2, 8, 12, 4], 1, false, [16, 16, 64, 32]).find(q => q.face === 'front');
      const mirrored = M.modelBoxQuads([-1, -2, -2, 4, 12, 4], 1, true, [40, 16, 64, 32]).find(q => q.face === 'front');
      const boxes = M.mannequinBoxes('debout', false, true);
      const armor = boxes.filter(b => b.layer !== 'skin').map(b => `${b.piece}:${b.part}:${b.layer}:${b.inflate}:${b.mirror ? 'm' : ''}`);
      const skin = boxes.filter(b => b.layer === 'skin').map(b => `${b.part}:${b.tex.join(',')}:${b.inflate}`);
      const xs = q => q.pos.map(p => p[0]);
      return { frontPos: front.pos, frontUv: front.uv, mirroredUv: mirrored.uv, mirroredX: xs(mirrored), armor, skin,
        holding: M.poseAngles('debout', true).rightArm, rest: M.poseAngles('debout', false).rightArm };
    });
    // plastron : torse 8 × 12 × 4 gonflé de 1 px de chaque côté (ModelBox.java:52-57) ; face avant en z = -3
    expect(r.frontPos).toEqual([[5, -1, -3], [-5, -1, -3], [-5, 13, -3], [5, 13, -3]]);
    // UV de la face avant : (u + d, v + d) -> (u + d + w, v + d + h) sur 64 × 32 (ModelBox.java:86), sommets de TexturedQuad
    expect(r.frontUv).toEqual([[28 / 64, 20 / 32], [20 / 64, 20 / 32], [20 / 64, 32 / 32], [28 / 64, 32 / 32]]);
    // bras gauche en miroir : x1/x2 échangés puis flipFace (UV inversées dans l'ordre des sommets)
    expect(r.mirroredUv).toEqual([[48 / 64, 32 / 32], [44 / 64, 32 / 32], [44 / 64, 20 / 32], [48 / 64, 20 / 32]]);
    expect(r.mirroredX).toEqual([-2, 4, 4, -2]);
    expect(r.armor).toEqual([
      'helmet:head:armor1:1:', 'helmet:headwear:armor1:1.5:', // casque : tête + couche de chapeau (+0,5)
      'chestplate:body:armor1:1:', 'chestplate:rightArm:armor1:1:', 'chestplate:leftArm:armor1:1:m',
      'leggings:body:armor2:0.5:', 'leggings:rightLeg:armor2:0.5:', 'leggings:leftLeg:armor2:0.5:m',
      'boots:rightLeg:armor1:1:', 'boots:leftLeg:armor1:1:m']);
    expect(r.skin).toEqual(['head:0,0,64,64:0', 'headwear:32,0,64,64:0.5', 'body:16,16,64,64:0', 'body:16,32,64,64:0.25', 'rightArm:40,16,64,64:0', 'rightArm:40,32,64,64:0.25',
      'leftArm:32,48,64,64:0', 'leftArm:48,48,64,64:0.25', 'rightLeg:0,16,64,64:0', 'rightLeg:0,32,64,64:0.25', 'leftLeg:16,48,64,64:0', 'leftLeg:0,48,64,64:0.25']); // ModelPlayer : 2e couche +0,25, chapeau +0,5
    expect(r.holding[0]).toBeCloseTo(-Math.PI / 10, 12);
    expect(r.holding[2]).toBeCloseTo(0.1, 12);
    expect(r.rest[0]).toBe(0);
  });
});

// --- Curseurs, poignée, historique, mannequin (interface) -----------------------------------------
// Couches d'armure synthétiques : rectangles [x, y, w, h, couleur] en unités 64 × 32, à l'échelle de la texture
async function rectPng(page, w, h, rects, unitW) {
  const b64 = await page.evaluate(([w, h, rects, unitW]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const s = w / unitW;
    rects.forEach(([x, y, rw, rh, col]) => { g.fillStyle = col; g.fillRect(x * s, y * s, rw * s, rh * s); });
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h, rects, unitW || 64]);
  return Buffer.from(b64, 'base64');
}
// couche 1 : casque, plastron et bras de la couleur donnée, jambes transparentes ; couche 2 : jambières
const layer1 = col => [[0, 0, 32, 16, col], [16, 16, 24, 16, col], [40, 16, 16, 16, col]];
const layer2 = col => [[0, 16, 16, 16, col], [16, 16, 24, 16, col]];

async function armorPackFiles(page) {
  return [...await packSrcFiles(page),
    { name: 'pack-src/armor/fer_test/layer_1.png', data: await rectPng(page, 64, 32, layer1('#ff00ff')) },
    { name: 'pack-src/armor/fer_test/layer_2.png', data: await rectPng(page, 64, 32, layer2('#00ffff')) },
    { name: 'pack-src/armor/hd_test/layer_1.png', data: await rectPng(page, 128, 64, layer1('#ffff00')) },
    { name: 'pack-src/armor/hd_test/layer_2.png', data: await rectPng(page, 128, 64, layer2('#0000ff')) },
    { name: 'pack-src/armor/seule/layer.png', data: await rectPng(page, 64, 32, layer1('#ff8000')) },
    { name: 'pack-src/armor/incomplete/layer_1.png', data: await rectPng(page, 64, 32, layer1('#ffffff')) }];
}
async function loadZip(page, files) {
  await page.setInputFiles('#bcFiles', { name: 'pack-src.zip', mimeType: 'application/zip', buffer: makeZip(files) });
  await settled(page);
  await expect(page.locator('#bcEntry')).toHaveValue('wings/test_wings');
}
// Couleur rendue au point du mannequin (pièce, px), une fois que le rendu satisfait `ok`
async function playerColor(page, part, p, ok) {
  const handle = await page.waitForFunction(([part, p, ok]) => {
    const c = ItemModelUI.samplePixel(ItemModelUI.playerPoint(part, p));
    if (!c) return false;
    const [r, g, b] = c;
    return new Function('r', 'g', 'b', `return ${ok};`)(r, g, b) ? c : false;
  }, [part, p, ok], { timeout: 5000 });
  return handle.jsonValue();
}

test.describe('curseurs, poignée 3D, annuler / rétablir', () => {
  test('curseur : display fusionné et pack.json exporté changent de la valeur glissée, échelle uniforme, aperçu direct', async ({ page }) => {
    const errors = collectErrors(page);
    await openPanel(page);
    await loadZip(page, await packSrcFiles(page));
    await page.click('#bcTabs button[data-ctx="head"]');
    // les curseurs vont exactement des bornes de BC
    await expect(page.locator('#bc-translation-1-r')).toHaveAttribute('min', '-24');
    await expect(page.locator('#bc-translation-1-r')).toHaveAttribute('max', '24');
    await expect(page.locator('#bc-scale-0-r')).toHaveAttribute('max', '4');
    await expect(page.locator('#bc-rotation-2-r')).toHaveAttribute('step', '0.5');
    const r = await page.evaluate(() => ItemModelUI.setSlider('head', 'translation', 1, -20.5));
    expect(r.ok).toBe(true);
    let s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.display.head.translation).toEqual([0, -20.5, 0]);
    await expect(page.locator('#bc-translation-1')).toHaveValue('-20.5');
    const pack = await page.evaluate(() => ItemModelUI.exportPack());
    expect(pack).toBe(PACK.replace('"head": { "translation": [0, -23, 0] }', '"head": { "translation": [0, -20.5, 0] }'));
    // échelle : la composante est cochée par le curseur (valeurs de model.json), verrou uniforme
    await page.evaluate(() => ItemModelUI.setSlider('head', 'scale', 0, 1.25));
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.scale).toEqual([1.25, 1.25, 1.25]);
    expect(s.display.head.scale).toEqual([1.25, 1.25, 1.25]);
    await page.uncheck('#bcUniform');
    await page.evaluate(() => ItemModelUI.setSlider('head', 'scale', 2, 0.5));
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.scale).toEqual([1.25, 1.25, 0.5]);
    // shift : bornes du curseur = éléments dans [-16 ; 32] (WING_MODEL : x de -8 à 24, y de 0 à 16, z à 8)
    await page.check('#bc-on-shift');
    await expect(page.locator('#bc-shift-0-r')).toHaveAttribute('min', '-8');
    await expect(page.locator('#bc-shift-0-r')).toHaveAttribute('max', '8');
    await expect(page.locator('#bc-shift-1-r')).toHaveAttribute('min', '-16');
    await page.evaluate(() => ItemModelUI.setSlider('head', 'shift', 1, -6.5));
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.shift).toEqual([0, -6.5, 0]);
    expect(s.elements[1].from).toEqual([8, -6.5, 8]);
    // aperçu direct : pendant le glissé (input seul) l'entrée suit, image par image, sans attendre le relâchement
    const live = await page.evaluate(async () => {
      const sl = document.getElementById('bc-translation-1-r');
      sl.value = '-10'; sl.dispatchEvent(new Event('input'));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const during = ItemModelUI.getState();
      sl.dispatchEvent(new Event('change'));
      return { y: during.display.head.translation[1], undoDuring: during.history.undo, undoAfter: ItemModelUI.getState().history.undo };
    });
    expect(live.y).toBe(-10);
    expect(live.undoAfter).toBe(live.undoDuring + 1); // le geste n'entre dans l'historique qu'au relâchement
    expect(errors).toEqual([]);
  });

  test('curseurs : exclusions de BC (front / fit) et valeur saisie hors bornes montrée refusée, jamais bornée', async ({ page }) => {
    const errors = collectErrors(page);
    await openPanel(page);
    await loadZip(page, await packSrcFiles(page));
    await page.click('#bcTabs button[data-ctx="gui"]');
    // fit coché : curseurs de translation et d'échelle désactivés, avec la raison ; front : rotation désactivée
    await expect(page.locator('#bc-translation-0-r')).toBeDisabled();
    await expect(page.locator('#bc-scale-0-r')).toBeDisabled();
    await expect(page.locator('#bc-rotation-0-r')).toBeDisabled();
    await expect(page.locator('#bcCtxEditor')).toContainText('Exclu : « fit » la calcule (PackBuild.java:1599)');
    const refused = await page.evaluate(() => ItemModelUI.setSlider('gui', 'translation', 0, 2));
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain('fit');
    const rot = await page.evaluate(() => ItemModelUI.setSlider('gui', 'rotation', 0, 10));
    expect(rot.ok).toBe(false);
    // le curseur de fit va de ]0 ; 32] et fonctionne
    await expect(page.locator('#bc-fit-r')).toHaveAttribute('max', '32');
    expect(Number(await page.locator('#bc-fit-r').getAttribute('min'))).toBeGreaterThan(0);
    await page.evaluate(() => ItemModelUI.setSlider('gui', 'fit', 0, 12));
    let s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.gui).toEqual({ front: true, fit: 12 });
    // tête : 30 saisi au clavier, refusé par BC et non borné ; le champ est marqué, le curseur reste aux bornes
    await page.click('#bcTabs button[data-ctx="head"]');
    await page.fill('#bc-translation-1', '30');
    await page.locator('#bc-translation-1').dispatchEvent('change');
    await expect(page.locator('#bcMsg')).toContainText('display.head.translation[1] = 30 hors de [-24 ; 24]');
    await expect(page.locator('#bc-translation-1')).toHaveClass(/bad/);
    expect(await page.locator('#bc-translation-1-r').inputValue()).toBe('24');
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.translation).toEqual([0, 30, 0]);
    expect(s.display.head.translation).toEqual([0, 30, 0]);
    expect(errors).toEqual([]);
  });

  test('poignée (geste simulé) : translation exacte en unités de casque, aimant, rotation, exclusions, annuler / rétablir', async ({ page }) => {
    const errors = collectErrors(page);
    await openPanel(page);
    await loadZip(page, await packSrcFiles(page));
    await page.click('#bcTabs button[data-ctx="head"]');
    let s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.gizmo.attached).toBe(true);
    expect(s.gizmo.mode).toBe('translate');
    // porte-armure : 1 unité = 1,25/16 bloc ; monter de 2 unités = 0,15625 bloc
    let r = await page.evaluate(() => ItemModelUI.gizmoDrag('translate', [0, 0.15625, 0], { snap: false }));
    expect(r.ok).toBe(true);
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.translation).toEqual([0, -21, 0]);
    expect(s.history.undo).toBe(1);
    expect(await page.evaluate(() => ItemModelUI.exportPack())).toContain('"head": { "translation": [0, -21, 0] }');
    // la poignée suit le modèle
    const anchor = s.gizmo.anchor;
    // aimant : 0,03 bloc = 0,384 unité -> arrondi au multiple de 0,25
    await page.evaluate(() => ItemModelUI.gizmoDrag('translate', [0, 0.03, 0], { snap: true }));
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.translation).toEqual([0, -20.5, 0]);
    expect(s.gizmo.anchor[1] - anchor[1]).toBeCloseTo(0.5 * 1.25 / 16, 9);
    // sans aimant : arrondi à 4 décimales au plus
    await page.evaluate(() => ItemModelUI.gizmoDrag('translate', [0.01, 0, 0], { snap: false }));
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.translation).toEqual([-0.128, -20.5, 0]);
    // rotation : 20° aimantés à 15° autour de l'axe X de la poignée (= X du modèle tourné)
    await page.evaluate(() => ItemModelUI.gizmoDrag('rotate', { axis: 'X', angle: 20 }, { snap: true }));
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.rotation).toEqual([8, 0, 0]); // model.json : -7 ; +15
    // échelle : facteur 1,5 depuis model.json (2), verrou uniforme
    await page.evaluate(() => ItemModelUI.gizmoDrag('scale', [1.5, 1, 1], { snap: false }));
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.scale).toEqual([3, 3, 3]);
    // curseurs synchronisés avec la poignée
    await expect(page.locator('#bc-scale-1')).toHaveValue('3');
    await expect(page.locator('#bc-rotation-0')).toHaveValue('8');
    // shift : la géométrie bouge, l'entrée l'écrit
    await page.evaluate(() => ItemModelUI.gizmoDrag('shift', [0, -0.15625, 0], { snap: false }));
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.shift[1]).toBeCloseTo(-4 - (16 * 0.15625 / 1.25 / 1.5) * Math.cos(8 * Math.PI / 180), 3); // modèle tourné de 8° en X, échelle 3, ×0,5 de renderItem
    expect(s.history.undo).toBe(6);
    // annuler / rétablir (Ctrl+Z / Ctrl+Y et boutons)
    await page.locator('#bcView canvas').first().click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.shift).toEqual([0, -4, 0]);
    await page.click('#bcUndo');
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.scale).toBeUndefined();
    await page.keyboard.press('Control+y');
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.head.scale).toEqual([3, 3, 3]);
    expect(s.history).toEqual({ undo: 5, redo: 1 });
    await expect(page.locator('#bc-scale-0')).toHaveValue('3');
    for (let i = 0; i < 5; i++) await page.evaluate(() => ItemModelUI.undo());
    expect(await page.evaluate(() => ItemModelUI.exportPack())).toBe(PACK); // retour à l'octet près
    // touches G / R / S
    await page.keyboard.press('r');
    expect((await page.evaluate(() => ItemModelUI.getState())).gizmo.mode).toBe('rotate');
    await page.keyboard.press('s');
    expect((await page.evaluate(() => ItemModelUI.getState())).gizmo.mode).toBe('scale');
    await page.keyboard.press('g');
    expect((await page.evaluate(() => ItemModelUI.getState())).gizmo.mode).toBe('translate');
    // exclusions : inventaire (front + fit) -> déplacer, tourner, échelle et shift refusés avec la raison
    await page.click('#bcTabs button[data-ctx="gui"]');
    for (const mode of ['translate', 'rotate', 'scale', 'shift']) {
      const x = await page.evaluate(m => ItemModelUI.gizmoDrag(m, m === 'rotate' ? { axis: 'Y', angle: 10 } : m === 'scale' ? [2, 2, 2] : [1, 0, 0]), mode);
      expect(x.ok, mode).toBe(false);
    }
    await expect(page.locator('#bcGizmoWhy')).toContainText('« fit » recentre le modèle');
    await expect(page.locator('#bcTools button[data-mode="rotate"]')).toBeDisabled();
    s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.current.entry.gui).toEqual({ front: true, fit: 20 });
    expect(errors).toEqual([]);
  });

  test('poignée à la souris : glisser la flèche X déplace translation X seule, orbite figée pendant le geste', async ({ page }) => {
    const errors = collectErrors(page);
    await openPanel(page);
    await loadZip(page, await packSrcFiles(page));
    await page.click('#bcTabs button[data-ctx="head"]');
    await page.waitForFunction(() => ItemModelUI.getState().gizmo.attached && ItemModelUI.gizmoHandlePoint('X'));
    const start = await page.evaluate(() => ItemModelUI.gizmoHandlePoint('X'));
    const cam0 = await page.evaluate(() => ItemModelUI.cameraPosition());
    const before = await page.evaluate(() => ItemModelUI.getState());
    // le long de la flèche, vers l'extérieur
    const len = Math.hypot(start.x - start.ox, start.y - start.oy);
    const ux = (start.x - start.ox) / len, uy = (start.y - start.oy) / len;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(start.x + 6 * i * ux, start.y + 6 * i * uy);
    await page.mouse.up();
    const after = await page.evaluate(() => ItemModelUI.getState());
    const cam1 = await page.evaluate(() => ItemModelUI.cameraPosition());
    expect(after.current.entry.head.translation[0]).not.toBe(before.current.entry.head.translation[0]);
    expect(after.current.entry.head.translation[1]).toBe(-23);
    expect(after.current.entry.head.translation[2]).toBe(0);
    expect(after.history.undo).toBe(1);
    cam1.forEach((v, i) => expect(v).toBeCloseTo(cam0[i], 6));
    await expect(page.locator('#bc-translation-0')).toHaveValue(String(after.current.entry.head.translation[0]));
    expect(errors).toEqual([]);
  });
});

test.describe('mannequin : peau et armure 1.8', () => {
  test('armures du pack listées (64×32, 128×64, layer.png, incomplète refusée) et dessinées sur le joueur', async ({ page }) => {
    const errors = collectErrors(page);
    await openPanel(page);
    await loadZip(page, await armorPackFiles(page));
    const s = await page.evaluate(() => ItemModelUI.getState());
    expect(s.mannequin.armorSets).toEqual([
      { name: 'fer_test', ok: true, problem: '', custom: false },
      { name: 'hd_test', ok: true, problem: '', custom: false },
      { name: 'incomplete', ok: false, problem: 'layer_2.png absente (ni layer.png)', custom: false },
      { name: 'seule', ok: true, problem: '', custom: false }]);
    await expect(page.locator('#bcArmor option')).toHaveText(['aucune', 'fer_test', 'hd_test', 'incomplete — refusé : layer_2.png absente (ni layer.png)', 'seule']);
    await expect(page.locator('#bcArmor option[value="incomplete"]')).toHaveJSProperty('disabled', true);
    await page.click('#bcTabs button[data-ctx="thirdperson"]');
    await page.evaluate(() => { ItemModelUI.setGizmoMode('off'); ItemModelUI.setShowItem(false); });
    // sans armure : t-shirt du mannequin sur le torse
    await playerColor(page, 'body', [0, 4, -3], 'g > 80 && b > 80 && r < 110 && Math.abs(g - b) < 40');
    // fer_test (64 × 32) : plastron magenta (couche 1, gonflé de 1), jambières cyan (couche 2, 0,5)
    await page.selectOption('#bcArmor', 'fer_test');
    await page.waitForFunction(() => ItemModelUI.getState().mannequin.armor);
    await playerColor(page, 'body', [0, 4, -3], 'r > 120 && b > 120 && g < 60');
    await playerColor(page, 'rightLeg', [0, 5, -2.5], 'g > 120 && b > 120 && r < 60');
    await playerColor(page, 'rightArm', [-1, 4, -3], 'r > 120 && b > 120 && g < 60');
    expect((await page.evaluate(() => ItemModelUI.getState())).mannequin.meshes).toEqual(expect.arrayContaining(['body:armor1', 'body:armor2', 'headwear:armor1', 'leftLeg:armor1']));
    // hd_test (128 × 64) : mêmes zones, texture HD
    await page.evaluate(() => ItemModelUI.setArmor('hd_test'));
    expect((await page.evaluate(() => ItemModelUI.getState())).mannequin.armor).toEqual({ name: 'hd_test', layer1: [128, 64], layer2: [128, 64] });
    await playerColor(page, 'body', [0, 4, -3], 'r > 120 && g > 120 && b < 60');
    await playerColor(page, 'rightLeg', [0, 5, -2.5], 'b > 120 && r < 60 && g < 60');
    // layer.png seule : les deux couches
    await page.evaluate(() => ItemModelUI.setArmor('seule'));
    await playerColor(page, 'body', [0, 4, -3], 'r > 150 && g > 50 && g < 140 && b < 50');
    // incomplète : refusée comme BC (PackBuild.layerSuffixes)
    const inc = await page.evaluate(() => ItemModelUI.setArmor('incomplete'));
    expect(inc.mannequin.message.text).toContain('PackBuild.java:766-785');
    // vue Tête (ailes portées par le porte-armure) : le joueur armé est là aussi ; masquable
    await page.evaluate(() => ItemModelUI.setArmor('fer_test'));
    await page.click('#bcTabs button[data-ctx="head"]');
    expect((await page.evaluate(() => ItemModelUI.getState())).mannequin.visible).toBe(true);
    await page.uncheck('#bcShowPlayer');
    expect((await page.evaluate(() => ItemModelUI.getState())).mannequin.visible).toBe(false);
    // « aucune »
    await page.check('#bcShowPlayer');
    await page.selectOption('#bcArmor', '');
    expect((await page.evaluate(() => ItemModelUI.getState())).mannequin.armor).toBeNull();
    expect(errors).toEqual([]);
  });

  test('couches d\'armure chargées sans pack, peau 64×64 et 64×32 (membres gauches en miroir), peau refusée', async ({ page }) => {
    const errors = collectErrors(page);
    await openPanel(page);
    await loadZip(page, await packSrcFiles(page));
    await page.click('#bcTabs button[data-ctx="thirdperson"]');
    await page.evaluate(() => { ItemModelUI.setGizmoMode('off'); ItemModelUI.setShowItem(false); });
    // couches chargées à la main par le sélecteur de fichiers
    await page.setInputFiles('#bcArmorFiles', [
      { name: 'layer_1.png', mimeType: 'image/png', buffer: await rectPng(page, 64, 32, layer1('#ff00ff')) },
      { name: 'layer_2.png', mimeType: 'image/png', buffer: await rectPng(page, 64, 32, layer2('#00ffff')) }]);
    await page.waitForFunction(() => ItemModelUI.getState().mannequin.armor);
    await expect(page.locator('#bcArmor')).toHaveValue('couches chargées');
    await playerColor(page, 'rightLeg', [0, 5, -2.5], 'g > 120 && b > 120 && r < 60');
    await page.selectOption('#bcArmor', '');
    // peau 64 × 64 : face avant du torse verte
    await page.setInputFiles('#bcSkinFile', { name: 'skin.png', mimeType: 'image/png', buffer: await rectPng(page, 64, 64, [[20, 20, 8, 12, '#00ff00']]) });
    await page.waitForFunction(() => ItemModelUI.getState().mannequin.skin === 'custom');
    await playerColor(page, 'body', [0, 6, -2], 'g > 120 && r < 60 && b < 60');
    // peau 64 × 32 : la face avant de la jambe droite (rouge) est recopiée sur la jambe gauche (ImageBufferDownload)
    const legacy = (await rectPng(page, 64, 32, [[4, 20, 4, 12, '#ff0000']])).toString('base64');
    await page.evaluate(b64 => ItemModelUI.setSkin(b64), legacy);
    await playerColor(page, 'leftLeg', [0, 6, -2], 'r > 120 && g < 60 && b < 60');
    await playerColor(page, 'rightLeg', [0, 6, -2], 'r > 120 && g < 60 && b < 60');
    // taille refusée par le client 1.8 : message, peau inchangée
    const bad = (await rectPng(page, 32, 32, [[0, 0, 32, 32, '#123456']], 32)).toString('base64');
    const st = await page.evaluate(b64 => ItemModelUI.setSkin(b64), bad);
    expect(st.mannequin.message.text).toContain('64 × 64 ou 64 × 32');
    // retour au mannequin par défaut
    await page.selectOption('#bcSkin', 'default');
    await playerColor(page, 'body', [0, 4, -2], 'g > 80 && b > 80 && r < 110 && Math.abs(g - b) < 40');
    expect(errors).toEqual([]);
  });

  test('téléphone 375 px : curseurs et barre de poignée sans défilement horizontal, vue 3D dégagée, poignée au toucher', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = collectErrors(page);
    await openPanel(page);
    await loadZip(page, await armorPackFiles(page));
    await page.evaluate(() => ItemModelUI.setArmor('hd_test'));
    for (const ctx of ['thirdperson', 'head', 'gui', 'ground', 'fixed', 'firstperson']) {
      await page.click(`#bcTabs button[data-ctx="${ctx}"]`);
      const w = await page.evaluate(() => {
        const v = document.getElementById('bcView').getBoundingClientRect();
        const t = document.getElementById('bcTools').getBoundingClientRect();
        const hud = document.querySelector('.bc-hud').getBoundingClientRect();
        const sl = document.getElementById('bc-translation-1-r').getBoundingClientRect();
        return { doc: document.documentElement.scrollWidth, sidebar: document.getElementById('sidebar').scrollWidth, sidebarClient: document.getElementById('sidebar').clientWidth,
          toolsRight: t.right, viewRight: v.right, hudH: hud.height, viewH: v.height, sliderW: sl.width };
      });
      expect(w.doc, ctx).toBeLessThanOrEqual(375);
      expect(w.sidebar, ctx).toBeLessThanOrEqual(w.sidebarClient);
      expect(w.toolsRight, ctx).toBeLessThanOrEqual(w.viewRight);
      expect(w.hudH, ctx).toBeLessThan(w.viewH * 0.5);
      expect(w.sliderW, ctx).toBeGreaterThan(80); // curseur utilisable au doigt
    }
    // geste au toucher (événements pointeur « touch ») sur la flèche X, vue Tête
    await page.click('#bcTabs button[data-ctx="head"]');
    await page.evaluate(() => ItemModelUI.setShowPlayer(false));
    await page.waitForFunction(() => ItemModelUI.gizmoHandlePoint('X'));
    const before = (await page.evaluate(() => ItemModelUI.getState())).current.entry.head.translation.slice();
    await page.evaluate(async () => {
      const p = ItemModelUI.gizmoHandlePoint('X');
      const cv = document.querySelector('#bcView canvas');
      const ev = (type, x, y, buttons) => new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: type === 'pointermove' ? -1 : 0, buttons, bubbles: true });
      cv.dispatchEvent(ev('pointerdown', p.x, p.y, 1));
      for (let i = 1; i <= 6; i++) document.dispatchEvent(ev('pointermove', p.x - 5 * i, p.y, 1));
      document.dispatchEvent(ev('pointerup', p.x - 30, p.y, 0));
    });
    const after = (await page.evaluate(() => ItemModelUI.getState())).current.entry.head.translation;
    expect(after[0]).not.toBe(before[0]);
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(errors).toEqual([]);
    await context.close();
  });
});
