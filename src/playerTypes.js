(function (root) {
  const types = [
    { id: 'seigneur', name: 'Seigneur' },
    { id: 'eveque', name: 'Évêque' },
    { id: 'pirate', name: 'Pirate' },
    { id: 'mercenaire', name: 'Mercenaire' }
  ];
  function isValidType(type) { return types.some(entry => entry.id === type); }
  function isBuildingAvailable(building, type = 'seigneur') {
    return isValidType(type) && (building.player_type ?? 'seigneur') === type;
  }
  const api = { types, isValidType, isBuildingAvailable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlayerTypes = api;
})(typeof window !== 'undefined' ? window : globalThis);
