const { compareUpdatePositions, formatUpdateLabel, UPDATE_DEFINITIONS } = require('./updateCycle');

function validateUpdatePolicy(value) {
  if (!value || typeof value.blocked !== 'boolean' || typeof value.limitEnabled !== 'boolean') {
    throw new Error('Les options de gel doivent être des booléens.');
  }
  const limit = value.limit;
  if (!limit || !Number.isInteger(limit.year) || limit.year < 1 || limit.year > 9999 ||
      !UPDATE_DEFINITIONS.some(entry => entry.number === limit.number)) {
    throw new Error('La mise à jour limite est invalide.');
  }
  return { blocked: value.blocked, limitEnabled: value.limitEnabled, limit: { year: limit.year, number: limit.number } };
}

function getUpdatePolicyBlocker(policy, next) {
  if (policy.blocked) return { code: 'updates_frozen', message: 'Toutes les mises à jour sont suspendues par l’administration.' };
  if (policy.limitEnabled && compareUpdatePositions(next, policy.limit) > 0) {
    return { code: 'update_limit', message: `Les mises à jour sont limitées à ${formatUpdateLabel(policy.limit)} par l’administration.` };
  }
  return null;
}

module.exports = { validateUpdatePolicy, getUpdatePolicyBlocker };
