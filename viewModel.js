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
    canonicalLands: { aliases: ['canonicalLands', 'canonicalLandMap'], type: 'canonicalLand' },
    tradeRoutes: { aliases: ['tradeRoutes', 'trade_routes'], type: 'tradeRoute' },
    tradeLines: { aliases: ['tradeLines', 'trade_lines'], type: 'tradeLine' }
  };

  const COLLECTION_BY_TYPE = Object.keys(ENTITY_CONFIG).reduce((acc, collectionName) => {
    acc[ENTITY_CONFIG[collectionName].type] = collectionName;
    return acc;
  }, {});

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

  function toBool(value) {
    return value === true || value === 1 || value === '1';
  }

  function addDiagnostic(vm, type, message, details = {}) {
    if (!vm.diagnostics) vm.diagnostics = [];
    vm.diagnostics.push({ type, message, ...details });
  }

  function getRankIndex(rankKey) {
    return RANK_SEQUENCE.indexOf(rankKey);
  }

  function isRankKey(rankKey) {
    return RANK_SEQUENCE.includes(rankKey);
  }

  function rankFromCollectionName(name) {
    if (!name || !ENTITY_CONFIG[name]) return null;
    const type = ENTITY_CONFIG[name].type;
    return RANK_SEQUENCE.includes(type) ? type : null;
  }

  function getCollection(vm, type) {
    const collectionName = COLLECTION_BY_TYPE[type];
    return collectionName ? vm[collectionName] : null;
  }

  function createCollection(rawData, aliases, type) {
    const sourceKey = aliases.find((k) => rawData && rawData[k] !== undefined);
    const source = sourceKey ? rawData[sourceKey] : undefined;
    const byId = {};
    const list = [];

    if (!source) return { list, byId };

    if (Array.isArray(source)) {
      source.forEach((item) => {
        if (!item) return;
        const rawId = item.id !== undefined && item.id !== null
          ? item.id
          : (type === 'canonicalLand' && item.barony_id !== undefined && item.canonical_barony_id !== undefined
            ? `${item.barony_id}:${item.canonical_barony_id}`
            : null);
        if (rawId === null) return;
        const id = toId(rawId);
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
        barony: [], viscounty: [], county: [], marquisate: [], duchy: [], archduchy: [], kingdom: [], empire: []
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
      const col = getCollection(vm, rank);
      if (!col || !Array.isArray(col.list)) return;
      col.list.forEach((title) => {
        title.seigneur = null;
        title.deJureParents = [];
        title.deJureChildren = [];
        title.defactoParent = null;
        title.defactoChildren = [];
        title.topDefactoParent = null;
        if (rank === 'duchy') {
          title.pietyStatsByReligion = {};
          title.duchyPietyWinnerId = null;
          title.duchyPietyWinnerReligion = null;
        }
      });
    });

    vm.baronies.list.forEach((b) => {
      b.vacant = toBool(b.vacant);
      b.religion = null;
      b.culture = null;
      b.prioryReligion = null;
      b.churchReligion = null;
      b.cathedralReligion = null;
      b.viscounty = null;
      b.county = null;
      b.dejure = {};
      b.defacto = {};
      b.deJureParents = [];
      b.defactoParent = null;
      b.defactoByRank = {};
      b.canonicalLands = [];
      b.canonicalFor = [];
      b.sanctuaries = [];
      b.connectedBaronies = [];
      b.tradeRoutes = [];
      b.tradeLines = [];
      b.landTradeBaronies = [];
      b.seaTradeBaronies = [];
      b.distanceToSelected = -1;
    });
  }

  function linkOwnerAndReligion(vm) {
    const seigneursById = vm.seigneurs.byId;
    const religionsById = vm.religions.byId;
    const culturesById = vm.cultures.byId;

    vm.seigneurs.list.forEach((s) => {
      const overlordId = toId(s.overlord_id);
      if (overlordId) {
        if (seigneursById[overlordId]) {
          s.overlord = seigneursById[overlordId];
          s.overlord.vassals.push(s);
        } else {
          addDiagnostic(vm, 'missing_reference', `Seigneur ${s.id} reference un suzerain introuvable ${overlordId}.`, {
            sourceType: 'seigneur',
            sourceId: s.id,
            field: 'overlord_id',
            targetType: 'seigneur',
            targetId: overlordId
          });
        }
      }
      const religionId = toId(s.religion_id);
      if (religionId) {
        if (religionsById[religionId]) {
          s.religion = religionsById[religionId];
          s.religion.seigneurs.push(s);
        } else {
          addDiagnostic(vm, 'missing_reference', `Seigneur ${s.id} reference une religion introuvable ${religionId}.`, {
            sourceType: 'seigneur',
            sourceId: s.id,
            field: 'religion_id',
            targetType: 'religion',
            targetId: religionId
          });
        }
      }
    });

    vm.baronies.list.forEach((b) => {
      const sid = toId(b.seigneur_id);
      if (sid) {
        if (seigneursById[sid]) {
          b.seigneur = seigneursById[sid];
          b.seigneur.baronies.push(b);
          b.seigneur.titles.barony.push(b);
        } else {
          addDiagnostic(vm, 'missing_reference', `Baronnie ${b.id} reference un seigneur introuvable ${sid}.`, {
            sourceType: 'barony',
            sourceId: b.id,
            field: 'seigneur_id',
            targetType: 'seigneur',
            targetId: sid
          });
        }
      }

      const religionId = toId(b.religion_pop_id);
      if (religionId) {
        if (religionsById[religionId]) {
          b.religion = religionsById[religionId];
          b.religion.baroniesPop.push(b);
        } else {
          addDiagnostic(vm, 'missing_reference', `Baronnie ${b.id} reference une religion de population introuvable ${religionId}.`, {
            sourceType: 'barony',
            sourceId: b.id,
            field: 'religion_pop_id',
            targetType: 'religion',
            targetId: religionId
          });
        }
      }

      const cultureId = toId(b.culture_id);
      if (cultureId) {
        if (culturesById[cultureId]) {
          b.culture = culturesById[cultureId];
          b.culture.baronies.push(b);
          if (b.seigneur && !b.culture.seigneurs.includes(b.seigneur)) {
            b.culture.seigneurs.push(b.seigneur);
          }
        } else {
          addDiagnostic(vm, 'missing_reference', `Baronnie ${b.id} reference une culture introuvable ${cultureId}.`, {
            sourceType: 'barony',
            sourceId: b.id,
            field: 'culture_id',
            targetType: 'culture',
            targetId: cultureId
          });
        }
      }

      const prioryReligionId = toId(b.priory_religion_id);
      if (prioryReligionId) {
        if (religionsById[prioryReligionId]) {
          b.prioryReligion = religionsById[prioryReligionId];
          b.prioryReligion.priories.push(b);
        } else {
          addDiagnostic(vm, 'missing_reference', `Baronnie ${b.id} reference une religion de prieure introuvable ${prioryReligionId}.`, {
            sourceType: 'barony',
            sourceId: b.id,
            field: 'priory_religion_id',
            targetType: 'religion',
            targetId: prioryReligionId
          });
        }
      }

      const churchReligionId = toId(b.church_religion_id);
      if (churchReligionId) {
        if (religionsById[churchReligionId]) {
          b.churchReligion = religionsById[churchReligionId];
          b.churchReligion.churches.push(b);
        } else {
          addDiagnostic(vm, 'missing_reference', `Baronnie ${b.id} reference une religion d'eglise introuvable ${churchReligionId}.`, {
            sourceType: 'barony',
            sourceId: b.id,
            field: 'church_religion_id',
            targetType: 'religion',
            targetId: churchReligionId
          });
        }
      }

      const cathedralReligionId = toId(b.cathedral_religion_id);
      if (cathedralReligionId) {
        if (religionsById[cathedralReligionId]) {
          b.cathedralReligion = religionsById[cathedralReligionId];
          b.cathedralReligion.cathedrals.push(b);
        } else {
          addDiagnostic(vm, 'missing_reference', `Baronnie ${b.id} reference une religion de cathedrale introuvable ${cathedralReligionId}.`, {
            sourceType: 'barony',
            sourceId: b.id,
            field: 'cathedral_religion_id',
            targetType: 'religion',
            targetId: cathedralReligionId
          });
        }
      }
    });
  }

  function linkTitleOwners(vm) {
    const seigneursById = vm.seigneurs.byId;
    TITLE_RANKS.forEach((rank) => {
      const collection = getCollection(vm, rank);
      if (!collection) return;
      collection.list.forEach((title) => {
        const sid = toId(title.seigneur_id);
        if (!sid) return;
        if (seigneursById[sid]) {
          title.seigneur = seigneursById[sid];
          seigneursById[sid].titles[rank].push(title);
        } else {
          addDiagnostic(vm, 'missing_reference', `${rank} ${title.id} reference un seigneur introuvable ${sid}.`, {
            sourceType: rank,
            sourceId: title.id,
            field: 'seigneur_id',
            targetType: 'seigneur',
            targetId: sid
          });
        }
      });
    });

    vm.seigneurs.list.forEach((s) => {
      let highestRankIndex = 0;
      let highestTitle = (s.titles.barony || [])[0] || null;
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
      const viscountyId = toId(barony.viscounty_id);
      const countyId = toId(barony.county_id);
      const viscounty = maps.viscounty[viscountyId];
      const county = maps.county[countyId];
      if (viscounty) {
        barony.viscounty = viscounty;
        addDeJureEdge(viscounty, barony);
      } else if (viscountyId) {
        addDiagnostic(vm, 'missing_reference', `Baronnie ${barony.id} reference une vicomte introuvable ${viscountyId}.`, {
          sourceType: 'barony',
          sourceId: barony.id,
          field: 'viscounty_id',
          targetType: 'viscounty',
          targetId: viscountyId
        });
      }
      if (county) {
        barony.county = county;
        addDeJureEdge(county, barony);
      } else if (countyId) {
        addDiagnostic(vm, 'missing_reference', `Baronnie ${barony.id} reference un comte introuvable ${countyId}.`, {
          sourceType: 'barony',
          sourceId: barony.id,
          field: 'county_id',
          targetType: 'county',
          targetId: countyId
        });
      }
    });

    vm.counties.list.forEach((county) => {
      const duchyId = toId(county.duchy_id);
      const marquisateId = toId(county.marquisate_id);
      const duchy = maps.duchy[duchyId];
      const marquisate = maps.marquisate[marquisateId];
      if (duchy) addDeJureEdge(duchy, county);
      else if (duchyId) {
        addDiagnostic(vm, 'missing_reference', `Comte ${county.id} reference un duche introuvable ${duchyId}.`, {
          sourceType: 'county',
          sourceId: county.id,
          field: 'duchy_id',
          targetType: 'duchy',
          targetId: duchyId
        });
      }
      if (marquisate) addDeJureEdge(marquisate, county);
      else if (marquisateId) {
        addDiagnostic(vm, 'missing_reference', `Comte ${county.id} reference un marquisat introuvable ${marquisateId}.`, {
          sourceType: 'county',
          sourceId: county.id,
          field: 'marquisate_id',
          targetType: 'marquisate',
          targetId: marquisateId
        });
      }
    });

    vm.duchies.list.forEach((duchy) => {
      const kingdomId = toId(duchy.kingdom_id);
      const archduchyId = toId(duchy.archduchy_id);
      const kingdom = maps.kingdom[kingdomId];
      const archduchy = maps.archduchy[archduchyId];
      if (kingdom) addDeJureEdge(kingdom, duchy);
      else if (kingdomId) {
        addDiagnostic(vm, 'missing_reference', `Duche ${duchy.id} reference un royaume introuvable ${kingdomId}.`, {
          sourceType: 'duchy',
          sourceId: duchy.id,
          field: 'kingdom_id',
          targetType: 'kingdom',
          targetId: kingdomId
        });
      }
      if (archduchy) addDeJureEdge(archduchy, duchy);
      else if (archduchyId) {
        addDiagnostic(vm, 'missing_reference', `Duche ${duchy.id} reference un archiduche introuvable ${archduchyId}.`, {
          sourceType: 'duchy',
          sourceId: duchy.id,
          field: 'archduchy_id',
          targetType: 'archduchy',
          targetId: archduchyId
        });
      }
    });

    vm.kingdoms.list.forEach((kingdom) => {
      const empireId = toId(kingdom.empire_id);
      const empire = maps.empire[empireId];
      if (empire) addDeJureEdge(empire, kingdom);
      else if (empireId) {
        addDiagnostic(vm, 'missing_reference', `Royaume ${kingdom.id} reference un empire introuvable ${empireId}.`, {
          sourceType: 'kingdom',
          sourceId: kingdom.id,
          field: 'empire_id',
          targetType: 'empire',
          targetId: empireId
        });
      }
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

  function getDeJureAncestorsFromNode(vm, node) {
    if (!node) return [];
    const ancestors = [];
    const visited = new Set();

    function visit(current) {
      if (!current || !Array.isArray(current.deJureParents)) return;
      current.deJureParents.forEach((parent) => {
        if (!parent) return;
        const parentIndex = getRankIndex(parent._type);
        const currentIndex = getRankIndex(current._type);
        if (parentIndex <= currentIndex) {
          addDiagnostic(vm, 'invalid_hierarchy', `${current._type} ${current.id} a un parent de jure de rang invalide ${parent._type} ${parent.id}.`, {
            sourceType: current._type,
            sourceId: current.id,
            targetType: parent._type,
            targetId: parent.id,
            relation: 'dejure'
          });
          return;
        }
        const token = `${parent._type}:${parent.id}`;
        if (visited.has(token)) return;
        visited.add(token);
        ancestors.push(parent);
        visit(parent);
      });
    }

    visit(node);
    return ancestors;
  }

  function detectDeJureCycles(vm) {
    const allNodes = getAllRankNodes(vm);
    allNodes.forEach((node) => {
      const path = [];
      const visiting = new Set();

      function visit(current) {
        if (!current || !Array.isArray(current.deJureParents)) return;
        const currentToken = `${current._type}:${current.id}`;
        if (visiting.has(currentToken)) {
          addDiagnostic(vm, 'cycle', `Cycle de jure detecte: ${path.concat(currentToken).join(' -> ')}.`, {
            relation: 'dejure',
            nodeType: current._type,
            nodeId: current.id
          });
          return;
        }
        visiting.add(currentToken);
        path.push(currentToken);
        current.deJureParents.forEach(visit);
        path.pop();
        visiting.delete(currentToken);
      }

      visit(node);
    });
  }

  function getAllRankNodes(vm) {
    return RANK_SEQUENCE.flatMap((rank) => getCollection(vm, rank)?.list || []);
  }

  function getNodeToken(node) {
    return node ? `${node._type}:${node.id}` : null;
  }

  function validateDefactoParent(vm, node, parent) {
    if (!node || !parent) return false;
    const nodeIndex = getRankIndex(node._type);
    const parentIndex = getRankIndex(parent._type);
    if (nodeIndex < 0 || parentIndex < 0 || parentIndex <= nodeIndex) {
      addDiagnostic(vm, 'invalid_defacto', `${node._type} ${node.id} a un parent de facto de rang invalide ${parent._type} ${parent.id}.`, {
        sourceType: node._type,
        sourceId: node.id,
        targetType: parent._type,
        targetId: parent.id
      });
      return false;
    }
    return true;
  }

  function getDefactoOverrideSpecs(rank, node) {
    const specs = [];
    if (rank === 'barony') {
      specs.push(['viscounty', 'defacto_viscounty_id', node.defacto_viscounty_id]);
      specs.push(['county', 'defacto_county_id', node.defacto_county_id]);
    } else if (rank === 'viscounty') {
      specs.push(['county', 'defacto_county_id', node.defacto_county_id]);
    } else if (rank === 'county') {
      specs.push(['marquisate', 'defacto_marquisate_id', node.defacto_marquisate_id]);
      specs.push(['duchy', 'defacto_duchy_id', node.defacto_duchy_id]);
    } else if (rank === 'marquisate') {
      specs.push(['duchy', 'defacto_duchy_id', node.defacto_duchy_id]);
    } else if (rank === 'duchy') {
      specs.push(['archduchy', 'defacto_archduchy_id', node.defacto_archduchy_id]);
      specs.push(['kingdom', 'defacto_kingdom_id', node.defacto_kingdom_id]);
    } else if (rank === 'archduchy') {
      specs.push(['kingdom', 'defacto_kingdom_id', node.defacto_kingdom_id]);
    } else if (rank === 'kingdom') {
      specs.push(['empire', 'defacto_empire_id', node.defacto_empire_id]);
    }
    return specs;
  }

  function recordInvalidDefactoOverrides(vm, node) {
    if (!node || !isRankKey(node._type)) return;
    getDefactoOverrideSpecs(node._type, node).forEach(([targetRank, field, value]) => {
      const id = toId(value);
      if (!id) return;
      const target = getCollection(vm, targetRank)?.byId?.[id] || null;
      if (!target) {
        addDiagnostic(vm, 'missing_reference', `${node._type} ${node.id} reference un parent de facto introuvable ${targetRank} ${id}.`, {
          sourceType: node._type,
          sourceId: node.id,
          field,
          targetType: targetRank,
          targetId: id,
          relation: 'defacto'
        });
        return;
      }
      validateDefactoParent(vm, node, target);
    });
  }

  function detectDefactoCycles(vm, allNodes) {
    allNodes.forEach((node) => {
      let cur = node;
      const visited = new Set();
      const path = [];
      while (cur) {
        const token = getNodeToken(cur);
        if (!token) break;
        if (visited.has(token)) {
          addDiagnostic(vm, 'cycle', `Cycle de facto detecte: ${path.concat(token).join(' -> ')}.`, {
            relation: 'defacto',
            nodeType: node._type,
            nodeId: node.id
          });
          return;
        }
        visited.add(token);
        path.push(token);
        cur = cur.defactoParent || null;
      }
    });
  }

  function getGraphDeJureTitleForBarony(vm, barony, normalizedRank) {
    if (!barony || !normalizedRank) return null;
    if (normalizedRank === 'barony') return barony;
    const candidates = getDeJureAncestorsFromNode(vm, barony)
      .filter((ancestor) => ancestor._type === normalizedRank);
    return candidates[0] || null;
  }

  function getCollectionEntity(vm, rank, id) {
    const normalizedRank = String(rank || '').toLowerCase();
    const normalizedId = toId(id);
    if (!normalizedRank || !normalizedId) return null;
    return getCollection(vm, normalizedRank)?.byId?.[normalizedId] || null;
  }

  function getPrimaryDeJureTitleForBarony(vm, barony, normalizedRank) {
    if (!barony || !normalizedRank) return null;
    if (normalizedRank === 'barony') return barony;

    const viscounty = barony.viscounty || getCollectionEntity(vm, 'viscounty', barony.viscounty_id);
    const county = barony.county || getCollectionEntity(vm, 'county', barony.county_id);
    if (normalizedRank === 'viscounty') return viscounty || null;
    if (normalizedRank === 'county') return county || null;

    const marquisate = getCollectionEntity(vm, 'marquisate', county?.marquisate_id);
    if (normalizedRank === 'marquisate') return marquisate || null;

    const duchy = getCollectionEntity(vm, 'duchy', county?.duchy_id);
    if (normalizedRank === 'duchy') return duchy || null;

    const archduchy = getCollectionEntity(vm, 'archduchy', duchy?.archduchy_id);
    if (normalizedRank === 'archduchy') return archduchy || null;

    const kingdom = getCollectionEntity(vm, 'kingdom', duchy?.kingdom_id);
    if (normalizedRank === 'kingdom') return kingdom || null;

    const empire = getCollectionEntity(vm, 'empire', kingdom?.empire_id);
    if (normalizedRank === 'empire') return empire || null;

    return null;
  }

  function getDeJureTitleForBarony(vm, barony, normalizedRank) {
    return getPrimaryDeJureTitleForBarony(vm, barony, normalizedRank)
      || getGraphDeJureTitleForBarony(vm, barony, normalizedRank);
  }

  function getDirectDeJureChildrenForTitle(vm, title) {
    if (!title || !Array.isArray(title.deJureChildren)) return [];
    return title.deJureChildren.slice();
  }

  function getClosestDeJureParent(node) {
    if (!node || !Array.isArray(node.deJureParents)) return null;
    const nodeIndex = getRankIndex(node._type);
    return node.deJureParents
      .filter((parent) => parent && getRankIndex(parent._type) > nodeIndex)
      .sort((a, b) => getRankIndex(a._type) - getRankIndex(b._type) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
      [0] || null;
  }

  function getDirectDefactoChildrenForTitle(vm, title) {
    if (!title || !Array.isArray(title.defactoChildren)) return [];
    return title.defactoChildren.slice();
  }

  function dedupeEntities(items) {
    const seen = new Set();
    return (items || []).filter((item) => {
      if (!item) return false;
      const token = `${item._type}:${item.id}`;
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    });
  }

  function getColorTargetForBaronyFilter(vm, barony, filterKey) {
    if (!barony || !filterKey) return null;
    const normalized = String(filterKey).toLowerCase();
    if (normalized === 'religion') return barony.religion || null;
    if (normalized === 'seigneur_religion') return barony.vacant ? null : barony.seigneur?.religion || null;
    if (normalized === 'culture') return barony.culture || null;
    if (normalized === 'priory') return barony.prioryReligion || null;
    if (normalized === 'church') return barony.churchReligion || null;
    if (normalized === 'cathedral') return barony.cathedralReligion || null;
    const mode = normalized.endsWith('_defacto') ? 'defacto' : 'dejure';
    const rank = normalized.replace('_defacto', '');
    if (isRankKey(rank)) return vm.getTitleForBarony(barony.id, rank, mode);
    return null;
  }

  function buildDefactoDeJureMap(vm, node) {
    const map = {};
    if (!node) return map;

    if (node._type === 'barony') {
      const viscounty = getPrimaryDeJureTitleForBarony(vm, node, 'viscounty');
      const county = getPrimaryDeJureTitleForBarony(vm, node, 'county');
      const marquisate = getPrimaryDeJureTitleForBarony(vm, node, 'marquisate');
      const duchy = getPrimaryDeJureTitleForBarony(vm, node, 'duchy');
      const archduchy = getPrimaryDeJureTitleForBarony(vm, node, 'archduchy');
      const kingdom = getPrimaryDeJureTitleForBarony(vm, node, 'kingdom');
      const empire = getPrimaryDeJureTitleForBarony(vm, node, 'empire');
      if (viscounty) map.viscounty = viscounty;
      if (county) map.county = county;
      if (marquisate) map.marquisate = marquisate;
      if (duchy) map.duchy = duchy;
      if (archduchy) map.archduchy = archduchy;
      if (kingdom) map.kingdom = kingdom;
      if (empire) map.empire = empire;
    } else if (node._type === 'county') {
      const marquisate = getCollectionEntity(vm, 'marquisate', node.marquisate_id);
      const duchy = getCollectionEntity(vm, 'duchy', node.duchy_id);
      const archduchy = getCollectionEntity(vm, 'archduchy', duchy?.archduchy_id);
      const kingdom = getCollectionEntity(vm, 'kingdom', duchy?.kingdom_id);
      const empire = getCollectionEntity(vm, 'empire', kingdom?.empire_id);
      if (marquisate) map.marquisate = marquisate;
      if (duchy) map.duchy = duchy;
      if (archduchy) map.archduchy = archduchy;
      if (kingdom) map.kingdom = kingdom;
      if (empire) map.empire = empire;
    } else if (node._type === 'duchy') {
      const archduchy = getCollectionEntity(vm, 'archduchy', node.archduchy_id);
      const kingdom = getCollectionEntity(vm, 'kingdom', node.kingdom_id);
      const empire = getCollectionEntity(vm, 'empire', kingdom?.empire_id);
      if (archduchy) map.archduchy = archduchy;
      if (kingdom) map.kingdom = kingdom;
      if (empire) map.empire = empire;
    } else if (node._type === 'kingdom') {
      const empire = getCollectionEntity(vm, 'empire', node.empire_id);
      if (empire) map.empire = empire;
    }

    return map;
  }

  function getHighestOwnedRankIndex(ownerIndex, seigneur) {
    if (!seigneur) return -1;
    const owned = ownerIndex[seigneur.id];
    if (!owned) return -1;
    for (let i = RANK_SEQUENCE.length - 1; i >= 1; i--) {
      const rank = RANK_SEQUENCE[i];
      if ((owned[rank] || []).length > 0) return i;
    }
    return -1;
  }

  function pickClosestHigherOwnedTitle(ownerIndex, seigneur, fromRank, dejureMap) {
    if (!seigneur) return null;
    const startIndex = getRankIndex(fromRank);
    const sid = seigneur.id;
    const owned = ownerIndex[sid];
    if (!owned) return null;

    for (let i = startIndex + 1; i < RANK_SEQUENCE.length; i++) {
      const rank = RANK_SEQUENCE[i];
      const candidates = owned[rank] || [];
      if (!candidates.length) continue;
      const dejureTitle = dejureMap?.[rank] || null;
      if (dejureTitle && candidates.some((candidate) => String(candidate.id) === String(dejureTitle.id))) {
        return dejureTitle;
      }
      return candidates[0];
    }
    return null;
  }

  function pickClosestHigherOwnedTitleFromChain(vm, ownerIndex, seigneur, fromRank, dejureMap, originNode) {
    let current = seigneur || null;
    const visitedSeigneurs = new Set();
    while (current) {
      const token = `seigneur:${current.id}`;
      if (visitedSeigneurs.has(token)) {
        addDiagnostic(vm, 'cycle', `Cycle de suzerainete detecte pendant la resolution de facto depuis ${originNode._type} ${originNode.id}.`, {
          relation: 'defacto_owner_chain',
          nodeType: originNode._type,
          nodeId: originNode.id,
          seigneurId: current.id
        });
        return null;
      }
      visitedSeigneurs.add(token);
      const selected = pickClosestHigherOwnedTitle(ownerIndex, current, fromRank, dejureMap);
      if (selected) return selected;
      current = current.overlord || null;
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
      const map = getCollection(vm, targetRank)?.byId;
      if (!map || !map[id]) return;
      candidates.push(map[id]);
    }

    getDefactoOverrideSpecs(rank, node).forEach(([targetRank, , idValue]) => {
      pushCandidate(targetRank, idValue);
    });

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

    const dejureMap = buildDefactoDeJureMap(vm, node);
    const seigneur = node.seigneur || null;
    if (seigneur && getHighestOwnedRankIndex(ownerIndex, seigneur) > getRankIndex(rank)) {
      const selected = pickClosestHigherOwnedTitle(ownerIndex, seigneur, rank, dejureMap);
      if (selected) return selected;
      return null;
    }

    return pickClosestHigherOwnedTitleFromChain(vm, ownerIndex, seigneur?.overlord || null, rank, dejureMap, node);
  }

  function computeDefactoHierarchy(vm) {
    const ownerIndex = buildOwnerTitleIndex(vm);
    const allNodes = getAllRankNodes(vm);

    allNodes.forEach((node) => recordInvalidDefactoOverrides(vm, node));

    allNodes.forEach((node) => {
      const parent = resolveDefactoParent(vm, node, ownerIndex);
      node.defactoParent = parent && validateDefactoParent(vm, node, parent) ? parent : null;
      node.defactoChildren = [];
    });

    detectDefactoCycles(vm, allNodes);

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

  function assignBaronyTitleReferences(vm) {
    vm.baronies.list.forEach((barony) => {
      barony.dejure = { barony };
      barony.defacto = { barony };
      TITLE_RANKS.forEach((rank) => {
        barony.dejure[rank] = getDeJureTitleForBarony(vm, barony, rank);
        barony.defacto[rank] = barony.defactoByRank?.[rank] || null;
      });
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
        barony: s.titles.barony.slice(),
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
      diagnostics: [],
      meta: {
        rankSequence: RANK_SEQUENCE.slice(),
        titleRanks: TITLE_RANKS.slice(),
        sourceShape: null
      }
    };

    Object.entries(ENTITY_CONFIG).forEach(([name, cfg]) => {
      vm[name] = createCollection(rawData, cfg.aliases, cfg.type);
      if (vm[name].list.length && !vm.meta.sourceShape) vm.meta.sourceShape = name;
    });
    if (!vm.meta.sourceShape) vm.meta.sourceShape = 'unknown';

    initReferences(vm);
    linkOwnerAndReligion(vm);
    linkTitleOwners(vm);
    linkDeJureHierarchy(vm);
    detectDeJureCycles(vm);
    linkSpecialRelations(vm, options);
    linkBaronyConnections(vm, rawData, options);
    linkTradeRelations(vm);

    if (options.includeDefacto) {
      computeDefactoHierarchy(vm);
    }
    assignBaronyTitleReferences(vm);

    if (options.includeOrganigrammes) {
      computeOrganigrammes(vm);
    }

    finalizeIndexes(vm, options);
    ensureEntityColors(vm, options);

    vm.getEntity = function getEntity(rankOrType, id) {
      if (!rankOrType) return null;
      const normalizedType = String(rankOrType).toLowerCase();
      const collectionName = Object.keys(ENTITY_CONFIG).find((key) => ENTITY_CONFIG[key].type.toLowerCase() === normalizedType);
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


    vm.getTitleForBarony = function getTitleForBarony(baronyId, rankKey, mode = 'dejure') {
      const barony = vm.getEntity('barony', baronyId);
      const normalizedRank = String(rankKey || '').toLowerCase();
      if (!barony || !normalizedRank) return null;
      if (mode === 'defacto') {
        return barony.defactoByRank?.[normalizedRank] || null;
      }
      return getDeJureTitleForBarony(vm, barony, normalizedRank);
    };

    vm.getBaronyTitleId = function getBaronyTitleId(baronyId, rankKey, mode = 'dejure') {
      return vm.getTitleForBarony(baronyId, rankKey, mode);
    };

    vm.getChildrenForTitle = function getChildrenForTitle(rankKey, titleId, mode = 'dejure') {
      const title = vm.getEntity(rankKey, titleId);
      if (!title) return [];
      if (mode === 'defacto') return getDirectDefactoChildrenForTitle(vm, title);
      return getDirectDeJureChildrenForTitle(vm, title);
    };

    vm.getColorForBaronyFilter = function getColorForBaronyFilter(baronyId, filterKey, fallback = '#999999') {
      const barony = vm.getEntity('barony', baronyId);
      const target = getColorTargetForBaronyFilter(vm, barony, filterKey);
      return target?.color || fallback;
    };

    vm.getBaronyFilterTarget = function getBaronyFilterTarget(baronyId, filterKey) {
      const barony = vm.getEntity('barony', baronyId);
      return getColorTargetForBaronyFilter(vm, barony, filterKey);
    };

    vm.getDeJureAncestors = function getDeJureAncestors(rankOrType, id) {
      const entity = vm.getEntity(rankOrType, id);
      return getDeJureAncestorsFromNode(vm, entity);
    };

    vm.getDefactoAncestors = function getDefactoAncestors(rankOrType, id) {
      const entity = vm.getEntity(rankOrType, id);
      const ancestors = [];
      const visited = new Set();
      let cur = entity;
      while (cur && cur.defactoParent) {
        const parent = cur.defactoParent;
        const token = getNodeToken(parent);
        if (!token || visited.has(token)) break;
        visited.add(token);
        ancestors.push(parent);
        cur = parent;
      }
      return ancestors;
    };

    vm.getBaroniesForTitle = function getBaroniesForTitle(rankKey, titleId, mode = 'dejure') {
      const normalizedRank = String(rankKey || '').toLowerCase();
      if (normalizedRank === 'barony') {
        const barony = vm.getEntity('barony', titleId);
        return barony ? [barony] : [];
      }
      if (!isRankKey(normalizedRank)) return [];
      return vm.baronies.list.filter((barony) => {
        const title = vm.getTitleForBarony(barony.id, normalizedRank, mode);
        return !!title && String(title.id) === String(titleId);
      });
    };

    vm.getImmediateSubtitles = function getImmediateSubtitles(rankKey, titleId, mode = 'dejure') {
      const normalizedRank = String(rankKey || '').toLowerCase();
      const children = vm.getChildrenForTitle(normalizedRank, titleId, mode);
      if (mode === 'defacto') return dedupeEntities(children);
      if (normalizedRank === 'county' || normalizedRank === 'viscounty') {
        return dedupeEntities(children.filter((child) => child._type === 'barony'));
      }
      return dedupeEntities(children);
    };

    vm.getSubtreeForTitle = function getSubtreeForTitle(rankKey, titleId, mode = 'dejure') {
      const root = vm.getEntity(rankKey, titleId);
      if (!root) return [];
      const descendants = [];
      const visited = new Set();

      function visit(node) {
        const children = mode === 'defacto'
          ? getDirectDefactoChildrenForTitle(vm, node)
          : getDirectDeJureChildrenForTitle(vm, node);
        children.forEach((child) => {
          const token = getNodeToken(child);
          if (!token || visited.has(token)) return;
          visited.add(token);
          descendants.push(child);
          visit(child);
        });
      }

      visit(root);
      return descendants;
    };

    vm.getEntityColor = function getEntityColor(rankOrType, id, fallback = '#999999') {
      const entity = vm.getEntity(rankOrType, id);
      return entity?.color || fallback;
    };

    function clearBaronyDistances() {
      vm.baronies.list.forEach((barony) => {
        barony.distanceToSelected = -1;
      });
    }

    vm.applyDistancesToBaronies = function applyDistancesToBaronies(fromBaronyId) {
      clearBaronyDistances();
      const start = vm.getEntity('barony', fromBaronyId);
      if (!start) return {};

      const distanceMap = {};
      const queue = [{ barony: start, dist: 0 }];
      distanceMap[start.id] = 0;
      start.distanceToSelected = 0;

      while (queue.length) {
        let bestIndex = 0;
        for (let i = 1; i < queue.length; i += 1) {
          if (queue[i].dist < queue[bestIndex].dist) bestIndex = i;
        }
        const current = queue.splice(bestIndex, 1)[0];
        if (!current || current.dist !== distanceMap[current.barony.id]) continue;

        (current.barony.connectedBaronies || []).forEach((neighbor) => {
          const target = vm.getEntity('barony', neighbor.id);
          if (!target) return;
          const parsedDistance = parseInt(neighbor.distance, 10);
          const weight = Number.isFinite(parsedDistance) && parsedDistance > 0 ? parsedDistance : 1;
          const nextDist = current.dist + weight;
          if (distanceMap[target.id] === undefined || nextDist < distanceMap[target.id]) {
            distanceMap[target.id] = nextDist;
            target.distanceToSelected = nextDist;
            queue.push({ barony: target, dist: nextDist });
          }
        });
      }

      return distanceMap;
    };

    vm.getSeigneurRankKey = function getSeigneurRankKey(seigneurId) {
      const seigneur = vm.getEntity('seigneur', seigneurId);
      return seigneur?.highestTitleRank || 'barony';
    };

    computeDuchyPiety(vm);

    return vm;
  }

  function normalizeTradePath(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(val => parseInt(val, 10)).filter(Number.isFinite);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(val => parseInt(val, 10)).filter(Number.isFinite);
      } catch (err) {
        const matches = raw.match(/-?\d+/g);
        return matches ? matches.map(val => parseInt(val, 10)).filter(Number.isFinite) : [];
      }
    }
    return [];
  }

  function addUniqueBaronyRef(list, barony) {
    if (!barony || list.some(item => item.id === barony.id)) return;
    list.push(barony);
  }

  function linkTradeRelations(vm) {
    vm.tradeRoutes.list.forEach((route) => {
      route.path = normalizeTradePath(route.path);
      route.origin = vm.baronies.byId[toId(route.barony_id_1)] || null;
      route.destination = vm.baronies.byId[toId(route.barony_id_2)] || null;
      if (route.origin) route.origin.tradeRoutes.push(route);
      if (route.destination) route.destination.tradeRoutes.push(route);
      addUniqueBaronyRef(route.origin?.landTradeBaronies || [], route.destination);
      addUniqueBaronyRef(route.destination?.landTradeBaronies || [], route.origin);
    });

    vm.tradeLines.list.forEach((line) => {
      line.path = normalizeTradePath(line.path);
      line.origin = vm.baronies.byId[toId(line.barony_id_1)] || null;
      line.destination = vm.baronies.byId[toId(line.barony_id_2)] || null;
      if (line.origin) line.origin.tradeLines.push(line);
      if (line.destination) line.destination.tradeLines.push(line);
      addUniqueBaronyRef(line.origin?.seaTradeBaronies || [], line.destination);
      addUniqueBaronyRef(line.destination?.seaTradeBaronies || [], line.origin);
    });
  }

  function isDefaultExcludedPietyReligion(vm, religionId) {
    if (!religionId) return true;
    const religion = vm.religions.byId[toId(religionId)];
    if (!religion?.name) return false;
    return String(religion.name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes('athe');
  }

  function computeDuchyPiety(vm) {
    const piety = global.duchyPiety || (typeof duchyPiety !== 'undefined' ? duchyPiety : null);
    if (!piety) return;
    const sanctuaryMap = {};
    vm.baronies.list.forEach((barony) => {
      sanctuaryMap[barony.id] = barony.sanctuaries || [];
    });
    const stats = piety.computeDuchyPietyStats(
      {
        baronyMeta: vm.baronies.byId,
        sanctuaryMap,
        seigneurMap: vm.seigneurs.byId,
        duchyMap: vm.duchies.byId,
        religionMap: vm.religions.byId
      },
      {
        getDuchyIdForBarony: (barony) => barony?.dejure?.duchy?.id || null,
        getSeigneurRankKey: (seigneurId) => vm.getSeigneurRankKey(seigneurId),
        isExcludedReligion: (religionId) => isDefaultExcludedPietyReligion(vm, religionId),
        includeTieBreakBonus: true
      }
    );
    const winners = piety.buildDuchyPietyWinnersFromStats(stats, vm.religions.byId);
    vm.duchies.list.forEach((duchy) => {
      duchy.pietyStatsByReligion = stats[String(duchy.id)] || {};
      duchy.duchyPietyWinnerId = winners[String(duchy.id)] || null;
      duchy.duchyPietyWinnerReligion = duchy.duchyPietyWinnerId ? vm.getEntity('religion', duchy.duchyPietyWinnerId) : null;
    });
    vm.baronies.list.forEach((barony) => {
      barony.duchyPietyWinnerReligion = barony.dejure?.duchy?.duchyPietyWinnerReligion || null;
    });
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
