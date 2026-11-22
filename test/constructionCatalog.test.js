const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('../scripts/fixtures/auctionDatabase.cjs');
const { migrateConstructionCatalog } = require('../src/constructionCatalogMigration');
const { allSql, getSql, runSql } = require('../src/sqliteTransaction');

async function createUnifiedFixture(f, duplicate = false) {
  await f.sql(async db => {
    await runSql(db, 'DROP TABLE building_properties');
    await runSql(db, 'DROP TABLE infrastructure_properties');
    await new Promise((resolve, reject) => db.exec(`
      CREATE TABLE construction_catalog(
        id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, legacy_id INTEGER, player_type TEXT,
        type TEXT,label TEXT,costs TEXT,max TEXT,workers_per_building REAL,restrictions TEXT,
        legacy_restrictions TEXT,effects TEXT,produces TEXT,production REAL,rank_costs TEXT,
        location TEXT,prerequisite_id INTEGER,production_costs TEXT);
      INSERT INTO construction_catalog(category,legacy_id,player_type,type,label,costs,max,workers_per_building,restrictions,effects)
        VALUES('building',1,'seigneur','field','Champ','{"or_":3}','10',3,'{"infrastructures":{"1":1}}','[]');
      INSERT INTO construction_catalog(category,legacy_id,player_type,type,label,costs,effects,location)
        VALUES('infrastructure',1,'pirate','civil','Distillerie','{}','[]','repaire');
      INSERT INTO construction_catalog(category,legacy_id,player_type,label,costs,max,rank_costs,effects,location,prerequisite_id,production_costs)
        VALUES('specialist',1,'pirate','Distilleur','{"or_":7}','3','[]','[]','repaire',1,'{"vivres":15}');
      CREATE VIEW building_properties AS SELECT legacy_id AS id,type,label,player_type,costs,max,
        workers_per_building,restrictions AS infra_restrictions,legacy_restrictions AS restrictions,effects
        FROM construction_catalog WHERE category='building';
      CREATE VIEW infrastructure_properties AS SELECT legacy_id AS id,type,label,player_type,costs,effects,
        location AS pirate_site FROM construction_catalog WHERE category='infrastructure';
      CREATE VIEW specialist_properties AS SELECT legacy_id AS id,label FROM construction_catalog WHERE category='specialist';
    `, error => error ? reject(error) : resolve()));
    await runSql(db, `UPDATE players SET buildings='{"1":{"built":3,"active":2}}' WHERE id=1`);
    if (duplicate) await runSql(db, `INSERT INTO construction_catalog(category,legacy_id,player_type,type,label)
      VALUES('building',2,'seigneur','field','Doublon')`);
  });
}

test('deux tables par nature : spécialistes et rôles regroupés dans les bâtiments, ids simples et références conservées', async () => {
  const f = await fixture();
  try {
    await createUnifiedFixture(f);
    const before = await f.sql(db => getSql(db, 'SELECT buildings,infrastructures FROM players WHERE id=1'));
    await migrateConstructionCatalog(f.dbPath);
    await migrateConstructionCatalog(f.dbPath);
    await f.sql(async db => {
      assert.deepEqual(await getSql(db, 'SELECT buildings,infrastructures FROM players WHERE id=1'), before);
      const storage = await allSql(db, `SELECT name,type FROM sqlite_master
        WHERE name IN ('construction_catalog','building_properties','infrastructure_properties','specialist_properties') ORDER BY name`);
      assert.deepEqual(storage, [
        { name: 'building_properties', type: 'table' }, { name: 'infrastructure_properties', type: 'table' }
      ]);
      const buildings = await allSql(db, 'SELECT * FROM building_properties ORDER BY id');
      assert.equal(buildings.length, 2);
      assert.equal(buildings[0].id, 1);
      assert.equal(buildings[0].infra_restrictions, '{"infrastructures":{"1":1}}');
      assert.equal(buildings[1].label, 'Distilleur');
      assert.notEqual(buildings[1].id, buildings[0].id);
      assert.equal(buildings[1].prerequisite_id, 1);
      assert.equal(buildings[1].production_costs, '{"vivres":15}');
      assert.equal((await getSql(db, 'SELECT label FROM infrastructure_properties WHERE id=1')).label, 'Distillerie');
      for (const table of ['building_properties','infrastructure_properties']) {
        const columns = await allSql(db, `PRAGMA table_info(${table})`);
        assert.ok(!columns.some(column => ['category','legacy_id'].includes(column.name)));
      }
    });
  } finally { f.cleanup(); }
});

test('une erreur de restauration conserve toute la base consolidée sous transaction', async () => {
  const f = await fixture();
  try {
    await createUnifiedFixture(f, true);
    await assert.rejects(migrateConstructionCatalog(f.dbPath), /UNIQUE/);
    await f.sql(async db => {
      assert.equal((await getSql(db, "SELECT COUNT(*) AS count FROM construction_catalog")).count, 4);
      assert.equal((await getSql(db, "SELECT type FROM sqlite_master WHERE name='building_properties'")).type, 'view');
    });
  } finally { f.cleanup(); }
});

test('une base avec les deux tables historiques accueille les spécialistes sans créer de catalogue supplémentaire', async () => {
  const f = await fixture();
  try {
    await f.sql(async db => {
      await runSql(db, "INSERT INTO building_properties(id,label) VALUES(1,'Champ')");
      await runSql(db, `CREATE TABLE specialist_properties(id INTEGER PRIMARY KEY,player_type TEXT,label TEXT,max_count INTEGER,rank_costs TEXT)`);
      await runSql(db, `INSERT INTO specialist_properties VALUES(1,'mercenaire','Trésorier',3,'[{"or_":12},{"or_":15},{"or_":25}]')`);
    });
    await migrateConstructionCatalog(f.dbPath);
    await f.sql(async db => {
      const expert = await getSql(db, "SELECT * FROM building_properties WHERE player_type='mercenaire'");
      assert.notEqual(expert.id, 1);
      assert.equal(expert.max, '3');
      assert.equal(expert.rank_costs, '[{"or_":12},{"or_":15},{"or_":25}]');
      assert.equal(await getSql(db, "SELECT name FROM sqlite_master WHERE name='specialist_properties'"), undefined);
    });
  } finally { f.cleanup(); }
});
