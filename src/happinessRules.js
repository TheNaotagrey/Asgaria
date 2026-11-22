(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HappinessRules = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const festivalValues = { vivres: 1, rhum: 35, or_: 100, fourrure: 1250, huile: 1250, epices: 1250 };
  const stolenResources = ['or_', 'pierre', 'fer', 'lingot_or', 'antidote', 'armureries', 'rhum', 'grague', 'vivres',
    'fourrure', 'ivoire', 'soie', 'huile', 'teinture', 'epices', 'sel', 'perle', 'encens', 'vin', 'pierre_precieuse'];
  const number = value => Math.max(0, Number(value) || 0);
  function object(value) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
  }
  function festivalQuote(resources, population) {
    const value = Object.entries(festivalValues).reduce((sum, [key, weight]) => sum + number(resources[key]) * weight, 0);
    // Workbook CG83, CG85:CG88: round each threshold to tens, then use strict >.
    const thresholds = [0.333, 0.666, 1].map((ratio, index) => Math.max((index + 1) * 200, Math.round(number(population) * ratio / 10) * 10));
    return { value, thresholds, bonus: thresholds.filter(threshold => value > threshold).length };
  }
  function calculateIDH({ player = {}, inventory = {}, infrastructures, infrastructureProperties = [],
    lord = {}, barony, baronyProperties, festivalBonus = 0, famineDeaths = 0 } = {}) {
    const details = [{ label: 'Base', amount: 5, source: 1 }];
    const add = (label, amount, source = 1) => { if (amount) details.push({ label, amount, source }); };
    const infra = object(infrastructures === undefined ? player.infrastructures : infrastructures);
    const effects = (definitions, count, label) => {
      const list = object(definitions || '[]');
      if (Array.isArray(list)) list.filter(e => e.type === 'idh').forEach(e => add(label, (Number(e.amount) || 0) * count, count));
    };
    infrastructureProperties.forEach(property => {
      const entry = infra[property.id];
      const count = number(typeof entry === 'object' && entry ? entry.built : entry);
      if (count) effects(property.effects, count, property.label || property.type);
    });
    effects(baronyProperties && baronyProperties.effects, 1, 'Baronnie');
    const rate = number(player.tax_rate);
    add('Taxes', rate === 0 ? 3 : rate <= 2 ? 2 : rate <= 4 ? 1 : -(rate - 5), rate);
    add('Population', -Math.floor(number(player.population) / 1000), number(player.population));
    if (!lord.religion_id) add('Sans religion', -1);
    if (barony && lord.religion_id !== barony.religion_pop_id) add('Religion différente', -1);
    const total = number(player.population) + number(inventory.esclaves);
    if (total) add('Esclaves', -Math.min(5, Math.max(0, Math.floor(20 * number(inventory.esclaves) / total) - 1)), number(inventory.esclaves));
    add('Fête populaire (prochaine mise à jour)', Math.min(3, number(festivalBonus)));
    if (famineDeaths) add('Famine de la mise à jour', -(famineDeaths <= 20 ? 1 : famineDeaths <= 60 ? 2 : famineDeaths <= 180 ? 3 : 4), famineDeaths);
    return { idh: details.reduce((sum, item) => sum + item.amount, 0), idhDetails: details };
  }
  function revoltRisk(idh, player = {}) {
    if ((player.type || 'seigneur') !== 'seigneur') return { chance: 0, reason: 'role', idh };
    if (Number(player.beginner_protection) === 1) return { chance: 0, reason: 'protected', idh };
    if (idh >= 5) return { chance: 0, reason: 'happy', idh };
    const level = Math.min(5, Math.max(1, 5 - Math.floor(idh)));
    return { idh, chance: level * 15, rebelPercent: level * 2, soldierPercent: level,
      stolenPercent: [10, 20, 40, 60, 80][level - 1], buildings: level <= 2 ? 1 : level - 2,
      target: level === 1 ? 'granary' : level === 2 ? 'market' : 'random', reason: 'risk' };
  }
  function normalized(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function candidates(infrastructures, properties, risk) {
    const infra = object(infrastructures);
    return properties.filter(property => {
      if (property.revolt_destructible !== undefined && Number(property.revolt_destructible) !== 1) return false;
      const entry = infra[property.id];
      if (!number(typeof entry === 'object' && entry ? entry.built : entry)) return false;
      const label = normalized(property.label);
      const type = normalized(property.type);
      if (risk.target === 'granary') return label === 'grenier' || type === 'granary';
      if (risk.target === 'market') return label === 'marche' || type === 'market';
      return true;
    });
  }
  function revoltLosses(risk, population, inventory, infrastructures, properties) {
    const soldiers = number(inventory.hommes_darmes);
    const civilian = Math.max(0, number(population) - soldiers - number(inventory.miliciens));
    const treasury = properties.some(p => {
      const entry = object(infrastructures)[p.id];
      return normalized(p.label) === 'tresorerie' && number(typeof entry === 'object' && entry ? entry.built : entry);
    });
    const percent = (risk.stolenPercent || 0) * (treasury ? 0.75 : 1);
    const stolen = Object.fromEntries(stolenResources.map(key => [key, Math.round(number(inventory[key]) * percent / 100)]).filter(([, value]) => value));
    return { civilians: Math.round(civilian * number(risk.rebelPercent) / 100),
      slaves: Math.round(number(inventory.esclaves) * number(risk.rebelPercent) / 100),
      soldiers: Math.round(soldiers * number(risk.soldierPercent) / 100), stolen, stolenPercent: percent };
  }
  function resolveRevolt({ risk, population, inventory, infrastructures, properties, random = Math.random }) {
    const roll = risk.chance ? Math.floor(random() * 100) + 1 : null;
    if (!risk.chance || roll > risk.chance) return { ...risk, occurred: false, roll, destroyed: [] };
    const losses = revoltLosses(risk, population, inventory, infrastructures, properties);
    const destroyed = [];
    for (let i = 0; i < risk.buildings; i++) {
      const eligible = candidates(infrastructures, properties, risk);
      if (!eligible.length) break;
      // Draw among existing copies, without replacement, rather than among property types.
      const copies = eligible.map(p => { const e = infrastructures[p.id]; return number(typeof e === 'object' ? e.built : e); });
      let draw = Math.floor(random() * copies.reduce((a, b) => a + b, 0));
      let index = 0;
      while (draw >= copies[index]) draw -= copies[index++];
      const property = eligible[index];
      const entry = infrastructures[property.id];
      const built = number(typeof entry === 'object' ? entry.built : entry) - 1;
      if (built) {
        const updated = typeof entry === 'object' ? { ...entry, built } : { built };
        const definitions = object(property.effects || '[]');
        if (Array.isArray(definitions)) definitions.forEach((effect, effectIndex) => {
          if (effect.type === 'variable_workers') {
            const key = `effect_${effectIndex}_workers`;
            updated[key] = Math.min(number(updated[key]), number(effect.max_workers) * built);
          }
        });
        infrastructures[property.id] = updated;
      }
      else delete infrastructures[property.id];
      destroyed.push({ id: property.id, label: property.label || property.type, quantity: 1 });
    }
    return { ...risk, occurred: true, roll, losses, destroyed };
  }
  function updateHappinessPreview({ player, inventory, projection, infrastructures, infrastructureProperties, lord, barony, baronyProperties, festivalBonus = 0 }) {
    const state = { ...inventory };
    const deficit = Math.min(0, number(inventory.vivres) + (Number(projection.production.vivres) || 0));
    const deaths = Math.min(number(player.population), Math.ceil(Math.ceil(-deficit / 15) / 2));
    Object.entries(projection.production).forEach(([resource, delta]) => {
      state[resource] = Math.max(0, number(state[resource]) + delta);
      if (typeof projection.capacities[resource] === 'number') state[resource] = Math.min(state[resource], projection.capacities[resource]);
    });
    const population = Math.max(0, number(player.population) - deaths);
    const happiness = calculateIDH({ player: { ...player, population }, inventory: state, infrastructures,
      infrastructureProperties, lord, barony, baronyProperties, festivalBonus, famineDeaths: deaths });
    const risk = revoltRisk(happiness.idh, player);
    return { ...happiness, ...risk, festivalBonus, famineDeaths: deaths,
      possibleLosses: revoltLosses(risk, population, state, infrastructures, infrastructureProperties) };
  }
  return { festivalValues, festivalQuote, calculateIDH, revoltRisk, revoltLosses, resolveRevolt, updateHappinessPreview };
});
