// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright module.
// Uses the real page and scripts with isolated API fixtures; never writes game data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.UI_SCREENSHOT_DIR || path.join(root, 'artifacts', 'gestion-ui'));
const state = {
  seigneurie: { id: 1, type: 'seigneur', population: 100, tax_rate: 5, beginner_protection: 1 },
  inventaire: { or_: 500, vivres: 50, points_magique: 1990, hommes_darmes: 10 },
  barony: { id: 1, name: 'Valmont', kingdom_name: 'Asgaria', duchy_name: 'Monts', county_name: 'Val' },
  seigneur: { name: 'Louis de Valmont', religion_name: 'Foi ancienne', overlord_name: 'Duc des Monts' },
  employment: { employed: 30, slaves: 0 }, idh: 8,
  production: { or_: 5, vivres: -100, points_magique: 30 },
  capacities: { vivres: 500, points_magique: 2000, hommes_darmes: 50 },
  updateStatus: { current: { year: 1026, number: 1 }, next: { year: 1026, number: 2 }, canAdvance: true, blockers: [] }
};
let transactions = [];
let transactionError = false;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const data = url.pathname === '/api/my_seigneurie' ? state
      : url.pathname === '/api/me' ? { id: 1, first_name: 'Marie', last_name: 'Dupont', is_admin: false }
      : url.pathname === '/api/test_mode' ? { enabled: false }
      : url.pathname === '/api/trade_transactions' ? transactions : [];
    if (/^\/api\/trade_transactions\/\d+$/.test(url.pathname)) {
      const transaction = transactions.find(tx => tx.id === Number(url.pathname.split('/').pop()));
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(transaction));
    }
    res.writeHead(url.pathname === '/api/trade_transactions' && transactionError ? 503 : 200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data));
  }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_PATH ? { executablePath: process.env.UI_BROWSER_PATH } : {}) });
  try {
    fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**', route => route.abort());
    const url = `http://127.0.0.1:${server.address().port}/gestion.html`;
    for (const width of [1440, 1280, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(url);
      await page.waitForSelector('#basicResourcesTable tr');
      assert.match(await page.locator('#pendingTxTable').innerText(), /Aucune transaction en attente/);
      assert.equal(await page.locator('.beginner-protection').count(), 1);
      const before = await page.locator('#popAndTx').boundingBox();
      await page.locator('.update-preview summary').click();
      const after = await page.locator('#popAndTx').boundingBox();
      assert.equal(before.y, after.y, `Opening preview shifts population at ${width}px`);
      assert.match(await page.locator('.update-preview').innerText(), /Famine : 2 morts/);
      assert.match(await page.locator('.update-preview').innerText(), /20 perdus/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Page overflows at ${width}px`);
      await page.screenshot({ path: path.join(output, `sommaire-${width}-ouvert.png`), fullPage: true });
      await page.locator('.update-preview summary').click();
      assert.equal((await page.locator('#popAndTx').boundingBox()).y, before.y);
      await page.screenshot({ path: path.join(output, `sommaire-${width}-ferme.png`), fullPage: true });
      const boxes = await page.locator('#resourceTables > div > table').evaluateAll(tables => tables.map(table => {
        const r = table.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
          `Resource tables overlap at ${width}px`);
      }
      await page.locator('#resourceTables').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `sommaire-${width}-ressources.png`), fullPage: true });
      if (width <= 1150) {
        await page.locator('.update-preview summary').click();
        await page.locator('.summary-update-panel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
        await page.locator('.summary-update-panel').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `sommaire-${width}-prevision-defilee.png`), fullPage: true });
      }
    }
    state.seigneurie.beginner_protection = 0;
    state.updateStatus.canAdvance = false;
    state.updateStatus.blockers = [{ message: 'La population employée dépasse la population totale.' }];
    transactions = [
      { id: 1, resources: { or_: 200, pierre: 30 }, origin_name: 'Éléonore de la Rivière', origin_barony_name: 'La Rivière', origin_update_label: 'Février 1026', created_at: '2026-10-01T12:00:00Z', reason: 'Participation à la construction des remparts de Valmont', state: 'En Attente' },
      { id: 2, resources: { vivres: 300 }, origin_name: 'Charles', origin_barony_name: 'Hautbois', origin_update_label: 'Mars 1026', created_at: '2026-10-02T12:00:00Z', reason: 'Aide alimentaire', state: 'Approuvée', received: 0 }
    ];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(url);
      await page.waitForSelector('#basicResourcesTable tr');
      assert.equal(await page.locator('.beginner-protection').count(), 0);
      assert.equal(await page.locator('#advanceUpdateBtn').isDisabled(), true);
      assert.equal(await page.locator('#pendingTxTable tbody tr').count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, `sommaire-${width}-bloque-transactions.png`), fullPage: true });
      await page.locator('.tx-open').click();
      await page.waitForSelector('#txDialog[open]');
      assert.match(await page.locator('#txDialog').innerText(), /Éléonore de la Rivière/);
      await page.locator('#txClose').click();
      assert.equal(await page.locator('#txDialog').evaluate(dialog => dialog.open), false);
    }
    transactionError = true;
    await page.goto(url);
    await page.waitForSelector('#basicResourcesTable tr');
    assert.match(await page.locator('#pendingTxTable').innerText(), /Impossible de charger/);
    assert.equal(await page.locator('#pendingTxTable th').count(), 6);
    assert.deepEqual(errors, []);
    console.log('UI vérifiée : 4 largeurs, prévision ouverte/fermée sans déplacement, protection active/inactive, famine, stockage, transactions vides/remplies/erreur et consultation, aucun chevauchement, débordement ni erreur JavaScript.');
    console.log(`Captures : ${output}`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
