const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';

async function fetchJSON(url, options){
  const resp = await fetch(API_BASE + url, options);
  return resp.json();
}

function renderTable(container, rows, opts){
  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'admin-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  let sortCol = 'id';
  let sortDir = 'asc';

  const headers = [{label:'ID', key:'id'}].concat(opts.fields.map(f=>({label:f, key:f})));
  headers.forEach(h=>{
    const th = document.createElement('th');
    th.textContent = h.label;
    th.style.cursor = 'pointer';
    th.addEventListener('click', ()=>{
      if(sortCol === h.key){
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      }else{
        sortCol = h.key;
        sortDir = 'asc';
      }
      renderBody();
    });
    headRow.appendChild(th);
  });
  headRow.appendChild(document.createElement('th'));
  thead.appendChild(headRow);
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

  const makeInput = (val, field)=>{
    if(opts.selects && opts.selects[field]){
      const select = document.createElement('select');
      const optList = opts.selects[field];
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
        td.appendChild(makeInput(item[f], f));
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
      const inp = makeInput('', f);
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
      loadAll();
    });
    addTd.appendChild(addBtn);
    addRow.appendChild(addTd);
    tbody.appendChild(addRow);
  };

  table.appendChild(tbody);
  container.appendChild(table);
  renderBody();
}

async function loadAll(){
  const [seigneurs, religions, cultures, kingdoms, counties, duchies] = await Promise.all([
    fetchJSON('/api/seigneurs'),
    fetchJSON('/api/religions'),
    fetchJSON('/api/cultures'),
    fetchJSON('/api/kingdoms'),
    fetchJSON('/api/counties'),
    fetchJSON('/api/duchies'),
  ]);

  const seigneursSelect = seigneurs.slice().sort((a, b) => a.name.localeCompare(b.name));
  const religionsSelect = religions.slice().sort((a, b) => a.name.localeCompare(b.name));
  const culturesSelect = cultures.slice().sort((a, b) => a.name.localeCompare(b.name));
  const kingdomsSelect = kingdoms.slice().sort((a, b) => a.name.localeCompare(b.name));
  const countiesSelect = counties.slice().sort((a, b) => a.name.localeCompare(b.name));
  const duchiesSelect = duchies.slice().sort((a, b) => a.name.localeCompare(b.name));

  const seigneursById = seigneurs.slice().sort((a,b)=>a.id - b.id);
  const religionsById = religions.slice().sort((a,b)=>a.id - b.id);
  const culturesById = cultures.slice().sort((a,b)=>a.id - b.id);
  const kingdomsById = kingdoms.slice().sort((a,b)=>a.id - b.id);
  const countiesById = counties.slice().sort((a,b)=>a.id - b.id);
  const duchiesById = duchies.slice().sort((a,b)=>a.id - b.id);

  renderTable(document.getElementById('tableReligions'), religionsById, {
    endpoint:'religions',
    fields:['name']
  });

  renderTable(document.getElementById('tableCultures'), culturesById, {
    endpoint:'cultures',
    fields:['name']
  });

  renderTable(document.getElementById('tableKingdoms'), kingdomsById, {
    endpoint:'kingdoms',
    fields:['name']
  });

  renderTable(document.getElementById('tableCounties'), countiesById, {
    endpoint:'counties',
    fields:['name','duchy_id'],
    selects:{duchy_id:duchiesSelect}
  });

  renderTable(document.getElementById('tableDuchies'), duchiesById, {
    endpoint:'duchies',
    fields:['name','kingdom_id'],
    selects:{kingdom_id:kingdomsSelect}
  });

  renderTable(document.getElementById('tableSeigneurs'), seigneursById, {
    endpoint:'seigneurs',
    fields:['name','religion_id','overlord_id'],
    selects:{religion_id:religionsSelect, overlord_id:seigneursSelect}
  });
}

loadAll();
