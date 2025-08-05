(() => {
  const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';
  const originalWidth = 1724;
  const originalHeight = 1291;
  const terrainColor = [239, 228, 176];
  const playerColor = [82, 190, 128];
  const npcColor = [231, 76, 60];

  // Pixel data loaded from the server
  let pixelData = {};

  async function loadPixelData() {
    const resp = await fetch(API_BASE + '/api/barony_pixels');
    pixelData = await resp.json();
    Object.keys(pixelData).forEach(id => {
      if (!baronyMeta[id]) {
        baronyMeta[id] = { id, name: '' };
      }
    });
    for (let y = 0; y < originalHeight; y++) pixelMap[y].fill(0);
    Object.entries(pixelData).forEach(([id, coords]) => {
      coords.forEach(([x, y]) => {
        if (y >= 0 && y < originalHeight && x >= 0 && x < originalWidth) {
          pixelMap[y][x] = String(id);
        }
      });
    });
    initColorMap();
    drawAll();
  }
  // Métadonnées par baronnie : id et nom
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
  let seigneurToCounty = {}, seigneurToDuchy = {}, seigneurToKingdom = {};
  let canonicalLandMap = {};
  let canonicalPatterns = {};
  let currentFilter = '';

  // Carte de correspondance pixel : pixelMap[y][x] = id (ou 0 si aucun)
  const pixelMap = Array.from({ length: originalHeight }, () => new Array(originalWidth).fill(0));

  // Convertisseur HSL→RGB (déterministe pour attribuer des couleurs aux baronnies)
  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return Math.round(255 * color);
    };
    return [f(0), f(8), f(4)];
  }
  function hexToRgb(hex) {
    if (!hex) return null;
    const m = hex.trim().match(/^#?([a-fA-F0-9]{6})$/);
    if (!m) return null;
    const num = parseInt(m[1], 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  function generateColor(id) {
    const num = parseInt(id, 10);
    const hue = (num * 137) % 360;
    const [r, g, b] = hslToRgb(hue, 65, 65);
    // Couleur légèrement translucide par défaut (alpha 100)
    return [r, g, b, 100];
  }

  // Palette de couleurs courante pour chaque baronnie
  let colorMap = {};

  function initColorMap() {
    colorMap = {};
    canonicalPatterns = {};
    Object.keys(pixelData).forEach((id) => {
      if (!colorMap[id]) {
        colorMap[id] = generateColor(id);
      }
    });
    if (currentSelectedId && colorMap[currentSelectedId]) {
      colorMap[currentSelectedId][3] = 180;
    }
  }

  function randomizeColors() {
    if (currentFilter) {
      applyFilter(currentFilter, true);
      return;
    }
    colorMap = {};
    Object.keys(pixelData).forEach((id) => {
      const hue = Math.floor(Math.random() * 360);
      const [r, g, b] = hslToRgb(hue, 65, 65);
      colorMap[id] = [r, g, b, 100];
    });
    if (currentSelectedId && colorMap[currentSelectedId]) {
      colorMap[currentSelectedId][3] = 180;
    }
    drawAll();
  }

  // Sélecteurs DOM
  const baseMap = document.getElementById('baseMap');
  const pixelCanvas = document.getElementById('pixelCanvas');
  const panZoomGroup = document.getElementById('panZoomGroup');
  const mapContainer = document.getElementById('mapContainer');
  const toggleEditBtn = document.getElementById('toggleEdit');
  const randomBtn = document.getElementById('randomColors');
  const saveBtn = document.getElementById('saveToFile');
  const deleteBtn = document.getElementById('deleteBarony');
  const toggleMapBtn = document.getElementById('toggleMap');
  const selectBtn = document.getElementById('selectBarony');
  const infoPanel = document.getElementById('infoPanel');
  const editIdInput = document.getElementById('editId');
  const editNameInput = document.getElementById('editName');
  const editSeigneur = document.getElementById('editSeigneur');
  const editReligionPop = document.getElementById('editReligionPop');
  const editCulture = document.getElementById('editCulture');
  const editViscounty = document.getElementById('editViscounty');
  const editCounty = document.getElementById('editCounty');
  const editSanctuary = document.getElementById('editSanctuary');
  const editPriory = document.getElementById('editPriory');
  const editChurch = document.getElementById('editChurch');
  const editCathedral = document.getElementById('editCathedral');
  const editPlayer = document.getElementById('editPlayer');
  const updateBtn = document.getElementById('updateBarony');
  const filterSelect = document.getElementById('colorFilter');
  const legendDiv = document.getElementById('legend');

  let seigneurOptions = [];
  let religionOptions = [];
  let cultureOptions = [];
  let countyOptions = [];
  let viscountyOptions = [];

  async function loadOptions() {
    const [seigneurs, religions, cultures, counties, viscounties] = await Promise.all([
      fetch(API_BASE + '/api/seigneurs').then(r => r.json()),
      fetch(API_BASE + '/api/religions').then(r => r.json()),
      fetch(API_BASE + '/api/cultures').then(r => r.json()),
      fetch(API_BASE + '/api/counties').then(r => r.json()),
      fetch(API_BASE + '/api/viscounties').then(r => r.json()),
    ]);
    seigneurOptions = seigneurs.slice().sort((a, b) => a.name.localeCompare(b.name));
    religionOptions = religions.slice().sort((a, b) => a.name.localeCompare(b.name));
    cultureOptions = cultures.slice().sort((a, b) => a.name.localeCompare(b.name));
    countyOptions = counties.slice().sort((a, b) => a.name.localeCompare(b.name));
    viscountyOptions = viscounties.slice().sort((a, b) => a.name.localeCompare(b.name));
    const blankOpt = '<option value=""></option>';
    if (editSeigneur) {
      editSeigneur.innerHTML = blankOpt + seigneurOptions.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
    if (editReligionPop) {
      editReligionPop.innerHTML = blankOpt + religionOptions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
    if (editSanctuary) {
      editSanctuary.innerHTML = blankOpt + religionOptions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
    if (editPriory) {
      editPriory.innerHTML = blankOpt + religionOptions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
    if (editChurch) {
      editChurch.innerHTML = blankOpt + religionOptions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
    if (editCathedral) {
      editCathedral.innerHTML = blankOpt + religionOptions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
    if (editCulture) editCulture.innerHTML = cultureOptions.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (editViscounty) editViscounty.innerHTML = blankOpt + viscountyOptions.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (editCounty) editCounty.innerHTML = countyOptions.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  async function loadMetaData() {
    const [baronies, seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands] = await Promise.all([
      fetch(API_BASE + '/api/baronies').then(r => r.json()),
      fetch(API_BASE + '/api/seigneurs').then(r => r.json()),
      fetch(API_BASE + '/api/religions').then(r => r.json()),
      fetch(API_BASE + '/api/cultures').then(r => r.json()),
      fetch(API_BASE + '/api/counties').then(r => r.json()),
      fetch(API_BASE + '/api/duchies').then(r => r.json()),
      fetch(API_BASE + '/api/kingdoms').then(r => r.json()),
      fetch(API_BASE + '/api/viscounties').then(r => r.json()),
      fetch(API_BASE + '/api/marquisates').then(r => r.json()),
      fetch(API_BASE + '/api/archduchies').then(r => r.json()),
      fetch(API_BASE + '/api/empires').then(r => r.json()),
      fetch(API_BASE + '/api/canonical_lands').then(r => r.json())
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
    seigneurToCounty = {};
    counties.forEach(c => { countyMap[c.id] = c; if (c.seigneur_id) seigneurToCounty[c.seigneur_id] = c.id; });
    duchyMap = {};
    seigneurToDuchy = {};
    duchies.forEach(d => { duchyMap[d.id] = d; if (d.seigneur_id) seigneurToDuchy[d.seigneur_id] = d.id; });
    kingdomMap = {};
    seigneurToKingdom = {};
    kingdoms.forEach(k => { kingdomMap[k.id] = k; if (k.seigneur_id) seigneurToKingdom[k.seigneur_id] = k.id; });
    viscountyMap = {};
    viscounties.forEach(v => { viscountyMap[v.id] = v; });
    marquisateMap = {};
    marquisates.forEach(m => { marquisateMap[m.id] = m; });
    archduchyMap = {};
    archduchies.forEach(a => { archduchyMap[a.id] = a; });
    empireMap = {};
    empires.forEach(e => { empireMap[e.id] = e; });
    canonicalLandMap = {};
    canonicalLands.forEach(cl => {
      if (!canonicalLandMap[cl.barony_id]) canonicalLandMap[cl.barony_id] = [];
      canonicalLandMap[cl.barony_id].push(cl.religion_id);
    });
  }
  // Outils
  const brushToolBtn = document.getElementById('brushTool');
  const eraserToolBtn = document.getElementById('eraserTool');
  const bucketToolBtn = document.getElementById('bucketTool');
  const newBaronyBtn = document.getElementById('newBarony');
  const brushSizeInput = document.getElementById('brushSize');
  const brushSizeValue = document.getElementById('brushSizeValue');

  // Save pixels to the server
  if (saveBtn) saveBtn.addEventListener('click', () => {
    fetch(API_BASE + '/api/barony_pixels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pixelData)
    });
  });

  // Canvas context
  const ctx = pixelCanvas.getContext('2d');
  pixelCanvas.width = originalWidth;
  pixelCanvas.height = originalHeight;
  ctx.imageSmoothingEnabled = false;

  // État de l’interface
  const defaultEditMode = window.defaultEditMode || false;
  let editMode = defaultEditMode;
  let currentTool = null;
  let brushSize = 1;
  if (brushSizeValue) brushSizeValue.textContent = brushSize;
  let painting = false;
  let currentSelectedId = null;
  let mergeMode = false;
  let mergeBaseId = null;
  let usingBlankMap = false;

  // Historique des opérations pour l’undo
  const undoStack = [];


  // Masque des barrières pour le bucket fill (eau, montagnes)
  let barrierMask = null;

  // Couleurs de fond (r,g,b) pour chaque pixel, selon la carte active
  let backgroundColors = null;

  // Pan/zoom
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

  // Dessiner la carte complète
  function drawAll() {
    const imageData = ctx.createImageData(originalWidth, originalHeight);
    const data = imageData.data;
    let idx = 0;
    for (let y = 0; y < originalHeight; y++) {
      for (let x = 0; x < originalWidth; x++) {
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
  }

  function drawPixel(x, y, id) {
    if (!colorMap[id]) {
      colorMap[id] = generateColor(id);
    }
    const col = colorMap[id];
    // Utiliser l'alpha s'il est défini dans la couleur (col[3])
    const alpha = col.length > 3 ? col[3] / 255 : 1;
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
    ctx.fillRect(x, y, 1, 1);
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
    currentFilter = type || '';
    canonicalPatterns = {};
    if (!type) {
      initColorMap();
      updateLegend(null);
      if (currentSelectedId && colorMap[currentSelectedId]) colorMap[currentSelectedId][3] = 180;
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
      } else if (type === 'marquisate') {
        const county = countyMap[info.county_id];
        groupId = county ? county.marquisate_id : null;
        groupName = marquisateMap[groupId]?.name || '';
      } else if (type === 'duchy') {
        const county = countyMap[info.county_id];
        groupId = county ? county.duchy_id : null;
        groupName = duchyMap[groupId]?.name || '';
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
      } else if (type === 'empire') {
        const county = countyMap[info.county_id];
        const duchy = county ? duchyMap[county.duchy_id] : null;
        const kingdom = duchy ? kingdomMap[duchy.kingdom_id] : null;
        groupId = kingdom ? kingdom.empire_id : null;
        groupName = empireMap[groupId]?.name || '';
      } else if (type === 'sanctuary') {
        groupId = info.sanctuary_religion_id;
        groupName = religionMap[groupId]?.name || '';
      } else if (type === 'priory') {
        groupId = info.priory_religion_id;
        groupName = religionMap[groupId]?.name || '';
      } else if (type === 'church') {
        groupId = info.church_religion_id;
        groupName = religionMap[groupId]?.name || '';
      } else if (type === 'cathedral') {
        groupId = info.cathedral_religion_id;
        groupName = religionMap[groupId]?.name || '';
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
          if (type === 'religion') {
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

  // Gestion de la sélection
  function selectBarony(id) {
    // remettre l'opacité par défaut sur l'ancienne sélection
    if (currentSelectedId && colorMap[currentSelectedId]) {
      // Rétablir l'opacité normale
      colorMap[currentSelectedId][3] = 100;
    }
    currentSelectedId = id;
    if (!id) {
      if (infoPanel) infoPanel.style.display = 'none';
      drawAll();
      return;
    }
    if (!baronyMeta[id]) {
      baronyMeta[id] = { id: id, name: '' };
    }
    // s'assurer que la baronnie a une couleur puis la mettre en valeur
    if (!colorMap[id]) {
      colorMap[id] = generateColor(id);
    }
    colorMap[id][3] = 180;
    if (infoPanel) {
      infoPanel.style.display = 'block';
    }
    if (editIdInput) editIdInput.value = baronyMeta[id].id;
    if (editNameInput) editNameInput.value = baronyMeta[id].name || '';
    fetch(`${API_BASE}/api/baronies?id=${id}`).then(r=>r.json()).then(list=>{
      const info = list.find(b=>String(b.id)===String(id));
      if(!info) return;
      if (editNameInput) editNameInput.value = info.name || '';
      baronyMeta[id].name = info.name || '';
      if (editSeigneur) editSeigneur.value = info.seigneur_id || '';
      if (editReligionPop) editReligionPop.value = info.religion_pop_id || '';
      if (editCulture) editCulture.value = info.culture_id || '';
      if (editViscounty) editViscounty.value = info.viscounty_id || '';
      if (editCounty) editCounty.value = info.county_id || '';
      if (editSanctuary) editSanctuary.value = info.sanctuary_religion_id || '';
      if (editPriory) editPriory.value = info.priory_religion_id || '';
      if (editChurch) editChurch.value = info.church_religion_id || '';
      if (editCathedral) editCathedral.value = info.cathedral_religion_id || '';
      if (editPlayer) editPlayer.checked = !!info.player;
    });
    drawAll();
  }

  // Mettre à jour ID/nom de la baronnie sélectionnée
  function updateBarony() {
    if (!currentSelectedId) return;
    const oldId = currentSelectedId;
    const newId = editIdInput.value.trim();
    const newName = editNameInput.value.trim();
    const seigneurId = editSeigneur ? parseInt(editSeigneur.value || '') || null : null;
    const relPop = editReligionPop ? parseInt(editReligionPop.value || '') || null : null;
    const cultureId = editCulture ? parseInt(editCulture.value || '') || null : null;
    const viscountyId = editViscounty ? parseInt(editViscounty.value || '') || null : null;
    const countyId = editCounty ? parseInt(editCounty.value || '') || null : null;
    const sanctuaryId = editSanctuary ? parseInt(editSanctuary.value || '') || null : null;
    const prioryId = editPriory ? parseInt(editPriory.value || '') || null : null;
    const churchId = editChurch ? parseInt(editChurch.value || '') || null : null;
    const cathedralId = editCathedral ? parseInt(editCathedral.value || '') || null : null;
    const playerFlag = editPlayer ? (editPlayer.checked ? 1 : 0) : 0;
    if (newId === '') return;
    if (newId === oldId) {
      // seulement le nom change
      const op = { type: 'rename', oldId: oldId, newId: oldId, oldName: baronyMeta[oldId].name || '', newName: newName, coords: [] };
      undoStack.push(op);
      if (baronyMeta[oldId]) {
        Object.assign(baronyMeta[oldId], {
          name: newName,
          seigneur_id: seigneurId,
          religion_pop_id: relPop,
          county_id: countyId,
          viscounty_id: viscountyId,
          culture_id: cultureId,
          sanctuary_religion_id: sanctuaryId,
          priory_religion_id: prioryId,
          church_religion_id: churchId,
          cathedral_religion_id: cathedralId,
          player: playerFlag
        });
      }
      saveBaronyToServer(oldId, { name: newName, seigneur_id: seigneurId, religion_pop_id: relPop, county_id: countyId, viscounty_id: viscountyId, culture_id: cultureId, sanctuary_religion_id: sanctuaryId, priory_religion_id: prioryId, church_religion_id: churchId, cathedral_religion_id: cathedralId, player: playerFlag });
      return;
    }
    // Si un identifiant existe déjà, échanger les baronnies
    if (pixelData[newId]) {
      const coordsOld = pixelData[oldId] || [];
      const coordsNew = pixelData[newId] || [];
      // Enregistrer l'opération pour undo
      const changes = [];
      coordsOld.forEach(([x, y]) => {
        changes.push({ x, y, oldId: oldId, newId: newId });
      });
      coordsNew.forEach(([x, y]) => {
        changes.push({ x, y, oldId: newId, newId: oldId });
      });
      undoStack.push({ type: 'swap', id1: oldId, id2: newId, changes: changes, oldName: baronyMeta[oldId] ? baronyMeta[oldId].name : '', newName: baronyMeta[newId] ? baronyMeta[newId].name : '' });
      // Échanger les coordonnées
      pixelData[oldId] = coordsNew;
      pixelData[newId] = coordsOld;
      // Mettre à jour les noms : l'ancien id prend l'ancien nom de newId ; le nouvel id prend le nouveau nom saisi
      const tempName = baronyMeta[newId] ? baronyMeta[newId].name : '';
      baronyMeta[oldId] = { id: oldId, name: tempName, seigneur_id: seigneurId, religion_pop_id: relPop, county_id: countyId, viscounty_id: viscountyId, culture_id: cultureId, sanctuary_religion_id: sanctuaryId, priory_religion_id: prioryId, church_religion_id: churchId, cathedral_religion_id: cathedralId, player: playerFlag };
      baronyMeta[newId] = { id: newId, name: newName, seigneur_id: seigneurId, religion_pop_id: relPop, county_id: countyId, viscounty_id: viscountyId, culture_id: cultureId, sanctuary_religion_id: sanctuaryId, priory_religion_id: prioryId, church_religion_id: churchId, cathedral_religion_id: cathedralId, player: playerFlag };
      // Mettre à jour pixelMap
      coordsOld.forEach(([x, y]) => {
        pixelMap[y][x] = newId;
      });
      coordsNew.forEach(([x, y]) => {
        pixelMap[y][x] = oldId;
      });
      // Mettre à jour la sélection
      currentSelectedId = newId;
      colorMap[newId] = generateColor(newId);
      colorMap[oldId] = generateColor(oldId);
      drawAll();
      selectBarony(newId);
      saveBaronyToServer(newId, { name: newName, seigneur_id: seigneurId, religion_pop_id: relPop, county_id: countyId, viscounty_id: viscountyId, culture_id: cultureId, sanctuary_religion_id: sanctuaryId, priory_religion_id: prioryId, church_religion_id: churchId, cathedral_religion_id: cathedralId, player: playerFlag });
      saveBaronyToServer(oldId, { name: tempName, seigneur_id: seigneurId, religion_pop_id: relPop, county_id: countyId, viscounty_id: viscountyId, culture_id: cultureId, sanctuary_religion_id: sanctuaryId, priory_religion_id: prioryId, church_religion_id: churchId, cathedral_religion_id: cathedralId, player: playerFlag });
      return;
    }
    const coords = pixelData[oldId] || [];
    // enregistrer l'opération
    const op = { type: 'rename', oldId: oldId, newId: newId, oldName: baronyMeta[oldId] ? baronyMeta[oldId].name : '', newName: newName, coords: coords.slice() };
    undoStack.push(op);
    pixelData[newId] = coords;
    baronyMeta[newId] = { id: newId, name: newName };
    coords.forEach(([x, y]) => {
      pixelMap[y][x] = newId;
      drawPixel(x, y, newId);
    });
    delete pixelData[oldId];
    delete baronyMeta[oldId];
    currentSelectedId = newId;
    colorMap[newId] = generateColor(newId);
    drawAll();
    selectBarony(newId);
    saveBaronyToServer(newId, { name: newName, seigneur_id: seigneurId, religion_pop_id: relPop, county_id: countyId, viscounty_id: viscountyId, culture_id: cultureId, sanctuary_religion_id: sanctuaryId, priory_religion_id: prioryId, church_religion_id: churchId, cathedral_religion_id: cathedralId, player: playerFlag });
  }

  function saveBaronyToServer(id, data) {
    fetch(API_BASE + '/api/baronies/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  // Supprimer la baronnie sélectionnée
  function deleteBarony() {
    if (!currentSelectedId) return;
    const id = currentSelectedId;
    const coords = pixelData[id] || [];
    // Enregistrer l'opération pour undo
    const op = { type: 'delete', id: id, coords: coords.slice(), name: baronyMeta[id] ? baronyMeta[id].name : '' };
    undoStack.push(op);
    coords.forEach(([x, y]) => {
      pixelMap[y][x] = 0;
      ctx.clearRect(x, y, 1, 1);
    });
    delete pixelData[id];
    delete baronyMeta[id];
    delete colorMap[id];
    currentSelectedId = null;
    if (infoPanel) infoPanel.style.display = 'none';
    fetch(API_BASE + '/api/baronies/' + id, { method: 'DELETE' });
  }

  // Créer un nouvel ID unique
  function createNewId() {
    let maxId = 0;
    Object.keys(pixelData).forEach((id) => {
      const num = parseInt(id, 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    });
    return String(maxId + 1);
  }

  // Fusion de baronnies
  function mergeBaronies(baseId, otherId) {
    if (!baseId || !otherId || baseId === otherId) return;
    const otherCoords = pixelData[otherId] || [];
    // Enregistrer l'opération pour undo : liste des pixels déplacés et id supprimé
    const changes = [];
    otherCoords.forEach(([x, y]) => {
      changes.push({ x: x, y: y, oldId: otherId, newId: baseId });
      pixelMap[y][x] = baseId;
      pixelData[baseId].push([x, y]);
      drawPixel(x, y, baseId);
    });
    const op = { type: 'merge', baseId: baseId, otherId: otherId, changes: changes, name: baronyMeta[otherId] ? baronyMeta[otherId].name : '' };
    undoStack.push(op);
    delete pixelData[otherId];
    delete baronyMeta[otherId];
    delete colorMap[otherId];
    if (currentSelectedId === otherId) currentSelectedId = baseId;
    selectBarony(baseId);
  }

  // Calculer les coordonnées de la carte à partir de l’écran
  function getMapCoordinates(e) {
    const rect = panZoomGroup.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / scale);
    const y = Math.floor((e.clientY - rect.top) / scale);
    return [x, y];
  }

  // Appliquer un pinceau ou gomme
  function applyBrush(x, y, id, erase = false, changes = null) {
    const half = Math.floor(brushSize / 2);
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= originalWidth || ny >= originalHeight) continue;
        const oldId = pixelMap[ny][nx];
        if (erase) {
          if (!oldId) continue;
          // remove pixel from its barony
          const arr = pixelData[oldId];
          if (arr) {
            const index = arr.findIndex(([px, py]) => px === nx && py === ny);
            if (index >= 0) arr.splice(index, 1);
          }
          pixelMap[ny][nx] = 0;
          ctx.clearRect(nx, ny, 1, 1);
          if (changes) changes.push({ x: nx, y: ny, oldId: oldId, newId: null });
        } else {
          if (oldId === id) continue;
          // remove from previous id
          if (oldId) {
            const arr = pixelData[oldId];
            if (arr) {
              const idx2 = arr.findIndex(([px, py]) => px === nx && py === ny);
              if (idx2 >= 0) arr.splice(idx2, 1);
            }
          }
          pixelMap[ny][nx] = id;
          if (!pixelData[id]) pixelData[id] = [];
          pixelData[id].push([nx, ny]);
          drawPixel(nx, ny, id);
          if (changes) changes.push({ x: nx, y: ny, oldId: oldId || null, newId: id });
        }
      }
    }
  }

  // Remplissage par bucket (flood fill) dans la zone contiguë
  function bucketFill(x, y, changes = null) {
    if (!currentSelectedId) return;
    const targetId = pixelMap[y][x];
    // Si on clique sur une baronnie existante (autre que celle sélectionnée), remplir cette baronnie
    if (targetId) {
      if (targetId === currentSelectedId) return;
      const queue = [[x, y]];
      const visited = new Set();
      const deltas = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      while (queue.length > 0) {
        const [cx, cy] = queue.pop();
        if (cx < 0 || cy < 0 || cx >= originalWidth || cy >= originalHeight) continue;
        const key = cy * originalWidth + cx;
        if (visited.has(key)) continue;
        visited.add(key);
        if (barrierMask && barrierMask[cy][cx]) continue;
        if (pixelMap[cy][cx] !== targetId) continue;
        // retirer du précédent id
        const arr = pixelData[targetId];
        if (arr) {
          const idx = arr.findIndex(([px, py]) => px === cx && py === cy);
          if (idx >= 0) arr.splice(idx, 1);
        }
        if (changes) changes.push({ x: cx, y: cy, oldId: targetId, newId: currentSelectedId });
        pixelMap[cy][cx] = currentSelectedId;
        if (!pixelData[currentSelectedId]) pixelData[currentSelectedId] = [];
        pixelData[currentSelectedId].push([cx, cy]);
        drawPixel(cx, cy, currentSelectedId);
        for (const [dx, dy] of deltas) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= originalWidth || ny >= originalHeight) continue;
          const nKey = ny * originalWidth + nx;
          if (!visited.has(nKey)) queue.push([nx, ny]);
        }
      }
    } else {
      // Clic sur un pixel sans baronnie : remplir la zone contiguë de pixels vides.
      const queue = [[x, y]];
      const visited = new Set();
      const deltas = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      while (queue.length > 0) {
        const [cx, cy] = queue.pop();
        if (cx < 0 || cy < 0 || cx >= originalWidth || cy >= originalHeight) continue;
        const key = cy * originalWidth + cx;
        if (visited.has(key)) continue;
        visited.add(key);
        // Stopper au niveau des barrières (eau, montagnes, frontières grises)
        if (barrierMask && barrierMask[cy][cx]) continue;
        // Ne remplir que les pixels sans baronnie
        if (pixelMap[cy][cx] !== 0) continue;
        if (changes) changes.push({ x: cx, y: cy, oldId: null, newId: currentSelectedId });
        pixelMap[cy][cx] = currentSelectedId;
        if (!pixelData[currentSelectedId]) pixelData[currentSelectedId] = [];
        pixelData[currentSelectedId].push([cx, cy]);
        drawPixel(cx, cy, currentSelectedId);
        for (const [dx, dy] of deltas) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= originalWidth || ny >= originalHeight) continue;
          const nKey = ny * originalWidth + nx;
          if (!visited.has(nKey)) queue.push([nx, ny]);
        }
      }
    }
  }

  // Gestion du clic sur le canevas
  function handleCanvasClick(e) {
    const [x, y] = getMapCoordinates(e);
    if (x < 0 || y < 0 || x >= originalWidth || y >= originalHeight) return;
    const idAtPixel = pixelMap[y][x];
    // Hors mode édition : simplement afficher la baronnie sous le curseur
    if (!editMode) {
      if (idAtPixel) {
        selectBarony(idAtPixel);
      } else {
        selectBarony(null);
      }
      return;
    }
    // En mode édition : appliquer l'outil courant
    if (currentTool === 'brush') {
      if (!currentSelectedId) return;
      const changes = [];
      applyBrush(x, y, currentSelectedId, false, changes);
      if (changes.length > 0) undoStack.push({ type: 'paint', changes });
    } else if (currentTool === 'eraser') {
      const changes = [];
      applyBrush(x, y, null, true, changes);
      if (changes.length > 0) undoStack.push({ type: 'paint', changes });
    } else if (currentTool === 'bucket') {
      if (!currentSelectedId) return;
      const changes = [];
      bucketFill(x, y, changes);
      if (changes.length > 0) undoStack.push({ type: 'paint', changes });
    } else if (mergeMode && mergeBaseId) {
      if (idAtPixel && idAtPixel !== mergeBaseId) {
        mergeBaronies(mergeBaseId, idAtPixel);
        mergeMode = false;
        mergeBaseId = null;
      }
    } else {
      if (idAtPixel) {
        selectBarony(idAtPixel);
      } else {
        selectBarony(null);
      }
    }
  }

  // Gestion de la peinture continue
  function handleMouseDown(e) {
    if (!editMode) return;
    if (currentTool === 'brush' || currentTool === 'eraser') {
      painting = true;
      handleCanvasClick(e);
    }
  }
  function handleMouseMove(e) {
    if (painting && (currentTool === 'brush' || currentTool === 'eraser') && editMode) {
      handleCanvasClick(e);
    }
  }
  function handleMouseUp() {
    painting = false;
  }

  // Gestion du zoom
  function handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = panZoomGroup.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / scale;
    const my = (e.clientY - rect.top) / scale;
    const prevScale = scale;
    scale *= factor;
    scale = Math.max(0.2, Math.min(scale, 10));
    offsetX -= (mx * scale - mx * prevScale);
    offsetY -= (my * scale - my * prevScale);
    applyTransform();
  }

  // Gestion du pan
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  function handlePanStart(e) {
    // Pas de pan pendant que l’on peint
    if (painting) return;
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

  // Exportation JSON
  function exportJson() {
    const out = {};
    Object.keys(pixelData).forEach((id) => {
      out[id] = pixelData[id];
    });
    const json = JSON.stringify(out, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'baronnies_pixels.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Import JSON
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        pixelData = data;
        baronyMeta = {};
        Object.keys(pixelData).forEach((id) => {
          baronyMeta[id] = { id: id, name: '' };
        });
        for (let y = 0; y < originalHeight; y++) {
          pixelMap[y].fill(0);
        }
        Object.entries(pixelData).forEach(([id, coords]) => {
          coords.forEach(([px, py]) => {
            if (py >= 0 && py < originalHeight && px >= 0 && px < originalWidth) {
              pixelMap[py][px] = id;
            }
          });
        });
        currentSelectedId = null;
        if (infoPanel) infoPanel.style.display = 'none';
        initColorMap();
        drawAll();
      } catch (err) {
        alert('Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
  }

  function toggleMap() {
    // Déterminer la nouvelle source à partir des Data URI. On évite les chemins
    // relatifs pour ne pas tainter le canvas. Si mapSources n'est pas défini,
    // on retombe sur les chemins classiques.
    let newSrc;
    if (usingBlankMap) {
      newSrc = (window.mapSources && window.mapSources.asgaria) || 'Asgaria.png';
    } else {
      newSrc = (window.mapSources && window.mapSources.blank) || 'BlankMap.png';
    }
    baseMap.setAttribute('src', newSrc);
    usingBlankMap = !usingBlankMap;
    // Recalculer les masques et couleurs de fond pour la nouvelle carte
    computeBarrierMask(newSrc).then(() => {
      // rien à faire après recalcul, la carte est redessinée lors des modifications ultérieures
    });
  }

  // Calcul du masque des barrières (eau et montagnes).
  // Cette fonction charge l'image depuis `src` via fetch pour éviter
  // les problèmes de canvas « tainted » avec des fichiers locaux. Elle crée
  // ensuite un objet URL et dessine l'image dans un canvas hors écran
  // afin de récupérer les données des pixels. Les barrières sont l'eau
  // (#00A2E8, #99D9EA), les montagnes/noir (#000000) et les frontières
  // grises (#7F7F7F). La couleur de fond est enregistrée pour chaque pixel.
  function computeBarrierMask(src) {
    return new Promise((resolve, reject) => {
      // Si l'URI est un data URI, on peut l'utiliser directement.
      const loadImage = (imageSrc) => {
        const img = new Image();
        img.onload = () => {
          try {
            const offCanvas = document.createElement('canvas');
            offCanvas.width = originalWidth;
            offCanvas.height = originalHeight;
            const offCtx = offCanvas.getContext('2d');
            offCtx.imageSmoothingEnabled = false;
            offCtx.drawImage(img, 0, 0);
            const data = offCtx.getImageData(0, 0, originalWidth, originalHeight).data;
            barrierMask = Array.from({ length: originalHeight }, () => new Array(originalWidth).fill(false));
            backgroundColors = Array.from({ length: originalHeight }, () => new Array(originalWidth));
            for (let y = 0; y < originalHeight; y++) {
              for (let x = 0; x < originalWidth; x++) {
                const idx = (y * originalWidth + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                // Les pixels d’eau (#00A2E8 ou #99D9EA) et les noirs (#000000) forment des barrières.
                // Les frontières grises (#7F7F7F) sont désormais traitées comme des pixels vides afin que
                // l’outil “bucket” puisse les remplir. Elles ne sont donc pas considérées comme des barrières.
                const isWater = (r === 0 && g === 162 && b === 232) || (r === 153 && g === 217 && b === 234);
                const isBlack = (r === 0 && g === 0 && b === 0);
                barrierMask[y][x] = isWater || isBlack;
                // Stocker la couleur de fond (r,g,b)
                backgroundColors[y][x] = [r, g, b];
              }
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = (err) => reject(err);
        img.src = imageSrc;
      };
      // Si src est une data URI ou undefined, utiliser directement
      if (!src || src.startsWith('data:')) {
        const uri = src || (window.mapSources && window.mapSources.asgaria) || 'Asgaria.png';
        loadImage(uri);
      } else {
        // Charger via fetch pour éviter les problèmes de cross‑origin.
        fetch(src).then((resp) => resp.blob()).then((blob) => {
          const url = URL.createObjectURL(blob);
          loadImage(url);
          // Révoquer l'URL une fois l'image chargée
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }).catch((err) => {
          reject(err);
        });
      }
    });
  }

  // Gestion des outils
  function setActiveTool(tool) {
    currentTool = tool;
    // Réinitialiser toutes les classes actives
    [brushToolBtn, eraserToolBtn, bucketToolBtn, newBaronyBtn].forEach((btn) => btn.classList.remove('active'));
    if (tool === 'brush') brushToolBtn.classList.add('active');
    else if (tool === 'eraser') eraserToolBtn.classList.add('active');
    else if (tool === 'bucket') bucketToolBtn.classList.add('active');
    else if (tool === 'new') newBaronyBtn.classList.add('active');
  }

  // Initialisation
  function init() {
    initColorMap();
    // Déterminer la source initiale : utiliser l'Asgaria de mapSources si disponible
    let src;
    if (window.mapSources && window.mapSources.asgaria) {
      src = window.mapSources.asgaria;
      baseMap.setAttribute('src', src);
    } else {
      src = baseMap.getAttribute('src') || 'Asgaria.png';
    }
    computeBarrierMask(src).then(() => {
      fitToContainer();
      drawAll();
    });
  }

  /* Écouteurs d’événements */
  if (toggleEditBtn) toggleEditBtn.addEventListener('click', () => {
    editMode = !editMode;
    toggleEditBtn.textContent = editMode ? 'Quitter le mode édition' : 'Mode édition';
    if (!editMode) {
      currentTool = null;
      [brushToolBtn, eraserToolBtn, bucketToolBtn, newBaronyBtn].forEach((btn) => btn.classList.remove('active'));
      painting = false;
      mergeMode = false;
      mergeBaseId = null;
      currentSelectedId = null;
      if (infoPanel) infoPanel.style.display = 'none';
    }
  });
  if (randomBtn) randomBtn.addEventListener('click', randomizeColors);
  if (filterSelect) filterSelect.addEventListener('change', () => applyFilter(filterSelect.value));
  if (deleteBtn) deleteBtn.addEventListener('click', deleteBarony);
  if (toggleMapBtn) toggleMapBtn.addEventListener('click', toggleMap);
  if (selectBtn) selectBtn.addEventListener('click', () => {
    const id = prompt('ID de la baronnie à sélectionner ?');
    if (id) selectBarony(id.trim());
  });
  if (updateBtn) updateBtn.addEventListener('click', updateBarony);

  // Outils
  if (brushToolBtn)
    brushToolBtn.addEventListener('click', () => {
      if (!editMode) return;
      setActiveTool('brush');
      mergeMode = false;
      mergeBaseId = null;
    });
  if (eraserToolBtn)
    eraserToolBtn.addEventListener('click', () => {
      if (!editMode) return;
      setActiveTool('eraser');
      mergeMode = false;
      mergeBaseId = null;
    });
  if (bucketToolBtn)
    bucketToolBtn.addEventListener('click', () => {
      if (!editMode) return;
      setActiveTool('bucket');
      mergeMode = false;
      mergeBaseId = null;
    });
  if (newBaronyBtn)
    newBaronyBtn.addEventListener('click', () => {
      if (!editMode) return;
      const newId = createNewId();
      // Enregistrer création pour l’undo
      undoStack.push({ type: 'create', id: newId });
      pixelData[newId] = [];
      baronyMeta[newId] = { id: newId, name: '', seigneur_id: null, religion_pop_id: null, county_id: null, viscounty_id: null, culture_id: null, sanctuary_religion_id: null, priory_religion_id: null, church_religion_id: null, cathedral_religion_id: null, player: 0 };
      colorMap[newId] = generateColor(newId);
      currentSelectedId = newId;
      selectBarony(newId);
      saveBaronyToServer(newId, { name: '', seigneur_id: null, religion_pop_id: null, county_id: null, viscounty_id: null, culture_id: null, sanctuary_religion_id: null, priory_religion_id: null, church_religion_id: null, cathedral_religion_id: null, player: 0 });
      setActiveTool('brush');
    });
  if (brushSizeInput)
    brushSizeInput.addEventListener('input', () => {
      const val = parseInt(brushSizeInput.value, 10);
      brushSize = isNaN(val) ? 1 : val;
      if (brushSizeValue) brushSizeValue.textContent = brushSize;
    });

  // Événements souris pour peinture et sélection
  pixelCanvas.addEventListener('mousedown', handleMouseDown);
  pixelCanvas.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  pixelCanvas.addEventListener('click', handleCanvasClick);

  // Clic droit : effacement quel que soit l'outil (pinceau, bucket, etc.)
  pixelCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const [x, y] = getMapCoordinates(e);
    if (x < 0 || y < 0 || x >= originalWidth || y >= originalHeight) return;
    const changes = [];
    applyBrush(x, y, null, true, changes);
    if (changes.length > 0) undoStack.push({ type: 'paint', changes });
  });

  // Pan/zoom sur le conteneur
  mapContainer.addEventListener('wheel', handleWheel, { passive: false });
  mapContainer.addEventListener('mousedown', handlePanStart);
  mapContainer.addEventListener('mousemove', handlePanMove);
  window.addEventListener('mouseup', handlePanEnd);
  window.addEventListener('resize', fitToContainer);

  // Touche Escape : annuler la sélection et tout mode actif
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      selectBarony(null);
      painting = false;
      mergeMode = false;
      mergeBaseId = null;
      setActiveTool(null);
    }
  });

  // Undo (Ctrl+Z)
  function undo() {
    if (undoStack.length === 0) return;
    const op = undoStack.pop();
    if (op.type === 'paint') {
      // revert paint/eraser/bucket changes
      op.changes.forEach(({ x, y, oldId, newId }) => {
        const current = pixelMap[y][x];
        // remove from current id if needed
        if (current) {
          const arr = pixelData[current];
          if (arr) {
            const idx = arr.findIndex(([px, py]) => px === x && py === y);
            if (idx >= 0) arr.splice(idx, 1);
          }
        }
        if (oldId) {
          pixelMap[y][x] = oldId;
          if (!pixelData[oldId]) pixelData[oldId] = [];
          pixelData[oldId].push([x, y]);
          drawPixel(x, y, oldId);
        } else {
          pixelMap[y][x] = 0;
          ctx.clearRect(x, y, 1, 1);
        }
      });
    } else if (op.type === 'delete') {
      // restore deleted barony
      const id = op.id;
      pixelData[id] = op.coords.slice();
      baronyMeta[id] = { id: id, name: op.name };
      op.coords.forEach(([x, y]) => {
        pixelMap[y][x] = id;
        drawPixel(x, y, id);
      });
    } else if (op.type === 'merge') {
      // revert merging: restore otherId
      const { baseId, otherId, changes, name } = op;
      pixelData[otherId] = [];
      baronyMeta[otherId] = { id: otherId, name: name };
      changes.forEach(({ x, y }) => {
        // remove from baseId
        const arrBase = pixelData[baseId];
        if (arrBase) {
          const idx = arrBase.findIndex(([px, py]) => px === x && py === y);
          if (idx >= 0) arrBase.splice(idx, 1);
        }
        pixelMap[y][x] = otherId;
        pixelData[otherId].push([x, y]);
        drawPixel(x, y, otherId);
      });
    } else if (op.type === 'swap') {
      // revert swapping of two baronies
      const { id1, id2, changes, oldName, newName } = op;
      changes.forEach(({ x, y, oldId, newId }) => {
        // remove from current assignment (newId)
        const arr = pixelData[newId];
        if (arr) {
          const idx = arr.findIndex(([px, py]) => px === x && py === y);
          if (idx >= 0) arr.splice(idx, 1);
        }
        // restore previous id
        pixelMap[y][x] = oldId;
        if (!pixelData[oldId]) pixelData[oldId] = [];
        pixelData[oldId].push([x, y]);
        drawPixel(x, y, oldId);
      });
      baronyMeta[id1] = { id: id1, name: oldName };
      baronyMeta[id2] = { id: id2, name: newName };
      if (currentSelectedId === id2) {
        currentSelectedId = id1;
        selectBarony(id1);
      }
    } else if (op.type === 'create') {
      // remove created barony (should have no pixels or few)
      const id = op.id;
      const coords = pixelData[id] || [];
      coords.forEach(([x, y]) => {
        pixelMap[y][x] = 0;
        ctx.clearRect(x, y, 1, 1);
      });
      delete pixelData[id];
      delete baronyMeta[id];
      if (currentSelectedId === id) {
        currentSelectedId = null;
        if (infoPanel) infoPanel.style.display = 'none';
      }
    } else if (op.type === 'rename') {
      const { oldId, newId, oldName, newName, coords } = op;
      if (oldId === newId) {
        // only name change
        if (baronyMeta[oldId]) baronyMeta[oldId].name = oldName;
      } else {
        // revert id change
        // remove newId assignment
        coords.forEach(([x, y]) => {
          const arrNew = pixelData[newId];
          if (arrNew) {
            const idx = arrNew.findIndex(([px, py]) => px === x && py === y);
            if (idx >= 0) arrNew.splice(idx, 1);
          }
          pixelMap[y][x] = oldId;
          if (!pixelData[oldId]) pixelData[oldId] = [];
          pixelData[oldId].push([x, y]);
        });
        // restore meta
        baronyMeta[oldId] = { id: oldId, name: oldName };
        delete pixelData[newId];
        delete baronyMeta[newId];
        // update selected id if necessary
        if (currentSelectedId === newId) {
          currentSelectedId = oldId;
          selectBarony(oldId);
        }
        drawAll();
      }
    }
  }

  // Raccourci clavier pour l’undo
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      undo();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    Promise.all([loadPixelData(), loadMetaData(), loadOptions()]).then(() => {
      if (baseMap.complete) {
        init();
        applyFilter(filterSelect ? filterSelect.value : '');
      } else {
        baseMap.onload = () => {
          init();
          applyFilter(filterSelect ? filterSelect.value : '');
        };
      }
    });
  });
})();
