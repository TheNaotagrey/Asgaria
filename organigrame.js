const TITLE_STYLES = [
  { key: 'empire', label: 'Empire', color: '#121212', size: 70, y: 80 },
  { key: 'kingdom', label: 'Royaume', color: '#e53935', size: 62, y: 170 },
  { key: 'archduchy', label: 'Archiduché', color: '#fb8c00', size: 56, y: 250 },
  { key: 'duchy', label: 'Duché', color: '#fdd835', size: 52, y: 330 },
  { key: 'marquisate', label: 'Marquisat', color: '#8bc34a', size: 48, y: 410 },
  { key: 'county', label: 'Comté', color: '#1e88e5', size: 44, y: 490 },
  { key: 'viscounty', label: 'Vicomté', color: '#9e9e9e', size: 40, y: 570 },
  { key: 'barony', label: 'Baronnie', color: '#8e24aa', size: 36, y: 650 },
  { key: 'seigneur', label: 'Seigneur', color: '#5d4037', size: 34, y: 720 }
];

const TITLE_TABLE_MAP = {
  empires: 'empire',
  kingdoms: 'kingdom',
  archduchies: 'archduchy',
  duchies: 'duchy',
  marquisates: 'marquisate',
  counties: 'county',
  viscounties: 'viscounty',
  baronies: 'barony'
};

const titleStyleByKey = Object.fromEntries(TITLE_STYLES.map((style) => [style.key, style]));

const state = {
  data: null,
  seigneursById: new Map(),
  titlesBySeigneur: new Map(),
  highestTitleBySeigneur: new Map(),
  vassalsByOverlord: new Map(),
  graphBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  transform: { scale: 1, x: 30, y: 30 }
};

const elements = {
  select: null,
  status: null,
  svg: null,
  graph: null,
  canvas: null,
  resetBtn: null,
  legend: null,
  dialog: null,
  dialogTitle: null,
  dialogIdentity: null,
  dialogReligion: null,
  dialogOverlord: null,
  dialogTitles: null,
  dialogVassals: null
};

function cacheElements() {
  elements.select = document.getElementById('organigramSelect');
  elements.status = document.getElementById('organigramStatus');
  elements.svg = document.getElementById('organigramSvg');
  elements.graph = document.getElementById('organigramGraph');
  elements.canvas = document.getElementById('organigramCanvas');
  elements.resetBtn = document.getElementById('resetViewBtn');
  elements.legend = document.getElementById('organigramLegend');
  elements.dialog = document.getElementById('seigneurDialog');
  elements.dialogTitle = document.getElementById('seigneurDialogTitle');
  elements.dialogIdentity = document.getElementById('seigneurDialogIdentity');
  elements.dialogReligion = document.getElementById('seigneurDialogReligion');
  elements.dialogOverlord = document.getElementById('seigneurDialogOverlord');
  elements.dialogTitles = document.getElementById('seigneurDialogTitles');
  elements.dialogVassals = document.getElementById('seigneurDialogVassals');
}

function waitForHeaderControls() {
  return new Promise((resolve) => {
    if (document.getElementById('organigramSelect')) return resolve();
    const timer = setInterval(() => {
      if (document.getElementById('organigramSelect')) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

function setStatus(message, tone = 'info') {
  if (!elements.status) return;
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function initLegend() {
  if (!elements.legend) return;
  elements.legend.innerHTML = '';
  TITLE_STYLES.filter((style) => style.key !== 'seigneur').forEach((style) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="legend-dot" style="background:${style.color}"></span>${style.label}`;
    elements.legend.appendChild(li);
  });
}

function buildMaps(data) {
  state.seigneursById.clear();
  state.titlesBySeigneur.clear();
  state.highestTitleBySeigneur.clear();
  state.vassalsByOverlord.clear();

  data.seigneurs.forEach((seigneur) => {
    state.seigneursById.set(seigneur.id, seigneur);
    if (!state.titlesBySeigneur.has(seigneur.id)) {
      state.titlesBySeigneur.set(seigneur.id, []);
    }
    if (seigneur.overlord_id) {
      if (!state.vassalsByOverlord.has(seigneur.overlord_id)) {
        state.vassalsByOverlord.set(seigneur.overlord_id, []);
      }
      state.vassalsByOverlord.get(seigneur.overlord_id).push(seigneur.id);
    }
  });

  Object.entries(data.titles).forEach(([table, rows]) => {
    const key = TITLE_TABLE_MAP[table];
    rows.forEach((row) => {
      if (!row.seigneur_id) return;
      const titles = state.titlesBySeigneur.get(row.seigneur_id) || [];
      titles.push({
        key,
        label: titleStyleByKey[key]?.label || 'Titre',
        name: row.name,
        color: row.color || titleStyleByKey[key]?.color
      });
      state.titlesBySeigneur.set(row.seigneur_id, titles);
    });
  });

  state.titlesBySeigneur.forEach((titles, seigneurId) => {
    const highest = TITLE_STYLES.find((style) => titles.some((title) => title.key === style.key));
    state.highestTitleBySeigneur.set(seigneurId, highest || titleStyleByKey.seigneur);
  });
}

function getTopLevelSeigneurs() {
  return state.data.seigneurs.filter((seigneur) => !seigneur.overlord_id);
}

function formatRootLabel(seigneur) {
  const highest = state.highestTitleBySeigneur.get(seigneur.id) || titleStyleByKey.seigneur;
  const titles = state.titlesBySeigneur.get(seigneur.id) || [];
  const titleName = titles.find((title) => title.key === highest.key)?.name;
  if (titleName) {
    return `${highest.label} ${titleName}`;
  }
  return `${highest.label} ${seigneur.name}`;
}

function populateSelect() {
  if (!elements.select) return;
  const topSeigneurs = getTopLevelSeigneurs();
  elements.select.innerHTML = '';

  if (!topSeigneurs.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Aucun organigrame disponible';
    elements.select.appendChild(option);
    elements.select.disabled = true;
    return;
  }

  elements.select.disabled = false;
  const sorted = [...topSeigneurs].sort((a, b) => formatRootLabel(a).localeCompare(formatRootLabel(b), 'fr'));
  sorted.forEach((seigneur, index) => {
    const option = document.createElement('option');
    option.value = String(seigneur.id);
    option.textContent = formatRootLabel(seigneur);
    if (index === 0) option.selected = true;
    elements.select.appendChild(option);
  });
}

function buildTree(rootId) {
  const buildNode = (id) => {
    const children = (state.vassalsByOverlord.get(id) || []).map(buildNode);
    const width = children.reduce((sum, child) => sum + child.width, 0) || 1;
    return { id, children, width, x: 0, y: 0 };
  };
  return buildNode(rootId);
}

function assignPositions(node, startX, unitWidth) {
  let cursor = startX;
  node.children.forEach((child) => {
    assignPositions(child, cursor, unitWidth);
    cursor += child.width * unitWidth;
  });
  const totalWidth = node.width * unitWidth;
  if (node.children.length) {
    node.x = (node.children[0].x + node.children[node.children.length - 1].x) / 2;
  } else {
    node.x = startX + totalWidth / 2;
  }
  const titleStyle = state.highestTitleBySeigneur.get(node.id) || titleStyleByKey.seigneur;
  node.y = titleStyle.y;
}

function flattenTree(node) {
  const nodes = [node];
  node.children.forEach((child) => nodes.push(...flattenTree(child)));
  return nodes;
}

function updateBounds(nodes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  nodes.forEach((node) => {
    const style = state.highestTitleBySeigneur.get(node.id) || titleStyleByKey.seigneur;
    const width = style.size * 2.4;
    const height = style.size * 0.9;
    minX = Math.min(minX, node.x - width / 2);
    maxX = Math.max(maxX, node.x + width / 2);
    minY = Math.min(minY, node.y - height / 2);
    maxY = Math.max(maxY, node.y + height / 2);
  });
  state.graphBounds = { minX, maxX, minY, maxY };
}

function resetView() {
  state.transform = { scale: 1, x: 30, y: 30 };
  applyTransform();
}

function applyTransform() {
  if (!elements.graph) return;
  const { x, y, scale } = state.transform;
  elements.graph.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
}

function renderGraph(rootId) {
  if (!elements.graph) return;
  elements.graph.innerHTML = '';

  const root = buildTree(rootId);
  assignPositions(root, 0, 180);
  const nodes = flattenTree(root);
  updateBounds(nodes);

  const linksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  linksGroup.setAttribute('class', 'organigramme-links');

  nodes.forEach((node) => {
    const parentStyle = state.highestTitleBySeigneur.get(node.id) || titleStyleByKey.seigneur;
    const parentHeight = parentStyle.size * 0.9;
    node.children.forEach((child) => {
      const childStyle = state.highestTitleBySeigneur.get(child.id) || titleStyleByKey.seigneur;
      const childHeight = childStyle.size * 0.9;
      const startX = node.x;
      const startY = node.y + parentHeight / 2;
      const endX = child.x;
      const endY = child.y - childHeight / 2;
      const midY = (startY + endY) / 2;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`);
      path.setAttribute('stroke', parentStyle.color);
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      linksGroup.appendChild(path);
    });
  });

  const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodesGroup.setAttribute('class', 'organigramme-nodes');

  nodes.forEach((node) => {
    const seigneur = state.seigneursById.get(node.id);
    if (!seigneur) return;
    const style = state.highestTitleBySeigneur.get(node.id) || titleStyleByKey.seigneur;
    const width = style.size * 2.4;
    const height = style.size * 0.9;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'organigramme-node');
    group.setAttribute('data-id', node.id);
    group.setAttribute('transform', `translate(${node.x - width / 2} ${node.y - height / 2})`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('rx', '10');
    rect.setAttribute('ry', '10');
    rect.setAttribute('fill', '#ffffff');
    rect.setAttribute('stroke', style.color);
    rect.setAttribute('stroke-width', '3');
    rect.setAttribute('filter', 'url(#shadow)');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', width / 2);
    text.setAttribute('y', height / 2 + 5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'organigramme-node-label');
    text.textContent = seigneur.name;

    group.appendChild(rect);
    group.appendChild(text);
    nodesGroup.appendChild(group);
  });

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', 'shadow');
  filter.innerHTML = '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.15" />';
  defs.appendChild(filter);

  elements.graph.appendChild(defs);
  elements.graph.appendChild(linksGroup);
  elements.graph.appendChild(nodesGroup);

  applyTransform();
}

function renderOrganigram() {
  if (!elements.select) return;
  const rootId = Number(elements.select.value);
  if (!rootId) {
    setStatus('Aucun organigrame disponible pour le moment.', 'warn');
    elements.graph.innerHTML = '';
    return;
  }

  const seigneur = state.seigneursById.get(rootId);
  setStatus(`Organigrame de ${seigneur ? seigneur.name : 'la lignée sélectionnée'}.`, 'success');
  renderGraph(rootId);
  resetView();
}

function renderDialog(seigneurId) {
  const seigneur = state.seigneursById.get(seigneurId);
  if (!seigneur || !elements.dialog) return;
  const highest = state.highestTitleBySeigneur.get(seigneurId) || titleStyleByKey.seigneur;
  const titles = (state.titlesBySeigneur.get(seigneurId) || []).sort((a, b) => {
    const rankA = TITLE_STYLES.findIndex((style) => style.key === a.key);
    const rankB = TITLE_STYLES.findIndex((style) => style.key === b.key);
    return rankA - rankB;
  });
  const vassalIds = state.vassalsByOverlord.get(seigneurId) || [];

  elements.dialogTitle.textContent = seigneur.name;
  elements.dialogIdentity.textContent = `Titre le plus élevé : ${highest.label}`;
  elements.dialogReligion.textContent = seigneur.religion_name
    ? `Religion : ${seigneur.religion_name}`
    : 'Religion : inconnue';

  if (seigneur.overlord_id) {
    const overlord = state.seigneursById.get(seigneur.overlord_id);
    elements.dialogOverlord.textContent = overlord
      ? `Suzerain : ${overlord.name}`
      : 'Suzerain : inconnu';
  } else {
    elements.dialogOverlord.textContent = 'Suzerain : aucun (top-level)';
  }

  elements.dialogTitles.innerHTML = '';
  if (titles.length) {
    titles.forEach((title) => {
      const li = document.createElement('li');
      li.textContent = `${title.label} – ${title.name}`;
      elements.dialogTitles.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'Aucun titre recensé.';
    elements.dialogTitles.appendChild(li);
  }

  elements.dialogVassals.innerHTML = '';
  if (vassalIds.length) {
    vassalIds.forEach((id) => {
      const vassal = state.seigneursById.get(id);
      const li = document.createElement('li');
      li.textContent = vassal ? vassal.name : `Vassal #${id}`;
      elements.dialogVassals.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'Aucun vassal direct.';
    elements.dialogVassals.appendChild(li);
  }

  elements.dialog.showModal();
}

function setupInteractions() {
  if (!elements.svg || !elements.canvas) return;
  let isDragging = false;
  let lastPosition = { x: 0, y: 0 };

  const onPointerMove = (event) => {
    if (!isDragging) return;
    state.transform.x += event.clientX - lastPosition.x;
    state.transform.y += event.clientY - lastPosition.y;
    lastPosition = { x: event.clientX, y: event.clientY };
    applyTransform();
  };

  elements.canvas.addEventListener('mousedown', (event) => {
    isDragging = true;
    lastPosition = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  elements.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = elements.canvas.getBoundingClientRect();
    const zoomIntensity = 0.0015;
    const delta = -event.deltaY * zoomIntensity;
    const newScale = Math.min(2.5, Math.max(0.4, state.transform.scale + delta));
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const graphX = (mouseX - state.transform.x) / state.transform.scale;
    const graphY = (mouseY - state.transform.y) / state.transform.scale;

    state.transform.scale = newScale;
    state.transform.x = mouseX - graphX * newScale;
    state.transform.y = mouseY - graphY * newScale;
    applyTransform();
  }, { passive: false });

  elements.graph.addEventListener('click', (event) => {
    const nodeGroup = event.target.closest('.organigramme-node');
    if (!nodeGroup) return;
    const id = Number(nodeGroup.dataset.id);
    if (id) renderDialog(id);
  });

  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', () => resetView());
  }
}

async function loadOrganigram() {
  setStatus('Chargement des données…');
  try {
    const res = await fetch('/api/organigrammes');
    if (!res.ok) throw new Error('Erreur de chargement');
    const data = await res.json();
    state.data = data;
    buildMaps(data);
    initLegend();
    populateSelect();
    renderOrganigram();
  } catch (error) {
    console.error(error);
    setStatus('Impossible de charger l’organigrame. Réessayez plus tard.', 'error');
  }
}

waitForHeaderControls().then(() => {
  cacheElements();
  if (elements.select) {
    elements.select.addEventListener('change', renderOrganigram);
  }
  initLegend();
  setupInteractions();
  loadOrganigram();
});
