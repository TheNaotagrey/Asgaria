(function (global) {

  const TITLE_FILTER_RANKS = ['viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'];

  function syntheticEntity(id, name, color = null) {
    return { id, name, color, _type: 'filterSynthetic' };
  }

  function isVacantEntityBarony(barony) {
    return !!barony?.vacant;
  }

  function getOccupationEntity(barony) {
    if (isVacantEntityBarony(barony)) return syntheticEntity('unoccupied', 'Non occupée', '#efe4b0');
    const owner = barony?.seigneur;
    if (!owner) return syntheticEntity('unoccupied', 'Non occupée', '#efe4b0');
    if (owner.player && owner.bishop) return syntheticEntity('player_bishop', 'Joueur Évêque', '#ff6a06');
    if (owner.player) return syntheticEntity('player_seigneur', 'Joueur Seigneur', '#24a321');
    if (owner.bishop) return syntheticEntity('npc_bishop', 'PNJ Évêque', '#7f7f7f');
    return syntheticEntity('npc_seigneur', 'PNJ Seigneur', '#c3c3c3');
  }

  function getVacancyEntity(barony) {
    return isVacantEntityBarony(barony)
      ? syntheticEntity('vacant', 'Vacante', '#efe4b0')
      : syntheticEntity('occupied', 'Occupée', '#52be80');
  }

  function selectClickedBarony(barony) {
    return barony || null;
  }

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }

  const tradeRoutePrimaryColor = [36, 163, 33, 102];
  const tradeRouteLandColor = [255, 106, 6];
  const tradeRouteSeaColor = [52, 152, 219];

  function getDistanceColorForBarony(barony) {
    const d = barony?.distanceToSelected;
    if (d === undefined || d < 0) return null;
    const hue = (d * 40) % 360;
    return hslToRgb(hue, 65, 65);
  }

  function getTradeRouteColorForBarony(barony, selected) {
    if (!barony || !selected) return null;
    if (String(barony.id) === String(selected.id)) return tradeRoutePrimaryColor;
    if ((selected.landTradeBaronies || []).some(target => String(target.id) === String(barony.id))) {
      return tradeRouteLandColor;
    }
    if ((selected.seaTradeBaronies || []).some(target => String(target.id) === String(barony.id))) {
      return tradeRouteSeaColor;
    }
    return null;
  }

  function getTradeRoutePatternForBarony(barony, selected) {
    if (!barony || !selected || String(barony.id) === String(selected.id)) return null;
    const hasLand = (selected.landTradeBaronies || []).some(target => String(target.id) === String(barony.id));
    const hasSea = (selected.seaTradeBaronies || []).some(target => String(target.id) === String(barony.id));
    return hasLand && hasSea ? [tradeRouteLandColor, tradeRouteSeaColor] : null;
  }

  function createRegistry() {
    const titleFilter = (rank, mode) => ({
      id: mode === 'defacto' ? `${rank}_defacto` : rank,
      kind: 'barony',
      rank,
      mode,
      straightforward: true,
      colorForBarony: (barony) => barony?.[mode]?.[rank]?.color || null,
      selectEntityForBaronyClick: (barony) => barony?.[mode]?.[rank] || barony,
      legendEntityForBarony: (barony) => barony?.[mode]?.[rank] || null
    });
    const filters = [
      {
        id: 'religion',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.religion?.color || null,
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: (barony) => barony?.religion || null
      },
      {
        id: 'seigneur_religion',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.vacant ? null : barony?.seigneur?.religion?.color || null,
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: (barony) => barony?.vacant ? null : barony?.seigneur?.religion || null
      },
      {
        id: 'culture',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.culture?.color || null,
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: (barony) => barony?.culture || syntheticEntity('none', 'Aucune', '#efe4b0')
      },
      {
        id: 'priory',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.prioryReligion?.color || null,
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: (barony) => barony?.prioryReligion || null
      },
      {
        id: 'church',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.churchReligion?.color || null,
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: (barony) => barony?.churchReligion || null
      },
      {
        id: 'cathedral',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.cathedralReligion?.color || null,
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: (barony) => barony?.cathedralReligion || null
      },
      {
        id: 'occupation',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => getOccupationEntity(barony).color,
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: (barony) => getOccupationEntity(barony)
      },
      {
        id: 'vacant',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => getVacancyEntity(barony).color,
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: (barony) => getVacancyEntity(barony)
      },
      ...TITLE_FILTER_RANKS.flatMap((rank) => [titleFilter(rank, 'dejure'), titleFilter(rank, 'defacto')]),
      {
        id: 'distance',
        kind: 'baronyBasedOnSelected',
        straightforward: true,
        colorForBarony: (barony) => getDistanceColorForBarony(barony),
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: () => null,
        onSelectBarony: (selected, vm) => vm?.applyDistancesToBaronies?.(selected?.id || null)
      },
      {
        id: 'trade_routes',
        kind: 'baronyBasedOnSelected',
        straightforward: true,
        colorForBarony: (barony, selected) => getTradeRouteColorForBarony(barony, selected),
        patternForBarony: (barony, selected) => getTradeRoutePatternForBarony(barony, selected),
        selectEntityForBaronyClick: selectClickedBarony,
        legendEntityForBarony: () => null,
        legendData: {
          land: { color: tradeRouteLandColor, name: 'Route (terre)' },
          sea: { color: tradeRouteSeaColor, name: 'Ligne (mer)' }
        }
      },
      { id: 'canonical', kind: 'canonical' },
      { id: 'sanctuary', kind: 'sanctuary' },
      {
        id: 'duchy_piety_ranking',
        kind: 'barony',
        straightforward: true,
        rank: 'duchy',
        mode: 'dejure',
        colorForBarony: (barony) => barony?.duchyPietyWinnerReligion?.color || null,
        legendEntityForBarony: (barony) => barony?.duchyPietyWinnerReligion || null,
        selectEntityForBaronyClick: (barony) => barony?.dejure?.duchy || barony
      },
      { id: 'baronies', kind: 'sea_baronies' }
    ];
    return {
      list: filters,
      byId: Object.fromEntries(filters.map((filter) => [filter.id, filter]))
    };
  }

  function getFilterDefinition(filterId) {
    return createRegistry().byId[filterId] || null;
  }

  const api = { createRegistry, getFilterDefinition };
  global.mapFilterRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
