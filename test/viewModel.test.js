const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const viewModel = require('../viewModel');
const mapCore2 = require('../src/mapCore2');
const { breadthFirst } = require('../src/bfs2');
global.breadthFirst = breadthFirst;
require('../src/duchyPiety2');
const mapFilters2 = require('../src/mapFilters2');

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
    canonicalLands: [],
    sanctuaries: [],
    baronyConnections: []
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
    canonicalLandMap: {},
    sanctuaryMap: {},
    baronyAdjacency: {},
    tradeRouteById: {},
    tradeLineById: {},
    tradeRouteConnections: {},
    tradeLineConnections: {},
    selection: { mapId: null },
    seigneurToViscounty: {},
    seigneurToCounty: {},
    seigneurToMarquisate: {},
    seigneurToDuchy: {},
    seigneurToArchduchy: {},
    seigneurToKingdom: {},
    seigneurToEmpire: {},
    ...dataOverrides
  };
  const manager = mapCore2.createFilterRuntime(core, data, mapFilters2.createRegistry(), {
    updateLegend(legend) {
      captured.legend = legend;
    }
  });
  return { manager, captured, data };
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

test('mapFilters2 lambda filters color and select direct barony references', () => {
  const vm = buildVm();
  const barony = vm.getEntity('barony', 100);
  const registry = mapFilters2.createRegistry();
  const ctx = { vm, colorForEntity: (entity) => entity?.color || '#999999' };

  assert.strictEqual(registry.byId.religion.colorForBarony(barony, ctx), '#112233');
  assert.strictEqual(registry.byId.religion.selectEntityForBaronyClick(barony, ctx), barony.religion);
  assert.strictEqual(registry.byId.culture.colorForBarony(barony, ctx), '#445566');
  assert.strictEqual(registry.byId.culture.selectEntityForBaronyClick(barony, ctx), barony.culture);
  assert.strictEqual(registry.byId.seigneur_religion.selectEntityForBaronyClick(barony, ctx), barony.seigneur.religion || barony);
  assert.strictEqual(registry.byId.duchy.selectEntityForBaronyClick(barony, ctx), barony.dejure.duchy);
});

test('mapFilters2 de facto title filter selects skipped-rank target and falls back to barony', () => {
  const vm = buildVm({
    baronies: [
      { id: 100, name: 'Baronnie A', seigneur_id: 1, county_id: 10, defacto_county_id: 20 },
      { id: 101, name: 'Baronnie B', seigneur_id: 1 }
    ]
  });
  const registry = mapFilters2.createRegistry();
  const ctx = { vm, colorForEntity: (entity) => entity?.color || '#999999' };
  const withTarget = vm.getEntity('barony', 100);
  const withoutTarget = vm.getEntity('barony', 101);

  assert.strictEqual(registry.byId.county_defacto.selectEntityForBaronyClick(withTarget, ctx), withTarget.defacto.county);
  assert.strictEqual(registry.byId.empire_defacto.selectEntityForBaronyClick(withoutTarget, ctx), withoutTarget);
});

test('map click pipeline uses active filter while panel selection keeps the direct entity', () => {
  const vm = buildVm();
  const registry = mapFilters2.createRegistry();
  const barony = vm.getEntity('barony', 100);

  function resolveMapClickTarget(clickedBarony, filterId) {
    const filter = registry.byId[filterId];
    return filter?.selectEntityForBaronyClick
      ? filter.selectEntityForBaronyClick(clickedBarony, { vm })
      : clickedBarony;
  }

  const mapClickTarget = resolveMapClickTarget(barony, 'county');
  const panelSelectionTarget = barony;

  assert.strictEqual(mapClickTarget, barony.dejure.county);
  assert.strictEqual(panelSelectionTarget, barony);
});

test('mapCore2 filter runtime applies straightforward filters through colorMap and legend', () => {
  const vm = buildVm();
  const { manager, captured } = createFilterHarness(vm);

  manager.applyFilter('religion');

  assert.deepStrictEqual(captured.colorMap['100'], [17, 34, 51, 255]);
  assert.deepStrictEqual(captured.patterns, {});
  assert.strictEqual(captured.legend['1'].name, 'Religion A');
});

test('mapCore2 filter runtime applies de facto title filters from ViewModel references', () => {
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

test('mapCore2 filter runtime dispatches distance, canonical, sanctuary, trade and duchy piety filters', () => {
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
    ]
  });

  const distanceHarness = createFilterHarness(vm, {
    selection: { mapId: '100' },
    baronyAdjacency: {
      100: [{ id: 101, distance: 2 }],
      101: [{ id: 100, distance: 2 }]
    }
  });
  distanceHarness.manager.applyFilter('distance');
  assert.ok(distanceHarness.captured.colorMap['100']);
  assert.ok(distanceHarness.captured.colorMap['101']);
  assert.strictEqual(distanceHarness.captured.legend, null);

  const canonicalHarness = createFilterHarness(vm, {
    canonicalLandMap: { 100: [101] }
  });
  canonicalHarness.manager.applyFilter('canonical');
  assert.deepStrictEqual(canonicalHarness.captured.colorMap['100'], [171, 205, 239, 255]);
  assert.deepStrictEqual(canonicalHarness.captured.patterns['100'][0], [171, 205, 239]);
  assert.strictEqual(canonicalHarness.captured.legend['101'].name, 'Baronnie B');

  const sanctuaryHarness = createFilterHarness(vm, {
    sanctuaryMap: { 100: [{ religion_id: 1 }] }
  });
  sanctuaryHarness.manager.applyFilter('sanctuary');
  assert.deepStrictEqual(sanctuaryHarness.captured.colorMap['100'], [17, 34, 51, 255]);
  assert.strictEqual(sanctuaryHarness.captured.patterns['100'].length, 3);

  const tradeHarness = createFilterHarness(vm, {
    selection: { mapId: '100' },
    tradeRouteConnections: { 100: [101] },
    tradeLineConnections: { 100: [101] }
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

test('index2 pipeline source has no legacy selection API and highlight does not render panels', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer2.js'), 'utf8');
  const coreSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapCore2.js'), 'utf8');
  const filtersSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapFilters2.js'), 'utf8');
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
    assert.strictEqual(filtersSource.includes(proceduralToken), false, `procedural token still present in mapFilters2: ${proceduralToken}`);
  });

  ['function init', 'applyFilter', 'setColorMap', 'setCanonicalPatterns', 'colorMap'].forEach((runtimeToken) => {
    assert.strictEqual(filtersSource.includes(runtimeToken), false, `runtime token still present in mapFilters2: ${runtimeToken}`);
  });

  assert.strictEqual(viewerSource.includes('mapFilters2.init'), false);
  assert.strictEqual(viewerSource.includes('core.createFilterManager'), true);
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

test('mapFilters2 exposes straightforward filters through the new click selection contract', () => {
  const registry = mapFilters2.createRegistry();
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
