const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require('playwright');

let browser;
const url = process.env.TEST_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' }); });
after(async () => { await browser?.close(); });

test('requirements are reachable from the real section card and point to the exact sheet row', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(4000);
  try {
    await page.goto(url + '#structure');
    await page.locator('.node[data-node-id="v11-003"]').click();
    assert.match(await page.locator('#detailRequirements').innerText(), /F-01/);
    const details = page.locator('details[data-requirement-id="F-01"]');
    await details.locator('summary').click();
    assert.match(await details.innerText(), /Диаметр; SDR/);
    assert.match(await details.locator('a.requirement-source').getAttribute('href'), /gid=1207056034.*range=A2/);
  } finally { await page.close(); }
});

test('oil and gas entry opens steel gates with oil conditions; direct entry clears the preset', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(4000);
  try {
    await page.goto(url + '#structure');
    const oil = page.getByRole('button', { name: /^Нефтегазовая запорная арматура/ }).first();
    await oil.click();
    assert.equal(await page.locator('#detailTitle').innerText(), 'Задвижки стальные');
    assert.match(await page.locator('#detailPreset').innerText(), /Нефтяная/);
    assert.match(await page.locator('#detailPath').innerText(), /Задвижки стальные/);
    await page.locator('.node').filter({ has: page.locator('.node-title', { hasText: /^Задвижки стальные$/ }) }).click();
    assert.equal(await page.locator('#detailPresetSection').isVisible(), false);
  } finally { await page.close(); }
});

test('mobile dialog keeps source links keyboard-accessible and returns focus when closed', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(4000);
  try {
    await page.goto(url + '#structure');
    const section = page.locator('.node[data-node-id="v11-003"]');
    await section.click();
    await page.locator('details[data-requirement-id="F-01"] summary').click();
    const link = page.locator('details[data-requirement-id="F-01"] a.requirement-source');
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    assert.notEqual(await page.evaluate(() => document.activeElement.id), 'detailClose');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.dataset.nodeId === 'v11-003');
    assert.equal(await page.locator('.details').getAttribute('aria-hidden'), 'true');
  } finally { await page.close(); }
});
