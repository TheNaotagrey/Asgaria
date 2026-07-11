const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const viewModel = require('../viewModel');
const mapFilterRuntime = require('../src/mapFilterRuntime');
const { breadthFirst } = require('../src/bfs');
global.breadthFirst = breadthFirst;
require('../src/duchyPiety');
const mapFilterRegistry = require('../src/mapFilterRegistry');
const mapDataLoader = require('../src/mapDataLoader');

function buildVm(overrides = {}) {
  return viewModel.build({
    seigneurs: overrides.seigneurs || [
      { id: 1, name: 'Seigneur A' },
      { id: 2, name: 'Seigneur B' }
    ],
    religions: overrides.religions || [
      { id: 1, name: 'Religion A', color: '#112233' }
    ],
    cultures: overrides.cultures || [
      { id: 1, name: 'Culture A', color: '#445566' }
    ],
    baronies: overrides.baronies || [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, religion_pop_id: 1, culture_id: 1, county_id: 10 }
    ],
    viscounties: overrides.viscounties || [],
    counties: overrides.counties || [
      { id: 10, name: 'Comte A', seigneur_id: 1, duchy_id: 30 },
      { id: 20, name: 'Comte B', seigneur_id: 2, duchy_id: 30 }
    ],
    marquisates: overrides.marquisates || [],
    duchies: overrides.duchies || [
      { id: 30, name: 'Duche A', seigneur_id: 2 }
    ],
    archduchies: overrides.archduchies || [],
    kingdoms: overrides.kingdoms || [],
    empires: overrides.empires || [],
    canonicalLands: overrides.canonicalLands || [],
    sanctuaries: overrides.sanctuaries || [],
    baronyConnections: overrides.baronyConnections || [],
    tradeRoutes: overrides.tradeRoutes || [],
    tradeLines: overrides.tradeLines || []
  });
}

function byId(list = []) {
  return Object.fromEntries((list || []).map((entry) => [entry.id, entry]));
}

function createFilterHarness(vm = buildVm(), dataOverrides = {}) {
  const captured = {
    colorMap: null,
    legend: null,
    patterns: null
  };
  const core = {
    setColorMap(colorMap) {
      captured.colorMap = colorMap;
    },
    setCanonicalPatterns(patterns) {
      captured.patterns = patterns;
    }
  };
  const data = {
    viewModel: vm,
    baronyMeta: byId(vm.baronies.list),
    religionMap: byId(vm.religions.list),
    cultureMapInfo: byId(vm.cultures.list),
    seigneurMap: byId(vm.seigneurs.list),
    viscountyMap: byId(vm.viscounties.list),
    countyMap: byId(vm.counties.list),
    marquisateMap: byId(vm.marquisates.list),
    duchyMap: byId(vm.duchies.list),
    archduchyMap: byId(vm.archduchies.list),
    kingdomMap: byId(vm.kingdoms.list),
    empireMap: byId(vm.empires.list),
    tradeRouteById: byId(vm.tradeRoutes?.list || []),
    tradeLineById: byId(vm.tradeLines?.list || []),
    selection: { mapId: null },
    ...dataOverrides
  };
  const manager = mapFilterRuntime.create({
    core,
    data,
    registry: mapFilterRegistry.createRegistry(),
    updateLegend(legend) {
      captured.legend = legend;
    }
  });
  return { manager, captured, data };
}

function createMapDataFetchStub() {
  const payloads = {
    '/api/baronies': [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, religion_pop_id: 1, culture_id: 1, county_id: 10 },
      { id: 101, name: 'Baronnie B', seigneur_id: 2, religion_pop_id: 1, culture_id: 1, county_id: 10 }
    ],
    '/api/seigneurs': [
      { id: 1, name: 'Seigneur A' },
      { id: 2, name: 'Seigneur B' }
    ],
    '/api/religions': [{ id: 1, name: 'Religion A', color: '#112233' }],
    '/api/cultures': [{ id: 1, name: 'Culture A', color: '#445566' }],
    '/api/counties': [{ id: 10, name: 'Comte A', seigneur_id: 1, duchy_id: 30 }],
    '/api/duchies': [{ id: 30, name: 'Duche A', seigneur_id: 2 }],
    '/api/kingdoms': [],
    '/api/viscounties': [],
    '/api/marquisates': [],
    '/api/archduchies': [],
    '/api/empires': [],
    '/api/canonical_lands': [{ barony_id: 100, canonical_barony_id: 101 }],
    '/api/sanctuaries': [{ id: 1, barony_id: 100, religion_id: 1 }],
    '/api/barony_connections': [{ barony_id_1: 100, barony_id_2: 101, distance: 3 }],
    '/api/trade_routes': [{ id: 7, barony_id_1: 100, barony_id_2: 101, path: '[100,101]' }],
    '/api/trade_lines': [{ id: 8, barony_id_1: 100, barony_id_2: 101, path: '[1,2]' }],
    '/api/maritime_zones': []
  };

  return async function fetchImpl(url) {
    const endpoint = String(url).replace(/^https?:\/\/[^/]+/, '');
    if (!Object.prototype.hasOwnProperty.call(payloads, endpoint)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(JSON.stringify(payloads[endpoint]))
    };
  };
}

test('viewModel links object references and exposes filter colors', () => {
  const vm = buildVm();
  const barony = vm.getEntity('barony', 100);

  assert.strictEqual(barony.seigneur.name, 'Seigneur A');
  assert.strictEqual(barony.religion.name, 'Religion A');
  assert.strictEqual(barony.culture.name, 'Culture A');
  assert.strictEqual(barony.seigneur.baronies[0], barony);
  assert.strictEqual(barony.religion.baroniesPop[0], barony);
  assert.strictEqual(vm.getColorForBaronyFilter(100, 'religion'), '#112233');
  assert.strictEqual(vm.getColorForBaronyFilter(100, 'culture'), '#445566');
});

test('mapDataLoader builds shared land map data from API payloads', async () => {
  const data = await mapDataLoader.load({
    mode: 'land',
    apiBase: '',
    fetchImpl: createMapDataFetchStub(),
    includeTrade: true,
    mapWidth: 20,
    mapHeight: 10
  });

  assert.strictEqual(data.mapMode, 'land');
  assert.strictEqual(data.mapWidth, 20);
  assert.strictEqual(data.mapHeight, 10);
  assert.strictEqual(data.viewModel.getEntity('barony', 100).dejure.duchy.id, '30');
  assert.strictEqual(data.baronyMeta['100'].seigneur.name, 'Seigneur A');
  assert.deepStrictEqual(data.baronyMeta['100'].connectedBaronies, [{ id: '101', distance: 3 }]);
  assert.strictEqual(data.baronyMeta['100'].canonicalLands[0].id, '101');
  assert.strictEqual(data.baronyMeta['101'].canonicalFor[0].id, '100');
  assert.strictEqual(data.baronyMeta['100'].sanctuaries[0].religion_id, 1);
  assert.strictEqual(data.tradeRouteById['7'].path.length, 2);
  assert.strictEqual(data.tradeLineById['8'].path.length, 2);
  assert.strictEqual(data.baronyMeta['100'].tradeRoutes[0].id, '7');
  assert.strictEqual(data.baronyMeta['100'].tradeLines[0].id, '8');
  assert.strictEqual(data.baronyMeta['100'].landTradeBaronies[0].id, '101');
  assert.strictEqual(data.baronyMeta['100'].seaTradeBaronies[0].id, '101');
  assert.strictEqual(data.seigneurMap['1'].titles.county[0].id, '10');
});

test('mapDataLoader returns a stable shared shape for viewer and future editor callers', async () => {
  const viewerData = await mapDataLoader.load({ mode: 'land', fetchImpl: createMapDataFetchStub() });
  const editorData = await mapDataLoader.load({ mode: 'land', fetchImpl: createMapDataFetchStub(), includeEditorData: true });
  const sharedKeys = [
    'viewModel',
    'pixelData',
    'baronyMeta',
    'tradeRouteById',
    'tradeLineById',
    'selection'
  ];

  sharedKeys.forEach((key) => {
    assert.ok(Object.prototype.hasOwnProperty.call(viewerData, key), `viewer data missing ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(editorData, key), `editor data missing ${key}`);
  });
  assert.deepStrictEqual(Object.keys(viewerData.baronyMeta), Object.keys(editorData.baronyMeta));
});

test('viewModel exposes owned baronies as seigneur barony titles', () => {
  const vm = buildVm({
    counties: [],
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1 },
      { id: 101, name: 'Baronnie B', seigneur_id: 1 },
      { id: 102, name: 'Baronnie C', seigneur_id: 2 }
    ]
  });
  const seigneur = vm.getEntity('seigneur', 1);

  assert.deepStrictEqual(seigneur.titles.barony.map(barony => barony.id), ['100', '101']);
  assert.deepStrictEqual(vm.indexes.titlesBySeigneurId['1'].barony.map(barony => barony.id), ['100', '101']);
  assert.strictEqual(seigneur.highestTitle, seigneur.titles.barony[0]);
  assert.strictEqual(seigneur.highestTitleRank, 'barony');
});

test('viewModel exposes vacant as a normalized boolean on baronies', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Vacante', vacant: 1 },
      { id: 101, name: 'Occupee', vacant: '0' },
      { id: 102, name: 'Sans valeur' }
    ]
  });

  assert.strictEqual(vm.getEntity('barony', 100).vacant, true);
  assert.strictEqual(vm.getEntity('barony', 101).vacant, false);
  assert.strictEqual(vm.getEntity('barony', 102).vacant, false);
});

test('viewModel applies weighted distances to baronies from canonical connections', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Baronnie A' },
      { id: 101, name: 'Baronnie B' },
      { id: 102, name: 'Baronnie C' }
    ],
    counties: [],
    duchies: [],
    baronyConnections: [
      { barony_id_1: 100, barony_id_2: 101, distance: 4 }
    ]
  });

  const distances = vm.applyDistancesToBaronies(100);

  assert.deepStrictEqual(distances, { 100: 0, 101: 4 });
  assert.strictEqual(vm.getEntity('barony', 100).distanceToSelected, 0);
  assert.strictEqual(vm.getEntity('barony', 101).distanceToSelected, 4);
  assert.strictEqual(vm.getEntity('barony', 102).distanceToSelected, -1);
});

test('viewModel links trade routes and lines to their endpoint baronies', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Baronnie A' },
      { id: 101, name: 'Baronnie B' }
    ],
    counties: [],
    duchies: [],
    tradeRoutes: [{ id: 7, barony_id_1: 100, barony_id_2: 101, path: '[100,101]' }],
    tradeLines: [{ id: 8, barony_id_1: 100, barony_id_2: 101, path: '[1,2]' }]
  });

  const barony = vm.getEntity('barony', 100);

  assert.strictEqual(vm.getEntity('tradeRoute', 7).origin, barony);
  assert.strictEqual(vm.getEntity('tradeLine', 8).origin, barony);
  assert.strictEqual(barony.tradeRoutes[0].id, '7');
  assert.strictEqual(barony.tradeLines[0].id, '8');
  assert.strictEqual(barony.landTradeBaronies[0].id, '101');
  assert.strictEqual(barony.seaTradeBaronies[0].id, '101');
});

test('viewModel exposes static duchy piety stats and winner', () => {
  const vm = buildVm({
    religions: [
      { id: 1, name: 'Religion A', color: '#112233' },
      { id: 2, name: 'Religion B', color: '#445566' }
    ],
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, religion_pop_id: 1, church_religion_id: 2, county_id: 10 }
    ],
    counties: [
      { id: 10, name: 'Comte A', seigneur_id: 1, duchy_id: 30 }
    ],
    duchies: [
      { id: 30, name: 'Duche A', seigneur_id: 1 }
    ]
  });

  const duchy = vm.getEntity('duchy', 30);
  const barony = vm.getEntity('barony', 100);

  assert.strictEqual(duchy.pietyStatsByReligion['1'].points, 1);
  assert.strictEqual(duchy.pietyStatsByReligion['2'].points, 3);
  assert.strictEqual(duchy.duchyPietyWinnerId, 2);
  assert.strictEqual(duchy.duchyPietyWinnerReligion.name, 'Religion B');
  assert.strictEqual(barony.duchyPietyWinnerReligion, duchy.duchyPietyWinnerReligion);
});

test('barony defacto_county_id resolves the de facto county', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, county_id: 10, defacto_county_id: 20 }
    ]
  });

  assert.strictEqual(vm.getTitleForBarony(100, 'county', 'defacto').id, '20');
  assert.strictEqual(vm.getEntity('barony', 100).defactoParent.id, '20');
});

test('barony exposes direct dejure and defacto title references', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, county_id: 10, defacto_county_id: 20 }
    ]
  });
  const barony = vm.getEntity('barony', 100);

  assert.strictEqual(barony.dejure.county.id, '10');
  assert.strictEqual(barony.dejure.duchy.id, '30');
  assert.strictEqual(barony.defacto.county.id, '20');
});

test('barony dejure title references prefer the direct county branch over shared viscounty ancestry', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, viscounty_id: 5, county_id: 10 },
      { id: 101, name: 'Baronnie B', seigneur_id: 1, viscounty_id: 5, county_id: 20 }
    ],
    viscounties: [
      { id: 5, name: 'Vicomte partagee', seigneur_id: 1 }
    ],
    counties: [
      { id: 10, name: 'Comte direct', seigneur_id: 1, duchy_id: 30 },
      { id: 20, name: 'Comte autre', seigneur_id: 2, duchy_id: 40 }
    ],
    duchies: [
      { id: 30, name: 'Duche direct', seigneur_id: 1, color: '#111111' },
      { id: 40, name: 'Duche autre', seigneur_id: 2, color: '#222222' }
    ]
  });
  const barony = vm.getEntity('barony', 101);

  assert.strictEqual(barony.dejure.county.id, '20');
  assert.strictEqual(barony.dejure.duchy.id, '40');
  assert.strictEqual(vm.getTitleForBarony(101, 'duchy', 'dejure').id, '40');
  assert.strictEqual(vm.getColorForBaronyFilter(101, 'duchy'), '#222222');
});

test('viscounty defacto_county_id resolves the de facto parent', () => {
  const vm = buildVm({
    viscounties: [
      { id: 5, name: 'Vicomte A', defacto_county_id: 20 }
    ],
    baronies: [
      { id: 100, name: 'Baronnie A', viscounty_id: 5, defacto_viscounty_id: 5 }
    ]
  });

  assert.strictEqual(vm.getDeFactoParent('viscounty', 5).id, '20');
  assert.strictEqual(vm.getTitleForBarony(100, 'county', 'defacto').id, '20');
});

test('viewModel keeps intermediate titles out of the de jure parent chain', () => {
  const vm = buildVm({
    viscounties: [
      { id: 5, name: 'Vicomte A' }
    ],
    marquisates: [
      { id: 40, name: 'Marquisat A' }
    ],
    archduchies: [
      { id: 50, name: 'Archiduche A' }
    ],
    kingdoms: [
      { id: 60, name: 'Royaume A' }
    ],
    counties: [
      { id: 10, name: 'Comte A', seigneur_id: 1, marquisate_id: 40, duchy_id: 30 }
    ],
    duchies: [
      { id: 30, name: 'Duche A', seigneur_id: 2, archduchy_id: 50, kingdom_id: 60 }
    ],
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, viscounty_id: 5, county_id: 10 }
    ]
  });

  assert.deepStrictEqual(vm.getEntity('viscounty', 5).deJureParents, []);
  assert.deepStrictEqual(vm.getEntity('marquisate', 40).deJureParents, []);
  assert.deepStrictEqual(vm.getEntity('archduchy', 50).deJureParents, []);
  assert.strictEqual(vm.getEntity('county', 10).deJureParents.some(parent => parent._type === 'viscounty'), false);
  assert.strictEqual(vm.getEntity('duchy', 30).deJureParents.some(parent => parent._type === 'marquisate'), false);
  assert.deepStrictEqual(
    vm.getImmediateSubtitles('county', 10, 'dejure').map(child => `${child._type}:${child.id}`),
    ['barony:100']
  );
  assert.deepStrictEqual(
    vm.getImmediateSubtitles('duchy', 30, 'dejure').map(child => `${child._type}:${child.id}`),
    ['county:10']
  );
  assert.deepStrictEqual(
    vm.getImmediateSubtitles('kingdom', 60, 'dejure').map(child => `${child._type}:${child.id}`),
    ['duchy:30']
  );
  assert.deepStrictEqual(
    vm.getImmediateSubtitles('viscounty', 5, 'dejure').map(child => `${child._type}:${child.id}`),
    ['barony:100']
  );
  assert.deepStrictEqual(
    vm.getImmediateSubtitles('marquisate', 40, 'dejure').map(child => `${child._type}:${child.id}`),
    ['county:10']
  );
  assert.deepStrictEqual(
    vm.getImmediateSubtitles('archduchy', 50, 'dejure').map(child => `${child._type}:${child.id}`),
    ['duchy:30']
  );
  assert.strictEqual(vm.getTitleForBarony(100, 'viscounty', 'dejure').id, '5');
  assert.strictEqual(vm.getTitleForBarony(100, 'marquisate', 'dejure').id, '40');
  assert.strictEqual(vm.getTitleForBarony(100, 'archduchy', 'dejure').id, '50');
});

test('de facto barony rank follows index.html coloring closest-rank preference', () => {
  const vm = buildVm({
    seigneurs: [
      { id: 1, name: 'Baron', overlord_id: 2 },
      { id: 2, name: 'Wrong Viscount' },
      { id: 3, name: 'County Holder' }
    ],
    viscounties: [
      { id: 5, name: 'Expected Vicomte', seigneur_id: 3 },
      { id: 6, name: 'Owner Chain Vicomte', seigneur_id: 2 }
    ],
    counties: [
      { id: 10, name: 'Comte A', seigneur_id: 3, duchy_id: 30 }
    ],
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, viscounty_id: 5, county_id: 10 }
    ]
  });
  const barony = vm.getEntity('barony', 100);
  const registry = mapFilterRegistry.createRegistry();

  assert.strictEqual(vm.getTitleForBarony(100, 'viscounty', 'defacto').id, '6');
  assert.strictEqual(vm.getTitleForBarony(100, 'county', 'defacto'), null);
  assert.strictEqual(vm.getTitleForBarony(100, 'duchy', 'defacto').id, '30');
  assert.strictEqual(vm.getBaroniesForTitle('viscounty', 6, 'defacto')[0], barony);
  assert.strictEqual(registry.byId.viscounty_defacto.selectEntityForBaronyClick(barony, { vm }).id, '6');
});

test('de facto title references preserve index.html skipped-rank behavior', () => {
  const vm = buildVm({
    seigneurs: [
      { id: 1, name: 'Baron', overlord_id: 2 },
      { id: 2, name: 'Duc' }
    ],
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, viscounty_id: 5, county_id: 10 }
    ],
    viscounties: [
      { id: 5, name: 'Vicomte A', seigneur_id: 1 }
    ],
    counties: [
      { id: 10, name: 'Comte A', seigneur_id: 3, duchy_id: 30 }
    ],
    duchies: [
      { id: 30, name: 'Duche de jure', seigneur_id: 3 },
      { id: 40, name: 'Duche de facto', seigneur_id: 2 }
    ]
  });
  const barony = vm.getEntity('barony', 100);

  assert.strictEqual(barony.defacto.viscounty.id, '5');
  assert.strictEqual(barony.defacto.county, null);
  assert.strictEqual(barony.defacto.duchy.id, '40');
});

test('barony de facto references continue through de facto parents of higher titles', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, county_id: 10 }
    ],
    counties: [
      { id: 10, name: 'Comte A', seigneur_id: 1, duchy_id: 30, defacto_duchy_id: 40 }
    ],
    duchies: [
      { id: 30, name: 'Duche de jure', seigneur_id: 1 },
      { id: 40, name: 'Duche de facto', seigneur_id: 2, defacto_archduchy_id: 50 }
    ],
    archduchies: [
      { id: 50, name: 'Archiduche de facto', seigneur_id: 2 }
    ]
  });
  const barony = vm.getEntity('barony', 100);

  assert.strictEqual(barony.defacto.duchy.id, '40');
  assert.strictEqual(barony.defacto.archduchy.id, '50');
  assert.strictEqual(vm.getTitleForBarony(100, 'archduchy', 'defacto').id, '50');
});

test('county and marquisate de facto overrides resolve upward', () => {
  const vm = buildVm({
    counties: [
      { id: 10, name: 'Comte A', defacto_duchy_id: 30 },
      { id: 11, name: 'Comte B', defacto_marquisate_id: 40 }
    ],
    marquisates: [
      { id: 40, name: 'Marquisat A', defacto_duchy_id: 30 }
    ]
  });

  assert.strictEqual(vm.getDeFactoParent('county', 10).id, '30');
  assert.strictEqual(vm.getDeFactoParent('county', 11).id, '40');
  assert.strictEqual(vm.getDeFactoParent('marquisate', 40).id, '30');
});

test('de facto subtitles use direct defactoChildren even when ranks are skipped', () => {
  const vm = buildVm({
    counties: [
      { id: 10, name: 'Comte A', defacto_duchy_id: 30 }
    ],
    marquisates: [
      { id: 40, name: 'Marquisat A', defacto_duchy_id: 30 }
    ]
  });

  const children = vm.getImmediateSubtitles('duchy', 30, 'defacto');
  const tokens = children.map((child) => `${child._type}:${child.id}`).sort();

  assert.deepStrictEqual(tokens, ['county:10', 'marquisate:40']);
});

test('de facto resolution reports owner-chain cycles instead of looping', () => {
  const vm = buildVm({
    seigneurs: [
      { id: 1, name: 'Seigneur A', overlord_id: 2 },
      { id: 2, name: 'Seigneur B', overlord_id: 1 }
    ],
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1 }
    ],
    counties: [],
    duchies: []
  });

  assert.ok(vm.diagnostics.some((diag) => diag.type === 'cycle' && diag.relation === 'defacto_owner_chain'));
});

test('mapFilterRegistry simple lambda filters color by group but select clicked barony', () => {
  const vm = buildVm();
  const barony = vm.getEntity('barony', 100);
  const registry = mapFilterRegistry.createRegistry();
  const ctx = { vm, colorForEntity: (entity) => entity?.color || '#999999' };

  assert.strictEqual(registry.byId.religion.colorForBarony(barony, ctx), '#112233');
  assert.strictEqual(registry.byId.religion.selectEntityForBaronyClick(barony, ctx), barony);
  assert.strictEqual(registry.byId.culture.colorForBarony(barony, ctx), '#445566');
  assert.strictEqual(registry.byId.culture.selectEntityForBaronyClick(barony, ctx), barony);
  assert.strictEqual(registry.byId.seigneur_religion.selectEntityForBaronyClick(barony, ctx), barony);
  assert.strictEqual(registry.byId.priory.selectEntityForBaronyClick(barony, ctx), barony);
  assert.strictEqual(registry.byId.occupation.selectEntityForBaronyClick(barony, ctx), barony);
  assert.strictEqual(registry.byId.duchy.selectEntityForBaronyClick(barony, ctx), barony.dejure.duchy);
});

test('mapFilterRegistry de facto title filter selects skipped-rank target and falls back to barony', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, county_id: 10, defacto_county_id: 20 },
      { id: 101, name: 'Baronnie B', seigneur_id: 1 }
    ]
  });
  const registry = mapFilterRegistry.createRegistry();
  const ctx = { vm, colorForEntity: (entity) => entity?.color || '#999999' };
  const withTarget = vm.getEntity('barony', 100);
  const withoutTarget = vm.getEntity('barony', 101);

  assert.strictEqual(registry.byId.county_defacto.selectEntityForBaronyClick(withTarget, ctx), withTarget.defacto.county);
  assert.strictEqual(registry.byId.empire_defacto.selectEntityForBaronyClick(withoutTarget, ctx), withoutTarget);
});

test('duchy piety filter selects the de jure duchy for map clicks', () => {
  const vm = buildVm();
  const registry = mapFilterRegistry.createRegistry();
  const barony = vm.getEntity('barony', 100);

  assert.strictEqual(registry.byId.duchy_piety_ranking.kind, 'barony');
  assert.strictEqual(registry.byId.duchy_piety_ranking.mode, 'dejure');
  assert.strictEqual(registry.byId.duchy_piety_ranking.selectEntityForBaronyClick(barony, { vm }), barony.dejure.duchy);
});

test('map click pipeline uses active filter while panel selection keeps the direct entity', () => {
  const vm = buildVm();
  const registry = mapFilterRegistry.createRegistry();
  const barony = vm.getEntity('barony', 100);

  function resolveMapClickTarget(clickedBarony, filterId) {
    const filter = registry.byId[filterId];
    return filter?.selectEntityForBaronyClick
      ? filter.selectEntityForBaronyClick(clickedBarony, { vm })
      : clickedBarony;
  }

  const mapClickTarget = resolveMapClickTarget(barony, 'county');
  const duchyPietyTarget = resolveMapClickTarget(barony, 'duchy_piety_ranking');
  const simpleFilterTarget = resolveMapClickTarget(barony, 'religion');
  const panelSelectionTarget = barony;

  assert.strictEqual(mapClickTarget, barony.dejure.county);
  assert.strictEqual(duchyPietyTarget, barony.dejure.duchy);
  assert.strictEqual(simpleFilterTarget, barony);
  assert.strictEqual(panelSelectionTarget, barony);
});

test('mapFilterRuntime applies straightforward filters through colorMap and legend', () => {
  const vm = buildVm();
  const { manager, captured } = createFilterHarness(vm);

  manager.applyFilter('religion');

  assert.deepStrictEqual(captured.colorMap['100'], [17, 34, 51, 255]);
  assert.deepStrictEqual(captured.patterns, {});
  assert.strictEqual(captured.legend['1'].name, 'Religion A');
});

test('seigneur religion filter leaves vacant baronies uncolored', () => {
  const vm = buildVm({
    seigneurs: [
      { id: 1, name: 'Seigneur A', religion_id: 1 }
    ],
    baronies: [
      { id: 100, name: 'Vacante', seigneur_id: 1, vacant: 1 },
      { id: 101, name: 'Occupee', seigneur_id: 1, vacant: 0 }
    ]
  });
  const { manager, captured } = createFilterHarness(vm);

  manager.applyFilter('seigneur_religion');

  assert.strictEqual(vm.getColorForBaronyFilter(100, 'seigneur_religion'), '#999999');
  assert.strictEqual(vm.getColorForBaronyFilter(101, 'seigneur_religion'), '#112233');
  assert.deepStrictEqual(captured.colorMap['100'], [239, 228, 176, 255]);
  assert.deepStrictEqual(captured.colorMap['101'], [17, 34, 51, 255]);
});

test('mapFilterRuntime applies de facto title filters from ViewModel references', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, county_id: 10, defacto_county_id: 20 }
    ],
    counties: [
      { id: 10, name: 'Comte A', seigneur_id: 1, duchy_id: 30, color: '#010203' },
      { id: 20, name: 'Comte B', seigneur_id: 2, duchy_id: 30, color: '#778899' }
    ]
  });
  const { manager, captured } = createFilterHarness(vm);

  manager.applyFilter('county_defacto');

  assert.deepStrictEqual(captured.colorMap['100'], [119, 136, 153, 255]);
  assert.strictEqual(captured.legend['20'].name, 'Comte B');
});

test('mapFilterRuntime dispatches distance, canonical, sanctuary, trade and duchy piety filters', () => {
  const vm = buildVm({
    religions: [
      { id: 1, name: 'Religion A', color: '#112233' },
      { id: 2, name: 'Religion B', color: '#445566' }
    ],
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, religion_pop_id: 1, culture_id: 1, county_id: 10, color: '#010203' },
      { id: 101, name: 'Baronnie B', seigneur_id: 1, religion_pop_id: 2, culture_id: 1, county_id: 10, color: '#abcdef' }
    ],
    counties: [
      { id: 10, name: 'Comte A', seigneur_id: 1, duchy_id: 30 }
    ],
    duchies: [
      { id: 30, name: 'Duche A', seigneur_id: 1 }
    ],
    canonicalLands: [{ barony_id: 100, canonical_barony_id: 101 }],
    sanctuaries: [{ id: 1, barony_id: 100, religion_id: 1 }],
    baronyConnections: [{ barony_id_1: 100, barony_id_2: 101, distance: 2 }],
    tradeRoutes: [{ id: 7, barony_id_1: 100, barony_id_2: 101, path: '[100,101]' }],
    tradeLines: [{ id: 8, barony_id_1: 100, barony_id_2: 101, path: '[1,2]' }]
  });

  const distanceHarness = createFilterHarness(vm, {
    selection: { mapId: '100' }
  });
  distanceHarness.manager.applyFilter('distance');
  assert.ok(distanceHarness.captured.colorMap['100']);
  assert.ok(distanceHarness.captured.colorMap['101']);
  assert.strictEqual(distanceHarness.captured.legend, null);

  const canonicalHarness = createFilterHarness(vm);
  canonicalHarness.manager.applyFilter('canonical');
  assert.deepStrictEqual(canonicalHarness.captured.colorMap['100'], [171, 205, 239, 255]);
  assert.deepStrictEqual(canonicalHarness.captured.patterns['100'][0], [171, 205, 239]);
  assert.strictEqual(canonicalHarness.captured.legend['101'].name, 'Baronnie B');

  const sanctuaryHarness = createFilterHarness(vm);
  sanctuaryHarness.manager.applyFilter('sanctuary');
  assert.deepStrictEqual(sanctuaryHarness.captured.colorMap['100'], [17, 34, 51, 255]);
  assert.strictEqual(sanctuaryHarness.captured.patterns['100'].length, 3);

  const tradeHarness = createFilterHarness(vm, {
    selection: { mapId: '100' }
  });
  tradeHarness.manager.applyFilter('trade_routes');
  assert.deepStrictEqual(tradeHarness.captured.colorMap['100'], [36, 163, 33, 102]);
  assert.deepStrictEqual(tradeHarness.captured.patterns['101'], [[255, 106, 6], [52, 152, 219]]);
  assert.strictEqual(tradeHarness.captured.legend.land.name, 'Route (terre)');

  const pietyHarness = createFilterHarness(vm);
  pietyHarness.manager.applyFilter('duchy_piety_ranking');
  assert.deepStrictEqual(pietyHarness.captured.colorMap['100'], [17, 34, 51, 255]);
  assert.strictEqual(pietyHarness.captured.legend['1'].name, 'Religion A');
});

test('index.html loads the canonical ViewModel map stack', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const expectedScripts = [
    'viewModel.js',
    'src/viewModelLabels.js',
    'src/mapCanvasRuntime.js',
    'src/bfs.js',
    'src/duchyPiety.js',
    'src/mapFilterRuntime.js',
    'src/mapFilterRegistry.js',
    'src/mapDataLoader.js',
    'src/mapInfoPanel.js',
    'src/seigneurSearch.js',
    'viewer.js'
  ];

  expectedScripts.forEach((script) => {
    assert.strictEqual(indexSource.includes(`<script src="${script}"></script>`), true, `missing canonical map script: ${script}`);
  });
  ['src/mapCore.js', 'src/mapFilters.js', 'viewer2.js', 'mapInfoPanel2.js', 'bfs2.js', 'duchyPiety2.js', 'seigneurSearch2.js'].forEach((legacyScript) => {
    assert.strictEqual(indexSource.includes(legacyScript), false, `legacy map script still loaded by index.html: ${legacyScript}`);
  });
  assert.strictEqual(indexSource.includes('href="index.html?mode=sea"'), true);
});

test('index2.html redirects legacy links to index.html and preserves location state', () => {
  const redirectSource = fs.readFileSync(path.join(__dirname, '..', 'index2.html'), 'utf8');

  assert.strictEqual(redirectSource.includes('url=index.html'), true);
  assert.strictEqual(redirectSource.includes('window.location.search'), true);
  assert.strictEqual(redirectSource.includes('window.location.hash'), true);
  assert.strictEqual(redirectSource.includes('window.location.replace(target)'), true);
});

test('main map pipeline source has no legacy selection API and highlight does not render panels', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');
  const coreSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapCanvasRuntime.js'), 'utf8');
  const filtersSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapFilterRegistry.js'), 'utf8');
  const combinedSource = `${viewerSource}\n${coreSource}\n${filtersSource}`;

  [
    'selectBarony',
    'setSelectedBaronies',
    'currentSelectedId',
    'currentSelectedIds',
    'bypassActiveFilterForBaronySelection',
    'selectForBarony'
  ].forEach((legacyToken) => {
    assert.strictEqual(combinedSource.includes(legacyToken), false, `legacy token still present: ${legacyToken}`);
  });

  ['colorSources', 'resolveDefactoTitle'].forEach((proceduralToken) => {
    assert.strictEqual(filtersSource.includes(proceduralToken), false, `procedural token still present in mapFilterRegistry: ${proceduralToken}`);
  });

  [
    'resolveDefactoTitle',
    'resolveDefactoParent',
    'getDejureMapForTitle',
    'defactoParentCache',
    'refreshTitleConfig'
  ].forEach((legacyToken) => {
    assert.strictEqual(viewerSource.includes(legacyToken), false, `legacy hierarchy token still present in viewer: ${legacyToken}`);
  });

  ['function init', 'applyFilter', 'setColorMap', 'setCanonicalPatterns', 'colorMap'].forEach((runtimeToken) => {
    assert.strictEqual(filtersSource.includes(runtimeToken), false, `runtime token still present in mapFilterRegistry: ${runtimeToken}`);
  });

  ['createFilterRuntime', 'createFilterManager', 'applyFilter'].forEach((filterRuntimeToken) => {
    assert.strictEqual(coreSource.includes(filterRuntimeToken), false, `filter runtime token still present in mapCanvasRuntime: ${filterRuntimeToken}`);
  });

  assert.strictEqual(viewerSource.includes('mapFilterRegistry.init'), false);
  assert.strictEqual(viewerSource.includes('core.createFilterManager'), false);
  assert.strictEqual(viewerSource.includes('mapFilterRuntime.create'), true);
  assert.strictEqual(filtersSource.includes("type === 'religion'"), false);
  assert.strictEqual(filtersSource.includes("type === 'county_defacto'"), false);

  const highlightEntityBody = viewerSource.match(/function highlightEntity\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  const highlightBaroniesBody = viewerSource.match(/function highlightBaronies\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  const highlightSource = `${highlightBaroniesBody}\n${highlightEntityBody}`;

  [
    'showTitleInfo',
    'showSeigneurInfo',
    'handleSelect',
    'handleFilterChange',
    'filterManager.applyFilter',
    'filterSelect.value'
  ].forEach((renderToken) => {
    assert.strictEqual(highlightSource.includes(renderToken), false, `highlight should not render/select/filter: ${renderToken}`);
  });
});

test('main map selection classifies entities by explicit type before barony id fallback', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel.js'), 'utf8');

  assert.strictEqual(viewerSource.includes('|| baronyMeta[entity.id]'), false);
  assert.strictEqual(panelSource.includes('|| baronyMeta[entity.id]'), false);
  assert.strictEqual(viewerSource.includes('!entity._type && baronyMeta[entity.id]'), true);
  assert.strictEqual(panelSource.includes('!entity._type && baronyMeta[entity.id]'), true);
});

test('seigneur panel uses ViewModel barony titles with robust fallback comparison', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');
  const loaderSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapDataLoader.js'), 'utf8');
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel.js'), 'utf8');

  assert.strictEqual(viewerSource.includes('currentViewModel.seigneurs.list.forEach'), false);
  assert.strictEqual(loaderSource.includes('function buildSeigneurTitleIndexes'), false);
  assert.strictEqual(panelSource.includes('seigneur.titles?.[rankKey]'), true);
  assert.strictEqual(panelSource.includes('seigneur.titles?.barony'), true);
  assert.strictEqual(panelSource.includes('String(b.seigneur_id) === String(seigneurId)'), true);
  assert.strictEqual(panelSource.includes('seigneur.vassals'), true);
  assert.strictEqual(panelSource.includes('String(s.overlord_id) === String(seigneurId)'), true);
});

test('main map trade route lists define route and line ids before rendering buttons', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');

  assert.strictEqual(viewerSource.includes('const routeId = route.id;'), true);
  assert.strictEqual(viewerSource.includes('const lineId = line.id;'), true);
  assert.strictEqual(viewerSource.includes('data-id="${routeId}"'), true);
  assert.strictEqual(viewerSource.includes('data-id="${lineId}"'), true);
});

test('main map culture ranking reads canonical ViewModel baronies', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');
  const updateCultureBody = viewerSource.match(/function updateCultureRankingPanel\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';

  assert.strictEqual(viewerSource.includes('const cultureRankConfig = ['), true);
  assert.strictEqual(viewerSource.includes('const duchyPietyTitleBonusConfig = ['), true);
  assert.strictEqual(updateCultureBody.includes('getVm()?.baronies?.list'), true);
  assert.strictEqual(updateCultureBody.includes('info?.culture'), true);
  assert.strictEqual(viewerSource.includes("getSeigneurEntity(seigneurId)?.highestTitleRank || 'barony'"), true);
});

test('main map title panels render subtitle entities from ViewModel in the active mode', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel.js'), 'utf8');

  assert.strictEqual(viewerSource.includes('.map(entity => ({ rankKey: entity._type, id: entity.id }))'), false);
  assert.strictEqual(panelSource.includes('const childRank = item?._type || item?.rankKey;'), true);
  assert.strictEqual(panelSource.includes('setTitleHierarchyTable(feudalSection, infoFeudalBody, rankKey, titleInfo, targetMode || mode)'), true);
});

test('seigneur title links select the associated de facto filter', () => {
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel.js'), 'utf8');
  const showSeigneurBody = panelSource.match(/function showSeigneurInfo\([^)]*\) \{([\s\S]*?)\n    \}/)?.[1] || '';

  assert.strictEqual(showSeigneurBody.includes("mode: 'defacto'"), true);
  assert.strictEqual(showSeigneurBody.includes("mode: 'dejure'"), false);
});

test('duchy piety legend is not treated as title selection entries', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');

  assert.strictEqual(viewerSource.includes('titleFilter && !titleFilter.infoMode && id'), true);
});

test('title and duchy piety panel rendering lives in mapInfoPanel', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel.js'), 'utf8');
  const viewerSetTitleHierarchyBody = viewerSource.match(/function setTitleHierarchyTable\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  const viewerRenderPietyBody = viewerSource.match(/function renderDuchyPietyRankingPanel\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  const viewerRestoreTitleBody = viewerSource.match(/function restoreDefaultTitlePanelLayout\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';

  assert.strictEqual(panelSource.includes('function showTitleInfo'), true);
  assert.strictEqual(panelSource.includes('function setTitleHierarchyTable'), true);
  assert.strictEqual(panelSource.includes('function renderDuchyPietyRankingPanel'), true);
  assert.strictEqual(panelSource.includes('getDuchyPietyRows'), true);
  assert.strictEqual(panelSource.includes('Classement de piété ducal'), true);
  assert.strictEqual(viewerSource.includes('function getDuchyPietyRows'), true);
  assert.strictEqual(viewerSetTitleHierarchyBody.includes('getInfoPanelController().setTitleHierarchyTable'), true);
  assert.strictEqual(viewerRenderPietyBody.includes('getInfoPanelController().renderDuchyPietyRankingPanel'), true);
  assert.strictEqual(viewerRestoreTitleBody.includes('getInfoPanelController().restoreDefaultTitlePanelLayout'), true);
});

test('main map barony feudal table is prepared from ViewModel and rendered by mapInfoPanel', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel.js'), 'utf8');
  const getBaronyFeudalRowsBody = viewerSource.match(/function getBaronyFeudalRows\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';

  assert.strictEqual(viewerSource.includes('function setFeudalTable'), false);
  assert.strictEqual(panelSource.includes('function setFeudalTable'), true);
  assert.strictEqual(getBaronyFeudalRowsBody.includes('const vmBarony = getVmBarony(info);'), true);
  assert.strictEqual(getBaronyFeudalRowsBody.includes('vmBarony.dejure?.archduchy?.id'), true);
  assert.strictEqual(getBaronyFeudalRowsBody.includes('vmBarony.defacto?.archduchy?.id'), true);
});

test('main map title hierarchy rows pass title ids to the panel renderer', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer.js'), 'utf8');
  const getBaronyTitleIdBody = viewerSource.match(/function getBaronyTitleId\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  const getTitleHierarchyRowsBody = viewerSource.match(/function getTitleHierarchyRows\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';

  assert.strictEqual(viewerSource.includes('function normalizeTitleId'), true);
  assert.strictEqual(getBaronyTitleIdBody.includes('return normalizeTitleId(title);'), true);
  assert.strictEqual(getTitleHierarchyRowsBody.includes('getDeJureAncestors'), true);
  assert.strictEqual(getTitleHierarchyRowsBody.includes("getBaronyTitleId(sampleBarony, parentRank, 'dejure')"), false);
});

test('mapFilterRegistry exposes straightforward filters through the new click selection contract', () => {
  const registry = mapFilterRegistry.createRegistry();
  const expectedIds = [
    'religion', 'seigneur_religion', 'culture', 'priory', 'church', 'cathedral', 'occupation', 'vacant',
    'viscounty', 'viscounty_defacto', 'county', 'county_defacto', 'marquisate', 'marquisate_defacto',
    'duchy', 'duchy_defacto', 'archduchy', 'archduchy_defacto', 'kingdom', 'kingdom_defacto',
    'empire', 'empire_defacto'
  ];

  expectedIds.forEach((id) => {
    assert.ok(registry.byId[id], `missing filter ${id}`);
    assert.strictEqual(registry.byId[id].straightforward, true);
    assert.strictEqual(typeof registry.byId[id].colorForBarony, 'function');
    assert.strictEqual(typeof registry.byId[id].legendEntityForBarony, 'function');
    assert.strictEqual(typeof registry.byId[id].selectEntityForBaronyClick, 'function');
    assert.strictEqual(registry.byId[id].selectForBarony, undefined);
  });
});
