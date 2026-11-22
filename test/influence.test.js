const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('../scripts/fixtures/influenceDatabase.cjs');
const { convertPrestige, transferInfluence, influenceState, resolvePlayer, editInfluence, linkInfluenceQuote } = require('../services/influenceService');
const { createTradeLinkAtomically } = require('../src/tradePersistence');
const { getSql, runSql } = require('../src/sqliteTransaction');
const conversion = f => ({ dbPath: f.dbPath, actor: { id: 1 }, amount: 3, target: 'influence' });
const link = (f, extra = {}) => ({ actor: { id: 1 }, seigneurieId: 1, inventoryId: 999, startId: 1, targetId: 2, type: 'naval', storedPath: [10], distance: 999, ...extra });

test('routeur privé : connexion, contexte administrateur actif et erreur serveur explicite', async () => {
  const express = require('express');
  const http = require('node:http');
  const { createInfluenceRouter } = require('../services/influenceService');
  const f = await fixture(); const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { user: req.headers['x-user'] ? { id: Number(req.headers['x-user']), active: req.headers['x-admin'] === 'true' } : null }; next(); });
  app.use('/api/seigneurie/influence', createInfluenceRouter(f.dbPath, user => user.active));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const request = (route, headers = {}, body, method) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/seigneurie/influence' + route, method: method || (body ? 'POST' : 'GET'), headers: { ...headers, 'Content-Type': 'application/json' } }, res => {
      let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  try {
    assert.equal((await request('')).status, 401);
    assert.equal((await request('?seigneurie_id=2', { 'x-user': '1' })).status, 403);
    const admin = await request('?seigneurie_id=2', { 'x-user': '1', 'x-admin': 'true' });
    assert.equal(admin.status, 200); assert.equal(admin.body.duchy.id, 2);
    assert.equal((await request('/recipients', { 'x-user': '1' })).body.length, 2);
    const refusal = await request('/convert', { 'x-user': '1' }, { amount: 21, target: 'renommee' });
    assert.equal(refusal.status, 400); assert.match(refusal.body.error, /Prestige insuffisant/);
    assert.equal((await request('', { 'x-user': '1' }, { changes: { prestige: 22 }, expected: { prestige: 20 } }, 'PUT')).status, 403);
    assert.equal((await request('', { 'x-user': '1', 'x-admin': 'true' }, { seigneurie_id: 2, changes: { prestige: 22 }, expected: { prestige: 20 } }, 'PUT')).status, 200);
    const quote = await request('/link_influence?barony_id=2', { 'x-user': '1' });
    assert.equal(quote.status, 200); assert.deepEqual(quote.body.influence.map(item => item.name), ['Midéranne', 'Orférie']);
  } finally { await new Promise(resolve => server.close(resolve)); f.cleanup(); }
});

test('édition administrateur : tous les duchés, renommée négative, journaux et création de stock', async () => {
  const f = await fixture();
  try {
    await f.sql(db => runSql(db, "INSERT INTO duchies VALUES (3,'Ruste')"));
    const result = await editInfluence({ dbPath: f.dbPath, actor: { id: 1, isAdminActive: true }, playerId: 2,
      changes: { prestige: 25, renommee: -8, influence: [{ duchy_id: 3, amount: 7, expected: 0 }] }, expected: { prestige: 20, renommee: -2 } });
    assert.equal(result.prestige, 25); assert.equal(result.renommee, -8);
    assert.equal(result.balances.find(b => b.duchy_id === 3).amount, 7);
    assert.equal(await f.sql(async db => (await getSql(db, 'SELECT COUNT(*) n FROM admin_change_logs WHERE user_id=1')).n), 1);
    assert.equal(await f.sql(async db => (await getSql(db, 'SELECT amount FROM influence_events WHERE player_id=2')).amount), 7);
    assert.equal(await f.sql(async db => (await getSql(db, 'SELECT prestige FROM inventaire WHERE id=1')).prestige), 20);
  } finally { f.cleanup(); }
});
test('édition administrateur : autorisation, bornes, conflits et annulation de toutes les écritures', async () => {
  const f = await fixture();
  const args = { dbPath: f.dbPath, actor: { id: 1, isAdminActive: true }, playerId: 1, changes: { prestige: 22 }, expected: { prestige: 20 } };
  try {
    await assert.rejects(editInfluence({ ...args, actor: { id: 1, isAdminActive: false } }), e => e.status === 403);
    for (const changes of [{ prestige: -1 }, { renommee: 1.5 }, { prestige: '22' }, { gold: 1 }, { influence: [{ duchy_id: 1, amount: -1, expected: 10 }] }]) await assert.rejects(editInfluence({ ...args, changes }), e => e.status === 400);
    await assert.rejects(editInfluence({ ...args, expected: { prestige: 19 } }), e => e.status === 409);
    await assert.rejects(editInfluence({ ...args, changes: { prestige: 22, influence: [{ duchy_id: 2, amount: 15, expected: 9 }] } }), e => e.status === 409);
    await assert.rejects(editInfluence({ ...args, changes: { prestige: 22, influence: [{ duchy_id: 999, amount: 15, expected: 0 }] } }), /Duché introuvable/);
    assert.equal(await f.sql(async db => (await getSql(db, 'SELECT prestige FROM inventaire WHERE id=1')).prestige), 20);
    await editInfluence(args);
    await f.sql(db => runSql(db, "CREATE TRIGGER fail_admin_log BEFORE INSERT ON admin_change_logs BEGIN SELECT RAISE(ABORT,'Journal refusé'); END"));
    await assert.rejects(editInfluence({ ...args, changes: { prestige: 30 }, expected: { prestige: 22 } }), /Journal refusé/);
    assert.equal(await f.sql(async db => (await getSql(db, 'SELECT prestige FROM inventaire WHERE id=1')).prestige), 22);
  } finally { f.cleanup(); }
});
test('prévision de liaison : duchés de jure nommés et même duché regroupé', async () => {
  const f = await fixture();
  try {
    const quote = await f.sql(async db => linkInfluenceQuote(db, await resolvePlayer(db, { id: 1 }), 3));
    assert.deepEqual(quote, [{ id: 1, name: 'Midéranne', amount: 2, available: 10 }]);
    await f.sql(db => runSql(db, 'UPDATE baronies SET county_id=NULL WHERE id=3'));
    await assert.rejects(f.sql(async db => linkInfluenceQuote(db, await resolvePlayer(db, { id: 1 }), 3)), /duché de jure/);
  } finally { f.cleanup(); }
});

test('conversion irréversible : prestige vers renommée négative ou influence de jure', async () => {
  const f = await fixture();
  try {
    let result = await convertPrestige({ ...conversion(f), target: 'renommee' });
    assert.equal(result.renommee, 1); assert.equal(result.prestige, 17);
    result = await convertPrestige(conversion(f));
    assert.equal(result.prestige, 14); assert.equal(result.duchy.id, 1);
    assert.deepEqual(result.balances.map(b => b.amount), [16,10]);
    assert.equal(await f.sql(async db => (await getSql(db, 'SELECT COUNT(*) n FROM transactions')).n), 3);
    await assert.rejects(convertPrestige({ ...conversion(f), target: 'prestige' }), /Conversion inconnue/);
  } finally { f.cleanup(); }
});
test('conversion : propriétaire/admin actif, quantité stricte, rôle et duché requis', async () => {
  const f = await fixture();
  try {
    for (const amount of [0,-1,0.5,'3',Number.MAX_SAFE_INTEGER]) await assert.rejects(convertPrestige({ ...conversion(f), amount }), /entier positif/);
    await assert.rejects(convertPrestige({ ...conversion(f), playerId: 2 }), /appartient/);
    await assert.rejects(convertPrestige({ ...conversion(f), actor: null }), /autorisé/);
    await convertPrestige({ ...conversion(f), actor: { id: 1, isAdminActive: true }, playerId: 2 });
    await f.sql(db => runSql(db, "UPDATE players SET type='pirate' WHERE id=1"));
    await assert.rejects(convertPrestige(conversion(f)), /réservée/);
    await f.sql(db => runSql(db, "UPDATE players SET type='eveque' WHERE id=1"));
    await f.sql(db => runSql(db, 'UPDATE baronies SET county_id=NULL WHERE id=1'));
    await assert.rejects(convertPrestige(conversion(f)), /duché de jure/);
    await convertPrestige({ ...conversion(f), target: 'renommee' });
  } finally { f.cleanup(); }
});
test('conversions concurrentes ne dépensent pas deux fois le prestige', async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled([1,2].map(() => convertPrestige({ ...conversion(f), amount: 20 })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const state = await f.sql(async db => influenceState(db, await resolvePlayer(db, { id: 1 })));
    assert.equal(state.prestige, 0); assert.equal(state.balances[0].amount, 50);
  } finally { f.cleanup(); }
});
test('mer : 5 rhums pour une zone, or intact, une influence de chaque duché', async () => {
  const f = await fixture();
  try {
    const result = await createTradeLinkAtomically(f.dbPath, link(f));
    assert.equal(result.cost, 5); assert.equal(result.resource, 'rhum'); assert.equal(result.zones, 1);
    const inv = await f.sql(db => getSql(db, 'SELECT * FROM inventaire WHERE id=1'));
    assert.equal(inv.rhum, 95); assert.equal(inv.or_, 1000);
    const state = await f.sql(async db => influenceState(db, await resolvePlayer(db, { id: 1 })));
    assert.deepEqual(state.balances.map(b => b.amount), [9,9]);
    await assert.rejects(createTradeLinkAtomically(f.dbPath, link(f)), /existe déjà/);
  } finally { f.cleanup(); }
});
test('mer : compter les zones, indépendamment du poids des connexions', async () => {
  const f = await fixture();
  try {
    const result = await createTradeLinkAtomically(f.dbPath, link(f, { storedPath: [10,11] }));
    assert.equal(result.cost, 10); assert.equal(result.distance, 7);
  } finally { f.cleanup(); }
});
test('terre : or et deux influences du même duché', async () => {
  const f = await fixture();
  try {
    const result = await createTradeLinkAtomically(f.dbPath, link(f, { type: 'land', targetId: 3, storedPath: [] }));
    assert.equal(result.cost, 3); assert.equal(result.resource, 'or_'); assert.equal(result.influence[0].amount, 2);
    const inv = await f.sql(db => getSql(db, 'SELECT * FROM inventaire WHERE id=1'));
    assert.equal(inv.rhum, 100); assert.equal(inv.or_, 997);
  } finally { f.cleanup(); }
});
test('refus atomiques : rhum, influence distante, duché, chemin ou propriétaire', async () => {
  for (const scenario of ['rhum','influence','duchy','path','owner','insert']) {
    const f = await fixture();
    try {
      if (scenario === 'rhum') await f.sql(db => runSql(db, 'UPDATE inventaire SET rhum=4 WHERE id=1'));
      if (scenario === 'influence') await f.sql(db => runSql(db, 'DELETE FROM player_duchy_influence WHERE player_id=1 AND duchy_id=2'));
      if (scenario === 'duchy') await f.sql(db => runSql(db, 'UPDATE baronies SET county_id=NULL WHERE id=2'));
      if (scenario === 'path') await f.sql(db => runSql(db, 'DELETE FROM maritime_zone_baronies WHERE barony_id=2'));
      if (scenario === 'insert') await f.sql(db => runSql(db, "CREATE TRIGGER fail_link BEFORE INSERT ON trade_lines BEGIN SELECT RAISE(ABORT,'Échec insertion'); END"));
      await assert.rejects(createTradeLinkAtomically(f.dbPath, link(f, scenario === 'owner' ? { actor: { id: 2 } } : {})));
      const inv = await f.sql(db => getSql(db, 'SELECT * FROM inventaire WHERE id=1'));
      assert.equal(inv.rhum, scenario === 'rhum' ? 4 : 100); assert.equal(inv.or_, 1000);
      assert.equal(await f.sql(async db => (await getSql(db, 'SELECT amount FROM player_duchy_influence WHERE player_id=1 AND duchy_id=1')).amount), 10);
      assert.equal(await f.sql(async db => (await getSql(db, 'SELECT COUNT(*) n FROM influence_events')).n), 0);
    } finally { f.cleanup(); }
  }
});
test('liaisons concurrentes : une seule création et un seul débit', async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled([1,2].map(() => createTradeLinkAtomically(f.dbPath, link(f))));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(await f.sql(async db => (await getSql(db, 'SELECT rhum FROM inventaire WHERE id=1')).rhum), 95);
  } finally { f.cleanup(); }
});
test('avancement et changement de duché : les influences acquises sont conservées', async () => {
  const f = await fixture();
  const { advanceSeigneurieUpdate } = require('../services/updateService');
  try {
    await advanceSeigneurieUpdate({ dbPath: f.dbPath, actor: { id: 1 }, expectedUpdate: { year: 1026, number: 9 }, now: new Date(2026, 9, 7) });
    await f.sql(db => runSql(db, 'UPDATE baronies SET county_id=2 WHERE id=1'));
    const state = await convertPrestige(conversion(f));
    assert.equal(state.duchy.id, 2);
    assert.deepEqual(state.balances.map(b => b.amount), [10,16]);
  } finally { f.cleanup(); }
});
test('envoi : influence conserve son duché, refus insuffisant et annulation du crédit', async () => {
  const f = await fixture();
  const args = { ...conversion(f), destinationId: 2, duchyId: 1, amount: 4 };
  try {
    await transferInfluence(args);
    assert.equal(await f.sql(async db => (await getSql(db, 'SELECT amount FROM player_duchy_influence WHERE player_id=2 AND duchy_id=1')).amount), 4);
    await assert.rejects(transferInfluence({ ...args, amount: 7 }), /insuffisante/);
    await assert.rejects(transferInfluence({ ...args, destinationId: 1 }), /invalide/);
    await f.sql(db => runSql(db, "CREATE TRIGGER fail_credit BEFORE UPDATE ON player_duchy_influence WHEN NEW.player_id=2 BEGIN SELECT RAISE(ABORT,'Crédit refusé'); END"));
    await assert.rejects(transferInfluence(args), /Crédit refusé/);
    assert.equal(await f.sql(async db => (await getSql(db, 'SELECT amount FROM player_duchy_influence WHERE player_id=1 AND duchy_id=1')).amount), 6);
  } finally { f.cleanup(); }
});
