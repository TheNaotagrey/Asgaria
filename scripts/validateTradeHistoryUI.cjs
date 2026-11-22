// Page réelle et API isolée : aucune écriture dans la base du jeu.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve('output/trade-history-ui');
const app = express(); app.use(express.json());
let admin = false, fail = false, empty = false, hold = false, release, queries = [], writes = [];
const state = { seigneurie: { id: 1, type: 'seigneur', population: 150, tax_rate: 5 },
  seigneur: { name: 'Aëlor' }, barony: { id: 1, name: 'Lunepierre' }, inventaire: { or_: 100 },
  buildings: {}, infrastructures: {}, employment: { employed: 0, slaves: 0 }, production: {}, capacities: {} };
const transactions = Array.from({ length: 65 }, (_, index) => ({ id: 65 - index,
  direction: index % 2 ? 'incoming' : 'outgoing', origin_name: index % 2 ? 'Éléonore de la Rivière' : 'Aëlor', dest_name: index % 2 ? 'Aëlor' : 'Éléonore de la Rivière',
  origin_barony_name: index % 2 ? 'Valmont' : 'Lunepierre', dest_barony_name: index % 2 ? 'Lunepierre' : 'Valmont', resources: { or_: 10, chevaux: 5, encens: 3 },
  reason: index === 0 ? '<img src=x onerror=alert(1)>' : 'Entente entendue — échange des récoltes',
  created_at: '2026-10-03 12:00:00', decision_time: index % 5 ? '2026-10-04T13:00:00.000Z' : null,
  state: ['En Attente', 'Approuvée', 'Approuvée', 'Refusée', 'Refusée'][index % 5],
  received: index % 5 === 2 ? 1 : 0, returned: index % 5 === 4 ? 1 : 0 }));
app.use('/api', (req, res) => {
  if (req.method !== 'GET') writes.push(req.originalUrl);
  if (req.path === '/me') return res.json({ id: 99, first_name: 'Administrateur', is_admin: admin, act_as_admin: admin });
  if (req.path === '/test_mode') return res.json({ enabled: false });
  if (req.path === '/my_seigneurie') return res.json(req.query.seigneurie_id === '2'
    ? { ...state, seigneurie: { ...state.seigneurie, id: 2 }, seigneur: { name: 'Charles', player_name: 'Propriétaire de Hautbois' } } : state);
  if (req.path === '/seigneurs') return res.json([{ id: 1, name: 'Aëlor' }, { id: 2, name: 'Charles' }]);
  if (req.path === '/seigneuries') return res.json([{ id: 1, seigneur_id: 1, baronnie_id: 1 }, { id: 2, seigneur_id: 2, baronnie_id: 1 }]);
  if (req.path === '/trade_transactions/history') {
    queries.push(req.query);
    const respond = () => {
      if (fail) return res.status(503).json({ error: 'Historique temporairement indisponible.' });
      const rows = empty || req.query.seigneurie_id === '2' ? [] : transactions.filter(tx => !req.query.before || tx.id < Number(req.query.before));
      res.json({ transactions: rows.slice(0, 50), has_more: rows.length > 50 });
    };
    if (hold) { release = respond; return; }
    return respond();
  }
  return res.json([]);
});
app.use(express.static(root));
(async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_PATH ? { executablePath: process.env.UI_BROWSER_PATH } : {}) });
  const errors = [];
  try {
    fs.mkdirSync(output, { recursive: true });
    for (const mode of [false, true]) for (const width of [1440, 390]) {
      admin = mode; fail = false; empty = false; hold = false; queries = []; writes = [];
      const page = await browser.newPage({ viewport: { width, height: 1000 }, timezoneId: 'America/Toronto' });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**', route => route.abort());
      await page.addInitScript(() => localStorage.setItem('gestionActiveTab', 'commerce'));
      await page.goto(`http://127.0.0.1:${server.address().port}/gestion.html`);
      await page.waitForSelector('#generalInfoTable', { state: 'attached' });
      await page.locator('#tradeHistoryBtn').click();
      await page.waitForFunction(() => document.querySelectorAll('#tradeHistoryTable tbody tr').length === 50);
      assert.equal(queries[0].seigneurie_id, mode ? '1' : undefined);
      const text = await page.locator('#tradeHistoryTable').innerText();
      for (const label of ['En attente de décision', 'Acceptée — en attente de réception', 'Réception effectuée', 'Refusée — ressources à récupérer', 'Refusée — ressources retournées']) assert.ok(text.includes(label), label);
      const outgoing = page.locator('.trade-history-direction.outgoing').first();
      const incoming = page.locator('.trade-history-direction.incoming').first();
      assert.equal(await outgoing.locator('svg path').getAttribute('d'), 'M4 12h16M13 5l7 7-7 7');
      assert.equal(await incoming.locator('svg path').getAttribute('d'), 'M20 12H4M11 5l-7 7 7 7');
      assert.equal(await outgoing.locator('svg').evaluate(el => getComputedStyle(el).strokeLinecap), 'round');
      assert.equal(await incoming.locator('svg').evaluate(el => getComputedStyle(el).strokeWidth), '4px');
      assert.equal(await outgoing.getAttribute('aria-label'), 'Envoi');
      assert.equal(await incoming.getAttribute('aria-label'), 'Réception');
      assert.equal(await outgoing.evaluate(el => getComputedStyle(el).color), 'rgb(181, 44, 44)');
      assert.equal(await incoming.evaluate(el => getComputedStyle(el).color), 'rgb(36, 115, 59)');
      assert.equal(await page.locator('#tradeHistoryTable img').count(), 0);
      assert.equal(await page.locator('#tradeHistoryTable time').first().getAttribute('datetime'), '2026-10-03T12:00:00Z');
      assert.match(await page.locator('#tradeHistoryTable time').first().innerText(), /08.*00/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, `${mode ? 'admin' : 'joueur'}-${width}-historique.png`), fullPage: true });
      await page.locator('#tradeHistoryMore').click();
      await page.waitForFunction(() => document.querySelectorAll('#tradeHistoryTable tbody tr').length === 65);
      assert.equal(await page.locator('#tradeHistoryMore').isHidden(), true);
      assert.equal(new Set(await page.locator('#tradeHistoryTable tbody tr').evaluateAll(rows => rows.map(row => row.dataset.id))).size, 65);
      await page.locator('#tradeHistoryClose').click();
      fail = true; await page.locator('#tradeHistoryBtn').click();
      await page.waitForFunction(() => document.querySelector('#tradeHistoryStatus').textContent.includes('indisponible'));
      fail = false; await page.locator('#tradeHistoryMore').click();
      await page.waitForFunction(() => document.querySelectorAll('#tradeHistoryTable tbody tr').length === 50);
      await page.keyboard.press('Escape');
      empty = true; await page.locator('#tradeHistoryBtn').click();
      await page.waitForFunction(() => document.querySelector('#tradeHistoryStatus').textContent.includes('Aucune transaction'));
      assert.equal(await page.locator('#tradeHistoryTable').isHidden(), true);
      await page.locator('#tradeHistoryClose').click();
      if (mode) {
        hold = true; release = null; empty = false; await page.locator('#tradeHistoryBtn').click();
        while (!release) await new Promise(resolve => setTimeout(resolve, 10));
        await page.keyboard.press('Escape');
        await page.locator('.tab-btn[data-tab="sommaire"]').click();
        await page.locator('#adminSeigneurieSelect select').selectOption('2');
        await page.waitForFunction(() => document.querySelector('#generalInfoTable')?.textContent.includes('Propriétaire de Hautbois'));
        release(); hold = false;
        await page.locator('.tab-btn[data-tab="commerce"]').click();
        await page.locator('#tradeHistoryBtn').click();
        await page.waitForFunction(() => document.querySelector('#tradeHistoryStatus').textContent.includes('Aucune transaction'));
        assert.equal(queries[queries.length - 1].seigneurie_id, '2');
        assert.equal(await page.locator('#tradeHistoryTable tbody tr').count(), 0);
      }
      assert.deepEqual(writes, []);
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('Historique commerce validé : envois/réceptions, dates UTC, statuts, pagination, erreur/reprise, fermeture, identité admin et mobile.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
