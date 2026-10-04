const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');
const { formatUpdateLabel, getLatestUnlockedUpdate, getNextUpdatePosition } = require('../src/updateCycle');

const root = path.resolve(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const port = listener.address().port;
      listener.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, method, route, body, cookie) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = JSON.parse(raw); } catch (_) { data = raw; }
        resolve({ status: res.statusCode, data, headers: res.headers,
          cookie: res.headers['set-cookie'] && res.headers['set-cookie'][0].split(';')[0] });
      });
    });
    req.once('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Le serveur de test a quitté avant de répondre.');
    try { if ((await request(port, 'GET', '/api/baronies')).status === 200) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Le serveur de test ne répond pas.');
}

test('le serveur valide construction, taxe, période, relevé et confidentialité des fichiers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-gestion-http-'));
  const port = await freePort();
  const next = getLatestUnlockedUpdate(new Date());
  const previous = next.number === 1 ? { year: next.year - 1, number: 10 }
    : { year: next.year, number: next.number - 1 };
  assert.deepEqual(getNextUpdatePosition(previous), next);
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: dir, env: { ...process.env, PORT: String(port), SESSION_SECRET: 'test-gestion-secret' },
    stdio: 'ignore'
  });
  try {
    await waitForServer(port, child);
    assert.equal(fs.existsSync(path.join(dir, 'asgaria.db')), true);
    assert.equal(fs.existsSync(path.join(dir, 'sessions.db')), true);
    const database = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      await run(database, 'INSERT INTO users (id,email,password,is_admin) VALUES (4,?,?,0)',
        ['joueur@test.invalid', bcrypt.hashSync('mot-de-passe', 4)]);
      await run(database, 'INSERT INTO users (id,email,password,is_admin) VALUES (5,?,?,0)',
        ['autre@test.invalid', bcrypt.hashSync('mot-de-passe', 4)]);
      await run(database, 'INSERT INTO users (id,email,password,is_admin) VALUES (6,?,?,1)',
        ['admin@test.invalid', bcrypt.hashSync('mot-de-passe', 4)]);
      await run(database, 'INSERT INTO seigneurs (id,name,user_id,player) VALUES (1,?,?,1)', ['Seigneur A', 4]);
      await run(database, 'INSERT INTO seigneurs (id,name,user_id,player) VALUES (2,?,?,1)', ['Seigneur B', 5]);
      await run(database, 'INSERT INTO baronies (id,name) VALUES (1,?)', ['Baronnie fictive']);
      await run(database, 'INSERT INTO barony_properties (barony_id,field_limit) VALUES (1,1)');
      await run(database, 'INSERT INTO inventaire (id,or_,vivres) VALUES (1,50,2300),(2,0,2300)');
      await run(database, 'INSERT INTO players (id,seigneur_id,population,update_year,update_number,inventaire_id,buildings,infrastructures) VALUES (1,1,150,?,?,1,?,?),(2,2,119,?,?,2,?,?)',
        [previous.year, previous.number, '{}', '{"3":{"built":5}}', previous.year, previous.number, '{}', '{}']);
      await run(database, 'INSERT INTO seigneuries_info (player_id,baronnie_id,tax_rate,spells_cast) VALUES (1,1,5,0),(2,1,5,0)');
      await run(database, 'INSERT INTO building_properties (id,type,label,produces,production,costs,max,workers_per_building) VALUES (1,?,?,?,?,?,?,?)',
        ['field', 'Champ', 'vivres', 75, '{"or_":3}', 'field_limit', 3]);
      await run(database, 'INSERT INTO infrastructure_properties (id,type,label,effects,workers_per_building,costs) VALUES (3,?,?,?,0,?)',
        ['granary', 'Grenier', '[{"type":"storage","resource":"vivres","amount":500}]', '{"or_":4}']);
    } finally { await new Promise(resolve => database.close(resolve)); }

    const login = await request(port, 'POST', '/api/login', { email: 'joueur@test.invalid', password: 'mot-de-passe' });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const cookie = login.cookie;
    const me = await request(port, 'GET', '/api/me', undefined, cookie);
    assert.equal(me.status, 200);
    assert.equal((await request(port, 'GET', '/server.js')).status, 404);
    assert.equal((await request(port, 'GET', '/%73erver.js')).status, 404);
    assert.equal((await request(port, 'GET', '/asgaria.db')).status, 404);
    assert.equal((await request(port, 'GET', '/services/updateService.js')).status, 404);
    assert.equal((await request(port, 'GET', '/Asgaria.png')).status, 200);

    const building = await request(port, 'POST', '/api/building', { id: 1, quantity: 1 }, cookie);
    assert.equal(building.status, 200, JSON.stringify(building.data));
    assert.equal(building.data.inventaire.or_, 47);
    const tax = await request(port, 'POST', '/api/tax_rate', { tax_rate: 8 }, cookie);
    assert.equal(tax.status, 200, JSON.stringify(tax.data));
    const state = await request(port, 'GET', '/api/my_seigneurie', undefined, cookie);
    assert.equal(state.status, 200, JSON.stringify(state.data));
    assert.equal(state.data.production.vivres, -2175);
    assert.equal(state.data.production.or_, 12);
    assert.equal(state.data.latest_update_report_id, null);
    const advance = await request(port, 'POST', '/api/seigneurie/advance_update',
      { expected_update: previous }, cookie);
    assert.equal(advance.status, 200, JSON.stringify(advance.data));
    assert.equal(advance.data.report.after.inventory.vivres, 125);
    assert.equal(advance.data.report.after.inventory.or_, 59);
    const reportId = advance.data.report.id;
    const repeated = await request(port, 'POST', '/api/seigneurie/advance_update',
      { expected_update: previous }, cookie);
    assert.equal(repeated.status, 409);
    const stored = await request(port, 'GET', `/api/seigneurie/update_reports/${reportId}`, undefined, cookie);
    assert.equal(stored.status, 200);
    assert.equal(stored.data.after.inventory.vivres, 125);
    const nonAdminList = await request(port, 'GET', '/api/admin/update_reports', undefined, cookie);
    assert.notEqual(nonAdminList.status, 200);
    const adminLogin = await request(port, 'POST', '/api/login', { email: 'admin@test.invalid', password: 'mot-de-passe' });
    assert.equal(adminLogin.status, 200);
    const adminSeigneuries = await request(port, 'GET', '/api/seigneuries', undefined, adminLogin.cookie);
    assert.equal(adminSeigneuries.status, 200, JSON.stringify(adminSeigneuries.data));
    const protectedRow = adminSeigneuries.data.find(row => row.id === 2);
    assert.equal(protectedRow.beginner_protection, 1);
    assert.equal(protectedRow.tax_rate, 5);
    assert.equal(protectedRow.spells_cast, 0);
    assert.equal(protectedRow.land_transactions, 0);
    assert.equal(protectedRow.naval_transactions, 0);
    const protectionFixture = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      await run(protectionFixture, 'INSERT INTO inventaire (id) VALUES (10)');
      await run(protectionFixture, 'INSERT INTO players (id,population,inventaire_id) VALUES (10,50,10)');
      await run(protectionFixture, 'INSERT INTO seigneuries_info (player_id,baronnie_id) VALUES (10,1)');
    } finally { await new Promise(resolve => protectionFixture.close(resolve)); }
    const playerCannotDisable = await request(port, 'PUT', '/api/seigneuries/10/beginner_protection',
      { beginner_protection: 0 }, cookie);
    assert.notEqual(playerCannotDisable.status, 200);
    const cannotActivate = await request(port, 'PUT', '/api/seigneuries/10/beginner_protection',
      { beginner_protection: 1 }, adminLogin.cookie);
    assert.equal(cannotActivate.status, 400);
    const disableProtection = await request(port, 'PUT', '/api/seigneuries/10/beginner_protection',
      { beginner_protection: 0 }, adminLogin.cookie);
    assert.equal(disableProtection.status, 200, JSON.stringify(disableProtection.data));
    const disableAgain = await request(port, 'PUT', '/api/seigneuries/10/beginner_protection',
      { beginner_protection: 0 }, adminLogin.cookie);
    assert.equal(disableAgain.status, 409);
    const protectionCheck = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      assert.equal((await get(protectionCheck, 'SELECT beginner_protection FROM players WHERE id=10')).beginner_protection, 0);
    } finally { await new Promise(resolve => protectionCheck.close(resolve)); }
    const adminList = await request(port, 'GET', '/api/admin/update_reports?limit=5', undefined, adminLogin.cookie);
    assert.equal(adminList.status, 200, JSON.stringify(adminList.data));
    assert.equal(adminList.data[0].id, reportId);
    assert.equal(adminList.data[0].current_update_label, formatUpdateLabel(next));
    const stateAfter = await request(port, 'GET', '/api/my_seigneurie', undefined, cookie);
    assert.equal(stateAfter.data.latest_update_report_id, reportId);
    const deactivate = await request(port, 'POST', '/api/building/activate', { id: 1, quantity: 0 }, cookie);
    assert.equal(deactivate.status, 200, JSON.stringify(deactivate.data));
    assert.equal(deactivate.data.building.active, 0);
    const tooMany = await request(port, 'POST', '/api/building/activate', { id: 1, quantity: 2 }, cookie);
    assert.equal(tooMany.status, 400);
    assert.match(tooMany.data.error, /dépasse/);
    const invalidQuantity = await request(port, 'POST', '/api/building/activate', { id: 1, quantity: 1.5 }, cookie);
    assert.equal(invalidQuantity.status, 400);
    const reactivate = await request(port, 'POST', '/api/building/activate', { id: 1, quantity: 1 }, cookie);
    assert.equal(reactivate.status, 200, JSON.stringify(reactivate.data));
    const badProps = await request(port, 'POST', '/api/building', { id: 1, quantity: 1, props: { effect_0_remaining: 999 } }, cookie);
    assert.equal(badProps.status, 400);
    const infrastructure = await request(port, 'POST', '/api/infrastructure', { id: 3, quantity: 1 }, cookie);
    assert.equal(infrastructure.status, 200, JSON.stringify(infrastructure.data));
    assert.equal(infrastructure.data.inventaire.or_, 55);
    const invalidInfrastructure = await request(port, 'POST', '/api/infrastructure', { id: 3, quantity: 1.5 }, cookie);
    assert.equal(invalidInfrastructure.status, 400);
    const destroy = await request(port, 'POST', '/api/building/destroy', { id: 1 }, cookie);
    assert.equal(destroy.status, 200, JSON.stringify(destroy.data));
    assert.deepEqual(destroy.data.building, { id: 1, built: 0, active: 0 });
    const destroyAgain = await request(port, 'POST', '/api/building/destroy', { id: 1 }, cookie);
    assert.equal(destroyAgain.status, 400);
    assert.match(destroyAgain.data.error, /Aucun bâtiment/);
    const overloadedFixture = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      await run(overloadedFixture, "INSERT INTO seigneurs (id,name,player) VALUES (11,'Surcharge',1)");
      await run(overloadedFixture, 'INSERT INTO inventaire (id,or_,vivres) VALUES (11,20,20)');
      await run(overloadedFixture, `INSERT INTO players
        (id,seigneur_id,population,inventaire_id,buildings,infrastructures)
        VALUES (11,11,2,11,'{"1":{"built":5,"active":5}}','{}')`);
      await run(overloadedFixture, 'INSERT INTO seigneuries_info (player_id,baronnie_id) VALUES (11,1)');
      await run(overloadedFixture, `INSERT INTO building_properties (id,type,label,workers_per_building,costs)
        VALUES (2,'storage','Réserve',0,'{"or_":1}'),(3,'field_extra','Autre champ',1,'{"or_":1}')`);
    } finally { await new Promise(resolve => overloadedFixture.close(resolve)); }
    const reduceOverload = await request(port, 'POST', '/api/building/activate',
      { id: 1, quantity: 4, seigneurie_id: 11 }, adminLogin.cookie);
    assert.equal(reduceOverload.status, 200, JSON.stringify(reduceOverload.data));
    assert.equal(reduceOverload.data.employment.employed, 12);
    const neutralConstruction = await request(port, 'POST', '/api/building',
      { id: 2, quantity: 1, seigneurie_id: 11 }, adminLogin.cookie);
    assert.equal(neutralConstruction.status, 200, JSON.stringify(neutralConstruction.data));
    const worseningConstruction = await request(port, 'POST', '/api/building',
      { id: 3, quantity: 1, seigneurie_id: 11 }, adminLogin.cookie);
    assert.equal(worseningConstruction.status, 400);
    const neutralInfrastructure = await request(port, 'POST', '/api/infrastructure',
      { id: 3, quantity: 1, seigneurie_id: 11 }, adminLogin.cookie);
    assert.equal(neutralInfrastructure.status, 200, JSON.stringify(neutralInfrastructure.data));
    const destroyOverloaded = await request(port, 'POST', '/api/building/destroy',
      { id: 1, seigneurie_id: 11 }, adminLogin.cookie);
    assert.equal(destroyOverloaded.status, 200, JSON.stringify(destroyOverloaded.data));
    assert.equal(destroyOverloaded.data.building.built, 4);
    const finishReduction = await request(port, 'POST', '/api/building/activate',
      { id: 1, quantity: 0, seigneurie_id: 11 }, adminLogin.cookie);
    assert.equal(finishReduction.status, 200, JSON.stringify(finishReduction.data));
    const dbForReturns = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      await run(dbForReturns, `INSERT INTO trade_transactions
        (id,origin_id,destination_id,resources,type,state,returned) VALUES
        (80,1,2,'{"or_":5,"pierre":2}','land','Refusée',0),
        (81,1,2,'{"or_":3}','land','Refusée',0)`);
      await run(dbForReturns, `INSERT INTO trade_transactions
        (id,origin_id,destination_id,origin_update_year,origin_update_number,resources,type,state,returned)
        VALUES (82,1,2,?,?,?,?,'En Attente',0)`,
      [previous.year, previous.number, '{"or_":1}', 'land']);
      for (const [id, period] of [[83, next], [84, previous], [85, { year: previous.year - 1, number: 10 }], [86, { year: previous.year - 1, number: 10 }]]) {
        await run(dbForReturns, `INSERT INTO trade_transactions
          (id,origin_id,destination_id,origin_update_year,origin_update_number,resources,type,state)
          VALUES (?,1,2,?,?,'{"or_":1}','land','En Attente')`, [id, period.year, period.number]);
      }
      await run(dbForReturns, `CREATE TRIGGER reject_test_return BEFORE UPDATE OF returned ON trade_transactions
        WHEN NEW.id=81 BEGIN SELECT RAISE(ABORT, 'erreur de test'); END`);
    } finally { await new Promise(resolve => dbForReturns.close(resolve)); }
    const claim = await request(port, 'POST', '/api/trade_transactions/80/claim', {}, cookie);
    assert.equal(claim.status, 200, JSON.stringify(claim.data));
    assert.deepEqual(claim.data.returned, { or_: 5, pierre: 2 });
    const claimAgain = await request(port, 'POST', '/api/trade_transactions/80/claim', {}, cookie);
    assert.equal(claimAgain.status, 409);
    const claimFailure = await request(port, 'POST', '/api/trade_transactions/81/claim', {}, cookie);
    assert.equal(claimFailure.status, 500);
    const dbAfterReturns = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      assert.equal((await get(dbAfterReturns, 'SELECT returned FROM trade_transactions WHERE id=81')).returned, 0);
      assert.equal((await get(dbAfterReturns, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 60);
      assert.equal((await get(dbAfterReturns, 'SELECT COUNT(*) AS count FROM transactions WHERE seigneurie_id=1 AND resource=? AND amount=3', ['or_'])).count, 0);
    } finally { await new Promise(resolve => dbAfterReturns.close(resolve)); }

    const otherLogin = await request(port, 'POST', '/api/login', { email: 'autre@test.invalid', password: 'mot-de-passe' });
    assert.equal(otherLogin.status, 200);
    const otherCookie = otherLogin.cookie;
    for (const decisionCookie of [otherCookie, adminLogin.cookie]) {
      for (const action of ['accept', 'refuse']) {
        const futureDecision = await request(port, 'POST', '/api/trade_transactions/83/decision',
          { action, seigneurie_id: 2 }, decisionCookie);
        assert.equal(futureDecision.status, 400, JSON.stringify(futureDecision.data));
        assert.match(futureDecision.data.error, /acceptée ou refusée avant/);
      }
    }
    const unchangedTradeDb = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      const futureTrade = await get(unchangedTradeDb, 'SELECT state,decision_time FROM trade_transactions WHERE id=83');
      assert.equal(futureTrade.state, 'En Attente');
      assert.equal(futureTrade.decision_time, null);
    } finally { await new Promise(resolve => unchangedTradeDb.close(resolve)); }
    for (const [id, action] of [[84, 'accept'], [85, 'accept'], [86, 'refuse']]) {
      const allowedDecision = await request(port, 'POST', `/api/trade_transactions/${id}/decision`, { action }, otherCookie);
      assert.equal(allowedDecision.status, 200, JSON.stringify(allowedDecision.data));
    }
    const refusal = await request(port, 'POST', '/api/trade_transactions/82/decision', { action: 'refuse' }, otherCookie);
    assert.equal(refusal.status, 200, JSON.stringify(refusal.data));
    const secondDecision = await request(port, 'POST', '/api/trade_transactions/82/decision', { action: 'accept' }, otherCookie);
    assert.equal(secondDecision.status, 409);
    const forbidden = await request(port, 'GET', `/api/seigneurie/update_reports/${reportId}`, undefined, otherCookie);
    assert.equal(forbidden.status, 404);
    const noMoney = await request(port, 'POST', '/api/building', { id: 1, quantity: 1 }, otherCookie);
    assert.equal(noMoney.status, 400);
    const taxBlocked = await request(port, 'POST', '/api/tax_rate', { tax_rate: 8 }, otherCookie);
    assert.equal(taxBlocked.status, 400);
    assert.match(taxBlocked.data.error, /protection débutante/);
    const dbForFailure = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      assert.equal((await get(dbForFailure, 'SELECT beginner_protection FROM players WHERE id=2')).beginner_protection, 1);
      await run(dbForFailure, 'UPDATE players SET population=120 WHERE id=2');
      assert.equal((await get(dbForFailure, 'SELECT beginner_protection FROM players WHERE id=2')).beginner_protection, 0);
      await run(dbForFailure, 'UPDATE players SET population=119 WHERE id=2');
      assert.equal((await get(dbForFailure, 'SELECT beginner_protection FROM players WHERE id=2')).beginner_protection, 0);
      await assert.rejects(run(dbForFailure, 'UPDATE players SET beginner_protection=1 WHERE id=2'), /protection débutante/);
      await run(dbForFailure, 'INSERT INTO players (id,population) VALUES (3,5),(4,120)');
      assert.equal((await get(dbForFailure, 'SELECT beginner_protection FROM players WHERE id=3')).beginner_protection, 1);
      assert.equal((await get(dbForFailure, 'SELECT beginner_protection FROM players WHERE id=4')).beginner_protection, 0);
      await run(dbForFailure, 'UPDATE inventaire SET or_=3 WHERE id=2');
      await run(dbForFailure, `CREATE TRIGGER reject_test_building BEFORE UPDATE OF buildings ON players
        WHEN NEW.id=2 BEGIN SELECT RAISE(ABORT, 'erreur de test'); END`);
    } finally { await new Promise(resolve => dbForFailure.close(resolve)); }
    const taxAfterThreshold = await request(port, 'POST', '/api/tax_rate', { tax_rate: 8 }, otherCookie);
    assert.equal(taxAfterThreshold.status, 200, JSON.stringify(taxAfterThreshold.data));
    const formerBeginner = await request(port, 'GET', '/api/my_seigneurie', undefined, otherCookie);
    assert.equal(formerBeginner.data.seigneurie.population, 119);
    assert.equal(formerBeginner.data.seigneurie.beginner_protection, 0);
    const atomicFailure = await request(port, 'POST', '/api/building', { id: 1, quantity: 1 }, otherCookie);
    assert.equal(atomicFailure.status, 500);
    const verify = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      assert.equal((await get(verify, 'SELECT or_ FROM inventaire WHERE id=2')).or_, 3);
      assert.equal((await get(verify, 'SELECT buildings FROM players WHERE id=2')).buildings, '{}');
      assert.equal((await get(verify, 'SELECT COUNT(*) AS count FROM transactions WHERE seigneurie_id=2')).count, 0);
      await run(verify, 'UPDATE inventaire SET or_=4 WHERE id=2');
      await run(verify, `CREATE TRIGGER reject_test_infrastructure BEFORE UPDATE OF infrastructures ON players
        WHEN NEW.id=2 BEGIN SELECT RAISE(ABORT, 'erreur de test'); END`);
    } finally { await new Promise(resolve => verify.close(resolve)); }
    const infrastructureFailure = await request(port, 'POST', '/api/infrastructure', { id: 3, quantity: 1 }, otherCookie);
    assert.equal(infrastructureFailure.status, 500);
    const verifyInfrastructure = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      assert.equal((await get(verifyInfrastructure, 'SELECT or_ FROM inventaire WHERE id=2')).or_, 4);
      assert.equal((await get(verifyInfrastructure, 'SELECT infrastructures FROM players WHERE id=2')).infrastructures, '{}');
      assert.equal((await get(verifyInfrastructure, 'SELECT COUNT(*) AS count FROM transactions WHERE seigneurie_id=2')).count, 0);
    } finally { await new Promise(resolve => verifyInfrastructure.close(resolve)); }
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    const resolved = fs.realpathSync(dir);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('asgaria-gestion-http-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
