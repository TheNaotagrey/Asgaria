const { inventaireFields } = require('../transactions');
const { getSql } = require('../src/sqliteTransaction');

function parse(value, fallback) {
  return typeof value === 'string' && value.trim() ? JSON.parse(value) : value || fallback;
}

function validateCosts(costs) {
  if (!costs || typeof costs !== 'object' || Array.isArray(costs) ||
      Object.entries(costs).some(([key, qty]) => !inventaireFields.includes(key) || !Number.isSafeInteger(qty) || qty <= 0)) {
    throw new Error('Les coûts doivent contenir des ressources reconnues et des quantités entières positives.');
  }
  return costs;
}

function validateSpecialist(body) {
  if (!['pirate', 'mercenaire'].includes(body.player_type)) throw new Error('Ce type ne peut pas avoir de spécialistes.');
  if (typeof body.label !== 'string' || !body.label.trim()) throw new Error('Le nom du spécialiste est requis.');
  function positiveInteger(field, label) {
    const value = body[field];
    if (value == null || value === '') return null;
    const result = Number(value);
    if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(result) || result < 1) {
      throw new Error(`${label} doit être un entier positif.`);
    }
    return result;
  }
  const location = body.location || null;
  const prerequisite = positiveInteger('prerequisite_id', 'L’infrastructure requise');
  const perInfrastructure = positiveInteger('per_infrastructure', 'La limite par infrastructure');
  const perShip = positiveInteger('per_ship', 'La limite par navire');
  if (body.player_type === 'pirate' && !['repaire', 'navire', 'repaire_ou_navire'].includes(location)) {
    throw new Error('Choisissez un lieu pour le spécialiste pirate.');
  }
  if (body.player_type === 'mercenaire' && (location || prerequisite || perInfrastructure || perShip)) {
    throw new Error('Les conditions de repaire et de navire sont réservées aux pirates.');
  }
  if (perInfrastructure && !prerequisite) throw new Error('Choisissez l’infrastructure à laquelle appliquer la limite.');
  if (perShip && location === 'repaire') throw new Error('La limite par navire exige que le spécialiste puisse embarquer.');
  const costs = validateCosts(parse(body.costs, {}));
  const rankCosts = parse(body.rank_costs, []);
  if (!Array.isArray(rankCosts)) throw new Error('Les coûts par rang doivent former une liste.');
  rankCosts.forEach(validateCosts);
  const maxCount = positiveInteger('max_count', 'Le maximum');
  if (maxCount && rankCosts.length > maxCount) throw new Error('Il y a plus de tarifs que de recrutements autorisés.');
  const productionCosts = validateCosts(parse(body.production_costs, {}));
  const production = positiveInteger('production', 'La quantité produite');
  const monthlyLimit = positiveInteger('monthly_limit', 'Le plafond de production');
  const produces = body.produces || null;
  if ((produces && !inventaireFields.includes(produces)) || Boolean(produces) !== Boolean(production) ||
      (!produces && (monthlyLimit || Object.keys(productionCosts).length))) {
    throw new Error('Renseignez la ressource et la quantité produite ensemble.');
  }
  const effects = parse(body.effects, []);
  if (!Array.isArray(effects) || effects.some(effect => !effect || typeof effect.type !== 'string')) {
    throw new Error('Les effets doivent former une liste d’effets configurés.');
  }
  return {
    player_type: body.player_type, label: body.label.trim(), costs: JSON.stringify(costs),
    rank_costs: JSON.stringify(rankCosts), max_count: maxCount, location, prerequisite_id: prerequisite,
    per_infrastructure: perInfrastructure, per_ship: perShip, production_costs: JSON.stringify(productionCosts),
    produces, production, monthly_limit: monthlyLimit, effects: JSON.stringify(effects),
    description: typeof body.description === 'string' ? body.description : ''
  };
}

const buildingFields = [
  'player_type', 'label', 'produces', 'production', 'costs', 'max', 'workers_per_building',
  'absolute_restrictions', 'infra_restrictions', 'effects', 'description',
  'rank_costs', 'location', 'prerequisite_id', 'per_infrastructure', 'per_ship', 'production_costs', 'monthly_limit'
];

function validateBuildingDefinition(db) {
  return async (req, res, next) => {
    if (!['POST', 'PUT'].includes(req.method)) return next();
    try {
      if (req.method === 'PUT') {
        const previous = await getSql(db, 'SELECT * FROM building_properties WHERE id=?', [req.path.split('/')[1]]);
        if (!previous) return res.status(404).json({ error: 'Fiche introuvable.' });
        req.body = { ...previous, ...req.body };
      }
      if (['pirate', 'mercenaire'].includes(req.body.player_type)) {
        const body = req.body;
        const normalized = validateSpecialist({
          ...body, max_count: body.max,
          production: !body.produces && Number(body.production) === 0 ? null : body.production
        });
        const { max_count, ...fields } = normalized;
        req.body = { ...body, ...fields, max: max_count };
        if (fields.prerequisite_id) {
          const required = await getSql(db, 'SELECT player_type,pirate_site FROM infrastructure_properties WHERE id=?', [fields.prerequisite_id]);
          if (required?.player_type !== 'pirate' || required.pirate_site !== 'repaire') {
            return res.status(400).json({ error: 'Choisissez une infrastructure de repaire pirate comme prérequis.' });
          }
        }
      }
      next();
    } catch (error) {
      res.status(400).json({ error: error instanceof SyntaxError ? 'Format de fiche invalide.' : error.message });
    }
  };
}

module.exports = { buildingFields, validateBuildingDefinition, validateSpecialist };
