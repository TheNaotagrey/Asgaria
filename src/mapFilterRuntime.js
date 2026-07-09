(function (global) {
  const terrainColor = [239, 228, 176];
  const selectedTransparencyFactor = 0.4;
  const DEFAULT_ALPHA = 255;
  const SELECTED_ALPHA = 102;

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }

  function generateColor(str) {
    const hue = Math.floor(Math.random() * 360);
    const [r, g, b] = hslToRgb(hue, 65, 65);
    return [r, g, b, DEFAULT_ALPHA];
  }

  function hexToRgb(hex) {
    if (!hex) return null;
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }

  function normalizeTradePath(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(val => parseInt(val, 10)).filter(Number.isFinite);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(val => parseInt(val, 10)).filter(Number.isFinite);
        }
      } catch (err) {
        const matches = raw.match(/-?\d+/g);
        return matches ? matches.map(val => parseInt(val, 10)).filter(Number.isFinite) : [];
      }
    }
    return [];
  }

  function createFromParts(core, data, registry, options = {}) {
    const updateLegend = options.updateLegend || (() => {});
    const tradeRoutePathColor = [255, 159, 67];
    let currentFilter = '';
    let colorMap = {};
    let tradeRouteSelection = null;
    let tradeLineSelection = null;

    function normalizeLabelForSearch(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    }

    function isExcludedPietyReligion(religionId) {
      if (!religionId) return true;
      const religion = data.religionMap?.[religionId];
      if (!religion?.name) return false;
      return normalizeLabelForSearch(religion.name).includes('athe');
    }

    function getSelectedMapId() {
      return data.selection?.mapId || null;
    }

    function normalizeEntityColor(entity, fallbackSeed) {
      const rgb = hexToRgb(entity?.color);
      if (rgb) return rgb;
      return generateColor(String(fallbackSeed || entity?.id || 'none')).slice(0, 3);
    }

    function entityKey(entity) {
      if (!entity) return null;
      return String(entity.id);
    }

    function commitFilter(legendData = null, patterns = {}) {
      updateLegend(legendData);
      core.setCanonicalPatterns(patterns || {});
      core.setColorMap(colorMap);
    }

    function initColorMap() {
      colorMap = {};
      Object.keys(data.baronyMeta || {}).forEach(id => {
        colorMap[id] = generateColor(id);
      });
      commitFilter(null, {});
    }

    function applyStraightforwardFilter(filter, randomize = false) {
      filter.onApply?.(data.viewModel, {
        data,
        core,
        filter,
        isExcludedPietyReligion
      });
      const groupColors = {};
      colorMap = {};
      Object.values(data.viewModel?.baronies?.byId || {}).forEach((barony) => {
        const id = barony.id;
        const entity = filter.legendEntityForBarony(barony, { data, core, filter });
        const key = entityKey(entity);
        if (!key) {
          colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
          return;
        }
        if (!groupColors[key]) {
          const randomColor = randomize ? hslToRgb(Math.floor(Math.random() * 360), 65, 65) : null;
          const color = randomColor || normalizeEntityColor(entity, key);
          groupColors[key] = {
            color,
            name: entity.name || 'N/A',
            entity
          };
        }
        const col = filter.colorForBarony(barony, { data, core, filter }) || groupColors[key].color;
        const rgb = Array.isArray(col) ? col : (hexToRgb(col) || groupColors[key].color);
        colorMap[id] = [rgb[0], rgb[1], rgb[2], DEFAULT_ALPHA];
      });
      commitFilter(groupColors, {});
    }

    function getSelectedBarony() {
      const selectedMapId = getSelectedMapId();
      return selectedMapId ? data.viewModel?.getEntity?.('barony', selectedMapId) || null : null;
    }

    function applyBaronyBasedOnSelectedFilter(filter) {
      const selected = getSelectedBarony();
      filter.onSelectBarony?.(selected, data.viewModel, { data, core, filter });
      const patterns = {};
      colorMap = {};
      Object.values(data.viewModel?.baronies?.byId || data.baronyMeta || {}).forEach((barony) => {
        const id = barony.id;
        const pattern = filter.patternForBarony?.(barony, selected, { data, core, filter }) || null;
        if (pattern) patterns[id] = pattern;
        const col = filter.colorForBarony?.(barony, selected, { data, core, filter }) || null;
        if (!col) return;
        const rgb = Array.isArray(col) ? col : hexToRgb(col);
        if (!rgb) return;
        colorMap[id] = [
          rgb[0],
          rgb[1],
          rgb[2],
          Number.isFinite(rgb[3]) ? rgb[3] : DEFAULT_ALPHA
        ];
      });
      commitFilter(filter.legendData || null, patterns);
    }

    function getBreadthFirst() {
      return global.breadthFirst || (typeof breadthFirst !== 'undefined' ? breadthFirst : null);
    }

    function applySeaDistanceFilter() {
      colorMap = {};
      const selectedMapId = getSelectedMapId();
      if (!selectedMapId) {
        commitFilter(null, {});
        return;
      }
      const distances = {};
      if (data.mapMode === 'sea') {
        const runBreadthFirst = getBreadthFirst();
        if (!runBreadthFirst) {
          commitFilter(null, {});
          return;
        }
        Object.assign(distances, runBreadthFirst(selectedMapId, cur => data.maritimeZoneAdjacency?.[cur] || []).distanceMap);
      }
      Object.values(data.baronyMeta || {}).forEach(barony => {
        const id = barony.id;
        const d = distances[id];
        if (d === undefined || d < 0) return;
        const hue = (d * 40) % 360;
        const [r, g, b] = hslToRgb(hue, 65, 65);
        colorMap[id] = [r, g, b, DEFAULT_ALPHA];
      });
      commitFilter(null, {});
    }

    function applyTradeRoutesFilter() {
      colorMap = {};
      const routeMap = data.tradeRouteById || {};
      const lineMap = data.tradeLineById || {};
      const route = tradeRouteSelection ? routeMap[tradeRouteSelection] : null;
      const line = tradeLineSelection ? lineMap[tradeLineSelection] : null;
      if (route) {
        const path = normalizeTradePath(route.path);
        const startId = route.barony_id_1;
        const endId = route.barony_id_2;
        const pathNodes = path.filter(id => id && id !== startId && id !== endId);
        pathNodes.forEach(id => {
          colorMap[id] = [...tradeRoutePathColor, DEFAULT_ALPHA];
        });
        if (startId) colorMap[startId] = [36, 163, 33, SELECTED_ALPHA];
        if (endId) colorMap[endId] = [36, 163, 33, SELECTED_ALPHA];
        commitFilter(null, {});
        return;
      }
      if (line) {
        colorMap[line.barony_id_1] = [36, 163, 33, SELECTED_ALPHA];
        colorMap[line.barony_id_2] = [36, 163, 33, SELECTED_ALPHA];
        commitFilter(null, {});
        return;
      }
      const filterDefinition = registry.byId?.trade_routes || null;
      if (filterDefinition) applyBaronyBasedOnSelectedFilter(filterDefinition);
    }

    function applyCanonicalFilter() {
      const groupColors = {};
      const patterns = {};
      colorMap = {};
      Object.values(data.viewModel?.baronies?.byId || data.baronyMeta || {}).forEach(barony => {
        const id = barony.id;
        const relatedBaronies = barony.canonicalLands || [];
        if (relatedBaronies.length === 0) {
          colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
          return;
        }
        patterns[id] = relatedBaronies.map(related => {
          const cid = related.id;
          if (!groupColors[cid]) {
            const col = hexToRgb(related.color) || generateColor(String(cid)).slice(0, 3);
            groupColors[cid] = { color: col, name: related.name || 'N/A' };
          }
          return groupColors[cid].color;
        });
        const first = patterns[id][0];
        colorMap[id] = [first[0], first[1], first[2], DEFAULT_ALPHA];
      });
      commitFilter(groupColors, patterns);
    }

    function applySanctuaryFilter() {
      const groupColors = {};
      const patterns = {};
      colorMap = {};
      Object.values(data.viewModel?.baronies?.byId || data.baronyMeta || {}).forEach(barony => {
        const id = barony.id;
        const sanctuaries = barony.sanctuaries || [];
        if (sanctuaries.length === 0) {
          colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
          return;
        }
        patterns[id] = [];
        let hasActive = false;
        const popReligionId = barony.religion_pop_id;
        sanctuaries.forEach(sanctuary => {
          const religionId = sanctuary.religion_id || sanctuary.religion?.id;
          if (!groupColors[religionId]) {
            const col =
              hexToRgb(sanctuary.religion?.color || data.religionMap?.[religionId]?.color) ||
              generateColor(String(religionId)).slice(0, 3);
            groupColors[religionId] = {
              color: col,
              name: sanctuary.religion?.name || data.religionMap?.[religionId]?.name || 'N/A'
            };
          }
          const col = groupColors[religionId].color;
          const isActive = popReligionId && String(popReligionId) === String(religionId);
          const repeat = isActive ? 3 : 1;
          if (isActive) hasActive = true;
          for (let i = 0; i < repeat; i++) patterns[id].push(col);
        });
        if (!hasActive) {
          if (!groupColors.background) {
            groupColors.background = {
              color: terrainColor,
              name: 'Aucun sanctuaire actif'
            };
          }
          patterns[id].unshift(
            groupColors.background.color,
            groupColors.background.color,
            groupColors.background.color
          );
        }
        const first = patterns[id][0];
        colorMap[id] = [first[0], first[1], first[2], DEFAULT_ALPHA];
      });
      commitFilter(groupColors, patterns);
    }

    function applySeaFilter(type) {
      if (type === 'distance') {
        applySeaDistanceFilter();
        return;
      }
      colorMap = {};
      Object.keys(data.baronyMeta || {}).forEach(id => {
        const hue = Math.floor(Math.random() * 360);
        const [r, g, b] = hslToRgb(hue, 65, 65);
        colorMap[id] = [r, g, b, DEFAULT_ALPHA];
      });
      commitFilter(null, {});
    }

    const complexFilters = {
      canonical: () => applyCanonicalFilter(),
      sanctuary: () => applySanctuaryFilter(),
      trade_routes: () => applyTradeRoutesFilter()
    };

    function applyFilter(type, randomize = false) {
      currentFilter = type || '';
      if (data.mapMode === 'sea') {
        applySeaFilter(currentFilter, randomize);
        return;
      }
      if (!currentFilter) {
        initColorMap();
        updateLegend(null);
        return;
      }
      const filterDefinition = registry.byId?.[currentFilter] || null;
      if (filterDefinition?.kind === 'baronyBasedOnSelected') {
        applyBaronyBasedOnSelectedFilter(filterDefinition);
        return;
      }
      if (filterDefinition?.straightforward) {
        applyStraightforwardFilter(filterDefinition, randomize);
        return;
      }
      const complexHandler = complexFilters[filterDefinition?.kind || currentFilter];
      if (complexHandler) {
        complexHandler(randomize);
        return;
      }
      colorMap = {};
      commitFilter(null, {});
    }

    initColorMap();
    return {
      applyFilter,
      randomizeColors: () => applyFilter(currentFilter, true),
      setTradeRouteSelection(routeId) {
        tradeRouteSelection = routeId || null;
        tradeLineSelection = null;
        if (currentFilter === 'trade_routes') applyFilter('trade_routes');
      },
      setTradeLineSelection(lineId) {
        tradeLineSelection = lineId || null;
        if (tradeLineSelection) tradeRouteSelection = null;
        if (currentFilter === 'trade_routes') applyFilter('trade_routes');
      },
      get currentFilter() { return currentFilter; }
    };
  }


  function create(options = {}) {
    const { core, data, registry, updateLegend } = options;
    if (!core) throw new Error('mapFilterRuntime.create requires core');
    if (!data) throw new Error('mapFilterRuntime.create requires data');
    if (!registry) throw new Error('mapFilterRuntime.create requires registry');
    return createFromParts(core, data, registry, { updateLegend });
  }

  const api = { create, createFromParts };
  global.mapFilterRuntime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
