const express = require('express');
const sqlite3 = require('sqlite3');
const zlib = require('zlib');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const app = express();
const db = new sqlite3.Database('asgaria.db');

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
  inventaire_id INTEGER,
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
});

// accept large pixel blobs
app.use(express.json({ limit: '50mb' }));
app.use(session({
  secret: 'asgaria-secret',
  resave: false,
  saveUninitialized: false
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

function list(table) {
  return (req, res) => {
    db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
      if (err) return res.status(500).json({error: err.message});
      res.json(rows);
    });
  };
}

function sanitize(val){
  return val === '' ? null : val;
}

function create(table, fields) {
  return (req, res) => {
    const values = fields.map(f => sanitize(req.body[f]));
    const placeholders = fields.map(() => '?').join(',');
    db.run(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})`, values, function(err){
      if (err) return res.status(500).json({error: err.message});
      res.json({id: this.lastID});
    });
  };
}

function update(table, fields) {
  return (req, res) => {
    const id = req.params.id;
    const set = fields.map(f => `${f}=?`).join(',');
    const values = fields.map(f => sanitize(req.body[f]));
    values.push(id);
    db.run(`UPDATE ${table} SET ${set} WHERE id=?`, values, function(err){
      if (err) return res.status(500).json({error: err.message});
      res.json({changes: this.changes});
    });
  };
}

// Authentication endpoints
app.post('/api/register', (req, res) => {
  const { email, password, first_name, last_name } = req.body;
  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users(email,password,first_name,last_name) VALUES (?,?,?,?)',
    [email, hash, first_name, last_name],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
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
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email=?', [email], (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password)) {
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
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  res.json(req.session.user || null);
});

app.get('/api/users', (req, res) => {
  db.all('SELECT id, email, first_name, last_name FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
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
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    });
  };

  if (password) {
    if (!current_password) return res.status(400).json({ error: 'Missing current password' });
    db.get('SELECT password FROM users WHERE id=?', [req.session.user.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
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

const inventaireFields = ['or_','pierre','fer','lingot_or','antidote','armureries','rhum','grague','vivres','architectes','charpentiers','maitres_oeuvre','maitre_espions','points_magique','fourrure','ivoire','soie','huile','teinture','epices','sel','perle','encens','vin','pierre_precieuse','esclaves','prestige','renommee'];
app.get('/api/inventaire', list('inventaire'));
app.post('/api/inventaire', create('inventaire', inventaireFields));
app.put('/api/inventaire/:id', update('inventaire', inventaireFields));

app.get('/api/seigneuries', (req, res) => {
  const invSelect = inventaireFields.map(f => `i.${f}`).join(',');
  db.all(`SELECT s.id, s.baronnie_id, s.seigneur_id, s.population, s.inventaire_id, ${invSelect} FROM seigneuries s JOIN inventaire i ON s.inventaire_id=i.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/seigneuries', (req, res) => {
  const seigFields = ['baronnie_id','seigneur_id','population'];
  const seigValues = seigFields.map(f => sanitize(req.body[f]));
  const invValues = inventaireFields.map(f => sanitize(req.body[f]) || 0);
  const invPlace = inventaireFields.map(() => '?').join(',');
  db.run(`INSERT INTO inventaire (${inventaireFields.join(',')}) VALUES (${invPlace})`, invValues, function(err){
    if (err) return res.status(500).json({ error: err.message });
    const invId = this.lastID;
    db.run('INSERT INTO seigneuries (baronnie_id,seigneur_id,population,inventaire_id) VALUES (?,?,?,?)',
      [...seigValues, invId], function(err2){
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ id: this.lastID, inventaire_id: invId });
      });
  });
});

app.put('/api/seigneuries/:id', (req, res) => {
  const id = req.params.id;
  const seigFields = ['baronnie_id','seigneur_id','population'];
  const seigSet = seigFields.map(f => `${f}=?`).join(',');
  const seigValues = seigFields.map(f => sanitize(req.body[f]));
  seigValues.push(id);
  db.run(`UPDATE seigneuries SET ${seigSet} WHERE id=?`, seigValues, function(err){
    if (err) return res.status(500).json({ error: err.message });
    const invId = req.body.inventaire_id;
    const invSet = inventaireFields.map(f => `${f}=?`).join(',');
    const invValues = inventaireFields.map(f => sanitize(req.body[f]) || 0);
    invValues.push(invId);
    db.run(`UPDATE inventaire SET ${invSet} WHERE id=?`, invValues, function(err2){
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ changes: this.changes });
    });
  });
});

app.get('/api/my_seigneurie', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non autorisé' });
  const userId = req.session.user.id;
  db.serialize(() => {
    db.get('SELECT * FROM seigneurs WHERE user_id=?', [userId], (err, seigneur) => {
      if (err) return res.status(500).json({ error: err.message });
      function ensureSeigneur(cb) {
        if (seigneur) return cb(seigneur);
        const name = `Seigneur ${req.session.user.first_name}`;
        db.run('INSERT INTO seigneurs(name,user_id) VALUES (?,?)', [name, userId], function(err){
          if (err) return res.status(500).json({ error: err.message });
          cb({ id: this.lastID, name, user_id: userId });
        });
      }
      ensureSeigneur(seig => {
        db.get('SELECT * FROM seigneuries WHERE seigneur_id=?', [seig.id], (err, seigneurie) => {
          if (err) return res.status(500).json({ error: err.message });
          function ensureSeigneurie(cb) {
            if (seigneurie) return cb(seigneurie);
            db.run('INSERT INTO inventaire DEFAULT VALUES', function(err){
              if (err) return res.status(500).json({ error: err.message });
              const invId = this.lastID;
              db.run('INSERT INTO seigneuries (baronnie_id,seigneur_id,population,inventaire_id) VALUES (NULL,?,?,?)',
                [seig.id, 0, invId], function(err){
                  if (err) return res.status(500).json({ error: err.message });
                  cb({ id: this.lastID, baronnie_id: null, seigneur_id: seig.id, population: 0, inventaire_id: invId });
                });
            });
          }
          ensureSeigneurie(s => {
            db.get('SELECT * FROM inventaire WHERE id=?', [s.inventaire_id], (err, inventaire) => {
              if (err) return res.status(500).json({ error: err.message });
              db.all('SELECT resource, SUM(amount) as total FROM transactions WHERE seigneurie_id=? GROUP BY resource', [s.id], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                const production = {};
                rows.forEach(r => production[r.resource] = r.total);
                function send(barony){
                  res.json({ seigneurie: s, barony, inventaire, production });
                }
                if (s.baronnie_id) {
                  db.get(`SELECT b.*, r.name as religion_name, c.name as culture_name FROM baronies b LEFT JOIN religions r ON b.religion_pop_id=r.id LEFT JOIN cultures c ON b.culture_id=c.id WHERE b.id=?`, [s.baronnie_id], (err, barony) => {
                    if (err) return res.status(500).json({ error: err.message });
                    send(barony);
                  });
                } else {
                  send(null);
                }
              });
            });
          });
        });
      });
    });
  });
});

app.get('/api/transactions', list('transactions'));
app.post('/api/transactions', create('transactions',['seigneurie_id','resource','amount']));

app.get('/api/baronies', (req, res) => {
  const id = req.query.id;
  if (id) {
    db.all('SELECT * FROM baronies WHERE id=?', [id], (err, rows) => {
      if (err) return res.status(500).json({error: err.message});
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
    if(err) return res.status(500).json({error: err.message});
    res.json({deleted: this.changes});
  });
});

app.get('/api/canonical_lands', list('canonical_lands'));
app.post('/api/canonical_lands', create('canonical_lands',['religion_id','barony_id']));
app.delete('/api/canonical_lands', (req, res) => {
  const { religion_id, barony_id } = req.query;
  db.run('DELETE FROM canonical_lands WHERE religion_id=? AND barony_id=?', [religion_id, barony_id], function(err){
    if(err) return res.status(500).json({error: err.message});
    res.json({deleted: this.changes});
  });
});

// Pixel data API
app.get('/api/barony_pixels', (req, res) => {
  const id = req.query.id;
  if (id) {
    db.get('SELECT data FROM barony_pixels WHERE barony_id=?', [id], (err, row) => {
      if (err) return res.status(500).json({error: err.message});
      if (!row) return res.json([]);
      try {
        const json = zlib.gunzipSync(row.data).toString();
        res.json(JSON.parse(json));
      } catch(e){
        res.status(500).json({error: e.message});
      }
    });
  } else {
    db.all('SELECT barony_id, data FROM barony_pixels', [], (err, rows) => {
      if (err) return res.status(500).json({error: err.message});
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
      if (err) return res.status(500).json({error: err.message});
      res.json({ok: true});
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
