// An overloaded seigneurie must be able to reduce its workload in several steps.
function employmentAllowed(currentEmployed, nextEmployed, population) {
  const current = Number(currentEmployed);
  const next = Number(nextEmployed);
  const limit = Number(population);
  if (![current, next, limit].every(Number.isFinite)) return false;
  return next <= Math.max(current, limit);
}

module.exports = { employmentAllowed };
