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
        onNavigate: (type, id) => {
          if (type === 'barony') {
            core.selectBarony(id);
            return;
          }
          core.selectEntity(type, id);
        },
        infoPanel: document.getElementById('infoPanel'),
        seaInfoPanel: document.getElementById('seaInfoPanel'),
        seigneurInfoPanel: document.getElementById('seigneurInfoPanel'),
        tradeRoutePanel: document.getElementById('tradeRoutePanel'),
        baronyTitle: document.getElementById('baronyTitle'),
        infoOwnerLine: document.getElementById('infoOwnerLine'),
        infoReligionLine: document.getElementById('infoReligionLine'),
        infoCultureLine: document.getElementById('infoCultureLine'),
        tradeRoutesSection: document.getElementById('tradeRoutesSection'),
        tradeRoutesList: document.getElementById('tradeRoutesList'),
        tradeLinesList: document.getElementById('tradeLinesList'),
        infoFeudalBody: document.getElementById('infoFeudalBody'),
        infoDuchyPietyBody: document.getElementById('infoDuchyPietyBody'),
        infoReligiousList: document.getElementById('infoReligiousList'),
        canonicalOwnedList: document.getElementById('canonicalOwnedList'),
        canonicalParentList: document.getElementById('canonicalParentList'),
        titleSubtitlesList: document.getElementById('titleSubtitlesList'),
        seigneurInfoTitle: document.getElementById('seigneurInfoTitle'),
        seigneurInfoIdentity: document.getElementById('seigneurInfoIdentity'),
        seigneurInfoReligion: document.getElementById('seigneurInfoReligion'),
        seigneurOverlordLine: document.getElementById('seigneurOverlordLine'),
        seigneurTitlesList: document.getElementById('seigneurTitlesList'),
        seigneurVassalList: document.getElementById('seigneurVassalList'),
        seaInfoId: document.getElementById('seaInfoId'),
        seaInfoName: document.getElementById('seaInfoName'),
        seaInfoSeigneur: document.getElementById('seaInfoSeigneur')
      });
    });
  });
})();
