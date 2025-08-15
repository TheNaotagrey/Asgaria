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

module.exports = { Effect, StorageEffect, ResourceProductionEffect };
