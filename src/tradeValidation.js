function invalidResources(message = 'Ressources invalides') {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeTradeResources(resources, allowedResources) {
  if (!resources || Array.isArray(resources) || typeof resources !== 'object') {
    throw invalidResources();
  }
  const normalized = {};
  Object.entries(resources).forEach(([resource, rawAmount]) => {
    const amount = Number(rawAmount);
    if (!allowedResources.includes(resource) || !Number.isSafeInteger(amount) || amount <= 0) {
      throw invalidResources();
    }
    const total = (normalized[resource] || 0) + amount;
    if (!Number.isSafeInteger(total)) throw invalidResources();
    normalized[resource] = total;
  });
  if (!Object.keys(normalized).length) throw invalidResources('Aucune ressource à envoyer');
  return normalized;
}

module.exports = { normalizeTradeResources };
