(() => {
  const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';
  const params = new URLSearchParams(location.search);
  const mapMode = params.get('mode') === 'sea' ? 'sea' : 'land';
  const PIXEL_CHUNK_SIZE = 50;
  const MAX_PIXEL_REQUESTS = 3;
  const pixelEndpoint = mapMode === 'sea' ? '/api/maritime_zone_pixels' : '/api/barony_pixels';
  const entityEndpoint = mapMode === 'sea' ? '/api/maritime_zones' : '/api/baronies';

  let mapWidth = 0;
  let mapHeight = 0;

  let pixelData = {};
  let seaPixelData = {};
  let baronyPixelData = {};
  let maritimeZoneBaronies = {};
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
  let seigneurToCounty = {}, seigneurToDuchy = {}, seigneurToKingdom = {}, seigneurToViscounty = {}, seigneurToMarquisate = {}, seigneurToArchduchy = {}, seigneurToEmpire = {};
  let canonicalLandMap = {};
  let canonicalDependents = {};
  let sanctuaryMap = {};
  let baronyAdjacency = {};
  let mapData = {};

  let baronyLinkMode = false;
  let previousFilter = '';
  let currentSeaZoneId = null;

  let filterManager = null;

  const baseMap = document.getElementById('baseMap');
  if (mapMode === 'sea' && baseMap) baseMap.src = 'zones_maritimes.png';
  const pixelCanvas = document.getElementById('pixelCanvas');
  const filterSelect = document.getElementById('filterSelect');
  const randomBtn = document.getElementById('randomBtn');
  const pixelLoading = document.getElementById('pixelLoading');
  const legendDiv = document.getElementById('legend');
  const landFilters = [
    { value: '', label: 'Aucun' },
    { value: 'religion', label: 'Religion' },
    { value: 'seigneur_religion', label: 'Religion du seigneur' },
    { value: 'sanctuary', label: 'Sanctuaire' },
    { value: 'priory', label: 'Prieuré' },
    { value: 'church', label: 'Église' },
    { value: 'cathedral', label: 'Cathédrale' },
    { value: 'canonical', label: 'Terres canoniques' },
    { value: 'culture', label: 'Culture' },
    { value: 'viscounty', label: 'Vicomté de jure' },
    { value: 'viscounty_defacto', label: 'Vicomté de facto' },
    { value: 'county', label: 'Comté de jure' },
    { value: 'county_defacto', label: 'Comté de facto' },
    { value: 'marquisate', label: 'Marquisat de jure' },
    { value: 'marquisate_defacto', label: 'Marquisat de facto' },
    { value: 'duchy', label: 'Duché de jure' },
    { value: 'duchy_defacto', label: 'Duché de facto' },
    { value: 'archduchy', label: 'Archiduché de jure' },
    { value: 'archduchy_defacto', label: 'Archiduché de facto' },
    { value: 'kingdom', label: 'Royaume de jure' },
    { value: 'kingdom_defacto', label: 'Royaume de facto' },
    { value: 'empire', label: 'Empire de jure' },
    { value: 'empire_defacto', label: 'Empire de facto' },
    { value: 'distance', label: 'Distance' },
    { value: 'vacant', label: 'Vacance' },
    { value: 'occupation', label: 'Occupation' }
  ];
  const seaFilters = [
    { value: '', label: 'Aucun' },
    { value: 'distance', label: 'Distance' },
    { value: 'baronies', label: 'Baronnies liées' }
  ];
  function populateFilters() {
    if (!filterSelect) return;
    const filters = mapMode === 'sea' ? seaFilters : landFilters;
    filterSelect.innerHTML = '';
    filters.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      filterSelect.appendChild(opt);
    });
  }
  populateFilters();

  const linkBtn = document.getElementById('linkBarony');
  const unlinkBtn = document.getElementById('unlinkBarony');

  const infoPanel = document.getElementById('infoPanel');
  const seaInfoPanel = document.getElementById('seaInfoPanel');
  const editIdInput = document.getElementById('editId');
  const editNameInput = document.getElementById('editName');
  const seaEditIdInput = document.getElementById('seaEditId');
  const seaEditNameInput = document.getElementById('seaEditName');
  const editSeaBaroniesBtn = document.getElementById('editSeaBaronies');
  const editReligionPopSelect = document.getElementById('editReligionPop');
  const editSanctuariesBtn = document.getElementById('editSanctuaries');
  const editCanonicalBtn = document.getElementById('editCanonical');
  const editPrioryReligionSelect = document.getElementById('editPrioryReligion');
  const editChurchReligionSelect = document.getElementById('editChurchReligion');
  const editCathedralReligionSelect = document.getElementById('editCathedralReligion');
  const editSeigneurSelect = document.getElementById('editSeigneur');
  const editVacantCheckbox = document.getElementById('editVacant');
  const editCultureSelect = document.getElementById('editCulture');
  const editViscountySelect = document.getElementById('editViscounty');
  const editCountySelect = document.getElementById('editCounty');
  const seaEditSeigneurSelect = document.getElementById('seaEditSeigneur');

  const canonicalKey = id => (id === null || id === undefined ? '' : String(id));

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

  function drawOverlay(ctx) {
    if (mapMode !== 'sea') return;
    const zoneId = baronyLinkMode ? currentSeaZoneId : core?.currentSelectedId;
    if (baronyLinkMode && zoneId) {
      ctx.fillStyle = 'rgba(255,255,0,0.4)';
      (seaPixelData[zoneId] || []).forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
    }
    const showBaronies = baronyLinkMode || (filterSelect && filterSelect.value === 'baronies');
    if (showBaronies && zoneId) {
      ctx.fillStyle = 'rgba(0,0,255,0.4)';
      (maritimeZoneBaronies[zoneId] || []).forEach(bid => {
        (baronyPixelData[bid] || []).forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
      });
    }
  }

  function updatePixelLoading(loaded, total, show = true) {
    if (!pixelLoading) return;
    if (!show) {
      pixelLoading.style.display = 'none';
      return;
    }
    pixelLoading.style.display = 'inline-block';
    pixelLoading.textContent = `Chargement des pixels... ${loaded}/${total}`;
  }

  async function fetchBaronyPixelsInChunks(ids, target = {}, applyToMap = true) {
    if (!ids || ids.length === 0) return target;
    const queue = [...ids];
    const active = [];
    let loaded = 0;
    const total = ids.length;

      const scheduleNext = () => {
        if (active.length >= MAX_PIXEL_REQUESTS) return;
        const batch = queue.splice(0, PIXEL_CHUNK_SIZE);
        if (batch.length === 0) return;
        const promise = fetch(`${API_BASE}/api/barony_pixels?ids=${batch.join(',')}`)
          .then(async r => {
            if (!r.ok) {
              throw new Error(`HTTP ${r.status}`);
            }
            const text = await r.text();
            if (!text) return {};
            try {
              return JSON.parse(text);
            } catch (e) {
              console.warn('Réponse pixels invalide, texte brutes :', text);
              throw e;
            }
          })
          .then(data => {
            Object.assign(target, data);
            loaded = Math.min(total, loaded + batch.length);
            updatePixelLoading(loaded, total, true);
            if (applyToMap && core && typeof core.setPixelData === 'function') {
              core.setPixelData(target);
            } else if (core && typeof core.drawAll === 'function') {
              core.drawAll();
            }
          })
          .catch(err => console.warn('Erreur lors du chargement des pixels', err))
          .finally(() => {
            const idx = active.indexOf(promise);
            if (idx >= 0) active.splice(idx, 1);
            scheduleNext();
          });
        active.push(promise);
      };

    for (let i = 0; i < MAX_PIXEL_REQUESTS; i++) {
      scheduleNext();
    }

    while (active.length > 0) {
      await Promise.race(active);
    }

    updatePixelLoading(total, total, false);
    return target;
  }

  let core = null;
  let currentSelectedId = null;
  let pendingLinkId = null;
  let pendingAction = null; // 'link' or 'unlink'

  function startLinking(action) {
    if (!currentSelectedId) return;
    pendingLinkId = currentSelectedId;
    pendingAction = action;
  }

  if (linkBtn) linkBtn.addEventListener('click', () => startLinking('link'));
  if (unlinkBtn) unlinkBtn.addEventListener('click', () => startLinking('unlink'));

  window.addEventListener('keydown', e => {
    if (e.key === 'Control') {
      startLinking(e.altKey ? 'unlink' : 'link');
    }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'Control') {
      pendingLinkId = null;
      pendingAction = null;
    }
  });

  function populateReligionSelects() {
      const selects = [
        editReligionPopSelect,
        editPrioryReligionSelect,
        editChurchReligionSelect,
        editCathedralReligionSelect
      ].filter(Boolean);
    selects.forEach(sel => {
      const placeholder = sel.firstElementChild ? sel.firstElementChild.cloneNode(true) : null;
      sel.innerHTML = '';
      if (placeholder) sel.appendChild(placeholder);
      Object.values(religionMap).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        sel.appendChild(opt);
      });
    });
  }

  function populateSelect(select, map, placeholder) {
    if (!select) return;
    const base = select.firstElementChild ? select.firstElementChild.cloneNode(true) : null;
    select.innerHTML = '';
    if (base) {
      select.appendChild(base);
    } else if (placeholder) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      select.appendChild(opt);
    }
    Object.values(map).forEach(obj => {
      const opt = document.createElement('option');
      opt.value = obj.id;
      opt.textContent = obj.name;
      select.appendChild(opt);
    });
  }

  function saveBaronyFields(fields) {
    if (!currentSelectedId) return;
    const payload = { ...baronyMeta[currentSelectedId], ...fields };
    delete payload.id;
    fetch(`${API_BASE}/api/baronies/${currentSelectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(res => {
      if (res.ok) {
        baronyMeta[currentSelectedId] = { ...baronyMeta[currentSelectedId], ...fields };
        if (filterManager && filterSelect && filterSelect.value) {
          filterManager.applyFilter(filterSelect.value);
        }
      }
    });
  }

  function saveSeaZoneFields(fields) {
    if (!currentSelectedId) return;
    const payload = { ...baronyMeta[currentSelectedId], ...fields };
    delete payload.id;
    fetch(`${API_BASE}/api/maritime_zones/${currentSelectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(res => {
      if (res.ok) {
        baronyMeta[currentSelectedId] = { ...baronyMeta[currentSelectedId], ...fields };
        if (core && typeof core.drawAll === 'function') core.drawAll();
      }
    });
  }

  if (editSeigneurSelect) {
    editSeigneurSelect.addEventListener('change', () => {
      saveBaronyFields({ seigneur_id: parseInt(editSeigneurSelect.value, 10) || null });
    });
  }
  if (editReligionPopSelect) {
    editReligionPopSelect.addEventListener('change', () => {
      saveBaronyFields({ religion_pop_id: parseInt(editReligionPopSelect.value, 10) || null });
    });
  }
  if (editPrioryReligionSelect) {
    editPrioryReligionSelect.addEventListener('change', () => {
      saveBaronyFields({ priory_religion_id: parseInt(editPrioryReligionSelect.value, 10) || null });
    });
  }
  if (editChurchReligionSelect) {
    editChurchReligionSelect.addEventListener('change', () => {
      saveBaronyFields({ church_religion_id: parseInt(editChurchReligionSelect.value, 10) || null });
    });
  }
  if (editCathedralReligionSelect) {
    editCathedralReligionSelect.addEventListener('change', () => {
      saveBaronyFields({ cathedral_religion_id: parseInt(editCathedralReligionSelect.value, 10) || null });
    });
  }
  if (editVacantCheckbox) {
    editVacantCheckbox.addEventListener('change', () => {
      saveBaronyFields({ vacant: editVacantCheckbox.checked ? 1 : 0 });
    });
  }
  if (editCultureSelect) {
    editCultureSelect.addEventListener('change', () => {
      saveBaronyFields({ culture_id: parseInt(editCultureSelect.value, 10) || null });
    });
  }
  if (editViscountySelect) {
    editViscountySelect.addEventListener('change', () => {
      saveBaronyFields({ viscounty_id: parseInt(editViscountySelect.value, 10) || null });
    });
  }
  if (editCountySelect) {
    editCountySelect.addEventListener('change', () => {
      saveBaronyFields({ county_id: parseInt(editCountySelect.value, 10) || null });
    });
  }
  if (seaEditSeigneurSelect) {
    seaEditSeigneurSelect.addEventListener('change', () => {
      saveSeaZoneFields({ seigneur_id: parseInt(seaEditSeigneurSelect.value, 10) || null });
    });
  }
  if (editSanctuariesBtn) {
    editSanctuariesBtn.addEventListener('click', () => {
      if (!currentSelectedId) return;
      const overlay = document.createElement('div');
      overlay.className = 'popup-overlay';
      const popup = document.createElement('div');
      popup.className = 'popup';
      const list = document.createElement('div');

      function addRow(data = { id: null, religion_id: '', active: 0 }) {
        const row = document.createElement('div');
        row.className = 'cost-row';
        const sel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        sel.appendChild(blank);
        Object.values(religionMap).forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = r.name;
          sel.appendChild(opt);
        });
        sel.value = data.religion_id || '';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = !!data.active;

        sel.addEventListener('change', () => {
          const rid = parseInt(sel.value, 10);
          if (!rid) return;
          if (data.id) {
            fetch(`${API_BASE}/api/sanctuaries/${data.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ barony_id: currentSelectedId, religion_id: rid, active: data.active ? 1 : 0 })
            }).then(() => {
              data.religion_id = rid;
              if (filterManager && filterSelect && filterSelect.value === 'sanctuary') filterManager.applyFilter('sanctuary');
            });
          } else {
            fetch(`${API_BASE}/api/sanctuaries`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ barony_id: currentSelectedId, religion_id: rid, active: data.active ? 1 : 0 })
            }).then(r => r.json()).then(res => {
              data.id = res.id;
              data.religion_id = rid;
              if (!sanctuaryMap[currentSelectedId]) sanctuaryMap[currentSelectedId] = [];
              sanctuaryMap[currentSelectedId].push(data);
              if (filterManager && filterSelect && filterSelect.value === 'sanctuary') filterManager.applyFilter('sanctuary');
            });
          }
        });

        chk.addEventListener('change', () => {
          data.active = chk.checked ? 1 : 0;
          if (!data.id) return;
          fetch(`${API_BASE}/api/sanctuaries/${data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barony_id: currentSelectedId, religion_id: data.religion_id, active: data.active })
          }).then(() => {
            if (filterManager && filterSelect && filterSelect.value === 'sanctuary') filterManager.applyFilter('sanctuary');
          });
        });

        const delBtn = document.createElement('button');
        delBtn.textContent = '-';
        delBtn.addEventListener('click', () => {
          if (data.id) {
            fetch(`${API_BASE}/api/sanctuaries/${data.id}`, { method: 'DELETE' });
          }
          sanctuaryMap[currentSelectedId] = (sanctuaryMap[currentSelectedId] || []).filter(s => s !== data && s.id !== data.id);
          row.remove();
          if (filterManager && filterSelect && filterSelect.value === 'sanctuary') filterManager.applyFilter('sanctuary');
        });

        row.appendChild(sel);
        row.appendChild(chk);
        row.appendChild(delBtn);
        list.appendChild(row);
      }

      (sanctuaryMap[currentSelectedId] || []).forEach(s => addRow({ ...s }));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () => addRow());
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Fermer';
      closeBtn.addEventListener('click', () => overlay.remove());
      popup.appendChild(list);
      popup.appendChild(addBtn);
      popup.appendChild(closeBtn);
      overlay.appendChild(popup);
      document.body.appendChild(overlay);
    });
  }

  if (editCanonicalBtn) {
    editCanonicalBtn.addEventListener('click', () => {
      if (!currentSelectedId) return;
      const overlay = document.createElement('div');
      overlay.className = 'popup-overlay';
      const popup = document.createElement('div');
      popup.className = 'popup';
      const list = document.createElement('div');

      function addRow(val = '') {
        const row = document.createElement('div');
        row.className = 'cost-row';
        const sel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        sel.appendChild(blank);
        Object.values(baronyMeta).forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.id;
          opt.textContent = `${b.id} - ${b.name}`;
          sel.appendChild(opt);
        });
        sel.value = val;
        row.dataset.canonicalId = val;
    sel.addEventListener('change', () => {
      const newId = parseInt(sel.value, 10);
      const canonicalKeyId = canonicalKey(currentSelectedId);
      const oldId = parseInt(row.dataset.canonicalId || '0', 10);
      if (oldId) {
        fetch(`${API_BASE}/api/canonical_lands?barony_id=${oldId}&canonical_barony_id=${currentSelectedId}`, { method: 'DELETE' });
        if (canonicalDependents[canonicalKeyId]) canonicalDependents[canonicalKeyId] = canonicalDependents[canonicalKeyId].filter(id => id !== oldId);
        if (canonicalLandMap[canonicalKey(oldId)]) canonicalLandMap[canonicalKey(oldId)] = canonicalLandMap[canonicalKey(oldId)].filter(id => id !== currentSelectedId);
      }
      if (newId) {
        fetch(`${API_BASE}/api/canonical_lands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barony_id: newId, canonical_barony_id: currentSelectedId })
        });
        if (!canonicalDependents[canonicalKeyId]) canonicalDependents[canonicalKeyId] = [];
        canonicalDependents[canonicalKeyId].push(newId);
        if (!canonicalLandMap[canonicalKey(newId)]) canonicalLandMap[canonicalKey(newId)] = [];
        canonicalLandMap[canonicalKey(newId)].push(currentSelectedId);
      }
      row.dataset.canonicalId = newId;
      if (filterManager && filterSelect && filterSelect.value === 'canonical') filterManager.applyFilter('canonical');
    });

        const delBtn = document.createElement('button');
        delBtn.textContent = '-';
    delBtn.addEventListener('click', () => {
      const canonicalKeyId = canonicalKey(currentSelectedId);
      const oldId = parseInt(row.dataset.canonicalId || '0', 10);
      if (oldId) {
        fetch(`${API_BASE}/api/canonical_lands?barony_id=${oldId}&canonical_barony_id=${currentSelectedId}`, { method: 'DELETE' });
        if (canonicalDependents[canonicalKeyId]) canonicalDependents[canonicalKeyId] = canonicalDependents[canonicalKeyId].filter(id => id !== oldId);
        if (canonicalLandMap[canonicalKey(oldId)]) canonicalLandMap[canonicalKey(oldId)] = canonicalLandMap[canonicalKey(oldId)].filter(id => id !== currentSelectedId);
      }
      row.remove();
      if (filterManager && filterSelect && filterSelect.value === 'canonical') filterManager.applyFilter('canonical');
    });

        row.appendChild(sel);
        row.appendChild(delBtn);
        list.appendChild(row);
      }

      (canonicalDependents[canonicalKey(currentSelectedId)] || []).forEach(id => addRow(id));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () => addRow());
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Fermer';
      closeBtn.addEventListener('click', () => overlay.remove());
      popup.appendChild(list);
      popup.appendChild(addBtn);
      popup.appendChild(closeBtn);
      overlay.appendChild(popup);
      document.body.appendChild(overlay);
    });
  }

  if (editSeaBaroniesBtn) {
    editSeaBaroniesBtn.addEventListener('click', () => {
      if (!currentSeaZoneId) return;
      baronyLinkMode = !baronyLinkMode;
      if (baronyLinkMode) {
        previousFilter = filterSelect ? filterSelect.value : '';
        core.setPixelData(baronyPixelData);
        const greyMap = {};
        Object.keys(baronyPixelData).forEach(id => { greyMap[id] = [150, 150, 150, 60]; });
        core.setColorMap(greyMap);
        core.selectBarony(null);
      } else {
        core.setPixelData(seaPixelData);
        if (filterManager && filterSelect) {
          filterManager.applyFilter(filterSelect.value);
        } else {
          core.drawAll();
        }
      }
      core.drawAll();
    });
  }

  function handleSelect(id) {
    if (pendingAction && pendingLinkId && id && id !== pendingLinkId) {
      const sourceId = pendingLinkId;
      const targetId = id;
      const method = pendingAction === 'link' ? 'POST' : 'DELETE';
      const connectionEndpoint = mapMode === 'sea' ? '/api/maritime_zone_connections' : '/api/barony_connections';
      const body = mapMode === 'sea'
        ? { zone_id_1: sourceId, zone_id_2: targetId }
        : { barony_id_1: sourceId, barony_id_2: targetId };
      fetch(`${API_BASE}${connectionEndpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(() => {
        if (pendingAction === 'link') {
          if (!baronyAdjacency[sourceId]) baronyAdjacency[sourceId] = [];
          if (!baronyAdjacency[targetId]) baronyAdjacency[targetId] = [];
          if (!baronyAdjacency[sourceId].includes(targetId)) baronyAdjacency[sourceId].push(targetId);
          if (!baronyAdjacency[targetId].includes(sourceId)) baronyAdjacency[targetId].push(sourceId);
        } else {
          if (baronyAdjacency[sourceId]) baronyAdjacency[sourceId] = baronyAdjacency[sourceId].filter(b => b !== targetId);
          if (baronyAdjacency[targetId]) baronyAdjacency[targetId] = baronyAdjacency[targetId].filter(b => b !== sourceId);
        }
      });
      pendingLinkId = null;
      pendingAction = null;
      core.selectBarony(sourceId);
      return;
    }

    if (mapMode === 'sea') {
      if (baronyLinkMode) {
        if (!id || !currentSeaZoneId) return;
        const list = maritimeZoneBaronies[currentSeaZoneId] || [];
        const idx = list.indexOf(id);
        const method = idx >= 0 ? 'DELETE' : 'POST';
        fetch(`${API_BASE}/api/maritime_zone_baronies`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zone_id: currentSeaZoneId, barony_id: id })
        }).then(() => {
          if (idx >= 0) list.splice(idx, 1); else list.push(id);
          maritimeZoneBaronies[currentSeaZoneId] = list;
          core.drawAll();
        });
        core.selectBarony(null);
        return;
      }
      currentSelectedId = id;
      currentSeaZoneId = id;
      if (!id) {
        if (seaInfoPanel) seaInfoPanel.style.display = 'none';
        core.drawAll();
        return;
      }
      if (seaInfoPanel) seaInfoPanel.style.display = 'block';
      if (infoPanel) infoPanel.style.display = 'none';
      if (seaEditIdInput) seaEditIdInput.value = id;
      if (seaEditNameInput) seaEditNameInput.value = baronyMeta[id]?.name || '';
      if (seaEditSeigneurSelect) seaEditSeigneurSelect.value = baronyMeta[id]?.seigneur_id || '';
      if (filterManager && filterSelect && (filterSelect.value === 'distance' || filterSelect.value === 'baronies')) {
        filterManager.applyFilter(filterSelect.value);
      }
      core.drawAll();
      return;
    }
    currentSelectedId = id;

    if (!id) {
      if (infoPanel) infoPanel.style.display = 'none';
      return;
    }
    if (infoPanel) infoPanel.style.display = 'block';
    if (editIdInput) editIdInput.value = id;
    if (editNameInput) editNameInput.value = baronyMeta[id]?.name || '';
    if (editReligionPopSelect) editReligionPopSelect.value = baronyMeta[id]?.religion_pop_id || '';
    if (editPrioryReligionSelect) editPrioryReligionSelect.value = baronyMeta[id]?.priory_religion_id || '';
    if (editChurchReligionSelect) editChurchReligionSelect.value = baronyMeta[id]?.church_religion_id || '';
    if (editCathedralReligionSelect) editCathedralReligionSelect.value = baronyMeta[id]?.cathedral_religion_id || '';
    if (editSeigneurSelect) editSeigneurSelect.value = baronyMeta[id]?.seigneur_id || '';
    if (editVacantCheckbox) editVacantCheckbox.checked = !!baronyMeta[id]?.vacant;
    if (editCultureSelect) editCultureSelect.value = baronyMeta[id]?.culture_id || '';
    if (editViscountySelect) editViscountySelect.value = baronyMeta[id]?.viscounty_id || '';
    if (editCountySelect) editCountySelect.value = baronyMeta[id]?.county_id || '';

    if (filterManager && filterSelect && filterSelect.value === 'distance') {
      filterManager.applyFilter('distance');
    }
  }

  async function fetchData() {
    pixelData = mapMode === 'sea' ? await fetch(API_BASE + pixelEndpoint).then(r => r.json()) : {};
    const entities = await fetch(API_BASE + entityEndpoint).then(r => r.json());
    baronyMeta = {};
    entities.forEach(e => { baronyMeta[e.id] = e; });
    if (mapMode !== 'sea') {
      const [seigneurs, religions, cultures, counties, duchies, kingdoms, viscounties, marquisates, archduchies, empires, canonicalLands, sanctuaries, connections] = await Promise.all([
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
        fetch(API_BASE + '/api/canonical_lands').then(r => r.json()),
        fetch(API_BASE + '/api/sanctuaries').then(r => r.json()),
        fetch(API_BASE + '/api/barony_connections').then(r => r.json())
      ]);
      seigneurMap = {};
      seigneurs.forEach(s => { seigneurMap[s.id] = s; });
      populateSelect(editSeigneurSelect, seigneurMap, 'Aucun');
      religionMap = {};
      religions.forEach(r => { religionMap[r.id] = r; });
      populateReligionSelects();
      cultureMapInfo = {};
      cultures.forEach(c => { cultureMapInfo[c.id] = c; });
      populateSelect(editCultureSelect, cultureMapInfo, 'Aucune');
      countyMap = {};
      seigneurToCounty = {};
      counties.forEach(c => { countyMap[c.id] = c; if (c.seigneur_id) seigneurToCounty[c.seigneur_id] = c.id; });
      populateSelect(editCountySelect, countyMap, 'Aucun');
      duchyMap = {};
      seigneurToDuchy = {};
      duchies.forEach(d => { duchyMap[d.id] = d; if (d.seigneur_id) seigneurToDuchy[d.seigneur_id] = d.id; });
      kingdomMap = {};
      seigneurToKingdom = {};
      kingdoms.forEach(k => { kingdomMap[k.id] = k; if (k.seigneur_id) seigneurToKingdom[k.seigneur_id] = k.id; });
      viscountyMap = {};
      seigneurToViscounty = {};
      viscounties.forEach(v => { viscountyMap[v.id] = v; if (v.seigneur_id) seigneurToViscounty[v.seigneur_id] = v.id; });
      populateSelect(editViscountySelect, viscountyMap, 'Aucune');
      marquisateMap = {};
      seigneurToMarquisate = {};
      marquisates.forEach(m => { marquisateMap[m.id] = m; if (m.seigneur_id) seigneurToMarquisate[m.seigneur_id] = m.id; });
      archduchyMap = {};
      seigneurToArchduchy = {};
      archduchies.forEach(a => { archduchyMap[a.id] = a; if (a.seigneur_id) seigneurToArchduchy[a.seigneur_id] = a.id; });
      empireMap = {};
      seigneurToEmpire = {};
      empires.forEach(e => { empireMap[e.id] = e; if (e.seigneur_id) seigneurToEmpire[e.seigneur_id] = e.id; });
      canonicalLandMap = {};
      canonicalDependents = {};
      canonicalLands.forEach(cl => {
        const baronyKey = canonicalKey(cl.barony_id);
        const canonicalKeyId = canonicalKey(cl.canonical_barony_id);
        if (!canonicalLandMap[baronyKey]) canonicalLandMap[baronyKey] = [];
        canonicalLandMap[baronyKey].push(cl.canonical_barony_id);
        if (!canonicalDependents[canonicalKeyId]) canonicalDependents[canonicalKeyId] = [];
        canonicalDependents[canonicalKeyId].push(cl.barony_id);
      });
      sanctuaryMap = {};
      sanctuaries.forEach(s => {
        if (!sanctuaryMap[s.barony_id]) sanctuaryMap[s.barony_id] = [];
        sanctuaryMap[s.barony_id].push({ id: s.id, religion_id: s.religion_id, active: !!s.active });
      });
      baronyAdjacency = {};
      connections.forEach(c => {
        if (!baronyAdjacency[c.barony_id_1]) baronyAdjacency[c.barony_id_1] = [];
        if (!baronyAdjacency[c.barony_id_2]) baronyAdjacency[c.barony_id_2] = [];
        baronyAdjacency[c.barony_id_1].push(c.barony_id_2);
        baronyAdjacency[c.barony_id_2].push(c.barony_id_1);
      });
      const baronyIds = entities.map(e => e.id);
      baronyPixelData = pixelData;
      fetchBaronyPixelsInChunks(baronyIds, pixelData, true).catch(err => console.error(err));
    } else {
      const [seigneurs, connections, zoneBaronies] = await Promise.all([
        fetch(API_BASE + '/api/seigneurs').then(r => r.json()),
        fetch(API_BASE + '/api/maritime_zone_connections').then(r => r.json()),
        fetch(API_BASE + '/api/maritime_zone_baronies').then(r => r.json())
      ]);
      seigneurMap = {};
      seigneurs.forEach(s => { seigneurMap[s.id] = s; });
      populateSelect(seaEditSeigneurSelect, seigneurMap, 'Aucun');
      baronyAdjacency = {};
      connections.forEach(c => {
        if (!baronyAdjacency[c.zone_id_1]) baronyAdjacency[c.zone_id_1] = [];
        if (!baronyAdjacency[c.zone_id_2]) baronyAdjacency[c.zone_id_2] = [];
        baronyAdjacency[c.zone_id_1].push(c.zone_id_2);
        baronyAdjacency[c.zone_id_2].push(c.zone_id_1);
      });
      seaPixelData = pixelData;
      const baronyIds = [...new Set(zoneBaronies.map(zb => zb.barony_id))];
      baronyPixelData = {};
      fetchBaronyPixelsInChunks(baronyIds, baronyPixelData, false).catch(err => console.error(err));
      maritimeZoneBaronies = {};
      zoneBaronies.forEach(zb => {
        if (!maritimeZoneBaronies[zb.zone_id]) maritimeZoneBaronies[zb.zone_id] = [];
        maritimeZoneBaronies[zb.zone_id].push(zb.barony_id);
      });
    }
    mapData = {
      pixelData,
      baronyMeta,
      seigneurMap,
      religionMap,
      cultureMapInfo,
      countyMap,
      duchyMap,
      kingdomMap,
      viscountyMap,
      marquisateMap,
      archduchyMap,
      empireMap,
      canonicalLandMap,
      canonicalDependents,
      sanctuaryMap,
      baronyAdjacency,
      baronyPixels: baronyPixelData,
      maritimeZoneBaronies,
      seigneurToCounty,
      seigneurToDuchy,
      seigneurToKingdom,
      seigneurToViscounty,
      seigneurToMarquisate,
      seigneurToArchduchy,
      seigneurToEmpire,
      mapWidth,
      mapHeight,
      mapMode
    };
    return mapData;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const baseMapLoaded = baseMap.complete ? Promise.resolve() : new Promise(res => (baseMap.onload = res));
    baseMapLoaded.then(() => {
      mapWidth = baseMap.naturalWidth;
      mapHeight = baseMap.naturalHeight;
      baseMap.style.width = mapWidth + 'px';
      baseMap.style.height = mapHeight + 'px';
      pixelCanvas.width = mapWidth;
      pixelCanvas.height = mapHeight;
      pixelCanvas.style.width = mapWidth + 'px';
      pixelCanvas.style.height = mapHeight + 'px';
      core = mapCore.init({
        canvas: pixelCanvas,
        fetchData,
        onSelect: handleSelect,
        drawOverlay,
        mapMode
      });
      core.ready.then(() => {
        filterManager = mapFilters.init(core, mapData, { updateLegend });
        if (filterSelect) {
          filterSelect.addEventListener('change', () => filterManager.applyFilter(filterSelect.value));
          filterManager.applyFilter(filterSelect.value);
        }
        if (randomBtn) randomBtn.addEventListener('click', () => filterManager.randomizeColors());
      });
    });
  });

  // Basic editing: updating name/id
  function updateEntity() {
    if (!currentSelectedId) return;
    const idInput = mapMode === 'sea' ? seaEditIdInput : editIdInput;
    const nameInput = mapMode === 'sea' ? seaEditNameInput : editNameInput;
    const newId = idInput ? idInput.value.trim() : currentSelectedId;
    const newName = nameInput ? nameInput.value.trim() : '';
    const payload = { ...baronyMeta[currentSelectedId], id: newId, name: newName };
    fetch(`${API_BASE}${entityEndpoint}/${currentSelectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(() => {
      baronyMeta[newId] = { ...baronyMeta[currentSelectedId], id: newId, name: newName };
      if (newId !== currentSelectedId) {
        if (core.colorMap[currentSelectedId]) {
          core.colorMap[newId] = core.colorMap[currentSelectedId];
          delete core.colorMap[currentSelectedId];
        }
        if (pixelData[currentSelectedId]) {
          pixelData[newId] = pixelData[currentSelectedId];
          delete pixelData[currentSelectedId];
        }
        if (mapMode === 'sea') {
          if (maritimeZoneBaronies[currentSelectedId]) {
            maritimeZoneBaronies[newId] = maritimeZoneBaronies[currentSelectedId];
            delete maritimeZoneBaronies[currentSelectedId];
          }
        }
        if (canonicalLandMap[canonicalKey(currentSelectedId)]) {
          canonicalLandMap[canonicalKey(newId)] = canonicalLandMap[canonicalKey(currentSelectedId)];
          delete canonicalLandMap[canonicalKey(currentSelectedId)];
        }
        Object.keys(canonicalLandMap).forEach(k => {
          canonicalLandMap[k] = canonicalLandMap[k].map(val => (val === currentSelectedId ? newId : val));
        });
        if (canonicalDependents[canonicalKey(currentSelectedId)]) {
          canonicalDependents[canonicalKey(newId)] = canonicalDependents[canonicalKey(currentSelectedId)];
          delete canonicalDependents[canonicalKey(currentSelectedId)];
        }
        Object.keys(canonicalDependents).forEach(k => {
          canonicalDependents[k] = canonicalDependents[k].map(val => (val === currentSelectedId ? newId : val));
        });
        Object.keys(baronyAdjacency).forEach(k => {
          const list = baronyAdjacency[k];
          const keyNum = parseInt(k, 10);
          if (keyNum === currentSelectedId) {
            baronyAdjacency[newId] = list.map(v => (v === currentSelectedId ? newId : v));
            delete baronyAdjacency[k];
          } else {
            baronyAdjacency[k] = list.map(v => (v === currentSelectedId ? newId : v));
          }
        });
      }
      core.selectBarony(newId);
    });
  }
  if (editIdInput) editIdInput.addEventListener('change', updateEntity);
  if (editNameInput) editNameInput.addEventListener('change', updateEntity);
  if (seaEditIdInput) seaEditIdInput.addEventListener('change', updateEntity);
  if (seaEditNameInput) seaEditNameInput.addEventListener('change', updateEntity);
})();
