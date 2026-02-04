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
const BOOLEAN_TOGGLE_CLASS = 'boolean-toggle';
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

const baronyFields = ['name','seigneur_id','religion_pop_id','culture_id','county_id','viscounty_id','defacto_county_id','defacto_viscounty_id','priory_religion_id','church_religion_id','cathedral_religion_id','vacant','color'];
const baronyLabels = {
  name:'Nom',
  seigneur_id:'Seigneur',
  religion_pop_id:'Religion (population)',
  culture_id:'Culture',
  county_id:'Comté',
  viscounty_id:'Vicomté',
  defacto_county_id:'Comté de facto',
  defacto_viscounty_id:'Vicomté de facto',
  priory_religion_id:'Prieuré',
  church_religion_id:'Église',
  cathedral_religion_id:'Cathédrale',
  vacant:'Vacante',
  color:'Couleur'
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
let canonicalDependents = {};
let sanctuaryMap = {};
const relationUpdaters = {};
const compareByField = (field) => (a, b) => (a?.[field] || '').localeCompare(b?.[field] || '');
const sortByName = (items) => items.slice().sort(compareByField('name'));
const maxOptions = [
  ...Array.from({length:10}, (_,i)=>({ id:String(i+1), name:String(i+1) })),
  ...baronyPropIntFields.map(f=>({ id:f, name:baronyPropLabels[f] || f })),
  { id:'tag', name:'Par tag' }
];
const LOG_PAGE_SIZES = [10, 25, 50, 100];
const LOG_QUERY_KEYS = ['table', 'action', 'userType', 'recordId', 'userId', 'startDate', 'endDate'];
const LOG_ACTION_TRANSLATIONS = {
  add: 'Ajout',
  approve: 'Approbation',
  archive: 'Archivage',
  assign: 'Attribution',
  create: 'Création',
  deactivate: 'Désactivation',
  delete: 'Suppression',
  disable: 'Désactivation',
  edit: 'Modification',
  enable: 'Activation',
  export: 'Exportation',
  import: 'Importation',
  insert: 'Création',
  invalidate: 'Invalidation',
  publish: 'Publication',
  reject: 'Rejet',
  remove: 'Suppression',
  reset: 'Réinitialisation',
  restore: 'Restauration',
  revoke: 'Révocation',
  toggle: 'Basculement',
  unassign: "Retrait d'attribution",
  unpublish: 'Dépublication',
  update: 'Mise à jour',
  validate: 'Validation'
};
const DEFAULT_LOG_FILTERS = {
  table: '',
  action: '',
  userType: '',
  recordId: '',
  userId: '',
  startDate: '',
  endDate: '',
  exactDate: ''
};
const logState = {
  page: 1,
  perPage: 25,
  total: 0,
  entries: [],
  filters: { ...DEFAULT_LOG_FILTERS },
  options: { tables: [], actions: [], adminUsers: [] }
};
let logFiltersInitialized = false;
let logAdminOptionsLoaded = false;
const columnPreferences = {};
let columnPreferencesLoaded = false;
let tradeRoutesState = {
  baronies: [],
  baronyMap: {},
  adjacency: {},
  routes: []
};
let tradeLinesState = {
  baronies: [],
  baronyMap: {},
  zones: [],
  zoneMap: {},
  adjacency: {},
  baronyZones: {},
  lines: []
};
const tradeRouteDialogState = {
  mode: 'create',
  routeId: null,
  selections: []
};
const tradeLineDialogState = {
  mode: 'create',
  lineId: null,
  selections: []
};

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

function parseTradeRoutePath(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(val => parseInt(val, 10)).filter(Number.isFinite);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(val => parseInt(val, 10)).filter(Number.isFinite);
    } catch (err) {
      return [];
    }
  }
  return [];
}

function parseTradeLinePath(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(val => parseInt(val, 10)).filter(Number.isFinite);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(val => parseInt(val, 10)).filter(Number.isFinite);
    } catch (err) {
      return [];
    }
  }
  return [];
}

function buildAdjacencyMap(connections, key1 = 'barony_id_1', key2 = 'barony_id_2') {
  const adj = {};
  connections.forEach(c => {
    const id1 = parseInt(c[key1], 10);
    const id2 = parseInt(c[key2], 10);
    if (!id1 || !id2) return;
    const dist = parseInt(c.distance, 10) || 1;
    if (!adj[id1]) adj[id1] = [];
    if (!adj[id2]) adj[id2] = [];
    adj[id1].push({ id: id2, distance: dist });
    adj[id2].push({ id: id1, distance: dist });
  });
  return adj;
}

function computeShortestPath(startId, endId, adjacency) {
  if (!startId || !endId) return null;
  if (startId === endId) return { path: [startId], distance: 0 };
  const dist = {};
  const prev = {};
  const queue = [];
  dist[startId] = 0;
  queue.push({ id: startId, dist: 0 });
  while (queue.length) {
    let bestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].dist < queue[bestIndex].dist) bestIndex = i;
    }
    const curEntry = queue.splice(bestIndex, 1)[0];
    if (!curEntry) continue;
    const cur = curEntry.id;
    if (curEntry.dist !== dist[cur]) continue;
    if (cur === endId) break;
    (adjacency[cur] || []).forEach(n => {
      const nextId = parseInt(n.id, 10);
      if (!nextId) return;
      const weight = parseInt(n.distance, 10) || 1;
      const nextDist = dist[cur] + weight;
      if (dist[nextId] == null || nextDist < dist[nextId]) {
        dist[nextId] = nextDist;
        prev[nextId] = cur;
        queue.push({ id: nextId, dist: nextDist });
      }
    });
  }
  if (dist[endId] == null) return null;
  const path = [];
  let cur = endId;
  while (cur != null) {
    path.push(cur);
    if (cur === startId) break;
    cur = prev[cur];
  }
  if (path[path.length - 1] !== startId) return null;
  path.reverse();
  return { path, distance: dist[endId] };
}

async function loadColumnPreferences() {
  try {
    const resp = await fetchJSON('/api/admin/table_preferences');
    if (resp && resp.preferences && typeof resp.preferences === 'object') {
      Object.entries(resp.preferences).forEach(([tableKey, hidden]) => {
        columnPreferences[tableKey] = Array.isArray(hidden) ? hidden.filter(col => typeof col === 'string') : [];
      });
    }
  } catch (error) {
    console.warn('Impossible de charger les préférences de colonnes.', error);
  } finally {
    columnPreferencesLoaded = true;
  }
}

function getHiddenColumns(tableKey) {
  if (!tableKey) return [];
  return columnPreferences[tableKey] || [];
}

async function saveHiddenColumns(tableKey, hiddenColumns) {
  if (!tableKey) return false;
  const resp = await fetchJSON(`/api/admin/table_preferences/${encodeURIComponent(tableKey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden_columns: hiddenColumns })
  });
  if (resp && resp.error) {
    alert(`Erreur : ${resp.error}`);
    return false;
  }
  columnPreferences[tableKey] = hiddenColumns;
  return true;
}

let columnPreferencesDialogReady = false;
let activeColumnPreferences = null;

function ensureColumnPreferencesDialog() {
  if (columnPreferencesDialogReady) return;
  const dialog = document.getElementById('columnPreferencesDialog');
  if (!dialog) return;
  const cancelBtn = document.getElementById('columnPreferencesCancel');
  const form = document.getElementById('columnPreferencesForm');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => dialog.close());
  }
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!activeColumnPreferences) return;
      const content = dialog.querySelector('.column-preferences-content');
      const hiddenColumns = [];
      content.querySelectorAll('input[type="checkbox"]').forEach(input => {
        if (!input.checked) hiddenColumns.push(input.value);
      });
      const shouldClose = await activeColumnPreferences.onSave(hiddenColumns);
      if (shouldClose !== false) dialog.close();
    });
  }
  columnPreferencesDialogReady = true;
}

function openColumnPreferencesDialog({ tableKey, tableLabel, columns, hiddenColumns, onSave }) {
  ensureColumnPreferencesDialog();
  const dialog = document.getElementById('columnPreferencesDialog');
  if (!dialog) return;
  const title = dialog.querySelector('h3');
  const content = dialog.querySelector('.column-preferences-content');
  const label = tableLabel || tableKey || '';
  if (title) {
    title.textContent = label ? `Colonnes visibles (${label})` : 'Colonnes visibles';
  }
  if (content) {
    content.innerHTML = '';
    columns.forEach(col => {
      const item = document.createElement('label');
      item.className = 'column-preferences-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = col.key;
      checkbox.checked = !hiddenColumns.has(col.key);
      const span = document.createElement('span');
      span.textContent = col.label || col.key;
      item.appendChild(checkbox);
      item.appendChild(span);
      content.appendChild(item);
    });
  }
  activeColumnPreferences = { tableKey, onSave };
  dialog.showModal();
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

function formatDetailValue(val){
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') {
    if (typeof val.points === 'number') return `${val.points} points`;
    if (val.compressed && !val.points) return 'Données compressées';
    const entries = Object.entries(val);
    const preview = entries.slice(0, 3).map(([k, v]) => `${k}: ${v}`);
    if (entries.length > 3) preview.push('…');
    return `{ ${preview.join(', ')} }`;
  }
  return String(val);
}

function buildLogTooltip(entry){
  const details = entry.details || {};
  const changes = details.changes || {};
  const lines = [];
  const tableName = entry.table || entry.table_name || details.table;
  const recordId = details.key ?? entry.record_id ?? entry.recordId;
  const actionName = entry.action || details.action;
  if (tableName) lines.push(`Table : '${tableName}'`);
  if (actionName) lines.push(`Action : '${getActionLabelFr(actionName)}'`);
  if (recordId !== undefined && recordId !== null) lines.push(`ID cible : '${recordId}'`);
  const entries = Object.entries(changes);
  if (entries.length) {
    lines.push('Champs :');
    entries.forEach(([field, change]) => {
      lines.push(`\t'${field}': ${formatDetailValue(change.before)} -> ${formatDetailValue(change.after)}`);
    });
  } else {
    lines.push('Champs : aucun changement enregistré');
  }
  return lines.join('\n');
}

function parseLogDate(ts){
  if(!ts) return null;
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)
    ? ts
    : `${ts.includes('T') ? ts : ts.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatLocalDateInput(value, { dateOnly = false } = {}) {
  if (!value) return '';
  const d = parseLogDate(value);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (dateOnly) return datePart;
  return `${datePart}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoOrEmpty(value, endOfDay = false) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  }
  return d.toISOString();
}

function getActionLabelFr(action) {
  if (!action) return '';
  const normalized = action.toLowerCase().trim();
  if (LOG_ACTION_TRANSLATIONS[normalized]) return LOG_ACTION_TRANSLATIONS[normalized];
  const cleaned = normalized.replace(/[_-]+/g, ' ');
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : action;
}

function formatUserDisplayName(user) {
  if (!user) return '';
  const parts = [user.first_name, user.last_name].filter(Boolean);
  if (parts.length) return parts.join(' ').trim();
  return user.email || '';
}

async function ensureLogAdminOptions() {
  if (logAdminOptionsLoaded) return;
  const users = await getData('users', '/api/users');
  const admins = users
    .filter((u) => u.is_admin)
    .map((u) => ({ id: u.id, name: formatUserDisplayName(u) || u.email || `Admin #${u.id}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
  logState.options.adminUsers = admins;
  logAdminOptionsLoaded = true;
  populateLogFilterOptions();
}

function populateLogFilterOptions() {
  const tableSelect = document.getElementById('logsTableFilter');
  if (tableSelect) {
    const seenTables = new Set();
    tableSelect.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Toutes les tables';
    tableSelect.appendChild(defaultOpt);
    (logState.options.tables || []).forEach((name) => {
      if (!name || seenTables.has(name)) return;
      seenTables.add(name);
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      tableSelect.appendChild(opt);
    });
    tableSelect.value = seenTables.has(logState.filters.table) ? logState.filters.table : '';
  }
  const userSelect = document.getElementById('logsUserFilter');
  if (userSelect) {
    userSelect.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Tous';
    userSelect.appendChild(defaultOpt);
    const nonAdminOpt = document.createElement('option');
    nonAdminOpt.value = 'non-admin';
    nonAdminOpt.textContent = 'Non-admin';
    userSelect.appendChild(nonAdminOpt);
    (logState.options.adminUsers || []).forEach((user) => {
      const opt = document.createElement('option');
      opt.value = String(user.id);
      opt.textContent = user.name;
      userSelect.appendChild(opt);
    });
    let selected = '';
    if (logState.filters.userType === 'non-admin') {
      selected = 'non-admin';
    } else if (logState.filters.userId && (logState.options.adminUsers || []).some((u) => String(u.id) === String(logState.filters.userId))) {
      selected = String(logState.filters.userId);
    }
    userSelect.value = selected;
  }
}

function populateLogActionOptions() {
  const actionSelect = document.getElementById('logsActionFilterAdvanced');
  if (!actionSelect) return;
  const seenActions = new Set();
  actionSelect.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Toutes les actions';
  actionSelect.appendChild(defaultOpt);
  (logState.options.actions || []).forEach((name) => {
    const normalized = name ? name.trim() : '';
    if (!normalized || seenActions.has(normalized)) return;
    seenActions.add(normalized);
    const opt = document.createElement('option');
    opt.value = normalized;
    opt.textContent = getActionLabelFr(normalized);
    actionSelect.appendChild(opt);
  });
  if (logState.filters.action && !seenActions.has(logState.filters.action)) {
    const opt = document.createElement('option');
    opt.value = logState.filters.action;
    opt.textContent = getActionLabelFr(logState.filters.action);
    actionSelect.appendChild(opt);
  }
  actionSelect.value = logState.filters.action || '';
}

function renderLogFilterSummary() {
  const summary = document.getElementById('logFilterSummary');
  if (!summary) return;
  const parts = [];
  if (logState.filters.table) parts.push(`Table : ${logState.filters.table}`);
  if (logState.filters.action) parts.push(`Action : ${getActionLabelFr(logState.filters.action)}`);
  const userLabel = (() => {
    if (logState.filters.userType === 'non-admin') return 'Non-admin';
    if (logState.filters.userId) {
      const match = (logState.options.adminUsers || []).find((u) => String(u.id) === String(logState.filters.userId));
      return match ? match.name : `Utilisateur #${logState.filters.userId}`;
    }
    return '';
  })();
  if (userLabel) parts.push(`Utilisateur : ${userLabel}`);
  if (logState.filters.recordId) parts.push(`ID cible : ${logState.filters.recordId}`);
  if (logState.filters.startDate && logState.filters.endDate && logState.filters.exactDate) {
    const exact = formatLocalDateInput(logState.filters.startDate, { dateOnly: true });
    if (exact) parts.push(`Date : ${exact}`);
  } else {
    if (logState.filters.startDate) {
      const val = formatLocalDateInput(logState.filters.startDate);
      if (val) parts.push(`Après : ${val}`);
    }
    if (logState.filters.endDate) {
      const val = formatLocalDateInput(logState.filters.endDate);
      if (val) parts.push(`Avant : ${val}`);
    }
  }

  summary.textContent = parts.length ? `Filtres actifs — ${parts.join(' · ')}` : '';
  summary.style.display = parts.length ? '' : 'none';
}

function syncAdvancedFilterInputs() {
  const afterInput = document.getElementById('logsAfter');
  if (afterInput) afterInput.value = formatLocalDateInput(logState.filters.startDate);
  const beforeInput = document.getElementById('logsBefore');
  if (beforeInput) beforeInput.value = formatLocalDateInput(logState.filters.endDate);
  const exactInput = document.getElementById('logsExactDate');
  if (exactInput) exactInput.value = logState.filters.exactDate || '';
  const actionSelect = document.getElementById('logsActionFilterAdvanced');
  if (actionSelect) actionSelect.value = logState.filters.action || '';
  const recordInput = document.getElementById('logsRecordId');
  if (recordInput) recordInput.value = logState.filters.recordId || '';
}

function openLogAdvancedDialog() {
  const dialog = document.getElementById('logAdvancedDialog');
  if (!dialog) return;
  syncAdvancedFilterInputs();
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute('open', 'open');
}

function closeLogAdvancedDialog() {
  const dialog = document.getElementById('logAdvancedDialog');
  if (!dialog) return;
  if (dialog.close) dialog.close();
  else dialog.removeAttribute('open');
}

function applyAdvancedLogFilters(e) {
  e.preventDefault();
  const form = e.target;
  const afterVal = form.querySelector('#logsAfter')?.value || '';
  const beforeVal = form.querySelector('#logsBefore')?.value || '';
  const exactVal = form.querySelector('#logsExactDate')?.value || '';
  const actionVal = form.querySelector('#logsActionFilterAdvanced')?.value || '';
  const recordId = (form.querySelector('#logsRecordId')?.value || '').trim();
  logState.filters.recordId = recordId;
  logState.filters.action = actionVal;

  if (exactVal) {
    logState.filters.exactDate = exactVal;
    logState.filters.startDate = toIsoOrEmpty(`${exactVal}T00:00:00`);
    logState.filters.endDate = toIsoOrEmpty(`${exactVal}T23:59:59`);
  } else {
    logState.filters.exactDate = '';
    logState.filters.startDate = toIsoOrEmpty(afterVal);
    logState.filters.endDate = toIsoOrEmpty(beforeVal);
  }

  closeLogAdvancedDialog();
  loadLogs(1);
  renderLogFilterSummary();
}

function resetLogFilters() {
  logState.filters = { ...DEFAULT_LOG_FILTERS };
  populateLogFilterOptions();
  populateLogActionOptions();
  syncAdvancedFilterInputs();
  renderLogFilterSummary();
  loadLogs(1);
}

function initLogFilters() {
  if (logFiltersInitialized) return;
  const tableSelect = document.getElementById('logsTableFilter');
  if (tableSelect) {
    tableSelect.addEventListener('change', () => {
      logState.filters.table = tableSelect.value;
      loadLogs(1);
    });
  }
  const userSelect = document.getElementById('logsUserFilter');
  if (userSelect) {
    userSelect.addEventListener('change', () => {
      const val = userSelect.value;
      if (val === 'non-admin') {
        logState.filters.userType = 'non-admin';
        logState.filters.userId = '';
      } else if (val) {
        logState.filters.userId = val;
        logState.filters.userType = '';
      } else {
        logState.filters.userId = '';
        logState.filters.userType = '';
      }
      loadLogs(1);
    });
  }
  const advancedBtn = document.getElementById('logsAdvancedBtn');
  if (advancedBtn) advancedBtn.addEventListener('click', openLogAdvancedDialog);
  const resetBtn = document.getElementById('logsResetFilters');
  if (resetBtn) resetBtn.addEventListener('click', resetLogFilters);
  const advancedForm = document.getElementById('logAdvancedForm');
  if (advancedForm) advancedForm.addEventListener('submit', applyAdvancedLogFilters);
  const closeBtn = document.getElementById('closeLogAdvanced');
  if (closeBtn) {
    closeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      closeLogAdvancedDialog();
    });
  }
  populateLogFilterOptions();
  populateLogActionOptions();
  syncAdvancedFilterInputs();
  renderLogFilterSummary();
  logFiltersInitialized = true;
}

function buildLogQueryParams(page, perPage) {
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('perPage', perPage);
  LOG_QUERY_KEYS.forEach((key) => {
    const val = logState.filters[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      params.set(key, val);
    }
  });
  return params.toString();
}

function renderLogsPagination(){
  const pagination = document.getElementById('logsPagination');
  if (!pagination) return;
  pagination.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil((logState.total || 0) / logState.perPage));
  const info = document.createElement('span');
  info.textContent = `Page ${logState.page} / ${totalPages} — ${logState.total || 0} entrées`;
  const prev = document.createElement('button');
  prev.textContent = 'Précédent';
  prev.disabled = logState.page <= 1;
  prev.addEventListener('click', () => loadLogs(logState.page - 1));
  const next = document.createElement('button');
  next.textContent = 'Suivant';
  next.disabled = logState.page >= totalPages;
  next.addEventListener('click', () => loadLogs(logState.page + 1));
  pagination.appendChild(prev);
  pagination.appendChild(info);
  pagination.appendChild(next);
}

function renderLogsTable(){
  const container = document.getElementById('tableLogs');
  if (!container) return;
  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'admin-table log-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const headers = [
    { label: 'Description', className: 'log-desc' },
    { label: 'Utilisateur', className: 'log-user' },
    { label: 'Horodatage', className: 'log-time' }
  ];
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h.label;
    if (h.className) th.className = h.className;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  const tbody = document.createElement('tbody');
  logState.entries.forEach(entry => {
    const tr = document.createElement('tr');
    const descTd = document.createElement('td');
    descTd.className = 'log-desc';
    descTd.textContent = entry.description || '';
    descTd.title = buildLogTooltip(entry);
    const userTd = document.createElement('td');
    userTd.className = 'log-user';
    const user = entry.user || {};
    const userName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email || 'Inconnu';
    userTd.textContent = userName;
    if (user.email) userTd.title = user.email;
    const timeTd = document.createElement('td');
    timeTd.className = 'log-time';
    const parsedDate = parseLogDate(entry.created_at);
    timeTd.textContent = parsedDate ? parsedDate.toLocaleString('fr-FR') : '';
    tr.appendChild(descTd);
    tr.appendChild(userTd);
    tr.appendChild(timeTd);
    tbody.appendChild(tr);
  });
  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
  renderLogsPagination();
}

function setupLogPageSize(){
  const select = document.getElementById('logsPerPage');
  if (!select || select.dataset.ready) return;
  LOG_PAGE_SIZES.forEach(size => {
    const opt = document.createElement('option');
    opt.value = size;
    opt.textContent = size;
    select.appendChild(opt);
  });
  select.value = logState.perPage;
  select.dataset.ready = '1';
  select.addEventListener('change', () => {
    logState.perPage = parseInt(select.value, 10) || logState.perPage;
    loadLogs(1);
  });
}

async function loadLogs(page = 1){
  await ensureLogAdminOptions();
  setupLogPageSize();
  initLogFilters();
  const perPage = parseInt(document.getElementById('logsPerPage')?.value, 10) || logState.perPage;
  const query = buildLogQueryParams(page, perPage);
  const resp = await fetchJSON(`/api/admin_change_logs?${query}`);
  logState.entries = resp.entries || [];
  logState.total = resp.total || 0;
  logState.page = resp.page || page;
  logState.perPage = resp.perPage || perPage;
  if (resp.options) {
    const dedupe = (list) => Array.from(new Set((list || []).filter(Boolean))).sort();
    if (resp.options.tables) logState.options.tables = dedupe(resp.options.tables);
    if (resp.options.actions) logState.options.actions = dedupe(resp.options.actions);
    populateLogFilterOptions();
    populateLogActionOptions();
  }
  renderLogsTable();
  renderLogFilterSummary();
  syncAdvancedFilterInputs();
}

function isBooleanOptionList(optList){
  if(!Array.isArray(optList) || optList.length !== 2) return false;
  const ids = optList.map(o => String(o.id)).sort();
  return ids[0] === '0' && ids[1] === '1';
}

function setBooleanToggleState(input, val){
  input.checked = !!val;
  input.indeterminate = false;
}

function createBooleanToggle(val){
  const container = document.createElement('div');
  container.className = BOOLEAN_TOGGLE_CLASS;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.boolToggle = '1';
  container.setValue = (v) => {
    setBooleanToggleState(input, v);
  };

  container.getValue = () => input.checked ? 1 : 0;

  setBooleanToggleState(input, val);

  container.appendChild(input);
  return container;
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
      const canonicalKeyId = canonicalKey(baronyId);
      const oldId = parseInt(row.dataset.canonicalId || '0', 10);
      if (oldId) {
        await fetchJSON(`/api/canonical_lands?barony_id=${oldId}&canonical_barony_id=${baronyId}`, { method: 'DELETE' });
        if (canonicalDependents[canonicalKeyId]) canonicalDependents[canonicalKeyId] = canonicalDependents[canonicalKeyId].filter(id => id !== oldId);
        if (canonicalLandMap[canonicalKey(oldId)]) canonicalLandMap[canonicalKey(oldId)] = canonicalLandMap[canonicalKey(oldId)].filter(id => id !== baronyId);
      }
      if (newId) {
        await fetchJSON('/api/canonical_lands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barony_id: newId, canonical_barony_id: baronyId })
        });
        if (!canonicalDependents[canonicalKeyId]) canonicalDependents[canonicalKeyId] = [];
        if (!canonicalDependents[canonicalKeyId].includes(newId)) canonicalDependents[canonicalKeyId].push(newId);
        if (!canonicalLandMap[canonicalKey(newId)]) canonicalLandMap[canonicalKey(newId)] = [];
        if (!canonicalLandMap[canonicalKey(newId)].includes(baronyId)) canonicalLandMap[canonicalKey(newId)].push(baronyId);
      }
      row.dataset.canonicalId = newId;
      if (onChange) onChange();
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '-';
    delBtn.addEventListener('click', async () => {
      const canonicalKeyId = canonicalKey(baronyId);
      const oldId = parseInt(row.dataset.canonicalId || '0', 10);
      if (oldId) {
        await fetchJSON(`/api/canonical_lands?barony_id=${oldId}&canonical_barony_id=${baronyId}`, { method: 'DELETE' });
        if (canonicalDependents[canonicalKeyId]) canonicalDependents[canonicalKeyId] = canonicalDependents[canonicalKeyId].filter(id => id !== oldId);
        if (canonicalLandMap[canonicalKey(oldId)]) canonicalLandMap[canonicalKey(oldId)] = canonicalLandMap[canonicalKey(oldId)].filter(id => id !== baronyId);
      }
      row.remove();
      if (onChange) onChange();
    });
    row.appendChild(sel);
    row.appendChild(delBtn);
    list.appendChild(row);
  }

  const existing = canonicalDependents[canonicalKey(baronyId)] || [];
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
    const ids = canonicalDependents[canonicalKey(item.id)] || [];
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

function createSanctuaryCell(item, religionsList){
  const container = document.createElement('div');
  const summary = document.createElement('div');
  summary.style.marginBottom = '4px';
  const btn = document.createElement('button');
  btn.type = 'button';

  const isSanctuaryActive = (sanctuary) => {
    if (!item.religion_pop_id || !sanctuary.religion_id) return false;
    return String(item.religion_pop_id) === String(sanctuary.religion_id);
  };

  const statusLabel = (sanctuary) => (isSanctuaryActive(sanctuary) ? 'actif' : 'inactif');

  function updateSummary(){
    const sanctuaries = sanctuaryMap[item.id] || [];
    btn.textContent = `Sanctuaires (${sanctuaries.length})`;
    if(!sanctuaries.length){
      summary.textContent = 'Aucun';
      return;
    }
    const labels = sanctuaries.map(s => {
      const rel = religionsList.find(r => String(r.id) === String(s.religion_id));
      const name = rel ? rel.name : s.religion_id;
      return `${name} (${statusLabel(s)})`;
    });
    const short = labels.slice(0, 3);
    if(labels.length > 3) short.push('…');
    summary.textContent = short.join(', ');
  }

  function openPopup(){
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    const popup = document.createElement('div');
    popup.className = 'popup';
    const list = document.createElement('div');

    function addRow(data = { id:null, religion_id:'' }){
      const row = document.createElement('div');
      row.className = 'cost-row';

      const sel = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = '';
      sel.appendChild(blank);
      religionsList.forEach(r => {
        const op = document.createElement('option');
        op.value = r.id;
        op.textContent = r.name;
        if(String(r.id) === String(data.religion_id)) op.selected = true;
        sel.appendChild(op);
      });

      const status = document.createElement('span');
      status.className = 'sanctuary-status';
      const updateStatus = () => {
        status.textContent = statusLabel({ religion_id: sel.value });
      };
      updateStatus();

      sel.addEventListener('change', async ()=>{
        const rid = parseInt(sel.value, 10);
        if(!rid) return;
        if(data.id){
          await fetchJSON(`/api/sanctuaries/${data.id}`, {
            method:'PUT',
            headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify({ barony_id:item.id, religion_id: rid })
          });
          data.religion_id = rid;
        } else {
          const res = await fetchJSON('/api/sanctuaries', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify({ barony_id:item.id, religion_id: rid })
          });
          data.id = res.id;
          data.religion_id = rid;
          if(!sanctuaryMap[item.id]) sanctuaryMap[item.id] = [];
          sanctuaryMap[item.id].push(data);
        }
        updateStatus();
        updateSummary();
        showSaveIndicator(container);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '-';
      delBtn.addEventListener('click', async ()=>{
        if(data.id){
          await fetchJSON(`/api/sanctuaries/${data.id}`, { method:'DELETE' });
          sanctuaryMap[item.id] = (sanctuaryMap[item.id] || []).filter(s => String(s.id) !== String(data.id));
        }
        row.remove();
        updateSummary();
        showSaveIndicator(container);
      });

      row.appendChild(sel);
      row.appendChild(status);
      row.appendChild(delBtn);
      list.appendChild(row);
    }

    (sanctuaryMap[item.id] || []).forEach(s => addRow(s));
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', ()=> addRow());
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Fermer';
    closeBtn.addEventListener('click', ()=> overlay.remove());

    popup.appendChild(list);
    popup.appendChild(addBtn);
    popup.appendChild(closeBtn);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
  }

  btn.addEventListener('click', openPopup);
  updateSummary();
  container.appendChild(summary);
  container.appendChild(btn);
  return container;
}

function registerRelationUpdater(field, parentId, fn){
  const key = canonicalKey(parentId);
  if(!relationUpdaters[field]) relationUpdaters[field] = {};
  if(!relationUpdaters[field][key]) relationUpdaters[field][key] = [];
  relationUpdaters[field][key].push(fn);
}

function notifyRelationUpdate(field, parentId){
  if(parentId === undefined || parentId === null) return;
  const key = canonicalKey(parentId);
  const list = relationUpdaters[field] && relationUpdaters[field][key];
  if(list){
    list.forEach(fn=> fn());
  }
}

function updateRenderedSelect(containerId, fields, itemId, fieldKey, value){
  const container = document.getElementById(containerId);
  const table = container && container.querySelector('table');
  if(!table) return;
  const colIndex = fields.indexOf(fieldKey);
  if(colIndex === -1) return;
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(tr => {
    const idCell = tr.children[0];
    if(!idCell) return;
    if(String(idCell.textContent.trim()) !== String(itemId)) return;
    const cell = tr.children[colIndex + 1];
    if(!cell) return;
    const toggle = cell.querySelector(`.${BOOLEAN_TOGGLE_CLASS}`);
    if(toggle && typeof toggle.setValue === 'function'){
      toggle.setValue(value);
      return;
    }
    const sel = cell.querySelector('select');
    if(sel){
      sel.value = value == null ? '' : String(value);
      return;
    }
    const checkbox = cell.querySelector('input[type="checkbox"][data-bool-toggle="1"]');
    if(checkbox){
      setBooleanToggleState(checkbox, value);
      if(typeof checkbox._updateLabel === 'function') checkbox._updateLabel();
      return;
    }
    const input = cell.querySelector('input');
    if(input){
      input.value = value == null ? '' : value;
    }
  });
}

function createRelationCell(item, children, opts){
  const { childField, endpoint, labelField = 'name', tableId, tableFields, placeholder = 'Aucun', showId = true } = opts;
  const container = document.createElement('div');
  const summary = document.createElement('div');
  summary.style.marginBottom = '4px';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Modifier';

  const getDisplayName = (child) => {
    const name = child[labelField] || child.name || child.id;
    return showId ? `${child.id} - ${name}` : name;
  };

  const compareByLabel = (a, b) => (a[labelField] || '').localeCompare(b[labelField] || '');

  const getCurrentChildren = () =>
    children
      .filter(c => String(c[childField]) === String(item.id))
      .slice()
      .sort(compareByLabel);

  const updateSummary = () => {
    const names = getCurrentChildren().map(getDisplayName);
    const short = names.slice(0, 3);
    if (names.length > 3) short.push('…');
    summary.textContent = names.length ? short.join(', ') : placeholder;
  };

  registerRelationUpdater(childField, item.id, updateSummary);

  const setParent = async (childId, parentId) => {
    const child = children.find(c => String(c.id) === String(childId));
    if (!child) return;
    const oldParent = child ? child[childField] : null;
    const payload = {};
    const fieldsForUpdate = tableFields && Array.isArray(tableFields) ? tableFields : [childField];
    fieldsForUpdate.forEach(f => {
      if (f === childField) {
        payload[f] = parentId == null ? null : parentId;
      } else {
        payload[f] = child[f] ?? null;
      }
    });
    await fetchJSON(`/api/${endpoint}/${childId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (child) child[childField] = parentId == null ? null : parentId;
    if (tableId && tableFields) updateRenderedSelect(tableId, tableFields, childId, childField, parentId);
    if (oldParent !== undefined && oldParent !== parentId) notifyRelationUpdate(childField, oldParent);
    if (parentId != null) notifyRelationUpdate(childField, parentId);
  };

  function getUsedIds(exceptRow) {
    const used = new Set();
    Array.from(list.querySelectorAll('.relation-row')).forEach(row => {
      if (row === exceptRow) return;
      const cid = parseInt(row.dataset.childId || '', 10);
      if (cid) used.add(cid);
    });
    return used;
  }

  function populateOptions(select, row) {
    const current = row ? row.dataset.childId : null;
    const used = getUsedIds(row);
    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = placeholder;
    select.appendChild(blank);
    children.slice().sort(compareByLabel).forEach(ch => {
      const op = document.createElement('option');
      op.value = ch.id;
      op.textContent = getDisplayName(ch);
      if (used.has(ch.id)) op.disabled = true;
      if (String(ch.id) === String(current)) op.selected = true;
      select.appendChild(op);
    });
  }

  function addRow(initialId = '') {
    const row = document.createElement('div');
    row.className = 'relation-row';
    row.dataset.childId = initialId;
    const sel = document.createElement('select');
    populateOptions(sel, row);
    sel.addEventListener('change', async () => {
      const prevId = parseInt(row.dataset.childId || '', 10) || null;
      const newId = sel.value ? parseInt(sel.value, 10) : null;
      if (prevId === newId) return;
      if (prevId) await setParent(prevId, null);
      if (newId) await setParent(newId, item.id);
      row.dataset.childId = newId || '';
      populateOptions(sel, row);
      updateSummary();
      showSaveIndicator(container);
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '-';
    del.addEventListener('click', async () => {
      const prevId = parseInt(row.dataset.childId || '', 10) || null;
      if (prevId) await setParent(prevId, null);
      row.remove();
      updateSummary();
      showSaveIndicator(container);
    });
    row.appendChild(sel);
    row.appendChild(del);
    list.appendChild(row);
  }

  const list = document.createElement('div');

  const existing = getCurrentChildren();
  if (existing.length) {
    existing.forEach(ch => addRow(ch.id));
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

  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.appendChild(list);
  popup.appendChild(addBtn);
  popup.appendChild(closeBtn);
  overlay.appendChild(popup);
  updateSummary();

  btn.addEventListener('click', () => {
    updateSummary();
    document.body.appendChild(overlay);
  });

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
  const normalizedExtraColumns = extraColumns.map((col, index) => ({
    ...col,
    key: col.key || `extra_${index}`,
    label: col.label || `Colonne ${index + 1}`
  }));
  const deleteConfig = opts.deleteConfig || null;
  const hasDelete = Boolean(deleteConfig);
  const tableKey = opts.tableKey || opts.endpoint || container.id || '';
  let hiddenColumns = new Set(getHiddenColumns(tableKey));
  const allowAdd = opts.allowAdd !== false;
  const relationWatch = opts.relationWatch || [];

  const captureRelationValues = (row) => {
    const res = {};
    relationWatch.forEach(f => { res[f] = row ? row[f] : null; });
    return res;
  };

  const notifyRelationChanges = (previous, updated) => {
    relationWatch.forEach(f => {
      const oldVal = previous[f];
      const newVal = updated ? updated[f] : null;
      if(oldVal !== newVal){
        notifyRelationUpdate(f, oldVal);
        notifyRelationUpdate(f, newVal);
      }
    });
  };

  const headers = [{label:'ID', key:'id'}].concat(
    opts.fields.map(f => ({
      label: opts.labels && opts.labels[f] ? opts.labels[f] : f,
      key: f
    }))
  );
  const columnMeta = [];
  const applyHiddenToCell = (cell, key) => {
    if (hiddenColumns.has(key)) {
      cell.style.display = 'none';
    }
  };
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
    columnMeta.push({ key: h.key, label: h.label, th, index: columnMeta.length });
  });
  normalizedExtraColumns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label || '';
    headRow.appendChild(th);
    columnMeta.push({ key: col.key, label: col.label || col.key, th, index: columnMeta.length });
  });
  const actionsHeader = document.createElement('th');
  const columnToggleBtn = document.createElement('button');
  columnToggleBtn.type = 'button';
  columnToggleBtn.className = 'column-toggle-btn';
  columnToggleBtn.textContent = '...';
  columnToggleBtn.title = 'Configurer les colonnes';
  columnToggleBtn.addEventListener('click', () => {
    if (!tableKey) return;
    openColumnPreferencesDialog({
      tableKey,
      tableLabel: opts.tableLabel,
      columns: columnMeta,
      hiddenColumns,
      onSave: async (newHiddenColumns) => {
        const saved = await saveHiddenColumns(tableKey, newHiddenColumns);
        if (!saved) return false;
        hiddenColumns = new Set(newHiddenColumns);
        applyColumnVisibility();
        return true;
      }
    });
  });
  actionsHeader.appendChild(columnToggleBtn);
  headRow.appendChild(actionsHeader);
  if (hasDelete) {
    const deleteHeader = document.createElement('th');
    deleteHeader.textContent = deleteConfig.label || 'Supprimer';
    headRow.appendChild(deleteHeader);
  }
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

  const applyColumnVisibility = () => {
    columnMeta.forEach(({ key, th, index }) => {
      const hidden = hiddenColumns.has(key);
      if (th) th.style.display = hidden ? 'none' : '';
      table.querySelectorAll('tbody tr').forEach(tr => {
        const cell = tr.children[index];
        if (cell) cell.style.display = hidden ? 'none' : '';
      });
    });
  };

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
    if(opts.booleanFields && opts.booleanFields.includes(field)){
      return createBooleanToggle(val);
    }
    if(field === 'description'){
      const textarea = document.createElement('textarea');
      textarea.value = val ?? '';
      return textarea;
    }
    if(opts.selects && opts.selects[field]){
      let optList = opts.selects[field];
      if (typeof optList === 'function') optList = optList(item);
      if (isBooleanOptionList(optList)) {
        return createBooleanToggle(val);
      }
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
      const wrapper = document.createElement('div');
      wrapper.className = 'color-input';
      const input = document.createElement('input');
      input.type = 'color';
      input.value = val || '#000000';
      if (!val) input.dataset.empty = '1';
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.textContent = 'Effacer';
      clearBtn.addEventListener('click', () => {
        input.dataset.empty = '1';
        input.value = '#000000';
      });
      const markFilled = () => { delete input.dataset.empty; };
      input.addEventListener('input', markFilled);
      input.addEventListener('change', markFilled);
      wrapper.getValue = () => input.dataset.empty === '1' ? null : input.value;
      wrapper.appendChild(input);
      wrapper.appendChild(clearBtn);
      return wrapper;
    }
    const input = document.createElement('input');
    input.value = val ?? '';
    return input;
  };

  const renderRow = (item)=>{
    const tr = document.createElement('tr');
    let td = document.createElement('td');
    td.textContent = item.id;
    applyHiddenToCell(td, 'id');
    tr.appendChild(td);
    opts.fields.forEach(f=>{
      td = document.createElement('td');
      td.appendChild(makeInput(item[f], f, item));
      applyHiddenToCell(td, f);
      tr.appendChild(td);
    });
    normalizedExtraColumns.forEach(col => {
      const tdExtra = document.createElement('td');
      const content = col.render ? col.render(item, tr) : document.createTextNode('');
      tdExtra.appendChild(content);
      applyHiddenToCell(tdExtra, col.key);
      tr.appendChild(tdExtra);
    });
    td = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'Enregistrer';
    btn.addEventListener('click', async ()=>{
      const previousRelations = captureRelationValues(item);
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
      const updated = { ...item, ...payload, ...(resp && typeof resp === 'object' ? resp : {}) };
      let updatedRef = updated;
      let idx = rows.findIndex(r=>r.id === item.id);
      if(idx !== -1){
        Object.assign(rows[idx], updated);
        updatedRef = rows[idx];
        item = updatedRef;
      }
      notifyRelationChanges(previousRelations, updatedRef);
      idx = rows.findIndex(r=>r.id === item.id);
      if(idx !== -1) rows[idx] = item;
      const newRow = renderRow(updatedRef);
      tbody.replaceChild(newRow, tr);
    });
    td.appendChild(btn);
    tr.appendChild(td);
    if (hasDelete) {
      const deleteTd = document.createElement('td');
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = deleteConfig.buttonLabel || 'Supprimer';
      deleteBtn.className = deleteConfig.className || 'danger';
      deleteBtn.addEventListener('click', async () => {
        const confirmation = deleteConfig.confirmMessage
          ? deleteConfig.confirmMessage(item)
          : `Confirmer la suppression définitive de l'entrée #${item.id} ?`;
        if (!window.confirm(confirmation)) return;
        try {
          const resp = await fetch(`/api/${opts.endpoint}/${item.id}`, { method: 'DELETE' });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            alert(err.error || 'Suppression impossible.');
            return;
          }
          showSaveIndicator(deleteTd);
          const idx = rows.findIndex(r => r.id === item.id);
          if (idx !== -1) {
            notifyRelationChanges(captureRelationValues(item), null);
            rows.splice(idx, 1);
          }
          renderBody();
        } catch {
          alert('Suppression impossible.');
        }
      });
      deleteTd.appendChild(deleteBtn);
      tr.appendChild(deleteTd);
    }
    return tr;
  };

  const renderBody = ()=>{
    tbody.innerHTML = '';
    const sorted = rows.slice().sort(compareRows);

    const appendAddRow = ()=>{
      const addRow = document.createElement('tr');
      const idCell = document.createElement('td');
      applyHiddenToCell(idCell, 'id');
      addRow.appendChild(idCell);
      const addInputs = {};
      opts.fields.forEach(f=>{
        const td = document.createElement('td');
        const inp = makeInput('', f, null);
        addInputs[f]=inp;
        td.appendChild(inp);
        applyHiddenToCell(td, f);
        addRow.appendChild(td);
      });
      normalizedExtraColumns.forEach(col=>{
        const td = document.createElement('td');
        td.textContent = '';
        applyHiddenToCell(td, col.key);
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
        notifyRelationChanges(captureRelationValues(null), newItem);
        renderBody();
      });
      addTd.appendChild(addBtn);
      addRow.appendChild(addTd);
      if (hasDelete) {
        const deleteTd = document.createElement('td');
        addRow.appendChild(deleteTd);
      }
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
        }else if (allowAdd){
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
      if (allowAdd) appendAddRow();
    }
    applyColumnVisibility();
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

async function loadUsers(){
  const users = await getData('users','/api/users');
  const normalizedUsers = users.map(u => ({ ...u, is_admin: u.is_admin ? 1 : 0 }));
  const usersById = normalizedUsers.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableUsers'), usersById, {
    endpoint:'users',
    fields:['email','first_name','last_name','is_admin'],
    labels:{email:'Email', first_name:'Prénom', last_name:'Nom', is_admin:'Admin'},
    selects:{is_admin:yesNoSelect},
    booleanFields:['is_admin'],
    beforeSave:(payload)=>{
      if(payload.is_admin !== undefined){
        payload.is_admin = payload.is_admin ? 1 : 0;
      }
    },
    allowAdd:false,
  });
}

async function loadSeigneurs(){
  const [seigneurs, religions, users] = await Promise.all([
    getData('seigneurs','/api/seigneurs'),
    getData('religions','/api/religions'),
    getData('users','/api/users'),
  ]);
  const seigneursSelect = sortByName(seigneurs);
  const religionsSelect = sortByName(religions);
  const usersSelectRaw = users.slice().sort(compareByField('email'));
  const usersSelect = usersSelectRaw.map(u=>({ id:u.id, name:u.email }));
  const assignedUserIds = new Set(seigneurs.filter(s=>s.user_id).map(s=>s.user_id));
  const userSelectFn = (item) => usersSelect.filter(u=>!assignedUserIds.has(u.id) || (item && u.id===item.user_id));
  const overlordSelectFn = (item) => seigneursSelect.filter(s => !item || String(s.id) !== String(item.id));
  const seigneursById = seigneurs.slice().sort((a,b)=>a.id - b.id);
  const seigneurFields = ['name','user_id','religion_id','overlord_id','player','bishop'];
  renderTable(document.getElementById('tableSeigneurs'), seigneursById, {
    endpoint:'seigneurs',
    fields:seigneurFields,
    selects:{user_id:userSelectFn, religion_id:religionsSelect, overlord_id:overlordSelectFn, player:yesNoSelect, bishop:yesNoSelect},
    labels:{name:'Nom', user_id:'Utilisateur', religion_id:'Religion', overlord_id:'Suzerain', player:'Joueur', bishop:'Évêque'},
    booleanFields:['player','bishop'],
    relationWatch:['overlord_id'],
    deleteConfig:{
      label:'Supprimer',
      className:'danger',
      confirmMessage:(item)=>`⚠️ Suppression définitive\n\nVous allez supprimer le seigneur "${item.name || 'Sans nom'}" (ID ${item.id}).\nCette action est irréversible et sera refusée si ce seigneur est encore lié à des titres, baronnies, seigneuries ou vassaux.\n\nConfirmer la suppression ?`
    },
    extraColumns:[{
      label:'Vassaux',
      render:item => createRelationCell(item, seigneursById, {
        childField:'overlord_id',
        endpoint:'seigneurs',
        tableId:'tableSeigneurs',
        tableFields: seigneurFields,
        placeholder:'Aucun vassal',
        showId:false,
      })
    }]
  });
}

async function loadEmpires(){
  const [empires,seigneurs,kingdoms] = await Promise.all([
    getData('empires','/api/empires'),
    getData('seigneurs','/api/seigneurs'),
    getData('kingdoms','/api/kingdoms'),
  ]);
  const seigneursSelect = sortByName(seigneurs);
  const empiresById = empires.slice().sort((a,b)=>a.id - b.id);
  const kingdomsByName = sortByName(kingdoms);
  const kingdomFields = ['name','seigneur_id','empire_id','defacto_empire_id','color'];
  renderTable(document.getElementById('tableEmpires'), empiresById, {
    endpoint:'empires',
    fields:['name','seigneur_id','color'],
    selects:{seigneur_id:seigneursSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', color:'Couleur'},
    colorFields:['color'],
    extraColumns:[{
      label:'Royaumes de jure',
      render:item => createRelationCell(item, kingdomsByName, {
        childField:'empire_id',
        endpoint:'kingdoms',
        tableId:'tableKingdoms',
        tableFields: kingdomFields,
        placeholder:'Aucun royaume'
      })
    }]
  });
}

async function loadKingdoms(){
  const [kingdoms,seigneurs,empires,duchies] = await Promise.all([
    getData('kingdoms','/api/kingdoms'),
    getData('seigneurs','/api/seigneurs'),
    getData('empires','/api/empires'),
    getData('duchies','/api/duchies'),
  ]);
  const seigneursSelect = sortByName(seigneurs);
  const empiresSelect = sortByName(empires);
  const kingdomsById = kingdoms.slice().sort((a,b)=>a.id - b.id);
  const duchiesByName = sortByName(duchies);
  const duchyFields = ['name','seigneur_id','kingdom_id','archduchy_id','defacto_kingdom_id','defacto_archduchy_id','color'];
  renderTable(document.getElementById('tableKingdoms'), kingdomsById, {
    endpoint:'kingdoms',
    fields:['name','seigneur_id','empire_id','defacto_empire_id','color'],
    selects:{seigneur_id:seigneursSelect, empire_id:empiresSelect, defacto_empire_id:empiresSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', empire_id:'Empire', defacto_empire_id:'Empire de facto', color:'Couleur'},
    colorFields:['color'],
    relationWatch:['empire_id'],
    extraColumns:[{
      label:'Duchés de jure',
      render:item => createRelationCell(item, duchiesByName, {
        childField:'kingdom_id',
        endpoint:'duchies',
        tableId:'tableDuchies',
        tableFields: duchyFields,
        placeholder:'Aucun duché'
      })
    }]
  });
}

async function loadArchduchies(){
  const [archduchies,seigneurs,duchies,kingdoms] = await Promise.all([
    getData('archduchies','/api/archduchies'),
    getData('seigneurs','/api/seigneurs'),
    getData('duchies','/api/duchies'),
    getData('kingdoms','/api/kingdoms'),
  ]);
  const seigneursSelect = sortByName(seigneurs);
  const kingdomsSelect = sortByName(kingdoms);
  const archduchiesById = archduchies.slice().sort((a,b)=>a.id - b.id);
  const duchiesByName = sortByName(duchies);
  const duchyFields = ['name','seigneur_id','kingdom_id','archduchy_id','defacto_kingdom_id','defacto_archduchy_id','color'];
  renderTable(document.getElementById('tableArchduchies'), archduchiesById, {
    endpoint:'archduchies',
    fields:['name','seigneur_id','defacto_kingdom_id','color'],
    selects:{seigneur_id:seigneursSelect, defacto_kingdom_id:kingdomsSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', defacto_kingdom_id:'Royaume de facto', color:'Couleur'},
    colorFields:['color'],
    extraColumns:[{
      label:'Duchés de jure',
      render:item => createRelationCell(item, duchiesByName, {
        childField:'archduchy_id',
        endpoint:'duchies',
        tableId:'tableDuchies',
        tableFields: duchyFields,
        placeholder:'Aucun duché'
      })
    }]
  });
}

async function loadDuchies(){
  const [duchies,seigneurs,kingdoms,archduchies,counties] = await Promise.all([
    getData('duchies','/api/duchies'),
    getData('seigneurs','/api/seigneurs'),
    getData('kingdoms','/api/kingdoms'),
    getData('archduchies','/api/archduchies'),
    getData('counties','/api/counties'),
  ]);
  const seigneursSelect = sortByName(seigneurs);
  const kingdomsSelect = sortByName(kingdoms);
  const archduchiesSelect = sortByName(archduchies);
  const duchiesById = duchies.slice().sort((a,b)=>a.id - b.id);
  const countiesByName = sortByName(counties);
  const countyFields = ['name','seigneur_id','duchy_id','marquisate_id','defacto_duchy_id','defacto_marquisate_id','color'];
  renderTable(document.getElementById('tableDuchies'), duchiesById, {
    endpoint:'duchies',
    fields:['name','seigneur_id','kingdom_id','archduchy_id','defacto_kingdom_id','defacto_archduchy_id','color'],
    selects:{seigneur_id:seigneursSelect, kingdom_id:kingdomsSelect, archduchy_id:archduchiesSelect, defacto_kingdom_id:kingdomsSelect, defacto_archduchy_id:archduchiesSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', kingdom_id:'Royaume', archduchy_id:'Archiduché', defacto_kingdom_id:'Royaume de facto', defacto_archduchy_id:'Archiduché de facto', color:'Couleur'},
    colorFields:['color'],
    relationWatch:['kingdom_id','archduchy_id'],
    extraColumns:[{
      label:'Comtés de jure',
      render:item => createRelationCell(item, countiesByName, {
        childField:'duchy_id',
        endpoint:'counties',
        tableId:'tableCounties',
        tableFields: countyFields,
        placeholder:'Aucun comté'
      })
    }]
  });
}

async function loadMarquisates(){
  const [marquisates,seigneurs,counties,duchies] = await Promise.all([
    getData('marquisates','/api/marquisates'),
    getData('seigneurs','/api/seigneurs'),
    getData('counties','/api/counties'),
    getData('duchies','/api/duchies'),
  ]);
  const seigneursSelect = sortByName(seigneurs);
  const duchiesSelect = sortByName(duchies);
  const marquisatesById = marquisates.slice().sort((a,b)=>a.id - b.id);
  const countiesByName = sortByName(counties);
  const countyFields = ['name','seigneur_id','duchy_id','marquisate_id','defacto_duchy_id','defacto_marquisate_id','color'];
  renderTable(document.getElementById('tableMarquisates'), marquisatesById, {
    endpoint:'marquisates',
    fields:['name','seigneur_id','defacto_duchy_id','color'],
    selects:{seigneur_id:seigneursSelect, defacto_duchy_id:duchiesSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', defacto_duchy_id:'Duché de facto', color:'Couleur'},
    colorFields:['color'],
    extraColumns:[{
      label:'Comtés de jure',
      render:item => createRelationCell(item, countiesByName, {
        childField:'marquisate_id',
        endpoint:'counties',
        tableId:'tableCounties',
        tableFields: countyFields,
        placeholder:'Aucun comté'
      })
    }]
  });
}

async function loadCounties(){
  const [counties,seigneurs,duchies,marquisates,baronies] = await Promise.all([
    getData('counties','/api/counties'),
    getData('seigneurs','/api/seigneurs'),
    getData('duchies','/api/duchies'),
    getData('marquisates','/api/marquisates'),
    getData('baronies','/api/baronies'),
  ]);
  const seigneursSelect = sortByName(seigneurs);
  const duchiesSelect = sortByName(duchies);
  const marquisatesSelect = sortByName(marquisates);
  const countiesById = counties.slice().sort((a,b)=>a.id - b.id);
  const baroniesByName = sortByName(baronies);
  const baronyFieldList = baronyFields;
  const countyFields = ['name','seigneur_id','duchy_id','marquisate_id','defacto_duchy_id','defacto_marquisate_id','color'];
  renderTable(document.getElementById('tableCounties'), countiesById, {
    endpoint:'counties',
    fields:['name','seigneur_id','duchy_id','marquisate_id','defacto_duchy_id','defacto_marquisate_id','color'],
    selects:{seigneur_id:seigneursSelect, duchy_id:duchiesSelect, marquisate_id:marquisatesSelect, defacto_duchy_id:duchiesSelect, defacto_marquisate_id:marquisatesSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', duchy_id:'Duché', marquisate_id:'Marquisat', defacto_duchy_id:'Duché de facto', defacto_marquisate_id:'Marquisat de facto', color:'Couleur'},
    colorFields:['color'],
    relationWatch:['duchy_id','marquisate_id'],
    extraColumns:[{
      label:'Baronnies de jure',
      render:item => createRelationCell(item, baroniesByName, {
        childField:'county_id',
        endpoint:'baronies',
        tableId:'tableBaronies',
        tableFields: baronyFieldList,
        placeholder:'Aucune baronnie'
      })
    }]
  });
}

async function loadViscounties(){
  const [viscounties,seigneurs,baronies,counties] = await Promise.all([
    getData('viscounties','/api/viscounties'),
    getData('seigneurs','/api/seigneurs'),
    getData('baronies','/api/baronies'),
    getData('counties','/api/counties'),
  ]);
  const seigneursSelect = sortByName(seigneurs);
  const countiesSelect = sortByName(counties);
  const viscountiesById = viscounties.slice().sort((a,b)=>a.id - b.id);
  const baroniesByName = baronies
    .slice()
    .sort((a,b)=>String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity:'base' }));
  const baronyFieldList = baronyFields;
  renderTable(document.getElementById('tableViscounties'), viscountiesById, {
    endpoint:'viscounties',
    fields:['name','seigneur_id','defacto_county_id','color'],
    selects:{seigneur_id:seigneursSelect, defacto_county_id:countiesSelect},
    labels:{name:'Nom', seigneur_id:'Détenteur du titre', defacto_county_id:'Comté de facto', color:'Couleur'},
    nullLabels:{ defacto_county_id:'Aucun' },
    colorFields:['color'],
    extraColumns:[{
      label:'Baronnies de jure',
      render:item => createRelationCell(item, baroniesByName, {
        childField:'viscounty_id',
        endpoint:'baronies',
        tableId:'tableBaronies',
        tableFields: baronyFieldList,
        placeholder:'Aucune baronnie'
      })
    }]
  });
}

async function loadMaritimeZones(){
  const [zones, seigneurs] = await Promise.all([
    getData('maritime_zones','/api/maritime_zones'),
    getData('seigneurs','/api/seigneurs'),
  ]);
  const seigneursSelect = sortByName(seigneurs);
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
  const seigneursSelect = sortByName(seigneurs);
  const baroniesSelect = sortByName(baronies);
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
  const [baronies,seigneurs,religions,cultures,counties,viscounties,canonicalLands,sanctuaries] = await Promise.all([
    getData('baronies','/api/baronies'),
    getData('seigneurs','/api/seigneurs'),
    getData('religions','/api/religions'),
    getData('cultures','/api/cultures'),
    getData('counties','/api/counties'),
    getData('viscounties','/api/viscounties'),
    fetchJSON('/api/canonical_lands'),
    fetchJSON('/api/sanctuaries')
  ]);
  dataCache.canonical_lands = canonicalLands;
  const seigneursSelect = sortByName(seigneurs);
  const religionsSelect = sortByName(religions);
  const culturesSelect = sortByName(cultures);
  const countiesSelect = sortByName(counties);
  const viscountiesSelect = sortByName(viscounties);
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
    sanctuaryMap[s.barony_id].push({ id:s.id, religion_id:s.religion_id });
  });
  const baroniesById = baronies.slice().sort((a,b)=>a.id - b.id);
  renderTable(document.getElementById('tableBaronies'), baroniesById, {
    endpoint:'baronies',
    fields:baronyFields,
    booleanFields:['vacant'],
    selects:{
      seigneur_id:seigneursSelect,
      religion_pop_id:religionsSelect,
      culture_id:culturesSelect,
      county_id:countiesSelect,
      viscounty_id:viscountiesSelect,
      defacto_county_id:countiesSelect,
      defacto_viscounty_id:viscountiesSelect,
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
      defacto_county_id:'Aucun',
      defacto_viscounty_id:'Aucune',
      priory_religion_id:'Aucun',
      church_religion_id:'Aucune',
      cathedral_religion_id:'Aucune'
    },
    colorFields:['color'],
    relationWatch:['county_id','viscounty_id'],
    extraColumns:[
      {
        label:'Sanctuaires',
        render:item => createSanctuaryCell(item, religionsSelect)
      },
      {
        label:'Terres canoniques (Évêché)',
        render:item => createCanonicalCell(item, baroniesById)
      }
    ]
  });
}

function formatBaronyLabel(barony) {
  if (!barony) return 'Baronnie inconnue';
  const name = barony.name || 'Sans nom';
  return `${name} (#${barony.id})`;
}

function formatZoneLabel(zone) {
  if (!zone) return 'Zone maritime inconnue';
  const name = zone.name || 'Sans nom';
  return `${name} (#${zone.id})`;
}

function populateTradeRouteBaronySelect(select, baronies) {
  if (!select) return;
  select.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Sélectionner';
  select.appendChild(blank);
  baronies.forEach(barony => {
    const option = document.createElement('option');
    option.value = barony.id;
    option.textContent = formatBaronyLabel(barony);
    select.appendChild(option);
  });
}

function getTradeRouteDialogElements() {
  return {
    dialog: document.getElementById('tradeRouteDialog'),
    form: document.getElementById('tradeRouteForm'),
    title: document.getElementById('tradeRouteDialogTitle'),
    barony1: document.getElementById('tradeRouteBarony1'),
    barony2: document.getElementById('tradeRouteBarony2'),
    startLabel: document.getElementById('tradeRouteStartLabel'),
    endLabel: document.getElementById('tradeRouteEndLabel'),
    steps: document.getElementById('tradeRouteSteps'),
    hint: document.getElementById('tradeRouteHint'),
    cancel: document.getElementById('tradeRouteCancel'),
    save: document.getElementById('tradeRouteSave')
  };
}

function updateTradeRouteLabels(startId, endId) {
  const { startLabel, endLabel } = getTradeRouteDialogElements();
  const startBarony = tradeRoutesState.baronyMap[startId];
  const endBarony = tradeRoutesState.baronyMap[endId];
  if (startLabel) {
    startLabel.textContent = startBarony ? `Baronnie 1 : ${formatBaronyLabel(startBarony)}` : 'Baronnie 1 :';
  }
  if (endLabel) {
    endLabel.textContent = endBarony ? `Baronnie 2 : ${formatBaronyLabel(endBarony)}` : 'Baronnie 2 :';
  }
}

function isTradeRoutePathComplete(startId, endId, selections) {
  if (!startId || !endId) return false;
  if (!selections || selections.length === 0) return false;
  if (selections.some(step => !step)) return false;
  return selections[selections.length - 1] === endId;
}

function renderTradeRouteSteps() {
  const { barony1, barony2, steps } = getTradeRouteDialogElements();
  if (!steps || !barony1 || !barony2) return;
  steps.innerHTML = '';
  const startId = parseInt(barony1.value, 10);
  const endId = parseInt(barony2.value, 10);
  if (!startId || !endId) return;
  const selections = tradeRouteDialogState.selections || [];
  const stepsList = selections.slice();
  const last = stepsList[stepsList.length - 1];
  if (last !== endId) {
    if (stepsList.length === 0 || stepsList[stepsList.length - 1]) {
      stepsList.push(null);
    }
  }
  const used = new Set([startId]);
  stepsList.forEach((selected, index) => {
    const prevId = index === 0 ? startId : stepsList[index - 1];
    if (!prevId) return;
    const options = (tradeRoutesState.adjacency[prevId] || [])
      .map(n => n.id)
      .filter(id => !used.has(id));
    const select = document.createElement('select');
    select.dataset.index = String(index);
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '';
    select.appendChild(blank);
    options.forEach(id => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = formatBaronyLabel(tradeRoutesState.baronyMap[id] || { id, name: `Baronnie ${id}` });
      select.appendChild(option);
    });
    if (selected) select.value = String(selected);
    select.addEventListener('change', (event) => {
      const idx = parseInt(event.target.dataset.index, 10);
      const value = parseInt(event.target.value, 10);
      const nextSelections = tradeRouteDialogState.selections.slice(0, idx);
      if (value) {
        nextSelections[idx] = value;
      }
      tradeRouteDialogState.selections = nextSelections;
      renderTradeRouteSteps();
      updateTradeRouteHint();
    });
    steps.appendChild(select);
    if (selected) used.add(selected);
  });
}

function updateTradeRouteHint(message) {
  const { barony1, barony2, hint, save } = getTradeRouteDialogElements();
  if (!hint || !save || !barony1 || !barony2) return;
  const startId = parseInt(barony1.value, 10);
  const endId = parseInt(barony2.value, 10);
  let text = message || '';
  if (!startId || !endId) {
    text = 'Sélectionnez deux baronnies pour définir un chemin.';
    save.disabled = true;
  } else if (!isTradeRoutePathComplete(startId, endId, tradeRouteDialogState.selections)) {
    text = text || 'Le chemin doit atteindre la baronnie 2 pour être enregistré.';
    save.disabled = true;
  } else {
    text = '';
    save.disabled = false;
  }
  hint.textContent = text;
}

function buildTradeRoutePath(startId, selections) {
  const path = [startId, ...(selections || [])];
  return path.filter(Boolean);
}

function autoPopulateTradeRoutePath(startId, endId) {
  const computed = computeShortestPath(startId, endId, tradeRoutesState.adjacency);
  if (!computed || !computed.path || computed.path.length < 2) {
    tradeRouteDialogState.selections = [];
    updateTradeRouteHint('Aucun chemin disponible entre ces baronnies.');
    renderTradeRouteSteps();
    return;
  }
  tradeRouteDialogState.selections = computed.path.slice(1);
  renderTradeRouteSteps();
  updateTradeRouteHint();
}

function handleTradeRouteBaronyChange() {
  const { barony1, barony2 } = getTradeRouteDialogElements();
  if (!barony1 || !barony2) return;
  const startId = parseInt(barony1.value, 10);
  const endId = parseInt(barony2.value, 10);
  updateTradeRouteLabels(startId, endId);
  tradeRouteDialogState.selections = [];
  if (tradeRouteDialogState.mode === 'create' && startId && endId) {
    autoPopulateTradeRoutePath(startId, endId);
    return;
  }
  renderTradeRouteSteps();
  updateTradeRouteHint();
}

function openTradeRouteDialog(route) {
  const elements = getTradeRouteDialogElements();
  if (!elements.dialog) return;
  ensureTradeRouteDialog();
  tradeRouteDialogState.mode = route ? 'edit' : 'create';
  tradeRouteDialogState.routeId = route ? route.id : null;
  tradeRouteDialogState.selections = [];
  if (elements.title) {
    elements.title.textContent = route ? 'Modifier la route commerciale' : 'Nouvelle route commerciale';
  }
  populateTradeRouteBaronySelect(elements.barony1, tradeRoutesState.baronies);
  populateTradeRouteBaronySelect(elements.barony2, tradeRoutesState.baronies);
  if (route) {
    elements.barony1.value = String(route.barony_id_1);
    elements.barony2.value = String(route.barony_id_2);
    const path = parseTradeRoutePath(route.path);
    if (path.length && path[0] === route.barony_id_1 && path[path.length - 1] === route.barony_id_2) {
      tradeRouteDialogState.selections = path.slice(1);
    } else if (path.length && path[0] === route.barony_id_2 && path[path.length - 1] === route.barony_id_1) {
      tradeRouteDialogState.selections = path.slice(1).reverse();
    }
  }
  updateTradeRouteLabels(
    parseInt(elements.barony1.value, 10),
    parseInt(elements.barony2.value, 10)
  );
  renderTradeRouteSteps();
  updateTradeRouteHint();
  if (elements.dialog.showModal) {
    elements.dialog.showModal();
  } else {
    elements.dialog.setAttribute('open', 'open');
  }
}

function ensureTradeRouteDialog() {
  const elements = getTradeRouteDialogElements();
  if (!elements.dialog || elements.dialog.dataset.ready) return;
  if (elements.cancel) {
    elements.cancel.addEventListener('click', () => elements.dialog.close());
  }
  if (elements.barony1) {
    elements.barony1.addEventListener('change', handleTradeRouteBaronyChange);
  }
  if (elements.barony2) {
    elements.barony2.addEventListener('change', handleTradeRouteBaronyChange);
  }
  if (elements.form) {
    elements.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const startId = parseInt(elements.barony1.value, 10);
      const endId = parseInt(elements.barony2.value, 10);
      if (!startId || !endId) {
        updateTradeRouteHint('Sélectionnez deux baronnies avant de sauvegarder.');
        return;
      }
      if (!isTradeRoutePathComplete(startId, endId, tradeRouteDialogState.selections)) {
        updateTradeRouteHint('Le chemin doit être complet pour être enregistré.');
        return;
      }
      const path = buildTradeRoutePath(startId, tradeRouteDialogState.selections);
      const payload = { barony_id_1: startId, barony_id_2: endId, path };
      const isEdit = tradeRouteDialogState.mode === 'edit' && tradeRouteDialogState.routeId;
      const endpoint = isEdit ? `/api/trade_routes/${tradeRouteDialogState.routeId}` : '/api/trade_routes';
      const method = isEdit ? 'PUT' : 'POST';
      const resp = await fetchJSON(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp && resp.error) {
        alert(`Erreur : ${resp.error}`);
        return;
      }
      elements.dialog.close();
      await loadTradeRoutes();
    });
  }
  elements.dialog.dataset.ready = 'true';
}

function renderTradeRoutesPanel() {
  const panel = document.getElementById('tradeRoutesPanel');
  if (!panel) return;
  panel.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'table-actions';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'control-btn';
  addBtn.textContent = 'Nouvelle route commerciale';
  addBtn.addEventListener('click', () => openTradeRouteDialog());
  header.appendChild(addBtn);
  panel.appendChild(header);
  if (!tradeRoutesState.routes.length) {
    const empty = document.createElement('div');
    empty.className = 'trade-route-empty';
    empty.textContent = 'Aucune route commerciale enregistrée.';
    panel.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'admin-table';
  table.innerHTML = '<tr><th>ID</th><th>Baronnie 1</th><th>Baronnie 2</th><th>Chemin</th><th>Actions</th></tr>';
  tradeRoutesState.routes
    .slice()
    .sort((a, b) => a.id - b.id)
    .forEach(route => {
      const row = document.createElement('tr');
      const path = parseTradeRoutePath(route.path);
      const barony1 = tradeRoutesState.baronyMap[route.barony_id_1] || { id: route.barony_id_1, name: `Baronnie ${route.barony_id_1}` };
      const barony2 = tradeRoutesState.baronyMap[route.barony_id_2] || { id: route.barony_id_2, name: `Baronnie ${route.barony_id_2}` };
      row.innerHTML = `
        <td>${route.id}</td>
        <td>${formatBaronyLabel(barony1)}</td>
        <td>${formatBaronyLabel(barony2)}</td>
        <td>${path.length || 0}</td>
        <td></td>
      `;
      const actionsCell = row.querySelector('td:last-child');
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'control-btn';
      editBtn.textContent = 'Chemin';
      editBtn.addEventListener('click', () => openTradeRouteDialog(route));
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger';
      deleteBtn.textContent = 'Supprimer';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Supprimer cette route commerciale ?')) return;
        const resp = await fetchJSON(`/api/trade_routes/${route.id}`, { method: 'DELETE' });
        if (resp && resp.error) {
          alert(`Erreur : ${resp.error}`);
          return;
        }
        await loadTradeRoutes();
      });
      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);
      table.appendChild(row);
    });
  panel.appendChild(table);
}

async function loadTradeRoutes() {
  const [routes, baronies, connections] = await Promise.all([
    fetchJSON('/api/trade_routes'),
    getData('baronies', '/api/baronies'),
    getData('barony_connections', '/api/barony_connections')
  ]);
  const sortedBaronies = sortByName(baronies);
  tradeRoutesState = {
    baronies: sortedBaronies,
    baronyMap: Object.fromEntries(sortedBaronies.map(b => [b.id, b])),
    adjacency: buildAdjacencyMap(connections),
    routes: routes || []
  };
  renderTradeRoutesPanel();
}

function getTradeLineDialogElements() {
  return {
    dialog: document.getElementById('tradeLineDialog'),
    form: document.getElementById('tradeLineForm'),
    title: document.getElementById('tradeLineDialogTitle'),
    barony1: document.getElementById('tradeLineBarony1'),
    barony2: document.getElementById('tradeLineBarony2'),
    startLabel: document.getElementById('tradeLineStartLabel'),
    endLabel: document.getElementById('tradeLineEndLabel'),
    steps: document.getElementById('tradeLineSteps'),
    hint: document.getElementById('tradeLineHint'),
    cancel: document.getElementById('tradeLineCancel'),
    save: document.getElementById('tradeLineSave')
  };
}

function updateTradeLineLabels(startId, endId) {
  const { startLabel, endLabel } = getTradeLineDialogElements();
  const startBarony = tradeLinesState.baronyMap[startId];
  const endBarony = tradeLinesState.baronyMap[endId];
  if (startLabel) {
    startLabel.textContent = startBarony ? `Baronnie 1 : ${formatBaronyLabel(startBarony)}` : 'Baronnie 1 :';
  }
  if (endLabel) {
    endLabel.textContent = endBarony ? `Baronnie 2 : ${formatBaronyLabel(endBarony)}` : 'Baronnie 2 :';
  }
}

function isTradeLinePathComplete(startId, endId, selections) {
  if (!startId || !endId) return false;
  if (!selections || selections.length === 0) return false;
  if (selections.some(step => !step)) return false;
  const startZones = tradeLinesState.baronyZones[startId] || [];
  const endZones = tradeLinesState.baronyZones[endId] || [];
  if (!startZones.includes(selections[0])) return false;
  return endZones.includes(selections[selections.length - 1]);
}

function renderTradeLineSteps() {
  const { barony1, barony2, steps } = getTradeLineDialogElements();
  if (!steps || !barony1 || !barony2) return;
  steps.innerHTML = '';
  const startId = parseInt(barony1.value, 10);
  const endId = parseInt(barony2.value, 10);
  if (!startId || !endId) return;
  const selections = tradeLineDialogState.selections || [];
  const stepsList = selections.slice();
  const last = stepsList[stepsList.length - 1];
  const endZones = tradeLinesState.baronyZones[endId] || [];
  if (!last || !endZones.includes(last)) {
    if (stepsList.length === 0 || stepsList[stepsList.length - 1]) {
      stepsList.push(null);
    }
  }
  const used = new Set();
  stepsList.forEach((selected, index) => {
    let options = [];
    if (index === 0) {
      options = (tradeLinesState.baronyZones[startId] || []).slice();
    } else {
      const prevId = stepsList[index - 1];
      if (prevId) {
        options = (tradeLinesState.adjacency[prevId] || []).map(n => n.id);
      }
    }
    options = options.filter(id => !used.has(id));
    const select = document.createElement('select');
    select.dataset.index = String(index);
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '';
    select.appendChild(blank);
    options.forEach(id => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = formatZoneLabel(tradeLinesState.zoneMap[id] || { id, name: `Zone ${id}` });
      select.appendChild(option);
    });
    if (selected) select.value = String(selected);
    select.addEventListener('change', (event) => {
      const idx = parseInt(event.target.dataset.index, 10);
      const value = parseInt(event.target.value, 10);
      const nextSelections = tradeLineDialogState.selections.slice(0, idx);
      if (value) {
        nextSelections[idx] = value;
      }
      tradeLineDialogState.selections = nextSelections;
      renderTradeLineSteps();
      updateTradeLineHint();
    });
    steps.appendChild(select);
    if (selected) used.add(selected);
  });
}

function updateTradeLineHint(message) {
  const { barony1, barony2, hint, save } = getTradeLineDialogElements();
  if (!hint || !save || !barony1 || !barony2) return;
  const startId = parseInt(barony1.value, 10);
  const endId = parseInt(barony2.value, 10);
  let text = message || '';
  if (!startId || !endId) {
    text = 'Sélectionnez deux baronnies pour définir un chemin maritime.';
    save.disabled = true;
  } else if (!isTradeLinePathComplete(startId, endId, tradeLineDialogState.selections)) {
    text = text || 'Le chemin doit commencer par une zone reliée à la baronnie 1 et finir sur une zone reliée à la baronnie 2.';
    save.disabled = true;
  } else {
    text = '';
    save.disabled = false;
  }
  hint.textContent = text;
}

function handleTradeLineBaronyChange() {
  const { barony1, barony2 } = getTradeLineDialogElements();
  if (!barony1 || !barony2) return;
  const startId = parseInt(barony1.value, 10);
  const endId = parseInt(barony2.value, 10);
  updateTradeLineLabels(startId, endId);
  tradeLineDialogState.selections = [];
  renderTradeLineSteps();
  updateTradeLineHint();
}

function openTradeLineDialog(line) {
  const elements = getTradeLineDialogElements();
  if (!elements.dialog) return;
  ensureTradeLineDialog();
  tradeLineDialogState.mode = line ? 'edit' : 'create';
  tradeLineDialogState.lineId = line ? line.id : null;
  tradeLineDialogState.selections = [];
  if (elements.title) {
    elements.title.textContent = line ? 'Modifier la ligne commerciale' : 'Nouvelle ligne commerciale';
  }
  populateTradeRouteBaronySelect(elements.barony1, tradeLinesState.baronies);
  populateTradeRouteBaronySelect(elements.barony2, tradeLinesState.baronies);
  if (line) {
    elements.barony1.value = String(line.barony_id_1);
    elements.barony2.value = String(line.barony_id_2);
    const path = parseTradeLinePath(line.path);
    tradeLineDialogState.selections = path.slice();
  }
  updateTradeLineLabels(
    parseInt(elements.barony1.value, 10),
    parseInt(elements.barony2.value, 10)
  );
  renderTradeLineSteps();
  updateTradeLineHint();
  if (elements.dialog.showModal) {
    elements.dialog.showModal();
  } else {
    elements.dialog.setAttribute('open', 'open');
  }
}

function ensureTradeLineDialog() {
  const elements = getTradeLineDialogElements();
  if (!elements.dialog || elements.dialog.dataset.ready) return;
  if (elements.cancel) {
    elements.cancel.addEventListener('click', () => elements.dialog.close());
  }
  if (elements.barony1) {
    elements.barony1.addEventListener('change', handleTradeLineBaronyChange);
  }
  if (elements.barony2) {
    elements.barony2.addEventListener('change', handleTradeLineBaronyChange);
  }
  if (elements.form) {
    elements.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const startId = parseInt(elements.barony1.value, 10);
      const endId = parseInt(elements.barony2.value, 10);
      if (!startId || !endId) {
        updateTradeLineHint('Sélectionnez deux baronnies avant de sauvegarder.');
        return;
      }
      if (!isTradeLinePathComplete(startId, endId, tradeLineDialogState.selections)) {
        updateTradeLineHint('Le chemin maritime doit être complet pour être enregistré.');
        return;
      }
      const path = tradeLineDialogState.selections.slice();
      const payload = { barony_id_1: startId, barony_id_2: endId, path };
      const isEdit = tradeLineDialogState.mode === 'edit' && tradeLineDialogState.lineId;
      const endpoint = isEdit ? `/api/trade_lines/${tradeLineDialogState.lineId}` : '/api/trade_lines';
      const method = isEdit ? 'PUT' : 'POST';
      const resp = await fetchJSON(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp && resp.error) {
        alert(`Erreur : ${resp.error}`);
        return;
      }
      elements.dialog.close();
      await loadTradeLines();
    });
  }
  elements.dialog.dataset.ready = 'true';
}

function renderTradeLinesPanel() {
  const panel = document.getElementById('tradeLinesPanel');
  if (!panel) return;
  panel.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'table-actions';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'control-btn';
  addBtn.textContent = 'Nouvelle ligne commerciale';
  addBtn.addEventListener('click', () => openTradeLineDialog());
  header.appendChild(addBtn);
  panel.appendChild(header);
  if (!tradeLinesState.lines.length) {
    const empty = document.createElement('div');
    empty.className = 'trade-route-empty';
    empty.textContent = 'Aucune ligne commerciale enregistrée.';
    panel.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'admin-table';
  table.innerHTML = '<tr><th>ID</th><th>Baronnie 1</th><th>Baronnie 2</th><th>Chemin</th><th>Actions</th></tr>';
  tradeLinesState.lines
    .slice()
    .sort((a, b) => a.id - b.id)
    .forEach(line => {
      const row = document.createElement('tr');
      const path = parseTradeLinePath(line.path);
      const barony1 = tradeLinesState.baronyMap[line.barony_id_1] || { id: line.barony_id_1, name: `Baronnie ${line.barony_id_1}` };
      const barony2 = tradeLinesState.baronyMap[line.barony_id_2] || { id: line.barony_id_2, name: `Baronnie ${line.barony_id_2}` };
      row.innerHTML = `
        <td>${line.id}</td>
        <td>${formatBaronyLabel(barony1)}</td>
        <td>${formatBaronyLabel(barony2)}</td>
        <td>${path.length || 0}</td>
        <td></td>
      `;
      const actionsCell = row.querySelector('td:last-child');
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'control-btn';
      editBtn.textContent = 'Chemin';
      editBtn.addEventListener('click', () => openTradeLineDialog(line));
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger';
      deleteBtn.textContent = 'Supprimer';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Supprimer cette ligne commerciale ?')) return;
        const resp = await fetchJSON(`/api/trade_lines/${line.id}`, { method: 'DELETE' });
        if (resp && resp.error) {
          alert(`Erreur : ${resp.error}`);
          return;
        }
        await loadTradeLines();
      });
      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);
      table.appendChild(row);
    });
  panel.appendChild(table);
}

async function loadTradeLines() {
  const [lines, baronies, zones, connections, zoneBaronies] = await Promise.all([
    fetchJSON('/api/trade_lines'),
    getData('baronies', '/api/baronies'),
    getData('maritime_zones', '/api/maritime_zones'),
    getData('maritime_zone_connections', '/api/maritime_zone_connections'),
    getData('maritime_zone_baronies', '/api/maritime_zone_baronies')
  ]);
  const sortedBaronies = sortByName(baronies);
  const sortedZones = sortByName(zones);
  const baronyZones = {};
  (zoneBaronies || []).forEach(link => {
    const baronyId = parseInt(link.barony_id, 10);
    const zoneId = parseInt(link.zone_id, 10);
    if (!baronyId || !zoneId) return;
    if (!baronyZones[baronyId]) baronyZones[baronyId] = [];
    baronyZones[baronyId].push(zoneId);
  });
  tradeLinesState = {
    baronies: sortedBaronies,
    baronyMap: Object.fromEntries(sortedBaronies.map(b => [b.id, b])),
    zones: sortedZones,
    zoneMap: Object.fromEntries(sortedZones.map(z => [z.id, z])),
    adjacency: buildAdjacencyMap(connections, 'zone_id_1', 'zone_id_2'),
    baronyZones,
    lines: lines || []
  };
  renderTradeLinesPanel();
}

async function ensureTags(){
  const tags = await getData('tags','/api/tags');
  tagsSelect = tags.slice().sort(compareByField('label')).map(t=>({ id:t.id, name:t.label }));
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
  const baroniesSelect = sortByName(baronies);
  const baronyPropsById = baronyProps.slice().sort((a,b)=>a.id - b.id);
  const boolSelects = {};
  baronyPropBoolFields.forEach(f=>{ boolSelects[f] = yesNoSelect; });
  renderTable(document.getElementById('tableBaronyProps'), baronyPropsById, {
    endpoint:'barony_properties',
    fields:baronyPropFields,
    selects:{barony_id:baroniesSelect, ...boolSelects},
    labels:baronyPropLabels,
    booleanFields:baronyPropBoolFields,
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
  users: loadUsers,
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
  'trade-routes': loadTradeRoutes,
  'trade-lines': loadTradeLines,
  batiments: loadBatiments,
  spells: loadSpells,
  tags: loadTags,
  baronyprops: loadBaronyProps,
  logs: () => loadLogs(1),
};

async function initAdminPage() {
  if (!columnPreferencesLoaded) {
    await loadColumnPreferences();
  }
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      buttons.forEach(b=>b.classList.remove('active'));
      panels.forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('tab-'+btn.dataset.tab);
      panel.classList.add('active');
      const shouldReload = btn.dataset.tab === 'logs';
      if((!tabLoaded[btn.dataset.tab] || shouldReload) && tabLoaders[btn.dataset.tab]){
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
}

document.addEventListener('DOMContentLoaded', () => {
  initAdminPage();
});
