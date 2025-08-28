const express = require('express');
const handleError = require('../handleError');

function sanitize(val) {
  return val === '' ? null : val;
}

function getDb(req) {
  return req.app.get('db');
}

function getValidTables(req) {
  return req.app.get('validTables');
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
    const values = fields.map((f) => sanitize(req.body[f]));
    const placeholders = fields.map(() => '?').join(',');
    db.run(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})`, values, function (err) {
      if (err) return handleError(res, err);
      res.json({ id: this.lastID });
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
    const id = req.params.id;
    const set = fields.map((f) => `${f}=?`).join(',');
    const values = fields.map((f) => sanitize(req.body[f]));
    values.push(id);
    db.run(`UPDATE ${table} SET ${set} WHERE id=?`, values, function (err) {
      if (err) return handleError(res, err);
      res.json({ changes: this.changes });
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
    const id = req.params.id;
    db.run(`DELETE FROM ${table} WHERE id=?`, [id], function (err) {
      if (err) return handleError(res, err);
      res.json({ changes: this.changes });
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
