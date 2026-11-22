const test = require('node:test');
const assert = require('node:assert/strict');
const { types, isValidType, isBuildingAvailable } = require('../src/playerTypes');

test('chaque définition est exclusive à son type', () => {
  for (const allowed of types) {
    for (const type of types) {
      assert.equal(isBuildingAvailable({ player_type: allowed.id }, type.id), type.id === allowed.id);
    }
  }
});

test('une définition historique appartient par défaut aux seigneurs', () => {
  for (const type of types) assert.equal(isBuildingAvailable({}, type.id), type.id === 'seigneur');
  assert.equal(isBuildingAvailable({}), true);
  assert.equal(isBuildingAvailable({}, 'inconnu'), false);
  assert.equal(isValidType(null), false);
});
