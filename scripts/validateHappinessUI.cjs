// Real UI, isolated API fixtures: no writes to the game database.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { festivalQuote, revoltRisk, revoltLosses, calculateIDH } = require('../src/happinessRules');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.UI_SCREENSHOT_DIR || 'output/happiness-ui');
const app = express(); app.use(express.json());
let state, admin = false, lastPayload, failFestival = false;
let releaseTax, lastTaxPayload, rejectTax = false;
let infraDefinition, lastInfraPayload;
function reset(protectedPlayer = false) {
  state = { seigneurie: { id: 1, type: 'seigneur', seigneur_id: 1, population: 300, tax_rate: 8, beginner_protection: protectedPlayer ? 1 : 0 },
    seigneur: { name: 'Aëlor', player_name: 'Propriétaire elfe', religion_id: 1 }, barony: { id: 1, name: 'Lunepierre', religion_pop_id: 1 },
    inventaire: { or_: 100, vivres: 5000, rhum: 20, fourrure: 2, huile: 2, epices: 2,
      pierre: 300, fer: 150, lingot_or: 15, antidote: 9, armureries: 40, grague: 25,
      ivoire: 15, soie: 15, teinture: 15, sel: 15, perle: 15, encens: 15, vin: 15, pierre_precieuse: 15 },
    buildings: {}, infrastructures: {}, employment: { employed: 0, slaves: 0 }, production: { or_: 24, vivres: -4500 }, capacities: { vivres: 5000 },
    idh: 2, idhDetails: [{ label: 'Base', amount: 5 }, { label: 'Taxes', amount: -3 }],
    updateStatus: { current: { year: 1026, number: 1 }, next: { year: 1026, number: 2 }, canAdvance: true, blockers: [] } };
  preview();
}
function preview() {
  const risk = revoltRisk(state.idh, state.seigneurie);
  state.revoltPreview = { ...risk, festivalBonus: state.festival?.bonus || 0,
    possibleLosses: revoltLosses(risk, state.seigneurie.population, state.inventaire, {}, []) };
}
const report = { id: 7, current_update_label: 'Mars 1026', before: { population: 300, inventory: { or_: 100 } },
  after: { population: 282, inventory: { or_: 60 } }, delta: { population: -18, inventory: { or_: -40 } },
  events: [{ title: 'Révolte', details: 'IDH 2. 45% de risque, tirage 12/100 : 18 habitants morts. 40% des ressources volées. Infrastructures détruites : Forge.' }] };
app.use('/api', (req, res) => {
  if (req.path === '/tax_rate') {
    lastTaxPayload = req.body;
    releaseTax = () => {
      if (rejectTax) return res.status(400).json({ error: 'Taxe refusée pour ce test.' });
      state.seigneurie.tax_rate = req.body.tax_rate;
      state.idh = calculateIDH({ player: state.seigneurie, lord: state.seigneur, barony: state.barony,
        inventory: state.inventaire, festivalBonus: state.festival?.bonus || 0 }).idh;
      state.production.or_ = Math.floor(state.seigneurie.population * req.body.tax_rate / 100);
      preview(); res.json({ tax_rate: req.body.tax_rate });
    };
    return;
  }
  if (req.path === '/me') return res.json({ id: 99, first_name: 'Administrateur', is_admin: admin, act_as_admin: admin });
  if (req.path === '/test_mode') return res.json({ enabled: false });
  if (req.path === '/admin/update_policy') return res.json({ blocked: false, limitEnabled: false, limit: { year: 1026, number: 1 } });
  if (req.path === '/infrastructure_properties') return res.json(infraDefinition ? [infraDefinition] : []);
  if (req.path === '/infrastructure_properties/3' && req.method === 'PUT') {
    lastInfraPayload = req.body;
    Object.assign(infraDefinition, req.body);
    return res.json({ changes: 1 });
  }
  if (req.path === '/my_seigneurie') return res.json(state);
  if (req.path === '/seigneurie/festival') {
    lastPayload = req.body;
    if (failFestival) return res.status(400).json({ error: 'Ressources insuffisantes : or.' });
    state.festival = festivalQuote(req.body.resources, state.seigneurie.population);
    Object.entries(req.body.resources).forEach(([key, value]) => state.inventaire[key] -= value);
    state.idh += state.festival.bonus; preview();
    return res.json({ ok: true, festival: state.festival });
  }
  if (req.path === '/seigneurie/advance_update') {
    const protectedByFestival = Boolean(state.festival);
    delete state.festival; state.idh = 2; preview();
    return res.json({ ok: true, report: protectedByFestival ? { ...report, before: {}, after: {}, delta: {}, events: [
      { title: 'Fête populaire', details: 'Bonus de +3 IDH utilisé, puis expiré.' },
      { title: 'Révolte : aucune', details: 'IDH 5. Aucun risque de révolte.' }
    ] } : report });
  }
  if (req.path === '/seigneurie/update_reports/7') return res.json(report);
  if (req.path === '/seigneuries') return res.json([{ id: 1, seigneur_id: 1, baronnie_id: 1 }]);
  if (req.path === '/seigneurs') return res.json([{ id: 1, name: 'Aëlor', player: 1 }]);
  if (req.path === '/baronies') return res.json([{ id: 1, name: 'Lunepierre' }]);
  res.json([]);
});
app.use(express.static(root));
(async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_PATH ? { executablePath: process.env.UI_BROWSER_PATH } : {}) });
  const errors = [];
  try {
    fs.mkdirSync(output, { recursive: true });
    for (const mode of [false, true]) for (const width of [1440, 390]) {
      admin = mode; reset(); failFestival = false;
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**', route => route.abort());
      await page.addInitScript(() => localStorage.setItem('gestionActiveTab', 'sommaire'));
      const url = `http://127.0.0.1:${server.address().port}/gestion.html`;
      await page.goto(url); await page.waitForSelector('#generalInfoTable');
      if (mode) await page.evaluate(() => loadAndRender(1));
      await page.locator('.update-preview > summary').click();
      assert.equal(await page.locator('.revolt-metrics strong').first().innerText(), '45%');
      assert.match(await page.locator('.update-preview').innerText(), /18\s+habitants/);
      for (const rate of ['5', '8']) {
        releaseTax = null;
        await page.selectOption('#taxRate', rate);
        assert.match(await page.locator('.update-panel-card > .revolt-preview').innerText(), rate === '5' ? /Risque de révolte : 0%/ : /Risque de révolte : 45%/);
        assert.equal(await page.locator('#advanceUpdateBtn').isDisabled(), true);
        while (!releaseTax) await new Promise(resolve => setTimeout(resolve, 10));
        releaseTax();
        await page.waitForFunction(() => !document.querySelector('#taxRate').disabled && !document.querySelector('#playerUpdatePanel [role="status"]'));
        assert.equal(lastTaxPayload.seigneurie_id, 1);
        assert.equal(await page.locator('.update-preview').evaluate(el => el.open), true);
      }
      releaseTax = null; rejectTax = true;
      await page.selectOption('#taxRate', '12');
      assert.match(await page.locator('.update-panel-card > .revolt-preview').innerText(), /75%/);
      while (!releaseTax) await new Promise(resolve => setTimeout(resolve, 10));
      page.once('dialog', dialog => dialog.accept()); releaseTax();
      await page.waitForFunction(() => document.querySelector('#taxRate').value === '8' && !document.querySelector('#taxRate').disabled);
      rejectTax = false;
      assert.equal(await page.locator('.revolt-stolen').evaluate(el => el.open), false);
      await page.locator('.update-preview-content').evaluate(el => el.scrollTop = 0);
      const prefix = `${mode ? 'admin' : 'joueur'}-${width}`;
      await page.screenshot({ path: path.join(output, `${prefix}-risque.png`), fullPage: true });
      await page.locator('.revolt-stolen summary').click();
      assert.equal(await page.locator('.revolt-loss-table tbody tr').count(), 20);
      await page.locator('.revolt-loss-table').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${prefix}-consequences.png`), fullPage: true });
      await page.locator('.revolt-stolen summary').click();
      await page.locator('.festival-panel summary').click();
      await page.locator('#festivalForm input[name="or_"]').fill('7');
      assert.match(await page.locator('#festivalQuote').innerText(), /Bonus : \+3 IDH/);
      assert.match(await page.locator('#festivalQuote').innerText(), /Risque après fête : 0%/);
      await page.locator('#festivalForm input[name="vivres"]').fill('1000');
      assert.match(await page.locator('#festivalQuote').innerText(), /Risque après fête : 15%/); // vivres dépensés : famine et malus IDH
      await page.locator('#festivalForm input[name="vivres"]').fill('0');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('#festivalForm').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${prefix}-fete.png`), fullPage: true });
      failFestival = true;
      await page.locator('#festivalForm button').click();
      await page.waitForFunction(() => document.querySelector('#festivalError').textContent.includes('insuffisantes'));
      assert.equal(await page.locator('#festivalForm input[name="or_"]').inputValue(), '7');
      failFestival = false;
      await page.locator('#festivalForm button').click();
      await page.waitForFunction(() => document.querySelector('.festival-panel')?.textContent.includes('Fête populaire prévue'));
      assert.equal(lastPayload.resources.or_, 7);
      assert.equal(lastPayload.seigneurie_id, mode ? 1 : undefined);
      await page.locator('#advanceUpdateBtn').click();
      await page.waitForSelector('#updateReportDialog[open]');
      assert.match(await page.locator('#updateReportContent').innerText(), /Bonus de \+3 IDH utilisé, puis expiré/);
      await page.locator('#updateReportClose').click();
      assert.equal(await page.locator('#festivalForm').count(), 1);
      await page.locator('#advanceUpdateBtn').click();
      await page.waitForSelector('#updateReportDialog[open]');
      assert.match(await page.locator('#updateReportContent').innerText(), /45% de risque.*18 habitants morts/);
      await page.screenshot({ path: path.join(output, `${prefix}-releve.png`), fullPage: true });
      await page.locator('#updateReportClose').click();
      assert.equal(await page.locator('#festivalForm').count(), 1);
      reset(true); await page.reload(); await page.waitForSelector('#generalInfoTable');
      await page.locator('.update-preview > summary').click();
      assert.match(await page.locator('.update-preview').innerText(), /Protection débutante : aucune révolte/);
      await page.screenshot({ path: path.join(output, `${prefix}-protection.png`), fullPage: true });
      await page.close();
    }
    admin = true;
    for (const width of [1440, 390]) {
      infraDefinition = { id: 3, label: 'Grenier', type: 'civil', effects: '[]', costs: '{}', revolt_destructible: 1 };
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**', route => route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
      await page.locator('.tab-btn[data-tab="batiments"]').click();
      await page.waitForSelector('#tableInfraProps th[data-key="revolt_destructible"]');
      const column = await page.locator('#tableInfraProps th[data-key="revolt_destructible"]').evaluate(th => th.cellIndex);
      const checkbox = () => page.locator('#tableInfraProps tbody tr').first().locator('td').nth(column).locator('input[type="checkbox"]');
      const addCheckbox = page.locator('#tableInfraProps tbody tr').last().locator('td').nth(column).locator('input[type="checkbox"]');
      assert.equal(await checkbox().isChecked(), true);
      assert.equal(await addCheckbox.isChecked(), true);
      for (const checked of [false, true]) {
        await checkbox().setChecked(checked);
        lastInfraPayload = null;
        const previousRow = await page.locator('#tableInfraProps tbody tr').first().elementHandle();
        await page.locator('#tableInfraProps tbody tr').first().getByRole('button', { name: 'Enregistrer', exact: true }).click();
        await page.waitForFunction(row => !row.isConnected, previousRow);
        await previousRow.dispose();
        await page.waitForFunction(value => document.querySelector('#tableInfraProps tbody tr td:nth-child(' + (value.column + 1) + ') input[type="checkbox"]').checked === value.checked && document.querySelector('#saveIndicator').style.display === 'block', { column, checked });
        assert.equal(lastInfraPayload.revolt_destructible, checked ? 1 : 0);
      }
      await checkbox().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `admin-${width}-destructible.png`), fullPage: true });
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('Taxes, conséquences, fêtes, relevés, protection et réglage destructible validés en joueur/admin à 1440 et 390 px.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
