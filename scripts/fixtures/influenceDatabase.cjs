const auctionFixture = require('./auctionDatabase.cjs');
const { influenceSchema } = require('../../services/influenceService');
async function influenceFixture() {
  const f = await auctionFixture();
  await f.sql(db => new Promise((resolve, reject) => db.exec(`
    ${influenceSchema}
    ALTER TABLE baronies ADD COLUMN county_id INTEGER;
    ALTER TABLE baronies ADD COLUMN seigneur_id INTEGER;
    ALTER TABLE baronies ADD COLUMN name TEXT;
    CREATE TABLE counties (id INTEGER PRIMARY KEY,duchy_id INTEGER);
    CREATE TABLE duchies (id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE barony_connections (barony_id_1 INTEGER,barony_id_2 INTEGER,distance INTEGER);
    CREATE TABLE maritime_zone_connections (zone_id_1 INTEGER,zone_id_2 INTEGER,distance INTEGER);
    CREATE TABLE maritime_zone_baronies (zone_id INTEGER,barony_id INTEGER);
    CREATE TABLE trade_routes (id INTEGER PRIMARY KEY,barony_id_1 INTEGER,barony_id_2 INTEGER,path TEXT);
    CREATE TABLE trade_lines (id INTEGER PRIMARY KEY,barony_id_1 INTEGER,barony_id_2 INTEGER,path TEXT);
    INSERT INTO duchies VALUES (1,'Midéranne'),(2,'Orférie');
    INSERT INTO counties VALUES (1,1),(2,2);
    INSERT INTO baronies (id,county_id,seigneur_id,name) VALUES (1,1,1,'Valmont'),(2,2,2,'Hautbois'),(3,1,3,'Clairbois');
    UPDATE seigneuries_info SET baronnie_id=player_id;
    UPDATE inventaire SET prestige=20,renommee=-2,rhum=100;
    INSERT INTO player_duchy_influence VALUES (1,1,10),(1,2,10),(2,2,5);
    INSERT INTO barony_connections VALUES (1,2,2),(1,3,1);
    INSERT INTO maritime_zone_baronies VALUES (10,1),(10,2),(10,3),(11,2);
    INSERT INTO maritime_zone_connections VALUES (10,11,7);
  `, error => error ? reject(error) : resolve())));
  return f;
}
module.exports = influenceFixture;
