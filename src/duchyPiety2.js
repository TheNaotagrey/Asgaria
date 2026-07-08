(function (global) {
  const TITLE_BONUS_CONFIG = {
    barony: 0.5,
    viscounty: 0.75,
    county: 1,
    marquisate: 1.25,
    duchy: 1.5,
    archduchy: 2,
    kingdom: 3,
    empire: 4
  };

  const TIE_BREAKERS = [
    { key: 'banquet', label: "Gagnant de l'Enchère au Banquet" },
    { key: 'cathedral', label: 'Nombre de cathédrales' },
    { key: 'church', label: "Nombre d'églises" },
    { key: 'priory', label: 'Nombre de prieurés' },
    { key: 'pop', label: 'Nombre de populations' }
  ];

  function createBaseStat(duchyId, religionId) {
    return {
      duchyId,
      religionId,
      points: 0,
      details: {
        pop: 0,
        priory: 0,
        church: 0,
        cathedral: 0,
        bishopric: 0,
        sanctuaryActive: 0,
        sanctuaryInactive: 0,
        banquet: 0,
        titleCounts: {},
        tieBreak: null
      }
    };
  }

  function compareByNameThenId(a, b, religionMap) {
    const aName = religionMap?.[a.religionId]?.name || '';
    const bName = religionMap?.[b.religionId]?.name || '';
    const cmp = aName.localeCompare(bName, 'fr');
    if (cmp !== 0) return cmp;
    return String(a.religionId).localeCompare(String(b.religionId), 'fr');
  }

  function applyTieBreakBonuses(statsByDuchy, religionMap) {
    Object.values(statsByDuchy).forEach(duchyStats => {
      const entries = Object.values(duchyStats || {});
      if (entries.length < 2) return;

      const maxPoints = Math.max(...entries.map(stat => stat.points));
      const tied = entries.filter(stat => Math.abs(stat.points - maxPoints) < 1e-9);
      if (tied.length < 2) return;

      let contenders = tied;
      let resolved = null;
      let reason = null;

      TIE_BREAKERS.some(criteria => {
        const maxCriterion = Math.max(...contenders.map(stat => stat.details[criteria.key] || 0));
        const best = contenders.filter(stat => (stat.details[criteria.key] || 0) === maxCriterion);
        if (best.length === 1) {
          resolved = best[0];
          reason = criteria;
          return true;
        }
        contenders = best;
        return false;
      });

      if (!resolved || !reason) return;
      resolved.points += 0.05;
      resolved.details.tieBreak = {
        key: reason.key,
        label: reason.label,
        bonus: 0.05
      };
    });
  }

  function computeDuchyPietyStats(data, options = {}) {
    const {
      getDuchyIdForBarony,
      getSeigneurRankKey,
      isExcludedReligion,
      includeTieBreakBonus = false
    } = options;

    if (typeof getDuchyIdForBarony !== 'function' || typeof getSeigneurRankKey !== 'function') {
      return {};
    }

    const stats = {};
    const excluded = typeof isExcludedReligion === 'function' ? isExcludedReligion : () => false;

    const getStat = (duchyId, religionId) => {
      if (!duchyId || !religionId || excluded(religionId)) return null;
      const dKey = String(duchyId);
      const rKey = String(religionId);
      if (!stats[dKey]) stats[dKey] = {};
      if (!stats[dKey][rKey]) stats[dKey][rKey] = createBaseStat(duchyId, religionId);
      return stats[dKey][rKey];
    };

    const addPoints = (duchyId, religionId, points, detailKey) => {
      const stat = getStat(duchyId, religionId);
      if (!stat || !points) return;
      stat.points += points;
      if (detailKey && stat.details[detailKey] !== undefined) stat.details[detailKey] += 1;
    };

    Object.values(data.baronyMeta || {}).forEach(info => {
      const duchyId = getDuchyIdForBarony(info);
      if (!duchyId) return;

      addPoints(duchyId, info.religion_pop_id, 1, 'pop');
      addPoints(duchyId, info.priory_religion_id, 1, 'priory');
      addPoints(duchyId, info.church_religion_id, 3, 'church');
      addPoints(duchyId, info.cathedral_religion_id, 5, 'cathedral');

      const sancts = data.sanctuaryMap?.[info.id] || [];
      sancts.forEach(s => {
        const isActive = info.religion_pop_id && String(info.religion_pop_id) === String(s.religion_id);
        addPoints(duchyId, s.religion_id, isActive ? 3 : 0.1, isActive ? 'sanctuaryActive' : 'sanctuaryInactive');
      });

      if (!info.seigneur_id) return;
      const owner = data.seigneurMap?.[info.seigneur_id];
      const ownerReligionId = owner?.religion_id;
      if (excluded(ownerReligionId)) return;

      if (owner?.bishop) addPoints(duchyId, ownerReligionId, 8, 'bishopric');

      const isVacant = !!(info && (info.vacant === 1 || info.vacant === '1' || info.vacant === true));
      if (isVacant) return;

      const rankKey = getSeigneurRankKey(info.seigneur_id);
      const rankPoints = TITLE_BONUS_CONFIG[rankKey] || 0;
      if (rankPoints) {
        addPoints(duchyId, ownerReligionId, rankPoints);
        const stat = getStat(duchyId, ownerReligionId);
        if (stat) stat.details.titleCounts[rankKey] = (stat.details.titleCounts[rankKey] || 0) + 1;
      }
    });

    Object.values(data.duchyMap || {}).forEach(duchy => {
      if (!duchy?.id || !duchy.banquet_religion_id) return;
      addPoints(duchy.id, duchy.banquet_religion_id, 8, 'banquet');
    });

    if (includeTieBreakBonus) {
      applyTieBreakBonuses(stats, data.religionMap || {});
    }

    return stats;
  }

  function buildDuchyPietyWinnersFromStats(statsByDuchy, religionMap) {
    const winners = {};
    Object.entries(statsByDuchy || {}).forEach(([duchyId, scoreMap]) => {
      const ranked = Object.values(scoreMap || {}).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return compareByNameThenId(a, b, religionMap);
      });
      if (ranked.length > 0) winners[duchyId] = parseInt(ranked[0].religionId, 10);
    });
    return winners;
  }

  global.duchyPiety = {
    TITLE_BONUS_CONFIG,
    computeDuchyPietyStats,
    buildDuchyPietyWinnersFromStats
  };
})(typeof window !== 'undefined' ? window : global);
