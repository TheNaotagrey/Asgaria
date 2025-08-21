(() => {
  const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';
  const params = new URLSearchParams(location.search);
  const mapMode = params.get('mode') === 'sea' ? 'sea' : 'land';

  let mapWidth = 0;
  let mapHeight = 0;
  const terrainColor = [239, 228, 176];
  const playerColor = [82, 190, 128];
  const npcColor = [231, 76, 60];

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
  let seigneurToViscounty = {}, seigneurToCounty = {}, seigneurToMarquisate = {}, seigneurToDuchy = {}, seigneurToArchduchy = {}, seigneurToKingdom = {}, seigneurToEmpire = {};
  let canonicalLandMap = {};
  let sanctuaryMap = {};
  let baronyAdjacency = {};
  let mapData = {};

  let filterManager = null;

  const baseMap = document.getElementById('baseMap');
  if (mapMode === 'sea' && baseMap) baseMap.src = 'zones_maritimes.png';
  const pixelCanvas = document.getElementById('pixelCanvas');
  const mapContainer = document.getElementById('mapContainer');
  const infoPanel = document.getElementById('infoPanel');
  const infoIdRow = document.getElementById('infoIdRow');
  const infoId = document.getElementById('infoId');
  const infoNameRow = document.getElementById('infoNameRow');
  const infoName = document.getElementById('infoName');
  const infoSeigneurRow = document.getElementById('infoSeigneurRow');
  const infoSeigneur = document.getElementById('infoSeigneur');
  const infoCultureRow = document.getElementById('infoCultureRow');
  const infoCulture = document.getElementById('infoCulture');
  const infoPlayerRow = document.getElementById('infoPlayerRow');
  const infoPlayer = document.getElementById('infoPlayer');
  const infoViscountyRow = document.getElementById('infoViscountyRow');
  const infoViscounty = document.getElementById('infoViscounty');
  const infoCountyRow = document.getElementById('infoCountyRow');
  const infoCounty = document.getElementById('infoCounty');
  const infoMarquisateRow = document.getElementById('infoMarquisateRow');
  const infoMarquisate = document.getElementById('infoMarquisate');
  const infoDuchyRow = document.getElementById('infoDuchyRow');
  const infoDuchy = document.getElementById('infoDuchy');
  const infoArchduchyRow = document.getElementById('infoArchduchyRow');
  const infoArchduchy = document.getElementById('infoArchduchy');
  const infoKingdomRow = document.getElementById('infoKingdomRow');
  const infoKingdom = document.getElementById('infoKingdom');
  const infoEmpireRow = document.getElementById('infoEmpireRow');
  const infoEmpire = document.getElementById('infoEmpire');
  const infoReligionRow = document.getElementById('infoReligionRow');
  const infoReligion = document.getElementById('infoReligion');
  const infoSanctuaryRow = document.getElementById('infoSanctuaryRow');
  const infoSanctuaryList = document.getElementById('infoSanctuaryList');
  const infoPrioryRow = document.getElementById('infoPrioryRow');
  const infoPriory = document.getElementById('infoPriory');
  const infoChurchRow = document.getElementById('infoChurchRow');
  const infoChurch = document.getElementById('infoChurch');
  const infoCathedralRow = document.getElementById('infoCathedralRow');
  const infoCathedral = document.getElementById('infoCathedral');
  const infoBishopRow = document.getElementById('infoBishopRow');
  const infoBishop = document.getElementById('infoBishop');
  const infoCanonicalRow = document.getElementById('infoCanonicalRow');
  const infoCanonicalList = document.getElementById('infoCanonicalList');
  const seaInfoPanel = document.getElementById('seaInfoPanel');
  const seaInfoId = document.getElementById('seaInfoId');
  const seaInfoName = document.getElementById('seaInfoName');
  const legendDiv = document.getElementById('legend');
  const filterSelect = document.getElementById('filterSelect');
  const randomBtn = document.getElementById('randomBtn');

  function setRow(row, span, value) {
    if (!row || !span) return;
    if (value !== undefined && value !== null && value !== '') {
      row.style.display = 'block';
      span.textContent = value;
    } else {
      row.style.display = 'none';
      span.textContent = '';
    }
  }

  function setList(row, list, items) {
    if (!row || !list) return;
    list.innerHTML = '';
    if (items && items.length > 0) {
      row.style.display = 'block';
      items.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
      });
    } else {
      row.style.display = 'none';
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
    { value: 'distance', label: 'Distance' }
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
      if (filterManager && filterSelect && filterSelect.value === 'distance') {
        filterManager.applyFilter('distance');
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
    setRow(infoIdRow, infoId, info.id);
    setRow(infoNameRow, infoName, info.name);
    setRow(infoSeigneurRow, infoSeigneur, seigneurMap[info.seigneur_id]?.name);
    setRow(infoCultureRow, infoCulture, cultureMapInfo[info.culture_id]?.name);
    setRow(infoPlayerRow, infoPlayer, info.player ? 'Oui' : '');
    const viscounty = viscountyMap[info.viscounty_id];
    setRow(infoViscountyRow, infoViscounty, viscounty?.name);
    const county = countyMap[info.county_id];
    setRow(infoCountyRow, infoCounty, county?.name);
    const marquisate = county ? marquisateMap[county.marquisate_id] : null;
    setRow(infoMarquisateRow, infoMarquisate, marquisate?.name);
    const duchy = county ? duchyMap[county.duchy_id] : null;
    setRow(infoDuchyRow, infoDuchy, duchy?.name);
    const archduchy = duchy ? archduchyMap[duchy.archduchy_id] : null;
    setRow(infoArchduchyRow, infoArchduchy, archduchy?.name);
    const kingdom = duchy ? kingdomMap[duchy.kingdom_id] : null;
    setRow(infoKingdomRow, infoKingdom, kingdom?.name);
    const empire = kingdom ? empireMap[kingdom.empire_id] : null;
    setRow(infoEmpireRow, infoEmpire, empire?.name);
    setRow(infoReligionRow, infoReligion, religionMap[info.religion_pop_id]?.name);
    const sancts = sanctuaryMap[id] || [];
    setList(infoSanctuaryRow, infoSanctuaryList, sancts.map(s => `${religionMap[s.religion_id]?.name || ''}${s.active ? ' (actif)' : ' (inactif)'}`));
    setRow(infoPrioryRow, infoPriory, religionMap[info.priory_religion_id]?.name);
    setRow(infoChurchRow, infoChurch, religionMap[info.church_religion_id]?.name);
    setRow(infoCathedralRow, infoCathedral, religionMap[info.cathedral_religion_id]?.name);
    setRow(infoBishopRow, infoBishop, info.bishop ? 'Oui' : '');
    setList(infoCanonicalRow, infoCanonicalList, (canonicalLandMap[id] || []).map(rid => baronyMeta[rid]?.name || ''));
    if (filterManager && filterSelect && filterSelect.value === 'distance') {
      filterManager.applyFilter('distance');
    }
  }

  async function fetchData() {
    const endpoint = mapMode === 'sea' ? '/api/maritime_zone_pixels' : '/api/barony_pixels';
    pixelData = await fetch(API_BASE + endpoint).then(r => r.json());
    if (mapMode === 'sea') {
      const [zones, connections] = await Promise.all([
        fetch(API_BASE + '/api/maritime_zones').then(r => r.json()),
        fetch(API_BASE + '/api/maritime_zone_connections').then(r => r.json())
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
      mapData = { pixelData, baronyMeta, baronyAdjacency, mapWidth, mapHeight, mapMode };
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
      const core = mapCore.init({
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
})();
