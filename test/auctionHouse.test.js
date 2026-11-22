const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../src/auctionRules');
const { withImmediateTransaction, getSql, runSql, allSql } = require('../src/sqliteTransaction');
const { auctionSchema, depositOffer, buyOffer, withdrawOffer, readAuction, createAuctionRouter } = require('../services/auctionHouseService');
const { advanceSeigneurieUpdate } = require('../services/updateService');

test('HV : règles de base, effets actifs cumulés et arrondis exacts', () => {
  const bp = [{ id: 1, label: 'Comptoir', effects: JSON.stringify([
    { type: 'auction_commission_discount', amount: 1.5 }, { type: 'auction_max_offers_bonus', amount: 2 },
    { type: 'unlock_page', page: 'hotel_des_ventes' }
  ]) }];
  const ip = [{ id: 2, label: 'Banque', effects: JSON.stringify([
    { type: 'auction_commission_discount', amount: 4 }, { type: 'auction_withdrawal_loss_discount', amount: 7 },
    { type: 'auction_expiration_loss_discount', amount: 20 }, { type: 'auction_duration_bonus', amount: 3 }
  ]) }];
  const rules = Rules.calculateRules({ buildings: { 1: { built: 5, active: 2 } }, infrastructures: { 2: { built: 2 } } }, bp, ip);
  assert.equal(rules.commission, 0); assert.equal(rules.maxOffers, 9); assert.equal(rules.duration, 16);
  assert.equal(rules.withdrawalLoss, 16); assert.equal(rules.expirationLoss, 0); assert.equal(rules.unlocked, true);
  assert.equal(Rules.calculateRules({ buildings: { 1: { built: 1, active: 0 } } }, bp).unlocked, false);
  assert.equal(Rules.netAmount(210, 5), 199); assert.equal(Rules.netAmount(90, 30), 63);
  assert.equal(Rules.netAmount(1, 5), 0); assert.equal(Rules.netAmount(100, 2.5), 97);
  assert.equal(Rules.netAmount(Number.MAX_SAFE_INTEGER, 0), Number.MAX_SAFE_INTEGER);
  for (const value of [-1, NaN, Infinity, '2', null]) assert.throws(() => Rules.validateEffects([{ type: 'auction_commission_discount', amount: value }]));
  assert.throws(() => Rules.validateEffects([{ type: 'auction_duration_bonus', amount: 1.5 }]));
  assert.throws(() => Rules.validateEffects('{}'));
});

const fixture = require('../scripts/fixtures/auctionDatabase.cjs');
const buyBody = { price_index: 0, transport: 'naval', expected_update: { year: 1026, number: 9 } };

test('paiement de la même ressource : fonds bruts requis et capacité calculée après débit', async () => {
  const f = await fixture();
  try {
    const offer = await f.deposit({ lot: { resource: 'vivres', amount: 50 }, prices: [{ resource: 'vivres', amount: 10 }] });
    await f.sql(db => runSql(db, 'UPDATE inventaire SET vivres=0 WHERE id=2'));
    await assert.rejects(buyOffer({ ...f.args(2), offerId: offer.offer.id, body: buyBody }), e => e.code === 'insufficient_resources');
    await f.sql(async db => {
      await runSql(db, 'UPDATE inventaire SET vivres=460 WHERE id=2');
      await runSql(db, 'UPDATE inventaire SET vivres=0 WHERE id=1');
    });
    await buyOffer({ ...f.args(2), offerId: offer.offer.id, body: buyBody });
    await f.sql(async db => {
      assert.equal((await getSql(db, 'SELECT vivres FROM inventaire WHERE id=2')).vivres, 500);
      assert.deepEqual((await allSql(db, "SELECT amount FROM transactions WHERE seigneurie_id=2 AND resource='vivres' ORDER BY id")).map(row => row.amount), [-10,50]);
    });
  } finally { f.cleanup(); }
});

test('bonus retirés après dépôt : commission actuelle, limite réduite et retrait faute de place', async () => {
  const f = await fixture();
  try {
    await f.sql(async db => {
      await runSql(db, 'INSERT INTO building_properties (id,label,effects) VALUES (2,?,?)', ['Comptoir', '[{"type":"auction_max_offers_bonus","amount":2},{"type":"auction_commission_discount","amount":5}]']);
      await runSql(db, 'UPDATE players SET buildings=? WHERE id=1', ['{"2":{"built":1,"active":1}}']);
    });
    for (let i = 0; i < 6; i++) await f.deposit({ lot: { resource: 'fer', amount: 1 } });
    await f.sql(db => runSql(db, "UPDATE players SET buildings='{}' WHERE id=1"));
    await assert.rejects(f.deposit(), e => e.code === 'offer_limit');
    await buyOffer({ ...f.args(2), offerId: 1, body: buyBody });
    assert.equal((await readAuction({ ...f.args(1), view: 'history' })).rows[0].details.net, 199);
    await assert.rejects(f.deposit(), e => e.code === 'offer_limit');
    await withdrawOffer({ ...f.args(1), offerId: 2, body: buyBody });
    await f.deposit({ lot: { resource: 'vivres', amount: 100 } });
    await f.sql(db => runSql(db, 'UPDATE inventaire SET vivres=500 WHERE id=1'));
    const food = (await readAuction({ ...f.args(1), view: 'mine' })).rows.find(row => row.resource === 'vivres');
    await assert.rejects(withdrawOffer({ ...f.args(1), offerId: food.id, body: buyBody }), e => e.code === 'storage_full');
  } finally { f.cleanup(); }
});

test('conservation : bonus actuel protège une offre ; rollback du relevé protège son expiration', async () => {
  const f = await fixture();
  const advance = { ...f.args(1), expectedUpdate: { year: 1026, number: 9 }, now: new Date('2026-12-01T00:00:00Z') };
  try {
    await f.deposit();
    await f.sql(async db => {
      await runSql(db, 'UPDATE auction_offers SET update_year=1025,update_number=9');
      await runSql(db, 'INSERT INTO building_properties (id,label,effects) VALUES (2,?,?)', ['Entrepôt', '[{"type":"auction_duration_bonus","amount":2}]']);
      await runSql(db, 'UPDATE players SET buildings=? WHERE id=1', ['{"2":{"built":1,"active":1}}']);
    });
    const protectedReport = await advanceSeigneurieUpdate(advance);
    assert.deepEqual(protectedReport.delta.auctionReturns.returned, {});
    assert.equal((await readAuction({ ...f.args(1), view: 'mine' })).rows[0].state, 'open');
    await f.sql(async db => {
      await runSql(db, "UPDATE players SET buildings='{}' WHERE id=1");
      await runSql(db, "CREATE TRIGGER fail_report BEFORE INSERT ON player_update_reports BEGIN SELECT RAISE(ABORT,'fixture'); END");
    });
    const next = { ...advance, expectedUpdate: { year: 1026, number: 10 }, now: new Date('2027-03-01T00:00:00Z') };
    await assert.rejects(advanceSeigneurieUpdate(next));
    assert.equal((await readAuction({ ...f.args(1), view: 'mine' })).rows[0].state, 'open');
    await f.sql(db => runSql(db, 'DROP TRIGGER fail_report'));
    const report = await advanceSeigneurieUpdate(next);
    assert.equal(report.delta.auctionReturns.returned.fer, 42);
    assert.equal((await readAuction({ ...f.args(1), view: 'mine' })).rows[0].state, 'expired');
  } finally { f.cleanup(); }
});

test('dépôt réservé et idempotent ; deux acheteurs concurrents ne paient qu’une fois', async () => {
  const f = await fixture();
  try {
    const first = await f.deposit({ request_key: 'repeated-request-1234' });
    const repeated = await f.deposit({ request_key: 'repeated-request-1234' });
    assert.equal(repeated.offer.id, first.offer.id); assert.equal(repeated.repeated, true);
    await f.sql(async db => {
      assert.equal((await getSql(db, 'SELECT fer FROM inventaire WHERE id=1')).fer, 950);
      assert.equal((await getSql(db, 'SELECT land_transactions FROM players WHERE id=1')).land_transactions, 1);
    });
    const purchases = await Promise.allSettled([2,3].map(id => buyOffer({ ...f.args(id), offerId: first.offer.id, body: buyBody })));
    assert.equal(purchases.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(purchases.find(result => result.status === 'rejected').reason.status, 409);
    await f.sql(async db => {
      assert.equal((await getSql(db, 'SELECT or_ FROM inventaire WHERE id=1')).or_, 1199);
      const buyers = await allSql(db, 'SELECT * FROM inventaire WHERE id IN (2,3)');
      assert.equal(buyers.reduce((sum, row) => sum + row.or_, 0), 1790);
      assert.equal(buyers.reduce((sum, row) => sum + row.fer, 0), 2050);
      assert.equal((await getSql(db, 'SELECT sum(naval_transactions) AS n FROM players')).n, 1);
    });
    const history = await readAuction({ ...f.args(1), view: 'history' });
    assert.equal(history.rows[0].details.net, 199);
    assert.equal(JSON.stringify(history.rows).includes('buyer_id'), false);
    await assert.rejects(buyOffer({ ...f.args(2), offerId: first.offer.id, body: buyBody }), e => e.status === 409);
  } finally { f.cleanup(); }
});

test('achat : prix alternatif, capacités après paiement, emploi et quotas partagés', async () => {
  const f = await fixture();
  try {
    const offer = await f.deposit();
    await assert.rejects(buyOffer({ ...f.args(1), offerId: offer.offer.id, body: buyBody }), e => e.code === 'own_offer');
    await f.sql(db => runSql(db, 'UPDATE inventaire SET pierre=25 WHERE id=2'));
    await buyOffer({ ...f.args(2), offerId: offer.offer.id, body: { ...buyBody, price_index: 1 } });
    await f.sql(async db => assert.equal((await getSql(db, 'SELECT pierre FROM inventaire WHERE id=1')).pierre, 23));
    const food = await f.deposit({ lot: { resource: 'vivres', amount: 450 } });
    await assert.rejects(buyOffer({ ...f.args(2), offerId: food.offer.id, body: buyBody }), e => e.code === 'storage_full');
    await f.sql(async db => {
      assert.equal((await getSql(db, 'SELECT or_ FROM inventaire WHERE id=2')).or_, 1000);
      assert.equal((await getSql(db, 'SELECT naval_transactions FROM players WHERE id=2')).naval_transactions, 1);
      await runSql(db, 'UPDATE players SET land_transactions=20 WHERE id=2');
    });
    const goods = await f.deposit();
    await assert.rejects(buyOffer({ ...f.args(2), offerId: goods.offer.id, body: { ...buyBody, transport: 'land' } }), e => e.code === 'transport_limit');
    await f.sql(async db => {
      await runSql(db, 'INSERT INTO building_properties (id,label,workers_per_building) VALUES (1,?,105)', ['Atelier']);
      await runSql(db, 'UPDATE players SET buildings=? WHERE id=1', ['{"1":{"built":1,"active":1}}']);
    });
    await assert.rejects(f.deposit({ lot: { resource: 'esclaves', amount: 10 } }), e => e.code === 'employment_overload');
    await f.sql(db => runSql(db, "UPDATE players SET type='eveque' WHERE id=2"));
    const slaves = await f.deposit({ lot: { resource: 'esclaves', amount: 1 } });
    await assert.rejects(buyOffer({ ...f.args(2), offerId: slaves.offer.id, body: buyBody }), e => e.code === 'invalid_resource');
  } finally { f.cleanup(); }
});

test('effets actuels, baisse de limite et perte du marché : offres conservées et retrait permis', async () => {
  const f = await fixture();
  try {
    const offer = await f.deposit();
    await f.sql(async db => {
      await runSql(db, 'INSERT INTO building_properties (id,label,effects) VALUES (2,?,?)', ['Banque', '[{"type":"auction_withdrawal_loss_discount","amount":10},{"type":"auction_commission_discount","amount":2}]']);
      await runSql(db, 'UPDATE players SET buildings=? WHERE id=1', ['{"2":{"built":2,"active":2}}']);
    });
    const current = await readAuction(f.args(1)); assert.equal(current.rules.commission, 1);
    await f.sql(db => runSql(db, "UPDATE players SET infrastructures='{}' WHERE id=1"));
    await assert.rejects(f.deposit(), e => e.code === 'auction_locked');
    assert.equal((await readAuction({ ...f.args(2), view: 'catalog' })).rows.length, 1);
    const result = await withdrawOffer({ ...f.args(1), offerId: offer.offer.id, body: buyBody });
    assert.equal(result.net, 45);
    await assert.rejects(withdrawOffer({ ...f.args(1), offerId: offer.offer.id, body: buyBody }), e => e.code === 'offer_closed');
  } finally { f.cleanup(); }
});

test('limite et filtres de période, droits d’accès, ressources interdites et confidentialité', async () => {
  const f = await fixture();
  try {
    for (const resource of ['prestige','renommee','points_magique','hommes_darmes','trebuchets','__proto__']) await assert.rejects(f.deposit({ lot: { resource, amount: 1 } }), e => e.code === 'invalid_resource');
    await assert.rejects(readAuction({ ...f.args(1), playerId: 2 }), e => e.status === 403);
    await assert.rejects(readAuction({ dbPath: f.dbPath, actor: null }), e => e.status === 401);
    for (let i = 0; i < 5; i++) await f.deposit();
    await assert.rejects(f.deposit(), e => e.code === 'offer_limit');
    await f.sql(db => runSql(db, 'UPDATE players SET update_number=8 WHERE id=2'));
    const futureCatalog = await readAuction(f.args(2));
    assert.equal(futureCatalog.rows.length, 5);
    assert.ok(futureCatalog.rows.every(offer => offer.can_buy === false && offer.purchase_block_reason.includes('1026')));
    await assert.rejects(buyOffer({ ...f.args(2), offerId: 1, body: { ...buyBody, expected_update: { year: 1026, number: 8 } } }), e => e.code === 'future_offer');
    assert.equal((await f.sql(db => getSql(db, 'SELECT or_ FROM inventaire WHERE id=2'))).or_, 1000);
    await f.sql(db => runSql(db, 'UPDATE players SET update_number=9 WHERE id=2'));
    assert.ok((await readAuction(f.args(2))).rows.every(offer => offer.can_buy === true && offer.purchase_block_reason === null));
    await assert.rejects(f.deposit({ expected_update: { year: 1026, number: 8 } }), e => e.code === 'update_conflict');
    const admin = await readAuction({ dbPath: f.dbPath, actor: { id: 3, isAdminActive: true }, playerId: 1, view: 'mine' });
    assert.equal(admin.open_count, 5);
  } finally { f.cleanup(); }
});

test('vente ou retrait : un seul gagnant ; rollback après erreur d’historique', async () => {
  const f = await fixture();
  try {
    const offer = await f.deposit();
    const results = await Promise.allSettled([
      buyOffer({ ...f.args(2), offerId: offer.offer.id, body: buyBody }),
      withdrawOffer({ ...f.args(1), offerId: offer.offer.id, body: buyBody })
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const second = await f.deposit();
    await f.sql(db => runSql(db, "CREATE TRIGGER fail_event BEFORE INSERT ON auction_events BEGIN SELECT RAISE(ABORT,'fixture'); END"));
    const before = await f.sql(db => allSql(db, 'SELECT * FROM inventaire'));
    const counters = await f.sql(db => allSql(db, 'SELECT land_transactions,naval_transactions FROM players'));
    await assert.rejects(buyOffer({ ...f.args(3), offerId: second.offer.id, body: buyBody }));
    assert.deepEqual(await f.sql(db => allSql(db, 'SELECT * FROM inventaire')), before);
    assert.deepEqual(await f.sql(db => allSql(db, 'SELECT land_transactions,naval_transactions FROM players')), counters);
    assert.equal((await f.sql(db => getSql(db, 'SELECT state FROM auction_offers WHERE id=?', [second.offer.id]))).state, 'open');
  } finally { f.cleanup(); }
});

test('expiration à la onzième période : retour, débordement, relevé et rollback atomiques', async () => {
  const f = await fixture();
  try {
    await f.deposit({ lot: { resource: 'vivres', amount: 1000 } });
    await f.sql(async db => {
      await runSql(db, 'UPDATE auction_offers SET update_year=1025,update_number=9');
      await runSql(db, 'UPDATE inventaire SET vivres=2000 WHERE id=1');
    });
    const report = await advanceSeigneurieUpdate({ ...f.args(1), expectedUpdate: { year: 1026, number: 9 }, now: new Date('2026-12-01T00:00:00Z') });
    assert.equal(report.delta.auctionReturns.returned.vivres, 50);
    assert.equal(report.delta.auctionReturns.overflow.vivres, 800);
    assert.ok(report.events.some(event => event.type === 'auction_expired'));
    assert.equal((await readAuction({ ...f.args(1), view: 'mine' })).rows[0].state, 'expired');
    await assert.rejects(buyOffer({ ...f.args(2), offerId: 1, body: buyBody }), e => e.code === 'offer_closed');
  } finally { f.cleanup(); }
});

test('routes privées : identité relue, erreurs explicites et historique sans identité acheteur', async () => {
  const express = require('express'); const f = await fixture(); const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { user: req.get('test-user') ? { id: Number(req.get('test-user')) } : null }; next(); });
  app.use('/api/auction_house', createAuctionRouter(f.dbPath, () => false));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/auction_house`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url + '?seigneurie_id=2', { headers: { 'test-user': '1' } })).status, 403);
    assert.equal((await fetch(url, { headers: { 'test-user': '99' } })).status, 404);
    const response = await fetch(url, { headers: { 'test-user': '1' } });
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await response.json()).rules.unlocked, true);
  } finally { await new Promise(resolve => server.close(resolve)); f.cleanup(); }
});

test('pagination : catalogue, offres personnelles et historique restent dans leur périmètre', async () => {
  const f = await fixture();
  try {
    await f.sql(async db => {
      for (let i = 0; i < 65; i++) {
        const offer = await runSql(db, `INSERT INTO auction_offers (seller_id,resource,amount,prices_json,update_year,update_number,request_key,request_json)
          VALUES (1,'fer',1,'[{"resource":"or_","amount":1}]',1026,9,?,'{}')`, ['pagination-' + i]);
        await runSql(db, 'INSERT INTO auction_events (offer_id,seller_id,buyer_id,kind,details_json) VALUES (?,1,2,?,?)',
          [offer.lastID, 'sold', '{"resource":"fer","amount":1,"price":{"resource":"or_","amount":1},"net":0,"fee":1}']);
      }
    });
    for (const [user, view] of [[2,'catalog'],[1,'mine'],[1,'history'],[2,'history']]) {
      const first = await readAuction({ ...f.args(user), view });
      assert.equal(first.rows.length, 50); assert.equal(first.has_more, true);
      const next = await readAuction({ ...f.args(user), view, before: first.rows[49].id });
      assert.equal(next.rows.length, 15); assert.equal(next.has_more, false);
      assert.equal(new Set([...first.rows, ...next.rows].map(row => row.id)).size, 65);
    }
    assert.equal((await readAuction({ ...f.args(3), view: 'history' })).rows.length, 0);
    await assert.rejects(readAuction({ ...f.args(1), before: '1 OR 1=1' }), e => e.code === 'invalid_id');
  } finally { f.cleanup(); }
});

test('achat contre avancement expirant : aucun double transfert du lot', async () => {
  const f = await fixture();
  try {
    await f.deposit();
    await f.sql(db => runSql(db, 'UPDATE auction_offers SET update_year=1025,update_number=9'));
    const results = await Promise.allSettled([
      buyOffer({ ...f.args(2), offerId: 1, body: buyBody }),
      advanceSeigneurieUpdate({ ...f.args(1), expectedUpdate: { year: 1026, number: 9 }, now: new Date('2026-12-01T00:00:00Z') })
    ]);
    assert.equal(results[1].status, 'fulfilled');
    await f.sql(async db => {
      const closed = await getSql(db, 'SELECT state FROM auction_offers WHERE id=1');
      const seller = await getSql(db, 'SELECT fer,or_ FROM inventaire WHERE id=1');
      const buyer = await getSql(db, 'SELECT fer,or_ FROM inventaire WHERE id=2');
      const finalEvents = await allSql(db, "SELECT kind FROM auction_events WHERE kind IN ('sold','expired')");
      assert.equal(finalEvents.length, 1);
      if (closed.state === 'sold') { assert.equal(buyer.fer, 1050); assert.equal(seller.fer, 950); assert.equal(seller.or_, 1199); }
      else { assert.equal(closed.state, 'expired'); assert.equal(buyer.fer, 1000); assert.equal(seller.fer, 992); assert.equal(seller.or_, 1000); }
    });
  } finally { f.cleanup(); }
});
