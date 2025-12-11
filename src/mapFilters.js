(function (global) {
  function init(core, data, options = {}) {
    const updateLegend = options.updateLegend || (() => {});
    const terrainColor = mapCore.terrainColor;
    const playerSeigneurColor = [82, 190, 128];
    const playerBishopColor = [46, 134, 193];
    const npcSeigneurColor = [231, 76, 60];
    const npcBishopColor = [155, 89, 182];
    let currentFilter = '';
    let canonicalPatterns = {};
    let colorMap = {};

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
          let sid = info.seigneur_id;
          while (sid) {
            const vId = data.seigneurToViscounty[sid];
            if (vId) {
              groupId = vId;
              groupName = data.viscountyMap[vId]?.name || '';
              break;
            }
            sid = data.seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'county_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const cId = data.seigneurToCounty[sid];
            if (cId) {
              groupId = cId;
              groupName = data.countyMap[cId]?.name || '';
              break;
            }
            sid = data.seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'marquisate_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const mId = data.seigneurToMarquisate[sid];
            if (mId) {
              groupId = mId;
              groupName = data.marquisateMap[mId]?.name || '';
              break;
            }
            sid = data.seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'duchy_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const dId = data.seigneurToDuchy[sid];
            if (dId) {
              groupId = dId;
              groupName = data.duchyMap[dId]?.name || '';
              break;
            }
            sid = data.seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'archduchy_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const aId = data.seigneurToArchduchy[sid];
            if (aId) {
              groupId = aId;
              groupName = data.archduchyMap[aId]?.name || '';
              break;
            }
            sid = data.seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'kingdom_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const kId = data.seigneurToKingdom[sid];
            if (kId) {
              groupId = kId;
              groupName = data.kingdomMap[kId]?.name || '';
              break;
            }
            sid = data.seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'empire_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const eId = data.seigneurToEmpire[sid];
            if (eId) {
              groupId = eId;
              groupName = data.empireMap[eId]?.name || '';
              break;
            }
            sid = data.seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'sanctuary') {
          const sancts = data.sanctuaryMap[id] || [];
          if (sancts.length > 0) {
            canonicalPatterns[id] = [];
            let hasActive = false;
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
              const repeat = s.active ? 3 : 1;
              if (s.active) hasActive = true;
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
    return { applyFilter, randomizeColors, get currentFilter() { return currentFilter; } };
  }
  global.mapFilters = { init };
})(typeof window !== 'undefined' ? window : global);
