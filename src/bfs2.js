function breadthFirst(start, getNeighbors) {
  const distanceMap = {};
  const queue = [];
  const starts = Array.isArray(start) ? start : [start];
  starts.forEach(s => {
    if (s == null) return;
    distanceMap[s] = 0;
    queue.push({ id: s, dist: 0 });
  });
  while (queue.length) {
    let bestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].dist < queue[bestIndex].dist) bestIndex = i;
    }
    const curEntry = queue.splice(bestIndex, 1)[0];
    if (!curEntry) continue;
    const cur = curEntry.id;
    if (curEntry.dist !== distanceMap[cur]) continue;
    const neighbors = (getNeighbors(cur) || []);
    neighbors.forEach(n => {
      let targetId = n;
      let weight = 1;
      if (n && typeof n === 'object') {
        targetId = n.id ?? n.to ?? n.barony_id ?? n.zone_id;
        const parsedWeight = parseInt(n.distance, 10);
        if (Number.isFinite(parsedWeight) && parsedWeight > 0) {
          weight = parsedWeight;
        }
      }
      if (targetId == null) return;
      const nextDist = distanceMap[cur] + weight;
      if (distanceMap[targetId] == null || nextDist < distanceMap[targetId]) {
        distanceMap[targetId] = nextDist;
        queue.push({ id: targetId, dist: nextDist });
      }
    });
  }
  return { distanceMap };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { breadthFirst };
} else {
  (typeof window !== 'undefined' ? window : global).breadthFirst = breadthFirst;
}
