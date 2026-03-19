const logger = require('../logger');

const TABLE_META = {
  baronies: { label: 'Baronnie', article: 'la', nameField: 'name', fieldLabels: { viscounty_id: 'le vicomté', county_id: 'le comté', religion_pop_id: 'la religion (population)', culture_id: 'la culture', priory_religion_id: 'le prieuré', church_religion_id: "l'église", cathedral_religion_id: 'la cathédrale', seigneur_id: 'le seigneur' } },
  seigneurs: { label: 'Seigneur', article: 'le', nameField: 'name', fieldLabels: { overlord_id: 'le suzerain', religion_id: 'la religion' } },
  players: { label: 'Joueur', article: 'le' },
  seigneuries: { label: 'Seigneurie', article: 'la' },
  seigneuries_info: { label: 'Infos seigneurie', article: 'les' },
  religions: { label: 'Religion', article: 'la', nameField: 'name' },
  cultures: { label: 'Culture', article: 'la', nameField: 'name' },
  empires: { label: 'Empire', article: "l'", nameField: 'name' },
  kingdoms: { label: 'Royaume', article: 'le', nameField: 'name' },
  archduchies: { label: 'Archiduché', article: "l'", nameField: 'name' },
  duchies: { label: 'Duché', article: 'le', nameField: 'name' },
  marquisates: { label: 'Marquisat', article: 'le', nameField: 'name' },
  counties: { label: 'Comté', article: 'le', nameField: 'name' },
  viscounties: { label: 'Vicomté', article: 'le', nameField: 'name' },
  maritime_zones: { label: 'Zone maritime', article: 'la', nameField: 'name' },
  users: {
    label: 'utilisateur',
    article: "l'",
    nameField: 'email',
    fieldLabels: { first_name: 'Prénom', last_name: 'Nom', email: 'Email' },
    nameFormatter: (row) => [row?.first_name, row?.last_name].filter(Boolean).join(' ') || row?.email
  },
  sanctuaries: { label: 'Sanctuaire', article: 'le' },
  canonical_lands: { label: 'Terre canonique', article: 'la', fieldLabels: { barony_id: 'Baronnie', canonical_barony_id: 'Terre canonique' } },
  barony_connections: { label: 'liaison de baronnies', article: 'la' },
  maritime_zone_connections: { label: 'liaison maritime', article: 'la' },
  maritime_zone_baronies: { label: 'association zone/baronnie', article: "l'" },
  barony_pixels: { label: 'pixels de baronnie', article: 'les' },
  maritime_zone_pixels: { label: 'pixels de zone maritime', article: 'les' },
  trade_routes: { label: 'route commerciale', article: 'la' },
  barony_properties: { label: 'propriétés de baronnie', article: 'les' },
  building_properties: { label: 'Bâtiment', article: 'le', nameField: 'label' },
  infrastructure_properties: { label: 'Infrastructure', article: "l'", nameField: 'label' },
  spells: { label: 'Sort', article: 'le', nameField: 'label' },
  tags: { label: 'Tag', article: 'le', nameField: 'label' }
};
const LOOKUP_META = {
  baronies: {
    seigneur_id: { table: 'seigneurs' },
    religion_pop_id: { table: 'religions' },
    culture_id: { table: 'cultures' },
    county_id: { table: 'counties' },
    viscounty_id: { table: 'viscounties' },
    priory_religion_id: { table: 'religions' },
    church_religion_id: { table: 'religions' },
    cathedral_religion_id: { table: 'religions' }
  },
  seigneurs: {
    religion_id: { table: 'religions' },
    overlord_id: { table: 'seigneurs' }
  },
  canonical_lands: {
    barony_id: { table: 'baronies' },
    canonical_barony_id: { table: 'baronies' }
  },
  seigneuries: {
    baronnie_id: { table: 'baronies' },
    seigneur_id: { table: 'seigneurs' }
  },
  seigneuries_info: {
    baronnie_id: { table: 'baronies' }
  },
  players: {
    seigneur_id: { table: 'seigneurs' }
  }
};
const ensuredLogTables = new WeakSet();
const lookupCache = new WeakMap();

function capitalize(str = '') {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function normalizeForCompare(val) {
  if (val === undefined) return null;
  if (val === '') return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object') return parsed;
    } catch {
      /* ignore */
    }
    if (!Number.isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
    return trimmed;
  }
  return val;
}

function valuesEqual(a, b) {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na === null || na === undefined) return nb === null || nb === undefined;
  if (nb === null || nb === undefined) return na === null || na === undefined;
  if (typeof na === 'object' && typeof nb === 'object') {
    try {
      return JSON.stringify(na) === JSON.stringify(nb);
    } catch {
      return false;
    }
  }
  return na === nb;
}

function diffRecords(before, after, fields) {
  const keys = fields || Array.from(new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {})
  ]));
  const changes = {};
  keys.forEach((key) => {
    const prev = before ? before[key] : null;
    const next = after ? after[key] : null;
    if (!valuesEqual(prev, next)) {
      changes[key] = { before: prev ?? null, after: next ?? null };
    }
  });
  return changes;
}

function formatValue(val) {
  if (val === null || val === undefined) return 'aucune valeur';
  if (typeof val === 'boolean') return val ? 'Oui' : 'Non';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  const str = String(val);
  if (str.length > 120) return `${str.slice(0, 117)}...`;
  return str;
}

function makeRecordLabel(table, before, after, key) {
  const meta = TABLE_META[table] || {};
  const record = after || before || {};
  const name = meta.nameFormatter
    ? meta.nameFormatter(record)
    : (meta.nameField ? record[meta.nameField] : null);
  const label = meta.label || table;
  const article = meta.article ? `${meta.article} ` : '';
  const id = key || record.id || record.record_id;
  if (name) {
    return `${capitalize(article + label)} ${name}${id ? ` (#${id})` : ''}`;
  }
  return `${capitalize(article + label)}${id ? ` (#${id})` : ''}`;
}

function labelField(table, field) {
  const meta = TABLE_META[table] || {};
  if (meta.fieldLabels && meta.fieldLabels[field]) return meta.fieldLabels[field];
  return field.replace(/_/g, ' ');
}

function getLookupCache(db) {
  if (!lookupCache.has(db)) {
    lookupCache.set(db, new Map());
  }
  return lookupCache.get(db);
}

function resolveLookupKey(table, id) {
  return `${table}:${id}`;
}

function sanitizeId(val) {
  if (val === null || val === undefined || val === '') return null;
  return val;
}

async function resolveLookup(db, meta, value) {
  const id = sanitizeId(value);
  if (!db || id === null) return null;
  const table = meta.table;
  const cache = getLookupCache(db);
  const cacheKey = resolveLookupKey(table, id);
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const labelField = TABLE_META[table]?.nameField || 'name';
  return new Promise((resolve) => {
    db.get(`SELECT ${labelField} as label, * FROM ${table} WHERE id=?`, [id], (err, row) => {
      if (err || !row) {
        cache.set(cacheKey, null);
        return resolve(null);
      }
      const metaForTable = TABLE_META[table] || {};
      const formatter = metaForTable.nameFormatter;
      const label = formatter ? formatter(row) : (row[labelField] ?? row.name ?? null);
      cache.set(cacheKey, label || null);
      resolve(label || null);
    });
  });
}

async function formatLookupValue(db, table, field, value) {
  const tableLookups = LOOKUP_META[table] || {};
  const meta = tableLookups[field];
  if (!meta) return null;
  const resolved = await resolveLookup(db, meta, value);
  if (!resolved) return null;
  return resolved;
}

function formatSimpleValue(val) {
  if (val === null || val === undefined || val === '') return null;
  return formatValue(val);
}

async function describeValue(db, table, field, value) {
  const lookup = await formatLookupValue(db, table, field, value);
  if (lookup) return lookup;
  return formatSimpleValue(value) ?? null;
}

function formatFieldTitle(table, field) {
  const base = capitalize(labelField(table, field));
  if (/^(l'|la |le |les )/i.test(base)) return base;
  return `Le ${base}`;
}

function formatPossessive(recordLabel) {
  if (!recordLabel) return '';
  if (/^Le\s+/i.test(recordLabel)) return `du ${recordLabel.slice(3)}`;
  if (/^La\s+/i.test(recordLabel)) return `de la ${recordLabel.slice(3)}`;
  if (/^Les\s+/i.test(recordLabel)) return `des ${recordLabel.slice(4)}`;
  if (/^L'/i.test(recordLabel)) return `de l'${recordLabel.slice(2)}`;
  return `de ${recordLabel}`;
}

async function describeCanonicalLand({ after, before, action, db }) {
  const sourceId = after?.canonical_barony_id ?? before?.canonical_barony_id;
  const targetId = after?.barony_id ?? before?.barony_id;
  const [sourceName, targetName] = await Promise.all([
    resolveLookup(db, LOOKUP_META.canonical_lands.canonical_barony_id, sourceId),
    resolveLookup(db, LOOKUP_META.canonical_lands.barony_id, targetId)
  ]);
  const sourceLabel = makeRecordLabel('baronies', { id: sourceId, name: sourceName }, null, sourceId);
  const targetLabel = makeRecordLabel('baronies', { id: targetId, name: targetName }, null, targetId);
  if (action === 'delete') {
    return `${sourceLabel} a été retirée comme Terre canonique de ${targetLabel}`;
  }
  return `${sourceLabel} a été ajoutée comme Terre canonique de ${targetLabel}`;
}

async function buildDescription({ table, action, recordLabel, changes, before, after, db }) {
  const changeKeys = Object.keys(changes || {});
  if (table === 'canonical_lands') {
    return describeCanonicalLand({ action, after, before, db });
  }
  if (action === 'create') {
    return `${recordLabel} a été créé(e)`;
  }
  if (action === 'delete') {
    return `${recordLabel} a été supprimé(e)`;
  }
  if (action === 'replace') {
    return `${recordLabel} a été remplacé(e)`;
  }
  if (changeKeys.length === 1) {
    const field = changeKeys[0];
    const { before: prev, after: next } = changes[field];
    const fieldTitle = formatFieldTitle(table, field);
    const [beforeVal, afterVal] = await Promise.all([
      describeValue(db, table, field, prev),
      describeValue(db, table, field, next)
    ]);
    const intro = `${fieldTitle} ${formatPossessive(recordLabel)} a été mis à jour`;
    if (beforeVal === null) {
      return `${intro}: '${afterVal ?? 'aucune valeur'}'`;
    }
    if (afterVal === null) {
      return `${intro}: '${beforeVal}' → 'aucune valeur'`;
    }
    return `${intro}: '${beforeVal}' → '${afterVal}'`;
  }
  return `${recordLabel} : ${changeKeys.length} champs ont été modifiés`;
}

async function prepareChangeLog({ table, action, before, after, changes, key, db }) {
  const computedChanges = changes || diffRecords(before, after);
  if (action === 'update' && Object.keys(computedChanges).length === 0) {
    return null;
  }
  const recordLabel = makeRecordLabel(table, before, after, key);
  const description = await buildDescription({ table, action, recordLabel, changes: computedChanges, before, after, db });
  const details = {
    table,
    action,
    key: key ?? after?.id ?? before?.id ?? null,
    label: recordLabel,
    fieldCount: Object.keys(computedChanges).length,
    changes: computedChanges,
    before: before || null,
    after: after || null
  };
  return { description, details };
}

async function logAdminChange(db, { table, action, before, after, changes, key, user }) {
  if (!db) return Promise.resolve();
  const entry = await prepareChangeLog({ table, action, before, after, changes, key, db });
  if (!entry) return Promise.resolve();
  const userId = user?.id || null;
  const userEmail = user?.email || null;
  const firstName = user?.first_name || null;
  const lastName = user?.last_name || null;
  const detailsStr = JSON.stringify(entry.details);
  const ensureTable = () => {
    if (!db || ensuredLogTables.has(db)) return Promise.resolve();
    return new Promise((resolve) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS admin_change_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          record_id TEXT,
          action TEXT NOT NULL,
          description TEXT NOT NULL,
          details TEXT,
          user_id INTEGER,
          user_email TEXT,
          user_first_name TEXT,
          user_last_name TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        (err) => {
          if (!err) {
            ensuredLogTables.add(db);
          } else {
            logger.error('Failed to ensure admin_change_logs table', err);
          }
          resolve();
        }
      );
    });
  };
  await ensureTable();
  return new Promise((resolve) => {
    db.run(
      `INSERT INTO admin_change_logs (table_name, record_id, action, description, details, user_id, user_email, user_first_name, user_last_name)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [table, entry.details.key, action, entry.description, detailsStr, userId, userEmail, firstName, lastName],
      (err) => {
        if (err) {
          logger.error('Failed to write admin change log', err);
        }
        resolve();
      }
    );
  });
}

module.exports = {
  diffRecords,
  formatValue,
  logAdminChange,
  makeRecordLabel,
  prepareChangeLog
};
