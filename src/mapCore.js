(function (global) {
  function init(canvas, options = {}) {
    const group = canvas.parentElement;
    const container = group.parentElement;
    const ctx = canvas.getContext('2d');
    let mapWidth = canvas.width;
    let mapHeight = canvas.height;

    // Data stores
    let pixelData = {};
    let pixelMap = [];
    let baronyMeta = {};
    let seigneurMap = {};
    let religionMap = {};
    let cultureMapInfo = {};
    let countyMap = {};
    let duchyMap = {};
    let kingdomMap = {};
    let viscountyMap = {};
    let marquisateMap = {};
    let archduchyMap = {};
    let empireMap = {};
    let seigneurToViscounty = {}, seigneurToCounty = {}, seigneurToMarquisate = {}, seigneurToDuchy = {}, seigneurToArchduchy = {}, seigneurToKingdom = {}, seigneurToEmpire = {};
    let canonicalLandMap = {};
    let baronyAdjacency = {};
    let canonicalPatterns = {};

    // visual state
    let colorMap = {};
    let currentFilter = '';
    let currentSelectedId = null;

    const terrainColor = [239, 228, 176];
    const playerColor = [82, 190, 128];
    const npcColor = [231, 76, 60];

    // pan/zoom state
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;

    const fetchData = options.fetchData || (async () => ({}));
    const onSelect = options.onSelect || (() => {});
    const drawOverlay = options.drawOverlay || (() => {});
    const mapMode = options.mapMode || 'land';

    function applyTransform() {
      group.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    function rebuildPixelMap() {
      pixelMap = Array.from({ length: mapHeight }, () => new Array(mapWidth).fill(0));
      Object.entries(pixelData).forEach(([id, coords]) => {
        coords.forEach(([x, y]) => {
          if (y >= 0 && y < mapHeight && x >= 0 && x < mapWidth) {
            pixelMap[y][x] = String(id);
          }
        });
      });
    }

    function generateColor(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const r = (hash >> 16) & 255;
      const g = (hash >> 8) & 255;
      const b = hash & 255;
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
      Object.keys(baronyMeta).forEach(id => {
        colorMap[id] = generateColor(id);
      });
    }

    function drawAll() {
      const imageData = ctx.createImageData(mapWidth, mapHeight);
      const data = imageData.data;
      let idx = 0;
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          const id = pixelMap[y][x];
          if (id && (colorMap[id] || (currentFilter === 'canonical' && canonicalPatterns[id]))) {
            if (currentFilter === 'canonical' && canonicalPatterns[id]) {
              const cols = canonicalPatterns[id];
              const col = cols[(x + y) % cols.length];
              data[idx++] = col[0];
              data[idx++] = col[1];
              data[idx++] = col[2];
              data[idx++] = 100;
            } else {
              const col = colorMap[id];
              data[idx++] = col[0];
              data[idx++] = col[1];
              data[idx++] = col[2];
              data[idx++] = col[3];
            }
          } else {
            data[idx++] = 0;
            data[idx++] = 0;
            data[idx++] = 0;
            data[idx++] = 0;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
      drawOverlay(ctx, scale, offsetX, offsetY);
    }

    function randomizeColors() {
      Object.keys(baronyMeta).forEach(id => {
        const hue = Math.floor(Math.random() * 360);
        const [r, g, b] = hslToRgb(hue, 65, 65);
        colorMap[id] = [r, g, b, 100];
      });
      if (currentSelectedId && colorMap[currentSelectedId]) colorMap[currentSelectedId][3] = 180;
      drawAll();
    }

    function handleWheel(e) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = group.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / scale;
      const my = (e.clientY - rect.top) / scale;
      const prevScale = scale;
      scale *= factor;
      scale = Math.max(0.2, Math.min(scale, 10));
      offsetX -= mx * (scale - prevScale);
      offsetY -= my * (scale - prevScale);
      applyTransform();
    }

    function handlePanStart(e) {
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
    }
    function handlePanMove(e) {
      if (!panning) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      offsetX += dx;
      offsetY += dy;
      panStartX = e.clientX;
      panStartY = e.clientY;
      applyTransform();
    }
    function handlePanEnd() {
      panning = false;
    }

    function fitToContainer() {
      const contW = container.clientWidth;
      const contH = container.clientHeight;
      const scaleX = contW / mapWidth;
      const scaleY = contH / mapHeight;
      scale = Math.min(scaleX, scaleY);
      offsetX = (contW - mapWidth * scale) / 2;
      offsetY = (contH - mapHeight * scale) / 2;
      applyTransform();
    }

    function selectBarony(id) {
      if (currentSelectedId && colorMap[currentSelectedId]) {
        colorMap[currentSelectedId][3] = 100;
      }
      currentSelectedId = id;
      if (!id) {
        if (currentFilter) applyFilter(currentFilter); else drawAll();
        onSelect(id);
        return;
      }
      if (!colorMap[id]) colorMap[id] = generateColor(id);
      colorMap[id][3] = 180;
      if (currentFilter) applyFilter(currentFilter); else drawAll();
      onSelect(id);
    }

    function handleCanvasClick(e) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / scale);
      const y = Math.floor((e.clientY - rect.top) / scale);
      const id = pixelMap[y] ? pixelMap[y][x] : null;
      selectBarony(id);
    }

    function updateLegend(groups) {
      if (!options.updateLegend) return;
      options.updateLegend(groups);
    }

    function applyFilter(type, randomize = false) {
      if (mapMode === 'sea') {
        randomizeColors();
        return;
      }
      currentFilter = type || '';
      canonicalPatterns = {};
      if (!type) {
        initColorMap();
        updateLegend(null);
        if (currentSelectedId && colorMap[currentSelectedId]) colorMap[currentSelectedId][3] = 180;
        drawAll();
        return;
      }
      if (type === 'distance') {
        colorMap = {};
        if (!currentSelectedId) {
          drawAll();
          return;
        }
        const distances = {};
        const queue = [currentSelectedId];
        distances[currentSelectedId] = 0;
        while (queue.length > 0) {
          const cur = queue.shift();
          const next = baronyAdjacency[cur] || [];
          next.forEach(n => {
            if (distances[n] === undefined) {
              distances[n] = distances[cur] + 1;
              queue.push(n);
            }
          });
        }
        Object.keys(baronyMeta).forEach(id => {
          const d = distances[id];
          if (d === undefined) return;
          const hue = (d * 40) % 360;
          const [r, g, b] = hslToRgb(hue, 65, 65);
          colorMap[id] = [r, g, b, 100];
        });
        if (currentSelectedId && colorMap[currentSelectedId]) colorMap[currentSelectedId][3] = 180;
        updateLegend(null);
        drawAll();
        return;
      }
      const groupColors = {};
      colorMap = {};
      Object.entries(baronyMeta).forEach(([id, info]) => {
        let groupId = null;
        let groupName = '';
        if (type === 'canonical') {
          const rIds = canonicalLandMap[id] || [];
          if (rIds.length === 0) {
            colorMap[id] = [...terrainColor, 100];
            return;
          }
          canonicalPatterns[id] = rIds.map(rid => {
            if (!groupColors[rid]) {
              const col = hexToRgb(religionMap[rid]?.color) || generateColor(String(rid)).slice(0,3);
              groupColors[rid] = { color: col, name: religionMap[rid]?.name || 'N/A' };
            }
            return groupColors[rid].color;
          });
          const first = canonicalPatterns[id][0];
          colorMap[id] = [first[0], first[1], first[2], 100];
          return;
        } else if (type === 'religion') {
          groupId = info.religion_pop_id;
          groupName = religionMap[groupId]?.name || '';
        } else if (type === 'culture') {
          groupId = info.culture_id;
          groupName = cultureMapInfo[groupId]?.name || '';
        } else if (type === 'viscounty') {
          groupId = info.viscounty_id;
          groupName = viscountyMap[groupId]?.name || '';
        } else if (type === 'county') {
          groupId = info.county_id;
          groupName = countyMap[groupId]?.name || '';
        } else if (type === 'marquisate') {
          const county = countyMap[info.county_id];
          groupId = county ? county.marquisate_id : null;
          groupName = marquisateMap[groupId]?.name || '';
        } else if (type === 'duchy') {
          const county = countyMap[info.county_id];
          groupId = county ? county.duchy_id : null;
          groupName = duchyMap[groupId]?.name || '';
        } else if (type === 'archduchy') {
          const county = countyMap[info.county_id];
          const duchy = county ? duchyMap[county.duchy_id] : null;
          groupId = duchy ? duchy.archduchy_id : null;
          groupName = archduchyMap[groupId]?.name || '';
        } else if (type === 'kingdom') {
          const county = countyMap[info.county_id];
          const duchy = county ? duchyMap[county.duchy_id] : null;
          groupId = duchy ? duchy.kingdom_id : null;
          groupName = kingdomMap[groupId]?.name || '';
        } else if (type === 'empire') {
          const county = countyMap[info.county_id];
          const duchy = county ? duchyMap[county.duchy_id] : null;
          const kingdom = duchy ? kingdomMap[duchy.kingdom_id] : null;
          groupId = kingdom ? kingdom.empire_id : null;
          groupName = empireMap[groupId]?.name || '';
        } else if (type === 'viscounty_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const vId = seigneurToViscounty[sid];
            if (vId) {
              groupId = vId;
              groupName = viscountyMap[vId]?.name || '';
              break;
            }
            sid = seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'county_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const cId = seigneurToCounty[sid];
            if (cId) {
              groupId = cId;
              groupName = countyMap[cId]?.name || '';
              break;
            }
            sid = seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'marquisate_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const mId = seigneurToMarquisate[sid];
            if (mId) {
              groupId = mId;
              groupName = marquisateMap[mId]?.name || '';
              break;
            }
            sid = seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'duchy_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const dId = seigneurToDuchy[sid];
            if (dId) {
              groupId = dId;
              groupName = duchyMap[dId]?.name || '';
              break;
            }
            sid = seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'archduchy_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const aId = seigneurToArchduchy[sid];
            if (aId) {
              groupId = aId;
              groupName = archduchyMap[aId]?.name || '';
              break;
            }
            sid = seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'kingdom_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const kId = seigneurToKingdom[sid];
            if (kId) {
              groupId = kId;
              groupName = kingdomMap[kId]?.name || '';
              break;
            }
            sid = seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'empire_defacto') {
          let sid = info.seigneur_id;
          while (sid) {
            const eId = seigneurToEmpire[sid];
            if (eId) {
              groupId = eId;
              groupName = empireMap[eId]?.name || '';
              break;
            }
            sid = seigneurMap[sid]?.overlord_id;
          }
        } else if (type === 'sanctuary') {
          if (info.has_sanctuary) {
            groupId = info.religion_pop_id;
            groupName = religionMap[groupId]?.name || '';
          }
        } else if (type === 'priory') {
          if (info.has_priory) {
            groupId = info.religion_pop_id;
            groupName = religionMap[groupId]?.name || '';
          }
        } else if (type === 'church') {
          if (info.has_church) {
            groupId = info.religion_pop_id;
            groupName = religionMap[groupId]?.name || '';
          }
        } else if (type === 'cathedral') {
          if (info.has_cathedral) {
            groupId = info.religion_pop_id;
            groupName = religionMap[groupId]?.name || '';
          }
        } else if (type === 'occupation') {
          if (!info.seigneur_id) {
            groupId = 'unoccupied';
            groupName = 'Non occupée';
          } else if (info.player) {
            groupId = 'player';
            groupName = 'Joueur';
          } else {
            groupId = 'npc';
            groupName = 'PNJ';
          }
        }
        if (groupId == null) {
          colorMap[id] = [...terrainColor, 100];
          return;
        }
        if (!groupColors[groupId]) {
          let col;
          if (type === 'occupation') {
            if (groupId === 'player') col = playerColor;
            else if (groupId === 'npc') col = npcColor;
            else col = terrainColor;
          } else if (randomize) {
            const hue = Math.floor(Math.random() * 360);
            col = hslToRgb(hue, 65, 65);
          } else {
            if (
              type === 'religion' ||
              type === 'sanctuary' ||
              type === 'priory' ||
              type === 'church' ||
              type === 'cathedral'
            ) {
              col = hexToRgb(religionMap[groupId]?.color);
            } else if (type === 'culture') {
              col = hexToRgb(cultureMapInfo[groupId]?.color);
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
      if (currentSelectedId && colorMap[currentSelectedId]) {
        colorMap[currentSelectedId][3] = 180;
      }
      updateLegend(groupColors);
      drawAll();
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handlePanStart);
    canvas.addEventListener('mousemove', handlePanMove);
    canvas.addEventListener('click', handleCanvasClick);
    window.addEventListener('mouseup', handlePanEnd);

    window.addEventListener('resize', () => {
      fitToContainer();
      drawAll();
    });

    async function load() {
      const data = await fetchData();
      mapWidth = data.mapWidth || mapWidth;
      mapHeight = data.mapHeight || mapHeight;
      pixelData = data.pixelData || {};
      baronyMeta = data.baronyMeta || {};
      seigneurMap = data.seigneurMap || {};
      religionMap = data.religionMap || {};
      cultureMapInfo = data.cultureMapInfo || {};
      countyMap = data.countyMap || {};
      duchyMap = data.duchyMap || {};
      kingdomMap = data.kingdomMap || {};
      viscountyMap = data.viscountyMap || {};
      marquisateMap = data.marquisateMap || {};
      archduchyMap = data.archduchyMap || {};
      empireMap = data.empireMap || {};
      canonicalLandMap = data.canonicalLandMap || {};
      baronyAdjacency = data.baronyAdjacency || {};
      seigneurToViscounty = data.seigneurToViscounty || {};
      seigneurToCounty = data.seigneurToCounty || {};
      seigneurToMarquisate = data.seigneurToMarquisate || {};
      seigneurToDuchy = data.seigneurToDuchy || {};
      seigneurToArchduchy = data.seigneurToArchduchy || {};
      seigneurToKingdom = data.seigneurToKingdom || {};
      seigneurToEmpire = data.seigneurToEmpire || {};
      rebuildPixelMap();
      initColorMap();
      fitToContainer();
      if (currentFilter) applyFilter(currentFilter); else drawAll();
    }
    load();

    return {
      applyFilter,
      randomizeColors,
      selectBarony,
      drawAll,
      fitToContainer,
      drawPixel: (x, y, id) => {
        if (!colorMap[id]) {
          colorMap[id] = generateColor(id);
        }
        const col = colorMap[id];
        const alpha = col.length > 3 ? col[3] / 255 : 1;
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      },
      get pixelData() { return pixelData; },
      get pixelMap() { return pixelMap; },
      get colorMap() { return colorMap; },
      get currentSelectedId() { return currentSelectedId; },
      set currentSelectedId(v) { currentSelectedId = v; },
      setColorMap: cm => { colorMap = cm; drawAll(); }
    };
  }
  global.mapCore = { init };
})(typeof window !== 'undefined' ? window : global);
