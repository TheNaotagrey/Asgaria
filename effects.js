class Effect {
  apply(ctx, count, label) {}
}

class StorageEffect extends Effect {
  constructor(resource, amount) {
    super();
    this.resource = resource;
    this.amount = amount;
  }
  apply(ctx, count) {
    if (!ctx.capacity) ctx.capacity = {};
    const base = ctx.capacity[this.resource] || 0;
    ctx.capacity[this.resource] = base + this.amount * count;
  }
}

class ResourceProductionEffect extends Effect {
  constructor(resource, amount) {
    super();
    this.resource = resource;
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const total = this.amount * count;
    if (!ctx.production) ctx.production = {};
    if (!ctx.productionDetails) ctx.productionDetails = {};
    ctx.production[this.resource] = (ctx.production[this.resource] || 0) + total;
    if (!ctx.productionDetails[this.resource]) ctx.productionDetails[this.resource] = [];
    ctx.productionDetails[this.resource].push({ label, amount: total, source: count });
    if (ctx.currentInfraId) {
      if (!ctx.infraProductionByInfra) ctx.infraProductionByInfra = {};
      if (!ctx.infraProductionByInfra[ctx.currentInfraId]) ctx.infraProductionByInfra[ctx.currentInfraId] = [];
      ctx.infraProductionByInfra[ctx.currentInfraId].push({ resource: this.resource, amount: total, label, source: count });
    }
  }
}

class BuildingProductionEffect extends Effect {
  constructor(building, amount) {
    super();
    this.building = building;
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const totalBonus = this.amount * count;
    if (!ctx.buildingProductionBonus) ctx.buildingProductionBonus = {};
    ctx.buildingProductionBonus[this.building] = (ctx.buildingProductionBonus[this.building] || 0) + totalBonus;
    if (!ctx.buildingProductionBonusDetails) ctx.buildingProductionBonusDetails = {};
    if (!ctx.buildingProductionBonusDetails[this.building]) ctx.buildingProductionBonusDetails[this.building] = [];
    ctx.buildingProductionBonusDetails[this.building].push({ label, amount: totalBonus, source: count });
    const bp = ctx.bpMap ? ctx.bpMap[String(this.building)] : null;
    if (!bp || !bp.produces) return;
    const info = ctx.buildings ? (ctx.buildings[this.building] || ctx.buildings[String(this.building)] || {}) : {};
    const active = info.active || 0;
    if (active <= 0) return;
    const added = totalBonus * active;
    if (!ctx.production) ctx.production = {};
    if (!ctx.productionDetails) ctx.productionDetails = {};
    const res = bp.produces;
    ctx.production[res] = (ctx.production[res] || 0) + added;
    if (!ctx.productionDetails[res]) ctx.productionDetails[res] = [];
    const arr = ctx.productionDetails[res];
    const buildLabel = bp.label || bp.type;
    const existing = arr.find(d => d.label === buildLabel);
    if (existing) {
      existing.amount += added;
    } else {
      arr.push({ label: buildLabel, amount: added, source: active });
    }
    if (ctx.currentInfraId) {
      if (!ctx.infraProductionByInfra) ctx.infraProductionByInfra = {};
      if (!ctx.infraProductionByInfra[ctx.currentInfraId]) ctx.infraProductionByInfra[ctx.currentInfraId] = [];
      ctx.infraProductionByInfra[ctx.currentInfraId].push({ resource: res, amount: added, label: buildLabel, source: active });
    }
  }
}

class InfraProductionEffect extends Effect {
  constructor(infrastructure, multiplier) {
    super();
    this.infrastructure = infrastructure;
    this.multiplier = multiplier;
  }
  apply(ctx, count) {
    if (!ctx.infrastructureProductionMultipliers) ctx.infrastructureProductionMultipliers = {};
    const current = ctx.infrastructureProductionMultipliers[this.infrastructure] || 1;
    const total = Math.pow(this.multiplier, count);
    ctx.infrastructureProductionMultipliers[this.infrastructure] = current * total;
  }
}

class InstantProductionEffect extends Effect {
  constructor(resource, amount, costs = {}, usesPerMonth = null, perBuilding = true) {
    super();
    this.resource = resource;
    this.amount = amount;
    this.costs = costs;
    this.usesPerMonth = usesPerMonth;
    this.perBuilding = perBuilding;
  }

  apply(ctx, count, label) {
    if (!ctx.instantProduction) ctx.instantProduction = [];
    ctx.instantProduction.push({
      label,
      resource: this.resource,
      amount: this.amount,
      costs: this.costs,
      usesPerMonth: this.usesPerMonth,
      perBuilding: this.perBuilding,
      source: count
    });
  }
}

class IDHEffect extends Effect {
  constructor(amount) {
    super();
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const total = this.amount * count;
    ctx.idh = (ctx.idh || 0) + total;
    if (ctx.idhDetails) {
      ctx.idhDetails.push({ label, amount: total, source: count });
    }
  }
}

class VariableWorkersEffect extends Effect {
  constructor(resource, amount) {
    super();
    this.resource = resource;
    this.amount = amount;
  }
  apply(ctx, workers, label) {
    const total = this.amount * workers;
    if (!ctx.production) ctx.production = {};
    if (!ctx.productionDetails) ctx.productionDetails = {};
    ctx.production[this.resource] = (ctx.production[this.resource] || 0) + total;
    if (!ctx.productionDetails[this.resource]) ctx.productionDetails[this.resource] = [];
    ctx.productionDetails[this.resource].push({ label, amount: total, source: workers });
    if (ctx.currentInfraId) {
      if (!ctx.infraProductionByInfra) ctx.infraProductionByInfra = {};
      if (!ctx.infraProductionByInfra[ctx.currentInfraId]) ctx.infraProductionByInfra[ctx.currentInfraId] = [];
      ctx.infraProductionByInfra[ctx.currentInfraId].push({ resource: this.resource, amount: total, label, source: workers });
    }
  }
}

class TagEffect extends Effect {
  constructor(tag, amount = 1) {
    super();
    this.tag = tag;
    this.amount = amount;
  }
  apply(ctx, count) {
    if (!ctx.tagCounts) ctx.tagCounts = {};
    ctx.tagCounts[this.tag] = (ctx.tagCounts[this.tag] || 0) + this.amount * count;
  }
}

class UnlockPageEffect extends Effect {
  constructor(page) {
    super();
    this.page = page;
  }
  apply(ctx) {
    if (!ctx.unlockedPages) ctx.unlockedPages = {};
    ctx.unlockedPages[this.page] = true;
  }
}

class SpellSuccessEffect extends Effect {
  constructor(amount) {
    super();
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const total = this.amount * count;
    ctx.spellSuccessBonus = (ctx.spellSuccessBonus || 0) + total;
    if (ctx.spellSuccessDetails) ctx.spellSuccessDetails.push({ label, amount: total, source: count });
  }
}

class SpellBasicDiscountEffect extends Effect {
  constructor(amount) {
    super();
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const total = this.amount * count;
    ctx.basicSpellDiscount = (ctx.basicSpellDiscount || 0) + total;
    if (ctx.basicSpellDiscountDetails) ctx.basicSpellDiscountDetails.push({ label, amount: total, source: count });
  }
}

class SpellAdvancedDiscountEffect extends Effect {
  constructor(amount) {
    super();
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const total = this.amount * count;
    ctx.advancedSpellDiscount = (ctx.advancedSpellDiscount || 0) + total;
    if (ctx.advancedSpellDiscountDetails) ctx.advancedSpellDiscountDetails.push({ label, amount: total, source: count });
  }
}

class SpellRangeEffect extends Effect {
  constructor(amount) {
    super();
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const total = this.amount * count;
    ctx.spellRangeBonus = (ctx.spellRangeBonus || 0) + total;
    if (ctx.spellRangeDetails) ctx.spellRangeDetails.push({ label, amount: total, source: count });
  }
}

class SpellMaxPerMonthEffect extends Effect {
  constructor(amount) {
    super();
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const total = this.amount * count;
    ctx.spellMax = (ctx.spellMax || 0) + total;
    if (ctx.spellMaxDetails) ctx.spellMaxDetails.push({ label, amount: total, source: count });
  }
}

class LandTransactionMaxPerMonthEffect extends Effect {
  constructor(amount) {
    super();
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const total = this.amount * count;
    ctx.landTxMax = (ctx.landTxMax || 0) + total;
    if (ctx.landTxMaxDetails) ctx.landTxMaxDetails.push({ label, amount: total, source: count });
  }
}

class NavalTransactionMaxPerMonthEffect extends Effect {
  constructor(amount) {
    super();
    this.amount = amount;
  }
  apply(ctx, count, label) {
    const total = this.amount * count;
    ctx.navalTxMax = (ctx.navalTxMax || 0) + total;
    if (ctx.navalTxMaxDetails) ctx.navalTxMaxDetails.push({ label, amount: total, source: count });
  }
}

module.exports = { Effect, StorageEffect, ResourceProductionEffect, BuildingProductionEffect, InfraProductionEffect, InstantProductionEffect, IDHEffect, VariableWorkersEffect, TagEffect, UnlockPageEffect, SpellSuccessEffect, SpellBasicDiscountEffect, SpellAdvancedDiscountEffect, SpellRangeEffect, SpellMaxPerMonthEffect, LandTransactionMaxPerMonthEffect, NavalTransactionMaxPerMonthEffect };
