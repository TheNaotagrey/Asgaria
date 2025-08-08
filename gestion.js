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
    const res = await fetch('/api/my_seigneurie');
    if (!res.ok) throw new Error('Erreur');
    const data = await res.json();
    const s = data.seigneurie;
    const inv = data.inventaire || {};
    const barony = data.barony || {};
    const production = data.production || {};
    const fields = data.fields || { built:0, active:0 };
    const baronyProps = data.baronyProps || {};
    const employment = data.employment || { employed:0, slaves:0 };

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
    const maxFields = baronyProps.field_limit || 0;
    const costField = 3;
    const indivProd = 75;
    const modifier = 1;
    const totalProd = fields.active * indivProd * modifier;
    const canBuild = inv.or_ >= costField && fields.built < maxFields;
    const maxActive = Math.min(fields.built, s.population + employment.slaves);
    infra.innerHTML = `
      <h2>Production</h2>
      <table class="admin-table">
        <tr><th>Nom</th><th>Ressource Produite</th><th>Quantité construite</th><th>Maximum</th><th>Production Individuelle</th><th>Modificateur</th><th>Quantité activée</th><th>Production totale</th><th>Restriction</th><th>Prix de construction</th><th></th></tr>
        <tr>
          <td>Champs</td>
          <td>Vivres</td>
          <td>${fields.built}</td>
          <td>${maxFields}</td>
          <td>${indivProd}</td>
          <td>${modifier}</td>
          <td>
            <div class="qty-control">
              <button id="decreaseField" class="qty-btn">-</button>
              <input type="number" id="fieldsActiveInput" min="0" max="${maxActive}" value="${fields.active}" />
              <button id="increaseField" class="qty-btn">+</button>
            </div>
          </td>
          <td id="fieldTotalProd">${totalProd}</td>
          <td>Aucune</td>
          <td>3 Or</td>
          <td><button id="buildField" ${canBuild ? '' : 'disabled'}>Construire</button></td>
        </tr>
      </table>
    `;
    const buildBtn = document.getElementById('buildField');
    if (buildBtn) {
      buildBtn.addEventListener('click', async ()=>{
        const resp = await fetch('/api/building',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'field',quantity:1})});
        if(resp.ok){
          location.reload();
        } else {
          alert('Construction impossible');
        }
      });
    }
    const activeInput = document.getElementById('fieldsActiveInput');
    const incBtn = document.getElementById('increaseField');
    const decBtn = document.getElementById('decreaseField');
    function adjust(delta){
      let v = parseInt(activeInput.value,10) + delta;
      const max = parseInt(activeInput.max,10);
      if(v < 0) v = 0;
      if(v > max) v = max;
      setActive(v);
    }
    if(incBtn) incBtn.addEventListener('click', ()=>adjust(1));
    if(decBtn) decBtn.addEventListener('click', ()=>adjust(-1));
    if(activeInput) activeInput.addEventListener('change', ()=>{
      let v = parseInt(activeInput.value,10) || 0;
      const max = parseInt(activeInput.max,10);
      if(v < 0) v = 0;
      if(v > max) v = max;
      setActive(v);
    });

    async function setActive(value){
      activeInput.value = value;
      const resp = await fetch('/api/fields/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quantity:value})});
      if(resp.ok){
        const data = await resp.json();
        const prod = value * indivProd * modifier;
        const prodCell = document.getElementById('fieldTotalProd');
        if(prodCell) prodCell.textContent = prod;
        const employedCell = document.querySelector('#populationSummary table tr:nth-child(3) td:nth-child(2)');
        if(employedCell) employedCell.textContent = data.employment.employed;
      } else {
        alert('Mise à jour impossible');
        location.reload();
      }
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
