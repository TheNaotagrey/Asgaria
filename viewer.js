(() => {
  const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';
  const params = new URLSearchParams(location.search);
  const mapMode = params.get('mode') === 'sea' ? 'sea' : 'land';
  const PIXEL_CHUNK_SIZE = 50;
  const MAX_PIXEL_REQUESTS = 3;

  let mapWidth = 0;
  let mapHeight = 0;
  const terrainColor = mapCore.terrainColor;
  const playerColor = [82, 190, 128];
  const npcColor = [231, 76, 60];

  let pixelData = {};
  let baronyPixels = {};
  let maritimeZoneBaronies = {};
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
  let sanctuaryMap = {};
  let baronyAdjacency = {};
  let mapData = {};

  let filterManager = null;
  let core = null;

  const baseMap = document.getElementById('baseMap');
  if (mapMode === 'sea' && baseMap) baseMap.src = 'zones_maritimes.png';
  const pixelCanvas = document.getElementById('pixelCanvas');
  const mapContainer = document.getElementById('mapContainer');
  const infoPanel = document.getElementById('infoPanel');
  const baronyTitle = document.getElementById('baronyTitle');
  const infoOwnerLine = document.getElementById('infoOwnerLine');
  const infoReligionLine = document.getElementById('infoReligionLine');
  const infoCultureLine = document.getElementById('infoCultureLine');
  const feudalSection = document.getElementById('feudalSection');
  const infoFeudalList = document.getElementById('infoFeudalList');
  const religiousSection = document.getElementById('religiousBuildingsSection');
  const infoReligiousList = document.getElementById('infoReligiousList');
  const seaInfoPanel = document.getElementById('seaInfoPanel');
  const seaInfoId = document.getElementById('seaInfoId');
  const seaInfoName = document.getElementById('seaInfoName');
  const legendDiv = document.getElementById('legend');
  const filterSelect = document.getElementById('filterSelect');
  const randomBtn = document.getElementById('randomBtn');
  const pixelLoading = document.getElementById('pixelLoading');

  function setLine(elem, text) {
    if (!elem) return;
    if (text) {
      elem.style.display = 'block';
      elem.textContent = text;
    } else {
      elem.style.display = 'none';
      elem.textContent = '';
    }
  }

  function setList(section, list, items) {
    if (!section || !list) return;
    list.innerHTML = '';
    if (items && items.length > 0) {
      section.style.display = 'block';
      items.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
      });
    } else {
      section.style.display = 'none';
    }
  }

  const landFilters = [
    { value: '', label: 'Aucun' },
    { value: 'religion', label: 'Religion' },
    { value: 'sanctuary', label: 'Sanctuaire' },
    { value: 'priory', label: 'Prieuré' },
    { value: 'church', label: 'Église' },
    { value: 'cathedral', label: 'Cathédrale' },
    { value: 'canonical', label: 'Terres canoniques' },
    { value: 'culture', label: 'Culture' },
    { value: 'viscounty', label: 'Vicomté de jure' },
    { value: 'viscounty_defacto', label: 'Vicomté de facto' },
    { value: 'county', label: 'Comté de jure' },
    { value: 'county_defacto', label: 'Comté de facto' },
    { value: 'marquisate', label: 'Marquisat de jure' },
    { value: 'marquisate_defacto', label: 'Marquisat de facto' },
    { value: 'duchy', label: 'Duché de jure' },
    { value: 'duchy_defacto', label: 'Duché de facto' },
    { value: 'archduchy', label: 'Archiduché de jure' },
    { value: 'archduchy_defacto', label: 'Archiduché de facto' },
    { value: 'kingdom', label: 'Royaume de jure' },
    { value: 'kingdom_defacto', label: 'Royaume de facto' },
    { value: 'empire', label: 'Empire de jure' },
    { value: 'empire_defacto', label: 'Empire de facto' },
    { value: 'distance', label: 'Distance' },
    { value: 'occupation', label: 'Occupation' }
  ];
  const seaFilters = [
    { value: '', label: 'Aucun' },
    { value: 'distance', label: 'Distance' },
    { value: 'baronies', label: 'Baronnies liées' }
  ];
  function populateFilters() {
    if (!filterSelect) return;
    const filters = mapMode === 'sea' ? seaFilters : landFilters;
    filterSelect.innerHTML = '';
    filters.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      filterSelect.appendChild(opt);
    });
  }
  populateFilters();

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

  function drawOverlay(ctx) {
    if (mapMode !== 'sea') return;
    if (!filterSelect || filterSelect.value !== 'baronies') return;
    const zoneId = core?.currentSelectedId;
    if (!zoneId) return;
    ctx.fillStyle = 'rgba(0,0,255,0.4)';
    (maritimeZoneBaronies[zoneId] || []).forEach(bid => {
      (baronyPixels[bid] || []).forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
    });
  }

  function updatePixelLoading(loaded, total, show = true) {
    if (!pixelLoading) return;
    if (!show) {
      pixelLoading.style.display = 'none';
      return;
    }
    pixelLoading.style.display = 'inline-block';
    pixelLoading.textContent = `Chargement des pixels... ${loaded}/${total}`;
  }

  async function fetchBaronyPixelsInChunks(ids, target = {}, applyToCore = true) {
    if (!ids || ids.length === 0) return target;
    const queue = [...ids];
    const active = [];
    let loaded = 0;
    const total = ids.length;

    const scheduleNext = () => {
      if (active.length >= MAX_PIXEL_REQUESTS) return;
      const batch = queue.splice(0, PIXEL_CHUNK_SIZE);
      if (batch.length === 0) return;
      const promise = fetch(`${API_BASE}/api/barony_pixels?ids=${batch.join(',')}`)
        .then(r => r.json())
        .then(data => {
          Object.assign(target, data);
          loaded = Math.min(total, loaded + batch.length);
          updatePixelLoading(loaded, total, true);
          if (applyToCore && core && typeof core.setPixelData === 'function') {
            core.setPixelData(target);
          } else if (core && typeof core.drawAll === 'function') {
            core.drawAll();
          }
        })
        .catch(err => console.warn('Erreur lors du chargement des pixels', err))
        .finally(() => {
          const idx = active.indexOf(promise);
          if (idx >= 0) active.splice(idx, 1);
          scheduleNext();
        });
      active.push(promise);
    };

    for (let i = 0; i < MAX_PIXEL_REQUESTS; i++) {
      scheduleNext();
    }

    while (active.length > 0) {
      await Promise.race(active);
    }

    updatePixelLoading(total, total, false);
    return target;
  }

  function handleSelect(id) {
    if (mapMode === 'sea') {
      if (!id) {
        if (seaInfoPanel) seaInfoPanel.style.display = 'none';
        return;
      }
      const info = baronyMeta[id] || {};
      if (seaInfoPanel) seaInfoPanel.style.display = 'block';
      if (infoPanel) infoPanel.style.display = 'none';
      if (seaInfoId) seaInfoId.textContent = info.id || '';
      if (seaInfoName) seaInfoName.textContent = info.name || '';
      if (filterManager && filterSelect && (filterSelect.value === 'distance' || filterSelect.value === 'baronies')) {
        filterManager.applyFilter(filterSelect.value);
      }
      return;
    }
    if (!id) {
      if (infoPanel) infoPanel.style.display = 'none';
      return;
    }
    const info = baronyMeta[id] || {};
    if (infoPanel) infoPanel.style.display = 'block';
    if (seaInfoPanel) seaInfoPanel.style.display = 'none';
    if (baronyTitle) {
      baronyTitle.textContent = `Baronnie: ${info.name || ''} (#${info.id || ''})`;
    }
    setLine(infoOwnerLine, info.seigneur_id ? `Propriétaire: ${seigneurMap[info.seigneur_id]?.name || ''}` : '');
    setLine(infoReligionLine, info.religion_pop_id ? `Religion: ${religionMap[info.religion_pop_id]?.name || ''}` : '');
    setLine(infoCultureLine, info.culture_id ? `Culture: ${cultureMapInfo[info.culture_id]?.name || ''}` : '');
    const viscounty = viscountyMap[info.viscounty_id];
    const county = countyMap[info.county_id];
    const marquisate = county ? marquisateMap[county.marquisate_id] : null;
    const duchy = county ? duchyMap[county.duchy_id] : null;
    const archduchy = duchy ? archduchyMap[duchy.archduchy_id] : null;
    const kingdom = duchy ? kingdomMap[duchy.kingdom_id] : null;
    const empire = kingdom ? empireMap[kingdom.empire_id] : null;
    const hierarchy = [];
    if (viscounty) hierarchy.push(`Vicomté: ${viscounty.name}`);
    if (county) hierarchy.push(`Comté: ${county.name}`);
    if (marquisate) hierarchy.push(`Marquisat: ${marquisate.name}`);
    if (duchy) hierarchy.push(`Duché: ${duchy.name}`);
    if (archduchy) hierarchy.push(`Archiduché: ${archduchy.name}`);
    if (kingdom) hierarchy.push(`Royaume: ${kingdom.name}`);
    if (empire) hierarchy.push(`Empire: ${empire.name}`);
    setList(feudalSection, infoFeudalList, hierarchy);
    const sancts = sanctuaryMap[id] || [];
    const buildings = [];
    sancts.forEach(s => {
      const rname = religionMap[s.religion_id]?.name || '';
      buildings.push(`Sanctuaire: ${rname}${s.active ? ' (actif)' : ' (inactif)'}`);
    });
    if (info.priory_religion_id) buildings.push(`Prieuré: ${religionMap[info.priory_religion_id]?.name || ''}`);
    if (info.church_religion_id) buildings.push(`Église: ${religionMap[info.church_religion_id]?.name || ''}`);
    if (info.cathedral_religion_id) buildings.push(`Cathédrale: ${religionMap[info.cathedral_religion_id]?.name || ''}`);
    const owner = info.seigneur_id ? seigneurMap[info.seigneur_id] : null;
    if (owner?.bishop) buildings.push('Évêque');
    setList(religiousSection, infoReligiousList, buildings);
    if (filterManager && filterSelect && filterSelect.value === 'distance') {
      filterManager.applyFilter('distance');
    }
  }

  async function fetchData() {
    const endpoint = mapMode === 'sea' ? '/api/maritime_zone_pixels' : '/api/barony_pixels';
    pixelData = mapMode === 'sea' ? await fetch(API_BASE + endpoint).then(r => r.json()) : {};
    if (mapMode === 'sea') {
      const [zones, connections, zoneBaronies] = await Promise.all([
        fetch(API_BASE + '/api/maritime_zones').then(r => r.json()),
        fetch(API_BASE + '/api/maritime_zone_connections').then(r => r.json()),
        fetch(API_BASE + '/api/maritime_zone_baronies').then(r => r.json())
      ]);
      baronyMeta = {};
      zones.forEach(z => { baronyMeta[z.id] = z; });
      baronyAdjacency = {};
      connections.forEach(c => {
        if (!baronyAdjacency[c.zone_id_1]) baronyAdjacency[c.zone_id_1] = [];
        if (!baronyAdjacency[c.zone_id_2]) baronyAdjacency[c.zone_id_2] = [];
        baronyAdjacency[c.zone_id_1].push(c.zone_id_2);
        baronyAdjacency[c.zone_id_2].push(c.zone_id_1);
      });
      const baronyIds = [...new Set(zoneBaronies.map(zb => zb.barony_id))];
      baronyPixels = {};
      fetchBaronyPixelsInChunks(baronyIds, baronyPixels, false).catch(err => console.error(err));
      maritimeZoneBaronies = {};
      zoneBaronies.forEach(zb => {
        if (!maritimeZoneBaronies[zb.zone_id]) maritimeZoneBaronies[zb.zone_id] = [];
        maritimeZoneBaronies[zb.zone_id].push(zb.barony_id);
      });
      mapData = { pixelData, baronyMeta, baronyAdjacency, baronyPixels, maritimeZoneBaronies, mapWidth, mapHeight, mapMode };
      return mapData;
    }
    const [baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, connections] = await Promise.all([
      fetch(API_BASE + '/api/baronies').then(r => r.json()),
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
    baronyMeta = {};
    baronies.forEach(b => { baronyMeta[b.id] = b; });
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
        canonicalLandMap[cl.barony_id].push(cl.canonical_barony_id);
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
    const baronyIds = baronies.map(b => b.id);
    baronyPixels = pixelData;
    fetchBaronyPixelsInChunks(baronyIds, pixelData).catch(err => console.error(err));
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
      seigneurToViscounty,
      seigneurToCounty,
      seigneurToMarquisate,
      seigneurToDuchy,
      seigneurToArchduchy,
      seigneurToKingdom,
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
        drawOverlay,
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
})();
