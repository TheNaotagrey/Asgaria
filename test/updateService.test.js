const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { inventaireFields } = require('../transactions');
const { runSql, getSql, withImmediateTransaction } = require('../src/sqliteTransaction');
const { advanceSeigneurieUpdate, getUpdateReport } = require('../services/updateService');

async function databaseFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-update-'));
  const dbPath = path.join(dir, 'game.db');
  const db = new sqlite3.Database(dbPath);
  await new Promise((resolve, reject) => db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE seigneurs (id INTEGER PRIMARY KEY, user_id INTEGER);
    CREATE TABLE players (id INTEGER PRIMARY KEY, seigneur_id INTEGER, population INTEGER,
      update_year INTEGER, update_number INTEGER, inventaire_id INTEGER, buildings TEXT,
      infrastructures TEXT, land_transactions INTEGER DEFAULT 0, naval_transactions INTEGER DEFAULT 0,
      player_type TEXT DEFAULT 'seigneurie', type TEXT DEFAULT 'seigneur');
    CREATE TABLE seigneuries_info (player_id INTEGER, baronnie_id INTEGER, tax_rate INTEGER, spells_cast INTEGER);
    CREATE TABLE inventaire (id INTEGER PRIMARY KEY, ${inventaireFields.map(f => `${f} INTEGER DEFAULT 0`).join(',')});
    CREATE TABLE building_properties (id INTEGER PRIMARY KEY, type TEXT, label TEXT, produces TEXT,
      production INTEGER, workers_per_building INTEGER);
    CREATE TABLE infrastructure_properties (id INTEGER PRIMARY KEY, type TEXT, label TEXT,
      effects TEXT, workers_per_building INTEGER);
    CREATE TABLE barony_properties (barony_id INTEGER, effects TEXT);
    CREATE TABLE update_policy (id INTEGER PRIMARY KEY, value TEXT);
    CREATE TABLE trade_transactions (id INTEGER PRIMARY KEY, destination_id INTEGER, origin_update_year INTEGER,
      origin_update_number INTEGER, resources TEXT, state TEXT, received INTEGER DEFAULT 0);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, seigneurie_id INTEGER, resource TEXT, amount INTEGER);
    CREATE TABLE player_update_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER,
      initiated_by_user_id INTEGER, from_year INTEGER, from_number INTEGER,
      to_year INTEGER, to_number INTEGER, ruleset_version TEXT, before_json TEXT,
      delta_json TEXT, after_json TEXT, events_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(player_id,to_year,to_number));
    CREATE VIEW seigneuries AS SELECT p.*, si.baronnie_id, si.tax_rate, si.spells_cast
      FROM players p JOIN seigneuries_info si ON si.player_id=p.id;
    INSERT INTO users VALUES (4),(5);
    INSERT INTO seigneurs VALUES (1,4),(2,5);
    INSERT INTO inventaire (id,vivres,or_) VALUES (1,2300,47),(2,10,0);
    INSERT INTO players (id,seigneur_id,population,update_year,update_number,inventaire_id,buildings,infrastructures)
      VALUES (1,1,150,1026,9,1,'{"1":{"built":1,"active":1}}','{"3":{"built":5}}'),
             (2,2,20,1026,9,2,'{}','{}');
    INSERT INTO seigneuries_info VALUES (1,NULL,8,0),(2,NULL,5,0);
    INSERT INTO building_properties VALUES (1,'field','Champ','vivres',75,3);
    INSERT INTO infrastructure_properties VALUES (3,'granary','Grenier','[{"type":"storage","resource":"vivres","amount":500}]',0);
  `, error => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  return { dbPath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('une mise à jour produit un relevé durable et refuse la répétition', async () => {
  const fixture = await databaseFixture();
  try {
    const args = { dbPath: fixture.dbPath, actor: { id: 4, isAdminActive: false },
      expectedUpdate: { year: 1026, number: 9 }, now: new Date(2026, 9, 3) };
    const report = await advanceSeigneurieUpdate(args);
    assert.equal(report.after.inventory.vivres, 125);
    assert.equal(report.after.inventory.or_, 59);
    assert.equal(report.after.population, 150);
    assert.deepEqual(report.current_update, { year: 1026, number: 10 });
    assert.equal(report.delta.inventory.vivres, -2175);
    const stored = await getUpdateReport({ dbPath: fixture.dbPath, actor: args.actor, reportId: report.id });
    assert.deepEqual(stored.after, report.after);
    await assert.rejects(advanceSeigneurieUpdate(args), error => error.status === 409 && error.code === 'update_conflict');
    await assert.rejects(getUpdateReport({ dbPath: fixture.dbPath,
      actor: { id: 5, isAdminActive: false }, reportId: report.id }), error => error.status === 404);
    const admin = await getUpdateReport({ dbPath: fixture.dbPath,
      actor: { id: 5, isAdminActive: true }, reportId: report.id });
    assert.equal(admin.id, report.id);
  } finally { fixture.cleanup(); }
});

test('un relevé impossible à insérer annule toutes les écritures', async () => {
  const fixture = await databaseFixture();
  try {
    await withImmediateTransaction(fixture.dbPath, db => runSql(db, 'DROP TABLE player_update_reports'));
    await assert.rejects(advanceSeigneurieUpdate({ dbPath: fixture.dbPath,
      actor: { id: 4, isAdminActive: false }, expectedUpdate: { year: 1026, number: 9 },
      now: new Date(2026, 9, 3) }));
    await withImmediateTransaction(fixture.dbPath, async db => {
      const player = await getSql(db, 'SELECT update_number,population FROM players WHERE id=1');
      const inventory = await getSql(db, 'SELECT vivres,or_ FROM inventaire WHERE id=1');
      assert.deepEqual(player, { update_number: 9, population: 150 });
      assert.deepEqual(inventory, { vivres: 2300, or_: 47 });
    });
  } finally { fixture.cleanup(); }
});

test('deux demandes simultanées ne produisent qu’une seule période', async () => {
  const fixture = await databaseFixture();
  try {
    const args = { dbPath: fixture.dbPath, actor: { id: 4, isAdminActive: false },
      expectedUpdate: { year: 1026, number: 9 }, now: new Date(2026, 9, 3) };
    const results = await Promise.allSettled([advanceSeigneurieUpdate(args), advanceSeigneurieUpdate(args)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.equal(rejected.reason.status, 409);
    await withImmediateTransaction(fixture.dbPath, async db => {
      const count = await getSql(db, 'SELECT COUNT(*) AS count FROM player_update_reports');
      const player = await getSql(db, 'SELECT update_number FROM players WHERE id=1');
      assert.equal(count.count, 1);
      assert.equal(player.update_number, 10);
    });
  } finally { fixture.cleanup(); }
});

test('la surcharge de travailleurs bloque la mise à jour sans mutation', async () => {
  const fixture = await databaseFixture();
  try {
    await withImmediateTransaction(fixture.dbPath, db => runSql(db,
      'UPDATE players SET population=2 WHERE id=1'));
    await assert.rejects(advanceSeigneurieUpdate({ dbPath: fixture.dbPath,
      actor: { id: 4, isAdminActive: false }, expectedUpdate: { year: 1026, number: 9 },
      now: new Date(2026, 9, 3) }), error => error.code === 'population_overload' && error.status === 400);
    await withImmediateTransaction(fixture.dbPath, async db => {
      const player = await getSql(db, 'SELECT update_number FROM players WHERE id=1');
      const inventory = await getSql(db, 'SELECT vivres FROM inventaire WHERE id=1');
      assert.equal(player.update_number, 9);
      assert.equal(inventory.vivres, 2300);
    });
  } finally { fixture.cleanup(); }
});
