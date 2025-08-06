const resources = [
  ['or_', 'Or'], ['pierre', 'Pierre'], ['fer', 'Fer'], ['lingot_or', "Lingots d'or"],
  ['antidote', 'Antidotes'], ['armureries', 'Armureries'], ['rhum', 'Rhum'], ['grague', 'Grague'],
  ['vivres', 'Vivres'], ['architectes', 'Architectes'], ['charpentiers', 'Charpentiers'], ['maitres_oeuvre', "Maîtres d'œuvre"],
  ['maitre_espions', 'Maîtres espions'], ['points_magique', 'Points magiques'], ['fourrure', 'Fourrures'], ['ivoire', 'Ivoire'],
  ['soie', 'Soie'], ['huile', 'Huile'], ['teinture', 'Teintures'], ['epices', 'Épices'],
  ['sel', 'Sel'], ['perle', 'Perles'], ['encens', 'Encens'], ['vin', 'Vin'],
  ['pierre_precieuse', 'Pierres précieuses'], ['esclaves', 'Esclaves'], ['prestige', 'Prestige'], ['renommee', 'Renommée']
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

    const summary = document.getElementById('summary');
    summary.innerHTML = `
      <p><strong>Baronnie :</strong> ${barony.name || 'Aucune'}</p>
      <p><strong>Population :</strong> ${s.population}</p>
      <p><strong>Travailleurs :</strong> ${s.workers}</p>
      <p><strong>Religion :</strong> ${barony.religion_name || 'Inconnue'}</p>
      <p><strong>Culture :</strong> ${barony.culture_name || 'Inconnue'}</p>
      <p><strong>Esclaves :</strong> ${inv.esclaves || 0}</p>
      <p><strong>IDH :</strong> À calculer</p>
    `;

    const table = document.getElementById('inventoryTable');
    let html = '<tr><th>Ressource</th><th>Quantité</th><th>Production</th><th>Ressource</th><th>Quantité</th><th>Production</th></tr>';
    for (let i = 0; i < resources.length; i += 2) {
      html += '<tr>' + render(resources[i]) + render(resources[i + 1]) + '</tr>';
    }
    table.innerHTML = html;

    function render(r) {
      if (!r) return '<td></td><td></td><td></td>';
      const [key, label] = r;
      const qty = inv[key] ?? 0;
      const prod = production[key];
      let prodHtml = '';
      if (prod) {
        const sign = prod > 0 ? '+' : '';
        const cls = prod > 0 ? 'prod-positive' : 'prod-negative';
        prodHtml = `<span class="${cls}">${sign}${prod}</span>`;
      }
      return `<td>${label}</td><td>${qty}</td><td>${prodHtml}</td>`;
    }
  } catch (e) {
    document.getElementById('summary').textContent = 'Erreur de chargement';
  }
});
