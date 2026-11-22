const express = require('express');
const { allSql, getSql, runSql, withImmediateTransaction } = require('../src/sqliteTransaction');
const logger = require('../logger');

const messagingSchema = `
CREATE TABLE IF NOT EXISTS character_messaging_migration (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS character_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES seigneurs(id),
  recipient_id INTEGER NOT NULL REFERENCES seigneurs(id),
  pair_low INTEGER NOT NULL,
  pair_high INTEGER NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at TEXT,
  CHECK(sender_id != recipient_id),
  CHECK(pair_low = min(sender_id, recipient_id) AND pair_high = max(sender_id, recipient_id))
);
CREATE INDEX IF NOT EXISTS character_messages_pair ON character_messages(pair_low, pair_high, id);
CREATE INDEX IF NOT EXISTS character_messages_sender ON character_messages(sender_id, id);
CREATE INDEX IF NOT EXISTS character_messages_recipient ON character_messages(recipient_id, id);
CREATE INDEX IF NOT EXISTS character_messages_chronology ON character_messages(pair_low,pair_high,created_at,id);
CREATE TABLE IF NOT EXISTS character_trade_messages (
  message_id INTEGER PRIMARY KEY REFERENCES character_messages(id) ON DELETE CASCADE,
  trade_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('sent','accepted','refused')),
  event_json TEXT NOT NULL,
  UNIQUE(trade_id,kind)
);
`;

function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail(400, 'Identifiant invalide.');
  return Number(value);
}
const characterExists = (db, id) => getSql(db, 'SELECT name FROM seigneurs WHERE id=?', [id]);

async function messagingIdentity(db, req) {
  const user = req.session.user;
  if (req.query.character_id !== undefined) {
    if (!user.is_admin || user.act_as_admin === false) fail(403, 'Seul un administrateur actif peut utiliser un autre personnage.');
    const id=positiveId(req.query.character_id);
    if (!await characterExists(db,id)) fail(404, 'Personnage introuvable.');
    return id;
  }
  if (req.query.seigneurie_id === undefined) {
    const lord = await getSql(db, 'SELECT s.id FROM seigneurs s WHERE s.user_id=? ORDER BY EXISTS(SELECT 1 FROM players p WHERE p.seigneur_id=s.id) DESC,s.id LIMIT 1', [user.id]);
    if (!lord) fail(403, 'Vous devez avoir un personnage pour accéder à la messagerie.');
    return lord.id;
  }
  if (!user.is_admin || user.act_as_admin === false) fail(403, 'Seul un administrateur actif peut consulter la messagerie d’un personnage.');
  const playerId = positiveId(req.query.seigneurie_id);
  const owner = await getSql(db, `SELECT s.id FROM players p JOIN seigneurs s ON s.id=p.seigneur_id WHERE p.id=?`, [playerId]);
  if (!owner) fail(404, 'Personnage introuvable.');
  return owner.id;
}

function createMessagingRouter(db, databasePath) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Connectez-vous pour accéder à la messagerie.' });
    try {
      if (!await getSql(db, 'SELECT id FROM users WHERE id=?', [req.session.user.id])) {
        return res.status(401).json({ error: 'Ce compte n’existe plus.' });
      }
      res.set('Cache-Control', 'no-store');
      next();
    } catch (error) { next(error); }
  });
  const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
  router.get('/recipients', route(async (req, res) => {
    const me = await messagingIdentity(db, req);
    const recipients = await allSql(db, `SELECT id, name FROM seigneurs WHERE id!=? ORDER BY name COLLATE NOCASE, id`, [me]);
    res.json({ recipients });
  }));
  router.get('/conversations', route(async (req, res) => {
    const me = await messagingIdentity(db, req);
    const conversations = await allSql(db, `WITH mine AS (
      SELECT *, CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END AS peer_id
      FROM character_messages WHERE sender_id=? OR recipient_id=?
    ), latest AS (SELECT peer_id,
      SUM(CASE WHEN recipient_id=? AND read_at IS NULL THEN 1 ELSE 0 END) AS unread_count
      FROM mine GROUP BY peer_id)
      SELECT DISTINCT l.peer_id AS character_id, COALESCE(s.name, 'Personnage indisponible') AS name,
        l.unread_count, m.id AS last_message_id, substr(m.body,1,160) AS preview, m.created_at, m.sender_id
      FROM latest l JOIN character_messages m ON m.id=(SELECT id FROM mine WHERE peer_id=l.peer_id ORDER BY created_at DESC,id DESC LIMIT 1)
      LEFT JOIN seigneurs s ON s.id=(SELECT id FROM seigneurs WHERE id=l.peer_id)
      ORDER BY m.created_at DESC,m.id DESC`, [me, me, me, me]);
    res.json({ character_id: me, can_send: !!await characterExists(db, me), conversations });
  }));
  router.get('/conversations/:id/messages', route(async (req, res) => {
    const me = await messagingIdentity(db, req), peer = positiveId(req.params.id);
    if (peer === me) fail(400, 'Choisissez un autre personnage.');
    const limit = req.query.limit === undefined ? 30 : positiveId(req.query.limit);
    if (limit > 100) fail(400, 'La limite doit être comprise entre 1 et 100 messages.');
    if (req.query.before !== undefined && req.query.after !== undefined) fail(400, 'Utilisez un seul curseur de pagination.');
    const forward = req.query.after !== undefined;
    const cursor = forward ? positiveId(req.query.after) : req.query.before === undefined ? null : positiveId(req.query.before);
    const pair = [Math.min(me, peer), Math.max(me, peer)];
    const anchor = cursor === null ? null : await getSql(db, 'SELECT created_at,id FROM character_messages WHERE id=? AND pair_low=? AND pair_high=?', [cursor, ...pair]);
    if (cursor !== null && !anchor) fail(400, 'Curseur absent de cette conversation.');
    const rows = await allSql(db, `SELECT m.id, sender_id, recipient_id, body, created_at, read_at, e.event_json
      FROM character_messages m LEFT JOIN character_trade_messages e ON e.message_id=m.id
      WHERE pair_low=? AND pair_high=? ${anchor ? `AND (created_at,id) ${forward ? '>' : '<'} (?,?)` : ''}
      ORDER BY created_at ${forward ? 'ASC' : 'DESC'},m.id ${forward ? 'ASC' : 'DESC'} LIMIT ?`,
    [...pair, ...(anchor ? [anchor.created_at, anchor.id] : []), limit + 1]);
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map(({ event_json, ...row }) => ({ ...row, ...(event_json ? { event: JSON.parse(event_json) } : {}) }));
    if (!forward) messages.reverse();
    res.json({ messages, has_more: hasMore });
  }));
  router.post('/conversations/:id/messages', route(async (req, res) => {
    const peer = positiveId(req.params.id);
    if (!req.body || typeof req.body.body !== 'string' || !req.body.body.trim() || req.body.body.length > 4000) {
      fail(400, 'Le message doit contenir entre 1 et 4 000 caractères.');
    }
    const message = await withImmediateTransaction(databasePath, async transaction => {
      const me = await messagingIdentity(transaction, req);
      if (peer === me) fail(400, 'Vous ne pouvez pas vous envoyer un message.');
      if (!await characterExists(transaction, me)) fail(403, 'Vous devez avoir un personnage joueur pour envoyer un message.');
      if (!await characterExists(transaction, peer)) fail(404, 'Ce destinataire n’est pas un personnage disponible.');
      const result = await runSql(transaction, `INSERT INTO character_messages (sender_id,recipient_id,pair_low,pair_high,body)
        VALUES (?,?,?,?,?)`, [me, peer, Math.min(me, peer), Math.max(me, peer), req.body.body.trim()]);
      return getSql(transaction, 'SELECT id,sender_id,recipient_id,body,created_at,read_at FROM character_messages WHERE id=?', [result.lastID]);
    });
    res.status(201).json({ message });
  }));
  router.post('/conversations/:id/read', route(async (req, res) => {
    const peer = positiveId(req.params.id), upTo = positiveId(req.body && req.body.up_to);
    const result = await withImmediateTransaction(databasePath, async transaction => {
      const me = await messagingIdentity(transaction, req);
      return runSql(transaction, `UPDATE character_messages SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE sender_id=? AND recipient_id=? AND (created_at,id)<=(SELECT created_at,id FROM character_messages WHERE id=?) AND read_at IS NULL
      AND EXISTS (SELECT 1 FROM character_messages WHERE id=? AND pair_low=? AND pair_high=?)`,
    [peer, me, upTo, upTo, Math.min(me, peer), Math.max(me, peer)]);
    });
    res.json({ read_count: result.changes });
  }));
  router.use((error, req, res, next) => {
    if (!error.status) logger.error(error.stack || error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'La messagerie est temporairement indisponible.' });
  });
  return router;
}
async function migrateCharacterMessages(databasePath) {
  return withImmediateTransaction(databasePath, async db => {
    if (await getSql(db, 'SELECT version FROM character_messaging_migration WHERE version=1')) return;
    if (!await getSql(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='private_messages'")) { await runSql(db, 'INSERT INTO character_messaging_migration VALUES (1)'); return; }
    const hasEvents = !!await getSql(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='private_trade_messages'");
    const rows = await allSql(db, `SELECT m.*, ${hasEvents ? 'e.trade_id,e.kind,e.event_json' : 'NULL AS trade_id,NULL AS kind,NULL AS event_json'},
      (SELECT s.id FROM seigneurs s WHERE s.user_id=m.sender_id ORDER BY EXISTS(SELECT 1 FROM players p WHERE p.seigneur_id=s.id) DESC,s.id LIMIT 1) AS sender,
      (SELECT s.id FROM seigneurs s WHERE s.user_id=m.recipient_id ORDER BY EXISTS(SELECT 1 FROM players p WHERE p.seigneur_id=s.id) DESC,s.id LIMIT 1) AS recipient
      FROM private_messages m ${hasEvents ? 'LEFT JOIN private_trade_messages e ON e.message_id=m.id' : ''}`);
    for (const row of rows) {
      // Les archives historiques restent intactes, y compris les comptes sans personnage actuel.
      if (!row.sender || !row.recipient || row.sender===row.recipient) continue;
      await runSql(db, 'INSERT OR IGNORE INTO character_messages(id,sender_id,recipient_id,pair_low,pair_high,body,created_at,read_at) VALUES (?,?,?,?,?,?,?,?)',
        [row.id,row.sender,row.recipient,Math.min(row.sender,row.recipient),Math.max(row.sender,row.recipient),row.body,row.created_at,row.read_at]);
      if (row.event_json) {
        const event=JSON.parse(row.event_json);
        event.origin_character_id=row.kind==='sent'?row.sender:row.recipient;
        event.destination_character_id=row.kind==='sent'?row.recipient:row.sender;
        delete event.origin_user_id; delete event.destination_user_id;
        await runSql(db, 'INSERT OR IGNORE INTO character_trade_messages(message_id,trade_id,kind,event_json) VALUES (?,?,?,?)', [row.id,row.trade_id,row.kind,JSON.stringify(event)]);
      }
    }
    await runSql(db, 'INSERT INTO character_messaging_migration VALUES (1)');
  });
}
module.exports = { messagingSchema, createMessagingRouter, migrateCharacterMessages };
