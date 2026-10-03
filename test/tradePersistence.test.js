const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');

const { createTradeTransactionAtomically, createTradeLinkAtomically } = require('../src/tradePersistence');

function run(database, sql, params = []) {
  return new Promise((resolve, reject) => database.run(sql, params, err => err ? reject(err) : resolve()));
}

function get(database, sql, params = []) {
  return new Promise((resolve, reject) => database.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}

function exec(database, sql) {
  return new Promise((resolve, reject) => database.exec(sql, err => err ? reject(err) : resolve()));
}

async function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-trade-'));
  const databasePath = path.join(directory, 'trade.db');
  const database = new sqlite3.Database(databasePath);
  await exec(database, `
    CREATE TABLE inventaire (id INTEGER PRIMARY KEY, or_ INTEGER NOT NULL, pierre INTEGER NOT NULL);
    CREATE TABLE players (id INTEGER PRIMARY KEY, land_transactions INTEGER NOT NULL, naval_transactions INTEGER NOT NULL);
    CREATE TABLE transactions (seigneurie_id INTEGER, resource TEXT, amount INTEGER);
    CREATE TABLE trade_transactions (id INTEGER PRIMARY KEY, origin_id INTEGER, destination_id INTEGER, origin_update_year INTEGER, origin_update_number INTEGER, resources TEXT, type TEXT, state TEXT, reason TEXT);
    CREATE TABLE trade_routes (id INTEGER PRIMARY KEY, barony_id_1 INTEGER, barony_id_2 INTEGER, path TEXT);
    CREATE TABLE trade_lines (id INTEGER PRIMARY KEY, barony_id_1 INTEGER, barony_id_2 INTEGER, path TEXT);
  `);
  await run(database, 'INSERT INTO inventaire VALUES (1,20,8)');
  await run(database, 'INSERT INTO players VALUES (10,0,0)');
  await run(database, "INSERT INTO trade_routes VALUES (1,1,2,'[]')");
  return { database, databasePath, directory };
}

async function closeFixture(fixture) {
  await new Promise(resolve => fixture.database.close(resolve));
  fs.rmSync(fixture.directory, { recursive: true, force: true });
}

test('une transaction sans liaison est refusée sans modifier les ressources', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      createTradeTransactionAtomically(fixture.databasePath, {
        seigneurieId: 10, inventoryId: 1, startBaronyId: 1, targetBaronyId: 3,
        resources: { pierre: 2 }, type: 'land', maxTransactions: 2,
        originUpdate: { year: 1, number: 1 }, destinationId: 20, reason: null
      }),
      { message: 'Aucune liaison commerciale valide vers cette destination' }
    );
    assert.strictEqual((await get(fixture.database, 'SELECT pierre FROM inventaire WHERE id=1')).pierre, 8);
    assert.strictEqual((await get(fixture.database, 'SELECT land_transactions FROM players WHERE id=10')).land_transactions, 0);
  } finally {
    await closeFixture(fixture);
  }
});

test('une transaction liée débite, compte et enregistre dans une seule transaction', async () => {
  const fixture = await createFixture();
  try {
    await createTradeTransactionAtomically(fixture.databasePath, {
      seigneurieId: 10, inventoryId: 1, startBaronyId: 1, targetBaronyId: 2,
      resources: { pierre: 3 }, type: 'land', maxTransactions: 2,
      originUpdate: { year: 1, number: 1 }, destinationId: 20, reason: 'Test'
    });
    assert.strictEqual((await get(fixture.database, 'SELECT pierre FROM inventaire WHERE id=1')).pierre, 5);
    assert.strictEqual((await get(fixture.database, 'SELECT land_transactions FROM players WHERE id=10')).land_transactions, 1);
    assert.strictEqual((await get(fixture.database, 'SELECT COUNT(*) AS count FROM transactions')).count, 1);
    assert.strictEqual((await get(fixture.database, 'SELECT COUNT(*) AS count FROM trade_transactions')).count, 1);
  } finally {
    await closeFixture(fixture);
  }
});

test('une liaison existante est refusée sans consommer d’or', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      createTradeLinkAtomically(fixture.databasePath, {
        seigneurieId: 10, inventoryId: 1, startId: 1, targetId: 2,
        type: 'land', storedPath: [], distance: 1
      }),
      { message: 'Cette liaison commerciale existe déjà' }
    );
    assert.strictEqual((await get(fixture.database, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 20);
    assert.strictEqual((await get(fixture.database, 'SELECT COUNT(*) AS count FROM transactions')).count, 0);
  } finally {
    await closeFixture(fixture);
  }
});
