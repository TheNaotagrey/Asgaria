const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { inventaireFields } = require('../../transactions');
const { withImmediateTransaction } = require('../../src/sqliteTransaction');
const { auctionSchema, depositOffer } = require('../../services/auctionHouseService');
const { festivalSchema } = require('../../services/festivalService');
async function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-auction-'));
  const dbPath = path.join(dir, 'fixture.db'); const db = new sqlite3.Database(dbPath);
  await new Promise((resolve, reject) => db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE seigneurs (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, religion_id INTEGER);
    CREATE TABLE players (id INTEGER PRIMARY KEY, seigneur_id INTEGER, population INTEGER DEFAULT 100,
      inventaire_id INTEGER, type TEXT DEFAULT 'seigneur', beginner_protection INTEGER DEFAULT 1,
      buildings TEXT DEFAULT '{}', infrastructures TEXT DEFAULT '{"1":{"built":1}}',
      update_year INTEGER DEFAULT 1026, update_number INTEGER DEFAULT 9,
      land_transactions INTEGER DEFAULT 0, naval_transactions INTEGER DEFAULT 0);
    CREATE TABLE seigneuries_info (player_id INTEGER, baronnie_id INTEGER, tax_rate INTEGER DEFAULT 0, spells_cast INTEGER DEFAULT 0);
    CREATE VIEW seigneuries AS SELECT p.*,s.baronnie_id,s.tax_rate,s.spells_cast FROM players p JOIN seigneuries_info s ON s.player_id=p.id;
    CREATE TABLE inventaire (id INTEGER PRIMARY KEY, ${inventaireFields.map(field => field + ' INTEGER DEFAULT 0').join(',')});
    CREATE TABLE building_properties (id INTEGER PRIMARY KEY, label TEXT, effects TEXT, workers_per_building INTEGER DEFAULT 0, produces TEXT, production INTEGER DEFAULT 0);
    CREATE TABLE infrastructure_properties (id INTEGER PRIMARY KEY, label TEXT, type TEXT, effects TEXT, restrictions TEXT, workers_per_building INTEGER DEFAULT 0);
    CREATE TABLE barony_properties (barony_id INTEGER, effects TEXT);
    CREATE TABLE baronies (id INTEGER PRIMARY KEY, religion_pop_id INTEGER);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, seigneurie_id INTEGER, resource TEXT, amount INTEGER);
    CREATE TABLE update_policy (id INTEGER PRIMARY KEY, value TEXT);
    CREATE TABLE trade_transactions (id INTEGER PRIMARY KEY, destination_id INTEGER, state TEXT, received INTEGER DEFAULT 0, origin_update_year INTEGER, origin_update_number INTEGER, resources TEXT);
    CREATE TABLE player_update_reports (id INTEGER PRIMARY KEY, player_id INTEGER, initiated_by_user_id INTEGER,
      from_year INTEGER,from_number INTEGER,to_year INTEGER,to_number INTEGER,ruleset_version TEXT,
      before_json TEXT,delta_json TEXT,after_json TEXT,events_json TEXT);
    ${auctionSchema}
    ${festivalSchema}
    INSERT INTO users VALUES (1),(2),(3);
    INSERT INTO seigneurs VALUES (1,1,'Alice',1),(2,2,'Benoît',1),(3,3,'Claire',1);
    INSERT INTO players (id,seigneur_id,inventaire_id) VALUES (1,1,1),(2,2,2),(3,3,3);
    INSERT INTO seigneuries_info (player_id) VALUES (1),(2),(3);
    INSERT INTO inventaire (id,fer,or_,vivres,esclaves) VALUES (1,1000,1000,2000,10),(2,1000,1000,100,0),(3,1000,1000,100,0);
    INSERT INTO infrastructure_properties (id,label,effects) VALUES (1,'Marché','[{"type":"unlock_page","page":"hotel_des_ventes"},{"type":"land_transaction_max_per_month","amount":20},{"type":"naval_transaction_max_per_month","amount":10}]');
  `, error => error ? reject(error) : resolve()));
  await new Promise(resolve => db.close(resolve));
  let seq = 0;
  const args = id => ({ dbPath, actor: { id } });
  const deposit = (extra = {}) => depositOffer({ ...args(1), body: {
    request_key: 'fixture-request-' + ++seq, lot: { resource: 'fer', amount: 50 },
    prices: [{ resource: 'or_', amount: 210 }, { resource: 'pierre', amount: 25 }], transport: 'land', expected_update: { year: 1026, number: 9 }, ...extra
  } });
  return { dbPath, args, deposit, sql: work => withImmediateTransaction(dbPath, work), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
module.exports = fixture;
