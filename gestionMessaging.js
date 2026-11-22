/* En administration, la messagerie suit le personnage sélectionné. */
document.addEventListener('DOMContentLoaded', () => {
  const el = id => document.getElementById('messaging' + id);
  const panel = document.getElementById('tab-messagerie');
  const drafts = new Map();
  let me, canSend = false, peer = null, conversations = [], recipients = [];
  let messages = [], hasOlder = false, loadingOlder = false, generation = 0;
  let sending = false, initialized = false, refreshing = false, retry = null;
  let selectedPlayer = null, contextVersion = 0;
  const active = () => panel.classList.contains('active') && !document.hidden;
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  async function api(path, body) {
    const version = contextVersion;
    const suffix = selectedPlayer ? `${path.includes('?') ? '&' : '?'}seigneurie_id=${encodeURIComponent(selectedPlayer)}` : '';
    const response = await fetch('/api/messaging/' + path + suffix, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (version !== contextVersion) throw new Error('Le personnage sélectionné a changé.');
    if (!response.ok) throw new Error(data.error || 'Impossible de charger la messagerie.');
    return data;
  }
  function status(text = '', action = null) {
    el('Status').textContent = text;
    retry = action;
    el('Retry').hidden = !action;
  }
  el('Retry').addEventListener('click', () => { if (retry) retry(); });
  function controls() {
    el('Start').disabled = sending;
    el('Back').disabled = sending;
    el('Conversations').querySelectorAll('button').forEach(button => { button.disabled = sending; });
    el('Body').disabled = sending || !canSend;
    el('Send').disabled = sending || !canSend || !el('Body').value.trim();
    el('Send').textContent = sending ? 'Envoi…' : 'Envoyer';
    el('Count').textContent = `${el('Body').value.length.toLocaleString('fr-CA')} / 4 000`;
  }
  function renderList() {
    const list = el('Conversations');
    list.replaceChildren();
    if (!conversations.length) list.append(node('p', 'Aucune conversation pour le moment.', 'messaging-empty'));
    conversations.forEach(conversation => {
      const button = node('button', undefined, 'messaging-conversation');
      button.type = 'button';
      button.classList.toggle('selected', peer === conversation.character_id);
      button.setAttribute('aria-pressed', String(peer === conversation.character_id));
      button.append(node('strong', conversation.name));
      if (conversation.unread_count) button.append(node('span', `${conversation.unread_count} non lu(s)`, 'messaging-unread'));
      button.append(node('span', conversation.preview, 'messaging-preview'));
      button.addEventListener('click', () => open(conversation.character_id, conversation.name));
      list.append(button);
    });
    const unread = conversations.reduce((sum, item) => sum + item.unread_count, 0);
    el('Badge').hidden = !unread;
    el('Badge').textContent = unread ? String(unread) : '';
  }
  function renderMessages(mode = 'bottom') {
    const scroller = el('Messages');
    const oldHeight = scroller.scrollHeight, oldTop = scroller.scrollTop;
    scroller.replaceChildren();
    if (hasOlder) {
      const button = node('button', loadingOlder ? 'Chargement des messages…' : 'Charger les messages précédents', 'messaging-older control-btn');
      button.type = 'button'; button.disabled = loadingOlder;
      button.addEventListener('click', loadOlder);
      scroller.append(button);
    }
    if (!messages.length) scroller.append(node('p', 'La conversation commence ici. Envoyez votre premier message.', 'messaging-empty'));
    messages.forEach(message => {
      const article = node('article', undefined, message.event ? 'messaging-trade-event' : 'messaging-message' + (message.sender_id === me ? ' own' : ''));
      article.dataset.id = message.id;
      article.append(node('p', message.event ? tradeText(message.event) : message.body));
      const time = node('time', new Date(message.created_at).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }));
      time.dateTime = message.created_at;
      article.append(time); scroller.append(article);
    });
    if (mode === 'prepend') scroller.scrollTop = oldTop + scroller.scrollHeight - oldHeight;
    else if (mode === 'keep') scroller.scrollTop = oldTop;
    else scroller.scrollTop = scroller.scrollHeight;
  }
  function tradeText(event) {
    const ownOrigin = event.origin_character_id === me;
    const ownDestination = event.destination_character_id === me;
    const parts = Object.entries(event.resources || {}).filter(([, quantity]) => Number(quantity) > 0)
      .map(([key, quantity]) => `${Number(quantity).toLocaleString('fr-CA')} ${key === 'or_' ? 'écus' : (resourceLabels[key] || key).toLocaleLowerCase('fr-CA')}`);
    const resources = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' et ' + parts[parts.length - 1] : parts[0] || 'des ressources';
    const reason = event.reason ? `, avec la raison « ${event.reason} »` : '';
    if (event.kind === 'sent') return ownOrigin
      ? `Vous avez envoyé ${resources} à ${event.destination_name}${reason}.`
      : `${event.origin_name}${ownDestination ? ' vous a' : ' a'} envoyé ${resources}${ownDestination ? '' : ' à ' + event.destination_name}${reason}.`;
    const decision = event.kind === 'accepted' ? 'accepté' : 'refusé';
    return `${ownDestination ? 'Vous avez' : event.destination_name + ' a'} ${decision} ${ownOrigin ? 'votre envoi' : 'l’envoi de ' + event.origin_name} de ${resources}${reason}.`;
  }
  async function markRead(id, token) {
    if (!messages.length || !active() || peer !== id || token !== generation) return;
    await api(`conversations/${id}/read`, { up_to: messages[messages.length - 1].id });
  }
  async function open(id, name) {
    if (sending) return;
    if (peer) drafts.set(peer, el('Body').value);
    peer = id; const token = ++generation;
    messages = []; hasOlder = false; loadingOlder = false;
    el('Title').textContent = name;
    el('Workspace').classList.add('has-conversation');
    el('Form').hidden = true;
    el('Messages').replaceChildren(node('p', 'Chargement de la conversation…', 'messaging-empty'));
    el('Body').value = drafts.get(id) || '';
    renderList(); status(); controls();
    try {
      const data = await api(`conversations/${id}/messages?limit=30`);
      if (token !== generation) return;
      messages = data.messages; hasOlder = data.has_more;
      el('Form').hidden = false; renderMessages();
      if (!canSend) status('Vous devez avoir un personnage joueur pour envoyer des messages.');
      await markRead(id, token);
      await refreshList();
    } catch (error) {
      if (token === generation) status(error.message, () => open(id, name));
    }
  }
  async function loadOlder() {
    if (!peer || !hasOlder || loadingOlder || !messages.length) return;
    const id = peer, token = generation;
    loadingOlder = true;
    const button = el('Messages').querySelector('.messaging-older');
    if (button) { button.disabled = true; button.textContent = 'Chargement des messages…'; }
    try {
      const data = await api(`conversations/${id}/messages?limit=30&before=${messages[0].id}`);
      if (token !== generation) return;
      messages = [...data.messages, ...messages]; hasOlder = data.has_more; loadingOlder = false;
      renderMessages('prepend'); status();
    } catch (error) { if (token === generation) { loadingOlder = false; renderMessages('keep'); status(error.message, loadOlder); } }
  }
  el('Messages').addEventListener('scroll', () => { if (el('Messages').scrollTop < 60) loadOlder(); });
  async function refreshList() {
    const data = await api('conversations');
    me = data.character_id; canSend = data.can_send; conversations = data.conversations;
    renderList(); controls();
  }
  async function initialize() {
    if (refreshing) return;
    const version = contextVersion;
    refreshing = true; status('Chargement de la messagerie…');
    try {
      await refreshList();
      const data = await api('recipients'); recipients = data.recipients;
      el('Recipient').replaceChildren(node('option', 'Choisir un personnage…'));
      el('Recipient').firstChild.value = '';
      recipients.forEach(item => { const option = node('option', item.name); option.value = item.id; el('Recipient').append(option); });
      initialized = true; status(canSend ? '' : 'Vous devez avoir un personnage joueur pour envoyer des messages.');
    } catch (error) { if (version === contextVersion) status(error.message, initialize); }
    finally { refreshing = false; if (version !== contextVersion && !document.hidden) refresh(); }
  }
  async function refresh() {
    if (document.hidden || refreshing || sending) return;
    if (!active()) {
      const version = contextVersion;
      refreshing = true;
      try { await refreshList(); }
      catch (error) { if (version === contextVersion) status(error.message, refresh); }
      finally { refreshing = false; if (version !== contextVersion) refresh(); }
      return;
    }
    if (!initialized) return initialize();
    refreshing = true;
    const id = peer, token = generation;
    try {
      await refreshList();
      if (!id || token !== generation) return;
      let more = true;
      while (more && token === generation && active()) {
        const last = messages.length ? messages[messages.length - 1].id : null;
        const data = await api(`conversations/${id}/messages?limit=30${last ? '&after=' + last : ''}`);
        if (token !== generation) return;
        more = last ? data.has_more : false;
        if (!last) hasOlder = data.has_more;
        if (data.messages.length) {
          const scroller = el('Messages');
          const bottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;
          const known = new Set(messages.map(item => item.id));
          messages.push(...data.messages.filter(item => !known.has(item.id)));
          renderMessages(bottom ? 'bottom' : 'keep');
        }
      }
      await markRead(id, token); await refreshList();
    } catch (error) { if (token === generation) status(error.message, refresh); }
    finally { refreshing = false; if (!initialized && active()) initialize(); }
  }
  el('Start').addEventListener('click', () => {
    const recipient = recipients.find(item => item.id === Number(el('Recipient').value));
    if (recipient) open(recipient.id, recipient.name);
    else status('Choisissez un joueur dans la liste.');
  });
  el('Back').addEventListener('click', () => {
    if (sending) return;
    if (peer) drafts.set(peer, el('Body').value);
    peer = null; generation++; el('Workspace').classList.remove('has-conversation');
    el('Form').hidden = true; renderList(); status();
  });
  el('Body').addEventListener('input', controls);
  el('Form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!peer || sending || !canSend || !el('Body').value.trim()) return;
    const id = peer, token = generation, body = el('Body').value;
    let delivered = false;
    sending = true; controls(); status();
    try {
      const data = await api(`conversations/${id}/messages`, { body });
      delivered = true;
      if (token !== generation) return;
      el('Body').value = ''; drafts.delete(id);
      // Récupérer aussi les messages arrivés entre le dernier rafraîchissement et l’envoi.
      const last = messages.length ? messages[messages.length - 1].id : null;
      if (!last) {
        const batch = await api(`conversations/${id}/messages?limit=30`);
        if (token !== generation) return;
        messages = batch.messages; hasOlder = batch.has_more;
      }
      else {
        let after = last, more = true;
        while (more) {
          const batch = await api(`conversations/${id}/messages?limit=30&after=${after}`);
          const known = new Set(messages.map(item => item.id));
          messages.push(...batch.messages.filter(item => !known.has(item.id)));
          more = batch.has_more; if (batch.messages.length) after = batch.messages[batch.messages.length - 1].id;
        }
      }
      renderMessages();
      await markRead(id, token); await refreshList();
    } catch (error) { if (token === generation) status(delivered ? `Message envoyé. Le rafraîchissement a échoué : ${error.message}` : error.message, delivered ? refresh : null); }
    finally { sending = false; controls(); if (!initialized) refresh(); }
  });
  new MutationObserver(() => { if (active()) refresh(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('gestion:player-context', event => {
    const next = event.detail.seigneurieId || null;
    if (next === selectedPlayer) return;
    selectedPlayer = next; contextVersion++; generation++;
    me = null; canSend = false; peer = null; initialized = false;
    drafts.clear(); conversations = []; recipients = []; messages = [];
    hasOlder = false; loadingOlder = false;
    el('Body').value = ''; el('Form').hidden = true;
    el('Workspace').classList.remove('has-conversation');
    el('Title').textContent = 'Vos conversations individuelles';
    el('Recipient').replaceChildren(node('option', 'Choisir un personnage…'));
    el('Messages').replaceChildren(node('p', 'Sélectionnez une conversation ou choisissez un personnage pour lui écrire.', 'messaging-empty'));
    renderList(); controls(); status();
    // An in-flight request must settle before initializing the new identity.
    if (!refreshing && !sending) refresh();
  });
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 15000);
  refresh();
});
