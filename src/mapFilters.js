(function (global) {
  function init(core, data, options = {}) {
    const updateLegend = options.updateLegend || (() => {});
    const terrainColor = mapCore.terrainColor;
    const playerSeigneurColor = [36, 163, 33];
    const playerBishopColor = [255, 106, 6];
    const npcSeigneurColor = [195, 195, 195];
    const npcBishopColor = [127, 127, 127];
    const tradeRoutePrimaryColor = [36, 163, 33];
    const tradeRouteLandColor = [255, 106, 6];
    const tradeRouteSeaColor = [52, 152, 219];
    const tradeRoutePathColor = [255, 159, 67];
    const DEFAULT_ALPHA = 255;
    const SELECTED_ALPHA = 102;
    let currentFilter = '';
    let canonicalPatterns = {};
    let colorMap = {};
    let tradeRouteSelection = null;
    let tradeLineSelection = null;

    function isVacantBarony(info) {
      return !!(info && (info.vacant === 1 || info.vacant === '1' || info.vacant === true));
    }

    const duchyPietyTitleBonusConfig = {
      barony: 0.5,
      viscounty: 0.75,
      county: 1,
      marquisate: 1.25,
      duchy: 1.5,
      archduchy: 2,
      kingdom: 3,
      empire: 4
    };

    function getSeigneurRankKey(seigneurId) {
      const sid = String(seigneurId || '');
      if (data.seigneurToEmpire?.[sid]?.length) return 'empire';
      if (data.seigneurToKingdom?.[sid]?.length) return 'kingdom';
      if (data.seigneurToArchduchy?.[sid]?.length) return 'archduchy';
      if (data.seigneurToDuchy?.[sid]?.length) return 'duchy';
      if (data.seigneurToMarquisate?.[sid]?.length) return 'marquisate';
      if (data.seigneurToCounty?.[sid]?.length) return 'county';
      if (data.seigneurToViscounty?.[sid]?.length) return 'viscounty';
      return 'barony';
    }

    function getDuchyIdForBarony(info) {
      if (!info) return null;
      const county = data.countyMap?.[info.county_id];
      return county?.duchy_id || null;
    }

    function buildDuchyPietyWinners() {
      const duchyStats = {};
      Object.values(data.baronyMeta || {}).forEach(info => {
        const duchyId = getDuchyIdForBarony(info);
        if (!duchyId) return;
        const key = String(duchyId);
        if (!duchyStats[key]) duchyStats[key] = {};
        const add = (religionId, points) => {
          if (!religionId || !points) return;
          const rKey = String(religionId);
          duchyStats[key][rKey] = (duchyStats[key][rKey] || 0) + points;
        };
        add(info.religion_pop_id, 1);
        add(info.priory_religion_id, 1);
        add(info.church_religion_id, 3);
        add(info.cathedral_religion_id, 5);
        const sancts = data.sanctuaryMap?.[info.id] || [];
        sancts.forEach(s => {
          const isActive = info.religion_pop_id && String(info.religion_pop_id) === String(s.religion_id);
          add(s.religion_id, isActive ? 3 : 0.1);
        });
        if (!isVacantBarony(info)) {
          const owner = info.seigneur_id ? data.seigneurMap?.[info.seigneur_id] : null;
          if (owner?.bishop) add(owner.religion_id, 8);
          const rankKey = getSeigneurRankKey(info.seigneur_id);
          add(owner?.religion_id, duchyPietyTitleBonusConfig[rankKey] || 0);
        }
      });
      Object.values(data.duchyMap || {}).forEach(duchy => {
        const religionId = duchy?.banquet_religion_id;
        if (!duchy?.id || !religionId) return;
        const dKey = String(duchy.id);
        const rKey = String(religionId);
        if (!duchyStats[dKey]) duchyStats[dKey] = {};
        duchyStats[dKey][rKey] = (duchyStats[dKey][rKey] || 0) + 8;
      });
      const winners = {};
      Object.entries(duchyStats).forEach(([duchyId, scores]) => {
        const ranked = Object.entries(scores).sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          const aName = data.religionMap?.[a[0]]?.name || '';
          const bName = data.religionMap?.[b[0]]?.name || '';
          return aName.localeCompare(bName, 'fr');
        });
        if (ranked.length > 0) winners[duchyId] = parseInt(ranked[0][0], 10);
      });
      return winners;
    }

    function generateColor(str) {
      const hue = Math.floor(Math.random() * 360);
      const [r, g, b] = hslToRgb(hue, 65, 65);
      return [r, g, b, DEFAULT_ALPHA];
    }

    function hslToRgb(h, s, l) {
      s /= 100; l /= 100;
      const k = n => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
    }

    function hexToRgb(hex) {
      if (!hex) return null;
      const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
      return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
    }

    function normalizeTradePath(raw) {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.map(val => parseInt(val, 10)).filter(Number.isFinite);
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed.map(val => parseInt(val, 10)).filter(Number.isFinite);
          }
        } catch (err) {
          const matches = raw.match(/-?\d+/g);
          return matches ? matches.map(val => parseInt(val, 10)).filter(Number.isFinite) : [];
        }
      }
      return [];
    }

    function initColorMap() {
      colorMap = {};
      Object.keys(data.baronyMeta || {}).forEach(id => {
        colorMap[id] = generateColor(id);
      });
      canonicalPatterns = {};
      core.setCanonicalPatterns(canonicalPatterns);
      core.setColorMap(colorMap);
    }

    function randomizeColors() {
      applyFilter(currentFilter, true);
    }

    function setTradeRouteSelection(routeId) {
      tradeRouteSelection = routeId || null;
      tradeLineSelection = null;
      if (currentFilter === 'trade_routes') {
        applyFilter('trade_routes');
      }
    }

    function setTradeLineSelection(lineId) {
      tradeLineSelection = lineId || null;
      if (tradeLineSelection) {
        tradeRouteSelection = null;
      }
      if (currentFilter === 'trade_routes') {
        applyFilter('trade_routes');
      }
    }

    const rankSequence = ['barony', 'viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'];
    const titleConfig = {
      viscounty: { map: data.viscountyMap, seigneurTo: data.seigneurToViscounty },
      county: { map: data.countyMap, seigneurTo: data.seigneurToCounty },
      marquisate: { map: data.marquisateMap, seigneurTo: data.seigneurToMarquisate },
      duchy: { map: data.duchyMap, seigneurTo: data.seigneurToDuchy },
      archduchy: { map: data.archduchyMap, seigneurTo: data.seigneurToArchduchy },
      kingdom: { map: data.kingdomMap, seigneurTo: data.seigneurToKingdom },
      empire: { map: data.empireMap, seigneurTo: data.seigneurToEmpire }
    };

    function getRankIndex(rankKey) {
      return rankSequence.indexOf(rankKey);
    }

    function buildSeigneurChain(startId) {
      const chain = [];
      let sid = startId;
      while (sid) {
        chain.push(String(sid));
        sid = data.seigneurMap?.[sid]?.overlord_id;
      }
      return chain;
    }

    function chooseByDejure(candidates, dejureId) {
      if (!Array.isArray(candidates) || candidates.length === 0) return null;
      if (dejureId && candidates.includes(dejureId)) return dejureId;
      return candidates[0];
    }

    function getHighestRankIndex(seigneurId) {
      if (!seigneurId) return -1;
      for (let i = rankSequence.length - 1; i >= 1; i--) {
        const key = rankSequence[i];
        const list = titleConfig[key]?.seigneurTo?.[String(seigneurId)];
        if (Array.isArray(list) && list.length > 0) return i;
      }
      return -1;
    }

    function chooseClosestTitleForSeigneur(seigneurId, startIndex, dejureMap) {
      for (let i = startIndex + 1; i < rankSequence.length; i++) {
        const key = rankSequence[i];
        const list = titleConfig[key]?.seigneurTo?.[String(seigneurId)];
        if (Array.isArray(list) && list.length > 0) {
          const selected = chooseByDejure(list, dejureMap[key]);
          return selected ? { rankKey: key, id: selected } : null;
        }
      }
      return null;
    }

    function chooseClosestTitleFromChain(startId, startIndex, dejureMap) {
      const chain = buildSeigneurChain(startId);
      for (const sid of chain) {
        const selected = chooseClosestTitleForSeigneur(sid, startIndex, dejureMap);
        if (selected) return selected;
      }
      return null;
    }

    function getOverrideCandidates(rankKey, info) {
      const overrides = [];
      if (!info) return overrides;
      if (rankKey === 'barony') {
        if (info.defacto_viscounty_id) overrides.push({ rankKey: 'viscounty', id: info.defacto_viscounty_id });
        if (info.defacto_county_id) overrides.push({ rankKey: 'county', id: info.defacto_county_id });
      } else if (rankKey === 'viscounty') {
        if (info.defacto_county_id) overrides.push({ rankKey: 'county', id: info.defacto_county_id });
      } else if (rankKey === 'county') {
        if (info.defacto_marquisate_id) overrides.push({ rankKey: 'marquisate', id: info.defacto_marquisate_id });
        if (info.defacto_duchy_id) overrides.push({ rankKey: 'duchy', id: info.defacto_duchy_id });
      } else if (rankKey === 'marquisate') {
        if (info.defacto_duchy_id) overrides.push({ rankKey: 'duchy', id: info.defacto_duchy_id });
      } else if (rankKey === 'duchy') {
        if (info.defacto_archduchy_id) overrides.push({ rankKey: 'archduchy', id: info.defacto_archduchy_id });
        if (info.defacto_kingdom_id) overrides.push({ rankKey: 'kingdom', id: info.defacto_kingdom_id });
      } else if (rankKey === 'archduchy') {
        if (info.defacto_kingdom_id) overrides.push({ rankKey: 'kingdom', id: info.defacto_kingdom_id });
      } else if (rankKey === 'kingdom') {
        if (info.defacto_empire_id) overrides.push({ rankKey: 'empire', id: info.defacto_empire_id });
      }
      return overrides;
    }

    function chooseClosestOverride(rankKey, info) {
      const overrides = getOverrideCandidates(rankKey, info);
      const startIndex = getRankIndex(rankKey);
      let best = null;
      let bestIndex = Infinity;
      overrides.forEach(candidate => {
        const idx = getRankIndex(candidate.rankKey);
        if (idx > startIndex && idx < bestIndex) {
          best = candidate;
          bestIndex = idx;
        }
      });
      return best;
    }

    function getDejureMapForTitle(rankKey, info) {
      const dejureMap = {};
      if (!info) return dejureMap;
      if (rankKey === 'barony') {
        if (info.viscounty_id) dejureMap.viscounty = info.viscounty_id;
        if (info.county_id) dejureMap.county = info.county_id;
        const county = info.county_id ? data.countyMap?.[info.county_id] : null;
        if (county?.marquisate_id) dejureMap.marquisate = county.marquisate_id;
        if (county?.duchy_id) dejureMap.duchy = county.duchy_id;
        const duchy = county?.duchy_id ? data.duchyMap?.[county.duchy_id] : null;
        if (duchy?.archduchy_id) dejureMap.archduchy = duchy.archduchy_id;
        if (duchy?.kingdom_id) dejureMap.kingdom = duchy.kingdom_id;
        const kingdom = duchy?.kingdom_id ? data.kingdomMap?.[duchy.kingdom_id] : null;
        if (kingdom?.empire_id) dejureMap.empire = kingdom.empire_id;
      } else if (rankKey === 'county') {
        if (info.marquisate_id) dejureMap.marquisate = info.marquisate_id;
        if (info.duchy_id) dejureMap.duchy = info.duchy_id;
        const duchy = info.duchy_id ? data.duchyMap?.[info.duchy_id] : null;
        if (duchy?.archduchy_id) dejureMap.archduchy = duchy.archduchy_id;
        if (duchy?.kingdom_id) dejureMap.kingdom = duchy.kingdom_id;
        const kingdom = duchy?.kingdom_id ? data.kingdomMap?.[duchy.kingdom_id] : null;
        if (kingdom?.empire_id) dejureMap.empire = kingdom.empire_id;
      } else if (rankKey === 'duchy') {
        if (info.archduchy_id) dejureMap.archduchy = info.archduchy_id;
        if (info.kingdom_id) dejureMap.kingdom = info.kingdom_id;
        const kingdom = info.kingdom_id ? data.kingdomMap?.[info.kingdom_id] : null;
        if (kingdom?.empire_id) dejureMap.empire = kingdom.empire_id;
      } else if (rankKey === 'kingdom') {
        if (info.empire_id) dejureMap.empire = info.empire_id;
      }
      return dejureMap;
    }

    function resolveDefactoParent(rankKey, info) {
      if (!info) return null;
      const startIndex = getRankIndex(rankKey);
      if (startIndex < 0 || startIndex >= rankSequence.length - 1) return null;
      const override = chooseClosestOverride(rankKey, info);
      if (override) return override;
      const dejureMap = getDejureMapForTitle(rankKey, info);
      const seigneurId = info.seigneur_id;
      if (seigneurId) {
        const highestIndex = getHighestRankIndex(seigneurId);
        if (highestIndex > startIndex) {
          const selected = chooseClosestTitleForSeigneur(seigneurId, startIndex, dejureMap);
          if (selected) return selected;
        } else {
          const overlordId = data.seigneurMap?.[seigneurId]?.overlord_id;
          const selected = chooseClosestTitleFromChain(overlordId, startIndex, dejureMap);
          if (selected) return selected;
        }
      }
      return null;
    }

    function resolveDefactoTitle(info, targetRankKey) {
      if (!info) return null;
      const targetIndex = getRankIndex(targetRankKey);
      if (targetIndex < 1) return null;
      let currentRankKey = 'barony';
      let currentInfo = info;
      const visited = new Set();
      while (currentRankKey && getRankIndex(currentRankKey) < targetIndex) {
        const parent = resolveDefactoParent(currentRankKey, currentInfo);
        if (!parent) return null;
        if (parent.rankKey === targetRankKey) return parent.id;
        const parentInfo = titleConfig[parent.rankKey]?.map?.[parent.id];
        if (!parentInfo) return null;
        const token = `${parent.rankKey}:${parent.id}`;
        if (visited.has(token)) return null;
        visited.add(token);
        currentRankKey = parent.rankKey;
        currentInfo = parentInfo;
      }
      return null;
    }

    function applyFilter(type, randomize = false) {
      if (data.mapMode === 'sea') {
        currentFilter = type || '';
        colorMap = {};
        if (type === 'distance') {
          if (!core.currentSelectedId) {
            updateLegend(null);
            core.setCanonicalPatterns({});
            core.setColorMap(colorMap);
            return;
          }
          const { distanceMap: distances } = breadthFirst(core.currentSelectedId, cur => data.baronyAdjacency[cur] || []);
          Object.keys(data.baronyMeta).forEach(id => {
            const d = distances[id];
            if (d === undefined) return;
            const hue = (d * 40) % 360;
            const [r, g, b] = hslToRgb(hue, 65, 65);
            colorMap[id] = [r, g, b, DEFAULT_ALPHA];
          });
        } else {
          Object.keys(data.baronyMeta || {}).forEach(id => {
            const hue = Math.floor(Math.random() * 360);
            const [r, g, b] = hslToRgb(hue, 65, 65);
            colorMap[id] = [r, g, b, DEFAULT_ALPHA];
          });
        }
        if (core.currentSelectedId && colorMap[core.currentSelectedId]) colorMap[core.currentSelectedId][3] = SELECTED_ALPHA;
        updateLegend(null);
        canonicalPatterns = {};
        core.setCanonicalPatterns(canonicalPatterns);
        core.setColorMap(colorMap);
        return;
      }
      currentFilter = type || '';
      canonicalPatterns = {};
      if (!type) {
        initColorMap();
        updateLegend(null);
        if (core.currentSelectedId && colorMap[core.currentSelectedId]) {
          colorMap[core.currentSelectedId][3] = SELECTED_ALPHA;
          core.setColorMap(colorMap);
        }
        return;
      }
      if (type === 'distance') {
        colorMap = {};
        if (!core.currentSelectedId) {
          updateLegend(null);
          core.setCanonicalPatterns({});
          core.setColorMap(colorMap);
          return;
        }
        const { distanceMap: distances } = breadthFirst(core.currentSelectedId, cur => data.baronyAdjacency[cur] || []);
        Object.keys(data.baronyMeta).forEach(id => {
          const d = distances[id];
          if (d === undefined) return;
          const hue = (d * 40) % 360;
          const [r, g, b] = hslToRgb(hue, 65, 65);
          colorMap[id] = [r, g, b, DEFAULT_ALPHA];
        });
        if (core.currentSelectedId && colorMap[core.currentSelectedId]) colorMap[core.currentSelectedId][3] = SELECTED_ALPHA;
        updateLegend(null);
        core.setCanonicalPatterns({});
        core.setColorMap(colorMap);
        return;
      }
      if (type === 'trade_routes') {
        colorMap = {};
        const routeMap = data.tradeRouteById || {};
        const lineMap = data.tradeLineById || {};
        const route = tradeRouteSelection ? routeMap[tradeRouteSelection] : null;
        const line = tradeLineSelection ? lineMap[tradeLineSelection] : null;
        if (route) {
          const path = normalizeTradePath(route.path);
          const startId = route.barony_id_1;
          const endId = route.barony_id_2;
          const pathNodes = path.filter(id => id && id !== startId && id !== endId);
          pathNodes.forEach(id => {
            colorMap[id] = [...tradeRoutePathColor, DEFAULT_ALPHA];
          });
          if (startId) colorMap[startId] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
          if (endId) colorMap[endId] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
          updateLegend(null);
          core.setCanonicalPatterns({});
          core.setColorMap(colorMap);
          return;
        }
        if (line) {
          colorMap[line.barony_id_1] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
          colorMap[line.barony_id_2] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
          updateLegend(null);
          core.setCanonicalPatterns({});
          core.setColorMap(colorMap);
          return;
        }
        const selectedId = core.currentSelectedId;
        if (!selectedId) {
          updateLegend(null);
          core.setCanonicalPatterns({});
          core.setColorMap(colorMap);
          return;
        }
        colorMap[selectedId] = [...tradeRoutePrimaryColor, SELECTED_ALPHA];
        const landConnected = new Set((data.tradeRouteConnections && data.tradeRouteConnections[selectedId]) || []);
        const seaConnected = new Set((data.tradeLineConnections && data.tradeLineConnections[selectedId]) || []);
        landConnected.forEach(id => {
          if (!id) return;
          if (seaConnected.has(id)) {
            canonicalPatterns[id] = [tradeRouteLandColor, tradeRouteSeaColor];
            colorMap[id] = [...tradeRouteLandColor, DEFAULT_ALPHA];
            return;
          }
          colorMap[id] = [...tradeRouteLandColor, DEFAULT_ALPHA];
        });
        seaConnected.forEach(id => {
          if (!id || landConnected.has(id)) return;
          colorMap[id] = [...tradeRouteSeaColor, DEFAULT_ALPHA];
        });
        updateLegend({
          land: { color: tradeRouteLandColor, name: 'Route (terre)' },
          sea: { color: tradeRouteSeaColor, name: 'Ligne (mer)' }
        });
        core.setCanonicalPatterns(canonicalPatterns);
        core.setColorMap(colorMap);
        return;
      }
      const groupColors = {};
      const colorSources = {
        viscounty: data.viscountyMap,
        viscounty_defacto: data.viscountyMap,
        county: data.countyMap,
        county_defacto: data.countyMap,
        marquisate: data.marquisateMap,
        marquisate_defacto: data.marquisateMap,
        duchy: data.duchyMap,
        duchy_defacto: data.duchyMap,
        archduchy: data.archduchyMap,
        archduchy_defacto: data.archduchyMap,
        kingdom: data.kingdomMap,
        kingdom_defacto: data.kingdomMap,
        empire: data.empireMap,
        empire_defacto: data.empireMap
      };
      colorMap = {};
      const duchyPietyWinners = type === 'duchy_piety_ranking' ? buildDuchyPietyWinners() : {};
      Object.entries(data.baronyMeta).forEach(([id, info]) => {
        let groupId = null;
        let groupName = '';
        const isVacant = isVacantBarony(info);
        if (type === 'canonical') {
          const rIds = data.canonicalLandMap[id] || [];
          if (rIds.length === 0) {
            colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
            return;
          }
          canonicalPatterns[id] = rIds.map(cid => {
            if (!groupColors[cid]) {
              const col = hexToRgb(data.baronyMeta[cid]?.color) || generateColor(String(cid)).slice(0, 3);
              groupColors[cid] = { color: col, name: data.baronyMeta[cid]?.name || 'N/A' };
            }
            return groupColors[cid].color;
          });
          const first = canonicalPatterns[id][0];
          colorMap[id] = [first[0], first[1], first[2], DEFAULT_ALPHA];
          return;
        } else if (type === 'religion') {
          groupId = info.religion_pop_id;
          groupName = data.religionMap[groupId]?.name || '';
        } else if (type === 'seigneur_religion') {
          if (isVacant) {
            colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
            return;
          }
          const owner = info.seigneur_id ? data.seigneurMap?.[info.seigneur_id] : null;
          groupId = owner?.religion_id;
          groupName = data.religionMap[groupId]?.name || '';
        } else if (type === 'culture') {
          const cultureId = info.culture_id;
          const cultureInfo = cultureId ? data.cultureMapInfo[cultureId] : null;
          if (!cultureId || !cultureInfo) {
            groupId = 'none';
            groupName = 'Aucune';
          } else {
            groupId = cultureId;
            groupName = cultureInfo.name || '';
          }
        } else if (type === 'viscounty') {
          groupId = info.viscounty_id;
          groupName = data.viscountyMap[groupId]?.name || '';
        } else if (type === 'county') {
          groupId = info.county_id;
          groupName = data.countyMap[groupId]?.name || '';
        } else if (type === 'marquisate') {
          const county = data.countyMap[info.county_id];
          groupId = county ? county.marquisate_id : null;
          groupName = data.marquisateMap[groupId]?.name || '';
        } else if (type === 'duchy') {
          const county = data.countyMap[info.county_id];
          groupId = county ? county.duchy_id : null;
          groupName = data.duchyMap[groupId]?.name || '';
        } else if (type === 'duchy_piety_ranking') {
          const duchyId = getDuchyIdForBarony(info);
          groupId = duchyId ? duchyPietyWinners[String(duchyId)] : null;
          groupName = data.religionMap[groupId]?.name || '';
        } else if (type === 'archduchy') {
          const county = data.countyMap[info.county_id];
          const duchy = county ? data.duchyMap[county.duchy_id] : null;
          groupId = duchy ? duchy.archduchy_id : null;
          groupName = data.archduchyMap[groupId]?.name || '';
        } else if (type === 'kingdom') {
          const county = data.countyMap[info.county_id];
          const duchy = county ? data.duchyMap[county.duchy_id] : null;
          groupId = duchy ? duchy.kingdom_id : null;
          groupName = data.kingdomMap[groupId]?.name || '';
        } else if (type === 'empire') {
          const county = data.countyMap[info.county_id];
          const duchy = county ? data.duchyMap[county.duchy_id] : null;
          const kingdom = duchy ? data.kingdomMap[duchy.kingdom_id] : null;
          groupId = kingdom ? kingdom.empire_id : null;
          groupName = data.empireMap[groupId]?.name || '';
        } else if (type === 'viscounty_defacto') {
          groupId = resolveDefactoTitle(info, 'viscounty');
          groupName = data.viscountyMap[groupId]?.name || '';
        } else if (type === 'county_defacto') {
          groupId = resolveDefactoTitle(info, 'county');
          groupName = data.countyMap[groupId]?.name || '';
        } else if (type === 'marquisate_defacto') {
          groupId = resolveDefactoTitle(info, 'marquisate');
          groupName = data.marquisateMap[groupId]?.name || '';
        } else if (type === 'duchy_defacto') {
          groupId = resolveDefactoTitle(info, 'duchy');
          groupName = data.duchyMap[groupId]?.name || '';
        } else if (type === 'archduchy_defacto') {
          groupId = resolveDefactoTitle(info, 'archduchy');
          groupName = data.archduchyMap[groupId]?.name || '';
        } else if (type === 'kingdom_defacto') {
          groupId = resolveDefactoTitle(info, 'kingdom');
          groupName = data.kingdomMap[groupId]?.name || '';
        } else if (type === 'empire_defacto') {
          groupId = resolveDefactoTitle(info, 'empire');
          groupName = data.empireMap[groupId]?.name || '';
        } else if (type === 'sanctuary') {
          const sancts = data.sanctuaryMap[id] || [];
          if (sancts.length > 0) {
            canonicalPatterns[id] = [];
            let hasActive = false;
            const popReligionId = data.baronyMeta?.[id]?.religion_pop_id;
            sancts.forEach(s => {
              if (!groupColors[s.religion_id]) {
                const col =
                  hexToRgb(data.religionMap[s.religion_id]?.color) ||
                  generateColor(String(s.religion_id)).slice(0, 3);
                groupColors[s.religion_id] = {
                  color: col,
                  name: data.religionMap[s.religion_id]?.name || 'N/A'
                };
              }
              const col = groupColors[s.religion_id].color;
              const isActive = popReligionId && String(popReligionId) === String(s.religion_id);
              const repeat = isActive ? 3 : 1;
              if (isActive) hasActive = true;
              for (let i = 0; i < repeat; i++) canonicalPatterns[id].push(col);
            });
            if (!hasActive) {
              if (!groupColors.background) {
                groupColors.background = {
                  color: terrainColor,
                  name: 'Aucun sanctuaire actif'
                };
              }
              canonicalPatterns[id].unshift(
                groupColors.background.color,
                groupColors.background.color,
                groupColors.background.color
              );
            }
            const first = canonicalPatterns[id][0];
            colorMap[id] = [first[0], first[1], first[2], DEFAULT_ALPHA];
            return;
          }
        } else if (type === 'priory') {
          if (info.priory_religion_id) {
            groupId = info.priory_religion_id;
            groupName = data.religionMap[groupId]?.name || '';
          }
        } else if (type === 'church') {
          if (info.church_religion_id) {
            groupId = info.church_religion_id;
            groupName = data.religionMap[groupId]?.name || '';
          }
        } else if (type === 'cathedral') {
          if (info.cathedral_religion_id) {
            groupId = info.cathedral_religion_id;
            groupName = data.religionMap[groupId]?.name || '';
          }
        } else if (type === 'occupation') {
          if (isVacant) {
            colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
            return;
          }
          const owner = info.seigneur_id && data.seigneurMap ? data.seigneurMap[info.seigneur_id] : null;
          if (!owner) {
            groupId = 'unoccupied';
            groupName = 'Non occupée';
          } else if (owner.player && owner.bishop) {
            groupId = 'player_bishop';
            groupName = 'Joueur Évêque';
          } else if (owner.player) {
            groupId = 'player_seigneur';
            groupName = 'Joueur Seigneur';
          } else if (owner.bishop) {
            groupId = 'npc_bishop';
            groupName = 'PNJ Évêque';
          } else {
            groupId = 'npc_seigneur';
            groupName = 'PNJ Seigneur';
          }
        } else if (type === 'vacant') {
          groupId = isVacant ? 'vacant' : 'occupied';
          groupName = isVacant ? 'Vacante' : 'Occupée';
        }
        if (groupId == null) {
          colorMap[id] = [...terrainColor, DEFAULT_ALPHA];
          return;
        }
        if (!groupColors[groupId]) {
          let col;
          if (type === 'culture' && groupId === 'none') {
            col = terrainColor;
          } else if (type === 'occupation') {
            if (groupId === 'player_seigneur') col = playerSeigneurColor;
            else if (groupId === 'player_bishop') col = playerBishopColor;
            else if (groupId === 'npc_seigneur') col = npcSeigneurColor;
            else if (groupId === 'npc_bishop') col = npcBishopColor;
            else col = terrainColor;
          } else if (type === 'vacant') {
            col = groupId === 'vacant' ? terrainColor : [82, 190, 128];
          } else if (randomize) {
            const hue = Math.floor(Math.random() * 360);
            col = hslToRgb(hue, 65, 65);
          } else { 
            if (
              type === 'religion' ||
              type === 'seigneur_religion' ||
              type === 'priory' ||
              type === 'church' ||
              type === 'cathedral' ||
              type === 'duchy_piety_ranking'
            ) {
              col = hexToRgb(data.religionMap[groupId]?.color);
            } else if (type === 'culture') {
              col = hexToRgb(data.cultureMapInfo[groupId]?.color);
            } else {
              const sourceMap = colorSources[type];
              if (sourceMap && sourceMap[groupId] && sourceMap[groupId].color) {
                col = hexToRgb(sourceMap[groupId].color);
              }
            }
            if (!col) {
              col = generateColor(String(groupId || 0)).slice(0, 3);
            }
          }
          groupColors[groupId] = { color: col, name: groupName || 'N/A' };
        }
        const col = groupColors[groupId].color;
        colorMap[id] = [col[0], col[1], col[2], DEFAULT_ALPHA];
      });
      if (core.currentSelectedId && colorMap[core.currentSelectedId]) {
        colorMap[core.currentSelectedId][3] = SELECTED_ALPHA;
      }
      updateLegend(groupColors);
      core.setCanonicalPatterns(canonicalPatterns);
      core.setColorMap(colorMap);
    }

    initColorMap();
    return {
      applyFilter,
      randomizeColors,
      setTradeRouteSelection,
      setTradeLineSelection,
      get currentFilter() { return currentFilter; }
    };
  }
  global.mapFilters = { init };
})(typeof window !== 'undefined' ? window : global);
