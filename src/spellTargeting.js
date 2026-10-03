const { breadthFirst } = require('./bfs');

function findSpellTargets({ originSeigneurieId, originBaronyId, range, targets, adjacency }) {
  const maximumRange = Math.max(0, Number(range) || 0);
  const { distanceMap } = breadthFirst(originBaronyId, baronyId => adjacency[baronyId] || []);

  return (targets || [])
    .map(target => {
      const isOrigin = Number(target.seigneurie_id) === Number(originSeigneurieId);
      const distance = isOrigin ? 0 : distanceMap[target.baronnie_id];
      if (!isOrigin && (!Number.isFinite(distance) || distance > maximumRange)) return null;
      return { ...target, distance };
    })
    .filter(Boolean)
    .sort((left, right) => left.distance - right.distance || String(left.barony_name || '').localeCompare(String(right.barony_name || ''), 'fr'));
}

module.exports = { findSpellTargets };
