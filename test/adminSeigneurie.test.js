const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, method, route, body, cookie) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port, path: route, method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { Cookie: cookie } : {})
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] });
      });
    });
    req.once('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function run(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, error => error ? reject(error) : resolve());
  });
}

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Le serveur de test a quitté prématurément.');
    try {
      if ((await request(port, 'GET', '/api/baronies')).status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Le serveur de test ne répond pas.');
}

test('la création administrative conserve le type, le lien d’inventaire et les états JSON', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-admin-create-'));
  const port = await getFreePort();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: directory,
    env: { ...process.env, PORT: String(port), SESSION_SECRET: 'test-session-secret' },
    stdio: 'ignore'
  });
  try {
    await waitForServer(port, child);
    const database = new sqlite3.Database(path.join(directory, 'asgaria.db'));
    try {
      await run(database, 'INSERT INTO users (id,email,password,is_admin) VALUES (1,?,?,1)',
        ['admin-test@example.invalid', bcrypt.hashSync('mot-de-passe-test', 4)]);
    } finally {
      await new Promise(resolve => database.close(resolve));
    }

    const login = await request(port, 'POST', '/api/login', {
      email: 'admin-test@example.invalid', password: 'mot-de-passe-test'
    });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);

    const created = await request(port, 'POST', '/api/seigneuries', {
      type: 'eveque', population: 12, or_: 37
    }, login.cookie);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const list = await request(port, 'GET', '/api/seigneuries', undefined, login.cookie);
    assert.equal(list.status, 200);
    const seigneurie = list.data.find(row => row.id === created.data.id);
    assert.ok(seigneurie);
    assert.equal(seigneurie.type, 'eveque');
    assert.equal(seigneurie.inventaire_id, created.data.inventaire_id);
    assert.equal(seigneurie.or_, 37);
    assert.equal(seigneurie.buildings, '{}');
    assert.equal(seigneurie.infrastructures, '{}');

    const defaultType = await request(port, 'POST', '/api/seigneuries', { population: 5 }, login.cookie);
    assert.equal(defaultType.status, 200, JSON.stringify(defaultType.data));
    const updatedList = await request(port, 'GET', '/api/seigneuries', undefined, login.cookie);
    assert.equal(updatedList.data.find(row => row.id === defaultType.data.id)?.type, 'seigneur');

    const invalid = await request(port, 'POST', '/api/seigneuries', { type: 'inconnu' }, login.cookie);
    assert.equal(invalid.status, 400);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('asgaria-admin-create-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
