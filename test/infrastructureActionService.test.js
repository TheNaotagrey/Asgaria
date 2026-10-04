const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { inventaireFields } = require('../transactions');
const { getSql, withImmediateTransaction } = require('../src/sqliteTransaction');
const {
  destroyInfrastructure, assignInfrastructureWorkers, useInfrastructureProduction
} = require('../services/infrastructureActionService');

async function fixture({ population = 20, infrastructures, effects, createTransactions = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-infra-action-'));
  const dbPath = path.join(dir, 'game.db');
  const database = new sqlite3.Database(dbPath);
  const transactionSchema = createTransactions
    ? 'CREATE TABLE transactions (id INTEGER PRIMARY KEY, seigneurie_id INTEGER, resource TEXT, amount INTEGER);'
    : '';
  await new Promise((resolve, reject) => database.exec(`
    CREATE TABLE seigneurs (id INTEGER PRIMARY KEY, user_id INTEGER);
    CREATE TABLE players (id INTEGER PRIMARY KEY, seigneur_id INTEGER, population INTEGER, inventaire_id INTEGER,
      buildings TEXT, infrastructures TEXT, type TEXT, baronnie_id INTEGER, tax_rate INTEGER);
    CREATE TABLE inventaire (id INTEGER PRIMARY KEY, ${inventaireFields.map(field => `${field} INTEGER DEFAULT 0`).join(',')});
    CREATE TABLE building_properties (id INTEGER PRIMARY KEY, type TEXT, label TEXT, workers_per_building INTEGER);
    CREATE TABLE infrastructure_properties (id INTEGER PRIMARY KEY, type TEXT, label TEXT, workers_per_building INTEGER, effects TEXT);
    CREATE TABLE barony_properties (barony_id INTEGER PRIMARY KEY, effects TEXT);
    ${transactionSchema}
    CREATE VIEW seigneuries AS SELECT * FROM players;
    INSERT INTO seigneurs VALUES (1, 10);
    INSERT INTO players VALUES (1, 1, ${population}, 1, '{}', '${JSON.stringify(infrastructures || {})}', 'seigneur', 1, 0);
    INSERT INTO inventaire (id, or_, vivres, esclaves, hommes_darmes) VALUES (1, 20, 5, 0, 0);
    INSERT INTO infrastructure_properties VALUES (7, 'atelier', 'Atelier', 1, '${JSON.stringify(effects || [])}');
    INSERT INTO barony_properties VALUES (1, '[]');
  `, error => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
  return { dbPath, cleanup: () => {
    const resolved = fs.realpathSync(dir);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('asgaria-infra-action-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  } };
}

const actor = { id: 10, isAdminActive: false };

test('affectation variable relit l’état dans une transaction et refuse le dépassement d’emploi sans écrire', async () => {
  const db = await fixture({ population: 5, infrastructures: { 7: { built: 2, effect_0_workers: 1 } },
    effects: [{ type: 'variable_workers', max_workers: 2 }] });
  try {
    const result = await assignInfrastructureWorkers({ dbPath: db.dbPath, actor, infrastructureId: 7, effectIndex: 0, quantity: 2 });
    assert.equal(result.infrastructures[7].effect_0_workers, 2);
    await assert.rejects(assignInfrastructureWorkers({ dbPath: db.dbPath, actor, infrastructureId: 7, effectIndex: 0, quantity: 4 }),
      /Travailleurs insuffisants/);
    const saved = await withImmediateTransaction(db.dbPath, database => getSql(database, 'SELECT infrastructures FROM players WHERE id=1'));
    assert.equal(JSON.parse(saved.infrastructures)['7'].effect_0_workers, 2);
    await assert.rejects(assignInfrastructureWorkers({ dbPath: db.dbPath, actor, infrastructureId: '7abc', effectIndex: 0, quantity: 1 }), /Infrastructure invalide/);
  } finally { db.cleanup(); }
});

test('destruction réduit les travailleurs affectés à la nouvelle capacité', async () => {
  const db = await fixture({ population: 20, infrastructures: { 7: { built: 2, effect_0_workers: 4 } },
    effects: [{ type: 'variable_workers', max_workers: 2 }] });
  try {
    const result = await destroyInfrastructure({ dbPath: db.dbPath, actor, infrastructureId: 7 });
    assert.equal(result.infrastructure.built, 1);
    const saved = await withImmediateTransaction(db.dbPath, database => getSql(database, 'SELECT infrastructures FROM players WHERE id=1'));
    assert.equal(JSON.parse(saved.infrastructures)['7'].effect_0_workers, 2);
    await destroyInfrastructure({ dbPath: db.dbPath, actor, infrastructureId: 7 });
    await assert.rejects(destroyInfrastructure({ dbPath: db.dbPath, actor, infrastructureId: 7 }), /Aucune infrastructure/);
  } finally { db.cleanup(); }
});

test('une infrastructure surchargée peut être détruite ou perdre des travailleurs par étapes', async () => {
  const db = await fixture({ population: 2, infrastructures: { 7: { built: 5, effect_0_workers: 3 } },
    effects: [{ type: 'variable_workers', max_workers: 5 }] });
  try {
    const reduced = await assignInfrastructureWorkers({ dbPath: db.dbPath, actor, infrastructureId: 7, effectIndex: 0, quantity: 2 });
    assert.equal(reduced.employment.employed, 7);
    await assert.rejects(assignInfrastructureWorkers({ dbPath: db.dbPath, actor, infrastructureId: 7, effectIndex: 0, quantity: 3 }),
      /Travailleurs insuffisants/);
    const destroyed = await destroyInfrastructure({ dbPath: db.dbPath, actor, infrastructureId: 7 });
    assert.equal(destroyed.employment.employed, 6);
    const saved = await withImmediateTransaction(db.dbPath, database => getSql(database, 'SELECT infrastructures FROM players WHERE id=1'));
    assert.equal(JSON.parse(saved.infrastructures)['7'].built, 4);
    assert.equal(JSON.parse(saved.infrastructures)['7'].effect_0_workers, 2);
  } finally { db.cleanup(); }
});

test('production immédiate débite les coûts, crédite la production et consomme les utilisations ensemble', async () => {
  const db = await fixture({ infrastructures: { 7: { built: 1, effect_0_remaining: 2 } },
    effects: [{ type: 'instant_production', resource: 'vivres', amount: 3, uses_per_month: 2, costs: { or_: 2 } }] });
  try {
    const result = await useInfrastructureProduction({ dbPath: db.dbPath, actor, infrastructureId: 7, effectIndex: 0, quantity: 2 });
    assert.equal(result.inventaire.or_, 16);
    assert.equal(result.inventaire.vivres, 11);
    assert.equal(result.infrastructures[7].effect_0_remaining, 0);
    const tx = await withImmediateTransaction(db.dbPath, database => new Promise((resolve, reject) => {
      database.all('SELECT resource, amount FROM transactions ORDER BY id', [], (error, rows) => error ? reject(error) : resolve(rows));
    }));
    assert.deepEqual(tx, [{ resource: 'or_', amount: -4 }, { resource: 'vivres', amount: 6 }]);
    await assert.rejects(useInfrastructureProduction({ dbPath: db.dbPath, actor, infrastructureId: 7, effectIndex: 0, quantity: 1 }), /Utilisations insuffisantes/);
  } finally { db.cleanup(); }
});

test('une erreur d’écriture du journal annule aussi le débit et le compteur de production', async () => {
  const db = await fixture({ infrastructures: { 7: { built: 1, effect_0_remaining: 2 } }, createTransactions: false,
    effects: [{ type: 'instant_production', resource: 'vivres', amount: 3, uses_per_month: 2, costs: { or_: 2 } }] });
  try {
    await assert.rejects(useInfrastructureProduction({ dbPath: db.dbPath, actor, infrastructureId: 7, effectIndex: 0, quantity: 1 }));
    const state = await withImmediateTransaction(db.dbPath, async database => ({
      inventory: await getSql(database, 'SELECT or_, vivres FROM inventaire WHERE id=1'),
      player: await getSql(database, 'SELECT infrastructures FROM players WHERE id=1')
    }));
    assert.deepEqual(state.inventory, { or_: 20, vivres: 5 });
    assert.equal(JSON.parse(state.player.infrastructures)['7'].effect_0_remaining, 2);
  } finally { db.cleanup(); }
});

test('affecter zéro travailleur reste refusé pour une infrastructure non construite', async () => {
  const db = await fixture({ infrastructures: {}, effects: [{ type: 'variable_workers', max_workers: 2 }] });
  try {
    await assert.rejects(assignInfrastructureWorkers({ dbPath: db.dbPath, actor, infrastructureId: 7, effectIndex: 0, quantity: 0 }),
      /infrastructure n’est pas construite/);
  } finally { db.cleanup(); }
});
