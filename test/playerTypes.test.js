const test = require('node:test');
const assert = require('node:assert/strict');
const { types, isValidType, isBuildingAvailable } = require('../src/playerTypes');

test('chaque type possède une disponibilité indépendante', () => {
  for (const allowed of types) {
    const building = Object.fromEntries(types.map(type => [`available_${type.id}`, Number(type.id === allowed.id)]));
    for (const type of types) assert.equal(isBuildingAvailable(building, type.id), type.id === allowed.id);
  }
});
test('seuls Seigneur et Évêque sont disponibles par défaut ; les choix explicites sont conservés', () => {
  for (const type of types) assert.equal(isBuildingAvailable({}, type.id), ['seigneur', 'eveque'].includes(type.id));
  assert.equal(isBuildingAvailable({ available_pirate: 1 }, 'pirate'), true);
  assert.equal(isBuildingAvailable({ available_mercenaire: 1 }, 'mercenaire'), true);
  assert.equal(isBuildingAvailable({}, 'inconnu'), false);
  assert.equal(isValidType(''), false);
  assert.equal(isValidType(null), false);
  assert.equal(isBuildingAvailable({ available_seigneur: '0' }), false);
  assert.equal(isBuildingAvailable({ available_seigneur: 0 }), false);
  assert.equal(isBuildingAvailable({ available_seigneur: '1' }), true);
});
