(function (global) {
  function hexToRgba(hex, alpha = 255) {
    if (!hex || typeof hex !== 'string') return null;
    const raw = hex.replace('#', '').trim();
    if (raw.length !== 6) return null;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return [r, g, b, alpha];
  }

  function randomColor(seed) {
    let h = 0;
    const s = String(seed || 'x');
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
    const c = (n) => {
      const k = (n + h / 30) % 12;
      const a = 0.55 * Math.min(0.58, 1 - 0.58);
      return Math.round(255 * (0.58 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
    };
    return [c(0), c(8), c(4), 255];
  }

  function create(vm) {
    const terrain = [239, 228, 176, 255];

    function makeLegendItem(label, color, selection = null) {
      return { label, color, selection };
    }

    function applyBaronyFilter() {
      const colorMap = {};
      vm.baronies.list.forEach((b) => {
        colorMap[b.id] = hexToRgba(b.color) || randomColor(`barony:${b.id}`);
      });
      return { colorMap, legendItems: [] };
    }

    function applyEntityFilter(entityKey, resolver) {
      const colorMap = {};
      const legendById = {};
      vm.baronies.list.forEach((b) => {
        const entity = resolver(b);
        if (!entity) {
          colorMap[b.id] = terrain;
          return;
        }
        const col = hexToRgba(entity.color) || randomColor(`${entityKey}:${entity.id}`);
        colorMap[b.id] = col;
        if (!legendById[entity.id]) {
          legendById[entity.id] = makeLegendItem(entity.name || `${entityKey} #${entity.id}`, col, {
            type: entityKey,
            id: entity.id
          });
        }
      });
      return { colorMap, legendItems: Object.values(legendById) };
    }

    function applyDistanceFilter(context) {
      const colorMap = {};
      const origin = context?.selected?.baronyId;
      if (!origin) return { colorMap, legendItems: [] };
      const { distanceMap } = bfs2.computeBaronyDistances({ start: origin, viewModel: vm });
      Object.entries(distanceMap).forEach(([baronyId, dist]) => {
        const hue = (dist * 42) % 360;
        colorMap[baronyId] = randomColor(`dist:${hue}`);
      });
      return {
        colorMap,
        legendItems: [makeLegendItem('Distance depuis la baronnie sélectionnée', [80, 80, 80, 255])]
      };
    }

    const filters = [
      { id: 'barony', label: 'Baronnies' },
      { id: 'popReligion', label: 'Religion de la population' },
      { id: 'culture', label: 'Culture' },
      { id: 'duchy_dejure', label: 'Duché (de jure)' },
      { id: 'duchy_defacto', label: 'Duché (de facto)' },
      { id: 'distance', label: 'Distance' }
    ];

    const strategies = {
      barony: () => applyBaronyFilter(),
      popReligion: () => applyEntityFilter('religion', (b) => b.religion),
      culture: () => applyEntityFilter('culture', (b) => b.culture),
      duchy_dejure: () => applyEntityFilter('duchy', (b) => vm.getBaronyTitleId(b.id, 'duchy', 'dejure')),
      duchy_defacto: () => applyEntityFilter('duchy', (b) => vm.getBaronyTitleId(b.id, 'duchy', 'defacto')),
      distance: (ctx) => applyDistanceFilter(ctx)
    };

    function applyFilter(filterId, context = {}) {
      const fn = strategies[filterId] || strategies.barony;
      return fn(context);
    }

    return {
      getFilters: () => filters.slice(),
      applyFilter
    };
  }

  global.mapFilters2 = { create };
})(typeof window !== 'undefined' ? window : globalThis);
