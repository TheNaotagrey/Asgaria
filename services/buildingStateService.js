const { calculateProjection } = require('../src/seigneurieProjection');
const { employmentAllowed } = require('../src/employmentPolicy');
const { allSql, getSql, runSql, withImmediateTransaction } = require('../src/sqliteTransaction');

function actionError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseBuildings(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return {}; }
}

async function changeBuildingState({ dbPath, actor, playerId, buildingId, quantity, action }) {
  if (!actor || !Number.isSafeInteger(Number(actor.id))) throw actionError('Non autorisé.', 401);
  if (!Number.isSafeInteger(buildingId) || buildingId < 1 ||
      (action === 'activate' && (!Number.isSafeInteger(quantity) || quantity < 0))) {
    throw actionError('Bâtiment ou quantité invalide.');
  }
  if (!['activate', 'destroy'].includes(action)) throw actionError('Action inconnue.');

  return withImmediateTransaction(dbPath, async database => {
    const overrideId = actor.isAdminActive && playerId ? Number(playerId) : null;
    if (overrideId !== null && (!Number.isSafeInteger(overrideId) || overrideId < 1)) {
      throw actionError('Seigneurie invalide.');
    }
    const player = overrideId
      ? await getSql(database, 'SELECT * FROM seigneuries WHERE id=?', [overrideId])
      : await getSql(database,
        'SELECT s.* FROM seigneuries s JOIN seigneurs g ON g.id=s.seigneur_id WHERE g.user_id=?', [actor.id]);
    if (!player) throw actionError('Seigneurie introuvable.', 404);

    const [property, buildingProperties, infrastructureProperties, inventory, baronyProperties] = await Promise.all([
      getSql(database, 'SELECT * FROM building_properties WHERE id=?', [buildingId]),
      allSql(database, 'SELECT * FROM building_properties'),
      allSql(database, 'SELECT * FROM infrastructure_properties'),
      getSql(database, 'SELECT * FROM inventaire WHERE id=?', [player.inventaire_id]),
      player.baronnie_id
        ? getSql(database, 'SELECT * FROM barony_properties WHERE barony_id=?', [player.baronnie_id])
        : Promise.resolve(null)
    ]);
    if (!property) throw actionError('Bâtiment introuvable.');
    if (!inventory) throw actionError('Inventaire introuvable.');
    const buildings = parseBuildings(player.buildings);
    const currentProjection = calculateProjection({
      player, inventory, buildings, infrastructures: player.infrastructures,
      buildingProperties, infrastructureProperties, baronyProperties
    });
    const existing = buildings[buildingId] || {};
    const built = Number(existing.built) || 0;
    const currentActive = Number(existing.active) || 0;
    if (!Number.isSafeInteger(built) || built < 0 || !Number.isSafeInteger(currentActive) || currentActive < 0) {
      throw actionError('État du bâtiment invalide.');
    }

    let nextBuilt = built;
    let nextActive = currentActive;
    if (action === 'activate') {
      if (quantity > built) throw actionError('La quantité active dépasse la quantité construite.');
      nextActive = quantity;
      buildings[buildingId] = { ...existing, active: nextActive };
    } else {
      if (built < 1) throw actionError('Aucun bâtiment à détruire.');
      nextBuilt = built - 1;
      nextActive = Math.min(currentActive, nextBuilt);
      const updated = { ...existing, built: nextBuilt, active: nextActive };
      let effects;
      try { effects = property.effects ? JSON.parse(property.effects) : []; }
      catch (_) { throw actionError('Effets du bâtiment invalides.'); }
      if (!Array.isArray(effects)) throw actionError('Effets du bâtiment invalides.');
      effects.forEach((effect, index) => {
        const perMonth = Number.parseInt(effect.uses_per_month, 10);
        if (effect.type !== 'instant_production' || perMonth <= 0) return;
        const key = `effect_${index}_remaining`;
        if (effect.per_building === false) {
          if (!nextBuilt) delete updated[key];
        } else {
          const remaining = (Number(existing[key]) || 0) - perMonth;
          if (remaining > 0) updated[key] = remaining;
          else delete updated[key];
        }
      });
      if (nextBuilt) buildings[buildingId] = updated;
      else delete buildings[buildingId];
    }

    const projection = calculateProjection({
      player, inventory, buildings, infrastructures: player.infrastructures,
      buildingProperties, infrastructureProperties, baronyProperties
    });
    if (!employmentAllowed(currentProjection.employment.employed, projection.employment.employed, player.population)) {
      throw actionError('Cette action augmenterait le travail au-delà de la population disponible.');
    }
    await runSql(database, 'UPDATE players SET buildings=? WHERE id=?', [JSON.stringify(buildings), player.id]);
    return {
      building: { id: buildingId, built: nextBuilt, active: nextActive },
      employment: projection.employment,
      employmentDetails: projection.employmentDetails
    };
  });
}

module.exports = { changeBuildingState };
