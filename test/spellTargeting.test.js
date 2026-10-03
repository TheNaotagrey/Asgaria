const test = require('node:test');
const assert = require('node:assert');

const { findSpellTargets } = require('../src/spellTargeting');

test('findSpellTargets inclut la seigneurie source et les destinations dans la portée pondérée', () => {
  const targets = [
    { seigneurie_id: 1, baronnie_id: 10, barony_name: 'Origine' },
    { seigneurie_id: 2, baronnie_id: 20, barony_name: 'Proche' },
    { seigneurie_id: 3, baronnie_id: 30, barony_name: 'Lointaine' }
  ];
  const adjacency = {
    10: [{ id: 20, distance: 2 }],
    20: [{ id: 10, distance: 2 }, { id: 30, distance: 4 }],
    30: [{ id: 20, distance: 4 }]
  };

  assert.deepStrictEqual(
    findSpellTargets({ originSeigneurieId: 1, originBaronyId: 10, range: 5, targets, adjacency })
      .map(target => [target.seigneurie_id, target.distance]),
    [[1, 0], [2, 2]]
  );
});

test('findSpellTargets conserve la seigneurie source même sans connexion', () => {
  const targets = [
    { seigneurie_id: 1, baronnie_id: 10, barony_name: 'Origine' },
    { seigneurie_id: 2, baronnie_id: 20, barony_name: 'Isolée' }
  ];

  assert.deepStrictEqual(
    findSpellTargets({ originSeigneurieId: 1, originBaronyId: 10, range: 0, targets, adjacency: {} })
      .map(target => target.seigneurie_id),
    [1]
  );
});
