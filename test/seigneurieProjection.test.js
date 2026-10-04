const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProjection } = require('../src/seigneurieProjection');

test('le calcul économique tient compte des bâtiments, entrepôts, taxes et vivres', () => {
  const input = {
    player: { population: 150, tax_rate: 8 },
    inventory: { esclaves: 0, hommes_darmes: 0 },
    buildings: { 1: { built: 1, active: 1 } },
    infrastructures: { 3: { built: 5 } },
    buildingProperties: [{ id: 1, type: 'field', label: 'Champ', produces: 'vivres', production: 75, workers_per_building: 3 }],
    infrastructureProperties: [{ id: 3, type: 'granary', label: 'Grenier', workers_per_building: 0,
      effects: JSON.stringify([{ type: 'storage', resource: 'vivres', amount: 500 }]) }],
    baronyProperties: { effects: '[]' }
  };
  const first = calculateProjection(input);
  const second = calculateProjection(input);
  assert.deepEqual(first, second);
  assert.equal(first.production.vivres, -2175);
  assert.equal(first.production.or_, 12);
  assert.equal(first.capacities.vivres, 3000);
  assert.equal(first.employment.employed, 3);
  assert.equal(first.consumption.vivres, 2250);
  assert.equal(first.tax.or_, 12);
});

test('les esclaves réduisent une seule fois la population employée', () => {
  const input = {
    player: { population: 10 },
    inventory: { esclaves: 3, hommes_darmes: 0 },
    buildings: { 1: { built: 1, active: 1 } },
    buildingProperties: [{ id: 1, label: 'Champ', workers_per_building: 8 }]
  };
  const result = calculateProjection(input);
  assert.equal(result.employment.employed, 5);
  assert.equal(result.employment.slaves, 3);
  assert.deepEqual(result.employmentDetails.map(({ amount }) => amount), [8, -3]);
  assert.equal(input.player.population - result.employment.employed, 5);

  input.inventory.esclaves = 12;
  assert.equal(calculateProjection(input).employment.employed, 0);
});
