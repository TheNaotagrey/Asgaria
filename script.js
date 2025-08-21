(() => {
  const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';
  const params = new URLSearchParams(location.search);
  const mapMode = params.get('mode') === 'sea' ? 'sea' : 'land';
  const pixelEndpoint = mapMode === 'sea' ? '/api/maritime_zone_pixels' : '/api/barony_pixels';
  const entityEndpoint = mapMode === 'sea' ? '/api/maritime_zones' : '/api/baronies';

  let mapWidth = 0;
  let mapHeight = 0;

  let pixelData = {};
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
  let seigneurToCounty = {}, seigneurToDuchy = {}, seigneurToKingdom = {}, seigneurToViscounty = {}, seigneurToMarquisate = {}, seigneurToArchduchy = {}, seigneurToEmpire = {};
  let canonicalLandMap = {};
  let sanctuaryMap = {};
  let baronyAdjacency = {};
  let mapData = {};

  let filterManager = null;

  const baseMap = document.getElementById('baseMap');
  if (mapMode === 'sea' && baseMap) baseMap.src = 'zones_maritimes.png';
  const pixelCanvas = document.getElementById('pixelCanvas');
  const filterSelect = document.getElementById('filterSelect');
  const randomBtn = document.getElementById('randomBtn');
  const legendDiv = document.getElementById('legend');

  const linkBtn = document.getElementById('linkBarony');
  const unlinkBtn = document.getElementById('unlinkBarony');

  const infoPanel = document.getElementById('infoPanel');
  const editIdInput = document.getElementById('editId');
  const editNameInput = document.getElementById('editName');

  function updateLegend(groups) {
    if (!legendDiv) return;
    if (!groups) {
      legendDiv.style.display = 'none';
      legendDiv.innerHTML = '';
      return;
    }
    legendDiv.innerHTML = '';
    Object.entries(groups).forEach(([id, info]) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const colorBox = document.createElement('span');
      colorBox.className = 'legend-color';
      colorBox.style.backgroundColor = `rgb(${info.color[0]},${info.color[1]},${info.color[2]})`;
      item.appendChild(colorBox);
      const lab = document.createElement('span');
      lab.textContent = info.name;
      item.appendChild(lab);
      legendDiv.appendChild(item);
    });
    legendDiv.style.display = 'block';
  }

  let core = null;
  let currentSelectedId = null;
  let pendingLinkId = null;
  let pendingAction = null; // 'link' or 'unlink'

  function startLinking(action) {
    if (!currentSelectedId) return;
    pendingLinkId = currentSelectedId;
    pendingAction = action;
  }

  if (linkBtn) linkBtn.addEventListener('click', () => startLinking('link'));
  if (unlinkBtn) unlinkBtn.addEventListener('click', () => startLinking('unlink'));

  window.addEventListener('keydown', e => {
    if (e.key === 'Control') {
      startLinking(e.altKey ? 'unlink' : 'link');
    }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'Control') {
      pendingLinkId = null;
      pendingAction = null;
    }
  });

  function handleSelect(id) {
    if (pendingAction && pendingLinkId && id && id !== pendingLinkId) {
      const sourceId = pendingLinkId;
      const targetId = id;
      const method = pendingAction === 'link' ? 'POST' : 'DELETE';
      fetch(`${API_BASE}/api/barony_connections`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barony_id_1: sourceId, barony_id_2: targetId })
      }).then(() => {
        if (pendingAction === 'link') {
          if (!baronyAdjacency[sourceId]) baronyAdjacency[sourceId] = [];
          if (!baronyAdjacency[targetId]) baronyAdjacency[targetId] = [];
          if (!baronyAdjacency[sourceId].includes(targetId)) baronyAdjacency[sourceId].push(targetId);
          if (!baronyAdjacency[targetId].includes(sourceId)) baronyAdjacency[targetId].push(sourceId);
        } else {
          if (baronyAdjacency[sourceId]) baronyAdjacency[sourceId] = baronyAdjacency[sourceId].filter(b => b !== targetId);
          if (baronyAdjacency[targetId]) baronyAdjacency[targetId] = baronyAdjacency[targetId].filter(b => b !== sourceId);
        }
      });
      pendingLinkId = null;
      pendingAction = null;
      core.selectBarony(sourceId);
      return;
    }

    currentSelectedId = id;
    if (!id) {
      if (infoPanel) infoPanel.style.display = 'none';
      return;
    }
    if (infoPanel) infoPanel.style.display = 'block';
    if (editIdInput) editIdInput.value = id;
    if (editNameInput) editNameInput.value = baronyMeta[id]?.name || '';
    if (filterManager && filterSelect && filterSelect.value) {
      filterManager.applyFilter(filterSelect.value);
    }
  }

  async function fetchData() {
    pixelData = await fetch(API_BASE + pixelEndpoint).then(r => r.json());
    const entities = await fetch(API_BASE + entityEndpoint).then(r => r.json());
    baronyMeta = {};
    entities.forEach(e => { baronyMeta[e.id] = e; });
    if (mapMode !== 'sea') {
      const [seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, connections] = await Promise.all([
        fetch(API_BASE + '/api/seigneurs').then(r => r.json()),
        fetch(API_BASE + '/api/religions').then(r => r.json()),
        fetch(API_BASE + '/api/cultures').then(r => r.json()),
        fetch(API_BASE + '/api/counties').then(r => r.json()),
        fetch(API_BASE + '/api/duchies').then(r => r.json()),
        fetch(API_BASE + '/api/kingdoms').then(r => r.json()),
        fetch(API_BASE + '/api/viscounties').then(r => r.json()),
        fetch(API_BASE + '/api/marquisates').then(r => r.json()),
        fetch(API_BASE + '/api/archduchies').then(r => r.json()),
        fetch(API_BASE + '/api/empires').then(r => r.json()),
        fetch(API_BASE + '/api/canonical_lands').then(r => r.json()),
        fetch(API_BASE + '/api/sanctuaries').then(r => r.json()),
        fetch(API_BASE + '/api/barony_connections').then(r => r.json())
      ]);
      seigneurMap = {};
      seigneurs.forEach(s => { seigneurMap[s.id] = s; });
      religionMap = {};
      religions.forEach(r => { religionMap[r.id] = r; });
      cultureMapInfo = {};
      cultures.forEach(c => { cultureMapInfo[c.id] = c; });
      countyMap = {};
      seigneurToCounty = {};
      counties.forEach(c => { countyMap[c.id] = c; if (c.seigneur_id) seigneurToCounty[c.seigneur_id] = c.id; });
      duchyMap = {};
      seigneurToDuchy = {};
      duchies.forEach(d => { duchyMap[d.id] = d; if (d.seigneur_id) seigneurToDuchy[d.seigneur_id] = d.id; });
      kingdomMap = {};
      seigneurToKingdom = {};
      kingdoms.forEach(k => { kingdomMap[k.id] = k; if (k.seigneur_id) seigneurToKingdom[k.seigneur_id] = k.id; });
      viscountyMap = {};
      seigneurToViscounty = {};
      viscounties.forEach(v => { viscountyMap[v.id] = v; if (v.seigneur_id) seigneurToViscounty[v.seigneur_id] = v.id; });
      marquisateMap = {};
      seigneurToMarquisate = {};
      marquisates.forEach(m => { marquisateMap[m.id] = m; if (m.seigneur_id) seigneurToMarquisate[m.seigneur_id] = m.id; });
      archduchyMap = {};
      seigneurToArchduchy = {};
      archduchies.forEach(a => { archduchyMap[a.id] = a; if (a.seigneur_id) seigneurToArchduchy[a.seigneur_id] = a.id; });
      empireMap = {};
      seigneurToEmpire = {};
      empires.forEach(e => { empireMap[e.id] = e; if (e.seigneur_id) seigneurToEmpire[e.seigneur_id] = e.id; });
      canonicalLandMap = {};
      canonicalLands.forEach(cl => {
        if (!canonicalLandMap[cl.barony_id]) canonicalLandMap[cl.barony_id] = [];
        canonicalLandMap[cl.barony_id].push(cl.religion_id);
      });
      sanctuaryMap = {};
      sanctuaries.forEach(s => {
        if (!sanctuaryMap[s.barony_id]) sanctuaryMap[s.barony_id] = [];
        sanctuaryMap[s.barony_id].push({ religion_id: s.religion_id, active: !!s.active });
      });
      baronyAdjacency = {};
      connections.forEach(c => {
        if (!baronyAdjacency[c.barony_id_1]) baronyAdjacency[c.barony_id_1] = [];
        if (!baronyAdjacency[c.barony_id_2]) baronyAdjacency[c.barony_id_2] = [];
        baronyAdjacency[c.barony_id_1].push(c.barony_id_2);
        baronyAdjacency[c.barony_id_2].push(c.barony_id_1);
      });
    }
    mapData = {
      pixelData,
      baronyMeta,
      seigneurMap,
      religionMap,
      cultureMapInfo,
      countyMap,
      duchyMap,
      kingdomMap,
      viscountyMap,
      marquisateMap,
      archduchyMap,
      empireMap,
      canonicalLandMap,
      sanctuaryMap,
      baronyAdjacency,
      seigneurToCounty,
      seigneurToDuchy,
      seigneurToKingdom,
      seigneurToViscounty,
      seigneurToMarquisate,
      seigneurToArchduchy,
      seigneurToEmpire,
      mapWidth,
      mapHeight,
      mapMode
    };
    return mapData;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const baseMapLoaded = baseMap.complete ? Promise.resolve() : new Promise(res => (baseMap.onload = res));
    baseMapLoaded.then(() => {
      mapWidth = baseMap.naturalWidth;
      mapHeight = baseMap.naturalHeight;
      baseMap.style.width = mapWidth + 'px';
      baseMap.style.height = mapHeight + 'px';
      pixelCanvas.width = mapWidth;
      pixelCanvas.height = mapHeight;
      pixelCanvas.style.width = mapWidth + 'px';
      pixelCanvas.style.height = mapHeight + 'px';
      core = mapCore.init({
        canvas: pixelCanvas,
        fetchData,
        onSelect: handleSelect,
        drawOverlay: () => {},
        mapMode
      });
      core.ready.then(() => {
        filterManager = mapFilters.init(core, mapData, { updateLegend });
        if (filterSelect) {
          filterSelect.addEventListener('change', () => filterManager.applyFilter(filterSelect.value));
          filterManager.applyFilter(filterSelect.value);
        }
        if (randomBtn) randomBtn.addEventListener('click', () => filterManager.randomizeColors());
      });
    });
  });

  // Basic editing: updating name/id
  const saveBtn = document.getElementById('saveBarony');
  function updateBarony() {
    if (!currentSelectedId) return;
    const newId = editIdInput.value.trim();
    const newName = editNameInput.value.trim();
    fetch(`${API_BASE}${entityEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentSelectedId, newId, name: newName })
    }).then(() => {
      baronyMeta[newId] = { id: newId, name: newName };
      if (newId !== currentSelectedId) {
        core.colorMap[newId] = core.colorMap[currentSelectedId];
        delete core.colorMap[currentSelectedId];
        delete pixelData[currentSelectedId];
      }
      core.selectBarony(newId);
    });
  }
  if (saveBtn) saveBtn.addEventListener('click', updateBarony);
})();
