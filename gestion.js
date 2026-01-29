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

let gameState = {};
let tagLabels = {};
let tagCounts = {};
let currentUser = null;
let currentSeigneurieId = null;
const params = new URLSearchParams(location.search);
let transactionToOpen = params.get('transactionId');

function showConfirm(message){
  return new Promise(resolve => {
    const dialog = document.getElementById('confirmDialog');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    msgEl.innerHTML = message;
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
  try {
    const res = await fetch('/api/me');
    currentUser = res.ok ? await res.json() : null;
  } catch {
    currentUser = null;
  }
  const params = new URLSearchParams(location.search);
  const sid = params.get('seigneurie_id');
  await loadAndRender(sid);
  await setupAdminSelector(sid);
  const newRouteBtn = document.getElementById('newTradeRouteBtn');
  if (newRouteBtn) newRouteBtn.addEventListener('click', startTradeRouteCreation);

  document.addEventListener('click', async e => {
    if (!newRouteMode) return;
    const map = document.getElementById('tradeMap');
    if (map && map.contains(e.target)) return;
    if (newRouteBtn && newRouteBtn.contains(e.target)) return;
    newRouteMode = false;
    eligibleTargets = {};
    await updateTradeMap(currentTradeBaronyId, currentTradeRoutes);
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

async function loadAndRender(seigneurieId) {
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
    gameState = { s, employment, buildings, infrastructures, bpMap, ipMap, buildingBonuses, buildingBonusDetails, productionDetails, spellSuccess, basicSpellDiscount, advancedSpellDiscount, spellRange, spellMax, spellsCast, landTxMax, navalTxMax, landTransactions, navalTransactions, spellSuccessDetails, basicSpellDiscountDetails, advancedSpellDiscountDetails, spellRangeDetails, spellMaxDetails, inv, capacities, isAdmin, baronyProps };

    await renderTradeRoutes(barony.id);

    const summary = document.getElementById('summary');
    summary.innerHTML = `
      <div id="infoTables" class="resource-tables">
        <div class="resource-table-container">
          <table id="generalInfoTable" class="admin-table"></table>
        </div>
        <div class="resource-table-container">
          <table id="deJureTable" class="admin-table"></table>
        </div>
      </div>
      <div id="popAndTx" class="resource-tables">
        <div id="populationSummary" class="resource-table-container"></div>
        <div class="resource-table-container">
          <h2>Transactions en Attente</h2>
          <table id="pendingTxTable" class="admin-table"></table>
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
    const taxOptions = Array.from({ length: 13 }, (_, i) =>
      `<option value="${i}" ${i === (s.tax_rate ?? 5) ? 'selected' : ''}>${i}</option>`
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
          const spellsRes = await fetch('/api/spells');
          const spells = spellsRes.ok ? await spellsRes.json() : [];
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
    const freePop = s.population + employment.slaves - employment.employed;
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
            maxActivate = Math.min(built, Math.floor(available / workersPer));
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
        const msg = await resp.text().catch(() => '');
        console.warn('[build] Construction refusée', resp.status, msg);
        alert('Construction impossible');
      }
    } catch (err) {
      console.error('[build] Erreur réseau ou serveur', err);
      alert('Erreur réseau lors de la construction');
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
        const msg = await resp.text().catch(() => '');
        alert('Destruction impossible');
      }
    } catch (err) {
      alert('Erreur réseau lors de la destruction');
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
    const available = gameState.s.population + gameState.employment.slaves - gameState.employment.employed + (info.active || 0) * workersPer;
    if (workersPer && quantity * workersPer > available) {
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
        const msg = await resp.text().catch(() => '');
        console.warn('[build] Activation refusée', resp.status, msg);
        alert('Activation impossible');
      }
    } catch (err) {
      console.error('[build] Erreur réseau lors de l\'activation', err);
      alert('Activation impossible');
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
        const msg = await resp.text().catch(() => '');
        console.warn('[infra] Construction refusée', resp.status, msg);
        alert('Construction impossible');
      }
    } catch (err) {
      console.error('[infra] Erreur réseau lors de la construction', err);
      alert('Construction impossible');
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
        const msg = await resp.text().catch(() => '');
        console.warn('[infra] Conversion refusée', resp.status, msg);
        alert('Conversion impossible');
      }
    } catch (err) {
      console.error('[infra] Erreur réseau lors de la conversion', err);
      alert('Conversion impossible');
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
        const msg = await resp.text().catch(()=> '');
        console.warn('[infra] Destruction refusée', resp.status, msg);
        alert('Destruction impossible');
      }
    } catch (err) {
      console.error('[infra] Erreur réseau lors de la destruction', err);
      alert('Destruction impossible');
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
    const freePop = gameState.s.population + gameState.employment.slaves - gameState.employment.employed + current;
    if(qty > maxWorkers){
      alert('Nombre trop élevé');
      e.target.value = current;
      updateVarWorkers(e.target);
      return;
    }
    if(qty > freePop){
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
        const msg = await resp.text().catch(()=> '');
        console.warn('[infra] Assignation refusée', resp.status, msg);
        alert('Affectation impossible');
      }
    } catch(err){
      console.error('[infra] Erreur réseau affectation', err);
      alert('Affectation impossible');
    }
  } else if (e.target.classList.contains('infra-built-input')) {
    const id = e.target.dataset.id;
    const qty = parseInt(e.target.value,10) || 0;
    adminUpdate({ infrastructures: { [id]: qty } });
  }
}

function buildInfraTable(list, infraBuilt = {}, inv = {}, tableId, editable = false) {
  const { buildings = {}, infrastructures = {}, s = {}, bpMap = {}, ipMap = {}, productionDetails = {}, baronyProps = {} } = gameState || {};
  let html = `<table class="admin-table" id="${tableId}"><tr><th>Nom</th><th>Construits</th><th>Max</th><th>Effets</th><th>Requis</th><th>Coût</th><th>Construire</th><th>Détruire</th><th class="multi-col"></th></tr>`;
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
    html += `<td class="multi-col">${extraHtml}</td></tr>`;
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
    const payload = { id, amount };
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
  container.innerHTML = `<table class="admin-table"><tr><th>Nom</th><th>Coût</th><th>Effets</th><th>Quantité</th><th></th></tr>${rows}</table>`;
  container.querySelectorAll('button.cast-spell').forEach(btn => {
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
let currentTradeRoutes = [];
let seaZoneAdjacency = {};
let zoneBaronies = {};
let baronyZones = {};
let seaReachCache = {};

async function ensureTradeData() {
  if (tradeBaronies) return;
  try {
    const [barRes, seiRes] = await Promise.all([
      fetch('/api/baronies'),
      fetch('/api/seigneurs')
    ]);
    const barData = barRes.ok ? await barRes.json() : [];
    const seigs = seiRes.ok ? await seiRes.json() : [];
    seigneurNameMap = Object.fromEntries(seigs.map(s => [s.id, s.name]));
    tradeBaronies = barData.map(b => ({
      id: b.id,
      name: b.name,
      seigneur_id: b.seigneur_id,
      seigneur_name: seigneurNameMap[b.seigneur_id]
    }));
  } catch {
    tradeBaronies = [];
  }
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
    fetchData: async () => {
      const [pixels, connections, zoneConns, zoneBars] = await Promise.all([
        fetch('/api/barony_pixels').then(r => r.json()),
        fetch('/api/barony_connections').then(r => r.json()),
        fetch('/api/maritime_zone_connections').then(r => r.json()),
        fetch('/api/maritime_zone_baronies').then(r => r.json())
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
      seaReachCache = {};
      return { mapWidth: base.naturalWidth, mapHeight: base.naturalHeight, pixelData: pixels };
    }
  });
  await tradeMapCore.ready;
  const commerceTab = document.getElementById('tab-commerce');
  if (commerceTab && commerceTab.classList.contains('active')) {
    tradeMapCore.resetView();
    tradeMapCore.drawAll();
  }
}

async function updateTradeMap(baronyId, routes) {
  await initTradeMap();
  if (!tradeMapCore) return;
  const normalizedRoutes = Array.isArray(routes) ? routes : [];
  const bg = [...mapCore.terrainColor, 100];
  const landColor = [128, 0, 128, 100];
  const seaColor = [0, 128, 255, 100];
  const currentColor = [255, 237, 0, 180];
  const colorMap = {};
  const patternMap = {};
  Object.keys(tradeMapCore.pixelData).forEach(id => {
    colorMap[id] = [...bg];
  });
  if (baronyId) {
    const landSet = new Set((tradeAdjacency[baronyId] || []).map(n => n.id));
    normalizedRoutes.forEach(r => landSet.add(r.id));
    const seaSet = computeSeaReachable(baronyId);
    landSet.forEach(id => {
      colorMap[String(id)] = [...landColor];
    });
    seaSet.forEach(id => {
      if (landSet.has(id)) {
        delete colorMap[String(id)];
        patternMap[String(id)] = [landColor, seaColor];
      } else {
        colorMap[String(id)] = [...seaColor];
      }
    });
  }
  normalizedRoutes.forEach(r => {
    if (!colorMap[String(r.id)]) colorMap[String(r.id)] = [...landColor];
  });
  if (baronyId) {
    colorMap[String(baronyId)] = [...currentColor];
  }
  tradeMapCore.setColorMap(colorMap);
  tradeMapCore.setCanonicalPatterns(patternMap);
}

function computeDistances(start) {
  const { distanceMap } = breadthFirst(start, cur => tradeAdjacency[cur] || []);
  return distanceMap;
}

function computeSeaReachable(start) {
  if (!gameState.navalTxMax || gameState.navalTxMax <= 0) return new Set();
  if (seaReachCache[start]) return seaReachCache[start];
  const startZones = baronyZones[start] || [];
  const { distanceMap } = breadthFirst(startZones, z => seaZoneAdjacency[z] || []);
  const res = new Set();
  Object.keys(distanceMap).forEach(z => {
    (zoneBaronies[z] || []).forEach(bid => {
      if (bid !== start) res.add(bid);
    });
  });
  seaReachCache[start] = res;
  return res;
}

function getAvailableMethods(targetId) {
  const methods = [];
  const landPossible = (tradeAdjacency[currentTradeBaronyId] || []).some(n => n.id === targetId) ||
    currentTradeRoutes.some(r => r.id === targetId);
  const seaPossible = computeSeaReachable(currentTradeBaronyId).has(targetId);
  if (landPossible && (!gameState.landTxMax || gameState.landTransactions < gameState.landTxMax)) methods.push('land');
  if (seaPossible && (!gameState.navalTxMax || gameState.navalTransactions < gameState.navalTxMax)) methods.push('naval');
  return methods;
}

async function startTradeRouteCreation() {
  if (newRouteMode) {
    newRouteMode = false;
    eligibleTargets = {};
    await updateTradeMap(currentTradeBaronyId, currentTradeRoutes);
    return;
  }
  if (!currentTradeBaronyId) return;
  await ensureTradeData();
  const dists = computeDistances(currentTradeBaronyId);
  eligibleTargets = {};
  tradeBaronies.forEach(b => {
    if (!b.seigneur_id) return;
    if (b.id === currentTradeBaronyId) return;
    if (dists[b.id] == null) return;
    eligibleTargets[b.id] = { ...b, distance: dists[b.id] };
  });
  if (!Object.keys(eligibleTargets).length) {
    alert('Aucune baronnie disponible');
    return;
  }
  newRouteMode = true;
  const cm = { ...tradeMapCore.colorMap };
  Object.keys(eligibleTargets).forEach(id => {
    cm[id] = [0, 170, 255, 100];
  });
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
    const name = bar ? bar.seigneur_name : '';
    const result = await showTradeDialog(name, methods);
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
  const cost = target.distance * 3;
  const msg = `Vous allez construire une route commerciale vers la baronnie de <strong>${target.name} (#${target.id})</strong> gérée par ${target.seigneur_name}<br><br>Cela vous coutera <strong>${cost} Or</strong>`;
  const ok = await showConfirm(msg);
  if (!ok) {
    newRouteMode = false;
    eligibleTargets = {};
    await updateTradeMap(currentTradeBaronyId, currentTradeRoutes);
    return;
  }
  try {
    const res = await fetch('/api/trade_routes/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barony_id: target.id })
    });
    if (res.ok) {
      await renderTradeRoutes(currentTradeBaronyId);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Construction impossible');
    }
  } catch {
    alert('Construction impossible');
  }
  newRouteMode = false;
  eligibleTargets = {};
  await updateTradeMap(currentTradeBaronyId, currentTradeRoutes);
}

function renderTradeLimits() {
  const table = document.getElementById('tradeLimitsTable');
  if (!table || !gameState) return;
  const {
    landTransactions = 0,
    landTxMax = 0,
    navalTransactions = 0,
    navalTxMax = 0
  } = gameState;
  table.innerHTML =
    '<tr><th>Type</th><th>Présent</th><th>Max/mois</th></tr>' +
    `<tr><td>Terrestres</td><td>${landTransactions}</td><td>${landTxMax}</td></tr>` +
    `<tr><td>Maritimes</td><td>${navalTransactions}</td><td>${navalTxMax}</td></tr>`;
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
    const info = document.getElementById('tradeInfo');
    if (info) {
      const { landTransactions = 0, landTxMax = 0, navalTransactions = 0, navalTxMax = 0 } = gameState;
      info.innerHTML = `Transactions terrestres: ${landTransactions} / ${landTxMax}<br>Transactions maritimes: ${navalTransactions} / ${navalTxMax}`;
      const legend = document.getElementById('tradeLegend');
      if (legend) legend.style.display = navalTxMax > 0 ? 'flex' : 'none';
    }
    const res = await fetch(`/api/trade_partners?barony_id=${baronyId}`);
    const routes = res.ok ? await res.json() : [];
    const normalizedRoutes = Array.isArray(routes) ? routes : [];
    currentTradeRoutes = normalizedRoutes;
    await updateTradeMap(baronyId, normalizedRoutes);
    if (!normalizedRoutes.length) {
      container.textContent = 'Aucune route commerciale';
      return;
    }
    const { landTransactions = 0, landTxMax = 0 } = gameState;
    const limitReached = landTxMax !== 0 && landTransactions >= landTxMax;
    const rows = normalizedRoutes
      .map(r =>
        `<tr><td>${r.id}</td><td>${r.name || ''}</td><td>${r.seigneur_name || ''}</td><td>${r.duchy_name || ''}</td><td><button class="trade-btn control-btn" data-id="${r.id}"${limitReached ? ' disabled' : ''}>Commercer</button></td></tr>`
      )
      .join('');
    container.innerHTML = `<table class="admin-table"><tr><th>#</th><th>Nom</th><th>Propriétaire</th><th>Province (Duché)</th><th></th></tr>${rows}</table>`;
    container.querySelectorAll('.trade-btn').forEach(btn => {
      if (!btn.disabled) {
        btn.addEventListener('click', () => openTradeDialog(btn.dataset.id));
      }
    });
  } catch {
    container.textContent = 'Erreur de chargement';
    await updateTradeMap(baronyId, []);
  }
}

async function openTradeDialog(baronyId) {
  await ensureTradeData();
  const idNum = parseInt(baronyId, 10);
  const methods = getAvailableMethods(idNum);
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
          if (val > (gameState.inv[key] || 0)) valid = false;
          else res[key] = val;
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

async function renderPendingTransactions() {
  const table = document.getElementById('pendingTxTable');
  if (!table) return;
  try {
    const url = currentSeigneurieId
      ? `/api/trade_transactions?seigneurie_id=${currentSeigneurieId}`
      : '/api/trade_transactions';
    const res = await fetch(url);
    const txs = res.ok ? await res.json() : [];
    table.innerHTML = '<tr><th>Ressources</th><th>Origine</th><th>Date</th><th>Raison</th><th></th></tr>';
    txs.forEach(tx => {
      const resSummary = Object.entries(tx.resources || {}).map(([k,v]) => `${v} ${resourceLabels[k] || k}`).join(', ');
      const origin = `${tx.origin_name} (${tx.origin_barony_name})`;
      const date = `<span class="timeago" datetime="${tx.created_at}"></span>`;
      let status;
      if (tx.state === 'En Attente') {
        status = `<button class="tx-open" data-id="${tx.id}">...</button>`;
      } else {
        const label = tx.state === 'Approuvée' ? 'Approuvée' : 'Refusée';
        status = `<span title="${tx.decision_time ? new Date(tx.decision_time).toLocaleString() : ''}">${label}</span>`;
      }
      table.innerHTML += `<tr><td>${resSummary}</td><td>${origin}</td><td>${date}</td><td>${tx.reason || ''}</td><td>${status}</td></tr>`;
    });
    let rows = txs.length;
    while (rows < 3) {
      table.innerHTML += '<tr>' + '<td>&nbsp;</td>'.repeat(5) + '</tr>';
      rows++;
    }
    timeago.render(table.querySelectorAll('.timeago'), 'fr');
    table.querySelectorAll('.tx-open').forEach(btn => {
      btn.addEventListener('click', () => openTransactionPopup(btn.dataset.id));
    });
  } catch {
    table.innerHTML = '<tr><td colspan="5">Erreur</td></tr>';
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
    const items = Object.entries(tx.resources || {}).map(([k,v]) => `<li>${v} ${resourceLabels[k] || k}</li>`).join('');
    const typeLabel = tx.type === 'naval' ? 'cargaison' : 'caravane';
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
      const retItems = Object.entries(claim.returned || {}).map(([k,v]) => `<li>${v} ${resourceLabels[k] || k}</li>`).join('');
      let lossHtml = '';
      if (claim.lost && Object.keys(claim.lost).length) {
        const lossItems = Object.entries(claim.lost).map(([k,v]) => `<li>${v} ${resourceLabels[k] || k}</li>`).join('');
        lossHtml = `<p>Pertes :</p><ul>${lossItems}</ul>`;
      }
      content.innerHTML = `
        <p>Votre ${typeLabel} à destination de ${tx.dest_name} a été refusée.</p>
        <p>Les ressources suivantes vous ont été retournées :</p>
        <ul>${retItems}</ul>
        ${lossHtml}`;
      buttons.style.display = '';
      closeBtn.style.display = '';
      closeBtn.onclick = () => dialog.close();
    } else {
      content.innerHTML = `
        <p>Vous avez reçu une ${typeLabel} de ${tx.origin_name} de la Baronnie de ${tx.origin_barony_name} avec la raison suivante :</p>
        <p>${tx.reason || ''}</p>
        <p>Elle contient :</p>
        <ul>${items}</ul>
        <p>En cas de refus, les ressources seront retournées à l'envoyeur (perdu si maximum d'une ressource dépassée).</p>`;
      if (tx.state === 'En Attente' && Number(tx.destination_id) === Number(currentSeigneurieId)) {
        buttons.style.display = '';
        refuseBtn.style.display = '';
        acceptBtn.style.display = '';
        closeBtn.style.display = 'none';
        refuseBtn.onclick = async () => { dialog.close(); await decideTx(id, 'refuse'); };
        acceptBtn.onclick = async () => { dialog.close(); await decideTx(id, 'accept'); };
      } else {
        buttons.style.display = '';
        closeBtn.style.display = '';
        refuseBtn.style.display = 'none';
        acceptBtn.style.display = 'none';
        closeBtn.onclick = () => dialog.close();
      }
    }
    dialog.showModal();
    timeago.render(dialog.querySelectorAll('.timeago'), 'fr');
  } catch {}
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

function buildTooltipValue(val, details, suffix = '') {
  if (!details || !details.length) return val;
  const rows = details
    .map(d => `<tr><td>${formatDetailLabel(d.label)}</td><td>${spanAmount(d.amount, suffix)}</td></tr>`).join('');
  return `<div class="tooltip">${val}<table class="tooltip-table">${rows}</table></div>`;
}
