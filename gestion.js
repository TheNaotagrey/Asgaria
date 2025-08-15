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

let gameState = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadAndRender();
}

async function loadAndRender() {
  try {
    const [res, bRes] = await Promise.all([
      fetch('/api/my_seigneurie'),
      fetch('/api/building_properties')
    ]);
    if (!res.ok) throw new Error('Erreur');
    const data = await res.json();
    const allBuildingProps = bRes.ok ? await bRes.json() : [];
    const s = data.seigneurie;
    const inv = data.inventaire || {};
    const barony = data.barony || {};
    const production = data.production || {};
    const productionDetails = data.productionDetails || {};
    const baronyProps = data.baronyProps || {};
    const employment = data.employment || { employed:0, slaves:0 };
    const employmentDetails = data.employmentDetails || [];
    const buildings = data.buildings || {};
    const buildingProps = allBuildingProps.filter(bp => {
      try {
        const arr = bp.absolute_restrictions ? JSON.parse(bp.absolute_restrictions) : [];
        return arr.every(p => baronyProps[p]);
      } catch {
        return true;
      }
    });
    const bpMap = Object.fromEntries(allBuildingProps.map(b => [String(b.id), b]));

    gameState = { s, employment, buildings, bpMap };

    const summary = document.getElementById('summary');
    summary.innerHTML = `
      <p><strong>Baronnie :</strong> ${barony.name || 'Aucune'}</p>
      <div id="populationSummary"></div>
      <p><strong>Religion :</strong> ${barony.religion_name || 'Inconnue'}</p>
      <p><strong>Culture :</strong> ${barony.culture_name || 'Inconnue'}</p>
      <p><strong>IDH :</strong> À calculer</p>
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
        .map(src => `<tr><td>${Math.abs(src.amount)} ${src.label}</td></tr>`)
        .join('');
      employedHtml = `<span class="tooltip">${employment.employed}<table class="tooltip-table">${rows}</table></span>`;
    }
    if (employment.employed > s.population) {
      employedHtml = `<span style="color:red">${employedHtml}</span>`;
    }
    popSummary.innerHTML = `
      <h2>Population</h2>
      <table class="admin-table">
        <tr><th>Type</th><th>Nombre</th></tr>
        <tr><td>Population totale</td><td>${s.population}</td></tr>
        <tr><td>Population employée</td><td>${employedHtml}</td></tr>
        <tr><td>Esclaves</td><td>${employment.slaves}</td></tr>
      </table>
    `;

    const basicTable = document.getElementById('basicResourcesTable');
    const luxuryTable = document.getElementById('luxuryResourcesTable');

    basicTable.innerHTML = buildTable(basicResources, true, inv, production, productionDetails);
    luxuryTable.innerHTML = buildTable(luxuryResources, false, inv, production, productionDetails);

    const infra = document.getElementById('infrastructure');
    const freePop = s.population + employment.slaves - employment.employed;
    if (infra) {
      let html = '<h2>Infrastructure</h2><table class="admin-table" id="buildingsTable">';
      html += '<tr><th>Nom</th><th>Production</th><th>Restrictions</th><th>Construits</th><th>Max</th><th>Activer</th><th>Coût</th><th>Construire</th></tr>';
      for (const bp of buildingProps) {
        const prodLabel = resourceLabels[bp.produces] || bp.produces || '';
        const prod = bp.production ? `${bp.production} ${prodLabel}` : '';
        const info = buildings[bp.id] || { built: 0, active: 0 };
        const built = info.built || 0;
        const active = info.active || 0;

        let maxVal = '';
        if (bp.max !== undefined && bp.max !== null) {
          const parsed = parseInt(bp.max, 10);
          if (!isNaN(parsed)) {
            maxVal = parsed;
          } else if (baronyProps[bp.max] !== undefined) {
            maxVal = baronyProps[bp.max];
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
              parts.push(`<span${color}>${name}: ${qty}</span>`);
            }
          }
          if (infraR.population) {
            const ok = (s.population || 0) >= infraR.population;
            if (!ok) restrictionsMet = false;
            const color = ok ? '' : ' style="color:red"';
            parts.push(`<span${color}>Population: ${infraR.population}</span>`);
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

        const canBuild = hasResources && restrictionsMet && !maxReached;

        html += `<tr data-id="${bp.id}"><td>${bp.label || bp.type}</td><td>${prod}</td><td>${restrHtml}</td><td>${built}</td><td>${maxVal}</td>`;
        if (built > 0) {
          let maxActivate = built;
          if (bp.workers_per_building) {
            const workersPer = bp.workers_per_building;
            const available = freePop + active * workersPer;
            maxActivate = Math.min(built, Math.floor(available / workersPer));
          }
          html += `<td><input type="number" min="0" max="${maxActivate}" value="${active}" class="activate-input" style="width:4em" data-id="${bp.id}"></td>`;

        } else {
          html += '<td></td>';
        }
        html += `<td>${costHtml}</td><td><button class="build-btn" data-id="${bp.id}"${canBuild ? '' : ' disabled'}>Construire</button></td></tr>`;
      }
      html += '</table>';
      infra.innerHTML = html;

      const table = document.getElementById('buildingsTable');
      table.addEventListener('click', handleBuildingTableClick);
      table.addEventListener('change', handleBuildingActivationChange);
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
    const resp = await fetch('/api/building', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, quantity: 1 })
    });
    if (resp.ok) {
      await loadAndRender();
    } else {
      alert('Construction impossible');
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

    const resp = await fetch('/api/building/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, quantity })
    });
    if (resp.ok) {
      await loadAndRender();
    } else {
      alert('Activation impossible');
    }
  }
}

function buildTable(list, showMax = false, inv = {}, production = {}, productionDetails = {}) {
  let html = '<tr><th>Ressource</th><th>Quantité</th><th>Production</th>';
  if (showMax) html += '<th>Maximum</th>';
  html += '</tr>';
  for (const [key, label] of list) {
    const qty = inv[key] ?? 0;
    const details = productionDetails[key] || [];
      let prodHtml = '';
      if (details.length) {
        const total = details.reduce((sum, s) => sum + s.amount, 0);
        const rows = details
          .map(src => `<tr><td>${Math.abs(src.amount)} ${src.label}</td></tr>`)
          .join('');
        prodHtml = `<span class="tooltip">${spanAmount(total)}<table class="tooltip-table">${rows}</table></span>`;
      } else if (production[key]) {
        prodHtml = spanAmount(production[key]);
      }
    html += `<tr><td>${label}</td><td>${qty}</td><td>${prodHtml}</td>`;
    if (showMax) html += '<td></td>';
    html += '</tr>';
  }
  return html;
}

function spanAmount(val) {
  const sign = val > 0 ? '+' : '';
  const cls = val > 0 ? 'prod-positive' : 'prod-negative';
  return `<span class="${cls}">${sign}${val}</span>`;
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

