(function(root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.GameRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const parse = (value, fallback) => {
    if (value && typeof value === 'object') return value;
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
  };
  const count = entry => Math.max(0, Number(typeof entry === 'object' ? entry?.built : entry) || 0);
  function constructionPopulationLimit(player, property) {
    const ratio = Number(property.workers_per_building);
    if (player.type !== 'eveque' || !(ratio > 0) || !Number.isFinite(ratio)) return Infinity;
    const population = Math.max(0, Number(player.population) || 0);
    const quotient = population / ratio;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(quotient + 1e-9));
  }
  function constructionWorkers(player, property, infrastructure = false) {
    if (player.type === 'eveque' || (infrastructure && player.type === 'pirate')) return 0;
    return Math.max(0, Number(property.workers_per_building) || 0);
  }
  function resetMonthlyUses(entries, properties) {
    const result = { ...parse(entries, {}) };
    for (const property of properties) {
      const raw = result[property.id];
      const built = count(raw);
      if (!built) continue;
      const entry = typeof raw === 'object' ? { ...raw } : { built };
      parse(property.effects, []).forEach((effect, index) => {
        if (effect.type !== 'instant_production') return;
        const uses = Number(effect.uses_per_month) || 0;
        if (uses > 0) entry[`effect_${index}_remaining`] = uses * (effect.per_building === false ? 1 : built);
      });
      result[property.id] = entry;
    }
    return result;
  }
  function tradeCapacity(infrastructures, properties, baronyProperties) {
    const entries = parse(infrastructures, {});
    const capacity = { land: 0, naval: 0 };
    function apply(effects, built) {
      parse(effects, []).forEach(effect => {
        const method = effect.type === 'land_transaction_max_per_month' ? 'land'
          : effect.type === 'naval_transaction_max_per_month' ? 'naval' : null;
        if (method) capacity[method] += Math.max(0, Number(effect.amount) || 0) * built;
      });
    }
    for (const property of properties) {
      const built = count(entries[property.id]);
      const required = parse(property.restrictions, {}).infrastructures || {};
      if (built && Object.entries(required).every(([id, n]) => count(entries[id]) >= Number(n))) apply(property.effects, built);
    }
    apply(baronyProperties?.effects, 1);
    return capacity;
  }
  function buildingRequirements(property, infrastructureProperties) {
    const requirements = { ...parse(property.infra_restrictions, {}) };
    if (property.max === 'high_sea_boat_limit' || property.type === 'high_sea_boat') {
      const port = infrastructureProperties.find(entry => entry.type === 'port' || entry.label === 'Port');
      // An absent port definition must not make the prerequisite disappear.
      requirements.infrastructures = { ...requirements.infrastructures, [port ? port.id : 'port']: 1 };
    }
    return requirements;
  }
  function utcTimestamp(value) {
    return typeof value === 'string' && /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)
      ? value.replace(' ', 'T') + 'Z' : value;
  }
  return { constructionPopulationLimit, constructionWorkers, resetMonthlyUses, tradeCapacity, buildingRequirements, utcTimestamp };
});
