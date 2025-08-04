const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';

async function fetchJSON(url, options){
  const resp = await fetch(API_BASE + url, options);
  return resp.json();
}

function showSaveIndicator() {
  const el = document.getElementById('saveIndicator');
  if (!el) return;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 2000);
}

function renderTable(container, rows, opts){
  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'admin-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  let sortCol = 'id';
  let sortDir = 'asc';

  const headers = [{label:'ID', key:'id'}].concat(
    opts.fields.map(f => ({
      label: opts.labels && opts.labels[f] ? opts.labels[f] : f,
      key: f
    }))
  );
  headers.forEach(h=>{
    const th = document.createElement('th');
    th.dataset.key = h.key;
    th.classList.add('sortable');
    th.addEventListener('click', ()=>{
      if(sortCol === h.key){
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      }else{
        sortCol = h.key;
        sortDir = 'asc';
      }
      updateHeaders();
      renderBody();
    });
    headRow.appendChild(th);
  });
  headRow.appendChild(document.createElement('th'));
  thead.appendChild(headRow);
  const updateHeaders = () => {
    Array.from(headRow.children).forEach(th => {
      const key = th.dataset.key;
      if(!key) return;
      const base = headers.find(h => h.key === key).label;
      let arrow = ' \u21C5';
      if(sortCol === key) arrow = sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
      th.textContent = base + arrow;
    });
  };
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  const compareRows = (a,b)=>{
    let x = a[sortCol];
    let y = b[sortCol];
    if(x === null || x === undefined) x = '';
    if(y === null || y === undefined) y = '';
    if(typeof x === 'string' && typeof y === 'string'){
      const cmp = x.localeCompare(y);
      return sortDir === 'asc' ? cmp : -cmp;
    }
    if(x < y) return sortDir === 'asc' ? -1 : 1;
    if(x > y) return sortDir === 'asc' ? 1 : -1;
    return 0;
  };

  const makeInput = (val, field, item)=>{
    if(opts.selects && opts.selects[field]){
      const select = document.createElement('select');
      let optList = opts.selects[field];
      if (typeof optList === 'function') optList = optList(item);
      const blank = document.createElement('option');
      blank.value = '';
      if (opts.nullLabels && opts.nullLabels[field]) {
        blank.textContent = opts.nullLabels[field];
      } else {
        blank.textContent = '';
      }
      select.appendChild(blank);
      optList.forEach(o=>{
        const op = document.createElement('option');
        op.value = o.id;
        op.textContent = o.name;
        if(String(o.id) === String(val)) op.selected = true;
        select.appendChild(op);
      });
      return select;
    }
    if(opts.colorFields && opts.colorFields.includes(field)){
      const input = document.createElement('input');
      input.type = 'color';
      input.value = val || '#000000';
      return input;
    }
    const input = document.createElement('input');
    input.value = val ?? '';
    return input;
  };

  const renderBody = ()=>{
    tbody.innerHTML = '';

    rows.slice().sort(compareRows).forEach(item=>{
      const tr = document.createElement('tr');
      let td = document.createElement('td');
      td.textContent = item.id;
      tr.appendChild(td);
      opts.fields.forEach(f=>{
        td = document.createElement('td');
        td.appendChild(makeInput(item[f], f, item));
        tr.appendChild(td);
      });
      td = document.createElement('td');
      const btn = document.createElement('button');
      btn.textContent = 'Enregistrer';
      btn.addEventListener('click', async ()=>{
        const payload = {};
        opts.fields.forEach((f,i)=>{
          const el = tr.children[i+1].firstChild;
          if(opts.selects && opts.selects[f]){
            payload[f] = el.value ? parseInt(el.value,10) : null;
          } else {
            payload[f] = el.value.trim();
          }
        });
        await fetchJSON(`/api/${opts.endpoint}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        showSaveIndicator();
        loadAll();
      });
      td.appendChild(btn);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });

    const addRow = document.createElement('tr');
    addRow.appendChild(document.createElement('td'));
    const addInputs = {};
    opts.fields.forEach(f=>{
      const td = document.createElement('td');
      const inp = makeInput('', f, null);
      addInputs[f]=inp;
      td.appendChild(inp);
      addRow.appendChild(td);
    });
    const addTd = document.createElement('td');
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Ajouter';
    addBtn.addEventListener('click', async ()=>{
      const payload = {};
      opts.fields.forEach(f=>{
        const el = addInputs[f];
        if(opts.selects && opts.selects[f]){
          payload[f] = el.value ? parseInt(el.value,10) : null;
        } else {
          payload[f] = el.value.trim();
        }
      });
      await fetchJSON(`/api/${opts.endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      showSaveIndicator();
      loadAll();
    });
    addTd.appendChild(addBtn);
    addRow.appendChild(addTd);
    tbody.appendChild(addRow);
  };

  table.appendChild(tbody);
  container.appendChild(table);
  updateHeaders();
  renderBody();
}

async function loadAll(){
  const [seigneurs, religions, cultures, kingdoms, counties, duchies, viscounties, marquisates, archduchies, empires, users] = await Promise.all([
    fetchJSON('/api/seigneurs'),
    fetchJSON('/api/religions'),
    fetchJSON('/api/cultures'),
    fetchJSON('/api/kingdoms'),
    fetchJSON('/api/counties'),
    fetchJSON('/api/duchies'),
    fetchJSON('/api/viscounties'),
    fetchJSON('/api/marquisates'),
    fetchJSON('/api/archduchies'),
    fetchJSON('/api/empires'),
    fetchJSON('/api/users'),
  ]);

  const seigneursSelect = seigneurs.slice().sort((a, b) => a.name.localeCompare(b.name));
  const religionsSelect = religions.slice().sort((a, b) => a.name.localeCompare(b.name));
  const culturesSelect = cultures.slice().sort((a, b) => a.name.localeCompare(b.name));
  const kingdomsSelect = kingdoms.slice().sort((a, b) => a.name.localeCompare(b.name));
  const countiesSelect = counties.slice().sort((a, b) => a.name.localeCompare(b.name));
  const duchiesSelect = duchies.slice().sort((a, b) => a.name.localeCompare(b.name));
  const viscountiesSelect = viscounties.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const marquisatesSelect = marquisates.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const archduchiesSelect = archduchies.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const empiresSelect = empires.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const usersSelectRaw = users.slice().sort((a,b)=> (a.email || '').localeCompare(b.email || ''));
  const usersSelect = usersSelectRaw.map(u => ({ id: u.id, name: u.email }));
  const assignedUserIds = new Set(seigneurs.filter(s => s.user_id).map(s => s.user_id));
  const userSelectFn = (item) => usersSelect.filter(u => !assignedUserIds.has(u.id) || (item && u.id === item.user_id));

  const seigneursById = seigneurs.slice().sort((a,b)=>a.id - b.id);
  const religionsById = religions.slice().sort((a,b)=>a.id - b.id);
  const culturesById = cultures.slice().sort((a,b)=>a.id - b.id);
  const kingdomsById = kingdoms.slice().sort((a,b)=>a.id - b.id);
  const countiesById = counties.slice().sort((a,b)=>a.id - b.id);
  const duchiesById = duchies.slice().sort((a,b)=>a.id - b.id);
  const viscountiesById = viscounties.slice().sort((a,b)=>a.id - b.id);
  const marquisatesById = marquisates.slice().sort((a,b)=>a.id - b.id);
  const archduchiesById = archduchies.slice().sort((a,b)=>a.id - b.id);
  const empiresById = empires.slice().sort((a,b)=>a.id - b.id);

  renderTable(document.getElementById('tableReligions'), religionsById, {
    endpoint:'religions',
    fields:['name','color'],
    labels:{name:'Nom', color:'Couleur'},
    colorFields:['color']
  });

  renderTable(document.getElementById('tableCultures'), culturesById, {
    endpoint:'cultures',
    fields:['name','color'],
    labels:{name:'Nom', color:'Couleur'},
    colorFields:['color']
  });

  renderTable(document.getElementById('tableEmpires'), empiresById, {
    endpoint:'empires',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Seigneur'}
  });

  renderTable(document.getElementById('tableKingdoms'), kingdomsById, {
    endpoint:'kingdoms',
    fields:['name','empire_id'],
    selects:{empire_id:empiresSelect},
    labels:{name:'Nom', empire_id:'Empire'}
  });

  renderTable(document.getElementById('tableArchduchies'), archduchiesById, {
    endpoint:'archduchies',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Seigneur'}
  });

  renderTable(document.getElementById('tableDuchies'), duchiesById, {
    endpoint:'duchies',
    fields:['name','kingdom_id','archduchy_id'],
    selects:{kingdom_id:kingdomsSelect, archduchy_id:archduchiesSelect},
    labels:{name:'Nom', kingdom_id:'Royaume', archduchy_id:'Archiduché'}
  });

  renderTable(document.getElementById('tableMarquisates'), marquisatesById, {
    endpoint:'marquisates',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Seigneur'}
  });

  renderTable(document.getElementById('tableCounties'), countiesById, {
    endpoint:'counties',
    fields:['name','duchy_id','marquisate_id'],
    selects:{duchy_id:duchiesSelect, marquisate_id:marquisatesSelect},
    labels:{name:'Nom', duchy_id:'Duché', marquisate_id:'Marquisat'}
  });

  renderTable(document.getElementById('tableViscounties'), viscountiesById, {
    endpoint:'viscounties',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Seigneur'}
  });

  renderTable(document.getElementById('tableSeigneurs'), seigneursById, {
    endpoint:'seigneurs',
    fields:['name','user_id','religion_id','overlord_id'],
    selects:{user_id:userSelectFn, religion_id:religionsSelect, overlord_id:seigneursSelect},
    labels:{name:'Nom', user_id:'Utilisateur', religion_id:'Religion', overlord_id:'Suzerain'}
  });
}

loadAll();
