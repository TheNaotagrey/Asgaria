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
  const registry = mapFilters2.createRegistry();

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

test('mapFilters2 simple lambda filters color by group but select clicked barony', () => {
  const vm = buildVm();
  const barony = vm.getEntity('barony', 100);
  const registry = mapFilters2.createRegistry();
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

test('duchy piety filter selects the de jure duchy for map clicks', () => {
  const vm = buildVm();
  const registry = mapFilters2.createRegistry();
  const barony = vm.getEntity('barony', 100);

  assert.strictEqual(registry.byId.duchy_piety_ranking.kind, 'duchy_piety_ranking');
  assert.strictEqual(registry.byId.duchy_piety_ranking.mode, 'dejure');
  assert.strictEqual(registry.byId.duchy_piety_ranking.selectEntityForBaronyClick(barony, { vm }), barony.dejure.duchy);
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
  const duchyPietyTarget = resolveMapClickTarget(barony, 'duchy_piety_ranking');
  const simpleFilterTarget = resolveMapClickTarget(barony, 'religion');
  const panelSelectionTarget = barony;

  assert.strictEqual(mapClickTarget, barony.dejure.county);
  assert.strictEqual(duchyPietyTarget, barony.dejure.duchy);
  assert.strictEqual(simpleFilterTarget, barony);
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

  [
    'resolveDefactoTitle',
    'resolveDefactoParent',
    'getDejureMapForTitle',
    'defactoParentCache',
    'refreshTitleConfig'
  ].forEach((legacyToken) => {
    assert.strictEqual(viewerSource.includes(legacyToken), false, `legacy hierarchy token still present in viewer2: ${legacyToken}`);
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

test('index2 selection classifies entities by explicit type before barony id fallback', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer2.js'), 'utf8');
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel2.js'), 'utf8');

  assert.strictEqual(viewerSource.includes('|| baronyMeta[entity.id]'), false);
  assert.strictEqual(panelSource.includes('|| baronyMeta[entity.id]'), false);
  assert.strictEqual(viewerSource.includes('!entity._type && baronyMeta[entity.id]'), true);
  assert.strictEqual(panelSource.includes('!entity._type && baronyMeta[entity.id]'), true);
});

test('seigneur panel uses ViewModel barony titles with robust fallback comparison', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer2.js'), 'utf8');
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel2.js'), 'utf8');

  assert.strictEqual(viewerSource.includes('currentViewModel.seigneurs.list.forEach'), true);
  assert.strictEqual(panelSource.includes('seigneur.titles?.barony'), true);
  assert.strictEqual(panelSource.includes('String(b.seigneur_id) === String(seigneurId)'), true);
});

test('seigneur title links select the associated de facto filter', () => {
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel2.js'), 'utf8');
  const showSeigneurBody = panelSource.match(/function showSeigneurInfo\([^)]*\) \{([\s\S]*?)\n    \}/)?.[1] || '';

  assert.strictEqual(showSeigneurBody.includes("mode: 'defacto'"), true);
  assert.strictEqual(showSeigneurBody.includes("mode: 'dejure'"), false);
});

test('duchy piety legend is not treated as title selection entries', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer2.js'), 'utf8');

  assert.strictEqual(viewerSource.includes('titleFilter && !titleFilter.infoMode && id'), true);
});

test('title and duchy piety panel rendering lives in mapInfoPanel2', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer2.js'), 'utf8');
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel2.js'), 'utf8');
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

test('index2 barony feudal table is prepared from ViewModel and rendered by mapInfoPanel2', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer2.js'), 'utf8');
  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'mapInfoPanel2.js'), 'utf8');
  const getBaronyFeudalRowsBody = viewerSource.match(/function getBaronyFeudalRows\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';

  assert.strictEqual(viewerSource.includes('function setFeudalTable'), false);
  assert.strictEqual(panelSource.includes('function setFeudalTable'), true);
  assert.strictEqual(getBaronyFeudalRowsBody.includes('const vmBarony = getVmBarony(info);'), true);
  assert.strictEqual(getBaronyFeudalRowsBody.includes('vmBarony.dejure?.archduchy?.id'), true);
  assert.strictEqual(getBaronyFeudalRowsBody.includes('vmBarony.defacto?.archduchy?.id'), true);
});

test('index2 title hierarchy rows pass title ids to the panel renderer', () => {
  const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'viewer2.js'), 'utf8');
  const getBaronyTitleIdBody = viewerSource.match(/function getBaronyTitleId\([^)]*\) \{([\s\S]*?)\n  \}/)?.[1] || '';

  assert.strictEqual(getBaronyTitleIdBody.includes("typeof title === 'object' ? title.id : title"), true);
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
