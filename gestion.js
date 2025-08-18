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

    gameState = { s, employment, buildings, infrastructures, bpMap, ipMap, buildingBonuses, buildingBonusDetails };

    const summary = document.getElementById('summary');
    summary.innerHTML = `
      <p><strong>Baronnie :</strong> ${barony.name || 'Aucune'}</p>
      <div id="populationSummary"></div>
      <p><strong>Religion :</strong> ${barony.religion_name || 'Inconnue'}</p>
      <p><strong>Culture :</strong> ${barony.culture_name || 'Inconnue'}</p>
      <p><strong>IDH :</strong> ${idhHtml}</p>
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
        <tr><th>Type</th><th>Nombre</th></tr>
        <tr><td>Population totale</td><td>${s.population}</td></tr>
        <tr><td>Population employée</td><td>${employedHtml}</td></tr>
        <tr><td>Esclaves</td><td>${employment.slaves}</td></tr>
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

    const prodDiv = document.getElementById('productionInfra');
    const civilDiv = document.getElementById('civilInfra');
    const miliDiv = document.getElementById('militaryInfra');
    const freePop = s.population + employment.slaves - employment.employed;
    if (prodDiv) {
      let html = '<table class="admin-table" id="buildingsTable">';
      html += '<tr><th>Nom</th><th>Production</th><th>Employés</th><th>Requis</th><th>Construits</th><th>Max</th><th>Activer</th><th>Prod. Tot.</th><th>Emp. Tot.</th><th>Coût</th><th>Construire</th></tr>';
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
          html += '<td></td></tr>';
        } else {
          html += `<td><button class="build-btn" data-id="${bp.id}"${canBuild ? '' : ' disabled'}>Construire</button></td></tr>`;
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
    }
    if (miliDiv) {
      miliDiv.innerHTML = buildInfraTable(infraProps.filter(i=>i.type==='militaire'), infrastructures, inv, 'militaryInfraTable');
      const table = document.getElementById('militaryInfraTable');
      table.addEventListener('click', handleInfraTableClick);
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
      const inst = effects.filter(e => e.type === 'instant_production');
      const tables = [];
      if (built > 0) {
        inst.forEach((eff, idx) => {
          const remainKey = `effect_${idx}_remaining`;
          const remaining = entryObj[remainKey] || 0;
          const label = resourceLabels[eff.resource] || eff.resource;
          const baseCosts = eff.costs || {};
          const costStr = Object.entries(baseCosts).map(([r,a])=>{
            const lbl = resourceLabels[r] || r; return `${lbl}: ${a*remaining}`; }).join(', ');
          tables.push(`<table class="admin-table instant-prod-table"><tr><th>Production</th><th>Restant</th><th>Nb</th><th>Coût total</th><th>Convertir</th></tr><tr><td class="prod-cell" data-base="${eff.amount}" data-res="${eff.resource}">${eff.amount} ${label}</td><td class="rem-cell">${remaining}</td><td><input type="number" class="inst-nb" min="1" max="${remaining}" value="${remaining}" oninput="updateInstantCost(this)"></td><td class="cost-cell" data-costs='${JSON.stringify(baseCosts)}'>${costStr}</td><td><button class="instant-btn" data-id="${ip.id}" data-idx="${idx}">Convertir</button></td></tr></table>`);
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

