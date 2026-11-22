// Pages réelles et activation réelle, SQLite temporaire uniquement.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./fixtures/auctionDatabase.cjs');
const sqlite3 = require('sqlite3');
const { migrateConstructionTypes } = require('../src/constructionTypeMigration');
const { migrateConstructionCatalog } = require('../src/constructionCatalogMigration');
const { buildingFields, validateBuildingDefinition } = require('../services/buildingCatalogService');
const { crudRoutes } = require('../src/crudRouter');
const { getSql, allSql, runSql } = require('../src/sqliteTransaction');
const { calculateProjection } = require('../src/seigneurieProjection');
const { changeBuildingState } = require('../services/buildingStateService');
const output = path.resolve(process.env.UI_SCREENSHOT_DIR || 'output/gestion-actions-ui');

(async () => {
  const f = await fixture();
  await f.sql(async db => {
    await runSql(db, "UPDATE seigneuries_info SET baronnie_id=1 WHERE player_id=1");
    await runSql(db, "INSERT INTO building_properties (id,label,workers_per_building,produces,production,effects) VALUES (1,'Poste de Traite',20,'or_',40,'[]')");
    await runSql(db, "UPDATE infrastructure_properties SET workers_per_building=101,type='commercial'");
    await runSql(db, 'UPDATE inventaire SET esclaves=0,rhum=41');
    await runSql(db, 'ALTER TABLE building_properties ADD COLUMN costs TEXT');
    await runSql(db, 'ALTER TABLE infrastructure_properties ADD COLUMN costs TEXT');
    await runSql(db, 'UPDATE building_properties SET costs=?', [JSON.stringify({ rhum: 80, pierre: 25, fer: 1000 })]);
    await runSql(db, 'UPDATE infrastructure_properties SET costs=?', [JSON.stringify({ rhum: 80, pierre: 25, fer: 1000 })]);
  });
  await migrateConstructionTypes(f.dbPath);
  await migrateConstructionCatalog(f.dbPath);
  await f.sql(async db => {
    await runSql(db, "INSERT INTO building_properties(id,label,player_type,workers_per_building) VALUES(990,'Champ épiscopal','eveque',3.333333)");
    await runSql(db, "INSERT INTO infrastructure_properties(id,label,type,player_type,pirate_site) VALUES(991,'Repaire pirate','commercial','pirate','repaire')");
    await runSql(db, "INSERT INTO building_properties(id,label,player_type,workers_per_building) VALUES(992,'Production pirate existante','pirate',1)");
    await runSql(db, `INSERT INTO building_properties(player_type,label,costs,rank_costs,location,production_costs,produces,production,effects)
      VALUES('pirate','Pêcheur','{}','[]','repaire_ou_navire','{}','vivres',20,'[]')`);
  });
  await migrateConstructionCatalog(f.dbPath);
  const specialistWrites = [];
  let bishop = false;
  let admin = false, failActivation = false, disconnected = false;
  const writes = [], errors = [], dialogs = [];
  const app = express(); app.use(express.json());
  const catalogDb = new sqlite3.Database(f.dbPath);
  const adminActive = user => Boolean(user?.is_admin);
  app.set('db', catalogDb);
  app.set('validTables', new Set(['building_properties']));
  app.set('authTables', new Set(['building_properties']));
  app.set('isAdminActive', adminActive);
  app.use('/api/building_properties', (req, res, next) => {
    req.session = { user: { id: 1, is_admin: admin } };
    if (req.method === 'POST') specialistWrites.push(req.body);
    if (req.method !== 'GET' && !admin) return res.status(403).json({ error: 'Accès interdit' });
    next();
  }, validateBuildingDefinition(catalogDb), crudRoutes('building_properties', buildingFields));

  app.use('/api', async (req, res) => {
    try {
      if (req.path === '/me') return res.json({ id: 1, first_name: 'Validation', is_admin: admin, act_as_admin: admin });
      if (req.path === '/seigneurie/influence/link_influence') return res.json({ influence: [{ id: 1, name: 'Monts', amount: 2, available: 10 }] });
      if (req.path === '/test_mode') return res.json({ enabled: false });
      if (req.path === '/building/activate') {
        writes.push(req.body);
        if (failActivation) return res.status(400).json({ error: 'Activation temporairement refusée pour la validation.' });
        return res.json(await changeBuildingState({ dbPath: f.dbPath, actor: { id: 1, isAdminActive: admin }, playerId: req.body.seigneurie_id, buildingId: Number(req.body.id), quantity: Number(req.body.quantity), action: 'activate' }));
      }
      if (req.path === '/my_seigneurie') return res.json(await f.sql(async db => {
        const basePlayer = await getSql(db, 'SELECT * FROM seigneuries WHERE id=1');
        const player = bishop ? { ...basePlayer, type: 'eveque', population: 10, buildings: '{}', infrastructures: '{}' } : basePlayer;
        const inventory = await getSql(db, 'SELECT * FROM inventaire WHERE id=1');
        const bp = await allSql(db, 'SELECT * FROM building_properties');
        const ip = await allSql(db, 'SELECT * FROM infrastructure_properties');
        const projection = calculateProjection({ player, inventory, buildingProperties: bp, infrastructureProperties: ip });
        return { ...projection, seigneurie: player, inventaire: inventory, buildings: JSON.parse(player.buildings), infrastructures: JSON.parse(player.infrastructures), seigneur: { name: 'Thalion', player_name: 'Propriétaire de validation' }, barony: { id: 1, name: 'Valmont' }, baronyProps: {} };
      }));
      if (req.path === '/building_properties') return res.json(await f.sql(db => allSql(db, 'SELECT * FROM building_properties')));
      if (req.path === '/infrastructure_properties') return res.json(await f.sql(db => allSql(db, 'SELECT * FROM infrastructure_properties')));
      if (req.path === '/seigneuries') return res.json([{ id: 1, seigneur_id: 1, baronnie_id: 1 }]);
      if (req.path === '/seigneurs') return res.json([{ id: 1, name: 'Thalion', user_id: 1 }, { id: 2, name: 'Voisin', user_id: 2 }]);
      if (req.path === '/baronies') return res.json([{ id: 1, name: 'Valmont', seigneur_id: 1 }, { id: 2, name: 'Hautbois', seigneur_id: 2 },{id:3,name:'Carrefour',seigneur_id:null}]);
      if (req.path === '/barony_connections') return res.json(disconnected ? [] : [{ barony_id_1: 1, barony_id_2: 2, distance: 2 }]);
      if (req.path === '/barony_pixels') {
        const tile=(x,y)=>Array.from({length:10000},(_,i)=>[x+i%100,y+Math.floor(i/100)]);
        return res.json({'1':tile(100,100),'2':tile(500,220),'3':tile(320,150)});
      }
      if (req.path === '/maritime_zone_pixels') return res.json({});
      if (req.path === '/messaging/conversations') return res.json({ user_id: 1, can_send: true, conversations: [] });
      if (req.path === '/messaging/recipients') return res.json({ recipients: [] });
      res.json([]);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.use(express.static(path.resolve(__dirname, '..')));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.UI_BROWSER_PATH });
  fs.mkdirSync(output, { recursive: true });
  const url = `http://127.0.0.1:${server.address().port}/gestion.html`;
  try {
    for (const mode of [false, true]) for (const width of [1440,390]) {
      admin = mode; disconnected = false; failActivation = false; writes.length = 0;
      await f.sql(db => runSql(db, "UPDATE players SET buildings='{\"1\":{\"built\":1,\"active\":1}}',infrastructures='{}' WHERE id=1"));
      const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width === 390 });
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
      await page.route('https://**', route => route.abort());
      await page.route('**/Asgaria.png', route => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#d4dec5"/></svg>'}));
      await page.addInitScript(() => localStorage.setItem('gestionActiveTab', 'infra'));
      await page.goto(url); await page.waitForSelector('.activate-input');
      assert.doesNotMatch(await page.locator('#buildingsTable').innerText(), /Champ épiscopal/);
      const buildingCost = page.locator('#buildingsTable .construction-cost-missing').filter({ hasText: 'Rhum: 80' });
      assert.equal(await buildingCost.getAttribute('aria-label'), '41 rhums en stock');
      assert.equal(await page.locator('#buildingsTable .construction-cost-missing').count(), 2);
      if (width === 390) await buildingCost.tap(); else await buildingCost.hover();
      await page.waitForSelector('.gestion-tooltip:not([hidden])');
      assert.equal(await page.locator('.gestion-tooltip').innerText(), '41 rhums en stock');
      await page.screenshot({ path: path.join(output, `${mode?'admin':'joueur'}-${width}-cout-batiment.png`), fullPage: true });
      await page.keyboard.press('Escape');
      const field = page.locator('.activate-input[data-id="1"]');
      await field.fill('0');
      // Une saisie encore focalisée ne constitue pas une action enregistrée.
      assert.equal(writes.length, 0);
      await page.locator('.activate-save-btn').click();
      await page.waitForFunction(() => document.querySelector('.activate-input')?.value === '0' && !document.querySelector('.activate-input').disabled);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].quantity, 0);
      assert.equal(await f.sql(async db => JSON.parse((await getSql(db, 'SELECT buildings FROM players WHERE id=1')).buildings)['1'].active), 0);
      assert.equal(await page.locator('#buildingsTable tr[data-id="1"] td').nth(8).innerText(), '0');
      await page.reload(); await page.waitForSelector('.activate-input');
      assert.equal(await field.inputValue(), '0');
      await f.sql(db => runSql(db, 'UPDATE inventaire SET rhum=79 WHERE id=1'));
      await page.reload(); await page.waitForSelector('.activate-input');
      assert.equal(await buildingCost.getAttribute('aria-label'), '79 rhums en stock');
      await buildingCost.focus();
      assert.equal(await page.locator('.gestion-tooltip').innerText(), '79 rhums en stock');
      await page.keyboard.press('Escape');
      await f.sql(db => runSql(db, 'UPDATE inventaire SET rhum=80 WHERE id=1'));
      await page.reload(); await page.waitForSelector('.activate-input');
      assert.equal(await buildingCost.count(), 0);
      await f.sql(db => runSql(db, 'UPDATE inventaire SET rhum=41 WHERE id=1'));
      await page.reload(); await page.waitForSelector('.activate-input');
      failActivation = true;
      await field.fill('1'); await page.locator('.activate-save-btn').click();
      await page.waitForFunction(() => document.querySelector('.activate-input')?.value === '0' && !document.querySelector('.activate-input').disabled);
      failActivation = false;
      await field.fill('1'); await page.locator('.activate-save-btn').click();
      await page.waitForFunction(() => document.querySelector('#buildingsTable tr[data-id="1"] td:nth-child(9)')?.textContent === '20');
      await page.screenshot({ path: path.join(output, `${mode?'admin':'joueur'}-${width}-activation.png`), fullPage: true });
      await page.locator('.tab-btn[data-tab="commerce"]').click();
      const market = page.locator('#commercialInfraTable tr[data-id="1"]');
      assert.equal(await market.locator('.infra-build-btn').isDisabled(), true);
      assert.doesNotMatch(await market.innerText(), /Travailleurs insuffisants/);
      const infraCost = market.locator('.construction-cost-missing').filter({ hasText: 'Rhum: 80' });
      if (width === 390) await infraCost.tap(); else await infraCost.hover();
      await page.waitForSelector('.gestion-tooltip:not([hidden])');
      assert.equal(await page.locator('.gestion-tooltip').innerText(), '41 rhums en stock');
      assert.doesNotMatch(await page.locator('#commercialInfraTable').innerText(), /Repaire pirate/);
      await page.screenshot({ path: path.join(output, `${mode?'admin':'joueur'}-${width}-cout-infrastructure.png`), fullPage: true });
      await page.keyboard.press('Escape');
      const blocked = market.locator('.construction-blocked');
      await blocked.scrollIntoViewIfNeeded();
      await blocked.hover();
      await page.waitForSelector('.gestion-tooltip:not([hidden])');
      assert.match(await page.locator('.gestion-tooltip').innerText(), /Travailleurs insuffisants/);
      assert.match(await page.locator('#tradeRoutes').innerText(), /Voisin/);
      assert.equal(await market.locator('.infra-workers').innerText(), '101');
      const neighbor = page.locator('#tradeRoutes .trade-link-row');
      await neighbor.hover();
      const canvas=page.locator('#tradeCanvas');
      await canvas.scrollIntoViewIfNeeded();
      const bounds=await canvas.boundingBox();
      await page.mouse.move(bounds.x+bounds.width*550/800,bounds.y+bounds.height*270/400);
      await page.waitForFunction(() => document.getElementById('tradePreviewCaption')?.textContent.includes('Hautbois'));
      await page.screenshot({path:path.join(output,`${mode?'admin':'joueur'}-${width}-survol-carte.png`),fullPage:true});
      const crossing = await page.evaluate(() => {
        const ctx=document.getElementById('tradeCanvas').getContext('2d');
        const sample=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
        setTradePreview(null);
        const endpoints=[sample(150,150),sample(550,270)];
        const first={id:101,type:'land',barony_id_1:1,barony_id_2:2,partner_id:2,path:[3]};
        setTradePreview(first); const single=sample(350,180);
        setTradePreview([first,{...first,id:102}]);
        return {endpoints,after:[sample(150,150),sample(550,270)],single,crossed:sample(350,180)};
      });
      assert.deepEqual(crossing.after,crossing.endpoints);
      assert.ok(crossing.crossed[3]>crossing.single[3]);
      assert.notDeepEqual(crossing.crossed.slice(0,3),crossing.single.slice(0,3));
      await page.screenshot({path:path.join(output,`${mode?'admin':'joueur'}-${width}-croisement.png`),fullPage:true});
      await neighbor.hover();
      assert.match(await page.locator('#tradePreviewCaption').innerText(), /Valmont.*Hautbois/);
      await page.screenshot({ path: path.join(output, `${mode?'admin':'joueur'}-${width}-marche.png`), fullPage: true });
      await page.locator('#newTradeRouteBtn').click();
      await page.waitForSelector('#tradeDestinationDialog[open]');
      assert.match(await page.locator('#tradeDestinationSelect').innerText(), /Hautbois.*Voisin/);
      await page.screenshot({ path: path.join(output, `${mode?'admin':'joueur'}-${width}-destination.png`), fullPage: true });
      await page.locator('#tradeDestinationContinue').click();
      await page.waitForSelector('#tradeRouteDialog[open]');
      await page.waitForSelector('#tradeRouteHint .trade-cost-card');
      assert.match(await page.locator('#tradeRouteHint').innerText(), /2 segments terrestres/);
      assert.equal(await page.locator('#tradeRouteHint dl > div').first().innerText(), 'Or\n6');
      assert.equal(await page.locator('#tradeRouteSave').isDisabled(), false);
      await page.screenshot({ path: path.join(output, `${mode?'admin':'joueur'}-${width}-trajet.png`), fullPage: true });
      await page.locator('#tradeRouteCancel').click();
      disconnected = true;
      await page.reload(); await page.waitForSelector('.activate-input');
      await page.locator('.tab-btn[data-tab="commerce"]').click();
      await page.locator('#newTradeRouteBtn').click();
      await page.waitForFunction(() => document.getElementById('tradeCreationStatus').textContent.includes('Aucune nouvelle destination accessible'));
      bishop = true;
      await page.locator('.tab-btn[data-tab="infra"]').click();
      await page.reload();
      const bishopField = page.locator('#buildingsTable tr[data-id="990"]');
      await bishopField.waitFor();
      assert.match(await page.locator('#buildingsTable th').allTextContents().then(labels => labels.join(' ')), /Moines par exemplaire/);
      assert.equal(await bishopField.locator('td').nth(5).innerText(), '3');
      await page.screenshot({ path: path.join(output, `gestion-eveque-${mode ? 'admin' : 'joueur'}-${width}.png`), fullPage: true });
      bishop = false;
      await page.close();
    }
    admin = true;
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width === 390 });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**', route => route.abort());
      await page.goto(new URL('/admin.html', url).href);
      await page.locator('.tab-btn[data-tab="batiments"]').click();
      const tabs = page.locator('#constructionTypes');
      await tabs.getByRole('button', { name: 'Seigneur', exact: true }).waitFor();
      assert.deepEqual(await tabs.getByRole('button').allTextContents(), ['Seigneur', 'Évêque', 'Pirate', 'Mercenaire']);
      const buildings = page.locator('#tableBuildingProps');
      const infrastructures = page.locator('#tableInfraProps');
      const hasLabel = (table, label) => table.locator('input').evaluateAll((inputs, value) =>
        inputs.some(input => input.value === value), label);
      assert.equal(await hasLabel(buildings, 'Poste de Traite'), true);
      await tabs.getByRole('button', { name: 'Évêque' }).click();
      assert.equal(await hasLabel(buildings, 'Champ épiscopal'), true);
      assert.equal(await hasLabel(buildings, 'Poste de Traite'), false);
      assert.match(await buildings.locator('thead').innerText(), /Moines par exemplaire/);
      await page.screenshot({ path: path.join(output, `administration-${width}-eveque.png`), fullPage: true });
      assert.equal(await buildings.locator('thead th[data-key^="available_"]').count(), 0);
      await tabs.getByRole('button', { name: 'Pirate' }).click();
      assert.equal(await hasLabel(infrastructures, 'Repaire pirate'), true);
      assert.equal(await infrastructures.locator('tbody tr').last().locator('input[type="checkbox"]').isChecked(), true);
      assert.equal(await page.locator('#constructionProductionTitle').innerText(), 'Spécialistes pirates');
      assert.equal(await hasLabel(buildings, 'Production pirate existante'), true);
      assert.equal(await hasLabel(buildings, 'Pêcheur'), true);
      assert.equal(await page.locator('#constructionLegacyToggle').count(), 0);
      assert.equal(await page.locator('#tab-batiments table').count(), 2);
      await page.screenshot({ path: path.join(output, `administration-${width}-catalogues.png`), fullPage: true });
      await tabs.getByRole('button', { name: 'Mercenaire' }).click();
      assert.equal(await hasLabel(infrastructures, 'Repaire pirate'), false);
      assert.equal(await infrastructures.isVisible(), false);
      assert.equal(await page.locator('#constructionProductionTitle').innerText(), 'Experts mercenaires');
      assert.equal(await page.locator('#tab-batiments table').count(), 1);
      const specialists = buildings;
      const addRow = specialists.locator('tbody tr').last();
      await addRow.locator('input').first().fill('Trésorier');
      const maximum = addRow.locator('td').nth(3);
      await maximum.locator('select').first().selectOption('custom');
      await maximum.getByRole('spinbutton', { name: 'Valeur du maximum' }).fill('35');
      for (const price of [12, 15, 25]) {
        await addRow.getByRole('button', { name: 'Ajouter un rang' }).click();
        const rank = addRow.locator('ol li').last();
        await rank.locator('select').selectOption('or_');
        await rank.locator('input[type="number"]').fill(String(price));
      }
      await page.screenshot({ path: path.join(output, `administration-${width}-mercenaire.png`), fullPage: true });
      const saved = page.waitForResponse(res => res.url().endsWith('/api/building_properties') && res.request().method() === 'POST');
      await addRow.getByRole('button', { name: 'Ajouter', exact: true }).click();
            const result = await saved;
      assert.equal(result.status(), 200, await result.text());
      assert.equal(specialistWrites.at(-1).player_type, 'mercenaire');
      assert.equal('category' in specialistWrites.at(-1), false);
      assert.equal('legacy_id' in specialistWrites.at(-1), false);
      assert.equal(specialistWrites.at(-1).max, '35');
      assert.deepEqual(JSON.parse(specialistWrites.at(-1).rank_costs), [{ or_: 12 }, { or_: 15 }, { or_: 25 }]);
      await page.close();
    }
    assert.deepEqual(errors, []);
    assert.ok(dialogs.some(text => text.includes('temporairement refusée')));
    console.log('Gestion : emploi du marché, activation persistante/rollback visible et destinations sans route existante validés en joueur/admin et ordinateur/mobile.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => catalogDb.close(resolve));
    f.cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
