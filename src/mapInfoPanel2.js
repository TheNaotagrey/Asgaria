(function (global) {
  function init(options = {}) {
    const {
      vm,
      mapMode = 'land',
      infoPanel,
      seaInfoPanel,
      seigneurInfoPanel,
      tradeRoutePanel,
      baronyTitle,
      infoOwnerLine,
      infoReligionLine,
      infoCultureLine,
      seaInfoId,
      seaInfoName,
      seaInfoSeigneur,
      seigneurInfoTitle,
      seigneurInfoIdentity,
      seigneurInfoReligion
    } = options;

    function hideAll() {
      [infoPanel, seaInfoPanel, seigneurInfoPanel, tradeRoutePanel].forEach((p) => { if (p) p.style.display = 'none'; });
    }

    function renderSelection(payload) {
      if (!payload) return;
      if (payload.type === 'barony') {
        if (mapMode === 'sea') {
          hideAll();
          if (seaInfoPanel) seaInfoPanel.style.display = 'block';
          if (seaInfoId) seaInfoId.textContent = String(payload.id);
          if (seaInfoName) seaInfoName.textContent = `Zone #${payload.id}`;
          if (seaInfoSeigneur) seaInfoSeigneur.textContent = '';
          return;
        }
        const barony = vm.getEntity('barony', payload.id);
        if (!barony) return;
        hideAll();
        if (infoPanel) infoPanel.style.display = 'block';
        if (baronyTitle) baronyTitle.textContent = `Baronnie: ${barony.name || ''} (#${barony.id})`;
        if (infoOwnerLine) infoOwnerLine.textContent = `Propriétaire: ${barony.seigneur?.name || 'Aucun'}`;
        if (infoReligionLine) infoReligionLine.textContent = `Religion de la population: ${barony.religion?.name || 'Aucune'}`;
        if (infoCultureLine) infoCultureLine.textContent = `Culture: ${barony.culture?.name || 'Aucune'}`;
        return;
      }
      if (payload.type === 'seigneur') {
        const seigneur = vm.getEntity('seigneur', payload.id);
        if (!seigneur) return;
        hideAll();
        if (seigneurInfoPanel) seigneurInfoPanel.style.display = 'block';
        if (seigneurInfoTitle) seigneurInfoTitle.textContent = seigneur.name || `Seigneur #${seigneur.id}`;
        if (seigneurInfoIdentity) seigneurInfoIdentity.textContent = `ID: ${seigneur.id}`;
        if (seigneurInfoReligion) seigneurInfoReligion.textContent = `Religion: ${seigneur.religion?.name || 'Aucune'}`;
        return;
      }
      if (['viscounty', 'county', 'marquisate', 'duchy', 'archduchy', 'kingdom', 'empire'].includes(payload.type)) {
        const title = vm.getEntity(payload.type, payload.id);
        if (!title) return;
        hideAll();
        if (infoPanel) infoPanel.style.display = 'block';
        if (baronyTitle) baronyTitle.textContent = `${payload.type}: ${title.name || ''} (#${title.id})`;
        if (infoOwnerLine) infoOwnerLine.textContent = `Seigneur: ${title.seigneur?.name || 'Aucun'}`;
        if (infoReligionLine) infoReligionLine.textContent = '';
        if (infoCultureLine) infoCultureLine.textContent = '';
      }
    }

    return { renderSelection };
  }

  global.mapInfoPanel2 = { init };
})(typeof window !== 'undefined' ? window : globalThis);
