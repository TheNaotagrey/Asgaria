(() => {
  const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';
  const params = new URLSearchParams(location.search);
  const mapMode = params.get('mode') === 'sea' ? 'sea' : 'land';
  const PIXEL_CHUNK_SIZE = 15;
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
  let baronyLookup = {};
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
  let canonicalDependents = {};
  let canonicalParents = {};
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
  const infoFeudalBody = document.getElementById('infoFeudalBody');
  const religiousSection = document.getElementById('religiousBuildingsSection');
  const infoReligiousList = document.getElementById('infoReligiousList');
  const canonicalOwnedSection = document.getElementById('canonicalOwnedSection');
  const canonicalOwnedList = document.getElementById('canonicalOwnedList');
  const canonicalParentSection = document.getElementById('canonicalParentSection');
  const canonicalParentList = document.getElementById('canonicalParentList');
  const seaInfoPanel = document.getElementById('seaInfoPanel');
  const seaInfoId = document.getElementById('seaInfoId');
  const seaInfoName = document.getElementById('seaInfoName');
  const seaInfoSeigneur = document.getElementById('seaInfoSeigneur');
  const seigneurInfoPanel = document.getElementById('seigneurInfoPanel');
  const seigneurInfoTitle = document.getElementById('seigneurInfoTitle');
  const seigneurInfoIdentity = document.getElementById('seigneurInfoIdentity');
  const seigneurInfoReligion = document.getElementById('seigneurInfoReligion');
  const seigneurOverlordLine = document.getElementById('seigneurOverlordLine');
  const seigneurTitlesSection = document.getElementById('seigneurTitlesSection');
  const seigneurTitlesList = document.getElementById('seigneurTitlesList');
  const seigneurVassalsSection = document.getElementById('seigneurVassalsSection');
  const seigneurVassalList = document.getElementById('seigneurVassalList');
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

  function setLabeledLine(elem, label, value) {
    if (!elem) return;
    elem.innerHTML = '';
    if (value) {
      elem.style.display = 'block';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'info-label';
      labelSpan.textContent = label;
      elem.appendChild(labelSpan);
      elem.appendChild(document.createTextNode(' '));
      const span = document.createElement('span');
      span.textContent = value;
      elem.appendChild(span);
    } else {
      elem.style.display = 'none';
    }
  }

  function setSeigneurLine(elem, seigneurId, label, suffixText) {
    if (!elem) return;
    elem.innerHTML = '';
    if (seigneurId && seigneurMap[seigneurId]) {
      elem.style.display = 'flex';
      if (label) {
        const labelSpan = document.createElement('span');
        labelSpan.className = 'info-label';
        labelSpan.textContent = label;
        elem.appendChild(labelSpan);
        elem.appendChild(document.createTextNode(' '));
      }
      elem.appendChild(createSeigneurButton(seigneurId));
      if (suffixText) {
        elem.appendChild(document.createTextNode(` ${suffixText}`));
      }
      return;
    }
    if (suffixText) {
      elem.style.display = 'flex';
      if (label) {
        const labelSpan = document.createElement('span');
        labelSpan.className = 'info-label';
        labelSpan.textContent = label;
        elem.appendChild(labelSpan);
        elem.appendChild(document.createTextNode(' '));
      }
      elem.appendChild(document.createTextNode(suffixText));
      return;
    }
    elem.style.display = 'none';
  }

  function createSeigneurButton(seigneurId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seigneur-link';
    btn.textContent = seigneurMap[seigneurId]?.name || `Seigneur #${seigneurId}`;
    btn.addEventListener('click', () => showSeigneurInfo(seigneurId));
    return btn;
  }

  function showBaronyDetails(baronyId) {
    if (!baronyId) return;
    if (core && typeof core.selectBarony === 'function') {
      core.selectBarony(baronyId);
    } else {
      handleSelect(baronyId);
    }
  }

  function createBaronyButton(baronyId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'barony-link';
    const label = baronyMeta[baronyId]?.name || baronyLookup[baronyId]?.name || `Baronnie #${baronyId}`;
    btn.textContent = `${label} (#${baronyId})`;
    btn.addEventListener('click', () => showBaronyDetails(baronyId));
    return btn;
  }

  function setSeigneurList(section, list, ids) {
    if (!section || !list) return;
    list.innerHTML = '';
    if (ids && ids.length > 0) {
      section.style.display = 'block';
      ids.forEach(id => {
        const li = document.createElement('li');
        li.appendChild(createSeigneurButton(id));
        list.appendChild(li);
      });
    } else {
      section.style.display = 'none';
    }
  }

  function showSeigneurInfo(seigneurId) {
    if (!seigneurInfoPanel) return;
    const seigneur = seigneurMap[seigneurId];
    if (!seigneur) return;
    if (infoPanel) infoPanel.style.display = 'none';
    if (seaInfoPanel) seaInfoPanel.style.display = 'none';
    seigneurInfoPanel.style.display = 'block';
    if (seigneurInfoTitle) seigneurInfoTitle.textContent = seigneur.name;
    if (seigneurInfoIdentity) setLine(seigneurInfoIdentity, '');
    const religionName = seigneur.religion_id ? (religionMap[seigneur.religion_id]?.name || '') : '';
    setLabeledLine(seigneurInfoReligion, 'Religion:', religionName);
    setSeigneurLine(seigneurOverlordLine, seigneur.overlord_id, 'Suzerain:');

    const titles = [];
    const empireId = seigneurToEmpire[seigneurId];
    if (empireId && empireMap[empireId]) titles.push(`Empereur de ${empireMap[empireId].name}`);
    const kingdomId = seigneurToKingdom[seigneurId];
    if (kingdomId && kingdomMap[kingdomId]) titles.push(`Roi de ${kingdomMap[kingdomId].name}`);
    const archduchyId = seigneurToArchduchy[seigneurId];
    if (archduchyId && archduchyMap[archduchyId]) titles.push(`Archiduc de ${archduchyMap[archduchyId].name}`);
    const duchyId = seigneurToDuchy[seigneurId];
    if (duchyId && duchyMap[duchyId]) titles.push(`Duc de ${duchyMap[duchyId].name}`);
    const marquisateId = seigneurToMarquisate[seigneurId];
    if (marquisateId && marquisateMap[marquisateId]) titles.push(`Marquis de ${marquisateMap[marquisateId].name}`);
    const countyId = seigneurToCounty[seigneurId];
    if (countyId && countyMap[countyId]) titles.push(`Comte de ${countyMap[countyId].name}`);
    const viscountyId = seigneurToViscounty[seigneurId];
    if (viscountyId && viscountyMap[viscountyId]) titles.push(`Vicomte de ${viscountyMap[viscountyId].name}`);
    const ownedBaronies = Object.values(baronyLookup)
      .filter(b => b.seigneur_id === seigneurId)
      .map(b => ({ id: b.id, name: b.name }));
    setTitleList(seigneurTitlesSection, seigneurTitlesList, titles, ownedBaronies);

    const vassals = Object.values(seigneurMap)
      .filter(s => s.overlord_id === seigneurId)
      .map(s => s.id);
    setSeigneurList(seigneurVassalsSection, seigneurVassalList, vassals);
  }

  function hideSeigneurInfo() {
    if (seigneurInfoPanel) seigneurInfoPanel.style.display = 'none';
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

  function setTitleList(section, list, titles = [], baronies = []) {
    if (!section || !list) return;
    list.innerHTML = '';
    const hasItems = (titles && titles.length > 0) || (baronies && baronies.length > 0);
    if (!hasItems) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    titles.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });
    baronies.forEach(barony => {
      if (!barony || !barony.id) return;
      const li = document.createElement('li');
      li.appendChild(document.createTextNode('Baron de '));
      li.appendChild(createBaronyButton(barony.id));
      list.appendChild(li);
    });
  }

  function setBaronyList(section, list, items) {
    if (!section || !list) return;
    list.innerHTML = '';
    if (items && items.length > 0) {
      section.style.display = 'block';
      items.forEach(item => {
        if (!item || !item.id) return;
        const li = document.createElement('li');
        li.appendChild(createBaronyButton(item.id));
        list.appendChild(li);
      });
    } else {
      section.style.display = 'none';
    }
  }

  function findDefactoEntity(seigneurId, mapping, entityMap) {
    let sid = seigneurId;
    while (sid) {
      const entityId = mapping[sid];
      if (entityId) return entityMap[entityId];
      sid = seigneurMap[sid]?.overlord_id;
    }
    return null;
  }

  function setFeudalTable(section, tbody, info) {
    if (!section || !tbody || !info) return;
    tbody.innerHTML = '';
    const viscounty = viscountyMap[info.viscounty_id];
    const county = countyMap[info.county_id];
    const marquisate = county ? marquisateMap[county.marquisate_id] : null;
    const duchy = county ? duchyMap[county.duchy_id] : null;
    const archduchy = duchy ? archduchyMap[duchy.archduchy_id] : null;
    const kingdom = duchy ? kingdomMap[duchy.kingdom_id] : null;
    const empire = kingdom ? empireMap[kingdom.empire_id] : null;

    const rows = {
      viscounty: {
        level: 'Vicomté',
        dejure: viscounty?.name || '',
        defacto: findDefactoEntity(info.seigneur_id, seigneurToViscounty, viscountyMap)?.name || ''
      },
      county: {
        level: 'Comté',
        dejure: county?.name || '',
        defacto: findDefactoEntity(info.seigneur_id, seigneurToCounty, countyMap)?.name || ''
      },
      marquisate: {
        level: 'Marquisat',
        dejure: marquisate?.name || '',
        defacto: findDefactoEntity(info.seigneur_id, seigneurToMarquisate, marquisateMap)?.name || ''
      },
      duchy: {
        level: 'Duché',
        dejure: duchy?.name || '',
        defacto: findDefactoEntity(info.seigneur_id, seigneurToDuchy, duchyMap)?.name || ''
      },
      archduchy: {
        level: 'Archiduché',
        dejure: archduchy?.name || '',
        defacto: findDefactoEntity(info.seigneur_id, seigneurToArchduchy, archduchyMap)?.name || ''
      },
      kingdom: {
        level: 'Royaume',
        dejure: kingdom?.name || '',
        defacto: findDefactoEntity(info.seigneur_id, seigneurToKingdom, kingdomMap)?.name || ''
      },
      empire: {
        level: 'Empire',
        dejure: empire?.name || '',
        defacto: findDefactoEntity(info.seigneur_id, seigneurToEmpire, empireMap)?.name || ''
      }
    };

    const order = ['kingdom', 'empire', 'archduchy', 'duchy', 'marquisate', 'county', 'viscounty'];
    const filteredRows = order
      .map(key => rows[key])
      .filter(row => row && (row.dejure || row.defacto));

    const hasData = filteredRows.length > 0;
    if (!hasData) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    filteredRows.forEach(row => {
      const tr = document.createElement('tr');
      const levelCell = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = row.level;
      levelCell.appendChild(strong);
      const dejureCell = document.createElement('td');
      dejureCell.textContent = row.dejure;
      const defactoCell = document.createElement('td');
      defactoCell.textContent = row.defacto;
      tr.appendChild(levelCell);
      tr.appendChild(dejureCell);
      tr.appendChild(defactoCell);
      tbody.appendChild(tr);
    });
  }

  const landFilters = [
    { value: '', label: 'Aucun' },
    { value: 'religion', label: 'Religion de la Population' },
    { value: 'seigneur_religion', label: 'Religion du seigneur' },
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
    const queue = shuffle([...ids]);
    const active = [];
    let loaded = 0;
    const total = ids.length;

    function shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }

    async function parseJsonResponse(res) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON (${e.message}): ${text.slice(0, 200)}...`);
      }
    }

    async function fetchChunk(batch) {
      const res = await fetch(`${API_BASE}/api/barony_pixels?ids=${batch.join(',')}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseJsonResponse(res);
    }

    async function fetchSinglePixel(id) {
      const res = await fetch(`${API_BASE}/api/barony_pixels?id=${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseJsonResponse(res);
    }

    const scheduleNext = () => {
      if (active.length >= MAX_PIXEL_REQUESTS) return;
      const batch = queue.splice(0, PIXEL_CHUNK_SIZE);
      if (batch.length === 0) return;
      const promise = fetchChunk(batch)
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
        .catch(async err => {
          console.warn('Erreur lors du chargement des pixels, tentative par id', err);
          await Promise.all(batch.map(async id => {
            try {
              const single = await fetchSinglePixel(id);
              target[id] = single;
            } catch (e) {
              console.warn(`Echec sur la baronnie ${id}`, e);
            } finally {
              loaded = Math.min(total, loaded + 1);
              updatePixelLoading(loaded, total, true);
            }
          }));
          if (applyToCore && core && typeof core.setPixelData === 'function') {
            core.setPixelData(target);
          } else if (core && typeof core.drawAll === 'function') {
            core.drawAll();
          }
        })
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
    hideSeigneurInfo();
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
      if (seaInfoSeigneur) {
        seaInfoSeigneur.innerHTML = '';
        if (info.seigneur_id && seigneurMap[info.seigneur_id]) {
          seaInfoSeigneur.appendChild(createSeigneurButton(info.seigneur_id));
        }
      }
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
    setSeigneurLine(
      infoOwnerLine,
      info.seigneur_id,
      'Propriétaire:',
      info.vacant ? '(vacante)' : ''
    );
    setLabeledLine(
      infoReligionLine,
      'Religion de la population :',
      info.religion_pop_id ? `${religionMap[info.religion_pop_id]?.name || ''}` : ''
    );
    setLabeledLine(
      infoCultureLine,
      'Culture:',
      info.culture_id ? `${cultureMapInfo[info.culture_id]?.name || ''}` : ''
    );
    setFeudalTable(feudalSection, infoFeudalBody, info);
    const sancts = sanctuaryMap[id] || [];
    const buildings = [];
    sancts.forEach(s => {
      const rname = religionMap[s.religion_id]?.name || '';
      const isActive = info.religion_pop_id && String(info.religion_pop_id) === String(s.religion_id);
      buildings.push(`Sanctuaire: ${rname} (${isActive ? 'actif' : 'inactif'})`);
    });
    if (info.priory_religion_id) buildings.push(`Prieuré: ${religionMap[info.priory_religion_id]?.name || ''}`);
    if (info.church_religion_id) buildings.push(`Église: ${religionMap[info.church_religion_id]?.name || ''}`);
    if (info.cathedral_religion_id) buildings.push(`Cathédrale: ${religionMap[info.cathedral_religion_id]?.name || ''}`);
    setList(religiousSection, infoReligiousList, buildings);
    const ownedCanonicals = (canonicalDependents[id] || []).map(cid => ({ id: cid }));
    setBaronyList(canonicalOwnedSection, canonicalOwnedList, ownedCanonicals);
    const parentCanonicals = (canonicalParents[id] || [])
      .filter(pid => pid !== id)
      .map(pid => ({ id: pid }));
    setBaronyList(canonicalParentSection, canonicalParentList, parentCanonicals);
    if (filterManager && filterSelect && filterSelect.value === 'distance') {
      filterManager.applyFilter('distance');
    }
  }

  async function fetchData() {
    const endpoint = mapMode === 'sea' ? '/api/maritime_zone_pixels' : '/api/barony_pixels';
    pixelData = mapMode === 'sea' ? await fetch(API_BASE + endpoint).then(r => r.json()) : {};
    canonicalLandMap = {};
    canonicalDependents = {};
    canonicalParents = {};
    if (mapMode === 'sea') {
      const [zones, seigneurs, connections, zoneBaronies, baronies, religions, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires] = await Promise.all([
        fetch(API_BASE + '/api/maritime_zones').then(r => r.json()),
        fetch(API_BASE + '/api/seigneurs').then(r => r.json()),
        fetch(API_BASE + '/api/maritime_zone_connections').then(r => r.json()),
        fetch(API_BASE + '/api/maritime_zone_baronies').then(r => r.json()),
        fetch(API_BASE + '/api/baronies').then(r => r.json()),
        fetch(API_BASE + '/api/religions').then(r => r.json()),
        fetch(API_BASE + '/api/counties').then(r => r.json()),
        fetch(API_BASE + '/api/duchies').then(r => r.json()),
        fetch(API_BASE + '/api/kingdoms').then(r => r.json()),
        fetch(API_BASE + '/api/viscounties').then(r => r.json()),
        fetch(API_BASE + '/api/marquisates').then(r => r.json()),
        fetch(API_BASE + '/api/archduchies').then(r => r.json()),
        fetch(API_BASE + '/api/empires').then(r => r.json())
      ]);
      baronyMeta = {};
      zones.forEach(z => { baronyMeta[z.id] = z; });
      baronyLookup = {};
      baronies.forEach(b => { baronyLookup[b.id] = b; });
      seigneurMap = {};
      seigneurs.forEach(s => { seigneurMap[s.id] = s; });
      religionMap = {};
      religions.forEach(r => { religionMap[r.id] = r; });
      countyMap = {};
      duchyMap = {};
      kingdomMap = {};
      viscountyMap = {};
      marquisateMap = {};
      archduchyMap = {};
      empireMap = {};
      seigneurToCounty = {};
      counties.forEach(c => { countyMap[c.id] = c; if (c.seigneur_id) seigneurToCounty[c.seigneur_id] = c.id; });
      seigneurToDuchy = {};
      duchies.forEach(d => { duchyMap[d.id] = d; if (d.seigneur_id) seigneurToDuchy[d.seigneur_id] = d.id; });
      seigneurToKingdom = {};
      kingdoms.forEach(k => { kingdomMap[k.id] = k; if (k.seigneur_id) seigneurToKingdom[k.seigneur_id] = k.id; });
      seigneurToViscounty = {};
      viscounties.forEach(v => { viscountyMap[v.id] = v; if (v.seigneur_id) seigneurToViscounty[v.seigneur_id] = v.id; });
      seigneurToMarquisate = {};
      marquisates.forEach(m => { marquisateMap[m.id] = m; if (m.seigneur_id) seigneurToMarquisate[m.seigneur_id] = m.id; });
      seigneurToArchduchy = {};
      archduchies.forEach(a => { archduchyMap[a.id] = a; if (a.seigneur_id) seigneurToArchduchy[a.seigneur_id] = a.id; });
      seigneurToEmpire = {};
      empires.forEach(e => { empireMap[e.id] = e; if (e.seigneur_id) seigneurToEmpire[e.seigneur_id] = e.id; });
      baronyAdjacency = {};
      connections.forEach(c => {
        const dist = parseInt(c.distance, 10) || 1;
        if (!baronyAdjacency[c.zone_id_1]) baronyAdjacency[c.zone_id_1] = [];
        if (!baronyAdjacency[c.zone_id_2]) baronyAdjacency[c.zone_id_2] = [];
        baronyAdjacency[c.zone_id_1].push({ id: c.zone_id_2, distance: dist });
        baronyAdjacency[c.zone_id_2].push({ id: c.zone_id_1, distance: dist });
      });
      const baronyIds = [...new Set(zoneBaronies.map(zb => zb.barony_id))];
      baronyPixels = {};
      fetchBaronyPixelsInChunks(baronyIds, baronyPixels, false).catch(err => console.error(err));
      maritimeZoneBaronies = {};
      zoneBaronies.forEach(zb => {
        if (!maritimeZoneBaronies[zb.zone_id]) maritimeZoneBaronies[zb.zone_id] = [];
        maritimeZoneBaronies[zb.zone_id].push(zb.barony_id);
      });
      mapData = {
        pixelData,
        baronyMeta,
        baronyLookup,
        baronyAdjacency,
        baronyPixels,
        maritimeZoneBaronies,
        seigneurMap,
        religionMap,
        countyMap,
        duchyMap,
        kingdomMap,
        viscountyMap,
        marquisateMap,
        archduchyMap,
        empireMap,
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
    baronyLookup = {};
    baronies.forEach(b => { baronyMeta[b.id] = b; baronyLookup[b.id] = b; });
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
    canonicalParents = {};
    canonicalLands.forEach(cl => {
      if (!canonicalLandMap[cl.barony_id]) canonicalLandMap[cl.barony_id] = [];
      canonicalLandMap[cl.barony_id].push(cl.canonical_barony_id);
      if (!canonicalDependents[cl.canonical_barony_id]) canonicalDependents[cl.canonical_barony_id] = [];
      canonicalDependents[cl.canonical_barony_id].push(cl.barony_id);
      if (cl.barony_id !== cl.canonical_barony_id) {
        if (!canonicalParents[cl.barony_id]) canonicalParents[cl.barony_id] = [];
        canonicalParents[cl.barony_id].push(cl.canonical_barony_id);
      }
    });
    sanctuaryMap = {};
    sanctuaries.forEach(s => {
      if (!sanctuaryMap[s.barony_id]) sanctuaryMap[s.barony_id] = [];
      sanctuaryMap[s.barony_id].push({ religion_id: s.religion_id });
    });
    baronyAdjacency = {};
    connections.forEach(c => {
      const dist = parseInt(c.distance, 10) || 1;
      if (!baronyAdjacency[c.barony_id_1]) baronyAdjacency[c.barony_id_1] = [];
      if (!baronyAdjacency[c.barony_id_2]) baronyAdjacency[c.barony_id_2] = [];
      baronyAdjacency[c.barony_id_1].push({ id: c.barony_id_2, distance: dist });
      baronyAdjacency[c.barony_id_2].push({ id: c.barony_id_1, distance: dist });
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
      canonicalDependents,
      sanctuaryMap,
      baronyAdjacency,
      baronyLookup,
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
