const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');

const { createTradeTransactionAtomically, createTradeLinkAtomically } = require('../src/tradePersistence');
const { messagingSchema } = require('../services/messagingService');

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
    CREATE TABLE players (id INTEGER PRIMARY KEY, land_transactions INTEGER NOT NULL, naval_transactions INTEGER NOT NULL, infrastructures TEXT, seigneur_id INTEGER);
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE seigneurs (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT);
    CREATE TABLE infrastructure_properties (id INTEGER PRIMARY KEY, effects TEXT, restrictions TEXT);
    CREATE TABLE barony_properties (barony_id INTEGER PRIMARY KEY, effects TEXT);
    CREATE TABLE transactions (seigneurie_id INTEGER, resource TEXT, amount INTEGER);
    CREATE TABLE trade_transactions (id INTEGER PRIMARY KEY, origin_id INTEGER, destination_id INTEGER, origin_update_year INTEGER, origin_update_number INTEGER, resources TEXT, type TEXT, state TEXT, reason TEXT, created_at TEXT, decision_time TEXT);
    CREATE TABLE trade_routes (id INTEGER PRIMARY KEY, barony_id_1 INTEGER, barony_id_2 INTEGER, path TEXT);
    CREATE TABLE barony_connections (barony_id_1 INTEGER, barony_id_2 INTEGER, distance INTEGER);
    CREATE TABLE trade_lines (id INTEGER PRIMARY KEY, barony_id_1 INTEGER, barony_id_2 INTEGER, path TEXT);
    INSERT INTO users VALUES (1),(2);
    INSERT INTO seigneurs VALUES (1,1,'Alice'),(2,2,'Benoît');
    ${messagingSchema}
  `);
  await run(database, 'INSERT INTO inventaire VALUES (1,20,8)');
  await run(database, 'INSERT INTO players VALUES (10,0,0,?,1)', ['{"1":{"built":1},"2":{"built":2}}']);
  await run(database, "INSERT INTO players VALUES (20,0,0,'{}',2)");
  await run(database, 'INSERT INTO infrastructure_properties VALUES (1,?,?)', ['[]','{}']);
  await run(database, 'INSERT INTO infrastructure_properties VALUES (2,?,?)', ['[{"type":"land_transaction_max_per_month","amount":1}]','{"infrastructures":{"1":1}}']);
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
    const event = await get(fixture.database, 'SELECT * FROM character_trade_messages');
    assert.equal(event.kind, 'sent');
    assert.deepEqual(JSON.parse(event.event_json).resources, { pierre: 3 });
    assert.equal((await get(fixture.database, 'SELECT sender_id FROM character_messages')).sender_id, 1);
  } finally {
    await closeFixture(fixture);
  }
});

test('sans caravane ou sans son marché, aucun débit ; les quotas sont relus sous verrou', async () => {
  const fixture = await createFixture();
  const args = { seigneurieId: 10, inventoryId: 1, startBaronyId: 1, targetBaronyId: 2,
    resources: { pierre: 1 }, type: 'land', maxTransactions: 999,
    originUpdate: { year: 1, number: 1 }, destinationId: 20 };
  try {
    for (const state of ['{}', '{"2":{"built":2}}']) {
      await run(fixture.database, 'UPDATE players SET infrastructures=? WHERE id=10', [state]);
      await assert.rejects(createTradeTransactionAtomically(fixture.databasePath, args), /Aucun transport/);
      assert.equal((await get(fixture.database, 'SELECT pierre FROM inventaire WHERE id=1')).pierre, 8);
    }
    await run(fixture.database, 'UPDATE players SET infrastructures=? WHERE id=10', ['{"1":1,"2":1}']);
    const sends = await Promise.allSettled([createTradeTransactionAtomically(fixture.databasePath, args), createTradeTransactionAtomically(fixture.databasePath, args)]);
    assert.equal(sends.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await get(fixture.database, 'SELECT pierre FROM inventaire WHERE id=1')).pierre, 7);
    assert.equal((await get(fixture.database, 'SELECT land_transactions FROM players WHERE id=10')).land_transactions, 1);
  } finally { await closeFixture(fixture); }
});

test('un échec d’événement de conversation annule aussi l’envoi et son débit', async () => {
  const fixture = await createFixture();
  try {
    await exec(fixture.database, `CREATE TRIGGER fail_trade_message BEFORE INSERT ON character_trade_messages
      BEGIN SELECT RAISE(ABORT,'Échec du fil'); END;`);
    await assert.rejects(createTradeTransactionAtomically(fixture.databasePath, {
      seigneurieId: 10, inventoryId: 1, startBaronyId: 1, targetBaronyId: 2,
      resources: { pierre: 3 }, type: 'land', originUpdate: { year: 1, number: 1 }, destinationId: 20
    }), /Échec du fil/);
    assert.equal((await get(fixture.database, 'SELECT pierre FROM inventaire WHERE id=1')).pierre, 8);
    assert.equal((await get(fixture.database, 'SELECT land_transactions FROM players WHERE id=10')).land_transactions, 0);
    assert.equal((await get(fixture.database, 'SELECT COUNT(*) AS n FROM trade_transactions')).n, 0);
    assert.equal((await get(fixture.database, 'SELECT COUNT(*) AS n FROM character_messages')).n, 0);
  } finally { await closeFixture(fixture); }
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

 test('un voisin sans route utilise une caravane et respecte le quota sous verrou', async () => {
  const f=await createFixture();
  try {
    await run(f.database,'DELETE FROM trade_routes');
    await run(f.database,'INSERT INTO barony_connections VALUES(2,1,3)');
    const payload={seigneurieId:10,inventoryId:1,startBaronyId:1,targetBaronyId:2,resources:{pierre:1},type:'land',originUpdate:{year:1,number:1},destinationId:20,reason:null};
    await createTradeTransactionAtomically(f.databasePath,payload);
    await createTradeTransactionAtomically(f.databasePath,payload);
    await assert.rejects(createTradeTransactionAtomically(f.databasePath,payload),{message:'Limite de transactions atteinte'});
    assert.equal((await get(f.database,'SELECT pierre FROM inventaire WHERE id=1')).pierre,6);
    assert.equal((await get(f.database,'SELECT land_transactions FROM players WHERE id=10')).land_transactions,2);
    assert.equal((await get(f.database,'SELECT COUNT(*) AS n FROM trade_routes')).n,0);
    await assert.rejects(createTradeTransactionAtomically(f.databasePath,{...payload,type:'naval'}),{message:'Aucune liaison commerciale valide vers cette destination'});
  } finally {await closeFixture(f);}
 });
