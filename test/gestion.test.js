const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
