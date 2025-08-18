const API_BASE = location.origin === 'null' ? 'http://localhost:3000' : '';

const basicResources = [
  ['or_', 'Or'], ['pierre', 'Pierre'], ['fer', 'Fer'], ['lingot_or', "Lingots d'or"],
  ['antidote', 'Antidotes'], ['armureries', 'Armureries'], ['rhum', 'Rhum'], ['grague', 'Grague'],
  ['vivres', 'Vivres'], ['architectes', 'Architectes'], ['charpentiers', 'Charpentiers'],
  ['maitres_oeuvre', "Maîtres d'œuvre"], ['maitre_espions', 'Maîtres espions'],
  ['points_magique', 'Points magiques'],
];

const luxuryResources = [
  ['fourrure', 'Fourrures'], ['ivoire', 'Ivoire'], ['soie', 'Soie'], ['huile', 'Huile'],
  ['teinture', 'Teintures'], ['epices', 'Épices'], ['sel', 'Sel'], ['perle', 'Perles'],
  ['encens', 'Encens'], ['vin', 'Vin'], ['pierre_precieuse', 'Pierres précieuses'],
];

const extraResources = [
  ['esclaves', 'Esclaves'], ['prestige', 'Prestige'], ['renommee', 'Renommée'],
];

const inventaireFields = [...basicResources, ...luxuryResources, ...extraResources].map(([k]) => k);
const inventaireLabels = Object.fromEntries([...basicResources, ...luxuryResources, ...extraResources]);

const yesNoSelect = [{id:1,name:'Oui'},{id:0,name:'Non'}];
const baronyPropBoolFields = ['water_access','sea_access','has_or','has_argent','has_fer','has_pierre','has_epices','has_perle','has_encens','has_huiles','has_pierre_precieuses','has_soie','has_sel','has_fourrure','has_teinture','has_ivoire','has_vin'];
const baronyPropIntFields = ['field_limit','fishing_limit','high_sea_boat_limit'];
const baronyPropFields = ['barony_id', ...baronyPropBoolFields, ...baronyPropIntFields, 'effects'];
const baronyPropLabels = {
  barony_id:'Baronnie',
  water_access:"Accès à l'eau",
  sea_access:'Accès à la mer',
  has_or:'Or',
  has_argent:'Argent',
  has_fer:'Fer',
  has_pierre:'Pierre',
  has_epices:'Épices',
  has_perle:'Perle',
  has_encens:'Encens',
  has_huiles:'Huiles',
  has_pierre_precieuses:'Pierres Précieuses',
  has_soie:'Soie',
  has_sel:'Sel',
  has_fourrure:'Fourrure',
  has_teinture:'Teinture',
  has_ivoire:'Ivoire',
  has_vin:'Vin',
  field_limit:'Limite de champs',
  fishing_limit:'Limite de Pêche',
  high_sea_boat_limit:'Limite de Bateau en haute mer',
  effects:'Effets'
};

const buildingPropFields = ['label','produces','production','costs','max','workers_per_building','absolute_restrictions','infra_restrictions','description'];
const buildingPropLabels = {
  label:'Nom',
  produces:'Ressource produite',
  production:'Production',
  costs:'Coûts',
  max:'Maximum',
  workers_per_building:'Travailleurs/bâtiment',
  absolute_restrictions:'Restrictions absolues',
  infra_restrictions:'Requis',
  description:'Description'
};
const infraPropFields = ['label','type','max','workers_per_building','effects','costs','absolute_restrictions','restrictions','description'];
const infraPropLabels = {
  label:'Nom',
  type:'Type',
  max:'Max',
  workers_per_building:'Gens',
  effects:'Effets',
  costs:'Coûts',
  absolute_restrictions:'Restrictions absolues',
  restrictions:'Requis',
  description:'Description',
};
const typeSelect = [{id:'civil',name:'Civil'},{id:'militaire',name:'Militaire'}];
const resourceSelect = [{ id: 'choice', name: 'Choix à la construction' }, ...Object.entries(inventaireLabels).map(([id, name]) => ({ id, name }))];
let buildingPropsSelect = [];
let infraPropsSelect = [];
const maxOptions = [
  ...Array.from({length:10}, (_,i)=>({ id:String(i+1), name:String(i+1) })),
  ...baronyPropIntFields.map(f=>({ id:f, name:baronyPropLabels[f] || f }))
];

async function fetchJSON(url, options){
  const resp = await fetch(API_BASE + url, options);
  return resp.json();
}

function showSaveIndicator(target) {
  const el = document.getElementById('saveIndicator');
  if (!el || !target) return;
  const rect = target.getBoundingClientRect();
  el.style.top = `${rect.top}px`;
  el.style.left = `${rect.right + 5}px`;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 2000);
}

function createCostEditor(val) {
  const container = document.createElement('div');
  const list = document.createElement('div');
  container.appendChild(list);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '+';
  container.appendChild(addBtn);
  function addRow(res = '', qty = '', opts = []) {
    const row = document.createElement('div');
    row.className = 'cost-row';
    const sel = document.createElement('select');
    const blank = document.createElement('option');
    blank.value = '';
    sel.appendChild(blank);
    resourceSelect.forEach(o => {
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.name;
      if (o.id === res) op.selected = true;
      sel.appendChild(op);
    });
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.value = qty;
    const choiceDiv = document.createElement('div');
    const choiceList = document.createElement('div');
    choiceDiv.appendChild(choiceList);
    const addChoiceBtn = document.createElement('button');
    addChoiceBtn.type = 'button';
    addChoiceBtn.textContent = '+';
    choiceDiv.appendChild(addChoiceBtn);
    function addChoice(val = '') {
      const rw = document.createElement('div');
      const s = document.createElement('select');
      const bl = document.createElement('option');
      bl.value = '';
      s.appendChild(bl);
      resourceSelect.filter(r => r.id !== 'choice').forEach(o => {
        const op = document.createElement('option');
        op.value = o.id;
        op.textContent = o.name;
        if (o.id === val) op.selected = true;
        s.appendChild(op);
      });
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = '-';
      rm.addEventListener('click', () => rw.remove());
      rw.appendChild(s);
      rw.appendChild(rm);
      choiceList.appendChild(rw);
    }
    addChoiceBtn.addEventListener('click', () => addChoice());
    if (opts.length) {
      opts.forEach(o => addChoice(o));
    } else {
      addChoice();
    }
    choiceDiv.style.display = res === 'choice' ? '' : 'none';
    sel.addEventListener('change', () => {
      choiceDiv.style.display = sel.value === 'choice' ? '' : 'none';
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '-';
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(sel);
    row.appendChild(qtyInput);
    row.appendChild(choiceDiv);
    row.appendChild(removeBtn);
    list.appendChild(row);
  }
  addBtn.addEventListener('click', () => addRow());
  try {
    const obj = JSON.parse(val || '{}');
    const entries = Object.entries(obj);
    if (entries.length) {
      entries.forEach(([r, q]) => {
        if (r === 'choice' && q && q.options) {
          addRow('choice', q.amount || '', q.options);
        } else {
          addRow(r, q);
        }
      });
    } else {
      addRow();
    }
  } catch (e) {
    addRow();
  }
  container.getValue = () => {
    const res = {};
    list.querySelectorAll('.cost-row').forEach(rw => {
      const k = rw.querySelector('select').value;
      const q = parseInt(rw.querySelector('input[type="number"]').value, 10);
      if (k === 'choice') {
        const opts = [];
        rw.querySelectorAll('div select').forEach(s => {
          if (s.value) opts.push(s.value);
        });
        if (opts.length && q) res.choice = { options: opts, amount: q };
      } else if (k && q) {
        res[k] = q;
      }
    });
    return JSON.stringify(res);
  };
  return container;
}

function openCostPopup(initialVal, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  const popup = document.createElement('div');
  popup.className = 'popup';
  const editor = createCostEditor(initialVal);
  popup.appendChild(editor);
  const btnRow = document.createElement('div');
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Valider';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Annuler';
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  popup.appendChild(btnRow);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  cancelBtn.addEventListener('click', () => overlay.remove());
  saveBtn.addEventListener('click', () => {
    onSave(editor.getValue());
    overlay.remove();
  });
}

function openInstantProductionPopup(initial, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  const popup = document.createElement('div');
  popup.className = 'popup';

  const resDiv = document.createElement('div');
  const resLabel = document.createElement('label');
  resLabel.textContent = 'Ressource';
  const resSel = document.createElement('select');
  const blank = document.createElement('option');
  blank.value = '';
  resSel.appendChild(blank);
  resourceSelect.forEach(o => {
    const op = document.createElement('option');
    op.value = o.id;
    op.textContent = o.name;
    if (initial.resource === o.id) op.selected = true;
    resSel.appendChild(op);
  });
  resDiv.appendChild(resLabel);
  resDiv.appendChild(resSel);

  const amtDiv = document.createElement('div');
  const amtLabel = document.createElement('label');
  amtLabel.textContent = 'Quantité';
  const amtInput = document.createElement('input');
  amtInput.type = 'number';
  amtInput.min = '0';
  amtInput.value = initial.amount || '';
  amtDiv.appendChild(amtLabel);
  amtDiv.appendChild(amtInput);

  const usesDiv = document.createElement('div');
  const usesLabel = document.createElement('label');
  usesLabel.textContent = 'Utilisations/mois';
  const usesInput = document.createElement('input');
  usesInput.type = 'number';
  usesInput.min = '0';
  usesInput.value = initial.uses_per_month || '';
  usesDiv.appendChild(usesLabel);
  usesDiv.appendChild(usesInput);

  const costDiv = document.createElement('div');
  const costLabel = document.createElement('label');
  costLabel.textContent = 'Coûts';
  const costEditor = createCostEditor(initial.costs ? JSON.stringify(initial.costs) : '{}');
  costDiv.appendChild(costLabel);
  costDiv.appendChild(costEditor);

  popup.appendChild(resDiv);
  popup.appendChild(amtDiv);
  popup.appendChild(usesDiv);
  popup.appendChild(costDiv);

  const btnRow = document.createElement('div');
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Valider';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Annuler';
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  popup.appendChild(btnRow);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  cancelBtn.addEventListener('click', () => overlay.remove());
  saveBtn.addEventListener('click', () => {
    let costs = {};
    try {
      costs = JSON.parse(costEditor.getValue() || '{}');
    } catch (e) {
      costs = {};
    }
    onSave({
      resource: resSel.value,
      amount: parseInt(amtInput.value, 10) || 0,
      uses_per_month: parseInt(usesInput.value, 10) || 0,
      costs,
    });
    overlay.remove();
  });
}

function makeRestrictionsInput(val){
  const container = document.createElement('div');
  const list = document.createElement('div');
  container.appendChild(list);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '+';
  container.appendChild(addBtn);
  function addRow(type = '', data = {}){
    const row = document.createElement('div');
    row.className = 'restriction-row';
    const typeSel = document.createElement('select');
    const blank = document.createElement('option');
    blank.value = '';
    typeSel.appendChild(blank);
    const typeOptions = [
      {id:'building', name:'Bâtiment'},
      {id:'infrastructure', name:'Infrastructure'},
      {id:'population', name:'Population'},
      {id:'resource', name:'Ressource'}
    ];
    typeOptions.forEach(o=>{
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.name;
      if(o.id === type) op.selected = true;
      typeSel.appendChild(op);
    });
    const keySpan = document.createElement('span');
    const valSpan = document.createElement('span');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '-';
    removeBtn.addEventListener('click', ()=> row.remove());
    row.appendChild(typeSel);
    row.appendChild(keySpan);
    row.appendChild(valSpan);
    row.appendChild(removeBtn);
    function updateFields(){
      keySpan.innerHTML = '';
      valSpan.innerHTML = '';
      if(typeSel.value === 'building'){
        const sel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        sel.appendChild(blank);
        buildingPropsSelect.forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(String(o.id) === String(data.building)) op.selected = true;
          sel.appendChild(op);
        });
        keySpan.appendChild(sel);
        const qty = document.createElement('input');
        qty.type = 'number';
        qty.min = '0';
        qty.value = data.value || '';
        valSpan.appendChild(qty);
      }else if(typeSel.value === 'infrastructure'){
        const sel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        sel.appendChild(blank);
        infraPropsSelect.forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(String(o.id) === String(data.infrastructure)) op.selected = true;
          sel.appendChild(op);
        });
        keySpan.appendChild(sel);
        const qty = document.createElement('input');
        qty.type = 'number';
        qty.min = '0';
        qty.value = data.value || '';
        valSpan.appendChild(qty);
      }else if(typeSel.value === 'population'){
        const qty = document.createElement('input');
        qty.type = 'number';
        qty.min = '0';
        qty.value = data.value || '';
        valSpan.appendChild(qty);
      }else if(typeSel.value === 'resource'){
        const sel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        sel.appendChild(blank);
        resourceSelect.forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(String(o.id) === String(data.resource)) op.selected = true;
          sel.appendChild(op);
        });
        keySpan.appendChild(sel);
        const qty = document.createElement('input');
        qty.type = 'number';
        qty.min = '0';
        qty.value = data.value || '';
        valSpan.appendChild(qty);
      }
    }
    typeSel.addEventListener('change', updateFields);
    updateFields();
    list.appendChild(row);
  }
  addBtn.addEventListener('click', ()=> addRow());
  try{
    const obj = JSON.parse(val || '{}');
    if(obj.buildings){
      Object.entries(obj.buildings).forEach(([b,v])=> addRow('building',{building:b,value:v}));
    }
    if(obj.infrastructures){
      Object.entries(obj.infrastructures).forEach(([i,v])=> addRow('infrastructure',{infrastructure:i,value:v}));
    }
    if(obj.resources){
      Object.entries(obj.resources).forEach(([r,v])=> addRow('resource',{resource:r,value:v}));
    }
    if(obj.population){
      addRow('population',{value:obj.population});
    }
    if(!obj.buildings && !obj.infrastructures && !obj.resources && !obj.population){
      addRow();
    }
  }catch(e){
    addRow();
  }
  container.getValue = ()=>{
    const res = {};
    const buildings = {};
    const infrastructures = {};
    const resources = {};
    let population;
    list.querySelectorAll('.restriction-row').forEach(rw=>{
      const type = rw.querySelector('select').value;
      if(type === 'building'){
        const sel = rw.querySelector('span select');
        const inp = rw.querySelector('span input');
        const b = sel.value;
        const q = parseInt(inp.value,10);
        if(b && q) buildings[b] = q;
      }else if(type === 'infrastructure'){
        const sel = rw.querySelector('span select');
        const inp = rw.querySelector('span input');
        const i = sel.value;
        const q = parseInt(inp.value,10);
        if(i && q) infrastructures[i] = q;
      }else if(type === 'population'){
        const inp = rw.querySelector('span input');
        const q = parseInt(inp.value,10);
        if(q) population = q;
      }else if(type === 'resource'){
        const sel = rw.querySelector('span select');
        const inp = rw.querySelector('span input');
        const r = sel.value;
        const q = parseInt(inp.value,10);
        if(r && q) resources[r] = q;
      }
    });
    if(Object.keys(buildings).length) res.buildings = buildings;
    if(Object.keys(infrastructures).length) res.infrastructures = infrastructures;
    if(Object.keys(resources).length) res.resources = resources;
    if(population != null) res.population = population;
    return JSON.stringify(res);
  };
  return container;
}

function makeEffectsInput(val){
  const container = document.createElement('div');
  const list = document.createElement('div');
  container.appendChild(list);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '+';
  container.appendChild(addBtn);
  function addRow(type = '', data = {}){
    const row = document.createElement('div');
    row.className = 'effect-row';
    const typeSel = document.createElement('select');
    typeSel.dataset.role = 'type';
    const blank = document.createElement('option');
    blank.value = '';
    typeSel.appendChild(blank);
    const typeOptions = [
      {id:'storage', name:'Stockage'},
      {id:'production', name:'Production ressource'},
      {id:'building_production', name:'Prod. bâtiment'},
      {id:'instant_production', name:'Prod. instantanée'}
    ];
    typeOptions.forEach(o=>{
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.name;
      if(o.id === type) op.selected = true;
      typeSel.appendChild(op);
    });
    const targetSel = document.createElement('select');
    targetSel.dataset.role = 'target';
    const qty = document.createElement('input');
    qty.type = 'number';
    qty.min = '0';
    qty.dataset.role = 'qty';
    const dataInput = document.createElement('input');
    dataInput.type = 'hidden';
    dataInput.dataset.role = 'data';
    const summarySpan = document.createElement('span');
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Définir';

    function updateSummary(){
      summarySpan.textContent = '';
      try{
        const d = JSON.parse(dataInput.value || '{}');
        if(d.resource && d.amount){
          const resObj = resourceSelect.find(r=>r.id === d.resource);
          const costCount = d.costs ? Object.keys(d.costs).length : 0;
          summarySpan.textContent = `${d.amount} ${resObj ? resObj.name : d.resource}` +
            (d.uses_per_month ? `, ${d.uses_per_month}/mois` : '') +
            (costCount ? `, coûts: ${costCount}` : '');
        }
      }catch(e){
        summarySpan.textContent = '';
      }
    }

    editBtn.addEventListener('click', ()=>{
      let init = {};
      try{ init = JSON.parse(dataInput.value || '{}'); }catch(e){ init = {}; }
      openInstantProductionPopup(init, d=>{ dataInput.value = JSON.stringify(d); updateSummary(); });
    });

    function populateFields(){
      targetSel.innerHTML = '';
      const blankRes = document.createElement('option');
      blankRes.value = '';
      targetSel.appendChild(blankRes);
      targetSel.style.display = 'none';
      qty.style.display = 'none';
      summarySpan.style.display = 'none';
      editBtn.style.display = 'none';
      if(typeSel.value === 'building_production'){
        buildingPropsSelect.forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(String(o.id) === String(data.building)) op.selected = true;
          targetSel.appendChild(op);
        });
        targetSel.style.display = '';
        qty.style.display = '';
      }else if(typeSel.value === 'instant_production'){
        summarySpan.style.display = '';
        editBtn.style.display = '';
        if(data.resource){ dataInput.value = JSON.stringify(data); updateSummary(); }
        else { dataInput.value = ''; updateSummary(); }
      }else{
        resourceSelect.forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(String(o.id) === String(data.resource)) op.selected = true;
          targetSel.appendChild(op);
        });
        targetSel.style.display = '';
        qty.style.display = '';
      }
      qty.value = data.amount || '';
    }
    populateFields();
    typeSel.addEventListener('change', ()=>{
      data = {};
      populateFields();
      if(typeSel.value === 'instant_production') editBtn.click();
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '-';
    removeBtn.addEventListener('click', ()=> row.remove());
    row.appendChild(typeSel);
    row.appendChild(targetSel);
    row.appendChild(qty);
    row.appendChild(summarySpan);
    row.appendChild(editBtn);
    row.appendChild(dataInput);
    row.appendChild(removeBtn);
    list.appendChild(row);
  }
  addBtn.addEventListener('click', ()=> addRow());
  try{
    const arr = JSON.parse(val || '[]');
    if(Array.isArray(arr) && arr.length){
      arr.forEach(e=> addRow(e.type, e));
    }else{
      addRow();
    }
  }catch(e){
    addRow();
  }
  container.getValue = ()=>{
    const res = [];
    list.querySelectorAll('.effect-row').forEach(rw=>{
      const type = rw.querySelector('select[data-role="type"]').value;
      if(type === 'instant_production'){
        let data = {};
        try{ data = JSON.parse(rw.querySelector('input[data-role="data"]').value || '{}'); }catch(e){ data = {}; }
        if(data.resource && data.amount){
          res.push({type, resource: data.resource, amount: data.amount, uses_per_month: data.uses_per_month || 0, costs: data.costs || {}});
        }
      }else{
        const target = rw.querySelector('select[data-role="target"]').value;
        const amt = parseInt(rw.querySelector('input[data-role="qty"]').value,10);
        if(type && target && amt){
          if(type === 'building_production'){
            res.push({type, building: target, amount: amt});
          }else{
            res.push({type, resource: target, amount: amt});
          }
        }
      }
    });
    return JSON.stringify(res);
  };
  return container;
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
    if(field === 'costs'){
      return createCostEditor(val);
    }
    if(field === 'absolute_restrictions'){
      const container = document.createElement('div');
      const list = document.createElement('div');
      container.appendChild(list);
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '+';
      container.appendChild(addBtn);
      function addRow(prop = ''){
        const row = document.createElement('div');
        row.className = 'restriction-row';
        const sel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        sel.appendChild(blank);
        baronyPropBoolFields.forEach(f=>{
          const op = document.createElement('option');
          op.value = f;
          op.textContent = baronyPropLabels[f] || f;
          if(f === prop) op.selected = true;
          sel.appendChild(op);
        });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '-';
        removeBtn.addEventListener('click', ()=> row.remove());
        row.appendChild(sel);
        row.appendChild(removeBtn);
        list.appendChild(row);
      }
      addBtn.addEventListener('click', ()=> addRow());
      try{
        const arr = JSON.parse(val || '[]');
        if(Array.isArray(arr) && arr.length){
          arr.forEach(p=> addRow(p));
        } else {
          addRow();
        }
      } catch(e){
        addRow();
      }
      container.getValue = ()=>{
        const res = [];
        list.querySelectorAll('select').forEach(sel=>{
          if(sel.value) res.push(sel.value);
        });
        return JSON.stringify(res);
      };
      return container;
    }
    if(field === 'infra_restrictions' || field === 'restrictions'){
      return makeRestrictionsInput(val);
    }
    if(field === 'effects'){
      return makeEffectsInput(val);
    }
    if(field === 'description'){
      const textarea = document.createElement('textarea');
      textarea.value = val ?? '';
      return textarea;
    }
    if(opts.selects && opts.selects[field]){
      let optList = opts.selects[field];
      if (typeof optList === 'function') optList = optList(item);
      const container = document.createElement('div');
      const select = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = '';
      if (opts.nullLabels && opts.nullLabels[field]) {
        blank.textContent = opts.nullLabels[field];
      } else {
        blank.textContent = '';
      }
      select.appendChild(blank);
      let choiceOpts = [];
      let selectedVal = val;
      if(typeof val === 'string'){ try{ const obj = JSON.parse(val); if(obj && obj.choice){ selectedVal = 'choice'; choiceOpts = obj.choice; } }catch{} }
      optList.forEach(o=>{
        const op = document.createElement('option');
        op.value = o.id;
        op.textContent = o.name;
        if(String(o.id) === String(selectedVal)) op.selected = true;
        select.appendChild(op);
      });
      container.appendChild(select);
      const choiceDiv = document.createElement('div');
      choiceDiv.style.display = select.value === 'choice' ? '' : 'none';
      const choiceList = document.createElement('div');
      choiceDiv.appendChild(choiceList);
      const addChoiceBtn = document.createElement('button');
      addChoiceBtn.type = 'button';
      addChoiceBtn.textContent = '+';
      choiceDiv.appendChild(addChoiceBtn);
      function addChoiceRow(val=''){
        const row = document.createElement('div');
        const sel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        sel.appendChild(blank);
        resourceSelect.filter(r=>r.id!=='choice').forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(o.id===val) op.selected = true;
          sel.appendChild(op);
        });
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '-';
        rm.addEventListener('click',()=>row.remove());
        row.appendChild(sel);
        row.appendChild(rm);
        choiceList.appendChild(row);
      }
      addChoiceBtn.addEventListener('click',()=>addChoiceRow());
      if(choiceOpts.length){ choiceOpts.forEach(r=>addChoiceRow(r)); } else { addChoiceRow(); }
      container.appendChild(choiceDiv);
      select.addEventListener('change',()=>{
        choiceDiv.style.display = select.value === 'choice' ? '' : 'none';
      });
      container.getValue = ()=>{
        if(select.value === 'choice'){
          const opts = [];
          choiceList.querySelectorAll('select').forEach(s=>{ if(s.value) opts.push(s.value); });
          return JSON.stringify({choice:opts});
        }
        return select.value ? (isNaN(select.value) ? select.value : parseInt(select.value,10)) : null;
      };
      return container;
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
          if(el.getValue){
            payload[f] = el.getValue();
          } else if(opts.selects && opts.selects[f]){
            payload[f] = el.value ? (isNaN(el.value) ? el.value : parseInt(el.value,10)) : null;
          } else if(f === 'description'){
            payload[f] = el.value;
          } else {
            payload[f] = el.value.trim();
          }
        });
        if (opts.beforeSave) opts.beforeSave(payload, item);
        await fetchJSON(`/api/${opts.endpoint}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        showSaveIndicator(btn.parentElement);
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
        if(el.getValue){
          payload[f] = el.getValue();
        } else if(opts.selects && opts.selects[f]){
          payload[f] = el.value ? (isNaN(el.value) ? el.value : parseInt(el.value,10)) : null;
        } else if(f === 'description'){
          payload[f] = el.value;
        } else {
          payload[f] = el.value.trim();
        }
      });
      if (opts.beforeSave) opts.beforeSave(payload, null);
      await fetchJSON(`/api/${opts.endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      showSaveIndicator(addBtn.parentElement);
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
  const [seigneurs, religions, cultures, kingdoms, counties, duchies, viscounties, marquisates, archduchies, empires, users, seigneuries, baronies, baronyProps, buildingProps, infraProps] = await Promise.all([
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
    fetchJSON('/api/seigneuries'),
    fetchJSON('/api/baronies'),
    fetchJSON('/api/barony_properties'),
    fetchJSON('/api/building_properties'),
    fetchJSON('/api/infrastructure_properties'),
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

  const baroniesSelect = baronies.slice().sort((a,b)=>a.name.localeCompare(b.name));

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
  const seigneuriesById = seigneuries.slice().sort((a,b)=>a.id - b.id);

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
    labels:{name:'Nom', seigneur_id:'Détenteur du titre'}
  });

  renderTable(document.getElementById('tableKingdoms'), kingdomsById, {
    endpoint:'kingdoms',
    fields:['name','seigneur_id','empire_id'],
    selects:{seigneur_id:seigneursSelect, empire_id:empiresSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', empire_id:'Empire'}
  });

  renderTable(document.getElementById('tableArchduchies'), archduchiesById, {
    endpoint:'archduchies',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre'}
  });

  renderTable(document.getElementById('tableDuchies'), duchiesById, {
    endpoint:'duchies',
    fields:['name','seigneur_id','kingdom_id','archduchy_id'],
    selects:{seigneur_id:seigneursSelect, kingdom_id:kingdomsSelect, archduchy_id:archduchiesSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', kingdom_id:'Royaume', archduchy_id:'Archiduché'}
  });

  renderTable(document.getElementById('tableMarquisates'), marquisatesById, {
    endpoint:'marquisates',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre'}
  });

  renderTable(document.getElementById('tableCounties'), countiesById, {
    endpoint:'counties',
    fields:['name','seigneur_id','duchy_id','marquisate_id'],
    selects:{seigneur_id:seigneursSelect, duchy_id:duchiesSelect, marquisate_id:marquisatesSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', duchy_id:'Duché', marquisate_id:'Marquisat'}
  });

  renderTable(document.getElementById('tableViscounties'), viscountiesById, {
    endpoint:'viscounties',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre'}
  });

  renderTable(document.getElementById('tableSeigneuries'), seigneuriesById, {
    endpoint:'seigneuries',
    fields:['baronnie_id','seigneur_id','population',...inventaireFields],
    selects:{baronnie_id:baroniesSelect, seigneur_id:seigneursSelect},
    labels:{baronnie_id:'Baronnie', seigneur_id:'Seigneur', population:'Population',...inventaireLabels},
    beforeSave:(payload,item)=>{ if(item && item.inventaire_id) payload.inventaire_id = item.inventaire_id; }
  });

  renderTable(document.getElementById('tableSeigneurs'), seigneursById, {
    endpoint:'seigneurs',
    fields:['name','user_id','religion_id','overlord_id'],
    selects:{user_id:userSelectFn, religion_id:religionsSelect, overlord_id:seigneursSelect},
    labels:{name:'Nom', user_id:'Utilisateur', religion_id:'Religion', overlord_id:'Suzerain'}
  });

  buildingPropsSelect = buildingProps.map(b => ({ id: b.id, name: b.label || b.type }));
  infraPropsSelect = infraProps.map(i => ({ id: i.id, name: i.label || i.type }));

  const baronyPropsById = baronyProps.slice().sort((a,b)=>a.id - b.id);
  const boolSelects = {};
  baronyPropBoolFields.forEach(f => { boolSelects[f] = yesNoSelect; });
  renderTable(document.getElementById('tableBaronyProps'), baronyPropsById, {
    endpoint:'barony_properties',
    fields:baronyPropFields,
    selects:{barony_id:baroniesSelect, ...boolSelects},
    labels:baronyPropLabels
  });
  const buildingPropsById = buildingProps.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableBuildingProps'), buildingPropsById, {
    endpoint:'building_properties',
    fields:buildingPropFields,
    labels:buildingPropLabels,
    selects:{produces: resourceSelect, max: maxOptions}
  });
  const infraPropsById = infraProps.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableInfraProps'), infraPropsById, {
    endpoint:'infrastructure_properties',
    fields:infraPropFields,
    labels:infraPropLabels,
    selects:{type:typeSelect}
  });
}

loadAll();
