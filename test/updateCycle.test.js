const test = require('node:test');
const assert = require('node:assert');

const {
  compareUpdatePositions,
  formatUpdateLabel,
  getLatestUnlockedUpdate,
  getNextUpdatePosition,
  getUnlockDateForUpdate,
  getUpdateKey,
  isUpdateUnlocked,
  normalizeUpdatePosition
} = require('../src/updateCycle');

test('getLatestUnlockedUpdate follows the seasonal unlock calendar', () => {
  assert.deepStrictEqual(getLatestUnlockedUpdate(new Date('2026-01-15T12:00:00')), { year: 1025, number: 10 });
  assert.deepStrictEqual(getLatestUnlockedUpdate(new Date('2026-02-01T00:00:00')), { year: 1026, number: 1 });
  assert.deepStrictEqual(getLatestUnlockedUpdate(new Date('2026-03-18T10:00:00')), { year: 1026, number: 2 });
  assert.deepStrictEqual(getLatestUnlockedUpdate(new Date('2026-10-01T00:00:00')), { year: 1026, number: 10 });
  assert.deepStrictEqual(getLatestUnlockedUpdate(new Date('2026-12-20T10:00:00')), { year: 1026, number: 10 });
});

test('update helpers format, compare and advance positions correctly', () => {
  assert.strictEqual(formatUpdateLabel({ year: 1026, number: 10 }), 'Hiver 1026');
  assert.strictEqual(getUpdateKey({ year: 1026, number: 2 }), '1026-02');
  assert.strictEqual(compareUpdatePositions({ year: 1026, number: 10 }, { year: 1027, number: 1 }) < 0, true);
  assert.deepStrictEqual(getNextUpdatePosition({ year: 1026, number: 10 }), { year: 1027, number: 1 });
});

test('unlock dates are enforced from the configured first day', () => {
  const winter = { year: 1026, number: 10 };
  const winterUnlock = getUnlockDateForUpdate(winter);
  assert.strictEqual(winterUnlock.toISOString(), '2026-10-01T04:00:00.000Z');
  assert.strictEqual(isUpdateUnlocked(winter, new Date('2026-09-30T23:59:59-04:00')), false);
  assert.strictEqual(isUpdateUnlocked(winter, new Date('2026-10-01T00:00:00-04:00')), true);
});

test('normalizeUpdatePosition falls back to the latest unlocked update', () => {
  assert.deepStrictEqual(
    normalizeUpdatePosition({ year: 0, number: 0 }, new Date('2026-03-18T10:00:00')),
    { year: 1026, number: 2 }
  );
});
