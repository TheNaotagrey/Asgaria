const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('sqlite3');

const serverPath = path.join(__dirname, '..', 'server.js');

function query(database, sql) {
  return new Promise((resolve, reject) => {
    database.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function execute(database, sql) {
  return new Promise((resolve, reject) => {
    database.exec(sql, error => error ? reject(error) : resolve());
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function startAndRead(directory) {
  const port = await freePort();
  const child = spawn(process.execPath, [serverPath], {
    cwd: directory,
    env: { ...process.env, PORT: String(port), SESSION_SECRET: 'test-session-secret' },
    stdio: 'ignore'
  });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Le serveur de test a quitté prématurément.');
      const database = new sqlite3.Database(path.join(directory, 'asgaria.db'), sqlite3.OPEN_READONLY);
      try {
        const rows = await query(database, 'SELECT id, baronnie_id, tax_rate, spells_cast, type, beginner_protection FROM seigneuries ORDER BY id');
        if (rows.length === 2) return rows;
      } catch (error) {
        if (attempt === 99) throw error;
      } finally {
        await new Promise(resolve => database.close(resolve));
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('La migration des seigneuries historiques ne s’est pas terminée.');
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
  }
}

test('la migration conserve les joueurs historiques et reste idempotente', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-legacy-migration-'));
  try {
    const database = new sqlite3.Database(path.join(directory, 'asgaria.db'));
    try {
      await execute(database, `CREATE TABLE players (
        id INTEGER PRIMARY KEY,
        baronnie_id INTEGER,
        seigneur_id INTEGER,
        population INTEGER,
        inventaire_id INTEGER,
        player_type TEXT DEFAULT 'seigneurie',
        tax_rate INTEGER DEFAULT 5,
        spells_cast INTEGER DEFAULT 0
      );
      INSERT INTO players (id, baronnie_id, tax_rate, spells_cast) VALUES
        (1, 42, 11, 3), (2, NULL, 5, 0);`);
    } finally {
      await new Promise(resolve => database.close(resolve));
    }

    const expected = [
      { id: 1, baronnie_id: 42, tax_rate: 11, spells_cast: 3, type: 'seigneur', beginner_protection: 0 },
      { id: 2, baronnie_id: null, tax_rate: 5, spells_cast: 0, type: 'seigneur', beginner_protection: 0 }
    ];
    assert.deepEqual(await startAndRead(directory), expected);
    assert.deepEqual(await startAndRead(directory), expected);
    const migrated = new sqlite3.Database(path.join(directory, 'asgaria.db'), sqlite3.OPEN_READONLY);
    try {
      const reports = await query(migrated, "SELECT name FROM sqlite_master WHERE name IN ('player_update_reports','idx_player_update_reports_player_created') ORDER BY name");
      assert.deepEqual(reports.map(row => row.name), ['idx_player_update_reports_player_created', 'player_update_reports']);
    } finally { await new Promise(resolve => migrated.close(resolve)); }
  } finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('asgaria-legacy-migration-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
