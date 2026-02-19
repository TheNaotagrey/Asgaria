(function (global) {
  function hexToRgba(hex, alpha = 255) {
    if (!hex || typeof hex !== 'string') return null;
    const raw = hex.replace('#', '').trim();
    if (raw.length !== 6) return null;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return [r, g, b, alpha];
  }

  function randomColor(seed) {
    let h = 0;
    const s = String(seed || 'x');
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
    const c = (n) => {
      const k = (n + h / 30) % 12;
      const a = 0.55 * Math.min(0.58, 1 - 0.58);
      return Math.round(255 * (0.58 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
    };
    return [c(0), c(8), c(4), 255];
  }

  function create(vm, options = {}) {
    const terrain = [239, 228, 176, 255];
    const mapMode = options.mapMode || 'land';

    function entityColor(entity, fallbackSeed) {
      return hexToRgba(entity?.color) || randomColor(fallbackSeed || entity?.id);
    }

    function byBarony(resolver, legendType = null) {
      const colorMap = {};
      const legend = new Map();
      (options.baronyList || vm.baronies.list).forEach((b) => {
        const entry = resolver(b);
        if (!entry) {
          colorMap[b.id] = terrain;
          return;
        }
        const col = entityColor(entry.entity, `${legendType}:${entry.id}`);
        colorMap[b.id] = col;
        if (legendType && !legend.has(String(entry.id))) {
          legend.set(String(entry.id), {
            label: entry.label || entry.entity?.name || `${legendType} #${entry.id}`,
            color: col,
            selection: { type: legendType, id: String(entry.id) }
          });
        }
      });
      return { colorMap, legendItems: [...legend.values()] };
    }

    function titleResolver(rankKey, mode) {
      return (b) => {
        const title = vm.getBaronyTitleId(b.id, rankKey, mode);
        if (!title) return null;
        return { id: title.id, entity: title, label: title.name };
      };
    }

    function filterDistance(context) {
      const selectedId = context?.selected?.baronyId;
      if (!selectedId) return { colorMap: {}, legendItems: [] };
      const { distanceMap } = bfs2.computeBaronyDistances({
        start: selectedId,
        viewModel: mapMode === 'land' ? vm : null,
        adjacencyMap: context?.adjacencyMap
      });
      const colorMap = {};
      Object.entries(distanceMap).forEach(([id, dist]) => {
        colorMap[id] = randomColor(`dist:${dist}`);
      });
      return {
        colorMap,
        legendItems: [{ label: 'Distance depuis la sélection', color: [80, 80, 80, 255] }]
      };
    }

    function filterTradeRoutes(context) {
      const colorMap = {};
      const connections = context?.tradeRouteConnections || {};
      const selected = context?.selected?.baronyId;
      if (!selected) return { colorMap, legendItems: [] };
      const neighbors = connections[String(selected)] || [];
      neighbors.forEach((id) => { colorMap[String(id)] = [46, 204, 113, 255]; });
      colorMap[String(selected)] = [255, 159, 67, 255];
      return {
        colorMap,
        legendItems: [{ label: 'Route(s) commerciale(s)', color: [46, 204, 113, 255] }]
      };
    }

    function filterOccupation() {
      return byBarony((b) => {
        if (!b.seigneur) return { id: 'none', entity: { color: '#efe4b0' }, label: 'Aucun' };
        if (b.seigneur.player && b.seigneur.bishop) return { id: 'player_bishop', entity: { color: '#ff6a06' }, label: 'Joueur (évêque)' };
        if (b.seigneur.player) return { id: 'player_seigneur', entity: { color: '#24a321' }, label: 'Joueur' };
        if (b.seigneur.bishop) return { id: 'npc_bishop', entity: { color: '#7f7f7f' }, label: 'PNJ (évêque)' };
        return { id: 'npc_seigneur', entity: { color: '#c3c3c3' }, label: 'PNJ' };
      }, 'occupation');
    }

    function filterVacant() {
      return byBarony((b) => b.vacant
        ? { id: 'vacant', entity: { color: '#efe4b0' }, label: 'Vacante' }
        : { id: 'occupied', entity: { color: '#52be80' }, label: 'Occupée' }, 'vacant');
    }

    function filterSanctuary() {
      return byBarony((b) => {
        if (!b.sanctuaries?.length) return null;
        const active = b.sanctuaries.find((s) => String(s.religion_id) === String(b.religion_pop_id));
        const chosen = active || b.sanctuaries[0];
        return { id: chosen.religion_id, entity: chosen.religion, label: chosen.religion?.name || 'Sanctuaire' };
      }, 'religion');
    }

    function seaFilters(context) {
      const filters = [
        { id: '', label: 'Aucun' },
        { id: 'distance', label: 'Distance' },
        { id: 'baronies', label: 'Baronnies liées' }
      ];
      const strategies = {
        '': () => ({ colorMap: {}, legendItems: [] }),
        distance: (ctx) => filterDistance({ ...ctx, adjacencyMap: context.zoneAdjacency }),
        baronies: () => {
          const colorMap = {};
          const selected = context?.selected?.baronyId;
          const linked = context?.zoneBaronies?.[String(selected)] || [];
          linked.forEach((id) => { colorMap[String(id)] = [52, 152, 219, 255]; });
          return { colorMap, legendItems: [{ label: 'Baronnies liées', color: [52, 152, 219, 255] }] };
        }
      };
      return { filters, strategies };
    }

    const landFilters = [
      { id: 'religion', label: 'Religion de la Population' },
      { id: 'seigneur_religion', label: 'Religion du seigneur' },
      { id: 'sanctuary', label: 'Sanctuaire' },
      { id: 'priory', label: 'Prieuré' },
      { id: 'church', label: 'Église' },
      { id: 'cathedral', label: 'Cathédrale' },
      { id: 'canonical', label: 'Terres canoniques' },
      { id: 'duchy_piety_ranking', label: 'Classement de piété ducal' },
      { id: 'culture', label: 'Culture' },
      { id: '', label: 'Baronnies' },
      { id: 'viscounty', label: 'Vicomté de jure' },
      { id: 'viscounty_defacto', label: 'Vicomté de facto' },
      { id: 'county', label: 'Comté de jure' },
      { id: 'county_defacto', label: 'Comté de facto' },
      { id: 'marquisate', label: 'Marquisat de jure' },
      { id: 'marquisate_defacto', label: 'Marquisat de facto' },
      { id: 'duchy', label: 'Duché de jure' },
      { id: 'duchy_defacto', label: 'Duché de facto' },
      { id: 'archduchy', label: 'Archiduché de jure' },
      { id: 'archduchy_defacto', label: 'Archiduché de facto' },
      { id: 'kingdom', label: 'Royaume de jure' },
      { id: 'kingdom_defacto', label: 'Royaume de facto' },
      { id: 'empire', label: 'Empire de jure' },
      { id: 'empire_defacto', label: 'Empire de facto' },
      { id: 'trade_routes', label: 'Routes commerciales' },
      { id: 'distance', label: 'Distance' },
      { id: 'occupation', label: 'Occupation' },
      { id: 'vacant', label: 'Baronnies vacantes' }
    ];

    const landStrategies = {
      '': () => byBarony((b) => ({ id: b.id, entity: b, label: b.name }), null),
      religion: () => byBarony((b) => b.religion ? ({ id: b.religion.id, entity: b.religion, label: b.religion.name }) : null, 'religion'),
      seigneur_religion: () => byBarony((b) => b.seigneur?.religion ? ({ id: b.seigneur.religion.id, entity: b.seigneur.religion, label: b.seigneur.religion.name }) : null, 'religion'),
      sanctuary: () => filterSanctuary(),
      priory: () => byBarony((b) => b.prioryReligion ? ({ id: b.prioryReligion.id, entity: b.prioryReligion, label: b.prioryReligion.name }) : null, 'religion'),
      church: () => byBarony((b) => b.churchReligion ? ({ id: b.churchReligion.id, entity: b.churchReligion, label: b.churchReligion.name }) : null, 'religion'),
      cathedral: () => byBarony((b) => b.cathedralReligion ? ({ id: b.cathedralReligion.id, entity: b.cathedralReligion, label: b.cathedralReligion.name }) : null, 'religion'),
      canonical: () => byBarony((b) => b.canonicalFor?.[0] ? ({ id: b.canonicalFor[0].id, entity: b.canonicalFor[0], label: b.canonicalFor[0].name }) : null, 'barony'),
      duchy_piety_ranking: () => {
        const stats = duchyPiety2.computeDuchyPietyStats(vm, { includeTieBreakBonus: true });
        const winners = duchyPiety2.buildDuchyPietyWinnersFromStats(stats, vm.religions.byId);
        return byBarony((b) => {
          const duchy = vm.getBaronyTitleId(b.id, 'duchy', 'dejure');
          const winnerId = duchy ? winners[String(duchy.id)] : null;
          const rel = winnerId ? vm.getEntity('religion', winnerId) : null;
          return rel ? ({ id: rel.id, entity: rel, label: rel.name }) : null;
        }, 'religion');
      },
      culture: () => byBarony((b) => b.culture ? ({ id: b.culture.id, entity: b.culture, label: b.culture.name }) : { id: 'none', entity: { color: '#efe4b0' }, label: 'Aucune' }, 'culture'),
      viscounty: () => byBarony(titleResolver('viscounty', 'dejure'), 'viscounty'),
      viscounty_defacto: () => byBarony(titleResolver('viscounty', 'defacto'), 'viscounty'),
      county: () => byBarony(titleResolver('county', 'dejure'), 'county'),
      county_defacto: () => byBarony(titleResolver('county', 'defacto'), 'county'),
      marquisate: () => byBarony(titleResolver('marquisate', 'dejure'), 'marquisate'),
      marquisate_defacto: () => byBarony(titleResolver('marquisate', 'defacto'), 'marquisate'),
      duchy: () => byBarony(titleResolver('duchy', 'dejure'), 'duchy'),
      duchy_defacto: () => byBarony(titleResolver('duchy', 'defacto'), 'duchy'),
      archduchy: () => byBarony(titleResolver('archduchy', 'dejure'), 'archduchy'),
      archduchy_defacto: () => byBarony(titleResolver('archduchy', 'defacto'), 'archduchy'),
      kingdom: () => byBarony(titleResolver('kingdom', 'dejure'), 'kingdom'),
      kingdom_defacto: () => byBarony(titleResolver('kingdom', 'defacto'), 'kingdom'),
      empire: () => byBarony(titleResolver('empire', 'dejure'), 'empire'),
      empire_defacto: () => byBarony(titleResolver('empire', 'defacto'), 'empire'),
      trade_routes: (ctx) => filterTradeRoutes(ctx),
      distance: (ctx) => filterDistance(ctx),
      occupation: () => filterOccupation(),
      vacant: () => filterVacant()
    };

    function getFilters(context = {}) {
      if (mapMode === 'sea') return seaFilters(context).filters.slice();
      return landFilters.slice();
    }

    function applyFilter(filterId, context = {}) {
      if (mapMode === 'sea') {
        const { strategies } = seaFilters(context);
        return (strategies[filterId] || strategies[''])(context);
      }
      const strategy = landStrategies[filterId] || landStrategies[''];
      return strategy(context);
    }

    return { getFilters, applyFilter };
  }

  global.mapFilters2 = { create };
})(typeof window !== 'undefined' ? window : globalThis);
