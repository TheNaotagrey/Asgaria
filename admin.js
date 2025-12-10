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

const militaryResources = [
  ['hommes_darmes', "Hommes d'armes"], ['chevaux', 'Chevaux'], ['trebuchets', 'Trébuchets'],
];

const extraResources = [
  ['esclaves', 'Esclaves'], ['prestige', 'Prestige'], ['renommee', 'Renommée'],
];

const inventaireFields = [...basicResources, ...luxuryResources, ...militaryResources, ...extraResources].map(([k]) => k);
const inventaireLabels = Object.fromEntries([...basicResources, ...luxuryResources, ...militaryResources, ...extraResources]);

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

const baronyFields = ['name','seigneur_id','religion_pop_id','culture_id','county_id','viscounty_id','priory_religion_id','church_religion_id','cathedral_religion_id'];
const baronyLabels = {
  name:'Nom',
  seigneur_id:'Seigneur',
  religion_pop_id:'Religion (population)',
  culture_id:'Culture',
  county_id:'Comté',
  viscounty_id:'Vicomté',
  priory_religion_id:'Prieuré',
  church_religion_id:'Église',
  cathedral_religion_id:'Cathédrale'
};

const buildingPropFields = ['label','produces','production','costs','max','workers_per_building','absolute_restrictions','infra_restrictions','effects','description'];
const buildingPropLabels = {
  label:'Nom',
  produces:'Ressource produite',
  production:'Production',
  costs:'Coûts',
  max:'Maximum',
  workers_per_building:'Travailleurs/bâtiment',
  absolute_restrictions:'Restrictions absolues',
  infra_restrictions:'Requis',
  effects:'Effets',
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
const typeSelect = [{id:'civil',name:'Civil'},{id:'militaire',name:'Militaire'},{id:'commercial',name:'Commercial'}];
const resourceSelect = Object.entries(inventaireLabels).map(([id, name]) => ({ id, name }));
const pageSelect = [{id:'magie', name:'Magie'}];
let buildingPropsSelect = [];
let infraPropsSelect = [];
let tagsSelect = [];
const dataCache = {};
const tabLoaded = {};
const canonicalKey = id => (id === null || id === undefined ? '' : String(id));
let canonicalLandMap = {};
const maxOptions = [
  ...Array.from({length:10}, (_,i)=>({ id:String(i+1), name:String(i+1) })),
  ...baronyPropIntFields.map(f=>({ id:f, name:baronyPropLabels[f] || f })),
  { id:'tag', name:'Par tag' }
];

const spellFields = ['label','type','costs','effects','description'];
const spellLabels = {
  label:'Nom',
  type:'Type',
  costs:'Coûts',
  effects:'Effets',
  description:'Description'
};

async function fetchJSON(url, options){
  const resp = await fetch(API_BASE + url, options);
  return resp.json();
}

async function getData(key, url){
  if(!dataCache[key]){
    dataCache[key] = await fetchJSON(url);
  }
  return dataCache[key];
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
  function addRow(res = '', qty = '') {
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
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '-';
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(sel);
    row.appendChild(qtyInput);
    row.appendChild(removeBtn);
    list.appendChild(row);
  }
  addBtn.addEventListener('click', () => addRow());
  try {
    const obj = JSON.parse(val || '{}');
    const entries = Object.entries(obj);
    if (entries.length) {
      entries.forEach(([r, q]) => addRow(r, q));
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
      if (k && q) {
        res[k] = q;
      }
    });
    return JSON.stringify(res);
  };
  return container;
}

function openCanonicalPopup(baronyId, baroniesList, onChange){
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  const popup = document.createElement('div');
  popup.className = 'popup';
  const list = document.createElement('div');

  function addRow(val = ''){
    const row = document.createElement('div');
    row.className = 'cost-row';
    const sel = document.createElement('select');
    const blank = document.createElement('option');
    blank.value = '';
    sel.appendChild(blank);
    baroniesList.forEach(b => {
      const op = document.createElement('option');
      op.value = b.id;
      op.textContent = `${b.id} - ${b.name}`;
      if (String(b.id) === String(val)) op.selected = true;
      sel.appendChild(op);
    });
    row.dataset.canonicalId = val;
    sel.addEventListener('change', async () => {
      const newId = parseInt(sel.value, 10);
      const key = canonicalKey(baronyId);
      const oldId = parseInt(row.dataset.canonicalId || '0', 10);
      if (oldId) {
        await fetchJSON(`/api/canonical_lands?barony_id=${oldId}&canonical_barony_id=${baronyId}`, { method: 'DELETE' });
        if (canonicalLandMap[key]) canonicalLandMap[key] = canonicalLandMap[key].filter(id => id !== oldId);
      }
      if (newId) {
        await fetchJSON('/api/canonical_lands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barony_id: newId, canonical_barony_id: baronyId })
        });
        if (!canonicalLandMap[key]) canonicalLandMap[key] = [];
        if (!canonicalLandMap[key].includes(newId)) canonicalLandMap[key].push(newId);
      }
      row.dataset.canonicalId = newId;
      if (onChange) onChange();
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '-';
    delBtn.addEventListener('click', async () => {
      const key = canonicalKey(baronyId);
      const oldId = parseInt(row.dataset.canonicalId || '0', 10);
      if (oldId) {
        await fetchJSON(`/api/canonical_lands?barony_id=${oldId}&canonical_barony_id=${baronyId}`, { method: 'DELETE' });
        if (canonicalLandMap[key]) canonicalLandMap[key] = canonicalLandMap[key].filter(id => id !== oldId);
      }
      row.remove();
      if (onChange) onChange();
    });
    row.appendChild(sel);
    row.appendChild(delBtn);
    list.appendChild(row);
  }

  const existing = canonicalLandMap[canonicalKey(baronyId)] || [];
  if (existing.length) {
    existing.forEach(id => addRow(id));
  } else {
    addRow();
  }
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => addRow());
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Fermer';
  closeBtn.addEventListener('click', () => overlay.remove());

  popup.appendChild(list);
  popup.appendChild(addBtn);
  popup.appendChild(closeBtn);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

function createCanonicalCell(item, baroniesList){
  const container = document.createElement('div');
  const summary = document.createElement('div');
  summary.style.marginBottom = '4px';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Modifier';

  function updateSummary(){
    const ids = canonicalLandMap[canonicalKey(item.id)] || [];
    if (!ids.length) {
      summary.textContent = 'Aucune';
      return;
    }
    const labels = ids.map(cid => {
      const b = baroniesList.find(x => String(x.id) === String(cid));
      return b ? `${cid} - ${b.name}` : cid;
    });
    const short = labels.slice(0, 3);
    if (labels.length > 3) short.push('…');
    summary.textContent = short.join(', ');
  }

  btn.addEventListener('click', () => {
    openCanonicalPopup(item.id, baroniesList, () => {
      updateSummary();
      showSaveIndicator(container);
    });
  });

  updateSummary();
  container.appendChild(summary);
  container.appendChild(btn);
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
  amtInput.value = initial.amount ?? '';
  amtDiv.appendChild(amtLabel);
  amtDiv.appendChild(amtInput);

  const usesDiv = document.createElement('div');
  const usesLabel = document.createElement('label');
  usesLabel.textContent = 'Utilisations/mois';
  const usesInput = document.createElement('input');
  usesInput.type = 'number';
  usesInput.min = '0';
  usesInput.value = initial.uses_per_month ?? '';
  usesDiv.appendChild(usesLabel);
  usesDiv.appendChild(usesInput);

  const perDiv = document.createElement('div');
  const perLabel = document.createElement('label');
  perLabel.textContent = 'Par bâtiment';
  const perInput = document.createElement('input');
  perInput.type = 'checkbox';
  perInput.checked = initial.per_building !== false;
  perDiv.appendChild(perLabel);
  perDiv.appendChild(perInput);

  const costDiv = document.createElement('div');
  const costLabel = document.createElement('label');
  costLabel.textContent = 'Coûts';
  const costEditor = createCostEditor(initial.costs ? JSON.stringify(initial.costs) : '{}');
  costDiv.appendChild(costLabel);
  costDiv.appendChild(costEditor);

  popup.appendChild(resDiv);
  popup.appendChild(amtDiv);
  popup.appendChild(usesDiv);
  popup.appendChild(perDiv);
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
      per_building: perInput.checked,
      costs,
    });
    overlay.remove();
  });
}

function openVariableWorkersPopup(initial, onSave) {
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
  amtLabel.textContent = 'Production / travailleur';
  const amtInput = document.createElement('input');
  amtInput.type = 'number';
  amtInput.min = '0';
  amtInput.value = initial.amount ?? '';
  amtDiv.appendChild(amtLabel);
  amtDiv.appendChild(amtInput);

  const maxDiv = document.createElement('div');
  const maxLabel = document.createElement('label');
  maxLabel.textContent = 'Max travailleurs';
  const maxInput = document.createElement('input');
  maxInput.type = 'number';
  maxInput.min = '0';
  maxInput.value = initial.max_workers ?? '';
  maxDiv.appendChild(maxLabel);
  maxDiv.appendChild(maxInput);

  popup.appendChild(resDiv);
  popup.appendChild(amtDiv);
  popup.appendChild(maxDiv);

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
    onSave({
      resource: resSel.value,
      amount: parseInt(amtInput.value, 10) || 0,
      max_workers: parseInt(maxInput.value, 10) || 0,
    });
    overlay.remove();
  });
}

function openRestrictionsPopup(initialVal, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  const popup = document.createElement('div');
  popup.className = 'popup';
  const editor = makeRestrictionsInput(initialVal);
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
      {id:'resource', name:'Ressource'},
      {id:'tag', name:'Tag'}
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
        qty.value = data.value ?? '';
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
        qty.value = data.value ?? '';
        valSpan.appendChild(qty);
      }else if(typeSel.value === 'population'){
        const qty = document.createElement('input');
        qty.type = 'number';
        qty.min = '0';
        qty.value = data.value ?? '';
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
        qty.value = data.value ?? '';
        valSpan.appendChild(qty);
      }else if(typeSel.value === 'tag'){
        const sel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        sel.appendChild(blank);
        tagsSelect.forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(String(o.id) === String(data.tag)) op.selected = true;
          sel.appendChild(op);
        });
        keySpan.appendChild(sel);
        const cmp = document.createElement('select');
        ['>=','<='].forEach(sym=>{
          const op = document.createElement('option');
          op.value = sym;
          op.textContent = sym;
          if(sym === data.cmp) op.selected = true;
          cmp.appendChild(op);
        });
        const qty = document.createElement('input');
        qty.type = 'number';
        qty.min = '0';
        qty.value = data.value ?? '';
        valSpan.appendChild(cmp);
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
    if(obj.tags){
      obj.tags.forEach(t=> addRow('tag',{tag:t.tag || t.tag_id, cmp:t.cmp, value:t.value}));
    }
    if(obj.population){
      addRow('population',{value:obj.population});
    }
    if(!obj.buildings && !obj.infrastructures && !obj.resources && !obj.population && !obj.tags){
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
    const tags = [];
    let population;
    list.querySelectorAll('.restriction-row').forEach(rw=>{
      const type = rw.querySelector('select').value;
      if(type === 'building'){
        const sel = rw.querySelector('span select');
        const inp = rw.querySelector('span input');
        const b = sel.value;
        const q = parseInt(inp.value,10);
        if (b && !isNaN(q)) buildings[b] = q;
      }else if(type === 'infrastructure'){
        const sel = rw.querySelector('span select');
        const inp = rw.querySelector('span input');
        const i = sel.value;
        const q = parseInt(inp.value,10);
        if (i && !isNaN(q)) infrastructures[i] = q;
      }else if(type === 'population'){
        const inp = rw.querySelector('span input');
        const q = parseInt(inp.value,10);
        if (!isNaN(q)) population = q;
      }else if(type === 'resource'){
        const sel = rw.querySelector('span select');
        const inp = rw.querySelector('span input');
        const r = sel.value;
        const q = parseInt(inp.value,10);
        if (r && !isNaN(q)) resources[r] = q;
      }else if(type === 'tag'){
        const spans = rw.querySelectorAll('span');
        const tagSel = spans[0].querySelector('select');
        const cmpSel = spans[1].querySelector('select');
        const inp = spans[1].querySelector('input');
        const t = tagSel.value;
        const cmp = cmpSel.value;
        const q = parseInt(inp.value,10);
        if(t && cmp && !isNaN(q)) tags.push({ tag: t, cmp, value: q });
      }
    });
    if(Object.keys(buildings).length) res.buildings = buildings;
    if(Object.keys(infrastructures).length) res.infrastructures = infrastructures;
    if(Object.keys(resources).length) res.resources = resources;
    if(population != null) res.population = population;
    if(tags.length) res.tags = tags;
    return JSON.stringify(res);
  };
  return container;
}

function makeEffectsInput(val, allowedTypes){
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
    let typeOptions = [
      {id:'storage', name:'Stockage'},
      {id:'production', name:'Production ressource'},
      {id:'building_production', name:'Prod. bâtiment'},
      {id:'infra_production', name:'Mult. infrastructure'},
      {id:'idh', name:'IDH'},
      {id:'instant_production', name:'Prod. instantanée'},
      {id:'variable_workers', name:'Travailleurs variables'},
      {id:'unlock_page', name:'Débloque page'},
      {id:'spell_success', name:'Réussite de sort'},
      {id:'spell_basic_discount', name:'Réduc. sort basique'},
      {id:'spell_advanced_discount', name:'Réduc. sort avancé'},
      {id:'spell_range', name:'Portée des sorts'},
      {id:'spell_max_per_month', name:'Sorts max/mois'},
      {id:'land_transaction_max_per_month', name:'Transactions terrestres max/mois'},
      {id:'naval_transaction_max_per_month', name:'Transactions navales max/mois'},
      {id:'tag', name:'Tag'},
      {id:'variable_production', name:'Production ressource variable'},
      {id:'random_luxury', name:'Ressource de luxe aléatoire'}
    ];
    if(Array.isArray(allowedTypes)){
      typeOptions = typeOptions.filter(o=>allowedTypes.includes(o.id));
    }
    typeOptions.forEach(o=>{
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.name;
      if(o.id === type) op.selected = true;
      typeSel.appendChild(op);
    });
    const targetSel = document.createElement('select');
    targetSel.dataset.role = 'target';
    const pageSel = document.createElement('select');
    pageSel.dataset.role = 'page';
    const blankPage = document.createElement('option');
    blankPage.value = '';
    pageSel.appendChild(blankPage);
    pageSelect.forEach(o=>{
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.name;
      pageSel.appendChild(op);
    });
    const qty = document.createElement('input');
    qty.type = 'number';
    qty.min = '0';
    qty.step = 'any';
    qty.dataset.role = 'qty';
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.min = '0';
    maxInput.dataset.role = 'max';
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
        if(typeSel.value === 'instant_production'){
          if(d.resource && d.amount){
            const resObj = resourceSelect.find(r=>r.id === d.resource);
            const costCount = d.costs ? Object.keys(d.costs).length : 0;
            const usesTxt = d.uses_per_month ? `, ${d.uses_per_month}/mois${d.per_building === false ? ' total' : '/bât'}` : '';
            summarySpan.textContent = `${d.amount} ${resObj ? resObj.name : d.resource}` +
              usesTxt +
              (costCount ? `, coûts: ${costCount}` : '');
          }
        }else if(typeSel.value === 'variable_workers'){
          if(d.resource && d.amount && d.max_workers != null){
            const resObj = resourceSelect.find(r=>r.id === d.resource);
            summarySpan.textContent = `${d.amount} ${resObj ? resObj.name : d.resource} /travailleur, max ${d.max_workers}`;
          }
        }
      }catch(e){
        summarySpan.textContent = '';
      }
    }

    editBtn.addEventListener('click', ()=>{
      let init = {};
      try{ init = JSON.parse(dataInput.value || '{}'); }catch(e){ init = {}; }
      if(typeSel.value === 'instant_production'){
        openInstantProductionPopup(init, d=>{ dataInput.value = JSON.stringify(d); updateSummary(); });
      }else if(typeSel.value === 'variable_workers'){
        openVariableWorkersPopup(init, d=>{ dataInput.value = JSON.stringify(d); updateSummary(); });
      }
    });

    function populateFields(){
      targetSel.innerHTML = '';
      const blankRes = document.createElement('option');
      blankRes.value = '';
      targetSel.appendChild(blankRes);
      targetSel.style.display = 'none';
      pageSel.style.display = 'none';
      qty.style.display = 'none';
      maxInput.style.display = 'none';
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
      }else if(typeSel.value === 'infra_production'){
        infraPropsSelect.forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(String(o.id) === String(data.infrastructure)) op.selected = true;
          targetSel.appendChild(op);
        });
        targetSel.style.display = '';
        qty.style.display = '';
      }else if(typeSel.value === 'instant_production'){
        summarySpan.style.display = '';
        editBtn.style.display = '';
        if(data.resource){ dataInput.value = JSON.stringify(data); updateSummary(); }
        else { dataInput.value = ''; updateSummary(); }
      }else if(typeSel.value === 'variable_workers'){
        summarySpan.style.display = '';
        editBtn.style.display = '';
        if(data.resource){ dataInput.value = JSON.stringify(data); updateSummary(); }
        else { dataInput.value = ''; updateSummary(); }
      }else if(typeSel.value === 'tag'){
        tagsSelect.forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(String(o.id) === String(data.tag)) op.selected = true;
          targetSel.appendChild(op);
        });
        targetSel.style.display = '';
        qty.style.display = '';
        qty.placeholder = 'Nombre';
        qty.value = data.amount ?? '';
        return;
      }else if(typeSel.value === 'variable_production'){
        resourceSelect.forEach(o=>{
          const op = document.createElement('option');
          op.value = o.id;
          op.textContent = o.name;
          if(String(o.id) === String(data.resource)) op.selected = true;
          targetSel.appendChild(op);
        });
        targetSel.style.display = '';
        qty.style.display = '';
        maxInput.style.display = '';
        qty.placeholder = 'Ratio';
        maxInput.placeholder = 'Max';
        qty.value = data.ratio ?? '';
        maxInput.value = data.max ?? '';
        return;
      }else if(typeSel.value === 'random_luxury'){
        qty.style.display = '';
        qty.placeholder = 'Quantité';
        qty.value = data.amount ?? '';
        return;
      }else if(['idh','spell_success','spell_basic_discount','spell_advanced_discount','spell_range','spell_max_per_month','land_transaction_max_per_month','naval_transaction_max_per_month'].includes(typeSel.value)){
        qty.style.display = '';
      }else if(typeSel.value === 'unlock_page'){
        pageSel.style.display = '';
        pageSel.value = data.page || '';
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
      qty.placeholder = '';
      maxInput.placeholder = '';
      qty.value = data.amount ?? '';
    }
    populateFields();
    typeSel.addEventListener('change', ()=>{
      data = {};
      populateFields();
      if(typeSel.value === 'instant_production' || typeSel.value === 'variable_workers') editBtn.click();
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '-';
    removeBtn.addEventListener('click', ()=> row.remove());
    row.appendChild(typeSel);
    row.appendChild(targetSel);
    row.appendChild(pageSel);
    row.appendChild(qty);
    row.appendChild(maxInput);
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
          res.push({
            type,
            resource: data.resource,
            amount: data.amount,
            uses_per_month: data.uses_per_month || 0,
            per_building: data.per_building !== false,
            costs: data.costs || {}
          });
        }
      }else if(type === 'variable_workers'){
        let data = {};
        try{ data = JSON.parse(rw.querySelector('input[data-role="data"]').value || '{}'); }catch(e){ data = {}; }
        if(data.resource && data.amount && data.max_workers != null){
          res.push({type, resource: data.resource, amount: data.amount, max_workers: data.max_workers});
        }
      }else if(type === 'variable_production'){
        const resource = rw.querySelector('select[data-role="target"]').value;
        const ratio = parseFloat(rw.querySelector('input[data-role="qty"]').value);
        const max = parseInt(rw.querySelector('input[data-role="max"]').value,10);
        if(resource && !isNaN(ratio) && !isNaN(max)){
          res.push({type, resource, ratio, max});
        }
      }else if(type === 'random_luxury'){
        const amt = parseInt(rw.querySelector('input[data-role="qty"]').value,10);
        if(!isNaN(amt)){
          res.push({type, amount: amt});
        }
      }else if(type === 'tag'){
        const tag = rw.querySelector('select[data-role="target"]').value;
        const amt = parseInt(rw.querySelector('input[data-role="qty"]').value,10) || 1;
        if(tag){
          res.push({ type, tag: parseInt(tag,10), amount: amt });
        }
      }else if(['idh','spell_success','spell_basic_discount','spell_advanced_discount','spell_range','spell_max_per_month','land_transaction_max_per_month','naval_transaction_max_per_month'].includes(type)){
        const amt = parseInt(rw.querySelector('input[data-role="qty"]').value,10);
        if(type && !isNaN(amt)){
          res.push({ type, amount: amt });
        }
      }else if(type === 'unlock_page'){
        const page = rw.querySelector('select[data-role="page"]').value;
        if(page){
          res.push({type, page});
        }
      }else{
        const target = rw.querySelector('select[data-role="target"]').value;
        const amt = parseInt(rw.querySelector('input[data-role="qty"]').value,10);
        if(type && target && amt){
          if(type === 'building_production'){
            res.push({type, building: target, amount: amt});
          }else if(type === 'infra_production'){
            res.push({type, infrastructure: target, amount: amt});
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

  const extraColumns = opts.extraColumns || [];

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
  extraColumns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label || '';
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
      const container = document.createElement('div');
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.value = val || '{}';
      const summary = document.createElement('span');
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Définir';
      function updateSummary(){
        let obj = {};
        try{ obj = JSON.parse(hidden.value || '{}'); }catch(e){ obj = {}; }
        const parts = [];
        if(obj.population != null) parts.push(`Pop:${obj.population}`);
        if(obj.buildings){
          Object.entries(obj.buildings).forEach(([id,q])=>{
            const name = (buildingPropsSelect.find(o=>String(o.id)===String(id))?.name) || id;
            parts.push(`B:${name}x${q}`);
          });
        }
        if(obj.infrastructures){
          Object.entries(obj.infrastructures).forEach(([id,q])=>{
            const name = (infraPropsSelect.find(o=>String(o.id)===String(id))?.name) || id;
            parts.push(`I:${name}x${q}`);
          });
        }
        if(obj.resources){
          Object.entries(obj.resources).forEach(([id,q])=>{
            const name = (resourceSelect.find(o=>String(o.id)===String(id))?.name) || id;
            parts.push(`R:${name}x${q}`);
          });
        }
        if(obj.tags){
          obj.tags.forEach(t=>{
            const tagId = t.tag || t.tag_id;
            const name = (tagsSelect.find(o=>String(o.id)===String(tagId))?.name) || tagId;
            const cmp = t.cmp || '>=';
            parts.push(`T:${name}${cmp}${t.value}`);
          });
        }
        const short = parts.slice(0,3);
        if(parts.length > 3) short.push('…');
        summary.textContent = short.join(', ');
      }
      editBtn.addEventListener('click', ()=>{
        openRestrictionsPopup(hidden.value, v=>{ hidden.value = v; updateSummary(); });
      });
      updateSummary();
      container.appendChild(summary);
      container.appendChild(editBtn);
      container.appendChild(hidden);
      container.getValue = ()=> hidden.value;
      return container;
    }
    if(field === 'effects'){
      return makeEffectsInput(val, opts && opts.allowedEffectTypes);
    }
    if(field === 'max'){
      let isTag = false, tag = '', per = '';
      try {
        const obj = JSON.parse(val || '');
        if (obj && obj.tag) {
          isTag = true;
          tag = obj.tag || obj.tag_id || '';
          per = obj.per || obj.value || '';
        }
      } catch {}
      const container = document.createElement('div');
      const sel = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = '';
      sel.appendChild(blank);
      maxOptions.forEach(o=>{
        const op = document.createElement('option');
        op.value = o.id;
        op.textContent = o.name;
        if(!isTag && String(o.id) === String(val)) op.selected = true;
        sel.appendChild(op);
      });
      const tagSel = document.createElement('select');
      const tagBlank = document.createElement('option');
      tagBlank.value = '';
      tagSel.appendChild(tagBlank);
      tagsSelect.forEach(o=>{
        const op = document.createElement('option');
        op.value = o.id;
        op.textContent = o.name;
        if(String(o.id) === String(tag)) op.selected = true;
        tagSel.appendChild(op);
      });
      const qty = document.createElement('input');
      qty.type = 'number';
      qty.min = '0';
      qty.style.width = '6em';
      qty.value = per;
      container.appendChild(sel);
      container.appendChild(tagSel);
      container.appendChild(qty);
      function update(){
        const show = sel.value === 'tag';
        tagSel.style.display = show ? '' : 'none';
        qty.style.display = show ? '' : 'none';
      }
      sel.addEventListener('change', update);
      if(isTag){ sel.value = 'tag'; }
      update();
      container.getValue = ()=>{
        if(sel.value === 'tag'){
          if(!tagSel.value) return null;
          const p = parseInt(qty.value,10) || 1;
          return JSON.stringify({ tag: parseInt(tagSel.value,10), per: p });
        }
        return sel.value || null;
      };
      return container;
    }
    if(field === 'description'){
      const textarea = document.createElement('textarea');
      textarea.value = val ?? '';
      return textarea;
    }
    if(opts.selects && opts.selects[field]){
      let optList = opts.selects[field];
      if (typeof optList === 'function') optList = optList(item);
      const select = document.createElement('select');
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
      select.getValue = ()=> select.value ? (isNaN(select.value) ? select.value : parseInt(select.value,10)) : null;
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

  const renderRow = (item)=>{
    const tr = document.createElement('tr');
    let td = document.createElement('td');
    td.textContent = item.id;
    tr.appendChild(td);
    opts.fields.forEach(f=>{
      td = document.createElement('td');
      td.appendChild(makeInput(item[f], f, item));
      tr.appendChild(td);
    });
    extraColumns.forEach(col => {
      const tdExtra = document.createElement('td');
      const content = col.render ? col.render(item, tr) : document.createTextNode('');
      tdExtra.appendChild(content);
      tr.appendChild(tdExtra);
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
      const resp = await fetchJSON(`/api/${opts.endpoint}/${item.id}`, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      showSaveIndicator(btn.parentElement);
      const updated = resp && typeof resp === 'object' && 'id' in resp
        ? resp
        : { ...item, ...payload };
      const idx = rows.findIndex(r=>r.id === item.id);
      if(idx !== -1) rows[idx] = updated;
      const newRow = renderRow(updated);
      tbody.replaceChild(newRow, tr);
    });
    td.appendChild(btn);
    tr.appendChild(td);
    return tr;
  };

  const renderBody = ()=>{
    tbody.innerHTML = '';
    const sorted = rows.slice().sort(compareRows);

    const appendAddRow = ()=>{
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
      extraColumns.forEach(()=>{
        const td = document.createElement('td');
        td.textContent = '';
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
        const created = await fetchJSON(`/api/${opts.endpoint}`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
        showSaveIndicator(addBtn.parentElement);
        const newItem = { ...payload, ...created };
        rows.push(newItem);
        renderBody();
      });
      addTd.appendChild(addBtn);
      addRow.appendChild(addTd);
      tbody.appendChild(addRow);
    };

    const batchSize = 500;
    if(sorted.length > batchSize){
      let idx = 0;
      const renderChunk = () => {
        const frag = document.createDocumentFragment();
        for(let i=0;i<batchSize && idx < sorted.length;i++,idx++){
          frag.appendChild(renderRow(sorted[idx]));
        }
        tbody.appendChild(frag);
        if(idx < sorted.length){
          requestAnimationFrame(renderChunk);
        }else{
          appendAddRow();
        }
      };
      requestAnimationFrame(renderChunk);
    }else{
      const frag = document.createDocumentFragment();
      sorted.forEach(item=>{
        frag.appendChild(renderRow(item));
      });
      tbody.appendChild(frag);
      appendAddRow();
    }
  };

  table.appendChild(tbody);
  container.appendChild(table);
  updateHeaders();
  renderBody();
}

async function refreshTable(container, rows, opts){
  const data = await fetchJSON(`/api/${opts.endpoint}`);
  rows.splice(0, rows.length, ...data);
  renderTable(container, rows, opts);
}

async function loadReligions(){
  const religions = await getData('religions','/api/religions');
  const religionsById = religions.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableReligions'), religionsById, {
    endpoint:'religions',
    fields:['name','color'],
    labels:{name:'Nom', color:'Couleur'},
    colorFields:['color']
  });
}

async function loadCultures(){
  const cultures = await getData('cultures','/api/cultures');
  const culturesById = cultures.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableCultures'), culturesById, {
    endpoint:'cultures',
    fields:['name','color'],
    labels:{name:'Nom', color:'Couleur'},
    colorFields:['color']
  });
}

async function loadSeigneurs(){
  const [seigneurs, religions, users] = await Promise.all([
    getData('seigneurs','/api/seigneurs'),
    getData('religions','/api/religions'),
    getData('users','/api/users'),
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const religionsSelect = religions.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const usersSelectRaw = users.slice().sort((a,b)=>(a.email||'').localeCompare(b.email||''));
  const usersSelect = usersSelectRaw.map(u=>({ id:u.id, name:u.email }));
  const assignedUserIds = new Set(seigneurs.filter(s=>s.user_id).map(s=>s.user_id));
  const userSelectFn = (item) => usersSelect.filter(u=>!assignedUserIds.has(u.id) || (item && u.id===item.user_id));
  const seigneursById = seigneurs.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableSeigneurs'), seigneursById, {
    endpoint:'seigneurs',
    fields:['name','user_id','religion_id','overlord_id','player','bishop'],
    selects:{user_id:userSelectFn, religion_id:religionsSelect, overlord_id:seigneursSelect, player:yesNoSelect, bishop:yesNoSelect},
    labels:{name:'Nom', user_id:'Utilisateur', religion_id:'Religion', overlord_id:'Suzerain', player:'Joueur', bishop:'Évêque'}
  });
}

async function loadEmpires(){
  const [empires,seigneurs] = await Promise.all([
    getData('empires','/api/empires'),
    getData('seigneurs','/api/seigneurs')
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const empiresById = empires.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableEmpires'), empiresById, {
    endpoint:'empires',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre'}
  });
}

async function loadKingdoms(){
  const [kingdoms,seigneurs,empires] = await Promise.all([
    getData('kingdoms','/api/kingdoms'),
    getData('seigneurs','/api/seigneurs'),
    getData('empires','/api/empires'),
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const empiresSelect = empires.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const kingdomsById = kingdoms.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableKingdoms'), kingdomsById, {
    endpoint:'kingdoms',
    fields:['name','seigneur_id','empire_id'],
    selects:{seigneur_id:seigneursSelect, empire_id:empiresSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', empire_id:'Empire'}
  });
}

async function loadArchduchies(){
  const [archduchies,seigneurs] = await Promise.all([
    getData('archduchies','/api/archduchies'),
    getData('seigneurs','/api/seigneurs'),
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const archduchiesById = archduchies.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableArchduchies'), archduchiesById, {
    endpoint:'archduchies',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre'}
  });
}

async function loadDuchies(){
  const [duchies,seigneurs,kingdoms,archduchies] = await Promise.all([
    getData('duchies','/api/duchies'),
    getData('seigneurs','/api/seigneurs'),
    getData('kingdoms','/api/kingdoms'),
    getData('archduchies','/api/archduchies'),
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const kingdomsSelect = kingdoms.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const archduchiesSelect = archduchies.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const duchiesById = duchies.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableDuchies'), duchiesById, {
    endpoint:'duchies',
    fields:['name','seigneur_id','kingdom_id','archduchy_id'],
    selects:{seigneur_id:seigneursSelect, kingdom_id:kingdomsSelect, archduchy_id:archduchiesSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', kingdom_id:'Royaume', archduchy_id:'Archiduché'}
  });
}

async function loadMarquisates(){
  const [marquisates,seigneurs] = await Promise.all([
    getData('marquisates','/api/marquisates'),
    getData('seigneurs','/api/seigneurs'),
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const marquisatesById = marquisates.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableMarquisates'), marquisatesById, {
    endpoint:'marquisates',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre'}
  });
}

async function loadCounties(){
  const [counties,seigneurs,duchies,marquisates] = await Promise.all([
    getData('counties','/api/counties'),
    getData('seigneurs','/api/seigneurs'),
    getData('duchies','/api/duchies'),
    getData('marquisates','/api/marquisates'),
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const duchiesSelect = duchies.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const marquisatesSelect = marquisates.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const countiesById = counties.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableCounties'), countiesById, {
    endpoint:'counties',
    fields:['name','seigneur_id','duchy_id','marquisate_id'],
    selects:{seigneur_id:seigneursSelect, duchy_id:duchiesSelect, marquisate_id:marquisatesSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', duchy_id:'Duché', marquisate_id:'Marquisat'}
  });
}

async function loadViscounties(){
  const [viscounties,seigneurs] = await Promise.all([
    getData('viscounties','/api/viscounties'),
    getData('seigneurs','/api/seigneurs'),
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const viscountiesById = viscounties.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableViscounties'), viscountiesById, {
    endpoint:'viscounties',
    fields:['name','seigneur_id'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre'}
  });
}

async function loadMaritimeZones(){
  const [zones, seigneurs] = await Promise.all([
    getData('maritime_zones','/api/maritime_zones'),
    getData('seigneurs','/api/seigneurs'),
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const zonesById = zones.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableMaritime'), zonesById, {
    endpoint:'maritime_zones',
    fields:['name','seigneur_id'],
    selects:{ seigneur_id: seigneursSelect },
    labels:{ name:'Nom', seigneur_id:'Seigneur maritime' },
    nullLabels:{ seigneur_id:'Aucun' }
  });
}

async function loadSeigneuries(){
  const [seigneuries,baronies,seigneurs] = await Promise.all([
    getData('seigneuries','/api/seigneuries'),
    getData('baronies','/api/baronies'),
    getData('seigneurs','/api/seigneurs'),
  ]);
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const baroniesSelect = baronies.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const seigneuriesById = seigneuries.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableSeigneuries'), seigneuriesById, {
    endpoint:'seigneuries',
    fields:['baronnie_id','seigneur_id','population',...inventaireFields],
    selects:{baronnie_id:baroniesSelect, seigneur_id:seigneursSelect},
    labels:{baronnie_id:'Baronnie', seigneur_id:'Seigneur', population:'Population',...inventaireLabels},
    beforeSave:(payload,item)=>{ if(item && item.inventaire_id) payload.inventaire_id = item.inventaire_id; }
  });
}

async function loadBaronies(){
  const [baronies,seigneurs,religions,cultures,counties,viscounties,canonicalLands] = await Promise.all([
    getData('baronies','/api/baronies'),
    getData('seigneurs','/api/seigneurs'),
    getData('religions','/api/religions'),
    getData('cultures','/api/cultures'),
    getData('counties','/api/counties'),
    getData('viscounties','/api/viscounties'),
    fetchJSON('/api/canonical_lands')
  ]);
  dataCache.canonical_lands = canonicalLands;
  const seigneursSelect = seigneurs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const religionsSelect = religions.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const culturesSelect = cultures.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const countiesSelect = counties.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const viscountiesSelect = viscounties.slice().sort((a,b)=>a.name.localeCompare(b.name));
  canonicalLandMap = {};
  canonicalLands.forEach(cl => {
    const key = canonicalKey(cl.canonical_barony_id);
    if (!canonicalLandMap[key]) canonicalLandMap[key] = [];
    canonicalLandMap[key].push(cl.barony_id);
  });
  const baroniesById = baronies.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableBaronies'), baroniesById, {
    endpoint:'baronies',
    fields:baronyFields,
    selects:{
      seigneur_id:seigneursSelect,
      religion_pop_id:religionsSelect,
      culture_id:culturesSelect,
      county_id:countiesSelect,
      viscounty_id:viscountiesSelect,
      priory_religion_id:religionsSelect,
      church_religion_id:religionsSelect,
      cathedral_religion_id:religionsSelect,
    },
    labels:baronyLabels,
    nullLabels:{
      seigneur_id:'Aucun',
      religion_pop_id:'Aucune',
      culture_id:'Aucune',
      county_id:'Aucun',
      viscounty_id:'Aucune',
      priory_religion_id:'Aucun',
      church_religion_id:'Aucune',
      cathedral_religion_id:'Aucune'
    },
    extraColumns:[
      {
        label:'Terres canoniques',
        render:item => createCanonicalCell(item, baroniesById)
      }
    ]
  });
}

async function ensureTags(){
  const tags = await getData('tags','/api/tags');
  tagsSelect = tags.slice().sort((a,b)=>a.label.localeCompare(b.label)).map(t=>({ id:t.id, name:t.label }));
  return tags;
}

async function ensureBatimentSelects(){
  const [buildingProps, infraProps] = await Promise.all([
    getData('building_properties','/api/building_properties'),
    getData('infrastructure_properties','/api/infrastructure_properties'),
  ]);
  buildingPropsSelect = buildingProps.map(b=>({ id:b.id, name:b.label || b.type }));
  infraPropsSelect = infraProps.map(i=>({ id:i.id, name:i.label || i.type }));
}

async function ensureEffectsData(){
  await Promise.all([ensureBatimentSelects(), ensureTags()]);
}

async function loadBaronyProps(){
  await ensureEffectsData();
  const [baronyProps, baronies] = await Promise.all([
    getData('barony_properties','/api/barony_properties'),
    getData('baronies','/api/baronies'),
  ]);
  const baroniesSelect = baronies.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const baronyPropsById = baronyProps.slice().sort((a,b)=>a.id - b.id);
  const boolSelects = {};
  baronyPropBoolFields.forEach(f=>{ boolSelects[f] = yesNoSelect; });
  renderTable(document.getElementById('tableBaronyProps'), baronyPropsById, {
    endpoint:'barony_properties',
    fields:baronyPropFields,
    selects:{barony_id:baroniesSelect, ...boolSelects},
    labels:baronyPropLabels
  });
}

async function loadBatiments(){
  await ensureEffectsData();
  const [buildingProps, infraProps] = await Promise.all([
    getData('building_properties','/api/building_properties'),
    getData('infrastructure_properties','/api/infrastructure_properties'),
  ]);
  const buildingPropsById = buildingProps.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableBuildingProps'), buildingPropsById, {
    endpoint:'building_properties',
    fields:buildingPropFields,
    labels:buildingPropLabels,
    selects:{produces: resourceSelect},
    allowedEffectTypes:['tag']
  });
  const infraPropsById = infraProps.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableInfraProps'), infraPropsById, {
    endpoint:'infrastructure_properties',
    fields:infraPropFields,
    labels:infraPropLabels,
    selects:{type:typeSelect}
  });
}

async function loadSpells(){
  await ensureEffectsData();
  const spells = await getData('spells','/api/spells');
  const spellsById = spells.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableSpells'), spellsById, {
    endpoint:'spells',
    fields:spellFields,
    labels:spellLabels,
    selects:{ type:[{id:'base',name:'Base'},{id:'advanced',name:'Avancé'}] },
    allowedEffectTypes:['variable_production','random_luxury']
  });
}

async function loadTags(){
  const tags = await ensureTags();
  const tagsById = tags.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableTags'), tagsById, {
    endpoint:'tags',
    fields:['label'],
    labels:{label:'Nom'}
  });
}

function showLoading(panel, show){
  const el = panel.querySelector('.tab-loading');
  if(el) el.style.display = show ? '' : 'none';
}

const tabLoaders = {
  seigneurs: loadSeigneurs,
  religions: loadReligions,
  cultures: loadCultures,
  empires: loadEmpires,
  kingdoms: loadKingdoms,
  archduchies: loadArchduchies,
  duchies: loadDuchies,
  marquisates: loadMarquisates,
  counties: loadCounties,
  viscounties: loadViscounties,
  maritime: loadMaritimeZones,
  seigneuries: loadSeigneuries,
  baronies: loadBaronies,
  batiments: loadBatiments,
  spells: loadSpells,
  tags: loadTags,
  baronyprops: loadBaronyProps,
};

document.addEventListener('DOMContentLoaded', ()=>{
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      buttons.forEach(b=>b.classList.remove('active'));
      panels.forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('tab-'+btn.dataset.tab);
      panel.classList.add('active');
      if(!tabLoaded[btn.dataset.tab] && tabLoaders[btn.dataset.tab]){
        tabLoaded[btn.dataset.tab] = true;
        showLoading(panel, true);
        tabLoaders[btn.dataset.tab]().finally(()=>showLoading(panel,false));
      }
    });
  });
  const first = document.querySelector('.tab-btn.active');
  if(first){
    const panel = document.getElementById('tab-'+first.dataset.tab);
    tabLoaded[first.dataset.tab] = true;
    showLoading(panel,true);
    tabLoaders[first.dataset.tab]().finally(()=>showLoading(panel,false));
  }
});
