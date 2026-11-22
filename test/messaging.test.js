const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const sqlite3 = require('sqlite3');
const { messagingSchema, createMessagingRouter, migrateCharacterMessages } = require('../services/messagingService');
const { runSql, getSql } = require('../src/sqliteTransaction');
const { backfillTradeMessages } = require('../services/tradeMessagingService');

test('messagerie privée : droits, historique, pagination, lecture et validation atomique', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-messaging-'));
  const databasePath = path.join(dir, 'test.db');
  const db = new sqlite3.Database(databasePath);
  const app = express();
  app.use(express.json());
  // Identités de session contrôlées uniquement par cette fixture HTTP isolée.
  app.use((req, res, next) => { const id=Number(req.headers['x-test-user']); req.session = { user: id ? { id, is_admin: id === 4, act_as_admin:req.headers['x-test-admin-mode'] !== 'false' } : null }; next(); });
  app.use('/api/messaging', createMessagingRouter(db, databasePath));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = (user, method, route, body, adminMode) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method,
      path: '/api/messaging/' + route, headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': String(user) } : {}), ...(adminMode === false ? {'x-test-admin-mode':'false'} : {}) }
    }, res => {
      let raw = ''; res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(raw), cache: res.headers['cache-control'] }));
    });
    req.on('error', reject); if (body !== undefined) req.write(JSON.stringify(body)); req.end();
  });
  try {
    await new Promise((resolve, reject) => db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE seigneurs (id INTEGER PRIMARY KEY, name TEXT, user_id INTEGER);
      CREATE TABLE players (id INTEGER PRIMARY KEY, seigneur_id INTEGER);
      INSERT INTO users VALUES (1),(2),(3),(4);
      INSERT INTO seigneurs VALUES (1,'Alice',1),(2,'Benoît',2),(3,'Claire',3);
      INSERT INTO players VALUES (1,1),(2,2),(3,3);
      ${messagingSchema}`, error => error ? reject(error) : resolve()));
    for (const route of ['recipients', 'conversations', 'conversations/2/messages']) {
      assert.equal((await request(null, 'GET', route)).status, 401);
    }
    assert.equal((await request(null, 'POST', 'conversations/2/messages', { body: 'bonjour' })).status, 401);
    assert.equal((await request(null, 'POST', 'conversations/2/read', { up_to: 1 })).status, 401);
    assert.equal((await request(99, 'GET', 'conversations')).status, 401);
    const directory = await request(1, 'GET', 'recipients');
    assert.deepEqual(directory.data.recipients, [{ id: 2, name: 'Benoît' }, { id: 3, name: 'Claire' }]);
    assert.equal(directory.cache, 'no-store');
    for (const body of ['', '   ', 42, null, 'a'.repeat(4001)]) {
      assert.equal((await request(1, 'POST', 'conversations/2/messages', { body })).status, 400);
    }
    assert.equal((await request(1, 'POST', 'conversations/1/messages', { body: 'x' })).status, 400);
    assert.equal((await request(1, 'POST', 'conversations/4/messages', { body: 'x' })).status, 404);
    assert.equal((await request(4, 'POST', 'conversations/1/messages', { body: 'x' })).status, 403);
    assert.equal((await getSql(db, 'SELECT COUNT(*) AS n FROM character_messages')).n, 0);
    for (let i = 1; i <= 65; i++) {
      const sent = await request(i % 2 ? 1 : 2, 'POST', `conversations/${i % 2 ? 2 : 1}/messages`, { body: `Message ${i}` });
      assert.equal(sent.status, 201);
    }
    const latest = await request(1, 'GET', 'conversations/2/messages');
    assert.equal(latest.data.messages.length, 30);
    assert.equal(latest.data.has_more, true);
    assert.equal(latest.data.messages[0].id, 36);
    const previous = await request(1, 'GET', 'conversations/2/messages?before=36');
    const oldest = await request(1, 'GET', 'conversations/2/messages?before=6');
    assert.deepEqual([...oldest.data.messages, ...previous.data.messages, ...latest.data.messages].map(item => item.id), Array.from({ length: 65 }, (_, i) => i + 1));
    assert.equal(oldest.data.has_more, false);
    assert.equal((await request(3, 'GET', 'conversations/2/messages?seigneurie_id=1')).status, 403);
    assert.equal((await request(4, 'GET', 'conversations?seigneurie_id=1', undefined, false)).status, 403);
    assert.equal((await request(4, 'GET', 'conversations?seigneurie_id=999')).status, 404);
    assert.equal((await request(4, 'GET', 'conversations?seigneurie_id=1')).data.character_id, 1);
    assert.equal((await request(4, 'GET', 'conversations/2/messages?seigneurie_id=1')).data.messages.length, 30);
    assert.deepEqual((await request(4, 'GET', 'recipients?seigneurie_id=1')).data.recipients, [{id:2,name:'Benoît'},{id:3,name:'Claire'}]);
    assert.deepEqual((await request(3, 'GET', 'conversations')).data.conversations, []);
    for (const query of ['limit=101', 'limit=0', 'before=-1', 'before=1&after=2', 'after=abc', 'limit=2.5']) {
      assert.equal((await request(1, 'GET', 'conversations/2/messages?' + query)).status, 400);
    }
    assert.equal((await request(1, 'GET', 'conversations/2/messages?after=60&limit=2')).data.has_more, true);
    assert.deepEqual((await request(1, 'GET', 'conversations/2/messages?after=60&limit=2')).data.messages.map(item => item.id), [61,62]);
    assert.equal((await request(1, 'GET', 'conversations')).data.conversations[0].unread_count, 32);
    await request(3, 'POST', 'conversations/2/read', { up_to: 65 });
    assert.equal((await request(1, 'GET', 'conversations')).data.conversations[0].unread_count, 32);
    await request(1, 'POST', 'conversations/2/read', { up_to: 60 });
    assert.equal((await request(1, 'GET', 'conversations')).data.conversations[0].unread_count, 2);
    await request(1, 'POST', 'conversations/2/read', { up_to: 65 });
    assert.equal((await request(1, 'GET', 'conversations')).data.conversations[0].unread_count, 0);
    const sends = await Promise.all([1,2].map(id => request(id, 'POST', `conversations/${id === 1 ? 2 : 1}/messages`, { body: '<script>alert(1)</script>\nTexte' })));
    assert.ok(sends.every(item => item.status === 201));
    assert.equal((await request(1, 'GET', 'conversations')).data.conversations.length, 1);
    await runSql(db, 'DELETE FROM players WHERE seigneur_id=2');
    assert.equal((await request(1, 'POST', 'conversations/2/messages', { body: 'x' })).status, 201);
    assert.equal((await request(2, 'GET', 'conversations')).data.can_send, true);
    assert.equal((await request(2, 'GET', 'conversations/1/messages')).data.messages.length, 30);
    assert.equal((await getSql(db, 'SELECT COUNT(*) AS n FROM character_messages')).n, 68);
    const impersonated = await request(4, 'POST', 'conversations/3/messages?seigneurie_id=1', {body:'Message du personnage sélectionné'});
    assert.equal(impersonated.status, 201);
    assert.equal(impersonated.data.message.sender_id, 1);
    assert.equal((await request(1, 'POST', 'conversations/3/messages?seigneurie_id=3', {body:'Interdit'})).status, 403);
    await runSql(db, 'INSERT INTO players VALUES (2,2)');
    await runSql(db, `CREATE TABLE trade_transactions (id INTEGER PRIMARY KEY,origin_id INTEGER,destination_id INTEGER,
      resources TEXT,reason TEXT,state TEXT,created_at TEXT,decision_time TEXT)`);
    await runSql(db, `INSERT INTO trade_transactions VALUES
      (1,1,2,'{"or_":10,"chevaux":5,"encens":3}','Entente Entendue','Approuvée','2020-01-02 12:00:00','2020-01-04 12:00:00'),
      (2,2,1,'{"or_":2}',NULL,'Refusée','2020-01-05 12:00:00','2020-01-06 12:00:00')`);
    const between = await runSql(db, `INSERT INTO character_messages (sender_id,recipient_id,pair_low,pair_high,body,created_at)
      VALUES (1,2,1,2,'Entre envoi et acceptation','2020-01-03T12:00:00.000Z')`);
    await backfillTradeMessages(databasePath);
    await backfillTradeMessages(databasePath);
    assert.equal((await getSql(db, 'SELECT COUNT(*) AS n FROM character_trade_messages')).n, 4);
    const chronology = (await request(1, 'GET', 'conversations/2/messages?limit=100')).data.messages;
    assert.equal(chronology[0].event.kind, 'sent');
    assert.equal(chronology[1].id, between.lastID);
    assert.equal(chronology[2].event.kind, 'accepted');
    assert.equal(chronology[4].event.kind, 'refused');
    assert.equal(chronology[0].created_at, '2020-01-02T12:00:00.000Z');
    assert.equal(chronology[0].event.reason, 'Entente Entendue');
    assert.deepEqual(chronology[0].event.resources, { or_: 10, chevaux: 5, encens: 3 });
    assert.equal((await request(1, 'GET', `conversations/2/messages?after=${chronology[0].id}&limit=1`)).data.messages[0].id, between.lastID);
    assert.equal((await request(1, 'GET', `conversations/2/messages?before=${chronology[2].id}&limit=1`)).data.messages[0].id, between.lastID);
    assert.equal((await request(3, 'GET', `conversations/2/messages?after=${chronology[0].id}`)).status, 400);
    assert.deepEqual((await request(3, 'GET', 'conversations/2/messages')).data.messages, []);
    assert.equal((await request(4, 'GET', 'conversations/2/messages?seigneurie_id=1&limit=100')).data.messages[0].event.kind, 'sent');
    const forged = await request(1, 'POST', 'conversations/2/messages', { body: 'Simple message', event: { kind: 'accepted', trade_id: 999 } });
    assert.equal(forged.data.message.event, undefined);
    await runSql(db, "INSERT INTO seigneurs VALUES (40,'Intendant PNJ',NULL),(41,'Second personnage',1)");
    const npc = await request(1, 'POST', 'conversations/40/messages', {body:'Bonjour au PNJ'});
    assert.equal(npc.status,201); assert.equal(npc.data.message.recipient_id,40);
    const reply = await request(4,'POST','conversations/1/messages?character_id=40',{body:'Réponse du PNJ'});
    assert.equal(reply.status,201); assert.equal(reply.data.message.sender_id,40);
    assert.equal((await request(1,'POST','conversations/1/messages?character_id=40',{body:'Usurpation'})).status,403);
    assert.equal((await request(4,'GET','conversations?character_id=40',undefined,false)).status,403);
    assert.equal((await request(4,'GET','conversations/1/messages?character_id=41')).data.messages.length,0);
    await request(4,'POST','conversations/40/read?character_id=1',{up_to:reply.data.message.id});
    assert.ok((await getSql(db,'SELECT read_at FROM character_messages WHERE id=?',[reply.data.message.id])).read_at);
    await runSql(db,'UPDATE seigneurs SET user_id=3 WHERE id=40');
    assert.equal((await request(4,'GET','conversations/1/messages?character_id=40')).data.messages.length,2);
    // Migration avec des identifiants de comptes et personnages volontairement différents.
    await runSql(db,'CREATE TABLE private_messages(id INTEGER PRIMARY KEY,sender_id INTEGER,recipient_id INTEGER,body TEXT,created_at TEXT,read_at TEXT)');
    await runSql(db,'CREATE TABLE private_trade_messages(message_id INTEGER,trade_id INTEGER,kind TEXT,event_json TEXT)');
    await runSql(db,'INSERT INTO users VALUES (10)');
    await runSql(db,"INSERT INTO seigneurs VALUES(50,'Personnage historique',10)");
    await runSql(db,"INSERT INTO private_messages VALUES(500,1,10,'Ancien message','2020-01-01T00:00:00Z',NULL)");
    await runSql(db,'INSERT INTO private_trade_messages VALUES(500,999,?,?)',['sent',JSON.stringify({origin_user_id:1,destination_user_id:10,resources:{or_:1}})]);
    await migrateCharacterMessages(databasePath); await migrateCharacterMessages(databasePath);
    const migratedEvent=JSON.parse((await getSql(db,'SELECT event_json FROM character_trade_messages WHERE message_id=500')).event_json);
    assert.equal(migratedEvent.destination_character_id,50);
    assert.equal(migratedEvent.destination_user_id,undefined);
    assert.equal((await getSql(db,'SELECT recipient_id FROM character_messages WHERE id=500')).recipient_id,50);
    await runSql(db,'UPDATE seigneurs SET user_id=NULL WHERE id=50');
    await migrateCharacterMessages(databasePath);
    assert.equal((await getSql(db,'SELECT recipient_id FROM character_messages WHERE id=500')).recipient_id,50);
    assert.equal((await getSql(db,'SELECT COUNT(*) AS n FROM private_messages')).n,1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    const resolved = fs.realpathSync(dir);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('asgaria-messaging-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
