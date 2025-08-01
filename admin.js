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
  headRow.innerHTML = '<th>ID</th>' + opts.fields.map(f=>`<th>${f}</th>`).join('') + '<th></th>';
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

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

  rows.forEach(item=>{
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

  table.appendChild(tbody);
  container.appendChild(table);
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

  const seigneursSorted = seigneurs.slice().sort((a, b) => a.name.localeCompare(b.name));
  const religionsSorted = religions.slice().sort((a, b) => a.name.localeCompare(b.name));
  const culturesSorted = cultures.slice().sort((a, b) => a.name.localeCompare(b.name));
  const kingdomsSorted = kingdoms.slice().sort((a, b) => a.name.localeCompare(b.name));
  const countiesSorted = counties.slice().sort((a, b) => a.name.localeCompare(b.name));
  const duchiesSorted = duchies.slice().sort((a, b) => a.name.localeCompare(b.name));

  renderTable(document.getElementById('tableReligions'), religionsSorted, {
    endpoint:'religions',
    fields:['name']
  });

  renderTable(document.getElementById('tableCultures'), culturesSorted, {
    endpoint:'cultures',
    fields:['name']
  });

  renderTable(document.getElementById('tableKingdoms'), kingdomsSorted, {
    endpoint:'kingdoms',
    fields:['name']
  });

  renderTable(document.getElementById('tableCounties'), countiesSorted, {
    endpoint:'counties',
    fields:['name','duchy_id'],
    selects:{duchy_id:duchiesSorted}
  });

  renderTable(document.getElementById('tableDuchies'), duchiesSorted, {
    endpoint:'duchies',
    fields:['name','kingdom_id'],
    selects:{kingdom_id:kingdomsSorted}
  });

  renderTable(document.getElementById('tableSeigneurs'), seigneursSorted, {
    endpoint:'seigneurs',
    fields:['name','religion_id','overlord_id'],
    selects:{religion_id:religionsSorted, overlord_id:seigneursSorted}
  });
}

loadAll();
