const { inventaireFields } = require('../transactions');
const { withImmediateTransaction, getSql, allSql, runSql } = require('../src/sqliteTransaction');
const { findSpellTargets } = require('../src/spellTargeting');
const {
  SpellSuccessEffect, SpellBasicDiscountEffect, SpellAdvancedDiscountEffect,
  SpellRangeEffect, SpellMaxPerMonthEffect
} = require('../effects');
const luxuryResources = ['fourrure','ivoire','soie','huile','teinture','epices','sel','perle','encens','vin','pierre_precieuse'];

function spellError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validateAmounts(amounts, label) {
  if (!amounts || typeof amounts !== 'object' || Array.isArray(amounts)) {
    throw spellError(400, 'invalid_spell_cost', `${label} invalide.`);
  }
  for (const [resource, amount] of Object.entries(amounts)) {
    if (!inventaireFields.includes(resource) || !Number.isSafeInteger(amount) || amount < 0) {
      throw spellError(400, 'invalid_spell_cost', `${label} invalide pour la ressource « ${resource} ».`);
    }
  }
}

function parseJson(value, fallback, label) {
  try { return value ? JSON.parse(value) : fallback; }
  catch (_) { throw spellError(400, 'invalid_spell_definition', `${label} mal configuré.`); }
}

function applyModifier(context, definition, count) {
  const amount = Number(definition.amount) || 0;
  const constructors = {
    spell_success: SpellSuccessEffect,
    spell_basic_discount: SpellBasicDiscountEffect,
    spell_advanced_discount: SpellAdvancedDiscountEffect,
    spell_range: SpellRangeEffect,
    spell_max_per_month: SpellMaxPerMonthEffect
  };
  const Effect = constructors[definition.type];
  if (Effect) new Effect(amount).apply(context, count);
}

async function getCurrentSpellContext(database, source) {
  const context = { spellSuccessBonus: 0, basicSpellDiscount: 0, advancedSpellDiscount: 0, spellRangeBonus: 0, spellMax: 0 };
  const infrastructures = parseJson(source.infrastructures, {}, 'Infrastructures');
  const properties = await allSql(database, 'SELECT id, effects FROM infrastructure_properties ORDER BY id');
  for (const property of properties || []) {
    const entry = infrastructures[property.id] || infrastructures[String(property.id)] || 0;
    const count = Number(typeof entry === 'object' ? entry.built || 0 : entry) || 0;
    if (!count) continue;
    for (const definition of parseJson(property.effects, [], 'Effets d’infrastructure')) applyModifier(context, definition, count);
  }
  if (source.baronnie_id) {
    const property = await getSql(database, 'SELECT effects FROM barony_properties WHERE barony_id=?', [source.baronnie_id]);
    for (const definition of parseJson(property && property.effects, [], 'Effets de baronnie')) applyModifier(context, definition, 1);
  }
  return context;
}

async function debitResource(database, seigneurieId, inventoryId, resource, amount) {
  if (!amount) return;
  const result = await runSql(database,
    `UPDATE inventaire SET ${resource}=${resource}-? WHERE id=? AND ${resource}>=?`,
    [amount, inventoryId, amount]);
  if (!result.changes) {
    throw spellError(400, 'insufficient_resources', `Ressources insuffisantes : ${resource}.`);
  }
  await runSql(database,
    'INSERT INTO transactions (seigneurie_id, resource, amount) VALUES (?,?,?)',
    [seigneurieId, resource, -amount]);
}

async function creditResource(database, seigneurieId, inventoryId, resource, amount) {
  if (!inventaireFields.includes(resource) || !Number.isSafeInteger(amount) || amount < 0) {
    throw spellError(400, 'invalid_spell_effect', `Effet de sort invalide pour la ressource « ${resource} ».`);
  }
  if (!amount) return;
  await runSql(database, `UPDATE inventaire SET ${resource}=${resource}+? WHERE id=?`, [amount, inventoryId]);
  await runSql(database,
    'INSERT INTO transactions (seigneurie_id, resource, amount) VALUES (?,?,?)',
    [seigneurieId, resource, amount]);
}

async function castSpellAtomically({
  dbPath, sourceSeigneurieId, targetSeigneurieId, spellId, requestedAmount = 0, random = Math.random
}) {
  if (!Number.isSafeInteger(requestedAmount) || requestedAmount < 0) {
    throw spellError(400, 'invalid_amount', 'La quantité demandée doit être un entier positif ou nul.');
  }

  return withImmediateTransaction(dbPath, async database => {
    const source = await getSql(database,
      'SELECT id, baronnie_id, infrastructures, inventaire_id, COALESCE(spells_cast,0) AS spells_cast FROM seigneuries WHERE id=?',
      [sourceSeigneurieId]);
    if (!source) throw spellError(404, 'source_not_found', 'Seigneurie introuvable.');
    const context = await getCurrentSpellContext(database, source);
    const [connections, targetRows] = await Promise.all([
      allSql(database, 'SELECT barony_id_1, barony_id_2, distance FROM barony_connections'),
      allSql(database, `SELECT sg.id AS seigneurie_id, sg.baronnie_id, sg.inventaire_id,
        b.name AS barony_name, COALESCE(lord.name, 'Sans seigneur') AS seigneur_name
        FROM seigneuries sg JOIN baronies b ON b.id=sg.baronnie_id
        LEFT JOIN seigneurs lord ON lord.id=sg.seigneur_id`)
    ]);
    const adjacency = {};
    for (const connection of connections) {
      const left = Number(connection.barony_id_1);
      const right = Number(connection.barony_id_2);
      const distance = Number.parseInt(connection.distance, 10) || 1;
      if (!adjacency[left]) adjacency[left] = [];
      if (!adjacency[right]) adjacency[right] = [];
      adjacency[left].push({ id: right, distance });
      adjacency[right].push({ id: left, distance });
    }
    const target = findSpellTargets({
      originSeigneurieId: sourceSeigneurieId,
      originBaronyId: source.baronnie_id,
      range: Math.max(0, 5 + (context.spellRangeBonus || 0)),
      targets: targetRows,
      adjacency
    }).find(candidate => Number(candidate.seigneurie_id) === Number(targetSeigneurieId));
    if (!target) throw spellError(400, 'target_out_of_range', 'Destination hors de portée ou introuvable.');
    const spell = await getSql(database, 'SELECT * FROM spells WHERE id=?', [spellId]);
    if (!spell) throw spellError(404, 'spell_not_found', 'Sort introuvable.');
    const effects = parseJson(spell.effects, [], 'Effets du sort');
    const configuredCosts = parseJson(spell.costs, {}, 'Coûts du sort');
    if (!Array.isArray(effects)) throw spellError(400, 'invalid_spell_definition', 'Effets du sort mal configurés.');
    const discount = spell.type === 'base' ? context.basicSpellDiscount || 0 : context.advancedSpellDiscount || 0;
    const costs = Object.fromEntries(Object.entries(configuredCosts).map(([resource, amount]) =>
      [resource, Math.round(Number(amount) * (100 - discount) / 100)]));
    const variableEffect = effects.find(effect => effect.type === 'variable_production');
    let chosenAmount = 0;
    if (variableEffect && requestedAmount > 0) {
      const ratio = variableEffect.ratio || 1;
      const maximum = variableEffect.max || 0;
      chosenAmount = Math.min(requestedAmount, maximum || requestedAmount);
      const pmCost = Math.ceil((chosenAmount / ratio) * (100 - discount) / 100);
      costs.points_magique = (costs.points_magique || 0) + pmCost;
    }
    validateAmounts(costs, 'Coût du sort');
    const maxCasts = context.spellMax || 0;
    if (maxCasts && Number(source.spells_cast) >= maxCasts) {
      throw spellError(400, 'spell_limit_reached', 'Limite de sorts atteinte.');
    }

    for (const [resource, amount] of Object.entries(costs)) {
      await debitResource(database, sourceSeigneurieId, source.inventaire_id, resource, amount);
    }

    const successChance = 75 + (context.spellSuccessBonus || 0);
    const success = random() * 100 < successChance;
    const appliedLuxury = [];
    if (success) {
      for (const effect of effects) {
        if (effect.type === 'production') {
          const amount = Number(effect.amount || 0);
          await creditResource(database, targetSeigneurieId, target.inventaire_id, effect.resource, amount);
        } else if (effect.type === 'variable_production' && chosenAmount) {
          await creditResource(database, targetSeigneurieId, target.inventaire_id, effect.resource, chosenAmount);
        } else if (effect.type === 'random_luxury') {
          const resource = luxuryResources[Math.floor(random() * luxuryResources.length)];
          await creditResource(database, targetSeigneurieId, target.inventaire_id, resource, Number(effect.amount || 0));
          appliedLuxury.push(resource);
        }
      }
    }

    const counterUpdate = await runSql(database,
      `UPDATE seigneuries_info SET spells_cast=COALESCE(spells_cast,0)+1
       WHERE player_id=? AND (?=0 OR COALESCE(spells_cast,0)<?)`,
      [sourceSeigneurieId, maxCasts, maxCasts]);
    if (!counterUpdate.changes) throw spellError(400, 'spell_limit_reached', 'Limite de sorts atteinte.');
    const updated = await getSql(database,
      'SELECT COALESCE(spells_cast,0) AS spells_cast FROM seigneuries WHERE id=?',
      [sourceSeigneurieId]);
    const responseTarget = {
      seigneurie_id: target.seigneurie_id,
      baronnie_id: target.baronnie_id,
      barony_name: target.barony_name,
      seigneur_name: target.seigneur_name,
      distance: target.distance
    };
    return { success: Boolean(success), randomLuxury: appliedLuxury, target: responseTarget, spells_cast: updated.spells_cast };
  });
}

module.exports = { castSpellAtomically };
