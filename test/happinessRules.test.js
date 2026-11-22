const test = require('node:test');
const assert = require('node:assert/strict');
const { festivalQuote, calculateIDH, revoltRisk, resolveRevolt, updateHappinessPreview } = require('../src/happinessRules');

test('fêtes : seuils stricts, minimums et somme pondérée de la feuille', () => {
  assert.equal(festivalQuote({ vivres: 200 }, 100).bonus, 0);
  assert.equal(festivalQuote({ vivres: 201 }, 100).bonus, 1);
  assert.equal(festivalQuote({ vivres: 400 }, 100).bonus, 1);
  assert.equal(festivalQuote({ vivres: 401 }, 100).bonus, 2);
  assert.equal(festivalQuote({ vivres: 600 }, 100).bonus, 2);
  assert.equal(festivalQuote({ vivres: 601 }, 100).bonus, 3);
  assert.deepEqual(festivalQuote({ vivres: 300, rhum: 10, or_: 1 }, 1003), { value: 750, thresholds: [330, 670, 1000], bonus: 2 });
  assert.equal(festivalQuote({ huile: 1 }, 1003).bonus, 3);
});
test('révoltes : chaque palier, bornes et protection persistante', () => {
  for (let idh = 0; idh <= 4; idh++) assert.equal(revoltRisk(idh).chance, (5 - idh) * 15);
  assert.equal(revoltRisk(-10).chance, 75);
  assert.equal(revoltRisk(5).chance, 0);
  assert.equal(revoltRisk(0, { beginner_protection: 1, population: 119 }).chance, 0);
  assert.equal(revoltRisk(0, { beginner_protection: 0, population: 90 }).chance, 75);
  assert.equal(revoltRisk(0, { type: 'eveque' }).chance, 0);
});
test('le tirage utilise une borne inclusive et ne tire jamais pour un débutant', () => {
  const args = { risk: revoltRisk(4), population: 100, inventory: { or_: 15, hommes_darmes: 10, esclaves: 50 }, infrastructures: {}, properties: [] };
  const result = resolveRevolt({ ...args, random: () => .14 });
  assert.equal(result.occurred, true);
  assert.equal(result.roll, 15);
  assert.deepEqual(result.losses, { civilians: 2, slaves: 1, soldiers: 0, stolen: { or_: 2 }, stolenPercent: 10 });
  assert.equal(resolveRevolt({ ...args, random: () => .15 }).occurred, false);
  assert.equal(resolveRevolt({ ...args, risk: revoltRisk(0, { beginner_protection: 1 }), random: () => { throw Error('tirage interdit'); } }).occurred, false);
});
test('destruction sans remplacement, réglage administrateur et protection de la trésorerie', () => {
  const infrastructures = { 1: { built: 2, effect_0_workers: 5 }, 2: { built: 1 }, 3: { built: 1 } };
  const properties = [{ id: 1, type: 'civil', label: 'Forge', revolt_destructible: 1 }, { id: 2, type: 'civil', label: 'Trésorerie', revolt_destructible: 0 }, { id: 3, type: 'militaire', label: 'Tour', revolt_destructible: 0 }];
  const result = resolveRevolt({ risk: revoltRisk(0), population: 500, inventory: { or_: 100, points_magique: 100, esclaves: 50 }, infrastructures, properties, random: () => 0 });
  assert.equal(result.losses.stolen.or_, 60);
  assert.equal(result.losses.stolen.points_magique, undefined);
  assert.equal(result.destroyed.length, 2);
  assert.deepEqual(infrastructures, { 2: { built: 1 }, 3: { built: 1 } });
});
test('la destruction dépend du booléen, même pour une cathédrale ou un grenier ciblé', () => {
  const infrastructures = { 1: { built: 1 }, 2: { built: 1 }, 3: { built: 1 } };
  const properties = [{ id: 1, label: 'Cathédrale', type: 'civil', revolt_destructible: 1 },
    { id: 2, label: 'Grenier', type: 'civil', revolt_destructible: 0 }, { id: 3, label: 'Tour', type: 'militaire' }];
  const args = { population: 100, inventory: {}, infrastructures, properties, random: () => 0 };
  assert.deepEqual(resolveRevolt({ ...args, risk: revoltRisk(4) }).destroyed, []);
  assert.deepEqual(resolveRevolt({ ...args, risk: revoltRisk(0) }).destroyed.map(item => item.id), [1, 3]);
  assert.deepEqual(infrastructures, { 2: { built: 1 } });
});
test('prévision et résolution calculent le même IDH après famine et fête', () => {
  const args = { player: { population: 100, tax_rate: 5 }, inventory: { vivres: 0 }, infrastructures: {}, infrastructureProperties: [], lord: { religion_id: 1 }, festivalBonus: 3 };
  const preview = updateHappinessPreview({ ...args, projection: { production: { vivres: -300 }, capacities: { vivres: 500 } } });
  const actual = calculateIDH({ ...args, player: { population: 90, tax_rate: 5 }, famineDeaths: 10 });
  assert.equal(preview.idh, actual.idh);
  assert.equal(preview.famineDeaths, 10);
  assert.equal(preview.chance, 0);
});
