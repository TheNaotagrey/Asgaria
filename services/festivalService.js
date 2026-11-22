const { festivalValues, festivalQuote } = require('../src/happinessRules');
const { runSql, getSql, withImmediateTransaction } = require('../src/sqliteTransaction');
const { compareUpdatePositions, normalizeUpdatePosition } = require('../src/updateCycle');

const festivalSchema = `CREATE TABLE IF NOT EXISTS player_festivals (
  player_id INTEGER PRIMARY KEY REFERENCES players(id),
  update_year INTEGER NOT NULL, update_number INTEGER NOT NULL,
  resources_json TEXT NOT NULL, bonus INTEGER NOT NULL CHECK(bonus BETWEEN 0 AND 3),
  value INTEGER NOT NULL, initiated_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;
function error(status, code, message) { return Object.assign(new Error(message), { status, code }); }
async function organizeFestival({ dbPath, actor, playerId, resources, expectedUpdate }) {
  if (!actor || !Number.isSafeInteger(Number(actor.id))) throw error(401, 'unauthorized', 'Non autorisé.');
  if (playerId !== undefined && (!actor.isAdminActive || !Number.isSafeInteger(Number(playerId)) || Number(playerId) < 1)) {
    throw error(403, 'forbidden', 'Vous ne pouvez pas organiser une fête pour cette seigneurie.');
  }
  if (!expectedUpdate || !Number.isInteger(expectedUpdate.year) || !Number.isInteger(expectedUpdate.number) || expectedUpdate.number < 1 || expectedUpdate.number > 10) {
    throw error(400, 'invalid_expected_update', 'La période attendue est invalide.');
  }
  if (!resources || typeof resources !== 'object' || Array.isArray(resources) || !Object.keys(resources).length ||
    Object.entries(resources).some(([key, amount]) => !Object.hasOwnProperty.call(festivalValues, key) || !Number.isSafeInteger(amount) || amount < 0) ||
    !Object.values(resources).some(amount => amount > 0)) throw error(400, 'invalid_resources', 'Choisissez des quantités entières positives parmi les ressources de fête.');
  return withImmediateTransaction(dbPath, async database => {
    const player = playerId
      ? await getSql(database, 'SELECT * FROM seigneuries WHERE id=?', [Number(playerId)])
      : await getSql(database, 'SELECT s.* FROM seigneuries s JOIN seigneurs g ON g.id=s.seigneur_id WHERE g.user_id=?', [actor.id]);
    if (!player) throw error(404, 'player_not_found', 'Seigneurie introuvable.');
    if ((player.type || 'seigneur') !== 'seigneur') throw error(400, 'invalid_role', 'Les fêtes populaires sont réservées aux seigneurs.');
    const period = normalizeUpdatePosition({ year: Number(player.update_year), number: Number(player.update_number) });
    if (compareUpdatePositions(period, expectedUpdate) !== 0) throw error(409, 'update_conflict', 'La période a changé. Rechargez la seigneurie.');
    const pending = await getSql(database, 'SELECT * FROM player_festivals WHERE player_id=?', [player.id]);
    if (pending && pending.update_year === period.year && pending.update_number === period.number) {
      throw error(409, 'festival_pending', 'Une fête est déjà prévue pour la prochaine mise à jour.');
    }
    if (pending) await runSql(database, 'DELETE FROM player_festivals WHERE player_id=?', [player.id]);
    const inventory = await getSql(database, 'SELECT * FROM inventaire WHERE id=?', [player.inventaire_id]);
    if (!inventory) throw error(400, 'inventory_missing', 'Inventaire introuvable.');
    const quote = festivalQuote(resources, player.population);
    if (!Number.isSafeInteger(quote.value)) throw error(400, 'invalid_resources', 'La valeur de la fête est trop élevée.');
    for (const [resource, amount] of Object.entries(resources)) {
      const labels = { vivres: 'vivres', rhum: 'rhum', or_: 'or', fourrure: 'fourrures', huile: 'huile', epices: 'épices' };
      if (amount > (Number(inventory[resource]) || 0)) throw error(400, 'insufficient_resources', `Ressources insuffisantes : ${labels[resource]}.`);
      if (!amount) continue;
      await runSql(database, `UPDATE inventaire SET ${resource}=${resource}-? WHERE id=?`, [amount, inventory.id]);
      await runSql(database, 'INSERT INTO transactions (seigneurie_id,resource,amount) VALUES (?,?,?)', [player.id, resource, -amount]);
    }
    await runSql(database, 'INSERT INTO player_festivals (player_id,update_year,update_number,resources_json,bonus,value,initiated_by_user_id) VALUES (?,?,?,?,?,?,?)',
      [player.id, period.year, period.number, JSON.stringify(resources), quote.bonus, quote.value, actor.id]);
    return { ...quote, resources };
  });
}
module.exports = { festivalSchema, organizeFestival };
