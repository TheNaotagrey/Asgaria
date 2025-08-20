const express = require('express');
const sqlite3 = require('sqlite3');
const zlib = require('zlib');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const { inventaireFields, performTransaction } = require('./transactions');
const logger = require('./logger');
const handleError = require('./handleError');
const { consumeResources } = require('./services/buildingService');
const { StorageEffect, ResourceProductionEffect, BuildingProductionEffect, IDHEffect, VariableWorkersEffect, UnlockPageEffect, SpellSuccessEffect, SpellBasicDiscountEffect, SpellAdvancedDiscountEffect, SpellRangeEffect, SpellMaxPerMonthEffect } = require('./effects');
const app = express();
const db = new sqlite3.Database('asgaria.db');

const VALID_TABLES = new Set([
  'users','religions','cultures','seigneurs','empires','kingdoms','archduchies',
  'duchies','marquisates','counties','viscounties','baronies','barony_pixels',
  'canonical_lands','inventaire','seigneuries','transactions','barony_properties',
  'building_properties','infrastructure_properties','barony_connections','tags','spells'
]);

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
  FOREIGN KEY(religion_id) REFERENCES religions(id),
  FOREIGN KEY(overlord_id) REFERENCES seigneurs(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS empires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS kingdoms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  empire_id INTEGER,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id),
  FOREIGN KEY(empire_id) REFERENCES empires(id)
);
CREATE TABLE IF NOT EXISTS archduchies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS duchies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  kingdom_id INTEGER,
  archduchy_id INTEGER,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id),
  FOREIGN KEY(kingdom_id) REFERENCES kingdoms(id),
  FOREIGN KEY(archduchy_id) REFERENCES archduchies(id)
);
CREATE TABLE IF NOT EXISTS marquisates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS counties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  duchy_id INTEGER,
  marquisate_id INTEGER,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id),
  FOREIGN KEY(duchy_id) REFERENCES duchies(id),
  FOREIGN KEY(marquisate_id) REFERENCES marquisates(id)
);
CREATE TABLE IF NOT EXISTS viscounties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  seigneur_id INTEGER,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS baronies (
  id INTEGER PRIMARY KEY,
  name TEXT,
  seigneur_id INTEGER,
  religion_pop_id INTEGER,
  county_id INTEGER,
  viscounty_id INTEGER,
  culture_id INTEGER,
  sanctuary_religion_id INTEGER,
  priory_religion_id INTEGER,
  church_religion_id INTEGER,
  cathedral_religion_id INTEGER,
  player INTEGER DEFAULT 0,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id) ON DELETE SET NULL,
  FOREIGN KEY(religion_pop_id) REFERENCES religions(id),
  FOREIGN KEY(county_id) REFERENCES counties(id),
  FOREIGN KEY(viscounty_id) REFERENCES viscounties(id),
  FOREIGN KEY(culture_id) REFERENCES cultures(id),
  FOREIGN KEY(sanctuary_religion_id) REFERENCES religions(id),
  FOREIGN KEY(priory_religion_id) REFERENCES religions(id),
  FOREIGN KEY(church_religion_id) REFERENCES religions(id),
  FOREIGN KEY(cathedral_religion_id) REFERENCES religions(id)
);
CREATE TABLE IF NOT EXISTS barony_pixels (
  barony_id INTEGER PRIMARY KEY REFERENCES baronies(id),
  data BLOB
);
CREATE TABLE IF NOT EXISTS canonical_lands (
  religion_id INTEGER,
  barony_id INTEGER,
  PRIMARY KEY(religion_id, barony_id),
  FOREIGN KEY(religion_id) REFERENCES religions(id),
  FOREIGN KEY(barony_id) REFERENCES baronies(id)
);
CREATE TABLE IF NOT EXISTS barony_connections (
  barony_id_1 INTEGER NOT NULL,
  barony_id_2 INTEGER NOT NULL,
  CHECK (barony_id_1 < barony_id_2),
  PRIMARY KEY(barony_id_1, barony_id_2),
  FOREIGN KEY(barony_id_1) REFERENCES baronies(id),
  FOREIGN KEY(barony_id_2) REFERENCES baronies(id)
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
CREATE TABLE IF NOT EXISTS seigneuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baronnie_id INTEGER,
  seigneur_id INTEGER,
  population INTEGER,
  tax_rate INTEGER DEFAULT 5,
  inventaire_id INTEGER,
  buildings TEXT DEFAULT '{}',
  infrastructures TEXT DEFAULT '{}',
  spells_cast INTEGER DEFAULT 0,
  spell_month TEXT,
  FOREIGN KEY(baronnie_id) REFERENCES baronies(id),
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id),
  FOREIGN KEY(inventaire_id) REFERENCES inventaire(id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seigneurie_id INTEGER,
  resource TEXT,
  amount INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(seigneurie_id) REFERENCES seigneuries(id)
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
  tags TEXT,
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
  tags TEXT,
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
`;

db.exec(initSql, () => {
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
  db.all("PRAGMA table_info(seigneuries)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'buildings')) {
        db.run("ALTER TABLE seigneuries ADD COLUMN buildings TEXT DEFAULT '{}' ");
      }
      if (!rows.some(r => r.name === 'infrastructures')) {
        db.run("ALTER TABLE seigneuries ADD COLUMN infrastructures TEXT DEFAULT '{}' ");
      }
      if (!rows.some(r => r.name === 'tax_rate')) {
        db.run("ALTER TABLE seigneuries ADD COLUMN tax_rate INTEGER DEFAULT 5");
      }
      if (!rows.some(r => r.name === 'spells_cast')) {
        db.run("ALTER TABLE seigneuries ADD COLUMN spells_cast INTEGER DEFAULT 0");
      }
      if (!rows.some(r => r.name === 'spell_month')) {
        db.run("ALTER TABLE seigneuries ADD COLUMN spell_month TEXT");
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
    if (!rows.some(r => r.name === 'sanctuary_religion_id')) {
      db.run('ALTER TABLE baronies ADD COLUMN sanctuary_religion_id INTEGER');
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
    if (!rows.some(r => r.name === 'player')) {
      db.run('ALTER TABLE baronies ADD COLUMN player INTEGER DEFAULT 0');
    }
  });
  db.all("PRAGMA table_info(counties)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'marquisate_id')) {
        db.run('ALTER TABLE counties ADD COLUMN marquisate_id INTEGER');
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
      if (!rows.some(r => r.name === 'seigneur_id')) {
        db.run('ALTER TABLE duchies ADD COLUMN seigneur_id INTEGER REFERENCES seigneurs(id)');
      }
    }
  });
  db.all("PRAGMA table_info(kingdoms)", (err, rows) => {
    if (!err && rows) {
      if (!rows.some(r => r.name === 'empire_id')) {
        db.run('ALTER TABLE kingdoms ADD COLUMN empire_id INTEGER');
      }
      if (!rows.some(r => r.name === 'seigneur_id')) {
        db.run('ALTER TABLE kingdoms ADD COLUMN seigneur_id INTEGER REFERENCES seigneurs(id)');
      }
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
    if (!rows.some(r => r.name === 'tags')) {
      db.run('ALTER TABLE building_properties ADD COLUMN tags TEXT');
    }
  });
  db.all("PRAGMA table_info(infrastructure_properties)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(r => r.name === 'absolute_restrictions')) {
      db.run('ALTER TABLE infrastructure_properties ADD COLUMN absolute_restrictions TEXT');
    }
    if (!rows.some(r => r.name === 'tags')) {
      db.run('ALTER TABLE infrastructure_properties ADD COLUMN tags TEXT');
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
});

// accept large pixel blobs
app.use(express.json({ limit: '50mb' }));
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  logger.warn('SESSION_SECRET environment variable not set; using fallback secret');
}
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: '.' }),
  secret: sessionSecret || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
}));
app.use((req,res,next)=>{
  const adminPages = ['/admin.html','/mapEditor.html'];
  if (adminPages.includes(req.path) && (!req.session.user || !req.session.user.is_admin)) {
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
    if (!req.session.user.is_admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  next();
});

function list(table) {
  return (req, res) => {
    if (!VALID_TABLES.has(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }
    db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
      if (err) return handleError(res, err);
      res.json(rows);
    });
  };
}

function sanitize(val){
  return val === '' ? null : val;
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function create(table, fields) {
  return (req, res) => {
    if (!VALID_TABLES.has(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }
    const values = fields.map(f => sanitize(req.body[f]));
    const placeholders = fields.map(() => '?').join(',');
    db.run(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})`, values, function(err){
      if (err) return handleError(res, err);
      res.json({id: this.lastID});
    });
  };
}

function update(table, fields) {
  return (req, res) => {
    if (!VALID_TABLES.has(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }
    const id = req.params.id;
    const set = fields.map(f => `${f}=?`).join(',');
    const values = fields.map(f => sanitize(req.body[f]));
    values.push(id);
    db.run(`UPDATE ${table} SET ${set} WHERE id=?`, values, function(err){
      if (err) return handleError(res, err);
      res.json({changes: this.changes});
    });
  };
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
        req.session.user = {
          id: this.lastID,
          email,
          first_name,
          last_name,
          is_admin: 0
        };
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
        req.session.user = {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          is_admin: !!user.is_admin
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

app.get('/api/me', async (req, res) => {
  try {
    res.json(req.session.user || null);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/users', (req, res) => {
  db.all('SELECT id, email, first_name, last_name FROM users', [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
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

app.get('/api/empires', list('empires'));
app.post('/api/empires', create('empires',['name','seigneur_id']));
app.put('/api/empires/:id', update('empires',['name','seigneur_id']));

app.get('/api/kingdoms', list('kingdoms'));
app.post('/api/kingdoms', create('kingdoms',['name','seigneur_id','empire_id']));
app.put('/api/kingdoms/:id', update('kingdoms',['name','seigneur_id','empire_id']));

app.get('/api/archduchies', list('archduchies'));
app.post('/api/archduchies', create('archduchies',['name','seigneur_id']));
app.put('/api/archduchies/:id', update('archduchies',['name','seigneur_id']));

app.get('/api/duchies', list('duchies'));
app.post('/api/duchies', create('duchies',['name','seigneur_id','kingdom_id','archduchy_id']));
app.put('/api/duchies/:id', update('duchies',['name','seigneur_id','kingdom_id','archduchy_id']));

app.get('/api/marquisates', list('marquisates'));
app.post('/api/marquisates', create('marquisates',['name','seigneur_id']));
app.put('/api/marquisates/:id', update('marquisates',['name','seigneur_id']));

app.get('/api/counties', list('counties'));
app.post('/api/counties', create('counties',['name','seigneur_id','duchy_id','marquisate_id']));
app.put('/api/counties/:id', update('counties',['name','seigneur_id','duchy_id','marquisate_id']));

app.get('/api/viscounties', list('viscounties'));
app.post('/api/viscounties', create('viscounties',['name','seigneur_id']));
app.put('/api/viscounties/:id', update('viscounties',['name','seigneur_id']));

app.get('/api/religions', list('religions'));
app.post('/api/religions', create('religions',['name','color']));
app.put('/api/religions/:id', update('religions',['name','color']));

app.get('/api/cultures', list('cultures'));
app.post('/api/cultures', create('cultures',['name','color']));
app.put('/api/cultures/:id', update('cultures',['name','color']));

app.get('/api/seigneurs', list('seigneurs'));
app.post('/api/seigneurs', create('seigneurs',['name','religion_id','overlord_id','user_id']));
app.put('/api/seigneurs/:id', update('seigneurs',['name','religion_id','overlord_id','user_id']));

app.get('/api/inventaire', list('inventaire'));
app.post('/api/inventaire', create('inventaire', inventaireFields));
app.put('/api/inventaire/:id', update('inventaire', inventaireFields));

app.get('/api/seigneuries', requireAdmin, (req, res) => {
  const invSelect = inventaireFields.map(f => `i.${f}`).join(',');
  db.all(`SELECT s.id, s.baronnie_id, s.seigneur_id, s.population, s.inventaire_id, s.buildings, s.infrastructures, ${invSelect} FROM seigneuries s JOIN inventaire i ON s.inventaire_id=i.id`, [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.post('/api/seigneuries', requireAdmin, (req, res) => {
  const seigFields = ['baronnie_id','seigneur_id','population'];
  const seigValues = seigFields.map(f => sanitize(req.body[f]));
  const invValues = inventaireFields.map(f => sanitize(req.body[f]) || 0);
  const invPlace = inventaireFields.map(() => '?').join(',');
  db.run(`INSERT INTO inventaire (${inventaireFields.join(',')}) VALUES (${invPlace})`, invValues, function(err){
    if (err) return handleError(res, err);
    const invId = this.lastID;
  db.run('INSERT INTO seigneuries (baronnie_id,seigneur_id,population,inventaire_id,buildings,infrastructures) VALUES (?,?,?,?,?,?)',
    [...seigValues, invId, '{}', '{}'], function(err2){
      if (err2) return handleError(res, err2);
      res.json({ id: this.lastID, inventaire_id: invId });
    });
  });
});

app.put('/api/seigneuries/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const seigFields = ['baronnie_id','seigneur_id','population'];
  const seigSet = seigFields.map(f => `${f}=?`).join(',');
  const seigValues = seigFields.map(f => sanitize(req.body[f]));
  seigValues.push(id);
  db.run(`UPDATE seigneuries SET ${seigSet} WHERE id=?`, seigValues, function(err){
    if (err) return handleError(res, err);
    const invId = req.body.inventaire_id;
    const invSet = inventaireFields.map(f => `${f}=?`).join(',');
    const invValues = inventaireFields.map(f => sanitize(req.body[f]) || 0);
    invValues.push(invId);
    db.run(`UPDATE inventaire SET ${invSet} WHERE id=?`, invValues, function(err2){
      if (err2) return handleError(res, err2);
      res.json({ changes: this.changes });
    });
  });
});

app.get('/api/my_seigneurie', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const userId = req.session.user.id;
  db.serialize(() => {
    db.get('SELECT * FROM seigneurs WHERE user_id=?', [userId], (err, seigneur) => {
      if (err) return handleError(res, err);
      function ensureSeigneur(cb) {
        if (seigneur) return cb(seigneur);
        const name = `Seigneur ${req.session.user.first_name}`;
        db.run('INSERT INTO seigneurs(name,user_id) VALUES (?,?)', [name, userId], function(err){
          if (err) return handleError(res, err);
          cb({ id: this.lastID, name, user_id: userId });
        });
      }
      ensureSeigneur(seig => {
        db.get('SELECT * FROM seigneuries WHERE seigneur_id=?', [seig.id], (err, seigneurie) => {
          if (err) return handleError(res, err);
          function ensureSeigneurie(cb) {
            if (seigneurie) return cb(seigneurie);
            db.run('INSERT INTO inventaire DEFAULT VALUES', function(err){
              if (err) return handleError(res, err);
              const invId = this.lastID;
              db.run('INSERT INTO seigneuries (baronnie_id,seigneur_id,population,inventaire_id,buildings,infrastructures) VALUES (NULL,?,?,?,?,?)',
                [seig.id, 0, invId, '{}', '{}'], function(err){
                  if (err) return handleError(res, err);
                  cb({ id: this.lastID, baronnie_id: null, seigneur_id: seig.id, population: 0, inventaire_id: invId, buildings: '{}', infrastructures: '{}', tax_rate: 5 });
                });
            });
          }
          ensureSeigneurie(s => {
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
                let employed = 0;
                const employmentDetails = [];
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
                  const capacities = { vivres: 500, points_magique: 2000 };
                  const currentMonth = new Date().toISOString().slice(0,7);
                  let spellsCast = s.spells_cast || 0;
                  if (s.spell_month !== currentMonth) spellsCast = 0;
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
                    idh: 5,
                    idhDetails: [{ label: 'Base', amount: 5, source: 1 }],
                    unlockedPages: {},
                    spellSuccessBonus: 0,
                    basicSpellDiscount: 0,
                    advancedSpellDiscount: 0,
                    spellRangeBonus: 0,
                    spellMax: 0
                  };
                  for (const ip of infraList) {
                    const entry = infrastructures[ip.id] || infrastructures[String(ip.id)] || 0;
                    const count = typeof entry === 'object' ? (entry.built || 0) : entry;
                    if (!count) continue;
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
                    res.json({ seigneurie: s, barony, inventaire, production, productionDetails, fields, baronyProps, employment, employmentDetails, buildings, infrastructures, capacities, buildingProductionBonus, buildingProductionBonusDetails, idh, idhDetails, unlockedPages: effectCtx.unlockedPages, spellSuccess, basicSpellDiscount, advancedSpellDiscount, spellRange, spellMax, spellsCast });
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
                        }
                        if (effObj) {
                          effObj.apply(effectCtx, 1, 'Baronnie');
                        }
                      }
                      db.get(`SELECT b.*, r.name as religion_name, c.name as culture_name FROM baronies b LEFT JOIN religions r ON b.religion_pop_id=r.id LEFT JOIN cultures c ON b.culture_id=c.id WHERE b.id=?`, [s.baronnie_id], (err4, barony) => {
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
          });
        });
      });
    });
  });
});

app.post('/api/tax_rate', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const rate = parseInt(req.body.tax_rate, 10);
  if (Number.isNaN(rate) || rate < 0 || rate > 12) {
    return res.status(400).json({ error: 'Taux invalide' });
  }
  const userId = req.session.user.id;
  db.get('SELECT seigneuries.id FROM seigneurs JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id WHERE seigneurs.user_id=?', [userId], (err, row) => {
    if (err) return handleError(res, err);
    if (!row) return res.status(400).json({ error: 'Seigneurie introuvable' });
    db.run('UPDATE seigneuries SET tax_rate=? WHERE id=?', [rate, row.id], err2 => {
      if (err2) return handleError(res, err2);
      res.json({ tax_rate: rate });
    });
  });
});

app.get('/api/transactions', requireAdmin, (req,res)=>{
  list('transactions')(req,res);
});
app.post('/api/transactions', requireAdmin, (req,res)=>{
  create('transactions',['seigneurie_id','resource','amount'])(req,res);
});

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
app.post('/api/baronies', create('baronies',[
  'id','name','seigneur_id','religion_pop_id','county_id','viscounty_id','culture_id',
  'sanctuary_religion_id','priory_religion_id','church_religion_id','cathedral_religion_id','player'
]));
app.put('/api/baronies/:id', update('baronies',[
  'name','seigneur_id','religion_pop_id','county_id','viscounty_id','culture_id',
  'sanctuary_religion_id','priory_religion_id','church_religion_id','cathedral_religion_id','player'
]));
app.delete('/api/baronies/:id', (req,res)=>{
  db.run('DELETE FROM baronies WHERE id=?',[req.params.id], function(err){
    if(err) return handleError(res, err);
    res.json({deleted: this.changes});
  });
});

const baronyPropFields = ['barony_id','water_access','sea_access','has_or','has_argent','has_fer','has_pierre','has_epices','has_perle','has_encens','has_huiles','has_pierre_precieuses','has_soie','has_sel','has_fourrure','has_teinture','has_ivoire','has_vin','field_limit','fishing_limit','high_sea_boat_limit','effects'];
app.get('/api/barony_properties', requireAdmin, (req,res)=>{
  list('barony_properties')(req,res);
});
app.post('/api/barony_properties', requireAdmin, (req,res)=>{
  create('barony_properties', baronyPropFields)(req,res);
});
app.put('/api/barony_properties/:id', requireAdmin, (req,res)=>{
  update('barony_properties', baronyPropFields)(req,res);
});

const tagFields = ['label'];
app.get('/api/tags', (req,res)=>{
  list('tags')(req,res);
});
app.post('/api/tags', requireAdmin, (req,res)=>{
  create('tags', tagFields)(req,res);
});
app.put('/api/tags/:id', requireAdmin, (req,res)=>{
  update('tags', tagFields)(req,res);
});

const buildingPropFields = ['label','produces','production','costs','max','workers_per_building','absolute_restrictions','infra_restrictions','tags','description'];
app.get('/api/building_properties', (req,res)=>{
  list('building_properties')(req,res);
});
app.post('/api/building_properties', requireAdmin, (req,res)=>{
  create('building_properties', buildingPropFields)(req,res);
});
app.put('/api/building_properties/:id', requireAdmin, (req,res)=>{
  update('building_properties', buildingPropFields)(req,res);
});

const infraPropFields = ['label','type','max','workers_per_building','effects','costs','absolute_restrictions','restrictions','tags','description'];
app.get('/api/infrastructure_properties', (req,res)=>{
  list('infrastructure_properties')(req,res);
});
app.post('/api/infrastructure_properties', requireAdmin, (req,res)=>{
  create('infrastructure_properties', infraPropFields)(req,res);
});
app.put('/api/infrastructure_properties/:id', requireAdmin, (req,res)=>{
  update('infrastructure_properties', infraPropFields)(req,res);
});

const spellFields = ['label','type','costs','effects','description'];
app.get('/api/spells', (req,res)=>{
  list('spells')(req,res);
});
app.post('/api/spells', requireAdmin, (req,res)=>{
  create('spells', spellFields)(req,res);
});
app.put('/api/spells/:id', requireAdmin, (req,res)=>{
  update('spells', spellFields)(req,res);
});

app.post('/api/cast_spell', (req,res)=>{
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const spellId = parseInt(req.body.id, 10);
  if (!spellId) return res.status(400).json({ error: 'ID invalide' });
  const userId = req.session.user.id;
  db.get('SELECT seigneuries.id, seigneuries.baronnie_id, seigneuries.buildings, seigneuries.infrastructures, seigneuries.spells_cast, seigneuries.spell_month FROM seigneurs JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id WHERE seigneurs.user_id=?', [userId], (err, srow) => {
    if (err) return handleError(res, err);
    if (!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const seigneurieId = srow.id;
    const infrastructures = safeParse(srow.infrastructures, {});
    const currentMonth = new Date().toISOString().slice(0,7);
    let casts = srow.spells_cast || 0;
    let spellMonth = srow.spell_month;
    if (spellMonth !== currentMonth) { casts = 0; spellMonth = currentMonth; }
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
          consumeResources(db, seigneurieId, costs, err5 => {
            if (err5) return handleError(res, err5);
            const successChance = 75 + (effectCtx.spellSuccessBonus || 0);
            const success = Math.random() * 100 < successChance;
            const effects = success ? safeParse(spell.effects, []) : [];
            let idx = 0;
            function applyNext() {
              if (idx >= effects.length) return finish();
              const e = effects[idx++];
              if (e.type === 'production') {
                performTransaction(db, seigneurieId, e.resource, e.amount || 0, err6 => {
                  if (err6) return handleError(res, err6);
                  applyNext();
                });
              } else {
                applyNext();
              }
            }
            function finish() {
              casts += 1;
              db.run('UPDATE seigneuries SET spells_cast=?, spell_month=? WHERE id=?', [casts, spellMonth, seigneurieId], err7 => {
                if (err7) return handleError(res, err7);
                res.json({ success });
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

function checkTagRestrictions(db, buildings, infrastructures, tagConds, cb) {
  db.all('SELECT id, tags FROM building_properties', [], (err, bRows) => {
    if (err) return cb(err);
    const bTags = {};
    (bRows || []).forEach(r => {
      bTags[r.id] = safeParse(r.tags, []);
    });
    db.all('SELECT id, tags FROM infrastructure_properties', [], (err2, iRows) => {
      if (err2) return cb(err2);
      const iTags = {};
      (iRows || []).forEach(r => {
        iTags[r.id] = safeParse(r.tags, []);
      });
      for (const cond of tagConds) {
        const tagId = parseInt(cond.tag || cond.tag_id, 10);
        const cmp = cond.cmp || cond.operator || cond.op;
        const val = parseInt(cond.value, 10) || 0;
        let count = 0;
        for (const [bid, info] of Object.entries(buildings)) {
          const tags = bTags[bid] || bTags[String(bid)] || [];
          if (tags.includes(tagId)) {
            count += info.built || 0;
          }
        }
        for (const [iid, entry] of Object.entries(infrastructures)) {
          const tags = iTags[iid] || iTags[String(iid)] || [];
          const builtCount = typeof entry === 'object' ? (entry.built || 0) : entry;
          if (tags.includes(tagId)) {
            count += builtCount;
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
    const effects = safeParse(bprops.effects, []);
    const costs = {};
    Object.entries(costObj).forEach(([res, val]) => {
      costs[res] = (parseInt(val, 10) || 0) * qty;
    });
    db.get('SELECT * FROM barony_properties WHERE barony_id=?', [srow.baronnie_id], (err2, props) => {
      if (err2) return cb(err2);
      const barProps = props || {};
      let max = Infinity;
      if (bprops.max != null && bprops.max !== '') {
        const parsed = parseInt(bprops.max, 10);
        if (!isNaN(parsed) && parsed > 0) {
          max = parsed;
        } else if (barProps[bprops.max] != null) {
          const dyn = parseInt(barProps[bprops.max], 10);
          if (!isNaN(dyn) && dyn > 0) max = dyn;
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
      if (Array.isArray(infraReq.tags) && infraReq.tags.length) {
        checkTagRestrictions(db, buildings, infrastructures, infraReq.tags, err3 => {
          if (err3) return cb(err3);
          finalize();
        });
      } else {
        finalize();
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
  const userId = req.session.user.id;
  db.get('SELECT seigneuries.id as id, seigneuries.baronnie_id, seigneuries.population, seigneuries.inventaire_id, seigneuries.buildings, seigneuries.infrastructures FROM seigneurs JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id WHERE seigneurs.user_id=?', [userId], (err, srow)=>{
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
          if (eff.type === 'instant_production' && eff.uses_per_month != null) {
            const existRem = existing[`effect_${idx}_remaining`] || 0;
            uses[`effect_${idx}_remaining`] = existRem + (eff.uses_per_month * qty);
          }
        });
        buildings[bId] = { ...existing, ...uses, ...(props || {}), built: newBuilt, active: newActive };
        db.run('UPDATE seigneuries SET buildings=? WHERE id=?', [JSON.stringify(buildings), srow.id], function(err4){
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
  const userId = req.session.user.id;
  db.get('SELECT seigneuries.id as id, seigneuries.baronnie_id, seigneuries.population, seigneuries.inventaire_id, seigneuries.infrastructures, seigneuries.buildings FROM seigneurs JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id WHERE seigneurs.user_id=?', [userId], (err, srow)=>{
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
          if (eff.type === 'instant_production' && eff.uses_per_month != null) {
            const existRem = existing[`effect_${idx}_remaining`] || 0;
            uses[`effect_${idx}_remaining`] = existRem + (eff.uses_per_month * qty);
          }
        });
        infrastructures[iId] = { ...existing, ...uses, ...(props || {}), built: newBuilt };
        db.run('UPDATE seigneuries SET infrastructures=? WHERE id=?', [JSON.stringify(infrastructures), srow.id], function(err4){
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
  const userId = req.session.user.id;
  db.get('SELECT seigneuries.id as id, seigneuries.population, seigneuries.inventaire_id, seigneuries.buildings FROM seigneurs JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id WHERE seigneurs.user_id=?', [userId], (err, srow)=>{
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const buildings = safeParse(srow.buildings, {});
    db.all('SELECT id, type, label, workers_per_building FROM building_properties', [], (err2, bprops) => {
      if(err2) return handleError(res, err2);
      const bprop = bprops.find(bp => bp.id === id);
      if(!bprop) return res.status(400).json({ error: 'Bâtiment introuvable' });
      const binfo = buildings[id] || { built: 0, active: 0 };
      const built = binfo.built;
      if(qty > built) return res.status(400).json({ error: 'Quantité supérieure au construit' });
      db.get('SELECT esclaves FROM inventaire WHERE id=?', [srow.inventaire_id], (err3, inv)=>{
        if(err3) return handleError(res, err3);
        const slaves = inv ? (inv.esclaves || 0) : 0;
        const totalPop = srow.population + slaves;
        let employed = 0;
        const employmentDetails = [];
        for(const bp of bprops || []){
          const info = buildings[bp.id] || { built: 0, active: 0 };
          const active = (bp.id === id) ? qty : (info.active || 0);
          const workers = active * (bp.workers_per_building || 0);
          employed += workers;
          if(workers) employmentDetails.push({ label: bp.label || bp.type, amount: workers, source: active });
        }
        if(employed > totalPop) return res.status(400).json({ error: 'Travailleurs insuffisants' });
        if(slaves) employmentDetails.push({ label: 'Esclaves', amount: -slaves, source: slaves });
        const employment = { employed: Math.max(employed - slaves, 0), slaves };
        binfo.active = qty;
        buildings[id] = binfo;
        db.run('UPDATE seigneuries SET buildings=? WHERE id=?', [JSON.stringify(buildings), srow.id], function(err4){
          if(err4) return handleError(res, err4);
          res.json({ building: { id, built, active: qty }, employment, employmentDetails });
        });
      });
    });
  });
});

app.post('/api/building/destroy', (req,res)=>{
  if(!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const id = parseInt(req.body.id,10);
  if(!id) return res.status(400).json({ error: 'ID invalide' });
  const userId = req.session.user.id;
  db.get('SELECT seigneuries.id as id, seigneuries.population, seigneuries.inventaire_id, seigneuries.buildings FROM seigneurs JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id WHERE seigneurs.user_id=?', [userId], (err, srow)=>{
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const buildings = safeParse(srow.buildings, {});
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
          if (eff.type === 'instant_production' && eff.uses_per_month != null) {
            const key = `effect_${idx}_remaining`;
            const rem = (binfo[key] || 0) - eff.uses_per_month;
            if (rem > 0) updated[key] = rem; else delete updated[key];
          }
        });
      } catch {}
      if (built <= 0) {
        delete buildings[id];
      } else {
        buildings[id] = updated;
      }
      db.get('SELECT esclaves FROM inventaire WHERE id=?', [srow.inventaire_id], (err3, inv)=>{
        if(err3) return handleError(res, err3);
        const slaves = inv ? (inv.esclaves || 0) : 0;
        const totalPop = srow.population + slaves;
        let employed = 0;
        const employmentDetails = [];
        for(const bp of bprops || []){
          const info = buildings[bp.id] || { built: 0, active: 0 };
          const workers = (info.active || 0) * (bp.workers_per_building || 0);
          employed += workers;
          if(workers) employmentDetails.push({ label: bp.label || bp.type, amount: workers, source: info.active || 0 });
        }
        if(employed > totalPop) return res.status(400).json({ error: 'Travailleurs insuffisants' });
        if(slaves) employmentDetails.push({ label: 'Esclaves', amount: -slaves, source: slaves });
        const employment = { employed: Math.max(employed - slaves, 0), slaves };
        db.run('UPDATE seigneuries SET buildings=? WHERE id=?', [JSON.stringify(buildings), srow.id], function(err4){
          if(err4) return handleError(res, err4);
          res.json({ building: { id, built, active }, employment, employmentDetails });
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
  const userId = req.session.user.id;
  db.get('SELECT seigneuries.id as id, seigneuries.inventaire_id, seigneuries.infrastructures FROM seigneurs JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id WHERE seigneurs.user_id=?', [userId], (err, srow) => {
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
      const remaining = entry[key] || 0;
      if(qty > remaining) return res.status(400).json({ error: 'Utilisations insuffisantes' });
      const totalCosts = {};
      const costObj = eff.costs || {};
      for(const [resName, amt] of Object.entries(costObj)){
        totalCosts[resName] = (parseInt(amt,10) || 0) * qty;
      }
      db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err3, inv)=>{
        if(err3) return handleError(res, err3);
        for(const [resName, amt] of Object.entries(totalCosts)){
          if((inv[resName] || 0) < amt) return res.status(400).json({ error: 'Ressources insuffisantes' });
        }
        consumeResources(db, srow.id, totalCosts, err4 => {
          if(err4) return handleError(res, err4);
          const amount = (parseInt(eff.amount,10) || 0) * qty;
          performTransaction(db, srow.id, eff.resource, amount, err5 => {
            if(err5) return handleError(res, err5);
            entry[key] = remaining - qty;
            infra[iId] = entry;
            db.run('UPDATE seigneuries SET infrastructures=? WHERE id=?', [JSON.stringify(infra), srow.id], function(err6){
              if(err6) return handleError(res, err6);
              db.get('SELECT * FROM inventaire WHERE id=?', [srow.inventaire_id], (err7, inventaire)=>{
                if(err7) return handleError(res, err7);
                res.json({ infrastructures: infra, inventaire });
              });
            });
          });
        });
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
  const userId = req.session.user.id;
  db.get('SELECT seigneuries.id as id, seigneuries.population, seigneuries.inventaire_id, seigneuries.infrastructures, seigneuries.buildings FROM seigneurs JOIN seigneuries ON seigneuries.seigneur_id=seigneurs.id WHERE seigneurs.user_id=?', [userId], (err, srow) => {
    if(err) return handleError(res, err);
    if(!srow) return res.status(400).json({ error: 'Seigneurie introuvable' });
    const infrastructures = safeParse(srow.infrastructures, {});
    const buildings = safeParse(srow.buildings, {});
    db.all('SELECT id, label, workers_per_building FROM building_properties', [], (err2, bprops) => {
      if(err2) return handleError(res, err2);
      db.all('SELECT id, label, effects FROM infrastructure_properties', [], (err3, iprops) => {
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
        db.get('SELECT esclaves FROM inventaire WHERE id=?', [srow.inventaire_id], (err4, inv) => {
          if(err4) return handleError(res, err4);
          const slaves = inv ? (inv.esclaves || 0) : 0;
          const totalPop = srow.population + slaves;
          if(employed > totalPop) return res.status(400).json({ error: 'Travailleurs insuffisants' });
          if(slaves) employmentDetails.push({ label: 'Esclaves', amount: -slaves, source: slaves });
          const employment = { employed: Math.max(employed - slaves, 0), slaves };
          const newEntry = typeof existing === 'object' ? { ...existing, [`effect_${idx}_workers`]: qty } : { built, [`effect_${idx}_workers`]: qty };
          infrastructures[iId] = newEntry;
          db.run('UPDATE seigneuries SET infrastructures=? WHERE id=?', [JSON.stringify(infrastructures), srow.id], function(err5){
            if(err5) return handleError(res, err5);
            res.json({ infrastructures, employment, employmentDetails });
          });
        });
      });
    });
  });
});
app.get('/api/canonical_lands', list('canonical_lands'));
app.post('/api/canonical_lands', create('canonical_lands',['religion_id','barony_id']));
app.delete('/api/canonical_lands', (req, res) => {
  const { religion_id, barony_id } = req.query;
  db.run('DELETE FROM canonical_lands WHERE religion_id=? AND barony_id=?', [religion_id, barony_id], function(err){
    if(err) return handleError(res, err);
    res.json({deleted: this.changes});
  });
});

// Barony adjacency API
app.get('/api/barony_connections', (req,res)=>{
  list('barony_connections')(req,res);
});
app.post('/api/barony_connections', requireAdmin, (req,res)=>{
  let { barony_id_1, barony_id_2 } = req.body;
  barony_id_1 = parseInt(barony_id_1);
  barony_id_2 = parseInt(barony_id_2);
  if(!barony_id_1 || !barony_id_2 || barony_id_1 === barony_id_2){
    return res.status(400).json({error:'Invalid barony ids'});
  }
  const [id1,id2] = barony_id_1 < barony_id_2 ? [barony_id_1, barony_id_2] : [barony_id_2, barony_id_1];
  db.run('INSERT OR IGNORE INTO barony_connections (barony_id_1, barony_id_2) VALUES (?,?)',[id1,id2],function(err){
    if(err) return handleError(res, err);
    res.json({added: this.changes});
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
    res.json({deleted: this.changes});
  });
});

// Pixel data API
app.get('/api/barony_pixels', (req, res) => {
  const id = req.query.id;
  if (id) {
    db.get('SELECT data FROM barony_pixels WHERE barony_id=?', [id], (err, row) => {
      if (err) return handleError(res, err);
      if (!row) return res.json([]);
      try {
        const json = zlib.gunzipSync(row.data).toString();
        res.json(JSON.parse(json));
      } catch(e){
        handleError(res, e);
      }
    });
  } else {
    db.all('SELECT barony_id, data FROM barony_pixels', [], (err, rows) => {
      if (err) return handleError(res, err);
      const out = {};
      rows.forEach(r => {
        try {
          const json = zlib.gunzipSync(r.data).toString();
          out[r.barony_id] = JSON.parse(json);
        } catch {}
      });
      res.json(out);
    });
  }
});

app.put('/api/barony_pixels', (req, res) => {
  const data = req.body || {};
  db.serialize(() => {
    const stmt = db.prepare('INSERT OR REPLACE INTO barony_pixels(barony_id,data) VALUES (?,?)');
    for (const [id, coords] of Object.entries(data)) {
      const buf = zlib.gzipSync(JSON.stringify(coords));
      stmt.run(id, buf);
    }
    stmt.finalize(err => {
      if (err) return handleError(res, err);
      res.json({ok: true});
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on http://localhost:${PORT}`));
