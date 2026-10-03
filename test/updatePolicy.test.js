const test = require('node:test');
const assert = require('node:assert/strict');
const { validateUpdatePolicy, getUpdatePolicyBlocker } = require('../src/updatePolicy');
const { getNextUpdatePosition } = require('../src/updateCycle');
const policy = { blocked: false, limitEnabled: true, limit: { year: 1027, number: 1 } };

test('La limite est inclusive et bloque les joueurs déjà au-delà', () => {
  assert.equal(getUpdatePolicyBlocker(policy, { year: 1026, number: 10 }), null);
  assert.equal(getUpdatePolicyBlocker(policy, policy.limit), null);
  assert.equal(getUpdatePolicyBlocker(policy, { year: 1027, number: 2 }).code, 'update_limit');
  assert.equal(getUpdatePolicyBlocker(policy, { year: 1028, number: 1 }).code, 'update_limit');
});
test('La limite respecte le passage hiver-février', () => {
  const winter = { ...policy, limit: { year: 1026, number: 10 } };
  assert.equal(getUpdatePolicyBlocker(winter, getNextUpdatePosition(winter.limit)).code, 'update_limit');
});
test('Le gel complet prime et la désactivation libère la progression', () => {
  assert.equal(getUpdatePolicyBlocker({ ...policy, blocked: true }, policy.limit).code, 'updates_frozen');
  assert.equal(getUpdatePolicyBlocker({ ...policy, limitEnabled: false }, { year: 1029, number: 1 }), null);
});
test('Les paramètres invalides sont refusés sans normalisation silencieuse', () => {
  assert.deepEqual(validateUpdatePolicy(policy), policy);
  for (const invalid of [null, {}, { ...policy, blocked: 'false' }, { ...policy, limit: { year: 1027, number: 11 } }, { ...policy, limit: { year: 1.5, number: 1 } }]) {
    assert.throws(() => validateUpdatePolicy(invalid));
  }
});
