const express = require('express');
const handleError = require('../handleError');
const { logAdminChange, diffRecords } = require('../services/changeLogService');

function sanitize(val) {
  return val === '' ? null : val;
}

function getDb(req) {
  return req.app.get('db');
}

function getValidTables(req) {
  return req.app.get('validTables');
}

function resolveKey(row, payload, fallback) {
  if (row && row.id != null) return row.id;
  if (payload && payload.id != null) return payload.id;
  const candidates = ['barony_id', 'zone_id', 'barony_id_1', 'zone_id_1', 'record_id'];
  for (const key of candidates) {
    if (row && row[key] != null) return row[key];
    if (payload && payload[key] != null) return payload[key];
  }
  return fallback;
}

function list(table) {
  return (req, res) => {
    const db = getDb(req);
    const validTables = getValidTables(req);
    if (validTables && !validTables.has(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }
    db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
      if (err) return handleError(res, err);
      res.json(rows);
    });
  };
}

function create(table, fields) {
  return (req, res) => {
    const db = getDb(req);
    const validTables = getValidTables(req);
    if (validTables && !validTables.has(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }
    const user = req.session ? req.session.user : null;
    const values = fields.map((f) => sanitize(req.body[f]));
    const placeholders = fields.map(() => '?').join(',');
    const payload = {};
    fields.forEach((f, idx) => { payload[f] = values[idx]; });
    db.run(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})`, values, function (err) {
      if (err) return handleError(res, err);
      const rowId = this.lastID;
      db.get(`SELECT rowid as _rowid_, * FROM ${table} WHERE rowid=?`, [rowId], (err2, row) => {
        const after = row || { ...payload, id: rowId };
        const recordKey = resolveKey(row, payload, rowId);
        if (err2) {
          logAdminChange(db, { table, action: 'create', before: null, after, user, key: recordKey });
          return res.json({ id: rowId });
        }
        logAdminChange(db, { table, action: 'create', before: null, after, user, key: recordKey })
          .finally(() => res.json({ id: after.id || rowId }));
      });
    });
  };
}

function update(table, fields) {
  return (req, res) => {
    const db = getDb(req);
    const validTables = getValidTables(req);
    if (validTables && !validTables.has(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }
    const user = req.session ? req.session.user : null;
    const id = req.params.id;
    const set = fields.map((f) => `${f}=?`).join(',');
    const values = fields.map((f) => sanitize(req.body[f]));
    values.push(id);
    db.get(`SELECT * FROM ${table} WHERE id=?`, [id], (err, existing) => {
      if (err) return handleError(res, err);
      if (!existing) return res.status(404).json({ error: 'Introuvable' });
      const afterPreview = { ...existing };
      fields.forEach((f, idx) => { afterPreview[f] = values[idx]; });
      const changes = diffRecords(existing, afterPreview, fields);
      if (Object.keys(changes).length === 0) {
        return res.json({ changes: 0 });
      }
      db.run(`UPDATE ${table} SET ${set} WHERE id=?`, values, function (err2) {
        if (err2) return handleError(res, err2);
        db.get(`SELECT * FROM ${table} WHERE id=?`, [id], (err3, updated) => {
          if (err3) return handleError(res, err3);
          logAdminChange(db, { table, action: 'update', before: existing, after: updated, changes, user })
            .finally(() => res.json({ changes: this.changes }));
        });
      });
    });
  };
}

function remove(table) {
  return (req, res) => {
    const db = getDb(req);
    const validTables = getValidTables(req);
    if (validTables && !validTables.has(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }
    const user = req.session ? req.session.user : null;
    const id = req.params.id;
    db.get(`SELECT * FROM ${table} WHERE id=?`, [id], (err, row) => {
      if (err) return handleError(res, err);
      db.run(`DELETE FROM ${table} WHERE id=?`, [id], function (err2) {
        if (err2) return handleError(res, err2);
        if (row && this.changes > 0) {
          logAdminChange(db, { table, action: 'delete', before: row, after: null, user });
        }
        res.json({ changes: this.changes });
      });
    });
  };
}

function crudRoutes(table, fields) {
  const router = express.Router();
  router.get('/', list(table));
  router.post('/', create(table, fields));
  router.put('/:id', update(table, fields));
  router.delete('/:id', remove(table));
  return router;
}

module.exports = { crudRoutes, list, create, update, remove };
