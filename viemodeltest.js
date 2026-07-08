(function () {
  const endpoints = {
    baronies: '/api/baronies',
    seigneurs: '/api/seigneurs',
    religions: '/api/religions',
    cultures: '/api/cultures',
    counties: '/api/counties',
    duchies: '/api/duchies',
    kingdoms: '/api/kingdoms',
    viscounties: '/api/viscounties',
    marquisates: '/api/marquisates',
    archduchies: '/api/archduchies',
    empires: '/api/empires',
    canonicalLands: '/api/canonical_lands',
    sanctuaries: '/api/sanctuaries',
    baronyConnections: '/api/barony_connections'
  };

  const titleRanks = ['viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'];
  const collectionByRank = {
    barony: 'baronies',
    viscounty: 'viscounties',
    county: 'counties',
    marquisate: 'marquisates',
    duchy: 'duchies',
    archduchy: 'archduchies',
    kingdom: 'kingdoms',
    empire: 'empires'
  };
  const rankLabels = {
    barony: 'Baronnie',
    viscounty: 'Vicomte',
    county: 'Comte',
    marquisate: 'Marquisat',
    duchy: 'Duché',
    archduchy: 'Archiduché',
    kingdom: 'Royaume',
    empire: 'Empire',
    seigneur: 'Seigneur',
    religion: 'Religion',
    culture: 'Culture'
  };
  const titlePrefixes = {
    barony: 'Baronnie de',
    viscounty: 'Vicomté de',
    county: 'Comté de',
    marquisate: 'Marquisat de',
    duchy: 'Duché de',
    archduchy: 'Archiduché de',
    kingdom: 'Royaume de',
    empire: 'Empire de'
  };

  let vm = null;

  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function clear(node) {
    if (node) node.textContent = '';
  }

  function appendText(node, text) {
    node.appendChild(document.createTextNode(text));
  }

  function createSwatch(color) {
    const span = document.createElement('span');
    span.className = 'swatch';
    span.style.backgroundColor = color || '#999999';
    return span;
  }

  function entityLabel(entity) {
    if (!entity) return 'Aucun';
    const name = entity.name || '';
    if (titlePrefixes[entity._type]) {
      const label = name ? `${titlePrefixes[entity._type]} ${name}` : `${rankLabels[entity._type]} #${entity.id}`;
      return `${label} (#${entity.id})`;
    }
    const label = name || `${rankLabels[entity._type] || 'Entité'} #${entity.id}`;
    return `${label} (#${entity.id})`;
  }

  function addRow(tbody, label, value) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    const td = document.createElement('td');
    th.textContent = label;
    if (value instanceof Node) {
      td.appendChild(value);
    } else {
      td.textContent = value || 'Aucun';
    }
    tr.appendChild(th);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function entityLink(entity) {
    if (!entity) {
      const span = document.createElement('span');
      span.textContent = 'Aucun';
      return span;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entity-link';
    button.dataset.type = entity._type || '';
    button.dataset.id = entity.id || '';
    if (entity.color) button.appendChild(createSwatch(entity.color));
    appendText(button, entityLabel(entity));
    button.addEventListener('click', () => navigateToEntity(entity));
    return button;
  }

  function entityList(items) {
    const ul = document.createElement('ul');
    const list = (items || []).filter(Boolean)
      .slice()
      .sort((a, b) => entityLabel(a).localeCompare(entityLabel(b), 'fr'));
    if (!list.length) {
      const li = document.createElement('li');
      li.textContent = 'Aucun';
      ul.appendChild(li);
      return ul;
    }
    list.forEach((item) => {
      const li = document.createElement('li');
      li.appendChild(entityLink(item));
      ul.appendChild(li);
    });
    return ul;
  }

  function titleRowsForBarony(barony) {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Rang', 'De jure', 'De facto'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    titleRanks.forEach((rank) => {
      const tr = document.createElement('tr');
      const rankCell = document.createElement('th');
      const dejureCell = document.createElement('td');
      const defactoCell = document.createElement('td');
      rankCell.textContent = rankLabels[rank] || rank;
      dejureCell.appendChild(entityLink(vm.getTitleForBarony(barony.id, rank, 'dejure')));
      defactoCell.appendChild(entityLink(vm.getTitleForBarony(barony.id, rank, 'defacto')));
      tr.appendChild(rankCell);
      tr.appendChild(dejureCell);
      tr.appendChild(defactoCell);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function detailsTable(rows) {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    rows.forEach(([label, value]) => addRow(tbody, label, value));
    table.appendChild(tbody);
    return table;
  }

  function renderBarony(barony) {
    clear(els.details);
    const wrapper = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = entityLabel(barony);
    wrapper.appendChild(title);
    wrapper.appendChild(detailsTable([
      ['Seigneur', entityLink(barony.seigneur)],
      ['Religion', entityLink(barony.religion)],
      ['Culture', entityLink(barony.culture)],
      ['Prieure', entityLink(barony.prioryReligion)],
      ['Eglise', entityLink(barony.churchReligion)],
      ['Cathedrale', entityLink(barony.cathedralReligion)],
      ['Terres canoniques', entityList(barony.canonicalLands)],
      ['Reference canonique pour', entityList(barony.canonicalFor)]
    ]));
    wrapper.appendChild(titleRowsForBarony(barony));
    els.details.appendChild(wrapper);
  }

  function renderSeigneur(seigneur) {
    clear(els.details);
    const wrapper = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = entityLabel(seigneur);
    wrapper.appendChild(title);
    wrapper.appendChild(detailsTable([
      ['Suzerain', entityLink(seigneur.overlord)],
      ['Religion', entityLink(seigneur.religion)],
      ['Rang le plus eleve', seigneur.highestTitle ? entityLink(seigneur.highestTitle) : 'Baronnie'],
      ['Vassaux', entityList(seigneur.vassals)],
      ['Baronnies', entityList(seigneur.baronies)]
    ]));

    const titleItems = [
      ...(seigneur.baronies || []),
      ...titleRanks.flatMap((rank) => (seigneur.titles[rank] || []))
    ];
    wrapper.appendChild(detailsTable([
      ['Titres', entityList(titleItems)]
    ]));
    els.details.appendChild(wrapper);
  }

  function renderTitle(rank, title) {
    clear(els.details);
    const wrapper = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = `${rankLabels[rank] || 'Titre'}: ${entityLabel(title)}`;
    wrapper.appendChild(heading);

    wrapper.appendChild(detailsTable([
      ['Detenteur', entityLink(title.seigneur)],
      ['Parents de jure', entityList(title.deJureParents)],
      ['Enfants de jure', entityList(vm.getChildrenForTitle(rank, title.id, 'dejure'))],
      ['Parent de facto', entityLink(title.defactoParent)],
      ['Enfants de facto', entityList(vm.getChildrenForTitle(rank, title.id, 'defacto'))],
      ['Baronnies de jure', entityList(vm.getBaroniesForTitle(rank, title.id, 'dejure'))],
      ['Baronnies de facto', entityList(vm.getBaroniesForTitle(rank, title.id, 'defacto'))]
    ]));

    els.details.appendChild(wrapper);
  }

  function renderReligion(religion) {
    clear(els.details);
    const wrapper = document.createElement('div');
    const title = document.createElement('h3');
    title.appendChild(entityLink(religion));
    wrapper.appendChild(title);
    wrapper.appendChild(detailsTable([
      ['Seigneurs', entityList(religion.seigneurs)],
      ['Population', entityList(religion.baroniesPop)],
      ['Prieures', entityList(religion.priories)],
      ['Eglises', entityList(religion.churches)],
      ['Cathedrales', entityList(religion.cathedrals)],
      ['Sanctuaires', entityList((religion.sanctuaries || []).map((sanctuary) => sanctuary.barony))]
    ]));
    els.details.appendChild(wrapper);
  }

  function renderCulture(culture) {
    clear(els.details);
    const wrapper = document.createElement('div');
    const title = document.createElement('h3');
    title.appendChild(entityLink(culture));
    wrapper.appendChild(title);
    wrapper.appendChild(detailsTable([
      ['Baronnies', entityList(culture.baronies)],
      ['Seigneurs', entityList(culture.seigneurs)]
    ]));
    els.details.appendChild(wrapper);
  }

  function renderCollectionList(label, items) {
    clear(els.details);
    const wrapper = document.createElement('div');
    const title = document.createElement('h3');
    const list = (items || []).filter(Boolean)
      .slice()
      .sort((a, b) => entityLabel(a).localeCompare(entityLabel(b), 'fr'));
    title.textContent = `${label} (${list.length})`;
    wrapper.appendChild(title);
    wrapper.appendChild(entityList(list));
    els.details.appendChild(wrapper);
  }

  function setSelectValue(select, value) {
    if (!select) return;
    const stringValue = value === null || value === undefined ? '' : String(value);
    select.value = stringValue;
  }

  function clearPrimarySelections(except) {
    if (except !== 'barony') setSelectValue(els.baronySelect, '');
    if (except !== 'seigneur') setSelectValue(els.seigneurSelect, '');
    if (except !== 'title') setSelectValue(els.titleSelect, '');
  }

  function navigateToEntity(entity) {
    if (!entity) return;
    const type = entity._type;
    if (type === 'barony') {
      clearPrimarySelections('barony');
      setSelectValue(els.baronySelect, entity.id);
      renderBarony(entity);
      return;
    }
    if (type === 'seigneur') {
      clearPrimarySelections('seigneur');
      setSelectValue(els.seigneurSelect, entity.id);
      renderSeigneur(entity);
      return;
    }
    if (titleRanks.includes(type)) {
      clearPrimarySelections('title');
      setSelectValue(els.titleRankSelect, type);
      populateTitleSelect();
      setSelectValue(els.titleSelect, entity.id);
      renderTitle(type, entity);
      return;
    }
    clearPrimarySelections();
    if (type === 'religion') {
      renderReligion(entity);
      return;
    }
    if (type === 'culture') {
      renderCulture(entity);
      return;
    }
    clear(els.details);
    els.details.textContent = entityLabel(entity);
  }

  function renderSummary() {
    clear(els.summary);
    const items = [
      ['Seigneurs', vm.seigneurs.list],
      ['Religions', vm.religions.list],
      ['Cultures', vm.cultures.list],
      ['Baronnies', vm.baronies.list],
      ['Vicomtés', vm.viscounties.list],
      ['Comtés', vm.counties.list],
      ['Marquisats', vm.marquisates.list],
      ['Duchés', vm.duchies.list],
      ['Archiduchés', vm.archduchies.list],
      ['Royaumes', vm.kingdoms.list],
      ['Empires', vm.empires.list]
    ];
    items.forEach(([label, list]) => {
      const div = document.createElement('button');
      div.type = 'button';
      div.className = 'summary-item';
      const strong = document.createElement('strong');
      strong.textContent = String(list.length);
      div.appendChild(strong);
      div.appendChild(document.createElement('br'));
      appendText(div, label);
      div.addEventListener('click', () => renderCollectionList(label, list));
      els.summary.appendChild(div);
    });
  }

  function renderDiagnostics() {
    clear(els.diagnostics);
    if (!vm.diagnostics.length) {
      els.diagnostics.className = 'muted';
      els.diagnostics.textContent = 'Aucun diagnostic.';
      return;
    }
    els.diagnostics.className = '';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Type', 'Message'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    vm.diagnostics.forEach((diag) => {
      const tr = document.createElement('tr');
      const typeCell = document.createElement('td');
      const messageCell = document.createElement('td');
      typeCell.textContent = diag.type || '';
      const source = diag.sourceType && diag.sourceId ? vm.getEntity(diag.sourceType, diag.sourceId) : null;
      const target = diag.targetType && diag.targetId ? vm.getEntity(diag.targetType, diag.targetId) : null;
      if (source) {
        messageCell.appendChild(entityLink(source));
        appendText(messageCell, ' - ');
      }
      appendText(messageCell, diag.message || '');
      if (target) {
        appendText(messageCell, ' - cible: ');
        messageCell.appendChild(entityLink(target));
      }
      tr.appendChild(typeCell);
      tr.appendChild(messageCell);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    els.diagnostics.appendChild(table);
  }

  function optionLabel(entity) {
    return entityLabel(entity);
  }

  function populateSelect(select, items, placeholder) {
    select.textContent = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);
    items
      .slice()
      .sort((a, b) => optionLabel(a).localeCompare(optionLabel(b), 'fr'))
      .forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = optionLabel(item);
        select.appendChild(option);
      });
  }

  function populateTitleSelect() {
    const rank = els.titleRankSelect.value;
    const collectionName = collectionByRank[rank];
    const items = collectionName ? vm[collectionName]?.list || [] : [];
    populateSelect(els.titleSelect, items, 'Choisir un titre');
  }

  function renderCurrentBarony() {
    const barony = vm.getEntity('barony', els.baronySelect.value);
    if (barony) {
      clearPrimarySelections('barony');
      setSelectValue(els.baronySelect, barony.id);
      renderBarony(barony);
    }
  }

  function renderCurrentSeigneur() {
    const seigneur = vm.getEntity('seigneur', els.seigneurSelect.value);
    if (seigneur) {
      clearPrimarySelections('seigneur');
      setSelectValue(els.seigneurSelect, seigneur.id);
      renderSeigneur(seigneur);
    }
  }

  function renderCurrentTitle() {
    const rank = els.titleRankSelect.value;
    const title = vm.getEntity(rank, els.titleSelect.value);
    if (title) {
      clearPrimarySelections('title');
      setSelectValue(els.titleRankSelect, rank);
      setSelectValue(els.titleSelect, title.id);
      renderTitle(rank, title);
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  async function loadData() {
    els.loadStatus.textContent = 'Chargement du modele...';
    els.loadStatus.className = 'muted';
    clear(els.details);
    els.details.className = 'muted';
    els.details.textContent = 'Chargement...';

    const entries = await Promise.all(
      Object.entries(endpoints).map(async ([key, url]) => [key, await fetchJson(url)])
    );
    const rawData = Object.fromEntries(entries);
    vm = window.viewModel.build(rawData);

    populateSelect(els.baronySelect, vm.baronies.list, 'Choisir une baronnie');
    populateSelect(els.seigneurSelect, vm.seigneurs.list, 'Choisir un seigneur');
    populateTitleSelect();
    renderSummary();
    renderDiagnostics();
    els.loadStatus.textContent = 'Modele charge.';
    els.details.textContent = 'Selectionnez une entite.';
  }

  function initElements() {
    els.loadStatus = byId('loadStatus');
    els.baronySelect = byId('baronySelect');
    els.seigneurSelect = byId('seigneurSelect');
    els.titleRankSelect = byId('titleRankSelect');
    els.titleSelect = byId('titleSelect');
    els.reloadBtn = byId('reloadBtn');
    els.summary = byId('summary');
    els.details = byId('details');
    els.diagnostics = byId('diagnostics');
  }

  document.addEventListener('DOMContentLoaded', () => {
    initElements();
    els.baronySelect.addEventListener('change', renderCurrentBarony);
    els.seigneurSelect.addEventListener('change', renderCurrentSeigneur);
    els.titleRankSelect.addEventListener('change', () => {
      populateTitleSelect();
      renderCurrentTitle();
    });
    els.titleSelect.addEventListener('change', renderCurrentTitle);
    els.reloadBtn.addEventListener('click', () => {
      loadData().catch((err) => {
        els.loadStatus.className = 'error';
        els.loadStatus.textContent = `Erreur: ${err.message}`;
      });
    });
    loadData().catch((err) => {
      els.loadStatus.className = 'error';
      els.loadStatus.textContent = `Erreur: ${err.message}`;
      els.details.className = 'error';
      els.details.textContent = 'Impossible de charger le modele.';
    });
  });
})();
