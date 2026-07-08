(function (global) {
  function init(options = {}) {
    const getState = options.getState || (() => ({}));
    const actions = options.actions || {};
    const elements = options.elements || {};

    function state() {
      return getState() || {};
    }

    function getElement(key, fallbackId) {
      return elements[key] || (fallbackId ? document.getElementById(fallbackId) : null);
    }

    function setLine(elem, text) {
      if (!elem) return;
      if (text) {
        elem.style.display = 'block';
        elem.textContent = text;
      } else {
        elem.style.display = 'none';
        elem.textContent = '';
      }
    }

    function setLabeledLine(elem, label, value) {
      if (!elem) return;
      elem.innerHTML = '';
      if (value) {
        elem.style.display = 'block';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'info-label';
        labelSpan.textContent = label;
        elem.appendChild(labelSpan);
        elem.appendChild(document.createTextNode(' '));
        const span = document.createElement('span');
        span.textContent = value;
        elem.appendChild(span);
      } else {
        elem.style.display = 'none';
      }
    }

    function createSeigneurButton(seigneurId) {
      const { seigneurMap = {} } = state();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seigneur-link';
      btn.textContent = seigneurMap[seigneurId]?.name || `Seigneur #${seigneurId}`;
      btn.addEventListener('click', () => {
        actions.selectEntity?.(actions.getSeigneurEntity?.(seigneurId), { source: 'panel' });
      });
      return btn;
    }

    function showBaronyDetails(baronyId) {
      if (!baronyId) return;
      actions.selectEntity?.(actions.getBaronyEntity?.(baronyId), { source: 'panel' });
    }

    function createBaronyButton(baronyId) {
      const { baronyMeta = {}, baronyLookup = {} } = state();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'barony-link';
      const label = baronyMeta[baronyId]?.name || baronyLookup[baronyId]?.name || `Baronnie #${baronyId}`;
      btn.textContent = `${label} (#${baronyId})`;
      btn.addEventListener('click', () => showBaronyDetails(baronyId));
      return btn;
    }

    function createBaronyLabel(baronyId) {
      const { baronyMeta = {}, baronyLookup = {} } = state();
      const name = baronyMeta[baronyId]?.name || baronyLookup[baronyId]?.name;
      return name ? `${name} (#${baronyId})` : `Baronnie #${baronyId}`;
    }

    function createTitleButton(rankKey, titleId, options = {}) {
      const { titleTypeConfig = {} } = state();
      const { mode = 'dejure', includeRank = false, forceFilterMode = null } = options;
      const map = actions.getTitleMap?.(rankKey) || {};
      const info = map[titleId];
      const label = info?.name || `${titleTypeConfig[rankKey]?.label || 'Titre'} #${titleId}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'barony-link';
      btn.textContent = includeRank ? `${titleTypeConfig[rankKey]?.label || 'Titre'} ${label}` : label;
      btn.addEventListener('click', () => {
        actions.selectEntity?.(actions.getTitleEntity?.(rankKey, titleId, forceFilterMode || mode), {
          source: 'panel',
          mode: forceFilterMode || mode
        });
      });
      return btn;
    }

    function setSeigneurLine(elem, seigneurId, label, suffixText) {
      const { seigneurMap = {} } = state();
      if (!elem) return;
      elem.innerHTML = '';
      if (seigneurId && seigneurMap[seigneurId]) {
        elem.style.display = 'flex';
        if (label) {
          const labelSpan = document.createElement('span');
          labelSpan.className = 'info-label';
          labelSpan.textContent = label;
          elem.appendChild(labelSpan);
          elem.appendChild(document.createTextNode(' '));
        }
        elem.appendChild(createSeigneurButton(seigneurId));
        if (suffixText) elem.appendChild(document.createTextNode(` ${suffixText}`));
        return;
      }
      if (suffixText) {
        elem.style.display = 'flex';
        if (label) {
          const labelSpan = document.createElement('span');
          labelSpan.className = 'info-label';
          labelSpan.textContent = label;
          elem.appendChild(labelSpan);
          elem.appendChild(document.createTextNode(' '));
        }
        elem.appendChild(document.createTextNode(suffixText));
        return;
      }
      elem.style.display = 'none';
    }

    function setSeigneurList(section, list, ids) {
      if (!section || !list) return;
      list.innerHTML = '';
      if (ids && ids.length > 0) {
        section.style.display = 'block';
        ids.forEach(id => {
          const li = document.createElement('li');
          li.appendChild(createSeigneurButton(id));
          list.appendChild(li);
        });
      } else {
        section.style.display = 'none';
      }
    }

    function setList(section, list, items) {
      if (!section || !list) return;
      list.innerHTML = '';
      if (items && items.length > 0) {
        section.style.display = 'block';
        items.forEach(text => {
          const li = document.createElement('li');
          li.textContent = text;
          list.appendChild(li);
        });
      } else {
        section.style.display = 'none';
      }
    }

    function setTitleList(section, list, titles = [], baronies = []) {
      const { titleTypeConfig = {} } = state();
      if (!section || !list) return;
      list.innerHTML = '';
      const hasItems = (titles && titles.length > 0) || (baronies && baronies.length > 0);
      if (!hasItems) {
        section.style.display = 'none';
        return;
      }
      section.style.display = 'block';
      titles.forEach(title => {
        if (!title || !title.rankKey || !title.id) return;
        const li = document.createElement('li');
        const cfg = titleTypeConfig[title.rankKey];
        if (cfg?.prefix) li.appendChild(document.createTextNode(`${cfg.prefix} `));
        li.appendChild(createTitleButton(title.rankKey, title.id, { mode: title.mode || 'dejure' }));
        list.appendChild(li);
      });
      baronies.forEach(barony => {
        if (!barony || !barony.id) return;
        const li = document.createElement('li');
        li.appendChild(document.createTextNode('Baron de '));
        li.appendChild(createBaronyButton(barony.id));
        list.appendChild(li);
      });
    }

    function setBaronyList(section, list, items) {
      if (!section || !list) return;
      list.innerHTML = '';
      if (items && items.length > 0) {
        section.style.display = 'block';
        items.forEach(item => {
          if (!item || !item.id) return;
          const li = document.createElement('li');
          li.appendChild(createBaronyButton(item.id));
          list.appendChild(li);
        });
      } else {
        section.style.display = 'none';
      }
    }

    function hideSeigneurInfo() {
      const seigneurInfoPanel = getElement('seigneurInfoPanel', 'seigneurInfoPanel');
      if (seigneurInfoPanel) seigneurInfoPanel.style.display = 'none';
    }

    function hideTradeRoutePanel() {
      const tradeRoutePanel = getElement('tradeRoutePanel', 'tradeRoutePanel');
      if (tradeRoutePanel) tradeRoutePanel.style.display = 'none';
    }

    function setTradeRouteInfoMode(active) {
      const infoReligionLine = getElement('infoReligionLine', 'infoReligionLine');
      const infoCultureLine = getElement('infoCultureLine', 'infoCultureLine');
      const feudalSection = getElement('feudalSection', 'feudalSection');
      const religiousSection = getElement('religiousSection', 'religiousBuildingsSection');
      const canonicalOwnedSection = getElement('canonicalOwnedSection', 'canonicalOwnedSection');
      const canonicalParentSection = getElement('canonicalParentSection', 'canonicalParentSection');
      const tradeRoutesSection = getElement('tradeRoutesSection', 'tradeRoutesSection');
      if (infoReligionLine) infoReligionLine.style.display = active ? 'none' : '';
      if (infoCultureLine) infoCultureLine.style.display = active ? 'none' : '';
      if (feudalSection) feudalSection.style.display = active ? 'none' : '';
      if (religiousSection) religiousSection.style.display = active ? 'none' : '';
      if (canonicalOwnedSection) canonicalOwnedSection.style.display = active ? 'none' : '';
      if (canonicalParentSection) canonicalParentSection.style.display = active ? 'none' : '';
      if (tradeRoutesSection) tradeRoutesSection.style.display = active ? 'block' : 'none';
    }

    function renderGenericEntityInfo(entity) {
      const infoPanel = getElement('infoPanel', 'infoPanel');
      if (!entity || !infoPanel) return;
      const baronyTitle = getElement('baronyTitle', 'baronyTitle');
      const infoOwnerLine = getElement('infoOwnerLine', 'infoOwnerLine');
      const infoReligionLine = getElement('infoReligionLine', 'infoReligionLine');
      const infoCultureLine = getElement('infoCultureLine', 'infoCultureLine');
      const feudalSection = getElement('feudalSection', 'feudalSection');
      const religiousSection = getElement('religiousSection', 'religiousBuildingsSection');
      const canonicalOwnedSection = getElement('canonicalOwnedSection', 'canonicalOwnedSection');
      const canonicalParentSection = getElement('canonicalParentSection', 'canonicalParentSection');
      const titleSubtitlesSection = getElement('titleSubtitlesSection', 'titleSubtitlesSection');
      const titleSubtitlesList = getElement('titleSubtitlesList', 'titleSubtitlesList');
      const titleSubtitlesHeading = titleSubtitlesSection?.querySelector('h3') || null;

      actions.clearSelectedTitle?.();
      hideSeigneurInfo();
      hideTradeRoutePanel();
      const seaInfoPanel = getElement('seaInfoPanel', 'seaInfoPanel');
      if (seaInfoPanel) seaInfoPanel.style.display = 'none';
      actions.restoreDefaultTitlePanelLayout?.();
      infoPanel.style.display = 'block';
      if (baronyTitle) baronyTitle.textContent = entity.name || entity.label || `${entity._type || 'Entite'} #${entity.id || ''}`;
      setLine(infoOwnerLine, '');
      setLine(infoReligionLine, '');
      setLine(infoCultureLine, '');
      if (feudalSection) feudalSection.style.display = 'none';
      if (religiousSection) religiousSection.style.display = 'none';
      if (canonicalOwnedSection) canonicalOwnedSection.style.display = 'none';
      if (canonicalParentSection) canonicalParentSection.style.display = 'none';
      const baronyIds = (actions.getBaronyIdsForEntity?.(entity, entity._selectionMode || 'dejure') || []).map(id => ({ id }));
      setBaronyList(titleSubtitlesSection, titleSubtitlesList, baronyIds);
      if (titleSubtitlesHeading) titleSubtitlesHeading.textContent = 'Baronnies:';
    }

    function renderSelectedEntity(entity, options = {}) {
      const infoPanel = getElement('infoPanel', 'infoPanel');
      const seaInfoPanel = getElement('seaInfoPanel', 'seaInfoPanel');
      if (!entity) {
        if (infoPanel) infoPanel.style.display = 'none';
        if (seaInfoPanel) seaInfoPanel.style.display = 'none';
        hideSeigneurInfo();
        hideTradeRoutePanel();
        return;
      }
      const { titleHierarchy = [], baronyMeta = {} } = state();
      if (entity._type === 'seigneur') {
        showSeigneurInfo(entity.id);
        return;
      }
      if (titleHierarchy.includes(entity._type)) {
        actions.showTitleInfo?.(entity._type, entity.id, options.mode || entity._selectionMode || 'dejure', {
          forceFilterMode: options.mode || entity._selectionMode || 'dejure'
        });
        return;
      }
      if (entity._type === 'seaZone' || entity._type === 'barony' || baronyMeta[entity.id]) {
        actions.handleSelect?.(entity.id);
        return;
      }
      renderGenericEntityInfo(entity);
    }

    function showSeigneurInfo(seigneurId) {
      const {
        seigneurMap = {},
        religionMap = {},
        empireMap = {},
        kingdomMap = {},
        archduchyMap = {},
        duchyMap = {},
        marquisateMap = {},
        countyMap = {},
        viscountyMap = {},
        seigneurToEmpire = {},
        seigneurToKingdom = {},
        seigneurToArchduchy = {},
        seigneurToDuchy = {},
        seigneurToMarquisate = {},
        seigneurToCounty = {},
        seigneurToViscounty = {},
        baronyLookup = {}
      } = state();
      const seigneurInfoPanel = getElement('seigneurInfoPanel', 'seigneurInfoPanel');
      if (!seigneurInfoPanel) return;
      const seigneur = seigneurMap[seigneurId];
      if (!seigneur) return;
      const infoPanel = getElement('infoPanel', 'infoPanel');
      const seaInfoPanel = getElement('seaInfoPanel', 'seaInfoPanel');
      const seigneurInfoTitle = getElement('seigneurInfoTitle', 'seigneurInfoTitle');
      const seigneurInfoIdentity = getElement('seigneurInfoIdentity', 'seigneurInfoIdentity');
      const seigneurInfoReligion = getElement('seigneurInfoReligion', 'seigneurInfoReligion');
      const seigneurOverlordLine = getElement('seigneurOverlordLine', 'seigneurOverlordLine');
      const seigneurTitlesSection = getElement('seigneurTitlesSection', 'seigneurTitlesSection');
      const seigneurTitlesList = getElement('seigneurTitlesList', 'seigneurTitlesList');
      const seigneurVassalsSection = getElement('seigneurVassalsSection', 'seigneurVassalsSection');
      const seigneurVassalList = getElement('seigneurVassalList', 'seigneurVassalList');

      actions.clearSelectedTitle?.();
      if (infoPanel) infoPanel.style.display = 'none';
      if (seaInfoPanel) seaInfoPanel.style.display = 'none';
      hideTradeRoutePanel();
      seigneurInfoPanel.style.display = 'block';
      if (seigneurInfoTitle) seigneurInfoTitle.textContent = seigneur.name;
      if (seigneurInfoIdentity) setLine(seigneurInfoIdentity, '');
      const religionName = seigneur.religion_id ? (religionMap[seigneur.religion_id]?.name || '') : '';
      setLabeledLine(seigneurInfoReligion, 'Religion:', religionName);
      setSeigneurLine(seigneurOverlordLine, seigneur.overlord_id, 'Suzerain:');

      const titles = [];
      (seigneurToEmpire[seigneurId] || []).forEach(id => { if (id && empireMap[id]) titles.push({ rankKey: 'empire', id, mode: 'dejure' }); });
      (seigneurToKingdom[seigneurId] || []).forEach(id => { if (id && kingdomMap[id]) titles.push({ rankKey: 'kingdom', id, mode: 'dejure' }); });
      (seigneurToArchduchy[seigneurId] || []).forEach(id => { if (id && archduchyMap[id]) titles.push({ rankKey: 'archduchy', id, mode: 'dejure' }); });
      (seigneurToDuchy[seigneurId] || []).forEach(id => { if (id && duchyMap[id]) titles.push({ rankKey: 'duchy', id, mode: 'dejure' }); });
      (seigneurToMarquisate[seigneurId] || []).forEach(id => { if (id && marquisateMap[id]) titles.push({ rankKey: 'marquisate', id, mode: 'dejure' }); });
      (seigneurToCounty[seigneurId] || []).forEach(id => { if (id && countyMap[id]) titles.push({ rankKey: 'county', id, mode: 'dejure' }); });
      (seigneurToViscounty[seigneurId] || []).forEach(id => { if (id && viscountyMap[id]) titles.push({ rankKey: 'viscounty', id, mode: 'dejure' }); });
      const ownedBaronies = Object.values(baronyLookup)
        .filter(b => b.seigneur_id === seigneurId)
        .map(b => ({ id: b.id, name: b.name }));
      setTitleList(seigneurTitlesSection, seigneurTitlesList, titles, ownedBaronies);

      const vassals = Object.values(seigneurMap)
        .filter(s => s.overlord_id === seigneurId)
        .map(s => s.id);
      setSeigneurList(seigneurVassalsSection, seigneurVassalList, vassals);
    }

    return {
      createBaronyButton,
      createBaronyLabel,
      createSeigneurButton,
      createTitleButton,
      hideSeigneurInfo,
      hideTradeRoutePanel,
      renderGenericEntityInfo,
      renderSelectedEntity,
      setBaronyList,
      setLabeledLine,
      setLine,
      setList,
      setSeigneurLine,
      setSeigneurList,
      setTitleList,
      setTradeRouteInfoMode,
      showBaronyDetails,
      showSeigneurInfo
    };
  }

  global.mapInfoPanel2 = { init };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.mapInfoPanel2;
})(typeof window !== 'undefined' ? window : globalThis);
