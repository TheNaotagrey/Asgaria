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
  }
}

class InstantProductionEffect extends Effect {
  constructor(resource, amount, costs = {}, usesPerMonth = 0) {
    super();
    this.resource = resource;
    this.amount = amount;
    this.costs = costs;
    this.usesPerMonth = usesPerMonth;
  }

  apply(ctx, count, label) {
    if (!ctx.instantProduction) ctx.instantProduction = [];
    ctx.instantProduction.push({
      label,
      resource: this.resource,
      amount: this.amount,
      costs: this.costs,
      usesPerMonth: this.usesPerMonth,
      source: count
    });
  }
}

module.exports = { Effect, StorageEffect, ResourceProductionEffect, BuildingProductionEffect, InstantProductionEffect };
