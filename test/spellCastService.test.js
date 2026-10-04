const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { castSpellAtomically } = require('../services/spellCastService');

function run(database, sql, params = []) {
  return new Promise((resolve, reject) => database.run(sql, params, function (error) {
    if (error) reject(error); else resolve({ changes: this.changes });
  }));
}
function get(database, sql, params = []) {
  return new Promise((resolve, reject) => database.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}
function exec(database, sql) {
  return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
}
function cleanupFixture(directory) {
  const resolved = fs.realpathSync(directory);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('asgaria-spell-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}

async function fixture({ effect = { type: 'production', resource: 'vivres', amount: 4 }, costs = { or_: 3 }, max = 0, successBonus = 25, secondInfrastructure = [] } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-spell-'));
  const dbPath = path.join(directory, 'spell.db');
  const database = new sqlite3.Database(dbPath);
  await exec(database, `
    CREATE TABLE inventaire (id INTEGER PRIMARY KEY, or_ INTEGER, vivres INTEGER, points_magique INTEGER);
    CREATE TABLE seigneuries (id INTEGER PRIMARY KEY, seigneur_id INTEGER, baronnie_id INTEGER, infrastructures TEXT, inventaire_id INTEGER, spells_cast INTEGER);
    CREATE TABLE seigneuries_info (player_id INTEGER PRIMARY KEY, spells_cast INTEGER);
    CREATE TABLE baronies (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE barony_connections (barony_id_1 INTEGER, barony_id_2 INTEGER, distance INTEGER);
    CREATE TABLE seigneurs (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE infrastructure_properties (id INTEGER PRIMARY KEY, effects TEXT);
    CREATE TABLE barony_properties (barony_id INTEGER, effects TEXT);
    CREATE TABLE spells (id INTEGER PRIMARY KEY, type TEXT, costs TEXT, effects TEXT);
    CREATE TABLE transactions (seigneurie_id INTEGER, resource TEXT, amount INTEGER);
  `);
  await run(database, 'INSERT INTO inventaire VALUES (1,10,2,10),(2,0,1,0)');
  await run(database, "INSERT INTO seigneuries VALUES (1,1,1,?,1,0),(2,2,2,'{}',2,0)", [JSON.stringify(secondInfrastructure.length ? { 1: 1, 2: 1 } : { 1: 1 })]);
  await run(database, 'INSERT INTO seigneuries_info VALUES (1,0)');
  await run(database, "INSERT INTO baronies VALUES (1,'Origine'),(2,'Cible')");
  await run(database, 'INSERT INTO barony_connections VALUES (1,2,1)');
  await run(database, "INSERT INTO seigneurs VALUES (1,'Lanceur'),(2,'Cible')");
  await run(database, 'INSERT INTO infrastructure_properties VALUES (1,?)', [JSON.stringify([{ type: 'spell_success', amount: successBonus }, ...(max ? [{ type: 'spell_max_per_month', amount: max }] : [])])]);
  if (secondInfrastructure.length) await run(database, 'INSERT INTO infrastructure_properties VALUES (2,?)', [JSON.stringify(secondInfrastructure)]);
  await run(database, 'INSERT INTO spells VALUES (1,?,?,?)', ['base', JSON.stringify(costs), JSON.stringify([effect])]);
  await new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
  return { dbPath, directory };
}

async function readDb(dbPath, sql, params = []) {
  const database = new sqlite3.Database(dbPath);
  try { return await get(database, sql, params); }
  finally { await new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve())); }
}

test('sort: débit, effet, journaux et compteur sont validés ensemble', async () => {
  const { dbPath, directory } = await fixture();
  try {
    const result = await castSpellAtomically({ dbPath, sourceSeigneurieId: 1, targetSeigneurieId: 2, spellId: 1 });
    assert.equal(result.success, true);
    assert.equal((await readDb(dbPath, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 7);
    assert.equal((await readDb(dbPath, 'SELECT vivres FROM inventaire WHERE id=2')).vivres, 5);
    assert.equal((await readDb(dbPath, 'SELECT spells_cast FROM seigneuries_info WHERE player_id=1')).spells_cast, 1);
    assert.equal((await readDb(dbPath, 'SELECT COUNT(*) AS n FROM transactions')).n, 2);
  } finally { cleanupFixture(directory); }
});

test('sort: ressource insuffisante refuse sans débit partiel ni compteur', async () => {
  const { dbPath, directory } = await fixture({ costs: { or_: 3, points_magique: 50 } });
  try {
    await assert.rejects(castSpellAtomically({ dbPath, sourceSeigneurieId: 1, targetSeigneurieId: 2, spellId: 1 }), { code: 'insufficient_resources' });
    assert.equal((await readDb(dbPath, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 10);
    assert.equal((await readDb(dbPath, 'SELECT COUNT(*) AS n FROM transactions')).n, 0);
    assert.equal((await readDb(dbPath, 'SELECT spells_cast FROM seigneuries_info WHERE player_id=1')).spells_cast, 0);
  } finally { cleanupFixture(directory); }
});

test('sort: un effet invalide annule le débit et les crédits antérieurs', async () => {
  const { dbPath, directory } = await fixture({ effect: { type: 'production', resource: 'colonne_inconnue', amount: 1 } });
  try {
    await assert.rejects(castSpellAtomically({ dbPath, sourceSeigneurieId: 1, targetSeigneurieId: 2, spellId: 1 }), { code: 'invalid_spell_effect' });
    assert.equal((await readDb(dbPath, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 10);
    assert.equal((await readDb(dbPath, 'SELECT spells_cast FROM seigneuries_info WHERE player_id=1')).spells_cast, 0);
  } finally { cleanupFixture(directory); }
});

test('sort: un jet raté débite le coût et compte le lancement sans appliquer les effets', async () => {
  const { dbPath, directory } = await fixture({ successBonus: 0 });
  try {
    const result = await castSpellAtomically({
      dbPath, sourceSeigneurieId: 1, targetSeigneurieId: 2, spellId: 1, random: () => 0.99
    });
    assert.equal(result.success, false);
    assert.equal((await readDb(dbPath, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 7);
    assert.equal((await readDb(dbPath, 'SELECT vivres FROM inventaire WHERE id=2')).vivres, 1);
    assert.equal((await readDb(dbPath, 'SELECT spells_cast FROM seigneuries_info WHERE player_id=1')).spells_cast, 1);
    assert.deepEqual(await readDb(dbPath, 'SELECT COUNT(*) AS n FROM transactions'), { n: 1 });
  } finally { cleanupFixture(directory); }
});

test('sort: les lancers concurrents ne dépassent pas la limite relue sous verrou', async () => {
  const { dbPath, directory } = await fixture({ max: 1 });
  try {
    const outcomes = await Promise.allSettled([
      castSpellAtomically({ dbPath, sourceSeigneurieId: 1, targetSeigneurieId: 2, spellId: 1 }),
      castSpellAtomically({ dbPath, sourceSeigneurieId: 1, targetSeigneurieId: 2, spellId: 1 })
    ]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected' && outcome.reason.code === 'spell_limit_reached').length, 1);
    assert.equal((await readDb(dbPath, 'SELECT spells_cast FROM seigneuries_info WHERE player_id=1')).spells_cast, 1);
    assert.equal((await readDb(dbPath, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 7);
  } finally { cleanupFixture(directory); }
});

test('sort: les modificateurs de chaque infrastructure sont relus avant le calcul', async () => {
  const { dbPath, directory } = await fixture({ costs: { or_: 5 }, secondInfrastructure: [
    { type: 'spell_basic_discount', amount: 20 },
    { type: 'spell_max_per_month', amount: 1 }
  ] });
  try {
    const cast = await castSpellAtomically({ dbPath, sourceSeigneurieId: 1, targetSeigneurieId: 2, spellId: 1 });
    assert.equal(cast.success, true);
    assert.equal((await readDb(dbPath, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 6);
    await assert.rejects(castSpellAtomically({ dbPath, sourceSeigneurieId: 1, targetSeigneurieId: 2, spellId: 1 }), { code: 'spell_limit_reached' });
    assert.equal((await readDb(dbPath, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 6);
  } finally { cleanupFixture(directory); }
});
