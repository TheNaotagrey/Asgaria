const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const sqlite3 = require('sqlite3');

const { crudRoutes } = require('../src/crudRouter');

function setupApp() {
  const app = express();
  app.use(express.json());
  const db = new sqlite3.Database(':memory:');
  return new Promise((resolve, reject) => {
    db.run('CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)', (err) => {
      if (err) return reject(err);
      app.set('db', db);
      app.set('validTables', new Set(['test']));
      app.use('/test', crudRoutes('test', ['name']));
      resolve({ app, db });
    });
  });
}

test('crudRoutes performs basic CRUD operations', async () => {
  const { app, db } = await setupApp();
  const server = app.listen(0);
  const port = server.address().port;
  try {
    let res = await fetch(`http://localhost:${port}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'foo' })
    });
    assert.strictEqual(res.status, 200);
    const created = await res.json();
    assert.ok(created.id);

    res = await fetch(`http://localhost:${port}/test`);
    assert.strictEqual(res.status, 200);
    let data = await res.json();
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].name, 'foo');
    const id = data[0].id;

    res = await fetch(`http://localhost:${port}/test/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bar' })
    });
    assert.strictEqual(res.status, 200);
    data = await res.json();
    assert.strictEqual(data.changes, 1);

    res = await fetch(`http://localhost:${port}/test/${id}`, { method: 'DELETE' });
    assert.strictEqual(res.status, 200);
    data = await res.json();
    assert.strictEqual(data.changes, 1);

    res = await fetch(`http://localhost:${port}/test`);
    data = await res.json();
    assert.strictEqual(data.length, 0);
  } finally {
    server.close();
    db.close();
  }
});
