(function (global) {
  const RANK_SEQUENCE = ['barony', 'viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'];
  const TITLE_RANKS = RANK_SEQUENCE.slice(1);

  const ENTITY_CONFIG = {
    seigneurs: { aliases: ['seigneurs', 'seigneurMap'], type: 'seigneur' },
    religions: { aliases: ['religions', 'religionMap'], type: 'religion' },
    cultures: { aliases: ['cultures', 'cultureMap', 'cultureMapInfo'], type: 'culture' },
    baronies: { aliases: ['baronies', 'baronyMeta'], type: 'barony' },
    viscounties: { aliases: ['viscounties', 'viscountyMap'], type: 'viscounty' },
    counties: { aliases: ['counties', 'countyMap'], type: 'county' },
    marquisates: { aliases: ['marquisates', 'marquisateMap'], type: 'marquisate' },
    duchies: { aliases: ['duchies', 'duchyMap'], type: 'duchy' },
    archduchies: { aliases: ['archduchies', 'archduchyMap'], type: 'archduchy' },
    kingdoms: { aliases: ['kingdoms', 'kingdomMap'], type: 'kingdom' },
    empires: { aliases: ['empires', 'empireMap'], type: 'empire' },
    sanctuaries: { aliases: ['sanctuaries', 'sanctuaryMap'], type: 'sanctuary' },
    canonicalLands: { aliases: ['canonicalLands', 'canonicalLandMap'], type: 'canonicalLand' }
  };

  const DEFAULT_OPTIONS = {
    includeDefacto: true,
    includeDerivedIndexes: true,
    includeOrganigrammes: true,
    includeCanonicalRelations: true,
    includeSanctuaries: true,
    includeBaronyConnections: true,
    includeColors: true
  };

  function toId(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (Number.isFinite(n)) return String(n);
    return String(value);
  }

  function getRankIndex(rankKey) {
    return RANK_SEQUENCE.indexOf(rankKey);
  }

  function rankFromCollectionName(name) {
    if (!name || !ENTITY_CONFIG[name]) return null;
    const type = ENTITY_CONFIG[name].type;
    return RANK_SEQUENCE.includes(type) ? type : null;
  }

  function createCollection(rawData, aliases, type) {
    const sourceKey = aliases.find((k) => rawData && rawData[k] !== undefined);
    const source = sourceKey ? rawData[sourceKey] : undefined;
    const byId = {};
    const list = [];

    if (!source) return { list, byId };

    if (Array.isArray(source)) {
      source.forEach((item) => {
        if (!item || item.id === undefined || item.id === null) return;
        const id = toId(item.id);
        const obj = { ...item, id, _type: type };
        list.push(obj);
        byId[id] = obj;
      });
      return { list, byId };
    }

    if (typeof source === 'object') {
      Object.entries(source).forEach(([key, value]) => {
        if (Array.isArray(value)) return;
        if (!value || typeof value !== 'object') return;
        const id = toId(value.id !== undefined ? value.id : key);
        const obj = { ...value, id, _type: type };
        list.push(obj);
        byId[id] = obj;
      });
      return { list, byId };
    }

    return { list, byId };
  }

  function initReferences(vm) {
    vm.seigneurs.list.forEach((s) => {
      s.overlord = null;
      s.vassals = [];
      s.religion = null;
      s.baronies = [];
      s.titles = {
        viscounty: [], county: [], marquisate: [], duchy: [], archduchy: [], kingdom: [], empire: []
      };
      s.highestTitle = null;
      s.highestTitleRank = 'barony';
    });

    vm.religions.list.forEach((r) => {
      r.seigneurs = [];
      r.baroniesPop = [];
      r.priories = [];
      r.churches = [];
      r.cathedrals = [];
      r.sanctuaries = [];
    });

    vm.cultures.list.forEach((c) => {
      c.baronies = [];
      c.seigneurs = [];
    });

    RANK_SEQUENCE.forEach((rank) => {
      const col = vm[`${rank}s`];
      if (!col || !Array.isArray(col.list)) return;
      col.list.forEach((title) => {
        title.seigneur = null;
        title.deJureParents = [];
        title.deJureChildren = [];
        title.defactoParent = null;
        title.defactoChildren = [];
        title.topDefactoParent = null;
      });
    });

    vm.baronies.list.forEach((b) => {
      b.religion = null;
      b.culture = null;
      b.prioryReligion = null;
      b.churchReligion = null;
      b.cathedralReligion = null;
      b.viscounty = null;
      b.county = null;
      b.deJureParents = [];
      b.defactoParent = null;
      b.defactoByRank = {};
      b.canonicalLands = [];
      b.canonicalFor = [];
      b.sanctuaries = [];
      b.connectedBaronies = [];
    });
  }

  function linkOwnerAndReligion(vm) {
    const seigneursById = vm.seigneurs.byId;
    const religionsById = vm.religions.byId;
    const culturesById = vm.cultures.byId;

    vm.seigneurs.list.forEach((s) => {
      const overlordId = toId(s.overlord_id);
      if (overlordId && seigneursById[overlordId]) {
        s.overlord = seigneursById[overlordId];
        s.overlord.vassals.push(s);
      }
      const religionId = toId(s.religion_id);
      if (religionId && religionsById[religionId]) {
        s.religion = religionsById[religionId];
        s.religion.seigneurs.push(s);
      }
    });

    vm.baronies.list.forEach((b) => {
      const sid = toId(b.seigneur_id);
      if (sid && seigneursById[sid]) {
        b.seigneur = seigneursById[sid];
        b.seigneur.baronies.push(b);
      }

      const religionId = toId(b.religion_pop_id);
      if (religionId && religionsById[religionId]) {
        b.religion = religionsById[religionId];
        b.religion.baroniesPop.push(b);
      }

      const cultureId = toId(b.culture_id);
      if (cultureId && culturesById[cultureId]) {
        b.culture = culturesById[cultureId];
        b.culture.baronies.push(b);
      }

      const prioryReligionId = toId(b.priory_religion_id);
      if (prioryReligionId && religionsById[prioryReligionId]) {
        b.prioryReligion = religionsById[prioryReligionId];
        b.prioryReligion.priories.push(b);
      }

      const churchReligionId = toId(b.church_religion_id);
      if (churchReligionId && religionsById[churchReligionId]) {
        b.churchReligion = religionsById[churchReligionId];
        b.churchReligion.churches.push(b);
      }

      const cathedralReligionId = toId(b.cathedral_religion_id);
      if (cathedralReligionId && religionsById[cathedralReligionId]) {
        b.cathedralReligion = religionsById[cathedralReligionId];
        b.cathedralReligion.cathedrals.push(b);
      }
    });
  }

  function linkTitleOwners(vm) {
    const seigneursById = vm.seigneurs.byId;
    TITLE_RANKS.forEach((rank) => {
      const collection = vm[`${rank}s`];
      if (!collection) return;
      collection.list.forEach((title) => {
        const sid = toId(title.seigneur_id);
        if (!sid || !seigneursById[sid]) return;
        title.seigneur = seigneursById[sid];
        seigneursById[sid].titles[rank].push(title);
      });
    });

    vm.seigneurs.list.forEach((s) => {
      let highestRankIndex = 0;
      let highestTitle = null;
      TITLE_RANKS.forEach((rank) => {
        const rankIndex = getRankIndex(rank);
        const titles = s.titles[rank] || [];
        if (titles.length && rankIndex > highestRankIndex) {
          highestRankIndex = rankIndex;
          highestTitle = titles[0];
        }
      });
      s.highestTitle = highestTitle;
      s.highestTitleRank = highestTitle ? highestTitle._type : 'barony';
    });
  }

  function addDeJureEdge(parent, child) {
    if (!parent || !child) return;
    if (!Array.isArray(parent.deJureChildren)) parent.deJureChildren = [];
    if (!Array.isArray(child.deJureParents)) child.deJureParents = [];
    if (!parent.deJureChildren.includes(child)) parent.deJureChildren.push(child);
    if (!child.deJureParents.includes(parent)) child.deJureParents.push(parent);
  }

  function linkDeJureHierarchy(vm) {
    const maps = {
      barony: vm.baronies.byId,
      viscounty: vm.viscounties.byId,
      county: vm.counties.byId,
      marquisate: vm.marquisates.byId,
      duchy: vm.duchies.byId,
      archduchy: vm.archduchies.byId,
      kingdom: vm.kingdoms.byId,
      empire: vm.empires.byId
    };

    vm.baronies.list.forEach((barony) => {
      const viscounty = maps.viscounty[toId(barony.viscounty_id)];
      const county = maps.county[toId(barony.county_id)];
      if (viscounty) {
        barony.viscounty = viscounty;
        addDeJureEdge(viscounty, barony);
      }
      if (county) {
        barony.county = county;
        addDeJureEdge(county, barony);
      }
    });

    vm.counties.list.forEach((county) => {
      const duchy = maps.duchy[toId(county.duchy_id)];
      const marquisate = maps.marquisate[toId(county.marquisate_id)];
      if (duchy) addDeJureEdge(duchy, county);
      if (marquisate) addDeJureEdge(marquisate, county);
    });

    vm.duchies.list.forEach((duchy) => {
      const kingdom = maps.kingdom[toId(duchy.kingdom_id)];
      const archduchy = maps.archduchy[toId(duchy.archduchy_id)];
      if (kingdom) addDeJureEdge(kingdom, duchy);
      if (archduchy) addDeJureEdge(archduchy, duchy);
    });

    vm.kingdoms.list.forEach((kingdom) => {
      const empire = maps.empire[toId(kingdom.empire_id)];
      if (empire) addDeJureEdge(empire, kingdom);
    });
  }

  function linkSpecialRelations(vm, options) {
    if (options.includeCanonicalRelations) {
      const canonicalSource = vm.canonicalLands.list;
      if (canonicalSource.length) {
        canonicalSource.forEach((entry) => {
          const sourceId = toId(entry.barony_id);
          const targetId = toId(entry.canonical_barony_id);
          const source = vm.baronies.byId[sourceId];
          const target = vm.baronies.byId[targetId];
          if (source && target) {
            source.canonicalLands.push(target);
            target.canonicalFor.push(source);
          }
        });
      } else {
        Object.entries(vm.canonicalLands.byId || {}).forEach(([sourceId, value]) => {
          const source = vm.baronies.byId[toId(sourceId)];
          if (!source || !Array.isArray(value)) return;
          value.forEach((targetId) => {
            const target = vm.baronies.byId[toId(targetId)];
            if (target) {
              source.canonicalLands.push(target);
              target.canonicalFor.push(source);
            }
          });
        });
      }
    }

    if (options.includeSanctuaries) {
      vm.sanctuaries.list.forEach((s) => {
        const barony = vm.baronies.byId[toId(s.barony_id)];
        const religion = vm.religions.byId[toId(s.religion_id)];
        s.barony = barony || null;
        s.religion = religion || null;
        if (barony) barony.sanctuaries.push(s);
        if (religion) religion.sanctuaries.push(s);
      });
    }
  }



  function linkBaronyConnections(vm, rawData, options) {
    if (!options.includeBaronyConnections) return;
    const connections = rawData.baronyConnections || rawData.barony_connections || [];
    if (!Array.isArray(connections)) return;

    connections.forEach((entry) => {
      const leftId = toId(entry.barony_id_1);
      const rightId = toId(entry.barony_id_2);
      if (!leftId || !rightId || leftId === rightId) return;
      const left = vm.baronies.byId[leftId];
      const right = vm.baronies.byId[rightId];
      if (!left || !right) return;
      const parsedDistance = parseInt(entry.distance, 10);
      const distance = Number.isFinite(parsedDistance) && parsedDistance > 0 ? parsedDistance : 1;

      if (!left.connectedBaronies.some((neighbor) => neighbor.id === right.id)) {
        left.connectedBaronies.push({ id: right.id, distance });
      }
      if (!right.connectedBaronies.some((neighbor) => neighbor.id === left.id)) {
        right.connectedBaronies.push({ id: left.id, distance });
      }
    });
  }

  function buildOwnerTitleIndex(vm) {
    const index = {};
    vm.seigneurs.list.forEach((s) => {
      const sid = s.id;
      index[sid] = { viscounty: [], county: [], marquisate: [], duchy: [], archduchy: [], kingdom: [], empire: [] };
      TITLE_RANKS.forEach((rank) => {
        index[sid][rank] = (s.titles[rank] || []).slice();
      });
    });
    return index;
  }

  function getDeJureChainFromNode(vm, node) {
    if (!node) return [];
    const chain = [];
    let current = node;
    const visited = new Set();
    while (current) {
      if (!Array.isArray(current.deJureParents) || !current.deJureParents.length) break;
      const parent = current.deJureParents[0];
      if (!parent) break;
      const token = `${parent._type}:${parent.id}`;
      if (visited.has(token)) break;
      visited.add(token);
      chain.push(parent);
      current = parent;
    }
    return chain;
  }

  function pickClosestHigherOwnedTitle(ownerIndex, seigneur, fromRank, preferredSet) {
    if (!seigneur) return null;
    const startIndex = getRankIndex(fromRank);
    const sid = seigneur.id;
    const owned = ownerIndex[sid];
    if (!owned) return null;

    for (let i = startIndex + 1; i < RANK_SEQUENCE.length; i++) {
      const rank = RANK_SEQUENCE[i];
      const candidates = owned[rank] || [];
      if (!candidates.length) continue;
      if (preferredSet && preferredSet.size) {
        const preferred = candidates.find((c) => preferredSet.has(`${c._type}:${c.id}`));
        if (preferred) return preferred;
      }
      return candidates[0];
    }
    return null;
  }

  function getDefactoOverride(vm, node) {
    if (!node) return null;
    const rank = node._type;
    const candidates = [];

    function pushCandidate(targetRank, idValue) {
      const id = toId(idValue);
      if (!id) return;
      const map = vm[`${targetRank}s`]?.byId;
      if (!map || !map[id]) return;
      candidates.push(map[id]);
    }

    if (rank === 'barony') {
      pushCandidate('viscounty', node.defacto_viscounty_id);
      pushCandidate('county', node.defacto_county_id);
    } else if (rank === 'viscounty') {
      pushCandidate('county', node.defacto_county_id);
    } else if (rank === 'county') {
      pushCandidate('marquisate', node.defacto_marquisate_id);
      pushCandidate('duchy', node.defacto_duchy_id);
    } else if (rank === 'marquisate') {
      pushCandidate('duchy', node.defacto_duchy_id);
    } else if (rank === 'duchy') {
      pushCandidate('archduchy', node.defacto_archduchy_id);
      pushCandidate('kingdom', node.defacto_kingdom_id);
    } else if (rank === 'archduchy') {
      pushCandidate('kingdom', node.defacto_kingdom_id);
    } else if (rank === 'kingdom') {
      pushCandidate('empire', node.defacto_empire_id);
    }

    if (!candidates.length) return null;
    const startIndex = getRankIndex(rank);
    let best = null;
    let bestIndex = Infinity;
    candidates.forEach((candidate) => {
      const idx = getRankIndex(candidate._type);
      if (idx > startIndex && idx < bestIndex) {
        best = candidate;
        bestIndex = idx;
      }
    });
    return best;
  }

  function resolveDefactoParent(vm, node, ownerIndex) {
    if (!node) return null;
    const rank = node._type;
    if (rank === 'empire') return null;

    const override = getDefactoOverride(vm, node);
    if (override) return override;

    const deJureChain = getDeJureChainFromNode(vm, node);
    const preferredSet = new Set(deJureChain.map((x) => `${x._type}:${x.id}`));

    let seigneur = node.seigneur || null;
    let fallbackWithoutDeJure = null;
    while (seigneur) {
      const preferred = pickClosestHigherOwnedTitle(ownerIndex, seigneur, rank, preferredSet);
      if (preferred) return preferred;
      if (!fallbackWithoutDeJure) {
        fallbackWithoutDeJure = pickClosestHigherOwnedTitle(ownerIndex, seigneur, rank, null);
      }
      seigneur = seigneur.overlord || null;
    }

    return fallbackWithoutDeJure;
  }

  function computeDefactoHierarchy(vm) {
    const ownerIndex = buildOwnerTitleIndex(vm);
    const allNodes = [
      ...vm.baronies.list,
      ...vm.viscounties.list,
      ...vm.counties.list,
      ...vm.marquisates.list,
      ...vm.duchies.list,
      ...vm.archduchies.list,
      ...vm.kingdoms.list,
      ...vm.empires.list
    ];

    allNodes.forEach((node) => {
      node.defactoParent = resolveDefactoParent(vm, node, ownerIndex);
      node.defactoChildren = [];
    });

    allNodes.forEach((node) => {
      if (node.defactoParent) {
        node.defactoParent.defactoChildren.push(node);
      }
    });

    allNodes.forEach((node) => {
      let cur = node;
      const visited = new Set();
      while (cur && cur.defactoParent) {
        const token = `${cur._type}:${cur.id}`;
        if (visited.has(token)) {
          cur = null;
          break;
        }
        visited.add(token);
        cur = cur.defactoParent;
      }
      node.topDefactoParent = cur || null;
    });

    vm.baronies.list.forEach((barony) => {
      const map = {};
      let cur = barony;
      const visited = new Set();
      while (cur && cur.defactoParent) {
        const parent = cur.defactoParent;
        const token = `${parent._type}:${parent.id}`;
        if (visited.has(token)) break;
        visited.add(token);
        map[parent._type] = parent;
        cur = parent;
      }
      barony.defactoByRank = map;
    });
  }

  function computeOrganigrammes(vm) {
    const roots = vm.seigneurs.list.filter((s) => !s.overlord);
    const trees = [];

    function buildNode(seigneur, visited) {
      const token = `seigneur:${seigneur.id}`;
      if (visited.has(token)) return null;
      visited.add(token);
      const children = (seigneur.vassals || [])
        .map((v) => buildNode(v, new Set(visited)))
        .filter(Boolean);
      return {
        seigneur,
        children
      };
    }

    roots.forEach((r) => {
      const node = buildNode(r, new Set());
      if (node) trees.push(node);
    });

    vm.organigrammes = {
      roots,
      trees
    };
  }

  function finalizeIndexes(vm, options) {
    if (!options.includeDerivedIndexes) return;

    vm.indexes = {
      seigneursByOverlordId: {},
      titlesBySeigneurId: {},
      baroniesByCountyId: {},
      baroniesByViscountyId: {},
      baroniesByDefactoTopId: {},
      baronyAdjacency: {}
    };

    vm.seigneurs.list.forEach((s) => {
      const overlordId = toId(s.overlord_id) || 'root';
      if (!vm.indexes.seigneursByOverlordId[overlordId]) vm.indexes.seigneursByOverlordId[overlordId] = [];
      vm.indexes.seigneursByOverlordId[overlordId].push(s);
      vm.indexes.titlesBySeigneurId[s.id] = {
        viscounty: s.titles.viscounty.slice(),
        county: s.titles.county.slice(),
        marquisate: s.titles.marquisate.slice(),
        duchy: s.titles.duchy.slice(),
        archduchy: s.titles.archduchy.slice(),
        kingdom: s.titles.kingdom.slice(),
        empire: s.titles.empire.slice()
      };
    });

    vm.baronies.list.forEach((b) => {
      const countyId = toId(b.county_id);
      const viscountyId = toId(b.viscounty_id);
      if (countyId) {
        if (!vm.indexes.baroniesByCountyId[countyId]) vm.indexes.baroniesByCountyId[countyId] = [];
        vm.indexes.baroniesByCountyId[countyId].push(b);
      }
      if (viscountyId) {
        if (!vm.indexes.baroniesByViscountyId[viscountyId]) vm.indexes.baroniesByViscountyId[viscountyId] = [];
        vm.indexes.baroniesByViscountyId[viscountyId].push(b);
      }
      const top = b.topDefactoParent;
      const key = top ? `${top._type}:${top.id}` : 'none';
      if (!vm.indexes.baroniesByDefactoTopId[key]) vm.indexes.baroniesByDefactoTopId[key] = [];
      vm.indexes.baroniesByDefactoTopId[key].push(b);
      vm.indexes.baronyAdjacency[b.id] = Array.isArray(b.connectedBaronies)
        ? b.connectedBaronies.map((neighbor) => ({ id: neighbor.id, distance: neighbor.distance }))
        : [];
    });
  }


  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function hslToHex(h, s, l) {
    const sat = s / 100;
    const lig = l / 100;
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(lig, 1 - lig);
    const f = (n) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (n) => Math.round(255 * n).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  function ensureEntityColors(vm, options) {
    if (!options.includeColors) return;
    const groups = ['religions', 'cultures', 'seigneurs', 'viscounties', 'counties', 'marquisates', 'duchies', 'archduchies', 'kingdoms', 'empires'];
    groups.forEach((collectionName, idx) => {
      (vm[collectionName]?.list || []).forEach((entry) => {
        if (entry.color) return;
        const seed = hashString(`${collectionName}:${entry.id}:${entry.name || ''}`);
        const hue = (seed + idx * 47) % 360;
        entry.color = hslToHex(hue, 58, 54);
      });
    });
  }

  function build(rawData = {}, customOptions = {}) {
    const options = { ...DEFAULT_OPTIONS, ...customOptions };
    const vm = {
      options,
      meta: {
        rankSequence: RANK_SEQUENCE.slice(),
        titleRanks: TITLE_RANKS.slice(),
        sourceShape: 'unknown'
      }
    };

    Object.entries(ENTITY_CONFIG).forEach(([name, cfg]) => {
      vm[name] = createCollection(rawData, cfg.aliases, cfg.type);
      if (vm[name].list.length && !vm.meta.sourceShape) vm.meta.sourceShape = name;
    });

    initReferences(vm);
    linkOwnerAndReligion(vm);
    linkTitleOwners(vm);
    linkDeJureHierarchy(vm);
    linkSpecialRelations(vm, options);
    linkBaronyConnections(vm, rawData, options);

    if (options.includeDefacto) {
      computeDefactoHierarchy(vm);
    }

    if (options.includeOrganigrammes) {
      computeOrganigrammes(vm);
    }

    finalizeIndexes(vm, options);
    ensureEntityColors(vm, options);

    vm.getEntity = function getEntity(rankOrType, id) {
      if (!rankOrType) return null;
      const normalizedType = String(rankOrType).toLowerCase();
      const collectionName = Object.keys(ENTITY_CONFIG).find((key) => ENTITY_CONFIG[key].type === normalizedType);
      if (!collectionName || !vm[collectionName]) return null;
      return vm[collectionName].byId[toId(id)] || null;
    };

    vm.getDeFactoParent = function getDeFactoParent(rankOrType, id) {
      const entity = vm.getEntity(rankOrType, id);
      return entity ? entity.defactoParent || null : null;
    };

    vm.getDeFactoChildren = function getDeFactoChildren(rankOrType, id) {
      const entity = vm.getEntity(rankOrType, id);
      return entity ? entity.defactoChildren || [] : [];
    };

    vm.getBaronyDefactoAtRank = function getBaronyDefactoAtRank(baronyId, rankKey) {
      const barony = vm.getEntity('barony', baronyId);
      if (!barony || !barony.defactoByRank) return null;
      return barony.defactoByRank[String(rankKey || '').toLowerCase()] || null;
    };


    vm.getBaronyTitleId = function getBaronyTitleId(baronyId, rankKey, mode = 'dejure') {
      const barony = vm.getEntity('barony', baronyId);
      const normalizedRank = String(rankKey || '').toLowerCase();
      if (!barony || !normalizedRank) return null;
      if (mode === 'defacto') {
        return barony.defactoByRank?.[normalizedRank] || null;
      }
      if (normalizedRank === 'barony') return barony;
      if (normalizedRank === 'viscounty') return vm.getEntity('viscounty', barony.viscounty_id);
      if (normalizedRank === 'county') return vm.getEntity('county', barony.county_id);
      const county = vm.getEntity('county', barony.county_id);
      if (normalizedRank === 'marquisate') return vm.getEntity('marquisate', county?.marquisate_id);
      const duchy = vm.getEntity('duchy', county?.duchy_id);
      if (normalizedRank === 'duchy') return duchy;
      if (normalizedRank === 'archduchy') return vm.getEntity('archduchy', duchy?.archduchy_id);
      const kingdom = vm.getEntity('kingdom', duchy?.kingdom_id);
      if (normalizedRank === 'kingdom') return kingdom;
      if (normalizedRank === 'empire') return vm.getEntity('empire', kingdom?.empire_id);
      return null;
    };

    vm.getBaroniesForTitle = function getBaroniesForTitle(rankKey, titleId, mode = 'dejure') {
      return vm.baronies.list.filter((barony) => {
        const title = vm.getBaronyTitleId(barony.id, rankKey, mode);
        return !!title && String(title.id) === String(titleId);
      });
    };

    vm.getImmediateSubtitles = function getImmediateSubtitles(rankKey, titleId, mode = 'dejure') {
      const childRankByRank = {
        empire: 'kingdom', kingdom: 'duchy', archduchy: 'duchy', duchy: 'county', marquisate: 'county', county: 'barony', viscounty: 'barony'
      };
      const childRank = childRankByRank[String(rankKey || '').toLowerCase()];
      if (!childRank) return [];
      if (mode === 'defacto') {
        const childCollection = vm[`${childRank}s`]?.list || [];
        return childCollection.filter((child) => child.defactoParent && child.defactoParent._type === rankKey && String(child.defactoParent.id) === String(titleId));
      }
      return vm.getBaroniesForTitle(rankKey, titleId, 'dejure')
        .map((barony) => vm.getBaronyTitleId(barony.id, childRank, 'dejure'))
        .filter(Boolean)
        .filter((value, index, array) => array.findIndex((item) => String(item.id) === String(value.id)) === index);
    };

    vm.getEntityColor = function getEntityColor(rankOrType, id, fallback = '#999999') {
      const entity = vm.getEntity(rankOrType, id);
      return entity?.color || fallback;
    };

    return vm;
  }

  const api = {
    build,
    RANK_SEQUENCE,
    TITLE_RANKS,
    getRankIndex,
    rankFromCollectionName
  };

  global.viewModel = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
