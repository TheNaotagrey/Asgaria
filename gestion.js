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
  ['encens', 'Encens'], ['vin', 'Vin'], ['pierre_precieuse', 'Pierres précieuses']
];

const militaryResources = [
  ['hommes_darmes', "Hommes d'armes"], ['chevaux', 'Chevaux'], ['trebuchets', 'Trébuchets'],
];

const extraResources = [
  ['esclaves', 'Esclaves'], ['prestige', 'Prestige'], ['renommee', 'Renommée'],
];
const resourceLabels = Object.fromEntries([...basicResources, ...luxuryResources, ...militaryResources, ...extraResources]);
const resourceSelect = Object.entries(resourceLabels).map(([id, name]) => ({ id, name }));
const pageSelect = [{ id: 'magie', name: 'Magie' }];

let buildingPropsSelect = [];
let infraPropsSelect = [];

let currentSpells = [];
let spellTargets = [];

const baronyPropBoolFields = ['water_access','sea_access','has_or','has_argent','has_fer','has_pierre','has_epices','has_perle','has_encens','has_huiles','has_pierre_precieuses','has_soie','has_sel','has_fourrure','has_teinture','has_ivoire','has_vin'];
const baronyPropLabels = {
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
  high_sea_boat_limit:'Limite de Bateau en haute mer'
};

function safeParse(json, fallback){
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function renderTransactionDates(container) {
  const dates = container.querySelectorAll('.timeago');
  if (dates.length && window.timeago && typeof window.timeago.render === 'function') {
    dates.forEach(element => window.timeago.render(element, 'fr'));
    return;
  }
  dates.forEach(element => {
    const date = new Date(element.dateTime);
    element.textContent = Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });
  });
}

let gameState = {};
let tagLabels = {};
let tagCounts = {};
let currentUser = null;
let currentSeigneurieId = null;
let updateAdvancePending = false;
let latestUpdateReportId = null;
const params = new URLSearchParams(location.search);
let transactionToOpen = params.get('transactionId');
const updateLabels = {
  1: 'Février',
  2: 'Mars',
  3: 'Avril',
  4: 'Mai',
  5: 'Juin',
  6: 'Juillet',
  7: 'Août',
  8: 'Septembre',
  9: 'Octobre',
  10: 'Hiver'
};

function formatUpdateStatusLabel(update) {
  if (!update || !update.year || !update.number) return '';
  return `${updateLabels[update.number] || 'Mise à jour'} ${update.year}`;
}

function availableWorkers(population, employment, employmentDetails, currentlyAssigned = 0) {
  const demand = (employmentDetails || []).reduce((total, detail) => total + Math.max(0, Number(detail.amount) || 0), 0);
  return Number(population || 0) + Number(employment.slaves || 0) - demand + Number(currentlyAssigned || 0);
}

function compareUpdateStatus(left, right) {
  if (!left || !right) return 0;
  if (left.year !== right.year) return left.year - right.year;
  return Number(left.number || 0) - Number(right.number || 0);
}

function showConfirm(message){
  return new Promise(resolve => {
    const dialog = document.getElementById('confirmDialog');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    msgEl.textContent = message;
    const clean = result => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.close();
      resolve(result);
    };
    const onOk = () => clean(true);
    const onCancel = () => clean(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    dialog.showModal();
  });
}

async function adminUpdate(fields){
  if(!gameState.s) return;
  const payload = { id: gameState.s.id, ...fields };
  try {
    const res = await fetch('/api/admin/seigneurie_update', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if(res.ok){
      await loadAndRender(currentSeigneurieId);
    } else {
      alert('Mise à jour impossible');
    }
  } catch {
    alert('Mise à jour impossible');
  }
}

async function adminUpdateBaronyProps(fields) {
  const current = { ...gameState.baronyProps, ...fields };
  if (!current.id) return;
  try {
    const res = await fetch(`/api/barony_properties/${current.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    });
    if (res.ok) {
      await loadAndRender(currentSeigneurieId);
    } else {
      alert('Mise à jour impossible');
    }
  } catch {
    alert('Mise à jour impossible');
  }
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
  initGestionTooltips();
  try {
    const res = await fetch('/api/me');
    currentUser = res.ok ? await res.json() : null;
  } catch {
    currentUser = null;
  }
  if (!currentUser) {
    setTabVisibility(false);
    const summary = document.getElementById('summary');
    if (summary) summary.innerHTML = '<div class="empty-state">Connectez-vous pour accéder à votre seigneurie. <a href="index.html?auth">Ouvrir la connexion</a></div>';
    return;
  }
  const newRouteBtn = document.getElementById('newTradeRouteBtn');
  const params = new URLSearchParams(location.search);
  const sid = params.get('seigneurie_id');
  await loadAndRender(sid);
  await setupAdminSelector(currentSeigneurieId || sid);
  if (newRouteBtn) newRouteBtn.addEventListener('click', startTradeRouteCreation);

  document.addEventListener('click', async e => {
    if (!newRouteMode) return;
    const map = document.getElementById('tradeMap');
    if (map && map.contains(e.target)) return;
    if (newRouteBtn && newRouteBtn.contains(e.target)) return;
    newRouteMode = false;
    eligibleTargets = {};
    await updateTradeMap(currentTradeBaronyId, tradeLinksState);
  });
}

function setTabVisibility(hasSeigneurie) {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    if (btn.dataset.defaultDisplay === undefined) {
      btn.dataset.defaultDisplay = btn.style.display || '';
    }
    if (!hasSeigneurie && btn.dataset.tab !== 'sommaire') {
      btn.style.display = 'none';
    } else {
      btn.style.display = btn.dataset.defaultDisplay || '';
    }
  });
}

function clearGestionSections() {
  const ids = [
    'summary',
    'productionInfra',
    'civilInfra',
    'militaryInfra',
    'commercialInfra',
    'tradeRoutes',
    'baronyProps',
    'spellInfo',
    'spellList'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  const tradeLimits = document.getElementById('tradeLimitsTable');
  if (tradeLimits) tradeLimits.innerHTML = '';
}

function showUpdateReport(report) {
  if (!report) return;
  const dialog = document.getElementById('updateReportDialog');
  const content = document.getElementById('updateReportContent');
  const closeBtn = document.getElementById('updateReportClose');
  if (!dialog || !content || !closeBtn) return;
  const items = (Array.isArray(report.events) ? report.events : [])
    .map(event => `<li><strong>${escapeHtml(event.title || 'Événement')} :</strong> ${escapeHtml(event.details || '')}</li>`)
    .join('');
  const before = report.before || {};
  const after = report.after || {};
  const delta = report.delta || {};
  const beforeInventory = before.inventory || {};
  const afterInventory = after.inventory || {};
  const deltaInventory = delta.inventory || {};
  const keys = [...new Set([...Object.keys(beforeInventory), ...Object.keys(afterInventory), ...Object.keys(deltaInventory)])]
    .filter(key => Number(beforeInventory[key] || 0) || Number(afterInventory[key] || 0) || Number(deltaInventory[key] || 0));
  const signed = value => `${Number(value) > 0 ? '+' : ''}${escapeHtml(value ?? 0)}`;
  const resourceRows = keys.map(key => `<tr>
    <td>${escapeHtml(resourceLabels[key] || key)}</td>
    <td>${escapeHtml(beforeInventory[key] ?? 0)}</td>
    <td>${signed(deltaInventory[key])}</td>
    <td>${escapeHtml(afterInventory[key] ?? 0)}</td>
  </tr>`).join('');
  content.innerHTML = `
    <h2>Relevé de mise à jour</h2>
    <p class="update-report-period">Période traitée : ${escapeHtml(formatUpdateStatusLabel(report.from_update || before.update) || '—')} →
      <strong>${escapeHtml(report.current_update_label || formatUpdateStatusLabel(report.current_update) || 'Mise à jour')}</strong></p>
    ${report.before && report.after ? `<table class="admin-table update-report-table"><thead><tr>
      <th>État</th><th>Avant</th><th>Variation</th><th>Après</th>
    </tr></thead><tbody><tr><td>Population</td><td>${escapeHtml(before.population ?? 0)}</td>
      <td>${signed(delta.population)}</td><td>${escapeHtml(after.population ?? 0)}</td></tr>
      ${resourceRows || '<tr><td colspan="4">Aucune variation de ressources.</td></tr>'}</tbody></table>` : ''}
    <h3>Événements appliqués</h3>${items ? `<ul>${items}</ul>` : '<p>Aucun événement signalé pour cette période.</p>'}
  `;
  closeBtn.onclick = () => dialog.close();
  dialog.showModal();
}

async function triggerUpdateAdvance() {
  if (updateAdvancePending) return;
  const btn = document.getElementById('advanceUpdateBtn');
  const update = gameState.updateStatus && gameState.updateStatus.current;
  if (!update || !Number.isInteger(Number(update.year)) || !Number.isInteger(Number(update.number))) {
    alert('Rechargez la seigneurie avant de lancer la mise à jour.');
    return;
  }
  updateAdvancePending = true;
  if (btn) btn.disabled = true;
  try {
    const payload = { expected_update: { year: Number(update.year), number: Number(update.number) } };
    if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
    const res = await fetch('/api/seigneurie/advance_update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(formatUpdateError(data, res.status));
      return;
    }
    await loadAndRender(currentSeigneurieId);
    if (data.report) showUpdateReport(data.report);
  } catch (error) {
    alert(error && error.message ? `Impossible de joindre le serveur : ${error.message}` : 'Impossible de joindre le serveur pour appliquer la mise à jour. Vérifiez votre connexion puis rechargez la page.');
  } finally {
    updateAdvancePending = false;
    if (btn && btn.isConnected) btn.disabled = !(gameState.updateStatus && gameState.updateStatus.canAdvance);
    renderUpdatePanel(gameState.updateStatus, gameState.inv, gameState.production);
  }
}

function formatUpdateError(data, status) {
  const knownMessages = {
    population_overload: 'La mise à jour est bloquée : la population employée dépasse la population totale. Réduisez l’emploi avant de réessayer.',
    date_locked: 'La prochaine mise à jour n’est pas encore disponible. Consultez la date affichée dans les blocages.',
    update_conflict: 'La période a changé depuis le chargement de cette page. Rechargez la seigneurie avant de réessayer.',
    updates_frozen: 'Toutes les mises à jour sont suspendues par l’administration.',
    update_limit: 'La limite de mises à jour configurée par les organisateurs est atteinte.',
    inventory_missing: 'L’inventaire de cette seigneurie est introuvable. Contactez un organisateur.',
    player_not_found: 'Cette seigneurie est introuvable ou n’est plus accessible.'
  };
  const message = data && (data.error || data.message);
  if (data && data.code && knownMessages[data.code]) return knownMessages[data.code];
  if (message) return String(message);
  if (status === 401 || status === 403) return 'Vous n’êtes pas autorisé à appliquer cette mise à jour.';
  if (status === 409) return 'La période a changé depuis le chargement de cette page. Rechargez la seigneurie avant de réessayer.';
  return `La mise à jour a été refusée par le serveur (erreur ${status || 'inconnue'}). Rechargez la page; si le problème persiste, contactez un organisateur.`;
}

async function readApiError(response, fallback) {
  const body = await response.text().catch(() => '');
  let data = {};
  try { data = body ? JSON.parse(body) : {}; } catch (_) {
    if (body) data.error = body;
  }
  return formatUpdateError(data, response.status) || fallback;
}

function renderUpdatePreview(inventory, production, capacities = {}, population = 0) {
  return Object.entries(production)
    .filter(([, amount]) => Number(amount))
    .sort(([left], [right]) => (resourceLabels[left] || left).localeCompare(resourceLabels[right] || right, 'fr'))
    .map(([resource, amount]) => {
      const current = Number(inventory[resource]) || 0;
      const projected = current + Number(amount);
      let next = Math.max(0, projected);
      const notes = [];
      if (resource === 'vivres' && projected < 0) {
        const deaths = Math.min(Number(population) || 0, Math.ceil(Math.ceil(-projected / 15) / 2));
        notes.push(`Famine : ${deaths} ${deaths === 1 ? 'mort' : 'morts'}`);
      }
      if (typeof capacities[resource] === 'number' && next > capacities[resource]) {
        notes.push(`Stockage dépassé : ${next - capacities[resource]} perdus`);
        next = capacities[resource];
      }
      // Food consumption remains visible in full, even when the stock reaches zero.
      const delta = resource === 'vivres' ? Number(amount) : next - current;
      return `<tr><td>${escapeHtml(resourceLabels[resource] || resource)}</td><td class="preview-variation ${delta > 0 ? 'prod-positive' : delta < 0 ? 'prod-negative' : ''}">${delta > 0 ? '+' : ''}${escapeHtml(delta)}</td><td class="preview-information">${escapeHtml(notes.join(' · ')) || '—'}</td></tr>`;
    }).join('');
}

function renderUpdatePanel(updateStatus, inventory = {}, production = {}) {
  const container = document.getElementById('playerUpdatePanel');
  if (!container || !updateStatus) return;
  const blockers = Array.isArray(updateStatus.blockers) ? updateStatus.blockers : [];
  const previewWasOpen = container.querySelector('.update-preview')?.open || false;
  const previewRows = renderUpdatePreview(inventory, production, gameState.capacities, gameState.s?.population);
  container.innerHTML = `
    <div class="update-panel-card">
      <h2 class="update-panel-value">Mise à jour : ${escapeHtml(formatUpdateStatusLabel(updateStatus.current) || updateStatus.currentLabel || '—')}</h2>
      <div class="update-next-period"><span>Prochaine mise à jour</span><strong>${escapeHtml(formatUpdateStatusLabel(updateStatus.next) || updateStatus.nextLabel || '—')}</strong></div>
      ${blockers.length ? `<section class="update-blockers" aria-live="polite"><strong>Blocages à résoudre</strong><ul>${blockers.map(blocker => `<li>${escapeHtml(blocker.message || 'Mise à jour indisponible.')}</li>`).join('')}</ul></section>` : updateStatus.canAdvance ? '<p class="update-ready">Aucun blocage détecté. La mise à jour est disponible.</p>' : `<p class="update-blockers update-date-note">La prochaine période sera disponible à partir du ${escapeHtml(updateStatus.unlockLabel || 'la date indiquée par les organisateurs')}.</p>`}
      <div class="update-panel-actions">
        <button id="advanceUpdateBtn" class="control-btn"${updateStatus.canAdvance && !updateAdvancePending ? '' : ' disabled'}>Passer à la prochaine mise à jour</button>
        ${latestUpdateReportId ? '<button id="latestUpdateReportBtn" class="control-btn secondary">Voir le dernier relevé</button>' : ''}
      </div>
      <details class="update-preview"${previewWasOpen ? ' open' : ''}>
        <summary>Prévision</summary>
        <div class="update-preview-content">
        <p class="update-preview-note">Variations après consommation et limites de stockage, hors réception des échanges.</p>
        ${previewRows ? `<div class="update-preview-table-wrap"><table class="admin-table update-preview-table"><thead><tr><th>Ressource</th><th>Variation</th><th>Informations</th></tr></thead><tbody>${previewRows}</tbody></table></div>` : '<p>Aucune variation prévue.</p>'}
        </div>
      </details>
    </div>
  `;
  const btn = document.getElementById('advanceUpdateBtn');
  if (btn) {
    btn.addEventListener('click', triggerUpdateAdvance);
  }
  const reportBtn = document.getElementById('latestUpdateReportBtn');
  if (reportBtn) reportBtn.addEventListener('click', openLatestUpdateReport);
}

async function openLatestUpdateReport() {
  if (!latestUpdateReportId) return;
  try {
    const res = await fetch(`/api/seigneurie/update_reports/${encodeURIComponent(latestUpdateReportId)}`);
    const data = res.ok ? await res.json() : null;
    if (!res.ok || !data) throw new Error('Relevé indisponible');
    showUpdateReport(data.report || data);
  } catch {
    alert('Le dernier relevé est indisponible.');
  }
}

async function loadAndRender(seigneurieId) {
  document.dispatchEvent(new Event('gestion:refresh'));
  currentSeigneurieId = seigneurieId || null;
  try {
    const [res, bRes, iRes, tRes] = await Promise.all([
      fetch(`/api/my_seigneurie${seigneurieId ? `?seigneurie_id=${seigneurieId}` : ''}`),
      fetch('/api/building_properties'),
      fetch('/api/infrastructure_properties'),
      fetch('/api/tags')
    ]);
    if (!res.ok) throw new Error('Erreur');
    const data = await res.json();
    latestUpdateReportId = data.latest_update_report_id || null;
    const isAdmin = currentUser && currentUser.is_admin && currentUser.act_as_admin !== false;
    if (!data.seigneurie) {
      currentSeigneurieId = null;
      setTabVisibility(false);
      clearGestionSections();
      const summary = document.getElementById('summary');
      if (summary) {
        const hint = isAdmin
          ? 'Sélectionnez une seigneurie via le sélecteur administrateur pour continuer.'
          : 'Contactez un administrateur pour être affecté à une seigneurie.';
        summary.innerHTML = `<div class="empty-state">Aucune seigneurie n’est associée à votre compte. ${hint}</div>`;
      }
      return;
    }
    setTabVisibility(true);
    const allBuildingProps = bRes.ok ? await bRes.json() : [];
    const allInfraProps = iRes.ok ? await iRes.json() : [];
    const tags = tRes.ok ? await tRes.json() : [];
    tagLabels = Object.fromEntries(tags.map(t=> [String(t.id), t.label]));
    const s = data.seigneurie;
    currentSeigneurieId = s ? s.id : currentSeigneurieId;
    const inv = data.inventaire || {};
    const barony = data.barony || {};
    const seigneur = data.seigneur || {};
    const idh = data.idh || 0;
    const idhDetails = data.idhDetails || [];
    let idhClass = '';
    if (idh < 5) {
      idhClass = 'prod-negative';
    } else if (idh >= 10) {
      idhClass = 'prod-positive';
    }
    let idhHtml;
    if (idhDetails.length) {
      const rows = idhDetails
        .map(d => `<tr><td>${formatDetailLabel(d.label)}</td><td>${spanAmount(d.amount)}</td></tr>`)
        .join('');
      idhHtml = `<span class="tooltip ${idhClass}">${idh}<table class="tooltip-table">${rows}</table></span>`;
    } else {
      idhHtml = `<span class="${idhClass}">${idh}</span>`;
    }
    const production = data.production || {};
    const productionDetails = data.productionDetails || {};
    const baronyProps = data.baronyProps || {};
    const employment = data.employment || { employed:0, slaves:0 };
    const employmentDetails = data.employmentDetails || [];
    const buildings = data.buildings || {};
    const infrastructures = data.infrastructures || {};
    const capacities = data.capacities || {};
    const buildingBonuses = data.buildingProductionBonus || {};
    const buildingBonusDetails = data.buildingProductionBonusDetails || {};
    const buildingProps = allBuildingProps.filter(bp => {
      if (!PlayerTypes.isBuildingAvailable(bp, s.type)) return false;
      try {
        const arr = bp.absolute_restrictions ? JSON.parse(bp.absolute_restrictions) : [];
        return arr.every(p => baronyProps[p]);
      } catch {
        return true;
      }
    });
    const bpMap = Object.fromEntries(allBuildingProps.map(b => [String(b.id), b]));
    buildingPropsSelect = allBuildingProps.map(b => ({ id: b.id, name: b.label || b.type }));
    const infraProps = allInfraProps.filter(ip => {
        if (!PlayerTypes.isBuildingAvailable(ip, s.type)) return false;
        try {
          const arr = ip.absolute_restrictions ? JSON.parse(ip.absolute_restrictions) : [];
          if (Array.isArray(arr)) {
            return arr.every(p => baronyProps[p]);
          }
          return true;
        } catch {
          return true;
        }
      });
    const ipMap = Object.fromEntries(allInfraProps.map(b => [String(b.id), b]));
    infraPropsSelect = allInfraProps.map(i => ({ id: i.id, name: i.label || i.type }));

    tagCounts = {};
    Object.entries(buildings).forEach(([bid, info]) => {
      const bp = bpMap[String(bid)];
      if (!bp) return;
      const effs = safeParse(bp.effects, []);
      effs.forEach(ef => {
        if (ef.type === 'tag' && ef.tag) {
          const amt = parseInt(ef.amount, 10) || 1;
          tagCounts[ef.tag] = (tagCounts[ef.tag] || 0) + (info.built || 0) * amt;
        }
      });
    });
    Object.entries(infrastructures).forEach(([iid, entry]) => {
      const ip = ipMap[String(iid)];
      if (!ip) return;
      const builtCount = typeof entry === 'object' ? (entry.built || 0) : entry;
      const effs = safeParse(ip.effects, []);
      effs.forEach(ef => {
        if (ef.type === 'tag' && ef.tag) {
          const amt = parseInt(ef.amount, 10) || 1;
          tagCounts[ef.tag] = (tagCounts[ef.tag] || 0) + builtCount * amt;
        }
      });
    });

    const spellSuccess = data.spellSuccess || 75;
    const basicSpellDiscount = data.basicSpellDiscount || 0;
    const advancedSpellDiscount = data.advancedSpellDiscount || 0;
    const spellRange = data.spellRange || 5;
    const spellMax = data.spellMax || 0;
    const spellsCast = data.spellsCast || 0;
    const landTxMax = data.landTxMax || 0;
    const navalTxMax = data.navalTxMax || 0;
    const landTransactions = data.landTransactions || 0;
    const navalTransactions = data.navalTransactions || 0;
    const spellSuccessDetails = data.spellSuccessDetails || [];
    const basicSpellDiscountDetails = data.basicSpellDiscountDetails || [];
    const advancedSpellDiscountDetails = data.advancedSpellDiscountDetails || [];
    const spellRangeDetails = data.spellRangeDetails || [];
    const spellMaxDetails = data.spellMaxDetails || [];
    const updateStatus = data.updateStatus || null;
    gameState = { s, employment, employmentDetails, buildings, infrastructures, bpMap, ipMap, buildingBonuses, buildingBonusDetails, productionDetails, production: data.production || {}, spellSuccess, basicSpellDiscount, advancedSpellDiscount, spellRange, spellMax, spellsCast, landTxMax, navalTxMax, landTransactions, navalTransactions, spellSuccessDetails, basicSpellDiscountDetails, advancedSpellDiscountDetails, spellRangeDetails, spellMaxDetails, inv, capacities, isAdmin, baronyProps, updateStatus };

    await renderTradeRoutes(barony.id);

    const summary = document.getElementById('summary');
    summary.innerHTML = `
      <div class="summary-content">
      <div class="summary-header-row">
        <div id="infoTables" class="resource-tables summary-info-tables">
          <div class="resource-table-container">
            <table id="generalInfoTable" class="admin-table"></table>
          </div>
          <div class="resource-table-container">
            <table id="deJureTable" class="admin-table"></table>
          </div>
        </div>
      </div>
      <div id="popAndTx" class="resource-tables">
        <div id="populationSummary" class="resource-table-container"></div>
        <div class="resource-table-container">
          <h2>Transactions en attente</h2>
          <div class="pending-transactions-wrap">
          <table id="pendingTxTable" class="admin-table"></table>
          </div>
        </div>
      </div>
      <div id="resourceTables" class="resource-tables">
        <div class="resource-table-container">
          <h2>Ressources de base</h2>
          <table id="basicResourcesTable" class="admin-table"></table>
        </div>
        <div class="resource-table-container">
          <h2>Ressources de Luxe</h2>
          <table id="luxuryResourcesTable" class="admin-table"></table>
        </div>
        <div class="resource-table-container">
          <h2>Ressources Militaires</h2>
          <table id="militaryResourcesTable" class="admin-table"></table>
        </div>
      </div>
      </div>
      <aside id="playerUpdatePanel" class="summary-update-panel" aria-label="Mise à jour de la seigneurie"></aside>
    `;

    const genTable = document.getElementById('generalInfoTable');
    genTable.innerHTML = `
      <tr><th colspan="2">Informations générales</th></tr>
      <tr><td>Nom du joueur</td><td>${currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() : ''}</td></tr>
      <tr><td>Nom du personnage</td><td>${seigneur.name || currentUser?.character_name || ''}</td></tr>
      <tr><td>Religion</td><td>${seigneur.religion_name || 'Inconnue'}</td></tr>
      <tr><td>Nom du Suzerain</td><td>${seigneur.overlord_name || 'Aucun'}</td></tr>
    `;

    const deJureTable = document.getElementById('deJureTable');
    deJureTable.innerHTML = `
      <tr><th colspan="2">Localisation de Jure</th></tr>
      <tr><td>Royaume</td><td>${barony.kingdom_name || 'Aucun'}</td></tr>
      <tr><td>Duché</td><td>${barony.duchy_name || 'Aucun'}</td></tr>
      <tr><td>Comté</td><td>${barony.county_name || 'Aucun'}</td></tr>
      <tr><td>Baronnie</td><td>${barony.name || 'Aucune'}</td></tr>
    `;
    renderUpdatePanel(updateStatus, inv, data.production || {});

    const popSummary = document.getElementById('populationSummary');
    let employedHtml = employment.employed;
    if (employmentDetails.length) {
      const rows = employmentDetails
        .map(src => `<tr><td>${src.source} ${src.label}</td><td>${spanAmount(src.amount)}</td></tr>`)
        .join('');
      employedHtml = `<span class="tooltip">${employment.employed}<table class="tooltip-table">${rows}</table></span>`;
    }
    if (employment.employed > s.population) {
      employedHtml = `<span style="color:red">${employedHtml}</span>`;
    }
    const beginnerProtection = Number(s.beginner_protection) === 1;
    const maxTaxRate = beginnerProtection ? 5 : 12;
    const selectedTaxRate = Number(s.tax_rate ?? 5);
    const taxOptions = Array.from({ length: Math.max(maxTaxRate, selectedTaxRate) + 1 }, (_, i) =>
      `<option value="${i}" ${i > maxTaxRate ? 'disabled' : ''} ${i === selectedTaxRate ? 'selected' : ''}>${i}</option>`
    ).join('');

    const popField = isAdmin ? `<input type="number" id="popInput" value="${s.population}" style="width:6em">` : s.population;
    const slaveField = isAdmin ? `<input type="number" id="slaveInput" value="${employment.slaves}" style="width:6em">` : employment.slaves;
    const relField = isAdmin ? `<select id="religionSelect"></select>` : (barony.religion_name || 'Inconnue');
    const cultField = isAdmin ? `<select id="cultureSelect"></select>` : (barony.culture_name || 'Inconnue');
    popSummary.innerHTML = `
      <h2>Population</h2>
      <table class="admin-table">
        <tr><th>Info</th><th>Nombre</th></tr>
        <tr><td>Population totale</td><td>${popField}</td></tr>
        ${beginnerProtection ? '<tr class="beginner-protection"><td>Protection débutante</td><td>Active (jusqu’à 120 habitants)</td></tr>' : ''}
        <tr><td>Population employée</td><td>${employedHtml}</td></tr>
        <tr><td>Esclaves</td><td>${slaveField}</td></tr>
        <tr><td>IDH</td><td>${idhHtml}</td></tr>
        <tr><td>Religion</td><td>${relField}</td></tr>
        <tr><td>Culture</td><td>${cultField}</td></tr>
        <tr><td>Taxes (écus)</td><td><select id="taxRate">${taxOptions}</select></td></tr>
      </table>
    `;
    if(isAdmin){
      const popInput = document.getElementById('popInput');
      const slaveInput = document.getElementById('slaveInput');
      popInput.addEventListener('change', ()=>{
        const val = parseInt(popInput.value,10) || 0;
        adminUpdate({ population: val });
      });
      slaveInput.addEventListener('change', ()=>{
        const val = parseInt(slaveInput.value,10) || 0;
        adminUpdate({ esclaves: val });
      });
      try {
        const [relRes, cultRes] = await Promise.all([fetch('/api/religions'), fetch('/api/cultures')]);
        const religions = relRes.ok ? await relRes.json() : [];
        const cultures = cultRes.ok ? await cultRes.json() : [];
        const relSelect = document.getElementById('religionSelect');
        const cultSelect = document.getElementById('cultureSelect');
        relSelect.innerHTML = religions.map(r=>`<option value="${r.id}" ${r.id===barony.religion_pop_id?'selected':''}>${r.name}</option>`).join('');
        cultSelect.innerHTML = cultures.map(c=>`<option value="${c.id}" ${c.id===barony.culture_id?'selected':''}>${c.name}</option>`).join('');
        relSelect.addEventListener('change', ()=>{
          adminUpdate({ religion_id: parseInt(relSelect.value,10) || null });
        });
        cultSelect.addEventListener('change', ()=>{
          adminUpdate({ culture_id: parseInt(cultSelect.value,10) || null });
        });
      } catch {}
    }

    const taxSelect = document.getElementById('taxRate');
    if (taxSelect) {
      taxSelect.addEventListener('change', async () => {
        const rate = parseInt(taxSelect.value, 10);
        try {
          const payload = { tax_rate: rate };
          if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
          const res = await fetch('/api/tax_rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error('Erreur');
          await loadAndRender(currentSeigneurieId);
        } catch (err) {
          alert('Erreur lors de la mise à jour des taxes');
        }
      });
    }

    await renderPendingTransactions();
    if (transactionToOpen) {
      openTransactionPopup(transactionToOpen);
      transactionToOpen = null;
      history.replaceState({}, '', location.pathname);
    }

    const ostPanel = document.getElementById('tab-ost');
    if (ostPanel && !document.getElementById('ostMilitaryResourcesTable')) {
      ostPanel.innerHTML = `
        <div class="resource-tables">
          <div class="resource-table-container">
            <h2>Ressources Militaires</h2>
            <table id="ostMilitaryResourcesTable" class="admin-table"></table>
          </div>
        </div>`;
    }

    const basicTable = document.getElementById('basicResourcesTable');
    const luxuryTable = document.getElementById('luxuryResourcesTable');
    const militaryTable = document.getElementById('militaryResourcesTable');
    const ostTable = document.getElementById('ostMilitaryResourcesTable');

    basicTable.innerHTML = buildTable(basicResources, true, inv, production, productionDetails, capacities, isAdmin);
    luxuryTable.innerHTML = buildTable(luxuryResources, false, inv, production, productionDetails, capacities, isAdmin);
    militaryTable.innerHTML = buildTable(militaryResources, true, inv, production, productionDetails, capacities, isAdmin);
    if (ostTable) {
      ostTable.innerHTML = buildTable(militaryResources, true, inv, production, productionDetails, capacities, isAdmin);
    }

    if(isAdmin){
      document.querySelectorAll('.resource-input').forEach(inp => {
        inp.addEventListener('change', () => {
          const key = inp.dataset.key;
          const val = parseInt(inp.value,10) || 0;
          adminUpdate({ inventaire: { [key]: val } });
        });
      });
    }

    if (data.unlockedPages && data.unlockedPages.magie) {
      const magieBtn = document.querySelector('.tab-btn[data-tab="magie"]');
      const magiePanel = document.getElementById('tab-magie');
      if (magieBtn && magiePanel) {
        magieBtn.style.display = '';
        magiePanel.style.display = '';
        renderSpellInfo();
        try {
          const targetQuery = currentSeigneurieId ? `?seigneurie_id=${encodeURIComponent(currentSeigneurieId)}` : '';
          const [spellsRes, targetsRes] = await Promise.all([
            fetch('/api/spells'),
            fetch(`/api/spell_targets${targetQuery}`)
          ]);
          const spells = spellsRes.ok ? await spellsRes.json() : [];
          const targetData = targetsRes.ok ? await targetsRes.json() : { targets: [] };
          spellTargets = Array.isArray(targetData.targets) ? targetData.targets : [];
          renderSpells(spells);
          if (localStorage.getItem('gestionActiveTab') === 'magie') {
            magieBtn.click();
          }
        } catch (e) {
          console.error('Erreur chargement sorts', e);
        }
      }
    }

    const prodDiv = document.getElementById('productionInfra');
    const civilDiv = document.getElementById('civilInfra');
    const miliDiv = document.getElementById('militaryInfra');
    const commercialDiv = document.getElementById('commercialInfra');
    const freePop = availableWorkers(s.population, employment, employmentDetails);
    if (prodDiv) {
      let html = '<table class="admin-table" id="buildingsTable">';
      html += '<tr><th>Nom</th><th>Production</th><th>Employés</th><th>Requis</th><th>Construits</th><th>Max</th><th>Activer</th><th>Prod. Tot.</th><th>Emp. Tot.</th><th>Coût</th><th>Construire</th><th>Détruire</th></tr>';
      for (const bp of buildingProps) {
        let prodLabel = '';
        if (bp.produces) {
          prodLabel = resourceLabels[bp.produces] || bp.produces || '';
        }
        const info = buildings[bp.id] || { built: 0, active: 0 };
        const baseProd = bp.production || 0;
        let bonusProd = buildingBonuses[bp.id] || buildingBonuses[String(bp.id)] || 0;
        const bonusDetails = buildingBonusDetails[bp.id] || buildingBonusDetails[String(bp.id)] || [];
        if (!bonusProd && bonusDetails.length) {
          bonusProd = bonusDetails.reduce((sum, b) => sum + b.amount, 0);
        }
        let prod = '';
        if (baseProd || bonusProd) {
          const per = baseProd + bonusProd;
          if (bonusProd) {
            const rows = [`<tr><td>Base</td><td>${spanAmount(baseProd)}</td></tr>`];
            for (const det of bonusDetails) {
              rows.push(`<tr><td>${formatDetailLabel(det.label)}</td><td>${spanAmount(det.amount)}</td></tr>`);
            }
            prod = `<span class="tooltip">${per} ${prodLabel}<table class="tooltip-table">${rows.join('')}</table></span>`;
          } else {
            prod = `${per} ${prodLabel}`;
          }
        }
        const built = info.built || 0;
        const active = info.active || 0;
        const workersPer = bp.workers_per_building || 0;

        let maxVal = Infinity;
        if (bp.max !== undefined && bp.max !== null && bp.max !== '') {
          const parsed = parseInt(bp.max, 10);
          if (!isNaN(parsed) && parsed > 0) {
            maxVal = parsed;
          } else if (baronyProps[bp.max] !== undefined) {
            const dyn = parseInt(baronyProps[bp.max], 10);
            if (!isNaN(dyn) && dyn > 0) maxVal = dyn;
          }
        }
        try {
          const obj = JSON.parse(bp.max || '');
          if (obj && typeof obj === 'object' && obj.tag) {
            const tagId = obj.tag || obj.tag_id;
            const per = obj.per || obj.value || 1;
            const count = tagCounts[tagId] || 0;
            const computed = count * per;
            if (!isNaN(computed)) {
              maxVal = Math.min(maxVal, computed);
            }
          }
        } catch {}
        const maxValDisplay = maxVal === Infinity ? '' : maxVal;

        let costHtml = '';
        let hasResources = true;
        try {
          const costs = bp.costs ? JSON.parse(bp.costs) : {};
          const parts = [];
          for (const [k, q] of Object.entries(costs)) {
            const label = resourceLabels[k] || k;
            const ok = (inv[k] || 0) >= q;
            if (!ok) hasResources = false;
            const color = ok ? '' : ' style="color:red"';
            parts.push(`<span${color}>${label}: ${q}</span>`);
          }
          costHtml = parts.join('<br>');
        } catch (e) {
          costHtml = '';
        }

        let restrHtml = '';
        let restrictionsMet = true;
        try {
          const infraR = bp.infra_restrictions ? JSON.parse(bp.infra_restrictions) : {};
          const parts = [];
          if (infraR.buildings) {
            for (const [bid, qty] of Object.entries(infraR.buildings)) {
              const ref = bpMap[String(bid)];
              const name = ref ? (ref.label || ref.type) : bid;
              const builtInfo = buildings[bid] || buildings[String(bid)] || {};
              const ok = (builtInfo.built || 0) >= qty;
              if (!ok) restrictionsMet = false;
              const color = ok ? '' : ' style="color:red"';
              parts.push(`<span${color}>${formatRestriction(name, qty)}</span>`);
            }
          }
          if (infraR.infrastructures) {
            for (const [iid, qty] of Object.entries(infraR.infrastructures)) {
              const ref = ipMap[String(iid)];
              const name = ref ? (ref.label || ref.type) : iid;
              const entry = infrastructures[iid] || infrastructures[String(iid)] || 0;
              const builtCount = typeof entry === 'object' ? (entry.built || 0) : entry;
              const ok = builtCount >= qty;
              if (!ok) restrictionsMet = false;
              const color = ok ? '' : ' style="color:red"';
              parts.push(`<span${color}>${formatRestriction(name, qty)}</span>`);
            }
          }
          if (infraR.population) {
            const ok = (s.population || 0) >= infraR.population;
            if (!ok) restrictionsMet = false;
            const color = ok ? '' : ' style="color:red"';
            parts.push(`<span${color}>Avoir au moins ${infraR.population} population</span>`);
          }
          if (infraR.resources) {
            for (const [res, qty] of Object.entries(infraR.resources)) {
              const label = resourceLabels[res] || res;
              const ok = (inv[res] || 0) >= qty;
              if (!ok) restrictionsMet = false;
              const color = ok ? '' : ' style="color:red"';
              parts.push(`<span${color}>Avoir au moins ${qty} ${label}</span>`);
            }
          }
          if (infraR.tags) {
            infraR.tags.forEach(cond => {
              const tagId = cond.tag || cond.tag_id;
              const cmp = cond.cmp || cond.op;
              const qty = cond.value;
              const name = tagLabels[tagId] || tagId;
              const count = tagCounts[tagId] || 0;
              const ok = cmp === '>=' ? count >= qty : count <= qty;
              if (!ok) restrictionsMet = false;
              const color = ok ? '' : ' style="color:red"';
              const cmpText = cmp === '>=' ? 'Avoir au moins' : 'Avoir au plus';
              parts.push(`<span${color}>${cmpText} ${qty} ${name}</span>`);
            });
          }
          restrHtml = parts.join('<br>');
        } catch (e) {
          restrHtml = '';
        }

        let maxReached = false;
        if (maxValDisplay !== '') {
          const maxNum = parseInt(maxValDisplay, 10);
          if (!isNaN(maxNum) && built >= maxNum) {
            maxReached = true;
          }
        }

        const canBuild = hasResources && restrictionsMet;

        const perProd = baseProd + bonusProd;
        const prodTotal = perProd * active;
        let prodTotalHtml = '';
        if (prodTotal) {
          prodTotalHtml = `${prodTotal} ${prodLabel}`;
        }
        const empTotal = workersPer * active;

        const builtField = isAdmin ? `<input type="number" class="building-built-input" data-id="${bp.id}" value="${built}" style="width:6em">` : built;
        html += `<tr data-id="${bp.id}"><td>${bp.label || bp.type}</td><td>${prod}</td><td>${workersPer}</td><td>${restrHtml}</td><td>${builtField}</td><td>${maxValDisplay}</td>`;
        if (built > 0) {
          let maxActivate = built;
          if (bp.workers_per_building) {
            const available = freePop + active * workersPer;
            maxActivate = Math.min(built, Math.max(active, Math.floor(available / workersPer)));
          }
          html += `<td><input type="number" min="0" max="${maxActivate}" value="${active}" class="activate-input" style="width:4em" data-id="${bp.id}"></td>`;
        } else {
          html += '<td></td>';
        }
        html += `<td>${prodTotalHtml}</td><td>${empTotal}</td><td>${costHtml}</td>`;
        if (maxReached) {
          html += '<td></td>';
        } else {
          html += `<td><button class="build-btn" data-id="${bp.id}"${canBuild ? '' : ' disabled'}>Construire</button></td>`;
        }
        if (built > 0) {
          html += `<td><button class="destroy-btn" data-id="${bp.id}">Détruire</button></td></tr>`;
        } else {
          html += '<td></td></tr>';
        }
      }
      html += '</table>';
      prodDiv.innerHTML = html;

      const table = document.getElementById('buildingsTable');
      table.addEventListener('click', handleBuildingTableClick);
      table.addEventListener('change', handleBuildingActivationChange);
    }

    if (civilDiv) {
      civilDiv.innerHTML = buildInfraTable(infraProps.filter(i=>i.type==='civil'), infrastructures, inv, 'civilInfraTable', isAdmin);
      const table = document.getElementById('civilInfraTable');
      table.addEventListener('click', handleInfraTableClick);
      table.addEventListener('change', handleInfraTableChange);
    }
    if (miliDiv) {
      miliDiv.innerHTML = buildInfraTable(infraProps.filter(i=>i.type==='militaire'), infrastructures, inv, 'militaryInfraTable', isAdmin);
      const table = document.getElementById('militaryInfraTable');
      table.addEventListener('click', handleInfraTableClick);
      table.addEventListener('change', handleInfraTableChange);
    }
    if (commercialDiv) {
      commercialDiv.innerHTML = buildInfraTable(infraProps.filter(i=>i.type==='commercial'), infrastructures, inv, 'commercialInfraTable', isAdmin);
      const table = document.getElementById('commercialInfraTable');
      table.addEventListener('click', handleInfraTableClick);
      table.addEventListener('change', handleInfraTableChange);
    }

    const propsDiv = document.getElementById('baronyProps');
    if (propsDiv) {
      propsDiv.innerHTML = buildPropsTable(baronyProps, isAdmin);
      if (isAdmin) {
        propsDiv.querySelectorAll('.prop-input').forEach(inp => inp.addEventListener('change', handlePropChange));
        const btn = propsDiv.querySelector('#editEffectsBtn');
        if (btn) btn.addEventListener('click', openEffectsEditor);
      }
    }
    document.querySelectorAll('.tooltip').forEach(trigger => {
      trigger.tabIndex = 0;
      trigger.setAttribute('aria-label', 'Afficher le détail des contributions');
    });
  } catch (e) {
    document.getElementById('summary').textContent = 'Erreur de chargement';
  }
}

async function handleBuildingTableClick(e) {
  const table = document.getElementById('buildingsTable');
  if (e.target.classList.contains('build-btn')) {
    const id = e.target.dataset.id;
    console.log('[build] Bouton de construction cliqué pour', id);
    let payload = { id, quantity: 1 };
    try {
      if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
      const resp = await fetch('/api/building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('[build] Réponse du serveur', resp.status);
      if (resp.ok) {
        console.log('[build] Construction réussie');
        await loadAndRender(currentSeigneurieId);
      } else {
        const msg = await readApiError(resp, 'Construction du bâtiment impossible.');
        console.warn('[build] Construction refusée', resp.status, msg);
        alert(msg);
      }
    } catch (err) {
      console.error('[build] Erreur réseau ou serveur', err);
      alert(`Erreur réseau lors de la construction : ${err.message || 'serveur injoignable'}. Vérifiez votre connexion puis réessayez.`);
    }
  } else if (e.target.classList.contains('destroy-btn')) {
    const id = e.target.dataset.id;
    const ok = await showConfirm('Détruire ce bâtiment ? Les ressources dépensées ne seront pas récupérées. Êtes-vous sûr ?');
    if (!ok) return;
    try {
      const payload = { id };
      if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
      const resp = await fetch('/api/building/destroy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        await loadAndRender(currentSeigneurieId);
      } else {
        const msg = await readApiError(resp, 'Destruction du bâtiment impossible.');
        alert(msg);
      }
    } catch (err) {
      alert(`Erreur réseau lors de la destruction : ${err.message || 'serveur injoignable'}. Vérifiez votre connexion puis réessayez.`);
    }
  }
}

async function handleBuildingActivationChange(e) {
  const table = document.getElementById('buildingsTable');
  if (e.target.classList.contains('activate-input')) {
    const id = e.target.dataset.id;
    const input = table.querySelector(`input.activate-input[data-id="${id}"]`);
    const quantity = parseInt(input.value, 10);
    const bp = gameState.bpMap[id];
    const info = gameState.buildings[id] || { built: 0, active: 0 };
    const workersPer = bp ? (bp.workers_per_building || 0) : 0;
    const available = availableWorkers(gameState.s.population, gameState.employment, gameState.employmentDetails, (info.active || 0) * workersPer);
    if (workersPer && quantity > (info.active || 0) && quantity * workersPer > available) {
      alert('Population non employée insuffisante');
      return;
    }

    try {
      const payload = { id, quantity };
      if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
      const resp = await fetch('/api/building/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('[build] Activation réponse', resp.status);
      if (resp.ok) {
        await loadAndRender(currentSeigneurieId);
      } else {
        const msg = await readApiError(resp, 'Activation du bâtiment impossible.');
        console.warn('[build] Activation refusée', resp.status, msg);
        alert(msg);
      }
    } catch (err) {
      console.error('[build] Erreur réseau lors de l\'activation', err);
      alert(`Erreur réseau lors de l’activation : ${err.message || 'serveur injoignable'}. Vérifiez votre connexion puis réessayez.`);
    }
  } else if (e.target.classList.contains('building-built-input')) {
    const id = e.target.dataset.id;
    const qty = parseInt(e.target.value,10) || 0;
    adminUpdate({ buildings: { [id]: qty } });
  }
}

async function handleInfraTableClick(e) {
  if (e.target.classList.contains('infra-build-btn')) {
    const id = e.target.dataset.id;
    console.log('[infra] Bouton de construction infrastructure cliqué pour', id);
    try {
      const payload = { id, quantity: 1 };
      if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
      const resp = await fetch('/api/infrastructure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('[infra] Réponse du serveur', resp.status);
      if (resp.ok) {
        await loadAndRender(currentSeigneurieId);
      } else {
        const msg = await readApiError(resp, 'Construction de l’infrastructure impossible.');
        console.warn('[infra] Construction refusée', resp.status, msg);
        alert(msg);
      }
    } catch (err) {
      console.error('[infra] Erreur réseau lors de la construction', err);
      alert(`Erreur réseau lors de la construction : ${err.message || 'serveur injoignable'}. Vérifiez votre connexion puis réessayez.`);
    }
  } else if (e.target.classList.contains('instant-btn')) {
    const id = e.target.dataset.id;
    const idx = e.target.dataset.idx;
    const row = e.target.closest('tr');
    const nb = parseInt(row.querySelector('.inst-nb').value,10) || 0;
    if(nb <= 0) return;
    try {
      const payload = { id, index: idx, quantity: nb };
      if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
      const resp = await fetch('/api/infrastructure/instant_production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('[infra] Conversion instantanée réponse', resp.status);
      if(resp.ok){
        await loadAndRender(currentSeigneurieId);
      }else{
        const msg = await readApiError(resp, 'Conversion de production impossible.');
        console.warn('[infra] Conversion refusée', resp.status, msg);
        alert(msg);
      }
    } catch (err) {
      console.error('[infra] Erreur réseau lors de la conversion', err);
      alert(`Erreur réseau lors de la conversion : ${err.message || 'serveur injoignable'}. Vérifiez votre connexion puis réessayez.`);
    }
  } else if (e.target.classList.contains('infra-destroy-btn')) {
    const id = e.target.dataset.id;
    const ok = await showConfirm('Détruire cette infrastructure ? Les ressources dépensées ne seront pas récupérées. Êtes-vous sûr ?');
    if(!ok) return;
    try {
      const payload = { id };
      if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
      const resp = await fetch('/api/infrastructure/destroy', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if(resp.ok){
        await loadAndRender(currentSeigneurieId);
      } else {
        const msg = await readApiError(resp, 'Destruction de l’infrastructure impossible.');
        console.warn('[infra] Destruction refusée', resp.status, msg);
        alert(msg);
      }
    } catch (err) {
      console.error('[infra] Erreur réseau lors de la destruction', err);
      alert(`Erreur réseau lors de la destruction : ${err.message || 'serveur injoignable'}. Vérifiez votre connexion puis réessayez.`);
    }
  }
}

async function handleInfraTableChange(e) {
  if (e.target.classList.contains('var-workers-input')) {
    const id = e.target.dataset.id;
    const idx = e.target.dataset.idx;
    const qty = parseInt(e.target.value,10) || 0;
    const ip = gameState.ipMap[id];
    const entry = gameState.infrastructures[id] || gameState.infrastructures[String(id)] || {};
    const built = typeof entry === 'object' ? (entry.built || 0) : entry;
    let eff;
    try { eff = JSON.parse(ip.effects || '[]')[idx]; } catch { eff = null; }
    if(!eff) return;
    const maxWorkers = (eff.max_workers || 0) * built;
    const current = entry[`effect_${idx}_workers`] || 0;
    const freePop = availableWorkers(gameState.s.population, gameState.employment, gameState.employmentDetails, current);
    if(qty > maxWorkers){
      alert('Nombre trop élevé');
      e.target.value = current;
      updateVarWorkers(e.target);
      return;
    }
    if(qty > current && qty > freePop){
      alert('Population non employée insuffisante');
      e.target.value = current;
      updateVarWorkers(e.target);
      return;
    }
    try {
      const payload = { id, index: idx, quantity: qty };
      if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
      const resp = await fetch('/api/infrastructure/assign_workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if(resp.ok){
        await loadAndRender(currentSeigneurieId);
      }else{
        const msg = await readApiError(resp, 'Affectation des travailleurs impossible.');
        console.warn('[infra] Assignation refusée', resp.status, msg);
        alert(msg);
      }
    } catch(err){
      console.error('[infra] Erreur réseau affectation', err);
      alert(`Erreur réseau lors de l’affectation : ${err.message || 'serveur injoignable'}. Vérifiez votre connexion puis réessayez.`);
    }
  } else if (e.target.classList.contains('infra-built-input')) {
    const id = e.target.dataset.id;
    const qty = parseInt(e.target.value,10) || 0;
    adminUpdate({ infrastructures: { [id]: qty } });
  }
}

function buildInfraTable(list, infraBuilt = {}, inv = {}, tableId, editable = false) {
  const { buildings = {}, infrastructures = {}, s = {}, bpMap = {}, ipMap = {}, productionDetails = {}, baronyProps = {} } = gameState || {};
  const hasSpecialActions = list.some(ip => {
    const effects = safeParse(ip.effects, []);
    return Array.isArray(effects) && effects.some(effect =>
      effect.type === 'instant_production' || effect.type === 'variable_workers');
  });
  let html = `<table class="admin-table" id="${tableId}"><tr><th>Nom</th><th>Construits</th><th>Max</th><th>Effets</th><th>Requis</th><th>Coût</th><th>Construire</th><th>Détruire</th>${hasSpecialActions ? '<th class="multi-col">Actions spéciales</th>' : ''}</tr>`;
  for (const ip of list) {
    const entry = infraBuilt[ip.id] || infraBuilt[String(ip.id)] || 0;
    const built = typeof entry === 'object' ? (entry.built || 0) : entry;
    const entryObj = typeof entry === 'object' ? entry : {};

    let maxVal = Infinity;
    if (ip.max !== undefined && ip.max !== null && ip.max !== '') {
      const parsed = parseInt(ip.max, 10);
      if (!isNaN(parsed)) {
        maxVal = parsed;
      } else if (baronyProps[ip.max] !== undefined) {
        const dyn = parseInt(baronyProps[ip.max], 10);
        if (!isNaN(dyn) && dyn > 0) maxVal = dyn;
      }
      try {
        const obj = JSON.parse(ip.max);
        if (obj && typeof obj === 'object' && obj.tag) {
          const tagId = obj.tag || obj.tag_id;
          const per = obj.per || obj.value || 1;
          const count = tagCounts[tagId] || 0;
          const computed = count * per;
          if (!isNaN(computed)) {
            maxVal = Math.min(maxVal, computed);
          }
        }
      } catch {}
    }
    const maxValDisplay = maxVal === Infinity ? '' : maxVal;
    let maxReached = false;
    if (maxValDisplay !== '') {
      const maxNum = parseInt(maxValDisplay, 10);
      if (!isNaN(maxNum) && built >= maxNum) maxReached = true;
    }

    const effectsHtml = (ip.description || '').replace(/\n/g, '<br>');

    let costHtml = '';
    let hasRes = true;
    try {
      const costs = ip.costs ? JSON.parse(ip.costs) : {};
      const parts = [];
      for (const [k, q] of Object.entries(costs)) {
        const label = resourceLabels[k] || k;
        const ok = (inv[k] || 0) >= q;
        if (!ok) hasRes = false;
        const color = ok ? '' : ' style="color:red"';
        parts.push(`<span${color}>${label}: ${q}</span>`);
      }
      costHtml = parts.join('<br>');
    } catch {}

    let restrHtml = '';
    let restrOk = true;
    try {
      const restr = ip.restrictions ? JSON.parse(ip.restrictions) : {};
      const parts = [];
      if (restr.buildings) {
        for (const [bid, qty] of Object.entries(restr.buildings)) {
          const ref = bpMap[String(bid)];
          const name = ref ? (ref.label || ref.type) : bid;
          const builtInfo = buildings[bid] || buildings[String(bid)] || {};
          const ok = (builtInfo.built || 0) >= qty;
          if (!ok) restrOk = false;
          const color = ok ? '' : ' style="color:red"';
          parts.push(`<span${color}>${formatRestriction(name, qty)}</span>`);
        }
      }
      if (restr.infrastructures) {
        for (const [iid, qty] of Object.entries(restr.infrastructures)) {
          const ref = ipMap[String(iid)];
          const name = ref ? (ref.label || ref.type) : iid;
          const entry = infrastructures[iid] || infrastructures[String(iid)] || 0;
          const builtCount = typeof entry === 'object' ? (entry.built || 0) : entry;
          const ok = builtCount >= qty;
          if (!ok) restrOk = false;
          const color = ok ? '' : ' style="color:red"';
          parts.push(`<span${color}>${formatRestriction(name, qty)}</span>`);
        }
      }
      if (restr.population) {
        const ok = (s.population || 0) >= restr.population;
        if (!ok) restrOk = false;
        const color = ok ? '' : ' style="color:red"';
        parts.push(`<span${color}>Avoir au moins ${restr.population} population</span>`);
      }
      if (restr.resources) {
        for (const [res, qty] of Object.entries(restr.resources)) {
          const label = resourceLabels[res] || res;
          const ok = (inv[res] || 0) >= qty;
          if (!ok) restrOk = false;
          const color = ok ? '' : ' style="color:red"';
          parts.push(`<span${color}>Avoir au moins ${qty} ${label}</span>`);
        }
      }
      if (restr.tags) {
        restr.tags.forEach(cond => {
          const tagId = cond.tag || cond.tag_id;
          const cmp = cond.cmp || cond.op;
          const qty = cond.value;
          const name = tagLabels[tagId] || tagId;
          const count = tagCounts[tagId] || 0;
          const ok = cmp === '>=' ? count >= qty : count <= qty;
          if (!ok) restrOk = false;
          const color = ok ? '' : ' style="color:red"';
          const cmpText = cmp === '>=' ? 'Avoir au moins' : 'Avoir au plus';
          parts.push(`<span${color}>${cmpText} ${qty} ${name}</span>`);
        });
      }
      restrHtml = parts.join('<br>');
    } catch {}

    const canBuild = hasRes && restrOk;
    const builtField = editable ? `<input type="number" class="infra-built-input" data-id="${ip.id}" value="${built}" style="width:6em">` : built;
    html += `<tr data-id="${ip.id}"><td>${ip.label}</td><td>${builtField}</td><td>${maxValDisplay}</td><td>${effectsHtml}</td><td>${restrHtml}</td><td>${costHtml}</td>`;
    if (maxReached) {
      html += '<td></td>';
    } else {
      html += `<td><button class="build-btn infra-build-btn" data-id="${ip.id}"${canBuild ? '' : ' disabled'}>Construire</button></td>`;
    }
    if (built > 0) {
      html += `<td><button class="destroy-btn infra-destroy-btn" data-id="${ip.id}">Détruire</button></td>`;
    } else {
      html += '<td></td>';
    }

    let extraHtml = '';
    try {
      const effects = ip.effects ? JSON.parse(ip.effects) : [];
      const tables = [];
      if (built > 0) {
        effects.forEach((eff, idx) => {
          if (eff.type === 'instant_production') {
            const remainKey = `effect_${idx}_remaining`;
            const remaining = entryObj[remainKey] || 0;
            const label = resourceLabels[eff.resource] || eff.resource;
            const baseCosts = eff.costs || {};
            const costStr = Object.entries(baseCosts).map(([r,a])=>{
              const lbl = resourceLabels[r] || r; return `${lbl}: ${a*remaining}`; }).join(', ');
            tables.push(`<table class="admin-table instant-prod-table"><tr><th>Production</th><th>Restant</th><th>Nb</th><th>Coût total</th><th>Convertir</th></tr><tr><td class="prod-cell" data-base="${eff.amount}" data-res="${eff.resource}">${eff.amount} ${label}</td><td class="rem-cell">${remaining}</td><td><input type="number" class="inst-nb" min="1" max="${remaining}" value="${remaining}" oninput="updateInstantCost(this)"></td><td class="cost-cell" data-costs='${JSON.stringify(baseCosts)}'>${costStr}</td><td><button class="instant-btn" data-id="${ip.id}" data-idx="${idx}">Convertir</button></td></tr></table>`);
          } else if (eff.type === 'variable_workers') {
            const workerKey = `effect_${idx}_workers`;
            const assigned = entryObj[workerKey] || 0;
            const maxWorkers = (eff.max_workers || 0) * built;
            const label = resourceLabels[eff.resource] || eff.resource;
            let per = eff.amount || 0;
            const details = productionDetails[eff.resource] || [];
            const det = details.find(d => d.label === (ip.label || ip.type));
            if (det && det.source) {
              per = det.amount / det.source;
            }
            const prodTotal = assigned * per;
            tables.push(`<table class="admin-table var-workers-table"><tr><th>Assignés</th><th>Max</th><th>Production</th></tr><tr><td><input type="number" class="var-workers-input" data-id="${ip.id}" data-idx="${idx}" min="0" max="${maxWorkers}" value="${assigned}" oninput="updateVarWorkers(this)"></td><td>${maxWorkers}</td><td class="vw-prod" data-per="${per}" data-res="${eff.resource}">${prodTotal} ${label}</td></tr></table>`);
          }
        });
      }
      if (tables.length) {
        extraHtml = tables.join('');
      }
    } catch {}
    html += `${hasSpecialActions ? `<td class="multi-col">${extraHtml}</td>` : ''}</tr>`;
  }
  html += '</table>';
  return html;
}

function updateInstantCost(el){
  const tr = el.closest('tr');
  const costCell = tr.querySelector('.cost-cell');
  const base = JSON.parse(costCell.dataset.costs || '{}');
  const nb = parseInt(el.value,10) || 0;
  const parts = [];
  for(const [r,a] of Object.entries(base)){
    const label = resourceLabels[r] || r;
    parts.push(`${label}: ${a*nb}`);
  }
  costCell.textContent = parts.join(', ');
  const prodCell = tr.querySelector('.prod-cell');
  const amount = parseInt(prodCell.dataset.base,10) || 0;
  const res = resourceLabels[prodCell.dataset.res] || prodCell.dataset.res;
  prodCell.textContent = `${amount*nb} ${res}`;
}

function updateVarWorkers(el){
  const tr = el.closest('tr');
  const prodCell = tr.querySelector('.vw-prod');
  const per = parseFloat(prodCell.dataset.per) || 0;
  const res = resourceLabels[prodCell.dataset.res] || prodCell.dataset.res;
  const nb = parseInt(el.value,10) || 0;
  prodCell.textContent = `${nb * per} ${res}`;
}

function handlePropChange(e) {
  const field = e.target.dataset.field;
  if (!field) return;
  let value;
  if (baronyPropBoolFields.includes(field)) {
    value = e.target.value === '1' ? 1 : 0;
  } else {
    value = e.target.value;
    value = value === '' ? null : parseInt(value, 10);
  }
  gameState.baronyProps[field] = value;
  adminUpdateBaronyProps({ [field]: value });
}

function openEffectsEditor() {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  const popup = document.createElement('div');
  popup.className = 'popup';
  const editor = makeEffectsInput(gameState.baronyProps.effects || '[]');
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
    const val = editor.getValue();
    gameState.baronyProps.effects = val;
    adminUpdateBaronyProps({ effects: val });
    overlay.remove();
  });
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

function makeEffectsInput(val) {
  const container = document.createElement('div');
  const list = document.createElement('div');
  container.appendChild(list);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '+';
  container.appendChild(addBtn);
  function addRow(type = '', data = {}) {
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
      {id:'variable_production', name:'Production ressource variable'},
      {id:'random_luxury', name:'Ressource de luxe aléatoire'}
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
      }else if(['idh','spell_success','spell_basic_discount','spell_advanced_discount','spell_range','spell_max_per_month'].includes(typeSel.value)){
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
      }else if(['idh','spell_success','spell_basic_discount','spell_advanced_discount','spell_range','spell_max_per_month'].includes(type)){
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

function buildTable(list, showMax = false, inv = {}, production = {}, productionDetails = {}, capacity = {}, editable = false) {
  const {
    buildings = {},
    bpMap = {},
    buildingBonuses = {},
    buildingBonusDetails = {}
  } = gameState;

  const buildingLabelSet = new Set(Object.values(bpMap).map(bp => bp.label || bp.type));
  const bonusSourceLabels = new Set();
  for (const arr of Object.values(buildingBonusDetails)) {
    for (const det of arr) bonusSourceLabels.add(det.label);
  }

  const buildingContribs = {};
  for (const [id, bp] of Object.entries(bpMap)) {
    const res = bp.produces;
    if (!res) continue;
    const info = buildings[id] || buildings[String(id)] || {};
    const active = info.active || 0;
    if (!active) continue;
    const base = bp.production || 0;
    let bonus = buildingBonuses[id] || buildingBonuses[String(id)] || 0;
    const bonusDetails = buildingBonusDetails[id] || buildingBonusDetails[String(id)] || [];
    if (!bonus && bonusDetails.length) {
      bonus = bonusDetails.reduce((sum, b) => sum + b.amount, 0);
    }
    const per = base + bonus;
    if (!per) continue;
    const amount = per * active;
    const lbl = `${active} ${bp.label || bp.type}`;
    if (!buildingContribs[res]) buildingContribs[res] = [];
    buildingContribs[res].push({ label: lbl, amount });
  }

  let html = '<tr><th>Ressource</th><th>Quantité</th><th>Production</th>';
  if (showMax) html += '<th>Maximum</th>';
  html += '</tr>';
  for (const [key, label] of list) {
    const qty = inv[key] ?? 0;
    const details = productionDetails[key] || [];
    const rows = [];
    if (buildingContribs[key]) rows.push(...buildingContribs[key]);
    for (const d of details) {
      if (buildingLabelSet.has(d.label) || bonusSourceLabels.has(d.label)) continue;
      rows.push({ label: formatDetailLabel(d.label), amount: d.amount });
    }
    const total =
      production[key] !== undefined
        ? production[key]
        : rows.reduce((sum, s) => sum + s.amount, 0);
    let prodHtml = '';
    if (total) {
      if (rows.length) {
        const tableRows = rows.map(r => `<tr><td>${r.label}</td><td>${spanAmount(r.amount)}</td></tr>`);
        prodHtml = `<span class="tooltip">${spanAmount(total)}<table class="tooltip-table">${tableRows.join('')}</table></span>`;
      } else {
        prodHtml = spanAmount(total);
      }
    }
    const qtyHtml = editable ? `<input type="number" class="resource-input" data-key="${key}" value="${qty}" style="width:6em">` : qty;
    html += `<tr><td>${label}</td><td>${qtyHtml}</td><td>${prodHtml}</td>`;
    if (showMax) html += `<td>${capacity[key] !== undefined ? capacity[key] : ''}</td>`;
    html += '</tr>';
  }
  return html;
}

function spanAmount(val, suffix = '') {
  const sign = val > 0 ? '+' : '';
  const cls = val > 0 ? 'prod-positive' : 'prod-negative';
  return `<span class="${cls}">${sign}${val}${suffix}</span>`;
}

function formatDetailLabel(label) {
  return label === 'Baronnie' ? 'Bonus Baronnie' : label;
}

function formatRestriction(name, qty) {
  if (qty === 1) {
    const article = name.trim().endsWith('e') ? 'une' : 'un';
    return `Nécessite ${article} ${name}`;
  }
  return `Avoir au moins ${qty} ${name}`;
}

function formatEffectText(e) {
  if (!e || typeof e !== 'object') return '';
  switch (e.type) {
    case 'storage':
      return `Stockage +${e.amount} ${resourceLabels[e.resource] || e.resource}`;
    case 'production':
      return `+${e.amount} ${resourceLabels[e.resource] || e.resource}`;
    case 'building_production': {
      const bp = gameState.bpMap ? gameState.bpMap[String(e.building)] : null;
      const lbl = bp ? (bp.label || bp.type) : e.building;
      return `+${e.amount} ${lbl}`;
    }
    case 'infra_production': {
      const ip = gameState.ipMap ? gameState.ipMap[String(e.infrastructure)] : null;
      const lbl = ip ? (ip.label || ip.type) : e.infrastructure;
      return `x${e.multiplier || e.amount} ${lbl}`;
    }
    case 'idh':
      return `IDH +${e.amount}`;
    case 'instant_production':
      return `${e.amount} ${resourceLabels[e.resource] || e.resource}`;
    case 'variable_workers':
      return `${e.amount} ${resourceLabels[e.resource] || e.resource}/travailleur`;
    case 'unlock_page':
      return `Débloque ${e.page}`;
    case 'spell_success':
      return `Réussite sort +${e.amount}%`;
    case 'spell_basic_discount':
      return `Réduc. sort basique +${e.amount}%`;
    case 'spell_advanced_discount':
      return `Réduc. sort avancé +${e.amount}%`;
    case 'spell_range':
      return `Portée sort +${e.amount}`;
    case 'spell_max_per_month':
      return `Sorts max +${e.amount}/mois`;
    case 'variable_production':
      return `Production ${resourceLabels[e.resource] || e.resource} ratio ${e.ratio} max ${e.max}`;
    case 'random_luxury':
      return `+${e.amount} ressource de luxe aléatoire`;
    default:
      return e.type || '';
  }
}

function buildPropsTable(props, isAdmin) {
  const effects = safeParse(props.effects, []);
  const effectText = effects.map(formatEffectText).filter(Boolean).join(', ');
  let html = '<table class="admin-table"><tr><th>Propriété</th><th>Valeur</th></tr>';
  for (const [key, label] of Object.entries(baronyPropLabels)) {
    if (key === 'effects') continue;
    let val = props[key];
    if (isAdmin) {
      if (baronyPropBoolFields.includes(key)) {
        const yesSel = val ? 'selected' : '';
        const noSel = !val ? 'selected' : '';
        html += `<tr><td>${label}</td><td><select class="prop-input" data-field="${key}"><option value="1" ${yesSel}>Oui</option><option value="0" ${noSel}>Non</option></select></td></tr>`;
      } else {
        const v = val !== undefined && val !== null ? val : '';
        html += `<tr><td>${label}</td><td><input type="number" class="prop-input" data-field="${key}" value="${v}"></td></tr>`;
      }
    } else {
      if (baronyPropBoolFields.includes(key)) {
        val = val ? 'Oui' : 'Non';
      } else if (val === undefined || val === null) {
        val = '';
      }
      html += `<tr><td>${label}</td><td>${val}</td></tr>`;
    }
  }
  if (isAdmin) {
    html += `<tr><td>Autres bonus</td><td><span id="effectsSummary">${effectText}</span> <button id="editEffectsBtn">Modifier</button></td></tr>`;
  } else {
    html += `<tr><td>Autres bonus</td><td>${effectText}</td></tr>`;
  }
  html += '</table>';
  return html;
}

async function castSpell(id) {
  try {
    const qtyInput = document.querySelector(`input.spell-qty[data-id="${id}"]`);
    const amount = qtyInput ? parseInt(qtyInput.value, 10) || 0 : 0;
    const targetSelect = document.getElementById('spellTargetSelect');
    const targetSeigneurieId = targetSelect ? parseInt(targetSelect.value, 10) : 0;
    const payload = { id, amount, target_seigneurie_id: targetSeigneurieId };
    if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
    const resp = await fetch('/api/cast_spell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const spell = currentSpells.find(s => String(s.id) === String(id));
    if (resp.ok) {
      const data = await resp.json();
      showSpellResult(data.success, spell, amount, null, data.randomLuxury);
      await loadAndRender(currentSeigneurieId);
    } else {
      const data = await resp.json().catch(() => ({}));
      showSpellResult(false, spell, amount, data.error || 'Impossible de lancer le sort');
    }
  } catch (e) {
    console.error('Erreur lancement sort', e);
    const spell = currentSpells.find(s => String(s.id) === String(id));
    showSpellResult(false, spell, 0, 'Impossible de lancer le sort');
  }
}

function renderSpellInfo() {
  const container = document.getElementById('spellInfo');
  if (!container) return;
  const { spellSuccess = 75, basicSpellDiscount = 0, advancedSpellDiscount = 0, spellRange = 5, spellMax = 0, spellsCast = 0,
    spellSuccessDetails = [], basicSpellDiscountDetails = [], advancedSpellDiscountDetails = [], spellRangeDetails = [], spellMaxDetails = [], inv = {}, capacities = {} } = gameState;
  const pmVal = (inv.points_magique || 0) + ' / ' + (capacities.points_magique || 0);
  container.innerHTML = `<table class="admin-table"><tr><th colspan="2">Informations générales</th></tr>
    <tr><td>Points magiques</td><td>${buildTooltipValue(pmVal, [])}</td></tr>
    <tr><td>Taux de réussite des sorts de base</td><td>${buildTooltipValue(spellSuccess + '%', spellSuccessDetails, '%')}</td></tr>
    <tr><td>Rabais sur les sorts de base</td><td>${buildTooltipValue(basicSpellDiscount + '%', basicSpellDiscountDetails, '%')}</td></tr>
    <tr><td>Rabais sur les sorts avancés</td><td>${buildTooltipValue(advancedSpellDiscount + '%', advancedSpellDiscountDetails, '%')}</td></tr>
    <tr><td>Portée des sorts</td><td>${buildTooltipValue(spellRange, spellRangeDetails)}</td></tr>
    <tr><td>Sorts jettables</td><td>${buildTooltipValue(spellsCast + ' / ' + spellMax, spellMaxDetails)}</td></tr>
  </table>`;
}

function renderSpells(spells) {
  currentSpells = spells;
  const container = document.getElementById('spellList');
  if (!container) return;
  const rows = spells.filter(s => s.type === 'base').map(s => {
    let baseCosts = {};
    try {
      const costs = JSON.parse(s.costs || '{}');
      const discount = gameState.basicSpellDiscount || 0;
      baseCosts = Object.fromEntries(Object.entries(costs).map(([r,a]) => [r, Math.round(a * (100 - discount) / 100)]));
    } catch {}
    let costStr = formatCosts(baseCosts);
    let effStr = s.description || '';
    let qtyField = '';
    let varEff = null;
    try {
      const effs = JSON.parse(s.effects || '[]');
      varEff = effs.find(e => e.type === 'variable_production');
    } catch {}
    if (varEff) {
      const baseStr = JSON.stringify(baseCosts).replace(/"/g, '&quot;');
      costStr = `<span class="spell-cost" data-id="${s.id}" data-base='${baseStr}' data-ratio="${varEff.ratio || 1}">${costStr}</span>`;
      qtyField = `<input type="number" class="spell-qty" data-id="${s.id}" min="1" ${varEff.max ? `max="${varEff.max}"` : ''}>`;
    }
    return `<tr><td>${s.label}</td><td>${costStr}</td><td>${effStr}</td><td>${qtyField}</td><td><button class="cast-spell" data-id="${s.id}">Lancer</button></td></tr>`;
  }).join('');
  const targetOptions = spellTargets.map(target => {
    const isOrigin = Number(target.seigneurie_id) === Number(gameState.s && gameState.s.id);
    const distance = Number.isFinite(target.distance) ? ` · ${target.distance}` : '';
    const ownLabel = isOrigin ? ' (vous)' : '';
    const label = `${target.barony_name || 'Baronnie inconnue'}${ownLabel}${distance}`;
    return `<option value="${target.seigneurie_id}">${escapeHtml(label)}</option>`;
  }).join('');
  const targetControl = targetOptions
    ? `<div class="spell-target-control"><label for="spellTargetSelect">Baronnie cible :</label><select id="spellTargetSelect">${targetOptions}</select><span>Portée : ${gameState.spellRange || 5}</span></div>`
    : '<p class="empty-state">Aucune seigneurie à portée ne peut recevoir un sort.</p>';
  container.innerHTML = `${targetControl}<table class="admin-table"><tr><th>Nom</th><th>Coût</th><th>Effets</th><th>Quantité</th><th></th></tr>${rows}</table>`;
  container.querySelectorAll('button.cast-spell').forEach(btn => {
    btn.disabled = !targetOptions;
    btn.addEventListener('click', () => castSpell(btn.dataset.id));
  });
  container.querySelectorAll('input.spell-qty').forEach(inp => {
    inp.addEventListener('input', () => updateSpellCost(inp.dataset.id));
  });
}

function formatCosts(costs) {
  return Object.entries(costs).map(([r, a]) => `${a} ${resourceLabels[r] || r}`).join(', ');
}

function updateSpellCost(id) {
  const span = document.querySelector(`span.spell-cost[data-id="${id}"]`);
  const input = document.querySelector(`input.spell-qty[data-id="${id}"]`);
  if (!span || !input) return;
  const baseCosts = JSON.parse(span.dataset.base || '{}');
  const ratio = parseFloat(span.dataset.ratio) || 1;
  const amount = parseInt(input.value, 10) || 0;
  const discount = gameState.basicSpellDiscount || 0;
  const pmCost = (baseCosts.points_magique || 0) + Math.ceil((amount / ratio) * (100 - discount) / 100);
  const newCosts = { ...baseCosts, points_magique: pmCost };
  span.textContent = formatCosts(newCosts);
}

function formatEffectSummary(e, amount, luxuryName) {
  if (e.type === 'production') {
    return `${e.amount} ${resourceLabels[e.resource] || e.resource}`;
  }
  if (e.type === 'variable_production') {
    return `${amount} ${resourceLabels[e.resource] || e.resource}`;
  }
  if (e.type === 'unlock_page') {
    return `Débloque ${e.page}`;
  }
  if (e.type === 'idh') {
    return `IDH ${e.amount}`;
  }
  if (e.type === 'random_luxury') {
    if (luxuryName) return `${e.amount} ${resourceLabels[luxuryName] || luxuryName}`;
    return `${e.amount} ressource de luxe aléatoire`;
  }
  return e.type;
}

function showSpellResult(success, spell, amount, error, randomLuxury) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  const popup = document.createElement('div');
  popup.className = `popup ${success ? 'spell-success' : 'spell-failure'}`;
  const title = document.createElement('h2');
  title.textContent = success ? 'Sort réussi' : 'Échec du sort';
  popup.appendChild(title);
  const content = document.createElement('div');
  if (success) {
    const effs = safeParse(spell.effects, []);
    let luxIdx = 0;
    const items = effs.map(e => {
      let luxName;
      if (e.type === 'random_luxury' && Array.isArray(randomLuxury)) {
        luxName = randomLuxury[luxIdx++] || null;
      }
      return `<li>${formatEffectSummary(e, amount, luxName)}</li>`;
    }).join('');
    content.innerHTML = `<ul>${items}</ul>`;
  } else {
    content.textContent = error || 'Le sort a échoué.';
  }
  popup.appendChild(content);
  const btn = document.createElement('button');
  btn.textContent = 'Fermer';
  btn.addEventListener('click', () => overlay.remove());
  popup.appendChild(btn);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

let tradeMapCore = null;
let tradeAdjacency = {};
let tradeBaronies = null;
let seigneurNameMap = {};
let newRouteMode = false;
let eligibleTargets = {};
let currentTradeBaronyId = null;
let seaZoneAdjacency = {};
let zoneBaronies = {};
let baronyZones = {};

let tradeLinksState = [];
let tradeRouteDialogData = { target: null, methods: [], method: 'land', landSelections: [], seaSelections: [] };
let tradePreviewState = null;
let maritimeZonePixelsState = {};
let maritimeZoneMapState = {};

async function ensureTradeData() {
  if (tradeBaronies && Object.keys(maritimeZoneMapState).length) return;
  try {
    const [barRes, seiRes, zoneRes] = await Promise.all([
      fetch('/api/baronies'),
      fetch('/api/seigneurs'),
      fetch('/api/maritime_zones')
    ]);
    const barData = barRes.ok ? await barRes.json() : [];
    const seigs = seiRes.ok ? await seiRes.json() : [];
    const zones = zoneRes.ok ? await zoneRes.json() : [];
    seigneurNameMap = Object.fromEntries(seigs.map(s => [s.id, s.name]));
    tradeBaronies = barData.map(b => ({
      id: b.id,
      name: b.name,
      seigneur_id: b.seigneur_id,
      seigneur_name: seigneurNameMap[b.seigneur_id]
    }));
    maritimeZoneMapState = Object.fromEntries(zones.map(z => [z.id, z]));
  } catch {
    tradeBaronies = [];
    maritimeZoneMapState = {};
  }
}

function computeShortestTradePath(startId, endId, adjacency) {
  if (!startId || !endId) return null;
  if (startId === endId) return { path: [startId], distance: 0 };
  const dist = { [startId]: 0 };
  const prev = {};
  const queue = [{ id: startId, dist: 0 }];
  while (queue.length) {
    let bestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].dist < queue[bestIndex].dist) bestIndex = i;
    }
    const current = queue.splice(bestIndex, 1)[0];
    if (!current || current.dist !== dist[current.id]) continue;
    if (current.id === endId) break;
    (adjacency[current.id] || []).forEach(next => {
      const nextId = parseInt(next.id, 10);
      if (!nextId) return;
      const weight = parseInt(next.distance, 10) || 1;
      const nextDist = current.dist + weight;
      if (dist[nextId] == null || nextDist < dist[nextId]) {
        dist[nextId] = nextDist;
        prev[nextId] = current.id;
        queue.push({ id: nextId, dist: nextDist });
      }
    });
  }
  if (dist[endId] == null) return null;
  const path = [];
  let cursor = endId;
  while (cursor != null) {
    path.push(cursor);
    if (cursor === startId) break;
    cursor = prev[cursor];
  }
  if (path[path.length - 1] !== startId) return null;
  path.reverse();
  return { path, distance: dist[endId] };
}

function computePathDistance(path, adjacency) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const edge = (adjacency[path[i]] || []).find(item => parseInt(item.id, 10) === path[i + 1]);
    if (!edge) return null;
    total += parseInt(edge.distance, 10) || 1;
  }
  return total;
}

function getTradeBaronyById(id) {
  return (tradeBaronies || []).find(b => b.id === id) || null;
}

function formatTradeBaronyLabel(barony) {
  if (!barony) return '';
  return `${barony.name || `Baronnie ${barony.id}`} (#${barony.id})`;
}

function formatTradeZoneLabel(zoneId) {
  const zone = maritimeZoneMapState[zoneId];
  return zone ? `${zone.name || `Zone ${zone.id}`} (#${zone.id})` : `Zone ${zoneId}`;
}

function buildFullLandPath(link) {
  const stored = Array.isArray(link.path) ? link.path.slice() : [];
  return link.barony_id_1 === currentTradeBaronyId
    ? [link.barony_id_1, ...stored, link.barony_id_2]
    : [link.barony_id_2, ...stored.slice().reverse(), link.barony_id_1];
}

function buildFullSeaPath(link) {
  return link.barony_id_1 === currentTradeBaronyId ? link.path.slice() : link.path.slice().reverse();
}

function getTradeLinkDistance(link) {
  return link.type === 'land'
    ? (computePathDistance(buildFullLandPath(link), tradeAdjacency) || 0)
    : (computePathDistance(buildFullSeaPath(link), seaZoneAdjacency) || 0);
}

function buildTradeLinkSummary(link) {
  return (link.type === 'land'
    ? buildFullLandPath(link).map(id => formatTradeBaronyLabel(getTradeBaronyById(id)))
    : buildFullSeaPath(link).map(id => formatTradeZoneLabel(id))
  ).join(' -> ');
}

async function initTradeMap() {
  if (tradeMapCore) return;
  const base = document.getElementById('tradeBaseMap');
  const canvas = document.getElementById('tradeCanvas');
  if (!base || !canvas) return;
  const baseLoaded = base.complete ? Promise.resolve() : new Promise(res => (base.onload = res));
  await baseLoaded;
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  tradeMapCore = mapCore.init({
    canvas,
    enablePan: false,
    enableZoom: false,
    staticMap: true,
    onSelect: handleTradeMapSelect,
    drawOverlay: ctx => {
      if (!tradePreviewState || !tradePreviewState.seaPath || !tradePreviewState.seaPath.length) return;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 128, 255, 0.45)';
      tradePreviewState.seaPath.forEach(zoneId => {
        (maritimeZonePixelsState[zoneId] || []).forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
      });
      ctx.restore();
    },
    fetchData: async () => {
      const [pixels, connections, zoneConns, zoneBars, zonePixels] = await Promise.all([
        fetch('/api/barony_pixels').then(r => r.json()),
        fetch('/api/barony_connections').then(r => r.json()),
        fetch('/api/maritime_zone_connections').then(r => r.json()),
        fetch('/api/maritime_zone_baronies').then(r => r.json()),
        fetch('/api/maritime_zone_pixels').then(r => r.json())
      ]);
      tradeAdjacency = {};
      connections.forEach(c => {
        const dist = parseInt(c.distance, 10) || 1;
        if (!tradeAdjacency[c.barony_id_1]) tradeAdjacency[c.barony_id_1] = [];
        if (!tradeAdjacency[c.barony_id_2]) tradeAdjacency[c.barony_id_2] = [];
        tradeAdjacency[c.barony_id_1].push({ id: c.barony_id_2, distance: dist });
        tradeAdjacency[c.barony_id_2].push({ id: c.barony_id_1, distance: dist });
      });
      seaZoneAdjacency = {};
      zoneConns.forEach(c => {
        const dist = parseInt(c.distance, 10) || 1;
        if (!seaZoneAdjacency[c.zone_id_1]) seaZoneAdjacency[c.zone_id_1] = [];
        if (!seaZoneAdjacency[c.zone_id_2]) seaZoneAdjacency[c.zone_id_2] = [];
        seaZoneAdjacency[c.zone_id_1].push({ id: c.zone_id_2, distance: dist });
        seaZoneAdjacency[c.zone_id_2].push({ id: c.zone_id_1, distance: dist });
      });
      zoneBaronies = {};
      baronyZones = {};
      zoneBars.forEach(zb => {
        if (!zoneBaronies[zb.zone_id]) zoneBaronies[zb.zone_id] = [];
        zoneBaronies[zb.zone_id].push(zb.barony_id);
        if (!baronyZones[zb.barony_id]) baronyZones[zb.barony_id] = [];
        baronyZones[zb.barony_id].push(zb.zone_id);
      });
      maritimeZonePixelsState = zonePixels || {};
      return { mapWidth: base.naturalWidth, mapHeight: base.naturalHeight, pixelData: pixels };
    }
  });
  await tradeMapCore.ready;
  window.tradeMapCore = tradeMapCore;
}

function setTradePreview(link = null) {
  tradePreviewState = link ? {
    landPath: link.type === 'land' ? buildFullLandPath(link) : [currentTradeBaronyId, link.partner_id],
    seaPath: link.type === 'naval' ? buildFullSeaPath(link) : []
  } : null;
  if (!tradeMapCore) return;
  tradeMapCore.setSelectedBaronies(tradePreviewState ? tradePreviewState.landPath : []);
  tradeMapCore.drawAll();
}

async function updateTradeMap(baronyId, links) {
  await initTradeMap();
  if (!tradeMapCore) return;
  const normalizedLinks = Array.isArray(links) ? links : [];
  const bg = [...mapCore.terrainColor, 100];
  const landColor = [128, 0, 128, 100];
  const seaColor = [0, 128, 255, 100];
  const currentColor = [255, 237, 0, 180];
  const colorMap = {};
  const patternMap = {};
  Object.keys(tradeMapCore.pixelData).forEach(id => { colorMap[id] = [...bg]; });
  if (baronyId) {
    const landSet = new Set(normalizedLinks.filter(link => link.type === 'land').map(link => link.partner_id));
    const seaSet = new Set(normalizedLinks.filter(link => link.type === 'naval').map(link => link.partner_id));
    landSet.forEach(id => { colorMap[String(id)] = [...landColor]; });
    seaSet.forEach(id => {
      if (landSet.has(id)) {
        delete colorMap[String(id)];
        patternMap[String(id)] = [landColor, seaColor];
      } else {
        colorMap[String(id)] = [...seaColor];
      }
    });
    colorMap[String(baronyId)] = [...currentColor];
  }
  tradeMapCore.setColorMap(colorMap);
  tradeMapCore.setCanonicalPatterns(patternMap);
}

function getAvailableMethods(targetId) {
  return tradeLinksState
    .filter(link => link.partner_id === targetId)
    .filter(link => (
      (link.type === 'land' && (!gameState.landTxMax || gameState.landTransactions < gameState.landTxMax)) ||
      (link.type === 'naval' && (!gameState.navalTxMax || gameState.navalTransactions < gameState.navalTxMax))
    ))
    .map(link => link.type);
}

function getBuildMethods(targetId) {
  const methods = [];
  const landPath = computeShortestTradePath(currentTradeBaronyId, targetId, tradeAdjacency);
  if (landPath && landPath.path && landPath.path.length >= 2) methods.push('land');
  const seaPossible = (baronyZones[currentTradeBaronyId] || []).some(startZone =>
    (baronyZones[targetId] || []).some(endZone => {
      const path = computeShortestTradePath(startZone, endZone, seaZoneAdjacency);
      return path && path.path && path.path.length;
    })
  );
  if (seaPossible) methods.push('naval');
  return methods;
}

function buildTradeRoutePath(selections) {
  return Array.isArray(selections) && selections.length ? selections.slice(0, -1) : [];
}

function isTradeRoutePathComplete(startId, endId, selections) {
  return !!(startId && endId && Array.isArray(selections) && selections.length && selections[selections.length - 1] === endId);
}

function isTradeLinePathComplete(startId, endId, selections) {
  if (!startId || !endId || !Array.isArray(selections) || !selections.length) return false;
  const startZones = new Set(baronyZones[startId] || []);
  const endZones = new Set(baronyZones[endId] || []);
  return startZones.has(selections[0]) && endZones.has(selections[selections.length - 1]);
}

function autoPopulateTradeRouteDialog() {
  const target = tradeRouteDialogData.target;
  if (!target) return;
  if (tradeRouteDialogData.method === 'land') {
    const computed = computeShortestTradePath(currentTradeBaronyId, target.id, tradeAdjacency);
    tradeRouteDialogData.landSelections = computed && computed.path ? computed.path.slice(1) : [];
    return;
  }
  const startZones = baronyZones[currentTradeBaronyId] || [];
  const endZones = baronyZones[target.id] || [];
  let bestPath = null;
  startZones.forEach(startZone => {
    endZones.forEach(endZone => {
      const computed = computeShortestTradePath(startZone, endZone, seaZoneAdjacency);
      if (!computed || !computed.path || !computed.path.length) return;
      if (!bestPath || computed.distance < bestPath.distance) bestPath = computed;
    });
  });
  tradeRouteDialogData.seaSelections = bestPath && bestPath.path ? bestPath.path.slice() : [];
}

function renderTradeRouteDialogSteps() {
  const steps = document.getElementById('tradeRoutePathSteps');
  if (!steps) return;
  steps.innerHTML = '';
  const target = tradeRouteDialogData.target;
  if (!target || !currentTradeBaronyId) return;
  if (tradeRouteDialogData.method === 'land') {
    const rendered = tradeRouteDialogData.landSelections.slice();
    if (!rendered.length || rendered[rendered.length - 1] !== target.id) rendered.push(null);
    const used = new Set([currentTradeBaronyId]);
    rendered.forEach((selected, index) => {
      const previousId = index === 0 ? currentTradeBaronyId : rendered[index - 1];
      if (!previousId) return;
      const select = document.createElement('select');
      select.dataset.index = String(index);
      select.innerHTML = '<option value=""></option>';
      (tradeAdjacency[previousId] || []).map(item => item.id).filter(id => !used.has(id)).forEach(id => {
        const option = document.createElement('option');
        option.value = String(id);
        option.textContent = formatTradeBaronyLabel(getTradeBaronyById(id));
        select.appendChild(option);
      });
      if (selected) select.value = String(selected);
      select.addEventListener('change', event => {
        const idx = parseInt(event.target.dataset.index, 10);
        const value = parseInt(event.target.value, 10);
        const nextSelections = tradeRouteDialogData.landSelections.slice(0, idx);
        if (value) nextSelections[idx] = value;
        tradeRouteDialogData.landSelections = nextSelections;
        renderTradeRouteDialogSteps();
        updateTradeRouteDialogHint();
      });
      steps.appendChild(select);
      if (selected) used.add(selected);
    });
    return;
  }
  const rendered = tradeRouteDialogData.seaSelections.slice();
  const startZones = new Set(baronyZones[currentTradeBaronyId] || []);
  const endZones = new Set(baronyZones[tradeRouteDialogData.target.id] || []);
  if (!(rendered.length && endZones.has(rendered[rendered.length - 1]))) rendered.push(null);
  const used = new Set();
  rendered.forEach((selected, index) => {
    const previousId = index === 0 ? null : rendered[index - 1];
    const select = document.createElement('select');
    select.dataset.index = String(index);
    select.innerHTML = '<option value=""></option>';
    const options = index === 0 ? [...startZones] : (seaZoneAdjacency[previousId] || []).map(item => item.id).filter(id => !used.has(id));
    options.forEach(id => {
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = formatTradeZoneLabel(id);
      select.appendChild(option);
    });
    if (selected) select.value = String(selected);
    select.addEventListener('change', event => {
      const idx = parseInt(event.target.dataset.index, 10);
      const value = parseInt(event.target.value, 10);
      const nextSelections = tradeRouteDialogData.seaSelections.slice(0, idx);
      if (value) nextSelections[idx] = value;
      tradeRouteDialogData.seaSelections = nextSelections;
      renderTradeRouteDialogSteps();
      updateTradeRouteDialogHint();
    });
    steps.appendChild(select);
    if (selected) used.add(selected);
  });
}

function updateTradeRouteDialogHint(message = '') {
  const hint = document.getElementById('tradeRouteHint');
  const saveBtn = document.getElementById('tradeRouteSave');
  if (!hint || !saveBtn) return;
  const target = tradeRouteDialogData.target;
  let text = message;
  let disabled = false;
  if (!target || !currentTradeBaronyId) {
    text = 'Aucune destination sélectionnée.';
    disabled = true;
  } else if (tradeRouteDialogData.method === 'land') {
    if (!isTradeRoutePathComplete(currentTradeBaronyId, target.id, tradeRouteDialogData.landSelections)) {
      text = text || 'Le chemin terrestre doit atteindre la baronnie cible.';
      disabled = true;
    } else {
      const path = [currentTradeBaronyId, ...buildTradeRoutePath(tradeRouteDialogData.landSelections), target.id];
      const distance = computePathDistance(path, tradeAdjacency) || 0;
      text = `${distance} segment(s) terrestres, coût ${distance * 3} Or.`;
    }
  } else if (!isTradeLinePathComplete(currentTradeBaronyId, target.id, tradeRouteDialogData.seaSelections)) {
    text = text || 'Le chemin maritime doit partir d’une zone locale et finir sur une zone de destination.';
    disabled = true;
  } else {
    const distance = computePathDistance(tradeRouteDialogData.seaSelections, seaZoneAdjacency) || 0;
    text = `${distance} segment(s) maritimes, coût ${distance * 3} Or.`;
  }
  hint.textContent = text;
  saveBtn.disabled = disabled;
}

function ensureTradeRouteDialog() {
  const dialog = document.getElementById('tradeRouteDialog');
  const methodSelect = document.getElementById('tradeRouteMethod');
  const cancelBtn = document.getElementById('tradeRouteCancel');
  const saveBtn = document.getElementById('tradeRouteSave');
  if (!dialog || dialog.dataset.ready) return;
  if (methodSelect) {
    methodSelect.addEventListener('change', () => {
      tradeRouteDialogData.method = methodSelect.value === 'naval' ? 'naval' : 'land';
      autoPopulateTradeRouteDialog();
      renderTradeRouteDialogSteps();
      updateTradeRouteDialogHint();
    });
  }
  if (cancelBtn) cancelBtn.addEventListener('click', () => dialog.close());
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const target = tradeRouteDialogData.target;
      if (!target) return;
      const payload = { barony_id: target.id, type: tradeRouteDialogData.method };
      if (tradeRouteDialogData.method === 'land') {
        if (!isTradeRoutePathComplete(currentTradeBaronyId, target.id, tradeRouteDialogData.landSelections)) {
          updateTradeRouteDialogHint('Le chemin terrestre doit être complet.');
          return;
        }
        payload.path = buildTradeRoutePath(tradeRouteDialogData.landSelections);
      } else {
        if (!isTradeLinePathComplete(currentTradeBaronyId, target.id, tradeRouteDialogData.seaSelections)) {
          updateTradeRouteDialogHint('Le chemin maritime doit être complet.');
          return;
        }
        payload.path = tradeRouteDialogData.seaSelections.slice();
      }
      try {
        const res = await fetch('/api/users/me/trade_links/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Construction impossible');
          return;
        }
        dialog.close();
        await renderTradeRoutes(currentTradeBaronyId);
      } catch {
        alert('Construction impossible');
      }
    });
  }
  dialog.dataset.ready = 'true';
}

function openTradeRouteDialog(target) {
  const dialog = document.getElementById('tradeRouteDialog');
  const targetText = document.getElementById('tradeRouteDialogTarget');
  const methodSelect = document.getElementById('tradeRouteMethod');
  if (!dialog || !target || !methodSelect) return;
  ensureTradeRouteDialog();
  tradeRouteDialogData.target = target;
  tradeRouteDialogData.methods = getBuildMethods(target.id);
  if (!tradeRouteDialogData.methods.length) {
    alert('Aucun trajet valide vers cette baronnie.');
    return;
  }
  tradeRouteDialogData.method = tradeRouteDialogData.methods.includes('land') ? 'land' : tradeRouteDialogData.methods[0];
  tradeRouteDialogData.landSelections = [];
  tradeRouteDialogData.seaSelections = [];
  if (targetText) targetText.textContent = `Destination : ${formatTradeBaronyLabel(target)}${target.seigneur_name ? `, gérée par ${target.seigneur_name}` : ''}`;
  methodSelect.innerHTML = tradeRouteDialogData.methods.map(method => `<option value="${method}">${method === 'land' ? 'Route terrestre' : 'Ligne maritime'}</option>`).join('');
  methodSelect.value = tradeRouteDialogData.method;
  methodSelect.disabled = tradeRouteDialogData.methods.length <= 1;
  autoPopulateTradeRouteDialog();
  renderTradeRouteDialogSteps();
  updateTradeRouteDialogHint();
  dialog.showModal();
}

async function startTradeRouteCreation() {
  if (newRouteMode) {
    newRouteMode = false;
    eligibleTargets = {};
    await updateTradeMap(currentTradeBaronyId, tradeLinksState);
    return;
  }
  if (!currentTradeBaronyId) return;
  await ensureTradeData();
  eligibleTargets = {};
  tradeBaronies.forEach(b => {
    if (!b.seigneur_id || b.id === currentTradeBaronyId) return;
    const existingTypes = new Set(tradeLinksState.filter(link => link.partner_id === b.id).map(link => link.type));
    const methods = getBuildMethods(b.id).filter(method => !existingTypes.has(method));
    if (!methods.length) return;
    eligibleTargets[b.id] = { ...b, methods };
  });
  if (!Object.keys(eligibleTargets).length) {
    alert('Aucune baronnie disponible');
    return;
  }
  newRouteMode = true;
  const cm = { ...tradeMapCore.colorMap };
  Object.keys(eligibleTargets).forEach(id => { cm[id] = [0, 170, 255, 100]; });
  tradeMapCore.setColorMap(cm);
  tradeMapCore.currentSelectedId = null;
}

async function handleTradeMapSelect(id) {
  if (!id) return;
  if (!newRouteMode) {
    const idNum = parseInt(id, 10);
    const methods = getAvailableMethods(idNum);
    if (!methods.length) {
      if (tradeMapCore && tradeMapCore.colorMap[id]) {
        tradeMapCore.colorMap[id][3] = 100;
        tradeMapCore.currentSelectedId = null;
        tradeMapCore.drawAll();
      }
      return;
    }
    await ensureTradeData();
    const bar = tradeBaronies.find(b => b.id === idNum);
    const result = await showTradeDialog(bar ? bar.seigneur_name : '', methods);
    if (result) {
      await sendTransaction(idNum, result.resources, result.reason, result.method);
      await loadAndRender(currentSeigneurieId);
      await renderTradeRoutes(currentTradeBaronyId);
    }
    tradeMapCore.drawAll();
    return;
  }
  if (!eligibleTargets[id]) return;
  const target = eligibleTargets[id];
  newRouteMode = false;
  eligibleTargets = {};
  await updateTradeMap(currentTradeBaronyId, tradeLinksState);
  openTradeRouteDialog(target);
}

function renderTradeLimits() {
  const table = document.getElementById('tradeLimitsTable');
  if (!table || !gameState) return;
  table.innerHTML =
    '<tr><th>Type</th><th>Présent</th><th>Max/mois</th></tr>' +
    `<tr><td>Terrestres</td><td>${gameState.landTransactions || 0}</td><td>${gameState.landTxMax || 0}</td></tr>` +
    `<tr><td>Maritimes</td><td>${gameState.navalTransactions || 0}</td><td>${gameState.navalTxMax || 0}</td></tr>`;
}

async function renderTradeRoutes(baronyId) {
  const container = document.getElementById('tradeRoutes');
  if (!container) return;
  renderTradeLimits();
  container.textContent = '';
  if (!baronyId) {
    container.textContent = 'Aucune baronnie sélectionnée';
    await updateTradeMap(null, []);
    return;
  }
  currentTradeBaronyId = baronyId;
  try {
    await ensureTradeData();
    const [landRes, seaRes] = await Promise.all([
      fetch(`/api/trade_routes?barony_id=${baronyId}`),
      fetch(`/api/trade_lines?barony_id=${baronyId}`)
    ]);
    const landRoutes = landRes.ok ? await landRes.json() : [];
    const seaRoutes = seaRes.ok ? await seaRes.json() : [];
    const landLinks = (Array.isArray(landRoutes) ? landRoutes : []).map(route => {
      const partnerId = route.barony_id_1 === baronyId ? route.barony_id_2 : route.barony_id_1;
      const partner = getTradeBaronyById(partnerId) || { id: partnerId };
      return { ...route, type: 'land', partner_id: partnerId, partner_name: partner.name || '', seigneur_name: partner.seigneur_name || '', path: Array.isArray(route.path) ? route.path : [] };
    });
    const seaLinks = (Array.isArray(seaRoutes) ? seaRoutes : []).map(line => {
      const partnerId = line.barony_id_1 === baronyId ? line.barony_id_2 : line.barony_id_1;
      const partner = getTradeBaronyById(partnerId) || { id: partnerId };
      return { ...line, type: 'naval', partner_id: partnerId, partner_name: partner.name || '', seigneur_name: partner.seigneur_name || '', path: Array.isArray(line.path) ? line.path : [] };
    });
    tradeLinksState = [...landLinks, ...seaLinks].sort((a, b) => a.partner_id - b.partner_id || a.type.localeCompare(b.type));
    setTradePreview(null);
    await updateTradeMap(baronyId, tradeLinksState);
    if (!tradeLinksState.length) {
      container.textContent = 'Aucune route commerciale';
      return;
    }
    const rows = tradeLinksState.map(link => {
      const limitReached = link.type === 'land'
        ? (gameState.landTxMax !== 0 && gameState.landTransactions >= gameState.landTxMax)
        : (gameState.navalTxMax !== 0 && gameState.navalTransactions >= gameState.navalTxMax);
      const pathLength = link.type === 'land' ? buildFullLandPath(link).length : buildFullSeaPath(link).length;
      return `<tr class="trade-link-row" data-link-id="${link.id}" data-link-type="${link.type}">
        <td>${link.type === 'land' ? 'Terre' : 'Mer'}</td>
        <td>${link.partner_id}</td>
        <td>${escapeHtml(link.partner_name)}</td>
        <td>${escapeHtml(link.seigneur_name)}</td>
        <td>${getTradeLinkDistance(link)}</td>
        <td title="${escapeHtml(buildTradeLinkSummary(link))}">${pathLength}</td>
        <td><button class="trade-btn control-btn" data-id="${link.partner_id}" data-method="${link.type}"${limitReached ? ' disabled' : ''}>Commercer</button></td>
      </tr>`;
    }).join('');
    container.innerHTML = `<table class="admin-table"><tr><th>Type</th><th>#</th><th>Baronnie</th><th>Propriétaire</th><th>Distance</th><th>Chemin</th><th></th></tr>${rows}</table>`;
    container.querySelectorAll('.trade-link-row').forEach(row => {
      row.addEventListener('mouseenter', () => {
        const link = tradeLinksState.find(item => item.id === parseInt(row.dataset.linkId, 10) && item.type === row.dataset.linkType);
        setTradePreview(link || null);
      });
      row.addEventListener('mouseleave', () => setTradePreview(null));
    });
    container.querySelectorAll('.trade-btn').forEach(btn => {
      if (!btn.disabled) btn.addEventListener('click', () => openTradeDialog(btn.dataset.id, btn.dataset.method));
    });
  } catch {
    container.textContent = 'Erreur de chargement';
    await updateTradeMap(baronyId, []);
  }
}

async function openTradeDialog(baronyId, forcedMethod = null) {
  await ensureTradeData();
  const idNum = parseInt(baronyId, 10);
  const methods = forcedMethod ? [forcedMethod] : getAvailableMethods(idNum);
  const bar = tradeBaronies.find(b => b.id === idNum);
  const name = bar ? bar.seigneur_name : '';
  const result = await showTradeDialog(name, methods);
  if (!result) return;
  await sendTransaction(idNum, result.resources, result.reason, result.method);
}

function showTradeDialog(seigneurName, methods) {
  return new Promise(resolve => {
    const dialog = document.getElementById('tradeDialog');
    const header = document.getElementById('tradeHeader');
    const list = document.getElementById('tradeList');
    const addBtn = document.getElementById('tradeAddRow');
    const cancelBtn = document.getElementById('tradeCancel');
    const sendBtn = document.getElementById('tradeSend');
    const reasonInput = document.getElementById('tradeReason');
    header.textContent = `Envoyer des ressources à ${seigneurName} par la `;
    const methodSel = document.createElement('select');
    methods.forEach(m => {
      const op = document.createElement('option');
      op.value = m;
      op.textContent = m === 'land' ? 'Terre' : 'Mer';
      methodSel.appendChild(op);
    });
    methodSel.disabled = methods.length <= 1;
    header.appendChild(methodSel);
    list.innerHTML = '';
    if (reasonInput) reasonInput.value = '';
    function addRow() {
      const row = document.createElement('div');
      const sel = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = '';
      sel.appendChild(blank);
      resourceSelect.forEach(o => {
        const op = document.createElement('option');
        op.value = o.id;
        op.textContent = o.name;
        sel.appendChild(op);
      });
      const qty = document.createElement('input');
      qty.type = 'number';
      qty.min = '0';
      sel.addEventListener('change', () => {
        const max = gameState.inv[sel.value] || 0;
        qty.max = String(max);
        if (parseInt(qty.value, 10) > max) qty.value = max;
      });
      row.appendChild(sel);
      row.appendChild(qty);
      list.appendChild(row);
      sel.dispatchEvent(new Event('change'));
    }
    addRow();
    addBtn.onclick = () => addRow();
    cancelBtn.onclick = () => { dialog.close(); resolve(null); };
    sendBtn.onclick = () => {
      const res = {};
      let valid = true;
      list.querySelectorAll('div').forEach(r => {
        const sel = r.querySelector('select');
        const inp = r.querySelector('input');
        const key = sel.value;
        const val = parseInt(inp.value, 10) || 0;
        if (key && val > 0) {
          const total = (res[key] || 0) + val;
          if (total > (gameState.inv[key] || 0)) valid = false;
          else res[key] = total;
        }
      });
      if (!valid || !Object.keys(res).length) {
        alert('Quantités invalides');
        return;
      }
      const reason = reasonInput ? reasonInput.value.trim() : '';
      const method = methodSel.value;
      dialog.close();
      resolve({ resources: res, reason, method });
    };
    dialog.showModal();
  });
}

async function sendTransaction(baronyId, resources, reason, method) {
  try {
    const payload = { target_barony_id: baronyId, resources, type: method, reason };
    if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
    const res = await fetch('/api/send_transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      await loadAndRender(currentSeigneurieId);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Transaction impossible');
    }
  } catch {
    alert('Transaction impossible');
  }
}

async function decideTx(id, action) {
  try {
    const payload = { action };
    if (currentSeigneurieId) payload.seigneurie_id = currentSeigneurieId;
    const res = await fetch(`/api/trade_transactions/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      await loadAndRender(currentSeigneurieId);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Erreur');
    }
  } catch {
    alert('Erreur');
  }
}

async function renderPendingTransactions() {
  const table = document.getElementById('pendingTxTable');
  if (!table) return;
  const header = '<thead><tr><th>Ressources</th><th>Origine</th><th>Mise à jour</th><th>Date</th><th>Raison</th><th>Statut</th></tr></thead>';
  try {
    const url = currentSeigneurieId
      ? `/api/trade_transactions?seigneurie_id=${currentSeigneurieId}`
      : '/api/trade_transactions';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Transactions indisponibles');
    const txs = await res.json();
    const rows = [];
    txs.forEach(tx => {
      const resSummary = Object.entries(tx.resources || {}).map(([k, v]) => `${escapeHtml(v)} ${escapeHtml(resourceLabels[k] || k)}`).join(', ');
      const origin = `${escapeHtml(tx.origin_name)} (${escapeHtml(tx.origin_barony_name)})`;
      const updateLabel = escapeHtml(tx.origin_update_label);
      const date = `<span class="timeago" datetime="${tx.created_at}"></span>`;
      let status;
      if (tx.state === 'En Attente') {
        status = `<button class="tx-open" data-id="${tx.id}">Consulter</button>`;
      } else if (tx.state === 'Approuvée' && !tx.received) {
        status = '<span title="Les ressources seront reçues lors de votre prochaine mise à jour.">En attente de réception</span>';
      } else {
        const label = tx.state === 'Approuvée' ? 'Approuvée' : 'Refusée';
        status = `<span title="${tx.decision_time ? new Date(tx.decision_time).toLocaleString() : ''}">${label}</span>`;
      }
      rows.push(`<tr><td>${resSummary}</td><td>${origin}</td><td>${updateLabel}</td><td>${date}</td><td>${escapeHtml(tx.reason)}</td><td>${status}</td></tr>`);
    });
    table.innerHTML = `${header}<tbody>${rows.join('') || '<tr><td colspan="6" class="table-empty-state">Aucune transaction en attente.</td></tr>'}</tbody>`;
    renderTransactionDates(table);
    table.querySelectorAll('.tx-open').forEach(btn => {
      btn.addEventListener('click', () => openTransactionPopup(btn.dataset.id));
    });
  } catch (error) {
    console.error('Erreur de chargement des transactions commerciales', error);
    table.innerHTML = `${header}<tbody><tr><td colspan="6" class="table-empty-state prod-negative">Impossible de charger les transactions. Rechargez la page.</td></tr></tbody>`;
  }
}

async function openTransactionPopup(id) {
  try {
    const res = await fetch(`/api/trade_transactions/${id}`);
    if (!res.ok) throw new Error('Erreur');
    const tx = await res.json();
    const dialog = document.getElementById('txDialog');
    const content = document.getElementById('txContent');
    const buttons = document.getElementById('txButtons');
    const refuseBtn = document.getElementById('txRefuse');
    const acceptBtn = document.getElementById('txAccept');
    const closeBtn = document.getElementById('txClose');
    const items = Object.entries(tx.resources || {}).map(([k, v]) => `<li>${escapeHtml(v)} ${escapeHtml(resourceLabels[k] || k)}</li>`).join('');
    const typeLabel = tx.type === 'naval' ? 'cargaison' : 'caravane';
    const currentUpdate = gameState.updateStatus && gameState.updateStatus.current;
    const originUpdate = { year: Number(tx.origin_update_year), number: Number(tx.origin_update_number) };
    const canAcceptNow = !currentUpdate || compareUpdateStatus(currentUpdate, originUpdate) >= 0;
    refuseBtn.style.display = 'none';
    acceptBtn.style.display = 'none';
    closeBtn.style.display = 'none';

    if (tx.state === 'Refusée' && Number(tx.origin_id) === Number(currentSeigneurieId)) {
      let claim = { returned: tx.resources, lost: {} };
      if (!tx.returned) {
        try {
          const cRes = await fetch(`/api/trade_transactions/${id}/claim`, { method: 'POST' });
          if (cRes.ok) {
            claim = await cRes.json();
            await loadAndRender(currentSeigneurieId);
          }
        } catch {}
      }
      const retItems = Object.entries(claim.returned || {}).map(([k, v]) => `<li>${escapeHtml(v)} ${escapeHtml(resourceLabels[k] || k)}</li>`).join('');
      let lossHtml = '';
      if (claim.lost && Object.keys(claim.lost).length) {
        const lossItems = Object.entries(claim.lost).map(([k, v]) => `<li>${escapeHtml(v)} ${escapeHtml(resourceLabels[k] || k)}</li>`).join('');
        lossHtml = `<p>Pertes :</p><ul>${lossItems}</ul>`;
      }
      content.innerHTML = `
        <p>Votre ${typeLabel} a destination de ${escapeHtml(tx.dest_name)} a ete refusee.</p>
        <p>Les ressources suivantes vous ont ete retournees :</p>
        <ul>${retItems}</ul>
        ${lossHtml}`;
      buttons.style.display = '';
      closeBtn.style.display = '';
      closeBtn.onclick = () => dialog.close();
    } else {
      const waitingMessage = !canAcceptNow
        ? `<p><strong>Blocage :</strong> vous ne pourrez l'accepter qu'a partir de ${escapeHtml(tx.origin_update_label || formatUpdateStatusLabel(originUpdate))}.</p>`
        : '';
      const receivedMessage = tx.state === 'Approuvée' && !tx.received
        ? '<p>Cette transaction a ete approuvee. Les ressources seront ajoutees lors de votre prochaine mise a jour.</p>'
        : '';
      content.innerHTML = `
        <p>Vous avez recu une ${typeLabel} de ${escapeHtml(tx.origin_name)} de la Baronnie de ${escapeHtml(tx.origin_barony_name)}.</p>
        <p><strong>Mise a jour d'envoi :</strong> ${escapeHtml(tx.origin_update_label || formatUpdateStatusLabel(originUpdate))}</p>
        <p><strong>Raison :</strong> ${escapeHtml(tx.reason || 'Aucune raison')}</p>
        <p>Elle contient :</p>
        <ul>${items}</ul>
        ${waitingMessage}
        ${receivedMessage}
        <p>En cas de refus, les ressources seront retournees a l'envoyeur.</p>`;
      buttons.style.display = '';
      if (tx.state === 'En Attente' && Number(tx.destination_id) === Number(currentSeigneurieId) && canAcceptNow) {
        refuseBtn.style.display = '';
        acceptBtn.style.display = '';
        refuseBtn.onclick = async () => { dialog.close(); await decideTx(id, 'refuse'); };
        acceptBtn.onclick = async () => { dialog.close(); await decideTx(id, 'accept'); };
      } else {
        closeBtn.style.display = '';
        closeBtn.onclick = () => dialog.close();
      }
    }
    dialog.showModal();
    renderTransactionDates(dialog);
  } catch {}
}

async function setupAdminSelector(selectedId){
  const isAdmin = currentUser && currentUser.is_admin && currentUser.act_as_admin !== false;
  if(!isAdmin) return;
  const container = document.getElementById('adminSeigneurieSelect');
  if(!container) return;
  container.innerHTML = '';
  container.style.display = 'block';
  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Sélectionner une seigneurie';
  select.appendChild(placeholder);
  try{
    const [seigneursRes, seigneuriesRes] = await Promise.all([
      fetch('/api/seigneurs'),
      fetch('/api/seigneuries')
    ]);
    const seigneurs = seigneursRes.ok ? await seigneursRes.json() : [];
    const seigneuries = seigneuriesRes.ok ? await seigneuriesRes.json() : [];
    seigneuries.forEach(s => {
      const seigneur = seigneurs.find(p => p.id === s.seigneur_id);
      if(!seigneur) return;
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${seigneur.name} - ${s.baronnie_id}`;
      select.appendChild(opt);
    });
    if(selectedId) select.value = selectedId;
  } catch{}
  select.addEventListener('change', () => {
    const id = select.value || null;
    const params = new URLSearchParams(location.search);
    if(id) params.set('seigneurie_id', id); else params.delete('seigneurie_id');
    history.replaceState(null, '', `gestion.html${params.toString()?`?${params.toString()}`:''}`);
    loadAndRender(id);
  });
  container.appendChild(select);
}

function getGestionTooltipPosition(anchor, size, viewport) {
  const margin = 12;
  const gap = 6;
  const topBoundary = Math.max(0, viewport.top || 0);
  const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2));
  const below = Math.max(0, viewport.height - anchor.bottom - margin - gap);
  const above = Math.max(0, anchor.top - topBoundary - margin - gap);
  const placeBelow = size.height <= below || below >= above;
  const height = Math.min(size.height, placeBelow ? below : above);
  return {
    left: Math.max(margin, Math.min(anchor.left + anchor.width / 2 - width / 2, viewport.width - margin - width)),
    top: placeBelow ? anchor.bottom + gap : anchor.top - gap - height,
    width,
    height
  };
}

function initGestionTooltips() {
  const popup = document.createElement('div');
  popup.id = 'gestionTooltip';
  popup.className = 'gestion-tooltip';
  popup.setAttribute('role', 'tooltip');
  popup.tabIndex = -1;
  popup.hidden = true;
  const usesPopover = typeof popup.showPopover === 'function';
  if (usesPopover) popup.setAttribute('popover', 'manual');
  document.body.appendChild(popup);
  let active = null;
  let hideTimer;

  function hide() {
    clearTimeout(hideTimer);
    if (active) active.removeAttribute('aria-describedby');
    active = null;
    if (usesPopover && popup.matches(':popover-open')) popup.hidePopover();
    popup.hidden = true;
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 150);
  }
  function positionPopup() {
    if (!active) return;
    const anchor = active.getBoundingClientRect();
    const topBoundary = Math.max(0,
      document.querySelector('.app-header')?.getBoundingClientRect().bottom || 0,
      document.querySelector('.tab-buttons')?.getBoundingClientRect().bottom || 0);
    if (!active.isConnected || anchor.bottom <= topBoundary || anchor.top >= window.innerHeight) { hide(); return; }
    popup.style.maxHeight = '360px';
    const position = getGestionTooltipPosition(anchor, popup.getBoundingClientRect(), {
      width: window.innerWidth, height: window.innerHeight, top: topBoundary
    });
    popup.style.left = `${position.left}px`;
    popup.style.top = `${position.top}px`;
    popup.style.width = `${position.width}px`;
    popup.style.maxHeight = `${position.height}px`;
  }
  function show(trigger) {
    clearTimeout(hideTimer);
    if (active === trigger && !popup.hidden) return;
    const source = trigger.querySelector('.tooltip-table');
    if (!source) return;
    hide();
    active = trigger;
    const table = source.cloneNode(true);
    table.className = 'gestion-tooltip-table';
    popup.replaceChildren(table);
    trigger.setAttribute('aria-describedby', popup.id);
    popup.style.maxHeight = '360px';
    popup.style.width = '';
    popup.hidden = false;
    if (usesPopover) popup.showPopover();
    positionPopup();
    popup.scrollTop = 0;
  }
  document.addEventListener('pointerover', event => {
    if (popup.contains(event.target)) { clearTimeout(hideTimer); return; }
    const trigger = event.target.closest('.tooltip');
    if (trigger) show(trigger);
  });
  document.addEventListener('pointerout', event => {
    if (active && (active.contains(event.target) || popup.contains(event.target))) {
      if (event.relatedTarget && (active.contains(event.relatedTarget) || popup.contains(event.relatedTarget))) return;
      scheduleHide();
    }
  });
  document.addEventListener('focusin', event => {
    if (popup.contains(event.target)) { clearTimeout(hideTimer); return; }
    const trigger = event.target.closest('.tooltip');
    if (trigger) show(trigger); else hide();
  });
  document.addEventListener('focusout', event => {
    if (active && (active.contains(event.target) || popup.contains(event.target))) scheduleHide();
  });
  document.addEventListener('click', event => {
    const trigger = event.target.closest('.tooltip');
    if (trigger) show(trigger); else if (!popup.contains(event.target)) hide();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) {
      const trigger = active;
      const restoreFocus = popup.contains(document.activeElement);
      if (restoreFocus) trigger.focus();
      hide();
    } else if (event.target.closest('.tooltip') && ['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      show(event.target.closest('.tooltip'));
      popup.focus();
    }
  });
  // Follow scrolling anchors, but never keep a popup from a previous render or tab.
  document.addEventListener('scroll', event => {
    if (event.target !== popup && !popup.contains(event.target)) positionPopup();
  }, true);
  document.addEventListener('gestion:refresh', hide);
  window.addEventListener('resize', hide);
}

function buildTooltipValue(val, details, suffix = '') {
  if (!details || !details.length) return val;
  const rows = details
    .map(d => `<tr><td>${formatDetailLabel(d.label)}</td><td>${spanAmount(d.amount, suffix)}</td></tr>`).join('');
  return `<div class="tooltip">${val}<table class="tooltip-table">${rows}</table></div>`;
}
