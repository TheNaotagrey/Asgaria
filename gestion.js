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

    const summary = document.getElementById('summary');
    summary.innerHTML = `
      <p><strong>Baronnie :</strong> ${barony.name || 'Aucune'}</p>
      <p><strong>Population :</strong> ${s.population}</p>
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
          <td>${fields.active}</td>
          <td>${totalProd}</td>
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
  } catch (e) {
    document.getElementById('summary').textContent = 'Erreur de chargement';
  }
});
