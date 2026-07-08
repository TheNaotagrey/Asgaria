(function (global) {
  const RANK_LABELS = {
    barony: 'Baronnie',
    viscounty: 'Vicomté',
    county: 'Comté',
    marquisate: 'Marquisat',
    duchy: 'Duché',
    archduchy: 'Archiduché',
    kingdom: 'Royaume',
    empire: 'Empire'
  };

  const TITLE_PREFIXES = {
    barony: 'Baronnie de',
    viscounty: 'Vicomté de',
    county: 'Comté de',
    marquisate: 'Marquisat de',
    duchy: 'Duché de',
    archduchy: 'Archiduché de',
    kingdom: 'Royaume de',
    empire: 'Empire de'
  };

  const PLURALS = {
    barony: 'Baronnies',
    viscounty: 'Vicomtés',
    county: 'Comtés',
    marquisate: 'Marquisats',
    duchy: 'Duchés',
    archduchy: 'Archiduchés',
    kingdom: 'Royaumes',
    empire: 'Empires',
    seigneur: 'Seigneurs',
    religion: 'Religions',
    culture: 'Cultures'
  };

  function name(entity, fallback = 'Entité inconnue') {
    if (!entity) return fallback;
    return entity.name || entity.nom || entity.label || `${entity._type || 'entité'} #${entity.id}`;
  }

  function title(entity) {
    if (!entity) return 'Titre inconnu';
    const rank = entity._type;
    const prefix = TITLE_PREFIXES[rank];
    return prefix ? `${prefix} ${name(entity, `#${entity.id}`)}` : name(entity);
  }

  function typeLabel(type) {
    return RANK_LABELS[type] || {
      seigneur: 'Seigneur',
      religion: 'Religion',
      culture: 'Culture',
      maritimeZone: 'Zone maritime',
      filterLegend: 'Légende'
    }[type] || 'Entité';
  }

  function entity(entityValue) {
    if (!entityValue) return 'Entité inconnue';
    if (RANK_LABELS[entityValue._type]) return title(entityValue);
    if (entityValue._type === 'maritimeZone') return `Zone maritime ${name(entityValue, `#${entityValue.id}`)}`;
    return name(entityValue);
  }

  const api = {
    RANK_LABELS,
    TITLE_PREFIXES,
    PLURALS,
    name,
    title,
    entity,
    typeLabel,
    plural: (type) => PLURALS[type] || `${typeLabel(type)}s`
  };

  global.viewModelLabels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
