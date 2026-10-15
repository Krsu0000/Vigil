// npm run build && npm run test:browser. 실행 환경은 docs/verification.md 참조.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { checkInventory } from './browser-inventory.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('Playwright가 필요합니다. docs/verification.md의 설치 절차를 확인하세요.');
  ({ chromium } = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright')));
}
const artifacts = path.resolve(root, process.env.BROWSER_ARTIFACTS || 'artifacts/browser');
await fs.mkdir(artifacts, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, 'dist', `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
    if (!file.startsWith(path.join(root, 'dist') + path.sep)) { res.writeHead(404).end(); return; }
    const content = await fs.readFile(file);
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const distUrl = `http://127.0.0.1:${server.address().port}`;
let dev, browser;
const results = [];
const readSlot = page => page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('last-vigil', 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('save-slots', 'readonly').objectStore('save-slots').get('primary');
      request.onsuccess = () => resolve(JSON.parse(request.result)); request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
});
async function font(page) {
  if (!process.env.BROWSER_FONT_DIR) return;
  const directory = process.env.BROWSER_FONT_DIR;
  let css = '';
  for (const weight of [400, 700]) css += await fs.readFile(path.join(directory, `korean-${weight}.css`), 'utf8');
  const files = [...new Set([...css.matchAll(/url\(\.\/([^)]*)\)/g)].map(match => match[1]))];
  for (const file of files) css = css.replaceAll(`url(./${file})`, `url(data:font/woff2;base64,${(await fs.readFile(path.join(directory, file))).toString('base64')})`);
  await page.addStyleTag({ content: css + ":root{font-family:'Nanum Gothic',sans-serif}" });
  await page.evaluate(() => document.fonts.ready);
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHROMIUM_EXECUTABLE ? { executablePath: process.env.BROWSER_CHROMIUM_EXECUTABLE } : {}) });
  for (const width of process.env.BROWSER_SUITE === 'map' ? [] : [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500, isMobile: width < 500 });
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-10-15T01:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-15T01:00:01Z'));
      await page.goto(distUrl); await page.getByTestId('position').waitFor();
      const position = () => page.getByTestId('position').textContent();
      const east = page.getByRole('button', { name: '오른쪽으로 이동', exact: true });
      const west = page.getByRole('button', { name: '왼쪽으로 이동', exact: true });
      await page.keyboard.down('ArrowRight'); assert.equal(await position(), '(2, 1)');
      await page.clock.runFor(500); assert.equal(await position(), '(2, 1)'); await page.keyboard.up('ArrowRight');
      await page.keyboard.press('ArrowLeft'); assert.equal(await position(), '(1, 1)');
      await page.clock.runFor(99); await page.keyboard.press('ArrowRight'); assert.equal(await position(), '(1, 1)');
      await page.clock.runFor(1); await page.keyboard.press('ArrowRight'); assert.equal(await position(), '(2, 1)');
      await page.clock.runFor(100); await west.focus(); await page.keyboard.press('Space'); assert.equal(await position(), '(1, 1)');
      await page.clock.runFor(100); await east.focus(); await page.keyboard.press('Enter'); assert.equal(await position(), '(2, 1)');
      await page.clock.runFor(100); await west.click(); assert.equal(await position(), '(1, 1)');
      await page.clock.runFor(100);
      if (width < 500) await east.tap(); else await east.click();
      assert.equal(await position(), '(2, 1)');
      await page.clock.runFor(100); await page.keyboard.press('ArrowLeft');
      const before = await readSlot(page);
      for (let i = 0; i < 60; i += 1) { await page.clock.runFor(100); await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'); }
      // 연속 입력 중에도 실제 IndexedDB에 저장되는지 확인한다.
      const saved = await readSlot(page);
      assert(saved.revision > before.revision); assert(saved.savedAt > before.savedAt);
      assert(saved.savedAt - before.savedAt <= 5_000);
      await page.getByRole('button', { name: '일시정지', exact: true }).click();
      await page.keyboard.press('ArrowRight'); assert.equal(await position(), '(1, 1)'); assert(await east.isDisabled());
      await page.getByRole('button', { name: '설정', exact: true }).click();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: '파일로 내보내기', exact: true }).click();
      const download = await downloadPromise;
      const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
      assert.equal(exported.schemaVersion, 5);
      await page.locator('input[type=file]').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
      await page.getByRole('button', { name: '이 탐험으로 교체', exact: true }).click();
      await page.getByTestId('file-status').filter({ hasText: '가져왔' }).waitFor();
      await page.getByRole('button', { name: '닫기', exact: true }).click();
      await font(page);
      assert.equal(await page.locator('.map-cell').count(), 63);
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(artifacts, `app-${width}.png`), fullPage: true });
      results.push(await checkInventory({ page, width, artifacts, readSlot, font }));
      assert.deepEqual(errors, []);
      results.push({ width, input: true, saveDuringContinuousInput: true, fileRoundtrip: true, errors });
    } finally { await context.close(); }
  }
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await dev.listen();
  const fixtureUrl = dev.resolvedUrls.local[0];
  for (const size of [128, 512]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${fixtureUrl}tests/browser/fixture.html?size=${size}`); await page.getByTestId('position').waitFor();
      await page.waitForFunction(() => document.querySelector('.map-grid').clientWidth > 0);
      assert.equal(await page.locator('.map-grid').getAttribute('aria-rowcount'), String(size));
      const nameReads = await page.evaluate(() => {
        const fixture = window.__fixture, before = fixture.mapNameReads();
        fixture.store.dispatch({ type: 'time/tick' }); return before;
      });
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => window.__fixture.mapNameReads()), nameReads);
      const cells = await page.locator('.map-cell').count(); assert(cells < 400);
      assert.equal(await page.locator('[data-x="1"][data-y="0"]').getAttribute('data-visibility'), 'visible');
      await page.evaluate(() => { const view = document.querySelector('.map-viewport'); view.scrollLeft = view.scrollWidth; view.scrollTop = view.scrollHeight; });
      await page.locator(`[data-x="${size - 1}"][data-y="${size - 1}"]`).waitFor();
      const far = page.locator(`[data-x="${size - 1}"][data-y="${size - 1}"]`);
      assert.equal(await far.getAttribute('data-visibility'), 'unexplored');
      assert(!await far.getAttribute('class').then(value => value.includes('is-wall')));
      assert.equal(await far.getAttribute('aria-colindex'), String(size));
      await page.keyboard.press('ArrowRight');
      await page.locator('.map-cell.is-player').waitFor();
      assert.equal(await page.locator('[data-x="1"][data-y="0"]').getAttribute('data-visibility'), 'explored');
      const followed = await page.locator('.map-cell.is-player').evaluate(element => {
        const a = element.getBoundingClientRect(), b = element.closest('.map-viewport').getBoundingClientRect();
        return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
      }); assert(followed);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(100);
      const resized = await page.locator('.map-cell').count(); assert(resized < 500);
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
      assert.deepEqual(errors, []); await font(page);
      await page.screenshot({ path: path.join(artifacts, `map-${size}.png`), fullPage: true });
      results.push({ mapSize: size, totalCells: size * size, renderedMobileCells: cells, renderedDesktopCells: resized, scrollingAndFollow: true, noMapRenderOnTick: true, errors });
    } finally { await context.close(); }
  }
  await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser?.close(); await dev?.close(); await new Promise(resolve => server.close(resolve)); }
