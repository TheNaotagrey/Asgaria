// Vraie page Gestion, API isolée en mémoire : aucune donnée du jeu n’est modifiée.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.UI_SCREENSHOT_DIR || path.join(root, 'artifacts', 'messaging-ui'));
let adminMode = false, messages = [], reads = [], failSend = false, failHistory = false, requests = [], unread = 3;
const state = { seigneurie: { id: 1, type: 'seigneur', population: 100, tax_rate: 5 },
  inventaire: { or_: 500, vivres: 100 }, barony: { id: 1, name: 'Valmont' },
  seigneur: { name: 'Louis de Valmont' }, employment: { employed: 0, slaves: 0 },
  production: {}, capacities: {}, buildings: {}, infrastructures: {}, baronyProps: {},
  updateStatus: { current: { year: 1026, number: 1 }, next: { year: 1026, number: 2 }, canAdvance: true, blockers: [] } };
const app = express();
app.use(express.json());
app.use('/api/messaging', (req, res) => {
  requests.push(req.originalUrl);
  const me = req.query.seigneurie_id === '4' ? 4 : req.query.seigneurie_id === '2' ? 3 : 1;
  if (req.path === '/recipients' && me===4) return res.json({recipients:[{id:1,name:'Louis de Valmont'},{id:3,name:'Charles de Hautbois'}]});
  if (req.path === '/conversations' && me===4) return res.json({character_id:4,can_send:true,conversations:[]});
  if (req.path === '/recipients') return res.json({ recipients: me === 3 ? [{id:1,name:'Louis de Valmont'},{id:2,name:'Éléonore de la Rivière'},{id:4,name:'Intendant PNJ'}] : [{ id: 2, name: 'Éléonore de la Rivière' }, { id: 3, name: 'Charles de Hautbois' },{id:4,name:'Intendant PNJ'}] });
  if (req.path === '/conversations' && me === 3) return res.json({character_id:3,can_send:true,conversations:[]});
  if (req.path === '/conversations') return res.json({ character_id: 1, can_send: true, conversations: [{
    character_id: 2, name: 'Éléonore de la Rivière', unread_count: reads.length ? 0 : unread,
    preview: messages[messages.length - 1].body, last_message_id: messages[messages.length - 1].id
  }] });
  const id = Number(req.path.split('/')[2]);
  if (req.path.endsWith('/read')) { reads.push(req.body.up_to); return res.json({ read_count: 3 }); }
  if (req.method === 'POST') {
    if (failSend) return res.status(503).json({ error: 'Envoi temporairement indisponible.' });
    const message = { id: messages.length + 1, sender_id: me, recipient_id: id, body: req.body.body, created_at: new Date().toISOString() };
    messages.push(message); return res.status(201).json({ message });
  }
  if (failHistory) { failHistory = false; return res.status(503).json({ error: 'Historique temporairement indisponible.' }); }
  let rows = messages.filter(item => (item.sender_id === me && item.recipient_id === id) || (item.sender_id === id && item.recipient_id === me));
  if (req.query.before) rows = rows.filter(item => item.id < Number(req.query.before));
  if (req.query.after) rows = rows.filter(item => item.id > Number(req.query.after));
  const limit = Number(req.query.limit) || 30, has_more = rows.length > limit;
  res.json({ messages: req.query.after ? rows.slice(0, limit) : rows.slice(-limit), has_more });
});
app.use('/api', (req, res) => {
  res.json(req.path === '/me' ? { id: 1, first_name: 'Marie', is_admin: adminMode }
    : req.path === '/my_seigneurie' ? (req.query.seigneurie_id === '4' ? {...state,seigneurie:{...state.seigneurie,id:4},seigneur:{name:'Intendant PNJ'}} : req.query.seigneurie_id === '2' ? {...state,seigneurie:{...state.seigneurie,id:2},seigneur:{name:'Charles de Hautbois',player_name:'Propriétaire de Hautbois'}} : state)
    : req.path === '/test_mode' ? { enabled: false }
    : req.path === '/seigneurs' ? [{ id: 1, name: 'Louis de Valmont', user_id: 1 },{id:2,name:'Charles de Hautbois',user_id:3},{id:4,name:'Intendant PNJ',user_id:null}]
    : req.path === '/seigneuries' ? [{ id: 1, seigneur_id: 1, baronnie_id: 1 },{id:2,seigneur_id:2,baronnie_id:2},{id:4,seigneur_id:4,baronnie_id:4}] : []);
});
app.use(express.static(root));

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_PATH ? { executablePath: process.env.UI_BROWSER_PATH } : {}) });
  try {
    fs.mkdirSync(output, { recursive: true });
    const errors = [];
    const url = `http://127.0.0.1:${server.address().port}/gestion.html`;
    for (const admin of [false, true]) for (const width of [1440, 390]) {
      const page = await browser.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**', route => route.abort());
      await page.addInitScript(() => {
        localStorage.setItem('gestionActiveTab', 'sommaire');
        const original = window.setInterval;
        window.setInterval = (callback, delay, ...args) => {
          if (delay === 15000) window.messagingPoll = callback;
          return original(callback, delay, ...args);
        };
      });
      adminMode = admin; reads = []; requests = []; unread = 3;
      messages = Array.from({ length: 75 }, (_, i) => ({ id: i + 1, sender_id: i % 2 ? 1 : 2, recipient_id: i % 2 ? 2 : 1,
        body: i === 74 ? 'Merci pour votre aide ! Nous préparerons le prochain échange à Valmont.' : `Message ${i + 1} — Les nouvelles de la seigneurie et les préparatifs de notre prochain échange.`,
        created_at: new Date(Date.UTC(2026, 9, 3, 12, i)).toISOString() }));
      for (const [id, kind] of [[20, 'sent'], [70, 'sent'], [72, 'accepted'], [74, 'refused']]) {
        Object.assign(messages[id - 1], { sender_id: kind === 'sent' ? 1 : 2, recipient_id: kind === 'sent' ? 2 : 1,
          event: { kind, trade_id: id === 74 ? 2 : 1, origin_character_id: 1, destination_character_id: 2,
            origin_name: 'Louis de Valmont', destination_name: 'Éléonore de la Rivière',
            resources: { or_: 10, chevaux: 5, encens: 3 }, reason: 'Entente Entendue' } });
      }
      await page.setViewportSize({ width, height: 1000 }); await page.goto(url);
      assert.equal(await page.locator('#messagingIdentityField, #messagingIdentity').count(),0);
      await page.waitForSelector('.messaging-conversation', { state: 'attached' });
      assert.equal(await page.locator('#messagingBadge').innerText(), '3');
      assert.equal(await page.locator('#tab-sommaire').evaluate(el => el.classList.contains('active')), true);
      assert.equal(reads.length, 0);
      assert.equal(requests.some(url => url.includes('/messages')), false);
      unread = 4;
      await page.evaluate(() => window.messagingPoll());
      await page.waitForFunction(() => document.getElementById('messagingBadge').textContent === '4');
      assert.equal(reads.length, 0);
      await page.locator('.tab-btn[data-tab="messagerie"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `messagerie-${admin ? 'admin' : 'joueur'}-${width}-badge-sommaire.png`), fullPage: true });
      await page.locator('.tab-btn[data-tab="messagerie"]').click();
      await page.waitForFunction(() => document.getElementById('messagingRecipient').options.length === 4);
      await page.screenshot({ path: path.join(output, `messagerie-${admin ? 'admin' : 'joueur'}-${width}-liste.png`), fullPage: true });
      await page.locator('.messaging-conversation').click();
      await page.waitForSelector('.messaging-message');
      await page.waitForFunction(() => document.querySelectorAll('#messagingMessages [data-id]').length === 30);
      assert.equal(await page.locator('.messaging-message').first().getAttribute('data-id'), '46');
      await page.waitForFunction(() => document.getElementById('messagingBadge').hidden);
      assert.equal(await page.locator('#messagingBody').isEditable(), true);
      await page.locator('#messagingBody').fill('Bonjour Éléonore, les récoltes sont prêtes.');
      assert.match(await page.locator('.messaging-trade-event[data-id="70"]').innerText(), /Vous avez envoyé 10 écus, 5 chevaux et 3 encens à Éléonore.*Entente Entendue/);
      assert.match(await page.locator('.messaging-trade-event[data-id="72"]').innerText(), /Éléonore.*a accepté votre envoi/);
      assert.match(await page.locator('.messaging-trade-event[data-id="74"]').innerText(), /Éléonore.*a refusé votre envoi/);
      assert.equal(await page.locator('.messaging-trade-event[data-id="72"]').evaluate(el => el.previousElementSibling.dataset.id), '71');
      assert.equal(await page.locator('.messaging-trade-event[data-id="72"]').evaluate(el => el.nextElementSibling.dataset.id), '73');
      assert.equal(await page.locator('.messaging-trade-event').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
      await page.screenshot({ path: path.join(output, `messagerie-${admin ? 'admin' : 'joueur'}-${width}-fil.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      // Chargement au défilement et ancrage de l’ancien premier message.
      const anchor = page.locator('.messaging-message[data-id="46"]');
      const before = await page.locator('#messagingMessages').evaluate(element => {
        element.scrollTop = 0;
        return element.querySelector('[data-id="46"]').getBoundingClientRect().y;
      });
      await page.waitForFunction(() => document.querySelectorAll('#messagingMessages [data-id]').length === 60);
      const after = await anchor.evaluate(element => element.getBoundingClientRect().y);
      assert.ok(Math.abs(after - before) < 5, `Ancrage déplacé : ${after - before}`);
      await page.locator('#messagingMessages').evaluate(element => { element.scrollTop = 0; });
      await page.waitForFunction(() => document.querySelectorAll('#messagingMessages [data-id]').length === 75);
      assert.equal(await page.locator('.messaging-older').count(), 0);
      // Rattraper plusieurs pages de messages récents sans déplacer la lecture.
      await page.locator('#messagingMessages').evaluate(element => { element.scrollTop = 120; });
      for (let i = 0; i < 40; i++) messages.push({ id: messages.length + 1, sender_id: 2, recipient_id: 1,
        body: `Nouvelle information ${i + 1}`, created_at: new Date().toISOString() });
      messages[80].event = { kind: 'sent', origin_character_id: 2, destination_character_id: 1,
        origin_name: 'Éléonore de la Rivière', destination_name: 'Louis de Valmont', resources: { chevaux: 2 }, reason: '<img src=x onerror=alert(1)>' };
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForFunction(() => document.querySelectorAll('#messagingMessages [data-id]').length === 115);
      assert.match(await page.locator('.messaging-trade-event[data-id="81"]').innerText(), /Éléonore.*vous a envoyé 2 chevaux/);
      assert.equal(await page.locator('.messaging-trade-event img').count(), 0);
      assert.equal(await page.locator('#messagingMessages').evaluate(element => element.scrollTop), 120);
      failSend = true;
      await page.locator('#messagingSend').click();
      await page.waitForFunction(() => document.getElementById('messagingStatus').textContent.includes('indisponible'));
      assert.equal(await page.locator('#messagingBody').inputValue(), 'Bonjour Éléonore, les récoltes sont prêtes.');
      failSend = false;
      await page.locator('#messagingBody').fill('<img src=x onerror=alert(1)>\nBonjour Éléonore !');
      await page.locator('#messagingSend').click();
      await page.waitForFunction(() => document.getElementById('messagingBody').value === '' && !document.getElementById('messagingBody').disabled);
      assert.equal(await page.locator('.messaging-message').last().locator('img').count(), 0);
      assert.match(await page.locator('.messaging-message').last().innerText(), /<img src=x onerror=alert\(1\)>/);
      assert.ok(admin ? requests.some(route => route.includes('seigneurie_id=1')) : requests.every(route => !route.includes('seigneurie_id')));
      if (width < 700) await page.locator('#messagingBack').click();
      await page.locator('#messagingRecipient').selectOption('3');
      failHistory = true;
      await page.locator('#messagingStart').click();
      await page.waitForSelector('#messagingRetry:not([hidden])');
      await page.locator('#messagingRetry').click();
      await page.waitForSelector('#messagingForm:not([hidden])');
      assert.match(await page.locator('#messagingMessages').innerText(), /premier message/);
      await page.locator('#messagingBody').fill('Brouillon pour Charles');
      if (width < 700) await page.locator('#messagingBack').click();
      await page.locator('.messaging-conversation').click();
      await page.waitForSelector('.messaging-message');
      if (width < 700) await page.locator('#messagingBack').click();
      await page.locator('#messagingStart').click();
      await page.waitForSelector('#messagingForm:not([hidden])');
      assert.equal(await page.locator('#messagingBody').inputValue(), 'Brouillon pour Charles');
      // Une conversation initialement vide reçoit aussi les nouveaux messages.
      messages.push({ id: messages.length + 1, sender_id: 3, recipient_id: 1, body: 'Bonjour de Hautbois !', created_at: new Date().toISOString() });
      const readResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/conversations/3/read'));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForFunction(() => document.querySelector('.messaging-message p')?.textContent === 'Bonjour de Hautbois !');
      await readResponse;
      if (admin) {
        await page.locator('#messagingBody').fill('Brouillon privé du premier personnage');
        await page.locator('.tab-btn[data-tab="sommaire"]').click();
        await page.locator('#adminSeigneurieSelect select').selectOption('2');
        await page.waitForFunction(() => document.getElementById('generalInfoTable')?.textContent.includes('Propriétaire de Hautbois'));
        await page.locator('.tab-btn[data-tab="messagerie"]').click();
        await page.waitForFunction(() => document.getElementById('messagingRecipient').textContent.includes('Louis de Valmont'));
        assert.equal(await page.locator('#messagingBody').inputValue(), '');
        assert.equal(await page.locator('.messaging-message').count(), 0);
        assert.equal(await page.locator('#messagingRecipient option[value="3"]').count(), 0);
        await page.locator('#messagingRecipient').selectOption('2');
        await page.locator('#messagingStart').click();
        await page.waitForSelector('#messagingForm:not([hidden])');
        await page.locator('#messagingBody').fill('Message envoyé par Charles de Hautbois');
        await page.locator('#messagingSend').click();
        await page.waitForFunction(() => document.getElementById('messagingBody').value === '');
        assert.equal(messages[messages.length-1].sender_id,3);
        await page.screenshot({path:path.join(output,`messagerie-admin-${width}-personnage.png`),fullPage:true});
      }
      if (width===390) await page.locator('#messagingBack').click();
      await page.locator('#messagingRecipient').selectOption('4');
      await page.locator('#messagingStart').click();
      await page.waitForSelector('#messagingForm:not([hidden])');
      await page.locator('#messagingBody').fill('Bonjour au PNJ');
      await page.locator('#messagingSend').click();
      await page.waitForFunction(() => document.getElementById('messagingBody').value==='');
      assert.equal(messages[messages.length-1].recipient_id,4);
      await page.screenshot({path:path.join(output,`messagerie-${admin?'admin':'joueur'}-${width}-pnj.png`),fullPage:true});
      if (admin) {
        await page.locator('.tab-btn[data-tab="sommaire"]').click();
        await page.locator('#adminSeigneurieSelect select').selectOption('4');
        await page.waitForFunction(() => document.getElementById('generalInfoTable')?.textContent.includes('Intendant PNJ'));
        await page.locator('.tab-btn[data-tab="messagerie"]').click();
        await page.waitForFunction(() => document.getElementById('messagingRecipient').textContent.includes('Charles'));
        await page.locator('#messagingRecipient').selectOption('3');
        await page.locator('#messagingStart').click();
        await page.waitForSelector('#messagingForm:not([hidden])');
        await page.locator('#messagingBody').fill('Réponse du PNJ');
        await page.locator('#messagingSend').click();
        await page.waitForFunction(() => document.getElementById('messagingBody').value==='');
        assert.equal(messages[messages.length-1].sender_id,4);
        await page.screenshot({path:path.join(output,`messagerie-admin-${width}-reponse-pnj.png`),fullPage:true});
      }
      await page.close();
    }
    assert.deepEqual(errors, []);
    assert.equal(requests.some(url => url.includes('character_id=')),false);
    console.log('Messagerie validée : joueur/administrateur, ordinateur/mobile, pagination, ancrage, saisie, envoi, erreurs, brouillons et texte sécurisé.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
