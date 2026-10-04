const {
  StorageEffect, ResourceProductionEffect, BuildingProductionEffect,
  InfraProductionEffect, VariableWorkersEffect
} = require('../effects');

function parseObject(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}

function amount(value) {
  return Number(value) || 0;
}

// The covered economy has a single calculator for both the read model and updates.
// Inputs are plain records; no database access or time-dependent state is used here.
function calculateProjection({ player, inventory, buildings, infrastructures,
  buildingProperties, infrastructureProperties, baronyProperties } = {}) {
  const state = player || {};
  const inv = inventory || {};
  const built = parseObject(buildings === undefined ? state.buildings : buildings, {});
  const infra = parseObject(infrastructures === undefined ? state.infrastructures : infrastructures, {});
  const bp = buildingProperties || [];
  const ip = infrastructureProperties || [];
  const production = {};
  const productionDetails = {};
  const capacities = { vivres: 500, points_magique: 2000, hommes_darmes: 0, chevaux: 0, trebuchets: 0 };
  const buildingProductionBonus = {};
  const buildingProductionBonusDetails = {};
  const employmentDetails = [];
  let employed = amount(inv.hommes_darmes);
  if (employed) employmentDetails.push({ label: "Hommes d'armes", amount: employed, source: employed });
  const bpMap = Object.fromEntries(bp.map(entry => [String(entry.id), entry]));
  const ctx = {
    production, productionDetails, capacity: capacities, buildings: built, bpMap,
    buildingProductionBonus, buildingProductionBonusDetails,
    infrastructureProductionMultipliers: {}, infraProductionByInfra: {}
  };

  for (const entry of bp) {
    const info = built[entry.id] || built[String(entry.id)] || {};
    const active = amount(info.active);
    const workers = active * amount(entry.workers_per_building);
    employed += workers;
    if (workers) employmentDetails.push({ label: entry.label || entry.type, amount: workers, source: active });
    if (active && entry.produces && amount(entry.production)) {
      const total = active * amount(entry.production);
      production[entry.produces] = (production[entry.produces] || 0) + total;
      if (!productionDetails[entry.produces]) productionDetails[entry.produces] = [];
      productionDetails[entry.produces].push({ label: entry.label || entry.type, amount: total, source: active });
    }
  }

  function applyEffects(definitions, count, label, entryObj) {
    parseObject(definitions, []).forEach((def, index) => {
      let effect;
      if (def.type === 'storage') effect = new StorageEffect(def.resource, amount(def.amount));
      else if (def.type === 'production') effect = new ResourceProductionEffect(def.resource, amount(def.amount));
      else if (def.type === 'building_production') effect = new BuildingProductionEffect(def.building, amount(def.amount));
      else if (def.type === 'infra_production') effect = new InfraProductionEffect(def.infrastructure, amount(def.amount) || 1);
      else if (def.type === 'variable_workers') {
        const max = amount(def.max_workers) * count;
        const assigned = Math.max(0, Math.min(amount(entryObj[`effect_${index}_workers`]), max));
        employed += assigned;
        if (assigned) employmentDetails.push({ label, amount: assigned, source: assigned });
        effect = new VariableWorkersEffect(def.resource, amount(def.amount));
        effect.apply(ctx, assigned, label);
        return;
      }
      if (effect) effect.apply(ctx, count, label);
    });
  }

  for (const entry of ip) {
    const raw = infra[entry.id] || infra[String(entry.id)] || 0;
    const count = typeof raw === 'object' ? amount(raw.built) : amount(raw);
    if (!count) continue;
    const workers = count * amount(entry.workers_per_building);
    employed += workers;
    if (workers) employmentDetails.push({ label: entry.label || entry.type, amount: workers, source: count });
    ctx.currentInfraId = entry.id;
    applyEffects(entry.effects, count, entry.label || entry.type, typeof raw === 'object' ? raw : {});
    delete ctx.currentInfraId;
  }

  const slaves = amount(inv.esclaves);
  if (slaves) employmentDetails.push({ label: 'Esclaves', amount: -slaves, source: slaves });
  const population = amount(state.population);
  const consumption = { vivres: population * 15 + slaves * 5 };
  if (consumption.vivres) {
    production.vivres = (production.vivres || 0) - consumption.vivres;
    if (!productionDetails.vivres) productionDetails.vivres = [];
    if (population) productionDetails.vivres.push({ label: 'Population', amount: -population * 15, source: population });
    if (slaves) productionDetails.vivres.push({ label: 'Esclaves', amount: -slaves * 5, source: slaves });
  }
  const tax = { or_: Math.floor(population * amount(state.tax_rate) / 100) };
  if (tax.or_) {
    production.or_ = (production.or_ || 0) + tax.or_;
    if (!productionDetails.or_) productionDetails.or_ = [];
    productionDetails.or_.push({ label: 'Taxes', amount: tax.or_, source: amount(state.tax_rate) });
  }

  applyEffects(baronyProperties && baronyProperties.effects, 1, 'Baronnie', {});
  for (const [id, multiplier] of Object.entries(ctx.infrastructureProductionMultipliers)) {
    if (multiplier === 1) continue;
    for (const entry of ctx.infraProductionByInfra[id] || []) {
      const extra = entry.amount * (multiplier - 1);
      production[entry.resource] = (production[entry.resource] || 0) + extra;
      if (!productionDetails[entry.resource]) productionDetails[entry.resource] = [];
      const detail = productionDetails[entry.resource].find(item => item.label === entry.label);
      if (detail) detail.amount += extra;
      else productionDetails[entry.resource].push({ label: entry.label, amount: entry.amount * multiplier, source: entry.source });
    }
  }

  return {
    production, productionDetails, capacities,
    employment: { employed: Math.max(employed - slaves, 0), slaves }, employmentDetails,
    buildingProductionBonus, buildingProductionBonusDetails, consumption, tax
  };
}

module.exports = { calculateProjection };
