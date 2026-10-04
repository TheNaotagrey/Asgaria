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
  idhDetails: Array.from({ length: 45 }, (_, index) => ({
    label: `Contribution ${index + 1} — bâtiments, infrastructures et effets de la baronnie avec un libellé très long`, amount: index % 2 ? -1 : 1
  })),
  production: { or_: 5, vivres: -100, points_magique: 30 },
  capacities: { vivres: 500, points_magique: 2000, hommes_darmes: 50 },
  updateStatus: { current: { year: 1026, number: 1 }, next: { year: 1026, number: 2 }, canAdvance: true, blockers: [] }
};
let transactions = [];
let transactionError = false;
let adminMode = false;
let lastBuildPayload = null;
const buildingProperties = [{ id: 1, label: 'Champs de céréales', type: 'champ', produces: 'vivres', production: 100,
  workers_per_building: 5, costs: '{"or_":20,"pierre":5}', max: '10', effects: '[]', available_seigneur: 1 }];
const infrastructureProperties = [
  { id: 1, label: 'Atelier de transformation', type: 'civil', costs: '{"or_":50}', max: '5', available_seigneur: 1,
    description: 'Transforme les ressources et emploie les habitants disponibles.',
    effects: '[{"type":"instant_production","resource":"pierre","amount":5,"costs":{"or_":2}},{"type":"variable_workers","resource":"fer","amount":2,"max_workers":10}]' },
  { id: 2, label: 'Caserne', type: 'militaire', costs: '{"or_":80}', max: '5', available_seigneur: 1,
    description: 'Augmente la capacité militaire.', effects: '[{"type":"storage","resource":"hommes_darmes","amount":50}]' },
  { id: 3, label: 'Comptoir commercial', type: 'commercial', costs: '{"or_":100}', max: '5', available_seigneur: 1,
    description: 'Permet davantage de transactions terrestres.', effects: '[]' }
];
Object.assign(state, {
  buildings: { 1: { built: 2, active: 1 } },
  infrastructures: { 1: { built: 1, effect_0_remaining: 3, effect_1_workers: 2 }, 2: { built: 1 }, 3: { built: 1 } },
  baronyProps: { id: 1, barony_id: 1, water_access: 1, field_limit: 10, effects: '[]' },
  unlockedPages: { magie: true }
});
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/users/me/trade_links/build' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        lastBuildPayload = JSON.parse(body);
        state.inventaire.or_ -= 3;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });
      return;
    }
    const data = url.pathname === '/api/my_seigneurie' ? state
      : url.pathname === '/api/me' ? { id: 1, first_name: 'Marie', last_name: 'Dupont', is_admin: adminMode }
      : url.pathname === '/api/test_mode' ? { enabled: false }
      : url.pathname === '/api/trade_transactions' ? transactions
      : url.pathname === '/api/building_properties' ? buildingProperties
      : url.pathname === '/api/infrastructure_properties' ? infrastructureProperties
      : url.pathname === '/api/religions' ? [{ id: 1, name: 'Foi ancienne' }]
      : url.pathname === '/api/cultures' ? [{ id: 1, name: 'Culture de Valmont' }]
      : url.pathname === '/api/seigneurs' ? [{ id: 1, name: 'Louis de Valmont', user_id: 1 }]
      : url.pathname === '/api/seigneuries' ? [{ id: 1, seigneur_id: 1, baronnie_id: 1 }]
      : url.pathname === '/api/baronies' ? [{ id: 1, name: 'Valmont' }, { id: 2, name: 'Hautbois' }]
      : url.pathname === '/api/trade_routes' ? [{ id: 1, barony_id_1: 1, barony_id_2: 2, path: [] }]
      : url.pathname === '/api/spells' ? [{ id: 1, type: 'base', label: 'Bénédiction des récoltes', description: 'Améliore les récoltes.', costs: '{"points_magique":10}', effects: '[]' }]
      : url.pathname === '/api/spell_targets' ? { targets: [{ seigneurie_id: 1, barony_name: 'Valmont', distance: 0 }] } : [];
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
    await page.addInitScript(() => localStorage.setItem('gestionActiveTab', 'sommaire'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**', route => route.abort());
    const url = `http://127.0.0.1:${server.address().port}/gestion.html`;
    for (const admin of [false, true]) {
      adminMode = admin;
      const summaryPrefix = admin ? 'sommaire-admin' : 'sommaire';
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
      assert.match(await page.locator('.preview-variation.prod-negative').innerText(), /-100/);
      assert.match(await page.locator('.update-preview').innerText(), /20 perdus/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Page overflows at ${width}px`);
      await page.screenshot({ path: path.join(output, `${summaryPrefix}-${width}-ouvert.png`), fullPage: true });
      await page.locator('.update-preview summary').click();
      assert.equal((await page.locator('#popAndTx').boundingBox()).y, before.y);
      await page.screenshot({ path: path.join(output, `${summaryPrefix}-${width}-ferme.png`), fullPage: true });
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
      await page.screenshot({ path: path.join(output, `${summaryPrefix}-${width}-ressources.png`), fullPage: true });
      if (width <= 1150) {
        await page.locator('.update-preview summary').click();
        await page.locator('.summary-update-panel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
        await page.locator('.summary-update-panel').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${summaryPrefix}-${width}-prevision-defilee.png`), fullPage: true });
      }
    }
    }
    adminMode = false;
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
    transactionError = false;
    for (const admin of [false, true]) {
      adminMode = admin;
      for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(url);
        await page.waitForSelector('#basicResourcesTable tr');
        if (admin) {
          assert.equal(await page.locator('#popInput').count(), 1);
          assert.equal(await page.locator('#religionSelect option').count(), 1);
          assert.equal(await page.locator('#adminSeigneurieSelect select').isVisible(), true);
          assert.equal(await page.locator('#adminSeigneurieSelect select').inputValue(), '1');
        }
        for (const tab of ['sommaire', 'infra', 'infraMili', 'ost', 'magie', 'commerce', 'proprietes']) {
          await page.locator(`.tab-btn[data-tab="${tab}"]`).click();
          await page.waitForSelector(`#tab-${tab}.active`);
          assert.ok(await page.locator(`#tab-${tab} .admin-table`).count() > 0, `No table in ${tab}`);
          const styles = await page.locator(`#tab-${tab} .admin-table`).evaluateAll(tables => tables.map(table => {
            const style = getComputedStyle(table);
            return [style.borderCollapse, style.borderTopWidth, style.borderTopColor, style.borderRadius];
          }));
          for (const style of styles) assert.deepEqual(style, ['separate', '1px', 'rgb(204, 211, 220)', '6px']);
          if (tab === 'infra' || tab === 'infraMili' || tab === 'commerce') {
            const tableId = tab === 'infra' ? 'civilInfraTable' : tab === 'infraMili' ? 'militaryInfraTable' : 'commercialInfraTable';
            const cells = await page.locator(`#${tableId}`).evaluate(table =>
              [...table.rows].map(row => row.cells.length));
            assert.ok(cells.every(count => count === cells[0]), 'Infrastructure header does not match body');
            assert.equal(cells[0], tab === 'infra' ? 9 : 8);
          }
          if (tab === 'magie') {
            assert.equal(await page.locator('.cast-spell').count(), 1);
            assert.match(await page.locator('#spellTargetSelect').innerText(), /Valmont/);
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${tab} overflows in ${admin ? 'admin' : 'player'} at ${width}`);
          const overflowingControls = await page.locator(`#tab-${tab} .admin-table :is(input,select)`).evaluateAll(controls => controls.filter(control => {
            const parent = control.closest('td').getBoundingClientRect();
            const box = control.getBoundingClientRect();
            return box.width > parent.width + 1;
          }).map(control => control.className || control.id));
          assert.deepEqual(overflowingControls, [], `Controls overflow in ${tab}`);
          await page.screenshot({ path: path.join(output, `${admin ? 'admin' : 'joueur'}-${width}-${tab}.png`), fullPage: true });
          if (width === 390) {
            const wrappers = page.locator(`#tab-${tab} :is(#productionInfra, #civilInfra, #militaryInfra, #commercialInfra, #spellList, #tradeRoutes)`);
            for (const wrapper of await wrappers.all()) {
              const needsScroll = await wrapper.evaluate(el => el.scrollWidth > el.clientWidth + 1);
              if (needsScroll) {
                await wrapper.evaluate(el => { el.scrollLeft = el.scrollWidth; });
                assert.ok(await wrapper.evaluate(el => el.scrollLeft) > 0, `Actions inaccessible in ${tab}`);
              }
            }
            await page.screenshot({ path: path.join(output, `${admin ? 'admin' : 'joueur'}-${width}-${tab}-actions.png`), fullPage: true });
          }
        }
      }
    }
    for (const admin of [false, true]) {
      adminMode = admin;
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(url);
        const trigger = page.locator('#populationSummary .tooltip').last();
        await trigger.waitFor();
        const popup = page.locator('#gestionTooltip');
        await trigger.hover();
        await popup.waitFor({ state: 'visible' });
        const box = await popup.boundingBox();
        assert.ok(box.x >= 11 && box.x + box.width <= width - 11);
        assert.ok(box.y >= 11 && box.y + box.height <= 789);
        assert.equal(await popup.locator('tr').count(), 45);
        assert.ok(await popup.evaluate(el => el.scrollHeight > el.clientHeight));
        assert.ok(await popup.evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }), 'Tooltip is clipped behind its table');
        await popup.hover();
        await popup.evaluate(el => { el.scrollTop = el.scrollHeight; });
        assert.ok(await popup.evaluate(el => el.scrollTop > 0));
        assert.equal(await popup.isVisible(), true);
        await page.screenshot({ path: path.join(output, `${admin ? 'admin' : 'joueur'}-${width}-idh-tooltip.png`), fullPage: true });
        await page.keyboard.press('Escape');
        assert.equal(await popup.isVisible(), false);
        await trigger.focus();
        await page.keyboard.press('Enter');
        assert.equal(await popup.evaluate(el => document.activeElement === el), true);
        await page.keyboard.press('Escape');
        assert.equal(await popup.isVisible(), false);
        assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
        await trigger.click();
        assert.equal(await popup.isVisible(), true);
        await page.locator('.tab-btn[data-tab="infra"]').click();
        assert.equal(await popup.isVisible(), false);
      }
    }
    transactions = [{ id: 7, origin_id: 2, destination_id: 1, origin_name: 'Charles', origin_barony_name: 'Hautbois',
      resources: { vivres: 100 }, type: 'land', state: 'En Attente', origin_update_year: 1026,
      origin_update_number: 2, origin_update_label: 'Mars 1026', reason: 'Aide alimentaire' }];
    for (const admin of [false, true]) {
      adminMode = admin;
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        await page.waitForSelector('#basicResourcesTable tr');
        await page.evaluate(() => showUpdateReport({
          current_update_label: 'Mars 1026',
          before: { population: 100, inventory: { or_: 500, pierre: 40, points_magique: 1990, vivres: 50 } },
          after: { population: 98, inventory: { or_: 505, pierre: 40, points_magique: 2000, vivres: 0 } },
          delta: { population: -2, inventory: { or_: 5, pierre: 0, points_magique: 10, vivres: -50 } },
          events: [{ title: 'Famine', details: '2 habitants sont morts faute de vivres.' },
            { title: 'Perte par débordement', details: '20 points_magique, 10 hommes_darmes, 5 lingot_or' }]
        }));
        const report = page.locator('#updateReportDialog');
        assert.equal(await report.locator('tbody tr').count(), 4);
        const reportText = await report.innerText();
        assert.doesNotMatch(reportText, /points_magique|hommes_darmes|lingot_or|Pierre/);
        assert.match(reportText, /Points magiques/);
        assert.match(reportText, /Hommes d'armes/);
        assert.match(reportText, /Lingots d'or/);
        assert.equal(await report.locator('.prod-positive').count(), 2);
        assert.equal(await report.locator('.prod-negative').count(), 2);
        assert.ok(await report.evaluate(el => el.scrollWidth <= el.clientWidth));
        await page.screenshot({ path: path.join(output, `${admin ? 'admin' : 'joueur'}-${width}-releve-condense.png`), fullPage: true });
        await page.locator('#updateReportClose').click();
        await page.evaluate(() => showUpdateReport({ before: { population: 100, inventory: { pierre: 40 } },
          after: { population: 100, inventory: { pierre: 40 } }, events: [] }));
        assert.equal(await report.locator('table').count(), 0);
        assert.match(await report.innerText(), /Aucun changement/);
        assert.equal(await report.locator('ul').count(), 0);
        await page.locator('#updateReportClose').click();
        await page.locator('.tx-open').click();
        await page.locator('#txDialog[open]').waitFor();
        assert.equal(await page.locator('#txAccept').isVisible(), false);
        assert.equal(await page.locator('#txRefuse').isVisible(), false);
        assert.match(await page.locator('#txContent').innerText(), /accepter ou refuser.*Mars 1026/);
        await page.screenshot({ path: path.join(output, `${admin ? 'admin' : 'joueur'}-${width}-transaction-future.png`), fullPage: true });
        await page.locator('#txClose').click();
        for (const number of [1, 2, 3]) {
          await page.evaluate(number => { gameState.updateStatus.current.number = number; }, number);
          await page.locator('.tx-open').click();
          await page.locator('#txDialog[open]').waitFor();
          assert.equal(await page.locator('#txAccept').isVisible(), number >= 2);
          assert.equal(await page.locator('#txRefuse').isVisible(), number >= 2);
          await page.keyboard.press('Escape');
        }
      }
    }
    state.landTxMax = 5;
    state.landTransactions = 5;
    for (const admin of [false, true]) {
      adminMode = admin;
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        await page.waitForSelector('#basicResourcesTable tr');
        await page.locator('.tab-btn[data-tab="commerce"]').click();
        assert.match(await page.locator('#tab-commerce').innerText(), /Transactions effectuées/);
        assert.match(await page.locator('#tradeLimitsTable').innerText(), /Effectuées.*Limite par mise à jour/s);
        const blocked = page.locator('.trade-action-blocked');
        await blocked.waitFor();
        assert.equal(await blocked.locator('button').isDisabled(), true);
        await blocked.scrollIntoViewIfNeeded();
        await blocked.hover();
        const tooltip = page.locator('.gestion-tooltip');
        await tooltip.waitFor({ state: 'visible' });
        assert.match(await tooltip.innerText(), /Quota terrestre atteint : 5\/5/);
        assert.match(await tooltip.innerText(), /prochaine mise à jour/);
        const box = await tooltip.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width);
        await page.screenshot({ path: path.join(output, `${admin ? 'admin' : 'joueur'}-${width}-commerce-quota.png`), fullPage: true });
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
          tradeAdjacency = { 1: [{ id: 2, distance: 1 }], 2: [{ id: 1, distance: 1 }] };
          baronyZones = { 1: [1], 2: [1] };
          seaZoneAdjacency = { 1: [] };
          maritimeZoneMapState = { 1: { id: 1, name: 'Mer commune' } };
          openTradeRouteDialog({ id: 2, name: 'Hautbois' });
        });
        assert.equal(await page.locator('#tradeRouteMethod').inputValue(), 'naval');
        assert.equal(await page.locator('#tradeRouteMethod option').count(), 1);
        await page.screenshot({ path: path.join(output, `${admin ? 'admin' : 'joueur'}-${width}-commerce-liaison-manquante.png`), fullPage: true });
        const goldBefore = await page.evaluate(() => gameState.inv.or_);
        await page.locator('#tradeRouteSave').click();
        await page.waitForFunction(gold => gameState.inv.or_ === gold - 3, goldBefore);
        assert.equal(lastBuildPayload.seigneurie_id, 1);
        assert.equal(lastBuildPayload.type, 'naval');
        assert.deepEqual(lastBuildPayload.path, [1]);
      }
    }
    assert.deepEqual(errors, []);
    console.log('UI vérifiée : sommaire à 4 largeurs ; 7 onglets en modes joueur et administrateur à 1440, 1024 et 390 px ; styles communs, champs admin, actions spéciales, sélection de seigneurie, magie et transactions. Aucun chevauchement, débordement de page ni erreur JavaScript.');
    console.log(`Captures : ${output}`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
