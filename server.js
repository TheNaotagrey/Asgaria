const express = require('express');
const sqlite3 = require('sqlite3');
const zlib = require('zlib');
const path = require('path');
const session = require('express-session');
const { promisify } = require('util');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const { inventaireFields, performTransaction } = require('./transactions');
const luxuryResources = ['fourrure','ivoire','soie','huile','teinture','epices','sel','perle','encens','vin','pierre_precieuse'];
const logger = require('./logger');
const handleError = require('./handleError');
const { consumeResources } = require('./services/buildingService');
const { sendNotification } = require('./services/notificationService');
const { logAdminChange, prepareChangeLog, diffRecords } = require('./services/changeLogService');
const { crudRoutes, list, create, update } = require('./src/crudRouter');
const { StorageEffect, ResourceProductionEffect, BuildingProductionEffect, InfraProductionEffect, IDHEffect, VariableWorkersEffect, TagEffect, UnlockPageEffect, SpellSuccessEffect, SpellBasicDiscountEffect, SpellAdvancedDiscountEffect, SpellRangeEffect, SpellMaxPerMonthEffect, LandTransactionMaxPerMonthEffect, NavalTransactionMaxPerMonthEffect } = require('./effects');
const { breadthFirst } = require('./src/bfs');
const { compareUpdatePositions, formatUpdateLabel, getLatestUnlockedUpdate, getNextUpdatePosition, getUnlockDateForUpdate, getUpdateKey, isUpdateUnlocked, normalizeUpdatePosition } = require('./src/updateCycle');
const app = express();

const db = new sqlite3.Database('asgaria.db');
db.configure('busyTimeout', 5000);
const gunzip = promisify(zlib.gunzip);

app.set('trust proxy', 1);

const VALID_TABLES = new Set([
  'users','religions','cultures','seigneurs','empires','kingdoms','archduchies',
  'duchies','marquisates','counties','viscounties','baronies','barony_pixels',
  'canonical_lands','inventaire','players','seigneuries_info','transactions','trade_transactions','barony_properties',
  'building_properties','infrastructure_properties','barony_connections','trade_routes','trade_lines','tags','spells',
  'sanctuaries','maritime_zones','maritime_zone_pixels','maritime_zone_connections','maritime_zone_baronies','notifications'
]);

const PUBLIC_TABLES = new Set([
  'religions','cultures','seigneurs','empires','kingdoms','archduchies','duchies','marquisates',
  'counties','viscounties','baronies','barony_pixels','canonical_lands','barony_connections','trade_routes',
  'trade_lines','sanctuaries','maritime_zones','maritime_zone_pixels','maritime_zone_connections','maritime_zone_baronies'
]);

const AUTH_TABLES = new Set([
  'building_properties','infrastructure_properties','tags','spells'
]);

const ADMIN_TABLES = new Set([
  'users','players','seigneuries_info','inventaire','transactions','trade_transactions','barony_properties','notifications'
]);

app.set('db', db);
app.set('validTables', VALID_TABLES);
app.set('publicTables', PUBLIC_TABLES);
app.set('authTables', AUTH_TABLES);
app.set('adminTables', ADMIN_TABLES);

// create tables if they do not exist
const initSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password TEXT,
  first_name TEXT,
  last_name TEXT,
  is_admin INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_table_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  hidden_columns TEXT DEFAULT '[]',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, table_name),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS religions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  color TEXT
);
CREATE TABLE IF NOT EXISTS cultures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  color TEXT
);
CREATE TABLE IF NOT EXISTS seigneurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  religion_id INTEGER,
  overlord_id INTEGER,
  user_id INTEGER UNIQUE,
  player INTEGER DEFAULT 0,
  bishop INTEGER DEFAULT 0,
  FOREIGN KEY(religion_id) REFERENCES religions(id),
  FOREIGN KEY(overlord_id) REFERENCES seigneurs(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS empires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  color TEXT,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS kingdoms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  empire_id INTEGER,
  defacto_empire_id INTEGER,
  color TEXT,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id),
  FOREIGN KEY(empire_id) REFERENCES empires(id)
);
CREATE TABLE IF NOT EXISTS archduchies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  defacto_kingdom_id INTEGER,
  color TEXT,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS duchies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  kingdom_id INTEGER,
  archduchy_id INTEGER,
  banquet_religion_id INTEGER,
  defacto_kingdom_id INTEGER,
  defacto_archduchy_id INTEGER,
  color TEXT,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id),
  FOREIGN KEY(banquet_religion_id) REFERENCES religions(id),
  FOREIGN KEY(kingdom_id) REFERENCES kingdoms(id),
  FOREIGN KEY(archduchy_id) REFERENCES archduchies(id)
);
CREATE TABLE IF NOT EXISTS marquisates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  defacto_duchy_id INTEGER,
  color TEXT,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS counties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  duchy_id INTEGER,
  marquisate_id INTEGER,
  defacto_duchy_id INTEGER,
  defacto_marquisate_id INTEGER,
  color TEXT,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id),
  FOREIGN KEY(duchy_id) REFERENCES duchies(id),
  FOREIGN KEY(marquisate_id) REFERENCES marquisates(id)
);
CREATE TABLE IF NOT EXISTS viscounties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  defacto_county_id INTEGER,
  color TEXT,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS baronies (
  id INTEGER PRIMARY KEY,
  name TEXT,
  seigneur_id INTEGER,
  religion_pop_id INTEGER,
  county_id INTEGER,
  viscounty_id INTEGER,
  defacto_county_id INTEGER,
  defacto_viscounty_id INTEGER,
  culture_id INTEGER,
  priory_religion_id INTEGER,
  church_religion_id INTEGER,
  cathedral_religion_id INTEGER,
  vacant INTEGER DEFAULT 0,
  color TEXT,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id) ON DELETE SET NULL,
  FOREIGN KEY(religion_pop_id) REFERENCES religions(id),
  FOREIGN KEY(county_id) REFERENCES counties(id),
  FOREIGN KEY(viscounty_id) REFERENCES viscounties(id),
  FOREIGN KEY(culture_id) REFERENCES cultures(id)
);
CREATE TABLE IF NOT EXISTS barony_pixels (
  barony_id INTEGER PRIMARY KEY REFERENCES baronies(id),
  data BLOB
);
CREATE TABLE IF NOT EXISTS sanctuaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barony_id INTEGER,
  religion_id INTEGER,
  FOREIGN KEY(barony_id) REFERENCES baronies(id),
  FOREIGN KEY(religion_id) REFERENCES religions(id)
);
CREATE TABLE IF NOT EXISTS canonical_lands (
  barony_id INTEGER,
  canonical_barony_id INTEGER,
  PRIMARY KEY(barony_id, canonical_barony_id),
  FOREIGN KEY(barony_id) REFERENCES baronies(id),
  FOREIGN KEY(canonical_barony_id) REFERENCES baronies(id)
);
CREATE TABLE IF NOT EXISTS barony_connections (
  barony_id_1 INTEGER NOT NULL,
  barony_id_2 INTEGER NOT NULL,
  distance INTEGER DEFAULT 1,
  CHECK (barony_id_1 < barony_id_2),
  PRIMARY KEY(barony_id_1, barony_id_2),
  FOREIGN KEY(barony_id_1) REFERENCES baronies(id),
  FOREIGN KEY(barony_id_2) REFERENCES baronies(id)
);
CREATE TABLE IF NOT EXISTS trade_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barony_id_1 INTEGER NOT NULL,
  barony_id_2 INTEGER NOT NULL,
  path TEXT NOT NULL,
  FOREIGN KEY(barony_id_1) REFERENCES baronies(id),
  FOREIGN KEY(barony_id_2) REFERENCES baronies(id)
);
CREATE TABLE IF NOT EXISTS trade_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barony_id_1 INTEGER NOT NULL,
  barony_id_2 INTEGER NOT NULL,
  path TEXT NOT NULL,
  FOREIGN KEY(barony_id_1) REFERENCES baronies(id),
  FOREIGN KEY(barony_id_2) REFERENCES baronies(id)
);
CREATE TABLE IF NOT EXISTS maritime_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  seigneur_id INTEGER,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS maritime_zone_pixels (
  zone_id INTEGER PRIMARY KEY REFERENCES maritime_zones(id),
  data BLOB
);
CREATE TABLE IF NOT EXISTS maritime_zone_connections (
  zone_id_1 INTEGER NOT NULL,
  zone_id_2 INTEGER NOT NULL,
  distance INTEGER DEFAULT 1,
  CHECK (zone_id_1 < zone_id_2),
  PRIMARY KEY(zone_id_1, zone_id_2),
  FOREIGN KEY(zone_id_1) REFERENCES maritime_zones(id),
  FOREIGN KEY(zone_id_2) REFERENCES maritime_zones(id)
);
CREATE TABLE IF NOT EXISTS maritime_zone_baronies (
  zone_id INTEGER NOT NULL,
  barony_id INTEGER NOT NULL,
  PRIMARY KEY(zone_id, barony_id),
  FOREIGN KEY(zone_id) REFERENCES maritime_zones(id),
  FOREIGN KEY(barony_id) REFERENCES baronies(id)
);
CREATE TABLE IF NOT EXISTS inventaire (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  or_ INTEGER DEFAULT 0,
  pierre INTEGER DEFAULT 0,
  fer INTEGER DEFAULT 0,
  lingot_or INTEGER DEFAULT 0,
  antidote INTEGER DEFAULT 0,
  armureries INTEGER DEFAULT 0,
  rhum INTEGER DEFAULT 0,
  grague INTEGER DEFAULT 0,
  vivres INTEGER DEFAULT 0,
  architectes INTEGER DEFAULT 0,
  charpentiers INTEGER DEFAULT 0,
  maitres_oeuvre INTEGER DEFAULT 0,
  maitre_espions INTEGER DEFAULT 0,
  points_magique INTEGER DEFAULT 0,
  hommes_darmes INTEGER DEFAULT 0,
  chevaux INTEGER DEFAULT 0,
  trebuchets INTEGER DEFAULT 0,
  fourrure INTEGER DEFAULT 0,
  ivoire INTEGER DEFAULT 0,
  soie INTEGER DEFAULT 0,
  huile INTEGER DEFAULT 0,
  teinture INTEGER DEFAULT 0,
  epices INTEGER DEFAULT 0,
  sel INTEGER DEFAULT 0,
  perle INTEGER DEFAULT 0,
  encens INTEGER DEFAULT 0,
  vin INTEGER DEFAULT 0,
  pierre_precieuse INTEGER DEFAULT 0,
  esclaves INTEGER DEFAULT 0,
  prestige INTEGER DEFAULT 0,
  renommee INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seigneur_id INTEGER,
  player_type TEXT DEFAULT 'seigneurie',
  population INTEGER,
  update_year INTEGER,
  update_number INTEGER,
  inventaire_id INTEGER,
  buildings TEXT DEFAULT '{}',
  infrastructures TEXT DEFAULT '{}',
  land_transactions INTEGER DEFAULT 0,
  naval_transactions INTEGER DEFAULT 0,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id),
  FOREIGN KEY(inventaire_id) REFERENCES inventaire(id)
);
CREATE TABLE IF NOT EXISTS seigneuries_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER UNIQUE,
  baronnie_id INTEGER,
  tax_rate INTEGER DEFAULT 5,
  spells_cast INTEGER DEFAULT 0,
  FOREIGN KEY(player_id) REFERENCES players(id),
  FOREIGN KEY(baronnie_id) REFERENCES baronies(id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seigneurie_id INTEGER,
  resource TEXT,
  amount INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(seigneurie_id) REFERENCES players(id)
);
CREATE TABLE IF NOT EXISTS trade_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin_id INTEGER,
  destination_id INTEGER,
  origin_update_year INTEGER,
  origin_update_number INTEGER,
  resources TEXT,
  type TEXT,
  state TEXT,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  decision_time TEXT,
  received INTEGER DEFAULT 0,
  returned INTEGER DEFAULT 0,
  FOREIGN KEY(origin_id) REFERENCES players(id),
  FOREIGN KEY(destination_id) REFERENCES players(id)
);
CREATE TABLE IF NOT EXISTS barony_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barony_id INTEGER UNIQUE,
  water_access INTEGER DEFAULT 0,
  sea_access INTEGER DEFAULT 0,
  has_or INTEGER DEFAULT 0,
  has_argent INTEGER DEFAULT 0,
  has_fer INTEGER DEFAULT 0,
  has_pierre INTEGER DEFAULT 0,
  has_epices INTEGER DEFAULT 0,
  has_perle INTEGER DEFAULT 0,
  has_encens INTEGER DEFAULT 0,
  has_huiles INTEGER DEFAULT 0,
  has_pierre_precieuses INTEGER DEFAULT 0,
  has_soie INTEGER DEFAULT 0,
  has_sel INTEGER DEFAULT 0,
  has_fourrure INTEGER DEFAULT 0,
  has_teinture INTEGER DEFAULT 0,
  has_ivoire INTEGER DEFAULT 0,
  has_vin INTEGER DEFAULT 0,
  field_limit INTEGER DEFAULT 0,
  fishing_limit INTEGER DEFAULT 0,
  high_sea_boat_limit INTEGER DEFAULT 0,
  effects TEXT,
  FOREIGN KEY(barony_id) REFERENCES baronies(id)
);
CREATE TABLE IF NOT EXISTS building_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT UNIQUE,
  label TEXT,
  produces TEXT,
  production INTEGER,
  costs TEXT,
  max TEXT,
  workers_per_building INTEGER DEFAULT 1,
  absolute_restrictions TEXT,
  infra_restrictions TEXT,
  effects TEXT,
  description TEXT
);
CREATE TABLE IF NOT EXISTS infrastructure_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT,
  type TEXT,
  max TEXT,
  workers_per_building INTEGER DEFAULT 0,
  effects TEXT,
  costs TEXT,
  absolute_restrictions TEXT,
  restrictions TEXT,
  description TEXT
);
CREATE TABLE IF NOT EXISTS spells (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT,
  type TEXT,
  costs TEXT,
  effects TEXT,
  description TEXT
);
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS admin_change_logs (
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
);
CREATE VIEW IF NOT EXISTS seigneuries AS
SELECT
  p.id,
  si.baronnie_id,
  p.seigneur_id,
  p.population,
  si.tax_rate,
  p.inventaire_id,
  p.buildings,
  p.infrastructures,
  si.spells_cast,
  p.land_transactions,
  p.naval_transactions,
  p.update_year,
  p.update_number
FROM players p
JOIN seigneuries_info si ON si.player_id = p.id
WHERE COALESCE(p.player_type, 'seigneurie') = 'seigneurie';
`;

function parseTradeRoutePath(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(val => parseInt(val, 10)).filter(Number.isFinite);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(val => parseInt(val, 10)).filter(Number.isFinite);
      }
    } catch (err) {
      return [];
    }
  }
  return [];
}

function parseTradeLinePath(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(val => parseInt(val, 10)).filter(Number.isFinite);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(val => parseInt(val, 10)).filter(Number.isFinite);
      }
    } catch (err) {
      return [];
    }
  }
  return [];
}

function buildAdjacency(rows, idKey1 = 'barony_id_1', idKey2 = 'barony_id_2') {
  const adj = {};
  rows.forEach(row => {
    const id1 = parseInt(row[idKey1], 10);
    const id2 = parseInt(row[idKey2], 10);
    if (!id1 || !id2) return;
    const dist = parseInt(row.distance, 10) || 1;
    if (!adj[id1]) adj[id1] = [];
    if (!adj[id2]) adj[id2] = [];
    adj[id1].push({ id: id2, distance: dist });
    adj[id2].push({ id: id1, distance: dist });
  });
  return adj;
}

function computeShortestPath(startId, endId, adjacency) {
  if (!startId || !endId) return null;
  if (startId === endId) return { path: [startId], distance: 0 };
  const dist = {};
  const prev = {};
  const queue = [];
  dist[startId] = 0;
  queue.push({ id: startId, dist: 0 });
  while (queue.length) {
    let bestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].dist < queue[bestIndex].dist) bestIndex = i;
    }
    const curEntry = queue.splice(bestIndex, 1)[0];
    if (!curEntry) continue;
    const cur = curEntry.id;
    if (curEntry.dist !== dist[cur]) continue;
    if (cur === endId) break;
    (adjacency[cur] || []).forEach(n => {
      const nextId = parseInt(n.id, 10);
      if (!nextId) return;
      const weight = parseInt(n.distance, 10) || 1;
      const nextDist = dist[cur] + weight;
      if (dist[nextId] == null || nextDist < dist[nextId]) {
        dist[nextId] = nextDist;
        prev[nextId] = cur;
        queue.push({ id: nextId, dist: nextDist });
      }
    });
  }
  if (dist[endId] == null) return null;
  const path = [];
  let cur = endId;
  while (cur != null) {
    path.push(cur);
    if (cur === startId) break;
    cur = prev[cur];
  }
  if (path[path.length - 1] !== startId) return null;
  path.reverse();
  return { path, distance: dist[endId] };
}

function computePathDistance(path, adjacency) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const current = path[i];
    const next = path[i + 1];
    const neighbors = adjacency[current] || [];
    const edge = neighbors.find(item => parseInt(item.id, 10) === next);
    if (!edge) return null;
    total += parseInt(edge.distance, 10) || 1;
  }
  return total;
}

function normalizeTradeRoutePathInput(rawPath, startId, endId) {
  let parsed = parseTradeRoutePath(rawPath);
  if (!parsed.length) return { fullPath: [], storedPath: [] };
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  let fullPath = parsed.slice();
  if (first === endId && last === startId) {
    fullPath = parsed.slice().reverse();
  } else if (first !== startId || last !== endId) {
    if (parsed.includes(startId) || parsed.includes(endId)) {
      return { error: 'Le chemin ne doit pas inclure les baronnies 1 et 2.' };
    }
    fullPath = [startId, ...parsed, endId];
  }
  const storedPath = fullPath.slice(1, -1);
  return { fullPath, storedPath };
}

function validateTradeRoutePath(path, startId, endId, adjacency) {
  if (!Array.isArray(path) || path.length < 2) {
    return 'Le chemin doit contenir au moins deux baronnies.';
  }
  if (path[0] !== startId || path[path.length - 1] !== endId) {
    return 'Le chemin doit commencer par la baronnie 1 et finir par la baronnie 2.';
  }
  const visited = new Set();
  for (let i = 0; i < path.length; i += 1) {
    const node = path[i];
    if (visited.has(node)) {
      return 'Le chemin ne peut pas repasser par la même baronnie.';
    }
    visited.add(node);
    if (i === path.length - 1) continue;
    const next = path[i + 1];
    const neighbors = adjacency[node] || [];
    const isAdjacent = neighbors.some(n => parseInt(n.id, 10) === next);
    if (!isAdjacent) {
      return 'Le chemin contient des baronnies non adjacentes.';
    }
  }
  return '';
}

function getTradeAdjacency(callback) {
  db.all('SELECT barony_id_1, barony_id_2, distance FROM barony_connections', [], (err, rows) => {
    if (err) return callback(err);
    callback(null, buildAdjacency(rows));
  });
}

function getTradeLineAdjacency(callback) {
  db.all('SELECT zone_id_1, zone_id_2, distance FROM maritime_zone_connections', [], (err, rows) => {
    if (err) return callback(err);
    callback(null, buildAdjacency(rows, 'zone_id_1', 'zone_id_2'));
  });
}

function getBaronyMaritimeZones(callback) {
  db.all('SELECT zone_id, barony_id FROM maritime_zone_baronies', [], (err, rows) => {
    if (err) return callback(err);
    const map = {};
    (rows || []).forEach(row => {
      const zoneId = parseInt(row.zone_id, 10);
      const baronyId = parseInt(row.barony_id, 10);
      if (!zoneId || !baronyId) return;
      if (!map[baronyId]) map[baronyId] = [];
      map[baronyId].push(zoneId);
    });
    callback(null, map);
  });
}

function migrateTradeRoutesTable() {
  db.serialize(() => {
    db.run('ALTER TABLE trade_routes RENAME TO trade_routes_old');
    db.run(`
      CREATE TABLE IF NOT EXISTS trade_routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barony_id_1 INTEGER NOT NULL,
        barony_id_2 INTEGER NOT NULL,
        path TEXT NOT NULL,
        FOREIGN KEY(barony_id_1) REFERENCES baronies(id),
        FOREIGN KEY(barony_id_2) REFERENCES baronies(id)
      )
    `);
    db.all('SELECT barony_id_1, barony_id_2 FROM trade_routes_old', [], (err, routes) => {
      if (err) {
        logger.error('Migration des routes commerciales échouée', err);
        return;
      }
      getTradeAdjacency((errAdj, adjacency) => {
        if (errAdj) {
          logger.error('Impossible de charger les connexions pour les routes commerciales', errAdj);
        }
        const stmt = db.prepare('INSERT INTO trade_routes (barony_id_1, barony_id_2, path) VALUES (?,?,?)');
        routes.forEach(route => {
          const startId = parseInt(route.barony_id_1, 10);
          const endId = parseInt(route.barony_id_2, 10);
          const computed = adjacency ? computeShortestPath(startId, endId, adjacency) : null;
          const path = (computed && computed.path && computed.path.length)
            ? computed.path.slice(1, -1)
            : [];
          stmt.run(startId, endId, JSON.stringify(path));
        });
        stmt.finalize(() => {
          db.run('DROP TABLE trade_routes_old');
        });
      });
    });
  });
}

function ensureTradeRoutePaths() {
  db.all('SELECT id, barony_id_1, barony_id_2, path FROM trade_routes', [], (err, routes) => {
    if (err || !routes || !routes.length) return;
    getTradeAdjacency((errAdj, adjacency) => {
      if (errAdj) {
        logger.error('Impossible de charger les connexions pour les chemins commerciaux', errAdj);
        return;
      }
      routes.forEach(route => {
        const existing = parseTradeRoutePath(route.path);
        const startId = parseInt(route.barony_id_1, 10);
        const endId = parseInt(route.barony_id_2, 10);
        if (existing.length) {
          const normalized = normalizeTradeRoutePathInput(existing, startId, endId);
          if (normalized.error) return;
          const storedPath = normalized.fullPath.length ? normalized.storedPath : [];
          if (JSON.stringify(existing) !== JSON.stringify(storedPath)) {
            db.run('UPDATE trade_routes SET path=? WHERE id=?', [JSON.stringify(storedPath), route.id]);
          }
          return;
        }
        const computed = computeShortestPath(startId, endId, adjacency);
        const path = (computed && computed.path && computed.path.length)
          ? computed.path.slice(1, -1)
          : [];
        db.run('UPDATE trade_routes SET path=? WHERE id=?', [JSON.stringify(path), route.id]);
      });
    });
  });
}

function validateTradeLinePath(path, startId, endId, adjacency, baronyZones) {
  if (!Array.isArray(path) || path.length < 1) {
    return 'Le chemin doit contenir au moins une zone maritime.';
  }
  const startZones = baronyZones[startId] || [];
  const endZones = baronyZones[endId] || [];
  if (!startZones.includes(path[0])) {
    return 'La première zone maritime doit toucher la baronnie 1.';
  }
  if (!endZones.includes(path[path.length - 1])) {
    return 'La dernière zone maritime doit toucher la baronnie 2.';
  }
  const visited = new Set();
  for (let i = 0; i < path.length; i += 1) {
    const node = path[i];
    if (!node) {
      return 'Le chemin contient une zone maritime invalide.';
    }
    if (visited.has(node)) {
      return 'Le chemin ne peut pas repasser par la même zone maritime.';
    }
    visited.add(node);
    if (i === path.length - 1) continue;
    const next = path[i + 1];
    const neighbors = adjacency[node] || [];
    const isAdjacent = neighbors.some(n => parseInt(n.id, 10) === next);
    if (!isAdjacent) {
      return 'Le chemin contient des zones maritimes non adjacentes.';
    }
  }
  return '';
}

const DEFAULT_ADMIN_RETRY_DELAY_MS = 300;
const DEFAULT_ADMIN_MAX_RETRIES = 15;
const DEFAULT_ADMIN_RETRY_BACKOFF_MS = 2000;
let defaultAdminInFlight = false;

function enforceDefaultAdmins(callback, attempt = 0) {
  if (defaultAdminInFlight) {
    if (callback) callback(null);
    return;
  }
  defaultAdminInFlight = true;
  db.run('UPDATE users SET is_admin=1 WHERE id<=3', (err) => {
    if (err && err.code === 'SQLITE_BUSY') {
      defaultAdminInFlight = false;
      if (attempt < DEFAULT_ADMIN_MAX_RETRIES) {
        const delay = DEFAULT_ADMIN_RETRY_DELAY_MS * (attempt + 1);
        setTimeout(() => enforceDefaultAdmins(callback, attempt + 1), delay);
        return;
      }
      logger.warn('Failed to ensure default admin users (base de données verrouillée), nouvelle tentative planifiée.');
      setTimeout(() => enforceDefaultAdmins(callback, 0), DEFAULT_ADMIN_RETRY_BACKOFF_MS);
      return;
    }
    defaultAdminInFlight = false;
    if (err) {
      logger.error('Failed to ensure default admin users', err);
    }
    if (callback) {
      callback(err);
    }
  });
}

function initializeDatabaseSchema() {
db.serialize(() => {
  db.exec(initSql);
  db.all("PRAGMA table_info(seigneurs)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'overlord_id')) {
        db.run('ALTER TABLE seigneurs ADD COLUMN overlord_id INTEGER');
      }
      if (!rows.some(r => r.name === 'user_id')) {
        db.run('ALTER TABLE seigneurs ADD COLUMN user_id INTEGER', () => {
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_seigneurs_user_id ON seigneurs(user_id)');
        });
      } else {
        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_seigneurs_user_id ON seigneurs(user_id)');
      }
    }
  });
  db.all("PRAGMA table_info(religions)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'color')) {
      db.run('ALTER TABLE religions ADD COLUMN color TEXT');
    }
  });
  db.all("PRAGMA table_info(empires)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'color')) {
      db.run('ALTER TABLE empires ADD COLUMN color TEXT');
    }
  });
  db.all("PRAGMA table_info(kingdoms)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'color')) {
      db.run('ALTER TABLE kingdoms ADD COLUMN color TEXT');
    }
  });
  db.all("PRAGMA table_info(archduchies)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'color')) {
      db.run('ALTER TABLE archduchies ADD COLUMN color TEXT');
    }
  });
  db.all("PRAGMA table_info(duchies)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'color')) {
      db.run('ALTER TABLE duchies ADD COLUMN color TEXT');
    }
  });
  db.all("PRAGMA table_info(marquisates)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'color')) {
      db.run('ALTER TABLE marquisates ADD COLUMN color TEXT');
    }
  });
  db.all("PRAGMA table_info(counties)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'color')) {
      db.run('ALTER TABLE counties ADD COLUMN color TEXT');
    }
  });
  db.all("PRAGMA table_info(viscounties)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'defacto_county_id')) {
        db.run('ALTER TABLE viscounties ADD COLUMN defacto_county_id INTEGER');
      }
      if (!rows.some(r => r.name === 'color')) {
        db.run('ALTER TABLE viscounties ADD COLUMN color TEXT');
      }
    }
  });
  db.all("PRAGMA table_info(players)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'player_type')) {
        db.run("ALTER TABLE players ADD COLUMN player_type TEXT DEFAULT 'seigneurie'");
      }
      if (!rows.some(r => r.name === 'update_year')) {
        db.run("ALTER TABLE players ADD COLUMN update_year INTEGER");
      }
      if (!rows.some(r => r.name === 'update_number')) {
        db.run("ALTER TABLE players ADD COLUMN update_number INTEGER");
      }
      if (!rows.some(r => r.name === 'buildings')) {
        db.run("ALTER TABLE players ADD COLUMN buildings TEXT DEFAULT '{}' ");
      }
      if (!rows.some(r => r.name === 'infrastructures')) {
        db.run("ALTER TABLE players ADD COLUMN infrastructures TEXT DEFAULT '{}' ");
      }
      if (!rows.some(r => r.name === 'land_transactions')) {
        db.run("ALTER TABLE players ADD COLUMN land_transactions INTEGER DEFAULT 0");
      }
      if (!rows.some(r => r.name === 'naval_transactions')) {
        db.run("ALTER TABLE players ADD COLUMN naval_transactions INTEGER DEFAULT 0");
      }
    }
  });
  db.all("PRAGMA table_info(seigneuries_info)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'player_id')) {
        db.run('ALTER TABLE seigneuries_info ADD COLUMN player_id INTEGER');
      }
      if (!rows.some(r => r.name === 'baronnie_id')) {
        db.run('ALTER TABLE seigneuries_info ADD COLUMN baronnie_id INTEGER');
      }
      if (!rows.some(r => r.name === 'tax_rate')) {
        db.run('ALTER TABLE seigneuries_info ADD COLUMN tax_rate INTEGER DEFAULT 5');
      }
      if (!rows.some(r => r.name === 'spells_cast')) {
        db.run('ALTER TABLE seigneuries_info ADD COLUMN spells_cast INTEGER DEFAULT 0');
      }
    }
  });
  db.all("PRAGMA table_info(trade_transactions)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'origin_update_year')) {
        db.run('ALTER TABLE trade_transactions ADD COLUMN origin_update_year INTEGER');
      }
      if (!rows.some(r => r.name === 'origin_update_number')) {
        db.run('ALTER TABLE trade_transactions ADD COLUMN origin_update_number INTEGER');
      }
      if (!rows.some(r => r.name === 'reason')) {
        db.run('ALTER TABLE trade_transactions ADD COLUMN reason TEXT');
      }
      if (!rows.some(r => r.name === 'decision_time')) {
        db.run('ALTER TABLE trade_transactions ADD COLUMN decision_time TEXT');
      }
      if (!rows.some(r => r.name === 'received')) {
        db.run('ALTER TABLE trade_transactions ADD COLUMN received INTEGER DEFAULT 0');
      }
      if (!rows.some(r => r.name === 'returned')) {
        db.run('ALTER TABLE trade_transactions ADD COLUMN returned INTEGER DEFAULT 0');
      }
    }
  });
  db.all("PRAGMA table_info(cultures)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'color')) {
      db.run('ALTER TABLE cultures ADD COLUMN color TEXT');
    }
  });
  db.all("PRAGMA table_info(baronies)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(r => r.name === 'viscounty_id')) {
      db.run('ALTER TABLE baronies ADD COLUMN viscounty_id INTEGER');
    }
    if (!rows.some(r => r.name === 'defacto_county_id')) {
      db.run('ALTER TABLE baronies ADD COLUMN defacto_county_id INTEGER');
    }
    if (!rows.some(r => r.name === 'defacto_viscounty_id')) {
      db.run('ALTER TABLE baronies ADD COLUMN defacto_viscounty_id INTEGER');
    }
    if (!rows.some(r => r.name === 'priory_religion_id')) {
      db.run('ALTER TABLE baronies ADD COLUMN priory_religion_id INTEGER');
    }
    if (!rows.some(r => r.name === 'church_religion_id')) {
      db.run('ALTER TABLE baronies ADD COLUMN church_religion_id INTEGER');
    }
    if (!rows.some(r => r.name === 'cathedral_religion_id')) {
      db.run('ALTER TABLE baronies ADD COLUMN cathedral_religion_id INTEGER');
    }
    if (!rows.some(r => r.name === 'color')) {
      db.run('ALTER TABLE baronies ADD COLUMN color TEXT');
    }
    if (!rows.some(r => r.name === 'vacant')) {
      db.run('ALTER TABLE baronies ADD COLUMN vacant INTEGER DEFAULT 0');
      db.run('UPDATE baronies SET vacant=0 WHERE vacant IS NULL');
    }
  });
  db.all("PRAGMA table_info(seigneurs)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(r => r.name === 'player')) {
      db.run('ALTER TABLE seigneurs ADD COLUMN player INTEGER DEFAULT 0');
    }
    if (!rows.some(r => r.name === 'bishop')) {
      db.run('ALTER TABLE seigneurs ADD COLUMN bishop INTEGER DEFAULT 0');
    }
  });
  db.all("PRAGMA table_info(counties)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'marquisate_id')) {
        db.run('ALTER TABLE counties ADD COLUMN marquisate_id INTEGER');
      }
      if (!rows.some(r => r.name === 'defacto_duchy_id')) {
        db.run('ALTER TABLE counties ADD COLUMN defacto_duchy_id INTEGER');
      }
      if (!rows.some(r => r.name === 'defacto_marquisate_id')) {
        db.run('ALTER TABLE counties ADD COLUMN defacto_marquisate_id INTEGER');
      }
      if (!rows.some(r => r.name === 'seigneur_id')) {
        db.run('ALTER TABLE counties ADD COLUMN seigneur_id INTEGER REFERENCES seigneurs(id)');
      }
    }
  });
  db.all("PRAGMA table_info(duchies)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'archduchy_id')) {
        db.run('ALTER TABLE duchies ADD COLUMN archduchy_id INTEGER');
      }
      if (!rows.some(r => r.name === 'banquet_religion_id')) {
        db.run('ALTER TABLE duchies ADD COLUMN banquet_religion_id INTEGER');
      }
      if (!rows.some(r => r.name === 'defacto_kingdom_id')) {
        db.run('ALTER TABLE duchies ADD COLUMN defacto_kingdom_id INTEGER');
      }
      if (!rows.some(r => r.name === 'defacto_archduchy_id')) {
        db.run('ALTER TABLE duchies ADD COLUMN defacto_archduchy_id INTEGER');
      }
      if (!rows.some(r => r.name === 'seigneur_id')) {
        db.run('ALTER TABLE duchies ADD COLUMN seigneur_id INTEGER REFERENCES seigneurs(id)');
      }
    }
  });
  db.all("PRAGMA table_info(marquisates)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'defacto_duchy_id')) {
        db.run('ALTER TABLE marquisates ADD COLUMN defacto_duchy_id INTEGER');
      }
      if (!rows.some(r => r.name === 'seigneur_id')) {
        db.run('ALTER TABLE marquisates ADD COLUMN seigneur_id INTEGER REFERENCES seigneurs(id)');
      }
    }
  });
  db.all("PRAGMA table_info(archduchies)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'defacto_kingdom_id')) {
        db.run('ALTER TABLE archduchies ADD COLUMN defacto_kingdom_id INTEGER');
      }
      if (!rows.some(r => r.name === 'seigneur_id')) {
        db.run('ALTER TABLE archduchies ADD COLUMN seigneur_id INTEGER REFERENCES seigneurs(id)');
      }
    }
  });
  db.all("PRAGMA table_info(kingdoms)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'empire_id')) {
        db.run('ALTER TABLE kingdoms ADD COLUMN empire_id INTEGER');
      }
      if (!rows.some(r => r.name === 'defacto_empire_id')) {
        db.run('ALTER TABLE kingdoms ADD COLUMN defacto_empire_id INTEGER');
      }
      if (!rows.some(r => r.name === 'seigneur_id')) {
        db.run('ALTER TABLE kingdoms ADD COLUMN seigneur_id INTEGER REFERENCES seigneurs(id)');
      }
    }
  });
  db.all("PRAGMA table_info(maritime_zones)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(r => r.name === 'seigneur_id')) {
      db.run('ALTER TABLE maritime_zones ADD COLUMN seigneur_id INTEGER');
    }
  });
  db.all("PRAGMA table_info(barony_connections)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(r => r.name === 'distance')) {
      db.run('ALTER TABLE barony_connections ADD COLUMN distance INTEGER DEFAULT 1');
    }
  });
  db.all("PRAGMA table_info(trade_routes)", (err, rows) => {
    if (err || !rows) return;
    const hasId = rows.some(r => r.name === 'id');
    const hasPath = rows.some(r => r.name === 'path');
    if (!hasId) {
      migrateTradeRoutesTable();
      return;
    }
    if (!hasPath) {
      db.run('ALTER TABLE trade_routes ADD COLUMN path TEXT');
    }
    ensureTradeRoutePaths();
  });
  db.all("PRAGMA table_info(maritime_zone_connections)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(r => r.name === 'distance')) {
      db.run('ALTER TABLE maritime_zone_connections ADD COLUMN distance INTEGER DEFAULT 1');
    }
  });
  db.all("PRAGMA table_info(canonical_lands)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'canonical_barony_id')) {
      db.run('DROP TABLE IF EXISTS canonical_lands', () => {
        db.run(`CREATE TABLE canonical_lands (
  barony_id INTEGER,
  canonical_barony_id INTEGER,
  PRIMARY KEY(barony_id, canonical_barony_id),
  FOREIGN KEY(barony_id) REFERENCES baronies(id),
  FOREIGN KEY(canonical_barony_id) REFERENCES baronies(id)
)`);
      });
    }
  });
  db.all("PRAGMA table_info(building_properties)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(r => r.name === 'label')) {
      db.run('ALTER TABLE building_properties ADD COLUMN label TEXT');
    }
    if (!rows.some(r => r.name === 'produces')) {
      db.run('ALTER TABLE building_properties ADD COLUMN produces TEXT');
    }
    if (!rows.some(r => r.name === 'absolute_restrictions')) {
      db.run('ALTER TABLE building_properties ADD COLUMN absolute_restrictions TEXT');
    }
      if (!rows.some(r => r.name === 'infra_restrictions')) {
        db.run('ALTER TABLE building_properties ADD COLUMN infra_restrictions TEXT');
      }
      if (!rows.some(r => r.name === 'effects')) {
        db.run('ALTER TABLE building_properties ADD COLUMN effects TEXT');
      }
    });
    db.all("PRAGMA table_info(infrastructure_properties)", (err, rows) => {
      if (err || !rows) return;
      if (!rows.some(r => r.name === 'absolute_restrictions')) {
        db.run('ALTER TABLE infrastructure_properties ADD COLUMN absolute_restrictions TEXT');
      }
    });
  db.all("PRAGMA table_info(barony_properties)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(r => r.name === 'effects')) {
      db.run('ALTER TABLE barony_properties ADD COLUMN effects TEXT');
    }
  });
  db.all("PRAGMA table_info(spells)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(r => r.name === 'type')) {
      db.run('ALTER TABLE spells ADD COLUMN type TEXT');
    }
  });
  // Ensure every barony has a properties row with default values
  db.all('SELECT id FROM baronies', (err, rows) => {
    if (err || !rows) return;
    rows.forEach(b => {
      db.run('INSERT OR IGNORE INTO barony_properties (barony_id) VALUES (?)', [b.id]);
    });
    const cols = [
      'water_access','sea_access','has_or','has_argent','has_fer','has_pierre',
      'has_epices','has_perle','has_encens','has_huiles','has_pierre_precieuses',
      'has_soie','has_sel','has_fourrure','has_teinture','has_ivoire','has_vin',
      'field_limit','fishing_limit','high_sea_boat_limit'
    ];
    cols.forEach(col => {
      db.run(`UPDATE barony_properties SET ${col}=0 WHERE ${col} IS NULL`);
    });
  });
  enforceDefaultAdmins();
});
}

db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='seigneuries'", (err, legacySeigneuries) => {
  if (err) {
    logger.error('Failed to inspect legacy seigneuries table', err);
    return initializeDatabaseSchema();
  }
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='players'", (err2, playersTable) => {
    if (err2) {
      logger.error('Failed to inspect players table', err2);
      return initializeDatabaseSchema();
    }
    if (legacySeigneuries && !playersTable) {
      db.run('ALTER TABLE seigneuries RENAME TO players', (renameErr) => {
        if (renameErr) logger.error('Failed to rename seigneuries to players', renameErr);
        initializeDatabaseSchema();
      });
      return;
    }
    initializeDatabaseSchema();
  });
});

// accept large pixel blobs
app.use(express.json({ limit: '50mb' }));
function gzipJsonResponses(req, res, next) {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip')) return next();
  res.json = (data) => {
    zlib.gzip(Buffer.from(JSON.stringify(data)), (err, compressed) => {
      if (err) return handleError(res, err);
      res.set('Content-Encoding', 'gzip');
      res.set('Content-Type', 'application/json');
      res.send(compressed);
    });
  };
  next();
}
app.use(gzipJsonResponses);
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  logger.warn('SESSION_SECRET environment variable not set; using fallback secret');
}
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: '.' }),
  secret: sessionSecret || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax'
  }
}));
function isAdminActive(user){
  const adminUser = applyAdminOverride(user);
  return adminUser && adminUser.is_admin && adminUser.act_as_admin !== false;
}

app.set('isAdminActive', isAdminActive);

function isAdminUser(user) {
  const adminUser = applyAdminOverride(user);
  return adminUser && adminUser.is_admin;
}

app.use((req,res,next)=>{
  const adminPages = ['/admin.html','/mapEditor.html'];
  if (adminPages.includes(req.path) && !isAdminActive(req.session.user)) {
    return res.redirect('/');
  }
  if (req.path === '/profile.html' && !req.session.user) {
    return res.redirect('/');
  }
  next();
});
app.use(express.static(path.join(__dirname)));

// require authentication for all PUT requests
app.use((req, res, next) => {
  if (req.method === 'PUT') {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!isAdminActive(req.session.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  next();
});

function sanitize(val){
  return val === '' ? null : val;
}

function requireAdmin(req, res, next) {
  if (!isAdminActive(req.session.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function applyAdminOverride(user) {
  if (!user) return user;
  if (user.id && user.id <= 3) {
    return { ...user, is_admin: 1 };
  }
  return user;
}

function recordChange(req, change) {
  return logAdminChange(db, { user: req.session.user, ...change });
}

function getSeigneurie(req, select, cb) {
  const user = req.session.user;
  const overrideRaw = isAdminActive(user) ? (req.query.seigneurie_id || (req.body && req.body.seigneurie_id)) : null;
  const overrideId = overrideRaw ? parseInt(overrideRaw, 10) : null;
  const sql = overrideId
    ? `SELECT ${select} FROM seigneuries WHERE id=?`
    : `SELECT ${select} FROM seigneurs JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id WHERE seigneurs.user_id=?`;
  const param = overrideId ? [overrideId] : [user.id];
  db.get(sql, param, cb);
}

// Authentication endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const hash = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users(email,password,first_name,last_name) VALUES (?,?,?,?)',
      [email, hash, first_name, last_name],
      function (err) {
        if (err) return handleError(res, err);
        const newUser = applyAdminOverride({
          id: this.lastID,
          email,
          first_name,
          last_name,
          is_admin: 0
        });
        if (newUser.is_admin) {
          enforceDefaultAdmins();
        }
        req.session.user = {
          ...newUser,
          is_admin: !!newUser.is_admin
        };
        sendNotification(db, this.lastID, 'Bienvenue sur Asgaria !', '/profile.html');
        res.json({ ok: true });
      }
    );
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email=?', [email], async (err, user) => {
      if (err || !user) return res.status(400).json({ error: 'Invalid credentials' });
      try {
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
          return res.status(400).json({ error: 'Invalid credentials' });
        }
        const adminUser = applyAdminOverride(user);
        req.session.user = {
          id: adminUser.id,
          email: adminUser.email,
          first_name: adminUser.first_name,
          last_name: adminUser.last_name,
          is_admin: !!adminUser.is_admin,
          act_as_admin: true
        };
        res.json({ ok: true });
      } catch (error) {
        handleError(res, error);
      }
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) return handleError(res, err);
      res.json({ ok: true });
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/me', (req, res) => {
  try {
    if (!req.session.user) return res.json(null);
    db.get('SELECT name FROM seigneurs WHERE user_id=?', [req.session.user.id], (err, row) => {
      if (err) return handleError(res, err);
      res.json({ ...req.session.user, character_name: row ? row.name : null });
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/organigramme_access', (req, res) => {
  if (!req.session.user) return res.json({ eligible: false });
  db.get('SELECT id FROM seigneurs WHERE user_id=?', [req.session.user.id], (err, row) => {
    if (err) return handleError(res, err);
    if (!row) return res.json({ eligible: false });
    const seigneurId = row.id;
    const titleQuery = `
      SELECT COUNT(*) as count FROM (
        SELECT seigneur_id FROM empires WHERE seigneur_id=?
        UNION ALL SELECT seigneur_id FROM kingdoms WHERE seigneur_id=?
        UNION ALL SELECT seigneur_id FROM archduchies WHERE seigneur_id=?
        UNION ALL SELECT seigneur_id FROM duchies WHERE seigneur_id=?
        UNION ALL SELECT seigneur_id FROM marquisates WHERE seigneur_id=?
        UNION ALL SELECT seigneur_id FROM counties WHERE seigneur_id=?
        UNION ALL SELECT seigneur_id FROM viscounties WHERE seigneur_id=?
        UNION ALL SELECT seigneur_id FROM baronies WHERE seigneur_id=?
      )`;
    const params = Array(8).fill(seigneurId);
    db.get(titleQuery, params, (titleErr, titleRow) => {
      if (titleErr) return handleError(res, titleErr);
      db.get('SELECT COUNT(*) as count FROM seigneurs WHERE overlord_id=?', [seigneurId], (vassalErr, vassalRow) => {
        if (vassalErr) return handleError(res, vassalErr);
        const titleCount = titleRow?.count || 0;
        const vassalCount = vassalRow?.count || 0;
        res.json({
          eligible: titleCount > 0 && vassalCount > 0,
          seigneur_id: seigneurId,
          title_count: titleCount,
          vassal_count: vassalCount
        });
      });
    });
  });

  const defaultUpdate = getLatestUnlockedUpdate(new Date());
  db.run(
    `INSERT OR IGNORE INTO seigneuries_info (player_id)
     SELECT id
     FROM players
     WHERE COALESCE(player_type, 'seigneurie')='seigneurie'`
  );
  db.all("PRAGMA table_info(players)", (err, rows) => {
    if (err || !rows) return;
    const hasLegacyInfo = rows.some(r => r.name === 'baronnie_id') && rows.some(r => r.name === 'tax_rate') && rows.some(r => r.name === 'spells_cast');
    if (!hasLegacyInfo) return;
    db.run(
      `UPDATE seigneuries_info
       SET baronnie_id=(SELECT p.baronnie_id FROM players p WHERE p.id=seigneuries_info.player_id),
           tax_rate=COALESCE((SELECT p.tax_rate FROM players p WHERE p.id=seigneuries_info.player_id), 5),
           spells_cast=COALESCE((SELECT p.spells_cast FROM players p WHERE p.id=seigneuries_info.player_id), 0)
       WHERE player_id IN (SELECT id FROM players WHERE COALESCE(player_type, 'seigneurie')='seigneurie')`,
      [],
      (insertErr) => {
        if (insertErr) logger.error('Failed to sync seigneuries_info from legacy players columns', insertErr);
      }
    );
  });
  db.run(
    "UPDATE players SET player_type='seigneurie' WHERE player_type IS NULL OR player_type=''",
    []
  );
  db.run(
    'UPDATE players SET update_year=COALESCE(update_year, ?), update_number=COALESCE(update_number, ?) WHERE update_year IS NULL OR update_number IS NULL',
    [defaultUpdate.year, defaultUpdate.number]
  );
  db.run(
    `UPDATE trade_transactions
     SET origin_update_year=COALESCE(origin_update_year, ?),
         origin_update_number=COALESCE(origin_update_number, ?)
     WHERE origin_update_year IS NULL OR origin_update_number IS NULL`,
    [defaultUpdate.year, defaultUpdate.number]
  );
  db.run(
    "UPDATE trade_transactions SET received=1 WHERE state='Approuvée' AND COALESCE(received, 0)=0"
  );
});

app.get('/api/notifications', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  db.all('SELECT id, message, link, is_read, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC', [req.session.user.id], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.post('/api/notifications/:id/read', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const id = parseInt(req.params.id, 10);
  db.run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [id, req.session.user.id], function(err){
    if (err) return handleError(res, err);
    res.json({ changes: this.changes });
  });
});

app.post('/api/admin_mode', (req,res) => {
  if(!isAdminActive(req.session.user)){
    return res.status(403).json({ error: 'Forbidden' });
  }
  req.session.user = applyAdminOverride({ ...req.session.user, act_as_admin: !!req.body.admin_mode });
  res.json({ ok: true });
});

app.get('/api/test_mode', (req, res) => {
  res.json({ enabled: !!req.session.test_mode });
});

app.post('/api/test_mode', (req, res) => {
  if (!isAdminUser(req.session.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  req.session.test_mode = !!req.body.test_mode;
  res.json({ ok: true });
});

app.get('/api/users', requireAdmin, (req, res) => {
  db.all('SELECT id, email, first_name, last_name, is_admin FROM users', [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows.map(u => {
      const adminUser = applyAdminOverride(u);
      return { ...adminUser, is_admin: !!adminUser.is_admin };
    }));
  });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid user id' });
  const { email, first_name, last_name, is_admin } = req.body;
  const fields = [];
  const values = [];
  if (email !== undefined) { fields.push('email=?'); values.push(email); }
  if (first_name !== undefined) { fields.push('first_name=?'); values.push(first_name); }
  if (last_name !== undefined) { fields.push('last_name=?'); values.push(last_name); }
  if (fields.length === 0 && is_admin === undefined) {
    return res.json({ ok: true });
  }
  if (id <= 3) {
    fields.push('is_admin=1');
  } else if (is_admin !== undefined) {
    fields.push('is_admin=?');
    values.push(is_admin ? 1 : 0);
  }
  values.push(id);
  db.run(`UPDATE users SET ${fields.join(',')} WHERE id=?`, values, function(err){
    if (err) return handleError(res, err);
    enforceDefaultAdmins();
    res.json({ changes: this.changes, id });
  });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Identifiant utilisateur invalide.' });
  }
  if (id <= 3) {
    return res.status(400).json({ error: 'Suppression impossible : utilisateur système.' });
  }
  if (req.session.user && req.session.user.id === id) {
    return res.status(400).json({ error: 'Suppression impossible : utilisateur connecté.' });
  }
  db.get('SELECT id, email, first_name, last_name, is_admin FROM users WHERE id=?', [id], (err, user) => {
    if (err) return handleError(res, err);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const references = [
      { table: 'seigneurs', column: 'user_id', label: 'seigneur(s)' },
      { table: 'notifications', column: 'user_id', label: 'notification(s)' },
      { table: 'user_table_preferences', column: 'user_id', label: 'préférence(s) de table' }
    ];
    Promise.all(references.map(ref => new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM ${ref.table} WHERE ${ref.column}=?`, [id], (err2, row) => {
        if (err2) return reject(err2);
        resolve({ ...ref, count: row?.count || 0 });
      });
    })))
      .then(results => {
        const blocking = results.filter(r => r.count > 0);
        if (blocking.length) {
          const details = blocking.map(r => `${r.count} ${r.label}`).join(', ');
          return res.status(400).json({
            error: `Suppression impossible : cet utilisateur est encore référencé par ${details}.`
          });
        }
        db.run('DELETE FROM users WHERE id=?', [id], function (err3) {
          if (err3) return handleError(res, err3);
          if (this.changes > 0) {
            recordChange(req, { table: 'users', action: 'delete', before: user, after: null });
          }
          res.json({ changes: this.changes });
        });
      })
      .catch(error => handleError(res, error));
  });
});

app.get('/api/admin/table_preferences', requireAdmin, (req, res) => {
  const userId = req.session.user.id;
  db.all(
    'SELECT table_name, hidden_columns FROM user_table_preferences WHERE user_id=?',
    [userId],
    (err, rows) => {
      if (err) return handleError(res, err);
      const preferences = {};
      rows.forEach(row => {
        let parsed = [];
        try {
          const raw = JSON.parse(row.hidden_columns || '[]');
          parsed = Array.isArray(raw) ? raw.filter(col => typeof col === 'string') : [];
        } catch (error) {
          parsed = [];
        }
        preferences[row.table_name] = parsed;
      });
      res.json({ preferences });
    }
  );
});

app.put('/api/admin/table_preferences/:table', requireAdmin, (req, res) => {
  const tableName = String(req.params.table || '').trim();
  if (!tableName) {
    return res.status(400).json({ error: 'Nom de table manquant.' });
  }
  if (!Array.isArray(req.body.hidden_columns)) {
    return res.status(400).json({ error: 'Liste de colonnes invalide.' });
  }
  const hiddenColumns = req.body.hidden_columns.filter(col => typeof col === 'string');
  const userId = req.session.user.id;
  db.run(
    `INSERT INTO user_table_preferences (user_id, table_name, hidden_columns)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, table_name)
     DO UPDATE SET hidden_columns=excluded.hidden_columns, updated_at=CURRENT_TIMESTAMP`,
    [userId, tableName, JSON.stringify(hiddenColumns)],
    (err) => {
      if (err) return handleError(res, err);
      res.json({ ok: true, hidden_columns: hiddenColumns });
    }
  );
});

app.post('/api/profile', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { first_name, last_name, password, current_password } = req.body;
  const fields = [];
  const values = [];
  if (first_name) {
    fields.push('first_name=?');
    values.push(first_name);
    req.session.user.first_name = first_name;
  }
  if (last_name) {
    fields.push('last_name=?');
    values.push(last_name);
    req.session.user.last_name = last_name;
  }

  const finalize = () => {
    if (fields.length === 0) return res.json({ ok: true });
    values.push(req.session.user.id);
    db.run(`UPDATE users SET ${fields.join(',')} WHERE id=?`, values, function (err) {
      if (err) return handleError(res, err);
      res.json({ ok: true });
    });
  };

  if (password) {
    if (!current_password) return res.status(400).json({ error: 'Missing current password' });
    db.get('SELECT password FROM users WHERE id=?', [req.session.user.id], (err, row) => {
      if (err) return handleError(res, err);
      if (!row || !bcrypt.compareSync(current_password, row.password)) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }
      fields.push('password=?');
      values.push(bcrypt.hashSync(password, 10));
      finalize();
    });
  } else {
    finalize();
  }
});

app.use('/api/empires', crudRoutes('empires',['name','seigneur_id','color']));
app.use('/api/kingdoms', crudRoutes('kingdoms',['name','seigneur_id','empire_id','defacto_empire_id','color']));
app.use('/api/archduchies', crudRoutes('archduchies',['name','seigneur_id','defacto_kingdom_id','color']));
app.use('/api/duchies', crudRoutes('duchies',['name','seigneur_id','kingdom_id','archduchy_id','banquet_religion_id','defacto_kingdom_id','defacto_archduchy_id','color']));
app.use('/api/marquisates', crudRoutes('marquisates',['name','seigneur_id','defacto_duchy_id','color']));
app.use('/api/counties', crudRoutes('counties',['name','seigneur_id','duchy_id','marquisate_id','defacto_duchy_id','defacto_marquisate_id','color']));
app.use('/api/viscounties', crudRoutes('viscounties',['name','seigneur_id','defacto_county_id','color']));
app.use('/api/religions', crudRoutes('religions',['name','color']));
app.use('/api/cultures', crudRoutes('cultures',['name','color']));
app.delete('/api/seigneurs/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Identifiant de seigneur invalide.' });
  }
  db.get('SELECT * FROM seigneurs WHERE id=?', [id], (err, seigneur) => {
    if (err) return handleError(res, err);
    if (!seigneur) return res.status(404).json({ error: 'Seigneur introuvable.' });
    const references = [
      { table: 'players', column: 'seigneur_id', label: 'seigneurie(s)' },
      { table: 'empires', column: 'seigneur_id', label: 'empire(s)' },
      { table: 'kingdoms', column: 'seigneur_id', label: 'royaume(s)' },
      { table: 'archduchies', column: 'seigneur_id', label: 'archiduché(s)' },
      { table: 'duchies', column: 'seigneur_id', label: 'duché(s)' },
      { table: 'marquisates', column: 'seigneur_id', label: 'marquisat(s)' },
      { table: 'counties', column: 'seigneur_id', label: 'comté(s)' },
      { table: 'viscounties', column: 'seigneur_id', label: 'vicomté(s)' },
      { table: 'baronies', column: 'seigneur_id', label: 'baronnie(s)' },
      { table: 'maritime_zones', column: 'seigneur_id', label: 'zone(s) maritimes' },
      { table: 'seigneurs', column: 'overlord_id', label: 'vassal(aux)' }
    ];
    Promise.all(references.map(ref => new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM ${ref.table} WHERE ${ref.column}=?`, [id], (err2, row) => {
        if (err2) return reject(err2);
        resolve({ ...ref, count: row?.count || 0 });
      });
    })))
      .then(results => {
        const blocking = results.filter(r => r.count > 0);
        if (blocking.length) {
          const details = blocking.map(r => `${r.count} ${r.label}`).join(', ');
          return res.status(400).json({
            error: `Suppression impossible : ce seigneur est encore référencé par ${details}.`
          });
        }
        db.run('DELETE FROM seigneurs WHERE id=?', [id], function (err3) {
          if (err3) return handleError(res, err3);
          if (this.changes > 0) {
            recordChange(req, { table: 'seigneurs', action: 'delete', before: seigneur, after: null });
          }
          res.json({ changes: this.changes });
        });
      })
      .catch(error => handleError(res, error));
  });
});
app.use('/api/seigneurs', crudRoutes('seigneurs',['name','religion_id','overlord_id','user_id','player','bishop']));
app.use('/api/inventaire', crudRoutes('inventaire', inventaireFields));

app.get('/api/seigneuries', requireAdmin, (req, res) => {
  const invSelect = inventaireFields.map(f => `i.${f}`).join(',');
  db.all(`SELECT s.id, s.baronnie_id, s.seigneur_id, s.population, s.update_year, s.update_number, s.inventaire_id, s.buildings, s.infrastructures, ${invSelect} FROM seigneuries s JOIN inventaire i ON s.inventaire_id=i.id`, [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.post('/api/seigneuries', requireAdmin, (req, res) => {
  const defaultUpdate = getLatestUnlockedUpdate(new Date());
  const playerFields = ['seigneur_id','population','update_year','update_number'];
  const playerValues = [
    sanitize(req.body.seigneur_id),
    sanitize(req.body.population),
    sanitize(req.body.update_year) ?? defaultUpdate.year,
    sanitize(req.body.update_number) ?? defaultUpdate.number
  ];
  const baronnieId = sanitize(req.body.baronnie_id);
  const invValues = inventaireFields.map(f => sanitize(req.body[f]) || 0);
  const invPlace = inventaireFields.map(() => '?').join(',');
  db.run(`INSERT INTO inventaire (${inventaireFields.join(',')}) VALUES (${invPlace})`, invValues, function(err){
    if (err) return handleError(res, err);
    const invId = this.lastID;
  db.run("INSERT INTO players (seigneur_id,population,update_year,update_number,player_type,inventaire_id,buildings,infrastructures) VALUES (?,?,?,?, 'seigneurie',?,?,?)",
    [...playerValues, invId, '{}', '{}'], function(err2){
      if (err2) return handleError(res, err2);
      const seigneurieId = this.lastID;
      db.run('INSERT INTO seigneuries_info (player_id, baronnie_id) VALUES (?,?)', [seigneurieId, baronnieId], (err3) => {
        if (err3) return handleError(res, err3);
        db.get('SELECT * FROM seigneuries WHERE id=?', [seigneurieId], (err4, seigRow) => {
        db.get('SELECT * FROM inventaire WHERE id=?', [invId], (err5, invRow) => {
          if (err4 || err5) {
            recordChange(req, { table: 'seigneuries', action: 'create', before: null, after: { id: seigneurieId, ...Object.fromEntries(playerFields.map((f, i) => [f, playerValues[i]])), baronnie_id: baronnieId, inventaire_id: invId } });
            recordChange(req, { table: 'inventaire', action: 'create', before: null, after: { id: invId, ...Object.fromEntries(inventaireFields.map((f, i) => [f, invValues[i]])) } });
            return res.json({ id: seigneurieId, inventaire_id: invId });
          }
          Promise.all([
            recordChange(req, { table: 'seigneuries', action: 'create', before: null, after: seigRow }),
            recordChange(req, { table: 'inventaire', action: 'create', before: null, after: invRow })
          ]).finally(() => res.json({ id: seigneurieId, inventaire_id: invId }));
        });
        });
      });
    });
  });
});

app.put('/api/seigneuries/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const playerFields = ['seigneur_id','population','update_year','update_number'];
  const playerSet = playerFields.map(f => `${f}=?`).join(',');
  const playerValues = playerFields.map(f => sanitize(req.body[f]));
  const infoFields = ['baronnie_id'];
  const infoSet = infoFields.map(f => `${f}=?`).join(',');
  const infoValues = infoFields.map(f => sanitize(req.body[f]));
  db.get('SELECT * FROM seigneuries WHERE id=?', [id], (err, seigRow) => {
    if (err) return handleError(res, err);
    if (!seigRow) return res.status(404).json({ error: 'Introuvable' });
    db.get('SELECT * FROM inventaire WHERE id=?', [seigRow.inventaire_id], (err2, invRow) => {
      if (err2) return handleError(res, err2);
      const seigAfter = { ...seigRow };
      [...playerFields, ...infoFields].forEach((f, idx) => {
        const values = idx < playerFields.length ? playerValues : infoValues;
        const field = idx < playerFields.length ? playerFields[idx] : infoFields[idx - playerFields.length];
        seigAfter[field] = values[idx < playerFields.length ? idx : idx - playerFields.length];
      });
      const seigChanges = diffRecords(seigRow, seigAfter, [...playerFields, ...infoFields]);
      const invValues = inventaireFields.map(f => sanitize(req.body[f]) || 0);
      const invAfter = invRow ? { ...invRow } : null;
      inventaireFields.forEach((f, idx) => {
        if (invAfter) invAfter[f] = invValues[idx];
      });
      const invChanges = invRow ? diffRecords(invRow, invAfter, inventaireFields) : {};
      const hasSeigChanges = Object.keys(seigChanges).length > 0;
      const hasInvChanges = Object.keys(invChanges).length > 0;
      if (!hasSeigChanges && !hasInvChanges) {
        return res.json({ changes: 0 });
      }
      const invSet = inventaireFields.map(f => `${f}=?`).join(',');
      const runUpdates = (cb) => {
        const tasks = [];
        if (hasSeigChanges) {
          tasks.push((next) => db.run(`UPDATE players SET ${playerSet} WHERE id=?`, [...playerValues, id], (err3) => {
            if (err3) return next(err3);
            db.run(`UPDATE seigneuries_info SET ${infoSet} WHERE player_id=?`, [...infoValues, id], next);
          }));
        }
        if (hasInvChanges && invAfter) {
          tasks.push((next) => db.run(`UPDATE inventaire SET ${invSet} WHERE id=?`, [...invValues, invAfter.id], next));
        }
        let idx = 0;
        const advance = (errUpdate) => {
          if (errUpdate) return cb(errUpdate);
          const task = tasks[idx++];
          if (!task) return cb();
          task(advance);
        };
        advance();
      };
      runUpdates((errUpdate) => {
        if (errUpdate) return handleError(res, errUpdate);
        Promise.all([
          hasSeigChanges ? recordChange(req, { table: 'seigneuries', action: 'update', before: seigRow, after: seigAfter, changes: seigChanges }) : Promise.resolve(),
          hasInvChanges ? recordChange(req, { table: 'inventaire', action: 'update', before: invRow, after: invAfter, changes: invChanges }) : Promise.resolve()
        ]).finally(() => {
          const totalChanges = (hasSeigChanges ? 1 : 0) + (hasInvChanges ? 1 : 0);
          res.json({ changes: totalChanges });
        });
      });
    });
  });
});

app.delete('/api/seigneuries/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Identifiant de seigneurie invalide.' });
  }
  db.get('SELECT * FROM seigneuries WHERE id=?', [id], (err, seigneurie) => {
    if (err) return handleError(res, err);
    if (!seigneurie) return res.status(404).json({ error: 'Seigneurie introuvable.' });
    const references = [
      { table: 'transactions', column: 'seigneurie_id', label: 'transaction(s)' },
      { table: 'trade_transactions', column: 'origin_id', label: 'échange(s) sortants' },
      { table: 'trade_transactions', column: 'destination_id', label: 'échange(s) entrants' }
    ];
    Promise.all(references.map(ref => new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM ${ref.table} WHERE ${ref.column}=?`, [id], (err2, row) => {
        if (err2) return reject(err2);
        resolve({ ...ref, count: row?.count || 0 });
      });
    })))
      .then(results => {
        const blocking = results.filter(r => r.count > 0);
        if (blocking.length) {
          const details = blocking.map(r => `${r.count} ${r.label}`).join(', ');
          return res.status(400).json({
            error: `Suppression impossible : cette seigneurie est encore référencée par ${details}.`
          });
        }
        const inventaireId = seigneurie.inventaire_id;
        db.get('SELECT * FROM inventaire WHERE id=?', [inventaireId], (errInv, inventaire) => {
          if (errInv) return handleError(res, errInv);
          let seigneurieChanges = 0;
          let inventaireChanges = 0;
          db.serialize(() => {
            db.run('BEGIN');
            db.run('DELETE FROM seigneuries_info WHERE player_id=?', [id], function (errInfoDel) {
              if (errInfoDel) {
                db.run('ROLLBACK');
                return handleError(res, errInfoDel);
              }
              db.run('DELETE FROM players WHERE id=?', [id], function (errDel) {
              if (errDel) {
                db.run('ROLLBACK');
                return handleError(res, errDel);
              }
              seigneurieChanges = this.changes;
              db.run('DELETE FROM inventaire WHERE id=?', [inventaireId], function (errInvDel) {
                if (errInvDel) {
                  db.run('ROLLBACK');
                  return handleError(res, errInvDel);
                }
                inventaireChanges = this.changes;
                db.run('COMMIT', (errCommit) => {
                  if (errCommit) {
                    db.run('ROLLBACK');
                    return handleError(res, errCommit);
                  }
                  if (seigneurieChanges > 0) {
                    recordChange(req, { table: 'seigneuries', action: 'delete', before: seigneurie, after: null });
                  }
                  if (inventaire && inventaireChanges > 0) {
                    recordChange(req, { table: 'inventaire', action: 'delete', before: inventaire, after: null });
                  }
                  res.json({ changes: seigneurieChanges, inventaire_changes: inventaireChanges });
                });
              });
            });
            });
          });
        });
      })
      .catch(error => handleError(res, error));
  });
});

app.get('/api/my_seigneurie', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const userId = req.session.user.id;
  const overrideId = isAdminActive(req.session.user) && req.query.seigneurie_id ? parseInt(req.query.seigneurie_id, 10) : null;
  db.serialize(() => {
    function respond(seig, s) {
      db.get('SELECT * FROM inventaire WHERE id=?', [s.inventaire_id], (err, inventaire) => {
        if (err) return handleError(res, err);
        const buildings = s.buildings ? JSON.parse(s.buildings) : {};
        const infrastructures = s.infrastructures ? JSON.parse(s.infrastructures) : {};
        db.all('SELECT id, type, label, produces, production, workers_per_building FROM building_properties', [], (err2, bprops) => {
          if (err2) return handleError(res, err2);
          const props = bprops || [];
          const bpMap = Object.fromEntries(props.map(b => [String(b.id), b]));
          let fields = { built: 0, active: 0 };
          const production = {};
          const productionDetails = {};
          let employed = inventaire.hommes_darmes || 0;
          const employmentDetails = [];
          if (inventaire.hommes_darmes) {
            employmentDetails.push({ label: "Hommes d'armes", amount: inventaire.hommes_darmes, source: inventaire.hommes_darmes });
          }
          for (const bp of props) {
            const info = buildings[bp.id] || { built: 0, active: 0 };
            const active = info.active || 0;
            const workers = active * (bp.workers_per_building || 0);
            employed += workers;
            if (workers) {
              employmentDetails.push({ label: bp.label || bp.type, amount: workers, source: active });
            }
            if (bp.type === 'field') {
              fields = info;
            }
            const prodRes = bp.produces;
            if (active > 0 && prodRes && bp.production) {
              const amount = active * bp.production;
              production[prodRes] = (production[prodRes] || 0) + amount;
              if (!productionDetails[prodRes]) productionDetails[prodRes] = [];
              productionDetails[prodRes].push({ label: bp.label || bp.type, amount, source: active });
            }
          }
          db.all('SELECT * FROM infrastructure_properties', [], (errI, iprops) => {
            if (errI) return handleError(res, errI);
            const infraList = iprops || [];
            const capacities = { vivres: 500, points_magique: 2000, hommes_darmes: 0, chevaux: 0, trebuchets: 0 };
            const spellsCast = s.spells_cast || 0;
            const landTransactions = s.land_transactions || 0;
            const navalTransactions = s.naval_transactions || 0;
            const buildingProductionBonus = {};
            const buildingProductionBonusDetails = {};
            const effectCtx = {
              production,
              productionDetails,
              capacity: capacities,
              buildings,
              bpMap,
              buildingProductionBonus,
              buildingProductionBonusDetails,
              infraProductionMultipliers: {},
              infraProductionByInfra: {},
              idh: 5,
              idhDetails: [{ label: 'Base', amount: 5, source: 1 }],
              unlockedPages: {},
              spellSuccessBonus: 0,
              basicSpellDiscount: 0,
              advancedSpellDiscount: 0,
              spellRangeBonus: 0,
              spellMax: 0,
              landTxMax: 0,
              navalTxMax: 0,
              spellSuccessDetails: [{ label: 'Base', amount: 75, source: 1 }],
              basicSpellDiscountDetails: [{ label: 'Base', amount: 0, source: 1 }],
              advancedSpellDiscountDetails: [{ label: 'Base', amount: 0, source: 1 }],
              spellRangeDetails: [{ label: 'Base', amount: 5, source: 1 }],
              spellMaxDetails: [{ label: 'Base', amount: 0, source: 1 }],
              landTxMaxDetails: [{ label: 'Base', amount: 0, source: 1 }],
              navalTxMaxDetails: [{ label: 'Base', amount: 0, source: 1 }],
              tagCounts: {}
            };
            for (const ip of infraList) {
              effectCtx.currentInfraId = ip.id;
              const entry = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
              const count = typeof entry === 'object' ? (entry.built || 0) : entry;
              if (!count) { delete effectCtx.currentInfraId; continue; }
              const workers = count * (ip.workers_per_building || 0);
              if (workers) {
                employed += workers;
                employmentDetails.push({ label: ip.label || ip.type, amount: workers, source: count });
              }
              const entryObj = typeof entry === 'object' ? entry : {};
              const effects = safeParse(ip.effects, []);
              effects.forEach((def, idx) => {
                let effObj = null;
                if (def.type === 'storage') {
                  effObj = new StorageEffect(def.resource, def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'production') {
                  effObj = new ResourceProductionEffect(def.resource, def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'building_production') {
                  effObj = new BuildingProductionEffect(def.building, def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'infra_production') {
                  effObj = new InfraProductionEffect(def.infrastructure, def.amount || 1);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'idh') {
                  effObj = new IDHEffect(def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'unlock_page') {
                  effObj = new UnlockPageEffect(def.page);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'spell_success') {
                  effObj = new SpellSuccessEffect(def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'spell_basic_discount') {
                  effObj = new SpellBasicDiscountEffect(def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'spell_advanced_discount') {
                  effObj = new SpellAdvancedDiscountEffect(def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'spell_range') {
                  effObj = new SpellRangeEffect(def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'spell_max_per_month') {
                  effObj = new SpellMaxPerMonthEffect(def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'land_transaction_max_per_month') {
                  effObj = new LandTransactionMaxPerMonthEffect(def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'naval_transaction_max_per_month') {
                  effObj = new NavalTransactionMaxPerMonthEffect(def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'tag') {
                  effObj = new TagEffect(def.tag, def.amount || 1);
                  if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
                } else if (def.type === 'variable_workers') {
                  const max = (def.max_workers || 0) * count;
                  let assigned = entryObj[`effect_${idx}_workers`] || 0;
                  if (assigned > max) assigned = max;
                  if (assigned) {
                    employed += assigned;
                    employmentDetails.push({ label: ip.label || ip.type, amount: assigned, source: assigned });
                  }
                  effObj = new VariableWorkersEffect(def.resource, def.amount || 0);
                  if (effObj) effObj.apply(effectCtx, assigned, ip.label || ip.type);
                }
              });
              delete effectCtx.currentInfraId;
            }
            const slaves = inventaire.esclaves || 0;
            if (slaves) {
              employmentDetails.push({ label: 'Esclaves', amount: -slaves, source: slaves });
            }
            const populationCons = s.population * 15;
            const slaveCons = slaves * 5;
            if (populationCons || slaveCons) {
              production.vivres = (production.vivres || 0) - (populationCons + slaveCons);
              if (!productionDetails.vivres) productionDetails.vivres = [];
              if (populationCons) {
                productionDetails.vivres.push({ label: 'Population', amount: -populationCons, source: s.population });
              }
              if (slaveCons) {
                productionDetails.vivres.push({ label: 'Esclaves', amount: -slaveCons, source: slaves });
              }
            }
            const taxRate = typeof s.tax_rate === 'number' ? s.tax_rate : parseInt(s.tax_rate, 10) || 0;
            const taxGold = Math.floor((s.population || 0) * taxRate / 100);
            if (taxGold) {
              production.or_ = (production.or_ || 0) + taxGold;
              if (!productionDetails.or_) productionDetails.or_ = [];
              productionDetails.or_.push({ label: 'Taxes', amount: taxGold, source: taxRate });
            }
            const employment = { employed: Math.max(employed - slaves, 0), slaves };
            function finalize(barony, baronyProps) {
              if (effectCtx.infrastructureProductionMultipliers && effectCtx.infraProductionByInfra) {
                Object.entries(effectCtx.infrastructureProductionMultipliers).forEach(([iid, mult]) => {
                  if (mult === 1) return;
                  const arr = effectCtx.infraProductionByInfra[iid];
                  if (!arr) return;
                  arr.forEach(entry => {
                    const added = entry.amount * (mult - 1);
                    production[entry.resource] = (production[entry.resource] || 0) + added;
                    if (!productionDetails[entry.resource]) productionDetails[entry.resource] = [];
                    const detail = productionDetails[entry.resource].find(d => d.label === entry.label);
                    if (detail) {
                      detail.amount += added;
                    } else {
                      productionDetails[entry.resource].push({ label: entry.label, amount: entry.amount * mult, source: entry.source });
                    }
                  });
                });
              }
              const idhDetails = effectCtx.idhDetails || [];
              let idh = effectCtx.idh;
              if (taxRate === 0) {
                idh += 3;
                idhDetails.push({ label: 'Taxes', amount: 3, source: taxRate });
              } else if (taxRate <= 2) {
                idh += 2;
                idhDetails.push({ label: 'Taxes', amount: 2, source: taxRate });
              } else if (taxRate <= 4) {
                idh += 1;
                idhDetails.push({ label: 'Taxes', amount: 1, source: taxRate });
              } else {
                const malus = -(taxRate - 5);
                idh += malus;
                idhDetails.push({ label: 'Taxes', amount: malus, source: taxRate });
              }
              const popPenalty = -Math.min(Math.floor(s.population / 1000), 5);
              if (popPenalty) {
                idh += popPenalty;
                idhDetails.push({ label: 'Population', amount: popPenalty, source: s.population });
              }
              if (!seig.religion_id) {
                idh -= 1;
                idhDetails.push({ label: 'Sans religion', amount: -1, source: 1 });
              }
              if (barony && seig.religion_id !== barony.religion_pop_id) {
                idh -= 1;
                idhDetails.push({ label: 'Religion différente', amount: -1, source: 1 });
              }
              const totalPop = s.population + slaves;
              if (totalPop > 0) {
                let slavePenalty = Math.floor((20 * slaves) / totalPop) - 1;
                if (slavePenalty < 0) slavePenalty = 0;
                if (slavePenalty > 5) slavePenalty = 5;
                if (slavePenalty) {
                  idh -= slavePenalty;
                  idhDetails.push({ label: 'Esclaves', amount: -slavePenalty, source: slaves });
                }
              }
              const spellSuccess = 75 + (effectCtx.spellSuccessBonus || 0);
              const basicSpellDiscount = effectCtx.basicSpellDiscount || 0;
              const advancedSpellDiscount = effectCtx.advancedSpellDiscount || 0;
              const spellRange = 5 + (effectCtx.spellRangeBonus || 0);
              const spellMax = effectCtx.spellMax || 0;
              const landTxMax = effectCtx.landTxMax || 0;
              const navalTxMax = effectCtx.navalTxMax || 0;
              const blockers = [];
              if ((employment && employment.employed > (s.population || 0))) {
                blockers.push({
                  code: 'population_overload',
                  message: 'La mise a jour est impossible tant que la population employeee depasse la population totale.'
                });
              }
              const updateStatus = buildUpdateStatus(s, blockers);
              if (!updateStatus.canAdvance) {
                const hasDateBlocker = updateStatus.blockers.some((entry) => entry.code === 'date_locked');
                if (!hasDateBlocker && !isUpdateUnlocked(updateStatus.next)) {
                  updateStatus.blockers.push({
                    code: 'date_locked',
                    message: `La prochaine mise a jour (${updateStatus.nextLabel}) sera disponible a partir du ${updateStatus.unlockLabel}.`
                  });
                }
              }
              res.json({
                seigneur: seig,
                seigneurie: s,
                barony,
                inventaire,
                production,
                productionDetails,
                fields,
                baronyProps,
                employment,
                employmentDetails,
                buildings,
                infrastructures,
                capacities,
                buildingProductionBonus,
                buildingProductionBonusDetails,
                idh,
                idhDetails,
                unlockedPages: effectCtx.unlockedPages,
                spellSuccess,
                basicSpellDiscount,
                advancedSpellDiscount,
                spellRange,
                spellMax,
                landTxMax,
                navalTxMax,
                landTransactions,
                navalTransactions,
                spellsCast,
                updateStatus,
                spellSuccessDetails: effectCtx.spellSuccessDetails || [],
                basicSpellDiscountDetails: effectCtx.basicSpellDiscountDetails || [],
                advancedSpellDiscountDetails: effectCtx.advancedSpellDiscountDetails || [],
                spellRangeDetails: effectCtx.spellRangeDetails || [],
                spellMaxDetails: effectCtx.spellMaxDetails || [],
                landTxMaxDetails: effectCtx.landTxMaxDetails || [],
                navalTxMaxDetails: effectCtx.navalTxMaxDetails || []
              });
            }
            if (s.baronnie_id) {
              db.get('SELECT * FROM barony_properties WHERE barony_id=?', [s.baronnie_id], (err3, props) => {
                if (err3) return handleError(res, err3);
                const baronyProps = props || {};
                const baronyEffects = safeParse(baronyProps.effects, []);
                for (const def of baronyEffects) {
                  let effObj = null;
                  if (def.type === 'storage') {
                    effObj = new StorageEffect(def.resource, def.amount || 0);
                  } else if (def.type === 'production') {
                    effObj = new ResourceProductionEffect(def.resource, def.amount || 0);
                  } else if (def.type === 'building_production') {
                    effObj = new BuildingProductionEffect(def.building, def.amount || 0);
                  } else if (def.type === 'infra_production') {
                    effObj = new InfraProductionEffect(def.infrastructure, def.amount || 1);
                  } else if (def.type === 'idh') {
                    effObj = new IDHEffect(def.amount || 0);
                  } else if (def.type === 'unlock_page') {
                    effObj = new UnlockPageEffect(def.page);
                  } else if (def.type === 'spell_success') {
                    effObj = new SpellSuccessEffect(def.amount || 0);
                  } else if (def.type === 'spell_basic_discount') {
                    effObj = new SpellBasicDiscountEffect(def.amount || 0);
                  } else if (def.type === 'spell_advanced_discount') {
                    effObj = new SpellAdvancedDiscountEffect(def.amount || 0);
                  } else if (def.type === 'spell_range') {
                    effObj = new SpellRangeEffect(def.amount || 0);
                  } else if (def.type === 'spell_max_per_month') {
                    effObj = new SpellMaxPerMonthEffect(def.amount || 0);
                  } else if (def.type === 'land_transaction_max_per_month') {
                    effObj = new LandTransactionMaxPerMonthEffect(def.amount || 0);
                  } else if (def.type === 'naval_transaction_max_per_month') {
                    effObj = new NavalTransactionMaxPerMonthEffect(def.amount || 0);
                  } else if (def.type === 'tag') {
                    effObj = new TagEffect(def.tag, def.amount || 1);
                  }
                  if (effObj) {
                    effObj.apply(effectCtx, 1, 'Baronnie');
                  }
                }
                db.get(`SELECT b.*, r.name as religion_name, c.name as culture_name, ct.name as county_name, d.name as duchy_name, k.name as kingdom_name FROM baronies b LEFT JOIN religions r ON b.religion_pop_id=r.id LEFT JOIN cultures c ON b.culture_id=c.id LEFT JOIN counties ct ON b.county_id=ct.id LEFT JOIN duchies d ON ct.duchy_id=d.id LEFT JOIN kingdoms k ON d.kingdom_id=k.id WHERE b.id=?`, [s.baronnie_id], (err4, barony) => {
                  if (err4) return handleError(res, err4);
                  finalize(barony, baronyProps);
                });
              });
            } else {
              finalize(null, {});
            }
          });
        });
      });
    }

    if (overrideId) {
      db.get('SELECT seigneuries.*, seigneurs.name as seigneur_name, seigneurs.religion_id as religion_id, r.name as religion_name, ov.name as overlord_name FROM seigneuries JOIN seigneurs ON seigneurs.id=seigneuries.seigneur_id LEFT JOIN religions r ON seigneurs.religion_id=r.id LEFT JOIN seigneurs ov ON seigneurs.overlord_id=ov.id WHERE seigneuries.id=?', [overrideId], (err, row) => {
        if (err) return handleError(res, err);
        if (!row) return res.status(404).json({ error: 'Introuvable' });
        const seig = { id: row.seigneur_id, name: row.seigneur_name, religion_id: row.religion_id, religion_name: row.religion_name, overlord_name: row.overlord_name };
        const s = {
          id: row.id,
          baronnie_id: row.baronnie_id,
          seigneur_id: row.seigneur_id,
          population: row.population,
          update_year: row.update_year,
          update_number: row.update_number,
          inventaire_id: row.inventaire_id,
          buildings: row.buildings,
          infrastructures: row.infrastructures,
          tax_rate: row.tax_rate,
          spells_cast: row.spells_cast,
          land_transactions: row.land_transactions,
          naval_transactions: row.naval_transactions
        };
        respond(seig, s);
      });
    } else {
      db.get('SELECT * FROM seigneurs WHERE user_id=?', [userId], (err, seigneur) => {
        if (err) return handleError(res, err);
        if (!seigneur) {
          return res.json({ seigneur: null, seigneurie: null });
        }
        db.get('SELECT s.id, s.name, s.religion_id, r.name as religion_name, o.name as overlord_name FROM seigneurs s LEFT JOIN religions r ON s.religion_id=r.id LEFT JOIN seigneurs o ON s.overlord_id=o.id WHERE s.id=?', [seigneur.id], (err2, seigRow) => {
          if (err2) return handleError(res, err2);
          const fullSeig = seigRow || seigneur;
          db.get('SELECT * FROM seigneuries WHERE seigneur_id=?', [seigneur.id], (err3, seigneurie) => {
            if (err3) return handleError(res, err3);
            if (!seigneurie) {
              return res.json({ seigneur: fullSeig, seigneurie: null });
            }
            respond(fullSeig, seigneurie);
          });
        });
      });
    }
  });
  enforceDefaultAdmins();
});

app.post('/api/tax_rate', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const rate = parseInt(req.body.tax_rate, 10);
  if (Number.isNaN(rate) || rate < 0 || rate > 12) {
    return res.status(400).json({ error: 'Taux invalide' });
  }
  getSeigneurie(req, 'seigneuries.id, seigneuries.update_year, seigneuries.update_number', (err, row) => {
    if (err) return handleError(res, err);
    if (!row) return res.status(400).json({ error: 'Seigneurie introuvable' });
    db.run('UPDATE seigneuries_info SET tax_rate=? WHERE player_id=?', [rate, row.id], err2 => {
      if (err2) return handleError(res, err2);
      res.json({ tax_rate: rate });
    });
  });
});

app.post('/api/seigneurie/advance_update', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorise' });
  getSeigneurie(
    req,
    'seigneuries.id, seigneuries.baronnie_id, seigneuries.population, seigneuries.tax_rate, seigneuries.inventaire_id, seigneuries.buildings, seigneuries.infrastructures, seigneuries.spells_cast, seigneuries.land_transactions, seigneuries.naval_transactions, seigneuries.update_year, seigneuries.update_number',
    (err, srow) => {
      if (err) return handleError(res, err);
      if (!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
      computeEmploymentFromState(db, srow, async (err2, employment) => {
        if (err2) return handleError(res, err2);
        if ((employment.employed || 0) > (srow.population || 0)) {
          return res.status(400).json({ error: 'La mise a jour est impossible tant que la population employeee depasse la population totale.' });
        }
        const currentUpdate = normalizeSeigneurieUpdate(srow);
        const nextUpdate = getNextUpdatePosition(currentUpdate);
        if (!isUpdateUnlocked(nextUpdate)) {
          return res.status(400).json({
            error: `La prochaine mise a jour (${formatUpdateLabel(nextUpdate)}) sera disponible a partir du ${getUnlockDateForUpdate(nextUpdate).toLocaleDateString('fr-CA')}.`
          });
        }
        try {
          await dbRunAsync('BEGIN TRANSACTION');
          const inventaire = await dbGetAsync('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id]);
          const inventoryState = { ...(inventaire || {}) };
          const buildings = safeParse(srow.buildings, {});
          const infrastructures = safeParse(srow.infrastructures, {});
          const buildingProps = await dbAllAsync('SELECT id, type, label, produces, production FROM building_properties', []);
          const infraProps = await dbAllAsync('SELECT * FROM infrastructure_properties', []);
          const bpMap = Object.fromEntries((buildingProps || []).map((entry) => [String(entry.id), entry]));
          const capacities = { vivres: 500, points_magique: 2000, hommes_darmes: 0, chevaux: 0, trebuchets: 0 };
          const production = {};
          const productionDetails = {};
          const buildingProductionBonus = {};
          const buildingProductionBonusDetails = {};
          const effectCtx = {
            production,
            productionDetails,
            capacity: capacities,
            buildings,
            bpMap,
            buildingProductionBonus,
            buildingProductionBonusDetails,
            infrastructureProductionMultipliers: {},
            infraProductionByInfra: {}
          };

          (buildingProps || []).forEach((bp) => {
            const info = buildings[bp.id] || buildings[String(bp.id)] || { active: 0 };
            const active = info.active || 0;
            if (!active || !bp.produces || !bp.production) return;
            const amount = active * bp.production;
            production[bp.produces] = (production[bp.produces] || 0) + amount;
          });

          (infraProps || []).forEach((ip) => {
            effectCtx.currentInfraId = ip.id;
            const entry = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
            const count = typeof entry === 'object' ? (entry.built || 0) : entry;
            if (!count) {
              delete effectCtx.currentInfraId;
              return;
            }
            const entryObj = typeof entry === 'object' ? entry : {};
            const effects = safeParse(ip.effects, []);
            effects.forEach((def, idx) => {
              let effObj = null;
              if (def.type === 'storage') {
                effObj = new StorageEffect(def.resource, def.amount || 0);
                if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
              } else if (def.type === 'production') {
                effObj = new ResourceProductionEffect(def.resource, def.amount || 0);
                if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
              } else if (def.type === 'building_production') {
                effObj = new BuildingProductionEffect(def.building, def.amount || 0);
                if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
              } else if (def.type === 'infra_production') {
                effObj = new InfraProductionEffect(def.infrastructure, def.amount || 1);
                if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
              } else if (def.type === 'variable_workers') {
                const maxWorkers = (def.max_workers || 0) * count;
                const assigned = Math.min(entryObj[`effect_${idx}_workers`] || 0, maxWorkers);
                effObj = new VariableWorkersEffect(def.resource, def.amount || 0);
                if (effObj) effObj.apply(effectCtx, assigned, ip.label || ip.type);
              }
            });
            delete effectCtx.currentInfraId;
          });

          const slaves = inventoryState.esclaves || 0;
          const populationConsumption = (srow.population || 0) * 15;
          const slaveConsumption = slaves * 5;
          if (populationConsumption || slaveConsumption) {
            production.vivres = (production.vivres || 0) - (populationConsumption + slaveConsumption);
          }
          const taxRate = typeof srow.tax_rate === 'number' ? srow.tax_rate : parseInt(srow.tax_rate, 10) || 0;
          const taxGold = Math.floor(((srow.population || 0) * taxRate) / 100);
          if (taxGold) {
            production.or_ = (production.or_ || 0) + taxGold;
          }

          if (srow.baronnie_id) {
            const baronyProps = await dbGetAsync('SELECT effects FROM barony_properties WHERE barony_id=?', [srow.baronnie_id]);
            const baronyEffects = safeParse(baronyProps && baronyProps.effects, []);
            baronyEffects.forEach((def) => {
              let effObj = null;
              if (def.type === 'storage') {
                effObj = new StorageEffect(def.resource, def.amount || 0);
              } else if (def.type === 'production') {
                effObj = new ResourceProductionEffect(def.resource, def.amount || 0);
              } else if (def.type === 'building_production') {
                effObj = new BuildingProductionEffect(def.building, def.amount || 0);
              } else if (def.type === 'infra_production') {
                effObj = new InfraProductionEffect(def.infrastructure, def.amount || 1);
              }
              if (effObj) effObj.apply(effectCtx, 1, 'Baronnie');
            });
          }

          if (effectCtx.infrastructureProductionMultipliers && effectCtx.infraProductionByInfra) {
            Object.entries(effectCtx.infrastructureProductionMultipliers).forEach(([iid, mult]) => {
              if (mult === 1) return;
              const entries = effectCtx.infraProductionByInfra[iid];
              if (!entries) return;
              entries.forEach((entry) => {
                const added = entry.amount * (mult - 1);
                production[entry.resource] = (production[entry.resource] || 0) + added;
              });
            });
          }

          const report = { events: [] };
          const overflow = {};
          Object.entries(production).forEach(([resource, rawDelta]) => {
            if (!inventaireFields.includes(resource)) return;
            const delta = Number(rawDelta) || 0;
            if (!delta) return;
            const currentAmount = inventoryState[resource] || 0;
            let nextAmount = currentAmount + delta;
            if (resource === 'vivres' && nextAmount < 0) {
              const shortage = Math.abs(nextAmount);
              const unfedPopulation = Math.ceil(shortage / 15);
              const deaths = Math.min(srow.population || 0, Math.ceil(unfedPopulation / 2));
              if (deaths > 0) {
                srow.population -= deaths;
                report.events.push({
                  type: 'famine',
                  title: 'Famine',
                  details: `${deaths} habitants sont morts faute de vivres.`
                });
              }
              nextAmount = 0;
            }
            if (nextAmount < 0) nextAmount = 0;
            const cap = capacities[resource];
            if (typeof cap === 'number' && nextAmount > cap) {
              overflow[resource] = (overflow[resource] || 0) + (nextAmount - cap);
              nextAmount = cap;
            }
            inventoryState[resource] = nextAmount;
          });

          if (Object.keys(overflow).length) {
            const details = Object.entries(overflow).map(([resource, amount]) => `${amount} ${resource}`).join(', ');
            report.events.push({
              type: 'overflow',
              title: 'Perte par debordement',
              details
            });
          }

          await dbRunAsync(
            `UPDATE inventaire SET ${inventaireFields.map((field) => `${field}=?`).join(', ')} WHERE id=?`,
            [...inventaireFields.map((field) => inventoryState[field] || 0), srow.inventaire_id]
          );
          await dbRunAsync(
            `UPDATE players
             SET population=?, update_year=?, update_number=?, land_transactions=0, naval_transactions=0
             WHERE id=?`,
            [srow.population || 0, nextUpdate.year, nextUpdate.number, srow.id]
          );
          await dbRunAsync('UPDATE seigneuries_info SET spells_cast=0 WHERE player_id=?', [srow.id]);

          await new Promise((resolve, reject) => {
            deliverApprovedTransactions(
              db,
              { ...srow, population: srow.population, update_year: nextUpdate.year, update_number: nextUpdate.number },
              capacities,
              inventoryState,
              (deliveryErr, deliverySummary) => {
                if (deliveryErr) return reject(deliveryErr);
                if (Object.keys(deliverySummary.overflow || {}).length) {
                  const details = Object.entries(deliverySummary.overflow).map(([resource, amount]) => `${amount} ${resource}`).join(', ');
                  report.events.push({
                    type: 'delivery_overflow',
                    title: 'Reception partielle',
                    details: `Certaines ressources recues ont ete perdues faute de place: ${details}.`
                  });
                }
                resolve();
              }
            );
          });

          await dbRunAsync('COMMIT');
          res.json({
            ok: true,
            report: {
              current_update: nextUpdate,
              current_update_label: formatUpdateLabel(nextUpdate),
              events: report.events
            }
          });
        } catch (error) {
          try {
            await dbRunAsync('ROLLBACK');
          } catch {}
          handleError(res, error);
        }
      });
    }
  );
});

app.post('/api/admin/seigneurie_update', requireAdmin, (req,res) => {
  const { id, population, esclaves, religion_id, culture_id, inventaire, buildings, infrastructures } = req.body;
  db.get('SELECT * FROM seigneuries WHERE id=?', [id], (err, seigRow) => {
    if(err) return handleError(res, err);
    if(!seigRow) return res.status(404).json({ error: 'Introuvable' });
    db.get('SELECT * FROM inventaire WHERE id=?', [seigRow.inventaire_id], (err2, invRow) => {
      if(err2) return handleError(res, err2);
      const needsBarony = (religion_id !== undefined || culture_id !== undefined) && seigRow.baronnie_id;
      const proceed = (baronyRow) => {
        const seigBefore = { ...seigRow };
        const seigAfter = { ...seigRow };
        if(population !== undefined){
          seigAfter.population = sanitize(population);
        }
        if(buildings){
          const current = safeParse(seigRow.buildings, {});
          for(const [bid, val] of Object.entries(buildings)){
            const info = current[bid] || { built: 0, active: 0 };
            info.built = val;
            current[bid] = info;
          }
          seigAfter.buildings = JSON.stringify(current);
        }
        if(infrastructures){
          const curr = safeParse(seigRow.infrastructures, {});
          for(const [iid, val] of Object.entries(infrastructures)){
            const entry = curr[iid] || {};
            entry.built = val;
            curr[iid] = entry;
          }
          seigAfter.infrastructures = JSON.stringify(curr);
        }
        const invBefore = invRow ? { ...invRow } : null;
        const invAfter = invRow ? { ...invRow } : null;
        const invUpdates = { ...(inventaire || {}) };
        if(esclaves !== undefined) invUpdates.esclaves = esclaves;
        if(invAfter && Object.keys(invUpdates).length){
          Object.entries(invUpdates).forEach(([k, v]) => { invAfter[k] = sanitize(v); });
        }
        const baronyBefore = baronyRow ? { ...baronyRow } : null;
        const baronyAfter = baronyRow ? { ...baronyRow } : null;
        if(baronyAfter && religion_id !== undefined){
          baronyAfter.religion_pop_id = sanitize(religion_id);
        }
        if(baronyAfter && culture_id !== undefined){
          baronyAfter.culture_id = sanitize(culture_id);
        }

        const seigChanges = diffRecords(seigBefore, seigAfter, ['population','buildings','infrastructures']);
        const invChanges = invBefore && invAfter ? diffRecords(invBefore, invAfter, Object.keys(invAfter)) : {};
        const baronyChanges = baronyBefore && baronyAfter ? diffRecords(baronyBefore, baronyAfter, ['religion_pop_id','culture_id']) : {};

        if(!Object.keys(seigChanges).length && !Object.keys(invChanges).length && !Object.keys(baronyChanges).length){
          return res.json({ ok: true, changes: 0 });
        }

        const tasks = [];
        if(Object.keys(seigChanges).length){
          tasks.push((cb) => db.run(
            'UPDATE players SET population=?, buildings=?, infrastructures=? WHERE id=?',
            [seigAfter.population, seigAfter.buildings, seigAfter.infrastructures, id],
            cb
          ));
        }
        if(Object.keys(invChanges).length && invAfter){
          const set = Object.keys(invUpdates).map(k=>`${k}=?`).join(',');
          const vals = Object.keys(invUpdates).map(k => invAfter[k]);
          vals.push(invAfter.id);
          tasks.push(cb => db.run(`UPDATE inventaire SET ${set} WHERE id=?`, vals, cb));
        }
        if(Object.keys(baronyChanges).length && baronyAfter){
          const set = [];
          const vals = [];
          if(religion_id !== undefined){ set.push('religion_pop_id=?'); vals.push(baronyAfter.religion_pop_id); }
          if(culture_id !== undefined){ set.push('culture_id=?'); vals.push(baronyAfter.culture_id); }
          vals.push(baronyAfter.id);
          tasks.push(cb => db.run(`UPDATE baronies SET ${set.join(',')} WHERE id=?`, vals, cb));
        }

        let idx = 0;
        const next = (errUpdate) => {
          if(errUpdate) return handleError(res, errUpdate);
          const task = tasks[idx++];
          if(!task){
            Promise.all([
              Object.keys(seigChanges).length ? recordChange(req, { table: 'seigneuries', action: 'update', before: seigBefore, after: seigAfter, changes: seigChanges }) : Promise.resolve(),
              Object.keys(invChanges).length ? recordChange(req, { table: 'inventaire', action: 'update', before: invBefore, after: invAfter, changes: invChanges }) : Promise.resolve(),
              Object.keys(baronyChanges).length ? recordChange(req, { table: 'baronies', action: 'update', before: baronyBefore, after: baronyAfter, changes: baronyChanges }) : Promise.resolve()
            ]).finally(() => res.json({ ok: true }));
            return;
          }
          task(next);
        };
        next();
      };
      if(needsBarony){
        db.get('SELECT * FROM baronies WHERE id=?', [seigRow.baronnie_id], (err3, barRow) => {
          if(err3) return handleError(res, err3);
          proceed(barRow);
        });
      } else {
        proceed(null);
      }
    });
  });
});

app.get('/api/transactions', requireAdmin, (req,res)=>{
  list('transactions')(req,res);
});
app.post('/api/transactions', requireAdmin, (req,res)=>{
  create('transactions',['seigneurie_id','resource','amount'])(req,res);
});

const baronyFields = [
  'name','seigneur_id','religion_pop_id','county_id','viscounty_id','culture_id',
  'defacto_county_id','defacto_viscounty_id','priory_religion_id','church_religion_id',
  'cathedral_religion_id','vacant','color'
];

app.get('/api/baronies', (req, res) => {
  const id = req.query.id;
  if (id) {
    db.all('SELECT * FROM baronies WHERE id=?', [id], (err, rows) => {
      if (err) return handleError(res, err);
      res.json(rows);
    });
  } else {
    list('baronies')(req, res);
  }
});

app.get('/api/organigrammes', (req, res) => {
  const db = req.app.get('db');
  const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows);
    });
  });

  const titleQueries = {
    empires: 'SELECT id, name, seigneur_id, color FROM empires',
    kingdoms: 'SELECT id, name, seigneur_id, empire_id, color FROM kingdoms',
    archduchies: 'SELECT id, name, seigneur_id, color FROM archduchies',
    duchies: 'SELECT id, name, seigneur_id, kingdom_id, archduchy_id, banquet_religion_id, color FROM duchies',
    marquisates: 'SELECT id, name, seigneur_id, color FROM marquisates',
    counties: 'SELECT id, name, seigneur_id, duchy_id, marquisate_id, color FROM counties',
    viscounties: 'SELECT id, name, seigneur_id, color FROM viscounties',
    baronies: 'SELECT id, name, seigneur_id, color FROM baronies'
  };

  Promise.all([
    dbAll(`SELECT s.id, s.name, s.overlord_id, s.religion_id, s.player, s.bishop, r.name as religion_name
           FROM seigneurs s
           LEFT JOIN religions r ON s.religion_id=r.id`),
    ...Object.values(titleQueries).map((query) => dbAll(query))
  ])
    .then(([seigneurs, ...titleRows]) => {
      const titles = {};
      Object.keys(titleQueries).forEach((key, idx) => {
        titles[key] = titleRows[idx];
      });
      res.json({ seigneurs, titles });
    })
    .catch((err) => handleError(res, err));
});
app.use('/api/baronies', crudRoutes('baronies', baronyFields));

const baronyPropFields = ['barony_id','water_access','sea_access','has_or','has_argent','has_fer','has_pierre','has_epices','has_perle','has_encens','has_huiles','has_pierre_precieuses','has_soie','has_sel','has_fourrure','has_teinture','has_ivoire','has_vin','field_limit','fishing_limit','high_sea_boat_limit','effects'];
const baronyPropRouter = crudRoutes('barony_properties', baronyPropFields);
app.use('/api/barony_properties', requireAdmin, baronyPropRouter);

const tagFields = ['label'];
const tagsRouter = crudRoutes('tags', tagFields);
tagsRouter.use((req,res,next)=>{
  if(['POST','PUT','DELETE'].includes(req.method)) return requireAdmin(req,res,next);
  next();
});
app.use('/api/tags', tagsRouter);

const buildingPropFields = ['label','produces','production','costs','max','workers_per_building','absolute_restrictions','infra_restrictions','effects','description'];
const buildingPropsRouter = crudRoutes('building_properties', buildingPropFields);
buildingPropsRouter.use((req,res,next)=>{
  if(['POST','PUT','DELETE'].includes(req.method)) return requireAdmin(req,res,next);
  next();
});
app.use('/api/building_properties', buildingPropsRouter);

const infraPropFields = ['label','type','max','workers_per_building','effects','costs','absolute_restrictions','restrictions','description'];
const infraPropsRouter = crudRoutes('infrastructure_properties', infraPropFields);
infraPropsRouter.use((req,res,next)=>{
  if(['POST','PUT','DELETE'].includes(req.method)) return requireAdmin(req,res,next);
  next();
});
app.use('/api/infrastructure_properties', infraPropsRouter);

const spellFields = ['label','type','costs','effects','description'];
const spellsRouter = crudRoutes('spells', spellFields);
spellsRouter.use((req,res,next)=>{
  if(['POST','PUT','DELETE'].includes(req.method)) return requireAdmin(req,res,next);
  next();
});
app.use('/api/spells', spellsRouter);

app.post('/api/cast_spell', (req,res)=>{
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const spellId = parseInt(req.body.id, 10);
  if (!spellId) return res.status(400).json({ error: 'ID invalide' });
  const requestedAmount = parseInt(req.body.amount, 10) || 0;
  getSeigneurie(req, 'seigneuries.id, seigneuries.baronnie_id, seigneuries.buildings, seigneuries.infrastructures, seigneuries.spells_cast, seigneuries.update_year, seigneuries.update_number', (err, srow) => {
    if (err) return handleError(res, err);
    if (!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const seigneurieId = srow.id;
    const infrastructures = safeParse(srow.infrastructures, {});
    let casts = srow.spells_cast || 0;
    db.all('SELECT id, label, effects FROM infrastructure_properties', [], (err2, iprops) => {
      if (err2) return handleError(res, err2);
      const effectCtx = { spellSuccessBonus:0, basicSpellDiscount:0, advancedSpellDiscount:0, spellRangeBonus:0, spellMax:0 };
      (iprops || []).forEach(ip => {
        const entry = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
        const count = typeof entry === 'object' ? (entry.built || 0) : entry;
        if (!count) return;
        const effects = safeParse(ip.effects, []);
        effects.forEach(def => {
          let effObj = null;
          if (def.type === 'spell_success') {
            effObj = new SpellSuccessEffect(def.amount || 0);
          } else if (def.type === 'spell_basic_discount') {
            effObj = new SpellBasicDiscountEffect(def.amount || 0);
          } else if (def.type === 'spell_advanced_discount') {
            effObj = new SpellAdvancedDiscountEffect(def.amount || 0);
          } else if (def.type === 'spell_range') {
            effObj = new SpellRangeEffect(def.amount || 0);
          } else if (def.type === 'spell_max_per_month') {
            effObj = new SpellMaxPerMonthEffect(def.amount || 0);
          }
          if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
        });
      });
      const applyBarony = cb => {
        if (!srow.baronnie_id) return cb();
        db.get('SELECT effects FROM barony_properties WHERE barony_id=?', [srow.baronnie_id], (err3, bprops) => {
          if (err3) return handleError(res, err3);
          const beffs = safeParse(bprops && bprops.effects, []);
          beffs.forEach(def => {
            let effObj = null;
            if (def.type === 'spell_success') {
              effObj = new SpellSuccessEffect(def.amount || 0);
            } else if (def.type === 'spell_basic_discount') {
              effObj = new SpellBasicDiscountEffect(def.amount || 0);
            } else if (def.type === 'spell_advanced_discount') {
              effObj = new SpellAdvancedDiscountEffect(def.amount || 0);
            } else if (def.type === 'spell_range') {
              effObj = new SpellRangeEffect(def.amount || 0);
            } else if (def.type === 'spell_max_per_month') {
              effObj = new SpellMaxPerMonthEffect(def.amount || 0);
            }
            if (effObj) effObj.apply(effectCtx, 1, 'Baronnie');
          });
          cb();
        });
      };
      applyBarony(() => {
        const max = effectCtx.spellMax || 0;
        if (max && casts >= max) return res.status(400).json({ error: 'Limite de sorts atteinte' });
        db.get('SELECT * FROM spells WHERE id=?', [spellId], (err4, spell) => {
          if (err4) return handleError(res, err4);
          if (!spell) return res.status(404).json({ error: 'Sort introuvable' });
          let costs = safeParse(spell.costs, {});
          const discount = spell.type === 'base' ? effectCtx.basicSpellDiscount || 0 : effectCtx.advancedSpellDiscount || 0;
          if (discount) {
            costs = Object.fromEntries(Object.entries(costs).map(([r,a]) => [r, Math.round(a * (100 - discount) / 100)]));
          }
          const effDefs = safeParse(spell.effects, []);
          let chosenAmount = 0;
          const varEff = effDefs.find(e => e.type === 'variable_production');
          if (varEff && requestedAmount > 0) {
            const ratio = varEff.ratio || 1;
            const max = varEff.max || 0;
            chosenAmount = Math.min(requestedAmount, max || requestedAmount);
            const pmCost = Math.ceil((chosenAmount / ratio) * (100 - discount) / 100);
            costs.points_magique = (costs.points_magique || 0) + pmCost;
          }
          consumeResources(db, seigneurieId, costs, err5 => {
            if (err5) return handleError(res, err5);
            const successChance = 75 + (effectCtx.spellSuccessBonus || 0);
            const success = Math.random() * 100 < successChance;
            const effects = success ? effDefs : [];
            let idx = 0;
            const randomLuxury = [];
            function applyNext() {
              if (idx >= effects.length) return finish();
              const e = effects[idx++];
              if (e.type === 'production') {
                performTransaction(db, seigneurieId, e.resource, e.amount || 0, err6 => {
                  if (err6) return handleError(res, err6);
                  applyNext();
                });
              } else if (e.type === 'variable_production') {
                if (!chosenAmount) return applyNext();
                performTransaction(db, seigneurieId, e.resource, chosenAmount, err6 => {
                  if (err6) return handleError(res, err6);
                  applyNext();
                });
              } else if (e.type === 'random_luxury') {
                const resName = luxuryResources[Math.floor(Math.random()*luxuryResources.length)];
                performTransaction(db, seigneurieId, resName, e.amount || 0, err6 => {
                  if (err6) return handleError(res, err6);
                  randomLuxury.push(resName);
                  applyNext();
                });
              } else {
                applyNext();
              }
            }
            function finish() {
              casts += 1;
              db.run('UPDATE seigneuries_info SET spells_cast=? WHERE player_id=?', [casts, seigneurieId], err7 => {
                if (err7) return handleError(res, err7);
                res.json({ success, randomLuxury });
              });
            }
            if (success) {
              applyNext();
            } else {
              finish();
            }
          });
        });
      });
    });
  });
});

function safeParse(json, fallback){
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function normalizeSeigneurieUpdate(row, now = new Date()) {
  return normalizeUpdatePosition({
    year: Number(row && row.update_year),
    number: Number(row && row.update_number)
  }, now);
}

function buildUpdateStatus(row, blockers = [], now = new Date()) {
  const current = normalizeSeigneurieUpdate(row, now);
  const next = getNextUpdatePosition(current);
  const unlockDate = getUnlockDateForUpdate(next);
  const canAdvance = blockers.length === 0 && isUpdateUnlocked(next, now);
  return {
    current,
    currentLabel: formatUpdateLabel(current),
    currentKey: getUpdateKey(current),
    next,
    nextLabel: formatUpdateLabel(next),
    nextKey: getUpdateKey(next),
    canAdvance,
    blockers,
    unlockDate: unlockDate.toISOString(),
    unlockLabel: unlockDate.toLocaleDateString('fr-CA')
  };
}

function computeEmploymentFromState(db, seigneurieRow, cb) {
  const buildings = safeParse(seigneurieRow.buildings, {});
  const infrastructures = safeParse(seigneurieRow.infrastructures, {});
  db.get('SELECT * FROM inventaire WHERE id=?', [seigneurieRow.inventaire_id], (err, inventaire) => {
    if (err) return cb(err);
    db.all('SELECT id, workers_per_building FROM building_properties', [], (err2, bprops) => {
      if (err2) return cb(err2);
      let employed = inventaire && inventaire.hommes_darmes ? inventaire.hommes_darmes : 0;
      (bprops || []).forEach((bp) => {
        const info = buildings[bp.id] || buildings[String(bp.id)] || {};
        employed += (info.active || 0) * (bp.workers_per_building || 0);
      });
      db.all('SELECT id, workers_per_building, effects FROM infrastructure_properties', [], (err3, iprops) => {
        if (err3) return cb(err3);
        (iprops || []).forEach((ip) => {
          const entry = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
          const built = typeof entry === 'object' ? (entry.built || 0) : entry;
          employed += built * (ip.workers_per_building || 0);
          const entryObj = typeof entry === 'object' ? entry : {};
          const effects = safeParse(ip.effects, []);
          effects.forEach((def, idx) => {
            if (def.type !== 'variable_workers') return;
            const maxWorkers = (def.max_workers || 0) * built;
            const assigned = Math.min(entryObj[`effect_${idx}_workers`] || 0, maxWorkers);
            employed += assigned;
          });
        });
        const slaves = inventaire && inventaire.esclaves ? inventaire.esclaves : 0;
        cb(null, { employed: Math.max(employed - slaves, 0), slaves });
      });
    });
  });
}

function deliverApprovedTransactions(db, seigneurieRow, capacities, inventoryState, cb) {
  const current = normalizeSeigneurieUpdate(seigneurieRow);
  const summary = { received: {}, overflow: {} };
  db.all(
    `SELECT * FROM trade_transactions
     WHERE destination_id=? AND state='Approuvée' AND COALESCE(received, 0)=0`,
    [seigneurieRow.id],
    (err, rows) => {
      if (err) return cb(err);
      const eligible = (rows || []).filter((tx) => compareUpdatePositions(
        current,
        normalizeUpdatePosition({ year: Number(tx.origin_update_year), number: Number(tx.origin_update_number) })
      ) >= 0);
      let txIndex = 0;
      function nextTransaction() {
        if (txIndex >= eligible.length) return cb(null, summary);
        const tx = eligible[txIndex++];
        const resources = safeParse(tx.resources, {});
        const entries = Object.entries(resources);
        let entryIndex = 0;
        function nextEntry() {
          if (entryIndex >= entries.length) {
            db.run('UPDATE trade_transactions SET received=1 WHERE id=?', [tx.id], (err2) => {
              if (err2) return cb(err2);
              nextTransaction();
            });
            return;
          }
          const [resource, rawAmount] = entries[entryIndex++];
          const amount = parseInt(rawAmount, 10) || 0;
          if (!inventaireFields.includes(resource) || amount <= 0) return nextEntry();
          const currentAmount = inventoryState[resource] || 0;
          const cap = capacities[resource];
          let granted = amount;
          let lost = 0;
          if (typeof cap === 'number') {
            const space = Math.max(cap - currentAmount, 0);
            granted = Math.min(amount, space);
            lost = amount - granted;
          }
          if (lost > 0) {
            summary.overflow[resource] = (summary.overflow[resource] || 0) + lost;
          }
          if (granted <= 0) return nextEntry();
          performTransaction(db, seigneurieRow.id, resource, granted, (err3) => {
            if (err3) return cb(err3);
            inventoryState[resource] = currentAmount + granted;
            summary.received[resource] = (summary.received[resource] || 0) + granted;
            nextEntry();
          });
        }
        nextEntry();
      }
      nextTransaction();
    }
  );
}

function normalizeDateParam(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date.toISOString();
}

app.get('/api/admin_change_logs', requireAdmin, (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const perPageRaw = parseInt(req.query.perPage, 10);
  const perPage = Math.min(Math.max(perPageRaw || 25, 5), 200);
  const offset = (page - 1) * perPage;
  const tableFilter = (req.query.table || '').trim();
  const actionFilter = (req.query.action || '').trim();
  const recordId = (req.query.recordId || '').trim();
  const userId = (req.query.userId || '').trim();
  const userType = (req.query.userType || '').trim();
  let startDate = normalizeDateParam(req.query.startDate);
  let endDate = normalizeDateParam(req.query.endDate);
  const exactDate = normalizeDateParam(req.query.exactDate);
  if (!startDate && exactDate) startDate = exactDate;
  if (!endDate && exactDate) endDate = normalizeDateParam(req.query.exactDate, true);

  const filters = [];
  const params = [];
  if (tableFilter) {
    filters.push('l.table_name = ?');
    params.push(tableFilter);
  }
  if (actionFilter) {
    filters.push('l.action = ?');
    params.push(actionFilter);
  }
  if (recordId) {
    filters.push('l.record_id = ?');
    params.push(recordId);
  }
  if (userId) {
    filters.push('l.user_id = ?');
    params.push(userId);
  }
  if (startDate) {
    filters.push('datetime(l.created_at) >= datetime(?)');
    params.push(startDate);
  }
  if (endDate) {
    filters.push('datetime(l.created_at) <= datetime(?)');
    params.push(endDate);
  }
  if (userType === 'admin') {
    filters.push('COALESCE(u.is_admin, 0) = 1');
  } else if (userType === 'non-admin') {
    filters.push('COALESCE(u.is_admin, 0) = 0');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const baseFrom = 'FROM admin_change_logs l LEFT JOIN users u ON u.id = l.user_id';
  db.get(`SELECT COUNT(*) as count ${baseFrom} ${whereClause}`, params, (err, countRow) => {
    if (err) return handleError(res, err);
    db.all(
      `SELECT l.id, l.table_name, l.record_id, l.action, l.description, l.details, l.user_id, l.user_email, l.user_first_name, l.user_last_name, l.created_at, u.is_admin as user_is_admin
       ${baseFrom}
       ${whereClause}
       ORDER BY datetime(l.created_at) DESC, l.id DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
      (err2, rows) => {
        if (err2) return handleError(res, err2);
        const entries = (rows || []).map(r => ({
          id: r.id,
          table: r.table_name,
          table_name: r.table_name,
          record_id: r.record_id,
          action: r.action,
          description: r.description,
          user: {
            id: r.user_id,
            email: r.user_email,
            first_name: r.user_first_name,
            last_name: r.user_last_name,
            is_admin: r.user_is_admin ? 1 : 0
          },
          created_at: r.created_at,
          details: safeParse(r.details, null)
        }));
        const dedupeAndSort = (list = []) => Array.from(new Set(list.filter(Boolean))).sort();
        db.all('SELECT DISTINCT table_name FROM admin_change_logs WHERE table_name IS NOT NULL ORDER BY table_name ASC', [], (err3, tableRows) => {
          if (err3) return handleError(res, err3);
          db.all('SELECT DISTINCT action FROM admin_change_logs WHERE action IS NOT NULL ORDER BY action ASC', [], (err4, actionRows) => {
            if (err4) return handleError(res, err4);
            db.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC", [], (err5, schemaTables) => {
              if (err5) return handleError(res, err5);
              const options = {
                tables: dedupeAndSort([
                  ...(tableRows || []).map((t) => t.table_name),
                  ...(schemaTables || []).map((row) => row.name)
                ]),
                actions: dedupeAndSort((actionRows || []).map((a) => a.action))
              };
              res.json({ entries, total: countRow ? countRow.count : 0, page, perPage, options });
            });
          });
        });
      }
    );
  });
});

function computeCapacities(db, infrastructures, cb){
  db.all('SELECT id, effects, type, label FROM infrastructure_properties', [], (err, rows) => {
    if (err) return cb(err);
    const capacities = { vivres: 500, points_magique: 2000, hommes_darmes: 0, chevaux: 0, trebuchets: 0 };
    const effectCtx = { capacity: capacities };
    (rows || []).forEach(ip => {
      const entry = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
      const count = typeof entry === 'object' ? (entry.built || 0) : entry;
      if (!count) return;
      const effects = safeParse(ip.effects, []);
      effects.forEach(def => {
        if (def.type === 'storage') {
          const effObj = new StorageEffect(def.resource, def.amount || 0);
          if (effObj) effObj.apply(effectCtx, count, ip.label || ip.type);
        }
      });
    });
    cb(null, capacities);
  });
}

function checkTagRestrictions(db, buildings, infrastructures, tagConds, cb) {
  db.all('SELECT id, effects FROM building_properties', [], (err, bRows) => {
    if (err) return cb(err);
    const bTags = {};
    (bRows || []).forEach(r => {
      const effs = safeParse(r.effects, []);
      const tagMap = {};
      effs.forEach(ef => {
        if (ef.type === 'tag' && ef.tag) {
          tagMap[ef.tag] = (tagMap[ef.tag] || 0) + (parseInt(ef.amount, 10) || 1);
        }
      });
      bTags[r.id] = tagMap;
    });
    db.all('SELECT id, effects FROM infrastructure_properties', [], (err2, iRows) => {
      if (err2) return cb(err2);
      const iTags = {};
      (iRows || []).forEach(r => {
        const effs = safeParse(r.effects, []);
        const tagMap = {};
        effs.forEach(ef => {
          if (ef.type === 'tag' && ef.tag) {
            tagMap[ef.tag] = (tagMap[ef.tag] || 0) + (parseInt(ef.amount, 10) || 1);
          }
        });
        iTags[r.id] = tagMap;
      });
      for (const cond of tagConds) {
        const tagId = parseInt(cond.tag || cond.tag_id, 10);
        const cmp = cond.cmp || cond.operator || cond.op;
        const val = parseInt(cond.value, 10) || 0;
        let count = 0;
        for (const [bid, info] of Object.entries(buildings)) {
          const tagMap = bTags[bid] || bTags[String(bid)] || {};
          const amt = tagMap[tagId];
          if (amt) {
            count += (info.built || 0) * amt;
          }
        }
        for (const [iid, entry] of Object.entries(infrastructures)) {
          const tagMap = iTags[iid] || iTags[String(iid)] || {};
          const amt = tagMap[tagId];
          if (amt) {
            const builtCount = typeof entry === 'object' ? (entry.built || 0) : entry;
            count += builtCount * amt;
          }
        }
        if (cmp === '>=' && count < val) return cb(new Error('Restriction non satisfaite'));
        if (cmp === '<=' && count > val) return cb(new Error('Restriction non satisfaite'));
      }
      cb(null);
    });
  });
}

function canConstruct(db, srow, id, qty, cb){
  db.get('SELECT * FROM building_properties WHERE id=?', [id], (err, bprops) => {
    if (err) return cb(err);
    if (!bprops) return cb(new Error('Type inconnu'));
    if (!srow.baronnie_id) return cb(new Error('Aucune baronnie associée'));
    const costObj = safeParse(bprops.costs, {});
    const absReq = safeParse(bprops.absolute_restrictions, []);
    const infraReq = safeParse(bprops.infra_restrictions, {});
    const maxObj = safeParse(bprops.max, null);
    const effects = safeParse(bprops.effects, []);
    const costs = {};
    Object.entries(costObj).forEach(([res, val]) => {
      costs[res] = (parseInt(val, 10) || 0) * qty;
    });
    db.get('SELECT * FROM barony_properties WHERE barony_id=?', [srow.baronnie_id], (err2, props) => {
      if (err2) return cb(err2);
      const barProps = props || {};
      let max = Infinity;
      let tagLimit = null;
      if (bprops.max != null && bprops.max !== '') {
        const parsed = parseInt(bprops.max, 10);
        if (!isNaN(parsed) && parsed > 0) {
          max = parsed;
        } else if (barProps[bprops.max] != null) {
          const dyn = parseInt(barProps[bprops.max], 10);
          if (!isNaN(dyn) && dyn > 0) max = dyn;
        } else if (maxObj && typeof maxObj === 'object' && maxObj.tag) {
          tagLimit = maxObj;
        }
      }
      if (Array.isArray(absReq)) {
        for (const prop of absReq) {
          if (!barProps[prop]) return cb(new Error('Restriction non satisfaite'));
        }
      }
      const buildings = safeParse(srow.buildings, {});
      const infrastructures = safeParse(srow.infrastructures, {});
      if (infraReq.buildings) {
        for (const [bid, count] of Object.entries(infraReq.buildings)) {
          const builtCount = buildings[bid] ? (buildings[bid].built || 0) : 0;
          if (builtCount < count) return cb(new Error('Restriction non satisfaite'));
        }
      }
      if (infraReq.infrastructures) {
        for (const [iid, count] of Object.entries(infraReq.infrastructures)) {
          const entry = infrastructures[iid] || infrastructures[String(iid)] || 0;
          const builtCount = typeof entry === 'object' ? (entry.built || 0) : entry;
          if (builtCount < count) return cb(new Error('Restriction non satisfaite'));
        }
      }
      if (infraReq.population && (srow.population || 0) < infraReq.population) {
        return cb(new Error('Restriction non satisfaite'));
      }
      const finalize = () => {
        const binfo = buildings[id] || { built: 0, active: 0 };
        const built = binfo.built;
        const active = binfo.active;
        if (built + qty > max) return cb(new Error('Limite atteinte'));
        db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err4, inv) => {
          if (err4) return cb(err4);
          if (infraReq.resources) {
            for (const [res, val] of Object.entries(infraReq.resources)) {
              if ((inv[res] || 0) < val) return cb(new Error('Restriction non satisfaite'));
            }
          }
          for (const [res, val] of Object.entries(costs)) {
            if ((inv[res] || 0) < val) return cb(new Error('Ressources insuffisantes'));
          }
          cb(null, { costs, built, active, buildings, infrastructures, effects });
        });
      };
      const applyTagLimit = (next) => {
        if (!tagLimit || !tagLimit.tag) return next();
        const tagId = parseInt(tagLimit.tag || tagLimit.tag_id, 10);
        const per = parseInt(tagLimit.per || tagLimit.value, 10) || 1;
        db.all('SELECT id, effects FROM building_properties', [], (errB, bRows) => {
          if (errB) return cb(errB);
          const bTags = {};
          (bRows || []).forEach(r => {
            const effs = safeParse(r.effects, []);
            const tagMap = {};
            effs.forEach(ef => {
              if (ef.type === 'tag' && ef.tag) {
                tagMap[ef.tag] = (tagMap[ef.tag] || 0) + (parseInt(ef.amount, 10) || 1);
              }
            });
            bTags[r.id] = tagMap;
          });
          db.all('SELECT id, effects FROM infrastructure_properties', [], (errI, iRows) => {
            if (errI) return cb(errI);
            const iTags = {};
            (iRows || []).forEach(r => {
              const effs = safeParse(r.effects, []);
              const tagMap = {};
              effs.forEach(ef => {
                if (ef.type === 'tag' && ef.tag) {
                  tagMap[ef.tag] = (tagMap[ef.tag] || 0) + (parseInt(ef.amount, 10) || 1);
                }
              });
              iTags[r.id] = tagMap;
            });
            let count = 0;
            for (const [bid, info] of Object.entries(buildings)) {
              const tagMap = bTags[bid] || bTags[String(bid)] || {};
              const amt = tagMap[tagId];
              if (amt) {
                count += (info.built || 0) * amt;
              }
            }
            for (const [iid, entry] of Object.entries(infrastructures)) {
              const tagMap = iTags[iid] || iTags[String(iid)] || {};
              const amt = tagMap[tagId];
              if (amt) {
                const builtCount = typeof entry === 'object' ? (entry.built || 0) : entry;
                count += builtCount * amt;
              }
            }
            max = Math.min(max, count * per);
            next();
          });
        });
      };
      if (Array.isArray(infraReq.tags) && infraReq.tags.length) {
        checkTagRestrictions(db, buildings, infrastructures, infraReq.tags, err3 => {
          if (err3) return cb(err3);
          applyTagLimit(finalize);
        });
      } else {
        applyTagLimit(finalize);
      }
    });
  });
}

function canConstructInfra(db, srow, id, qty, cb){
  db.get('SELECT * FROM infrastructure_properties WHERE id=?', [id], (err, iprop) => {
    if(err) return cb(err);
    if(!iprop) return cb(new Error('Type inconnu'));
    if(!srow.baronnie_id) return cb(new Error('Aucune baronnie associée'));
    const costObj = safeParse(iprop.costs, {});
    const absReq = safeParse(iprop.absolute_restrictions, []);
    const restrictions = safeParse(iprop.restrictions, {});
    const effects = safeParse(iprop.effects, []);
    const costs = {};
    Object.entries(costObj).forEach(([res, val]) => { costs[res] = (parseInt(val,10) || 0) * qty; });
    db.get('SELECT * FROM barony_properties WHERE barony_id=?', [srow.baronnie_id], (err2, props) => {
      if(err2) return cb(err2);
      const barProps = props || {};
      let max = Infinity;
      if (iprop.max != null && iprop.max !== '') {
        const parsed = parseInt(iprop.max, 10);
        if (!isNaN(parsed) && parsed > 0) {
          max = parsed;
        } else if (barProps[iprop.max] != null) {
          const dyn = parseInt(barProps[iprop.max], 10);
          if (!isNaN(dyn) && dyn > 0) max = dyn;
        }
      }
      for(const prop of absReq){
        if(!barProps[prop]) return cb(new Error('Restriction non satisfaite'));
      }
      const buildings = safeParse(srow.buildings, {});
      const infrastructures = safeParse(srow.infrastructures, {});
      if(restrictions.buildings){
        for(const [bid, count] of Object.entries(restrictions.buildings)){
          const builtCount = buildings[bid] ? (buildings[bid].built || 0) : 0;
          if(builtCount < count) return cb(new Error('Restriction non satisfaite'));
        }
      }
      if(restrictions.infrastructures){
        for(const [iid, count] of Object.entries(restrictions.infrastructures)){
          const entry = infrastructures[iid] || infrastructures[String(iid)] || 0;
          const builtCount = typeof entry === 'object' ? (entry.built || 0) : entry;
          if(builtCount < count) return cb(new Error('Restriction non satisfaite'));
        }
      }
      if(restrictions.population && (srow.population || 0) < restrictions.population){
        return cb(new Error('Restriction non satisfaite'));
      }
      const finalize = () => {
        const entry = infrastructures[id] || infrastructures[String(id)] || 0;
        const built = typeof entry === 'object' ? (entry.built || 0) : entry;
        if(built + qty > max) return cb(new Error('Limite atteinte'));
        db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err3, inv) => {
          if(err3) return cb(err3);
          if(restrictions.resources){
            for(const [res, val] of Object.entries(restrictions.resources)){
              if((inv[res] || 0) < val) return cb(new Error('Restriction non satisfaite'));
            }
          }
          for(const [res, val] of Object.entries(costs)){
            if((inv[res] || 0) < val) return cb(new Error('Ressources insuffisantes'));
          }
          cb(null, { costs, built, infrastructures, effects });
        });
      };
      if (Array.isArray(restrictions.tags) && restrictions.tags.length) {
        checkTagRestrictions(db, buildings, infrastructures, restrictions.tags, err3 => {
          if (err3) return cb(err3);
          finalize();
        });
      } else {
        finalize();
      }
    });
  });
}

app.post('/api/building', (req,res)=>{
  if(!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const { id, quantity, props } = req.body;
  const bId = parseInt(id,10);
  const qty = parseInt(quantity,10) || 0;
  if(!bId || qty <= 0) return res.status(400).json({ error: 'Quantité invalide' });
  getSeigneurie(req, 'seigneuries.id as id, seigneuries.baronnie_id, seigneuries.population, seigneuries.inventaire_id, seigneuries.buildings, seigneuries.infrastructures', (err, srow)=>{
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    canConstruct(db, srow, bId, qty, (err2, info)=>{
      if(err2) return res.status(400).json({ error: err2.message });
      consumeResources(db, srow.id, info.costs, err3 => {
        if(err3) return handleError(res, err3);
        const newBuilt = info.built + qty;
        const newActive = info.active + qty;
        const buildings = info.buildings;
        const existing = buildings[bId] || {};
        const uses = {};
        (info.effects || []).forEach((eff, idx) => {
          const upm = parseInt(eff.uses_per_month, 10);
          if (eff.type === 'instant_production' && upm > 0) {
            const key = `effect_${idx}_remaining`;
            const existRem = existing[key] || 0;
            if (eff.per_building === false) {
              const builtBefore = existing.built || 0;
              const add = builtBefore > 0 ? 0 : upm;
              if (add || existRem) uses[key] = existRem + add;
            } else {
              uses[key] = existRem + (upm * qty);
            }
          }
        });
        buildings[bId] = { ...existing, ...uses, ...(props || {}), built: newBuilt, active: newActive };
        db.run('UPDATE players SET buildings=? WHERE id=?', [JSON.stringify(buildings), srow.id], function(err4){
          if(err4) return handleError(res, err4);
          db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err5, inventaire)=>{
            if(err5) return handleError(res, err5);
            res.json({ buildings, inventaire });
          });
        });
      });
    });
  });
});

app.post('/api/infrastructure', (req,res)=>{
  if(!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const { id, quantity, props } = req.body;
  const iId = Number.parseInt(id, 10);
  const qty = Number.parseInt(quantity, 10) || 0;
  if (Number.isNaN(iId) || qty <= 0) return res.status(400).json({ error: 'Quantité invalide' });
  getSeigneurie(req, 'seigneuries.id as id, seigneuries.baronnie_id, seigneuries.population, seigneuries.inventaire_id, seigneuries.infrastructures, seigneuries.buildings', (err, srow)=>{
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    canConstructInfra(db, srow, iId, qty, (err2, info)=>{
      if(err2) return res.status(400).json({ error: err2.message });
      consumeResources(db, srow.id, info.costs, err3 => {
        if(err3) return handleError(res, err3);
        const newBuilt = info.built + qty;
        const infrastructures = info.infrastructures;
        const existing = infrastructures[iId] || {};
        const uses = {};
        (info.effects || []).forEach((eff, idx) => {
          const upm = parseInt(eff.uses_per_month, 10);
          if (eff.type === 'instant_production' && upm > 0) {
            const key = `effect_${idx}_remaining`;
            const existRem = existing[key] || 0;
            if (eff.per_building === false) {
              const builtBefore = existing.built || 0;
              const add = builtBefore > 0 ? 0 : upm;
              if (add || existRem) uses[key] = existRem + add;
            } else {
              uses[key] = existRem + (upm * qty);
            }
          }
        });
        infrastructures[iId] = { ...existing, ...uses, ...(props || {}), built: newBuilt };
        db.run('UPDATE players SET infrastructures=? WHERE id=?', [JSON.stringify(infrastructures), srow.id], function(err4){
          if(err4) return handleError(res, err4);
          db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err5, inventaire)=>{
            if(err5) return handleError(res, err5);
            res.json({ infrastructures, inventaire });
          });
        });
      });
    });
  });
});

app.post('/api/building/activate', (req,res)=>{
  if(!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const id = parseInt(req.body.id,10);
  const qty = parseInt(req.body.quantity,10);
  if(!id || isNaN(qty) || qty < 0) return res.status(400).json({ error: 'Quantité invalide' });
  getSeigneurie(req, 'seigneuries.id as id, seigneuries.population, seigneuries.inventaire_id, seigneuries.buildings, seigneuries.infrastructures', (err, srow)=>{
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const buildings = safeParse(srow.buildings, {});
    const infrastructures = safeParse(srow.infrastructures, {});
    db.all('SELECT id, type, label, workers_per_building FROM building_properties', [], (err2, bprops) => {
      if(err2) return handleError(res, err2);
      const bprop = bprops.find(bp => bp.id === id);
      if(!bprop) return res.status(400).json({ error: 'Bâtiment introuvable' });
      const binfo = buildings[id] || { built: 0, active: 0 };
      const built = binfo.built;
      if(qty > built) return res.status(400).json({ error: 'Quantité supérieure au construit' });
      db.all('SELECT id, label, workers_per_building, effects FROM infrastructure_properties', [], (errI, iprops) => {
        if(errI) return handleError(res, errI);
        db.get('SELECT esclaves, hommes_darmes FROM inventaire WHERE id=?', [srow.inventaire_id], (err3, inv)=>{
          if(err3) return handleError(res, err3);
          const slaves = inv ? (inv.esclaves || 0) : 0;
          const menAtArms = inv ? (inv.hommes_darmes || 0) : 0;
          const totalPop = srow.population + slaves;
          let employed = menAtArms;
          const employmentDetails = [];
          if (menAtArms) employmentDetails.push({ label: "Hommes d'armes", amount: menAtArms, source: menAtArms });
          for(const bp of bprops || []){
            const info = buildings[bp.id] || { built: 0, active: 0 };
            const active = (bp.id === id) ? qty : (info.active || 0);
            const workers = active * (bp.workers_per_building || 0);
            employed += workers;
            if(workers) employmentDetails.push({ label: bp.label || bp.type, amount: workers, source: active });
          }
          for(const ip of iprops || []){
            const entry = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
            const count = typeof entry === 'object' ? (entry.built || 0) : entry;
            if(!count) continue;
            const workers = count * (ip.workers_per_building || 0);
            if(workers){
              employed += workers;
              employmentDetails.push({ label: ip.label || ip.type, amount: workers, source: count });
            }
            const entryObj = typeof entry === 'object' ? entry : {};
            const effects = safeParse(ip.effects, []);
            effects.forEach((ef, eidx) => {
              if(ef.type === 'variable_workers'){
                const assigned = entryObj[`effect_${eidx}_workers`] || 0;
                if(assigned){
                  employed += assigned;
                  employmentDetails.push({ label: ip.label || ip.type, amount: assigned, source: assigned });
                }
              }
            });
          }
          if(employed > totalPop) return res.status(400).json({ error: 'Travailleurs insuffisants' });
          if(slaves) employmentDetails.push({ label: 'Esclaves', amount: -slaves, source: slaves });
          const employment = { employed: Math.max(employed - slaves, 0), slaves };
          binfo.active = qty;
          buildings[id] = binfo;
          db.run('UPDATE players SET buildings=? WHERE id=?', [JSON.stringify(buildings), srow.id], function(err4){
            if(err4) return handleError(res, err4);
            res.json({ building: { id, built, active: qty }, employment, employmentDetails });
          });
        });
      });
    });
  });
});

app.post('/api/building/destroy', (req,res)=>{
  if(!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const id = parseInt(req.body.id,10);
  if(!id) return res.status(400).json({ error: 'ID invalide' });
  getSeigneurie(req, 'seigneuries.id as id, seigneuries.population, seigneuries.inventaire_id, seigneuries.buildings, seigneuries.infrastructures', (err, srow)=>{
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const buildings = safeParse(srow.buildings, {});
    const infrastructures = safeParse(srow.infrastructures, {});
    const binfo = buildings[id];
    if(!binfo || !binfo.built) return res.status(400).json({ error: 'Aucun bâtiment à détruire' });
    db.all('SELECT id, label, workers_per_building, effects FROM building_properties', [], (err2, bprops) => {
      if(err2) return handleError(res, err2);
      const bprop = bprops.find(bp => bp.id === id);
      if(!bprop) return res.status(400).json({ error: 'Bâtiment introuvable' });
      const built = binfo.built - 1;
      let active = binfo.active || 0;
      if(active > built) active = built;
      const updated = { ...binfo, built, active };
      try {
        const effects = bprop.effects ? JSON.parse(bprop.effects) : [];
        effects.forEach((eff, idx) => {
          const upm = parseInt(eff.uses_per_month, 10);
          if (eff.type === 'instant_production' && upm > 0) {
            const key = `effect_${idx}_remaining`;
            if (eff.per_building === false) {
              if (built <= 0) delete updated[key];
            } else {
              const rem = (binfo[key] || 0) - upm;
              if (rem > 0) updated[key] = rem; else delete updated[key];
            }
          }
        });
      } catch {}
      if (built <= 0) {
        delete buildings[id];
      } else {
        buildings[id] = updated;
      }
      db.all('SELECT id, label, workers_per_building, effects FROM infrastructure_properties', [], (errI, iprops) => {
        if(errI) return handleError(res, errI);
        db.get('SELECT esclaves, hommes_darmes FROM inventaire WHERE id=?', [srow.inventaire_id], (err3, inv)=>{
          if(err3) return handleError(res, err3);
          const slaves = inv ? (inv.esclaves || 0) : 0;
          const menAtArms = inv ? (inv.hommes_darmes || 0) : 0;
          const totalPop = srow.population + slaves;
          let employed = menAtArms;
          const employmentDetails = [];
          if (menAtArms) employmentDetails.push({ label: "Hommes d'armes", amount: menAtArms, source: menAtArms });
          for(const bp of bprops || []){
            const info = buildings[bp.id] || { built: 0, active: 0 };
            const workers = (info.active || 0) * (bp.workers_per_building || 0);
            employed += workers;
            if(workers) employmentDetails.push({ label: bp.label || bp.type, amount: workers, source: info.active || 0 });
          }
          for(const ip of iprops || []){
            const entry = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
            const count = typeof entry === 'object' ? (entry.built || 0) : entry;
            if(!count) continue;
            const workers = count * (ip.workers_per_building || 0);
            if(workers){
              employed += workers;
              employmentDetails.push({ label: ip.label || ip.type, amount: workers, source: count });
            }
            const entryObj = typeof entry === 'object' ? entry : {};
            const effects = safeParse(ip.effects, []);
            effects.forEach((ef, eidx) => {
              if(ef.type === 'variable_workers'){
                const assigned = entryObj[`effect_${eidx}_workers`] || 0;
                if(assigned){
                  employed += assigned;
                  employmentDetails.push({ label: ip.label || ip.type, amount: assigned, source: assigned });
                }
              }
            });
          }
          if(employed > totalPop) return res.status(400).json({ error: 'Travailleurs insuffisants' });
          if(slaves) employmentDetails.push({ label: 'Esclaves', amount: -slaves, source: slaves });
          const employment = { employed: Math.max(employed - slaves, 0), slaves };
          db.run('UPDATE players SET buildings=? WHERE id=?', [JSON.stringify(buildings), srow.id], function(err4){
            if(err4) return handleError(res, err4);
            res.json({ building: { id, built, active }, employment, employmentDetails });
          });
        });
      });
    });
  });
});

app.post('/api/infrastructure/destroy', (req,res)=>{
  if(!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const id = parseInt(req.body.id,10);
  if(!id) return res.status(400).json({ error: 'ID invalide' });
  getSeigneurie(req, 'seigneuries.id as id, seigneuries.population, seigneuries.inventaire_id, seigneuries.infrastructures, seigneuries.buildings', (err, srow)=>{
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const infrastructures = safeParse(srow.infrastructures, {});
    const entry = infrastructures[id];
    const built = typeof entry === 'object' ? (entry.built || 0) : (entry || 0);
    if(!built) return res.status(400).json({ error: 'Aucune infrastructure à détruire' });
    db.all('SELECT id, label, workers_per_building, effects FROM infrastructure_properties', [], (err2, iprops)=>{
      if(err2) return handleError(res, err2);
      const iprop = iprops.find(ip => ip.id === id);
      if(!iprop) return res.status(400).json({ error: 'Infrastructure introuvable' });
      let updated = typeof entry === 'object' ? { ...entry } : { built };
      updated.built = built - 1;
      try {
        const effects = iprop.effects ? JSON.parse(iprop.effects) : [];
        effects.forEach((eff, idx) => {
          const upm = parseInt(eff.uses_per_month, 10);
          if (eff.type === 'instant_production' && upm > 0) {
            const key = `effect_${idx}_remaining`;
            if (eff.per_building === false) {
              if ((updated.built || 0) <= 0) delete updated[key];
            } else {
              const rem = (entry[key] || 0) - upm;
              if (rem > 0) updated[key] = rem; else delete updated[key];
            }
          }
          if (eff.type === 'variable_workers') {
            const key = `effect_${idx}_workers`;
            const max = (eff.max_workers || 0) * (updated.built || 0);
            let assigned = entry[key] || 0;
            if (assigned > max) assigned = max;
            if (assigned) updated[key] = assigned; else delete updated[key];
          }
        });
      } catch {}
      if(updated.built <= 0) {
        delete infrastructures[id];
      } else {
        infrastructures[id] = updated;
      }
      db.all('SELECT id, label, workers_per_building, effects FROM building_properties', [], (errB, bprops)=>{
        if(errB) return handleError(res, errB);
        const buildings = safeParse(srow.buildings, {});
        db.get('SELECT esclaves, hommes_darmes FROM inventaire WHERE id=?', [srow.inventaire_id], (err3, inv)=>{
          if(err3) return handleError(res, err3);
          const slaves = inv ? (inv.esclaves || 0) : 0;
          const menAtArms = inv ? (inv.hommes_darmes || 0) : 0;
          const totalPop = srow.population + slaves;
          let employed = menAtArms;
          const employmentDetails = [];
          if (menAtArms) employmentDetails.push({ label: "Hommes d'armes", amount: menAtArms, source: menAtArms });
          for(const bp of bprops || []){
            const info = buildings[bp.id] || { built: 0, active: 0 };
            const workers = (info.active || 0) * (bp.workers_per_building || 0);
            employed += workers;
            if(workers) employmentDetails.push({ label: bp.label || bp.type, amount: workers, source: info.active || 0 });
          }
          for(const ip of iprops || []){
            const inf = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
            const count = typeof inf === 'object' ? (inf.built || 0) : inf;
            if(!count) continue;
            const workers = count * (ip.workers_per_building || 0);
            if(workers){
              employed += workers;
              employmentDetails.push({ label: ip.label || ip.type, amount: workers, source: count });
            }
            const infObj = typeof inf === 'object' ? inf : {};
            const effs = safeParse(ip.effects, []);
            effs.forEach((ef, eidx) => {
              if(ef.type === 'variable_workers'){
                const assigned = infObj[`effect_${eidx}_workers`] || 0;
                if(assigned){
                  employed += assigned;
                  employmentDetails.push({ label: ip.label || ip.type, amount: assigned, source: assigned });
                }
              }
            });
          }
          if(employed > totalPop) return res.status(400).json({ error: 'Travailleurs insuffisants' });
          if(slaves) employmentDetails.push({ label: 'Esclaves', amount: -slaves, source: slaves });
          const employment = { employed: Math.max(employed - slaves, 0), slaves };
          db.run('UPDATE players SET infrastructures=? WHERE id=?', [JSON.stringify(infrastructures), srow.id], function(err4){
            if(err4) return handleError(res, err4);
            res.json({ infrastructure: { id, built: updated.built }, employment, employmentDetails });
          });
        });
      });
    });
  });
});

app.post('/api/infrastructure/instant_production', (req,res)=>{
  if(!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const { id, index, quantity } = req.body;
  const iId = Number.parseInt(id, 10);
  const idx = Number.parseInt(index, 10);
  const qty = Number.parseInt(quantity, 10) || 0;
  if (Number.isNaN(iId) || Number.isNaN(idx) || qty <= 0) return res.status(400).json({ error: 'Quantité invalide' });
  getSeigneurie(req, 'seigneuries.id as id, seigneuries.population, seigneuries.inventaire_id, seigneuries.infrastructures, seigneuries.buildings', (err, srow) => {
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    db.get('SELECT effects FROM infrastructure_properties WHERE id=?', [iId], (err2, iprop) => {
      if(err2) return handleError(res, err2);
      const effects = safeParse(iprop ? iprop.effects : '[]', []);
      const eff = effects[idx];
      if(!eff || eff.type !== 'instant_production') return res.status(400).json({ error: 'Effet introuvable' });
      const infra = safeParse(srow.infrastructures, {});
      const entry = infra[iId] || infra[String(iId)] || {};
      const key = `effect_${idx}_remaining`;
      const upm = parseInt(eff.uses_per_month, 10);
      const remaining = entry[key] || 0;
      if (upm > 0) {
        if(qty > remaining) return res.status(400).json({ error: 'Utilisations insuffisantes' });
      } else {
        delete entry[key];
      }
      const totalCosts = {};
      const costObj = eff.costs || {};
      for(const [resName, amt] of Object.entries(costObj)){
        totalCosts[resName] = (parseInt(amt,10) || 0) * qty;
      }
      const produced = (parseInt(eff.amount,10) || 0) * qty;
      db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err3, inv)=>{
        if(err3) return handleError(res, err3);
        for(const [resName, amt] of Object.entries(totalCosts)){
          if((inv[resName] || 0) < amt) return res.status(400).json({ error: 'Ressources insuffisantes' });
        }
        const proceed = () => {
          consumeResources(db, srow.id, totalCosts, err4 => {
            if(err4) return handleError(res, err4);
            performTransaction(db, srow.id, eff.resource, produced, err5 => {
              if(err5) return handleError(res, err5);
              if (upm > 0) entry[key] = remaining - qty; else delete entry[key];
              infra[iId] = entry;
              db.run('UPDATE players SET infrastructures=? WHERE id=?', [JSON.stringify(infra), srow.id], function(err6){
                if(err6) return handleError(res, err6);
                db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err7, inventaire)=>{
                  if(err7) return handleError(res, err7);
                  res.json({ infrastructures: infra, inventaire });
                });
              });
            });
          });
        };
        if (eff.resource === 'hommes_darmes') {
          db.all('SELECT id, workers_per_building FROM building_properties', [], (errB, bprops) => {
            if (errB) return handleError(res, errB);
            db.all('SELECT id, workers_per_building, effects FROM infrastructure_properties', [], (errI, iprops) => {
              if (errI) return handleError(res, errI);
              const buildings = safeParse(srow.buildings, {});
              const infrastructures = safeParse(srow.infrastructures, {});
              let employed = inv ? (inv.hommes_darmes || 0) : 0;
              (bprops || []).forEach(bp => {
                const info = buildings[bp.id] || { built:0, active:0 };
                employed += (info.active || 0) * (bp.workers_per_building || 0);
              });
              (iprops || []).forEach(ip => {
                const ent = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
                const count = typeof ent === 'object' ? (ent.built || 0) : ent;
                if (count) {
                  employed += count * (ip.workers_per_building || 0);
                  const entObj = typeof ent === 'object' ? ent : {};
                  const effs = safeParse(ip.effects, []);
                  effs.forEach((ef, eidx) => {
                    if (ef.type === 'variable_workers') {
                      employed += entObj[`effect_${eidx}_workers`] || 0;
                    }
                  });
                }
              });
              const population = srow.population || 0;
              const menAtArms = inv ? (inv.hommes_darmes || 0) : 0;
              if (menAtArms + produced > population) return res.status(400).json({ error: 'Population insuffisante' });
              if (employed + produced > population) return res.status(400).json({ error: 'Travailleurs insuffisants' });
              proceed();
            });
          });
        } else {
          proceed();
        }
      });
    });
  });
});

app.post('/api/infrastructure/assign_workers', (req,res) => {
  if(!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const { id, index, quantity } = req.body;
  const iId = Number.parseInt(id, 10);
  const idx = Number.parseInt(index, 10);
  const qty = Number.parseInt(quantity, 10) || 0;
  if (Number.isNaN(iId) || Number.isNaN(idx) || qty < 0) return res.status(400).json({ error: 'Quantité invalide' });
  getSeigneurie(req, 'seigneuries.id as id, seigneuries.population, seigneuries.inventaire_id, seigneuries.infrastructures, seigneuries.buildings', (err, srow) => {
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const infrastructures = safeParse(srow.infrastructures, {});
    const buildings = safeParse(srow.buildings, {});
    db.all('SELECT id, label, workers_per_building FROM building_properties', [], (err2, bprops) => {
      if(err2) return handleError(res, err2);
      db.all('SELECT id, label, workers_per_building, effects FROM infrastructure_properties', [], (err3, iprops) => {
        if(err3) return handleError(res, err3);
        const ipMap = Object.fromEntries((iprops || []).map(p => [String(p.id), p]));
        const ip = ipMap[String(iId)];
        if(!ip) return res.status(400).json({ error: 'Infrastructure introuvable' });
        const effects = safeParse(ip.effects, []);
        const def = effects[idx];
        if(!def || def.type !== 'variable_workers') return res.status(400).json({ error: 'Effet introuvable' });
        const existing = infrastructures[iId] || infrastructures[String(iId)] || {};
        const built = typeof existing === 'object' ? (existing.built || 0) : existing;
        const max = (def.max_workers || 0) * built;
        if(qty > max) return res.status(400).json({ error: 'Au-delà du maximum' });
        let employed = 0;
        const employmentDetails = [];
        for(const bp of bprops || []){
          const info = buildings[bp.id] || { built:0, active:0 };
          const workers = (info.active || 0) * (bp.workers_per_building || 0);
          employed += workers;
          if(workers) employmentDetails.push({ label: bp.label || bp.type, amount: workers, source: info.active || 0 });
        }
        for(const [iid, ent] of Object.entries(infrastructures)){
          const prop = ipMap[String(iid)];
          if(!prop) continue;
          const builtCount = typeof ent === 'object' ? (ent.built || 0) : ent;
          if(builtCount){
            const workers = builtCount * (prop.workers_per_building || 0);
            if(workers){
              employed += workers;
              employmentDetails.push({ label: prop.label || prop.type, amount: workers, source: builtCount });
            }
          }
          const entObj = typeof ent === 'object' ? ent : {};
          const effs = safeParse(prop.effects, []);
          effs.forEach((ef, eidx) => {
            if(ef.type === 'variable_workers'){
              const key = `effect_${eidx}_workers`;
              const assigned = (iId === Number(iid) && eidx === idx) ? qty : (entObj[key] || 0);
              if(assigned){
                employed += assigned;
                employmentDetails.push({ label: prop.label || prop.type, amount: assigned, source: assigned });
              }
            }
          });
        }
        db.get('SELECT esclaves, hommes_darmes FROM inventaire WHERE id=?', [srow.inventaire_id], (err4, inv) => {
          if(err4) return handleError(res, err4);
          const slaves = inv ? (inv.esclaves || 0) : 0;
          const menAtArms = inv ? (inv.hommes_darmes || 0) : 0;
          employed += menAtArms;
          if (menAtArms) employmentDetails.push({ label: "Hommes d'armes", amount: menAtArms, source: menAtArms });
          const totalPop = srow.population + slaves;
          if(employed > totalPop) return res.status(400).json({ error: 'Travailleurs insuffisants' });
          if(slaves) employmentDetails.push({ label: 'Esclaves', amount: -slaves, source: slaves });
          const employment = { employed: Math.max(employed - slaves, 0), slaves };
          const newEntry = typeof existing === 'object' ? { ...existing, [`effect_${idx}_workers`]: qty } : { built, [`effect_${idx}_workers`]: qty };
          infrastructures[iId] = newEntry;
          db.run('UPDATE players SET infrastructures=? WHERE id=?', [JSON.stringify(infrastructures), srow.id], function(err5){
            if(err5) return handleError(res, err5);
            res.json({ infrastructures, employment, employmentDetails });
          });
        });
      });
    });
  });
});
app.get('/api/canonical_lands', list('canonical_lands'));
app.post('/api/canonical_lands', create('canonical_lands',['barony_id','canonical_barony_id']));
app.delete('/api/canonical_lands', (req, res) => {
  const { barony_id, canonical_barony_id } = req.query;
  db.get('SELECT * FROM canonical_lands WHERE barony_id=? AND canonical_barony_id=?', [barony_id, canonical_barony_id], (err, row) => {
    if(err) return handleError(res, err);
    db.run('DELETE FROM canonical_lands WHERE barony_id=? AND canonical_barony_id=?', [barony_id, canonical_barony_id], function(err2){
      if(err2) return handleError(res, err2);
      if (this.changes > 0 && row) {
        recordChange(req, { table: 'canonical_lands', action: 'delete', before: row, after: null, key: `${barony_id}-${canonical_barony_id}` });
      }
      res.json({deleted: this.changes});
    });
  });
});

// Sanctuaries API
app.use('/api/sanctuaries', crudRoutes('sanctuaries',['barony_id','religion_id']));

// Barony adjacency API
app.get('/api/barony_connections', (req,res)=>{
  list('barony_connections')(req,res);
});
app.post('/api/barony_connections', requireAdmin, (req,res)=>{
  let { barony_id_1, barony_id_2, distance } = req.body;
  barony_id_1 = parseInt(barony_id_1);
  barony_id_2 = parseInt(barony_id_2);
  distance = parseInt(distance, 10);
  if (!distance || distance < 1) distance = 1;
  if(!barony_id_1 || !barony_id_2 || barony_id_1 === barony_id_2){
    return res.status(400).json({error:'Invalid barony ids'});
  }
  const [id1,id2] = barony_id_1 < barony_id_2 ? [barony_id_1, barony_id_2] : [barony_id_2, barony_id_1];
  db.run('INSERT OR IGNORE INTO barony_connections (barony_id_1, barony_id_2, distance) VALUES (?,?,?)',[id1,id2,distance],function(err){
    if(err) return handleError(res, err);
    if (this.changes > 0) {
      recordChange(req, { table: 'barony_connections', action: 'create', before: null, after: { barony_id_1: id1, barony_id_2: id2, distance }, key: `${id1}-${id2}` });
    }
    res.json({added: this.changes});
  });
});
app.put('/api/barony_connections', requireAdmin, (req,res)=>{
  let { barony_id_1, barony_id_2, distance } = req.body;
  barony_id_1 = parseInt(barony_id_1);
  barony_id_2 = parseInt(barony_id_2);
  distance = parseInt(distance, 10);
  if (!distance || distance < 1) {
    return res.status(400).json({error:'Invalid distance'});
  }
  if(!barony_id_1 || !barony_id_2 || barony_id_1 === barony_id_2){
    return res.status(400).json({error:'Invalid barony ids'});
  }
  const [id1,id2] = barony_id_1 < barony_id_2 ? [barony_id_1, barony_id_2] : [barony_id_2, barony_id_1];
  db.get('SELECT * FROM barony_connections WHERE barony_id_1=? AND barony_id_2=?', [id1,id2], (err, row) => {
    if (err) return handleError(res, err);
    if (!row) return res.status(404).json({error:'Connexion introuvable'});
    db.run('UPDATE barony_connections SET distance=? WHERE barony_id_1=? AND barony_id_2=?', [distance, id1, id2], function(err2){
      if (err2) return handleError(res, err2);
      if (this.changes > 0) {
        recordChange(req, { table: 'barony_connections', action: 'update', before: row, after: { ...row, distance }, key: `${id1}-${id2}` });
      }
      res.json({updated: this.changes});
    });
  });
});
app.delete('/api/barony_connections', requireAdmin, (req,res)=>{
  let { barony_id_1, barony_id_2 } = req.body;
  barony_id_1 = parseInt(barony_id_1);
  barony_id_2 = parseInt(barony_id_2);
  if(!barony_id_1 || !barony_id_2){
    return res.status(400).json({error:'Invalid barony ids'});
  }
  const [id1,id2] = barony_id_1 < barony_id_2 ? [barony_id_1, barony_id_2] : [barony_id_2, barony_id_1];
  db.run('DELETE FROM barony_connections WHERE barony_id_1=? AND barony_id_2=?',[id1,id2],function(err){
    if(err) return handleError(res, err);
    if (this.changes > 0) {
      recordChange(req, { table: 'barony_connections', action: 'delete', before: { barony_id_1: id1, barony_id_2: id2 }, after: null, key: `${id1}-${id2}` });
    }
    res.json({deleted: this.changes});
  });
});

app.post('/api/send_transaction', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const targetBaronyId = parseInt(req.body.target_barony_id, 10);
  const resources = req.body.resources || {};
  const txType = req.body.type === 'naval' ? 'naval' : 'land';
  const reason = req.body.reason || null;
  if (!targetBaronyId || typeof resources !== 'object') return res.status(400).json({ error: 'Données invalides' });
  getSeigneurie(req, 'seigneuries.id, seigneuries.baronnie_id, seigneuries.inventaire_id, seigneuries.buildings, seigneuries.infrastructures, seigneuries.land_transactions, seigneuries.naval_transactions, seigneuries.update_year, seigneuries.update_number', (err, srow) => {
    if (err) return handleError(res, err);
    if (!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const seigneurieId = srow.id;
    const infrastructures = safeParse(srow.infrastructures, {});
    let count = txType === 'naval' ? (srow.naval_transactions || 0) : (srow.land_transactions || 0);
    db.all('SELECT id, label, effects FROM infrastructure_properties', [], (err2, iprops) => {
      if (err2) return handleError(res, err2);
      const effectCtx = { landTxMax:0, navalTxMax:0 };
      (iprops || []).forEach(ip => {
        const entry = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
        const c = typeof entry === 'object' ? (entry.built || 0) : entry;
        if (!c) return;
        const effs = safeParse(ip.effects, []);
        effs.forEach(def => {
          let effObj = null;
          if (def.type === 'land_transaction_max_per_month') {
            effObj = new LandTransactionMaxPerMonthEffect(def.amount || 0);
          } else if (def.type === 'naval_transaction_max_per_month') {
            effObj = new NavalTransactionMaxPerMonthEffect(def.amount || 0);
          }
          if (effObj) effObj.apply(effectCtx, c, ip.label || ip.type);
        });
      });
      const applyBarony = cb => {
        if (!srow.baronnie_id) return cb();
        db.get('SELECT effects FROM barony_properties WHERE barony_id=?', [srow.baronnie_id], (err3, bprops) => {
          if (err3) return handleError(res, err3);
          const beffs = safeParse(bprops && bprops.effects, []);
          beffs.forEach(def => {
            let effObj = null;
            if (def.type === 'land_transaction_max_per_month') {
              effObj = new LandTransactionMaxPerMonthEffect(def.amount || 0);
            } else if (def.type === 'naval_transaction_max_per_month') {
              effObj = new NavalTransactionMaxPerMonthEffect(def.amount || 0);
            }
            if (effObj) effObj.apply(effectCtx, 1, 'Baronnie');
          });
          cb();
        });
      };
      applyBarony(() => {
        const max = txType === 'naval' ? effectCtx.navalTxMax : effectCtx.landTxMax;
        if (max && count >= max) return res.status(400).json({ error: 'Limite de transactions atteinte' });
        db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err4, inv) => {
          if (err4) return handleError(res, err4);
          for (const [r, a] of Object.entries(resources)) {
            const amt = parseInt(a, 10);
            if (!inventaireFields.includes(r) || amt <= 0 || inv[r] < amt) {
              return res.status(400).json({ error: 'Ressources insuffisantes' });
            }
          }
          db.get(`SELECT seigneuries.id, seigneurs.user_id as user_id, seigneurs.name as name, baronies.name as barony_name FROM seigneuries JOIN seigneurs ON seigneurs.id=seigneuries.seigneur_id JOIN baronies ON baronies.id=seigneuries.baronnie_id WHERE seigneuries.baronnie_id=?`, [targetBaronyId], (err5, dest) => {
            if (err5) return handleError(res, err5);
            if (!dest) return res.status(400).json({ error: 'Destination invalide' });
            db.get('SELECT seigneurs.name as name FROM seigneurs JOIN seigneuries ON seigneurs.id=seigneuries.seigneur_id WHERE seigneuries.id=?', [seigneurieId], (errO, originInfo) => {
              if (errO) return handleError(res, errO);
              const entries = Object.entries(resources);
              let idx = 0;
              function next() {
                if (idx >= entries.length) return finish();
                const [resName, amount] = entries[idx++];
                performTransaction(db, seigneurieId, resName, -amount, err6 => {
                  if (err6) return handleError(res, err6);
                  next();
                });
              }
              function finish() {
                const newCount = count + 1;
                const field = txType === 'naval' ? 'naval_transactions' : 'land_transactions';
                const originUpdate = normalizeSeigneurieUpdate(srow);
                db.run(`UPDATE players SET ${field}=? WHERE id=?`, [newCount, seigneurieId], err7 => {
                  if (err7) return handleError(res, err7);
                  db.run('INSERT INTO trade_transactions (origin_id, destination_id, origin_update_year, origin_update_number, resources, type, state, reason) VALUES (?,?,?,?,?,?,?,?)', [seigneurieId, dest.id, originUpdate.year, originUpdate.number, JSON.stringify(resources), txType, 'En Attente', reason], function(err8) {
                    if (err8) return handleError(res, err8);
                    const message = `Vous avez reçu une ${txType === 'naval' ? 'cargaison' : 'caravane'} de ressources de ${originInfo ? originInfo.name : ''}`;
                    sendNotification(db, dest.user_id, message, `/gestion.html?transactionId=${this.lastID}`, () => {
                      res.json({ ok: true });
                    });
                  });
                });
              }
              next();
            });
          });
        });
      });
    });
  });
});

app.get('/api/trade_transactions', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  getSeigneurie(req, 'seigneuries.id, seigneuries.update_year, seigneuries.update_number', (err, row) => {
    if (err) return handleError(res, err);
    if (!row) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const three = new Date();
    three.setMonth(three.getMonth() - 3);
    const sql = `SELECT tt.id, tt.resources, tt.type, tt.state, tt.reason, tt.created_at, tt.decision_time, tt.origin_update_year, tt.origin_update_number, tt.received, s.name as origin_name, b.name as origin_barony_name
                 FROM trade_transactions tt
                 JOIN seigneuries os ON tt.origin_id=os.id
                 JOIN seigneurs s ON os.seigneur_id=s.id
                 JOIN baronies b ON os.baronnie_id=b.id
                 WHERE tt.destination_id=? AND (tt.state='En Attente' OR (tt.decision_time IS NOT NULL AND tt.decision_time>=?))
                 ORDER BY tt.created_at DESC`;
    db.all(sql, [row.id, three.toISOString()], (err2, rows) => {
      if (err2) return handleError(res, err2);
      const currentUpdate = normalizeSeigneurieUpdate(row);
      const mapped = (rows || []).map(r => ({
        ...r,
        resources: safeParse(r.resources, {}),
        origin_update_label: formatUpdateLabel(normalizeUpdatePosition({ year: Number(r.origin_update_year), number: Number(r.origin_update_number) })),
        can_receive_now: compareUpdatePositions(
          currentUpdate,
          normalizeUpdatePosition({ year: Number(r.origin_update_year), number: Number(r.origin_update_number) })
        ) >= 0
      }));
      res.json(mapped);
    });
  });
});

app.get('/api/trade_transactions/:id', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide' });
  db.get(`SELECT tt.*, so.name as origin_name, bo.name as origin_barony_name,
                  sd.name as dest_name, bd.name as dest_barony_name
          FROM trade_transactions tt
          JOIN seigneuries os ON tt.origin_id=os.id
          JOIN seigneurs so ON os.seigneur_id=so.id
          JOIN baronies bo ON os.baronnie_id=bo.id
          JOIN seigneuries ds ON tt.destination_id=ds.id
          JOIN seigneurs sd ON ds.seigneur_id=sd.id
          JOIN baronies bd ON ds.baronnie_id=bd.id
          WHERE tt.id=?`, [id], (err, row) => {
    if (err) return handleError(res, err);
    if (!row) return res.status(404).json({ error: 'Introuvable' });
    db.all(`SELECT seigneuries.id FROM seigneurs
            JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id
            WHERE seigneurs.user_id=?`, [req.session.user.id], (err2, srows) => {
      if (err2) return handleError(res, err2);
      const owned = (srows || []).map(r => r.id);
      if (!isAdminActive(req.session.user) && !owned.includes(row.origin_id) && !owned.includes(row.destination_id)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      row.resources = safeParse(row.resources, {});
      row.origin_update_label = formatUpdateLabel(normalizeUpdatePosition({ year: Number(row.origin_update_year), number: Number(row.origin_update_number) }));
      res.json(row);
    });
  });
});

app.post('/api/trade_transactions/:id/decision', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const id = parseInt(req.params.id, 10);
  const action = req.body.action;
  if (!id || !['accept', 'refuse'].includes(action)) return res.status(400).json({ error: 'Données invalides' });
  getSeigneurie(req, 'seigneuries.id, seigneuries.update_year, seigneuries.update_number', (err, row) => {
    if (err) return handleError(res, err);
    if (!row) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const seigneurieId = row.id;
    db.get(`SELECT tt.*, so.user_id as origin_user_id, sd.name as dest_name FROM trade_transactions tt
            JOIN seigneuries os ON tt.origin_id=os.id
            JOIN seigneurs so ON os.seigneur_id=so.id
            JOIN seigneuries ds ON tt.destination_id=ds.id
            JOIN seigneurs sd ON ds.seigneur_id=sd.id
            WHERE tt.id=? AND tt.destination_id=?`, [id, seigneurieId], (err2, tx) => {
      if (err2) return handleError(res, err2);
      if (!tx) return res.status(404).json({ error: 'Introuvable' });
      if (tx.state !== 'En Attente') return res.status(400).json({ error: 'Déjà traité' });
      const currentUpdate = normalizeSeigneurieUpdate(row);
      const originUpdate = normalizeUpdatePosition({ year: Number(tx.origin_update_year), number: Number(tx.origin_update_number) });
      if (action === 'accept' && compareUpdatePositions(currentUpdate, originUpdate) < 0) {
        return res.status(400).json({ error: `Cette transaction ne peut pas etre acceptee avant ${formatUpdateLabel(originUpdate)}.` });
      }
      function finish() {
        const newState = action === 'accept' ? 'Approuvée' : 'Refusée';
        db.run('UPDATE trade_transactions SET state=?, decision_time=CURRENT_TIMESTAMP WHERE id=?', [newState, id], errU => {
          if (errU) return handleError(res, errU);
          if (action === 'refuse') {
            sendNotification(db, tx.origin_user_id, `${tx.dest_name} a refusé vos ressources`, `/gestion.html?transactionId=${id}`, () => {
              res.json({ ok: true });
            });
          } else {
            res.json({ ok: true });
          }
        });
      }
      finish();
    });
  });
});

app.post('/api/trade_transactions/:id/claim', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide' });
  getSeigneurie(req, 'seigneuries.id, seigneuries.inventaire_id, seigneuries.buildings, seigneuries.infrastructures', (err, srow) => {
    if (err) return handleError(res, err);
    if (!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    db.get('SELECT * FROM trade_transactions WHERE id=? AND origin_id=?', [id, srow.id], (err2, tx) => {
      if (err2) return handleError(res, err2);
      if (!tx || tx.state !== 'Refusée') return res.status(404).json({ error: 'Introuvable' });
      if (tx.returned) return res.status(400).json({ error: 'Déjà retournée' });
      const resources = safeParse(tx.resources, {});
      db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err3, inventaire) => {
        if (err3) return handleError(res, err3);
        const infrastructures = safeParse(srow.infrastructures, {});
        computeCapacities(db, infrastructures, (err4, capacities) => {
          if (err4) return handleError(res, err4);
          const entries = Object.entries(resources);
          const returned = {};
          const lost = {};
          let idx = 0;
          function finalize(){
            db.run('UPDATE trade_transactions SET returned=1 WHERE id=?', [id], errU => {
              if (errU) return handleError(res, errU);
              res.json({ returned, lost });
            });
          }
          function apply(){
            if (idx >= entries.length) return finalize();
            const [r, a] = entries[idx++];
            const amt = parseInt(a, 10);
            const cap = capacities[r];
            const current = inventaire[r] || 0;
            let toAdd = amt;
            if (typeof cap === 'number') {
              const space = cap - current;
              if (space <= 0) {
                lost[r] = (lost[r] || 0) + amt;
                return apply();
              }
              if (space < amt) {
                toAdd = space;
                lost[r] = amt - space;
              }
            }
            if (toAdd > 0) {
              performTransaction(db, srow.id, r, toAdd, errT => {
                if (errT) return handleError(res, errT);
                inventaire[r] = current + toAdd;
                returned[r] = (returned[r] || 0) + toAdd;
                apply();
              });
            } else {
              apply();
            }
          }
          apply();
        });
      });
    });
  });
});

// Trade routes API
app.get('/api/trade_routes', (req, res) => {
  const baronyId = parseInt(req.query.barony_id, 10);
  const where = baronyId ? ' WHERE barony_id_1=? OR barony_id_2=?' : '';
  const params = baronyId ? [baronyId, baronyId] : [];
  db.all(`SELECT * FROM trade_routes${where}`, params, (err, rows) => {
    if (err) return handleError(res, err);
    const routes = (rows || []).map(route => ({
      ...route,
      path: parseTradeRoutePath(route.path)
    }));
    res.json(routes);
  });
});
app.post('/api/trade_routes', requireAdmin, (req, res) => {
  let { barony_id_1, barony_id_2, path } = req.body;
  barony_id_1 = parseInt(barony_id_1, 10);
  barony_id_2 = parseInt(barony_id_2, 10);
  if (!barony_id_1 || !barony_id_2 || barony_id_1 === barony_id_2) {
    return res.status(400).json({ error: 'Baronnies invalides' });
  }
  let normalizedPath = parseTradeRoutePath(path);
  getTradeAdjacency((err, adjacency) => {
    if (err) return handleError(res, err);
    if (!normalizedPath.length) {
      const computed = computeShortestPath(barony_id_1, barony_id_2, adjacency);
      if (!computed || !computed.path || computed.path.length < 2) {
        return res.status(400).json({ error: 'Chemin introuvable' });
      }
      normalizedPath = computed.path;
    }
    const normalized = normalizeTradeRoutePathInput(normalizedPath, barony_id_1, barony_id_2);
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    const fullPath = normalized.fullPath.length ? normalized.fullPath : normalizedPath;
    const storedPath = normalized.fullPath.length ? normalized.storedPath : normalizedPath.slice(1, -1);
    const error = validateTradeRoutePath(fullPath, barony_id_1, barony_id_2, adjacency);
    if (error) return res.status(400).json({ error });
    const payload = {
      barony_id_1,
      barony_id_2,
      path: JSON.stringify(storedPath)
    };
    db.run('INSERT INTO trade_routes (barony_id_1, barony_id_2, path) VALUES (?,?,?)', [payload.barony_id_1, payload.barony_id_2, payload.path], function(err2) {
      if (err2) return handleError(res, err2);
      const created = { id: this.lastID, barony_id_1, barony_id_2, path: storedPath };
      recordChange(req, { table: 'trade_routes', action: 'create', before: null, after: created, key: String(this.lastID) });
      res.json(created);
    });
  });
});
app.post('/api/trade_routes/import', requireAdmin, (req, res) => {
  const pairs = Array.isArray(req.body?.pairs) ? req.body.pairs : [];
  if (!pairs.length) {
    return res.status(400).json({ error: 'Aucune paire de baronnies à importer' });
  }
  const normalizedPairs = [];
  pairs.forEach((pair, index) => {
    const barony_id_1 = parseInt(pair?.barony_id_1, 10);
    const barony_id_2 = parseInt(pair?.barony_id_2, 10);
    if (!barony_id_1 || !barony_id_2 || barony_id_1 === barony_id_2) {
      return;
    }
    normalizedPairs.push({
      line: index + 2,
      barony_id_1,
      barony_id_2
    });
  });
  if (!normalizedPairs.length) {
    return res.status(400).json({ error: 'Aucune paire valide trouvée' });
  }
  getTradeAdjacency((errAdj, adjacency) => {
    if (errAdj) return handleError(res, errAdj);
    db.all('SELECT id, barony_id_1, barony_id_2 FROM trade_routes', [], (errRoutes, existingRoutes) => {
      if (errRoutes) return handleError(res, errRoutes);
      const existingPairs = new Set();
      (existingRoutes || []).forEach(route => {
        const id1 = parseInt(route.barony_id_1, 10);
        const id2 = parseInt(route.barony_id_2, 10);
        if (!id1 || !id2) return;
        const key = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
        existingPairs.add(key);
      });
      const uniquePairs = [];
      const seenInFile = new Set();
      let skippedDuplicate = 0;
      normalizedPairs.forEach(pair => {
        const key = pair.barony_id_1 < pair.barony_id_2
          ? `${pair.barony_id_1}-${pair.barony_id_2}`
          : `${pair.barony_id_2}-${pair.barony_id_1}`;
        if (seenInFile.has(key)) {
          skippedDuplicate += 1;
          return;
        }
        seenInFile.add(key);
        uniquePairs.push({ ...pair, key });
      });
      const baronyIds = Array.from(new Set(uniquePairs.flatMap(pair => [pair.barony_id_1, pair.barony_id_2])));
      if (!baronyIds.length) {
        return res.status(400).json({ error: 'Aucune paire valide trouvée' });
      }
      const placeholders = baronyIds.map(() => '?').join(',');
      db.all(`SELECT id FROM baronies WHERE id IN (${placeholders})`, baronyIds, (errBaronies, rows) => {
        if (errBaronies) return handleError(res, errBaronies);
        const validBaronies = new Set((rows || []).map(item => parseInt(item.id, 10)).filter(Number.isFinite));
        const errors = [];
        let created = 0;
        let skippedExisting = 0;
        const stmt = db.prepare('INSERT INTO trade_routes (barony_id_1, barony_id_2, path) VALUES (?,?,?)');
        const processPair = (index) => {
          if (index >= uniquePairs.length) {
            return stmt.finalize((finalizeErr) => {
              if (finalizeErr) return handleError(res, finalizeErr);
              recordChange(req, {
                table: 'trade_routes',
                action: 'import',
                before: null,
                after: {
                  imported: created,
                  skipped_existing: skippedExisting,
                  skipped_duplicate: skippedDuplicate,
                  failed: errors.length
                },
                key: `bulk-${Date.now()}`
              });
              res.json({
                created,
                skipped_existing: skippedExisting,
                skipped_duplicate: skippedDuplicate,
                failed: errors.length,
                errors
              });
            });
          }
          const pair = uniquePairs[index];
          if (!validBaronies.has(pair.barony_id_1) || !validBaronies.has(pair.barony_id_2)) {
            errors.push({ ...pair, error: 'Baronnie introuvable' });
            return processPair(index + 1);
          }
          if (existingPairs.has(pair.key)) {
            skippedExisting += 1;
            return processPair(index + 1);
          }
          const computed = computeShortestPath(pair.barony_id_1, pair.barony_id_2, adjacency);
          if (!computed || !computed.path || computed.path.length < 2) {
            errors.push({ ...pair, error: 'Chemin introuvable' });
            return processPair(index + 1);
          }
          const normalized = normalizeTradeRoutePathInput(computed.path, pair.barony_id_1, pair.barony_id_2);
          if (normalized.error) {
            errors.push({ ...pair, error: normalized.error });
            return processPair(index + 1);
          }
          const fullPath = normalized.fullPath.length ? normalized.fullPath : computed.path;
          const validationError = validateTradeRoutePath(fullPath, pair.barony_id_1, pair.barony_id_2, adjacency);
          if (validationError) {
            errors.push({ ...pair, error: validationError });
            return processPair(index + 1);
          }
          const storedPath = normalized.fullPath.length ? normalized.storedPath : computed.path.slice(1, -1);
          stmt.run([pair.barony_id_1, pair.barony_id_2, JSON.stringify(storedPath)], (insertErr) => {
            if (insertErr) {
              errors.push({ ...pair, error: 'Insertion échouée' });
              return processPair(index + 1);
            }
            created += 1;
            existingPairs.add(pair.key);
            return processPair(index + 1);
          });
        };
        processPair(0);
      });
    });
  });
});
app.put('/api/trade_routes/:id', requireAdmin, (req, res) => {
  const routeId = parseInt(req.params.id, 10);
  if (!routeId) return res.status(400).json({ error: 'ID invalide' });
  db.get('SELECT * FROM trade_routes WHERE id=?', [routeId], (err, route) => {
    if (err) return handleError(res, err);
    if (!route) return res.status(404).json({ error: 'Route introuvable' });
    let { barony_id_1, barony_id_2, path } = req.body;
    barony_id_1 = parseInt(barony_id_1 ?? route.barony_id_1, 10);
    barony_id_2 = parseInt(barony_id_2 ?? route.barony_id_2, 10);
    if (!barony_id_1 || !barony_id_2 || barony_id_1 === barony_id_2) {
      return res.status(400).json({ error: 'Baronnies invalides' });
    }
    let normalizedPath = parseTradeRoutePath(path);
    getTradeAdjacency((errAdj, adjacency) => {
      if (errAdj) return handleError(res, errAdj);
      if (!normalizedPath.length) {
        normalizedPath = parseTradeRoutePath(route.path);
      }
      if (!normalizedPath.length) {
        const computed = computeShortestPath(barony_id_1, barony_id_2, adjacency);
        if (!computed || !computed.path || computed.path.length < 2) {
          return res.status(400).json({ error: 'Chemin introuvable' });
        }
        normalizedPath = computed.path;
      }
      const normalized = normalizeTradeRoutePathInput(normalizedPath, barony_id_1, barony_id_2);
      if (normalized.error) return res.status(400).json({ error: normalized.error });
      const fullPath = normalized.fullPath.length ? normalized.fullPath : normalizedPath;
      const storedPath = normalized.fullPath.length ? normalized.storedPath : normalizedPath.slice(1, -1);
      const error = validateTradeRoutePath(fullPath, barony_id_1, barony_id_2, adjacency);
      if (error) return res.status(400).json({ error });
      const payload = {
        barony_id_1,
        barony_id_2,
        path: JSON.stringify(storedPath)
      };
      db.run('UPDATE trade_routes SET barony_id_1=?, barony_id_2=?, path=? WHERE id=?', [payload.barony_id_1, payload.barony_id_2, payload.path, routeId], function(err2) {
        if (err2) return handleError(res, err2);
        const updated = { id: routeId, barony_id_1, barony_id_2, path: storedPath };
        recordChange(req, { table: 'trade_routes', action: 'update', before: { ...route, path: parseTradeRoutePath(route.path) }, after: updated, key: String(routeId) });
        res.json(updated);
      });
    });
  });
});
app.delete('/api/trade_routes/:id', requireAdmin, (req, res) => {
  const routeId = parseInt(req.params.id, 10);
  if (!routeId) return res.status(400).json({ error: 'ID invalide' });
  db.get('SELECT * FROM trade_routes WHERE id=?', [routeId], (err, route) => {
    if (err) return handleError(res, err);
    if (!route) return res.status(404).json({ error: 'Route introuvable' });
    db.run('DELETE FROM trade_routes WHERE id=?', [routeId], function(err2) {
      if (err2) return handleError(res, err2);
      recordChange(req, { table: 'trade_routes', action: 'delete', before: { ...route, path: parseTradeRoutePath(route.path) }, after: null, key: String(routeId) });
      res.json({ deleted: this.changes });
    });
  });
});

// Trade lines API
app.get('/api/trade_lines', (req, res) => {
  const baronyId = parseInt(req.query.barony_id, 10);
  const where = baronyId ? ' WHERE barony_id_1=? OR barony_id_2=?' : '';
  const params = baronyId ? [baronyId, baronyId] : [];
  db.all(`SELECT * FROM trade_lines${where}`, params, (err, rows) => {
    if (err) return handleError(res, err);
    const lines = (rows || []).map(line => ({
      ...line,
      path: parseTradeLinePath(line.path)
    }));
    res.json(lines);
  });
});
app.post('/api/trade_lines', requireAdmin, (req, res) => {
  let { barony_id_1, barony_id_2, path } = req.body;
  barony_id_1 = parseInt(barony_id_1, 10);
  barony_id_2 = parseInt(barony_id_2, 10);
  if (!barony_id_1 || !barony_id_2 || barony_id_1 === barony_id_2) {
    return res.status(400).json({ error: 'Baronnies invalides' });
  }
  const normalizedPath = parseTradeLinePath(path);
  if (!normalizedPath.length) {
    return res.status(400).json({ error: 'Le chemin maritime est requis' });
  }
  getTradeLineAdjacency((errAdj, adjacency) => {
    if (errAdj) return handleError(res, errAdj);
    getBaronyMaritimeZones((errZones, baronyZones) => {
      if (errZones) return handleError(res, errZones);
      const error = validateTradeLinePath(normalizedPath, barony_id_1, barony_id_2, adjacency, baronyZones);
      if (error) return res.status(400).json({ error });
      const payload = {
        barony_id_1,
        barony_id_2,
        path: JSON.stringify(normalizedPath)
      };
      db.run('INSERT INTO trade_lines (barony_id_1, barony_id_2, path) VALUES (?,?,?)', [payload.barony_id_1, payload.barony_id_2, payload.path], function(err2) {
        if (err2) return handleError(res, err2);
        const created = { id: this.lastID, barony_id_1, barony_id_2, path: normalizedPath };
        recordChange(req, { table: 'trade_lines', action: 'create', before: null, after: created, key: String(this.lastID) });
        res.json(created);
      });
    });
  });
});
app.put('/api/trade_lines/:id', requireAdmin, (req, res) => {
  const lineId = parseInt(req.params.id, 10);
  if (!lineId) return res.status(400).json({ error: 'ID invalide' });
  db.get('SELECT * FROM trade_lines WHERE id=?', [lineId], (err, line) => {
    if (err) return handleError(res, err);
    if (!line) return res.status(404).json({ error: 'Ligne introuvable' });
    let { barony_id_1, barony_id_2, path } = req.body;
    barony_id_1 = parseInt(barony_id_1 ?? line.barony_id_1, 10);
    barony_id_2 = parseInt(barony_id_2 ?? line.barony_id_2, 10);
    if (!barony_id_1 || !barony_id_2 || barony_id_1 === barony_id_2) {
      return res.status(400).json({ error: 'Baronnies invalides' });
    }
    const normalizedPath = parseTradeLinePath(path).length ? parseTradeLinePath(path) : parseTradeLinePath(line.path);
    if (!normalizedPath.length) {
      return res.status(400).json({ error: 'Le chemin maritime est requis' });
    }
    getTradeLineAdjacency((errAdj, adjacency) => {
      if (errAdj) return handleError(res, errAdj);
      getBaronyMaritimeZones((errZones, baronyZones) => {
        if (errZones) return handleError(res, errZones);
        const error = validateTradeLinePath(normalizedPath, barony_id_1, barony_id_2, adjacency, baronyZones);
        if (error) return res.status(400).json({ error });
        const payload = {
          barony_id_1,
          barony_id_2,
          path: JSON.stringify(normalizedPath)
        };
        db.run('UPDATE trade_lines SET barony_id_1=?, barony_id_2=?, path=? WHERE id=?', [payload.barony_id_1, payload.barony_id_2, payload.path, lineId], function(err2) {
          if (err2) return handleError(res, err2);
          const updated = { id: lineId, barony_id_1, barony_id_2, path: normalizedPath };
          recordChange(req, { table: 'trade_lines', action: 'update', before: { ...line, path: parseTradeLinePath(line.path) }, after: updated, key: String(lineId) });
          res.json(updated);
        });
      });
    });
  });
});
app.delete('/api/trade_lines/:id', requireAdmin, (req, res) => {
  const lineId = parseInt(req.params.id, 10);
  if (!lineId) return res.status(400).json({ error: 'ID invalide' });
  db.get('SELECT * FROM trade_lines WHERE id=?', [lineId], (err, line) => {
    if (err) return handleError(res, err);
    if (!line) return res.status(404).json({ error: 'Ligne introuvable' });
    db.run('DELETE FROM trade_lines WHERE id=?', [lineId], function(err2) {
      if (err2) return handleError(res, err2);
      recordChange(req, { table: 'trade_lines', action: 'delete', before: { ...line, path: parseTradeLinePath(line.path) }, after: null, key: String(lineId) });
      res.json({ deleted: this.changes });
    });
  });
});

app.post('/api/users/me/trade_links/build', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const targetId = parseInt(req.body.barony_id, 10);
  const routeType = req.body.type === 'naval' ? 'naval' : 'land';
  if (!targetId) return res.status(400).json({ error: 'ID invalide' });
  getSeigneurie(req, 'seigneuries.id as id, seigneuries.baronnie_id, seigneuries.inventaire_id', (err, srow) => {
    if (err) return handleError(res, err);
    if (!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const startId = srow.baronnie_id;
    if (startId === targetId) return res.status(400).json({ error: 'Baronnie identique' });
    db.get('SELECT seigneur_id, name FROM baronies WHERE id=?', [targetId], (err2, brow) => {
      if (err2) return handleError(res, err2);
      if (!brow || !brow.seigneur_id) return res.status(400).json({ error: 'Baronnie invalide' });
      const finalizeBuild = (cost, sql, storedPath, responsePath, distance) => {
        db.get('SELECT or_ FROM inventaire WHERE id=?', [srow.inventaire_id], (err4, inv) => {
          if (err4) return handleError(res, err4);
          if (!inv || (inv.or_ || 0) < cost) return res.status(400).json({ error: 'Ressources insuffisantes' });
          consumeResources(db, srow.id, { or_: cost }, err5 => {
            if (err5) return handleError(res, err5);
            db.run(sql, [startId, targetId, JSON.stringify(storedPath)], function(err6) {
              if (err6) return handleError(res, err6);
              res.json({ id: this.lastID, cost, distance, type: routeType, path: responsePath });
            });
          });
        });
      };
      if (routeType === 'naval') {
        const requestedPath = parseTradeLinePath(req.body.path);
        if (!requestedPath.length) {
          return res.status(400).json({ error: 'Le chemin maritime est requis' });
        }
        getTradeLineAdjacency((err3, adjacency) => {
          if (err3) return handleError(res, err3);
          getBaronyMaritimeZones((errZones, baronyZoneMap) => {
            if (errZones) return handleError(res, errZones);
            const validationError = validateTradeLinePath(requestedPath, startId, targetId, adjacency, baronyZoneMap);
            if (validationError) return res.status(400).json({ error: validationError });
            const distance = computePathDistance(requestedPath, adjacency);
            if (distance == null) return res.status(400).json({ error: 'Chemin maritime invalide' });
            finalizeBuild(distance * 3, 'INSERT INTO trade_lines (barony_id_1, barony_id_2, path) VALUES (?,?,?)', requestedPath, requestedPath, distance);
          });
        });
        return;
      }
      getTradeAdjacency((err3, adjacency) => {
        if (err3) return handleError(res, err3);
        let normalizedPath = parseTradeRoutePath(req.body.path);
        if (!normalizedPath.length) {
          const computed = computeShortestPath(startId, targetId, adjacency);
          if (!computed || computed.distance == null) return res.status(400).json({ error: 'Inaccessible' });
          normalizedPath = computed.path;
        }
        const normalized = normalizeTradeRoutePathInput(normalizedPath, startId, targetId);
        if (normalized.error) return res.status(400).json({ error: normalized.error });
        const fullPath = normalized.fullPath.length ? normalized.fullPath : normalizedPath;
        const validationError = validateTradeRoutePath(fullPath, startId, targetId, adjacency);
        if (validationError) return res.status(400).json({ error: validationError });
        const distance = computePathDistance(fullPath, adjacency);
        if (distance == null) return res.status(400).json({ error: 'Chemin invalide' });
        finalizeBuild(distance * 3, 'INSERT INTO trade_routes (barony_id_1, barony_id_2, path) VALUES (?,?,?)', normalized.storedPath, fullPath, distance);
      });
    });
  });
});

// Maritime zones CRUD
const maritimeZoneFields = ['name','seigneur_id'];
const maritimeZonesRouter = crudRoutes('maritime_zones', maritimeZoneFields);
maritimeZonesRouter.use((req,res,next)=>{
  if(['POST','PUT','DELETE'].includes(req.method)) return requireAdmin(req,res,next);
  next();
});
app.use('/api/maritime_zones', maritimeZonesRouter);

// Maritime zone adjacency
app.get('/api/maritime_zone_connections', (req,res)=>{ list('maritime_zone_connections')(req,res); });
app.post('/api/maritime_zone_connections', requireAdmin, (req,res)=>{
  let { zone_id_1, zone_id_2, distance } = req.body;
  zone_id_1 = parseInt(zone_id_1);
  zone_id_2 = parseInt(zone_id_2);
  distance = parseInt(distance, 10);
  if (!distance || distance < 1) distance = 1;
  if(!zone_id_1 || !zone_id_2 || zone_id_1 === zone_id_2){
    return res.status(400).json({error:'Invalid maritime zone ids'});
  }
  const [id1,id2] = zone_id_1 < zone_id_2 ? [zone_id_1, zone_id_2] : [zone_id_2, zone_id_1];
  db.run('INSERT OR IGNORE INTO maritime_zone_connections (zone_id_1, zone_id_2, distance) VALUES (?,?,?)',[id1,id2,distance],function(err){
    if(err) return handleError(res, err);
    if (this.changes > 0) {
      recordChange(req, { table: 'maritime_zone_connections', action: 'create', before: null, after: { zone_id_1: id1, zone_id_2: id2, distance }, key: `${id1}-${id2}` });
    }
    res.json({added: this.changes});
  });
});
app.put('/api/maritime_zone_connections', requireAdmin, (req,res)=>{
  let { zone_id_1, zone_id_2, distance } = req.body;
  zone_id_1 = parseInt(zone_id_1);
  zone_id_2 = parseInt(zone_id_2);
  distance = parseInt(distance, 10);
  if (!distance || distance < 1) {
    return res.status(400).json({error:'Invalid distance'});
  }
  if(!zone_id_1 || !zone_id_2 || zone_id_1 === zone_id_2){
    return res.status(400).json({error:'Invalid maritime zone ids'});
  }
  const [id1,id2] = zone_id_1 < zone_id_2 ? [zone_id_1, zone_id_2] : [zone_id_2, zone_id_1];
  db.get('SELECT * FROM maritime_zone_connections WHERE zone_id_1=? AND zone_id_2=?', [id1,id2], (err, row) => {
    if (err) return handleError(res, err);
    if (!row) return res.status(404).json({error:'Connexion introuvable'});
    db.run('UPDATE maritime_zone_connections SET distance=? WHERE zone_id_1=? AND zone_id_2=?', [distance, id1, id2], function(err2){
      if (err2) return handleError(res, err2);
      if (this.changes > 0) {
        recordChange(req, { table: 'maritime_zone_connections', action: 'update', before: row, after: { ...row, distance }, key: `${id1}-${id2}` });
      }
      res.json({updated: this.changes});
    });
  });
});
app.delete('/api/maritime_zone_connections', requireAdmin, (req,res)=>{
  let { zone_id_1, zone_id_2 } = req.body;
  zone_id_1 = parseInt(zone_id_1);
  zone_id_2 = parseInt(zone_id_2);
  if(!zone_id_1 || !zone_id_2){
    return res.status(400).json({error:'Invalid maritime zone ids'});
  }
  const [id1,id2] = zone_id_1 < zone_id_2 ? [zone_id_1, zone_id_2] : [zone_id_2, zone_id_1];
  db.run('DELETE FROM maritime_zone_connections WHERE zone_id_1=? AND zone_id_2=?',[id1,id2],function(err){
    if(err) return handleError(res, err);
    if (this.changes > 0) {
      recordChange(req, { table: 'maritime_zone_connections', action: 'delete', before: { zone_id_1: id1, zone_id_2: id2 }, after: null, key: `${id1}-${id2}` });
    }
    res.json({deleted: this.changes});
  });
});

// Maritime zone to barony links
app.get('/api/maritime_zone_baronies', (req,res)=>{ list('maritime_zone_baronies')(req,res); });
app.post('/api/maritime_zone_baronies', requireAdmin, (req,res)=>{
  create('maritime_zone_baronies',['zone_id','barony_id'])(req,res);
});
app.delete('/api/maritime_zone_baronies', requireAdmin, (req,res)=>{
  const { zone_id, barony_id } = req.query;
  db.run('DELETE FROM maritime_zone_baronies WHERE zone_id=? AND barony_id=?',[zone_id,barony_id],function(err){
    if(err) return handleError(res, err);
    if (this.changes > 0) {
      recordChange(req, { table: 'maritime_zone_baronies', action: 'delete', before: { zone_id, barony_id }, after: null, key: `${zone_id}-${barony_id}` });
    }
    res.json({deleted: this.changes});
  });
});

// Trade partners API
app.get('/api/trade_partners', (req, res) => {
  const baronyId = parseInt(req.query.barony_id, 10);
  if (!baronyId) return res.json([]);
  const sql = `
    SELECT b.id, b.name, s.name AS seigneur_name, d.name AS duchy_name
    FROM baronies b
    LEFT JOIN seigneurs s ON b.seigneur_id=s.id
    LEFT JOIN counties c ON b.county_id=c.id
    LEFT JOIN duchies d ON c.duchy_id=d.id
    WHERE b.id IN (
      SELECT CASE WHEN barony_id_1=? THEN barony_id_2 ELSE barony_id_1 END FROM barony_connections WHERE barony_id_1=? OR barony_id_2=?
      UNION
      SELECT CASE WHEN barony_id_1=? THEN barony_id_2 ELSE barony_id_1 END FROM trade_routes WHERE barony_id_1=? OR barony_id_2=?
      UNION
      SELECT CASE WHEN barony_id_1=? THEN barony_id_2 ELSE barony_id_1 END FROM trade_lines WHERE barony_id_1=? OR barony_id_2=?
    )
    ORDER BY b.id
  `;
  db.all(sql, [baronyId, baronyId, baronyId, baronyId, baronyId, baronyId, baronyId, baronyId, baronyId], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows || []);
  });
});

// Pixel data API
app.get('/api/barony_pixels', (req, res) => {
  const id = req.query.id;
  const idsParam = req.query.ids;
  const offsetParam = req.query.offset;
  const limitParam = req.query.limit;

  if (id) {
    db.get('SELECT data FROM barony_pixels WHERE barony_id=?', [id], (err, row) => {
      if (err) return handleError(res, err);
      if (!row) return res.json([]);
      gunzip(row.data)
        .then(buf => res.json(JSON.parse(buf.toString())))
        .catch(e => handleError(res, e));
    });
    return;
  }

  let sql = 'SELECT barony_id, data FROM barony_pixels';
  const params = [];
  if (idsParam) {
    const ids = idsParam.split(',').map(v => parseInt(v, 10)).filter(Number.isFinite);
    if (ids.length === 0) return res.json({});
    sql += ` WHERE barony_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  } else if (offsetParam !== undefined || limitParam !== undefined) {
    const offset = parseInt(offsetParam, 10) || 0;
    const limit = parseInt(limitParam, 10) || 100;
    sql += ' ORDER BY barony_id LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }

  db.all(sql, params, (err, rows = []) => {
    if (err) return handleError(res, err);
    const out = {};
    Promise.all(rows.map(async r => {
      try {
        const json = await gunzip(r.data);
        out[r.barony_id] = JSON.parse(json.toString());
      } catch (e) {
        logger.warn(`Failed to decompress barony ${r.barony_id}`, e);
      }
    })).then(() => res.json(out)).catch(e => handleError(res, e));
  });
});

app.put('/api/barony_pixels', (req, res) => {
  const data = req.body || {};
  const entries = Object.entries(data);
  const changes = [];
  const fetchBefore = (baronyId) => new Promise((resolve, reject) => {
    db.get('SELECT data FROM barony_pixels WHERE barony_id=?', [baronyId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
  const processEntries = async () => {
    for (const [id, coords] of entries) {
      const baronyId = parseInt(id, 10);
      const row = await fetchBefore(baronyId);
      let before = null;
      if (row && row.data) {
        try {
          const buf = await gunzip(row.data);
          before = JSON.parse(buf.toString());
        } catch (e) {
          logger.warn(`Failed to decompress barony ${baronyId}`, e);
        }
      }
      const beforeLen = Array.isArray(before) ? before.length : 0;
      const afterLen = Array.isArray(coords) ? coords.length : 0;
      if (JSON.stringify(before || []) === JSON.stringify(coords || [])) continue;
      const beforeCompressed = before ? zlib.gzipSync(JSON.stringify(before)).toString('base64') : null;
      const afterCompressed = zlib.gzipSync(JSON.stringify(coords || [])).toString('base64');
      changes.push({
        id: baronyId,
        before: { barony_id: baronyId, compressed: beforeCompressed, points: beforeLen },
        after: { barony_id: baronyId, compressed: afterCompressed, points: afterLen },
        change: { data: { before: `${beforeLen} points`, after: `${afterLen} points` } }
      });
    }
  };
  processEntries().then(() => {
    db.serialize(() => {
      const stmt = db.prepare('INSERT OR REPLACE INTO barony_pixels(barony_id,data) VALUES (?,?)');
      for (const [id, coords] of entries) {
        const buf = zlib.gzipSync(JSON.stringify(coords));
        stmt.run(id, buf);
      }
      stmt.finalize(err => {
        if (err) return handleError(res, err);
        Promise.all(changes.map(c => recordChange(req, { table: 'barony_pixels', action: 'update', before: c.before, after: c.after, changes: c.change, key: c.id })))
          .finally(() => res.json({ok: true}));
      });
    });
  }).catch(err => handleError(res, err));
});

app.get('/api/maritime_zone_pixels', (req, res) => {
  const id = req.query.id;
  if (id) {
    db.get('SELECT data FROM maritime_zone_pixels WHERE zone_id=?', [id], (err, row) => {
      if (err) return handleError(res, err);
      if (!row) return res.json([]);
      gunzip(row.data)
        .then(buf => res.json(JSON.parse(buf.toString())))
        .catch(e => handleError(res, e));
    });
  } else {
    db.all('SELECT zone_id, data FROM maritime_zone_pixels', [], (err, rows = []) => {
      if (err) return handleError(res, err);
      const out = {};
      Promise.all(rows.map(async r => {
        try {
          const json = await gunzip(r.data);
          out[r.zone_id] = JSON.parse(json.toString());
        } catch (e) {
          logger.warn(`Failed to decompress maritime zone ${r.zone_id}`, e);
        }
      })).then(() => res.json(out)).catch(e => handleError(res, e));
    });
  }
});

app.put('/api/maritime_zone_pixels', (req, res) => {
  const data = req.body || {};
  const entries = Object.entries(data);
  const changes = [];
  const fetchBefore = (zoneId) => new Promise((resolve, reject) => {
    db.get('SELECT data FROM maritime_zone_pixels WHERE zone_id=?', [zoneId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
  const processEntries = async () => {
    for (const [id, coords] of entries) {
      const zoneId = parseInt(id, 10);
      const row = await fetchBefore(zoneId);
      let before = null;
      if (row && row.data) {
        try {
          const buf = await gunzip(row.data);
          before = JSON.parse(buf.toString());
        } catch (e) {
          logger.warn(`Failed to decompress maritime zone ${zoneId}`, e);
        }
      }
      const beforeLen = Array.isArray(before) ? before.length : 0;
      const afterLen = Array.isArray(coords) ? coords.length : 0;
      if (JSON.stringify(before || []) === JSON.stringify(coords || [])) continue;
      const beforeCompressed = before ? zlib.gzipSync(JSON.stringify(before)).toString('base64') : null;
      const afterCompressed = zlib.gzipSync(JSON.stringify(coords || [])).toString('base64');
      changes.push({
        id: zoneId,
        before: { zone_id: zoneId, compressed: beforeCompressed, points: beforeLen },
        after: { zone_id: zoneId, compressed: afterCompressed, points: afterLen },
        change: { data: { before: `${beforeLen} points`, after: `${afterLen} points` } }
      });
    }
  };
  processEntries().then(() => {
    db.serialize(() => {
      const stmt = db.prepare('INSERT OR REPLACE INTO maritime_zone_pixels(zone_id,data) VALUES (?,?)');
      for (const [id, coords] of entries) {
        const buf = zlib.gzipSync(JSON.stringify(coords));
        stmt.run(id, buf);
      }
      stmt.finalize(err => {
        if (err) return handleError(res, err);
        Promise.all(changes.map(c => recordChange(req, { table: 'maritime_zone_pixels', action: 'update', before: c.before, after: c.after, changes: c.change, key: c.id })))
          .finally(() => res.json({ok: true}));
      });
    });
  }).catch(err => handleError(res, err));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on http://localhost:${PORT}`));
