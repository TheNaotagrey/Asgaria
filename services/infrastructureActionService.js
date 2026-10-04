const { inventaireFields } = require('../transactions');
const { calculateProjection } = require('../src/seigneurieProjection');
const { employmentAllowed } = require('../src/employmentPolicy');
const { allSql, getSql, runSql, withImmediateTransaction } = require('../src/sqliteTransaction');

function actionError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function integer(value, label, minimum = 1) {
  const parsed = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw actionError(`${label} invalide.`);
  return parsed;
}

function parseObject(value, label, fallback = {}) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value || '{}'); }
    catch (_) { throw actionError(`${label} invalide.`); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw actionError(`${label} invalide.`);
  return parsed;
}

function effectsFor(property) {
  let effects;
  try { effects = JSON.parse(property.effects || '[]'); }
  catch (_) { throw actionError('Effets de l’infrastructure invalides.'); }
  if (!Array.isArray(effects)) throw actionError('Effets de l’infrastructure invalides.');
  return effects;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function loadPlayer(database, actor, requestedPlayerId) {
  if (!actor || !Number.isSafeInteger(Number(actor.id))) throw actionError('Non autorisé.', 401);
  const overrideId = actor.isAdminActive && requestedPlayerId !== undefined && requestedPlayerId !== null && requestedPlayerId !== ''
    ? integer(requestedPlayerId, 'Seigneurie') : null;
  const player = overrideId
    ? await getSql(database, 'SELECT * FROM seigneuries WHERE id=?', [overrideId])
    : await getSql(database,
      'SELECT s.* FROM seigneuries s JOIN seigneurs g ON g.id=s.seigneur_id WHERE g.user_id=?', [actor.id]);
  if (!player) throw actionError('Seigneurie introuvable.', 404);
  return player;
}

async function loadContext(database, player) {
  const inventory = await getSql(database, 'SELECT * FROM inventaire WHERE id=?', [player.inventaire_id]);
  if (!inventory) throw actionError('Inventaire introuvable.', 404);
  const [buildingProperties, infrastructureProperties, baronyProperties] = await Promise.all([
    allSql(database, 'SELECT * FROM building_properties'),
    allSql(database, 'SELECT * FROM infrastructure_properties'),
    player.baronnie_id ? getSql(database, 'SELECT * FROM barony_properties WHERE barony_id=?', [player.baronnie_id]) : Promise.resolve(null)
  ]);
  return { inventory, buildingProperties, infrastructureProperties, baronyProperties };
}

function currentInfrastructure(infrastructures, id) {
  const value = infrastructures[id] === undefined ? (infrastructures[String(id)] === undefined ? 0 : infrastructures[String(id)]) : infrastructures[id];
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value, built: numberOrZero(value.built) };
  return { built: numberOrZero(value) };
}

function employmentResult(player, inventory, buildings, infrastructures, props) {
  return calculateProjection({ player, inventory, buildings, infrastructures,
    buildingProperties: props.buildingProperties, infrastructureProperties: props.infrastructureProperties,
    baronyProperties: props.baronyProperties });
}

async function destroyInfrastructure({ dbPath, actor, playerId, infrastructureId }) {
  const id = integer(infrastructureId, 'Infrastructure');
  return withImmediateTransaction(dbPath, async database => {
    const player = await loadPlayer(database, actor, playerId);
    const infrastructures = parseObject(player.infrastructures, 'État des infrastructures');
    const existing = currentInfrastructure(infrastructures, id);
    if (!Number.isSafeInteger(existing.built) || existing.built < 1) throw actionError('Aucune infrastructure à détruire.');
    const property = await getSql(database, 'SELECT * FROM infrastructure_properties WHERE id=?', [id]);
    if (!property) throw actionError('Infrastructure introuvable.');
    const effects = effectsFor(property);
    const nextBuilt = existing.built - 1;
    const updated = { ...existing, built: nextBuilt };
    effects.forEach((effect, index) => {
      if (effect.type === 'instant_production') {
        const perMonth = effect.uses_per_month === undefined || effect.uses_per_month === null || effect.uses_per_month === ''
          ? 0 : Number(effect.uses_per_month);
        if (!Number.isSafeInteger(perMonth) || perMonth < 0) throw actionError('Limite d’utilisations de l’effet invalide.');
        if (perMonth > 0) {
          const key = `effect_${index}_remaining`;
          if (effect.per_building === false) {
            if (!nextBuilt) delete updated[key];
          } else {
            const remaining = numberOrZero(existing[key]) - perMonth;
            if (remaining > 0) updated[key] = remaining;
            else delete updated[key];
          }
        }
      }
      if (effect.type === 'variable_workers') {
        const key = `effect_${index}_workers`;
        const maxWorkers = Number(effect.max_workers);
        if (!Number.isSafeInteger(maxWorkers) || maxWorkers < 0 || !Number.isSafeInteger(maxWorkers * nextBuilt)) {
          throw actionError('Limite de travailleurs de l’infrastructure invalide.');
        }
        const assigned = Math.max(0, Math.min(numberOrZero(existing[key]), maxWorkers * nextBuilt));
        if (assigned) updated[key] = assigned;
        else delete updated[key];
      }
    });
    if (nextBuilt) infrastructures[id] = updated;
    else delete infrastructures[id];
    const { inventory, ...props } = await loadContext(database, player);
    const currentEmployment = employmentResult(player, inventory, parseObject(player.buildings, 'État des bâtiments'), player.infrastructures, props);
    const projection = employmentResult(player, inventory, parseObject(player.buildings, 'État des bâtiments'), infrastructures, props);
    if (!employmentAllowed(currentEmployment.employment.employed, projection.employment.employed, player.population)) {
      throw actionError('Cette destruction augmenterait le travail au-delà de la population disponible.');
    }
    await runSql(database, 'UPDATE players SET infrastructures=? WHERE id=?', [JSON.stringify(infrastructures), player.id]);
    return { infrastructure: { id, built: nextBuilt }, employment: projection.employment, employmentDetails: projection.employmentDetails };
  });
}

async function assignInfrastructureWorkers({ dbPath, actor, playerId, infrastructureId, effectIndex, quantity }) {
  const id = integer(infrastructureId, 'Infrastructure');
  const index = integer(effectIndex, 'Effet', 0);
  const amount = integer(quantity, 'Quantité', 0);
  return withImmediateTransaction(dbPath, async database => {
    const player = await loadPlayer(database, actor, playerId);
    const infrastructures = parseObject(player.infrastructures, 'État des infrastructures');
    const existing = currentInfrastructure(infrastructures, id);
    if (!Number.isSafeInteger(existing.built) || existing.built < 1) throw actionError('Cette infrastructure n’est pas construite.');
    const property = await getSql(database, 'SELECT * FROM infrastructure_properties WHERE id=?', [id]);
    if (!property) throw actionError('Infrastructure introuvable.');
    const effects = effectsFor(property);
    const effect = effects[index];
    if (!effect || effect.type !== 'variable_workers') throw actionError('Effet d’affectation introuvable.');
    const maxWorkers = Number(effect.max_workers);
    if (!Number.isSafeInteger(maxWorkers) || maxWorkers < 0 || !Number.isSafeInteger(existing.built) || existing.built < 0 ||
        !Number.isSafeInteger(maxWorkers * existing.built)) {
      throw actionError('Limite de travailleurs de l’infrastructure invalide.');
    }
    if (amount > maxWorkers * existing.built) throw actionError('La quantité dépasse le maximum de travailleurs pour les infrastructures construites.');
    const { inventory, ...props } = await loadContext(database, player);
    const currentEmployment = employmentResult(player, inventory, parseObject(player.buildings, 'État des bâtiments'), player.infrastructures, props);
    const updated = { ...existing, [`effect_${index}_workers`]: amount };
    infrastructures[id] = updated;
    const projection = employmentResult(player, inventory, parseObject(player.buildings, 'État des bâtiments'), infrastructures, props);
    if (!employmentAllowed(currentEmployment.employment.employed, projection.employment.employed, player.population)) {
      throw actionError('Travailleurs insuffisants pour cette affectation.');
    }
    await runSql(database, 'UPDATE players SET infrastructures=? WHERE id=?', [JSON.stringify(infrastructures), player.id]);
    return { infrastructures, employment: projection.employment, employmentDetails: projection.employmentDetails };
  });
}

async function useInfrastructureProduction({ dbPath, actor, playerId, infrastructureId, effectIndex, quantity }) {
  const id = integer(infrastructureId, 'Infrastructure');
  const index = integer(effectIndex, 'Effet', 0);
  const amount = integer(quantity, 'Quantité');
  return withImmediateTransaction(dbPath, async database => {
    const player = await loadPlayer(database, actor, playerId);
    const infrastructures = parseObject(player.infrastructures, 'État des infrastructures');
    const entry = currentInfrastructure(infrastructures, id);
    if (!Number.isSafeInteger(entry.built) || entry.built < 1) throw actionError('Cette infrastructure n’est pas construite.');
    const property = await getSql(database, 'SELECT * FROM infrastructure_properties WHERE id=?', [id]);
    if (!property) throw actionError('Infrastructure introuvable.');
    const effects = effectsFor(property);
    const effect = effects[index];
    if (!effect || effect.type !== 'instant_production') throw actionError('Effet de production immédiate introuvable.');
    if (!inventaireFields.includes(effect.resource)) throw actionError('Ressource produite invalide.');
    const productionPerUse = Number(effect.amount);
    if (!Number.isSafeInteger(productionPerUse) || productionPerUse < 1 || !Number.isSafeInteger(productionPerUse * amount)) {
      throw actionError('Quantité de production invalide.');
    }
    const usesPerMonth = effect.uses_per_month === undefined || effect.uses_per_month === null || effect.uses_per_month === ''
      ? 0 : Number(effect.uses_per_month);
    if (!Number.isSafeInteger(usesPerMonth) || usesPerMonth < 0) throw actionError('Limite d’utilisations de l’effet invalide.');
    const key = `effect_${index}_remaining`;
    const remaining = numberOrZero(entry[key]);
    if (usesPerMonth > 0 && (!Number.isSafeInteger(remaining) || amount > remaining)) {
      throw actionError('Utilisations insuffisantes pour cet effet.');
    }
    const costObject = effect.costs === undefined ? {} : effect.costs;
    if (!costObject || typeof costObject !== 'object' || Array.isArray(costObject)) throw actionError('Coûts de l’effet invalides.');
    const costs = {};
    for (const [resource, raw] of Object.entries(costObject)) {
      if (!inventaireFields.includes(resource)) throw actionError(`Ressource de coût invalide : ${resource}.`);
      const perUse = Number(raw);
      const total = perUse * amount;
      if (!Number.isSafeInteger(perUse) || perUse < 0 || !Number.isSafeInteger(total)) throw actionError(`Coût invalide pour ${resource}.`);
      costs[resource] = total;
    }
    const { inventory, ...props } = await loadContext(database, player);
    for (const [resource, cost] of Object.entries(costs)) {
      if (numberOrZero(inventory[resource]) < cost) throw actionError(`Ressources insuffisantes : ${resource}.`);
    }
    const produced = productionPerUse * amount;
    const inventoryAfter = { ...inventory };
    for (const [resource, cost] of Object.entries(costs)) inventoryAfter[resource] = numberOrZero(inventoryAfter[resource]) - cost;
    inventoryAfter[effect.resource] = numberOrZero(inventoryAfter[effect.resource]) + produced;
    const projection = employmentResult(player, inventoryAfter, parseObject(player.buildings, 'État des bâtiments'), infrastructures, props);
    const currentEmployment = employmentResult(player, inventory, parseObject(player.buildings, 'État des bâtiments'), infrastructures, props);
    if (!employmentAllowed(currentEmployment.employment.employed, projection.employment.employed, player.population)) {
      throw actionError('Population insuffisante pour cette production.');
    }
    if (effect.resource === 'hommes_darmes') {
      if (numberOrZero(inventoryAfter.hommes_darmes) > Number(player.population || 0)) throw actionError('Population insuffisante pour cette production.');
      if (projection.employment.employed + projection.employment.slaves > Number(player.population || 0)) {
        throw actionError('Travailleurs insuffisants après cette production.');
      }
    }
    for (const [resource, cost] of Object.entries(costs)) {
      if (cost) await runSql(database, `UPDATE inventaire SET ${resource}=${resource}-? WHERE id=? AND ${resource}>=?`, [cost, player.inventaire_id, cost]);
      const actual = await getSql(database, `SELECT ${resource} AS value FROM inventaire WHERE id=?`, [player.inventaire_id]);
      if (!actual) throw actionError('Inventaire introuvable.', 404);
      if (numberOrZero(actual.value) !== numberOrZero(inventory[resource]) - cost) throw actionError(`Débit impossible pour ${resource}.`);
      if (cost) await runSql(database, 'INSERT INTO transactions (seigneurie_id, resource, amount) VALUES (?,?,?)', [player.id, resource, -cost]);
    }
    if (produced) await runSql(database, `UPDATE inventaire SET ${effect.resource}=${effect.resource}+? WHERE id=?`, [produced, player.inventaire_id]);
    if (produced) await runSql(database, 'INSERT INTO transactions (seigneurie_id, resource, amount) VALUES (?,?,?)', [player.id, effect.resource, produced]);
    if (usesPerMonth > 0) entry[key] = remaining - amount;
    else delete entry[key];
    infrastructures[id] = entry;
    await runSql(database, 'UPDATE players SET infrastructures=? WHERE id=?', [JSON.stringify(infrastructures), player.id]);
    const finalInventory = await getSql(database, 'SELECT * FROM inventaire WHERE id=?', [player.inventaire_id]);
    return { infrastructures, inventaire: finalInventory };
  });
}

module.exports = { destroyInfrastructure, assignInfrastructureWorkers, useInfrastructureProduction };
