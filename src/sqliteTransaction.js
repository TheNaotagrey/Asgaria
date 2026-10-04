const sqlite3 = require('sqlite3');

function runSql(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function getSql(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

function allSql(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || []));
  });
}

function closeSql(database) {
  return new Promise((resolve, reject) => {
    database.close(error => error ? reject(error) : resolve());
  });
}

async function withImmediateTransaction(dbPath, work) {
  const database = new sqlite3.Database(dbPath);
  database.configure('busyTimeout', 5000);
  let began = false;
  try {
    await runSql(database, 'BEGIN IMMEDIATE');
    began = true;
    const result = await work(database);
    await runSql(database, 'COMMIT');
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try { await runSql(database, 'ROLLBACK'); } catch (_) { /* Keep original failure. */ }
    }
    throw error;
  } finally {
    await closeSql(database);
  }
}

module.exports = { runSql, getSql, allSql, withImmediateTransaction };
