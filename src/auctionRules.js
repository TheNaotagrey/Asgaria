(function(root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.AuctionRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const resources = {
    or_: 'Or', pierre: 'Pierre', fer: 'Fer', lingot_or: 'Lingots d’or', antidote: 'Antidotes',
    armureries: 'Armureries', rhum: 'Rhum', grague: 'Grague', vivres: 'Vivres',
    architectes: 'Architectes', charpentiers: 'Charpentiers', maitres_oeuvre: 'Maîtres d’œuvre',
    maitre_espions: 'Maîtres espions', chevaux: 'Chevaux', esclaves: 'Esclaves',
    fourrure: 'Fourrures', ivoire: 'Ivoire', soie: 'Soie', huile: 'Huile', teinture: 'Teintures',
    epices: 'Épices', sel: 'Sel', perle: 'Perles', encens: 'Encens', vin: 'Vin', pierre_precieuse: 'Pierres précieuses'
  };
  const effectLabels = {
    auction_commission_discount: 'Réduction de commission HV',
    auction_withdrawal_loss_discount: 'Réduction des pertes au retrait HV',
    auction_expiration_loss_discount: 'Réduction des pertes à l’expiration HV',
    auction_max_offers_bonus: 'Offres simultanées supplémentaires HV',
    auction_duration_bonus: 'Conservation supplémentaire HV'
  };
  const fields = {
    auction_commission_discount: 'commission', auction_withdrawal_loss_discount: 'withdrawalLoss',
    auction_expiration_loss_discount: 'expirationLoss', auction_max_offers_bonus: 'maxOffers', auction_duration_bonus: 'duration'
  };
  const base = { commission: 5, withdrawalLoss: 30, expirationLoss: 15, maxOffers: 5, duration: 10 };
  const parse = (value, fallback) => {
    if (value && typeof value === 'object') return value;
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
  };
  function validateEffects(value) {
    let definitions;
    try { definitions = typeof value === 'string' ? JSON.parse(value || '[]') : value || []; }
    catch (_) { throw new Error('Les effets doivent être une liste JSON valide.'); }
    if (!Array.isArray(definitions)) throw new Error('Les effets doivent être une liste.');
    for (const effect of definitions) {
      if (!effect || typeof effect !== 'object') throw new Error('Définition d’effet invalide.');
      if (!fields[effect.type]) continue;
      if (typeof effect.amount !== 'number' || !Number.isFinite(effect.amount) || effect.amount < 0 ||
          (['maxOffers', 'duration'].includes(fields[effect.type]) && !Number.isSafeInteger(effect.amount))) {
        throw new Error(`Valeur invalide : ${effectLabels[effect.type]}.`);
      }
    }
    return definitions;
  }
  function calculateRules(player, buildingProperties = [], infrastructureProperties = []) {
    const totals = Object.fromEntries(Object.keys(base).map(key => [key, 0]));
    const details = [];
    let unlocked = false;
    for (const [properties, entries, kind] of [
      [buildingProperties, parse(player.buildings, {}), 'building'],
      [infrastructureProperties, parse(player.infrastructures, {}), 'infrastructure']
    ]) {
      for (const property of properties) {
        const entry = entries[property.id] || 0;
        const count = Number(kind === 'building' ? entry.active || 0 : typeof entry === 'object' ? entry.built || 0 : entry);
        if (!Number.isSafeInteger(count) || count <= 0) continue;
        for (const effect of validateEffects(property.effects)) {
          if (effect.type === 'unlock_page' && effect.page === 'hotel_des_ventes') unlocked = true;
          const field = fields[effect.type];
          if (!field) continue;
          const contribution = effect.amount * count;
          totals[field] += contribution;
          if (!Number.isFinite(totals[field]) || (['duration', 'maxOffers'].includes(field) && !Number.isSafeInteger(totals[field] + base[field]))) {
            throw new Error('Le total des bonus HV est trop élevé.');
          }
          details.push({ type: effect.type, field, label: property.label || 'Sans nom', kind, count, amount: effect.amount, total: contribution });
        }
      }
    }
    return { unlocked, base, details, commission: Math.max(0, base.commission - totals.commission),
      withdrawalLoss: Math.max(0, base.withdrawalLoss - totals.withdrawalLoss),
      expirationLoss: Math.max(0, base.expirationLoss - totals.expirationLoss),
      maxOffers: base.maxOffers + totals.maxOffers, duration: base.duration + totals.duration };
  }
  // Integer arithmetic avoids losing an extra unit through floating-point rounding.
  function netAmount(amount, loss) {
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isFinite(loss) || loss < 0 || loss > 100) throw new Error('Montant HV invalide.');
    const [mantissa, exponent = '0'] = String(loss).toLowerCase().split('e');
    const decimals = (mantissa.split('.')[1] || '').length - Number(exponent);
    let numerator = BigInt(mantissa.replace('.', ''));
    let denominator = 1n;
    if (decimals > 0) denominator = 10n ** BigInt(decimals);
    else numerator *= 10n ** BigInt(-decimals);
    return Number(BigInt(amount) * (100n * denominator - numerator) / (100n * denominator));
  }
  function periodIndex(position) {
    if (!position || !Number.isSafeInteger(position.year) || !Number.isInteger(position.number) || position.number < 1 || position.number > 10 || !Number.isSafeInteger(position.year * 10)) {
      throw new Error('Période HV invalide.');
    }
    return position.year * 10 + position.number - 1;
  }
  function validateLot(lot, type) {
    if (!lot || !Object.prototype.hasOwnProperty.call(resources, lot.resource) || (type === 'eveque' && lot.resource === 'esclaves') || !Number.isSafeInteger(lot.amount) || lot.amount <= 0) {
      throw new Error('Ressource ou quantité non autorisée à l’Hôtel des ventes.');
    }
    return { resource: lot.resource, amount: lot.amount };
  }
  return { resources, effectLabels, base, validateEffects, calculateRules, netAmount, periodIndex, validateLot };
});
