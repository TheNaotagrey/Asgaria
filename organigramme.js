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
const LABEL_FONT = '600 14px "Segoe UI", Arial, sans-serif';
const LABEL_HORIZONTAL_PADDING = 8;
const LABEL_VERTICAL_PADDING = 4;
const LABEL_MAX_WIDTH = 180;
const LABEL_LINE_HEIGHT = 18;
const LABEL_MEASURE_CANVAS = document.createElement('canvas');

const state = {
  data: null,
  seigneursById: new Map(),
  titlesBySeigneur: new Map(),
  highestTitleBySeigneur: new Map(),
  vassalsByOverlord: new Map(),
  nodePositions: new Map(),
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
  infoPanel: null,
  infoTitle: null,
  infoReligion: null,
  infoOverlord: null,
  infoTitles: null,
  infoVassals: null,
  titlesSection: null,
  vassalsSection: null
};

function cacheElements() {
  elements.select = document.getElementById('organigramSelect');
  elements.status = document.getElementById('organigramStatus');
  elements.svg = document.getElementById('organigramSvg');
  elements.graph = document.getElementById('organigramGraph');
  elements.canvas = document.getElementById('organigramCanvas');
  elements.resetBtn = document.getElementById('resetViewBtn');
  elements.legend = document.getElementById('organigramLegend');
  elements.infoPanel = document.getElementById('seigneurInfoPanel');
  elements.infoTitle = document.getElementById('seigneurInfoTitle');
  elements.infoReligion = document.getElementById('seigneurInfoReligion');
  elements.infoOverlord = document.getElementById('seigneurInfoOverlord');
  elements.infoTitles = document.getElementById('seigneurInfoTitles');
  elements.infoVassals = document.getElementById('seigneurInfoVassals');
  elements.titlesSection = document.getElementById('seigneurTitlesSection');
  elements.vassalsSection = document.getElementById('seigneurVassalsSection');
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
  state.nodePositions.clear();

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

function hasTitle(seigneurId) {
  return (state.titlesBySeigneur.get(seigneurId) || []).length > 0;
}

function hasVassal(seigneurId) {
  return (state.vassalsByOverlord.get(seigneurId) || []).length > 0;
}

function isEligibleRoot(seigneurId) {
  return hasTitle(seigneurId) && hasVassal(seigneurId);
}

function getTopLevelSeigneurs() {
  return state.data.seigneurs.filter((seigneur) => !seigneur.overlord_id && isEligibleRoot(seigneur.id));
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
    option.textContent = 'Aucun organigramme disponible';
    elements.select.appendChild(option);
    elements.select.disabled = true;
    return;
  }

  elements.select.disabled = false;
  const sorted = [...topSeigneurs].sort((a, b) => {
    const styleA = state.highestTitleBySeigneur.get(a.id) || titleStyleByKey.seigneur;
    const styleB = state.highestTitleBySeigneur.get(b.id) || titleStyleByKey.seigneur;
    const rankA = TITLE_STYLES.findIndex((style) => style.key === styleA.key);
    const rankB = TITLE_STYLES.findIndex((style) => style.key === styleB.key);
    if (rankA !== rankB) return rankA - rankB;
    return formatRootLabel(a).localeCompare(formatRootLabel(b), 'fr');
  });
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

function measureLabelWidth(text) {
  const context = LABEL_MEASURE_CANVAS.getContext('2d');
  if (!context) return 0;
  context.font = LABEL_FONT;
  return context.measureText(text).width;
}

function getNodeSizeById(seigneurId) {
  const seigneur = state.seigneursById.get(seigneurId);
  const style = state.highestTitleBySeigneur.get(seigneurId) || titleStyleByKey.seigneur;
  const baseWidth = style.size * 2.4;
  const baseHeight = style.size * 0.9;
  if (!seigneur) {
    return { width: baseWidth, height: baseHeight };
  }
  const textWidth = measureLabelWidth(seigneur.name);
  const maxWidth = Math.max(baseWidth, LABEL_MAX_WIDTH);
  const width = Math.max(baseWidth, Math.min(textWidth + LABEL_HORIZONTAL_PADDING * 2, maxWidth));
  const availableWidth = Math.max(1, width - LABEL_HORIZONTAL_PADDING * 2);
  const lineCount = Math.max(1, Math.ceil(textWidth / availableWidth));
  const height = Math.max(baseHeight, lineCount * LABEL_LINE_HEIGHT + LABEL_VERTICAL_PADDING * 2);
  return { width, height };
}

function updateBounds(nodes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  nodes.forEach((node) => {
    const { width, height } = getNodeSizeById(node.id);
    minX = Math.min(minX, node.x - width / 2);
    maxX = Math.max(maxX, node.x + width / 2);
    minY = Math.min(minY, node.y - height / 2);
    maxY = Math.max(maxY, node.y + height / 2);
  });
  state.graphBounds = { minX, maxX, minY, maxY };
}

function resetView() {
  if (!elements.canvas) {
    state.transform = { scale: 1, x: 30, y: 30 };
    applyTransform();
    return;
  }
  const { minX, maxX, minY, maxY } = state.graphBounds;
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    state.transform = { scale: 1, x: 30, y: 30 };
    applyTransform();
    return;
  }
  const rect = elements.canvas.getBoundingClientRect();
  const padding = 40;
  const graphHeight = Math.max(1, maxY - minY);
  let scale = (rect.height - padding * 2) / graphHeight;
  scale = Math.min(2.5, Math.max(0.4, scale));
  const rootId = Number(elements.select?.value);
  const rootPosition = state.nodePositions.get(rootId);
  const centerX = rootPosition ? rootPosition.x : (minX + maxX) / 2;
  state.transform = {
    scale,
    x: rect.width / 2 - centerX * scale,
    y: padding - minY * scale
  };
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
  state.nodePositions.clear();

  const root = buildTree(rootId);
  const nodes = flattenTree(root);
  const maxNodeWidth = nodes.reduce((maxWidth, node) => {
    const { width } = getNodeSizeById(node.id);
    return Math.max(maxWidth, width);
  }, 0);
  const unitWidth = Math.max(150, maxNodeWidth + 40);
  assignPositions(root, 0, unitWidth);
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
      const parentIndex = TITLE_STYLES.findIndex((style) => style.key === parentStyle.key);
      const nextStyle = TITLE_STYLES[parentIndex + 1];
      const nextLevelTop = nextStyle ? nextStyle.y - (nextStyle.size * 0.9) / 2 : endY;
      const midY = (startY + nextLevelTop) / 2;

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
    const { width, height } = getNodeSizeById(node.id);

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

    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('x', '0');
    foreignObject.setAttribute('y', '0');
    foreignObject.setAttribute('width', width);
    foreignObject.setAttribute('height', height);

    const label = document.createElement('div');
    label.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    label.className = 'organigramme-node-label';
    label.textContent = seigneur.name;
    foreignObject.appendChild(label);

    group.appendChild(rect);
    group.appendChild(foreignObject);
    nodesGroup.appendChild(group);
    state.nodePositions.set(node.id, { x: node.x, y: node.y, width, height });
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
    setStatus('Aucun organigramme disponible pour le moment.', 'warn');
    elements.graph.innerHTML = '';
    return;
  }

  const seigneur = state.seigneursById.get(rootId);
  setStatus(`Organigramme de ${seigneur ? seigneur.name : 'la lignée sélectionnée'}.`, 'success');
  renderGraph(rootId);
  resetView();
}

function renderDialog(seigneurId) {
  const seigneur = state.seigneursById.get(seigneurId);
  if (!seigneur || !elements.infoPanel) return;
  const titles = (state.titlesBySeigneur.get(seigneurId) || []).sort((a, b) => {
    const rankA = TITLE_STYLES.findIndex((style) => style.key === a.key);
    const rankB = TITLE_STYLES.findIndex((style) => style.key === b.key);
    return rankA - rankB;
  });
  const vassalIds = state.vassalsByOverlord.get(seigneurId) || [];

  elements.infoTitle.textContent = seigneur.name;
  setLabeledLine(elements.infoReligion, 'Religion :', seigneur.religion_name || 'Inconnue');
  setSeigneurLine(elements.infoOverlord, seigneur.overlord_id, 'Suzerain :');

  elements.infoTitles.innerHTML = '';
  if (titles.length) {
    titles.forEach((title) => {
      const li = document.createElement('li');
      li.textContent = formatTitleName(title);
      elements.infoTitles.appendChild(li);
    });
    if (elements.titlesSection) elements.titlesSection.style.display = 'block';
  } else {
    const li = document.createElement('li');
    li.textContent = 'Aucun titre recensé.';
    elements.infoTitles.appendChild(li);
    if (elements.titlesSection) elements.titlesSection.style.display = 'block';
  }

  elements.infoVassals.innerHTML = '';
  if (vassalIds.length) {
    vassalIds.forEach((id) => {
      const vassal = state.seigneursById.get(id);
      if (!vassal) return;
      elements.infoVassals.appendChild(createSeigneurButton(vassal.id, vassal.name));
    });
    if (elements.vassalsSection) elements.vassalsSection.style.display = 'block';
  } else {
    const empty = document.createElement('div');
    empty.className = 'organigramme-empty';
    empty.textContent = 'Aucun vassal direct.';
    elements.infoVassals.appendChild(empty);
    if (elements.vassalsSection) elements.vassalsSection.style.display = 'block';
  }

  elements.infoPanel.style.display = 'block';
}

function formatTitleName(title) {
  const prefixMap = {
    empire: 'Empereur de',
    kingdom: 'Roi de',
    archduchy: 'Archiduc de',
    duchy: 'Duc de',
    marquisate: 'Marquis de',
    county: 'Comte de',
    viscounty: 'Vicomte de',
    barony: 'Baron de'
  };
  const prefix = prefixMap[title.key];
  if (prefix && title.name) {
    return `${prefix} ${title.name}`;
  }
  if (title.name) {
    return `${title.label} ${title.name}`;
  }
  return title.label;
}

function setLabeledLine(elem, label, value) {
  if (!elem) return;
  elem.innerHTML = '';
  if (!value) {
    elem.style.display = 'none';
    return;
  }
  elem.style.display = 'flex';
  const labelSpan = document.createElement('span');
  labelSpan.className = 'info-label';
  labelSpan.textContent = label;
  elem.appendChild(labelSpan);
  elem.appendChild(document.createTextNode(' '));
  const valueSpan = document.createElement('span');
  valueSpan.textContent = value;
  elem.appendChild(valueSpan);
}

function setSeigneurLine(elem, seigneurId, label) {
  if (!elem) return;
  elem.innerHTML = '';
  elem.style.display = 'flex';
  const labelSpan = document.createElement('span');
  labelSpan.className = 'info-label';
  labelSpan.textContent = label;
  elem.appendChild(labelSpan);
  elem.appendChild(document.createTextNode(' '));
  if (seigneurId) {
    const overlord = state.seigneursById.get(seigneurId);
    if (overlord) {
      elem.appendChild(createSeigneurButton(overlord.id, overlord.name));
      return;
    }
    elem.appendChild(document.createTextNode('Inconnu'));
    return;
  }
  elem.appendChild(document.createTextNode('Aucun'));
}

function createSeigneurButton(seigneurId, label) {
  const seigneur = state.seigneursById.get(seigneurId);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'control-btn organigramme-seigneur-btn';
  button.textContent = label || seigneur?.name || `Seigneur #${seigneurId}`;
  button.addEventListener('click', () => {
    renderDialog(seigneurId);
    centerOnSeigneur(seigneurId);
  });
  return button;
}

function centerOnSeigneur(seigneurId) {
  if (!elements.canvas) return;
  const position = state.nodePositions.get(seigneurId);
  if (!position) return;
  const rect = elements.canvas.getBoundingClientRect();
  const scale = state.transform.scale;
  state.transform.x = rect.width / 2 - position.x * scale;
  state.transform.y = rect.height / 2 - position.y * scale;
  applyTransform();
}

function setupInteractions() {
  if (!elements.svg || !elements.canvas) return;
  let isDragging = false;
  let lastPosition = { x: 0, y: 0 };

  const onPointerMove = (event) => {
    if (!isDragging) return;
    hideInfoPanel();
    state.transform.x += event.clientX - lastPosition.x;
    state.transform.y += event.clientY - lastPosition.y;
    lastPosition = { x: event.clientX, y: event.clientY };
    applyTransform();
  };

  elements.canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    isDragging = true;
    lastPosition = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  elements.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    hideInfoPanel();
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
    if (id) {
      renderDialog(id);
      centerOnSeigneur(id);
    }
  });

  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', () => resetView());
  }
}

function hideInfoPanel() {
  if (elements.infoPanel) elements.infoPanel.style.display = 'none';
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
    setStatus('Impossible de charger l’organigramme. Réessayez plus tard.', 'error');
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
