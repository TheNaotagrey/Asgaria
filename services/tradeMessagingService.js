const { getSql, allSql, runSql, withImmediateTransaction } = require('../src/sqliteTransaction');

// Appelé sous le verrou de l'action commerciale : aucun événement si elle échoue.
async function recordTradeMessage(db, tradeId, kind, historical = false) {
  if (await getSql(db, 'SELECT message_id FROM character_trade_messages WHERE trade_id=? AND kind=?', [tradeId, kind])) return;
  const trade = await getSql(db, `SELECT t.*, so.id AS origin_character_id, sd.id AS destination_character_id,
    so.name AS origin_name, sd.name AS destination_name FROM trade_transactions t
    JOIN players po ON po.id=t.origin_id JOIN seigneurs so ON so.id=po.seigneur_id
    JOIN players pd ON pd.id=t.destination_id JOIN seigneurs sd ON sd.id=pd.seigneur_id
    WHERE t.id=?`, [tradeId]);
  if (!trade || !trade.origin_character_id || !trade.destination_character_id || trade.origin_character_id === trade.destination_character_id) return;
  const date = kind === 'sent' ? trade.created_at : trade.decision_time;
  if (!date) return;
  const sender = kind === 'sent' ? trade.origin_character_id : trade.destination_character_id;
  const recipient = kind === 'sent' ? trade.destination_character_id : trade.origin_character_id;
  const event = { kind, trade_id: trade.id, origin_character_id: trade.origin_character_id,
    destination_character_id: trade.destination_character_id, origin_name: trade.origin_name,
    destination_name: trade.destination_name, resources: JSON.parse(trade.resources || '{}'), reason: trade.reason || '' };
  const inserted = await runSql(db, `INSERT INTO character_messages
    (sender_id,recipient_id,pair_low,pair_high,body,created_at,read_at)
    VALUES (?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ',?),?)`,
  [sender, recipient, Math.min(sender, recipient), Math.max(sender, recipient),
    kind === 'sent' ? 'Envoi de ressources' : kind === 'accepted' ? 'Envoi accepté' : 'Envoi refusé', date,
    historical ? new Date().toISOString() : null]);
  await runSql(db, 'INSERT INTO character_trade_messages (message_id,trade_id,kind,event_json) VALUES (?,?,?,?)',
    [inserted.lastID, tradeId, kind, JSON.stringify(event)]);
}

async function backfillTradeMessages(databasePath) {
  return withImmediateTransaction(databasePath, async db => {
    const trades = await allSql(db, `SELECT id,state,decision_time FROM trade_transactions t
      WHERE NOT EXISTS (SELECT 1 FROM character_trade_messages e WHERE e.trade_id=t.id AND e.kind='sent')
      OR (t.decision_time IS NOT NULL AND t.state IN ('Approuvée','Refusée') AND NOT EXISTS
        (SELECT 1 FROM character_trade_messages e WHERE e.trade_id=t.id AND e.kind IN ('accepted','refused')))
      ORDER BY id`);
    for (const trade of trades) {
      await recordTradeMessage(db, trade.id, 'sent', true);
      if (trade.decision_time && ['Approuvée', 'Refusée'].includes(trade.state)) {
        await recordTradeMessage(db, trade.id, trade.state === 'Approuvée' ? 'accepted' : 'refused', true);
      }
    }
  });
}
module.exports = { recordTradeMessage, backfillTradeMessages };
