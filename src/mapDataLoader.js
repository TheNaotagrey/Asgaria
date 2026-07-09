(function (global) {
  function byIdFromList(list = []) {
    const map = {};
    (list || []).forEach((item) => {
      if (item && item.id !== undefined && item.id !== null) map[item.id] = item;
    });
    return map;
  }

  async function fetchJson(fetchImpl, apiBase, endpoint) {
    const res = await fetchImpl(`${apiBase || ''}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} while loading ${endpoint}`);
    return res.json();
  }

  function buildMaritimeAdjacency(connections = []) {
    const adjacency = {};
    (connections || []).forEach(c => {
      const left = c.zone_id_1;
      const right = c.zone_id_2;
      if (!left || !right) return;
      const dist = parseInt(c.distance, 10) || 1;
      if (!adjacency[left]) adjacency[left] = [];
      if (!adjacency[right]) adjacency[right] = [];
      adjacency[left].push({ id: right, distance: dist });
      adjacency[right].push({ id: left, distance: dist });
    });
    return adjacency;
  }

  function mapTitleCollections(vm) {
    return {
      seigneurMap: byIdFromList(vm.seigneurs.list),
      religionMap: byIdFromList(vm.religions.list),
      cultureMapInfo: byIdFromList(vm.cultures.list),
      countyMap: byIdFromList(vm.counties.list),
      duchyMap: byIdFromList(vm.duchies.list),
      kingdomMap: byIdFromList(vm.kingdoms.list),
      viscountyMap: byIdFromList(vm.viscounties.list),
      marquisateMap: byIdFromList(vm.marquisates.list),
      archduchyMap: byIdFromList(vm.archduchies.list),
      empireMap: byIdFromList(vm.empires.list)
    };
  }

  async function loadLand(options) {
    const { apiBase, fetchImpl, includeTrade, mapWidth = 0, mapHeight = 0 } = options;
    let [baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, connections, routes, lines, maritimeZones] = await Promise.all([
      fetchJson(fetchImpl, apiBase, '/api/baronies'),
      fetchJson(fetchImpl, apiBase, '/api/seigneurs'),
      fetchJson(fetchImpl, apiBase, '/api/religions'),
      fetchJson(fetchImpl, apiBase, '/api/cultures'),
      fetchJson(fetchImpl, apiBase, '/api/counties'),
      fetchJson(fetchImpl, apiBase, '/api/duchies'),
      fetchJson(fetchImpl, apiBase, '/api/kingdoms'),
      fetchJson(fetchImpl, apiBase, '/api/viscounties'),
      fetchJson(fetchImpl, apiBase, '/api/marquisates'),
      fetchJson(fetchImpl, apiBase, '/api/archduchies'),
      fetchJson(fetchImpl, apiBase, '/api/empires'),
      fetchJson(fetchImpl, apiBase, '/api/canonical_lands'),
      fetchJson(fetchImpl, apiBase, '/api/sanctuaries'),
      fetchJson(fetchImpl, apiBase, '/api/barony_connections'),
      includeTrade ? fetchJson(fetchImpl, apiBase, '/api/trade_routes') : Promise.resolve([]),
      includeTrade ? fetchJson(fetchImpl, apiBase, '/api/trade_lines') : Promise.resolve([]),
      fetchJson(fetchImpl, apiBase, '/api/maritime_zones')
    ]);

    if (!Array.isArray(baronies) || baronies.length === 0) {
      try {
        const organigrammes = await fetchJson(fetchImpl, apiBase, '/api/organigrammes');
        if (Array.isArray(organigrammes?.titles?.baronies) && organigrammes.titles.baronies.length > 0) {
          baronies = organigrammes.titles.baronies;
        }
      } catch (err) {
        console.warn('Impossible de recuperer les baronnies depuis l organigramme.', err);
      }
    }

    const currentViewModel = global.viewModel.build({
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
      baronyConnections: connections,
      tradeRoutes: Array.isArray(routes) ? routes : [],
      tradeLines: Array.isArray(lines) ? lines : []
    });

    const titleMaps = mapTitleCollections(currentViewModel);
    const maritimeZoneMap = byIdFromList(maritimeZones || []);
    const baronyMeta = byIdFromList(currentViewModel.baronies.list);

    return {
      pixelData: {},
      baronyPixels: {},
      maritimeZoneBaronies: {},
      baronyMeta,
      baronyLookup: baronyMeta,
      ...titleMaps,
      tradeRoutes: currentViewModel.tradeRoutes.list,
      tradeRouteById: currentViewModel.tradeRoutes.byId,
      tradeLines: currentViewModel.tradeLines.list,
      tradeLineById: currentViewModel.tradeLines.byId,
      maritimeZoneMap,
      maritimeZonePixels: {},
      viewModel: currentViewModel,
      selection: { mapId: null },
      mapWidth,
      mapHeight,
      mapMode: 'land',
      raw: { baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, connections, routes, lines, maritimeZones }
    };
  }

  async function loadSea(options) {
    const { apiBase, fetchImpl, mapWidth = 0, mapHeight = 0 } = options;
    const [pixelData, zones, seigneurs, connections, zoneBaronies, baronies, religions, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires] = await Promise.all([
      fetchJson(fetchImpl, apiBase, '/api/maritime_zone_pixels'),
      fetchJson(fetchImpl, apiBase, '/api/maritime_zones'),
      fetchJson(fetchImpl, apiBase, '/api/seigneurs'),
      fetchJson(fetchImpl, apiBase, '/api/maritime_zone_connections'),
      fetchJson(fetchImpl, apiBase, '/api/maritime_zone_baronies'),
      fetchJson(fetchImpl, apiBase, '/api/baronies'),
      fetchJson(fetchImpl, apiBase, '/api/religions'),
      fetchJson(fetchImpl, apiBase, '/api/counties'),
      fetchJson(fetchImpl, apiBase, '/api/duchies'),
      fetchJson(fetchImpl, apiBase, '/api/kingdoms'),
      fetchJson(fetchImpl, apiBase, '/api/viscounties'),
      fetchJson(fetchImpl, apiBase, '/api/marquisates'),
      fetchJson(fetchImpl, apiBase, '/api/archduchies'),
      fetchJson(fetchImpl, apiBase, '/api/empires')
    ]);

    const currentViewModel = global.viewModel.build({
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
      baronyConnections: [],
      tradeRoutes: [],
      tradeLines: []
    });

    const titleMaps = mapTitleCollections(currentViewModel);
    const maritimeZoneBaronies = {};
    (zoneBaronies || []).forEach(zb => {
      if (!maritimeZoneBaronies[zb.zone_id]) maritimeZoneBaronies[zb.zone_id] = [];
      maritimeZoneBaronies[zb.zone_id].push(zb.barony_id);
    });

    return {
      pixelData,
      baronyPixels: {},
      maritimeZoneBaronies,
      baronyMeta: byIdFromList(zones),
      baronyLookup: byIdFromList(baronies),
      ...titleMaps,
      maritimeZoneAdjacency: buildMaritimeAdjacency(connections),
      tradeRoutes: [],
      tradeRouteById: {},
      tradeLines: [],
      tradeLineById: {},
      maritimeZoneMap: byIdFromList(zones),
      maritimeZonePixels: pixelData,
      viewModel: currentViewModel,
      selection: { mapId: null },
      mapWidth,
      mapHeight,
      mapMode: 'sea',
      raw: { zones, seigneurs, connections, zoneBaronies, baronies, religions, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires }
    };
  }

  async function load(options = {}) {
    const mode = options.mode === 'sea' ? 'sea' : 'land';
    const fetchImpl = options.fetchImpl || global.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('mapDataLoader.load requires fetch');
    if (!global.viewModel?.build) throw new Error('mapDataLoader.load requires viewModel.build');
    const normalized = {
      apiBase: options.apiBase || '',
      fetchImpl,
      includeTrade: options.includeTrade !== false,
      includeEditorData: !!options.includeEditorData,
      mapWidth: options.mapWidth || 0,
      mapHeight: options.mapHeight || 0
    };
    return mode === 'sea' ? loadSea(normalized) : loadLand(normalized);
  }

  const api = { load, buildMaritimeAdjacency };
  global.mapDataLoader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
