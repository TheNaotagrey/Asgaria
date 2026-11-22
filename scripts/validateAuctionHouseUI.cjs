// Pages réelles et service HV réel, base SQLite temporaire uniquement.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./fixtures/auctionDatabase.cjs');
const { createAuctionRouter } = require('../services/auctionHouseService');
const Rules = require('../src/auctionRules');
const { runSql, getSql, allSql } = require('../src/sqliteTransaction');
const output = path.resolve(process.env.UI_SCREENSHOT_DIR || 'output/auction-house-ui');

(async () => {
  const f = await fixture(); const app = express(); app.use(express.json());
  let admin = false, player = 2, held = null, hold = false;
  const errors = [], writes = [];
  app.use((req, res, next) => { req.session = { user: { id: player, is_admin: admin, act_as_admin: admin } }; next(); });
  app.use('/api/auction_house', (req, res, next) => {
    if (req.method === 'POST') writes.push({ path: req.path, body: req.body, selected: req.query.seigneurie_id });
    if (hold && req.method === 'GET') { held = next; return; }
    next();
  }, createAuctionRouter(f.dbPath, user => user.is_admin));
  app.use('/api', async (req, res) => {
    try {
      const p = Number(req.query.seigneurie_id || (admin ? 1 : player));
      if (req.path === '/me') return res.json({ id: player, first_name: 'Validation', is_admin: admin, act_as_admin: admin });
      if (req.path === '/test_mode') return res.json({ enabled: false });
      if (req.path === '/my_seigneurie') return res.json(await f.sql(async db => {
        const row = await getSql(db, 'SELECT * FROM seigneuries WHERE id=?', [p]);
        const inventory = await getSql(db, 'SELECT * FROM inventaire WHERE id=?', [row.inventaire_id]);
        const bp = await allSql(db, 'SELECT * FROM building_properties'), ip = await allSql(db, 'SELECT * FROM infrastructure_properties');
        return { seigneurie: row, seigneur: { name: ['Alice','Benoît','Claire'][p-1], player_name: 'Propriétaire de validation' },
          inventaire: inventory, buildings: JSON.parse(row.buildings), infrastructures: JSON.parse(row.infrastructures), barony: {},
          employment: { employed: 0, slaves: inventory.esclaves }, capacities: { vivres: 500 }, production: {},
          unlockedPages: { hotel_des_ventes: Rules.calculateRules(row, bp, ip).unlocked } };
      }));
      const tables = { '/building_properties': 'building_properties', '/infrastructure_properties': 'infrastructure_properties', '/seigneurs': 'seigneurs', '/seigneuries': 'seigneuries' };
      if (tables[req.path]) return res.json(await f.sql(db => allSql(db, `SELECT * FROM ${tables[req.path]}`)));
      if (/^\/(building_properties|infrastructure_properties)\/\d+$/.test(req.path) && req.method === 'PUT') {
        Rules.validateEffects(req.body.effects);
        const parts = req.path.split('/');
        await f.sql(db => runSql(db, `UPDATE ${parts[1]} SET effects=? WHERE id=?`, [req.body.effects, Number(parts[2])]));
        return res.json({ changes: 1 });
      }
      return res.json([]);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.use(express.static(path.resolve(__dirname, '..')));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try { browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_PATH ? { executablePath: process.env.UI_BROWSER_PATH } : {}) }); }
  catch (error) { await new Promise(resolve => server.close(resolve)); f.cleanup(); throw error; }
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const mode of [false,true]) for (const width of [1440,390]) {
      admin = mode; player = mode ? 1 : 2;
      await f.sql(async db => {
        await runSql(db, 'DELETE FROM auction_events'); await runSql(db, 'DELETE FROM auction_offers');
        await runSql(db, "UPDATE players SET land_transactions=0,naval_transactions=0,infrastructures='{\"1\":{\"built\":1}}'");
        await runSql(db, 'UPDATE inventaire SET or_=1000,fer=1000,vivres=100');
        await runSql(db, 'INSERT OR REPLACE INTO building_properties (id,label,effects) VALUES (2,?,?)', ['Banque commerciale', '[{"type":"auction_commission_discount","amount":2},{"type":"auction_duration_bonus","amount":3},{"type":"auction_max_offers_bonus","amount":1}]']);
        await runSql(db, 'UPDATE players SET buildings=?', ['{"2":{"built":1,"active":1}}']);
      });
      const offered = await f.deposit();
      const future = await f.sql(db => runSql(db, `INSERT INTO auction_offers
        (seller_id,resource,amount,prices_json,update_year,update_number,request_key,request_json)
        VALUES (3,'fer',75,'[{"resource":"or_","amount":100}]',1026,10,'future-ui','{}')`));
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**', route => route.abort());
      await page.addInitScript(() => {
        localStorage.setItem('gestionActiveTab', 'hotel_des_ventes');
        const interval = window.setInterval;
        window.setInterval = (callback, delay, ...args) => {
          if (delay === 15000 && String(callback).includes('panel.classList')) window.auctionPoll = callback;
          return interval(callback, delay, ...args);
        };
      });
      await page.goto(base + '/gestion.html');
      try { await page.waitForSelector('#auctionHouse h2'); }
      catch (error) {
        await page.screenshot({ path: path.join(output, 'diagnostic.png'), fullPage: true });
        console.error({ mode, width, errors, auction: await page.locator('#auctionHouse').innerText(), body: (await page.locator('body').innerText()).slice(0, 700) });
        throw error;
      }
      const futureRow = page.locator(`#auctionTable tr[data-id="${future.lastID}"]`);
      await futureRow.waitFor();
      assert.equal(await futureRow.getByRole('button', {name:'Acheter',exact:true}).isDisabled(),true);
      assert.match(await futureRow.getByRole('button', {name:'Acheter',exact:true}).getAttribute('title'), /Mise à jour requise/);
      assert.doesNotMatch(await futureRow.innerText(), /Mise à jour requise/);
      assert.equal(await page.locator('.auction-dialog').count(),0);
      await futureRow.scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,`${mode?'admin':'joueur'}-${width}-offre-bloquee.png`),fullPage:true});
      await f.sql(db => runSql(db,'UPDATE players SET update_number=10 WHERE id=?',[player]));
      await page.getByRole('button',{name:'Actualiser',exact:true}).click();
      await page.waitForFunction(id => !document.querySelector(`#auctionTable tr[data-id="${id}"] button`)?.disabled,future.lastID);
      assert.equal(await futureRow.getByRole('button', {name:'Acheter',exact:true}).isEnabled(),true);
      await page.screenshot({path:path.join(output,`${mode?'admin':'joueur'}-${width}-offre-debloquee.png`),fullPage:true});
      await f.sql(async db => {
        await runSql(db,'UPDATE players SET update_number=9 WHERE id=?',[player]);
        await runSql(db,'DELETE FROM auction_offers WHERE id=?',[future.lastID]);
      });
      await page.getByRole('button',{name:'Actualiser',exact:true}).click();
      await futureRow.waitFor({state:'detached'});
      if (mode) {
        await page.waitForFunction(() => document.querySelector('#auctionMineTable')?.textContent.includes('Retirer'));
      }
      assert.equal(await page.locator('.auction-navigation').count(),0);
      const titles=await page.locator('.auction-section-title').allTextContents();
      assert.deepEqual(titles,['Mes offres','Offres disponibles']);
      const headings=await page.locator(mode?'#auctionMineTable th':'#auctionTable th').allTextContents();
      assert.ok(headings.includes('Prix 1') && headings.includes('Prix 2'));
      await page.screenshot({ path: path.join(output, `${mode ? 'admin' : 'joueur'}-${width}-apercu.png`), fullPage: true });
      await page.locator('#auctionDeposit summary').click();
      const form = page.locator('#auctionDepositForm');
      await form.locator('[name="resource"]').selectOption('fer');
      await form.locator('[name="amount"]').fill('10');
      await form.locator('[name="price_amount"]').fill('100');
      await form.locator('[name="second_resource"]').selectOption('fer');
      await form.locator('[name="second_amount"]').fill('10');
      await form.locator('[name="transport"]').selectOption('naval');
      // Background refresh must leave the DOM untouched when data is unchanged.
      await page.evaluate(async () => {
        document.querySelector('.auction-rules').open = true;
        const root = document.querySelector('#auctionHouse');
        const nodes = Array.from(root.childNodes);
        const input = document.querySelector('#auctionDepositForm [name="amount"]');
        input.focus();
        const top = document.scrollingElement.scrollTop;
        await window.auctionPoll();
        if (nodes.some((node, i) => root.childNodes[i] !== node)) throw new Error('Rendu inutile pendant le rafraîchissement');
        if (document.scrollingElement.scrollTop !== top) throw new Error('Défilement déplacé');
        window.auctionDraftInput = input;
      });
      // A real change updates figures while keeping the draft, focus and panels.
      await f.sql(db => runSql(db, 'UPDATE inventaire SET fer=1001 WHERE id=?', [player]));
      await page.evaluate(async () => {
        const top = document.scrollingElement.scrollTop;
        await window.auctionPoll();
        const input = document.querySelector('#auctionDepositForm [name="amount"]');
        if (input !== window.auctionDraftInput || input.value !== '10' || document.activeElement !== input) throw new Error('Brouillon ou focus perdu');
        if (!document.querySelector('#auctionDeposit').open || !document.querySelector('.auction-rules').open) throw new Error('Panneau refermé');
        if (document.scrollingElement.scrollTop !== top) throw new Error('Défilement déplacé après mise à jour');
      });
      assert.match(await page.locator('#auctionDepositPreview').innerText(), /1[\s\u00a0\u202f]?001/);
      await page.screenshot({path:path.join(output,`${mode?'admin':'joueur'}-${width}-actualisation-stable.png`),fullPage:true});
      assert.ok((await page.locator('#auctionDepositPreview').innerText()).includes('97'));
      assert.ok((await page.locator('#auctionDepositPreview').innerText()).includes('Second prix net actuel : 9'));
      assert.equal(await page.locator('#auctionCommission').innerText(), '3 %');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, `${mode ? 'admin' : 'joueur'}-${width}-offres.png`), fullPage: true });
      await page.locator(mode ? '#auctionMineTable' : '#auctionTable').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${mode ? 'admin' : 'joueur'}-${width}-tableau.png`), fullPage: true });
      const beforeWrites = writes.length;
      await form.getByRole('button', { name: 'Déposer le lot' }).click();
      await page.waitForFunction(() => !!document.querySelector('#auctionOfferCount'));
      await page.waitForFunction(() => !document.querySelector('#auctionDeposit')?.open);
      assert.equal(writes.length, beforeWrites + 1);
      assert.equal(writes[writes.length - 1].selected, mode ? '1' : undefined);
      if (!mode) {
        await page.getByRole('button', { name: 'Acheter', exact: true }).first().click();
        await page.locator('.auction-dialog [name="transport"]').selectOption('land');
        await page.screenshot({ path: path.join(output, `joueur-${width}-achat.png`), fullPage: true });
        await page.getByRole('button', { name: 'Confirmer l’achat' }).click();
        await page.waitForFunction(() => !document.querySelector('.auction-dialog') && document.querySelector('#auctionHouse')?.textContent.includes('Aucune offre disponible'));
        await f.sql(async db => assert.equal((await getSql(db, 'SELECT state FROM auction_offers WHERE id=?', [offered.offer.id])).state, 'sold'));
      } else {
        await page.waitForSelector('#auctionMineTable');
        await page.getByRole('button', { name: 'Retirer', exact: true }).first().click();
        await page.screenshot({ path: path.join(output, `admin-${width}-retrait.png`), fullPage: true });
        await page.getByRole('button', { name: 'Confirmer le retrait' }).click();
        await page.waitForFunction(() => document.querySelector('#auctionOfferCount')?.textContent === '1/6');
        await f.sql(db => runSql(db, "UPDATE players SET infrastructures='{}' WHERE id=1"));
        await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#auctionHouse')?.textContent.includes('Accès limité'));
        assert.equal(await page.locator('#auctionDepositForm').count(), 0);
      }
      await page.locator('#auctionHouse details > summary').filter({hasText:'Historique'}).click();
      await page.waitForFunction(() => document.querySelector('#auctionHistoryTable')?.textContent.includes('Dépôt'));
      await page.screenshot({ path: path.join(output, `${mode ? 'admin' : 'joueur'}-${width}-historique.png`), fullPage: true });
      if (mode) {
        hold = true; held = null;
        await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
        while (!held) await new Promise(resolve => setTimeout(resolve, 10));
        const release = held; hold = false;
        await page.locator('[data-tab="sommaire"]').click();
        await page.locator('#adminSeigneurieSelect select').selectOption('3');
        await page.waitForFunction(() => document.querySelector('#auctionOfferCount')?.textContent === '0/6');
        release();
        await page.waitForTimeout(100);
        assert.ok(!(await page.locator('#auctionHouse').innerText()).includes('Retirée'));
      }
      await page.close();
    }
    admin = true; player = 1;
    for (const width of [1440,390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**', route => route.abort());
      await page.goto(base + '/admin.html');
      await page.locator('[data-tab="batiments"]').click();
      await page.waitForSelector('#tableBuildingProps .effect-row');
      const effects = page.locator('#tableBuildingProps .effect-row select[data-role="type"]').first();
      for (const type of Object.keys(Rules.effectLabels)) assert.equal(await effects.locator(`option[value="${type}"]`).count(), 1);
      assert.equal(await effects.locator('option[value="tag"]').count(), 1);
      assert.equal(await effects.locator('option[value="unlock_page"]').count(), 1);
      await effects.selectOption('auction_commission_discount');
      const amount = page.locator('#tableBuildingProps .effect-row input[data-role="qty"]').first();
      await amount.fill('2.5'); await amount.dispatchEvent('change');
      const serialized = await page.evaluate(() => document.querySelector('#tableBuildingProps .effect-row').parentElement.parentElement.getValue());
      assert.equal(JSON.parse(serialized)[0].amount, 2.5);
      await page.locator('#tableBuildingProps tbody tr').first().getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#saveIndicator').style.display === 'block');
      await f.sql(async db => assert.equal(JSON.parse((await getSql(db, 'SELECT effects FROM building_properties WHERE id=2')).effects)[0].amount, 2.5));
      const infraTypes = page.locator('#tableInfraProps .effect-row select[data-role="type"]').first();
      for (const type of Object.keys(Rules.effectLabels)) assert.equal(await infraTypes.locator(`option[value="${type}"]`).count(), 1);
      await effects.scrollIntoViewIfNeeded();
      assert.ok(await effects.evaluate(node => node.getBoundingClientRect().width >= 260));
      await page.screenshot({ path: path.join(output, `effets-admin-${width}.png`), fullPage: true });
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('HV : joueur et administrateur, ordinateur/mobile, dépôt/achat/retrait, historique, effets administratifs et réponses périmées validés.');
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve)); f.cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
