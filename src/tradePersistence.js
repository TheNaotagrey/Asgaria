const sqlite3 = require('sqlite3');

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
    resources, type, maxTransactions, originUpdate, destinationId, reason
  } = transaction;
  return withTransaction(databasePath, async database => {
    const table = tradeLinkTableFor(type);
    const link = await getSql(database,
      `SELECT id FROM ${table} WHERE (barony_id_1=? AND barony_id_2=?) OR (barony_id_1=? AND barony_id_2=?) LIMIT 1`,
      [startBaronyId, targetBaronyId, targetBaronyId, startBaronyId]);
    if (!link) throw clientError('Aucune liaison commerciale valide vers cette destination');

    const fields = Object.keys(resources);
    const amounts = fields.map(field => resources[field]);
    const balanceUpdate = await runSql(database,
      `UPDATE inventaire SET ${fields.map(field => `${field}=${field}-?`).join(', ')} WHERE id=? AND ${fields.map(field => `${field}>=?`).join(' AND ')}`,
      [...amounts, inventoryId, ...amounts]);
    if (balanceUpdate.changes !== 1) throw clientError('Ressources insuffisantes');

    const counterField = type === 'naval' ? 'naval_transactions' : 'land_transactions';
    const counter = await runSql(database,
      maxTransactions > 0
        ? `UPDATE players SET ${counterField}=${counterField}+1 WHERE id=? AND ${counterField}<?`
        : `UPDATE players SET ${counterField}=${counterField}+1 WHERE id=?`,
      maxTransactions > 0 ? [seigneurieId, maxTransactions] : [seigneurieId]);
    if (counter.changes !== 1) throw clientError('Limite de transactions atteinte');

    for (const field of fields) {
      await runSql(database, 'INSERT INTO transactions (seigneurie_id, resource, amount) VALUES (?,?,?)',
        [seigneurieId, field, -resources[field]]);
    }
    const created = await runSql(database,
      'INSERT INTO trade_transactions (origin_id, destination_id, origin_update_year, origin_update_number, resources, type, state, reason) VALUES (?,?,?,?,?,?,?,?)',
      [seigneurieId, destinationId, originUpdate.year, originUpdate.number, JSON.stringify(resources), type, 'En Attente', reason]);
    return created.lastID;
  });
}

async function createTradeLinkAtomically(databasePath, link) {
  const { seigneurieId, inventoryId, startId, targetId, type, storedPath, distance } = link;
  return withTransaction(databasePath, async database => {
    const table = tradeLinkTableFor(type);
    const existing = await getSql(database,
      `SELECT id FROM ${table} WHERE (barony_id_1=? AND barony_id_2=?) OR (barony_id_1=? AND barony_id_2=?) LIMIT 1`,
      [startId, targetId, targetId, startId]);
    if (existing) throw clientError('Cette liaison commerciale existe déjà');
    const cost = distance * 3;
    const debit = await runSql(database, 'UPDATE inventaire SET or_=or_-? WHERE id=? AND or_>=?', [cost, inventoryId, cost]);
    if (debit.changes !== 1) throw clientError('Ressources insuffisantes');
    await runSql(database, 'INSERT INTO transactions (seigneurie_id, resource, amount) VALUES (?,?,?)', [seigneurieId, 'or_', -cost]);
    const created = await runSql(database, `INSERT INTO ${table} (barony_id_1, barony_id_2, path) VALUES (?,?,?)`,
      [startId, targetId, JSON.stringify(storedPath)]);
    return created.lastID;
  });
}

module.exports = { createTradeTransactionAtomically, createTradeLinkAtomically };
