// Smoke tests: every tool linked from the Beltaria Studio index loads without
// JS errors and fits a phone-width viewport.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const toolLinks = [...indexHtml.matchAll(/<a class="card" href="([^"]+)"/g)].map(m => m[1]);
const htmlPages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  return errors;
}

test('index lists every tool page and only existing pages', () => {
  const tools = htmlPages.filter(f => f !== 'index.html' && !isRedirectStub(f));
  expect(toolLinks.length).toBeGreaterThan(0);
  for (const link of toolLinks) expect(htmlPages, `broken link ${link}`).toContain(link);
  expect([...toolLinks].sort()).toEqual([...tools].sort());
});

test('index page renders', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/index.html');
  await expect(page).toHaveTitle('Beltaria Studio');
  await expect(page.locator('a.card')).toHaveCount(toolLinks.length);
  expect(errors).toEqual([]);
});

test('old AnimForge URL redirects to animforge.html', async ({ page }) => {
  await page.goto('/mc_animforge_1_8_9_g_n_rateur_d_animations_pixel_art_minecraft.html');
  await page.waitForURL('**/animforge.html');
  await expect(page).toHaveTitle(/AnimForge/);
});

for (const link of toolLinks) {
  test(`${link} loads without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/' + link, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test(`${link} has no horizontal scroll at phone width`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/' + link, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test(`${link} links back to the index`, async ({ page }) => {
    await page.goto('/' + link, { waitUntil: 'load' });
    await expect(page.locator('a[href="index.html"]').first()).toBeVisible();
  });
}

function isRedirectStub(file) {
  return /http-equiv="refresh"/i.test(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}
