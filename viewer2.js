(() => {
  const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';
  const params = new URLSearchParams(location.search);
  const mapMode = params.get('mode') === 'sea' ? 'sea' : 'land';
  const PIXEL_CHUNK_SIZE = 15;
  const MAX_PIXEL_REQUESTS = 3;

  let mapWidth = 0;
  let mapHeight = 0;
  const terrainColor = mapCore2.terrainColor;
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
  const infoDuchyPietyTable = document.getElementById('infoDuchyPietyTable');
  const infoDuchyPietyBody = document.getElementById('infoDuchyPietyBody');
  const religiousSection = document.getElementById('religiousBuildingsSection');
  const infoReligiousList = document.getElementById('infoReligiousList');
  const canonicalOwnedSection = document.getElementById('canonicalOwnedSection');
  const canonicalOwnedList = document.getElementById('canonicalOwnedList');
  const canonicalParentSection = document.getElementById('canonicalParentSection');
  const canonicalParentList = document.getElementById('canonicalParentList');
  const titleSubtitlesSection = document.getElementById('titleSubtitlesSection');
  const titleSubtitlesList = document.getElementById('titleSubtitlesList');
  const titleSubtitlesHeading = titleSubtitlesSection?.querySelector('h3') || null;
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
  let selectedEntity = null;
  let handleFilterChange = null;
  const defaultFeudalSectionTitle = feudalSection?.querySelector('h3')?.textContent || 'Hiérarchie féodale';
  const defaultFeudalHeaders = Array.from(infoFeudalTable?.querySelectorAll('thead th') || []).map(th => th.textContent);

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
  const rankSequence = ['barony', ...titleHierarchy];
  const dejureSubtitleRankMap = {
    empire: 'kingdom',
    kingdom: 'duchy',
    archduchy: 'duchy',
    duchy: 'county',
    marquisate: 'county',
    county: 'barony',
    viscounty: 'barony'
  };
  const subtitlePluralByRank = {
    barony: 'Baronnies',
    viscounty: 'Vicomtés',
    county: 'Comtés',
    marquisate: 'Marquisats',
    duchy: 'Duchés',
    archduchy: 'Archiduchés',
    kingdom: 'Royaumes',
    empire: 'Empires'
  };
  let infoPanelController = null;

  function getInfoPanelController() {
    if (infoPanelController) return infoPanelController;
    infoPanelController = mapInfoPanel2.init({
      getState: () => ({
        baronyLookup,
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
        seigneurToViscounty,
        seigneurToCounty,
        seigneurToMarquisate,
        seigneurToDuchy,
        seigneurToArchduchy,
        seigneurToKingdom,
        seigneurToEmpire,
        canonicalDependents,
        canonicalParents,
        sanctuaryMap,
        mapMode,
        activeFilter: filterSelect?.value || '',
        defaultFeudalHeaders,
        defaultFeudalSectionTitle,
        titleHierarchy,
        titleTypeConfig
      }),
      actions: {
        attachFloatingTooltip: attachCultureFloatingTooltip,
        applyFilter: (filterId) => filterManager?.applyFilter(filterId),
        clearSelectedTitle: () => { selectedTitle = null; },
        clearTradeSelections: () => {
          selectedTradeRouteId = null;
          selectedTradeLineId = null;
          if (filterManager && typeof filterManager.setTradeRouteSelection === 'function') {
            filterManager.setTradeRouteSelection(null);
          }
          if (filterManager && typeof filterManager.setTradeLineSelection === 'function') {
            filterManager.setTradeLineSelection(null);
          }
        },
        getBaronyEntity,
        getBaronyIdsForEntity,
        getDuchyPietyRows,
        getImmediateSubtitles,
        getSeigneurEntity,
        getSubtitleHeading,
        getTargetTitleMode,
        getTitleFilterInfo,
        getTitleFilterValue,
        getTitleHierarchyRows,
        getTitleEntity,
        getTitleMap,
        handleSelect,
        renderTradeLinesList,
        renderTradeRoutesList,
        restoreDefaultTitlePanelLayout,
        selectEntity,
        setFilterValue,
        getBaronyFeudalRows,
        setSelectedTitle: (title) => { selectedTitle = title; },
        showTitleInfo,
        syncTitleSelectionHighlight,
        shouldSuppressTradeRoutePanelHide: () => suppressTradeRoutePanelHide
      },
      elements: {
        infoPanel,
        baronyTitle,
        infoOwnerLine,
        infoReligionLine,
        infoCultureLine,
        tradeRoutesSection,
        tradeRoutesList,
        tradeLinesList,
        feudalSection,
        infoFeudalTable,
        infoFeudalBody,
        infoDuchyPietyTable,
        infoDuchyPietyBody,
        religiousSection,
        infoReligiousList,
        canonicalOwnedSection,
        canonicalOwnedList,
        canonicalParentSection,
        canonicalParentList,
        titleSubtitlesSection,
        titleSubtitlesList,
        seaInfoPanel,
        seaInfoId,
        seaInfoName,
        seaInfoSeigneur,
        seigneurInfoPanel,
        seigneurInfoTitle,
        seigneurInfoIdentity,
        seigneurInfoReligion,
        seigneurOverlordLine,
        seigneurTitlesSection,
        seigneurTitlesList,
        seigneurVassalsSection,
        seigneurVassalList,
        tradeRoutePanel
      }
    });
    return infoPanelController;
  }

  function setLine(elem, text) {
    return getInfoPanelController().setLine(elem, text);
  }

  function isVacantBarony(info) {
    return !!info?.vacant;
  }

  function setLabeledLine(elem, label, value) {
    return getInfoPanelController().setLabeledLine(elem, label, value);
  }

  function setSeigneurLine(elem, seigneurId, label, suffixText) {
    return getInfoPanelController().setSeigneurLine(elem, seigneurId, label, suffixText);
  }

  function createSeigneurButton(seigneurId) {
    return getInfoPanelController().createSeigneurButton(seigneurId);
  }

  function showBaronyDetails(baronyId) {
    return getInfoPanelController().showBaronyDetails(baronyId);
  }

  function createBaronyButton(baronyId) {
    return getInfoPanelController().createBaronyButton(baronyId);
  }

  function createBaronyLabel(baronyId) {
    return getInfoPanelController().createBaronyLabel(baronyId);
  }

  function setSelectionMapId(entity) {
    if (!mapData.selection) mapData.selection = {};
    mapData.selection.mapId = entity && (entity._type === 'barony' || entity._type === 'seaZone' || (!entity._type && baronyMeta[entity.id]))
      ? String(entity.id)
      : null;
  }

  function renderGenericEntityInfo(entity) {
    return getInfoPanelController().renderGenericEntityInfo(entity);
  }

  function renderSelectedEntity(entity, options = {}) {
    return getInfoPanelController().renderSelectedEntity(entity, options);
  }

  function selectEntity(entity, options = {}) {
    selectedEntity = entity || null;
    setSelectionMapId(selectedEntity);
    renderSelectedEntity(selectedEntity, options);
    highlightEntity(selectedEntity, options);
    if (filterManager && filterSelect && filterSelect.value === 'distance') {
      filterManager.applyFilter('distance');
    }
  }

  function handleMapClick(click) {
    if (!click?.id) {
      selectEntity(null, { source: 'map' });
      return;
    }
    if (click.type === 'seaZone') {
      selectEntity({ ...(baronyMeta[click.id] || { id: click.id }), id: click.id, _type: 'seaZone' }, { source: 'map' });
      return;
    }
    const barony = getBaronyEntity(click.id);
    const filterDefinition = mapFilters2.getFilterDefinition(filterSelect?.value);
    const target = filterDefinition?.selectEntityForBaronyClick
      ? filterDefinition.selectEntityForBaronyClick(barony, { mapData, filterSelect, core })
      : barony;
    selectEntity(target || barony, {
      source: 'map',
      mode: filterDefinition?.mode || 'dejure'
    });
  }

  function getTitleMap(rankKey) {
    return titleTypeConfig[rankKey]?.map?.() || {};
  }

  function getVm() {
    return mapData?.viewModel || core?.getViewModel?.() || null;
  }

  function getVmBarony(baronyInfo) {
    if (!baronyInfo?.id) return null;
    return getVm()?.baronies?.byId?.[String(baronyInfo.id)] || null;
  }

  function getBaronyEntity(baronyId) {
    const entity = getVm()?.getEntity?.('barony', baronyId) || baronyMeta[baronyId] || baronyLookup[baronyId] || null;
    if (entity && !entity._type) entity._type = 'barony';
    return entity;
  }

  function getTitleEntity(rankKey, titleId, mode = 'dejure') {
    const entity = getVm()?.getEntity?.(rankKey, titleId) || getTitleMap(rankKey)[titleId] || null;
    if (entity) {
      entity._selectionMode = mode;
      if (!entity._type) entity._type = rankKey;
    }
    return entity;
  }

  function getSeigneurEntity(seigneurId) {
    const entity = getVm()?.getEntity?.('seigneur', seigneurId) || seigneurMap[seigneurId] || null;
    if (entity && !entity._type) entity._type = 'seigneur';
    return entity;
  }

  function highlightBaronies(ids = []) {
    if (core?.highlightBaronies) core.highlightBaronies(ids);
  }

  function getBaronyIdsForEntity(entity, mode = 'dejure') {
    if (!entity) return [];
    if (entity._type === 'seaZone') return [entity.id];
    if (entity._type === 'barony' || (!entity._type && baronyMeta[entity.id])) return [entity.id];
    if (entity._type === 'seigneur') {
      return Object.values(baronyLookup).filter(b => String(b.seigneur_id) === String(entity.id)).map(b => b.id);
    }
    if (entity._type === 'religion') {
      return Object.values(baronyMeta).filter(b => String(b.religion_pop_id) === String(entity.id)).map(b => b.id);
    }
    if (entity._type === 'culture') {
      return Object.values(baronyMeta).filter(b => String(b.culture_id) === String(entity.id)).map(b => b.id);
    }
    if (titleHierarchy.includes(entity._type)) {
      return getBaroniesForTitle(entity._type, entity.id, mode);
    }
    return [];
  }

  function highlightEntity(entity, options = {}) {
    const mode = options.mode || entity?._selectionMode || 'dejure';
    highlightBaronies(getBaronyIdsForEntity(entity, mode));
  }

  function createTitleButton(rankKey, titleId, options = {}) {
    return getInfoPanelController().createTitleButton(rankKey, titleId, options);
  }

  function getTargetTitleMode(forceFilterMode) {
    if (forceFilterMode === 'dejure' || forceFilterMode === 'defacto') {
      return forceFilterMode;
    }
    const activeTitleFilter = getTitleFilterInfo(filterSelect?.value);
    if (activeTitleFilter?.mode) {
      return activeTitleFilter.mode;
    }
    return 'defacto';
  }

  function getTitleFilterValue(rankKey, mode) {
    if (rankKey === 'duchy' && mode === 'duchy_piety_ranking') return 'duchy_piety_ranking';
    return mode === 'defacto' ? `${rankKey}_defacto` : rankKey;
  }

  function setFilterValue(filterValue) {
    if (!filterSelect || filterSelect.value === filterValue) return;
    filterSelect.value = filterValue;
    if (typeof handleFilterChange === 'function') {
      handleFilterChange();
    } else if (filterManager) {
      filterManager.applyFilter(filterSelect.value);
    }
  }

  function getTitleFilterInfo(filterValue) {
    if (!filterValue) return null;
    if (filterValue === 'duchy_piety_ranking') {
      return { rankKey: 'duchy', mode: 'dejure', infoMode: 'duchy_piety_ranking' };
    }
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
    return getInfoPanelController().setSeigneurList(section, list, ids);
  }

  function showSeigneurInfo(seigneurId) {
    return getInfoPanelController().showSeigneurInfo(seigneurId);
  }

  function hideSeigneurInfo() {
    return getInfoPanelController().hideSeigneurInfo();
  }

  function hideTradeRoutePanel() {
    return getInfoPanelController().hideTradeRoutePanel();
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
          selectEntity(getTitleEntity(match.titleRankKey, match.titleId, match.titleMode || 'dejure'), {
            source: 'search',
            mode: match.titleMode || 'dejure'
          });
          return;
        }
        const targetId = match.seigneurId || match.id;
        if (targetId) selectEntity(getSeigneurEntity(targetId), { source: 'search' });
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
    return getInfoPanelController().setList(section, list, items);
  }

  function setTradeRouteInfoMode(active) {
    return getInfoPanelController().setTradeRouteInfoMode(active);
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
    suppressTradeRoutePanelHide = true;
    selectEntity(null, { source: 'trade_route' });
    suppressTradeRoutePanelHide = false;
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
    suppressTradeRoutePanelHide = true;
    selectEntity(null, { source: 'trade_line' });
    suppressTradeRoutePanelHide = false;
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
    return getInfoPanelController().setTitleList(section, list, titles, baronies);
  }

  function setBaronyList(section, list, items) {
    return getInfoPanelController().setBaronyList(section, list, items);
  }

  function getBaronyTitleId(baronyInfo, rankKey, mode = 'dejure') {
    if (!baronyInfo?.id) return null;
    const title = getVm()?.getBaronyTitleId?.(baronyInfo.id, rankKey, mode) || null;
    return title && typeof title === 'object' ? title.id : title;
  }

  function getBaroniesForTitle(rankKey, titleId, mode = 'dejure') {
    const vm = getVm();
    return vm?.getBaroniesForTitle?.(rankKey, titleId, mode).map(barony => barony.id) || [];
  }

  function getTitleName(rankKey, id) {
    if (rankKey === 'barony') return baronyMeta[id]?.name || baronyLookup[id]?.name || '';
    return getTitleMap(rankKey)[id]?.name || '';
  }

  function compareSubtitleItems(a, b) {
    const levelDiff = getRankIndex(b.rankKey) - getRankIndex(a.rankKey);
    if (levelDiff !== 0) return levelDiff;
    return getTitleName(a.rankKey, a.id).localeCompare(getTitleName(b.rankKey, b.id), 'fr');
  }

  function getImmediateSubtitles(rankKey, titleId, mode = 'dejure') {
    return getVm()?.getImmediateSubtitles?.(rankKey, titleId, mode)
      .map(entity => ({ rankKey: entity._type, id: entity.id }))
      .sort(compareSubtitleItems) || [];
  }

  function getSubtitleHeading(rankKey, mode = 'dejure') {
    if (mode === 'defacto') return 'Sous-titres de facto:';
    const childRank = dejureSubtitleRankMap[rankKey];
    if (!childRank) return 'Sous-titres de jure:';
    const plural = subtitlePluralByRank[childRank] || 'Sous-titres';
    return `${plural} de jure:`;
  }

  function getTitleHierarchyRows(rankKey, titleInfo, mode) {
    const currentIndex = titleHierarchy.indexOf(rankKey);
    if (currentIndex < 0 || !titleInfo) {
      return { rows: [], hasDejureData: false };
    }
    const sampleBaronyId = getBaroniesForTitle(rankKey, titleInfo.id, mode)[0];
    const sampleBarony = sampleBaronyId ? baronyMeta[sampleBaronyId] : null;
    if (!sampleBarony) {
      return { rows: [], hasDejureData: false };
    }

    const rows = [];
    for (let i = currentIndex + 1; i < titleHierarchy.length; i++) {
      const parentRank = titleHierarchy[i];
      const dejureId = getBaronyTitleId(sampleBarony, parentRank, 'dejure');
      const defactoId = getBaronyTitleId(sampleBarony, parentRank, 'defacto');
      if (!dejureId && !defactoId) continue;
      rows.push({ rankKey: parentRank, dejureId, defactoId });
    }

    return {
      rows: rows.reverse(),
      hasDejureData: rows.some(row => row.dejureId)
    };
  }

  function setTitleHierarchyTable(section, tbody, rankKey, titleInfo, mode) {
    return getInfoPanelController().setTitleHierarchyTable(section, tbody, rankKey, titleInfo, mode);
  }

  function syncTitleSelectionHighlight() {
    if (!selectedTitle) return;
    const activeTitleFilter = getTitleFilterInfo(filterSelect?.value);
    if (activeTitleFilter && activeTitleFilter.rankKey === selectedTitle.rankKey) {
      highlightBaronies(getBaroniesForTitle(selectedTitle.rankKey, selectedTitle.id, activeTitleFilter.mode));
      return;
    }
    highlightBaronies([]);
  }

  function showTitleInfo(rankKey, titleId, mode = 'dejure', options = {}) {
    return getInfoPanelController().showTitleInfo(rankKey, titleId, mode, options);
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

  const duchyPietyTitleBonusConfig = [
    { key: 'barony', label: 'Baron', plural: 'Barons', points: 0.5 },
    { key: 'viscounty', label: 'Vicomte', plural: 'Vicomtes', points: 0.75 },
    { key: 'county', label: 'Comte', plural: 'Comtes', points: 1 },
    { key: 'marquisate', label: 'Marquis', plural: 'Marquis', points: 1.25 },
    { key: 'duchy', label: 'Duc', plural: 'Ducs', points: 1.5 },
    { key: 'archduchy', label: 'Archiduc', plural: 'Archiducs', points: 2 },
    { key: 'kingdom', label: 'Roi', plural: 'Rois', points: 3 },
    { key: 'empire', label: 'Empereur', plural: 'Empereurs', points: 4 }
  ];
  function getRankIndex(rankKey) {
    return rankSequence.indexOf(rankKey);
  }

  function getSeigneurRankKey(seigneurId) {
    return getSeigneurEntity(seigneurId)?.highestTitleRank || 'barony';
  }

  function formatPoints(value) {
    if (Number.isInteger(value)) return `${value}`;
    return value.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
  }

  function formatPointsNoDecimals(value) {
    return `${Math.floor(value)}`;
  }

  function formatPointsOneDecimal(value) {
    return Number(value || 0).toFixed(1);
  }


  function normalizeLabelForSearch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function isExcludedPietyReligion(religionId) {
    if (!religionId) return true;
    const religion = religionMap[religionId];
    if (!religion?.name) return false;
    const normalized = normalizeLabelForSearch(religion.name);
    return normalized.includes('athe');
  }

  function getDuchyIdForBarony(info) {
    if (!info) return null;
    const county = countyMap[info.county_id];
    return county?.duchy_id || null;
  }

  function buildDuchyPietyStats() {
    return duchyPiety.computeDuchyPietyStats(
      {
        baronyMeta,
        sanctuaryMap,
        seigneurMap,
        duchyMap,
        religionMap
      },
      {
        getDuchyIdForBarony,
        getSeigneurRankKey,
        isExcludedReligion: isExcludedPietyReligion,
        includeTieBreakBonus: true
      }
    );
  }

  function buildDuchyPietyTooltipRows(stat) {
    const rows = [];
    if (stat.details.pop) rows.push({ label: `${stat.details.pop} Population${stat.details.pop > 1 ? 's' : ''}`, points: `+${formatPoints(stat.details.pop)}` });
    if (stat.details.priory) rows.push({ label: `${stat.details.priory} ${stat.details.priory > 1 ? 'Prieurés' : 'Prieuré'}`, points: `+${formatPoints(stat.details.priory)}` });
    if (stat.details.church) rows.push({ label: `${stat.details.church} ${stat.details.church > 1 ? 'Églises' : 'Église'}`, points: `+${formatPoints(stat.details.church * 3)}` });
    if (stat.details.cathedral) rows.push({ label: `${stat.details.cathedral} ${stat.details.cathedral > 1 ? 'Cathédrales' : 'Cathédrale'}`, points: `+${formatPoints(stat.details.cathedral * 5)}` });
    if (stat.details.bishopric) rows.push({ label: `${stat.details.bishopric} ${stat.details.bishopric > 1 ? 'Évêchés' : 'Évêché'}`, points: `+${formatPoints(stat.details.bishopric * 8)}` });
    if (stat.details.sanctuaryActive) rows.push({ label: `${stat.details.sanctuaryActive} ${stat.details.sanctuaryActive > 1 ? 'Sanctuaires actifs' : 'Sanctuaire actif'}`, points: `+${formatPoints(stat.details.sanctuaryActive * 3)}` });
    if (stat.details.sanctuaryInactive) rows.push({ label: `${stat.details.sanctuaryInactive} ${stat.details.sanctuaryInactive > 1 ? 'Sanctuaires inactifs' : 'Sanctuaire inactif'}`, points: `+${formatPoints(stat.details.sanctuaryInactive * 0.1)}` });
    if (stat.details.banquet) rows.push({ label: `${stat.details.banquet} ${stat.details.banquet > 1 ? 'Enchères au Banquet' : 'Enchère au Banquet'}`, points: `+${formatPoints(stat.details.banquet * 8)}` });
    if (stat.details.tieBreak) rows.push({ label: `Départage égalité (${stat.details.tieBreak.label})`, points: `+${formatPoints(stat.details.tieBreak.bonus)}` });
    duchyPietyTitleBonusConfig.slice().reverse().forEach(cfg => {
      const count = stat.details.titleCounts[cfg.key] || 0;
      if (!count) return;
      rows.push({ label: `${count} ${count > 1 ? cfg.plural : cfg.label}`, points: `+${formatPoints(count * cfg.points)}` });
    });
    return rows;
  }

  function getDuchyPietyRows(duchyId) {
    const duchyStats = buildDuchyPietyStats()[String(duchyId)] || {};
    return Object.values(duchyStats)
      .map(stat => ({
        ...stat,
        religionName: religionMap[stat.religionId]?.name || `Religion #${stat.religionId}`,
        pointsLabel: formatPointsOneDecimal(stat.points),
        tooltipRows: buildDuchyPietyTooltipRows(stat)
      }))
      .sort((a, b) => b.points - a.points || a.religionName.localeCompare(b.religionName, 'fr'));
  }

  function renderDuchyPietyRankingPanel(duchyId, duchyName) {
    return getInfoPanelController().renderDuchyPietyRankingPanel(duchyId, duchyName);
  }

  function restoreDefaultTitlePanelLayout() {
    return getInfoPanelController().restoreDefaultTitlePanelLayout();
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

  function getBaronyFeudalRows(info) {
    if (!info) return [];
    const vmBarony = getVmBarony(info);
    if (!vmBarony) return [];

    const rows = {
      viscounty: {
        rankKey: 'viscounty',
        level: 'Vicomté',
        dejureId: vmBarony.dejure?.viscounty?.id || null,
        defactoId: vmBarony.defacto?.viscounty?.id || null
      },
      county: {
        rankKey: 'county',
        level: 'Comté',
        dejureId: vmBarony.dejure?.county?.id || null,
        defactoId: vmBarony.defacto?.county?.id || null
      },
      marquisate: {
        rankKey: 'marquisate',
        level: 'Marquisat',
        dejureId: vmBarony.dejure?.marquisate?.id || null,
        defactoId: vmBarony.defacto?.marquisate?.id || null
      },
      duchy: {
        rankKey: 'duchy',
        level: 'Duché',
        dejureId: vmBarony.dejure?.duchy?.id || null,
        defactoId: vmBarony.defacto?.duchy?.id || null
      },
      archduchy: {
        rankKey: 'archduchy',
        level: 'Archiduché',
        dejureId: vmBarony.dejure?.archduchy?.id || null,
        defactoId: vmBarony.defacto?.archduchy?.id || null
      },
      kingdom: {
        rankKey: 'kingdom',
        level: 'Royaume',
        dejureId: vmBarony.dejure?.kingdom?.id || null,
        defactoId: vmBarony.defacto?.kingdom?.id || null
      },
      empire: {
        rankKey: 'empire',
        level: 'Empire',
        dejureId: vmBarony.dejure?.empire?.id || null,
        defactoId: vmBarony.defacto?.empire?.id || null
      }
    };

    const order = ['kingdom', 'empire', 'archduchy', 'duchy', 'marquisate', 'county', 'viscounty'];
    return order
      .map(key => rows[key])
      .filter(row => row && (row.dejureId || row.defactoId));
  }

  const landFiltersBase = [
    { value: 'religion', label: 'Religion de la Population' },
    { value: 'seigneur_religion', label: 'Religion du seigneur' },
    { value: 'sanctuary', label: 'Sanctuaire' },
    { value: 'priory', label: 'Prieuré' },
    { value: 'church', label: 'Église' },
    { value: 'cathedral', label: 'Cathédrale' },
    { value: 'canonical', label: 'Terres canoniques' },
    { value: 'duchy_piety_ranking', label: 'Classement de piété ducal' },
    { value: 'culture', label: 'Culture' },
    { value: '', label: 'Baronnies' },
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
    filterSelect.value = '';
  }
  populateFilters();
  function updateLegend(groups) {
    if (!legendDiv) return;
    if (!groups) {
      legendDiv.classList.remove('legend--tall');
      legendDiv.style.display = 'none';
      legendDiv.innerHTML = '';
      return;
    }
    const currentFilter = filterSelect ? filterSelect.value : '';
    legendDiv.classList.toggle('legend--tall', currentFilter === 'county' || currentFilter === 'county_defacto');
    const headerHeight = document.querySelector('.app-header')?.offsetHeight || 0;
    legendDiv.style.setProperty('--legend-header-offset', `${headerHeight + 20}px`);
    legendDiv.innerHTML = '';
    const sortedEntries = Object.entries(groups).sort(([, a], [, b]) =>
      String(a?.name || '').localeCompare(String(b?.name || ''), 'fr', { sensitivity: 'base' })
    );
    const titleFilter = getTitleFilterInfo(currentFilter);
    sortedEntries.forEach(([id, info]) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const colorBox = document.createElement('span');
      colorBox.className = 'legend-color';
      colorBox.style.backgroundColor = `rgb(${info.color[0]},${info.color[1]},${info.color[2]})`;
      item.appendChild(colorBox);
      const lab = document.createElement('span');
      lab.textContent = info.name;
      item.appendChild(lab);
      if (titleFilter && !titleFilter.infoMode && id) {
        item.classList.add('legend-item--interactive');
        item.title = 'Cliquer pour sélectionner ce titre';
        item.addEventListener('click', () => {
          selectEntity(getTitleEntity(titleFilter.rankKey, id, titleFilter.mode), { source: 'legend', mode: titleFilter.mode });
        });
      }
      legendDiv.appendChild(item);
    });
    legendDiv.style.display = 'block';
  }

  function drawOverlay(ctx) {
    if (mapMode === 'sea') {
      if (!filterSelect || filterSelect.value !== 'baronies') return;
      const zoneId = mapData.selection?.mapId;
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
    return getInfoPanelController().handleSelect(id);
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
      const currentViewModel = viewModel.build({
        baronies,
        seigneurs,
        religions,
        cultures: [],
        counties,
        duchies,
        kingdoms,
        viscounties,
        marquisates,
        archduchies,
        empires,
        canonicalLands: [],
        sanctuaries: [],
        baronyConnections: []
      });
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
        viewModel: currentViewModel,
        selection: { mapId: null },
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
    const currentViewModel = viewModel.build({
      baronies,
      seigneurs,
      religions,
      cultures,
      counties,
      duchies,
      kingdoms,
      viscounties,
      marquisates,
      archduchies,
      empires,
      canonicalLands,
      sanctuaries,
      baronyConnections: connections
    });
    baronyMeta = {};
    baronyLookup = {};
    currentViewModel.baronies.list.forEach(b => { baronyMeta[b.id] = b; baronyLookup[b.id] = b; });
    seigneurMap = {};
    currentViewModel.seigneurs.list.forEach(s => { seigneurMap[s.id] = s; });
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
      viewModel: currentViewModel,
      selection: { mapId: null },
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
      core = mapCore2.init({
        canvas: pixelCanvas,
        fetchData,
        drawOverlay,
        mapMode
      });
      core.onMapClick(handleMapClick);
      core.ready.then(() => {
        filterManager = core.createFilterManager(mapFilters2.createRegistry(), { updateLegend });
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
              if (infoPanel) infoPanel.style.display = selectedEntity ? 'block' : 'none';
            } else if (selectedEntity && (selectedEntity._type === 'barony' || baronyMeta[selectedEntity.id])) {
              setTradeRouteInfoMode(true);
              renderTradeRoutesList(selectedEntity.id);
              renderTradeLinesList(selectedEntity.id);
              hideTradeRoutePanel();
            } else if (selectedTradeRouteId || selectedTradeLineId) {
              setTradeRouteInfoMode(false);
              if (infoPanel) infoPanel.style.display = 'none';
              if (tradeRoutePanel) tradeRoutePanel.style.display = 'block';
            }
            filterManager.applyFilter(filterSelect.value);
            highlightEntity(selectedEntity, {
              mode: activeTitleFilter?.mode || selectedEntity?._selectionMode || selectedTitle?.mode || 'dejure'
            });
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
