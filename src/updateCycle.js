const UPDATE_DEFINITIONS = [
  { number: 1, key: 'fevrier', label: 'Fevrier', unlockMonth: 2 },
  { number: 2, key: 'mars', label: 'Mars', unlockMonth: 3 },
  { number: 3, key: 'avril', label: 'Avril', unlockMonth: 4 },
  { number: 4, key: 'mai', label: 'Mai', unlockMonth: 5 },
  { number: 5, key: 'juin', label: 'Juin', unlockMonth: 6 },
  { number: 6, key: 'juillet', label: 'Juillet', unlockMonth: 7 },
  { number: 7, key: 'aout', label: 'Aout', unlockMonth: 8 },
  { number: 8, key: 'septembre', label: 'Septembre', unlockMonth: 9 },
  { number: 9, key: 'octobre', label: 'Octobre', unlockMonth: 10 },
  { number: 10, key: 'hiver', label: 'Hiver', unlockMonth: 10 }
];

function getCampaignYear(date = new Date()) {
  return date.getFullYear() - 1000;
}

function getDefinition(number) {
  return UPDATE_DEFINITIONS.find((entry) => entry.number === Number(number)) || UPDATE_DEFINITIONS[0];
}

function isValidUpdatePosition(position) {
  if (!position || !Number.isInteger(position.year)) return false;
  return UPDATE_DEFINITIONS.some((entry) => entry.number === Number(position.number));
}

function compareUpdatePositions(left, right) {
  if (left.year !== right.year) return left.year - right.year;
  return Number(left.number) - Number(right.number);
}

function getNextUpdatePosition(position) {
  const number = Number(position.number);
  if (number >= UPDATE_DEFINITIONS.length) {
    return { year: position.year + 1, number: 1 };
  }
  return { year: position.year, number: number + 1 };
}

function getUnlockDateForUpdate(position) {
  const definition = getDefinition(position.number);
  const realYear = position.year + 1000;
  return new Date(realYear, definition.unlockMonth - 1, 1, 0, 0, 0, 0);
}

function isUpdateUnlocked(position, now = new Date()) {
  return now.getTime() >= getUnlockDateForUpdate(position).getTime();
}

function getLatestUnlockedUpdate(now = new Date()) {
  const month = now.getMonth() + 1;
  const year = getCampaignYear(now);
  if (month === 1) return { year: year - 1, number: 10 };
  if (month === 2) return { year, number: 1 };
  if (month === 3) return { year, number: 2 };
  if (month === 4) return { year, number: 3 };
  if (month === 5) return { year, number: 4 };
  if (month === 6) return { year, number: 5 };
  if (month === 7) return { year, number: 6 };
  if (month === 8) return { year, number: 7 };
  if (month === 9) return { year, number: 8 };
  return { year, number: 10 };
}

function normalizeUpdatePosition(position, now = new Date()) {
  if (isValidUpdatePosition(position)) {
    return { year: position.year, number: Number(position.number) };
  }
  return getLatestUnlockedUpdate(now);
}

function formatUpdateLabel(position) {
  const definition = getDefinition(position.number);
  return `${definition.label} ${position.year}`;
}

function getUpdateKey(position) {
  return `${position.year}-${String(position.number).padStart(2, '0')}`;
}

module.exports = {
  UPDATE_DEFINITIONS,
  compareUpdatePositions,
  formatUpdateLabel,
  getCampaignYear,
  getDefinition,
  getLatestUnlockedUpdate,
  getNextUpdatePosition,
  getUnlockDateForUpdate,
  getUpdateKey,
  isUpdateUnlocked,
  normalizeUpdatePosition
};
