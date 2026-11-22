const { withImmediateTransaction, allSql, getSql, runSql } = require('./sqliteTransaction');

const role = "TEXT NOT NULL DEFAULT 'seigneur' CHECK(player_type IN ('seigneur','eveque','pirate','mercenaire'))";
const buildingColumns = {
  type: 'TEXT UNIQUE', label: 'TEXT', player_type: role, produces: 'TEXT', production: 'REAL',
  costs: 'TEXT', max: 'TEXT', workers_per_building: 'REAL DEFAULT 0',
  restrictions: 'TEXT', infra_restrictions: 'TEXT', absolute_restrictions: 'TEXT',
  effects: 'TEXT', description: 'TEXT', tags: 'TEXT',
  rank_costs: 'TEXT', location: "TEXT CHECK(location IN ('repaire','navire','repaire_ou_navire'))",
  prerequisite_id: 'INTEGER', per_infrastructure: 'INTEGER', per_ship: 'INTEGER',
  production_costs: 'TEXT', monthly_limit: 'INTEGER'
};
const infrastructureColumns = {
  type: 'TEXT', label: 'TEXT', player_type: role, costs: 'TEXT', max: 'TEXT',
  workers_per_building: 'REAL DEFAULT 0', effects: 'TEXT', restrictions: 'TEXT',
  absolute_restrictions: 'TEXT', description: 'TEXT', tags: 'TEXT',
  revolt_destructible: 'INTEGER NOT NULL DEFAULT 1 CHECK(revolt_destructible IN (0,1))',
  pirate_site: "TEXT CHECK(pirate_site IN ('repaire','depot_cotier'))"
};
const quote = name => '"' + name.replace(/"/g, '""') + '"';

async function addColumns(db, table, definitions) {
  const columns = new Set((await allSql(db, `PRAGMA table_info(${table})`)).map(row => row.name));
  for (const [field, sqlType] of Object.entries(definitions)) {
    if (!columns.has(field)) await runSql(db, `ALTER TABLE ${table} ADD COLUMN ${quote(field)} ${sqlType.replace(' UNIQUE', '')}`);
  }
}
async function insertRow(db, table, row, allowed) {
  const fields = Object.keys(row).filter(field => allowed.has(field));
  return runSql(db, `INSERT INTO ${table}(${fields.map(quote).join(',')})
    VALUES(${fields.map(() => '?').join(',')})`, fields.map(field => row[field]));
}
async function restoreTable(db, table, definitions, oldColumns) {
  const columns = { ...definitions };
  for (const column of oldColumns) {
    if (column.name !== 'id' && !columns[column.name]) {
      if (!/^(INTEGER|REAL|TEXT|BLOB|NUMERIC)?$/i.test(column.type)) throw new Error('Type historique de colonne inconnu.');
      columns[column.name] = column.type;
    }
  }
  await runSql(db, `CREATE TABLE ${table}(id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${Object.entries(columns).map(([name, type]) => quote(name) + ' ' + type).join(',')})`);
  return new Set(['id', ...Object.keys(columns)]);
}

async function migrateConstructionCatalog(dbPath) {
  await withImmediateTransaction(dbPath, async db => {
    const unified = await getSql(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='construction_catalog'");
    let specialists = [];
    let buildingAllowed;
    if (unified) {
      const buildingView = await allSql(db, 'PRAGMA table_info(building_properties)');
      const infrastructureView = await allSql(db, 'PRAGMA table_info(infrastructure_properties)');
      const oldBuildings = await allSql(db, 'SELECT * FROM building_properties ORDER BY id');
      const oldInfrastructures = await allSql(db, 'SELECT * FROM infrastructure_properties ORDER BY id');
      const catalog = await allSql(db, 'SELECT * FROM construction_catalog ORDER BY id');
      specialists = catalog.filter(row => row.category === 'specialist').map(row => ({
        ...row, id: row.legacy_id
      }));
      for (const name of ['building_properties', 'infrastructure_properties', 'specialist_properties']) {
        await runSql(db, `DROP VIEW IF EXISTS ${name}`);
      }
      buildingAllowed = await restoreTable(db, 'building_properties', buildingColumns, buildingView);
      const infrastructureAllowed = await restoreTable(db, 'infrastructure_properties', infrastructureColumns, infrastructureView);
      for (const row of oldBuildings) {
        const merged = catalog.find(entry => entry.category === 'building' && entry.legacy_id === row.id);
        await insertRow(db, 'building_properties', { ...merged, ...row, infra_restrictions: merged.restrictions, restrictions: merged.legacy_restrictions ?? row.restrictions ?? null, id: row.id }, buildingAllowed);
      }
      for (const row of oldInfrastructures) await insertRow(db, 'infrastructure_properties', row, infrastructureAllowed);
    } else {
      await addColumns(db, 'building_properties', buildingColumns);
      await addColumns(db, 'infrastructure_properties', infrastructureColumns);
      buildingAllowed = new Set(['id', ...Object.keys(buildingColumns)]);
      const oldSpecialists = await getSql(db, "SELECT type FROM sqlite_master WHERE name='specialist_properties'");
      if (oldSpecialists?.type === 'table') {
        specialists = (await allSql(db, 'SELECT * FROM specialist_properties ORDER BY id'))
          .map(row => ({ ...row, max: row.max_count }));
      }
    }

    // Specialist recruitment has no player holdings yet. Give every imported definition a normal building id.
    const buildings = await allSql(db, 'SELECT id FROM building_properties');
    const used = new Set(buildings.map(row => row.id));
    let nextId = Math.max(0, ...used, ...specialists.map(row => row.id)) + 1;
    for (const row of specialists) {
      const id = used.has(row.id) ? nextId++ : row.id;
      used.add(id);
      await insertRow(db, 'building_properties', { ...row, id }, buildingAllowed);
    }
    if (unified) {
      const originalCount = await getSql(db, 'SELECT COUNT(*) AS count FROM construction_catalog');
      const restored = await getSql(db, `SELECT
        (SELECT COUNT(*) FROM building_properties)+(SELECT COUNT(*) FROM infrastructure_properties) AS count`);
      if (originalCount.count !== restored.count) throw new Error('La restauration des deux catalogues est incomplète.');
      const sequence = await getSql(db, "SELECT seq FROM sqlite_sequence WHERE name='construction_catalog'");
      if (sequence) await runSql(db, `UPDATE sqlite_sequence SET seq=MAX(seq,?)
        WHERE name IN ('building_properties','infrastructure_properties')`, [sequence.seq]);
      await runSql(db, 'DROP TABLE construction_catalog');
    } else {
      await runSql(db, 'DROP TABLE IF EXISTS specialist_properties');
    }
  });
}

module.exports = { buildingColumns, infrastructureColumns, migrateConstructionCatalog };
