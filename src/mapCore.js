(function (global) {
  const terrainColor = [239, 228, 176];
  const selectedTransparencyFactor = 1;

  /**
   * Initialise le rendu de la carte.
   * @param {Object} [opts] Options de configuration.
   * @param {HTMLCanvasElement} [opts.canvas] Canvas cible. Utilisé si `mapId` n'est pas fourni.
   * @param {string} [opts.mapId='pixelCanvas'] Id du canvas à récupérer dans le DOM.
   * @param {boolean} [opts.enablePan=true] Active le déplacement de la carte à la souris.
   * @param {boolean} [opts.enableZoom=true] Active le zoom via la molette.
   * @param {number} [opts.width] Largeur fixe du canvas.
   * @param {number} [opts.height] Hauteur fixe du canvas.
   * @param {Function} [opts.fetchData] Fonction asynchrone de récupération des données.
   * @param {Function} [opts.onSelect] Callback lors de la sélection d'une baronnie.
   * @param {Function} [opts.drawOverlay] Fonction de dessin d'une surcouche.
   * @param {string} [opts.mapMode='land'] Mode de carte à charger.
   */
  function init(opts = {}) {
    const {
      canvas: passedCanvas,
      mapId = 'pixelCanvas',
      enablePan = true,
      enableZoom = true,
      width,
      height,
      fetchData = async () => ({}),
      onSelect = () => {},
      drawOverlay = () => {},
      mapMode = 'land',
      staticMap = false
    } = opts;

    const canvas = passedCanvas || document.getElementById(mapId);
    if (!canvas) throw new Error('No canvas element provided or found');

    if (width) {
      canvas.width = width;
      canvas.style.width = width + 'px';
    }
    if (height) {
      canvas.height = height;
      canvas.style.height = height + 'px';
    }

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
    let currentSelectedIds = new Set();

    // pan/zoom state
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let activePointerId = null;
    let movedDuringPan = false;
    let pinchState = null;
    let selectionPointerId = null;
    let suppressSelection = false;

    function applyTransform() {
      group.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    function resetView() {
      scale = 1;
      offsetX = 0;
      offsetY = 0;
      applyTransform();
    }

    function centerMap() {
      const contW = container.clientWidth;
      const contH = container.clientHeight;
      scale = 1;
      offsetX = (contW - mapWidth * scale) / 2;
      offsetY = (contH - mapHeight * scale) / 2;
      applyTransform();
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

    function hslToRgb(h, s, l) {
      s /= 100; l /= 100;
      const k = n => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
    }

    function generateColor(str) {
      const hue = Math.floor(Math.random() * 360);
      const [r, g, b] = hslToRgb(hue, 65, 65);
      return [r, g, b, 255];
    }

    function getSelectedAlpha(baseColor, factor = selectedTransparencyFactor) {
      const safeFactor = Math.max(0, Math.min(1, factor));
      const baseAlpha = Number.isFinite(baseColor[3]) ? baseColor[3] : 255;
      return Math.max(0, Math.min(255, Math.round(baseAlpha * safeFactor)));
    }

    function hashCoords(x, y, seed = 0) {
      let h = x * 374761393 + y * 668265263 + seed * 982451653;
      h = (h ^ (h >>> 13)) * 1274126177;
      return (h ^ (h >>> 16)) >>> 0;
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
            const isSelected = currentSelectedIds.size > 0
              ? currentSelectedIds.has(id)
              : id === currentSelectedId;
            if (canonicalPatterns[id]) {
              const cols = canonicalPatterns[id];
              const cellSize = 6;
              const colIndex =
                hashCoords(Math.floor(x / cellSize), Math.floor(y / cellSize), parseInt(id, 10)) % cols.length;
              const baseCol = cols[colIndex];
              const alpha = isSelected ? getSelectedAlpha(baseCol) : (Number.isFinite(baseCol[3]) ? baseCol[3] : 255);
              data[idx++] = baseCol[0];
              data[idx++] = baseCol[1];
              data[idx++] = baseCol[2];
              data[idx++] = alpha;
            } else {
              const baseCol = colorMap[id];
              const alpha = isSelected ? getSelectedAlpha(baseCol) : (Number.isFinite(baseCol[3]) ? baseCol[3] : 255);
              data[idx++] = baseCol[0];
              data[idx++] = baseCol[1];
              data[idx++] = baseCol[2];
              data[idx++] = alpha;
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
      zoomAtClientPoint(e.clientX, e.clientY, factor);
    }

    function zoomAtClientPoint(clientX, clientY, factor) {
      const rect = group.getBoundingClientRect();
      const mx = (clientX - rect.left) / scale;
      const my = (clientY - rect.top) / scale;
      const prevScale = scale;
      scale *= factor;
      scale = Math.max(0.2, Math.min(scale, 10));
      offsetX -= mx * (scale - prevScale);
      offsetY -= my * (scale - prevScale);
      applyTransform();
    }

    function handlePanStart(e) {
      activePointerId = e.pointerId;
      panning = true;
      movedDuringPan = false;
      panStartX = e.clientX;
      panStartY = e.clientY;
    }

    function handlePanMove(e) {
      if (!panning || e.pointerId !== activePointerId) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedDuringPan = true;
      offsetX += dx;
      offsetY += dy;
      panStartX = e.clientX;
      panStartY = e.clientY;
      applyTransform();
    }

    function handlePanEnd() {
      panning = false;
      activePointerId = null;
    }

    function getCanvasCoordsFromClient(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.floor((clientX - rect.left) * canvas.width / rect.width),
        y: Math.floor((clientY - rect.top) * canvas.height / rect.height)
      };
    }


    function createMobileZoomControls() {
      if (!enableZoom || !container || container.querySelector('.mobile-zoom-controls')) return;
      if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;

      const controls = document.createElement('div');
      controls.className = 'mobile-zoom-controls';

      const zoomInBtn = document.createElement('button');
      zoomInBtn.type = 'button';
      zoomInBtn.className = 'control-btn mobile-zoom-btn';
      zoomInBtn.setAttribute('aria-label', 'Zoom avant');
      zoomInBtn.textContent = '+';

      const zoomOutBtn = document.createElement('button');
      zoomOutBtn.type = 'button';
      zoomOutBtn.className = 'control-btn mobile-zoom-btn';
      zoomOutBtn.setAttribute('aria-label', 'Zoom arrière');
      zoomOutBtn.textContent = '−';

      zoomInBtn.addEventListener('click', () => {
        const rect = container.getBoundingClientRect();
        zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
      });
      zoomOutBtn.addEventListener('click', () => {
        const rect = container.getBoundingClientRect();
        zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2);
      });

      controls.appendChild(zoomInBtn);
      controls.appendChild(zoomOutBtn);
      container.appendChild(controls);
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
      currentSelectedId = id;
      currentSelectedIds = id ? new Set([String(id)]) : new Set();
      if (!id) {
        drawAll();
        onSelect(id);
        return;
      }
      if (!colorMap[id]) colorMap[id] = generateColor(id);
      drawAll();
      onSelect(id);
    }

    function setSelectedBaronies(ids = []) {
      currentSelectedIds = new Set((ids || []).filter(Boolean).map(val => String(val)));
      drawAll();
    }

    function handleCanvasSelection(clientX, clientY) {
      const { x, y } = getCanvasCoordsFromClient(clientX, clientY);
      const id = pixelMap[y] ? pixelMap[y][x] : null;
      selectBarony(id);
    }

    function handlePointerDown(e) {
      if (e.button !== 0 && e.pointerType !== 'touch') return;
      if (pinchState && pinchState.pointers.size >= 2) return;
      selectionPointerId = e.pointerId;

      if (e.pointerType === 'touch') {
        if (!pinchState) pinchState = { pointers: new Map(), prevDistance: null, midpoint: null };
        pinchState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pinchState.pointers.size === 2) {
          const [a, b] = [...pinchState.pointers.values()];
          pinchState.prevDistance = Math.hypot(b.x - a.x, b.y - a.y);
          pinchState.midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          panning = false;
          activePointerId = null;
          selectionPointerId = null;
          suppressSelection = true;
        } else if (enablePan) {
          handlePanStart(e);
        }
      } else if (enablePan) {
        handlePanStart(e);
      }

      if (canvas.setPointerCapture) {
        canvas.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
    }

    function handlePointerMove(e) {
      if (pinchState && pinchState.pointers.has(e.pointerId)) {
        pinchState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinchState.pointers.size === 2 && enableZoom) {
          const [a, b] = [...pinchState.pointers.values()];
          const distance = Math.hypot(b.x - a.x, b.y - a.y);
          const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (pinchState.prevDistance && distance > 0) {
            const factor = distance / pinchState.prevDistance;
            if (Number.isFinite(factor) && factor > 0) {
              zoomAtClientPoint(midpoint.x, midpoint.y, factor);
            }
          }
          pinchState.prevDistance = distance;
          pinchState.midpoint = midpoint;
        } else if (pinchState.pointers.size === 1 && enablePan) {
          handlePanMove(e);
        }
      } else if (enablePan) {
        handlePanMove(e);
      }
    }

    function handlePointerUpOrCancel(e) {
      const wasActivePanPointer = panning && e.pointerId === activePointerId;

      if (pinchState && pinchState.pointers.has(e.pointerId)) {
        pinchState.pointers.delete(e.pointerId);
        if (pinchState.pointers.size < 2) {
          pinchState.prevDistance = null;
          pinchState.midpoint = null;
        }
        if (pinchState.pointers.size === 1 && enablePan) {
          const remaining = [...pinchState.pointers.entries()][0];
          if (remaining) {
            const [remainingId, point] = remaining;
            activePointerId = remainingId;
            panning = true;
            movedDuringPan = true;
            panStartX = point.x;
            panStartY = point.y;
          }
        }
      }

      if (wasActivePanPointer) {
        const shouldSelect = !movedDuringPan && (!pinchState || pinchState.pointers.size === 0);
        handlePanEnd();
        if (shouldSelect && e.type === 'pointerup') {
          handleCanvasSelection(e.clientX, e.clientY);
        }
      } else if (!enablePan) {
        const canSelectWithoutPan = (
          e.type === 'pointerup' &&
          e.pointerId === selectionPointerId &&
          !suppressSelection &&
          (!pinchState || pinchState.pointers.size === 0)
        );
        if (canSelectWithoutPan) {
          handleCanvasSelection(e.clientX, e.clientY);
        }
      }

      if (!pinchState || pinchState.pointers.size === 0) {
        suppressSelection = false;
      }
      if (e.pointerId === selectionPointerId) {
        selectionPointerId = null;
      }

      if (canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    }


    const positionMap = staticMap ? resetView : (!enablePan && !enableZoom) ? centerMap : fitToContainer;

    if (enableZoom) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
    }
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
    canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
    canvas.addEventListener('pointerup', handlePointerUpOrCancel);
    canvas.addEventListener('pointercancel', handlePointerUpOrCancel);
    createMobileZoomControls();

    window.addEventListener('resize', () => {
      positionMap();
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
      positionMap();
      drawAll();
    }
    const ready = load();

    return {
      selectBarony,
      setSelectedBaronies,
      drawAll,
      fitToContainer,
      resetView,
      drawPixel: (x, y, id) => {
        if (!colorMap[id]) {
          colorMap[id] = generateColor(id);
        }
        const col = colorMap[id];
        const alpha = col.length > 3 ? col[3] / 255 : 1;
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      },
      setPixelData: pd => {
        pixelData = pd || {};
        rebuildPixelMap();
        drawAll();
      },
      get pixelData() { return pixelData; },
      get pixelMap() { return pixelMap; },
      get colorMap() { return colorMap; },
      get currentSelectedId() { return currentSelectedId; },
      set currentSelectedId(v) {
        currentSelectedId = v;
        currentSelectedIds = v ? new Set([String(v)]) : new Set();
      },
      get currentSelectedIds() { return currentSelectedIds; },
      setColorMap: cm => { colorMap = cm; drawAll(); },
      setCanonicalPatterns: cp => { canonicalPatterns = cp || {}; },
      get ready() { return ready; }
    };
  }
  global.mapCore = { init, terrainColor };
})(typeof window !== 'undefined' ? window : global);
