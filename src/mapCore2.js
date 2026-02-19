(function (global) {
  const terrainColor = [239, 228, 176];

  function init(options = {}) {
    const {
      canvas,
      baseMap,
      filterSelect,
      legendEl,
      onSelectionChange = () => {},
      mapMode = 'land',
      enablePan = true,
      enableZoom = true
    } = options;
    const ctx = canvas.getContext('2d');
    const group = canvas.parentElement;
    const container = group?.parentElement;
    const idOverlay = group?.querySelector('#idOverlayMap');

    const state = {
      vm: null,
      filters: null,
      activeFilter: mapMode === 'sea' ? '' : 'religion',
      colorMap: {},
      selected: { baronyId: null, seigneurId: null, title: null },
      highlighted: new Set(),
      mode: mapMode,
      pixelData: {},
      adjacencyMap: {},
      tradeRouteConnections: {},
      zoneBaronies: {}
    };

    let pixelMap = [];
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let activePointerId = null;
    let movedDuringPan = false;

    function applyTransform() {
      if (!group) return;
      group.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    function fitToContainer() {
      if (!container) {
        applyTransform();
        return;
      }
      const contW = container.clientWidth;
      const contH = container.clientHeight;
      const scaleX = contW / canvas.width;
      const scaleY = contH / canvas.height;
      scale = Math.min(scaleX, scaleY);
      offsetX = (contW - canvas.width * scale) / 2;
      offsetY = (contH - canvas.height * scale) / 2;
      applyTransform();
    }

    function zoomAtClientPoint(clientX, clientY, factor) {
      if (!group) return;
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

    function getCanvasCoordsFromClient(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.floor((clientX - rect.left) * canvas.width / rect.width),
        y: Math.floor((clientY - rect.top) * canvas.height / rect.height)
      };
    }

    function buildPixelMap() {
      const width = canvas.width;
      const height = canvas.height;
      pixelMap = Array.from({ length: height }, () => new Array(width).fill(null));
      Object.entries(state.pixelData || {}).forEach(([id, coords]) => {
        (coords || []).forEach(([x, y]) => {
          if (y >= 0 && y < height && x >= 0 && x < width) pixelMap[y][x] = String(id);
        });
      });
    }

    function toFilterContext() {
      return {
        selected: state.selected,
        adjacencyMap: state.adjacencyMap,
        tradeRouteConnections: state.tradeRouteConnections,
        zoneBaronies: state.zoneBaronies
      };
    }

    function applyFilter() {
      const result = state.filters.applyFilter(state.activeFilter, toFilterContext());
      state.colorMap = result.colorMap || {};
      renderLegend(result.legendItems || []);
      computeHighlights();
      drawAll();
    }

    function computeHighlights() {
      state.highlighted = new Set();
      if (state.activeFilter.includes('duchy')) {
        const mode = state.activeFilter.endsWith('defacto') ? 'defacto' : 'dejure';
        const duchyId = state.selected.title?.type === 'duchy' ? state.selected.title.id : null;
        if (duchyId) state.vm.getBaroniesForTitle('duchy', duchyId, mode).forEach((b) => state.highlighted.add(String(b.id)));
      }
      if (state.selected.baronyId) state.highlighted.add(String(state.selected.baronyId));
    }

    function drawAll() {
      const image = ctx.createImageData(canvas.width, canvas.height);
      const data = image.data;
      let idx = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const cellId = pixelMap[y][x];
          const col = state.colorMap[cellId] || [0, 0, 0, 0];
          const isHigh = cellId && state.highlighted.has(String(cellId));
          data[idx++] = col[0] || 0;
          data[idx++] = col[1] || 0;
          data[idx++] = col[2] || 0;
          data[idx++] = isHigh ? 255 : Math.max(0, Math.min(255, Math.round((col[3] ?? 255) * 0.85)));
        }
      }
      ctx.putImageData(image, 0, 0);
    }

    function renderLegend(items) {
      if (!legendEl) return;
      legendEl.innerHTML = '';
      if (!items.length) {
        legendEl.style.display = 'none';
        return;
      }
      legendEl.style.display = 'block';
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'legend-item';
        const sw = document.createElement('span');
        sw.className = 'legend-color';
        sw.style.background = `rgba(${item.color[0]}, ${item.color[1]}, ${item.color[2]}, ${(item.color[3] ?? 255) / 255})`;
        const txt = document.createElement('span');
        txt.textContent = item.label;
        row.appendChild(sw);
        row.appendChild(txt);
        if (item.selection) {
          row.style.cursor = 'pointer';
          row.addEventListener('click', () => selectEntity(item.selection.type, item.selection.id));
        }
        legendEl.appendChild(row);
      });
    }

    function ensureTitleFilter(type) {
      const rankFilters = {
        viscounty: 'viscounty_defacto', county: 'county_defacto', marquisate: 'marquisate_defacto',
        duchy: 'duchy_defacto', archduchy: 'archduchy_defacto', kingdom: 'kingdom_defacto', empire: 'empire_defacto'
      };
      if (rankFilters[type] && state.activeFilter !== rankFilters[type]) {
        state.activeFilter = rankFilters[type];
        if (filterSelect) filterSelect.value = state.activeFilter;
      }
    }

    function selectEntity(type, id) {
      if (['viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'].includes(type)) {
        ensureTitleFilter(type);
        state.selected.title = { type, id: String(id) };
      } else if (type === 'seigneur') {
        state.selected.seigneurId = String(id);
      }
      onSelectionChange({ ...state.selected, type, id: String(id), filter: state.activeFilter });
      applyFilter();
    }

    function selectBarony(baronyId) {
      state.selected.baronyId = String(baronyId);
      const barony = state.vm.getEntity('barony', baronyId);
      if (barony?.seigneur) state.selected.seigneurId = String(barony.seigneur.id);
      if (state.activeFilter.endsWith('_defacto') || ['duchy', 'duchy_defacto'].includes(state.activeFilter)) {
        const duchy = state.vm.getBaronyTitleId(baronyId, 'duchy', state.activeFilter.endsWith('_defacto') ? 'defacto' : 'dejure');
        if (duchy) state.selected.title = { type: 'duchy', id: String(duchy.id) };
      }
      onSelectionChange({ ...state.selected, type: 'barony', id: String(baronyId), filter: state.activeFilter });
      applyFilter();
    }

    function handleCanvasSelection(clientX, clientY) {
      const { x, y } = getCanvasCoordsFromClient(clientX, clientY);
      const id = pixelMap[y]?.[x];
      if (id) selectBarony(id);
    }

    function setupInteractions() {
      if (enableZoom) {
        canvas.addEventListener('wheel', (e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.1 : 0.9;
          zoomAtClientPoint(e.clientX, e.clientY, factor);
        }, { passive: false });
      }

      canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType !== 'touch') return;
        if (!enablePan) return;
        panning = true;
        activePointerId = e.pointerId;
        movedDuringPan = false;
        panStartX = e.clientX;
        panStartY = e.clientY;
        if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener('pointermove', (e) => {
        if (!enablePan || !panning || e.pointerId !== activePointerId) return;
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedDuringPan = true;
        offsetX += dx;
        offsetY += dy;
        panStartX = e.clientX;
        panStartY = e.clientY;
        applyTransform();
      });

      const handlePointerUp = (e) => {
        const shouldSelect = e.pointerId === activePointerId && !movedDuringPan;
        if (e.pointerId === activePointerId) {
          panning = false;
          activePointerId = null;
        }
        if (shouldSelect) handleCanvasSelection(e.clientX, e.clientY);
        if (canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      };

      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointercancel', handlePointerUp);

      filterSelect?.addEventListener('change', () => {
        state.activeFilter = filterSelect.value;
        applyFilter();
      });

      window.addEventListener('resize', fitToContainer);
    }

    async function fetchJson(url) { const r = await fetch(url); return r.json(); }

    function buildTradeConnections(routes) {
      const map = {};
      (routes || []).forEach((r) => {
        const a = String(r.origin_barony_id || r.barony_id_1 || '');
        const b = String(r.destination_barony_id || r.barony_id_2 || '');
        if (!a || !b) return;
        if (!map[a]) map[a] = [];
        if (!map[b]) map[b] = [];
        map[a].push(b);
        map[b].push(a);
      });
      return map;
    }

    async function loadLandData() {
      const [baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, baronyConnections, baronyPixels, tradeRoutes] = await Promise.all([
        fetchJson('/api/baronies'), fetchJson('/api/seigneurs'), fetchJson('/api/religions'), fetchJson('/api/cultures'),
        fetchJson('/api/counties'), fetchJson('/api/duchies'), fetchJson('/api/kingdoms'), fetchJson('/api/viscounties'),
        fetchJson('/api/marquisates'), fetchJson('/api/archduchies'), fetchJson('/api/empires'), fetchJson('/api/canonical_lands'),
        fetchJson('/api/sanctuaries'), fetchJson('/api/barony_connections'), fetchJson('/api/barony_pixels'), fetchJson('/api/trade_routes')
      ]);
      state.vm = viewModel.build({ baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, baronyConnections });
      state.filters = mapFilters2.create(state.vm, { mapMode: 'land' });
      state.pixelData = baronyPixels || {};
      state.adjacencyMap = state.vm.indexes?.baronyAdjacency || {};
      state.tradeRouteConnections = buildTradeConnections(tradeRoutes);
    }

    async function loadSeaData() {
      const [zones, zonePixels, zoneConnections, zoneBaronies, baronies, seigneurs, religions, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires] = await Promise.all([
        fetchJson('/api/maritime_zones'), fetchJson('/api/maritime_zone_pixels'), fetchJson('/api/maritime_zone_connections'), fetchJson('/api/maritime_zone_baronies'),
        fetchJson('/api/baronies'), fetchJson('/api/seigneurs'), fetchJson('/api/religions'), fetchJson('/api/counties'), fetchJson('/api/duchies'),
        fetchJson('/api/kingdoms'), fetchJson('/api/viscounties'), fetchJson('/api/marquisates'), fetchJson('/api/archduchies'), fetchJson('/api/empires')
      ]);
      state.vm = viewModel.build({ baronies, seigneurs, religions, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires });
      state.filters = mapFilters2.create(state.vm, { mapMode: 'sea', baronyList: zones.map((z) => ({ id: String(z.id), name: z.name, color: z.color })) });
      state.pixelData = zonePixels || {};
      state.adjacencyMap = {};
      (zoneConnections || []).forEach((c) => {
        const a = String(c.zone_id_1); const b = String(c.zone_id_2); const d = parseInt(c.distance, 10) || 1;
        if (!state.adjacencyMap[a]) state.adjacencyMap[a] = [];
        if (!state.adjacencyMap[b]) state.adjacencyMap[b] = [];
        state.adjacencyMap[a].push({ id: b, distance: d });
        state.adjacencyMap[b].push({ id: a, distance: d });
      });
      state.zoneBaronies = {};
      (zoneBaronies || []).forEach((zb) => {
        const zid = String(zb.zone_id);
        if (!state.zoneBaronies[zid]) state.zoneBaronies[zid] = [];
        state.zoneBaronies[zid].push(String(zb.barony_id));
      });
    }

    function populateFilterSelect() {
      if (!filterSelect) return;
      filterSelect.innerHTML = '';
      state.filters.getFilters(toFilterContext()).forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.id; opt.textContent = f.label;
        filterSelect.appendChild(opt);
      });
      filterSelect.value = state.activeFilter;
    }

    const ready = (async () => {
      if (baseMap && !baseMap.complete) await new Promise((resolve) => { baseMap.onload = resolve; });
      canvas.width = baseMap.naturalWidth;
      canvas.height = baseMap.naturalHeight;
      canvas.style.width = `${canvas.width}px`;
      canvas.style.height = `${canvas.height}px`;
      if (baseMap) {
        baseMap.style.width = `${canvas.width}px`;
        baseMap.style.height = `${canvas.height}px`;
      }
      if (idOverlay) {
        idOverlay.style.width = `${canvas.width}px`;
        idOverlay.style.height = `${canvas.height}px`;
      }
      setupInteractions();
      if (state.mode === 'sea') await loadSeaData(); else await loadLandData();
      buildPixelMap();
      populateFilterSelect();
      applyFilter();
      fitToContainer();
    })();

    return { ready, getViewModel: () => state.vm, getState: () => state, setFilter: (f) => { state.activeFilter = f; if (filterSelect) filterSelect.value = f; applyFilter(); }, selectEntity, selectBarony };
  }

  global.mapCore2 = { init, terrainColor };
})(typeof window !== 'undefined' ? window : globalThis);
