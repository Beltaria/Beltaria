// Armor preview: 1.8 layers at 64x32 and HD multiples (128x64, 512x256...) as shipped
// in BeltariaContent's armor/<set>/layer_1.png / layer_2.png.
const { test, expect } = require('@playwright/test');

// Builds a WxH transparent PNG with one opaque red square at (x, y, size) in 64x32 units.
async function layerPng(page, w, h, x, y, size) {
  const b64 = await page.evaluate(([w, h, x, y, size]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const s = w / 64;
    g.fillStyle = '#ff0000';
    g.fillRect(x * s, y * s, size * s, size * s);
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h, x, y, size]);
  return { name: `layer_${w}x${h}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

// Reads a composite skin pixel at (x, y) in 64x64 skin units, sampled in the middle of the texel.
function skinPixel(page, x, y) {
  return page.evaluate(([x, y]) => {
    const s = mainCanvas.width / 64;
    const d = mainCanvas.getContext('2d').getImageData(Math.floor((x + 0.5) * s), Math.floor((y + 0.5) * s), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, [x, y]);
}

async function open(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/armor_layer_preview.html');
  // The upload listeners exist once the page script (after the skinview3d CDN) has run
  await page.waitForFunction(() => typeof viewer !== 'undefined' && typeof mainCanvas !== 'undefined');
  return errors;
}

for (const [w, h] of [[64, 32], [128, 64], [512, 256]]) {
  test(`layer 1 at ${w}x${h} maps the helmet front onto the hat area`, async ({ page }) => {
    const errors = await open(page);
    // Helmet front face in 64x32 units: (8, 8) size 8 -> hat front at (40, 8) in the skin.
    await page.locator('#layer1').setInputFiles(await layerPng(page, w, h, 8, 8, 8));
    await expect(page.locator('#status1')).toContainText('✅');
    expect(await page.evaluate(() => mainCanvas.width)).toBe(Math.max(64, w));
    expect(await skinPixel(page, 44, 12)).toEqual([255, 0, 0, 255]);
    // Just outside the square stays mannequin/transparent, i.e. not red.
    expect((await skinPixel(page, 50, 12))[1] !== 0 || (await skinPixel(page, 50, 12))[0] !== 255).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('mixed scales: a 64x32 layer 2 with a 512x256 layer 1 both land in place', async ({ page }) => {
  const errors = await open(page);
  await page.locator('#layer1').setInputFiles(await layerPng(page, 512, 256, 8, 8, 8));
  // Leggings right leg front in 64x32 units: (4, 20) size 4 -> skin (4, 36).
  await page.locator('#layer2').setInputFiles(await layerPng(page, 64, 32, 4, 20, 4));
  await expect(page.locator('#status2')).toContainText('✅');
  expect(await page.evaluate(() => mainCanvas.width)).toBe(512);
  expect(await skinPixel(page, 44, 12)).toEqual([255, 0, 0, 255]);
  expect(await skinPixel(page, 5, 37)).toEqual([255, 0, 0, 255]);
  expect(errors).toEqual([]);
});

for (const [w, h] of [[100, 50], [64, 64], [128, 32]]) {
  test(`rejects ${w}x${h} with a clear message and keeps the previous layer`, async ({ page }) => {
    await open(page);
    await page.locator('#layer1').setInputFiles(await layerPng(page, 64, 32, 8, 8, 8));
    await page.locator('#layer1').setInputFiles(await layerPng(page, w, h, 0, 0, 1));
    await expect(page.locator('#status1')).toContainText('attendu 64x32 ou un multiple');
    expect(await skinPixel(page, 44, 12)).toEqual([255, 0, 0, 255]);
  });
}
