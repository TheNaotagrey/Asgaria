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

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [res, bRes] = await Promise.all([
      fetch('/api/my_seigneurie'),
      fetch('/api/building_properties')
    ]);
    if (!res.ok) throw new Error('Erreur');
    const data = await res.json();
    const buildingProps = bRes.ok ? await bRes.json() : [];
    const s = data.seigneurie;
    const inv = data.inventaire || {};
    const barony = data.barony || {};
    const production = data.production || {};
    const baronyProps = data.baronyProps || {};
    const employment = data.employment || { employed:0, slaves:0 };
    const buildings = data.buildings || {};

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
    popSummary.innerHTML = `
      <h2>Population</h2>
      <table class="admin-table">
        <tr><th>Type</th><th>Nombre</th></tr>
        <tr><td>Population totale</td><td>${s.population}</td></tr>
        <tr><td>Population employée</td><td>${employment.employed}</td></tr>
        <tr><td>Esclaves</td><td>${employment.slaves}</td></tr>
      </table>
    `;

    const basicTable = document.getElementById('basicResourcesTable');
    const luxuryTable = document.getElementById('luxuryResourcesTable');

    basicTable.innerHTML = buildTable(basicResources, true);
    luxuryTable.innerHTML = buildTable(luxuryResources);

    const infra = document.getElementById('infrastructure');
    if (infra) {
      let html = '<h2>Infrastructure</h2><table class="admin-table" id="buildingsTable">';
      html += '<tr><th>Nom</th><th>Production</th><th>Construits</th><th>Actifs</th><th>Activer</th><th>Construire</th></tr>';
      for (const bp of buildingProps) {
        const prod = bp.production ? `${bp.production} ${bp.produces || ''}` : '';
        const info = buildings[bp.id] || { built: 0, active: 0 };
        const built = info.built || 0;
        const active = info.active || 0;
        html += `<tr data-id="${bp.id}"><td>${bp.label || bp.type}</td><td>${prod}</td><td>${built}</td>`;
        html += `<td>${active}</td>`;
        html += `<td><input type="number" min="0" max="${built}" value="${active}" class="activate-input" style="width:4em" data-id="${bp.id}"><button class="activate-btn" data-id="${bp.id}">OK</button></td>`;
        html += `<td><input type="number" min="1" value="1" class="build-input" style="width:4em" data-id="${bp.id}"><button class="build-btn" data-id="${bp.id}">Construire</button></td></tr>`;
      }
      html += '</table>';
      infra.innerHTML = html;

      const table = document.getElementById('buildingsTable');
      table.addEventListener('click', async e => {
        if (e.target.classList.contains('build-btn')) {
          const id = e.target.dataset.id;
          const input = table.querySelector(`input.build-input[data-id="${id}"]`);
          const quantity = parseInt(input.value, 10) || 0;
          const resp = await fetch('/api/building', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, quantity })
          });
          if (resp.ok) {
            location.reload();
          } else {
            alert('Construction impossible');
          }
        } else if (e.target.classList.contains('activate-btn')) {
          const id = e.target.dataset.id;
          const input = table.querySelector(`input.activate-input[data-id="${id}"]`);
          const quantity = parseInt(input.value, 10);
          const resp = await fetch('/api/building/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, quantity })
          });
          if (resp.ok) {
            location.reload();
          } else {
            alert("Activation impossible");
          }
        }
      });
    }

    const propsDiv = document.getElementById('baronyProps');
    if (propsDiv) {
      propsDiv.innerHTML = buildPropsTable(baronyProps);
    }

    function buildTable(list, showMax = false) {
      let html = '<tr><th>Ressource</th><th>Quantité</th><th>Production</th>';
      if (showMax) html += '<th>Maximum</th>';
      html += '</tr>';
      for (const [key, label] of list) {
        const qty = inv[key] ?? 0;
        const prod = production[key];
        let prodHtml = '';
        if (prod) {
          const sign = prod > 0 ? '+' : '';
          const cls = prod > 0 ? 'prod-positive' : 'prod-negative';
          prodHtml = `<span class="${cls}">${sign}${prod}</span>`;
        }
        html += `<tr><td>${label}</td><td>${qty}</td><td>${prodHtml}</td>`;
        if (showMax) html += '<td></td>';
        html += '</tr>';
      }
      return html;
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
  } catch (e) {
    document.getElementById('summary').textContent = 'Erreur de chargement';
  }
});
