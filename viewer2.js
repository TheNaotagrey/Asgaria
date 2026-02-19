(() => {
  const params = new URLSearchParams(location.search);
  const mapMode = params.get('mode') === 'sea' ? 'sea' : 'land';

  document.addEventListener('DOMContentLoaded', () => {
    const baseMap = document.getElementById('baseMap');
    const canvas = document.getElementById('pixelCanvas');
    const filterSelect = document.getElementById('filterSelect');
    const legend = document.getElementById('legend');

    if (mapMode === 'sea' && baseMap) baseMap.src = 'zones_maritimes.png';

    let panel = null;

    const core = mapCore2.init({
      canvas,
      baseMap,
      filterSelect,
      legendEl: legend,
      mapMode,
      onSelectionChange: (selection) => panel?.renderSelection(selection)
    });

    core.ready.then(() => {
      panel = mapInfoPanel2.init({
        vm: core.getViewModel(),
        mapMode,
        infoPanel: document.getElementById('infoPanel'),
        seaInfoPanel: document.getElementById('seaInfoPanel'),
        seigneurInfoPanel: document.getElementById('seigneurInfoPanel'),
        tradeRoutePanel: document.getElementById('tradeRoutePanel'),
        baronyTitle: document.getElementById('baronyTitle'),
        infoOwnerLine: document.getElementById('infoOwnerLine'),
        infoReligionLine: document.getElementById('infoReligionLine'),
        infoCultureLine: document.getElementById('infoCultureLine'),
        seigneurInfoTitle: document.getElementById('seigneurInfoTitle'),
        seigneurInfoIdentity: document.getElementById('seigneurInfoIdentity'),
        seigneurInfoReligion: document.getElementById('seigneurInfoReligion'),
        seaInfoId: document.getElementById('seaInfoId'),
        seaInfoName: document.getElementById('seaInfoName'),
        seaInfoSeigneur: document.getElementById('seaInfoSeigneur')
      });
    });
  });
})();
