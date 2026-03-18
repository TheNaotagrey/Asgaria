(function (global) {
  function init(options = {}) {
    const {
      vm,
      mapMode = 'land',
      onNavigate = () => {},
      infoPanel,
      seaInfoPanel,
      seigneurInfoPanel,
      tradeRoutePanel,
      baronyTitle,
      infoOwnerLine,
      infoReligionLine,
      infoCultureLine,
      tradeRoutesSection,
      tradeRoutesList,
      tradeLinesList,
      infoFeudalBody,
      infoDuchyPietyBody,
      infoReligiousList,
      canonicalOwnedList,
      canonicalParentList,
      titleSubtitlesList,
      seigneurOverlordLine,
      seigneurTitlesList,
      seigneurVassalList,
      seaInfoId,
      seaInfoName,
      seaInfoSeigneur,
      seigneurInfoTitle,
      seigneurInfoIdentity,
      seigneurInfoReligion
    } = options;

    const TITLE_TYPES = ['viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'];
    const TITLE_LABELS = {
      viscounty: 'Vicomté',
      county: 'Comté',
      marquisate: 'Marquisat',
      duchy: 'Duché',
      archduchy: 'Archiduché',
      kingdom: 'Royaume',
      empire: 'Empire'
    };
    const TITLE_PREFIXES = {
      viscounty: 'Vicomte de',
      county: 'Comte de',
      marquisate: 'Marquis de',
      duchy: 'Duc de',
      archduchy: 'Archiduc de',
      kingdom: 'Roi de',
      empire: 'Empereur de'
    };

    const feudalSection = infoFeudalBody?.closest('section') || null;
    const religiousSection = infoReligiousList?.closest('section') || null;
    const canonicalOwnedSection = canonicalOwnedList?.closest('section') || null;
    const canonicalParentSection = canonicalParentList?.closest('section') || null;
    const titleSubtitlesSection = titleSubtitlesList?.closest('section') || null;
    const seigneurTitlesSection = seigneurTitlesList?.closest('section') || null;
    const seigneurVassalsSection = seigneurVassalList?.closest('section') || null;

    let tradePromise = null;
    let tradeMaps = { routesByBarony: {}, linesByBarony: {} };

    function hideAllPanels() {
      [infoPanel, seaInfoPanel, seigneurInfoPanel, tradeRoutePanel].forEach((panel) => {
        if (panel) panel.style.display = 'none';
      });
    }

    function setTextLine(elem, text) {
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
        const valueSpan = document.createElement('span');
        valueSpan.textContent = value;
        elem.appendChild(valueSpan);
      } else {
        elem.style.display = 'none';
      }
    }

    function createSeigneurButton(seigneurId) {
      const seigneur = vm.getEntity('seigneur', seigneurId);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seigneur-link';
      btn.textContent = seigneur?.name || `Seigneur #${seigneurId}`;
      btn.addEventListener('click', () => onNavigate('seigneur', String(seigneurId)));
      return btn;
    }

    function createBaronyButton(baronyId) {
      const barony = vm.getEntity('barony', baronyId);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'barony-link';
      const label = barony?.name || `Baronnie #${baronyId}`;
      btn.textContent = `${label} (#${baronyId})`;
      btn.addEventListener('click', () => onNavigate('barony', String(baronyId)));
      return btn;
    }

    function createTitleButton(rankKey, titleId) {
      const title = vm.getEntity(rankKey, titleId);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'barony-link';
      btn.textContent = title?.name || `${TITLE_LABELS[rankKey] || 'Titre'} #${titleId}`;
      btn.addEventListener('click', () => onNavigate(rankKey, String(titleId)));
      return btn;
    }

    function createFeudalLevelCell(label) {
      const cell = document.createElement('td');
      cell.style.padding = '4px 6px';
      const strong = document.createElement('strong');
      strong.style.margin = '0';
      strong.textContent = label;
      cell.appendChild(strong);
      return cell;
    }

    function createFeudalTitleCell(rankKey, title) {
      const cell = document.createElement('td');
      cell.style.padding = '4px 6px';
      if (title?.id) {
        const btn = createTitleButton(rankKey, title.id);
        btn.style.margin = '0';
        cell.appendChild(btn);
      }
      return cell;
    }

    function setSeigneurLine(elem, seigneurId, label, suffixText) {
      if (!elem) return;
      elem.innerHTML = '';
      const seigneur = vm.getEntity('seigneur', seigneurId);
      if (seigneur) {
        elem.style.display = 'flex';
        if (label) {
          const labelSpan = document.createElement('span');
          labelSpan.className = 'info-label';
          labelSpan.textContent = label;
          elem.appendChild(labelSpan);
          elem.appendChild(document.createTextNode(' '));
        }
        elem.appendChild(createSeigneurButton(seigneur.id));
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

    function setList(section, list, items) {
      if (!section || !list) return;
      list.innerHTML = '';
      if (items && items.length > 0) {
        section.style.display = 'block';
        items.forEach((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          list.appendChild(li);
        });
      } else {
        section.style.display = 'none';
      }
    }

    function setBaronyList(section, list, baronies) {
      if (!section || !list) return;
      list.innerHTML = '';
      if (baronies && baronies.length > 0) {
        section.style.display = 'block';
        baronies.forEach((barony) => {
          const baronyId = barony?.id;
          if (!baronyId) return;
          const li = document.createElement('li');
          li.appendChild(createBaronyButton(baronyId));
          list.appendChild(li);
        });
      } else {
        section.style.display = 'none';
      }
    }

    function setSeigneurList(section, list, seigneurs) {
      if (!section || !list) return;
      list.innerHTML = '';
      if (seigneurs && seigneurs.length > 0) {
        section.style.display = 'block';
        seigneurs.forEach((seigneur) => {
          const sid = seigneur?.id;
          if (!sid) return;
          const li = document.createElement('li');
          li.appendChild(createSeigneurButton(sid));
          list.appendChild(li);
        });
      } else {
        section.style.display = 'none';
      }
    }

    function setTitleList(section, list, titles = [], baronies = []) {
      if (!section || !list) return;
      list.innerHTML = '';
      const hasItems = titles.length || baronies.length;
      if (!hasItems) {
        section.style.display = 'none';
        return;
      }
      section.style.display = 'block';
      titles.forEach((title) => {
        if (!title?.id || !title?.rankKey) return;
        const li = document.createElement('li');
        const prefix = TITLE_PREFIXES[title.rankKey];
        if (prefix) li.appendChild(document.createTextNode(`${prefix} `));
        li.appendChild(createTitleButton(title.rankKey, title.id));
        list.appendChild(li);
      });
      baronies.forEach((barony) => {
        if (!barony?.id) return;
        const li = document.createElement('li');
        li.appendChild(document.createTextNode('Baron de '));
        li.appendChild(createBaronyButton(barony.id));
        list.appendChild(li);
      });
    }

    function setTradeRouteInfoMode(active) {
      if (infoReligionLine) infoReligionLine.style.display = active ? 'none' : '';
      if (infoCultureLine) infoCultureLine.style.display = active ? 'none' : '';
      if (feudalSection) feudalSection.style.display = active ? 'none' : '';
      if (religiousSection) religiousSection.style.display = active ? 'none' : '';
      if (canonicalOwnedSection) canonicalOwnedSection.style.display = active ? 'none' : '';
      if (canonicalParentSection) canonicalParentSection.style.display = active ? 'none' : '';
      if (titleSubtitlesSection) titleSubtitlesSection.style.display = 'none';
      if (tradeRoutesSection) tradeRoutesSection.style.display = active ? 'block' : 'none';
    }

    function parsePath(raw) {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.map((v) => parseInt(v, 10)).filter(Number.isFinite);
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.map((v) => parseInt(v, 10)).filter(Number.isFinite);
        } catch (err) {
          const matches = raw.match(/-?\d+/g);
          return matches ? matches.map((v) => parseInt(v, 10)).filter(Number.isFinite) : [];
        }
      }
      return [];
    }

    function getTitleFilterInfo(filterValue) {
      if (!filterValue) return null;
      if (filterValue === 'duchy_piety_ranking') {
        return { rankKey: 'duchy', mode: 'dejure', infoMode: 'duchy_piety_ranking' };
      }
      const isDefacto = filterValue.endsWith('_defacto');
      const rankKey = isDefacto ? filterValue.replace('_defacto', '') : filterValue;
      if (!TITLE_TYPES.includes(rankKey)) return null;
      return { rankKey, mode: isDefacto ? 'defacto' : 'dejure' };
    }

    async function ensureTrades() {
      if (tradePromise) return tradePromise;
      tradePromise = Promise.all([
        fetch('/api/trade_routes').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/trade_lines').then((r) => (r.ok ? r.json() : []))
      ]).then(([routes, lines]) => {
        const routesByBarony = {};
        const linesByBarony = {};

        (routes || []).forEach((route) => {
          const id = parseInt(route.id, 10);
          const a = String(route.origin_barony_id || route.barony_id_1 || '');
          const b = String(route.destination_barony_id || route.barony_id_2 || '');
          if (!id || !a || !b) return;
          const path = parsePath(route.path);
          if (!routesByBarony[a]) routesByBarony[a] = [];
          if (!routesByBarony[b]) routesByBarony[b] = [];
          routesByBarony[a].push({ id, other: b, path });
          routesByBarony[b].push({ id, other: a, path });
        });

        (lines || []).forEach((line) => {
          const id = parseInt(line.id, 10);
          const a = String(line.origin_barony_id || line.barony_id_1 || '');
          const b = String(line.destination_barony_id || line.barony_id_2 || '');
          if (!id || !a || !b) return;
          const path = parsePath(line.path);
          if (!linesByBarony[a]) linesByBarony[a] = [];
          if (!linesByBarony[b]) linesByBarony[b] = [];
          linesByBarony[a].push({ id, other: b, path });
          linesByBarony[b].push({ id, other: a, path });
        });

        tradeMaps = { routesByBarony, linesByBarony };
      }).catch(() => {
        tradeMaps = { routesByBarony: {}, linesByBarony: {} };
      });
      return tradePromise;
    }

    function baronyLabel(baronyId) {
      const barony = vm.getEntity('barony', baronyId);
      return barony?.name ? `${barony.name} (#${barony.id})` : `Baronnie #${baronyId}`;
    }

    function pathTooltip(path) {
      const ids = (path || []).filter(Boolean);
      if (!ids.length) return 'Trajet direct.';
      return ids.map((id) => baronyLabel(id)).join(' → ');
    }

    function renderTradeTable(container, entries, buttonClass, emptyText) {
      if (!container) return;
      container.innerHTML = '';
      if (!entries.length) {
        container.textContent = emptyText;
        return;
      }
      const rows = entries.map((entry) => {
        const pathClass = buttonClass === 'trade-route-btn' ? 'trade-route-path' : 'trade-line-path';
        return `
          <tr>
            <td><button class="control-btn ${buttonClass}" data-other="${entry.other}" data-path="${entry.path.join(',')}">#${entry.id}</button></td>
            <td>${baronyLabel(entry.other)}</td>
            <td class="${pathClass}" title="${pathTooltip(entry.path)}">${entry.path.length}</td>
          </tr>
        `;
      }).join('');
      container.innerHTML = `<table class="admin-table trade-table"><tr><th>ID</th><th>Destination</th><th>Chemin</th></tr>${rows}</table>`;
      container.querySelectorAll(`.${buttonClass}`).forEach((btn) => {
        btn.addEventListener('click', () => onNavigate('barony', btn.dataset.other));
      });
    }

    function renderFeudalTableForBarony(barony) {
      if (!feudalSection || !infoFeudalBody) return;
      infoFeudalBody.innerHTML = '';
      const infoFeudalTable = infoFeudalBody.closest('table');
      if (infoFeudalTable) infoFeudalTable.classList.remove('hide-dejure-column');

      const rows = {
        viscounty: { rankKey: 'viscounty', level: 'Vicomté' },
        county: { rankKey: 'county', level: 'Comté' },
        marquisate: { rankKey: 'marquisate', level: 'Marquisat' },
        duchy: { rankKey: 'duchy', level: 'Duché' },
        archduchy: { rankKey: 'archduchy', level: 'Archiduché' },
        kingdom: { rankKey: 'kingdom', level: 'Royaume' },
        empire: { rankKey: 'empire', level: 'Empire' }
      };

      Object.values(rows).forEach((row) => {
        row.dejure = vm.getBaronyTitleId(barony.id, row.rankKey, 'dejure');
        row.defacto = vm.getBaronyTitleId(barony.id, row.rankKey, 'defacto');
      });

      const order = ['kingdom', 'empire', 'archduchy', 'duchy', 'marquisate', 'county', 'viscounty'];
      const filteredRows = order.map((key) => rows[key]).filter((row) => row.dejure || row.defacto);
      const hasDejureData = filteredRows.some((row) => row.dejure);
      if (infoFeudalTable) infoFeudalTable.classList.toggle('hide-dejure-column', !hasDejureData);

      if (!filteredRows.length) {
        feudalSection.style.display = 'none';
        return;
      }

      feudalSection.style.display = 'block';
      filteredRows.forEach((row) => {
        const tr = document.createElement('tr');
        const levelCell = createFeudalLevelCell(row.level);
        const deJureCell = createFeudalTitleCell(row.rankKey, row.dejure);
        const deFactoCell = createFeudalTitleCell(row.rankKey, row.defacto);

        tr.appendChild(levelCell);
        tr.appendChild(deJureCell);
        tr.appendChild(deFactoCell);
        infoFeudalBody.appendChild(tr);
      });

      if (infoDuchyPietyBody) {
        infoDuchyPietyBody.innerHTML = '';
        const table = infoDuchyPietyBody.closest('table');
        if (table) table.style.display = 'none';
      }
    }

    function renderTitleHierarchy(rankKey, titleId, mode) {
      if (!feudalSection || !infoFeudalBody) return;
      infoFeudalBody.innerHTML = '';
      const infoFeudalTable = infoFeudalBody.closest('table');
      if (infoFeudalTable) infoFeudalTable.classList.remove('hide-dejure-column');

      const baronies = vm.getBaroniesForTitle(rankKey, titleId, mode);
      const sampleBarony = baronies[0] || null;
      if (!sampleBarony) {
        feudalSection.style.display = 'none';
        return;
      }

      const currentIndex = TITLE_TYPES.indexOf(rankKey);
      const rows = [];
      for (let i = currentIndex + 1; i < TITLE_TYPES.length; i += 1) {
        const parentRank = TITLE_TYPES[i];
        const dejure = vm.getBaronyTitleId(sampleBarony.id, parentRank, 'dejure');
        const defacto = vm.getBaronyTitleId(sampleBarony.id, parentRank, 'defacto');
        if (!dejure && !defacto) continue;
        rows.push({ rankKey: parentRank, dejure, defacto });
      }

      if (!rows.length) {
        feudalSection.style.display = 'none';
        return;
      }

      const hasDejureData = rows.some((row) => row.dejure);
      if (infoFeudalTable) infoFeudalTable.classList.toggle('hide-dejure-column', !hasDejureData);

      feudalSection.style.display = 'block';
      rows.reverse().forEach((row) => {
        const tr = document.createElement('tr');
        const rankCell = createFeudalLevelCell(TITLE_LABELS[row.rankKey]);
        const dejureCell = createFeudalTitleCell(row.rankKey, row.dejure);
        const defactoCell = createFeudalTitleCell(row.rankKey, row.defacto);

        tr.appendChild(rankCell);
        tr.appendChild(dejureCell);
        tr.appendChild(defactoCell);
        infoFeudalBody.appendChild(tr);
      });
    }

    function renderBarony(barony, payload) {
      const vacantLabel = barony.vacant ? ' (vacante)' : '';
      if (baronyTitle) baronyTitle.textContent = `Baronnie: ${barony.name || ''}${vacantLabel} (#${barony.id || ''})`;
      setSeigneurLine(infoOwnerLine, barony.seigneur?.id, 'Propriétaire:');

      const tradeMode = payload.filter === 'trade_routes';
      setTradeRouteInfoMode(tradeMode);
      if (tradeMode) {
        ensureTrades().then(() => {
          renderTradeTable(tradeRoutesList, tradeMaps.routesByBarony[String(barony.id)] || [], 'trade-route-btn', 'Aucune route commerciale');
          renderTradeTable(tradeLinesList, tradeMaps.linesByBarony[String(barony.id)] || [], 'trade-line-btn', 'Aucune ligne commerciale');
        });
        return;
      }

      setLabeledLine(infoReligionLine, 'Religion de la population :', barony.religion?.name || '');
      setLabeledLine(infoCultureLine, 'Culture:', barony.culture?.name || '');

      renderFeudalTableForBarony(barony);

      const buildings = [];
      (barony.sanctuaries || []).forEach((sanctuary) => {
        const isActive = barony.religion?.id && String(barony.religion.id) === String(sanctuary.religion?.id);
        buildings.push(`Sanctuaire: ${sanctuary.religion?.name || ''} (${isActive ? 'actif' : 'inactif'})`);
      });
      if (barony.prioryReligion) buildings.push(`Prieuré: ${barony.prioryReligion.name || ''}`);
      if (barony.churchReligion) buildings.push(`Église: ${barony.churchReligion.name || ''}`);
      if (barony.cathedralReligion) buildings.push(`Cathédrale: ${barony.cathedralReligion.name || ''}`);
      setList(religiousSection, infoReligiousList, buildings);

      setBaronyList(canonicalOwnedSection, canonicalOwnedList, (barony.canonicalFor || []).map((item) => ({ id: item.id })));
      setBaronyList(canonicalParentSection, canonicalParentList, (barony.canonicalLands || []).map((item) => ({ id: item.id })));
      if (titleSubtitlesSection) titleSubtitlesSection.style.display = 'none';
    }

    function renderTitle(rankKey, title, payloadMode = 'dejure') {
      if (baronyTitle) baronyTitle.textContent = `${TITLE_LABELS[rankKey] || 'Titre'}: ${title.name || ''}`;
      setSeigneurLine(infoOwnerLine, title.seigneur?.id, 'Détenteur:');
      if (infoReligionLine) infoReligionLine.style.display = 'none';
      if (infoCultureLine) infoCultureLine.style.display = 'none';
      if (tradeRoutesSection) tradeRoutesSection.style.display = 'none';
      if (religiousSection) religiousSection.style.display = 'none';
      if (canonicalOwnedSection) canonicalOwnedSection.style.display = 'none';
      if (canonicalParentSection) canonicalParentSection.style.display = 'none';

      renderTitleHierarchy(rankKey, title.id, payloadMode);

      const subtitles = vm.getImmediateSubtitles(rankKey, title.id, payloadMode);
      const subtitleItems = subtitles.map((item) => ({ rankKey: item._type || item.rankKey, id: item.id }));
      setTitleList(titleSubtitlesSection, titleSubtitlesList, subtitleItems);
    }

    function renderSeigneur(seigneur) {
      if (seigneurInfoTitle) seigneurInfoTitle.textContent = seigneur.name || `Seigneur #${seigneur.id}`;
      setTextLine(seigneurInfoIdentity, '');
      setLabeledLine(seigneurInfoReligion, 'Religion:', seigneur.religion?.name || '');
      setSeigneurLine(seigneurOverlordLine, seigneur.overlord?.id, 'Suzerain:');

      const titles = TITLE_TYPES.flatMap((rankKey) => (seigneur.titles?.[rankKey] || []).map((title) => ({ rankKey, id: title.id })));
      const baronies = (seigneur.baronies || []).map((barony) => ({ id: barony.id }));
      setTitleList(seigneurTitlesSection, seigneurTitlesList, titles, baronies);
      setSeigneurList(seigneurVassalsSection, seigneurVassalList, seigneur.vassals || []);
    }

    function renderSelection(payload) {
      if (!payload) return;

      if (payload.type === 'barony') {
        if (mapMode === 'sea') {
          hideAllPanels();
          if (seaInfoPanel) seaInfoPanel.style.display = 'block';
          if (seaInfoId) seaInfoId.textContent = String(payload.id || '');
          if (seaInfoName) seaInfoName.textContent = `Zone #${payload.id || ''}`;
          if (seaInfoSeigneur) seaInfoSeigneur.textContent = '';
          return;
        }

        const barony = vm.getEntity('barony', payload.id);
        if (!barony) return;

        const titleFilter = getTitleFilterInfo(payload.filter || '');
        if (titleFilter?.rankKey) {
          const title = vm.getBaronyTitleId(barony.id, titleFilter.rankKey, titleFilter.mode);
          if (title) {
            hideAllPanels();
            if (infoPanel) infoPanel.style.display = 'block';
            renderTitle(titleFilter.rankKey, title, titleFilter.mode);
            return;
          }
        }

        hideAllPanels();
        if (infoPanel) infoPanel.style.display = 'block';
        renderBarony(barony, payload);
        return;
      }

      if (payload.type === 'seigneur') {
        const seigneur = vm.getEntity('seigneur', payload.id);
        if (!seigneur) return;
        hideAllPanels();
        if (seigneurInfoPanel) seigneurInfoPanel.style.display = 'block';
        renderSeigneur(seigneur);
        return;
      }

      if (TITLE_TYPES.includes(payload.type)) {
        const title = vm.getEntity(payload.type, payload.id);
        if (!title) return;
        const titleFilter = getTitleFilterInfo(payload.filter || '');
        const mode = titleFilter?.rankKey === payload.type ? titleFilter.mode : 'dejure';
        hideAllPanels();
        if (infoPanel) infoPanel.style.display = 'block';
        renderTitle(payload.type, title, mode);
      }
    }

    return { renderSelection };
  }

  global.mapInfoPanel2 = { init };
})(typeof window !== 'undefined' ? window : globalThis);
