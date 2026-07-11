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
      const seigneur = seigneurMap[seigneurId];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seigneur-link';
      btn.textContent = formatSeigneurName(seigneur) || `Seigneur #${seigneurId}`;
      btn.addEventListener('click', () => {
        actions.selectEntity?.(actions.getSeigneurEntity?.(seigneurId), { source: 'panel' });
      });
      return btn;
    }

    function formatSeigneurName(seigneur) {
      if (!seigneur?.name) return '';
      return `${seigneur.name}${seigneur.player ? '' : ' (PNJ)'}`;
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

    function restoreDefaultTitlePanelLayout() {
      const { defaultFeudalSectionTitle = 'Hiérarchie féodale', defaultFeudalHeaders = [] } = state();
      const feudalSection = getElement('feudalSection', 'feudalSection');
      const infoFeudalTable = getElement('infoFeudalTable', 'infoFeudalTable');
      const infoDuchyPietyTable = getElement('infoDuchyPietyTable', 'infoDuchyPietyTable');
      const infoDuchyPietyBody = getElement('infoDuchyPietyBody', 'infoDuchyPietyBody');
      if (!feudalSection || !infoFeudalTable || !infoDuchyPietyTable || !infoDuchyPietyBody) return;
      const heading = feudalSection.querySelector('h3');
      if (heading) heading.textContent = defaultFeudalSectionTitle;
      const headers = infoFeudalTable.querySelectorAll('thead th');
      defaultFeudalHeaders.forEach((label, index) => {
        if (headers[index]) headers[index].textContent = label;
      });
      infoDuchyPietyBody.innerHTML = '';
      infoDuchyPietyTable.style.display = 'none';
      infoFeudalTable.style.display = '';
      infoFeudalTable.classList.remove('hide-dejure-column');
    }

    function setTitleHierarchyTable(section, tbody, rankKey, titleInfo, mode) {
      const { titleTypeConfig = {} } = state();
      const infoFeudalTable = getElement('infoFeudalTable', 'infoFeudalTable');
      if (!section || !tbody) return;
      tbody.innerHTML = '';
      const result = actions.getTitleHierarchyRows?.(rankKey, titleInfo, mode) || {};
      const rows = result.rows || [];
      if (infoFeudalTable) {
        infoFeudalTable.classList.toggle('hide-dejure-column', !result.hasDejureData);
      }
      if (!rows.length) {
        section.style.display = 'none';
        return;
      }

      section.style.display = 'block';
      rows.forEach(row => {
        const tr = document.createElement('tr');
        const levelCell = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = titleTypeConfig[row.rankKey]?.label || 'Titre';
        levelCell.appendChild(strong);
        const dejureCell = document.createElement('td');
        if (row.dejureId) {
          dejureCell.appendChild(createTitleButton(row.rankKey, row.dejureId, { mode: 'dejure', forceFilterMode: 'dejure' }));
        }
        const defactoCell = document.createElement('td');
        if (row.defactoId) {
          defactoCell.appendChild(createTitleButton(row.rankKey, row.defactoId, { mode: 'defacto', forceFilterMode: 'defacto' }));
        }
        tr.appendChild(levelCell);
        tr.appendChild(dejureCell);
        tr.appendChild(defactoCell);
        tbody.appendChild(tr);
      });
    }

    function setFeudalTable(section, tbody, rows = []) {
      const infoFeudalTable = getElement('infoFeudalTable', 'infoFeudalTable');
      if (!section || !tbody) return;
      if (infoFeudalTable) infoFeudalTable.classList.remove('hide-dejure-column');
      tbody.innerHTML = '';
      const filteredRows = (rows || []).filter(row => row && (row.dejureId || row.defactoId));
      if (!filteredRows.length) {
        section.style.display = 'none';
        return;
      }

      section.style.display = 'block';
      filteredRows.forEach(row => {
        const tr = document.createElement('tr');
        const levelCell = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = row.level;
        levelCell.appendChild(strong);
        const dejureCell = document.createElement('td');
        if (row.dejureId) {
          dejureCell.appendChild(createTitleButton(row.rankKey, row.dejureId, { mode: 'dejure', forceFilterMode: 'dejure' }));
        }
        const defactoCell = document.createElement('td');
        if (row.defactoId) {
          defactoCell.appendChild(createTitleButton(row.rankKey, row.defactoId, { mode: 'defacto', forceFilterMode: 'defacto' }));
        }
        tr.appendChild(levelCell);
        tr.appendChild(dejureCell);
        tr.appendChild(defactoCell);
        tbody.appendChild(tr);
      });
    }

    function renderDuchyPietyRankingPanel(duchyId, duchyName) {
      const feudalSection = getElement('feudalSection', 'feudalSection');
      const infoFeudalTable = getElement('infoFeudalTable', 'infoFeudalTable');
      const infoDuchyPietyTable = getElement('infoDuchyPietyTable', 'infoDuchyPietyTable');
      const infoDuchyPietyBody = getElement('infoDuchyPietyBody', 'infoDuchyPietyBody');
      const baronyTitle = getElement('baronyTitle', 'baronyTitle');
      if (!feudalSection || !infoFeudalTable || !infoDuchyPietyTable || !infoDuchyPietyBody) return;
      const heading = feudalSection.querySelector('h3');
      if (heading) heading.textContent = 'Classement de piété ducal';
      feudalSection.style.display = 'block';
      infoFeudalTable.style.display = 'none';
      infoDuchyPietyTable.style.display = '';
      infoDuchyPietyBody.innerHTML = '';
      const rows = actions.getDuchyPietyRows?.(duchyId) || [];

      if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.textContent = 'Aucune donnée';
        tr.appendChild(td);
        infoDuchyPietyBody.appendChild(tr);
      } else {
        rows.forEach(stat => {
          const tr = document.createElement('tr');
          const religionCell = document.createElement('td');
          religionCell.textContent = stat.religionName;
          const pointsCell = document.createElement('td');
          const pointsSpan = document.createElement('span');
          pointsSpan.className = 'tooltip';
          pointsSpan.textContent = stat.pointsLabel;
          actions.attachFloatingTooltip?.(pointsSpan, stat.tooltipRows || []);
          pointsCell.appendChild(pointsSpan);
          tr.appendChild(religionCell);
          tr.appendChild(pointsCell);
          infoDuchyPietyBody.appendChild(tr);
        });
      }
      if (baronyTitle) baronyTitle.textContent = `Duché de ${duchyName || ''}`;
    }

    function showTitleInfo(rankKey, titleId, mode = 'dejure', options = {}) {
      const { forceFilterMode = null } = options;
      const titleInfo = actions.getTitleMap?.(rankKey)?.[titleId];
      const infoPanel = getElement('infoPanel', 'infoPanel');
      if (!titleInfo || !infoPanel) return;
      const { activeFilter = '', titleTypeConfig = {} } = state();
      const activeTitleFilter = actions.getTitleFilterInfo?.(activeFilter);
      const targetMode = actions.getTargetTitleMode?.(forceFilterMode) || mode;
      const keepDuchyPietyFilter =
        activeTitleFilter?.infoMode === 'duchy_piety_ranking' &&
        rankKey === 'duchy' &&
        (targetMode || mode) === 'dejure';
      const targetFilterValue = keepDuchyPietyFilter
        ? 'duchy_piety_ranking'
        : actions.getTitleFilterValue?.(rankKey, targetMode);

      actions.setSelectedTitle?.({ rankKey, id: titleId, mode: targetMode || mode });
      if (targetFilterValue && activeFilter !== targetFilterValue) {
        actions.setFilterValue?.(targetFilterValue);
      }

      hideSeigneurInfo();
      hideTradeRoutePanel();
      const seaInfoPanel = getElement('seaInfoPanel', 'seaInfoPanel');
      if (seaInfoPanel) seaInfoPanel.style.display = 'none';
      infoPanel.style.display = 'block';
      const rankLabel = titleTypeConfig[rankKey]?.label || 'Titre';
      restoreDefaultTitlePanelLayout();

      const baronyTitle = getElement('baronyTitle', 'baronyTitle');
      const infoOwnerLine = getElement('infoOwnerLine', 'infoOwnerLine');
      const infoReligionLine = getElement('infoReligionLine', 'infoReligionLine');
      const infoCultureLine = getElement('infoCultureLine', 'infoCultureLine');
      const tradeRoutesSection = getElement('tradeRoutesSection', 'tradeRoutesSection');
      const religiousSection = getElement('religiousSection', 'religiousBuildingsSection');
      const canonicalOwnedSection = getElement('canonicalOwnedSection', 'canonicalOwnedSection');
      const canonicalParentSection = getElement('canonicalParentSection', 'canonicalParentSection');
      const titleSubtitlesSection = getElement('titleSubtitlesSection', 'titleSubtitlesSection');
      const titleSubtitlesList = getElement('titleSubtitlesList', 'titleSubtitlesList');
      const titleSubtitlesHeading = titleSubtitlesSection?.querySelector('h3') || null;
      const feudalSection = getElement('feudalSection', 'feudalSection');
      const infoFeudalBody = getElement('infoFeudalBody', 'infoFeudalBody');

      if (baronyTitle) baronyTitle.textContent = `${rankLabel}: ${titleInfo.name || ''}`;
      setSeigneurLine(infoOwnerLine, titleInfo.seigneur_id, 'Détenteur:');
      if (infoReligionLine) infoReligionLine.style.display = 'none';
      if (infoCultureLine) infoCultureLine.style.display = 'none';
      if (tradeRoutesSection) tradeRoutesSection.style.display = 'none';
      if (religiousSection) religiousSection.style.display = 'none';
      if (canonicalOwnedSection) canonicalOwnedSection.style.display = 'none';
      if (canonicalParentSection) canonicalParentSection.style.display = 'none';

      const currentTitleFilter = actions.getTitleFilterInfo?.(state().activeFilter);
      const isDuchyPietyPanel = currentTitleFilter?.infoMode === 'duchy_piety_ranking' && rankKey === 'duchy' && (targetMode || mode) === 'dejure';
      if (isDuchyPietyPanel) {
        if (infoOwnerLine) infoOwnerLine.style.display = 'none';
        if (titleSubtitlesSection) titleSubtitlesSection.style.display = 'none';
        renderDuchyPietyRankingPanel(titleInfo.id, titleInfo.name || '');
        actions.syncTitleSelectionHighlight?.();
        return;
      }

      setTitleHierarchyTable(feudalSection, infoFeudalBody, rankKey, titleInfo, targetMode || mode);

      if (titleSubtitlesSection && titleSubtitlesList) {
        titleSubtitlesList.innerHTML = '';
        const subtitles = actions.getImmediateSubtitles?.(rankKey, titleId, targetMode || mode) || [];
        if (titleSubtitlesHeading) {
          titleSubtitlesHeading.textContent = actions.getSubtitleHeading?.(rankKey, targetMode || mode) || 'Sous-titres:';
        }
        if (subtitles.length > 0) {
          titleSubtitlesSection.style.display = 'block';
          subtitles.forEach(item => {
            const childRank = item?._type || item?.rankKey;
            const li = document.createElement('li');
            if (childRank === 'barony') {
              li.appendChild(createBaronyButton(item.id));
            } else {
              const childLabel = titleTypeConfig[childRank]?.label || 'Titre';
              li.appendChild(document.createTextNode(`${childLabel} de `));
              li.appendChild(createTitleButton(childRank, item.id, { mode: targetMode || mode }));
            }
            titleSubtitlesList.appendChild(li);
          });
        } else {
          titleSubtitlesSection.style.display = 'none';
        }
      }
      actions.syncTitleSelectionHighlight?.();
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
        showTitleInfo(entity._type, entity.id, options.mode || entity._selectionMode || 'dejure', {
          forceFilterMode: options.mode || entity._selectionMode || 'dejure'
        });
        return;
      }
      if (entity._type === 'seaZone' || entity._type === 'barony' || (!entity._type && baronyMeta[entity.id])) {
        actions.handleSelect?.(entity.id);
        return;
      }
      renderGenericEntityInfo(entity);
    }

    function handleSelect(id) {
      const {
        activeFilter = '',
        baronyMeta = {},
        cultureMapInfo = {},
        mapMode = 'land',
        religionMap = {},
        seigneurMap = {}
      } = state();
      const infoPanel = getElement('infoPanel', 'infoPanel');
      const seaInfoPanel = getElement('seaInfoPanel', 'seaInfoPanel');
      const seaInfoId = getElement('seaInfoId', 'seaInfoId');
      const seaInfoName = getElement('seaInfoName', 'seaInfoName');
      const seaInfoSeigneur = getElement('seaInfoSeigneur', 'seaInfoSeigneur');
      const baronyTitle = getElement('baronyTitle', 'baronyTitle');
      const infoOwnerLine = getElement('infoOwnerLine', 'infoOwnerLine');
      const infoReligionLine = getElement('infoReligionLine', 'infoReligionLine');
      const infoCultureLine = getElement('infoCultureLine', 'infoCultureLine');
      const feudalSection = getElement('feudalSection', 'feudalSection');
      const infoFeudalBody = getElement('infoFeudalBody', 'infoFeudalBody');
      const religiousSection = getElement('religiousSection', 'religiousBuildingsSection');
      const infoReligiousList = getElement('infoReligiousList', 'infoReligiousList');
      const canonicalOwnedSection = getElement('canonicalOwnedSection', 'canonicalOwnedSection');
      const canonicalOwnedList = getElement('canonicalOwnedList', 'canonicalOwnedList');
      const canonicalParentSection = getElement('canonicalParentSection', 'canonicalParentSection');
      const canonicalParentList = getElement('canonicalParentList', 'canonicalParentList');
      const titleSubtitlesSection = getElement('titleSubtitlesSection', 'titleSubtitlesSection');

      hideSeigneurInfo();
      if (!actions.shouldSuppressTradeRoutePanelHide?.()) {
        hideTradeRoutePanel();
      }
      if (mapMode === 'sea') {
        if (!id) {
          if (seaInfoPanel) seaInfoPanel.style.display = 'none';
          return;
        }
        const info = baronyMeta[id] || {};
        if (seaInfoPanel) seaInfoPanel.style.display = 'block';
        if (infoPanel) infoPanel.style.display = 'none';
        if (seaInfoId) seaInfoId.textContent = info.id || '';
        if (seaInfoName) seaInfoName.textContent = info.name || '';
        if (seaInfoSeigneur) {
          seaInfoSeigneur.innerHTML = '';
          if (info.seigneur_id && seigneurMap[info.seigneur_id]) {
            seaInfoSeigneur.appendChild(createSeigneurButton(info.seigneur_id));
          }
        }
        if (activeFilter === 'distance' || activeFilter === 'baronies') {
          actions.applyFilter?.(activeFilter);
        }
        return;
      }
      if (!id) {
        if (infoPanel) infoPanel.style.display = 'none';
        return;
      }
      const info = baronyMeta[id] || {};
      actions.clearSelectedTitle?.();
      actions.restoreDefaultTitlePanelLayout?.();
      if (infoPanel) infoPanel.style.display = 'block';
      if (seaInfoPanel) seaInfoPanel.style.display = 'none';
      if (baronyTitle) {
        const vacantLabel = info.vacant ? ' (vacante)' : '';
        baronyTitle.textContent = `Baronnie: ${info.name || ''}${vacantLabel} (#${info.id || ''})`;
      }
      setSeigneurLine(infoOwnerLine, info.seigneur_id, 'Propriétaire:');
      if (activeFilter === 'trade_routes') {
        actions.clearTradeSelections?.();
        setTradeRouteInfoMode(true);
        actions.renderTradeRoutesList?.(info.id);
        actions.renderTradeLinesList?.(info.id);
        actions.applyFilter?.('trade_routes');
        return;
      }
      setTradeRouteInfoMode(false);
      if (titleSubtitlesSection) titleSubtitlesSection.style.display = 'none';
      setLabeledLine(
        infoReligionLine,
        'Religion de la population :',
        info.religion_pop_id ? `${religionMap[info.religion_pop_id]?.name || ''}` : ''
      );
      setLabeledLine(
        infoCultureLine,
        'Culture:',
        info.culture_id ? `${cultureMapInfo[info.culture_id]?.name || ''}` : ''
      );
      setFeudalTable(feudalSection, infoFeudalBody, actions.getBaronyFeudalRows?.(info) || []);
      const buildings = [];
      (info.sanctuaries || []).forEach(sanctuary => {
        const religionId = sanctuary.religion_id || sanctuary.religion?.id;
        const rname = sanctuary.religion?.name || religionMap[religionId]?.name || '';
        const isActive = info.religion_pop_id && String(info.religion_pop_id) === String(religionId);
        buildings.push(`Sanctuaire: ${rname} (${isActive ? 'actif' : 'inactif'})`);
      });
      if (info.priory_religion_id) buildings.push(`Prieuré: ${religionMap[info.priory_religion_id]?.name || ''}`);
      if (info.church_religion_id) buildings.push(`Église: ${religionMap[info.church_religion_id]?.name || ''}`);
      if (info.cathedral_religion_id) buildings.push(`Cathédrale: ${religionMap[info.cathedral_religion_id]?.name || ''}`);
      setList(religiousSection, infoReligiousList, buildings);
      const ownedCanonicals = (info.canonicalFor || []).map(barony => ({ id: barony.id }));
      setBaronyList(canonicalOwnedSection, canonicalOwnedList, ownedCanonicals);
      const parentCanonicals = (info.canonicalLands || [])
        .filter(barony => String(barony.id) !== String(id))
        .map(barony => ({ id: barony.id }));
      setBaronyList(canonicalParentSection, canonicalParentList, parentCanonicals);
      if (activeFilter === 'distance') {
        actions.applyFilter?.('distance');
      }
    }

    function showSeigneurInfo(seigneurId) {
      const {
        seigneurMap = {},
        religionMap = {},
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
      if (seigneurInfoTitle) seigneurInfoTitle.textContent = formatSeigneurName(seigneur);
      if (seigneurInfoIdentity) setLine(seigneurInfoIdentity, '');
      const religionName = seigneur.religion_id ? (religionMap[seigneur.religion_id]?.name || '') : '';
      setLabeledLine(seigneurInfoReligion, 'Religion:', religionName);
      setSeigneurLine(seigneurOverlordLine, seigneur.overlord_id, 'Suzerain:');

      const titles = [];
      ['empire', 'kingdom', 'archduchy', 'duchy', 'marquisate', 'county', 'viscounty'].forEach(rankKey => {
        (seigneur.titles?.[rankKey] || []).forEach(title => {
          if (title?.id) titles.push({ rankKey, id: title.id, mode: 'defacto' });
        });
      });
      const ownedBaronies = Array.isArray(seigneur.titles?.barony)
        ? seigneur.titles.barony
        : Object.values(baronyLookup).filter(b => String(b.seigneur_id) === String(seigneurId));
      setTitleList(seigneurTitlesSection, seigneurTitlesList, titles, ownedBaronies);

      const vassals = (Array.isArray(seigneur.vassals) && seigneur.vassals.length > 0
        ? seigneur.vassals
        : Object.values(seigneurMap).filter(s => String(s.overlord_id) === String(seigneurId)))
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
      handleSelect,
      renderDuchyPietyRankingPanel,
      renderGenericEntityInfo,
      renderSelectedEntity,
      restoreDefaultTitlePanelLayout,
      setBaronyList,
      setLabeledLine,
      setLine,
      setList,
      setSeigneurLine,
      setSeigneurList,
      setTitleList,
      setFeudalTable,
      setTitleHierarchyTable,
      setTradeRouteInfoMode,
      showBaronyDetails,
      showTitleInfo,
      showSeigneurInfo
    };
  }

  global.mapInfoPanel = { init };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.mapInfoPanel;
})(typeof window !== 'undefined' ? window : globalThis);
