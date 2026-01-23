(function (global) {
  function init(core, data, options = {}) {
    const updateLegend = options.updateLegend || (() => {});
    const terrainColor = mapCore.terrainColor;
    const playerSeigneurColor = [36, 163, 33];
    const playerBishopColor = [255, 106, 6];
    const npcSeigneurColor = [195, 195, 195];
    const npcBishopColor = [127, 127, 127];
    const tradeRoutePrimaryColor = [36, 163, 33];
    const tradeRouteSecondaryColor = [255, 106, 6];
    const tradeRoutePathColor = [195, 195, 195];
    let currentFilter = '';
    let canonicalPatterns = {};
    let colorMap = {};
    let tradeRouteSelection = null;

    function isVacantBarony(info) {
      return !!(info && (info.vacant === 1 || info.vacant === '1' || info.vacant === true));
    }

    function generateColor(str) {
      const hue = Math.floor(Math.random() * 360);
      const [r, g, b] = hslToRgb(hue, 65, 65);
      return [r, g, b, 100];
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
      if (currentFilter === 'trade_routes') {
        applyFilter('trade_routes');
      }
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

    function resolveTitleByChain({ overrideId, dejureId, titleMap, seigneurChain, seigneurToTitles, allowFallback = true }) {
      if (overrideId) return overrideId;
      if (dejureId) return dejureId;
      if (!allowFallback) return null;
      for (const sid of seigneurChain) {
        const titles = seigneurToTitles?.[sid];
        if (!Array.isArray(titles) || titles.length === 0) continue;
        return titles[0];
      }
      return null;
    }

    function resolveDefactoCounty(info, seigneurChain) {
      return resolveTitleByChain({
        overrideId: info.defacto_county_id,
        dejureId: info.county_id,
        titleMap: data.countyMap,
        seigneurChain,
        seigneurToTitles: data.seigneurToCounty
      });
    }

    function resolveDefactoViscounty(info, seigneurChain) {
      return resolveTitleByChain({
        overrideId: info.defacto_viscounty_id,
        dejureId: info.viscounty_id,
        titleMap: data.viscountyMap,
        seigneurChain,
        seigneurToTitles: data.seigneurToViscounty
      });
    }

    function resolveDefactoMarquisate(info, seigneurChain) {
      const countyId = resolveDefactoCounty(info, seigneurChain);
      const county = countyId ? data.countyMap[countyId] : null;
      return resolveTitleByChain({
        overrideId: county?.defacto_marquisate_id,
        dejureId: county?.marquisate_id,
        titleMap: data.marquisateMap,
        seigneurChain,
        seigneurToTitles: data.seigneurToMarquisate
      });
    }

    function resolveDefactoDuchy(info, seigneurChain) {
      const countyId = resolveDefactoCounty(info, seigneurChain);
      const county = countyId ? data.countyMap[countyId] : null;
      return resolveTitleByChain({
        overrideId: county?.defacto_duchy_id,
        dejureId: county?.duchy_id,
        titleMap: data.duchyMap,
        seigneurChain,
        seigneurToTitles: data.seigneurToDuchy
      });
    }

    function resolveDefactoArchduchy(info, seigneurChain) {
      const duchyId = resolveDefactoDuchy(info, seigneurChain);
      const duchy = duchyId ? data.duchyMap[duchyId] : null;
      return resolveTitleByChain({
        overrideId: duchy?.defacto_archduchy_id,
        dejureId: duchy?.archduchy_id,
        titleMap: data.archduchyMap,
        seigneurChain,
        seigneurToTitles: data.seigneurToArchduchy
      });
    }

    function resolveDefactoKingdom(info, seigneurChain) {
      const duchyId = resolveDefactoDuchy(info, seigneurChain);
      const duchy = duchyId ? data.duchyMap[duchyId] : null;
      return resolveTitleByChain({
        overrideId: duchy?.defacto_kingdom_id,
        dejureId: duchy?.kingdom_id,
        titleMap: data.kingdomMap,
        seigneurChain,
        seigneurToTitles: data.seigneurToKingdom
      });
    }

    function resolveDefactoEmpire(info, seigneurChain) {
      const kingdomId = resolveDefactoKingdom(info, seigneurChain);
      const kingdom = kingdomId ? data.kingdomMap[kingdomId] : null;
      return resolveTitleByChain({
        overrideId: kingdom?.defacto_empire_id,
        dejureId: kingdom?.empire_id,
        titleMap: data.empireMap,
        seigneurChain,
        seigneurToTitles: data.seigneurToEmpire
      });
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
            colorMap[id] = [r, g, b, 100];
          });
        } else {
          Object.keys(data.baronyMeta || {}).forEach(id => {
            const hue = Math.floor(Math.random() * 360);
            const [r, g, b] = hslToRgb(hue, 65, 65);
            colorMap[id] = [r, g, b, 100];
          });
        }
        if (core.currentSelectedId && colorMap[core.currentSelectedId]) colorMap[core.currentSelectedId][3] = 180;
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
          colorMap[core.currentSelectedId][3] = 180;
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
          colorMap[id] = [r, g, b, 100];
        });
        if (core.currentSelectedId && colorMap[core.currentSelectedId]) colorMap[core.currentSelectedId][3] = 180;
        updateLegend(null);
        core.setCanonicalPatterns({});
        core.setColorMap(colorMap);
        return;
      }
      if (type === 'trade_routes') {
        colorMap = {};
        const selectedId = core.currentSelectedId;
        if (!selectedId) {
          updateLegend(null);
          core.setCanonicalPatterns({});
          core.setColorMap(colorMap);
          return;
        }
        const routeMap = data.tradeRouteById || {};
        const route = tradeRouteSelection ? routeMap[tradeRouteSelection] : null;
        if (route && Array.isArray(route.path) && route.path.length) {
          route.path.forEach(id => {
            if (!id) return;
            colorMap[id] = [...tradeRoutePathColor, 100];
          });
          colorMap[route.barony_id_1] = [...tradeRoutePrimaryColor, 180];
          colorMap[route.barony_id_2] = [...tradeRoutePrimaryColor, 180];
        } else {
          colorMap[selectedId] = [...tradeRoutePrimaryColor, 180];
          const connected = (data.tradeRouteConnections && data.tradeRouteConnections[selectedId]) || [];
          connected.forEach(id => {
            if (!id) return;
            colorMap[id] = [...tradeRouteSecondaryColor, 100];
          });
        }
        updateLegend(null);
        core.setCanonicalPatterns({});
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
      Object.entries(data.baronyMeta).forEach(([id, info]) => {
        let groupId = null;
        let groupName = '';
        const isVacant = isVacantBarony(info);
        if (type === 'canonical') {
          const rIds = data.canonicalLandMap[id] || [];
          if (rIds.length === 0) {
            colorMap[id] = [...terrainColor, 100];
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
          colorMap[id] = [first[0], first[1], first[2], 100];
          return;
        } else if (type === 'religion') {
          groupId = info.religion_pop_id;
          groupName = data.religionMap[groupId]?.name || '';
        } else if (type === 'seigneur_religion') {
          if (isVacant) {
            colorMap[id] = [...terrainColor, 100];
            return;
          }
          const owner = info.seigneur_id ? data.seigneurMap?.[info.seigneur_id] : null;
          groupId = owner?.religion_id;
          groupName = data.religionMap[groupId]?.name || '';
        } else if (type === 'culture') {
          groupId = info.culture_id;
          groupName = data.cultureMapInfo[groupId]?.name || '';
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
          const seigneurChain = buildSeigneurChain(info.seigneur_id);
          groupId = resolveDefactoViscounty(info, seigneurChain);
          groupName = data.viscountyMap[groupId]?.name || '';
        } else if (type === 'county_defacto') {
          const seigneurChain = buildSeigneurChain(info.seigneur_id);
          groupId = resolveDefactoCounty(info, seigneurChain);
          groupName = data.countyMap[groupId]?.name || '';
        } else if (type === 'marquisate_defacto') {
          const seigneurChain = buildSeigneurChain(info.seigneur_id);
          groupId = resolveDefactoMarquisate(info, seigneurChain);
          groupName = data.marquisateMap[groupId]?.name || '';
        } else if (type === 'duchy_defacto') {
          const seigneurChain = buildSeigneurChain(info.seigneur_id);
          groupId = resolveDefactoDuchy(info, seigneurChain);
          groupName = data.duchyMap[groupId]?.name || '';
        } else if (type === 'archduchy_defacto') {
          const seigneurChain = buildSeigneurChain(info.seigneur_id);
          groupId = resolveDefactoArchduchy(info, seigneurChain);
          groupName = data.archduchyMap[groupId]?.name || '';
        } else if (type === 'kingdom_defacto') {
          const seigneurChain = buildSeigneurChain(info.seigneur_id);
          groupId = resolveDefactoKingdom(info, seigneurChain);
          groupName = data.kingdomMap[groupId]?.name || '';
        } else if (type === 'empire_defacto') {
          const seigneurChain = buildSeigneurChain(info.seigneur_id);
          groupId = resolveDefactoEmpire(info, seigneurChain);
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
            colorMap[id] = [first[0], first[1], first[2], 100];
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
            colorMap[id] = [...terrainColor, 100];
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
          colorMap[id] = [...terrainColor, 100];
          return;
        }
        if (!groupColors[groupId]) {
          let col;
          if (type === 'occupation') {
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
              type === 'cathedral'
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
        colorMap[id] = [col[0], col[1], col[2], 100];
      });
      if (core.currentSelectedId && colorMap[core.currentSelectedId]) {
        colorMap[core.currentSelectedId][3] = 180;
      }
      updateLegend(groupColors);
      core.setCanonicalPatterns(canonicalPatterns);
      core.setColorMap(colorMap);
    }

    initColorMap();
    return { applyFilter, randomizeColors, setTradeRouteSelection, get currentFilter() { return currentFilter; } };
  }
  global.mapFilters = { init };
})(typeof window !== 'undefined' ? window : global);
