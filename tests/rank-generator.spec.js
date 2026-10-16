// Rank generator (text icons for BeltariaContent glyphs/<id>/texture.png): downloads, the
// client's real advance for the trailing cell, id validation, level-mode zip, phone width.
const { test, expect } = require('@playwright/test');
const fs = require('fs');

const URL = '/rank-generator.html';

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  return errors;
}

async function open(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.RankGen);
}

/** Width and height from a PNG's IHDR chunk; fails if the bytes are not a PNG. */
function pngSize(buf) {
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(buf.toString('latin1', 12, 16)).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Stored (method 0) zip entries, read from the central directory. */
function zipEntries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThan(-1);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    expect(buf.readUInt16LE(p + 10)).toBe(0);
    const size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    expect(buf.readUInt32LE(off)).toBe(0x04034b50);
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    files.set(name, buf.subarray(start, start + size));
    p += 46 + nlen + elen + clen;
  }
  return files;
}

async function download(page, button) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(button)]);
  return { name: dl.suggestedFilename(), data: fs.readFileSync(await dl.path()) };
}

test.describe('advanceOf mirrors GlyphAtlas.size + Glyph.JOIN (height 16)', () => {
  test('a trailing cell more than half full advances a full cell', async ({ page }) => {
    await open(page);
    const rows = await page.evaluate(() =>
      Array.from({ length: 48 }, (_, i) => ({ w: i + 1, ...window.RankGen.advanceOf(i + 1) })));
    for (const r of rows) {
      const last = r.w - 16 * (r.cells - 1);
      expect(r.cells).toBe(Math.ceil(r.w / 16));
      expect(r.last).toBe(last);
      if (last >= 9) {
        // end = (w*16-1)/16 > 7 -> 15: drawn as a full cell, hole of 16 - last.
        expect(r.gap, `w=${r.w}`).toBe(16 - last);
        expect(r.footprint).toBe(16 * r.cells);
        expect(r.gui).toBe(8 * r.cells + 1);
      } else if (last >= 2) {
        expect(r.gap, `w=${r.w}`).toBe(0);
        expect(r.footprint).toBe(r.w);
        expect(r.gui).toBe(8 * (r.cells - 1) + Math.trunc(last / 2 + 1));
      } else {
        // Never a zero byte: a one-column cell is declared two columns wide.
        expect(r.gap).toBe(1);
      }
    }
  });
});

test('rank badge download is a 16-px-high PNG matching the drawn width', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.fill('#text', 'Légendaire');
  const width = await page.evaluate(() => window.RankGen.render().width);
  const { name, data } = await download(page, '#download');
  expect(name).toBe('texture.png');
  expect(pngSize(data)).toEqual({ width, height: 16 });
  expect(errors).toEqual([]);
});

test('a 12-px trailing cell is shown with its 4-px hole and a warning', async ({ page }) => {
  await open(page);
  // "A": 5 px letter + 1 px shadow + 2 px margin and 1 px border on each side = 12 px.
  await page.fill('#text', 'A');
  const badge = await page.evaluate(() => {
    const b = window.RankGen.render();
    return { width: b.width, advance: b.advance };
  });
  expect(badge.width).toBe(12);
  expect(badge.advance).toMatchObject({ cells: 1, last: 12, gap: 4, footprint: 16, gui: 9 });
  await expect(page.locator('#gapWarn')).toContainText('4 px vides');
  await expect(page.locator('#facts')).toContainText("8 px d'interface de large dans le texte");
  // Zoom (x8) includes the reserved hole; the preview leaves room for the next-character marker.
  expect(await page.evaluate(() => document.getElementById('zoom').width)).toBe(16 * 8);
  expect(await page.evaluate(() => document.getElementById('game').width)).toBe(9 * 3 + 3 + 16);
  const { data } = await download(page, '#download');
  expect(pngSize(data)).toEqual({ width: 12, height: 16 });

  // Trimmed to half a cell: no hole, no warning.
  await page.fill('#padX', '0');
  await page.dispatchEvent('#padX', 'input');
  await page.fill('#borderWidth', '0');
  await page.dispatchEvent('#borderWidth', 'input');
  expect(await page.evaluate(() => window.RankGen.render().advance.gap)).toBe(0);
  await expect(page.locator('#gapWarn')).toHaveCount(0);
});

test('rank ids are checked like PackBuild.checkGlyphId', async ({ page }) => {
  await open(page);
  const problems = await page.evaluate(() =>
    ['raw_x', 'Bad Id', 'vip', 'a.b-c_1', '', 'raw'].map(id => window.RankGen.glyphIdProblem(id)));
  expect(problems[0]).toContain('raw_');
  expect(problems[1]).toContain('invalide');
  expect([problems[2], problems[3], problems[5]]).toEqual([null, null, null]);
  expect(problems[4]).toContain('invalide');

  await page.fill('#text', 'Vip');
  await expect(page.locator('#idError')).toHaveCount(0);
  await page.fill('#text', 'Raw X');               // derived id raw_x
  await expect(page.locator('#idError')).toContainText('raw_');
  await page.fill('#rankId', 'Bad Id');
  await expect(page.locator('#idError')).toContainText('invalide');
  await expect(page.locator('#facts')).toContainText('pack/glyphs/Bad Id/texture.png');
  await page.fill('#rankId', '<b>x');               // shown escaped, not as markup
  expect(await page.locator('#facts b').filter({ hasText: /^x$/ }).count()).toBe(0);
  await page.fill('#rankId', 'vip');
  await expect(page.locator('#idError')).toHaveCount(0);
});

test('level mode zip holds exactly the 12 pieces, each <= 8 px and even', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.selectOption('#mode', 'level');
  await page.fill('#style', 'niveau');
  const { name, data } = await download(page, '#downloadLevel');
  expect(name).toBe('niveau.zip');
  const files = zipEntries(data);
  const expected = ['left', ...'0123456789'.split(''), 'right'].map(p => `niveau_${p}/texture.png`);
  expect([...files.keys()].sort()).toEqual(expected.sort());
  for (const [file, png] of files) {
    const { width, height } = pngSize(png);
    expect(height, file).toBe(16);
    expect(width, file).toBeLessThanOrEqual(8);
    expect(width % 2, file).toBe(0);
  }
  await expect(page.locator('#facts')).toContainText('Coût : 15 caractères');   // 475: 3*3+6
  expect(errors).toEqual([]);
});

test('phone width: no horizontal scroll, no console errors, back link visible', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page);
  for (const mode of ['rank', 'level']) {
    await page.selectOption('#mode', mode);
    if (mode === 'rank') await page.fill('#text', 'Fondateur supreme');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, mode).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('a[href="index.html"]').first()).toBeVisible();
  await expect(page.locator('main a[href="glyph-checker.html"]')).toBeVisible();   // the "Outils" menu links it too
  expect(errors).toEqual([]);
});
