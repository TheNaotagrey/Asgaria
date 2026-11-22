const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { inventaireFields } = require('../transactions');
const { runSql, getSql, withImmediateTransaction } = require('../src/sqliteTransaction');
const { advanceSeigneurieUpdate, getUpdateReport } = require('../services/updateService');
const { festivalSchema, organizeFestival } = require('../services/festivalService');

test('une production de renommée réduit sa dette sans la remettre artificiellement à zéro', async () => {
  const fixture = await databaseFixture();
  try {
    await withImmediateTransaction(fixture.dbPath, async db => {
      await runSql(db, 'UPDATE inventaire SET renommee=-5 WHERE id=1');
      await runSql(db, "INSERT INTO building_properties VALUES (2,'civil','Renommée','renommee',2,0)");
      await runSql(db, 'UPDATE players SET buildings=? WHERE id=1', [JSON.stringify({ 1: { built: 1, active: 1 }, 2: { built: 1, active: 1 } })]);
    });
    const report = await advanceSeigneurieUpdate({ dbPath: fixture.dbPath, actor: { id: 4 }, expectedUpdate: { year: 1026, number: 9 }, now: new Date(2026, 9, 3) });
    assert.equal(report.after.inventory.renommee, -3);
    assert.equal(report.delta.inventory.renommee, 2);
  } finally { fixture.cleanup(); }
});

test('fête atomique : ressources validées, une seule fête, bonus expiré après une mise à jour', async () => {
  const fixture = await databaseFixture();
  const args = { dbPath: fixture.dbPath, actor: { id: 4 }, expectedUpdate: { year: 1026, number: 9 } };
  try {
    await assert.rejects(organizeFestival({ ...args, resources: { or_: 48 } }), e => e.code === 'insufficient_resources');
    await assert.rejects(organizeFestival({ ...args, resources: { prestige: 1 } }), e => e.code === 'invalid_resources');
    await assert.rejects(organizeFestival({ ...args, resources: { vivres: -1 } }), e => e.code === 'invalid_resources');
    await assert.rejects(organizeFestival({ ...args, playerId: 2, resources: { or_: 1 } }), e => e.status === 403);
    await assert.rejects(organizeFestival({ ...args, resources: { or_: 1 }, expectedUpdate: { year: 1026, number: 8 } }), e => e.status === 409);
    const results = await Promise.allSettled([organizeFestival({ ...args, resources: { or_: 7 } }), organizeFestival({ ...args, resources: { or_: 7 } })]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    await withImmediateTransaction(fixture.dbPath, async db => {
      assert.equal((await getSql(db, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 40);
      assert.equal((await getSql(db, 'SELECT bonus FROM player_festivals WHERE player_id=1')).bonus, 3);
    });
    const report = await advanceSeigneurieUpdate({ ...args, now: new Date(2026, 9, 3), random: () => { throw Error('débutant'); } });
    assert.equal(report.delta.happiness.festivalBonus, 3);
    assert.equal(report.delta.revolt.chance, 0);
    assert.ok(report.events.some(e => e.type === 'festival'));
    await withImmediateTransaction(fixture.dbPath, async db => assert.equal(await getSql(db, 'SELECT * FROM player_festivals'), undefined));
    const next = await advanceSeigneurieUpdate({ ...args, expectedUpdate: { year: 1026, number: 10 }, now: new Date(2027, 2, 1) });
    assert.equal(next.delta.happiness.festivalBonus, 0);
  } finally { fixture.cleanup(); }
});

test('révolte réelle : morts, vols, grenier détruit et rapport persistant', async () => {
  const fixture = await databaseFixture();
  try {
    await withImmediateTransaction(fixture.dbPath, async db => {
      await runSql(db, 'UPDATE players SET beginner_protection=0 WHERE id=1');
      await runSql(db, 'UPDATE seigneuries_info SET tax_rate=6 WHERE player_id=1');
      await runSql(db, 'UPDATE inventaire SET esclaves=20,hommes_darmes=10,prestige=100 WHERE id=1');
    });
    const report = await advanceSeigneurieUpdate({ dbPath: fixture.dbPath, actor: { id: 4 }, expectedUpdate: { year: 1026, number: 9 }, now: new Date(2026, 9, 3), random: () => 0 });
    assert.equal(report.delta.revolt.chance, 30); // base 5 - taxe 1 - esclaves 1
    assert.equal(report.delta.revolt.occurred, true);
    assert.equal(report.after.population, 144);
    assert.equal(report.after.inventory.esclaves, 19);
    assert.equal(report.after.inventory.prestige, 100);
    assert.equal(report.after.inventory.or_, 45);
    assert.deepEqual(report.delta.revolt.destroyed, []); // marché absent
    const stored = await getUpdateReport({ dbPath: fixture.dbPath, actor: { id: 4 }, reportId: report.id });
    assert.deepEqual(stored.delta.revolt, report.delta.revolt);
  } finally { fixture.cleanup(); }
});

test('révolte : capacité du grenier détruit appliquée avant la réception commerciale', async () => {
  const fixture = await databaseFixture();
  try {
    await withImmediateTransaction(fixture.dbPath, async db => {
      await runSql(db, 'UPDATE players SET population=100,beginner_protection=0 WHERE id=1');
      await runSql(db, 'UPDATE seigneuries_info SET tax_rate=6 WHERE player_id=1');
      await runSql(db, 'UPDATE inventaire SET vivres=4500 WHERE id=1');
      await runSql(db, 'INSERT INTO trade_transactions (id,destination_id,origin_update_year,origin_update_number,resources,state) VALUES (9,1,1026,10,?,?)', ['{"vivres":500}', 'Approuvée']);
    });
    const report = await advanceSeigneurieUpdate({ dbPath: fixture.dbPath, actor: { id: 4 }, expectedUpdate: { year: 1026, number: 9 }, now: new Date(2026, 9, 3), random: () => 0 });
    assert.equal(report.delta.revolt.chance, 15);
    assert.equal(report.after.infrastructures[3].built, 4);
    assert.equal(report.after.inventory.vivres, 2500);
    assert.ok(report.events.some(e => e.type === 'revolt_overflow'));
    assert.ok(report.events.some(e => e.type === 'delivery_overflow'));
  } finally { fixture.cleanup(); }
});

test('erreur du relevé : annule fête consommée, révolte et toutes ses pertes', async () => {
  const fixture = await databaseFixture();
  try {
    const args = { dbPath: fixture.dbPath, actor: { id: 4 }, expectedUpdate: { year: 1026, number: 9 } };
    await organizeFestival({ ...args, resources: { or_: 1 } });
    await withImmediateTransaction(fixture.dbPath, async db => {
      await runSql(db, 'UPDATE players SET beginner_protection=0 WHERE id=1');
      await runSql(db, 'DROP TABLE player_update_reports');
    });
    await assert.rejects(advanceSeigneurieUpdate({ ...args, now: new Date(2026, 9, 3), random: () => 0 }));
    await withImmediateTransaction(fixture.dbPath, async db => {
      assert.equal((await getSql(db, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 46);
      assert.equal((await getSql(db, 'SELECT population FROM players WHERE id=1')).population, 150);
      assert.ok(await getSql(db, 'SELECT * FROM player_festivals WHERE player_id=1'));
    });
  } finally { fixture.cleanup(); }
});

async function databaseFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-update-'));
  const dbPath = path.join(dir, 'game.db');
  const db = new sqlite3.Database(dbPath);
  await new Promise((resolve, reject) => db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE seigneurs (id INTEGER PRIMARY KEY, user_id INTEGER, religion_id INTEGER);
    CREATE TABLE baronies (id INTEGER PRIMARY KEY, religion_pop_id INTEGER);
    CREATE TABLE players (id INTEGER PRIMARY KEY, seigneur_id INTEGER, population INTEGER,
      update_year INTEGER, update_number INTEGER, inventaire_id INTEGER, buildings TEXT,
      infrastructures TEXT, land_transactions INTEGER DEFAULT 0, naval_transactions INTEGER DEFAULT 0,
      player_type TEXT DEFAULT 'seigneurie', type TEXT DEFAULT 'seigneur', beginner_protection INTEGER DEFAULT 1);
    ${festivalSchema}
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
    INSERT INTO seigneurs VALUES (1,4,1),(2,5,1);
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

test('une mise à jour renouvelle les conversions par bâtiment et les limites partagées', async () => {
  const fixture = await databaseFixture();
  try {
    await withImmediateTransaction(fixture.dbPath, async db => {
      await runSql(db, 'INSERT INTO infrastructure_properties VALUES (6,?,?,?,0)', ['civil','Forge', JSON.stringify([
        { type:'instant_production', uses_per_month:10 },
        { type:'instant_production', uses_per_month:1, per_building:false }
      ])]);
      await runSql(db, 'UPDATE players SET infrastructures=? WHERE id=1', [JSON.stringify({ 3:{built:5}, 6:{built:2,effect_0_remaining:0,effect_1_remaining:0,effect_2_workers:4} })]);
    });
    await advanceSeigneurieUpdate({ dbPath:fixture.dbPath, actor:{id:4}, expectedUpdate:{year:1026,number:9}, now:new Date(2026,9,3) });
    await withImmediateTransaction(fixture.dbPath, async db => {
      const player = await getSql(db, 'SELECT infrastructures FROM players WHERE id=1');
      const forge = JSON.parse(player.infrastructures)[6];
      assert.deepEqual(forge, { built:2,effect_0_remaining:20,effect_1_remaining:1,effect_2_workers:4 });
    });
  } finally { fixture.cleanup(); }
});

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
