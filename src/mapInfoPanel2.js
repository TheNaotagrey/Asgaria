(function (global) {
  function init(options = {}) {
    const {
      vm,
      infoPanel,
      seaInfoPanel,
      seigneurInfoPanel,
      tradeRoutePanel,
      baronyTitle,
      infoOwnerLine,
      infoReligionLine,
      infoCultureLine,
      seigneurInfoTitle,
      seigneurInfoIdentity,
      seigneurInfoReligion
    } = options;

    function hideAll() {
      [infoPanel, seaInfoPanel, seigneurInfoPanel, tradeRoutePanel].forEach((p) => {
        if (p) p.style.display = 'none';
      });
    }

    function renderSelection(payload) {
      if (!payload) return;
      if (payload.type === 'barony') {
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
      if (payload.type === 'duchy') {
        const duchy = vm.getEntity('duchy', payload.id);
        if (!duchy) return;
        hideAll();
        if (infoPanel) infoPanel.style.display = 'block';
        if (baronyTitle) baronyTitle.textContent = `Duché: ${duchy.name || ''} (#${duchy.id})`;
        if (infoOwnerLine) infoOwnerLine.textContent = `Seigneur: ${duchy.seigneur?.name || 'Aucun'}`;
        if (infoReligionLine) infoReligionLine.textContent = '';
        if (infoCultureLine) infoCultureLine.textContent = '';
      }
    }

    return { renderSelection };
  }

  global.mapInfoPanel2 = { init };
})(typeof window !== 'undefined' ? window : globalThis);
