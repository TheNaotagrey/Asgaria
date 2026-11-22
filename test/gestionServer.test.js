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
  let child = spawn(process.execPath, [path.join(root, 'server.js')], {
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
        ['granary', 'Grenier', '[{"type":"storage","resource":"vivres","amount":500},{"type":"idh","amount":2}]', '{"or_":4}']);
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
    assert.equal((await request(port, 'POST', '/api/seigneurie/festival', { resources: { or_: 1 }, expected_update: previous })).status, 401);
    assert.equal((await request(port, 'POST', '/api/seigneurie/festival', { seigneurie_id: 2, resources: { vivres: 201 }, expected_update: previous }, cookie)).status, 403);
    assert.equal((await request(port, 'GET', '/api/player_festivals', undefined, cookie)).status, 404);
    assert.equal((await request(port, 'GET', '/src/happinessRules.js')).status, 200);
    const auctionScript = await request(port, 'GET', '/src/auctionRules.js');
    assert.equal(auctionScript.status, 200);
    assert.match(auctionScript.headers['content-type'], /javascript/);
    const browserContext = {};
    require('node:vm').runInNewContext(auctionScript.data, browserContext);
    assert.equal(browserContext.AuctionRules.resources.or_, 'Or');
    assert.equal(browserContext.AuctionRules.netAmount(210, 5), 199);
    assert.equal((await request(port, 'GET', '/src/sqliteTransaction.js')).status, 404);
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
    assert.equal((await request(port, 'GET', '/api/auction_house')).status, 401);
    const auctionStatus = await request(port, 'GET', '/api/auction_house', undefined, cookie);
    assert.equal(auctionStatus.status, 200);
    assert.equal(auctionStatus.data.rules.unlocked, false);
    for (const table of ['building_properties', 'infrastructure_properties']) {
      const invalidEffect = await request(port, 'POST', `/api/${table}`,
        { label: 'Bonus HV invalide', effects: '[{"type":"auction_duration_bonus","amount":1.5}]' }, adminLogin.cookie);
      assert.equal(invalidEffect.status, 400);
      assert.match(invalidEffect.data.error, /Conservation/);
      const validEffect = await request(port, 'POST', `/api/${table}`,
        { label: 'Bonus HV valide', effects: '[{"type":"auction_commission_discount","amount":2.5}]' }, adminLogin.cookie);
      assert.equal(validEffect.status, 200);
      const definitionPath = `/api/${table}/${validEffect.data.id}`;
      const definition = await request(port, 'GET', definitionPath, undefined, cookie);
      assert.equal(definition.data.player_type, 'seigneur');
      assert.ok(!Object.keys(definition.data).some(field => field.startsWith('available_')));
      assert.equal((await request(port, 'POST', `/api/${table}`,
        { label: 'Type inconnu', player_type: 'inconnu' }, adminLogin.cookie)).status, 400);
      const episcopal = await request(port, 'POST', `/api/${table}`,
        { label: 'Définition épiscopale', player_type: 'eveque' }, adminLogin.cookie);
      assert.equal(episcopal.status, 200);
      const route = table === 'building_properties' ? '/api/building' : '/api/infrastructure';
      const wrongRole = await request(port, 'POST', route, { id: episcopal.data.id, quantity: 1 }, cookie);
      assert.equal(wrongRole.status, 400);
      assert.match(wrongRole.data.error, /indisponible pour ce type/);
      const episcopalPath = `/api/${table}/${episcopal.data.id}`;
      assert.equal((await request(port, 'PUT', episcopalPath,
        { label: 'Définition renommée' }, adminLogin.cookie)).status, 200);
      assert.equal((await request(port, 'GET', episcopalPath, undefined, cookie)).data.player_type, 'eveque');
      assert.equal((await request(port, 'DELETE', episcopalPath, undefined, adminLogin.cookie)).status, 200);
      assert.equal((await request(port, 'DELETE', `/api/${table}/${validEffect.data.id}`, undefined, adminLogin.cookie)).status, 200);
    }
    const specialist = { player_type: 'mercenaire', label: 'Trésorier', max: 3,
      rank_costs: [{ or_: 12 }, { or_: 15 }, { or_: 25 }] };
    const specialistsPath = '/api/building_properties';
    assert.equal((await request(port, 'GET', specialistsPath, undefined, cookie)).status, 200);
    assert.equal((await request(port, 'POST', specialistsPath,
      { ...specialist, max: 2 }, adminLogin.cookie)).status, 400);
    const expert = await request(port, 'POST', specialistsPath, specialist, adminLogin.cookie);
    assert.equal(expert.status, 200, JSON.stringify(expert.data));
    const expertRow = await request(port, 'GET', `${specialistsPath}/${expert.data.id}`, undefined, adminLogin.cookie);
    assert.deepEqual(JSON.parse(expertRow.data.rank_costs), specialist.rank_costs);
    await request(port, 'DELETE', `${specialistsPath}/${expert.data.id}`, undefined, adminLogin.cookie);
    const infraDefinitions = await request(port, 'GET', '/api/infrastructure_properties', undefined, adminLogin.cookie);
    const granaryDefinition = infraDefinitions.data.find(row => row.id === 3);
    assert.equal(granaryDefinition.revolt_destructible, 1);
    assert.equal((await request(port, 'PUT', '/api/infrastructure_properties/3',
      { ...granaryDefinition, revolt_destructible: 0 }, cookie)).status, 403);
    assert.equal((await request(port, 'PUT', '/api/infrastructure_properties/3',
      { ...granaryDefinition, revolt_destructible: 2 }, adminLogin.cookie)).status, 400);
    assert.equal((await request(port, 'PUT', '/api/infrastructure_properties/3',
      { ...granaryDefinition, revolt_destructible: false }, adminLogin.cookie)).status, 200);
    const { revolt_destructible, ...legacyDefinition } = granaryDefinition;
    assert.equal((await request(port, 'PUT', '/api/infrastructure_properties/3', legacyDefinition, adminLogin.cookie)).status, 200);
    assert.equal((await request(port, 'GET', '/api/infrastructure_properties', undefined, cookie)).data.find(row => row.id === 3).revolt_destructible, 0);
    assert.equal((await request(port, 'PUT', '/api/infrastructure_properties/3',
      { ...granaryDefinition, revolt_destructible: true }, adminLogin.cookie)).status, 200);
    const newInfrastructure = await request(port, 'POST', '/api/infrastructure_properties',
      { label: 'Infrastructure sans réglage', type: 'civil', effects: '[]', costs: '{}' }, adminLogin.cookie);
    assert.equal(newInfrastructure.status, 200, JSON.stringify(newInfrastructure.data));
    assert.equal((await request(port, 'GET', '/api/infrastructure_properties', undefined, cookie)).data.find(row => row.id === newInfrastructure.data.id).revolt_destructible, 1);
    const adminSeigneuries = await request(port, 'GET', '/api/seigneuries', undefined, adminLogin.cookie);
    assert.equal(adminSeigneuries.status, 200, JSON.stringify(adminSeigneuries.data));
    const protectedRow = adminSeigneuries.data.find(row => row.id === 2);
    assert.equal(protectedRow.beginner_protection, 1);
    assert.equal(protectedRow.tax_rate, 5);
    assert.equal(protectedRow.spells_cast, 0);
    assert.equal(protectedRow.land_transactions, 0);
    assert.equal(protectedRow.naval_transactions, 0);
    const festivalOtherLogin = await request(port, 'POST', '/api/login', { email: 'autre@test.invalid', password: 'mot-de-passe' });
    const adminFestival = await request(port, 'POST', '/api/seigneurie/festival',
      { seigneurie_id: 2, resources: { vivres: 601 }, expected_update: previous }, adminLogin.cookie);
    assert.equal(adminFestival.status, 200, JSON.stringify(adminFestival.data));
    assert.equal(adminFestival.data.festival.bonus, 3);
    const otherState = await request(port, 'GET', '/api/my_seigneurie', undefined, festivalOtherLogin.cookie);
    assert.equal(otherState.data.festival.bonus, 3);
    assert.equal(otherState.data.revoltPreview.chance, 0);
    assert.equal(otherState.data.revoltPreview.reason, 'protected');
    assert.equal((await request(port, 'POST', '/api/seigneurie/festival',
      { resources: { vivres: 601 }, expected_update: previous }, festivalOtherLogin.cookie)).status, 409);
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
      await run(dbForReturns, "UPDATE trade_transactions SET created_at='2020-01-01 12:00:00' WHERE id=80");
      await run(dbForReturns, `INSERT INTO trade_transactions (id,origin_id,destination_id,resources,type,state)
        VALUES (90,2,10,'{"or_":4}','land','En Attente')`);
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
    const tradeThread = await request(port, 'GET', '/api/messaging/conversations/2/messages?limit=100', undefined, cookie);
    assert.equal(tradeThread.status, 200);
    assert.equal(tradeThread.data.messages.filter(item => item.event?.trade_id === 82 && item.event.kind === 'refused').length, 1);
    assert.equal(tradeThread.data.messages.find(item => item.event?.trade_id === 84).event.kind, 'accepted');
    assert.equal(tradeThread.data.messages.some(item => item.event?.trade_id === 83), false);
    assert.equal((await request(port, 'GET', '/api/trade_transactions/history')).status, 401);
    const history = await request(port, 'GET', '/api/trade_transactions/history?limit=100', undefined, cookie);
    assert.equal(history.status, 200, JSON.stringify(history.data));
    assert.equal(history.headers['cache-control'], 'no-store');
    assert.equal(history.data.transactions.length, 7);
    assert.ok(history.data.transactions.every(tx => tx.direction === 'outgoing' && tx.dest_name === 'Seigneur B'));
    assert.equal(history.data.transactions.some(tx => tx.id === 90), false);
    assert.equal(history.data.transactions[history.data.transactions.length - 1].id, 80);
    assert.equal(history.data.transactions[history.data.transactions.length - 1].returned, 1);
    assert.equal(history.data.transactions.find(tx => tx.id === 82).state, 'Refusée');
    const incomingHistory = await request(port, 'GET', '/api/trade_transactions/history?limit=100', undefined, otherCookie);
    assert.equal(incomingHistory.data.transactions.filter(tx => tx.direction === 'incoming').length, 7);
    assert.equal(incomingHistory.data.transactions.find(tx => tx.id === 90).direction, 'outgoing');
    const adminHistory = await request(port, 'GET', '/api/trade_transactions/history?seigneurie_id=2&limit=100', undefined, adminLogin.cookie);
    assert.deepEqual(adminHistory.data, incomingHistory.data);
    assert.equal((await request(port, 'GET', '/api/trade_transactions/history?seigneurie_id=2', undefined, cookie)).status, 403);
    for (const query of ['limit=0', 'limit=101', 'before=-1', 'before=90', 'before=9999']) {
      assert.equal((await request(port, 'GET', '/api/trade_transactions/history?' + query, undefined, cookie)).status, 400);
    }
    const firstHistoryPage = await request(port, 'GET', '/api/trade_transactions/history?limit=2', undefined, cookie);
    assert.equal(firstHistoryPage.data.has_more, true);
    const restHistory = await request(port, 'GET', `/api/trade_transactions/history?before=${firstHistoryPage.data.transactions[1].id}&limit=100`, undefined, cookie);
    assert.deepEqual([...firstHistoryPage.data.transactions, ...restHistory.data.transactions], history.data.transactions);
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
      assert.equal((await get(verify, 'SELECT COUNT(*) AS count FROM transactions WHERE seigneurie_id=2')).count, 1); // fête déjà journalisée
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
      assert.equal((await get(verifyInfrastructure, 'SELECT COUNT(*) AS count FROM transactions WHERE seigneurie_id=2')).count, 1); // aucune écriture en plus de la fête
    } finally { await new Promise(resolve => verifyInfrastructure.close(resolve)); }
    const portFixture = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      await run(portFixture, 'UPDATE users SET first_name=?,last_name=? WHERE id=4', ['Propriétaire','Valmont']);
      await run(portFixture, 'UPDATE barony_properties SET sea_access=1,high_sea_boat_limit=4 WHERE barony_id=1');
      await run(portFixture, 'INSERT INTO infrastructure_properties (id,type,label,effects,costs) VALUES (7,?,?,?,?)', ['civil','Port','[]','{}']);
      await run(portFixture, 'INSERT INTO building_properties (id,label,max,costs,infra_restrictions) VALUES (4,?,?,?,?)', ['Bateau en Haute-Mer','high_sea_boat_limit','{"or_":1}','{}']);
    } finally { await new Promise(resolve => portFixture.close(resolve)); }
    const beforeBoat = await request(port,'GET','/api/my_seigneurie',undefined,cookie);
    const noPort = await request(port,'POST','/api/building',{id:4,quantity:1},cookie);
    assert.equal(noPort.status,400);
    assert.match(noPort.data.error,/port est requis/);
    const afterBoat = await request(port,'GET','/api/my_seigneurie',undefined,cookie);
    assert.equal(afterBoat.data.inventaire.or_,beforeBoat.data.inventaire.or_);
    assert.deepEqual(afterBoat.data.buildings,beforeBoat.data.buildings);
    const adminOwner = await request(port,'GET','/api/my_seigneurie?seigneurie_id=1',undefined,adminLogin.cookie);
    assert.equal(adminOwner.data.seigneur.player_name,'Propriétaire Valmont');
    assert.equal(adminOwner.data.landTxMax,0);
    const withPort = new sqlite3.Database(path.join(dir,'asgaria.db'));
    try {
      await run(withPort,'UPDATE players SET infrastructures=? WHERE id=1',[JSON.stringify({...beforeBoat.data.infrastructures,7:{built:1}})]);
    } finally { await new Promise(resolve => withPort.close(resolve)); }
    const boat = await request(port,'POST','/api/building',{id:4,quantity:1},cookie);
    assert.equal(boat.status,200,JSON.stringify(boat.data));
    assert.equal(boat.data.inventaire.or_,beforeBoat.data.inventaire.or_-1);
    const sharedBuilding = await request(port, 'GET', '/api/building_properties', undefined, adminLogin.cookie);
    assert.ok(sharedBuilding.data.every(row => !('category' in row) && !('legacy_id' in row)));
    const definitionRoles = [
      { player_type: 'eveque', label: 'Champ ratio', workers_per_building: '3,333333', costs: '{}', effects: '[]' },
      { player_type: 'mercenaire', label: 'Trésorier partagé', max: '3', costs: '{}',
        rank_costs: '[{"or_":12},{"or_":15},{"or_":25}]', effects: '[]' },
      { player_type: 'pirate', label: 'Pêcheur', costs: '{}', location: 'repaire_ou_navire',
        produces: 'vivres', production: 20, effects: '[]' }
    ];
    for (const definition of definitionRoles) {
      const created = await request(port, 'POST', '/api/building_properties', definition, adminLogin.cookie);
      assert.equal(created.status, 200, JSON.stringify(created.data));
      const rowPath = `/api/building_properties/${created.data.id}`;
      const row = await request(port, 'GET', rowPath, undefined, adminLogin.cookie);
      assert.equal(row.data.player_type, definition.player_type);
      assert.ok(!('category' in row.data) && !('legacy_id' in row.data));
      assert.equal((await request(port, 'PUT', rowPath, { label: definition.label + ' renommé' }, adminLogin.cookie)).status, 200);
      assert.equal((await request(port, 'DELETE', rowPath, undefined, adminLogin.cookie)).data.changes, 1);
    }
    const testDatabase = new sqlite3.Database(path.join(dir, 'asgaria.db'));
    try {
      await run(testDatabase, "UPDATE players SET type='eveque', population=10, buildings='{}', infrastructures='{}' WHERE id=1");
      await run(testDatabase, 'UPDATE inventaire SET or_=50, hommes_darmes=0 WHERE id=1');
      const field = await request(port, 'POST', '/api/building_properties', {
        player_type: 'eveque', label: 'Champ épiscopal', produces: 'vivres', production: 75,
        workers_per_building: '3,333333', costs: '{"or_":1}', max: '20'
      }, adminLogin.cookie);
      assert.equal(field.status, 200);
      const flock = await request(port, 'POST', '/api/infrastructure_properties', {
        player_type: 'eveque', label: 'Troupeau épiscopal', type: 'civil',
        workers_per_building: 10, costs: '{"or_":1}', max: '5'
      }, adminLogin.cookie);
      assert.equal(flock.status, 200);
      const construct = (route, id, quantity) => request(port, 'POST', route, { id, quantity }, cookie);
      assert.equal((await construct('/api/building', field.data.id, 3)).status, 200);
      assert.equal((await construct('/api/infrastructure', flock.data.id, 1)).status, 200);
      const fourthField = await construct('/api/building', field.data.id, 1);
      assert.equal(fourthField.status, 400);
      assert.match(fourthField.data.error, /moines insuffisant/);
      assert.equal((await construct('/api/infrastructure', flock.data.id, 1)).status, 400);
      const projection = await request(port, 'GET', '/api/my_seigneurie', undefined, cookie);
      assert.equal(projection.data.employment.employed, 0);
      assert.equal((await get(testDatabase, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 46);
    } finally { await new Promise(resolve => testDatabase.close(resolve)); }
    {
      // Complete the deliberately minimal players added by earlier action tests before checking startup.
      const restartFixture = new sqlite3.Database(path.join(dir, 'asgaria.db'));
      try {
        await run(restartFixture, `INSERT INTO seigneuries_info(player_id)
          SELECT id FROM players WHERE id NOT IN (SELECT player_id FROM seigneuries_info)`);
      } finally { await new Promise(resolve => restartFixture.close(resolve)); }
      const stopped = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await stopped;
      child = spawn(process.execPath, [path.join(root, 'server.js')], {
        cwd: dir, env: { ...process.env, PORT: String(port), SESSION_SECRET: 'test-gestion-secret' },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let restartOutput = '';
      child.stdout.on('data', data => { restartOutput += data.toString(); });
      child.stderr.on('data', data => { restartOutput += data.toString(); });
      try { await waitForServer(port, child); }
      catch (error) { throw new Error(error.message + '\n' + restartOutput); }
      const schema = new sqlite3.Database(path.join(dir, 'asgaria.db'));
      try {
        const catalogStorage = await get(schema, `SELECT COUNT(*) AS count FROM sqlite_master
          WHERE type='table' AND name IN ('construction_catalog','building_properties','infrastructure_properties','specialist_properties')`);
        assert.equal(catalogStorage.count, 2);
      } finally { await new Promise(resolve => schema.close(resolve)); }
    }
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
