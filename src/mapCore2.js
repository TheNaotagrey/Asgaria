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

  function createFilterRuntime(core, data, registry, options = {}) {
    const updateLegend = options.updateLegend || (() => {});
    const tradeRoutePrimaryColor = [36, 163, 33];
    const tradeRouteLandColor = [255, 106, 6];
    const tradeRouteSeaColor = [52, 152, 219];
    const tradeRoutePathColor = [255, 159, 67];
    let currentFilter = '';
    let colorMap = {};
    let tradeRouteSelection = null;
    let tradeLineSelection = null;

    function getSeigneurRankKey(seigneurId) {
      const sid = String(seigneurId || '');
      if (data.seigneurToEmpire?.[sid]?.length) return 'empire';
      if (data.seigneurToKingdom?.[sid]?.length) return 'kingdom';
      if (data.seigneurToArchduchy?.[sid]?.length) return 'archduchy';
      if (data.seigneurToDuchy?.[sid]?.length) return 'duchy';
      if (data.seigneurToMarquisate?.[sid]?.length) return 'marquisate';
      if (data.seigneurToCounty?.[sid]?.length) return 'county';
      if (data.seigneurToViscounty?.[sid]?.length) return 'viscounty';
      return 'barony';
    }

    function getVmBarony(id) {
      return data.viewModel?.baronies?.byId?.[String(id)] || null;
    }

    function getVmTitleForBarony(baronyId, rankKey, mode = 'dejure') {
      const barony = getVmBarony(baronyId);
      return barony?.[mode]?.[rankKey] || null;
    }

    function getDuchyIdForBarony(info) {
      if (!info) return null;
      const vmTitle = getVmTitleForBarony(info.id, 'duchy', 'dejure');
      if (vmTitle) return vmTitle.id;
      const county = data.countyMap?.[info.county_id];
      return county?.duchy_id || null;
    }

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

    function buildDuchyPietyWinners() {
      const piety = global.duchyPiety || (typeof duchyPiety !== 'undefined' ? duchyPiety : null);
      if (!piety) return {};
      const stats = piety.computeDuchyPietyStats(
        {
          baronyMeta: data.baronyMeta,
          sanctuaryMap: data.sanctuaryMap,
          seigneurMap: data.seigneurMap,
          duchyMap: data.duchyMap,
          religionMap: data.religionMap
        },
        {
          getDuchyIdForBarony,
          getSeigneurRankKey,
          isExcludedReligion: isExcludedPietyReligion,
          includeTieBreakBonus: true
        }
      );
      return piety.buildDuchyPietyWinnersFromStats(stats, data.religionMap);
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

    function getBreadthFirst() {
      return global.breadthFirst || (typeof breadthFirst !== 'undefined' ? breadthFirst : null);
    }

    function applyDistanceFilter() {
      colorMap = {};
      const selectedMapId = getSelectedMapId();
      const runBreadthFirst = getBreadthFirst();
      if (!selectedMapId || !runBreadthFirst) {
        commitFilter(null, {});
        return;
      }
      const { distanceMap: distances } = runBreadthFirst(selectedMapId, cur => data.baronyAdjacency[cur] || []);
      Object.keys(data.baronyMeta || {}).forEach(id => {
        const d = distances[id];
        if (d === undefined) return;
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
        if (startId) colorMap[startId] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
        if (endId) colorMap[endId] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
        commitFilter(null, {});
        return;
      }
      if (line) {
        colorMap[line.barony_id_1] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
        colorMap[line.barony_id_2] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
        commitFilter(null, {});
        return;
      }
      const selectedId = getSelectedMapId();
      if (!selectedId) {
        commitFilter(null, {});
        return;
      }
      const patterns = {};
      colorMap[selectedId] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
      const landConnected = new Set((data.tradeRouteConnections && data.tradeRouteConnections[selectedId]) || []);
      const seaConnected = new Set((data.tradeLineConnections && data.tradeLineConnections[selectedId]) || []);
      landConnected.forEach(id => {
        if (!id) return;
        if (seaConnected.has(id)) {
          patterns[id] = [tradeRouteLandColor, tradeRouteSeaColor];
          colorMap[id] = [...tradeRouteLandColor, DEFAULT_ALPHA];
          return;
        }
        colorMap[id] = [...tradeRouteLandColor, DEFAULT_ALPHA];
      });
      seaConnected.forEach(id => {
        if (!id || landConnected.has(id)) return;
        colorMap[id] = [...tradeRouteSeaColor, DEFAULT_ALPHA];
      });
      commitFilter({
        land: { color: tradeRouteLandColor, name: 'Route (terre)' },
        sea: { color: tradeRouteSeaColor, name: 'Ligne (mer)' }
      }, patterns);
    }

    function applyCanonicalFilter() {
      const groupColors = {};
      const patterns = {};
      colorMap = {};
      Object.keys(data.baronyMeta || {}).forEach(id => {
        const relatedIds = data.canonicalLandMap?.[id] || [];
        if (relatedIds.length === 0) {
          colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
          return;
        }
        patterns[id] = relatedIds.map(cid => {
          if (!groupColors[cid]) {
            const col = hexToRgb(data.baronyMeta?.[cid]?.color) || generateColor(String(cid)).slice(0, 3);
            groupColors[cid] = { color: col, name: data.baronyMeta?.[cid]?.name || 'N/A' };
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
      Object.keys(data.baronyMeta || {}).forEach(id => {
        const sanctuaries = data.sanctuaryMap?.[id] || [];
        if (sanctuaries.length === 0) {
          colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
          return;
        }
        patterns[id] = [];
        let hasActive = false;
        const popReligionId = data.baronyMeta?.[id]?.religion_pop_id;
        sanctuaries.forEach(sanctuary => {
          if (!groupColors[sanctuary.religion_id]) {
            const col =
              hexToRgb(data.religionMap?.[sanctuary.religion_id]?.color) ||
              generateColor(String(sanctuary.religion_id)).slice(0, 3);
            groupColors[sanctuary.religion_id] = {
              color: col,
              name: data.religionMap?.[sanctuary.religion_id]?.name || 'N/A'
            };
          }
          const col = groupColors[sanctuary.religion_id].color;
          const isActive = popReligionId && String(popReligionId) === String(sanctuary.religion_id);
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

    function applyDuchyPietyRankingFilter(randomize = false) {
      const groupColors = {};
      const winners = buildDuchyPietyWinners();
      colorMap = {};
      Object.entries(data.baronyMeta || {}).forEach(([id, info]) => {
        const duchyId = getDuchyIdForBarony(info);
        const groupId = duchyId ? winners[String(duchyId)] : null;
        if (groupId == null) {
          colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
          return;
        }
        if (!groupColors[groupId]) {
          const randomColor = randomize ? hslToRgb(Math.floor(Math.random() * 360), 65, 65) : null;
          const color = randomColor || hexToRgb(data.religionMap?.[groupId]?.color) || generateColor(String(groupId)).slice(0, 3);
          groupColors[groupId] = {
            color,
            name: data.religionMap?.[groupId]?.name || 'N/A'
          };
        }
        const col = groupColors[groupId].color;
        colorMap[id] = [col[0], col[1], col[2], DEFAULT_ALPHA];
      });
      commitFilter(groupColors, {});
    }

    function applySeaFilter(type) {
      if (type === 'distance') {
        applyDistanceFilter();
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
      distance: () => applyDistanceFilter(),
      duchy_piety_ranking: (randomize) => applyDuchyPietyRankingFilter(randomize),
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

  /**
   * Initialise le rendu de la carte.
   * @param {Object} [opts] Options de configuration.
   * @param {HTMLCanvasElement} [opts.canvas] Canvas cible. Utilisé si `mapId` n'est pas fourni.
   * @param {string} [opts.mapId='pixelCanvas'] Id du canvas à récupérer dans le DOM.
   * @param {boolean} [opts.enablePan=true] Active le déplacement de la carte à la souris.
   * @param {boolean} [opts.enableZoom=true] Active le zoom via la molette.
   * @param {number} [opts.width] Largeur fixe du canvas.
   * @param {number} [opts.height] Hauteur fixe du canvas.
   * @param {Function} [opts.fetchData] Fonction asynchrone de récupération des données.
   * @param {Function} [opts.drawOverlay] Fonction de dessin d'une surcouche.
   * @param {string} [opts.mapMode='land'] Mode de carte à charger.
   */
  function init(opts = {}) {
    const {
      canvas: passedCanvas,
      mapId = 'pixelCanvas',
      enablePan = true,
      enableZoom = true,
      width,
      height,
      fetchData = async () => ({}),
      drawOverlay = () => {},
      mapMode = 'land',
      staticMap = false
    } = opts;

    const canvas = passedCanvas || document.getElementById(mapId);
    if (!canvas) throw new Error('No canvas element provided or found');

    if (width) {
      canvas.width = width;
      canvas.style.width = width + 'px';
    }
    if (height) {
      canvas.height = height;
      canvas.style.height = height + 'px';
    }

    const group = canvas.parentElement;
    const container = group.parentElement;
    const ctx = canvas.getContext('2d');
    let mapWidth = canvas.width;
    let mapHeight = canvas.height;

    // Data stores
    let pixelData = {};
    let pixelMap = [];
    let baronyMeta = {};
    let seigneurMap = {};
    let religionMap = {};
    let cultureMapInfo = {};
    let countyMap = {};
    let duchyMap = {};
    let kingdomMap = {};
    let viscountyMap = {};
    let marquisateMap = {};
    let archduchyMap = {};
    let empireMap = {};
    let seigneurToViscounty = {}, seigneurToCounty = {}, seigneurToMarquisate = {}, seigneurToDuchy = {}, seigneurToArchduchy = {}, seigneurToKingdom = {}, seigneurToEmpire = {};
    let canonicalLandMap = {};
    let baronyAdjacency = {};
    let canonicalPatterns = {};
    let mapData = {};
    let vm = null;

    let colorMap = {};
    let highlightedIds = new Set();
    const mapClickHandlers = [];

    // pan/zoom state
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let activePointerId = null;
    let movedDuringPan = false;
    let pinchState = null;
    let selectionPointerId = null;
    let suppressSelection = false;

    function applyTransform() {
      group.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    function resetView() {
      scale = 1;
      offsetX = 0;
      offsetY = 0;
      applyTransform();
    }

    function centerMap() {
      const contW = container.clientWidth;
      const contH = container.clientHeight;
      scale = 1;
      offsetX = (contW - mapWidth * scale) / 2;
      offsetY = (contH - mapHeight * scale) / 2;
      applyTransform();
    }

    function rebuildPixelMap() {
      pixelMap = Array.from({ length: mapHeight }, () => new Array(mapWidth).fill(0));
      Object.entries(pixelData).forEach(([id, coords]) => {
        coords.forEach(([x, y]) => {
          if (y >= 0 && y < mapHeight && x >= 0 && x < mapWidth) {
            pixelMap[y][x] = String(id);
          }
        });
      });
    }

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
      return [r, g, b, 255];
    }

    function getSelectedAlpha(baseColor, factor = selectedTransparencyFactor) {
      const safeFactor = Math.max(0, Math.min(1, factor));
      const baseAlpha = Number.isFinite(baseColor[3]) ? baseColor[3] : 255;
      return Math.max(0, Math.min(255, Math.round(baseAlpha * safeFactor)));
    }

    function hashCoords(x, y, seed = 0) {
      let h = x * 374761393 + y * 668265263 + seed * 982451653;
      h = (h ^ (h >>> 13)) * 1274126177;
      return (h ^ (h >>> 16)) >>> 0;
    }

    // color map is expected to be provided externally

    function drawAll() {
      const imageData = ctx.createImageData(mapWidth, mapHeight);
      const data = imageData.data;
      let idx = 0;
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          const id = pixelMap[y][x];
          if (id && (colorMap[id] || canonicalPatterns[id])) {
            const isSelected = highlightedIds.has(id);
            if (canonicalPatterns[id]) {
              const cols = canonicalPatterns[id];
              const cellSize = 6;
              const colIndex =
                hashCoords(Math.floor(x / cellSize), Math.floor(y / cellSize), parseInt(id, 10)) % cols.length;
              const baseCol = cols[colIndex];
              const alpha = isSelected ? getSelectedAlpha(baseCol) : (Number.isFinite(baseCol[3]) ? baseCol[3] : 255);
              data[idx++] = baseCol[0];
              data[idx++] = baseCol[1];
              data[idx++] = baseCol[2];
              data[idx++] = alpha;
            } else {
              const baseCol = colorMap[id];
              const alpha = isSelected ? getSelectedAlpha(baseCol) : (Number.isFinite(baseCol[3]) ? baseCol[3] : 255);
              data[idx++] = baseCol[0];
              data[idx++] = baseCol[1];
              data[idx++] = baseCol[2];
              data[idx++] = alpha;
            }
          } else {
            data[idx++] = 0;
            data[idx++] = 0;
            data[idx++] = 0;
            data[idx++] = 0;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
      drawOverlay(ctx, scale, offsetX, offsetY);
    }

    function handleWheel(e) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomAtClientPoint(e.clientX, e.clientY, factor);
    }

    function zoomAtClientPoint(clientX, clientY, factor) {
      const rect = group.getBoundingClientRect();
      const mx = (clientX - rect.left) / scale;
      const my = (clientY - rect.top) / scale;
      const prevScale = scale;
      scale *= factor;
      scale = Math.max(0.2, Math.min(scale, 10));
      offsetX -= mx * (scale - prevScale);
      offsetY -= my * (scale - prevScale);
      applyTransform();
    }

    function handlePanStart(e) {
      activePointerId = e.pointerId;
      panning = true;
      movedDuringPan = false;
      panStartX = e.clientX;
      panStartY = e.clientY;
    }

    function handlePanMove(e) {
      if (!panning || e.pointerId !== activePointerId) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedDuringPan = true;
      offsetX += dx;
      offsetY += dy;
      panStartX = e.clientX;
      panStartY = e.clientY;
      applyTransform();
    }

    function handlePanEnd() {
      panning = false;
      activePointerId = null;
    }

    function getCanvasCoordsFromClient(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.floor((clientX - rect.left) * canvas.width / rect.width),
        y: Math.floor((clientY - rect.top) * canvas.height / rect.height)
      };
    }


    function createMobileZoomControls() {
      if (!enableZoom || !container || container.querySelector('.mobile-zoom-controls')) return;
      if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;

      const controls = document.createElement('div');
      controls.className = 'mobile-zoom-controls';

      const zoomInBtn = document.createElement('button');
      zoomInBtn.type = 'button';
      zoomInBtn.className = 'control-btn mobile-zoom-btn';
      zoomInBtn.setAttribute('aria-label', 'Zoom avant');
      zoomInBtn.textContent = '+';

      const zoomOutBtn = document.createElement('button');
      zoomOutBtn.type = 'button';
      zoomOutBtn.className = 'control-btn mobile-zoom-btn';
      zoomOutBtn.setAttribute('aria-label', 'Zoom arrière');
      zoomOutBtn.textContent = '−';

      zoomInBtn.addEventListener('click', () => {
        const rect = container.getBoundingClientRect();
        zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
      });
      zoomOutBtn.addEventListener('click', () => {
        const rect = container.getBoundingClientRect();
        zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2);
      });

      controls.appendChild(zoomInBtn);
      controls.appendChild(zoomOutBtn);
      container.appendChild(controls);
    }

    function fitToContainer() {
      const contW = container.clientWidth;
      const contH = container.clientHeight;
      const scaleX = contW / mapWidth;
      const scaleY = contH / mapHeight;
      scale = Math.min(scaleX, scaleY);
      offsetX = (contW - mapWidth * scale) / 2;
      offsetY = (contH - mapHeight * scale) / 2;
      applyTransform();
    }

    function highlightBaronies(ids = []) {
      highlightedIds = new Set((ids || []).filter(Boolean).map(val => String(val)));
      drawAll();
    }

    function onMapClick(handler) {
      if (typeof handler !== 'function') return () => {};
      mapClickHandlers.push(handler);
      return () => {
        const index = mapClickHandlers.indexOf(handler);
        if (index >= 0) mapClickHandlers.splice(index, 1);
      };
    }

    function emitMapClick(id) {
      const click = {
        type: mapMode === 'sea' ? 'seaZone' : 'barony',
        id: id || null
      };
      mapClickHandlers.forEach(handler => handler(click));
    }

    function handleCanvasSelection(clientX, clientY) {
      const { x, y } = getCanvasCoordsFromClient(clientX, clientY);
      const id = pixelMap[y] ? pixelMap[y][x] : null;
      emitMapClick(id);
    }

    function handlePointerDown(e) {
      if (e.button !== 0 && e.pointerType !== 'touch') return;
      if (pinchState && pinchState.pointers.size >= 2) return;
      selectionPointerId = e.pointerId;

      if (e.pointerType === 'touch') {
        if (!pinchState) pinchState = { pointers: new Map(), prevDistance: null, midpoint: null };
        pinchState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pinchState.pointers.size === 2) {
          const [a, b] = [...pinchState.pointers.values()];
          pinchState.prevDistance = Math.hypot(b.x - a.x, b.y - a.y);
          pinchState.midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          panning = false;
          activePointerId = null;
          selectionPointerId = null;
          suppressSelection = true;
        } else if (enablePan) {
          handlePanStart(e);
        }
      } else if (enablePan) {
        handlePanStart(e);
      }

      if (canvas.setPointerCapture) {
        canvas.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
    }

    function handlePointerMove(e) {
      if (pinchState && pinchState.pointers.has(e.pointerId)) {
        pinchState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinchState.pointers.size === 2 && enableZoom) {
          const [a, b] = [...pinchState.pointers.values()];
          const distance = Math.hypot(b.x - a.x, b.y - a.y);
          const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (pinchState.prevDistance && distance > 0) {
            const factor = distance / pinchState.prevDistance;
            if (Number.isFinite(factor) && factor > 0) {
              zoomAtClientPoint(midpoint.x, midpoint.y, factor);
            }
          }
          pinchState.prevDistance = distance;
          pinchState.midpoint = midpoint;
        } else if (pinchState.pointers.size === 1 && enablePan) {
          handlePanMove(e);
        }
      } else if (enablePan) {
        handlePanMove(e);
      }
    }

    function handlePointerUpOrCancel(e) {
      const wasActivePanPointer = panning && e.pointerId === activePointerId;

      if (pinchState && pinchState.pointers.has(e.pointerId)) {
        pinchState.pointers.delete(e.pointerId);
        if (pinchState.pointers.size < 2) {
          pinchState.prevDistance = null;
          pinchState.midpoint = null;
        }
        if (pinchState.pointers.size === 1 && enablePan) {
          const remaining = [...pinchState.pointers.entries()][0];
          if (remaining) {
            const [remainingId, point] = remaining;
            activePointerId = remainingId;
            panning = true;
            movedDuringPan = true;
            panStartX = point.x;
            panStartY = point.y;
          }
        }
      }

      if (wasActivePanPointer) {
        const shouldSelect = !movedDuringPan && (!pinchState || pinchState.pointers.size === 0);
        handlePanEnd();
        if (shouldSelect && e.type === 'pointerup') {
          handleCanvasSelection(e.clientX, e.clientY);
        }
      } else if (!enablePan) {
        const canSelectWithoutPan = (
          e.type === 'pointerup' &&
          e.pointerId === selectionPointerId &&
          !suppressSelection &&
          (!pinchState || pinchState.pointers.size === 0)
        );
        if (canSelectWithoutPan) {
          handleCanvasSelection(e.clientX, e.clientY);
        }
      }

      if (!pinchState || pinchState.pointers.size === 0) {
        suppressSelection = false;
      }
      if (e.pointerId === selectionPointerId) {
        selectionPointerId = null;
      }

      if (canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    }


    const positionMap = staticMap ? resetView : (!enablePan && !enableZoom) ? centerMap : fitToContainer;

    if (enableZoom) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
    }
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
    canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
    canvas.addEventListener('pointerup', handlePointerUpOrCancel);
    canvas.addEventListener('pointercancel', handlePointerUpOrCancel);
    createMobileZoomControls();

    window.addEventListener('resize', () => {
      positionMap();
      drawAll();
    });

    async function load() {
      const data = await fetchData();
      mapWidth = data.mapWidth || mapWidth;
      mapHeight = data.mapHeight || mapHeight;
      pixelData = data.pixelData || {};
      baronyMeta = data.baronyMeta || {};
      seigneurMap = data.seigneurMap || {};
      religionMap = data.religionMap || {};
      cultureMapInfo = data.cultureMapInfo || {};
      countyMap = data.countyMap || {};
      duchyMap = data.duchyMap || {};
      kingdomMap = data.kingdomMap || {};
      viscountyMap = data.viscountyMap || {};
      marquisateMap = data.marquisateMap || {};
      archduchyMap = data.archduchyMap || {};
      empireMap = data.empireMap || {};
      canonicalLandMap = data.canonicalLandMap || {};
      baronyAdjacency = data.baronyAdjacency || {};
      seigneurToViscounty = data.seigneurToViscounty || {};
      seigneurToCounty = data.seigneurToCounty || {};
      seigneurToMarquisate = data.seigneurToMarquisate || {};
      seigneurToDuchy = data.seigneurToDuchy || {};
      seigneurToArchduchy = data.seigneurToArchduchy || {};
      seigneurToKingdom = data.seigneurToKingdom || {};
      seigneurToEmpire = data.seigneurToEmpire || {};
      mapData = data;
      vm = data.viewModel || null;
      rebuildPixelMap();
      positionMap();
      drawAll();
    }
    const ready = load();

    function createFilterManager(registry, options = {}) {
      return createFilterRuntime(
        {
          setColorMap: cm => { colorMap = cm || {}; drawAll(); },
          setCanonicalPatterns: cp => { canonicalPatterns = cp || {}; }
        },
        mapData,
        registry,
        options
      );
    }

    return {
      onMapClick,
      highlightBaronies,
      createFilterManager,
      drawAll,
      fitToContainer,
      resetView,
      drawPixel: (x, y, id) => {
        if (!colorMap[id]) {
          colorMap[id] = generateColor(id);
        }
        const col = colorMap[id];
        const alpha = col.length > 3 ? col[3] / 255 : 1;
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      },
      setPixelData: pd => {
        pixelData = pd || {};
        rebuildPixelMap();
        drawAll();
      },
      get pixelData() { return pixelData; },
      get pixelMap() { return pixelMap; },
      get colorMap() { return colorMap; },
      setColorMap: cm => { colorMap = cm; drawAll(); },
      setCanonicalPatterns: cp => { canonicalPatterns = cp || {}; },
      getViewModel: () => vm,
      get ready() { return ready; }
    };
  }
  global.mapCore2 = { init, terrainColor, createFilterRuntime };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.mapCore2;
})(typeof window !== 'undefined' ? window : global);
