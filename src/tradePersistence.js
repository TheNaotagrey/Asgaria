const sqlite3 = require('sqlite3');
const { tradeCapacity } = require('./gameRules');
const { recordTradeMessage } = require('../services/tradeMessagingService');
const { resolvePlayer, linkInfluenceQuote, debitInfluence } = require('../services/influenceService');

function clientError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function runSql(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function getSql(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

async function withTransaction(databasePath, work) {
  const database = new sqlite3.Database(databasePath);
  database.configure('busyTimeout', 5000);
  try {
    await runSql(database, 'BEGIN IMMEDIATE');
    const result = await work(database);
    await runSql(database, 'COMMIT');
    return result;
  } catch (error) {
    try { await runSql(database, 'ROLLBACK'); } catch {}
    throw error;
  } finally {
    database.close();
  }
}

function tradeLinkTableFor(type) {
  return type === 'naval' ? 'trade_lines' : 'trade_routes';
}

async function createTradeTransactionAtomically(databasePath, transaction) {
  const {
    seigneurieId, inventoryId, startBaronyId, targetBaronyId,
    resources, type, originUpdate, destinationId, reason
  } = transaction;
  return withTransaction(databasePath, async database => {
    const table = tradeLinkTableFor(type);
    const link = await getSql(database,
      `SELECT id FROM ${table} WHERE (barony_id_1=? AND barony_id_2=?) OR (barony_id_1=? AND barony_id_2=?) LIMIT 1`,
      [startBaronyId, targetBaronyId, targetBaronyId, startBaronyId]);
    const neighbor = !link && type === 'land' && await getSql(database,
      'SELECT 1 FROM barony_connections WHERE (barony_id_1=? AND barony_id_2=?) OR (barony_id_1=? AND barony_id_2=?)',
      [startBaronyId,targetBaronyId,targetBaronyId,startBaronyId]);
    if (!link && !neighbor) throw clientError('Aucune liaison commerciale valide vers cette destination');

    // Re-read the transport and its prerequisites under the same lock as the debit.
    const player = await getSql(database, 'SELECT infrastructures FROM players WHERE id=?', [seigneurieId]);
    if (!player) throw clientError('Joueur introuvable');
    const properties = await new Promise((resolve, reject) => database.all('SELECT * FROM infrastructure_properties', [], (error, rows) => error ? reject(error) : resolve(rows)));
    const barony = await getSql(database, 'SELECT effects FROM barony_properties WHERE barony_id=?', [startBaronyId]);
    const maxTransactions = tradeCapacity(player.infrastructures, properties, barony)[type];
    if (!(maxTransactions > 0)) throw clientError('Aucun transport commercial disponible avec ses infrastructures requises.');

    const fields = Object.keys(resources);
    const amounts = fields.map(field => resources[field]);
    const balanceUpdate = await runSql(database,
      `UPDATE inventaire SET ${fields.map(field => `${field}=${field}-?`).join(', ')} WHERE id=? AND ${fields.map(field => `${field}>=?`).join(' AND ')}`,
      [...amounts, inventoryId, ...amounts]);
    if (balanceUpdate.changes !== 1) throw clientError('Ressources insuffisantes');

    const counterField = type === 'naval' ? 'naval_transactions' : 'land_transactions';
    const counter = await runSql(database,
      `UPDATE players SET ${counterField}=${counterField}+1 WHERE id=? AND ${counterField}<?`,
      [seigneurieId, maxTransactions]);
    if (counter.changes !== 1) throw clientError('Limite de transactions atteinte');

    for (const field of fields) {
      await runSql(database, 'INSERT INTO transactions (seigneurie_id, resource, amount) VALUES (?,?,?)',
        [seigneurieId, field, -resources[field]]);
    }
    const created = await runSql(database,
      "INSERT INTO trade_transactions (origin_id, destination_id, origin_update_year, origin_update_number, resources, type, state, reason, created_at) VALUES (?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      [seigneurieId, destinationId, originUpdate.year, originUpdate.number, JSON.stringify(resources), type, 'En Attente', reason]);
    await recordTradeMessage(database, created.lastID, 'sent');
    return created.lastID;
  });
}

async function createTradeLinkAtomically(databasePath, link) {
  const { seigneurieId, startId, targetId, type, storedPath } = link;
  if (!['land', 'naval'].includes(type)) throw clientError('Type de liaison invalide.');
  return withTransaction(databasePath, async database => {
    const table = tradeLinkTableFor(type);
    const existing = await getSql(database,
      `SELECT id FROM ${table} WHERE (barony_id_1=? AND barony_id_2=?) OR (barony_id_1=? AND barony_id_2=?) LIMIT 1`,
      [startId, targetId, targetId, startId]);
    if (existing) throw clientError('Cette liaison commerciale existe déjà');
    const player = await resolvePlayer(database, link.actor, link.playerId);
    if (player.id !== seigneurieId || player.baronnie_id !== startId) throw clientError('La seigneurie a changé. Rechargez la page.');
    if (!['seigneur', 'eveque'].includes(player.type || 'seigneur')) throw clientError('Ce rôle ne peut pas construire de liaison commerciale.');
    const target = await getSql(database, 'SELECT seigneur_id FROM baronies WHERE id=?', [targetId]);
    if (!target || !target.seigneur_id || startId === targetId) throw clientError('Baronnie de destination invalide.');
    const path = type === 'naval' ? storedPath : [startId, ...storedPath, targetId];
    if (!path.length || path.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(path).size !== path.length) throw clientError('Chemin invalide.');
    // La carte peut changer entre la prévisualisation et le débit : relire sous verrou.
    if (type === 'naval') {
      for (const [baronyId, zoneId] of [[startId, path[0]], [targetId, path[path.length - 1]]]) {
        if (!await getSql(database, 'SELECT 1 FROM maritime_zone_baronies WHERE barony_id=? AND zone_id=?', [baronyId, zoneId])) throw clientError('Le chemin maritime ne touche pas les deux baronnies.');
      }
    }
    let distance = 0;
    for (let index = 1; index < path.length; index++) {
      const connectionTable = type === 'naval' ? 'maritime_zone_connections' : 'barony_connections';
      const prefix = type === 'naval' ? 'zone' : 'barony';
      const edge = await getSql(database, `SELECT distance FROM ${connectionTable} WHERE (${prefix}_id_1=? AND ${prefix}_id_2=?) OR (${prefix}_id_1=? AND ${prefix}_id_2=?)`, [path[index-1], path[index], path[index], path[index-1]]);
      if (!edge) throw clientError('Le chemin contient des étapes non adjacentes.');
      distance += Number(edge.distance) > 0 ? Number(edge.distance) : 1;
    }
    const influence = await linkInfluenceQuote(database, player, targetId);
    const resource = type === 'naval' ? 'rhum' : 'or_';
    const cost = type === 'naval' ? path.length * 5 : distance * 3;
    if (!Number.isSafeInteger(cost) || cost < 1) throw clientError('Coût de liaison invalide.');
    const debit = await runSql(database, `UPDATE inventaire SET ${resource}=${resource}-? WHERE id=? AND ${resource}>=?`, [cost, player.inventaire_id, cost]);
    if (debit.changes !== 1) throw clientError(`Ressources insuffisantes : ${type === 'naval' ? 'rhum' : 'or'}.`);
    for (const item of influence) await debitInfluence(database, player.id, item, item.amount, 'Création de liaison commerciale');
    await runSql(database, 'INSERT INTO transactions (seigneurie_id, resource, amount) VALUES (?,?,?)', [seigneurieId, resource, -cost]);
    const created = await runSql(database, `INSERT INTO ${table} (barony_id_1, barony_id_2, path) VALUES (?,?,?)`,
      [startId, targetId, JSON.stringify(storedPath)]);
    return { id: created.lastID, cost, resource, influence, distance, zones: type === 'naval' ? path.length : undefined };
  });
}

module.exports = { createTradeTransactionAtomically, createTradeLinkAtomically };
