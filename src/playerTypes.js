(function (root) {
  const types = [
    { id: 'seigneur', name: 'Seigneur' },
    { id: 'eveque', name: 'Évêque' },
    { id: 'pirate', name: 'Pirate' },
    { id: 'mercenaire', name: 'Mercenaire' }
  ];
  const availabilityFields = types.map(type => `available_${type.id}`);
  const availabilityDefaults = { available_seigneur: 1, available_eveque: 1, available_pirate: 0, available_mercenaire: 0 };
  function isValidType(type) { return types.some(entry => entry.id === type); }
  function isBuildingAvailable(building, type = 'seigneur') {
    if (!isValidType(type)) return false;
    const value = building[`available_${type}`];
    if (value == null) return availabilityDefaults[`available_${type}`] === 1;
    return value === true || value === 1 || value === '1';
  }
  const api = { types, availabilityFields, availabilityDefaults, isValidType, isBuildingAvailable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlayerTypes = api;
})(typeof window !== 'undefined' ? window : globalThis);
