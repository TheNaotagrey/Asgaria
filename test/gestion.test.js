const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('les longues infobulles restent dans l’écran, y compris près des bords', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'gestion.js'), 'utf8');
  const start = source.indexOf('function getGestionTooltipPosition(');
  const end = source.indexOf('\nfunction initGestionTooltips(', start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  for (const anchor of [
    { left: 0, top: 20, bottom: 40, width: 15 },
    { left: 375, top: 740, bottom: 760, width: 15 },
    { left: 190, top: 395, bottom: 415, width: 15 }
  ]) {
    const result = context.getGestionTooltipPosition(anchor, { width: 900, height: 360 }, { width: 390, height: 800 });
    assert.ok(result.left >= 12);
    assert.ok(result.left + result.width <= 378);
    assert.ok(result.top >= 12);
    assert.ok(result.top + result.height <= 788);
  }
  const belowNavigation = context.getGestionTooltipPosition(
    { left: 240, top: 440, bottom: 460, width: 15 },
    { width: 520, height: 360 }, { width: 390, height: 800, top: 120 });
  assert.ok(belowNavigation.top >= 132);
  assert.ok(belowNavigation.top + belowNavigation.height <= 788);
});

test('les infrastructures réservent une colonne nommée uniquement aux actions spéciales', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'gestion.js'), 'utf8');
  const start = source.indexOf('function buildInfraTable(');
  const end = source.indexOf('\nfunction updateInstantCost(', start);
  const context = { gameState: {}, safeParse: (value, fallback) => {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  for (const effects of ['[]', 'null', '{}', 'invalide']) {
    const html = context.buildInfraTable([{ id: 1, label: 'Caserne', effects }], {}, {}, 'test');
    assert.doesNotMatch(html, /multi-col/);
  }
  const html = context.buildInfraTable([{ id: 1, label: 'Atelier', effects: '[{"type":"variable_workers"}]' }], {}, {}, 'test');
  assert.match(html, /<th class="multi-col">Actions spéciales<\/th>/);
  assert.match(html, /<td class="multi-col"><\/td>/);
});

test('la prévision conserve le déficit complet des vivres et indique famine et stockage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'gestion.js'), 'utf8');
  const start = source.indexOf('function renderUpdatePreview(');
  const end = source.indexOf('\nfunction renderUpdatePanel(', start);
  const context = { resourceLabels: { vivres: 'Vivres', points_magique: 'Points magiques' }, escapeHtml: value => String(value) };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const html = context.renderUpdatePreview({ vivres: 50, points_magique: 1990, or_: 10 },
    { vivres: -100, points_magique: 30, or_: 5 }, { points_magique: 2000 }, 100);
  assert.match(html, /prod-negative">-100/);
  assert.match(context.renderUpdatePreview({ vivres: 500 }, { vivres: -1000 }, {}, 100), /prod-negative">-1000/);
  assert.match(html, /Famine : 2 morts/);
  assert.match(html, /prod-positive">\+10/);
  assert.match(html, /Stockage dépassé : 20 perdus/);
  assert.match(html, /prod-positive">\+5/);
  assert.match(context.renderUpdatePreview({ vivres: 0 }, { vivres: -1500 }, {}, 3), /Famine : 3 morts/);
  assert.doesNotMatch(context.renderUpdatePreview({ vivres: 100 }, { vivres: -50 }, {}, 100), /Famine/);
  assert.equal(context.renderUpdatePreview({}, { vivres: 0 }, {}, 100), '');
});

test('le rendu des dates transmet chaque élément à timeago et prévoit un repli local', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'gestion.js'), 'utf8');
  const start = source.indexOf('function renderTransactionDates(');
  const end = source.indexOf('\nlet gameState', start);
  assert.ok(start >= 0 && end > start);
  const rendered = [];
  const context = { window: { timeago: { render: (element, locale) => rendered.push([element, locale]) } } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const dates = [{ dateTime: '2026-10-01T12:00:00Z' }, { dateTime: '2026-10-02T12:00:00Z' }];
  context.renderTransactionDates({ querySelectorAll: () => dates });
  assert.deepStrictEqual(rendered, dates.map(element => [element, 'fr']));
  context.renderTransactionDates({ querySelectorAll: () => [] });
  assert.equal(rendered.length, 2);

  context.window.timeago = null;
  context.renderTransactionDates({ querySelectorAll: () => dates });
  assert.ok(dates.every(element => element.textContent));
});

test('les sorts chargent une destination et la transmettent au serveur', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'gestion.js'), 'utf8');
  assert.match(source, /fetch\(`\/api\/spell_targets\$\{targetQuery\}`\)/);
  assert.match(source, /id="spellTargetSelect"/);
  assert.match(source, /target_seigneurie_id: targetSeigneurieId/);
});

test('Gestion tient compte des esclaves une seule fois pour les travailleurs disponibles', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'gestion.js'), 'utf8');
  const start = source.indexOf('function availableWorkers(');
  const end = source.indexOf('\nfunction compareUpdateStatus(', start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const details = [{ label: 'Champ', amount: 8 }, { label: 'Esclaves', amount: -3 }];
  assert.equal(context.availableWorkers(10, { employed: 5, slaves: 3 }, details), 5);
  assert.equal(context.availableWorkers(10, { employed: 5, slaves: 3 }, details, 8), 13);
  assert.equal(context.availableWorkers(10, { employed: 0, slaves: 12 }, details), 14);
});
