(() => {
  const apiBase = location.origin === 'null' ? 'http://localhost:3000' : '';
  const labels = {
    population: 'Population', or_: 'Or', pierre: 'Pierre', fer: 'Fer', lingot_or: 'Lingots d’or',
    antidote: 'Antidotes', armureries: 'Armureries', rhum: 'Rhum', grague: 'Grague', vivres: 'Vivres',
    architectes: 'Architectes', charpentiers: 'Charpentiers', maitres_oeuvre: 'Maîtres d’œuvre',
    maitre_espions: 'Maîtres espions', points_magique: 'Points magiques', fourrure: 'Fourrures',
    ivoire: 'Ivoire', soie: 'Soie', huile: 'Huile', teinture: 'Teintures', epices: 'Épices', sel: 'Sel',
    perle: 'Perles', encens: 'Encens', vin: 'Vin', pierre_precieuse: 'Pierres précieuses',
    hommes_darmes: 'Hommes d’armes', chevaux: 'Chevaux', trebuchets: 'Trébuchets', esclaves: 'Esclaves',
    prestige: 'Prestige', renommee: 'Renommée', land_transactions: 'Transactions terrestres',
    naval_transactions: 'Transactions navales', spells_cast: 'Sorts lancés'
  };
  const breakdownLabels = {
    production: 'Production', tax: 'Taxes', consumption: 'Consommation',
    received: 'Ressources reçues', overflow: 'Pertes par capacité'
  };
  const el = id => document.getElementById(id);
  const formatNumber = value => Number(value || 0).toLocaleString('fr-CA');
  const signed = value => `${Number(value) > 0 ? '+' : ''}${formatNumber(value)}`;
  const label = key => labels[key] || key.replace(/_/g, ' ');
  const dateLabel = value => String(value || '').replace('T', ' ').replace(/\.\d+Z?$/, '');
  let reports = [];
  let selectedId = null;
  let loadVersion = 0;
  let showAll = false;
  let showDifferences = false;
  const references = new Map();

  function append(parent, tag, content, className) {
    const node = document.createElement(tag);
    if (content !== undefined && content !== null) node.textContent = content;
    if (className) node.className = className;
    parent.append(node);
    return node;
  }

  async function api(path) {
    const response = await fetch(apiBase + path, { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur du serveur (HTTP ${response.status}).`);
    return data;
  }

  function referenceFor(id) {
    if (!references.has(id)) references.set(id, {});
    return references.get(id);
  }

  function reportRows(report) {
    const before = report.before || {};
    const after = report.after || {};
    const delta = report.delta || {};
    const beforeInventory = before.inventory || {};
    const afterInventory = after.inventory || {};
    const deltaInventory = delta.inventory || {};
    const keys = [...new Set([...Object.keys(beforeInventory), ...Object.keys(afterInventory), ...Object.keys(deltaInventory)])];
    return [
      { key: 'population', name: 'Population', before: Number(before.population || 0), delta: Number(delta.population || 0), after: Number(after.population || 0) },
      ...keys.map(key => ({ key, name: label(key), before: Number(beforeInventory[key] || 0), delta: Number(deltaInventory[key] || 0), after: Number(afterInventory[key] || 0) }))
    ];
  }

  function renderList() {
    const root = el('updateReportList');
    root.replaceChildren();
    const query = el('updateReportFilter').value.trim().toLocaleLowerCase('fr');
    const matches = reports.filter(report => report.display_name.toLocaleLowerCase('fr').includes(query));
    el('updateReportCount').textContent = `${matches.length} relevé${matches.length > 1 ? 's' : ''} affiché${matches.length > 1 ? 's' : ''}`;
    if (!matches.length) {
      append(root, 'p', reports.length ? 'Aucune seigneurie ne correspond à la recherche.' : 'Aucun relevé enregistré.', 'report-list-empty');
      return;
    }
    matches.forEach(report => {
      const button = append(root, 'button', null, 'report-list-item');
      button.type = 'button';
      button.classList.toggle('selected', report.id === selectedId);
      button.setAttribute('aria-current', report.id === selectedId ? 'true' : 'false');
      append(button, 'strong', report.display_name);
      append(button, 'span', report.current_update_label);
      append(button, 'small', dateLabel(report.created_at));
      button.addEventListener('click', () => loadDetails(report.id));
    });
  }

  function setSummary(summary, rows, reference) {
    const checked = rows.filter(row => reference[row.key] !== undefined);
    const differences = checked.filter(row => reference[row.key] !== row.after);
    const arithmetic = rows.filter(row => row.before + row.delta !== row.after);
    summary.replaceChildren();
    append(summary, 'div', `${checked.length} valeur${checked.length > 1 ? 's' : ''} comparée${checked.length > 1 ? 's' : ''}`, 'report-summary-count');
    const result = append(summary, 'div', checked.length ?
      `${differences.length} écart${differences.length > 1 ? 's' : ''} avec la feuille` :
      'Saisissez une valeur de la feuille pour commencer.', differences.length ? 'report-summary-error' : 'report-summary-ok');
    if (!checked.length) result.className = 'report-summary-neutral';
    append(summary, 'div', arithmetic.length ?
      `${arithmetic.length} incohérence${arithmetic.length > 1 ? 's' : ''} arithmétique${arithmetic.length > 1 ? 's' : ''} dans le relevé` :
      'Calculs du relevé cohérents', arithmetic.length ? 'report-summary-error' : 'report-summary-ok');
    return { checked, differences, arithmetic };
  }

  function addBreakdown(parent, report) {
    const details = append(parent, 'details', null, 'report-breakdown');
    append(details, 'summary', 'Voir le détail des calculs et événements');
    const delta = report.delta || {};
    Object.entries(breakdownLabels).forEach(([key, heading]) => {
      const values = delta[key];
      if (values === undefined || values === null || (typeof values === 'object' && !Object.keys(values).length)) return;
      const section = append(details, 'section');
      append(section, 'h4', heading);
      if (typeof values !== 'object') {
        append(section, 'p', formatNumber(values));
        return;
      }
      const list = append(section, 'ul');
      Object.entries(values).forEach(([resource, amount]) => append(list, 'li', `${label(resource)} : ${typeof amount === 'number' ? formatNumber(amount) : JSON.stringify(amount)}`));
    });
    const events = Array.isArray(report.events) ? report.events : [];
    const section = append(details, 'section');
    append(section, 'h4', 'Événements');
    if (!events.length) append(section, 'p', 'Aucun événement consigné.');
    else {
      const list = append(section, 'ul');
      events.forEach(event => append(list, 'li', [event.title, event.details].filter(Boolean).join(' : ')));
    }
  }

  function renderDetails(report) {
    const root = el('updateReportDetails');
    root.replaceChildren();
    const metadata = reports.find(item => item.id === report.id);
    const title = append(root, 'header', null, 'report-detail-heading');
    append(title, 'p', metadata ? metadata.display_name : `Seigneurie ${report.player_id}`, 'report-detail-eyebrow');
    append(title, 'h3', report.current_update_label);
    append(title, 'p', `Depuis l’an ${report.from_update.year}, mise à jour ${report.from_update.number} · ${dateLabel(report.created_at)}`, 'report-detail-meta');

    const rows = reportRows(report);
    const reference = referenceFor(report.id);
    const summary = append(root, 'div', null, 'report-summary');
    const controls = append(root, 'div', null, 'report-view-controls');
    const allLabel = append(controls, 'label');
    const allInput = append(allLabel, 'input');
    allInput.type = 'checkbox';
    allInput.checked = showAll;
    append(allLabel, 'span', 'Afficher aussi les valeurs inchangées');
    const differenceLabel = append(controls, 'label');
    const differenceInput = append(differenceLabel, 'input');
    differenceInput.type = 'checkbox';
    differenceInput.checked = showDifferences;
    append(differenceLabel, 'span', 'Afficher seulement les écarts avec la feuille');
    const tableWrap = append(root, 'div', null, 'report-table-wrap');
    const table = append(tableWrap, 'table', null, 'report-compare-table');
    const head = append(table, 'thead');
    const header = append(head, 'tr');
    ['Élément', 'Avant', 'Variation', 'Après', 'Feuille manuelle', 'Écart'].forEach(text => append(header, 'th', text));
    const body = append(table, 'tbody');

    function drawRows() {
      body.replaceChildren();
      const visible = rows.filter(row => (showAll || row.key === 'population' || row.delta !== 0 || reference[row.key] !== undefined) &&
        (!showDifferences || (reference[row.key] !== undefined && reference[row.key] !== row.after)));
      if (!visible.length) {
        const cell = append(append(body, 'tr'), 'td', showDifferences ? 'Aucun écart avec les valeurs saisies.' : 'Aucune valeur à afficher.');
        cell.colSpan = 6;
        cell.className = 'report-table-empty';
      }
      visible.forEach(row => {
        const tr = append(body, 'tr');
        append(tr, 'th', row.name);
        append(tr, 'td', formatNumber(row.before));
        const variation = append(tr, 'td', signed(row.delta));
        variation.className = row.delta > 0 ? 'report-positive' : row.delta < 0 ? 'report-negative' : '';
        append(tr, 'td', formatNumber(row.after), 'report-after');
        const inputCell = append(tr, 'td');
        const input = append(inputCell, 'input');
        input.type = 'number';
        input.step = '1';
        input.min = '0';
        input.placeholder = 'À saisir';
        input.setAttribute('aria-label', `${row.name} selon la feuille manuelle`);
        input.value = reference[row.key] === undefined ? '' : reference[row.key];
        const gap = append(tr, 'td', '—', 'report-gap');
        function updateGap() {
          const entered = input.value.trim();
          const valid = entered !== '' && input.checkValidity() && Number.isSafeInteger(Number(entered));
          if (!entered) delete reference[row.key];
          else if (valid) reference[row.key] = Number(entered);
          else delete reference[row.key];
          gap.textContent = !entered ? '—' : !valid ? 'Valeur invalide' : reference[row.key] === row.after ? 'Conforme' : signed(reference[row.key] - row.after);
          tr.classList.toggle('report-row-difference', valid && reference[row.key] !== row.after);
          tr.classList.toggle('report-row-match', valid && reference[row.key] === row.after);
          setSummary(summary, rows, reference);
        }
        input.addEventListener('input', updateGap);
        input.addEventListener('change', () => { if (showDifferences) drawRows(); });
        updateGap();
      });
      setSummary(summary, rows, reference);
    }
    allInput.addEventListener('change', () => { showAll = allInput.checked; drawRows(); });
    differenceInput.addEventListener('change', () => { showDifferences = differenceInput.checked; drawRows(); });
    drawRows();
    append(root, 'p', 'Écart = valeur de la feuille − résultat du serveur. Les saisies disparaissent au rechargement de la page.', 'report-note');
    const arithmetic = rows.filter(row => row.before + row.delta !== row.after);
    if (arithmetic.length) {
      const warning = append(root, 'div', null, 'report-arithmetic-warning');
      append(warning, 'strong', 'Incohérence dans le relevé');
      const list = append(warning, 'ul');
      arithmetic.forEach(row => append(list, 'li', `${row.name} : ${formatNumber(row.before)} + ${signed(row.delta)} ≠ ${formatNumber(row.after)}.`));
    }
    addBreakdown(root, report);
    append(root, 'p', `Version des règles : ${report.ruleset_version}. Le contrôle arithmétique ne confirme pas à lui seul les règles du jeu.`, 'report-note');
  }

  async function loadDetails(id) {
    selectedId = id;
    renderList();
    const version = ++loadVersion;
    const root = el('updateReportDetails');
    root.replaceChildren();
    append(root, 'p', 'Chargement du relevé…', 'report-empty');
    try {
      const report = await api(`/api/seigneurie/update_reports/${encodeURIComponent(id)}`);
      if (version === loadVersion) renderDetails(report);
    } catch (error) {
      if (version === loadVersion) {
        root.replaceChildren();
        append(root, 'p', error.message, 'report-error');
      }
    }
  }

  async function load() {
    const status = el('updateReportStatus');
    status.textContent = 'Chargement des relevés…';
    try {
      reports = await api('/api/admin/update_reports?limit=200');
      renderList();
      status.textContent = reports.length === 200 ? 'Les 200 relevés les plus récents sont affichés.' : '';
      if (reports.length) await loadDetails(reports.some(item => item.id === selectedId) ? selectedId : reports[0].id);
      else {
        el('updateReportDetails').replaceChildren();
        append(el('updateReportDetails'), 'p', 'Aucun relevé enregistré. Il apparaîtra ici après la première mise à jour d’un joueur.', 'report-empty');
      }
    } catch (error) {
      status.textContent = error.message;
      el('updateReportList').replaceChildren();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    el('updateReportFilter').addEventListener('input', renderList);
    el('updateReportReload').addEventListener('click', load);
    document.querySelector('[data-tab="update-reports"]').addEventListener('click', () => {
      if (!el('tab-update-reports').dataset.loaded) {
        el('tab-update-reports').dataset.loaded = 'true';
        load();
      }
    });
  });
})();
