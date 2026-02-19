(function (global) {
  const terrainColor = [239, 228, 176];

  function init(options = {}) {
    const {
      canvas,
      baseMap,
      filterSelect,
      legendEl,
      onSelectionChange = () => {},
      mapMode = 'land'
    } = options;

    const ctx = canvas.getContext('2d');
    const state = {
      vm: null,
      filters: null,
      activeFilter: 'barony',
      colorMap: {},
      selected: { baronyId: null, seigneurId: null, title: null },
      highlighted: new Set(),
      mode: mapMode,
      pixelData: {}
    };

    let pixelMap = [];

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

    function applyFilter() {
      const result = state.filters.applyFilter(state.activeFilter, { selected: state.selected });
      state.colorMap = result.colorMap || {};
      renderLegend(result.legendItems || []);
      computeHighlights();
      drawAll();
    }

    function computeHighlights() {
      state.highlighted = new Set();
      if (state.activeFilter === 'duchy_dejure' || state.activeFilter === 'duchy_defacto') {
        const mode = state.activeFilter.endsWith('defacto') ? 'defacto' : 'dejure';
        const duchyId = state.selected.title?.type === 'duchy' ? state.selected.title.id : null;
        if (duchyId) {
          state.vm.getBaroniesForTitle('duchy', duchyId, mode).forEach((b) => state.highlighted.add(String(b.id)));
        }
      }
      if (state.activeFilter === 'distance' && state.selected.baronyId) {
        state.highlighted.add(String(state.selected.baronyId));
      }
    }

    function drawAll() {
      const image = ctx.createImageData(canvas.width, canvas.height);
      const data = image.data;
      let idx = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const baronyId = pixelMap[y][x];
          const col = state.colorMap[baronyId] || [0, 0, 0, 0];
          const isHigh = baronyId && state.highlighted.has(String(baronyId));
          data[idx++] = col[0] || 0;
          data[idx++] = col[1] || 0;
          data[idx++] = col[2] || 0;
          data[idx++] = isHigh ? 255 : (col[3] ?? 255) * 0.85;
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
        sw.className = 'legend-swatch';
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

    function selectEntity(type, id) {
      if (type === 'duchy') {
        state.activeFilter = state.activeFilter === 'duchy_defacto' ? 'duchy_defacto' : 'duchy_dejure';
        state.selected.title = { type: 'duchy', id: String(id) };
      } else if (type === 'seigneur') {
        state.selected.seigneurId = String(id);
      }
      if (filterSelect) filterSelect.value = state.activeFilter;
      onSelectionChange({ ...state.selected, type, id: String(id), filter: state.activeFilter });
      applyFilter();
    }

    function selectBarony(baronyId) {
      state.selected.baronyId = String(baronyId);
      const barony = state.vm.getEntity('barony', baronyId);
      if (barony?.seigneur) state.selected.seigneurId = String(barony.seigneur.id);
      if (state.activeFilter.startsWith('duchy_')) {
        const mode = state.activeFilter.endsWith('defacto') ? 'defacto' : 'dejure';
        const duchy = state.vm.getBaronyTitleId(baronyId, 'duchy', mode);
        if (duchy) state.selected.title = { type: 'duchy', id: String(duchy.id) };
      }
      onSelectionChange({ ...state.selected, type: 'barony', id: String(baronyId), filter: state.activeFilter });
      applyFilter();
    }

    function setupInteractions() {
      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) * canvas.width / rect.width);
        const y = Math.floor((e.clientY - rect.top) * canvas.height / rect.height);
        const baronyId = pixelMap[y]?.[x];
        if (baronyId) selectBarony(baronyId);
      });

      filterSelect?.addEventListener('change', () => {
        state.activeFilter = filterSelect.value;
        applyFilter();
      });
    }

    async function fetchJson(url) {
      const res = await fetch(url);
      return res.json();
    }

    async function loadData() {
      const [baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, baronyConnections, baronyPixels] = await Promise.all([
        fetchJson('/api/baronies'), fetchJson('/api/seigneurs'), fetchJson('/api/religions'), fetchJson('/api/cultures'),
        fetchJson('/api/counties'), fetchJson('/api/duchies'), fetchJson('/api/kingdoms'), fetchJson('/api/viscounties'),
        fetchJson('/api/marquisates'), fetchJson('/api/archduchies'), fetchJson('/api/empires'), fetchJson('/api/canonical_lands'),
        fetchJson('/api/sanctuaries'), fetchJson('/api/barony_connections'), fetchJson('/api/barony_pixels')
      ]);
      state.vm = viewModel.build({
        baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates,
        archduchies, empires, canonicalLands, sanctuaries, baronyConnections
      });
      state.filters = mapFilters2.create(state.vm);
      state.pixelData = baronyPixels || {};
      buildPixelMap();
      populateFilterSelect();
      applyFilter();
    }

    function populateFilterSelect() {
      if (!filterSelect) return;
      filterSelect.innerHTML = '';
      state.filters.getFilters().forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.label;
        filterSelect.appendChild(opt);
      });
      filterSelect.value = state.activeFilter;
    }

    const ready = (async () => {
      if (baseMap && !baseMap.complete) {
        await new Promise((resolve) => { baseMap.onload = resolve; });
      }
      canvas.width = baseMap.naturalWidth;
      canvas.height = baseMap.naturalHeight;
      setupInteractions();
      await loadData();
    })();

    return {
      ready,
      getViewModel: () => state.vm,
      getState: () => state,
      setFilter: (filterId) => { state.activeFilter = filterId; if (filterSelect) filterSelect.value = filterId; applyFilter(); },
      selectEntity,
      selectBarony
    };
  }

  global.mapCore2 = { init, terrainColor };
})(typeof window !== 'undefined' ? window : globalThis);
