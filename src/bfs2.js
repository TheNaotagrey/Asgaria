(function (global) {
  function normalizeStartIds(start) {
    if (Array.isArray(start)) return start.filter((id) => id !== null && id !== undefined).map(String);
    if (start === null || start === undefined) return [];
    return [String(start)];
  }

  function resolveNeighborsFromVm(vm, baronyId) {
    const barony = vm?.baronies?.byId?.[String(baronyId)];
    if (!barony || !Array.isArray(barony.connectedBaronies)) return [];
    return barony.connectedBaronies;
  }

  function resolveNeighborsFromAdjacency(adjacencyMap, baronyId) {
    return adjacencyMap?.[String(baronyId)] || [];
  }

  function runDijkstra(start, getNeighbors) {
    const distanceMap = {};
    const queue = [];
    const starts = normalizeStartIds(start);
    starts.forEach((id) => {
      distanceMap[id] = 0;
      queue.push({ id, dist: 0 });
    });

    while (queue.length) {
      let bestIndex = 0;
      for (let i = 1; i < queue.length; i += 1) {
        if (queue[i].dist < queue[bestIndex].dist) bestIndex = i;
      }
      const current = queue.splice(bestIndex, 1)[0];
      if (!current) continue;
      if (current.dist !== distanceMap[current.id]) continue;

      (getNeighbors(current.id) || []).forEach((neighbor) => {
        const targetId = neighbor?.id !== undefined ? String(neighbor.id) : null;
        if (!targetId) return;
        const weight = Number.isFinite(parseInt(neighbor.distance, 10)) && parseInt(neighbor.distance, 10) > 0
          ? parseInt(neighbor.distance, 10)
          : 1;
        const nextDist = current.dist + weight;
        if (distanceMap[targetId] === undefined || nextDist < distanceMap[targetId]) {
          distanceMap[targetId] = nextDist;
          queue.push({ id: targetId, dist: nextDist });
        }
      });
    }

    return distanceMap;
  }

  function buildDistanceBuckets(distanceMap) {
    const buckets = [];
    Object.entries(distanceMap || {}).forEach(([id, distance]) => {
      if (!Number.isFinite(distance) || distance < 0) return;
      if (!Array.isArray(buckets[distance])) buckets[distance] = [];
      buckets[distance].push(id);
    });
    return buckets;
  }

  function computeBaronyDistances(params = {}) {
    const { start, viewModel, adjacencyMap } = params;
    const getNeighbors = viewModel
      ? (baronyId) => resolveNeighborsFromVm(viewModel, baronyId)
      : (baronyId) => resolveNeighborsFromAdjacency(adjacencyMap, baronyId);
    const distanceMap = runDijkstra(start, getNeighbors);
    return {
      distanceMap,
      distanceBuckets: buildDistanceBuckets(distanceMap)
    };
  }

  global.bfs2 = {
    computeBaronyDistances
  };
})(typeof window !== 'undefined' ? window : globalThis);
