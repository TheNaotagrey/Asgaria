const sqlite3 = require('sqlite3');
const { inventaireFields } = require('../transactions');
const { calculateProjection } = require('../src/seigneurieProjection');
const { runSql, getSql, allSql, withImmediateTransaction } = require('../src/sqliteTransaction');
const {
  compareUpdatePositions, formatUpdateLabel, getLatestUnlockedUpdate,
  getNextUpdatePosition, getUnlockDateForUpdate, isUpdateUnlocked,
  normalizeUpdatePosition
} = require('../src/updateCycle');
const { validateUpdatePolicy, getUpdatePolicyBlocker } = require('../src/updatePolicy');

const RULESET_VERSION = '1026-1.0-initial';

function serviceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}

function currentPosition(row, now) {
  return normalizeUpdatePosition({ year: Number(row.update_year), number: Number(row.update_number) }, now);
}

function snapshot(row, inventory, position) {
  const fields = Object.fromEntries(inventaireFields.map(field => [field, Number(inventory[field]) || 0]));
  return {
    population: Number(row.population) || 0,
    update: position,
    inventory: fields,
    counters: {
      land_transactions: Number(row.land_transactions) || 0,
      naval_transactions: Number(row.naval_transactions) || 0,
      spells_cast: Number(row.spells_cast) || 0
    }
  };
}

async function resolvePlayer(database, actor, playerId) {
  if (!actor || !Number.isInteger(Number(actor.id))) throw serviceError(401, 'unauthorized', 'Non autorisé.');
  const id = actor.isAdminActive && playerId ? Number(playerId) : null;
  const row = id
    ? await getSql(database, 'SELECT s.*, g.user_id AS owner_user_id FROM seigneuries s JOIN seigneurs g ON g.id=s.seigneur_id WHERE s.id=?', [id])
    : await getSql(database, 'SELECT s.*, g.user_id AS owner_user_id FROM seigneuries s JOIN seigneurs g ON g.id=s.seigneur_id WHERE g.user_id=?', [actor.id]);
  if (!row) throw serviceError(404, 'player_not_found', 'Seigneurie introuvable.');
  return row;
}

async function readPolicy(database, now) {
  const row = await getSql(database, 'SELECT value FROM update_policy WHERE id=1');
  return row ? validateUpdatePolicy(JSON.parse(row.value))
    : { blocked: false, limitEnabled: false, limit: getLatestUnlockedUpdate(now) };
}

async function receiveTrade(database, playerId, next, capacities, inventory, now) {
  const received = {};
  const overflow = {};
  const rows = await allSql(database,
    "SELECT * FROM trade_transactions WHERE destination_id=? AND state='Approuvée' AND COALESCE(received,0)=0",
    [playerId]);
  for (const row of rows) {
    const origin = normalizeUpdatePosition({ year: Number(row.origin_update_year), number: Number(row.origin_update_number) }, now);
    if (!Number.isInteger(origin.year) || !Number.isInteger(origin.number) ||
        origin.number < 1 || origin.number > 10 || compareUpdatePositions(next, origin) < 0) continue;
    for (const [resource, rawAmount] of Object.entries(safeParse(row.resources, {}))) {
      const amount = parseInt(rawAmount, 10) || 0;
      if (!inventaireFields.includes(resource) || amount <= 0) continue;
      const current = Number(inventory[resource]) || 0;
      const cap = capacities[resource];
      const granted = typeof cap === 'number' ? Math.min(amount, Math.max(cap - current, 0)) : amount;
      if (granted < amount) overflow[resource] = (overflow[resource] || 0) + amount - granted;
      if (!granted) continue;
      await runSql(database, `UPDATE inventaire SET ${resource}=${resource}+? WHERE id=?`, [granted, inventory.id]);
      await runSql(database, 'INSERT INTO transactions (seigneurie_id,resource,amount) VALUES (?,?,?)', [playerId, resource, granted]);
      inventory[resource] = current + granted;
      received[resource] = (received[resource] || 0) + granted;
    }
    await runSql(database, 'UPDATE trade_transactions SET received=1 WHERE id=?', [row.id]);
  }
  return { received, overflow };
}

function presentReport(row) {
  return {
    id: row.id,
    from_update: { year: row.from_year, number: row.from_number },
    current_update: { year: row.to_year, number: row.to_number },
    current_update_label: formatUpdateLabel({ year: row.to_year, number: row.to_number }),
    before: safeParse(row.before_json, {}),
    delta: safeParse(row.delta_json, {}),
    after: safeParse(row.after_json, {}),
    events: safeParse(row.events_json, []),
    ruleset_version: row.ruleset_version,
    created_at: row.created_at
  };
}

async function advanceSeigneurieUpdate({ dbPath, actor, playerId, expectedUpdate, now = new Date() }) {
  if (!dbPath) throw new Error('Le chemin de la base est requis.');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('La date est invalide.');
  if (!expectedUpdate || !Number.isInteger(expectedUpdate.year) ||
      !Number.isInteger(expectedUpdate.number) || expectedUpdate.number < 1 || expectedUpdate.number > 10) {
    throw serviceError(400, 'invalid_expected_update', 'La période attendue est invalide.');
  }

  return withImmediateTransaction(dbPath, async database => {
    const row = await resolvePlayer(database, actor, playerId);
    const current = currentPosition(row, now);
    if (compareUpdatePositions(current, expectedUpdate) !== 0) {
      throw serviceError(409, 'update_conflict', 'La seigneurie a déjà changé. Rechargez son état.');
    }
    const next = getNextUpdatePosition(current);
    const inventory = await getSql(database, 'SELECT * FROM inventaire WHERE id=?', [row.inventaire_id]);
    if (!inventory) throw serviceError(400, 'inventory_missing', 'L’inventaire de cette seigneurie est introuvable.');
    const [buildingProperties, infrastructureProperties, baronyProperties, policy] = await Promise.all([
      allSql(database, 'SELECT * FROM building_properties'),
      allSql(database, 'SELECT * FROM infrastructure_properties'),
      row.baronnie_id ? getSql(database, 'SELECT * FROM barony_properties WHERE barony_id=?', [row.baronnie_id]) : Promise.resolve(null),
      readPolicy(database, now)
    ]);
    const projection = calculateProjection({
      player: row, inventory, buildings: row.buildings, infrastructures: row.infrastructures,
      buildingProperties, infrastructureProperties, baronyProperties
    });
    if (projection.employment.employed > (Number(row.population) || 0)) {
      throw serviceError(400, 'population_overload', 'La mise à jour est impossible tant que la population employée dépasse la population totale.');
    }
    if (!isUpdateUnlocked(next, now)) {
      throw serviceError(400, 'date_locked', `La prochaine mise à jour (${formatUpdateLabel(next)}) sera disponible à partir du ${getUnlockDateForUpdate(next).toLocaleDateString('fr-CA')}.`);
    }
    const blocker = getUpdatePolicyBlocker(policy, next);
    if (blocker) throw serviceError(403, blocker.code, blocker.message);

    const before = snapshot(row, inventory, current);
    const state = { ...inventory };
    const events = [];
    const overflow = {};
    let population = Number(row.population) || 0;
    for (const [resource, rawDelta] of Object.entries(projection.production)) {
      if (!inventaireFields.includes(resource)) continue;
      const change = Number(rawDelta) || 0;
      if (!change) continue;
      let value = (Number(state[resource]) || 0) + change;
      if (resource === 'vivres' && value < 0) {
        const deaths = Math.min(population, Math.ceil(Math.ceil(Math.abs(value) / 15) / 2));
        if (deaths > 0) {
          population -= deaths;
          events.push({ type: 'famine', title: 'Famine', details: `${deaths} habitants sont morts faute de vivres.` });
        }
        value = 0;
      }
      if (value < 0) value = 0;
      const cap = projection.capacities[resource];
      if (typeof cap === 'number' && value > cap) {
        overflow[resource] = (overflow[resource] || 0) + value - cap;
        value = cap;
      }
      state[resource] = value;
    }
    if (Object.keys(overflow).length) {
      events.push({ type: 'overflow', title: 'Perte par débordement', details: Object.entries(overflow).map(([r, n]) => `${n} ${r}`).join(', ') });
    }
    await runSql(database,
      `UPDATE inventaire SET ${inventaireFields.map(field => `${field}=?`).join(',')} WHERE id=?`,
      [...inventaireFields.map(field => Number(state[field]) || 0), inventory.id]);
    await runSql(database,
      'UPDATE players SET population=?,update_year=?,update_number=?,land_transactions=0,naval_transactions=0 WHERE id=?',
      [population, next.year, next.number, row.id]);
    await runSql(database, 'UPDATE seigneuries_info SET spells_cast=0 WHERE player_id=?', [row.id]);
    const delivery = await receiveTrade(database, row.id, next, projection.capacities, state, now);
    if (Object.keys(delivery.overflow).length) {
      events.push({ type: 'delivery_overflow', title: 'Réception partielle', details: `Certaines ressources reçues ont été perdues faute de place : ${Object.entries(delivery.overflow).map(([r, n]) => `${n} ${r}`).join(', ')}.` });
    }
    const after = snapshot({ ...row, population, land_transactions: 0, naval_transactions: 0, spells_cast: 0 }, state, next);
    const delta = {
      population: after.population - before.population,
      inventory: Object.fromEntries(inventaireFields.map(field => [field, after.inventory[field] - before.inventory[field]])),
      production: projection.production,
      tax: projection.tax,
      consumption: projection.consumption,
      received: delivery.received,
      overflow: Object.fromEntries([...new Set([...Object.keys(overflow), ...Object.keys(delivery.overflow)])]
        .map(field => [field, (overflow[field] || 0) + (delivery.overflow[field] || 0)]))
    };
    const inserted = await runSql(database,
      `INSERT INTO player_update_reports
       (player_id,initiated_by_user_id,from_year,from_number,to_year,to_number,ruleset_version,before_json,delta_json,after_json,events_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [row.id, actor.id, current.year, current.number, next.year, next.number, RULESET_VERSION,
        JSON.stringify(before), JSON.stringify(delta), JSON.stringify(after), JSON.stringify(events)]);
    return { id: inserted.lastID, from_update: current, current_update: next,
      current_update_label: formatUpdateLabel(next), before, delta, after, events,
      ruleset_version: RULESET_VERSION };
  });
}

async function getUpdateReport({ dbPath, actor, reportId }) {
  if (!actor || !Number.isInteger(Number(actor.id))) throw serviceError(401, 'unauthorized', 'Non autorisé.');
  const id = Number(reportId);
  if (!Number.isSafeInteger(id) || id < 1) throw serviceError(404, 'report_not_found', 'Relevé introuvable.');
  const database = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  try {
    const row = await getSql(database,
      `SELECT r.*, g.user_id AS owner_user_id FROM player_update_reports r
       JOIN players p ON p.id=r.player_id JOIN seigneurs g ON g.id=p.seigneur_id WHERE r.id=?`, [id]);
    if (!row || (!actor.isAdminActive && row.owner_user_id !== Number(actor.id))) {
      throw serviceError(404, 'report_not_found', 'Relevé introuvable.');
    }
    return presentReport(row);
  } finally {
    await new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
  }
}

module.exports = { RULESET_VERSION, advanceSeigneurieUpdate, getUpdateReport, formatStoredReport: presentReport };
