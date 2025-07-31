const express = require('express');
const sqlite3 = require('sqlite3');
const zlib = require('zlib');
const path = require('path');
const app = express();
const db = new sqlite3.Database('asgaria.db');

// create tables if they do not exist
const initSql = `
CREATE TABLE IF NOT EXISTS kingdoms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS counties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  kingdom_id INTEGER,
  FOREIGN KEY(kingdom_id) REFERENCES kingdoms(id)
);
CREATE TABLE IF NOT EXISTS duchies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  county_id INTEGER,
  FOREIGN KEY(county_id) REFERENCES counties(id)
);
CREATE TABLE IF NOT EXISTS religions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS cultures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS seigneurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  religion_id INTEGER,
  overlord_id INTEGER,
  FOREIGN KEY(religion_id) REFERENCES religions(id),
  FOREIGN KEY(overlord_id) REFERENCES seigneurs(id)
);
CREATE TABLE IF NOT EXISTS baronies (
  id INTEGER PRIMARY KEY,
  name TEXT,
  seigneur_id INTEGER,
  religion_pop_id INTEGER,
  duchy_id INTEGER,
  culture_id INTEGER,
  FOREIGN KEY(seigneur_id) REFERENCES seigneurs(id),
  FOREIGN KEY(religion_pop_id) REFERENCES religions(id),
  FOREIGN KEY(duchy_id) REFERENCES duchies(id),
  FOREIGN KEY(culture_id) REFERENCES cultures(id)
);
CREATE TABLE IF NOT EXISTS barony_pixels (
  barony_id INTEGER PRIMARY KEY REFERENCES baronies(id),
  data BLOB
);
`;

db.exec(initSql, () => {
  db.all("PRAGMA table_info(seigneurs)", (err, rows) => {
    if (!err && rows && !rows.some(r => r.name === 'overlord_id')) {
      db.run('ALTER TABLE seigneurs ADD COLUMN overlord_id INTEGER');
    }
  });
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function list(table) {
  return (req, res) => {
    db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
      if (err) return res.status(500).json({error: err.message});
      res.json(rows);
    });
  };
}

function create(table, fields) {
  return (req, res) => {
    const values = fields.map(f => req.body[f]);
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
    const values = fields.map(f => req.body[f]);
    values.push(id);
    db.run(`UPDATE ${table} SET ${set} WHERE id=?`, values, function(err){
      if (err) return res.status(500).json({error: err.message});
      res.json({changes: this.changes});
    });
  };
}

app.get('/api/kingdoms', list('kingdoms'));
app.post('/api/kingdoms', create('kingdoms',['name']));

app.get('/api/counties', list('counties'));
app.post('/api/counties', create('counties',['name','kingdom_id']));

app.get('/api/duchies', list('duchies'));
app.post('/api/duchies', create('duchies',['name','county_id']));

app.get('/api/religions', list('religions'));
app.post('/api/religions', create('religions',['name']));

app.get('/api/cultures', list('cultures'));
app.post('/api/cultures', create('cultures',['name']));

app.get('/api/seigneurs', list('seigneurs'));
app.post('/api/seigneurs', create('seigneurs',['name','religion_id','overlord_id']));
app.put('/api/seigneurs/:id', update('seigneurs',['name','religion_id','overlord_id']));

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
  'id','name','seigneur_id','religion_pop_id','duchy_id','culture_id'
]));
app.put('/api/baronies/:id', update('baronies',[
  'name','seigneur_id','religion_pop_id','duchy_id','culture_id'
]));
app.delete('/api/baronies/:id', (req,res)=>{
  db.run('DELETE FROM baronies WHERE id=?',[req.params.id], function(err){
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
