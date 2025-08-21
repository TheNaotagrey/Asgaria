(() => {
  const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';
  const params = new URLSearchParams(location.search);
  const mapMode = params.get('mode') === 'sea' ? 'sea' : 'land';
  const pixelEndpoint = mapMode === 'sea' ? '/api/maritime_zone_pixels' : '/api/barony_pixels';
  const entityEndpoint = mapMode === 'sea' ? '/api/maritime_zones' : '/api/baronies';

  let mapWidth = 0;
  let mapHeight = 0;

  let pixelData = {};
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
  let sanctuaryMap = {};
  let baronyAdjacency = {};
  let mapData = {};

  let filterManager = null;

  const baseMap = document.getElementById('baseMap');
  if (mapMode === 'sea' && baseMap) baseMap.src = 'zones_maritimes.png';
  const pixelCanvas = document.getElementById('pixelCanvas');
  const filterSelect = document.getElementById('filterSelect');
  const randomBtn = document.getElementById('randomBtn');
  const legendDiv = document.getElementById('legend');

  const linkBtn = document.getElementById('linkBarony');
  const unlinkBtn = document.getElementById('unlinkBarony');

  const infoPanel = document.getElementById('infoPanel');
  const editIdInput = document.getElementById('editId');
  const editNameInput = document.getElementById('editName');
  const editReligionPopSelect = document.getElementById('editReligionPop');
  const editSanctuariesBtn = document.getElementById('editSanctuaries');
  const editCanonicalBtn = document.getElementById('editCanonical');
  const editPrioryReligionSelect = document.getElementById('editPrioryReligion');
  const editChurchReligionSelect = document.getElementById('editChurchReligion');
  const editCathedralReligionSelect = document.getElementById('editCathedralReligion');
  const editSeigneurSelect = document.getElementById('editSeigneur');
  const editCultureSelect = document.getElementById('editCulture');
  const editViscountySelect = document.getElementById('editViscounty');
  const editCountySelect = document.getElementById('editCounty');
  const editPlayerCheckbox = document.getElementById('editPlayer');
  const editBishopCheckbox = document.getElementById('editBishop');

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
  if (editPlayerCheckbox) {
    editPlayerCheckbox.addEventListener('change', () => {
      saveBaronyFields({ player: editPlayerCheckbox.checked ? 1 : 0 });
    });
  }
  if (editBishopCheckbox) {
    editBishopCheckbox.addEventListener('change', () => {
      saveBaronyFields({ bishop: editBishopCheckbox.checked ? 1 : 0 });
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
          const oldId = parseInt(row.dataset.canonicalId || '0', 10);
          if (oldId) {
            fetch(`${API_BASE}/api/canonical_lands?barony_id=${currentSelectedId}&canonical_barony_id=${oldId}`, { method: 'DELETE' });
            if (canonicalLandMap[currentSelectedId]) canonicalLandMap[currentSelectedId] = canonicalLandMap[currentSelectedId].filter(id => id !== oldId);
          }
          if (newId) {
            fetch(`${API_BASE}/api/canonical_lands`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ barony_id: currentSelectedId, canonical_barony_id: newId })
            });
            if (!canonicalLandMap[currentSelectedId]) canonicalLandMap[currentSelectedId] = [];
            canonicalLandMap[currentSelectedId].push(newId);
          }
          row.dataset.canonicalId = newId;
          if (filterManager && filterSelect && filterSelect.value === 'canonical') filterManager.applyFilter('canonical');
        });

        const delBtn = document.createElement('button');
        delBtn.textContent = '-';
        delBtn.addEventListener('click', () => {
          const oldId = parseInt(row.dataset.canonicalId || '0', 10);
          if (oldId) {
            fetch(`${API_BASE}/api/canonical_lands?barony_id=${currentSelectedId}&canonical_barony_id=${oldId}`, { method: 'DELETE' });
            if (canonicalLandMap[currentSelectedId]) canonicalLandMap[currentSelectedId] = canonicalLandMap[currentSelectedId].filter(id => id !== oldId);
          }
          row.remove();
          if (filterManager && filterSelect && filterSelect.value === 'canonical') filterManager.applyFilter('canonical');
        });

        row.appendChild(sel);
        row.appendChild(delBtn);
        list.appendChild(row);
      }

      (canonicalLandMap[currentSelectedId] || []).forEach(id => addRow(id));
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

  function handleSelect(id) {
    if (pendingAction && pendingLinkId && id && id !== pendingLinkId) {
      const sourceId = pendingLinkId;
      const targetId = id;
      const method = pendingAction === 'link' ? 'POST' : 'DELETE';
      fetch(`${API_BASE}/api/barony_connections`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barony_id_1: sourceId, barony_id_2: targetId })
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
    if (editCultureSelect) editCultureSelect.value = baronyMeta[id]?.culture_id || '';
    if (editViscountySelect) editViscountySelect.value = baronyMeta[id]?.viscounty_id || '';
    if (editCountySelect) editCountySelect.value = baronyMeta[id]?.county_id || '';
    if (editPlayerCheckbox) editPlayerCheckbox.checked = !!baronyMeta[id]?.player;
    if (editBishopCheckbox) editBishopCheckbox.checked = !!baronyMeta[id]?.bishop;

    if (filterManager && filterSelect && filterSelect.value) {
      filterManager.applyFilter(filterSelect.value);
    }
  }

  async function fetchData() {
    pixelData = await fetch(API_BASE + pixelEndpoint).then(r => r.json());
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
        canonicalLands.forEach(cl => {
          if (!canonicalLandMap[cl.barony_id]) canonicalLandMap[cl.barony_id] = [];
          canonicalLandMap[cl.barony_id].push(cl.canonical_barony_id);
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
      sanctuaryMap,
      baronyAdjacency,
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
        drawOverlay: () => {},
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
  const saveBtn = document.getElementById('saveBarony');
  function updateBarony() {
    if (!currentSelectedId) return;
    const newId = editIdInput.value.trim();
    const newName = editNameInput.value.trim();
    fetch(`${API_BASE}${entityEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentSelectedId, newId, name: newName })
    }).then(() => {
      baronyMeta[newId] = { id: newId, name: newName };
      if (newId !== currentSelectedId) {
        core.colorMap[newId] = core.colorMap[currentSelectedId];
        delete core.colorMap[currentSelectedId];
        delete pixelData[currentSelectedId];
      }
      core.selectBarony(newId);
    });
  }
  if (saveBtn) saveBtn.addEventListener('click', updateBarony);
})();
