(function (global) {

  const TITLE_FILTER_RANKS = ['viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'];

  function syntheticEntity(id, name, color = null) {
    return { id, name, color, _type: 'filterSynthetic' };
  }

  function isVacantEntityBarony(barony) {
    return !!(barony && (barony.vacant === 1 || barony.vacant === '1' || barony.vacant === true));
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
        selectEntityForBaronyClick: (barony) => barony?.religion || barony,
        legendEntityForBarony: (barony) => barony?.religion || null
      },
      {
        id: 'seigneur_religion',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.seigneur?.religion?.color || null,
        selectEntityForBaronyClick: (barony) => barony?.seigneur?.religion || barony,
        legendEntityForBarony: (barony) => barony?.seigneur?.religion || null
      },
      {
        id: 'culture',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.culture?.color || null,
        selectEntityForBaronyClick: (barony) => barony?.culture || barony,
        legendEntityForBarony: (barony) => barony?.culture || syntheticEntity('none', 'Aucune', '#efe4b0')
      },
      {
        id: 'priory',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.prioryReligion?.color || null,
        selectEntityForBaronyClick: (barony) => barony?.prioryReligion || barony,
        legendEntityForBarony: (barony) => barony?.prioryReligion || null
      },
      {
        id: 'church',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.churchReligion?.color || null,
        selectEntityForBaronyClick: (barony) => barony?.churchReligion || barony,
        legendEntityForBarony: (barony) => barony?.churchReligion || null
      },
      {
        id: 'cathedral',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => barony?.cathedralReligion?.color || null,
        selectEntityForBaronyClick: (barony) => barony?.cathedralReligion || barony,
        legendEntityForBarony: (barony) => barony?.cathedralReligion || null
      },
      {
        id: 'occupation',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => getOccupationEntity(barony).color,
        selectEntityForBaronyClick: (barony) => getOccupationEntity(barony),
        legendEntityForBarony: (barony) => getOccupationEntity(barony)
      },
      {
        id: 'vacant',
        kind: 'barony',
        straightforward: true,
        colorForBarony: (barony) => getVacancyEntity(barony).color,
        selectEntityForBaronyClick: (barony) => getVacancyEntity(barony),
        legendEntityForBarony: (barony) => getVacancyEntity(barony)
      },
      ...TITLE_FILTER_RANKS.flatMap((rank) => [titleFilter(rank, 'dejure'), titleFilter(rank, 'defacto')]),
      { id: 'distance', kind: 'distance' },
      { id: 'trade_routes', kind: 'trade_routes' },
      { id: 'canonical', kind: 'canonical' },
      { id: 'sanctuary', kind: 'sanctuary' },
      { id: 'duchy_piety_ranking', kind: 'duchy_piety_ranking' },
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
  global.mapFilters2 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
