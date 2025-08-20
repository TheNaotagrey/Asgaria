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

const resourceLabels = Object.fromEntries([...basicResources, ...luxuryResources]);

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

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadAndRender();
}

async function loadAndRender() {
  try {
    const [res, bRes, iRes, tRes] = await Promise.all([
      fetch('/api/my_seigneurie'),
      fetch('/api/building_properties'),
      fetch('/api/infrastructure_properties'),
      fetch('/api/tags')
    ]);
    if (!res.ok) throw new Error('Erreur');
    const data = await res.json();
    const allBuildingProps = bRes.ok ? await bRes.json() : [];
    const allInfraProps = iRes.ok ? await iRes.json() : [];
    const tags = tRes.ok ? await tRes.json() : [];
    tagLabels = Object.fromEntries(tags.map(t=> [String(t.id), t.label]));
    const s = data.seigneurie;
    const inv = data.inventaire || {};
    const barony = data.barony || {};
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

    tagCounts = {};
    Object.entries(buildings).forEach(([bid, info]) => {
      const bp = bpMap[String(bid)];
      if (!bp) return;
      const tags = safeParse(bp.tags, []);
      tags.forEach(tid => {
        tagCounts[tid] = (tagCounts[tid] || 0) + (info.built || 0);
      });
    });
    Object.entries(infrastructures).forEach(([iid, entry]) => {
      const ip = ipMap[String(iid)];
      if (!ip) return;
      const tags = safeParse(ip.tags, []);
      const builtCount = typeof entry === 'object' ? (entry.built || 0) : entry;
      tags.forEach(tid => {
        tagCounts[tid] = (tagCounts[tid] || 0) + builtCount;
      });
    });

    const spellSuccess = data.spellSuccess || 75;
    const basicSpellDiscount = data.basicSpellDiscount || 0;
    const advancedSpellDiscount = data.advancedSpellDiscount || 0;
    const spellRange = data.spellRange || 5;
    const spellMax = data.spellMax || 0;
    const spellsCast = data.spellsCast || 0;
    const spellSuccessDetails = data.spellSuccessDetails || [];
    const basicSpellDiscountDetails = data.basicSpellDiscountDetails || [];
    const advancedSpellDiscountDetails = data.advancedSpellDiscountDetails || [];
    const spellRangeDetails = data.spellRangeDetails || [];
    const spellMaxDetails = data.spellMaxDetails || [];
    gameState = { s, employment, buildings, infrastructures, bpMap, ipMap, buildingBonuses, buildingBonusDetails, spellSuccess, basicSpellDiscount, advancedSpellDiscount, spellRange, spellMax, spellsCast, spellSuccessDetails, basicSpellDiscountDetails, advancedSpellDiscountDetails, spellRangeDetails, spellMaxDetails };

    const summary = document.getElementById('summary');
    summary.innerHTML = `
      <p><strong>Baronnie :</strong> ${barony.name || 'Aucune'}</p>
      <div id="populationSummary"></div>
      <div id="resourceTables" class="resource-tables">
        <div class="resource-table-container">
          <h2>Ressources de base</h2>
          <table id="basicResourcesTable" class="admin-table"></table>
        </div>
        <div class="resource-table-container">
          <h2>Ressources de Luxe</h2>
          <table id="luxuryResourcesTable" class="admin-table"></table>
        </div>
      </div>
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

    popSummary.innerHTML = `
      <h2>Population</h2>
      <table class="admin-table">
        <tr><th>Info</th><th>Nombre</th></tr>
        <tr><td>Population totale</td><td>${s.population}</td></tr>
        <tr><td>Population employée</td><td>${employedHtml}</td></tr>
        <tr><td>Esclaves</td><td>${employment.slaves}</td></tr>
        <tr><td>IDH</td><td>${idhHtml}</td></tr>
        <tr><td>Religion</td><td>${barony.religion_name || 'Inconnue'}</td></tr>
        <tr><td>Culture</td><td>${barony.culture_name || 'Inconnue'}</td></tr>
        <tr><td>Taxes (écus)</td><td><select id="taxRate">${taxOptions}</select></td></tr>
      </table>
    `;

    const taxSelect = document.getElementById('taxRate');
    if (taxSelect) {
      taxSelect.addEventListener('change', async () => {
        const rate = parseInt(taxSelect.value, 10);
        try {
          const res = await fetch('/api/tax_rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tax_rate: rate })
          });
          if (!res.ok) throw new Error('Erreur');
          await loadAndRender();
        } catch (err) {
          alert('Erreur lors de la mise à jour des taxes');
        }
      });
    }

    const basicTable = document.getElementById('basicResourcesTable');
    const luxuryTable = document.getElementById('luxuryResourcesTable');

    basicTable.innerHTML = buildTable(basicResources, true, inv, production, productionDetails, capacities);
    luxuryTable.innerHTML = buildTable(luxuryResources, false, inv, production, productionDetails, capacities);

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

        let maxVal = '';
        if (bp.max !== undefined && bp.max !== null && bp.max !== '') {
          const parsed = parseInt(bp.max, 10);
          if (!isNaN(parsed) && parsed > 0) {
            maxVal = parsed;
          } else if (baronyProps[bp.max] !== undefined) {
            const dyn = parseInt(baronyProps[bp.max], 10);
            if (!isNaN(dyn) && dyn > 0) maxVal = dyn;
          }
        }

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
        if (maxVal !== '') {
          const maxNum = parseInt(maxVal, 10);
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

        html += `<tr data-id="${bp.id}"><td>${bp.label || bp.type}</td><td>${prod}</td><td>${workersPer}</td><td>${restrHtml}</td><td>${built}</td><td>${maxVal}</td>`;
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
      civilDiv.innerHTML = buildInfraTable(infraProps.filter(i=>i.type==='civil'), infrastructures, inv, 'civilInfraTable');
      const table = document.getElementById('civilInfraTable');
      table.addEventListener('click', handleInfraTableClick);
      table.addEventListener('change', handleInfraTableChange);
    }
    if (miliDiv) {
      miliDiv.innerHTML = buildInfraTable(infraProps.filter(i=>i.type==='militaire'), infrastructures, inv, 'militaryInfraTable');
      const table = document.getElementById('militaryInfraTable');
      table.addEventListener('click', handleInfraTableClick);
      table.addEventListener('change', handleInfraTableChange);
    }

    const propsDiv = document.getElementById('baronyProps');
    if (propsDiv) {
      propsDiv.innerHTML = buildPropsTable(baronyProps);
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
      const resp = await fetch('/api/building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('[build] Réponse du serveur', resp.status);
      if (resp.ok) {
        console.log('[build] Construction réussie');
        await loadAndRender();
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
    const ok = confirm("Détruire ce bâtiment ? Les ressources dépensées ne seront pas récupérées. Êtes-vous sûr ?");
    if (!ok) return;
    try {
      const resp = await fetch('/api/building/destroy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (resp.ok) {
        await loadAndRender();
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
      const resp = await fetch('/api/building/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quantity })
      });
      console.log('[build] Activation réponse', resp.status);
      if (resp.ok) {
        await loadAndRender();
      } else {
        const msg = await resp.text().catch(() => '');
        console.warn('[build] Activation refusée', resp.status, msg);
        alert('Activation impossible');
      }
    } catch (err) {
      console.error('[build] Erreur réseau lors de l\'activation', err);
      alert('Activation impossible');
    }
  }
}

async function handleInfraTableClick(e) {
  if (e.target.classList.contains('infra-build-btn')) {
    const id = e.target.dataset.id;
    console.log('[infra] Bouton de construction infrastructure cliqué pour', id);
    try {
      const resp = await fetch('/api/infrastructure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quantity: 1 })
      });
      console.log('[infra] Réponse du serveur', resp.status);
      if (resp.ok) {
        await loadAndRender();
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
      const resp = await fetch('/api/infrastructure/instant_production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, index: idx, quantity: nb })
      });
      console.log('[infra] Conversion instantanée réponse', resp.status);
      if(resp.ok){
        await loadAndRender();
      }else{
        const msg = await resp.text().catch(() => '');
        console.warn('[infra] Conversion refusée', resp.status, msg);
        alert('Conversion impossible');
      }
    } catch (err) {
      console.error('[infra] Erreur réseau lors de la conversion', err);
      alert('Conversion impossible');
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
      const resp = await fetch('/api/infrastructure/assign_workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, index: idx, quantity: qty })
      });
      if(resp.ok){
        await loadAndRender();
      }else{
        const msg = await resp.text().catch(()=> '');
        console.warn('[infra] Assignation refusée', resp.status, msg);
        alert('Affectation impossible');
      }
    } catch(err){
      console.error('[infra] Erreur réseau affectation', err);
      alert('Affectation impossible');
    }
  }
}

function buildInfraTable(list, infraBuilt = {}, inv = {}, tableId) {
  const { buildings = {}, infrastructures = {}, s = {}, bpMap = {}, ipMap = {} } = gameState || {};
  let html = `<table class="admin-table" id="${tableId}"><tr><th>Nom</th><th>Construits</th><th>Max</th><th>Effets</th><th>Requis</th><th>Coût</th><th>Construire</th><th class="multi-col"></th></tr>`;
  for (const ip of list) {
    const entry = infraBuilt[ip.id] || infraBuilt[String(ip.id)] || 0;
    const built = typeof entry === 'object' ? (entry.built || 0) : entry;
    const entryObj = typeof entry === 'object' ? entry : {};

    let maxVal = '';
    let maxReached = false;
    if (ip.max !== undefined && ip.max !== null && ip.max !== '') {
      const parsed = parseInt(ip.max, 10);
      if (!isNaN(parsed)) {
        if (parsed > 0) {
          maxVal = parsed;
          if (built >= parsed) maxReached = true;
        }
      } else {
        maxVal = ip.max;
      }
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
    html += `<tr data-id="${ip.id}"><td>${ip.label}</td><td>${built}</td><td>${maxVal}</td><td>${effectsHtml}</td><td>${restrHtml}</td><td>${costHtml}</td>`;
    if (maxReached) {
      html += '<td></td>';
    } else {
      html += `<td><button class="build-btn infra-build-btn" data-id="${ip.id}"${canBuild ? '' : ' disabled'}>Construire</button></td>`;
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
            const prodTotal = assigned * (eff.amount || 0);
            tables.push(`<table class="admin-table var-workers-table"><tr><th>Assignés</th><th>Max</th><th>Production</th></tr><tr><td><input type="number" class="var-workers-input" data-id="${ip.id}" data-idx="${idx}" min="0" max="${maxWorkers}" value="${assigned}" oninput="updateVarWorkers(this)"></td><td>${maxWorkers}</td><td class="vw-prod" data-per="${eff.amount}" data-res="${eff.resource}">${prodTotal} ${label}</td></tr></table>`);
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
  const per = parseInt(prodCell.dataset.per,10) || 0;
  const res = resourceLabels[prodCell.dataset.res] || prodCell.dataset.res;
  const nb = parseInt(el.value,10) || 0;
  prodCell.textContent = `${nb*per} ${res}`;
}

function buildTable(list, showMax = false, inv = {}, production = {}, productionDetails = {}, capacity = {}) {
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
    html += `<tr><td>${label}</td><td>${qty}</td><td>${prodHtml}</td>`;
    if (showMax) html += `<td>${capacity[key] !== undefined ? capacity[key] : ''}</td>`;
    html += '</tr>';
  }
  return html;
}

function spanAmount(val) {
  const sign = val > 0 ? '+' : '';
  const cls = val > 0 ? 'prod-positive' : 'prod-negative';
  return `<span class="${cls}">${sign}${val}</span>`;
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

function buildPropsTable(props) {
  let html = '<table class="admin-table"><tr><th>Propriété</th><th>Valeur</th></tr>';
  for (const [key, label] of Object.entries(baronyPropLabels)) {
    let val = props[key];
    if (baronyPropBoolFields.includes(key)) {
      val = val ? 'Oui' : 'Non';
    } else if (val === undefined || val === null) {
      val = '';
    }
    html += `<tr><td>${label}</td><td>${val}</td></tr>`;
  }
  html += '</table>';
  return html;
}

async function castSpell(id) {
  try {
    const qtyInput = document.querySelector(`input.spell-qty[data-id="${id}"]`);
    const amount = qtyInput ? parseInt(qtyInput.value, 10) || 0 : 0;
    const resp = await fetch('/api/cast_spell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, amount })
    });
    const spell = currentSpells.find(s => String(s.id) === String(id));
    if (resp.ok) {
      const data = await resp.json();
      showSpellResult(data.success, spell, amount);
      await loadAndRender();
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
    spellSuccessDetails = [], basicSpellDiscountDetails = [], advancedSpellDiscountDetails = [], spellRangeDetails = [], spellMaxDetails = [] } = gameState;
  container.innerHTML = `<table class="admin-table"><tr><th colspan="2">Informations générales</th></tr>
    <tr><td>Taux de réussite des sorts de base</td><td>${buildTooltipValue(spellSuccess + '%', spellSuccessDetails)}</td></tr>
    <tr><td>Rabais sur les sorts de base</td><td>${buildTooltipValue(basicSpellDiscount + '%', basicSpellDiscountDetails)}</td></tr>
    <tr><td>Rabais sur les sorts avancés</td><td>${buildTooltipValue(advancedSpellDiscount + '%', advancedSpellDiscountDetails)}</td></tr>
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
    let effStr = '';
    let qtyField = '';
    let varEff = null;
    try {
      const effs = JSON.parse(s.effects || '[]');
      effStr = effs.map(e => {
        if (e.type === 'production') {
          return `${e.amount} ${resourceLabels[e.resource] || e.resource}`;
        }
        if (e.type === 'unlock_page') {
          return `Débloque ${e.page}`;
        }
        if (e.type === 'idh') {
          return `IDH ${e.amount}`;
        }
        if (e.type === 'variable_production') {
          varEff = e;
          return `Jusqu'à ${e.max} ${resourceLabels[e.resource] || e.resource} (${e.ratio} / PM)`;
        }
        if (e.type === 'random_luxury') {
          return `${e.amount} ressource de luxe aléatoire`;
        }
        return e.type;
      }).join(', ');
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
  const pmCost = (baseCosts.points_magique || 0) + Math.ceil(amount / ratio);
  const newCosts = { ...baseCosts, points_magique: pmCost };
  span.textContent = formatCosts(newCosts);
}

function formatEffectSummary(e, amount) {
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
    return `${e.amount} ressource de luxe aléatoire`;
  }
  return e.type;
}

function showSpellResult(success, spell, amount, error) {
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
    const items = effs.map(e => `<li>${formatEffectSummary(e, amount)}</li>`).join('');
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

function buildTooltipValue(val, details) {
  if (!details || !details.length) return val;
  const rows = details
    .map(d => `<tr><td>${formatDetailLabel(d.label)}</td><td>${spanAmount(d.amount)}</td></tr>`).join('');
  return `<span class="tooltip">${val}<table class="tooltip-table">${rows}</table></span>`;
}

