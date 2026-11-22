/* Hôtel des ventes : contexte et réponses isolés par personnage. */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('auctionHouse');
  const tab = document.querySelector('[data-tab="hotel_des_ventes"]');
  const panel = document.getElementById('tab-hotel_des_ventes');
  let selected = null, generation = 0, request = 0, state = null, view = 'catalog', rows = [], more = false, pending = false;
  let depositKey = null;
  let loading = 0, renderedData = null;
  let lists = { mine: {rows:[],has_more:false}, catalog: {rows:[],has_more:false}, history: {rows:[],has_more:false} };
  const labels = AuctionRules.resources;
  const kindLabels = { deposited: 'Dépôt', sold: 'Vente conclue', withdrawn: 'Retrait', expired: 'Retour automatique' };
  const stateLabels = { open: 'En vente', sold: 'Vendue', withdrawn: 'Retirée', expired: 'Expirée' };
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, action) => {
    const node = el('button', text, 'control-btn'); node.type = 'button'; node.disabled = pending;
    node.addEventListener('click', action); return node;
  };
  const lotText = lot => `${lot.amount.toLocaleString('fr-CA')} ${labels[lot.resource] || lot.resource}`;
  function message(text, error = false) {
    const node = root.querySelector('.auction-status');
    if (node) { node.textContent = text; node.classList.toggle('error', error); }
  }
  async function api(path, body) {
    const version = generation;
    const suffix = selected ? `${path.includes('?') ? '&' : '?'}seigneurie_id=${encodeURIComponent(selected)}` : '';
    const response = await fetch('/api/auction_house' + path + suffix, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (version !== generation) throw new Error('Le personnage sélectionné a changé.');
    if (!response.ok) throw new Error(data.error || 'Impossible de charger l’Hôtel des ventes.');
    return data;
  }
  function visibility() {
    const visible = !!state && (state.rules.unlocked || state.open_count > 0 || state.has_history);
    tab.style.display = visible ? '' : 'none';
    if (!visible && panel.classList.contains('active')) document.querySelector('[data-tab="sommaire"]').click();
    if (visible && !panel.classList.contains('active') && localStorage.getItem('gestionActiveTab') === 'hotel_des_ventes') tab.click();
  }
  async function load(append = false, background = false) {
    if (background && loading) return;
    const version = generation, serial = ++request;
    loading++;
    if (!state) message('Chargement…');
    try {
      const keys = append ? [view] : ['mine','catalog','history'];
      const results = await Promise.all(keys.map(async key => {
        const entries = lists[key].rows;
        const cursor = append && entries.length ? '?before='+entries[entries.length-1].id : '';
        const result = await api('/'+key+cursor);
        // Refresh all the pages already displayed instead of collapsing to page one.
        if (!append) {
          while (result.has_more && result.rows.length < entries.length) {
            const next = await api('/'+key+'?before='+result.rows[result.rows.length-1].id);
            result.rows.push(...next.rows); result.has_more = next.has_more;
            if (!next.rows.length) break;
          }
        }
        return result;
      }));
      if (version !== generation || serial !== request) return;
      results.forEach((result,index) => { const key=keys[index]; lists[key]={rows:append?[...lists[key].rows,...result.rows]:result.rows,has_more:result.has_more}; });
      const preserve = !!state;
      const {rows: responseRows, has_more: responseMore, ...metadata} = results[0];
      state = metadata;
      const data = JSON.stringify({state, lists});
      visibility();
      if (data !== renderedData) { render(preserve); renderedData = data; }
      if (!background) message('');
    } catch (error) {
      if (version === generation && serial === request) message(error.message, true);
    } finally {
      loading--;
    }
  }
  async function mutate(path, body) {
    if (pending || !state) return;
    const version = generation;
    pending = true;
    root.querySelectorAll('button, input, select').forEach(node => { node.disabled = true; });
    message('Opération en cours…');
    try {
      await api(path, { ...body, expected_update: state.update });
      if (version !== generation) return;
      pending = false; depositKey = null;
      await loadAndRender(currentSeigneurieId);
    } catch (error) {
      if (version === generation) {
        pending = false;
        root.querySelectorAll('button, input, select').forEach(node => { node.disabled = node.dataset.auctionBlocked === 'true'; });
        message(error.message, true);
      }
    }
  }
  function transportSelect() {
    const select = el('select'); select.name = 'transport'; select.required = true;
    select.append(el('option', 'Choisir un transport'));
    select.firstChild.value = '';
    for (const [key, name] of [['land', 'Caravane'], ['naval', 'Navire marchand']]) {
      const quota = state.quotas[key], left = Math.max(0, quota.max - quota.used);
      const option = el('option', `${name} — ${left} usage${left > 1 ? 's' : ''} disponible${left > 1 ? 's' : ''}`);
      option.value = key; option.disabled = left <= 0; select.append(option);
    }
    return select;
  }
  function resourceSelect(name, optional = false) {
    const select = el('select'); select.name = name; select.required = !optional;
    if (optional) { const blank = el('option', 'Sans second prix'); blank.value = ''; select.append(blank); }
    for (const [key, label] of Object.entries(labels)) {
      if (state.type === 'eveque' && key === 'esclaves') continue;
      const option = el('option', label); option.value = key; select.append(option);
    }
    return select;
  }
  function field(form, text, control) {
    const label = el('label', text); label.append(control); form.append(label); return control;
  }
  function quantity(name, optional = false) {
    const input = el('input'); input.type = 'number'; input.name = name; input.min = '1'; input.max = String(Number.MAX_SAFE_INTEGER); input.step = '1'; input.required = !optional; return input;
  }
  function renderDeposit(target) {
    if (!state.rules.unlocked) return;
    const details = el('details', undefined, 'auction-deposit auction-card'); details.id = 'auctionDeposit'; details.append(el('summary', 'Déposer une offre'));
    const form = el('form'); form.id = 'auctionDepositForm';
    const group = title => {
      const section = el('fieldset', undefined, 'auction-form-group'); section.append(el('legend', title));
      const fields = el('div', undefined, 'auction-fields'); section.append(fields); form.append(section); return fields;
    };
    const goodsFields = group('Le lot à vendre');
    const goods = field(goodsFields, 'Marchandise', resourceSelect('resource'));
    const amount = field(goodsFields, 'Quantité', quantity('amount'));
    const priceFields = group('Prix demandé');
    field(priceFields, 'Ressource', resourceSelect('price_resource'));
    const priceAmount = field(priceFields, 'Quantité', quantity('price_amount'));
    const alternativeFields = group('Prix alternatif · facultatif');
    const second = field(alternativeFields, 'Ressource', resourceSelect('second_resource', true));
    const secondAmount = field(alternativeFields, 'Quantité', quantity('second_amount', true));
    const depositTransport = field(form, 'Transport pour le dépôt', transportSelect());
    const preview = el('div', undefined, 'auction-preview'); preview.id = 'auctionDepositPreview';
    const updatePreview = () => {
      const n = Number(amount.value), price = Number(priceAmount.value), alternative = Number(secondAmount.value);
      secondAmount.required = !!second.value;
      preview.replaceChildren(el('p', `Disponible : ${(Number(state.inventory[goods.value]) || 0).toLocaleString('fr-CA')} ${labels[goods.value]}.`));
      if (Number.isSafeInteger(n) && n > 0) preview.append(el('p', `Retrait actuel : ${AuctionRules.netAmount(n, state.rules.withdrawalLoss)} unités rendues sur ${n}.`));
      if (Number.isSafeInteger(price) && price > 0) preview.append(el('p', `Premier prix net actuel : ${AuctionRules.netAmount(price, state.rules.commission)} unités.`));
      if (second.value && Number.isSafeInteger(alternative) && alternative > 0) preview.append(el('p', `Second prix net actuel : ${AuctionRules.netAmount(alternative, state.rules.commission)} unités.`));
    };
    form.addEventListener('input', updatePreview); updatePreview();
    form.addEventListener('input', () => { depositKey = null; });
    form.append(preview);
    form.append(el('p', 'Le lot quitte votre inventaire dès le dépôt. Un usage de transport est consommé.', 'auction-note'));
    const submit = el('button', 'Déposer le lot', 'control-btn auction-submit'); submit.type = 'submit'; submit.disabled = state.open_count >= state.rules.maxOffers || pending; form.append(submit);
    const limitNote = el('p', 'Votre limite d’offres ouvertes est atteinte.', 'auction-note');
    form.append(limitNote);
    details.refresh = () => {
      updatePreview();
      const value = depositTransport.value;
      depositTransport.replaceChildren(...transportSelect().childNodes);
      depositTransport.value = value;
      submit.disabled = state.open_count >= state.rules.maxOffers || pending;
      limitNote.hidden = state.open_count < state.rules.maxOffers;
    };
    details.refresh();
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      const prices = [{ resource: data.get('price_resource'), amount: Number(data.get('price_amount')) }];
      if (data.get('second_resource')) prices.push({ resource: data.get('second_resource'), amount: Number(data.get('second_amount')) });
      if (!depositKey) depositKey = crypto.randomUUID();
      mutate('/offers', { request_key: depositKey, lot: { resource: data.get('resource'), amount: Number(data.get('amount')) }, prices, transport: data.get('transport') });
    });
    details.append(form); target.append(details);
  }
  function buyDialog(offer) {
    if (offer.can_buy === false) { message(offer.purchase_block_reason, true); return; }
    const dialog = el('dialog', undefined, 'auction-dialog'); dialog.setAttribute('aria-labelledby', 'auctionDialogTitle'); const form = el('form');
    const title = el('h3', 'Acheter le lot'); title.id = 'auctionDialogTitle';
    form.append(title, el('p', lotText(offer), 'auction-dialog-lot'));
    const prices = el('select'); prices.name = 'price';
    offer.prices.forEach((price, index) => { const option = el('option', lotText(price)); option.value = index; option.disabled = state.type === 'eveque' && price.resource === 'esclaves'; prices.append(option); });
    const legal = Array.from(prices.options).find(option => !option.disabled); if (legal) prices.value = legal.value;
    field(form, 'Prix à payer', prices); const transport = field(form, 'Transport', transportSelect());
    form.append(el('p', 'Paiement et réception immédiats. Un usage de transport sera consommé. L’achat est refusé si un inventaire manque de place.', 'auction-note'));
    const footer = el('div', undefined, 'auction-dialog-actions');
    const cancel = button('Annuler', () => dialog.close()); cancel.classList.add('auction-secondary');
    const confirm = el('button', 'Confirmer l’achat', 'control-btn'); confirm.type = 'submit'; confirm.disabled = !legal;
    footer.append(cancel, confirm); form.append(footer);
    form.addEventListener('submit', event => { event.preventDefault(); dialog.close(); mutate(`/offers/${offer.id}/buy`, { price_index: Number(prices.value), transport: transport.value }); });
    dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
  }
  function withdrawDialog(offer) {
    const net = AuctionRules.netAmount(offer.amount, state.rules.withdrawalLoss);
    const dialog = el('dialog', undefined, 'auction-dialog');
    const title = el('h3', 'Retirer le lot'); title.id = 'auctionDialogTitle'; dialog.setAttribute('aria-labelledby', title.id);
    dialog.append(title, el('p', lotText(offer), 'auction-dialog-lot'));
    const preview = el('div', undefined, 'auction-preview'); preview.append(el('p', `${net} unités rendues à votre inventaire.`), el('p', `${offer.amount - net} unités perdues · ${state.rules.withdrawalLoss} % de frais avant arrondi.`));
    dialog.append(preview, el('p', 'Aucun transport consommé. Le retrait est refusé si vous manquez de place.', 'auction-note'));
    const footer = el('div', undefined, 'auction-dialog-actions'); const cancel = button('Annuler', () => dialog.close()); cancel.classList.add('auction-secondary');
    footer.append(cancel, button('Confirmer le retrait', () => { dialog.close(); mutate(`/offers/${offer.id}/withdraw`, {}); })); dialog.append(footer);
    document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
  }
  function render(preserve = false) {
    const content = document.createDocumentFragment();
    const openDetails = new Set(preserve ? Array.from(root.querySelectorAll('details[open]'), node => node.id || node.className) : []);
    const deposit = preserve ? root.querySelector('#auctionDeposit') : null;
    const focused = preserve ? document.activeElement : null;
    const scrolls = [];
    if (preserve) {
      for (let node = root.parentElement; node; node = node.parentElement) scrolls.push([node, node.scrollTop, node.scrollLeft]);
    }
    const tableScrolls = new Map(Array.from(root.querySelectorAll('.auction-table-wrap'), node => [node.firstChild.id, [node.scrollTop, node.scrollLeft]]));
    const heading = el('div', undefined, 'auction-heading');
    heading.append(el('h2', 'Hôtel des ventes'), el('p', 'Vendez vos surplus et trouvez les ressources qu’il vous manque.', 'auction-note'));
    const refresh = button('Actualiser', () => load()); refresh.classList.add('auction-secondary'); heading.append(refresh);
    content.append(heading);
    const status = el('p', '', 'auction-status'); status.setAttribute('role', 'status'); content.append(status);
    if (!state.rules.unlocked) content.append(el('p', 'Accès limité au suivi et au retrait : aucune structure ne débloque actuellement l’Hôtel des ventes.', 'auction-access-note'));
    const rules = state.rules;
    const metrics = el('div', undefined, 'auction-metrics');
    const metric = (label, value, note, id) => {
      const card = el('div', undefined, 'auction-metric auction-card');
      const strong = el('strong', value); if (id) strong.id = id;
      card.append(el('span', label, 'auction-metric-label'), strong, el('span', note, 'auction-note')); metrics.append(card);
    };
    metric('Commission de vente', `${rules.commission} %`, 'Prélevée sur le prix reçu', 'auctionCommission');
    metric('Offres ouvertes', `${state.open_count}/${rules.maxOffers}`, 'Lots en vente simultanément', 'auctionOfferCount');
    metric('Conservation', `${rules.duration} périodes`, 'Retour automatique au-delà');
    const left = kind => Math.max(0, state.quotas[kind].max - state.quotas[kind].used);
    metric('Transports disponibles', `${left('land')} terrestres`, `${left('naval')} navals · cette mise à jour`);
    content.append(metrics);
    const bonuses = el('details', undefined, 'auction-rules'); bonuses.append(el('summary', 'Tarifs et bonus de vos structures'));
    bonuses.append(el('p', `Retrait : ${rules.withdrawalLoss} % de pertes · Expiration : ${rules.expirationLoss} % de pertes. Les quantités nettes sont arrondies vers le bas.`, 'auction-note'));
    bonuses.append(el('p', 'Les frais dépendent de vos structures au moment de la vente ou du retrait. Base : commission 5 %, retrait 30 %, expiration 15 %, 5 offres et 10 périodes.', 'auction-note'));
    const list = el('ul');
    for (const detail of rules.details) list.append(el('li', `${detail.label} × ${detail.count} : ${AuctionRules.effectLabels[detail.type]} ${detail.total}${detail.type.endsWith('_discount') ? ' points' : ''}`));
    if (!rules.details.length) list.append(el('li', 'Aucun bonus de bâtiment ou d’infrastructure.'));
    bonuses.append(list); content.append(bonuses);
    const layout = el('div', undefined, 'auction-layout');
    const market = el('section', undefined, 'auction-market auction-card');
    layout.append(market);
    const sidebar = el('aside', undefined, 'auction-sidebar'); renderDeposit(sidebar);
    const help = el('div', undefined, 'auction-card auction-help'); help.append(el('h3', 'À savoir'), el('p', 'Un dépôt ou un achat utilise un transport. Les usages sont partagés avec le commerce direct.', 'auction-note'),
      el('p', `Un retrait rend ${100 - rules.withdrawalLoss} % du lot avant arrondi. Au-delà de ${rules.duration} périodes, le retour automatique applique ${rules.expirationLoss} % de pertes.`, 'auction-note'));
    sidebar.append(help); layout.append(sidebar); content.append(layout);
    for (const key of ['mine','catalog']) {
      const section = el('section', undefined, 'auction-list-section');
      section.append(el('h3', key==='mine'?'Mes offres':'Offres disponibles', 'auction-section-title'));
      market.append(section); renderTable(section,key,lists[key].rows,lists[key].has_more);
    }
    const history = el('details',undefined,'auction-list-section');
    history.append(el('summary','Historique')); market.append(history);
    renderTable(history,'history',lists.history.rows,lists.history.has_more);
    for (const details of content.querySelectorAll('details')) details.open = openDetails.has(details.id || details.className);
    const newDeposit = content.querySelector('#auctionDeposit');
    if (deposit && newDeposit) { deposit.refresh(); newDeposit.replaceWith(deposit); }
    root.replaceChildren(content);
    for (const wrap of root.querySelectorAll('.auction-table-wrap')) {
      const position = tableScrolls.get(wrap.firstChild.id);
      if (preserve && position) { wrap.scrollTop = position[0]; wrap.scrollLeft = position[1]; }
    }
    if (focused && root.contains(focused)) focused.focus({preventScroll:true});
    for (const [node, top, left] of scrolls) { node.scrollTop = top; node.scrollLeft = left; }
  }
  function renderTable(market, view, rows, more) {
    if (!rows.length) {
      const empty = el('div', undefined, 'auction-empty');
      empty.append(el('h3', view === 'catalog' ? 'Aucune offre disponible.' : view === 'mine' ? 'Vous n’avez aucune offre.' : 'Aucun événement dans votre historique.'),
        el('p', view === 'catalog' ? 'Les nouvelles offres apparaîtront ici, même si leur mise à jour ne permet pas encore de les acheter.' : view === 'mine' ? 'Déposez un premier lot pour le proposer aux autres joueurs.' : 'Vos prochaines opérations seront conservées ici.', 'auction-note'));
      market.append(empty); return;
    }
    const wrap = el('div', undefined, 'auction-table-wrap'); const table = el('table', undefined, 'admin-table'); table.id = view==='catalog'?'auctionTable':view==='mine'?'auctionMineTable':'auctionHistoryTable';
    const head = el('thead'), header = el('tr');
    const columns = view === 'history' ? ['Date', 'Événement', 'Marchandise', 'Détail'] : ['Marchandise', 'Vendeur', 'Prix 1', 'Prix 2', 'Période', 'État', 'Action'];
    if (view === 'history') table.classList.add('auction-history');
    for (const label of columns) { const th = el('th', label); th.scope = 'col'; header.append(th); }
    head.append(header); table.append(head); const body = el('tbody');
    for (const item of rows) {
      const row = el('tr'); row.dataset.id = item.id;
      if (view === 'history') {
        const details = item.details;
        const texts = [new Date(GameRules.utcTimestamp(item.created_at)).toLocaleString('fr-CA'), item.direction === 'purchase' ? 'Achat' : kindLabels[item.kind], lotText(details),
          item.kind === 'sold' ? `Prix : ${lotText(details.price)} ; net vendeur : ${details.net} ; commission : ${details.fee}.` : item.kind === 'deposited' ? 'Marchandises réservées.' : `Retour : ${details.net} ; perte : ${details.loss} ; débordement : ${details.overflow || 0}.`];
        texts.forEach(text => row.append(el('td', text)));
      } else {
        const goods = el('td', undefined, 'auction-goods'); goods.append(el('strong', item.amount.toLocaleString('fr-CA')), el('span', labels[item.resource]));
        const prices = [0,1].map(index => el('td', item.prices[index] ? lotText(item.prices[index]) : '—', 'auction-prices'));
        const stateCell = el('td'); stateCell.append(el('span', stateLabels[item.state], `auction-badge auction-badge-${item.state}`));
        if (view === 'catalog' && item.can_buy === false) {
          row.classList.add('auction-period-blocked');
        }
        row.append(goods, el('td', item.seller_name || 'Sans seigneur'), ...prices, el('td', `${updateLabels[item.update.number]} ${item.update.year}`), stateCell);
        const actions = el('td', undefined, 'auction-actions');
        if (item.state === 'open') {
          const action = button(view === 'mine' ? 'Retirer' : 'Acheter', () => view === 'mine' ? withdrawDialog(item) : buyDialog(item));
          if (view === 'mine') action.classList.add('auction-secondary');
          if (view === 'catalog' && item.can_buy === false) {
            action.disabled = true; action.dataset.auctionBlocked = 'true';
            action.title = item.purchase_block_reason;
          }
          actions.append(action);
        }
        row.append(actions);
      }
      Array.from(row.children).forEach((cell, index) => { cell.dataset.label = columns[index]; });
      body.append(row);
    }
    table.append(body); wrap.append(table); market.append(wrap);
    if (more) { const footer = el('div', undefined, 'auction-list-footer'); footer.append(button('Charger la suite', () => { const key=view; loadMore(key); })); market.append(footer); }
  }
  function loadMore(key) { view=key; load(true); }
  document.addEventListener('gestion:auction-reset', () => {
    generation++; request++; pending = false; state = null; rows = []; depositKey = null; renderedData = null;
    document.querySelectorAll('.auction-dialog').forEach(dialog => dialog.close());
    root.replaceChildren(el('p', 'Chargement du personnage…', 'auction-status'));
  });
  document.addEventListener('gestion:player-context', event => {
    selected = event.detail.seigneurieId || null;
    generation++; state = null; rows = []; more = false; view = 'catalog'; renderedData = null;
    lists = {mine:{rows:[],has_more:false},catalog:{rows:[],has_more:false},history:{rows:[],has_more:false}};
    load();
  });
  tab.addEventListener('click', () => { if (state && !pending) load(); });
  // Refresh only while visible; changing tabs or characters invalidates stale results.
  setInterval(() => {
    if (state && panel.classList.contains('active') && !document.hidden && !pending && !document.querySelector('.auction-dialog')) return load(false, true);
  }, 15000);
});
