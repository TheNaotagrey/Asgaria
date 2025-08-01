(() => {
  const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';
  const originalWidth = 1724;
  const originalHeight = 1291;

  let pixelData = {};
  let baronyMeta = {};
  let seigneurMap = {};
  let religionMap = {};
  let cultureMapInfo = {};
  let countyMap = {};
  let duchyMap = {};
  let kingdomMap = {};

  async function loadPixelData() {
    const resp = await fetch(API_BASE + '/api/barony_pixels');
    pixelData = await resp.json();
    rebuildPixelMap();
    initColorMap();
    drawAll();
  }

  async function loadMetaData() {
    const [baronies, seigneurs, religions, cultures, counties, duchies, kingdoms] = await Promise.all([
      fetch(API_BASE + '/api/baronies').then(r => r.json()),
      fetch(API_BASE + '/api/seigneurs').then(r => r.json()),
      fetch(API_BASE + '/api/religions').then(r => r.json()),
      fetch(API_BASE + '/api/cultures').then(r => r.json()),
      fetch(API_BASE + '/api/counties').then(r => r.json()),
      fetch(API_BASE + '/api/duchies').then(r => r.json()),
      fetch(API_BASE + '/api/kingdoms').then(r => r.json())
    ]);
    baronyMeta = {};
    baronies.forEach(b => { baronyMeta[b.id] = b; });
    seigneurMap = {};
    seigneurs.forEach(s => { seigneurMap[s.id] = s; });
    religionMap = {};
    religions.forEach(r => { religionMap[r.id] = r; });
    cultureMapInfo = {};
    cultures.forEach(c => { cultureMapInfo[c.id] = c; });
    countyMap = {};
    counties.forEach(c => { countyMap[c.id] = c; });
    duchyMap = {};
    duchies.forEach(d => { duchyMap[d.id] = d; });
    kingdomMap = {};
    kingdoms.forEach(k => { kingdomMap[k.id] = k; });
  }

  const pixelMap = Array.from({ length: originalHeight }, () => new Array(originalWidth).fill(0));
  function rebuildPixelMap() {
    for (let y = 0; y < originalHeight; y++) pixelMap[y].fill(0);
    Object.entries(pixelData).forEach(([id, coords]) => {
      coords.forEach(([x, y]) => {
        if (y >= 0 && y < originalHeight && x >= 0 && x < originalWidth) {
          pixelMap[y][x] = String(id);
        }
      });
    });
  }
  rebuildPixelMap();

  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return Math.round(255 * color);
    };
    return [f(0), f(8), f(4)];
  }
  function generateColor(id) {
    const num = parseInt(id, 10);
    const hue = (num * 137) % 360;
    const [r, g, b] = hslToRgb(hue, 65, 65);
    // Couleurs translucides par défaut (alpha 100)
    return [r, g, b, 100];
  }

  let colorMap = {};
  function initColorMap() {
    colorMap = {};
    Object.keys(pixelData).forEach(id => {
      if (!colorMap[id]) {
        colorMap[id] = generateColor(id);
      }
    });
  }
  initColorMap();

  function randomizeColors() {
    if (filterSelect && filterSelect.value) {
      applyFilter(filterSelect.value, true);
      return;
    }
    colorMap = {};
    Object.keys(pixelData).forEach(id => {
      const hue = Math.floor(Math.random() * 360);
      const [r, g, b] = hslToRgb(hue, 65, 65);
      colorMap[id] = [r, g, b, 100];
    });
    drawAll();
  }

  const baseMap = document.getElementById('baseMap');
  const pixelCanvas = document.getElementById('pixelCanvas');
  const panZoomGroup = document.getElementById('panZoomGroup');
  const mapContainer = document.getElementById('mapContainer');
  const randomBtn = document.getElementById('randomColors');
  const filterSelect = document.getElementById('colorFilter');
  const legendDiv = document.getElementById('legend');
  const infoPanel = document.getElementById('infoPanel');
  const infoId = document.getElementById('infoId');
  const infoName = document.getElementById('infoName');
  const infoSeigneur = document.getElementById('infoSeigneur');
  const infoReligion = document.getElementById('infoReligion');
  const infoCulture = document.getElementById('infoCulture');
  const infoCounty = document.getElementById('infoCounty');
  const infoDuchy = document.getElementById('infoDuchy');
  const infoKingdom = document.getElementById('infoKingdom');

  const ctx = pixelCanvas.getContext('2d');
  pixelCanvas.width = originalWidth;
  pixelCanvas.height = originalHeight;
  ctx.imageSmoothingEnabled = false;

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function applyTransform() {
    panZoomGroup.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  function getMapCoordinates(e) {
    const rect = panZoomGroup.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / scale);
    const y = Math.floor((e.clientY - rect.top) / scale);
    return [x, y];
  }
  function fitToContainer() {
    const contW = mapContainer.clientWidth;
    const contH = mapContainer.clientHeight;
    scale = Math.min(contW / originalWidth, contH / originalHeight);
    offsetX = (contW - originalWidth * scale) / 2;
    offsetY = (contH - originalHeight * scale) / 2;
    applyTransform();
  }

  function drawAll() {
    const imageData = ctx.createImageData(originalWidth, originalHeight);
    const data = imageData.data;
    let idx = 0;
    for (let y = 0; y < originalHeight; y++) {
      for (let x = 0; x < originalWidth; x++) {
        const id = pixelMap[y][x];
        if (id && colorMap[id]) {
          const col = colorMap[id];
          data[idx++] = col[0];
          data[idx++] = col[1];
          data[idx++] = col[2];
          data[idx++] = col[3];
        } else {
          data[idx++] = 0;
          data[idx++] = 0;
          data[idx++] = 0;
          data[idx++] = 0;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        pixelData = JSON.parse(ev.target.result);
        rebuildPixelMap();
        initColorMap();
        drawAll();
      } catch (err) {
        alert('Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
  }

  function handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = panZoomGroup.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / scale;
    const my = (e.clientY - rect.top) / scale;
    const prevScale = scale;
    scale *= factor;
    scale = Math.max(0.2, Math.min(scale, 10));
    offsetX -= mx * (scale - prevScale);
    offsetY -= my * (scale - prevScale);
    applyTransform();
  }

  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
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

  let currentSelectedId = null;

  function selectBarony(id) {
    if (currentSelectedId && colorMap[currentSelectedId]) {
      colorMap[currentSelectedId][3] = 100;
    }
    currentSelectedId = id;
    if (!id) {
      if (infoPanel) infoPanel.style.display = 'none';
      drawAll();
      return;
    }
    if (!colorMap[id]) colorMap[id] = generateColor(id);
    colorMap[id][3] = 180;
    if (infoPanel) {
      const info = baronyMeta[id] || {};
      infoId.textContent = info.id || '';
      infoName.textContent = info.name || '';
      infoSeigneur.textContent = seigneurMap[info.seigneur_id]?.name || '';
      infoReligion.textContent = religionMap[info.religion_pop_id]?.name || '';
      infoCulture.textContent = cultureMapInfo[info.culture_id]?.name || '';
      const county = countyMap[info.county_id];
      infoCounty.textContent = county ? county.name : '';
      const duchy = county ? duchyMap[county.duchy_id] : null;
      infoDuchy.textContent = duchy ? duchy.name : '';
      const kingdom = duchy ? kingdomMap[duchy.kingdom_id] : null;
      infoKingdom.textContent = kingdom ? kingdom.name : '';
      infoPanel.style.display = 'block';
    }
    drawAll();
  }

  function handleCanvasClick(e) {
    if (panning) return;
    const [x, y] = getMapCoordinates(e);
    if (x < 0 || y < 0 || x >= originalWidth || y >= originalHeight) return;
    const idAtPixel = pixelMap[y][x];
    if (idAtPixel) {
      selectBarony(idAtPixel);
    } else {
      selectBarony(null);
    }
  }

  function updateLegend(groups) {
    if (!legendDiv) return;
    if (!groups) {
      legendDiv.style.display = 'none';
      legendDiv.innerHTML = '';
      return;
    }
    legendDiv.innerHTML = '';
    Object.entries(groups).forEach(([id, info]) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const colorBox = document.createElement('span');
      colorBox.className = 'legend-color';
      colorBox.style.backgroundColor = `rgb(${info.color[0]},${info.color[1]},${info.color[2]})`;
      item.appendChild(colorBox);
      const lab = document.createElement('span');
      lab.textContent = info.name;
      item.appendChild(lab);
      legendDiv.appendChild(item);
    });
    legendDiv.style.display = 'block';
  }

  function applyFilter(type, randomize = false) {
    if (!type) {
      initColorMap();
      updateLegend(null);
      if (currentSelectedId) colorMap[currentSelectedId][3] = 180;
      drawAll();
      return;
    }
    const groupColors = {};
    colorMap = {};
    Object.entries(baronyMeta).forEach(([id, info]) => {
      let groupId = null;
      let groupName = '';
      if (type === 'religion') {
        groupId = info.religion_pop_id;
        groupName = religionMap[groupId]?.name || '';
      } else if (type === 'culture') {
        groupId = info.culture_id;
        groupName = cultureMapInfo[groupId]?.name || '';
      } else if (type === 'county') {
        groupId = info.county_id;
        groupName = countyMap[groupId]?.name || '';
      } else if (type === 'duchy') {
        const county = countyMap[info.county_id];
        groupId = county ? county.duchy_id : null;
        groupName = duchyMap[groupId]?.name || '';
      } else if (type === 'kingdom') {
        const county = countyMap[info.county_id];
        const duchy = county ? duchyMap[county.duchy_id] : null;
        groupId = duchy ? duchy.kingdom_id : null;
        groupName = kingdomMap[groupId]?.name || '';
      }
      if (!groupColors[groupId]) {
        let col;
        if (randomize) {
          const hue = Math.floor(Math.random() * 360);
          col = hslToRgb(hue, 65, 65);
        } else {
          col = generateColor(String(groupId || 0)).slice(0, 3);
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

  if (randomBtn) randomBtn.addEventListener('click', randomizeColors);
  if (filterSelect) filterSelect.addEventListener('change', () => applyFilter(filterSelect.value));

  mapContainer.addEventListener('wheel', handleWheel, { passive: false });
  mapContainer.addEventListener('mousedown', handlePanStart);
  mapContainer.addEventListener('mousemove', handlePanMove);
  mapContainer.addEventListener('click', handleCanvasClick);
  window.addEventListener('mouseup', handlePanEnd);
  window.addEventListener('resize', () => {
    fitToContainer();
    drawAll();
  });

  document.addEventListener('DOMContentLoaded', () => {
    Promise.all([loadPixelData(), loadMetaData()]).then(() => {
      if (baseMap.complete) {
        fitToContainer();
        applyFilter(filterSelect ? filterSelect.value : '');
        drawAll();
      } else {
        baseMap.onload = () => {
          fitToContainer();
          applyFilter(filterSelect ? filterSelect.value : '');
          drawAll();
        };
      }
    });
  });
})();
