const { types } = require('./playerTypes');
const { withImmediateTransaction, allSql, getSql, runSql } = require('./sqliteTransaction');

const roleIds = types.map(type => type.id);
const roleValues = roleIds.map(id => `'${id}'`).join(', ');

async function migrateConstructionTypes(dbPath) {
  await withImmediateTransaction(dbPath, async db => {
    for (const [table, holdings] of [
      ['building_properties', 'buildings'],
      ['infrastructure_properties', 'infrastructures']
    ]) {
      const columns = new Set((await allSql(db, `PRAGMA table_info(${table})`)).map(row => row.name));
      if (table === 'infrastructure_properties' && !columns.has('pirate_site')) {
        await runSql(db, `ALTER TABLE infrastructure_properties ADD COLUMN pirate_site TEXT
          CHECK (pirate_site IN ('repaire', 'depot_cotier'))`);
      }
      if (columns.has('player_type')) continue;
      const legacyRoles = roleIds.filter(id => columns.has(`available_${id}`));
      await runSql(db, `ALTER TABLE ${table} ADD COLUMN player_type TEXT NOT NULL DEFAULT 'seigneur'
        CHECK (player_type IN (${roleValues}))`);
      if (legacyRoles.length) {
        const enabledCount = legacyRoles.map(id => `(COALESCE(available_${id}, 0) = 1)`).join(' + ');
        const exclusiveRoles = legacyRoles.map(id => `WHEN available_${id} = 1 THEN '${id}'`).join(' ');
        await runSql(db, `UPDATE ${table} SET player_type = CASE
          WHEN ${enabledCount} = 1 THEN CASE ${exclusiveRoles} END ELSE 'seigneur' END`);
      }
      const conflict = await getSql(db, `SELECT p.id AS player_id, d.id AS definition_id
        FROM players p
        JOIN json_each(CASE WHEN json_valid(p.${holdings}) THEN p.${holdings} ELSE '{}' END) h
        JOIN ${table} d ON d.id = h.key
        WHERE (CASE WHEN h.type = 'object' THEN json_extract(h.value, '$.built') ELSE h.atom END) > 0
        AND d.player_type <> COALESCE(p.type, 'seigneur')
        LIMIT 1`);
      if (conflict) {
        throw new Error(`Attribution incompatible dans ${table} : définition ${conflict.definition_id}, joueur ${conflict.player_id}.`);
      }
      for (const id of legacyRoles) await runSql(db, `ALTER TABLE ${table} DROP COLUMN available_${id}`);
    }
  });
}

module.exports = { migrateConstructionTypes };
