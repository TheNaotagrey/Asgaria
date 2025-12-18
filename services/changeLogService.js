const logger = require('../logger');

const TABLE_META = {
  baronies: { label: 'baronnie', article: 'la', nameField: 'name' },
  seigneurs: { label: 'seigneur', article: 'le', nameField: 'name' },
  seigneuries: { label: 'seigneurie', article: 'la' },
  religions: { label: 'religion', article: 'la', nameField: 'name' },
  cultures: { label: 'culture', article: 'la', nameField: 'name' },
  empires: { label: 'empire', article: "l'", nameField: 'name' },
  kingdoms: { label: 'royaume', article: 'le', nameField: 'name' },
  archduchies: { label: 'archiduché', article: "l'", nameField: 'name' },
  duchies: { label: 'duché', article: 'le', nameField: 'name' },
  marquisates: { label: 'marquisat', article: 'le', nameField: 'name' },
  counties: { label: 'comté', article: 'le', nameField: 'name' },
  viscounties: { label: 'vicomté', article: 'le', nameField: 'name' },
  maritime_zones: { label: 'zone maritime', article: 'la', nameField: 'name' },
  users: {
    label: 'utilisateur',
    article: "l'",
    nameField: 'email',
    fieldLabels: { first_name: 'Prénom', last_name: 'Nom', email: 'Email' },
    nameFormatter: (row) => [row?.first_name, row?.last_name].filter(Boolean).join(' ') || row?.email
  },
  sanctuaries: { label: 'sanctuaire', article: 'le' },
  canonical_lands: { label: 'terre canonique', article: 'la' },
  barony_connections: { label: 'liaison de baronnies', article: 'la' },
  maritime_zone_connections: { label: 'liaison maritime', article: 'la' },
  maritime_zone_baronies: { label: 'association zone/baronnie', article: "l'" },
  barony_pixels: { label: 'pixels de baronnie', article: 'les' },
  maritime_zone_pixels: { label: 'pixels de zone maritime', article: 'les' },
  trade_routes: { label: 'route commerciale', article: 'la' },
  barony_properties: { label: 'propriétés de baronnie', article: 'les' },
  building_properties: { label: 'bâtiment', article: 'le', nameField: 'label' },
  infrastructure_properties: { label: 'infrastructure', article: "l'", nameField: 'label' },
  spells: { label: 'sort', article: 'le', nameField: 'label' },
  tags: { label: 'tag', article: 'le', nameField: 'label' }
};
const ensuredLogTables = new WeakSet();

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

function buildDescription({ table, action, recordLabel, changes }) {
  const changeKeys = Object.keys(changes || {});
  if (action === 'create') {
    return `${recordLabel} a été créé(e).`;
  }
  if (action === 'delete') {
    return `${recordLabel} a été supprimé(e).`;
  }
  if (action === 'replace') {
    return `${recordLabel} a été remplacé(e).`;
  }
  if (changeKeys.length === 1) {
    const field = changeKeys[0];
    const { before, after } = changes[field];
    return `${capitalize(labelField(table, field))} de ${recordLabel} mis à jour : '${formatValue(before)}' → '${formatValue(after)}'.`;
  }
  return `${recordLabel} : ${changeKeys.length} champs ont été modifiés.`;
}

function prepareChangeLog({ table, action, before, after, changes, key }) {
  const computedChanges = changes || diffRecords(before, after);
  if (action === 'update' && Object.keys(computedChanges).length === 0) {
    return null;
  }
  const recordLabel = makeRecordLabel(table, before, after, key);
  const description = buildDescription({ table, action, recordLabel, changes: computedChanges });
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

function logAdminChange(db, { table, action, before, after, changes, key, user }) {
  if (!db) return Promise.resolve();
  const entry = prepareChangeLog({ table, action, before, after, changes, key });
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
  return ensureTable().then(() => new Promise((resolve) => {
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
  }));
}

module.exports = {
  diffRecords,
  formatValue,
  logAdminChange,
  makeRecordLabel,
  prepareChangeLog
};
