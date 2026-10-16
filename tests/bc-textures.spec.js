// BeltariaContent-ready textures: names (texture[_<n>].png[.mcmeta], layer_1/layer_2/layer.png,
// <piece>.png), .mcmeta generated from GIF delays, the animated-texture validator (rules of
// MCP 1.8.9 AnimationMetadataSectionSerializer / TextureAtlasSprite), armor set validation
// (PackBuild.layerSuffixes / texturesOf) and the zips the tools export.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SHOTS = path.resolve(__dirname, '..', '..', 'pw', 'bctex');
fs.mkdirSync(SHOTS, { recursive: true });

/* ---------------------------------------------------------------- helpers */

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  return errors;
}

// CRC32 for the test-side zip writer.
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** Builds a zip; entries [{name, data, deflate?}] (deflate exercises the page's inflate path). */
function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const data = e.deflate ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(e.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, data);
    centrals.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Reads a zip written by the pages (STORE) -> Map(name -> Buffer), checking each CRC. */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    expect(method).toBe(0);
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const data = buf.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, Buffer.from(data));
    p += 46 + nlen + elen + clen;
  }
  return out;
}

async function downloadBuffer(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

/**
 * Minimal GIF89a encoder: global 4-colour palette, one full-frame image per frame, LZW kept at
 * 3-bit codes by emitting a clear code before every pixel (valid, if not compact).
 * frames: [{ pixels: (x, y) => paletteIndex, delayCs }]
 */
function makeGif(w, h, palette, frames) {
  const bytes = [];
  const u16 = v => bytes.push(v & 255, (v >> 8) & 255);
  bytes.push(...Buffer.from('GIF89a'));
  u16(w); u16(h);
  bytes.push(0x81, 0, 0); // global colour table, 4 entries
  for (let i = 0; i < 4; i++) bytes.push(...(palette[i] || [0, 0, 0]));
  for (const f of frames) {
    bytes.push(0x21, 0xF9, 0x04, 0x04); u16(f.delayCs); bytes.push(0, 0); // GCE, disposal 1
    bytes.push(0x2C); u16(0); u16(0); u16(w); u16(h); bytes.push(0);
    bytes.push(2); // LZW minimum code size
    const codes = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) codes.push(4, f.pixels(x, y));
    codes.push(5);
    const packed = [];
    let acc = 0, nbits = 0;
    for (const c of codes) { acc |= c << nbits; nbits += 3; while (nbits >= 8) { packed.push(acc & 255); acc >>= 8; nbits -= 8; } }
    if (nbits) packed.push(acc & 255);
    for (let i = 0; i < packed.length; i += 255) { const blk = packed.slice(i, i + 255); bytes.push(blk.length, ...blk); }
    bytes.push(0);
  }
  bytes.push(0x3B);
  return Buffer.from(bytes);
}

const PALETTE = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
const solidFrames = (delays) => delays.map((d, i) => ({ pixels: () => i % 4, delayCs: d }));

/** PNG strip: `frames` frames of w×fh, frame i filled with a distinct colour. */
async function stripPng(page, w, fh, frames) {
  const b64 = await page.evaluate(([w, fh, frames]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = fh * frames;
    const g = c.getContext('2d');
    const cols = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#808080'];
    for (let i = 0; i < frames; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(0, i * fh, w, fh); }
    return c.toDataURL('image/png').split(',')[1];
  }, [w, fh, frames]);
  return Buffer.from(b64, 'base64');
}

/** WxH armor layer PNG with one opaque square at (x, y, size) in 64x32 units. */
async function layerPng(page, w, h, x, y, size, color = '#ff0000') {
  const b64 = await page.evaluate(([w, h, x, y, size, color]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const s = w / 64;
    g.fillStyle = color;
    g.fillRect(x * s, y * s, size * s, size * s);
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h, x, y, size, color]);
  return Buffer.from(b64, 'base64');
}

/* ------------------------------------------------- GIF -> spritesheet + .mcmeta */

async function openGif(page) {
  const errors = collectErrors(page);
  await page.goto('/gif_to_spritesheet.html');
  await page.waitForFunction(() => typeof window.Mcmeta !== 'undefined');
  return errors;
}

async function loadGif(page, name, gif) {
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'image/gif', buffer: gif });
  await expect(page.locator('#settings-panel')).toBeVisible();
}

test.describe('GIF vers SpriteSheet : export BC', () => {
  test('constant delays give frametime, BC names, folder hint and zip', async ({ page }) => {
    const errors = await openGif(page);
    await loadGif(page, 'Fée Ailes.gif', makeGif(16, 16, PALETTE, solidFrames([10, 10, 10])));
    await expect(page.locator('#square-warning')).toBeHidden();
    await page.locator('#convert-btn').click();
    await expect(page.locator('#result-section')).toBeVisible();

    await expect(page.locator('#bc-id')).toHaveValue('fee_ailes');
    await expect(page.locator('#png-name')).toHaveText('texture.png');
    await expect(page.locator('#mcmeta-name')).toHaveText('texture.png.mcmeta');
    await expect(page.locator('#mcmeta-code')).toHaveText('{"animation":{"frametime":2}}');
    await expect(page.locator('#bc-folder')).toContainText('pack-src/items/fee_ailes/texture.png + texture.png.mcmeta');
    await expect(page.locator('#delay-info')).toContainText('10 cs');

    const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#download-btn').click()]);
    expect(png.suggestedFilename()).toBe('texture.png');
    const pngBytes = await downloadBuffer(png);
    expect(pngBytes.readUInt32BE(16)).toBe(16); // IHDR width
    expect(pngBytes.readUInt32BE(20)).toBe(48); // 3 frames of 16x16

    const [meta] = await Promise.all([page.waitForEvent('download'), page.locator('#download-mcmeta').click()]);
    expect(meta.suggestedFilename()).toBe('texture.png.mcmeta');
    expect((await downloadBuffer(meta)).toString('utf8')).toBe('{"animation":{"frametime":2}}');

    await page.locator('#bc-category').selectOption('wings');
    await expect(page.locator('#download-zip')).toHaveText('⬇ Zip BC (wings/fee_ailes/)');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-zip').click()]);
    expect(zip.suggestedFilename()).toBe('fee_ailes.zip');
    const entries = readZip(await downloadBuffer(zip));
    expect([...entries.keys()]).toEqual(['wings/fee_ailes/texture.png', 'wings/fee_ailes/texture.png.mcmeta']);
    expect(entries.get('wings/fee_ailes/texture.png').equals(pngBytes)).toBe(true);
    expect(entries.get('wings/fee_ailes/texture.png.mcmeta').toString('utf8')).toBe('{"animation":{"frametime":2}}');
    await page.screenshot({ path: path.join(SHOTS, 'gif-export.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('varying delays give frames [{index,time}] with ticks = max(1, round(cs/5))', async ({ page }) => {
    const errors = await openGif(page);
    // 10 cs -> 2, 20 cs -> 4, 3 cs -> 1 (never 0), 8 cs -> 2 ; 0 cs is read as 10 cs by gifuct -> 2
    await loadGif(page, 'flamme.gif', makeGif(8, 8, PALETTE, solidFrames([10, 20, 3, 8, 0])));
    await page.locator('#convert-btn').click();
    const expected = '{"animation":{"frames":[{"index":0,"time":2},{"index":1,"time":4},{"index":2,"time":1},{"index":3,"time":2},{"index":4,"time":2}]}}';
    await expect(page.locator('#mcmeta-code')).toHaveText(expected);
    await expect(page.locator('#delay-info')).toContainText('Délais variables');
    await page.locator('#mcmeta-interpolate').check();
    await expect(page.locator('#mcmeta-code')).toHaveText(expected.replace(/]}}$/, '],"interpolate":true}}'));
    // The generated pair passes the validator
    await page.locator('#verify-current').click();
    await expect(page.locator('#verify-summary')).toContainText('✅');
    await expect(page.locator('#verify-sequence')).toContainText('0(2t) → 1(4t) → 2(1t) → 3(2t) → 4(2t)');
    expect(errors).toEqual([]);
  });

  test('pure helpers: ticks from delays and mcmeta shape', async ({ page }) => {
    await openGif(page);
    const r = await page.evaluate(() => ({
      ticks: [0, 10, 20, 30, 40, 50, 70, 80, 100, 1000].map(Mcmeta.ticksFromDelayMs),
      same: Mcmeta.stringify(Mcmeta.fromDelays([50, 50])),
      one: Mcmeta.stringify(Mcmeta.fromDelays([20])),
      vary: Mcmeta.fromDelays([100, 50], true),
      empty: (() => { try { Mcmeta.fromDelays([]); return 'no error'; } catch (e) { return e.message; } })()
    }));
    expect(r.ticks).toEqual([1, 1, 1, 1, 1, 1, 1, 2, 2, 20]);
    expect(r.same).toBe('{"animation":{"frametime":1}}');
    expect(r.one).toBe('{"animation":{"frametime":1}}');
    expect(r.vary).toEqual({ animation: { frames: [{ index: 0, time: 2 }, { index: 1, time: 1 }], interpolate: true } });
    expect(r.empty).toContain('Aucune frame');
  });

  test('numbered names, ore hosts and invalid ids', async ({ page }) => {
    const errors = await openGif(page);
    await loadGif(page, 'anim.gif', makeGif(8, 8, PALETTE, solidFrames([10, 10])));
    await page.locator('#convert-btn').click();
    await page.locator('#bc-name').selectOption('numbered');
    await page.locator('#bc-n').fill('3');
    await expect(page.locator('#png-name')).toHaveText('texture_3.png');
    await expect(page.locator('#mcmeta-name')).toHaveText('texture_3.png.mcmeta');
    const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#download-btn').click()]);
    expect(png.suggestedFilename()).toBe('texture_3.png');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-zip').click()]);
    expect([...readZip(await downloadBuffer(zip)).keys()]).toEqual(['items/anim/texture_3.png', 'items/anim/texture_3.png.mcmeta']);

    await page.locator('#bc-n').fill('0');
    await expect(page.locator('#bc-id-error')).toContainText('entier ≥ 1');
    await expect(page.locator('#download-zip')).toBeDisabled();
    await page.locator('#bc-n').fill('2');

    // Same regex as PackBuild Entry.ID: [a-z0-9_.-]+
    await page.locator('#bc-id').fill('Fairy Wings');
    await expect(page.locator('#bc-id-error')).toContainText('identifiant invalide, attendu en minuscules sur [a-z0-9_.-]');
    await expect(page.locator('#download-zip')).toBeDisabled();
    await page.locator('#bc-id').fill('fairy-wings.v2');
    await expect(page.locator('#bc-id-error')).toBeHidden();

    // ores/<host>/ only reads texture.png, and only for a known host
    await page.locator('#bc-category').selectOption('ores');
    await expect(page.locator('#bc-name option[value="numbered"]')).toHaveJSProperty('disabled', true);
    await expect(page.locator('#png-name')).toHaveText('texture.png');
    await expect(page.locator('#bc-id-error')).toContainText('aucun bloc hôte de ce nom');
    await page.locator('#bc-id').fill('smooth_stone');
    await expect(page.locator('#bc-id-error')).toBeHidden();
    await expect(page.locator('#bc-folder')).toContainText('pack-src/ores/smooth_stone/texture.png');
    const [ore] = await Promise.all([page.waitForEvent('download'), page.locator('#download-zip').click()]);
    expect([...readZip(await downloadBuffer(ore)).keys()]).toEqual(['ores/smooth_stone/texture.png', 'ores/smooth_stone/texture.png.mcmeta']);

    // The legacy name stays available
    await page.locator('#bc-name').selectOption('gif');
    await expect(page.locator('#png-name')).toHaveText('anim_spritesheet.png');
    expect(errors).toEqual([]);
  });

  test('non-square GIF: warning, then square frames by padding or stretching', async ({ page }) => {
    const errors = await openGif(page);
    // 8x4 frames, top row palette 0 (red), rest palette 1 (green)
    const frames = [0, 1].map(() => ({ pixels: (x, y) => (y === 0 ? 0 : 1), delayCs: 10 }));
    await loadGif(page, 'large.gif', makeGif(8, 4, PALETTE, frames));
    await expect(page.locator('#square-warning')).toBeVisible();
    await expect(page.locator('#gif-info')).toContainText('sortie 8×8 px');

    await page.locator('#square-pad').click();
    await expect(page.locator('#frame-mode')).toHaveValue('pad');
    await expect(page.locator('#square-warning')).toBeHidden();
    await expect(page.locator('#gif-info')).toContainText('sortie 8×16 px');
    await page.locator('#convert-btn').click();
    await expect(page.locator('#result-section')).toBeVisible();
    await page.waitForFunction(() => document.getElementById('preview-img').naturalHeight === 16);
    const px = await page.evaluate(() => {
      const img = document.getElementById('preview-img');
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const at = (x, y) => [...g.getImageData(x, y, 1, 1).data];
      return { top: at(3, 0), firstRow: at(3, 2), body: at(3, 3), frame2Row: at(3, 10) };
    });
    expect(px.top[3]).toBe(0);                     // transparent margin above (dy = 2)
    expect(px.firstRow).toEqual([255, 0, 0, 255]);  // the GIF's first row lands at y = 2
    expect(px.body).toEqual([0, 255, 0, 255]);
    expect(px.frame2Row).toEqual([255, 0, 0, 255]); // second frame starts at y = 8 (+2)

    // Back to the free size: the warning offers the other square mode
    await page.locator('#frame-mode').selectOption('free');
    await expect(page.locator('#square-warning')).toBeVisible();
    await page.locator('#square-stretch').click();
    await expect(page.locator('#frame-mode')).toHaveValue('stretch');
    await expect(page.locator('#gif-info')).toContainText('sortie 8×16 px');
    expect(errors).toEqual([]);
  });
});

/* ----------------------------------------------- .mcmeta validator (MCP 1.8.9) */

test.describe('Vérifier une texture animée', () => {
  const run = (page, input) => page.evaluate(i => {
    const r = Mcmeta.validate(i);
    return { ok: r.ok, frameCount: r.frameCount, sequence: r.sequence, interpolate: r.interpolate, messages: r.messages.map(m => m.level + ': ' + m.text) };
  }, input);
  const has = (r, level, text) => r.messages.some(m => m.startsWith(level + ': ') && m.includes(text));

  test('validator cases follow AnimationMetadataSectionSerializer and TextureAtlasSprite', async ({ page }) => {
    await openGif(page);
    const base = { pngName: 'texture.png', mcmetaName: 'texture.png.mcmeta', width: 16, height: 64 };

    let r = await run(page, { ...base, mcmetaText: '{"animation":{"frametime":2}}' });
    expect(r.ok).toBe(true);
    expect(r.frameCount).toBe(4);
    expect(r.sequence).toEqual([0, 1, 2, 3].map(index => ({ index, time: 2 })));

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frames":[0,{"index":3,"time":5},1],"frametime":3,"interpolate":true}}' });
    expect(r.ok).toBe(true);
    expect(r.interpolate).toBe(true);
    expect(r.sequence).toEqual([{ index: 0, time: 3 }, { index: 3, time: 5 }, { index: 1, time: 3 }]);
    expect(has(r, 'info', 'jamais affichée(s) : 2')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frametime":0}}' });
    expect(r.ok).toBe(false);
    expect(has(r, 'error', 'Invalid default frame time')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frametime":"2"}}' });
    expect(has(r, 'error', 'Expected frametime to be a Int')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frametime":2.7}}' });
    expect(r.ok).toBe(true);
    expect(has(r, 'warn', 'lu 2')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frames":[0,5]}}' });
    expect(has(r, 'error', 'invalid frameindex 5')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frames":[{"index":1,"time":0}]}}' });
    expect(has(r, 'error', 'Invalid frame time')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frames":[{"time":2}]}}' });
    expect(has(r, 'error', 'Missing index')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frames":[{"index":-1}]}}' });
    expect(has(r, 'error', 'Invalid frame index')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frames":["1"]}}' });
    expect(has(r, 'error', 'Expected frames[0] to be a Int')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frames":[0,null,1]}}' });
    expect(r.ok).toBe(true);
    expect(has(r, 'warn', 'frames[1] : ni nombre ni objet')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frames":{"0":1}}}' });
    expect(has(r, 'error', 'Invalid animation->frames: expected array')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frames":[]}}' });
    expect(r.sequence.length).toBe(4);
    expect(has(r, 'info', 'frames vide')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"interpolate":"yes"}}' });
    expect(r.ok).toBe(true);
    expect(has(r, 'warn', 'lu false')).toBe(true);
    r = await run(page, { ...base, mcmetaText: '{"animation":{"interpolate":{}}}' });
    expect(has(r, 'error', 'Expected interpolate to be a Boolean')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"width":16,"height":16}}' });
    expect(r.ok).toBe(true);
    expect(has(r, 'warn', 'sans effet en 1.8.9')).toBe(true);
    r = await run(page, { ...base, mcmetaText: '{"animation":{"width":0}}' });
    expect(has(r, 'error', 'Invalid width')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":[]}' });
    expect(has(r, 'error', 'Expected metadata section to be a JsonObject')).toBe(true);

    r = await run(page, { ...base, mcmetaText: '{"animation":{"frametime":2,}' });
    expect(has(r, 'error', 'JSON illisible')).toBe(true);

    // Image shape (TextureAtlasSprite.loadSprite)
    r = await run(page, { ...base, height: 40, mcmetaText: '{"animation":{}}' });
    expect(r.frameCount).toBe(2);
    expect(has(r, 'warn', 'les 8 dernières lignes')).toBe(true);
    r = await run(page, { ...base, width: 32, height: 16, mcmetaText: '{"animation":{}}' });
    expect(has(r, 'error', 'aucune frame')).toBe(true);
    r = await run(page, { pngName: 'texture.png', width: 16, height: 64, mcmetaText: null });
    expect(has(r, 'error', 'broken aspect ratio and not an animation')).toBe(true);
    expect(has(r, 'info', 'il manque sans doute texture.png.mcmeta')).toBe(true);
    r = await run(page, { ...base, mcmetaText: '{"texture":{"blur":false}}' });
    expect(has(r, 'warn', 'Aucune section « animation »')).toBe(true);
    expect(has(r, 'error', 'broken aspect ratio')).toBe(true);
  });

  test('naming rules follow PackBuild.texturesOf', async ({ page }) => {
    await openGif(page);
    const meta = '{"animation":{}}';
    let r = await run(page, { pngName: 'texture_2.png', mcmetaName: 'texture_2.png.mcmeta', mcmetaText: meta, width: 16, height: 32 });
    expect(r.ok).toBe(true);
    expect(has(r, 'ok', 'texture_2.png : nom reconnu par BC')).toBe(true);
    r = await run(page, { pngName: 'textures.png', mcmetaName: 'textures.png.mcmeta', mcmetaText: meta, width: 16, height: 32 });
    expect(has(r, 'error', 'textures.png attendu sous la forme texture[_<n>].png[.mcmeta]')).toBe(true);
    r = await run(page, { pngName: 'epee.png', mcmetaName: 'epee.png.mcmeta', mcmetaText: meta, width: 16, height: 32 });
    expect(r.ok).toBe(true);
    expect(has(r, 'warn', 'ce fichier y serait ignoré')).toBe(true);
    r = await run(page, { pngName: 'texture.png', mcmetaName: 'texture_1.png.mcmeta', mcmetaText: meta, width: 16, height: 32 });
    expect(has(r, 'error', 'ne correspond pas à texture.png')).toBe(true);
    r = await run(page, { pngName: 'texture_2.png', mcmetaName: 'texture_2.png.mcmeta', mcmetaText: meta, width: 16, height: 32, category: 'ores' });
    expect(has(r, 'error', 'ores/<hôte>/ ne lit que texture.png')).toBe(true);
    r = await run(page, { pngName: 'texture_2.png', mcmetaName: 'texture_2.png.mcmeta', mcmetaText: meta, width: 16, height: 32, category: 'items' });
    expect(has(r, 'info', 'sans model.json')).toBe(true);
  });

  test('player ticks and blends like TextureAtlasSprite.updateAnimation', async ({ page }) => {
    await openGif(page);
    const r = await page.evaluate(() => {
      const p = Mcmeta.createPlayer([{ index: 0, time: 2 }, { index: 1, time: 1 }], true);
      const states = [p.current()];
      for (let i = 0; i < 4; i++) states.push(p.tick());
      const flat = Mcmeta.createPlayer([{ index: 0, time: 3 }, { index: 2, time: 3 }], false);
      const out = new Uint8ClampedArray(4);
      return {
        states: states.map(s => [s.index, s.next, s.tick, Math.round(s.d0 * 100) / 100]),
        flat: [flat.tick(), flat.tick(), flat.tick()].map(s => [s.index, s.d0]),
        blend: [...Mcmeta.blend([200, 100, 0, 255], [0, 0, 200, 10], 0.75, out)]
      };
    });
    // tick 1: 1/2 of frame 0 elapsed -> 50 % towards 1 ; tick 2: frame 1 ; tick 3 (time 1): back to 0
    expect(r.states).toEqual([[0, 1, 0, 1], [0, 1, 1, 0.5], [1, 0, 0, 1], [0, 1, 0, 1], [0, 1, 1, 0.5]]);
    expect(r.flat).toEqual([[0, 1], [0, 1], [2, 1]]);
    expect(r.blend).toEqual([150, 75, 50, 255]); // alpha kept from the current frame
  });

  test('drop zone: PNG + mcmeta, report and animated preview', async ({ page }) => {
    const errors = await openGif(page);
    const png = await stripPng(page, 16, 16, 4);
    await page.locator('#verify-input').setInputFiles([
      { name: 'texture.png', mimeType: 'image/png', buffer: png },
      { name: 'texture.png.mcmeta', mimeType: 'application/json', buffer: Buffer.from('{"animation":{"frametime":4,"interpolate":true}}') }
    ]);
    await expect(page.locator('#verify-summary')).toContainText('✅ Valide');
    await expect(page.locator('#verify-files')).toHaveText('texture.png + texture.png.mcmeta');
    await expect(page.locator('#verify-sequence')).toHaveText('Séquence : 0(4t) → 1(4t) → 2(4t) → 3(4t)');
    expect(await page.evaluate(() => [document.getElementById('verify-canvas').width, document.getElementById('verify-canvas').height])).toEqual([16, 16]);
    await expect(page.locator('#verify-frame')).toContainText('mélange', { timeout: 3000 });
    await page.screenshot({ path: path.join(SHOTS, 'verify-ok.png'), fullPage: true });

    // A broken pair: index out of range, and the mcmeta named after another texture
    await page.locator('#verify-input').setInputFiles([
      { name: 'texture.png', mimeType: 'image/png', buffer: png },
      { name: 'texture_2.png.mcmeta', mimeType: 'application/json', buffer: Buffer.from('{"animation":{"frames":[0,7]}}') }
    ]);
    await expect(page.locator('#verify-summary')).toContainText('❌ 2 erreur(s)');
    await expect(page.locator('#verify-report li[data-level="error"]')).toHaveCount(2);
    await expect(page.locator('#verify-report')).toContainText('invalid frameindex 7');
    await expect(page.locator('#verify-report')).toContainText('TextureAtlasSprite.java:304-306');

    // The target folder changes the naming rules
    await page.locator('#verify-category').selectOption('ores');
    await page.locator('#verify-input').setInputFiles([
      { name: 'texture_1.png', mimeType: 'image/png', buffer: png },
      { name: 'texture_1.png.mcmeta', mimeType: 'application/json', buffer: Buffer.from('{"animation":{}}') }
    ]);
    await expect(page.locator('#verify-report')).toContainText('ne lit que texture.png');
    await page.screenshot({ path: path.join(SHOTS, 'verify-errors.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
});

/* ---------------------------------------------------------------- AnimForge */

test.describe('AnimForge : noms et zip BC', () => {
  async function openForge(page) {
    const errors = collectErrors(page);
    await page.goto('/animforge.html');
    await expect(page.locator('#txtBcId')).toHaveValue('pioche_sanguinaire');
    return errors;
  }

  test('defaults to texture.png + texture.png.mcmeta with the BC folder hint', async ({ page }) => {
    const errors = await openForge(page);
    await expect(page.locator('#lblMcmetaName')).toHaveText('texture.png.mcmeta');
    await expect(page.locator('#bcFolderHint')).toContainText('pack-src/items/pioche_sanguinaire/texture.png + texture.png.mcmeta');
    await expect(page.locator('#bcSquareWarn')).toBeHidden();
    const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#btnExportSpritesheet').click()]);
    expect(png.suggestedFilename()).toBe('texture.png');
    const [meta] = await Promise.all([page.waitForEvent('download'), page.locator('#btnDownloadMcmeta').click()]);
    expect(meta.suggestedFilename()).toBe('texture.png.mcmeta');
    expect(JSON.parse((await downloadBuffer(meta)).toString('utf8'))).toEqual({ animation: { frametime: 2, interpolate: false } });

    await page.locator('#selBcName').selectOption('numbered');
    await page.locator('#numBcN').fill('2');
    await expect(page.locator('#lblMcmetaName')).toHaveText('texture_2.png.mcmeta');
    const [png2] = await Promise.all([page.waitForEvent('download'), page.locator('#btnExportSpritesheet').click()]);
    expect(png2.suggestedFilename()).toBe('texture_2.png');

    await page.locator('#selBcName').selectOption('item');
    const [legacy] = await Promise.all([page.waitForEvent('download'), page.locator('#btnExportSpritesheet').click()]);
    expect(legacy.suggestedFilename()).toBe('pioche_sanguinaire.png');
    expect(errors).toEqual([]);
  });

  test('zip <category>/<id>/texture.png(+.mcmeta), id validated like Entry.ID', async ({ page }) => {
    const errors = await openForge(page);
    await page.locator('#txtBcId').fill('Pioche Rouge');
    await expect(page.locator('#bcIdError')).toContainText('identifiant invalide');
    await expect(page.locator('#btnBcZip')).toBeDisabled();
    await page.locator('#txtBcId').fill('pioche_rouge');
    await page.locator('#selBcCategory').selectOption('wings');
    await expect(page.locator('#bcFolderHint')).toContainText('pack-src/wings/pioche_rouge/texture.png');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#btnBcZip').click()]);
    expect(zip.suggestedFilename()).toBe('pioche_rouge.zip');
    const entries = readZip(await downloadBuffer(zip));
    expect([...entries.keys()]).toEqual(['wings/pioche_rouge/texture.png', 'wings/pioche_rouge/texture.png.mcmeta']);
    const pngBytes = entries.get('wings/pioche_rouge/texture.png');
    expect(pngBytes.readUInt32BE(16)).toBe(32);
    expect(pngBytes.readUInt32BE(20)).toBe(320); // 10 frames of 32x32
    expect(JSON.parse(entries.get('wings/pioche_rouge/texture.png.mcmeta').toString('utf8')).animation.frametime).toBe(2);

    await page.locator('#selBcCategory').selectOption('ores');
    await expect(page.locator('#txtBcId')).toHaveValue('');
    await expect(page.locator('#bcIdError')).toContainText('bloc hôte');
    await expect(page.locator('#selBcName option[value="numbered"]')).toHaveJSProperty('disabled', true);
    await page.locator('#txtBcId').fill('oak_wood');
    const [ore] = await Promise.all([page.waitForEvent('download'), page.locator('#btnBcZip').click()]);
    expect([...readZip(await downloadBuffer(ore)).keys()]).toEqual(['ores/oak_wood/texture.png', 'ores/oak_wood/texture.png.mcmeta']);
    expect(errors).toEqual([]);
  });

  test('a non-square image is flagged for 1.8 square frames', async ({ page }) => {
    await openForge(page);
    const png = await stripPng(page, 16, 8, 1);
    await page.locator('#fileInput').setInputFiles({ name: 'Large Item.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('#bcSquareWarn')).toBeVisible();
    await expect(page.locator('#bcSquareWarn')).toContainText('16×8 non carrée');
    await expect(page.locator('#txtBcId')).toHaveValue('large_item');
  });
});

/* -------------------------------------------------- Armor fusion / PixelPalette */

test('armor fusion: download as layer_1/layer_2/layer/<piece>.png', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/armor_and_ingot_fusion.html');
  const layer = await layerPng(page, 64, 32, 8, 8, 8, '#888888');
  const ingot = await layerPng(page, 16, 16, 0, 0, 64, '#3366ff');
  await page.locator('#input-armor').setInputFiles({ name: 'adamant.png', mimeType: 'image/png', buffer: layer });
  await page.locator('#input-ingot').setInputFiles({ name: 'ingot.png', mimeType: 'image/png', buffer: ingot });
  await expect(page.locator('#btn-download')).toBeEnabled();

  let [d] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-download').click()]);
  expect(d.suggestedFilename()).toBe('adamant_recolor.png');
  for (const name of ['layer_1.png', 'layer_2.png', 'layer.png', 'chestplate.png']) {
    await page.locator('#download-name').selectOption(name);
    await expect(page.locator('#download-hint')).toHaveText(`Dossier BC : pack-src/armor/<set>/${name}`);
    [d] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-download').click()]);
    expect(d.suggestedFilename()).toBe(name);
  }
  // A source already named the BC way keeps its name by default
  await page.locator('#input-armor').setInputFiles({ name: 'layer_2.png', mimeType: 'image/png', buffer: layer });
  await expect(page.locator('#download-name')).toHaveValue('layer_2.png');
  expect(errors).toEqual([]);
});

test('pixelpalette: keeps the original file name (texture.png) or pixelpalette_WxH.png', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/pixelpalette_studio.html');
  await expect(page.locator('#selDownloadName')).toHaveValue('dims');
  let [d] = await Promise.all([page.waitForEvent('download'), page.locator('#btnDownloadPng').click()]);
  expect(d.suggestedFilename()).toMatch(/^pixelpalette_\d+x\d+\.png$/);

  const png = await layerPng(page, 16, 16, 0, 0, 32, '#aa3355');
  await page.locator('#fileInput1').setInputFiles({ name: 'texture.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#selDownloadName')).toHaveValue('original');
  await expect(page.locator('#selDownloadName option[value="original"]')).toHaveText("Nom d'origine (texture.png)");
  [d] = await Promise.all([page.waitForEvent('download'), page.locator('#btnDownloadPng').click()]);
  expect(d.suggestedFilename()).toBe('texture.png');
  await page.locator('#selDownloadName').selectOption('dims');
  [d] = await Promise.all([page.waitForEvent('download'), page.locator('#btnDownloadPng').click()]);
  expect(d.suggestedFilename()).toBe('pixelpalette_16x16.png');
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------ Armor set (BC) */

test.describe('Aperçu d\'armure : set BC', () => {
  async function openArmor(page) {
    const errors = collectErrors(page);
    await page.goto('/armor_layer_preview.html');
    await page.waitForFunction(() => typeof viewer !== 'undefined' && typeof ArmorSet !== 'undefined');
    return errors;
  }
  const skinPixel = (page, x, y) => page.evaluate(([x, y]) => {
    const s = mainCanvas.width / 64;
    const d = mainCanvas.getContext('2d').getImageData(Math.floor((x + 0.5) * s), Math.floor((y + 0.5) * s), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, [x, y]);

  test('layer.png alone dresses both layers', async ({ page }) => {
    const errors = await openArmor(page);
    // One file with the helmet front (layer 1 area) and the right leg front (layer 2 area)
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 32;
      const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(8, 8, 8, 8); g.fillRect(4, 20, 4, 12);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#layerBoth').setInputFiles({ name: 'layer.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await expect(page.locator('#statusBoth')).toContainText('✅ layer.png');
    await expect(page.locator('#status1')).toContainText('sert aux deux couches');
    await expect(page.locator('#status2')).toContainText('sert aux deux couches');
    await expect(page.locator('#viewerHint')).toBeHidden();
    expect(await skinPixel(page, 44, 12)).toEqual([255, 0, 0, 255]); // helmet, from layer 1
    expect(await skinPixel(page, 5, 37)).toEqual([255, 0, 0, 255]);  // leggings, from layer 2
    await expect(page.locator('#setReport')).toContainText('Nom du set requis');
    await page.locator('#setId').fill('temoin_armure');
    await expect(page.locator('#setSummary')).toContainText('✅ armor/temoin_armure/ prêt');
    await expect(page.locator('#setReport')).toContainText('layer.png sert aux deux couches');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#exportSet').click()]);
    expect(zip.suggestedFilename()).toBe('temoin_armure.zip');
    expect([...readZip(await downloadBuffer(zip)).keys()]).toEqual(['armor/temoin_armure/layer.png']);
    expect(errors).toEqual([]);
  });

  test('a numbered layer alone is refused with BC\'s message', async ({ page }) => {
    const errors = await openArmor(page);
    await page.locator('#layer1').setInputFiles({ name: 'adamant_1.png', mimeType: 'image/png', buffer: await layerPng(page, 64, 32, 8, 8, 8) });
    await page.locator('#setId').fill('adamant');
    await expect(page.locator('#setReport')).toContainText(
      'pack.json : armor.adamant : layer_2.png absente dans armor/adamant ; fournir layer_1.png et layer_2.png, ou layer.png seule pour les deux');
    await expect(page.locator('#setSummary')).toContainText('BeltariaContent refuserait');
    await expect(page.locator('#exportSet')).toBeDisabled();
    // Adding layer.png supplies the missing layer 2 (PackBuild.layerSuffixes)
    await page.locator('#layerBoth').setInputFiles({ name: 'layer.png', mimeType: 'image/png', buffer: await layerPng(page, 64, 32, 4, 20, 4) });
    await expect(page.locator('#setReport')).toContainText('Couche 1 : layer_1.png · couche 2 : layer.png.');
    await expect(page.locator('#exportSet')).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('pack-src zip: layers, icons present/missing, items/<set>_<piece> icon, ready zip', async ({ page }) => {
    const errors = await openArmor(page);
    const l1 = await layerPng(page, 128, 64, 8, 8, 8);
    const l2 = await layerPng(page, 128, 64, 4, 20, 4);
    const helmet = await layerPng(page, 16, 16, 0, 0, 64, '#00ff00');
    const boots = await layerPng(page, 16, 16, 0, 0, 64, '#0000ff');
    const legs = await layerPng(page, 16, 16, 0, 0, 64, '#ffff00');
    const zip = makeZip([
      { name: 'pack-src/armor/adamant/layer_1.png', data: l1, deflate: true },
      { name: 'pack-src/armor/adamant/layer_2.png', data: l2 },
      { name: 'pack-src/armor/adamant/helmet.png', data: helmet, deflate: true },
      { name: 'pack-src/armor/adamant/boots.png', data: boots },
      { name: 'pack-src/armor/adamant/notes.txt', data: 'wip' },
      { name: 'pack-src/armor/zeus/layer.png', data: l1 },
      { name: 'pack-src/items/adamant_leggings/texture.png', data: legs }
    ]);
    await page.locator('#setZip').setInputFiles({ name: 'pack.zip', mimeType: 'application/zip', buffer: zip });
    await expect(page.locator('#setId')).toHaveValue('adamant');
    await expect(page.locator('#setSummary')).toContainText('✅ armor/adamant/ prêt pour BeltariaContent');
    await expect(page.locator('#setReport')).toContainText('Couche 1 : layer_1.png · couche 2 : layer_2.png.');
    await expect(page.locator('#setReport')).toContainText('notes.txt : ignoré par BC');
    await expect(page.locator('#setReport')).toContainText('Un set à la fois : zeus');
    await expect(page.locator('#setIcons li[data-piece="helmet"]')).toHaveAttribute('data-state', 'present');
    await expect(page.locator('#setIcons li[data-piece="chestplate"]')).toHaveAttribute('data-state', 'missing');
    await expect(page.locator('#setIcons li[data-piece="leggings"]')).toContainText('items/adamant_leggings/texture.png');
    await expect(page.locator('#setIcons li[data-piece="boots"]')).toHaveAttribute('data-state', 'present');
    await expect(page.locator('#status1')).toContainText('armor/adamant/layer_1.png');
    expect(await page.evaluate(() => mainCanvas.width)).toBe(128);
    expect(await skinPixel(page, 44, 12)).toEqual([255, 0, 0, 255]);
    await page.locator('#exportSet').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'armor-set.png'), fullPage: true });

    const [out] = await Promise.all([page.waitForEvent('download'), page.locator('#exportSet').click()]);
    expect(out.suggestedFilename()).toBe('adamant.zip');
    const entries = readZip(await downloadBuffer(out));
    expect([...entries.keys()]).toEqual([
      'armor/adamant/boots.png', 'armor/adamant/helmet.png', 'armor/adamant/layer_1.png', 'armor/adamant/layer_2.png',
      'items/adamant_leggings/texture.png'
    ]);
    expect(entries.get('armor/adamant/layer_1.png').equals(l1)).toBe(true); // original bytes, no re-encode
    expect(entries.get('items/adamant_leggings/texture.png').equals(legs)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('badly named layer and empty folder are refused like PackBuild.texturesOf / layerSuffixes', async ({ page }) => {
    const errors = await openArmor(page);
    const l = await layerPng(page, 64, 32, 8, 8, 8);
    await page.locator('#setZip').setInputFiles({ name: 'onyx.zip', mimeType: 'application/zip', buffer: makeZip([
      { name: 'onyx/layer_one.png', data: l }, { name: 'onyx/layer_2.png', data: l }
    ]) });
    await expect(page.locator('#setReport')).toContainText('pack.json : armor.onyx : layer_one.png attendu sous la forme layer[_<n>].png[.mcmeta]');
    await expect(page.locator('#setReport')).toContainText('layer_1.png absente dans armor/onyx');
    await expect(page.locator('#exportSet')).toBeDisabled();
    await page.locator('#exportSet').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'armor-refused.png'), fullPage: true });

    const r = await page.evaluate(() => ({
      empty: ArmorSet.validate({ setId: 'ruby', files: ['helmet.png'] }).errors,
      metaOnly: ArmorSet.validate({ setId: 'ruby', files: ['layer.png.mcmeta'] }).errors,
      layer2Only: ArmorSet.validate({ setId: 'ruby', files: ['layer_2.png'] }).errors,
      both: ArmorSet.validate({ setId: 'ruby', files: ['layer_1.png', 'layer_2.png', 'layer_3.png'] }).messages.map(m => m.text),
      badId: ArmorSet.validate({ setId: 'Ruby Set', files: ['layer.png'] }).errors,
      folder: ArmorSet.locate(['adamant/layer_1.png', 'adamant/helmet.png']),
      loose: ArmorSet.locate(['layer.png'], 'mon_set')
    }));
    expect(r.empty).toEqual(['pack.json : armor.ruby : aucune couche layer.png dans armor/ruby']);
    expect(r.metaOnly).toEqual(['pack.json : armor.ruby : layer_1.png absente dans armor/ruby ; fournir layer_1.png et layer_2.png, ou layer.png seule pour les deux']);
    expect(r.layer2Only[0]).toContain('layer_1.png absente');
    expect(r.both.some(t => t.includes('layer_3.png : copiée dans le pack mais citée par aucune couche'))).toBe(true);
    expect(r.badId[0]).toContain('identifiant invalide');
    expect(r.folder.setId).toBe('adamant');
    expect(r.loose.setId).toBe('mon_set');
    expect(errors).toEqual([]);
  });
});

/* --------------------------------------------------------------- phone width */

test('phone: GIF export panel and validator report stay inside 390px', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = await openGif(page);
  await loadGif(page, 'aile_animee.gif', makeGif(8, 4, PALETTE, solidFrames([10, 20])));
  await page.locator('#convert-btn').click();
  await expect(page.locator('#result-section')).toBeVisible();
  await page.locator('#verify-current').click();
  await expect(page.locator('#verify-summary')).toContainText('❌'); // 8x4 frames are not square
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(SHOTS, 'phone-gif-export.png'), fullPage: true });

  const p2 = await context.newPage();
  const errors2 = collectErrors(p2);
  await p2.goto('/armor_layer_preview.html');
  await p2.waitForFunction(() => typeof ArmorSet !== 'undefined');
  const l = await layerPng(p2, 64, 32, 8, 8, 8);
  await p2.locator('#setZip').setInputFiles({ name: 'ruby.zip', mimeType: 'application/zip', buffer: makeZip([{ name: 'armor/ruby/layer_1.png', data: l }]) });
  await expect(p2.locator('#setReport')).toContainText('layer_2.png absente dans armor/ruby');
  expect(await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await p2.locator('#setPanel').screenshot({ path: path.join(SHOTS, 'phone-armor-set.png') });
  expect([...errors, ...errors2]).toEqual([]);
  await context.close();
});

for (const page of ['animforge.html', 'gif_to_spritesheet.html', 'armor_and_ingot_fusion.html', 'pixelpalette_studio.html', 'armor_layer_preview.html']) {
  test(`${page} fits a 390px phone without console errors`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await context.newPage();
    const errors = collectErrors(p);
    await p.goto('/' + page);
    await p.waitForLoadState('networkidle');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await p.screenshot({ path: path.join(SHOTS, 'phone-' + page.replace('.html', '.png')), fullPage: true });
    expect(errors).toEqual([]);
    await context.close();
  });
}
