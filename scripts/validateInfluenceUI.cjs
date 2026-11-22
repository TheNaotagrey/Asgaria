// Vraie page, vrai service d'influence et base SQLite temporaire.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./fixtures/influenceDatabase.cjs');
const { createInfluenceRouter } = require('../services/influenceService');
const { createTradeLinkAtomically } = require('../src/tradePersistence');
const { getSql, allSql, runSql } = require('../src/sqliteTransaction');
const output = path.resolve('output/influence-ui');
(async () => {
  const f = await fixture(); let admin = false;
  await f.sql(db => runSql(db, "INSERT INTO duchies VALUES (3,'Artifort'),(4,'Asgaria'),(5,'Ruste')"));
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { user: { id: 1, isAdminActive: admin } }; next(); });
  app.use('/api/seigneurie/influence', createInfluenceRouter(f.dbPath, user => user.isAdminActive));
  app.use('/api', async (req, res) => {
    try {
      if (req.path === '/me') return res.json({ id: 1, first_name: 'Validation', is_admin: admin, act_as_admin: admin });
      if (req.path === '/test_mode') return res.json({ enabled: false });
      if (req.path === '/my_seigneurie') return res.json(await f.sql(async db => ({
        seigneurie: await getSql(db, 'SELECT * FROM seigneuries WHERE id=1'),
        inventaire: await getSql(db, 'SELECT * FROM inventaire WHERE id=1'),
        seigneur: { name: 'Alice', player_name: 'Propriétaire de validation' }, barony: { id: 1, name: 'Valmont', duchy_name: 'Midéranne' },
        employment: { employed: 0, slaves: 0 }, buildings: {}, infrastructures: {}, production: {}, capacities: {}, landTxMax: 3, navalTxMax: 3,
        updateStatus: { current: { year: 1026, number: 9 }, canAdvance: false, blockers: [] }
      })));
      const tables = { '/baronies': 'baronies', '/seigneurs': 'seigneurs', '/seigneuries': 'seigneuries', '/barony_connections': 'barony_connections',
        '/maritime_zone_connections': 'maritime_zone_connections', '/maritime_zone_baronies': 'maritime_zone_baronies', '/trade_routes': 'trade_routes', '/trade_lines': 'trade_lines' };
      if (tables[req.path]) {
        const rows = await f.sql(db => allSql(db, `SELECT * FROM ${tables[req.path]}`));
        return res.json(rows.map(row => row.path ? { ...row, path: JSON.parse(row.path) } : row));
      }
      if (req.path === '/maritime_zones') return res.json([{ id: 10, name: 'Mer intérieure' }, { id: 11, name: 'Mer lointaine' }]);
      if (req.path === '/barony_pixels') return res.json({ 1: [[1,1]], 2: [[2,2]], 3: [[3,3]] });
      if (req.path === '/maritime_zone_pixels') return res.json({});
      if (req.path === '/messaging/conversations') return res.json({ user_id: 1, can_send: true, conversations: [] });
      if (req.path === '/messaging/recipients') return res.json({ recipients: [] });
      if (req.path === '/users/me/trade_links/build') return res.json(await createTradeLinkAtomically(f.dbPath, {
        actor: { id: 1, isAdminActive: admin }, playerId: admin ? req.body.seigneurie_id : undefined,
        seigneurieId: 1, startId: 1, targetId: req.body.barony_id, type: req.body.type, storedPath: req.body.path
      }));
      res.json([]);
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });
  app.use(express.static(path.resolve(__dirname, '..')));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.UI_BROWSER_PATH });
  const errors = []; fs.mkdirSync(output, { recursive: true });
  try {
    for (const mode of [false,true]) for (const width of [1440,390]) {
      admin = mode;
      await f.sql(async db => {
        await runSql(db, 'UPDATE inventaire SET prestige=20,renommee=-2,rhum=100 WHERE id=1');
        await runSql(db, 'UPDATE player_duchy_influence SET amount=10 WHERE player_id=1');
        await runSql(db, 'DELETE FROM trade_lines'); await runSql(db, 'DELETE FROM trade_routes');
      });
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.route('https://**', route => route.abort());
      await page.addInitScript(() => localStorage.setItem('gestionActiveTab','sommaire'));
      await page.goto(`http://127.0.0.1:${server.address().port}/gestion.html`);
      await page.waitForSelector('#prestigeConversionForm', { state: 'attached' });
      assert.equal(await page.locator('#influenceSection').evaluate(element => element.open), false);
      assert.equal(await page.locator('#summary').evaluate(element => element.lastElementChild.id), 'influenceSection');
      await page.locator('#influenceSection').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${mode?'admin':'joueur'}-${width}-replie.png`), fullPage: true });
      await page.locator('#influenceSection > summary').click();
      await page.waitForSelector('#prestigeConversionForm');
      assert.equal(await page.locator('.influence-admin-badge, .conversion-preview, .metric-note, .sheet-eyebrow').count(), 0);
      if (width > 600) {
        const metrics = await page.locator('.influence-metrics').boundingBox();
        const conversion = await page.locator('#prestigeConversionForm').boundingBox();
        assert.ok(Math.abs((metrics.y + metrics.height/2) - (conversion.y + conversion.height/2)) < 2);
      }
      assert.match(await page.locator('#influencePanel').innerText(), /Midéranne/);
      assert.equal(await page.locator('.duchy-balance').count(), 5);
      const metricValue = key => page.locator(`.influence-metric[data-resource="${key}"] ${mode ? 'input' : '.metric-value'}`);
      const waitMetric = (key, amount) => page.waitForFunction(({ key, amount }) => {
        const card = document.querySelector(`.influence-metric[data-resource="${key}"]`);
        return gameState.influence?.[key] === amount && Number(card?.querySelector('input')?.value ?? card?.querySelector('.metric-value')?.textContent) === amount;
      }, { key, amount });
      const waitBalance = (id, amount) => page.waitForFunction(({ id, amount }) => {
        const card = document.querySelector(`.duchy-balance[data-duchy-id="${id}"]`);
        return gameState.influence?.balances.find(b => b.duchy_id === id)?.amount === amount && Number(card?.querySelector('input')?.value ?? card?.querySelector('strong')?.textContent) === amount;
      }, { id, amount });
      if (mode) {
        assert.equal(await page.locator('#influenceAdminForm button').count(), 0);
        await metricValue('prestige').fill('24'); await metricValue('prestige').press('Tab'); await waitMetric('prestige', 24);
        await metricValue('renommee').fill('-3'); await metricValue('renommee').press('Tab'); await waitMetric('renommee', -3);
        await page.locator('#influence-1').fill('12'); await page.locator('#influence-1').press('Tab'); await waitBalance(1, 12);
        await page.locator('#influence-3').fill('4'); await page.locator('#influence-3').press('Tab'); await waitBalance(3, 4);
        await page.reload(); await page.waitForSelector('#influenceAdminForm', { state: 'attached' });
        await page.locator('#influenceSection > summary').click();
        await page.waitForSelector('#influenceAdminForm');
        assert.equal(await metricValue('renommee').inputValue(), '-3');
        assert.equal(await page.locator('#influence-3').inputValue(), '4');
        await page.locator('#influencePanel').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `admin-${width}-edition.png`), fullPage: true });
        await metricValue('prestige').fill('20'); await metricValue('prestige').press('Tab'); await waitMetric('prestige', 20);
        await metricValue('renommee').fill('-2'); await metricValue('renommee').press('Tab'); await waitMetric('renommee', -2);
        await page.locator('#influence-1').fill('10'); await page.locator('#influence-1').press('Tab'); await waitBalance(1, 10);
        await page.locator('#influence-3').fill('0'); await page.locator('#influence-3').press('Tab'); await waitBalance(3, 0);
      } else {
        assert.equal(await page.locator('#influenceAdminForm').count(), 0);
        const result = await page.request.put(`http://127.0.0.1:${server.address().port}/api/seigneurie/influence`, { data: { changes: { prestige: 50 }, expected: { prestige: 20 } } });
        assert.equal(result.status(), 403);
      }
      await page.locator('#prestigeConversionForm [name=amount]').fill('3');
      await page.locator('#prestigeConversionForm button').click();
      await waitMetric('renommee', 1);
      await page.locator('#prestigeConversionForm [name=amount]').fill('2');
      await page.locator('#prestigeConversionForm [name=target]').selectOption('influence');
      await page.locator('#prestigeConversionForm button').click();
      await waitBalance(1, 14);
      await page.locator('#prestigeConversionForm [name=amount]').fill('15');
      await f.sql(db => runSql(db, 'UPDATE inventaire SET prestige=0 WHERE id=1'));
      await page.locator('#prestigeConversionForm button').click();
      await page.waitForFunction(() => document.querySelector('#prestigeConversionForm [role=status]')?.textContent.includes('Prestige insuffisant'));
      await page.locator('#influencePanel details summary').click();
      await page.locator('#influenceTransferForm [name=destination_id]').selectOption('2');
      await page.locator('#influenceTransferForm [name=duchy_id]').selectOption('1');
      await page.locator('#influenceTransferForm [name=amount]').fill('1');
      await page.locator('#influenceTransferForm button').click();
      await waitBalance(1, 13);
      await page.locator('#influencePanel').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${mode?'admin':'joueur'}-${width}-sommaire.png`), fullPage: true });
      await page.locator('.tab-btn[data-tab=commerce]').click();
      await page.locator('#newTradeRouteBtn').click(); await page.waitForSelector('#tradeDestinationDialog[open]');
      await page.locator('#tradeDestinationSelect').selectOption('2');
      await page.locator('#tradeDestinationContinue').click(); await page.waitForSelector('#tradeRouteDialog[open]');
      await page.waitForSelector('#tradeRouteHint .trade-cost-card');
      assert.match(await page.locator('#tradeRouteHint').innerText(), /2 segments terrestres/);
      assert.equal(await page.locator('#tradeRouteHint dl > div').nth(0).innerText(), 'Or\n6');
      await page.locator('#tradeRouteMethod').selectOption('naval');
      assert.match(await page.locator('#tradeRouteHint').innerText(), /1 zone maritime/);
      assert.equal(await page.locator('#tradeRouteHint dl > div').nth(0).innerText(), 'Rhums\n5');
      assert.match(await page.locator('#tradeRouteHint').innerText(), /Midéranne/);
      assert.match(await page.locator('#tradeRouteHint').innerText(), /Orférie/);
      assert.equal(await page.locator('#tradeRouteHint dl > div').count(), 3);
      await page.screenshot({ path: path.join(output, `${mode?'admin':'joueur'}-${width}-maritime.png`), fullPage: true });
      await page.locator('#tradeRouteSave').click(); await page.waitForSelector('#tradeRouteDialog:not([open])', { state: 'attached' });
      assert.equal(await f.sql(async db => (await getSql(db, 'SELECT rhum FROM inventaire WHERE id=1')).rhum), 95);
      assert.equal(await f.sql(async db => (await getSql(db, 'SELECT amount FROM player_duchy_influence WHERE player_id=1 AND duchy_id=2')).amount), 9);
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('Influence : édition admin persistante, droits joueur, présentation, conversion, refus, envoi et coûts maritimes nommés validés sur ordinateur/mobile.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); f.cleanup(); }
})().catch(error => { console.error(error); process.exitCode=1; });
