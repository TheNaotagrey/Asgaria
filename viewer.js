(() => {
  const originalWidth = 1724;
  const originalHeight = 1291;

  let pixelData;
  const saved = localStorage.getItem('baronnies_pixels');
  if (saved) {
    try {
      pixelData = JSON.parse(saved);
    } catch {
      pixelData = window.pixelData || {};
    }
  } else {
    pixelData = window.pixelData || {};
  }

  function safeSetLocalStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage quota exceeded; data not saved', e);
    }
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
  const importInput = document.getElementById('jsonFileInput');
  const randomBtn = document.getElementById('randomColors');

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
        safeSetLocalStorage('baronnies_pixels', JSON.stringify(pixelData));
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

  if (importInput) importInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importJson(file);
  });
  if (randomBtn) randomBtn.addEventListener('click', randomizeColors);

  mapContainer.addEventListener('wheel', handleWheel, { passive: false });
  mapContainer.addEventListener('mousedown', handlePanStart);
  mapContainer.addEventListener('mousemove', handlePanMove);
  window.addEventListener('mouseup', handlePanEnd);
  window.addEventListener('resize', () => {
    fitToContainer();
    drawAll();
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (baseMap.complete) {
      fitToContainer();
      drawAll();
    } else {
      baseMap.onload = () => {
        fitToContainer();
        drawAll();
      };
    }
  });
})();
