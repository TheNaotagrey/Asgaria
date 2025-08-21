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
    let currentSelectedId = null;

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

    // color map is expected to be provided externally

    function drawAll() {
      const imageData = ctx.createImageData(mapWidth, mapHeight);
      const data = imageData.data;
      let idx = 0;
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          const id = pixelMap[y][x];
          if (id && (colorMap[id] || canonicalPatterns[id])) {
            if (canonicalPatterns[id]) {
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
        drawAll();
        onSelect(id);
        return;
      }
      if (!colorMap[id]) colorMap[id] = generateColor(id);
      colorMap[id][3] = 180;
      drawAll();
      onSelect(id);
    }

    function handleCanvasClick(e) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / scale);
      const y = Math.floor((e.clientY - rect.top) / scale);
      const id = pixelMap[y] ? pixelMap[y][x] : null;
      selectBarony(id);
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
      fitToContainer();
      drawAll();
    }
    const ready = load();

    return {
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
      setColorMap: cm => { colorMap = cm; drawAll(); },
      setCanonicalPatterns: cp => { canonicalPatterns = cp || {}; },
      get ready() { return ready; }
    };
  }
  global.mapCore = { init };
})(typeof window !== 'undefined' ? window : global);
