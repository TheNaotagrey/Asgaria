const express = require('express');
const sqlite3 = require('sqlite3');
const Rules = require('../src/auctionRules');
const { tradeCapacity } = require('../src/gameRules');
const { formatUpdateLabel } = require('../src/updateCycle');
const { calculateProjection } = require('../src/seigneurieProjection');
const { employmentAllowed } = require('../src/employmentPolicy');
const { withImmediateTransaction, runSql, getSql, allSql } = require('../src/sqliteTransaction');

const auctionSchema = `
CREATE TABLE IF NOT EXISTS auction_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES players(id),
  resource TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), prices_json TEXT NOT NULL,
  update_year INTEGER NOT NULL, update_number INTEGER NOT NULL CHECK(update_number BETWEEN 1 AND 10),
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','sold','withdrawn','expired')),
  request_key TEXT NOT NULL, request_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at TEXT, UNIQUE(seller_id, request_key)
);
CREATE INDEX IF NOT EXISTS auction_offers_seller ON auction_offers(seller_id,state,id);
CREATE INDEX IF NOT EXISTS auction_offers_catalog ON auction_offers(state,update_year,update_number,id);
CREATE TABLE IF NOT EXISTS auction_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, offer_id INTEGER NOT NULL REFERENCES auction_offers(id),
  seller_id INTEGER NOT NULL, buyer_id INTEGER, kind TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS auction_events_seller ON auction_events(seller_id,id);
CREATE INDEX IF NOT EXISTS auction_events_buyer ON auction_events(buyer_id,id);
`;
function fail(status, code, message) { const error = new Error(message); error.status = status; error.code = code; throw error; }
function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail(400, 'invalid_id', 'Identifiant invalide.');
  return Number(value);
}
const position = player => ({ year: Number(player.update_year), number: Number(player.update_number) });
async function resolvePlayer(db, actor, playerId) {
  if (!actor || !Number.isSafeInteger(Number(actor.id))) fail(401, 'unauthorized', 'Connectez-vous pour accéder à l’Hôtel des ventes.');
  if (playerId != null && !actor.isAdminActive) fail(403, 'forbidden_context', 'Seul un administrateur actif peut sélectionner un personnage.');
  const row = await getSql(db, `SELECT s.*, g.name AS seller_name, g.user_id AS owner_user_id
    FROM seigneuries s JOIN seigneurs g ON g.id=s.seigneur_id JOIN users u ON u.id=g.user_id
    WHERE ${playerId != null ? 's.id=?' : 'g.user_id=?'} ORDER BY s.id LIMIT 1`, [playerId != null ? positiveId(playerId) : Number(actor.id)]);
  if (!row) fail(404, 'player_not_found', 'Personnage ou propriétaire introuvable.');
  return row;
}
async function context(db, player) {
  const [buildingProperties, infrastructureProperties, baronyProperties, inventory] = await Promise.all([
    allSql(db, 'SELECT * FROM building_properties'), allSql(db, 'SELECT * FROM infrastructure_properties'),
    player.baronnie_id ? getSql(db, 'SELECT * FROM barony_properties WHERE barony_id=?', [player.baronnie_id]) : null,
    getSql(db, 'SELECT * FROM inventaire WHERE id=?', [player.inventaire_id])
  ]);
  if (!inventory) fail(400, 'inventory_missing', 'Inventaire introuvable.');
  let rules;
  try { rules = Rules.calculateRules(player, buildingProperties, infrastructureProperties); Rules.periodIndex(position(player)); }
  catch (error) { fail(400, 'invalid_configuration', error.message); }
  const projection = calculateProjection({ player, inventory, buildingProperties, infrastructureProperties, baronyProperties });
  return { player, inventory, rules, projection, buildingProperties, infrastructureProperties, baronyProperties,
    quotas: tradeCapacity(player.infrastructures, infrastructureProperties, baronyProperties) };
}
function requireAccess(ctx) { if (!ctx.rules.unlocked) fail(403, 'auction_locked', 'Construisez une structure donnant accès à l’Hôtel des ventes.'); }
function expectedPeriod(player, expected) {
  try {
    if (Rules.periodIndex(expected) !== Rules.periodIndex(position(player))) fail(409, 'update_conflict', 'La période a changé. Rechargez le personnage.');
  } catch (error) {
    if (error.status) throw error;
    fail(400, 'invalid_update', 'La période attendue est obligatoire et doit être valide.');
  }
}
function lot(value, type) {
  try { return Rules.validateLot(value, type); }
  catch (error) { fail(400, 'invalid_resource', error.message); }
}
async function consumeTransport(db, ctx, transport) {
  if (!['land', 'naval'].includes(transport)) fail(400, 'invalid_transport', 'Choisissez une caravane ou un navire marchand.');
  const field = transport === 'land' ? 'land_transactions' : 'naval_transactions';
  if (!(ctx.quotas[transport] > 0)) fail(400, 'transport_missing', 'Aucun transport disponible avec ses prérequis.');
  const updated = await runSql(db, `UPDATE players SET ${field}=COALESCE(${field},0)+1 WHERE id=? AND COALESCE(${field},0)<?`, [ctx.player.id, ctx.quotas[transport]]);
  if (!updated.changes) fail(400, 'transport_limit', 'Quota commercial de cette période atteint.');
}
function validateBalances(ctx, deltas, checkCapacity = true) {
  const next = { ...ctx.inventory };
  for (const [resource, delta] of Object.entries(deltas)) {
    next[resource] = (Number(next[resource]) || 0) + delta;
    if (!Number.isSafeInteger(next[resource]) || next[resource] < 0) fail(400, 'insufficient_resources', `Ressources insuffisantes ou montant trop élevé : ${Rules.resources[resource]}.`);
    if (checkCapacity && delta > 0 && typeof ctx.projection.capacities[resource] === 'number' && next[resource] > ctx.projection.capacities[resource]) {
      fail(400, 'storage_full', `Stockage insuffisant chez ${ctx.player.seller_name || 'ce personnage'} : ${Rules.resources[resource]}.`);
    }
  }
  const after = calculateProjection({ player: ctx.player, inventory: next, buildingProperties: ctx.buildingProperties,
    infrastructureProperties: ctx.infrastructureProperties, baronyProperties: ctx.baronyProperties });
  if (!employmentAllowed(ctx.projection.employment.employed, after.employment.employed, ctx.player.population)) {
    fail(400, 'employment_overload', 'Cette opération aggraverait le sur-travail du personnage.');
  }
  return next;
}
async function move(db, ctx, deltas) {
  for (const [resource, delta] of Object.entries(deltas)) {
    if (!delta) continue;
    await runSql(db, `UPDATE inventaire SET ${resource}=${resource}+? WHERE id=?`, [delta, ctx.inventory.id]);
    await runSql(db, 'INSERT INTO transactions (seigneurie_id,resource,amount) VALUES (?,?,?)', [ctx.player.id, resource, delta]);
  }
}
async function event(db, offer, kind, details, buyerId = null) {
  await runSql(db, 'INSERT INTO auction_events (offer_id,seller_id,buyer_id,kind,details_json) VALUES (?,?,?,?,?)',
    [offer.id, offer.seller_id, buyerId, kind, JSON.stringify({ resource: offer.resource, amount: offer.amount, ...details })]);
}
async function openOffer(db, id) {
  const offer = await getSql(db, 'SELECT * FROM auction_offers WHERE id=?', [positiveId(id)]);
  if (!offer) fail(404, 'offer_not_found', 'Offre introuvable.');
  if (offer.state !== 'open') fail(409, 'offer_closed', 'Cette offre a déjà été achetée ou retirée.');
  return offer;
}
function presentOffer(row) {
  return { id: row.id, seller_id: row.seller_id, seller_name: row.seller_name, resource: row.resource, amount: row.amount,
    prices: JSON.parse(row.prices_json), update: { year: row.update_year, number: row.update_number }, state: row.state,
    created_at: row.created_at, closed_at: row.closed_at };
}
async function depositOffer({ dbPath, actor, playerId, body }) {
  return withImmediateTransaction(dbPath, async db => {
    const player = await resolvePlayer(db, actor, playerId);
    if (typeof body.request_key !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.request_key)) fail(400, 'invalid_request_key', 'Identifiant de dépôt invalide.');
    const payload = JSON.stringify({ lot: body.lot, prices: body.prices, transport: body.transport, expected_update: body.expected_update });
    const previous = await getSql(db, 'SELECT * FROM auction_offers WHERE seller_id=? AND request_key=?', [player.id, body.request_key]);
    if (previous) {
      if (previous.request_json !== payload) fail(409, 'request_conflict', 'Cet identifiant de dépôt a déjà été utilisé pour une autre offre.');
      return { offer: presentOffer(previous), repeated: true };
    }
    const ctx = await context(db, player);
    requireAccess(ctx); expectedPeriod(player, body.expected_update);
    const goods = lot(body.lot, player.type);
    if (!Array.isArray(body.prices) || body.prices.length < 1 || body.prices.length > 2) fail(400, 'invalid_prices', 'Proposez un ou deux prix alternatifs.');
    const prices = body.prices.map(price => lot(price, player.type));
    const count = await getSql(db, "SELECT COUNT(*) AS count FROM auction_offers WHERE seller_id=? AND state='open'", [player.id]);
    if (count.count >= ctx.rules.maxOffers) fail(400, 'offer_limit', 'Limite d’offres simultanées atteinte.');
    const deltas = { [goods.resource]: -goods.amount };
    validateBalances(ctx, deltas);
    await consumeTransport(db, ctx, body.transport);
    await move(db, ctx, deltas);
    const inserted = await runSql(db, 'INSERT INTO auction_offers (seller_id,resource,amount,prices_json,update_year,update_number,request_key,request_json) VALUES (?,?,?,?,?,?,?,?)',
      [player.id, goods.resource, goods.amount, JSON.stringify(prices), player.update_year, player.update_number, body.request_key, payload]);
    const offer = await getSql(db, 'SELECT * FROM auction_offers WHERE id=?', [inserted.lastID]);
    await event(db, offer, 'deposited', { rules: ctx.rules, transport: body.transport, prices });
    return { offer: presentOffer(offer) };
  });
}
async function buyOffer({ dbPath, actor, playerId, offerId, body }) {
  return withImmediateTransaction(dbPath, async db => {
    const buyer = await resolvePlayer(db, actor, playerId);
    const buyerCtx = await context(db, buyer);
    requireAccess(buyerCtx); expectedPeriod(buyer, body.expected_update);
    const offer = await openOffer(db, offerId);
    if (offer.seller_id === buyer.id) fail(400, 'own_offer', 'Vous ne pouvez pas acheter votre propre offre.');
    if (Rules.periodIndex(position(buyer)) < Rules.periodIndex({ year: offer.update_year, number: offer.update_number })) fail(403, 'future_offer', 'Cette offre est publiée à une période ultérieure à la vôtre.');
    const seller = await getSql(db, 'SELECT s.*,g.name AS seller_name FROM seigneuries s JOIN seigneurs g ON g.id=s.seigneur_id WHERE s.id=?', [offer.seller_id]);
    if (!seller) fail(404, 'seller_missing', 'Vendeur introuvable.');
    const sellerCtx = await context(db, seller);
    const prices = JSON.parse(offer.prices_json);
    if (!Number.isInteger(body.price_index) || body.price_index < 0 || body.price_index >= prices.length) fail(400, 'invalid_price', 'Choisissez un prix proposé par le vendeur.');
    const price = lot(prices[body.price_index], buyer.type);
    lot(price, seller.type);
    const goods = lot({ resource: offer.resource, amount: offer.amount }, buyer.type);
    if ((Number(buyerCtx.inventory[price.resource]) || 0) < price.amount) {
      fail(400, 'insufficient_resources', `Ressources insuffisantes pour payer : ${Rules.resources[price.resource]}.`);
    }
    const net = Rules.netAmount(price.amount, sellerCtx.rules.commission);
    const buyerDeltas = { [price.resource]: -price.amount };
    buyerDeltas[goods.resource] = (buyerDeltas[goods.resource] || 0) + goods.amount;
    const sellerDeltas = { [price.resource]: net };
    validateBalances(buyerCtx, buyerDeltas); validateBalances(sellerCtx, sellerDeltas);
    await consumeTransport(db, buyerCtx, body.transport);
    await move(db, buyerCtx, { [price.resource]: -price.amount });
    await move(db, buyerCtx, { [goods.resource]: goods.amount });
    await move(db, sellerCtx, sellerDeltas);
    await runSql(db, "UPDATE auction_offers SET state='sold',closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [offer.id]);
    await event(db, offer, 'sold', { price, net, fee: price.amount - net, rules: sellerCtx.rules, transport: body.transport }, buyer.id);
    return { offer_id: offer.id, price, net, fee: price.amount - net };
  });
}
async function withdrawOffer({ dbPath, actor, playerId, offerId, body }) {
  return withImmediateTransaction(dbPath, async db => {
    const player = await resolvePlayer(db, actor, playerId);
    expectedPeriod(player, body.expected_update);
    const offer = await openOffer(db, offerId);
    if (offer.seller_id !== player.id) fail(403, 'not_owner', 'Cette offre ne vous appartient pas.');
    const ctx = await context(db, player);
    const net = Rules.netAmount(offer.amount, ctx.rules.withdrawalLoss);
    const deltas = { [offer.resource]: net };
    validateBalances(ctx, deltas); await move(db, ctx, deltas);
    await runSql(db, "UPDATE auction_offers SET state='withdrawn',closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [offer.id]);
    await event(db, offer, 'withdrawn', { net, loss: offer.amount - net, rules: ctx.rules });
    return { offer_id: offer.id, net, loss: offer.amount - net };
  });
}
async function expireOffers(db, playerId, next, inventory, capacities, events) {
  // Older isolated economy fixtures do not contain this optional subsystem.
  if (!await getSql(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='auction_offers'")) return { returned: {}, overflow: {} };
  const player = await getSql(db, 'SELECT * FROM seigneuries WHERE id=?', [playerId]);
  const ctx = await context(db, player);
  const offers = await allSql(db, "SELECT * FROM auction_offers WHERE seller_id=? AND state='open' ORDER BY id", [playerId]);
  const returned = {}, overflow = {};
  for (const offer of offers) {
    if (Rules.periodIndex(next) - Rules.periodIndex({ year: offer.update_year, number: offer.update_number }) <= ctx.rules.duration) continue;
    const net = Rules.netAmount(offer.amount, ctx.rules.expirationLoss);
    const capacity = capacities[offer.resource];
    const current = Number(inventory[offer.resource]) || 0;
    const granted = typeof capacity === 'number' ? Math.min(net, Math.max(0, capacity - current)) : net;
    if (!Number.isSafeInteger(current + granted)) fail(400, 'invalid_balance', 'Le retour HV dépasse la quantité maximale autorisée.');
    await move(db, ctx, { [offer.resource]: granted });
    inventory[offer.resource] = current + granted;
    returned[offer.resource] = (returned[offer.resource] || 0) + granted;
    overflow[offer.resource] = (overflow[offer.resource] || 0) + net - granted;
    await runSql(db, "UPDATE auction_offers SET state='expired',closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [offer.id]);
    await event(db, offer, 'expired', { net: granted, loss: offer.amount - net, overflow: net - granted, rules: ctx.rules });
    events.push({ type: 'auction_expired', title: 'Retour de l’Hôtel des ventes',
      details: `Offre n°${offer.id} : ${granted} ${Rules.resources[offer.resource]} retournés ; ${offer.amount - net} perdus en frais et ${net - granted} faute de place.`, offer_id: offer.id });
  }
  return { returned, overflow };
}
async function readAuction({ dbPath, actor, playerId, view = 'catalog', before }) {
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  try {
    await runSql(db, 'BEGIN');
    const player = await resolvePlayer(db, actor, playerId);
    const ctx = await context(db, player);
    const cursor = before == null ? Number.MAX_SAFE_INTEGER : positiveId(before);
    let rows;
    if (view === 'history') {
      rows = await allSql(db, 'SELECT * FROM auction_events WHERE (seller_id=? OR buyer_id=?) AND id<? ORDER BY id DESC LIMIT 51', [player.id, player.id, cursor]);
      rows = rows.map(row => ({ id: row.id, offer_id: row.offer_id, kind: row.kind, direction: row.buyer_id === player.id ? 'purchase' : 'sale',
        details: JSON.parse(row.details_json), created_at: row.created_at }));
    } else if (view === 'mine' || (view === 'catalog' && ctx.rules.unlocked)) {
      const filter = view === 'mine' ? 'o.seller_id=?' : "o.state='open' AND o.seller_id!=?" + (player.type === 'eveque' ? " AND o.resource!='esclaves'" : '');
      const params = [player.id];
      rows = await allSql(db, `SELECT o.*,g.name AS seller_name FROM auction_offers o JOIN players p ON p.id=o.seller_id
        JOIN seigneurs g ON g.id=p.seigneur_id WHERE ${filter} AND o.id<? ORDER BY o.id DESC LIMIT 51`, [...params, cursor]);
      rows = rows.map(row => {
        const offer = presentOffer(row);
        if (view !== 'catalog') return offer;
        const canBuy = Rules.periodIndex(position(player)) >= Rules.periodIndex(offer.update);
        return { ...offer, can_buy: canBuy, purchase_block_reason: canBuy ? null :
          `Mise à jour requise : ${formatUpdateLabel(offer.update)}. Votre personnage : ${formatUpdateLabel(position(player))}.` };
      });
    } else if (view === 'catalog') rows = [];
    else fail(400, 'invalid_view', 'Vue HV invalide.');
    const count = await getSql(db, "SELECT COUNT(*) AS count FROM auction_offers WHERE seller_id=? AND state='open'", [player.id]);
    const history = await getSql(db, 'SELECT id FROM auction_events WHERE seller_id=? OR buyer_id=? LIMIT 1', [player.id, player.id]);
    await runSql(db, 'COMMIT');
    return { rules: ctx.rules, inventory: ctx.inventory, capacities: ctx.projection.capacities, update: position(player),
      type: player.type || 'seigneur', open_count: count.count, has_history: !!history,
      quotas: Object.fromEntries(['land','naval'].map(kind => [kind, { max: ctx.quotas[kind], used: Number(player[kind + '_transactions']) || 0 }])),
      rows: rows.slice(0, 50), has_more: rows.length > 50 };
  } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
}
function createAuctionRouter(dbPath, isAdminActive) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const route = handler => async (req, res) => {
    try {
      const actor = req.session && req.session.user ? { id: req.session.user.id, isAdminActive: isAdminActive(req.session.user) } : null;
      const result = await handler({ dbPath, actor, playerId: req.query.seigneurie_id, body: req.body || {}, offerId: req.params.id, view: req.params.view || 'catalog', before: req.query.before });
      res.json(result);
    } catch (error) {
      if (!error.status) require('../logger').error(error);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Impossible de traiter l’opération HV.', code: error.code });
    }
  };
  router.get('/', route(readAuction));
  router.get('/:view', route(readAuction));
  router.post('/offers', route(depositOffer));
  router.post('/offers/:id/buy', route(buyOffer));
  router.post('/offers/:id/withdraw', route(withdrawOffer));
  return router;
}
module.exports = { auctionSchema, createAuctionRouter, depositOffer, buyOffer, withdrawOffer, readAuction, expireOffers };
