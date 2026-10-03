const test = require('node:test');
const assert = require('node:assert');

const { normalizeTradeResources } = require('../src/tradeValidation');

const allowedResources = ['or_', 'pierre'];

test('normalizeTradeResources aggregates valid resource rows', () => {
  assert.deepStrictEqual(
    normalizeTradeResources({ or_: 3, pierre: '2' }, allowedResources),
    { or_: 3, pierre: 2 }
  );
});

test('normalizeTradeResources rejects empty, unknown and non-integer resources', () => {
  for (const resources of [{}, { inconnu: 1 }, { or_: 0 }, { or_: 1.5 }, { or_: 'abc' }]) {
    assert.throws(() => normalizeTradeResources(resources, allowedResources), { status: 400 });
  }
});
