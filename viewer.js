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
  let tradeLines = [];
  let tradeLineConnections = {};
  let tradeLineById = {};
  let tradeLinesByBarony = {};
  let pendingPixelData = null;
  let selectedTradeRouteId = null;
  let selectedTradeLineId = null;
  let suppressTradeRoutePanelHide = false;
  let maritimeZoneMap = {};
  let maritimeZonePixels = {};

  let filterManager = null;
  let core = null;

  const baseMap = document.getElementById('baseMap');
  const idOverlayMap = document.getElementById('idOverlayMap');
  if (mapMode === 'sea' && baseMap) baseMap.src = 'zones_maritimes.png';
  if (idOverlayMap && mapMode === 'sea') idOverlayMap.style.display = 'none';
  const pixelCanvas = document.getElementById('pixelCanvas');
  const mapContainer = document.getElementById('mapContainer');
  const infoPanel = document.getElementById('infoPanel');
  const baronyTitle = document.getElementById('baronyTitle');
  const infoOwnerLine = document.getElementById('infoOwnerLine');
  const infoReligionLine = document.getElementById('infoReligionLine');
  const infoCultureLine = document.getElementById('infoCultureLine');
  const tradeRoutesSection = document.getElementById('tradeRoutesSection');
  const tradeRoutesList = document.getElementById('tradeRoutesList');
  const tradeLinesList = document.getElementById('tradeLinesList');
  const feudalSection = document.getElementById('feudalSection');
  const infoFeudalTable = document.getElementById('infoFeudalTable');
  const infoFeudalBody = document.getElementById('infoFeudalBody');
  const religiousSection = document.getElementById('religiousBuildingsSection');
  const infoReligiousList = document.getElementById('infoReligiousList');
  const canonicalOwnedSection = document.getElementById('canonicalOwnedSection');
  const canonicalOwnedList = document.getElementById('canonicalOwnedList');
  const canonicalParentSection = document.getElementById('canonicalParentSection');
  const canonicalParentList = document.getElementById('canonicalParentList');
  const titleSubtitlesSection = document.getElementById('titleSubtitlesSection');
  const titleSubtitlesList = document.getElementById('titleSubtitlesList');
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
  const tradeRoutePanel = document.getElementById('tradeRoutePanel');
  const tradeRoutePanelTitle = document.getElementById('tradeRoutePanelTitle');
  const tradeRouteConnectedSection = document.getElementById('tradeRouteConnectedSection');
  const tradeRouteConnectedList = document.getElementById('tradeRouteConnectedList');
  const tradeRoutePathSection = document.getElementById('tradeRoutePathSection');
  const tradeRoutePathList = document.getElementById('tradeRoutePathList');
  const legendDiv = document.getElementById('legend');
  const cultureRankingPanel = document.getElementById('cultureRanking');
  const cultureRankingBody = document.getElementById('cultureRankingBody');
  const mapSearchOverlay = document.getElementById('mapSearchOverlay');
  const filterSelect = document.getElementById('filterSelect');
  const randomBtn = document.getElementById('randomBtn');
  const pixelLoading = document.getElementById('pixelLoading');
  let searchEntries = [];
  let searchController = null;
  let searchInput = null;
  let selectedTitle = null;

  const titleTypeConfig = {
    viscounty: { label: 'Vicomté', map: () => viscountyMap, prefix: 'Vicomte de' },
    county: { label: 'Comté', map: () => countyMap, prefix: 'Comte de' },
    marquisate: { label: 'Marquisat', map: () => marquisateMap, prefix: 'Marquis de' },
    duchy: { label: 'Duché', map: () => duchyMap, prefix: 'Duc de' },
    archduchy: { label: 'Archiduché', map: () => archduchyMap, prefix: 'Archiduc de' },
    kingdom: { label: 'Royaume', map: () => kingdomMap, prefix: 'Roi de' },
    empire: { label: 'Empire', map: () => empireMap, prefix: 'Empereur de' }
  };

  const titleHierarchy = ['viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'];
  const dejureSubtitleRankMap = {
    empire: 'kingdom',
    kingdom: 'duchy',
    archduchy: 'duchy',
    duchy: 'county',
    marquisate: 'county'
  };

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

  function isVacantBarony(info) {
    return !!(info && (info.vacant === 1 || info.vacant === '1' || info.vacant === true));
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

  function createBaronyLabel(baronyId) {
    const name = baronyMeta[baronyId]?.name || baronyLookup[baronyId]?.name;
    return name ? `${name} (#${baronyId})` : `Baronnie #${baronyId}`;
  }

  function getTitleMap(rankKey) {
    return titleTypeConfig[rankKey]?.map?.() || {};
  }

  function createTitleButton(rankKey, titleId, options = {}) {
    const { mode = 'dejure', includeRank = false } = options;
    const map = getTitleMap(rankKey);
    const info = map[titleId];
    const label = info?.name || `${titleTypeConfig[rankKey]?.label || 'Titre'} #${titleId}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'barony-link';
    btn.textContent = includeRank ? `${titleTypeConfig[rankKey]?.label || 'Titre'} ${label}` : label;
    btn.addEventListener('click', () => showTitleInfo(rankKey, titleId, mode));
    return btn;
  }

  function getTitleFilterInfo(filterValue) {
    if (!filterValue) return null;
    const isDefacto = filterValue.endsWith('_defacto');
    const rankKey = isDefacto ? filterValue.replace('_defacto', '') : filterValue;
    if (!titleTypeConfig[rankKey]) return null;
    return { rankKey, mode: isDefacto ? 'defacto' : 'dejure' };
  }

  function buildPathTooltip(items, formatter, emptyLabel) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return emptyLabel || '';
    return list.map(formatter).join(' → ');
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
    selectedTitle = null;
    if (infoPanel) infoPanel.style.display = 'none';
    if (seaInfoPanel) seaInfoPanel.style.display = 'none';
    hideTradeRoutePanel();
    seigneurInfoPanel.style.display = 'block';
    if (seigneurInfoTitle) seigneurInfoTitle.textContent = seigneur.name;
    if (seigneurInfoIdentity) setLine(seigneurInfoIdentity, '');
    const religionName = seigneur.religion_id ? (religionMap[seigneur.religion_id]?.name || '') : '';
    setLabeledLine(seigneurInfoReligion, 'Religion:', religionName);
    setSeigneurLine(seigneurOverlordLine, seigneur.overlord_id, 'Suzerain:');

    const titles = [];
    (seigneurToEmpire[seigneurId] || []).forEach(empireId => {
      if (empireId && empireMap[empireId]) titles.push({ rankKey: 'empire', id: empireId, mode: 'dejure' });
    });
    (seigneurToKingdom[seigneurId] || []).forEach(kingdomId => {
      if (kingdomId && kingdomMap[kingdomId]) titles.push({ rankKey: 'kingdom', id: kingdomId, mode: 'dejure' });
    });
    (seigneurToArchduchy[seigneurId] || []).forEach(archduchyId => {
      if (archduchyId && archduchyMap[archduchyId]) titles.push({ rankKey: 'archduchy', id: archduchyId, mode: 'dejure' });
    });
    (seigneurToDuchy[seigneurId] || []).forEach(duchyId => {
      if (duchyId && duchyMap[duchyId]) titles.push({ rankKey: 'duchy', id: duchyId, mode: 'dejure' });
    });
    (seigneurToMarquisate[seigneurId] || []).forEach(marquisateId => {
      if (marquisateId && marquisateMap[marquisateId]) titles.push({ rankKey: 'marquisate', id: marquisateId, mode: 'dejure' });
    });
    (seigneurToCounty[seigneurId] || []).forEach(countyId => {
      if (countyId && countyMap[countyId]) titles.push({ rankKey: 'county', id: countyId, mode: 'dejure' });
    });
    (seigneurToViscounty[seigneurId] || []).forEach(viscountyId => {
      if (viscountyId && viscountyMap[viscountyId]) titles.push({ rankKey: 'viscounty', id: viscountyId, mode: 'dejure' });
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

  function hideTradeRoutePanel() {
    if (tradeRoutePanel) tradeRoutePanel.style.display = 'none';
  }

  function attachSearchBar() {
    if (!window.SeigneurSearch || !mapSearchOverlay) return;
    const { wrapper, input, results } = window.SeigneurSearch.createSearchElements({
      inputId: 'mapSearchInput',
      resultsId: 'mapSearchResults',
      placeholder: 'Rechercher',
      ariaLabel: 'Rechercher',
      resultsAriaLabel: 'Résultats de recherche des seigneurs et titres'
    });
    searchInput = input;

    mapSearchOverlay.appendChild(wrapper);

    searchController = window.SeigneurSearch.attachSearch({
      input,
      results,
      getEntries: () => searchEntries,
      emptyMessage: 'Aucun seigneur ou titre trouvé.',
      onSelect: (match) => {
        if (match.baronyId) {
          showBaronyDetails(match.baronyId);
          return;
        }
        if (match.titleRankKey && match.titleId) {
          showTitleInfo(match.titleRankKey, match.titleId, match.titleMode || 'dejure');
          return;
        }
        const targetId = match.seigneurId || match.id;
        if (targetId) showSeigneurInfo(targetId);
      }
    });
  }

  function updateSearchEntries() {
    if (!window.SeigneurSearch) return;
    const entries = Object.values(seigneurMap).map((seigneur) => ({
      id: seigneur.id,
      seigneurId: seigneur.id,
      name: seigneur.name || '',
      displayName: seigneur.name || '',
      sortName: seigneur.name || ''
    }));

    const titleConfigs = [
      { key: 'empire', label: 'Empire', map: empireMap },
      { key: 'kingdom', label: 'Royaume', map: kingdomMap },
      { key: 'archduchy', label: 'Archiduché', map: archduchyMap },
      { key: 'duchy', label: 'Duché', map: duchyMap },
      { key: 'marquisate', label: 'Marquisat', map: marquisateMap },
      { key: 'county', label: 'Comté', map: countyMap },
      { key: 'viscounty', label: 'Vicomté', map: viscountyMap }
    ];

    titleConfigs.forEach(({ key, label, map }) => {
      Object.values(map).forEach((title) => {
        if (!title.seigneur_id || !title.name) return;
        const seigneurName = seigneurMap[title.seigneur_id]?.name || 'Seigneur inconnu';
        const display = `${label} ${title.name}`.trim();
        entries.push({
          id: `${key}-${title.id}`,
          seigneurId: title.seigneur_id,
          titleRankKey: key,
          titleId: title.id,
          titleMode: 'dejure',
          name: display,
          displayName: `${display} — ${seigneurName}`,
          sortName: display
        });
      });
    });

    const baronyEntries = Object.values(baronyLookup);
    const fallbackBaronies = mapMode === 'land' && baronyEntries.length === 0
      ? Object.values(baronyMeta)
      : [];
    [...baronyEntries, ...fallbackBaronies].forEach((barony) => {
      if (!barony || !barony.id || !barony.name) return;
      const seigneurName = barony.seigneur_id ? (seigneurMap[barony.seigneur_id]?.name || '') : '';
      const label = `Baronnie de ${barony.name} (#${barony.id})`;
      const displayName = seigneurName ? `${label} — ${seigneurName}` : label;
      entries.push({
        id: `barony-${barony.id}`,
        baronyId: barony.id,
        name: `${barony.name} ${label}`,
        displayName,
        sortName: label
      });
    });

    searchEntries = window.SeigneurSearch.prepareEntries(entries);
    if (searchController && typeof searchController.renderResults === 'function') {
      searchController.renderResults(searchInput ? searchInput.value : '');
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
        const matches = raw.match(/-?\d+/g);
        return matches ? matches.map(val => parseInt(val, 10)).filter(Number.isFinite) : [];
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

  function buildTradeLineMaps(lines) {
    tradeLineConnections = {};
    tradeLineById = {};
    tradeLinesByBarony = {};
    const connectionSets = {};
    lines.forEach(line => {
      const id = parseInt(line.id, 10);
      const barony1 = parseInt(line.barony_id_1, 10);
      const barony2 = parseInt(line.barony_id_2, 10);
      if (!id || !barony1 || !barony2) return;
      const path = parseTradeRoutePath(line.path);
      const normalized = { ...line, id, barony_id_1: barony1, barony_id_2: barony2, path };
      tradeLineById[id] = normalized;
      if (!tradeLinesByBarony[barony1]) tradeLinesByBarony[barony1] = [];
      if (!tradeLinesByBarony[barony2]) tradeLinesByBarony[barony2] = [];
      tradeLinesByBarony[barony1].push(id);
      tradeLinesByBarony[barony2].push(id);
      if (!connectionSets[barony1]) connectionSets[barony1] = new Set();
      if (!connectionSets[barony2]) connectionSets[barony2] = new Set();
      connectionSets[barony1].add(barony2);
      connectionSets[barony2].add(barony1);
    });
    Object.keys(connectionSets).forEach(id => {
      tradeLineConnections[id] = Array.from(connectionSets[id]);
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
      const otherName = baronyMeta[otherId]?.name || baronyLookup[otherId]?.name;
      const otherLabel = otherName ? `${otherName} (#${otherId})` : `Baronnie #${otherId}`;
      const pathLength = route.path ? route.path.length : 0;
      return `
        <tr>
          <td><button class="control-btn trade-route-btn" data-id="${routeId}">#${routeId}</button></td>
          <td>${otherLabel}</td>
          <td class="trade-route-path" data-route-id="${routeId}">${pathLength}</td>
        </tr>
      `;
    }).join('');
    tradeRoutesList.innerHTML = `<table class="admin-table trade-table"><tr><th>ID</th><th>Destination</th><th>Chemin</th></tr>${rows}</table>`;
    tradeRoutesList.querySelectorAll('.trade-route-path').forEach(cell => {
      const routeId = parseInt(cell.dataset.routeId, 10);
      const route = tradeRouteById[routeId];
      cell.title = buildPathTooltip(route?.path, createBaronyLabel, 'Trajet direct.');
    });
    tradeRoutesList.querySelectorAll('.trade-route-btn').forEach(btn => {
      btn.addEventListener('click', () => openTradeRouteInfo(parseInt(btn.dataset.id, 10)));
    });
  }

  function renderTradeLinesList(baronyId) {
    if (!tradeLinesList || !tradeRoutesSection) return;
    tradeLinesList.innerHTML = '';
    const lineIds = tradeLinesByBarony[baronyId] || [];
    if (!lineIds.length) {
      tradeLinesList.textContent = 'Aucune ligne commerciale';
      return;
    }
    const rows = lineIds.map(lineId => {
      const line = tradeLineById[lineId];
      const otherId = line.barony_id_1 === baronyId ? line.barony_id_2 : line.barony_id_1;
      const otherName = baronyMeta[otherId]?.name || baronyLookup[otherId]?.name;
      const otherLabel = otherName ? `${otherName} (#${otherId})` : `Baronnie #${otherId}`;
      const pathLength = line.path ? line.path.length : 0;
      return `
        <tr>
          <td><button class="control-btn trade-line-btn" data-id="${lineId}">#${lineId}</button></td>
          <td>${otherLabel}</td>
          <td class="trade-line-path" data-line-id="${lineId}">${pathLength}</td>
        </tr>
      `;
    }).join('');
    tradeLinesList.innerHTML = `<table class="admin-table trade-table"><tr><th>ID</th><th>Destination</th><th>Chemin</th></tr>${rows}</table>`;
    tradeLinesList.querySelectorAll('.trade-line-path').forEach(cell => {
      const lineId = parseInt(cell.dataset.lineId, 10);
      const line = tradeLineById[lineId];
      cell.title = buildPathTooltip(line?.path, createZoneLabel, 'Trajet direct.');
    });
    tradeLinesList.querySelectorAll('.trade-line-btn').forEach(btn => {
      btn.addEventListener('click', () => openTradeLineInfo(parseInt(btn.dataset.id, 10)));
    });
  }

  function renderTradeRoutePathList(list, items, options = {}) {
    if (!list) return;
    const { emptyLabel, asBaronies } = options;
    list.innerHTML = '';
    if (!items || items.length === 0) {
      if (emptyLabel) {
        const li = document.createElement('li');
        li.textContent = emptyLabel;
        list.appendChild(li);
      }
      return;
    }
    items.forEach(id => {
      const li = document.createElement('li');
      if (asBaronies) {
        li.appendChild(createBaronyButton(id));
      } else {
        li.textContent = createZoneLabel(id);
      }
      list.appendChild(li);
    });
  }

  function getTradeRouteIntermediates(route) {
    const path = Array.isArray(route?.path) ? route.path : [];
    if (!path.length) return [];
    const startId = route.barony_id_1;
    const endId = route.barony_id_2;
    const startsMatch = path[0] === startId && path[path.length - 1] === endId;
    const endsMatch = path[0] === endId && path[path.length - 1] === startId;
    if (startsMatch || endsMatch) {
      return path.slice(1, -1);
    }
    return path;
  }

  function openTradeRouteInfo(routeId) {
    if (!routeId || !tradeRoutePanel) return;
    const route = tradeRouteById[routeId];
    if (!route) return;
    selectedTitle = null;
    if (core && typeof core.selectBarony === 'function') {
      suppressTradeRoutePanelHide = true;
      core.selectBarony(null);
      suppressTradeRoutePanelHide = false;
    }
    if (infoPanel) infoPanel.style.display = 'none';
    if (seaInfoPanel) seaInfoPanel.style.display = 'none';
    hideSeigneurInfo();
    tradeRoutePanel.style.display = 'block';
    if (tradeRoutePanelTitle) tradeRoutePanelTitle.textContent = `Route commerciale #${route.id}`;
    if (tradeRouteConnectedSection) tradeRouteConnectedSection.style.display = 'block';
    renderTradeRoutePathList(tradeRouteConnectedList, [route.barony_id_1, route.barony_id_2], {
      asBaronies: true
    });
    if (tradeRoutePathSection) tradeRoutePathSection.style.display = 'block';
    const intermediates = getTradeRouteIntermediates(route);
    renderTradeRoutePathList(tradeRoutePathList, intermediates, {
      emptyLabel: 'Trajet direct.',
      asBaronies: true
    });
    selectedTradeRouteId = routeId;
    selectedTradeLineId = null;
    if (filterManager && typeof filterManager.setTradeRouteSelection === 'function') {
      filterManager.setTradeRouteSelection(routeId);
    }
    if (filterManager && typeof filterManager.setTradeLineSelection === 'function') {
      filterManager.setTradeLineSelection(null);
    }
    if (filterManager && filterSelect && filterSelect.value === 'trade_routes') {
      filterManager.applyFilter('trade_routes');
    }
  }

  function createZoneLabel(zoneId) {
    const zone = maritimeZoneMap[zoneId];
    const name = zone?.name || `Zone #${zoneId}`;
    return `${name} (#${zoneId})`;
  }

  async function ensureMaritimeZonePixels(zoneIds) {
    const missing = zoneIds.filter(id => id && !maritimeZonePixels[id]);
    if (!missing.length) return;
    await Promise.all(missing.map(async id => {
      try {
        const data = await fetch(`${API_BASE}/api/maritime_zone_pixels?id=${id}`).then(r => r.json());
        maritimeZonePixels[id] = Array.isArray(data) ? data : [];
      } catch (err) {
        console.warn(`Impossible de charger les pixels de la zone maritime ${id}`, err);
        maritimeZonePixels[id] = [];
      }
    }));
  }

  function openTradeLineInfo(lineId) {
    if (!lineId || !tradeRoutePanel) return;
    const line = tradeLineById[lineId];
    if (!line) return;
    selectedTitle = null;
    if (core && typeof core.selectBarony === 'function') {
      suppressTradeRoutePanelHide = true;
      core.selectBarony(null);
      suppressTradeRoutePanelHide = false;
    }
    if (infoPanel) infoPanel.style.display = 'none';
    if (seaInfoPanel) seaInfoPanel.style.display = 'none';
    hideSeigneurInfo();
    tradeRoutePanel.style.display = 'block';
    if (tradeRoutePanelTitle) tradeRoutePanelTitle.textContent = `Ligne commerciale #${line.id}`;
    if (tradeRouteConnectedSection) tradeRouteConnectedSection.style.display = 'block';
    renderTradeRoutePathList(tradeRouteConnectedList, [line.barony_id_1, line.barony_id_2], {
      asBaronies: true
    });
    if (tradeRoutePathSection) tradeRoutePathSection.style.display = 'block';
    renderTradeRoutePathList(tradeRoutePathList, line.path || [], {
      emptyLabel: 'Trajet direct.',
      asBaronies: false
    });
    selectedTradeLineId = lineId;
    selectedTradeRouteId = null;
    if (filterManager && typeof filterManager.setTradeRouteSelection === 'function') {
      filterManager.setTradeRouteSelection(null);
    }
    if (filterManager && typeof filterManager.setTradeLineSelection === 'function') {
      filterManager.setTradeLineSelection(lineId);
    }
    ensureMaritimeZonePixels(line.path || []).then(() => {
      if (core && typeof core.drawAll === 'function') core.drawAll();
    });
    if (filterManager && filterSelect && filterSelect.value === 'trade_routes') {
      filterManager.applyFilter('trade_routes');
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
    titles.forEach(title => {
      if (!title || !title.rankKey || !title.id) return;
      const li = document.createElement('li');
      const cfg = titleTypeConfig[title.rankKey];
      if (cfg?.prefix) {
        li.appendChild(document.createTextNode(`${cfg.prefix} `));
      }
      li.appendChild(createTitleButton(title.rankKey, title.id, { mode: title.mode || 'dejure' }));
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

  function getBaronyTitleId(baronyInfo, rankKey, mode = 'dejure') {
    if (!baronyInfo) return null;
    if (mode === 'defacto') return resolveDefactoTitle(baronyInfo, rankKey);
    if (rankKey === 'viscounty') return baronyInfo.viscounty_id;
    if (rankKey === 'county') return baronyInfo.county_id;
    const county = countyMap[baronyInfo.county_id];
    if (rankKey === 'marquisate') return county?.marquisate_id || null;
    if (rankKey === 'duchy') return county?.duchy_id || null;
    const duchy = county ? duchyMap[county.duchy_id] : null;
    if (rankKey === 'archduchy') return duchy?.archduchy_id || null;
    if (rankKey === 'kingdom') return duchy?.kingdom_id || null;
    const kingdom = duchy ? kingdomMap[duchy.kingdom_id] : null;
    if (rankKey === 'empire') return kingdom?.empire_id || null;
    return null;
  }

  function getBaroniesForTitle(rankKey, titleId, mode = 'dejure') {
    return Object.values(baronyMeta)
      .filter(info => String(getBaronyTitleId(info, rankKey, mode) || '') === String(titleId))
      .map(info => info.id);
  }

  function getImmediateSubtitles(rankKey, titleId, mode = 'dejure') {
    const childRank = dejureSubtitleRankMap[rankKey];
    if (!childRank) return [];
    const ids = new Set();
    getBaroniesForTitle(rankKey, titleId, mode).forEach(baronyId => {
      const childId = getBaronyTitleId(baronyMeta[baronyId], childRank, mode);
      if (childId) ids.add(childId);
    });
    return [...ids]
      .map(id => ({ rankKey: childRank, id }))
      .sort((a, b) => {
        const aName = getTitleMap(a.rankKey)[a.id]?.name || '';
        const bName = getTitleMap(b.rankKey)[b.id]?.name || '';
        return aName.localeCompare(bName, 'fr');
      });
  }

  function setTitleHierarchyTable(section, tbody, rankKey, titleInfo, mode) {
    if (!section || !tbody) return;
    tbody.innerHTML = '';
    const currentIndex = titleHierarchy.indexOf(rankKey);
    if (currentIndex < 0 || !titleInfo) {
      section.style.display = 'none';
      return;
    }
    const sampleBaronyId = getBaroniesForTitle(rankKey, titleInfo.id, mode)[0];
    const sampleBarony = sampleBaronyId ? baronyMeta[sampleBaronyId] : null;
    if (!sampleBarony) {
      section.style.display = 'none';
      return;
    }

    const rows = [];
    for (let i = currentIndex + 1; i < titleHierarchy.length; i++) {
      const parentRank = titleHierarchy[i];
      const dejureId = getBaronyTitleId(sampleBarony, parentRank, 'dejure');
      const defactoId = getBaronyTitleId(sampleBarony, parentRank, 'defacto');
      if (!dejureId && !defactoId) continue;
      rows.push({ rankKey: parentRank, dejureId, defactoId });
    }

    const hasDejureData = rows.some(row => row.dejureId);
    if (infoFeudalTable) {
      infoFeudalTable.classList.toggle('hide-dejure-column', !hasDejureData);
    }

    if (!rows.length) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    rows.reverse().forEach(row => {
      const tr = document.createElement('tr');
      const levelCell = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = titleTypeConfig[row.rankKey].label;
      levelCell.appendChild(strong);
      const dejureCell = document.createElement('td');
      if (row.dejureId) {
        dejureCell.appendChild(createTitleButton(row.rankKey, row.dejureId, { mode: 'dejure' }));
      }
      const defactoCell = document.createElement('td');
      if (row.defactoId) {
        defactoCell.appendChild(createTitleButton(row.rankKey, row.defactoId, { mode: 'defacto' }));
      }
      tr.appendChild(levelCell);
      tr.appendChild(dejureCell);
      tr.appendChild(defactoCell);
      tbody.appendChild(tr);
    });
  }

  function syncTitleSelectionHighlight() {
    if (!core || typeof core.setSelectedBaronies !== 'function') return;
    if (!selectedTitle) return;
    const activeTitleFilter = getTitleFilterInfo(filterSelect?.value);
    if (activeTitleFilter && activeTitleFilter.rankKey === selectedTitle.rankKey) {
      core.setSelectedBaronies(getBaroniesForTitle(selectedTitle.rankKey, selectedTitle.id, activeTitleFilter.mode));
      return;
    }
    core.setSelectedBaronies([]);
  }

  function showTitleInfo(rankKey, titleId, mode = 'dejure') {
    const titleInfo = getTitleMap(rankKey)[titleId];
    if (!titleInfo || !infoPanel) return;
    selectedTitle = { rankKey, id: titleId, mode };
    hideSeigneurInfo();
    hideTradeRoutePanel();
    if (seaInfoPanel) seaInfoPanel.style.display = 'none';
    infoPanel.style.display = 'block';
    const rankLabel = titleTypeConfig[rankKey]?.label || 'Titre';
    if (baronyTitle) baronyTitle.textContent = `${rankLabel}: ${titleInfo.name || ''} (#${titleInfo.id || ''})`;
    setSeigneurLine(infoOwnerLine, titleInfo.seigneur_id, 'Détenteur:');
    if (infoReligionLine) infoReligionLine.style.display = 'none';
    if (infoCultureLine) infoCultureLine.style.display = 'none';
    if (tradeRoutesSection) tradeRoutesSection.style.display = 'none';
    if (religiousSection) religiousSection.style.display = 'none';
    if (canonicalOwnedSection) canonicalOwnedSection.style.display = 'none';
    if (canonicalParentSection) canonicalParentSection.style.display = 'none';
    setTitleHierarchyTable(feudalSection, infoFeudalBody, rankKey, titleInfo, mode);

    if (titleSubtitlesSection && titleSubtitlesList) {
      titleSubtitlesList.innerHTML = '';
      const subtitles = getImmediateSubtitles(rankKey, titleId, mode);
      if (subtitles.length > 0) {
        titleSubtitlesSection.style.display = 'block';
        subtitles.forEach(item => {
          const li = document.createElement('li');
          const childLabel = titleTypeConfig[item.rankKey]?.label || 'Titre';
          li.appendChild(document.createTextNode(`${childLabel} de `));
          li.appendChild(createTitleButton(item.rankKey, item.id, { mode }));
          titleSubtitlesList.appendChild(li);
        });
      } else {
        titleSubtitlesSection.style.display = 'none';
      }
    }
    syncTitleSelectionHighlight();
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
  const cultureRankConfig = [
    { key: 'barony', label: 'Baron', plural: 'Barons', points: 0.005 },
    { key: 'viscounty', label: 'Vicomte', plural: 'Vicomtes', points: 0.0075 },
    { key: 'county', label: 'Comte', plural: 'Comtes', points: 0.01 },
    { key: 'marquisate', label: 'Marquis', plural: 'Marquis', points: 0.015 },
    { key: 'duchy', label: 'Duc', plural: 'Ducs', points: 0.025 },
    { key: 'archduchy', label: 'Archiduc', plural: 'Archiducs', points: 0.035 },
    { key: 'kingdom', label: 'Roi', plural: 'Rois', points: 0.045 },
    { key: 'empire', label: 'Empereur', plural: 'Empereurs', points: 0.055 }
  ];
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

  function getSeigneurRankKey(seigneurId) {
    const highestIndex = getHighestRankIndex(seigneurId);
    return highestIndex >= 1 ? rankSequence[highestIndex] : 'barony';
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
    } else if (rankKey === 'viscounty') {
      if (info.defacto_county_id) overrides.push({ rankKey: 'county', id: info.defacto_county_id });
    } else if (rankKey === 'county') {
      if (info.defacto_marquisate_id) overrides.push({ rankKey: 'marquisate', id: info.defacto_marquisate_id });
      if (info.defacto_duchy_id) overrides.push({ rankKey: 'duchy', id: info.defacto_duchy_id });
    } else if (rankKey === 'marquisate') {
      if (info.defacto_duchy_id) overrides.push({ rankKey: 'duchy', id: info.defacto_duchy_id });
    } else if (rankKey === 'duchy') {
      if (info.defacto_archduchy_id) overrides.push({ rankKey: 'archduchy', id: info.defacto_archduchy_id });
      if (info.defacto_kingdom_id) overrides.push({ rankKey: 'kingdom', id: info.defacto_kingdom_id });
    } else if (rankKey === 'archduchy') {
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

  function formatPoints(value) {
    if (Number.isInteger(value)) return `${value}`;
    return value.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
  }

  function formatPointsNoDecimals(value) {
    return `${Math.floor(value)}`;
  }

  function buildCultureTooltipRows(stat) {
    const rows = [];
    const baronyLabel = stat.baronyCount > 1 ? 'baronnies' : 'baronnie';
    rows.push({
      label: `${stat.baronyCount} ${baronyLabel}`,
      points: `+${formatPoints(stat.baronyCount)}`
    });
    for (let i = cultureRankConfig.length - 1; i >= 0; i--) {
      const cfg = cultureRankConfig[i];
      const count = stat.rankCounts[cfg.key] || 0;
      if (!count) continue;
      const label = count > 1 ? cfg.plural : cfg.label;
      rows.push({
        label: `${count} ${label}`,
        points: `+${formatPoints(count * cfg.points)}`
      });
    }
    return rows;
  }

  function clearCultureFloatingTooltips() {
    document.querySelectorAll('.tooltip-floating').forEach(node => node.remove());
  }

  function attachCultureFloatingTooltip(trigger, rows) {
    if (!rows.length) return;
    const tooltipTable = document.createElement('table');
    tooltipTable.className = 'tooltip-table tooltip-floating';
    rows.forEach(entry => {
      const tooltipRow = document.createElement('tr');
      const labelCell = document.createElement('td');
      labelCell.textContent = entry.label;
      const pointsCell = document.createElement('td');
      pointsCell.textContent = entry.points;
      tooltipRow.appendChild(labelCell);
      tooltipRow.appendChild(pointsCell);
      tooltipTable.appendChild(tooltipRow);
    });
    document.body.appendChild(tooltipTable);

    const positionTooltip = () => {
      tooltipTable.style.display = 'table';
      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltipTable.getBoundingClientRect();
      const padding = 8;
      const top = triggerRect.bottom + 6;
      let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
      left = Math.min(Math.max(left, padding), window.innerWidth - tooltipRect.width - padding);
      const maxTop = window.innerHeight - tooltipRect.height - padding;
      tooltipTable.style.top = `${Math.min(top, maxTop)}px`;
      tooltipTable.style.left = `${left}px`;
    };

    const hideTooltip = () => {
      tooltipTable.style.display = 'none';
    };

    trigger.addEventListener('mouseenter', positionTooltip);
    trigger.addEventListener('focus', positionTooltip);
    trigger.addEventListener('mouseleave', hideTooltip);
    trigger.addEventListener('blur', hideTooltip);
    window.addEventListener('scroll', hideTooltip, true);
  }

  function updateCultureRankingPanel() {
    if (!cultureRankingPanel || !cultureRankingBody) return;
    const shouldShow = mapMode === 'land' && filterSelect && filterSelect.value === 'culture';
    if (!shouldShow) {
      cultureRankingPanel.style.display = 'none';
      cultureRankingBody.innerHTML = '';
      return;
    }
    clearCultureFloatingTooltips();
    const stats = {};
    Object.values(baronyMeta).forEach(info => {
      const cultureInfo = info ? cultureMapInfo[info.culture_id] : null;
      if (!info || !info.culture_id || !cultureInfo) return;
      const key = String(info.culture_id);
      if (!stats[key]) {
        stats[key] = {
          cultureId: info.culture_id,
          baronyCount: 0,
          seigneurIds: new Set(),
          rankCounts: {}
        };
      }
      stats[key].baronyCount += 1;
      if (!isVacantBarony(info) && info.seigneur_id) {
        stats[key].seigneurIds.add(String(info.seigneur_id));
      }
    });
    const rows = Object.values(stats).map(stat => {
      stat.rankCounts = {};
      stat.seigneurIds.forEach(seigneurId => {
        const rankKey = getSeigneurRankKey(seigneurId);
        stat.rankCounts[rankKey] = (stat.rankCounts[rankKey] || 0) + 1;
      });
      let points = stat.baronyCount;
      cultureRankConfig.forEach(cfg => {
        const count = stat.rankCounts[cfg.key] || 0;
        points += count * cfg.points;
      });
      stat.points = points;
      stat.name = cultureMapInfo[stat.cultureId]?.name || `Culture #${stat.cultureId}`;
      stat.tooltipRows = buildCultureTooltipRows(stat);
      return stat;
    }).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.name.localeCompare(b.name, 'fr');
    });
    cultureRankingBody.innerHTML = '';
    if (!rows.length) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 2;
      emptyCell.textContent = 'Aucune donnée';
      emptyRow.appendChild(emptyCell);
      cultureRankingBody.appendChild(emptyRow);
      cultureRankingPanel.style.display = 'block';
      return;
    }
    rows.forEach(stat => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = stat.name;
      const pointsCell = document.createElement('td');
      const tooltipSpan = document.createElement('span');
      tooltipSpan.className = 'tooltip';
      tooltipSpan.textContent = formatPointsNoDecimals(stat.points);
      attachCultureFloatingTooltip(tooltipSpan, stat.tooltipRows);
      pointsCell.appendChild(tooltipSpan);
      row.appendChild(nameCell);
      row.appendChild(pointsCell);
      cultureRankingBody.appendChild(row);
    });
    cultureRankingPanel.style.display = 'block';
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
    if (infoFeudalTable) infoFeudalTable.classList.remove('hide-dejure-column');
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
        rankKey: 'viscounty',
        level: 'Vicomté',
        dejureId: viscounty?.id || null,
        defactoId: resolveDefactoTitle(info, 'viscounty')
      },
      county: {
        rankKey: 'county',
        level: 'Comté',
        dejureId: county?.id || null,
        defactoId: resolveDefactoTitle(info, 'county')
      },
      marquisate: {
        rankKey: 'marquisate',
        level: 'Marquisat',
        dejureId: marquisate?.id || null,
        defactoId: resolveDefactoTitle(info, 'marquisate')
      },
      duchy: {
        rankKey: 'duchy',
        level: 'Duché',
        dejureId: duchy?.id || null,
        defactoId: resolveDefactoTitle(info, 'duchy')
      },
      archduchy: {
        rankKey: 'archduchy',
        level: 'Archiduché',
        dejureId: archduchy?.id || null,
        defactoId: resolveDefactoTitle(info, 'archduchy')
      },
      kingdom: {
        rankKey: 'kingdom',
        level: 'Royaume',
        dejureId: kingdom?.id || null,
        defactoId: resolveDefactoTitle(info, 'kingdom')
      },
      empire: {
        rankKey: 'empire',
        level: 'Empire',
        dejureId: empire?.id || null,
        defactoId: resolveDefactoTitle(info, 'empire')
      }
    };

    const order = ['kingdom', 'empire', 'archduchy', 'duchy', 'marquisate', 'county', 'viscounty'];
    const filteredRows = order
      .map(key => rows[key])
      .filter(row => row && (row.dejureId || row.defactoId));

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
      if (row.dejureId) dejureCell.appendChild(createTitleButton(row.rankKey, row.dejureId, { mode: 'dejure' }));
      const defactoCell = document.createElement('td');
      if (row.defactoId) defactoCell.appendChild(createTitleButton(row.rankKey, row.defactoId, { mode: 'defacto' }));
      tr.appendChild(levelCell);
      tr.appendChild(dejureCell);
      tr.appendChild(defactoCell);
      tbody.appendChild(tr);
    });
  }

  const landFiltersBase = [
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
    { value: 'empire_defacto', label: 'Empire de facto' }
  ];
  const landFiltersTail = [
    { value: 'distance', label: 'Distance' },
    { value: 'occupation', label: 'Occupation' }
  ];
  const seaFilters = [
    { value: '', label: 'Aucun' },
    { value: 'distance', label: 'Distance' },
    { value: 'baronies', label: 'Baronnies liées' }
  ];
  let handleFilterChange = null;
  function getLandFilters() {
    const filters = [...landFiltersBase];
    filters.push({ value: 'trade_routes', label: 'Routes commerciales' });
    return filters.concat(landFiltersTail);
  }
  function populateFilters() {
    if (!filterSelect) return;
    const filters = mapMode === 'sea' ? seaFilters : getLandFilters();
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
    if (mapMode === 'sea') {
      if (!filterSelect || filterSelect.value !== 'baronies') return;
      const zoneId = core?.currentSelectedId;
      if (!zoneId) return;
      ctx.fillStyle = 'rgba(0,0,255,0.4)';
      (maritimeZoneBaronies[zoneId] || []).forEach(bid => {
        (baronyPixels[bid] || []).forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
      });
      return;
    }
    if (selectedTradeLineId && tradeLineById[selectedTradeLineId]) {
      ctx.fillStyle = 'rgba(255, 159, 67, 0.45)';
      const path = tradeLineById[selectedTradeLineId].path || [];
      path.forEach(zoneId => {
        (maritimeZonePixels[zoneId] || []).forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
      });
    }
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
          } else if (applyToCore && !core) {
            pendingPixelData = target;
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
          } else if (applyToCore && !core) {
            pendingPixelData = target;
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
    selectedTitle = null;
    hideSeigneurInfo();
    if (!suppressTradeRoutePanelHide) {
      hideTradeRoutePanel();
    }
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
    const titleFilter = getTitleFilterInfo(filterSelect?.value);
    if (titleFilter) {
      const titleId = getBaronyTitleId(info, titleFilter.rankKey, titleFilter.mode);
      if (titleId) {
        showTitleInfo(titleFilter.rankKey, titleId, titleFilter.mode);
        return;
      }
    }
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
      selectedTradeLineId = null;
      if (filterManager && typeof filterManager.setTradeRouteSelection === 'function') {
        filterManager.setTradeRouteSelection(null);
      }
      if (filterManager && typeof filterManager.setTradeLineSelection === 'function') {
        filterManager.setTradeLineSelection(null);
      }
      setTradeRouteInfoMode(true);
      renderTradeRoutesList(info.id);
      renderTradeLinesList(info.id);
      if (filterManager) filterManager.applyFilter('trade_routes');
      return;
    }
    setTradeRouteInfoMode(false);
    if (titleSubtitlesSection) titleSubtitlesSection.style.display = 'none';
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
    if (core && typeof core.setSelectedBaronies === 'function') {
      core.setSelectedBaronies(id ? [id] : []);
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
      updateSearchEntries();
      return mapData;
    }
    let [baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, connections, routes, lines, maritimeZones] = await Promise.all([
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
      fetch(API_BASE + '/api/trade_routes').then(r => r.json()),
      fetch(API_BASE + '/api/trade_lines').then(r => r.json()),
      fetch(API_BASE + '/api/maritime_zones').then(r => r.json())
    ]);
    if (!Array.isArray(baronies) || baronies.length === 0) {
      try {
        const organigrammes = await fetch(API_BASE + '/api/organigrammes').then(r => r.json());
        const fallbackBaronies = organigrammes?.titles?.baronies;
        if (Array.isArray(fallbackBaronies) && fallbackBaronies.length > 0) {
          baronies = fallbackBaronies;
        }
      } catch (err) {
        console.warn('Impossible de récupérer les baronnies depuis l’organigramme.', err);
      }
    }
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
    tradeLines = Array.isArray(lines) ? lines : [];
    buildTradeLineMaps(tradeLines);
    maritimeZoneMap = {};
    (maritimeZones || []).forEach(zone => {
      maritimeZoneMap[zone.id] = zone;
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
      tradeRouteConnections,
      tradeRouteById,
      tradeLineConnections,
      tradeLineById,
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
    updateSearchEntries();
    return mapData;
  }

  document.addEventListener('DOMContentLoaded', () => {
    attachSearchBar();
    const baseMapLoaded = baseMap.complete ? Promise.resolve() : new Promise(res => (baseMap.onload = res));
    baseMapLoaded.then(() => {
      mapWidth = baseMap.naturalWidth;
      mapHeight = baseMap.naturalHeight;
      baseMap.style.width = mapWidth + 'px';
      baseMap.style.height = mapHeight + 'px';
      if (idOverlayMap) {
        idOverlayMap.style.width = mapWidth + 'px';
        idOverlayMap.style.height = mapHeight + 'px';
      }
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
        if (pendingPixelData && typeof core.setPixelData === 'function') {
          core.setPixelData(pendingPixelData);
          pendingPixelData = null;
        }
        if (filterSelect) {
          handleFilterChange = () => {
            const activeTitleFilter = getTitleFilterInfo(filterSelect.value);
            if (filterSelect.value !== 'trade_routes') {
              selectedTradeRouteId = null;
              selectedTradeLineId = null;
              if (filterManager && typeof filterManager.setTradeRouteSelection === 'function') {
                filterManager.setTradeRouteSelection(null);
              }
              if (filterManager && typeof filterManager.setTradeLineSelection === 'function') {
                filterManager.setTradeLineSelection(null);
              }
              setTradeRouteInfoMode(false);
              hideTradeRoutePanel();
              if (activeTitleFilter && selectedTitle && selectedTitle.rankKey === activeTitleFilter.rankKey) {
                showTitleInfo(selectedTitle.rankKey, selectedTitle.id, activeTitleFilter.mode);
              } else if (selectedTitle) {
                if (infoPanel) infoPanel.style.display = 'block';
                if (core && typeof core.setSelectedBaronies === 'function') {
                  core.setSelectedBaronies([]);
                }
              } else {
                if (infoPanel) infoPanel.style.display = core?.currentSelectedId ? 'block' : 'none';
                if (core && typeof core.setSelectedBaronies === 'function') {
                  core.setSelectedBaronies(core?.currentSelectedId ? [core.currentSelectedId] : []);
                }
              }
            } else if (core.currentSelectedId) {
              setTradeRouteInfoMode(true);
              renderTradeRoutesList(core.currentSelectedId);
              renderTradeLinesList(core.currentSelectedId);
              hideTradeRoutePanel();
            } else if (selectedTradeRouteId || selectedTradeLineId) {
              setTradeRouteInfoMode(false);
              if (infoPanel) infoPanel.style.display = 'none';
              if (tradeRoutePanel) tradeRoutePanel.style.display = 'block';
            }
            filterManager.applyFilter(filterSelect.value);
            if (selectedTitle) {
              syncTitleSelectionHighlight();
            }
            updateCultureRankingPanel();
          };
          filterSelect.addEventListener('change', handleFilterChange);
          handleFilterChange();
        }
        if (randomBtn) randomBtn.addEventListener('click', () => filterManager.randomizeColors());
      });
    });
  });
})();
