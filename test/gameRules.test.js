const test = require('node:test');
const assert = require('node:assert/strict');
const { resetMonthlyUses, tradeCapacity, buildingRequirements, utcTimestamp } = require('../src/gameRules');
test('les dates SQLite sans fuseau sont UTC ; les dates avec fuseau restent intactes', () => {
  assert.equal(utcTimestamp('2026-10-04 19:22:00'), '2026-10-04T19:22:00Z');
  assert.equal(utcTimestamp('2026-10-04T19:22:00.123'), '2026-10-04T19:22:00.123Z');
  assert.equal(utcTimestamp('2026-10-04T15:22:00-04:00'), '2026-10-04T15:22:00-04:00');
});
test('le port reste obligatoire même avec une ancienne définition sans restrictions', () => {
  assert.deepEqual(buildingRequirements({max:'high_sea_boat_limit',infra_restrictions:'{}'}, [{id:7,label:'Port'}]), {infrastructures:{7:1}});
  assert.deepEqual(buildingRequirements({type:'field',infra_restrictions:'{}'}, []), {});
});
test('les limites zéro interdisent les échanges et les effets augmentent des quotas finis', () => {
  const props=[{id:30,effects:[{type:'land_transaction_max_per_month',amount:1}],restrictions:{infrastructures:{8:1}}}];
  assert.equal(tradeCapacity({30:2}, props).land, 0);
  assert.equal(tradeCapacity({8:1,30:2}, props).land, 2);
  assert.equal(tradeCapacity({}, props).naval, 0);
});
test('la remise à zéro préserve les bâtiments inactifs et les travailleurs affectés', () => {
  const state={1:{built:2,active:1,effect_0_remaining:0,effect_1_workers:3}};
  assert.equal(resetMonthlyUses(state,[{id:1,effects:[{type:'instant_production',uses_per_month:10}]}])[1].effect_0_remaining,20);
  assert.equal(state[1].effect_0_remaining,0);
});
