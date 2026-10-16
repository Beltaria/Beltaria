// Glyph checker: BeltariaContent's text-icon model ported to window.GlyphLogic.
// PARITY tests replay the concrete cases of BeltariaContent's JUnit tests
// (src/test/java/fr/beltaria/content/{glyphs,pack}/*Test.java), same inputs,
// same bytes/chars/strings; each cites the Java test name and line.
const { test, expect } = require('@playwright/test');
const zlib = require('zlib');

const URL = '/glyph-checker.html';

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  return errors;
}

async function open(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GlyphLogic && window.GlyphChecker);
}

/** Injected into page.evaluate bodies: BufferedImage-like helpers. */
const HELPERS = `
  const G = window.GlyphLogic;
  const RED = 0xffff0000 | 0, BLUE = 0xff0000ff | 0;
  function blank(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  function setRGB(img, x, y, argb) { const i = (y * img.width + x) * 4; img.data[i] = (argb >>> 16) & 255; img.data[i + 1] = (argb >>> 8) & 255; img.data[i + 2] = argb & 255; img.data[i + 3] = (argb >>> 24) & 255; }
  function filled(w, h, argb) { const img = blank(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setRGB(img, x, y, argb); return img; }
  function source(glyph, image) { return { glyph, image, what: 'pack.json : glyphs.' + glyph.id }; }
  function vanilla() { const v = new Uint8Array(65536); for (let c = 0; c < 65536; c++) v[c] = ((c * 7 + 3) % 255) + 1; return v; }
  function files(atlas) { return Object.fromEntries(atlas.files); }
  function page(atlas, p) { return files(atlas)['assets/minecraft/textures/font/unicode_page_' + p + '.png']; }
  function sizes(atlas) { return files(atlas)['assets/minecraft/font/glyph_sizes.bin']; }
  function throws(fn) { try { fn(); } catch (e) { return e.message; } return null; }
  // GlyphAtlasTest.java:35-57, copied from the client rather than from the code under test.
  function clientMeasuredWidth(size) { if (size === 0) return 0; let start = (size & 0xff) >>> 4, end = size & 15; if (end > 7) { end = 15; start = 0; } ++end; return Math.trunc((end - start) / 2) + 1; }
  function clientDrawnAdvance(size) { if (size === 0) return 0; const start = (size & 0xff) >>> 4, end = (size & 15) + 1; return Math.trunc((end - start) / 2.0 + 1.0); }
`;
const run = (page, body, arg) => page.evaluate(new Function('arg', HELPERS + body), arg);

/* ---------- node-side PNG + ZIP builders (independent of the page) ---------- */
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const solid = (w, h, rgba = [220, 30, 30, 255]) => png(w, h, () => rgba);
/** Opaque columns [x0, x1), transparent elsewhere. */
const band = (w, h, x0, x1) => png(w, h, x => (x >= x0 && x < x1 ? [240, 170, 0, 255] : [0, 0, 0, 0]));

function buildZip(entries, deflate = true) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const comp = deflate && data.length ? zlib.deflateRawSync(data) : data;
    const method = deflate && data.length ? 8 : 0;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Independent ZIP parser, CRCs checked with node's zlib. */
function parseZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThan(-1);
  const count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw : zlib.inflateRawSync(raw);
    expect(data.length).toBe(size);
    expect(zlib.crc32(data) >>> 0, `CRC of ${name}`).toBe(crc);
    files.set(name, Buffer.from(data));
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const pngFile = (name, buffer) => ({ name, mimeType: 'image/png', buffer });

/* =========================================================================
 * PARITY — GlyphAtlasTest.java
 * ========================================================================= */
test.describe('parity: GlyphAtlasTest', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('theClientDrawsAndMeasuresEveryIconWidthTheSame (GlyphAtlasTest.java:60)', async ({ page }) => {
    const bad = await run(page, `
      const bad = [];
      for (const height of G.HEIGHTS) for (let width = 1; width <= height; width++) {
        const size = G.size(width, height);
        if (size === 0) bad.push(width + 'x' + height + ' zero');
        if (clientMeasuredWidth(size) !== clientDrawnAdvance(size)) bad.push(width + 'x' + height + ' measure');
        if (((size & 15) + 1) * height < width * 16) bad.push(width + 'x' + height + ' cut');
        if (G.unicodeCharWidth(size) !== clientMeasuredWidth(size) || G.unicodeAdvance(size) !== clientDrawnAdvance(size)) bad.push(width + 'x' + height + ' port');
      }
      return bad;`);
    expect(bad).toEqual([]);
  });

  test('theBackspaceMovesTheCursorBackOnePixelForTheClientBothWays (GlyphAtlasTest.java:76)', async ({ page }) => {
    const r = await run(page, `return [clientDrawnAdvance(G.BACKSPACE_SIZE), clientMeasuredWidth(G.BACKSPACE_SIZE), G.unicodeAdvance(G.BACKSPACE_SIZE), G.unicodeCharWidth(G.BACKSPACE_SIZE)];`);
    expect(r).toEqual([-1, -1, -1, -1]);
  });

  test('theCellsOfAWideIconMeetWithoutAGap (GlyphAtlasTest.java:82)', async ({ page }) => {
    const next = await run(page, `const full = G.size(16, 16); return clientDrawnAdvance(full) + clientDrawnAdvance(G.BACKSPACE_SIZE) + clientDrawnAdvance(0);`);
    expect(next).toBe(8);
  });

  test('aSingleIconFillsItsPageCellAndItsSizeEntry (GlyphAtlasTest.java:92)', async ({ page }) => {
    const r = await run(page, `
      const a = G.buildAtlas([source(G.glyph('vip', 0xF900), filled(16, 16, RED))], vanilla());
      const p = page(a, 'f9');
      return { paths: a.files.map(f => f[0]), width: p.dim, p00: G.pageRGB(p, 0, 0), p1515: G.pageRGB(p, 15, 15), p160: G.pageRGB(p, 16, 0) >>> 24, size: sizes(a)[0xF900] };`);
    expect(r.paths).toEqual(['assets/minecraft/textures/font/unicode_page_f9.png', 'assets/minecraft/textures/font/unicode_page_fa.png', 'assets/minecraft/font/glyph_sizes.bin']);
    expect(r.width).toBe(256);
    expect(r.p00).toBe(0xffff0000 | 0);
    expect(r.p1515).toBe(0xffff0000 | 0);
    expect(r.p160).toBe(0);
    expect(r.size).toBe(0x0f);
  });

  test('onlyThePagesWeOccupyAreRewrittenInTheVanillaTable (GlyphAtlasTest.java:108)', async ({ page }) => {
    const bad = await run(page, `
      const v = vanilla(), copy = Uint8Array.from(v);
      const vip = G.FIRST + 5;
      const s = sizes(G.buildAtlas([source(G.glyph('vip', vip), filled(16, 16, RED))], v));
      const pageHi = G.FIRST & 0xff00, bsPage = G.BACKSPACE & 0xff00, bad = [];
      for (let c = 0; c < 65536; c++) {
        const want = c === vip ? 0x0f : c === G.BACKSPACE ? G.BACKSPACE_SIZE : ((c & 0xff00) === pageHi || (c & 0xff00) === bsPage) ? 0 : v[c];
        if (s[c] !== want) bad.push(c.toString(16));
      }
      for (let c = 0; c < 65536; c++) if (v[c] !== copy[c]) { bad.push('vanilla modified'); break; }
      if (v[vip] === 0) bad.push('vanilla entry');
      return bad;`);
    expect(bad).toEqual([]);
  });

  test('aTransparentLeftMarginIsCroppedAndTheWidthFollowsTheDrawing (GlyphAtlasTest.java:134)', async ({ page }) => {
    const r = await run(page, `
      const img = blank(16, 16);
      for (let x = 4; x <= 9; x++) setRGB(img, x, 8, x === 4 ? BLUE : RED);
      const a = G.buildAtlas([source(G.glyph('dot', 0xF911), img)], vanilla());
      return [G.pageRGB(page(a, 'f9'), 16, 16 + 8), sizes(a)[0xF911]];`);
    expect(r).toEqual([0xff0000ff | 0, 5]);
  });

  test('aSmallerIconIsScaledUpToTheLargestCellOfItsPageWithoutBlurring (GlyphAtlasTest.java:150)', async ({ page }) => {
    const r = await run(page, `
      const small = filled(8, 8, BLUE); setRGB(small, 0, 0, RED);
      const p = page(G.buildAtlas([source(G.glyph('fine', 0xF900), filled(32, 32, RED)), source(G.glyph('small', 0xF901), small)], vanilla()), 'f9');
      const block = []; for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) block.push(G.pageRGB(p, 32 + dx, dy));
      return { dim: p.dim, block, next: G.pageRGB(p, 36, 0) };`);
    expect(r.dim).toBe(512);
    expect(new Set(r.block)).toEqual(new Set([0xffff0000 | 0]));
    expect(r.next).toBe(0xff0000ff | 0);
  });

  test('aWideIconIsCutIntoConsecutiveCellsAndTheBackspaceIsWritten (GlyphAtlasTest.java:169)', async ({ page }) => {
    const r = await run(page, `
      const wide = filled(40, 16, RED); setRGB(wide, 16, 0, BLUE); setRGB(wide, 32, 0, BLUE);
      const a = G.buildAtlas([source(G.glyph('admin', 0xF910, 3), wide)], vanilla());
      const s = sizes(a), p = page(a, 'f9'), fa = page(a, 'fa');
      let faOpaque = 0; for (let i = 3; i < fa.data.length; i += 4) if (fa.data[i]) faOpaque++;
      return [s[0xF910], s[0xF911], s[0xF912], s[G.BACKSPACE], s[G.ZERO_WIDTH], G.pageRGB(p, 16, 16), G.pageRGB(p, 32, 16), faOpaque];`);
    expect(r).toEqual([0x0f, 0x0f, 0x07, 0x50, 0, 0xff0000ff | 0, 0xff0000ff | 0, 0]);
  });

  test('anIconPastTheReservedCharactersGetsItsOwnPageAndTheBackspaceStaysOnFa (GlyphAtlasTest.java:197)', async ({ page }) => {
    const r = await run(page, `
      const v = vanilla(), a = G.buildAtlas([source(G.glyph('banniere', 0xFB00, 2), filled(32, 16, RED))], v), s = sizes(a);
      return { paths: a.files.map(f => f[0]), bs: s[G.BACKSPACE], fb00: s[0xFB00], want: G.size(16, 16), fb02: s[0xFB02], fc00: s[0xFC00] === v[0xFC00] };`);
    expect(r.paths).toEqual(['assets/minecraft/textures/font/unicode_page_fa.png', 'assets/minecraft/textures/font/unicode_page_fb.png', 'assets/minecraft/font/glyph_sizes.bin']);
    expect([r.bs, r.fb00, r.fb02, r.fc00]).toEqual([0x50, r.want, 0, true]);
  });

  test('theBackspaceIsWrittenEvenWhenNoIconIsWideForLevelBadgesJoinSingleCells (GlyphAtlasTest.java:212)', async ({ page }) => {
    const r = await run(page, `
      const a = G.buildAtlas([source(G.glyph('vip', G.FIRST), filled(16, 16, RED))], vanilla());
      return { paths: a.files.map(f => f[0]), bs: sizes(a)[G.BACKSPACE], zw: sizes(a)[G.ZERO_WIDTH] };`);
    expect(r.paths).toEqual(['assets/minecraft/textures/font/unicode_page_f9.png', 'assets/minecraft/textures/font/unicode_page_fa.png', 'assets/minecraft/font/glyph_sizes.bin']);
    expect([r.bs, r.zw]).toEqual([0x50, 0]);
  });

  test('narrowPiecesOfEvenWidthJoinedByTheBackspaceMeetExactly (GlyphAtlasTest.java:226)', async ({ page }) => {
    const r = await run(page, `
      const out = [];
      for (let width = 2; width <= 8; width++) {
        const piece = G.size(width, 16);
        const next = clientDrawnAdvance(piece) + clientDrawnAdvance(G.BACKSPACE_SIZE) + clientDrawnAdvance(0);
        out.push([width, next, next * 2 === width, G.joinAdvance(width, 16), G.levelPieceIssues(width, 16).map(i => i.code)]);
      }
      return out;`);
    for (const [width, next, exact, port, issues] of r) {
      expect(next).toBe(Math.floor(width / 2));
      expect(exact).toBe(width % 2 === 0);
      expect(port).toBe(next);
      expect(issues).toEqual(width % 2 === 0 ? [] : ['odd']);
    }
  });

  test('imagesThatTheClientCannotShowAreRefusedByName (GlyphAtlasTest.java:241)', async ({ page }) => {
    const r = await run(page, `
      const refuse = (img, g) => throws(() => G.buildAtlas([source(g, img)], vanilla()));
      return [refuse(filled(12, 12, RED), G.glyph('douze', 0xF900)), refuse(blank(16, 16), G.glyph('vide', 0xF900)),
              refuse(filled(16 * 33, 16, RED), G.glyph('banniere', 0xF900)), refuse(filled(32, 16, RED), G.glyph('mal_compte', 0xF900))];`);
    const expected = [['douze', '12'], ['vide', 'transparente'], ['banniere', '33'], ['mal_compte', '2 cases']];
    r.forEach((msg, i) => { expect(msg).toContain(expected[i][0]); expect(msg).toContain(expected[i][1]); });
  });

  test('twoIconsCannotShareACharacterEvenThroughAWideOne (GlyphAtlasTest.java:250)', async ({ page }) => {
    const msg = await run(page, `return throws(() => G.buildAtlas([source(G.glyph('admin', 0xF900, 3), filled(48, 16, RED)), source(G.glyph('vip', 0xF902), filled(16, 16, RED))], vanilla()));`);
    expect(msg).toContain('U+F902');
    expect(msg).toContain('admin');
  });

  test('theSameIconsGiveTheSameBytes (GlyphAtlasTest.java:262)', async ({ page }) => {
    const same = await run(page, `
      const srcs = [source(G.glyph('admin', 0xF910, 3), filled(40, 16, RED)), source(G.glyph('vip', 0xF900), filled(16, 16, BLUE))];
      const a = G.buildAtlas(srcs, vanilla()), b = G.buildAtlas(srcs, vanilla());
      const bytes = v => Array.from(v.data || v).join(',');
      return a.files.length === b.files.length && a.files.every(([p, v], i) => p === b.files[i][0] && bytes(v) === bytes(b.files[i][1]));`);
    expect(same).toBe(true);
  });

  test('withoutIconsNothingIsWrittenAndTheClientFontStaysIntact (GlyphAtlasTest.java:278)', async ({ page }) => {
    expect(await run(page, `return G.buildAtlas([], vanilla()).files.length;`)).toBe(0);
  });
});

/* =========================================================================
 * PARITY — GlyphCharsTest.java
 * ========================================================================= */
test.describe('parity: GlyphCharsTest', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('newIconsTakeTheFirstFreeCharactersInAlphabeticalOrder (GlyphCharsTest.java:34)', async ({ page }) => {
    const a = await run(page, `return G.allocate({ vip: 1, admin: 3 }, {}, {});`);
    expect(a.firsts.admin).toBe(0xF900);
    expect(a.firsts.vip).toBe(0xF903);
    expect(a.notes[0]).toContain('attribue');
  });

  test('aWideIconSkipsTheReservedCharactersInsteadOfCoveringThem (GlyphCharsTest.java:44)', async ({ page }) => {
    const a = await run(page, `const full = 0xFAFD - G.FIRST; return G.allocate({ plein: full, rang: 3 }, {}, { plein: { first: G.FIRST, cells: full } });`);
    expect(a.firsts.plein).toBe(0xF900);
    expect(a.firsts.rang).toBe(0xFB00);
  });

  test('aCharacterImposedOnAReservedOneIsRefused (GlyphCharsTest.java:58)', async ({ page }) => {
    const r = await run(page, `return [throws(() => G.parseChar('FAFE', 'vip')) !== null, G.parseChar('FDFF', 'vip')];`);
    expect(r).toEqual([true, 0xFDFF]);
  });

  test('anIconAddedBeforeTheOthersAlphabeticallyMovesNothing (GlyphCharsTest.java:65)', async ({ page }) => {
    const s = await run(page, `const first = G.allocate({ vip: 1, mvp: 1 }, {}, {}).remembered; return G.allocate({ vip: 1, mvp: 1, aaa: 1 }, {}, first).firsts;`);
    expect(s).toEqual({ aaa: 0xF902, mvp: 0xF900, vip: 0xF901 });
  });

  test('aRemovedIconKeepsItsCharactersAndGetsThemBackWhenItReturns (GlyphCharsTest.java:78)', async ({ page }) => {
    const r = await run(page, `
      const before = G.allocate({ vip: 1, mvp: 2 }, {}, {}).remembered;
      const without = G.allocate({ vip: 1, elite: 1 }, {}, before);
      const back = G.allocate({ vip: 1, elite: 1, mvp: 2 }, {}, without.remembered);
      return [without.firsts.elite, 'mvp' in without.remembered, back.firsts.mvp];`);
    expect(r).toEqual([0xF903, true, 0xF900]);
  });

  test('aWidenedIconThatNoLongerFitsMovesAndSaysSo (GlyphCharsTest.java:94)', async ({ page }) => {
    const w = await run(page, `const before = G.allocate({ admin: 1, vip: 1 }, {}, {}).remembered; return G.allocate({ admin: 3, vip: 1 }, {}, before);`);
    expect(w.firsts.vip).toBe(0xF901);
    expect(w.firsts.admin).toBe(0xF902);
    expect(w.notes.join(' ')).toContain('deplacee');
  });

  test('anImposedCharacterWinsAndIsRemembered (GlyphCharsTest.java:107)', async ({ page }) => {
    const a = await run(page, `return G.allocate({ vip: 1, admin: 1 }, { vip: 0xFA00 }, {});`);
    expect(a.firsts.vip).toBe(0xFA00);
    expect(a.remembered.vip.first).toBe(0xFA00);
    expect(a.firsts.admin).toBe(0xF900);
  });

  test('anImposedCharacterThatOverlapsAnotherLeavesOnlyThatIconOut (GlyphCharsTest.java:120)', async ({ page }) => {
    const a = await run(page, `return G.allocate({ admin: 2, vip: 1, elite: 1 }, { admin: G.FIRST, vip: G.FIRST + 1 }, {});`);
    expect(a.firsts.admin).toBe(0xF900);
    expect('vip' in a.firsts).toBe(false);
    expect('vip' in a.remembered).toBe(false);
    expect(a.firsts.elite).toBe(0xF902);
    expect(a.notes.join(' ')).toContain('vip');
  });

  test('anIconRememberedInThePrivateUseAreaMovesIntoTheIconArea (GlyphCharsTest.java:138)', async ({ page }) => {
    const a = await run(page, `return G.allocate({ grade1: 4 }, {}, { grade1: { first: 0xE000, cells: 4 }, ancienne: { first: 0xE004, cells: 1 } });`);
    expect(a.firsts.grade1).toBe(0xF900);
    expect(a.remembered.grade1).toEqual({ first: 0xF900, cells: 4 });
    expect('ancienne' in a.remembered).toBe(false);
    expect(a.notes.join(' ')).toContain('hors de la zone');
  });

  test('aFullAreaLeavesTheNewIconOutInsteadOfFailing (GlyphCharsTest.java:157)', async ({ page }) => {
    const a = await run(page, `const before = {}; for (let c = G.FIRST; c <= G.LAST_FREE; c += 2) before['g' + c] = { first: c, cells: 1 }; return G.allocate({ banniere: 3 }, {}, before);`);
    expect('banniere' in a.firsts).toBe(false);
    expect(a.notes.join(' ')).toContain('banniere');
  });

  test('theAllocationIsStableAcrossRandomAdditionsAndRemovals (GlyphCharsTest.java:172) — same java.util.Random(61) history', async ({ page }) => {
    const r = await run(page, `
      // java.util.Random, bit for bit.
      const MUL = 0x5DEECE66Dn, MASK = (1n << 48n) - 1n;
      let seed = (61n ^ MUL) & MASK;
      const next = bits => { seed = (seed * MUL + 0xBn) & MASK; return Number(BigInt.asIntN(32, seed >> BigInt(48 - bits))); };
      const nextInt = bound => {
        let r = next(31); const m = bound - 1;
        if ((bound & m) === 0) return Number((BigInt(bound) * BigInt(r)) >> 31n);
        for (let u = r; ((u - (r = u % bound) + m) | 0) < 0; u = next(31));
        return r;
      };
      // HashMap<String,Integer> iteration order for g0..g11 (16 buckets, no resize at 12 entries).
      const strHash = s => { let h = 0; for (const ch of s) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0; return h; };
      const keys = Array.from({ length: 12 }, (_, i) => 'g' + i);
      const order = keys.map((k, i) => [((strHash(k) ^ (strHash(k) >>> 16)) & 15), i, k]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
      let moved = 0, overlaps = 0, steps = 0;
      for (let history = 0; history < 200; history++) {
        const sizes = {};
        for (let i = 0; i < 12; i++) sizes['g' + i] = 1 + nextInt(3);
        let memory = {}, previous = {}, previousSizes = { ...sizes };
        for (let step = 0; step < 15; step++) {
          previousSizes = { ...sizes };
          if (nextInt(2) === 0) { const k = 'g' + nextInt(12); sizes[k] = 1 + nextInt(3); }
          const present = {};
          for (const k of order) if (nextInt(3) !== 0) present[k] = sizes[k];
          const a = G.allocate(present, {}, memory);
          const used = new Set();
          for (const id of Object.keys(a.firsts)) {
            if (id in previous && previousSizes[id] === sizes[id] && previous[id] !== a.firsts[id]) moved++;
            for (let c = 0; c < present[id]; c++) { const ch = a.firsts[id] + c; if (used.has(ch)) overlaps++; used.add(ch); }
          }
          memory = a.remembered; previous = a.firsts; steps++;
        }
      }
      return { moved, overlaps, steps };`);
    expect(r).toEqual({ moved: 0, overlaps: 0, steps: 3000 });
  });

  test('theMemoryFileRoundTripsSortedAndRejectsAHandBrokenOne (GlyphCharsTest.java:218)', async ({ page }) => {
    const r = await run(page, `
      const text = G.writeChars({ vip: { first: 0xF903, cells: 1 }, admin: { first: 0xF900, cells: 3 } });
      return { text, back: G.readChars(text), refused: throws(() => G.readChars('{ "vip": { "char": "F900" } }')), absent: Object.keys(G.readChars(null)).length };`);
    expect(r.text).toBe('{\n  "admin": { "char": "F900", "cells": 3 },\n  "vip": { "char": "F903", "cells": 1 }\n}\n');
    expect(r.back).toEqual({ admin: { first: 0xF900, cells: 3 }, vip: { first: 0xF903, cells: 1 } });
    expect(r.refused).toContain('vip.cells');
    expect(r.absent).toBe(0);
  });

  test('charactersAreReadInEitherFormAndOnlyInsideTheFreeArea (GlyphCharsTest.java:238)', async ({ page }) => {
    const r = await run(page, `return [G.parseChar('u+f90a', 'x'), G.parseChar('F90A', 'x'), throws(() => G.parseChar('0041', 'x')) !== null,
      throws(() => G.parseChar(G.hex(G.BACKSPACE), 'x')) !== null, throws(() => G.parseChar('Z000', 'x')) !== null];`);
    expect(r).toEqual([0xF90A, 0xF90A, true, true, true]);
  });
});

/* =========================================================================
 * PARITY — GlyphTest.java, LevelBadgeTest.java, GlyphPlaceholdersTest.java, GlyphsCommandTest.java
 * ========================================================================= */
test.describe('parity: GlyphTest', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('aSingleCellIconIsItsCharacterAfterWhite (GlyphTest.java:19)', async ({ page }) => {
    expect(await run(page, `const g = G.glyph('vip', 0xF900); return [g.raw, g.text];`)).toEqual(['豈', '§f豈']);
  });

  test('aWideIconJoinsItsCellsWithABackspaceAndAZeroWidthCharacter (GlyphTest.java:27)', async ({ page }) => {
    const r = await run(page, `const g = G.glyph('admin', 0xF910, 3); return [g.raw, G.glyphCell(g, 2), g.label];`);
    expect(r).toEqual(['蘿﫿﫾螺﫿﫾裸', 0xF912, 'admin U+F910-U+F912']);
  });

  test('theReservedCharactersAndTheOutsideAreRefused (GlyphTest.java:36)', async ({ page }) => {
    const r = await run(page, `
      const t = (...a) => throws(() => G.glyph(...a));
      return { refused: [t('x', 0xDFFF), t('x', G.ZERO_WIDTH), t('x', G.BACKSPACE), t('x', 0xFAFC, 3), t('x', 0xFAFE, 3), t('', 0xF900), t('x', 0xF900, 0)].map(m => m !== null),
        overflow: t('long', 0xFDFF, 2), last: G.glyphCell(G.glyph('x', 0xFDFE, 2), 1), toReserved: G.glyphCell(G.glyph('x', 0xFAFC, 2), 1), after: G.glyphCell(G.glyph('x', 0xFB00, 2), 0) };`);
    expect(r.refused).toEqual([true, true, true, true, true, true, true]);
    expect(r.overflow).toContain('long');
    expect([r.last, r.toReserved, r.after]).toEqual([0xFDFF, 0xFAFD, 0xFB00]);
  });

  test('theReservedCharactersAreInTheIconAreaSoTheFilterStripsThemToo (GlyphTest.java:54)', async ({ page }) => {
    expect(await run(page, `return [G.isGlyph(G.BACKSPACE), G.isGlyph(G.ZERO_WIDTH), G.isIcon(G.BACKSPACE), G.strip('a\\uF900\\uFAFF\\uFAFEb\\uE000')];`)).toEqual([true, true, true, 'ab']);
  });

  test('theIconAreaIsAFontPageTheVanillaClientHas (GlyphTest.java:61)', async ({ page }) => {
    expect(await run(page, `return [G.FIRST >> 8, G.LAST >> 8, G.LAST === G.LAST_FREE];`)).toEqual([0xf9, 0xfd, true]);
  });

  test('codePointsArePaddedUppercaseHex (GlyphTest.java:70)', async ({ page }) => {
    expect(await run(page, `return [G.codePoint(0xF90A), G.hex(0xE9)];`)).toEqual(['U+F90A', '00E9']);
  });
});

test.describe('parity: LevelBadgeTest', () => {
  test.beforeEach(async ({ page }) => open(page));
  // LevelBadgeTest.java:93-114: or_left F900, or_0..9 F901..F90A, or_right F90B.
  const SETUP = `
    const LEFT = 0xF900, ZERO = 0xF901, RIGHT = 0xF90B, glyphs = {};
    glyphs.or_left = G.glyph('or_left', LEFT);
    for (let d = 0; d <= 9; d++) glyphs['or_' + d] = G.glyph('or_' + d, ZERO + d);
    glyphs.or_right = G.glyph('or_right', RIGHT);
    const expected = digits => { let t = G.WHITE + String.fromCharCode(LEFT); for (const c of digits) t += G.JOIN + String.fromCharCode(ZERO + (c.charCodeAt(0) - 48)); return t + G.JOIN + String.fromCharCode(RIGHT); };
  `;

  test('aLevelIsTheLeftEdgeItsDigitsAndTheRightEdgeJoined (LevelBadgeTest.java:117)', async ({ page }) => {
    expect(await run(page, SETUP + `return [G.levelRender(glyphs, 'or', '475') === expected('475'), G.levelRender(glyphs, 'or', '1') === expected('1')];`)).toEqual([true, true]);
  });

  test('everyLevelUpToTenThousandUsesOnePiecePerDigitAndFitsAPrefixUpToThreeDigits (LevelBadgeTest.java:123)', async ({ page }) => {
    const r = await run(page, SETUP + `
      let bad = 0;
      for (let level = 0; level <= 10000; level++) { const d = String(level), b = G.levelRender(glyphs, 'or', d); if (b !== expected(d) || b.length !== 3 * d.length + 6) bad++; }
      return [bad, G.levelRender(glyphs, 'or', '999').length];`);
    expect(r).toEqual([0, 15]);
  });

  test('blanksAroundAndLeadingZerosAreIgnored (LevelBadgeTest.java:136)', async ({ page }) => {
    expect(await run(page, SETUP + `return [G.levelRender(glyphs, 'or', ' 007 ') === expected('7'), G.levelRender(glyphs, 'or', '000') === expected('0'), G.levelRender(glyphs, 'or', '0') === expected('0')];`)).toEqual([true, true, true]);
  });

  test('anythingButAPlainNumberResolvesToNothing (LevelBadgeTest.java:143)', async ({ page }) => {
    const r = await run(page, SETUP + `
      const levels = ['', ' ', '-3', '+3', '1.5', '1,234', '12k', 'abc', '\\u0663', '{player_level}', '1234567890'];
      return [levels.map(l => G.levelRender(glyphs, 'or', l)), G.levelRender(glyphs, 'or', '123456789') === expected('123456789'), G.levelRender(glyphs, 'or', null)];`);
    expect(r[0].every(x => x === null)).toBe(true);
    expect(r[1]).toBe(true);
    expect(r[2]).toBeNull();
  });

  test('aStyleMissingAPieceResolvesToNothingRatherThanAHoledBadge (LevelBadgeTest.java:153)', async ({ page }) => {
    const r = await run(page, SETUP + `
      const out = [G.levelRender(glyphs, 'argent', '12'), G.levelRender(glyphs, '', '12'), G.levelRender(glyphs, null, '12'), G.levelRender(null, 'or', '12')];
      delete glyphs.or_7;
      out.push(G.levelRender(glyphs, 'or', '12') === expected('12'), G.levelRender(glyphs, 'or', '475'));
      delete glyphs.or_right;
      out.push(G.levelRender(glyphs, 'or', '12'));
      return out;`);
    expect(r).toEqual([null, null, null, null, true, null, null]);
  });

  test('aWidePieceKeepsItsOwnJoins (LevelBadgeTest.java:167)', async ({ page }) => {
    const r = await run(page, SETUP + `
      glyphs.or_left = G.glyph('or_left', 0xF920, 2);
      return G.levelRender(glyphs, 'or', '5') === G.WHITE + '\\uF920' + G.JOIN + '\\uF921' + G.JOIN + String.fromCharCode(ZERO + 5) + G.JOIN + String.fromCharCode(RIGHT);`);
    expect(r).toBe(true);
  });
});

test.describe('parity: GlyphPlaceholdersTest + GlyphsCommandTest', () => {
  test.beforeEach(async ({ page }) => open(page));
  const SETUP = `const glyphs = { vip: G.glyph('vip', 0xF900), admin: G.glyph('admin', 0xF901, 2) };`;

  test('theColouredFormKeepsTheImageColours (GlyphPlaceholdersTest.java:200)', async ({ page }) => {
    expect(await run(page, SETUP + `return G.resolve(glyphs, 'glyph_vip');`)).toBe('§f豈');
  });

  test('theRawFormTakesTheColourOfThePrecedingText (GlyphPlaceholdersTest.java:205)', async ({ page }) => {
    expect(await run(page, SETUP + `return [G.resolve(glyphs, 'glyph_raw_vip'), G.resolve(glyphs, 'glyph_raw_admin')];`)).toEqual(['豈', '更﫿﫾車']);
  });

  test('aLevelBadgeIsSplitAtTheLastUnderscoreSoAStyleMayContainOne (GlyphPlaceholdersTest.java:212)', async ({ page }) => {
    const r = await run(page, `
      const pieces = {}; ['tier_or_left', 'tier_or_4', 'tier_or_2', 'tier_or_right'].forEach((id, i) => { pieces[id] = G.glyph(id, 0xF900 + i); });
      return [G.resolve(pieces, 'level_tier_or_42') === G.levelRender(pieces, 'tier_or', '42'),
        G.resolve(pieces, 'level_tier_or_42') === G.WHITE + '\\uF900' + G.JOIN + '\\uF901' + G.JOIN + '\\uF902' + G.JOIN + '\\uF903',
        G.resolve(pieces, 'level_tier_or_43'), G.resolve(pieces, 'level_42'), G.resolve(pieces, 'level_'), G.resolve(pieces, 'level_tier_or_{player_level}')];`);
    expect(r).toEqual([true, true, null, null, null, null]);
  });

  test('anUnknownOrMalformedParameterResolvesToNothing (GlyphPlaceholdersTest.java:231)', async ({ page }) => {
    expect(await run(page, SETUP + `return ['glyph_inconnu', 'glyph_raw_inconnu', 'vip', 'glyph_', null].map(p => G.resolve(glyphs, p));`)).toEqual([null, null, null, null, null]);
  });

  test('eachIconComesWithItsPlaceholderAndItsYamlSequence (GlyphsCommandTest.java:255)', async ({ page }) => {
    const lines = await run(page, `return G.commandLines({ admin: G.glyph('admin', 0xF910, 2) });`);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('%beltaria_glyph_admin%');
    expect(lines[1]).toContain('\\uF910\\uFAFF\\uFAFE\\uF911');
  });

  test('withoutIconsTheCommandSaysWhatToDo (GlyphsCommandTest.java:269)', async ({ page }) => {
    const lines = await run(page, `return G.commandLines({});`);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('glyphs/<id>/texture.png');
  });
});

/* =========================================================================
 * PARITY — PackGlyphsTest.java (emitGlyphs through GlyphLogic.assemble)
 * ========================================================================= */
test.describe('parity: PackGlyphsTest (assemble = PackBuild.emitGlyphs)', () => {
  test.beforeEach(async ({ page }) => open(page));
  const SETUP = `const f = (id, w, h) => ({ id, hasTexture: true, image: filled(w, h, 0xffffaa00 | 0), unreadable: null });`;

  test('aDroppedFolderIsEnoughItsCharacterIsAssignedAndRemembered (PackGlyphsTest.java:37)', async ({ page }) => {
    const r = await run(page, SETUP + `const a = G.assemble({ folders: [f('vip', 16, 16), f('admin', 40, 16)] });
      return { admin: a.glyphs.admin.label, vip: a.glyphs.vip.label, paths: a.atlas.files.map(x => x[0]), chars: a.charsOut, notes: a.notes.map(n => n.text).join('\\n') };`);
    expect(r.admin).toBe('admin U+F900-U+F902');
    expect(r.vip).toBe('vip U+F903');
    expect(r.paths).toEqual(expect.arrayContaining(['assets/minecraft/textures/font/unicode_page_f9.png', 'assets/minecraft/textures/font/unicode_page_fa.png', 'assets/minecraft/font/glyph_sizes.bin']));
    expect(r.chars).toBe('{\n  "admin": { "char": "F900", "cells": 3 },\n  "vip": { "char": "F903", "cells": 1 }\n}\n');
    expect(r.notes).toContain('U+F903 attribue');
  });

  test('addingAnIconLaterMovesNoneOfTheOthers + anUnchangedAllocationLeavesTheMemoryFileUntouched (PackGlyphsTest.java:60,73)', async ({ page }) => {
    const r = await run(page, SETUP + `const first = G.assemble({ folders: [f('vip', 16, 16)] });
      const second = G.assemble({ folders: [f('vip', 16, 16), f('aaa', 16, 16)], charsJson: first.charsOut });
      const third = G.assemble({ folders: [f('vip', 16, 16), f('aaa', 16, 16)], charsJson: second.charsOut });
      return [second.glyphs.vip.first, second.glyphs.aaa.first, second.charsChanged, third.charsChanged];`);
    expect(r).toEqual([0xF900, 0xF901, true, false]);
  });

  test('theDescriptorCanStillImposeACharacter + aDescriptorEntryWithoutItsFolderIsOnlyNoted (PackGlyphsTest.java:95,103)', async ({ page }) => {
    const r = await run(page, SETUP + `const a = G.assemble({ folders: [f('vip', 16, 16)], packJson: '{ "glyphs": { "vip": { "char": "U+f910" } } }' });
      const b = G.assemble({ folders: [], packJson: '{ "glyphs": { "vip": { "char": "F900" } } }' });
      return [a.glyphs.vip.first, Object.keys(b.glyphs).length, b.notes.map(n => n.text).join(' | ')];`);
    expect(r[0]).toBe(0xF910);
    expect(r[1]).toBe(0);
    expect(r[2]).toContain('glyphs.vip');
  });

  test('anImageOfTheWrongHeight / aFolderWithoutItsImage / aFolderNameThatWouldShadowTheRawPlaceholder leave only that icon out (PackGlyphsTest.java:113,128,146)', async ({ page }) => {
    const r = await run(page, SETUP + `
      const one = folders => { const a = G.assemble({ folders }); return [Object.keys(a.glyphs), a.notes.map(n => n.text).join(' | ')]; };
      return [one([f('ok', 16, 16), f('vip', 51, 9)]), one([f('ok', 16, 16), { id: 'vip', hasTexture: false, image: null }]), one([f('ok', 16, 16), f('raw_vip', 16, 16)])];`);
    expect(r[0][0]).toEqual(['ok']); expect(r[0][1]).toContain('glyphs/vip : image haute de 9');
    expect(r[1][0]).toEqual(['ok']); expect(r[1][1]).toContain('glyphs/vip');
    expect(r[2][0]).toEqual(['ok']); expect(r[2][1]).toContain('raw_');
  });

  test('aBadImposedCharacterLeavesOnlyThatIconOut (PackGlyphsTest.java:137)', async ({ page }) => {
    const r = await run(page, SETUP + `
      return [['{ "glyphs": { "vip": { "char": "Z000" } } }', 'Z000'], ['{ "glyphs": { "vip": { "char": "0041" } } }', 'U+0041'],
        ['{ "glyphs": { "vip": { "char": "E000" } } }', 'U+E000'], ['{ "glyphs": { "vip": { "char": "FAFF" } } }', 'reserves'], ['{ "glyphs": { "vip": "F900" } }', 'objet']]
        .map(([pj, want]) => { const a = G.assemble({ folders: [f('ok', 16, 16), f('vip', 16, 16)], packJson: pj }); return [Object.keys(a.glyphs).join(','), a.notes.map(n => n.text).join(' | ').includes(want)]; });`);
    for (const [ids, noted] of r) { expect(ids).toBe('ok'); expect(noted).toBe(true); }
  });

  test('aBrokenMemoryFileKeepsTheIconsOut + aMemoryFileFromBefore640 (PackGlyphsTest.java:159,177)', async ({ page }) => {
    const r = await run(page, SETUP + `
      const broken = G.assemble({ folders: [f('vip', 16, 16)], charsJson: '{ "vip": ' });
      const old = G.assemble({ folders: [f('grade1', 64, 16)], charsJson: '{ "grade1": { "char": "E000", "cells": 4 } }' });
      return [Object.keys(broken.glyphs).length, broken.atlas, broken.charsBroken, broken.notes.map(n => n.text).join(' '), old.glyphs.grade1.label, old.charsOut, old.atlas.files.some(x => x[0].endsWith('_e0.png'))];`);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeNull();
    expect(r[2]).toBe(true);
    expect(r[3]).toContain('chars.json');
    expect(r[4]).toBe('grade1 U+F900-U+F903');
    expect(r[5]).toBe('{\n  "grade1": { "char": "F900", "cells": 4 }\n}\n');
    expect(r[6]).toBe(false);
  });

  test('aHandWrittenWidthTableUnderAssetsCollides + withoutIconsNothingIsWritten (PackGlyphsTest.java:192,204)', async ({ page }) => {
    const r = await run(page, SETUP + `
      const a = G.assemble({ folders: [f('vip', 16, 16)], assetPaths: ['assets/minecraft/font/glyph_sizes.bin'] });
      const none = G.assemble({ folders: [] });
      return [a.fatal.join(' '), none.atlas, none.charsOut];`);
    expect(r[0]).toContain('glyph_sizes.bin');
    expect(r[1]).toBeNull();
    expect(r[2]).toBeNull();
  });
});

/* =========================================================================
 * Property-style tests (seeded, reproducible)
 * ========================================================================= */
test.describe('properties', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('allocation never overlaps, never uses U+FAFE/U+FAFF nor pages FE/FF, and stays in F900-FDFF', async ({ page }) => {
    const r = await run(page, `
      let s = 0x2545F491; const rnd = n => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % n); };
      let bad = 0, placed = 0;
      for (let t = 0; t < 300; t++) {
        const cells = {}, imposed = {}, remembered = {};
        const n = 1 + rnd(60);
        for (let i = 0; i < n; i++) cells['i' + i] = 1 + rnd(32);
        for (let i = 0; i < rnd(6); i++) imposed['i' + rnd(n)] = 0xF900 + rnd(0x500);
        for (let i = 0; i < rnd(10); i++) remembered['r' + i] = { first: 0xF000 + rnd(0x1000), cells: 1 + rnd(8) };
        const a = G.allocate(cells, imposed, remembered), used = new Set();
        for (const id of Object.keys(a.remembered)) {
          const run = a.remembered[id];
          for (let c = run.first; c < run.first + run.cells; c++) {
            if (used.has(c) || c === G.ZERO_WIDTH || c === G.BACKSPACE || (c >> 8) >= 0xFE || c < G.FIRST || c > G.LAST_FREE) bad++;
            used.add(c);
          }
        }
        for (const id of Object.keys(a.firsts)) { placed++; if (a.remembered[id].cells !== cells[id]) bad++; }
      }
      return { bad, placed };`);
    expect(r.bad).toBe(0);
    expect(r.placed).toBeGreaterThan(1000);
  });

  test('an icon keeps its characters when other icons are added, removed or renamed', async ({ page }) => {
    const moved = await run(page, `
      let s = 12345; const rnd = n => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n; };
      let moved = 0;
      for (let t = 0; t < 200; t++) {
        const cells = {}; for (let i = 0; i < 1 + rnd(20); i++) cells['k' + rnd(40)] = 1 + rnd(4);
        const first = G.allocate(cells, {}, {});
        const keep = Object.keys(cells)[0];
        const changed = { [keep]: cells[keep] };
        for (const id of Object.keys(cells)) if (id !== keep && rnd(2)) changed[rnd(2) ? id : id + '_renamed'] = cells[id];
        for (let i = 0; i < rnd(5); i++) changed['new' + i] = 1 + rnd(4);
        const second = G.allocate(changed, {}, first.remembered);
        if (second.firsts[keep] !== first.firsts[keep]) moved++;
      }
      return moved;`);
    expect(moved).toBe(0);
  });

  test('chars.json round-trips for any allocation', async ({ page }) => {
    const ok = await run(page, `
      let s = 99; const rnd = n => { s = (Math.imul(s, 48271) % 2147483647 + 2147483647) % 2147483647; return s % n; };
      for (let t = 0; t < 100; t++) {
        const cells = {}; for (let i = 0; i < rnd(30); i++) cells['g.' + rnd(99) + '-x_' + i] = 1 + rnd(5);
        const a = G.allocate(cells, {}, {});
        const back = G.readChars(G.writeChars(a.remembered));
        if (JSON.stringify(back) !== JSON.stringify(a.remembered)) return false;
      }
      return true;`);
    expect(ok).toBe(true);
  });

  test('costs: 3 x cells, 3 x cells - 2, 3 x digits + 6', async ({ page }) => {
    const r = await run(page, `
      const out = [];
      for (let c = 1; c <= 32; c++) { const g = G.glyph('g', 0xFB00, c); out.push(g.text.length === 3 * c && g.raw.length === 3 * c - 2); }
      return out.every(Boolean);`);
    expect(r).toBe(true);
  });
});

/* =========================================================================
 * Validation messages (BeltariaContent's text, verbatim)
 * ========================================================================= */
test('validation: id regex, raw_ prefix, heights, transparency, 32 cells, unreadable, level pieces', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    const f = (id, img, extra) => Object.assign({ id, hasTexture: true, image: img, unreadable: null }, extra || {});
    const a = G.assemble({ folders: [
      f('Majuscule', filled(16, 16, RED)), f('raw_x', filled(16, 16, RED)), f('h12', filled(12, 12, RED)), f('vide', blank(16, 16)),
      f('large', filled(16 * 33, 16, RED)), f('ok32', filled(16 * 32, 16, RED)), f('illisible', null), f('corrompu', null, { unreadable: { kind: 'io', detail: 'x' } })
    ] });
    const by = id => a.notes.filter(n => n.id === id).map(n => n.text).join(' | ');
    return { glyphs: Object.keys(a.glyphs), m: by('Majuscule'), r: by('raw_x'), h: by('h12'), v: by('vide'), l: by('large'), u: by('illisible'), c: by('corrompu'),
      wide: G.levelPieceIssues(9, 16).map(i => i.code), odd: G.levelPieceIssues(7, 16).map(i => i.code), even: G.levelPieceIssues(8, 16), h32: G.levelPieceIssues(6, 32).map(i => i.code), h8: G.levelPieceIssues(3, 8),
      styles: G.levelStyles(['or_left', 'or_0', 'or_1', 'grade_1', 'vip']), gap: G.lastCellGap(25, 16), noGap: G.lastCellGap(40, 16) };`);
  expect(r.glyphs).toEqual(['ok32']);
  expect(r.m).toContain('identifiant invalide');
  expect(r.r).toContain('sans le prefixe raw_');
  expect(r.h).toContain('image haute de 12 pixels, attendu 8, 16, 32 ou 64');
  expect(r.v).toContain('image entierement transparente');
  expect(r.l).toContain('528 pixels de large pour 16 de haut, soit 33 cases ; 32 au plus');
  expect(r.u).toContain("n'est pas une image lisible");
  expect(r.c).toContain('image illisible (x)');
  expect(r.wide).toEqual(['wide']);
  expect(r.odd).toEqual(['odd']);
  expect(r.even).toEqual([]);
  expect(r.h32).toEqual(['odd']);   // 6 px of 32: 1.5 GUI px, not a whole pixel
  expect(r.h8).toEqual([]);         // 8 px high: every width up to 4 is a whole GUI pixel
  expect(r.styles.map(s => s.style)).toEqual(['or']);
  expect(r.styles[0].missing).toEqual(['or_2', 'or_3', 'or_4', 'or_5', 'or_6', 'or_7', 'or_8', 'or_9', 'or_right']);
  expect(r.gap).toEqual({ last: 9, drawn: 4.5, gap: 3.5 });
  expect(r.noGap).toBeNull();
});

/* =========================================================================
 * UI flows
 * ========================================================================= */
test.describe('UI', () => {
  test('drop PNGs + chars.json: predicted chars, placeholders, escape, download only glyphs/<id>/texture.png + chars.json', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    const vip = solid(16, 16, [40, 200, 80, 255]);
    const admin = band(48, 16, 1, 47);   // 46 px once trimmed: 3 cells
    await page.setInputFiles('#fileChars', { name: 'chars.json', mimeType: 'application/json', buffer: Buffer.from('{ "vip": { "char": "F900", "cells": 1 } }') });
    await page.setInputFiles('#filePngs', [pngFile('vip.png', vip), pngFile('admin.png', admin)]);
    await expect(page.locator('.icon[data-id="admin"] [data-testid="char"]')).toHaveText('U+F901–U+F903');
    await expect(page.locator('.icon[data-id="vip"] [data-testid="char"]')).toHaveText('U+F900');
    await expect(page.locator('#charsOut')).toHaveText('{\n  "admin": { "char": "F901", "cells": 3 },\n  "vip": { "char": "F900", "cells": 1 }\n}\n');
    await expect(page.locator('#charsState')).toContainText('BeltariaContent le réécrirait');

    await page.selectOption('#pvSubject', 'g:admin');
    await expect(page.locator('[data-testid="form-0"]')).toHaveText('%beltaria_glyph_admin%');
    await expect(page.locator('[data-testid="cost-0"]')).toContainText('9');
    await expect(page.locator('[data-testid="form-1"]')).toHaveText('%beltaria_glyph_raw_admin%');
    await expect(page.locator('[data-testid="cost-1"]')).toContainText('7');
    await expect(page.locator('[data-testid="form-2"]')).toHaveText('\\uF901\\uFAFF\\uFAFE\\uF902\\uFAFF\\uFAFE\\uF903');
    await expect(page.locator('#useBox')).toContainText('tagprefix: "%beltaria_glyph_raw_admin% &c"');
    await expect(page.locator('#useBox')).toContainText('items.yml ne lit pas les placeholders');
    await expect(page.locator('#useBox')).toContainText('GlyphInputFilter');
    await expect(page.locator('#pvTagInfo')).toHaveAttribute('data-length', '10');

    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportZip')]);
    expect(dl.suggestedFilename()).toBe('glyphs.zip');
    const files = parseZip(require('fs').readFileSync(await dl.path()));
    expect([...files.keys()]).toEqual(['glyphs/admin/texture.png', 'glyphs/vip/texture.png', 'glyphs/chars.json']);
    expect(files.get('glyphs/admin/texture.png').equals(admin)).toBe(true);
    expect(files.get('glyphs/vip/texture.png').equals(vip)).toBe(true);
    expect(files.get('glyphs/chars.json').toString()).toBe('{\n  "admin": { "char": "F901", "cells": 3 },\n  "vip": { "char": "F900", "cells": 1 }\n}\n');

    await page.uncheck('#withChars');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#exportZip')]);
    expect([...parseZip(require('fs').readFileSync(await dl2.path())).keys()]).toEqual(['glyphs/admin/texture.png', 'glyphs/vip/texture.png']);
    const html = await page.content();
    expect(html).not.toMatch(/download[^>]*glyph_sizes|unicode_page_[0-9a-f]{2}\.png"/);
    expect(errors).toEqual([]);
  });

  test('pack-src zip: glyphs/ icons, pack.json override, folder without texture, items ignored, hand-written glyph_sizes.bin collides', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    const zip = buildZip([
      { name: 'pack-src/pack.json', data: Buffer.from('{ "description": "d", "glyphs": { "vip": { "char": "FA00" } } }') },
      { name: 'pack-src/glyphs/vip/texture.png', data: solid(16, 16) },
      { name: 'pack-src/glyphs/elite/texture.png', data: solid(32, 32) },
      { name: 'pack-src/glyphs/vide/notes.txt', data: Buffer.from('rien') },
      { name: 'pack-src/glyphs/chars.json', data: Buffer.from('{ "ancienne": { "char": "F900", "cells": 1 } }') },
      { name: 'pack-src/items/epee/texture.png', data: solid(16, 16) },
      { name: 'pack-src/assets/minecraft/font/glyph_sizes.bin', data: Buffer.alloc(65536) }
    ]);
    await page.setInputFiles('#fileZip', { name: 'pack-src.zip', mimeType: 'application/zip', buffer: zip });
    await expect(page.locator('.icon[data-id="vip"] [data-testid="char"]')).toHaveText('U+FA00');
    await expect(page.locator('.icon[data-id="elite"] [data-testid="char"]')).toHaveText('U+F901');   // F900 kept by the retired "ancienne"
    await expect(page.locator('.icon[data-id="vide"]')).toContainText('texture.png attendue');
    await expect(page.locator('.icon[data-id="epee"]')).toHaveCount(0);
    await expect(page.locator('#reportNotes')).toContainText('Chemin deja present dans le pack : assets/minecraft/font/glyph_sizes.bin');
    await expect(page.locator('#reportNotes')).toContainText('ancienne');
    expect(errors).toEqual([]);
  });

  test("rank generator's level zip: style detected, badge 475 rendered seamlessly, cost 3 x digits + 6, odd piece flagged", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    const entries = [{ name: 'or_left/texture.png', data: band(4, 16, 0, 4) }, { name: 'or_right/texture.png', data: band(4, 16, 0, 4) }];
    for (let d = 0; d <= 9; d++) entries.push({ name: `or_${d}/texture.png`, data: band(d === 3 ? 7 : 8, 16, 0, d === 3 ? 7 : 8) });
    await page.setInputFiles('#fileZip', { name: 'or.zip', mimeType: 'application/zip', buffer: buildZip(entries, false) });
    await expect(page.locator('.icon')).toHaveCount(12);
    await expect(page.locator('.icon[data-id="or_3"]')).toContainText('largeur impaire');
    await page.selectOption('#pvSubject', 'l:or');
    await page.fill('#pvLevel', '475');
    await expect(page.locator('[data-testid="form-0"]')).toHaveText('%beltaria_level_or_475%');
    await expect(page.locator('[data-testid="cost-0"]')).toContainText('15');
    await expect(page.locator('#pvTagInfo')).toHaveAttribute('data-length', '15');
    const r = await page.evaluate(() => {
      const G = window.GlyphLogic, glyphs = window.GlyphChecker.state.result.glyphs;
      const badge = G.levelRender(glyphs, 'or', '475');
      const ras = window.GlyphChecker.rasterize(badge, 1);
      return { end: ras.end, cols: ras.cols.slice(0, 22) };
    });
    // left 2 + 4,7,5 at 4 GUI px + right 2 = 16 GUI px, no hole; then the client's 1 px spacing.
    expect(r.cols.slice(0, 16).every(a => a === 255)).toBe(true);
    expect(r.cols[16]).toBe(0);
    expect(r.end).toBe(17);
    await page.fill('#pvLevel', '12k');
    await expect(page.locator('#pvNote')).toContainText('laisse le placeholder tel quel');
    expect(errors).toEqual([]);
  });

  test('preview renderer: cells meet across the 1 px backspace; a last cell over half a cell advances a full 8 GUI px', async ({ page }) => {
    await open(page);
    await page.setInputFiles('#filePngs', [pngFile('wide.png', solid(40, 16)), pngFile('gap.png', solid(25, 16))]);
    await expect(page.locator('.icon')).toHaveCount(2);
    const r = await page.evaluate(() => {
      const g = window.GlyphChecker.state.result.glyphs;
      const w = window.GlyphChecker.rasterize(g.wide.raw, 1), p = window.GlyphChecker.rasterize(g.gap.raw, 1), w2 = window.GlyphChecker.rasterize(g.wide.raw, 2);
      return { w: { end: w.end, cols: w.cols.slice(0, 24), width: w.width }, p: { end: p.end, cols: p.cols.slice(0, 20) }, w2: w2.cols.slice(0, 44) };
    });
    // wide 40x16: 16 + 16 + 8 px = 8 + 8 + 4 GUI px, contiguous; advance 9 - 1 + 9 - 1 + 5 = 21.
    expect(r.w.cols.slice(0, 20).every(a => a === 255)).toBe(true);
    expect(r.w.cols[20]).toBe(0);
    expect(r.w.end).toBe(21);
    expect(r.w.width).toBe(23);   // getStringWidth skips U+FAFE after the negative backspace: 9 + 0 + 9 + 0 + 5
    expect(r.w2.slice(0, 40).every(a => a === 255)).toBe(true);
    // gap 25x16: 8 GUI px + 4.5 (drawn on 4 whole pixels at scale 1), but the last cell is declared full: advance 17.
    expect(r.p.cols.slice(0, 12).every(a => a === 255)).toBe(true);
    expect(r.p.cols.slice(12, 17).every(a => a === 0)).toBe(true);
    expect(r.p.end).toBe(17);
    await expect(page.locator('.icon[data-id="gap"]')).toContainText('Dernière case large de 9 px');
  });

  test('bare file names become folder ids; invalid ones are reported in French with the BC reason', async ({ page }) => {
    await open(page);
    await page.setInputFiles('#filePngs', [pngFile('Grade VIP.png', solid(16, 16)), pngFile('raw_vip.png', solid(16, 16)), pngFile('neuf.png', solid(51, 9)), pngFile('faux.png', Buffer.from('pas une image'))]);
    await expect(page.locator('.icon[data-id="grade_vip"] [data-testid="char"]')).toHaveText('U+F900');
    await expect(page.locator('.icon[data-id="raw_vip"]')).toContainText('Identifiant refusé');
    await expect(page.locator('.icon[data-id="neuf"]')).toContainText('glyphs/neuf : image haute de 9');
    await expect(page.locator('.icon[data-id="faux"]')).toContainText("n'est pas une image lisible");
    // Renaming fixes the id.
    await page.locator('.icon[data-id="raw_vip"] input').fill('vip');
    await page.locator('.icon[data-id="raw_vip"] input').press('Enter');
    await expect(page.locator('.icon[data-id="vip"] [data-testid="char"]')).toHaveText('U+F901');
  });

  test('page states BC builds the font, links back, links to the rank generator, no console errors, demo loads', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    // Scoped: the shared "Outils" menu (studio-nav.js) also links every tool from the header.
    await expect(page.locator('header a.st-back[href="index.html"]')).toHaveText('← Beltaria Studio');
    await expect(page.locator('main a[href="rank-generator.html"]')).toHaveText('Dessiner un grade');
    await expect(page.locator('#bcBuilds')).toContainText('/content pack');
    await expect(page.locator('#bcBuilds')).toContainText('/content glyphs');
    await expect(page.locator('#bcBuilds')).toContainText('glyph_sizes.bin');
    await page.click('#demoBtn');
    await expect(page.locator('.icon')).toHaveCount(14);
    await expect(page.locator('.icon[data-id="admin"] [data-testid="char"]')).toHaveText('U+F900–U+F902');
    await page.selectOption('#pvScale', '4');
    await page.selectOption('#pvSubject', 'l:or');
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('no horizontal scroll at 375 px, with icons loaded at GUI scale 4', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page);
    await page.setInputFiles('#filePngs', [pngFile('banniere.png', solid(512, 16)), pngFile('vip.png', solid(16, 16))]);
    await expect(page.locator('.icon')).toHaveCount(2);
    await page.selectOption('#pvScale', '4');
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
