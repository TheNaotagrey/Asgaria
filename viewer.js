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
  let tradeRoutes = [];
  let tradeRouteConnections = {};
  let tradeRouteById = {};
  let tradeRoutesByBarony = {};
  let selectedTradeRouteId = null;

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
  const tradeRoutesSection = document.getElementById('tradeRoutesSection');
  const tradeRoutesList = document.getElementById('tradeRoutesList');
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
  const tradeRouteInfoDialog = document.getElementById('tradeRouteInfoDialog');
  const tradeRouteInfoContent = document.getElementById('tradeRouteInfoContent');

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
    (seigneurToEmpire[seigneurId] || []).forEach(empireId => {
      if (empireId && empireMap[empireId]) titles.push(`Empereur de ${empireMap[empireId].name}`);
    });
    (seigneurToKingdom[seigneurId] || []).forEach(kingdomId => {
      if (kingdomId && kingdomMap[kingdomId]) titles.push(`Roi de ${kingdomMap[kingdomId].name}`);
    });
    (seigneurToArchduchy[seigneurId] || []).forEach(archduchyId => {
      if (archduchyId && archduchyMap[archduchyId]) titles.push(`Archiduc de ${archduchyMap[archduchyId].name}`);
    });
    (seigneurToDuchy[seigneurId] || []).forEach(duchyId => {
      if (duchyId && duchyMap[duchyId]) titles.push(`Duc de ${duchyMap[duchyId].name}`);
    });
    (seigneurToMarquisate[seigneurId] || []).forEach(marquisateId => {
      if (marquisateId && marquisateMap[marquisateId]) titles.push(`Marquis de ${marquisateMap[marquisateId].name}`);
    });
    (seigneurToCounty[seigneurId] || []).forEach(countyId => {
      if (countyId && countyMap[countyId]) titles.push(`Comte de ${countyMap[countyId].name}`);
    });
    (seigneurToViscounty[seigneurId] || []).forEach(viscountyId => {
      if (viscountyId && viscountyMap[viscountyId]) titles.push(`Vicomte de ${viscountyMap[viscountyId].name}`);
    });
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

  function setTradeRouteInfoMode(active) {
    if (infoReligionLine) infoReligionLine.style.display = active ? 'none' : '';
    if (infoCultureLine) infoCultureLine.style.display = active ? 'none' : '';
    if (feudalSection) feudalSection.style.display = active ? 'none' : '';
    if (religiousSection) religiousSection.style.display = active ? 'none' : '';
    if (canonicalOwnedSection) canonicalOwnedSection.style.display = active ? 'none' : '';
    if (canonicalParentSection) canonicalParentSection.style.display = active ? 'none' : '';
    if (tradeRoutesSection) tradeRoutesSection.style.display = active ? 'block' : 'none';
  }

  function parseTradeRoutePath(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(val => parseInt(val, 10)).filter(Number.isFinite);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(val => parseInt(val, 10)).filter(Number.isFinite);
        }
      } catch (err) {
        return [];
      }
    }
    return [];
  }

  function buildTradeRouteMaps(routes) {
    tradeRouteConnections = {};
    tradeRouteById = {};
    tradeRoutesByBarony = {};
    const connectionSets = {};
    routes.forEach(route => {
      const id = parseInt(route.id, 10);
      const barony1 = parseInt(route.barony_id_1, 10);
      const barony2 = parseInt(route.barony_id_2, 10);
      if (!id || !barony1 || !barony2) return;
      const path = parseTradeRoutePath(route.path);
      const normalized = { ...route, id, barony_id_1: barony1, barony_id_2: barony2, path };
      tradeRouteById[id] = normalized;
      if (!tradeRoutesByBarony[barony1]) tradeRoutesByBarony[barony1] = [];
      if (!tradeRoutesByBarony[barony2]) tradeRoutesByBarony[barony2] = [];
      tradeRoutesByBarony[barony1].push(id);
      tradeRoutesByBarony[barony2].push(id);
      if (!connectionSets[barony1]) connectionSets[barony1] = new Set();
      if (!connectionSets[barony2]) connectionSets[barony2] = new Set();
      connectionSets[barony1].add(barony2);
      connectionSets[barony2].add(barony1);
    });
    Object.keys(connectionSets).forEach(id => {
      tradeRouteConnections[id] = Array.from(connectionSets[id]);
    });
  }

  function renderTradeRoutesList(baronyId) {
    if (!tradeRoutesList || !tradeRoutesSection) return;
    tradeRoutesList.innerHTML = '';
    const routeIds = tradeRoutesByBarony[baronyId] || [];
    if (!routeIds.length) {
      tradeRoutesList.textContent = 'Aucune route commerciale';
      return;
    }
    const rows = routeIds.map(routeId => {
      const route = tradeRouteById[routeId];
      const otherId = route.barony_id_1 === baronyId ? route.barony_id_2 : route.barony_id_1;
      const otherName = baronyMeta[otherId]?.name || baronyLookup[otherId]?.name || `Baronnie #${otherId}`;
      const pathLength = route.path ? route.path.length : 0;
      return `
        <tr>
          <td><button class="control-btn trade-route-btn" data-id="${routeId}">#${routeId}</button></td>
          <td>${otherName}</td>
          <td>${pathLength}</td>
        </tr>
      `;
    }).join('');
    tradeRoutesList.innerHTML = `<table class="admin-table"><tr><th>ID</th><th>Destination</th><th>Chemin (nœuds)</th></tr>${rows}</table>`;
    tradeRoutesList.querySelectorAll('.trade-route-btn').forEach(btn => {
      btn.addEventListener('click', () => openTradeRouteInfo(parseInt(btn.dataset.id, 10)));
    });
  }

  function openTradeRouteInfo(routeId) {
    if (!routeId || !tradeRouteInfoDialog || !tradeRouteInfoContent) return;
    const route = tradeRouteById[routeId];
    if (!route) return;
    tradeRouteInfoContent.innerHTML = '';
    const startHeader = document.createElement('div');
    startHeader.className = 'trade-route-info-header';
    startHeader.appendChild(createBaronyButton(route.barony_id_1));
    tradeRouteInfoContent.appendChild(startHeader);
    const pathList = document.createElement('ul');
    pathList.className = 'trade-route-info-path';
    const intermediates = (route.path || []).slice(1, -1);
    if (!intermediates.length) {
      const empty = document.createElement('div');
      empty.className = 'trade-route-empty';
      empty.textContent = 'Trajet direct.';
      tradeRouteInfoContent.appendChild(empty);
    } else {
      intermediates.forEach(id => {
        const li = document.createElement('li');
        li.appendChild(createBaronyButton(id));
        pathList.appendChild(li);
      });
      tradeRouteInfoContent.appendChild(pathList);
    }
    const endHeader = document.createElement('div');
    endHeader.className = 'trade-route-info-header';
    endHeader.appendChild(createBaronyButton(route.barony_id_2));
    tradeRouteInfoContent.appendChild(endHeader);
    selectedTradeRouteId = routeId;
    if (filterManager && typeof filterManager.setTradeRouteSelection === 'function') {
      filterManager.setTradeRouteSelection(routeId);
    }
    if (tradeRouteInfoDialog.showModal) {
      tradeRouteInfoDialog.showModal();
    } else {
      tradeRouteInfoDialog.setAttribute('open', 'open');
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

  function addSeigneurTitle(map, seigneurId, titleId) {
    if (!seigneurId || !titleId) return;
    const key = String(seigneurId);
    if (!map[key]) map[key] = [];
    map[key].push(titleId);
  }

  function finalizeSeigneurTitleMap(map) {
    Object.values(map).forEach(list => {
      list.sort((a, b) => a - b);
    });
  }

  const rankSequence = ['barony', 'viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'];
  const titleConfig = {
    viscounty: { map: viscountyMap, seigneurTo: seigneurToViscounty },
    county: { map: countyMap, seigneurTo: seigneurToCounty },
    marquisate: { map: marquisateMap, seigneurTo: seigneurToMarquisate },
    duchy: { map: duchyMap, seigneurTo: seigneurToDuchy },
    archduchy: { map: archduchyMap, seigneurTo: seigneurToArchduchy },
    kingdom: { map: kingdomMap, seigneurTo: seigneurToKingdom },
    empire: { map: empireMap, seigneurTo: seigneurToEmpire }
  };

  function refreshTitleConfig() {
    titleConfig.viscounty.map = viscountyMap;
    titleConfig.viscounty.seigneurTo = seigneurToViscounty;
    titleConfig.county.map = countyMap;
    titleConfig.county.seigneurTo = seigneurToCounty;
    titleConfig.marquisate.map = marquisateMap;
    titleConfig.marquisate.seigneurTo = seigneurToMarquisate;
    titleConfig.duchy.map = duchyMap;
    titleConfig.duchy.seigneurTo = seigneurToDuchy;
    titleConfig.archduchy.map = archduchyMap;
    titleConfig.archduchy.seigneurTo = seigneurToArchduchy;
    titleConfig.kingdom.map = kingdomMap;
    titleConfig.kingdom.seigneurTo = seigneurToKingdom;
    titleConfig.empire.map = empireMap;
    titleConfig.empire.seigneurTo = seigneurToEmpire;
  }

  function getRankIndex(rankKey) {
    return rankSequence.indexOf(rankKey);
  }

  function buildSeigneurChain(startId) {
    const chain = [];
    let sid = startId;
    while (sid) {
      chain.push(String(sid));
      sid = seigneurMap[sid]?.overlord_id;
    }
    return chain;
  }

  function chooseByDejure(candidates, dejureId) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    if (dejureId && candidates.includes(dejureId)) return dejureId;
    return candidates[0];
  }

  function getHighestRankIndex(seigneurId) {
    if (!seigneurId) return -1;
    for (let i = rankSequence.length - 1; i >= 1; i--) {
      const key = rankSequence[i];
      const list = titleConfig[key]?.seigneurTo?.[String(seigneurId)];
      if (Array.isArray(list) && list.length > 0) return i;
    }
    return -1;
  }

  function chooseClosestTitleForSeigneur(seigneurId, startIndex, dejureMap) {
    for (let i = startIndex + 1; i < rankSequence.length; i++) {
      const key = rankSequence[i];
      const list = titleConfig[key]?.seigneurTo?.[String(seigneurId)];
      if (Array.isArray(list) && list.length > 0) {
        const selected = chooseByDejure(list, dejureMap[key]);
        return selected ? { rankKey: key, id: selected } : null;
      }
    }
    return null;
  }

  function chooseClosestTitleFromChain(startId, startIndex, dejureMap) {
    const chain = buildSeigneurChain(startId);
    for (const sid of chain) {
      const selected = chooseClosestTitleForSeigneur(sid, startIndex, dejureMap);
      if (selected) return selected;
    }
    return null;
  }

  function getOverrideCandidates(rankKey, info) {
    const overrides = [];
    if (!info) return overrides;
    if (rankKey === 'barony') {
      if (info.defacto_viscounty_id) overrides.push({ rankKey: 'viscounty', id: info.defacto_viscounty_id });
      if (info.defacto_county_id) overrides.push({ rankKey: 'county', id: info.defacto_county_id });
    } else if (rankKey === 'county') {
      if (info.defacto_marquisate_id) overrides.push({ rankKey: 'marquisate', id: info.defacto_marquisate_id });
      if (info.defacto_duchy_id) overrides.push({ rankKey: 'duchy', id: info.defacto_duchy_id });
    } else if (rankKey === 'duchy') {
      if (info.defacto_archduchy_id) overrides.push({ rankKey: 'archduchy', id: info.defacto_archduchy_id });
      if (info.defacto_kingdom_id) overrides.push({ rankKey: 'kingdom', id: info.defacto_kingdom_id });
    } else if (rankKey === 'kingdom') {
      if (info.defacto_empire_id) overrides.push({ rankKey: 'empire', id: info.defacto_empire_id });
    }
    return overrides;
  }

  function chooseClosestOverride(rankKey, info) {
    const overrides = getOverrideCandidates(rankKey, info);
    const startIndex = getRankIndex(rankKey);
    let best = null;
    let bestIndex = Infinity;
    overrides.forEach(candidate => {
      const idx = getRankIndex(candidate.rankKey);
      if (idx > startIndex && idx < bestIndex) {
        best = candidate;
        bestIndex = idx;
      }
    });
    return best;
  }

  function getDejureMapForTitle(rankKey, info) {
    const dejureMap = {};
    if (!info) return dejureMap;
    if (rankKey === 'barony') {
      if (info.viscounty_id) dejureMap.viscounty = info.viscounty_id;
      if (info.county_id) dejureMap.county = info.county_id;
      const county = info.county_id ? countyMap?.[info.county_id] : null;
      if (county?.marquisate_id) dejureMap.marquisate = county.marquisate_id;
      if (county?.duchy_id) dejureMap.duchy = county.duchy_id;
      const duchy = county?.duchy_id ? duchyMap?.[county.duchy_id] : null;
      if (duchy?.archduchy_id) dejureMap.archduchy = duchy.archduchy_id;
      if (duchy?.kingdom_id) dejureMap.kingdom = duchy.kingdom_id;
      const kingdom = duchy?.kingdom_id ? kingdomMap?.[duchy.kingdom_id] : null;
      if (kingdom?.empire_id) dejureMap.empire = kingdom.empire_id;
    } else if (rankKey === 'county') {
      if (info.marquisate_id) dejureMap.marquisate = info.marquisate_id;
      if (info.duchy_id) dejureMap.duchy = info.duchy_id;
      const duchy = info.duchy_id ? duchyMap?.[info.duchy_id] : null;
      if (duchy?.archduchy_id) dejureMap.archduchy = duchy.archduchy_id;
      if (duchy?.kingdom_id) dejureMap.kingdom = duchy.kingdom_id;
      const kingdom = duchy?.kingdom_id ? kingdomMap?.[duchy.kingdom_id] : null;
      if (kingdom?.empire_id) dejureMap.empire = kingdom.empire_id;
    } else if (rankKey === 'duchy') {
      if (info.archduchy_id) dejureMap.archduchy = info.archduchy_id;
      if (info.kingdom_id) dejureMap.kingdom = info.kingdom_id;
      const kingdom = info.kingdom_id ? kingdomMap?.[info.kingdom_id] : null;
      if (kingdom?.empire_id) dejureMap.empire = kingdom.empire_id;
    } else if (rankKey === 'kingdom') {
      if (info.empire_id) dejureMap.empire = info.empire_id;
    }
    return dejureMap;
  }

  function resolveDefactoParent(rankKey, info) {
    if (!info) return null;
    const startIndex = getRankIndex(rankKey);
    if (startIndex < 0 || startIndex >= rankSequence.length - 1) return null;
    const override = chooseClosestOverride(rankKey, info);
    if (override) return override;
    const dejureMap = getDejureMapForTitle(rankKey, info);
    const seigneurId = info.seigneur_id;
    if (seigneurId) {
      const highestIndex = getHighestRankIndex(seigneurId);
      if (highestIndex > startIndex) {
        const selected = chooseClosestTitleForSeigneur(seigneurId, startIndex, dejureMap);
        if (selected) return selected;
      } else {
        const overlordId = seigneurMap?.[seigneurId]?.overlord_id;
        const selected = chooseClosestTitleFromChain(overlordId, startIndex, dejureMap);
        if (selected) return selected;
      }
    }
    return null;
  }

  function resolveDefactoTitle(info, targetRankKey) {
    if (!info) return null;
    const targetIndex = getRankIndex(targetRankKey);
    if (targetIndex < 1) return null;
    let currentRankKey = 'barony';
    let currentInfo = info;
    const visited = new Set();
    while (currentRankKey && getRankIndex(currentRankKey) < targetIndex) {
      const parent = resolveDefactoParent(currentRankKey, currentInfo);
      if (!parent) return null;
      if (parent.rankKey === targetRankKey) return parent.id;
      const parentInfo = titleConfig[parent.rankKey]?.map?.[parent.id];
      if (!parentInfo) return null;
      const token = `${parent.rankKey}:${parent.id}`;
      if (visited.has(token)) return null;
      visited.add(token);
      currentRankKey = parent.rankKey;
      currentInfo = parentInfo;
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
        defacto: viscountyMap[resolveDefactoTitle(info, 'viscounty')]?.name || ''
      },
      county: {
        level: 'Comté',
        dejure: county?.name || '',
        defacto: countyMap[resolveDefactoTitle(info, 'county')]?.name || ''
      },
      marquisate: {
        level: 'Marquisat',
        dejure: marquisate?.name || '',
        defacto: marquisateMap[resolveDefactoTitle(info, 'marquisate')]?.name || ''
      },
      duchy: {
        level: 'Duché',
        dejure: duchy?.name || '',
        defacto: duchyMap[resolveDefactoTitle(info, 'duchy')]?.name || ''
      },
      archduchy: {
        level: 'Archiduché',
        dejure: archduchy?.name || '',
        defacto: archduchyMap[resolveDefactoTitle(info, 'archduchy')]?.name || ''
      },
      kingdom: {
        level: 'Royaume',
        dejure: kingdom?.name || '',
        defacto: kingdomMap[resolveDefactoTitle(info, 'kingdom')]?.name || ''
      },
      empire: {
        level: 'Empire',
        dejure: empire?.name || '',
        defacto: empireMap[resolveDefactoTitle(info, 'empire')]?.name || ''
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
      const vacantLabel = info.vacant ? ' (vacante)' : '';
      baronyTitle.textContent = `Baronnie: ${info.name || ''}${vacantLabel} (#${info.id || ''})`;
    }
    setSeigneurLine(
      infoOwnerLine,
      info.seigneur_id,
      'Propriétaire:'
    );
    const isTradeRouteFilter = filterSelect && filterSelect.value === 'trade_routes';
    if (isTradeRouteFilter) {
      selectedTradeRouteId = null;
      if (filterManager && typeof filterManager.setTradeRouteSelection === 'function') {
        filterManager.setTradeRouteSelection(null);
      }
      setTradeRouteInfoMode(true);
      renderTradeRoutesList(info.id);
      if (filterManager) filterManager.applyFilter('trade_routes');
      return;
    }
    setTradeRouteInfoMode(false);
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
      counties.forEach(c => { countyMap[c.id] = c; addSeigneurTitle(seigneurToCounty, c.seigneur_id, c.id); });
      seigneurToDuchy = {};
      duchies.forEach(d => { duchyMap[d.id] = d; addSeigneurTitle(seigneurToDuchy, d.seigneur_id, d.id); });
      seigneurToKingdom = {};
      kingdoms.forEach(k => { kingdomMap[k.id] = k; addSeigneurTitle(seigneurToKingdom, k.seigneur_id, k.id); });
      seigneurToViscounty = {};
      viscounties.forEach(v => { viscountyMap[v.id] = v; addSeigneurTitle(seigneurToViscounty, v.seigneur_id, v.id); });
      seigneurToMarquisate = {};
      marquisates.forEach(m => { marquisateMap[m.id] = m; addSeigneurTitle(seigneurToMarquisate, m.seigneur_id, m.id); });
      seigneurToArchduchy = {};
      archduchies.forEach(a => { archduchyMap[a.id] = a; addSeigneurTitle(seigneurToArchduchy, a.seigneur_id, a.id); });
      seigneurToEmpire = {};
      empires.forEach(e => { empireMap[e.id] = e; addSeigneurTitle(seigneurToEmpire, e.seigneur_id, e.id); });
      finalizeSeigneurTitleMap(seigneurToCounty);
      finalizeSeigneurTitleMap(seigneurToDuchy);
      finalizeSeigneurTitleMap(seigneurToKingdom);
      finalizeSeigneurTitleMap(seigneurToViscounty);
      finalizeSeigneurTitleMap(seigneurToMarquisate);
      finalizeSeigneurTitleMap(seigneurToArchduchy);
      finalizeSeigneurTitleMap(seigneurToEmpire);
      refreshTitleConfig();
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
    const [baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, connections, routes] = await Promise.all([
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
      fetch(API_BASE + '/api/barony_connections').then(r => r.json()),
      fetch(API_BASE + '/api/trade_routes').then(r => r.json())
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
    counties.forEach(c => { countyMap[c.id] = c; addSeigneurTitle(seigneurToCounty, c.seigneur_id, c.id); });
    duchyMap = {};
    seigneurToDuchy = {};
    duchies.forEach(d => { duchyMap[d.id] = d; addSeigneurTitle(seigneurToDuchy, d.seigneur_id, d.id); });
    kingdomMap = {};
    seigneurToKingdom = {};
    kingdoms.forEach(k => { kingdomMap[k.id] = k; addSeigneurTitle(seigneurToKingdom, k.seigneur_id, k.id); });
    viscountyMap = {};
    seigneurToViscounty = {};
    viscounties.forEach(v => { viscountyMap[v.id] = v; addSeigneurTitle(seigneurToViscounty, v.seigneur_id, v.id); });
    marquisateMap = {};
    seigneurToMarquisate = {};
    marquisates.forEach(m => { marquisateMap[m.id] = m; addSeigneurTitle(seigneurToMarquisate, m.seigneur_id, m.id); });
    archduchyMap = {};
    seigneurToArchduchy = {};
    archduchies.forEach(a => { archduchyMap[a.id] = a; addSeigneurTitle(seigneurToArchduchy, a.seigneur_id, a.id); });
    empireMap = {};
    seigneurToEmpire = {};
    empires.forEach(e => { empireMap[e.id] = e; addSeigneurTitle(seigneurToEmpire, e.seigneur_id, e.id); });
    finalizeSeigneurTitleMap(seigneurToCounty);
    finalizeSeigneurTitleMap(seigneurToDuchy);
    finalizeSeigneurTitleMap(seigneurToKingdom);
    finalizeSeigneurTitleMap(seigneurToViscounty);
    finalizeSeigneurTitleMap(seigneurToMarquisate);
    finalizeSeigneurTitleMap(seigneurToArchduchy);
    finalizeSeigneurTitleMap(seigneurToEmpire);
    refreshTitleConfig();
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
    tradeRoutes = Array.isArray(routes) ? routes : [];
    buildTradeRouteMaps(tradeRoutes);
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
      tradeRouteConnections,
      tradeRouteById,
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
          const handleFilterChange = () => {
            if (filterSelect.value !== 'trade_routes') {
              selectedTradeRouteId = null;
              if (filterManager && typeof filterManager.setTradeRouteSelection === 'function') {
                filterManager.setTradeRouteSelection(null);
              }
              setTradeRouteInfoMode(false);
            } else if (core.currentSelectedId) {
              setTradeRouteInfoMode(true);
              renderTradeRoutesList(core.currentSelectedId);
            }
            filterManager.applyFilter(filterSelect.value);
          };
          filterSelect.addEventListener('change', handleFilterChange);
          handleFilterChange();
        }
        if (randomBtn) randomBtn.addEventListener('click', () => filterManager.randomizeColors());
      });
    });
  });
})();
