const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { isBuildingAvailable, types } = require('../src/playerTypes');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const start = source.indexOf('function canConstruct(');
const end = source.indexOf('\nfunction ', start + 1);

test('le serveur refuse les infrastructures interdites avant de consommer les ressources', async () => {
  const context = { isBuildingAvailable };
  vm.createContext(context);
  const infraStart = source.indexOf('function canConstructInfra(');
  vm.runInContext(source.slice(infraStart, source.indexOf("app.post('/api/building'", infraStart)), context);
  for (const type of types) {
    const db = { get(sql, params, cb) {
      assert.match(sql, /FROM infrastructure_properties/);
      cb(null, { [`available_${type.id}`]: 0 });
    } };
    const error = await new Promise(resolve => context.canConstructInfra(db, { type: type.id, baronnie_id: 1 }, 1, 1, resolve));
    assert.match(error.message, /indisponible pour ce type/);
  }
});

test('le serveur refuse chaque type interdit avant toute lecture de ressources', async () => {
  const context = { isBuildingAvailable };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  for (const type of types) {
    let reads = 0;
    const db = { get(sql, params, cb) {
      reads++;
      assert.match(sql, /FROM building_properties/);
      cb(null, { [`available_${type.id}`]: 0 });
    } };
    const error = await new Promise(resolve => context.canConstruct(db, { type: type.id, baronnie_id: 1 }, 1, 1, resolve));
    assert.match(error.message, /indisponible pour ce type/);
    assert.equal(reads, 1);
  }
});
