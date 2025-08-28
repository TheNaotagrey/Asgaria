function breadthFirst(start, getNeighbors) {
  const distanceMap = {};
  const queue = [];
  const starts = Array.isArray(start) ? start : [start];
  starts.forEach(s => {
    if (s == null) return;
    distanceMap[s] = 0;
    queue.push(s);
  });
  while (queue.length) {
    const cur = queue.shift();
    const neighbors = (getNeighbors(cur) || []);
    neighbors.forEach(n => {
      if (distanceMap[n] == null) {
        distanceMap[n] = distanceMap[cur] + 1;
        queue.push(n);
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
