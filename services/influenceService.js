const { runSql, getSql, allSql, withImmediateTransaction } = require('../src/sqliteTransaction');
const { logAdminChange } = require('./changeLogService');

// Livre 1026, p. 40, 42 et 50. Les soldes ne sont jamais déduits des titres de facto.
const influenceSchema = `
CREATE TABLE IF NOT EXISTS player_duchy_influence (
  player_id INTEGER NOT NULL REFERENCES players(id),
  duchy_id INTEGER NOT NULL REFERENCES duchies(id),
  amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
  PRIMARY KEY(player_id, duchy_id)
);
CREATE TABLE IF NOT EXISTS influence_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  duchy_id INTEGER NOT NULL REFERENCES duchies(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;
function failure(status, message) { return Object.assign(new Error(message), { status }); }
async function resolvePlayer(database, actor, playerId) {
  if (!actor || !Number.isSafeInteger(actor.id) || actor.id < 1) throw failure(401, 'Non autorisé.');
  if (playerId != null && (!actor.isAdminActive || !Number.isSafeInteger(Number(playerId)) || Number(playerId) < 1)) {
    throw failure(403, 'Cette seigneurie ne vous appartient pas.');
  }
  const player = playerId != null
    ? await getSql(database, 'SELECT * FROM seigneuries WHERE id=?', [Number(playerId)])
    : await getSql(database, 'SELECT s.* FROM seigneuries s JOIN seigneurs g ON g.id=s.seigneur_id WHERE g.user_id=?', [actor.id]);
  if (!player) throw failure(404, 'Seigneurie introuvable.');
  return player;
}
async function deJureDuchy(database, baronyId) {
  return getSql(database, `SELECT d.id, d.name FROM baronies b
    JOIN counties c ON c.id=b.county_id JOIN duchies d ON d.id=c.duchy_id WHERE b.id=?`, [baronyId]);
}
async function influenceState(database, player) {
  const inventory = await getSql(database, 'SELECT prestige,renommee FROM inventaire WHERE id=?', [player.inventaire_id]);
  if (!inventory) throw failure(400, 'Inventaire introuvable.');
  return { ...inventory, duchy: await deJureDuchy(database, player.baronnie_id) || null,
    balances: await allSql(database, `SELECT d.id AS duchy_id,d.name,COALESCE(i.amount,0) AS amount FROM duchies d
      LEFT JOIN player_duchy_influence i ON i.duchy_id=d.id AND i.player_id=? ORDER BY d.name`, [player.id]) };
}
async function linkInfluenceQuote(database, player, targetId) {
  const origin = await deJureDuchy(database, player.baronnie_id);
  const target = await deJureDuchy(database, targetId);
  if (!origin || !target) throw failure(400, 'Le duché de jure de chaque baronnie doit être renseigné.');
  const influence = origin.id === target.id ? [{ ...origin, amount: 2 }] : [{ ...origin, amount: 1 }, { ...target, amount: 1 }];
  for (const item of influence) {
    const balance = await getSql(database, 'SELECT amount FROM player_duchy_influence WHERE player_id=? AND duchy_id=?', [player.id, item.id]);
    item.available = balance?.amount || 0;
  }
  return influence;
}
async function editInfluence({ dbPath, actor, playerId, changes, expected }) {
  if (!actor?.isAdminActive) throw failure(403, 'Modification réservée à un administrateur actif.');
  const validObject = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!validObject(changes) || !validObject(expected) || !Object.keys(changes).length ||
    Object.keys(changes).some(key => !['prestige', 'renommee', 'influence'].includes(key))) throw failure(400, 'Modification de soldes invalide.');
  for (const field of ['prestige', 'renommee']) {
    if (!Object.hasOwnProperty.call(changes, field)) continue;
    if (!Number.isSafeInteger(changes[field]) || !Number.isSafeInteger(expected[field]) || !Number.isSafeInteger(changes[field] - expected[field]) || (field === 'prestige' && changes[field] < 0)) throw failure(400, 'Les soldes doivent être des entiers ; seul celui de renommée peut être négatif.');
  }
  const influence = changes.influence === undefined ? [] : changes.influence;
  if (!Array.isArray(influence) || influence.length > 1000 || influence.some(item => !item || !Number.isSafeInteger(item.duchy_id) || item.duchy_id < 1 ||
    !Number.isSafeInteger(item.amount) || item.amount < 0 || !Number.isSafeInteger(item.expected) || item.expected < 0) ||
    new Set(influence.map(item => item.duchy_id)).size !== influence.length) throw failure(400, 'Les influences doivent être des entiers positifs ou nuls, avec un seul solde par duché.');
  return withImmediateTransaction(dbPath, async db => {
    const player = await resolvePlayer(db, actor, playerId);
    const before = await influenceState(db, player);
    for (const field of ['prestige', 'renommee']) {
      if (!Object.hasOwnProperty.call(changes, field)) continue;
      if (before[field] !== expected[field]) throw failure(409, 'Les soldes ont changé. Actualisez la fiche avant de modifier les valeurs.');
      await runSql(db, `UPDATE inventaire SET ${field}=? WHERE id=?`, [changes[field], player.inventaire_id]);
      if (changes[field] !== before[field]) await runSql(db, 'INSERT INTO transactions (seigneurie_id,resource,amount) VALUES (?,?,?)', [player.id, field, changes[field] - before[field]]);
    }
    for (const item of influence) {
      const previous = before.balances.find(balance => balance.duchy_id === item.duchy_id);
      if (!previous) throw failure(400, 'Duché introuvable.');
      if (previous.amount !== item.expected) throw failure(409, 'Les soldes ont changé. Actualisez la fiche avant de modifier les valeurs.');
      await runSql(db, `INSERT INTO player_duchy_influence (player_id,duchy_id,amount) VALUES (?,?,?)
        ON CONFLICT(player_id,duchy_id) DO UPDATE SET amount=excluded.amount`, [player.id, item.duchy_id, item.amount]);
      if (item.amount !== previous.amount) await runSql(db, 'INSERT INTO influence_events (player_id,duchy_id,amount,reason) VALUES (?,?,?,?)', [player.id, item.duchy_id, item.amount - previous.amount, `Correction administrative par ${actor.id}`]);
    }
    const after = await influenceState(db, player);
    const snapshot = state => ({ prestige: state.prestige, renommee: state.renommee, influence: Object.fromEntries(state.balances.map(item => [item.name, item.amount])) });
    await logAdminChange(db, { table: 'seigneuries', action: 'update', key: String(player.id), before: snapshot(before), after: snapshot(after), user: actor, strict: true });
    return after;
  });
}
async function debitInfluence(database, playerId, duchy, amount, reason) {
  const debit = await runSql(database, 'UPDATE player_duchy_influence SET amount=amount-? WHERE player_id=? AND duchy_id=? AND amount>=?', [amount, playerId, duchy.id, amount]);
  if (debit.changes !== 1) throw failure(400, `Influence insuffisante : ${duchy.name} (${amount} nécessaire${amount > 1 ? 's' : ''}).`);
  await runSql(database, 'INSERT INTO influence_events (player_id,duchy_id,amount,reason) VALUES (?,?,?,?)', [playerId, duchy.id, -amount, reason]);
}
async function convertPrestige({ dbPath, actor, playerId, amount, target }) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > Math.floor(Number.MAX_SAFE_INTEGER / 2)) throw failure(400, 'La quantité de prestige doit être un entier positif.');
  if (!['renommee', 'influence'].includes(target)) throw failure(400, 'Conversion inconnue.');
  return withImmediateTransaction(dbPath, async database => {
    const player = await resolvePlayer(database, actor, playerId);
    if (!['seigneur', 'eveque'].includes(player.type || 'seigneur')) throw failure(400, 'La conversion du prestige est réservée aux seigneurs et aux évêques.');
    const duchy = target === 'influence' ? await deJureDuchy(database, player.baronnie_id) : null;
    if (target === 'influence' && !duchy) throw failure(400, 'Le duché de jure de votre baronnie est introuvable.');
    const state = await influenceState(database, player);
    const balance = target === 'renommee' ? state.renommee : (state.balances.find(b => b.duchy_id === duchy.id)?.amount || 0);
    if (!Number.isSafeInteger(Number(balance) + amount * (target === 'influence' ? 2 : 1))) throw failure(400, 'Le solde résultant est trop élevé.');
    const debit = await runSql(database, 'UPDATE inventaire SET prestige=prestige-? WHERE id=? AND prestige>=?', [amount, player.inventaire_id, amount]);
    if (debit.changes !== 1) throw failure(400, 'Prestige insuffisant.');
    await runSql(database, 'INSERT INTO transactions (seigneurie_id,resource,amount) VALUES (?,?,?)', [player.id, 'prestige', -amount]);
    if (target === 'renommee') {
      await runSql(database, 'UPDATE inventaire SET renommee=renommee+? WHERE id=?', [amount, player.inventaire_id]);
      await runSql(database, 'INSERT INTO transactions (seigneurie_id,resource,amount) VALUES (?,?,?)', [player.id, 'renommee', amount]);
    } else {
      await runSql(database, `INSERT INTO player_duchy_influence (player_id,duchy_id,amount) VALUES (?,?,?)
        ON CONFLICT(player_id,duchy_id) DO UPDATE SET amount=amount+excluded.amount`, [player.id, duchy.id, amount * 2]);
      await runSql(database, 'INSERT INTO influence_events (player_id,duchy_id,amount,reason) VALUES (?,?,?,?)', [player.id, duchy.id, amount * 2, 'Conversion de prestige']);
    }
    return influenceState(database, player);
  });
}
function createInfluenceRouter(dbPath, isAdminActive) {
  const router = require('express').Router();
  router.use((req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Non autorisé.' }));
  const actor = req => ({ ...req.session.user, isAdminActive: !!isAdminActive(req.session.user) });
  const respond = async (res, work) => { try { res.json(await work()); } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Impossible de traiter l’influence.' }); } };
  router.get('/', (req, res) => respond(res, () => withImmediateTransaction(dbPath, async db => influenceState(db, await resolvePlayer(db, actor(req), req.query.seigneurie_id)))));
  router.put('/', (req, res) => respond(res, () => editInfluence({ dbPath, actor: actor(req), playerId: req.body.seigneurie_id, changes: req.body.changes, expected: req.body.expected })));
  router.get('/link_influence', (req, res) => respond(res, () => withImmediateTransaction(dbPath, async db => {
    const targetId = Number(req.query.barony_id);
    if (!Number.isSafeInteger(targetId) || targetId < 1) throw failure(400, 'Baronnie de destination invalide.');
    const player = await resolvePlayer(db, actor(req), req.query.seigneurie_id);
    return { influence: await linkInfluenceQuote(db, player, targetId) };
  })));
  router.post('/convert', (req, res) => respond(res, () => convertPrestige({ dbPath, actor: actor(req), playerId: req.body.seigneurie_id, amount: req.body.amount, target: req.body.target })));
  router.get('/recipients', (req, res) => respond(res, () => withImmediateTransaction(dbPath, async db => {
    const player = await resolvePlayer(db, actor(req), req.query.seigneurie_id);
    return allSql(db, 'SELECT p.id,g.name FROM seigneuries p JOIN seigneurs g ON g.id=p.seigneur_id WHERE p.id<>? AND g.user_id IS NOT NULL ORDER BY g.name', [player.id]);
  })));
  router.post('/transfer', (req, res) => respond(res, () => transferInfluence({ dbPath, actor: actor(req), playerId: req.body.seigneurie_id,
    destinationId: req.body.destination_id, duchyId: req.body.duchy_id, amount: req.body.amount })));
  return router;
}
async function transferInfluence({ dbPath, actor, playerId, destinationId, duchyId, amount }) {
  if (![destinationId, duchyId, amount].every(value => Number.isSafeInteger(value) && value > 0)) throw failure(400, 'Destination, duché et quantité doivent être des entiers positifs.');
  return withImmediateTransaction(dbPath, async db => {
    const player = await resolvePlayer(db, actor, playerId);
    const recipient = await getSql(db, 'SELECT p.id FROM seigneuries p JOIN seigneurs g ON g.id=p.seigneur_id WHERE p.id=? AND g.user_id IS NOT NULL', [destinationId]);
    if (!recipient || recipient.id === player.id) throw failure(400, 'Destinataire invalide.');
    const duchy = await getSql(db, 'SELECT id,name FROM duchies WHERE id=?', [duchyId]);
    if (!duchy) throw failure(400, 'Duché introuvable.');
    const balance = await getSql(db, 'SELECT amount FROM player_duchy_influence WHERE player_id=? AND duchy_id=?', [destinationId, duchyId]);
    if (!Number.isSafeInteger((balance?.amount || 0) + amount)) throw failure(400, 'Le solde du destinataire serait trop élevé.');
    await debitInfluence(db, player.id, duchy, amount, `Envoi au joueur ${destinationId}`);
    await runSql(db, `INSERT INTO player_duchy_influence (player_id,duchy_id,amount) VALUES (?,?,?)
      ON CONFLICT(player_id,duchy_id) DO UPDATE SET amount=amount+excluded.amount`, [destinationId, duchyId, amount]);
    await runSql(db, 'INSERT INTO influence_events (player_id,duchy_id,amount,reason) VALUES (?,?,?,?)', [destinationId, duchyId, amount, `Réception du joueur ${player.id}`]);
    return influenceState(db, player);
  });
}
module.exports = { influenceSchema, resolvePlayer, deJureDuchy, influenceState, debitInfluence, convertPrestige, transferInfluence, editInfluence, linkInfluenceQuote, createInfluenceRouter };
