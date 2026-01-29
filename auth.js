async function getCurrentUser() {
  try {
    const res = await fetch('/api/me');
    return await res.json();
  } catch {
    return null;
  }
}

// Register French locale for timeago in case the CDN locale file fails to load
if (typeof timeago !== 'undefined' && timeago.register) {
  timeago.register('fr', (number, index) => [
    ["à l'instant", 'dans un instant'],
    ['il y a %s secondes', 'dans %s secondes'],
    ['il y a 1 minute', 'dans 1 minute'],
    ['il y a %s minutes', 'dans %s minutes'],
    ['il y a 1 heure', 'dans 1 heure'],
    ['il y a %s heures', 'dans %s heures'],
    ['il y a 1 jour', 'dans 1 jour'],
    ['il y a %s jours', 'dans %s jours'],
    ['il y a 1 semaine', 'dans 1 semaine'],
    ['il y a %s semaines', 'dans %s semaines'],
    ['il y a 1 mois', 'dans 1 mois'],
    ['il y a %s mois', 'dans %s mois'],
    ['il y a 1 an', 'dans 1 an'],
    ['il y a %s ans', 'dans %s ans']
  ][index]);
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await getCurrentUser();
  const params = new URLSearchParams(window.location.search);
  const authArea = document.getElementById('authArea');
  const authDialog = document.getElementById('authDialog');
  const current = location.pathname.split('/').pop();

  const showLogin = !user && params.has('auth') && authDialog;
  if (authArea && showLogin) {
    const loginBtn = document.createElement('button');
    loginBtn.id = 'loginBtn';
    loginBtn.className = 'control-btn';
    loginBtn.textContent = 'Connexion';
    loginBtn.addEventListener('click', () => authDialog.showModal());
    authArea.appendChild(loginBtn);
  }

  if (user && authArea) {
    const userLink = document.createElement('a');
    userLink.href = 'profile.html';
    userLink.className = 'user-link';
    userLink.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M6 20c0-4 4-6 6-6s6 2 6 6"></path></svg>
      <span>${user.first_name}</span>`;
    authArea.appendChild(userLink);

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'icon-btn';
    logoutBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      location.reload();
    });
    authArea.appendChild(logoutBtn);

    const notifBtn = document.createElement('button');
    notifBtn.className = 'icon-btn bell-btn';
    notifBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
      <span class="badge" style="display:none"></span>`;
    authArea.appendChild(notifBtn);

    const panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.className = 'notif-panel';
    document.body.appendChild(panel);

    const header = document.querySelector('.app-header');
    function adjustPanel() {
      const headerHeight = header ? header.offsetHeight : 0;
      panel.style.top = headerHeight + 'px';
      panel.style.maxHeight = `calc(100vh - ${headerHeight}px)`;
      panel.style.right = '0';
    }
    adjustPanel();
    window.addEventListener('resize', adjustPanel);

    const badge = notifBtn.querySelector('.badge');

    notifBtn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    });

    async function loadNotifications() {
      try {
        const res = await fetch('/api/notifications');
        const items = await res.json();
        panel.innerHTML = '';
        let unread = 0;
        items.forEach(n => {
          const div = document.createElement('div');
          div.className = 'notification' + (n.is_read ? '' : ' unread');

          const msgSpan = document.createElement('span');
          msgSpan.textContent = n.message;
          div.appendChild(msgSpan);

          const timeEl = document.createElement('time');
          timeEl.dateTime = n.created_at;
          timeEl.title = new Date(n.created_at).toLocaleString('fr-FR');
          timeEl.textContent = timeago.format(n.created_at, 'fr');
          div.appendChild(timeEl);

          div.addEventListener('click', async () => {
            if (!n.is_read) {
              await fetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
            }
            panel.style.display = 'none';
            if (n.link) location.href = n.link;
          });
          panel.appendChild(div);
          if (!n.is_read) unread++;
        });
        if (badge) {
          badge.textContent = unread;
          badge.style.display = unread ? 'block' : 'none';
        }
      } catch {}
    }

    loadNotifications();
  }

  const navButtons = [];
  const hasSeigneur = user && !!user.character_name;

  if (authArea && current !== 'index.html') {
    const mapBtn = document.createElement('button');
    mapBtn.className = 'control-btn';
    mapBtn.textContent = 'Carte';
    mapBtn.onclick = () => location.href = 'index.html';
    navButtons.push(mapBtn);
  }

  if (authArea && current !== 'organigramme.html') {
    const organigrammeBtn = document.createElement('button');
    organigrammeBtn.className = 'control-btn';
    organigrammeBtn.textContent = 'Organigramme';
    organigrammeBtn.onclick = () => location.href = 'organigramme.html';
    navButtons.push(organigrammeBtn);
  }

  const hasControls = typeof controls !== 'undefined' && controls;

  if (user && hasControls && authArea) {
    const adminActive = user.is_admin && user.act_as_admin !== false;
    if (adminActive && current !== 'admin.html') {

      const adminBtn = document.createElement('button');
      adminBtn.className = 'control-btn';
      adminBtn.textContent = 'Admin';
      adminBtn.onclick = () => location.href = 'admin.html';
      navButtons.push(adminBtn);
    }
    if ((hasSeigneur || adminActive) && current !== 'gestion.html') {
      const gestionBtn = document.createElement('button');
      gestionBtn.className = 'control-btn';
      gestionBtn.textContent = 'Gestion';
      gestionBtn.onclick = () => location.href = 'gestion.html';
      navButtons.push(gestionBtn);
    }
    if (adminActive && current !== 'mapEditor.html') {
      const editorBtn = document.createElement('button');
      editorBtn.className = 'control-btn';
      editorBtn.textContent = 'Éditeur';
      editorBtn.onclick = () => location.href = 'mapEditor.html';
      navButtons.push(editorBtn);
    }
  }

  if (authArea && navButtons.length) {
    const fragment = document.createDocumentFragment();
    navButtons.forEach(btn => fragment.appendChild(btn));
    authArea.insertBefore(fragment, authArea.firstChild);
  }

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  if (loginForm && registerForm) {
    document.getElementById('showRegister').addEventListener('click', e => {
      e.preventDefault();
      loginForm.style.display = 'none';
      registerForm.style.display = 'flex';
    });
    document.getElementById('showLogin').addEventListener('click', e => {
      e.preventDefault();
      registerForm.style.display = 'none';
      loginForm.style.display = 'flex';
    });

    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(loginForm));
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        location.reload();
      } else {
        alert('Échec de la connexion');
      }
    });

    registerForm.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(registerForm));
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        location.reload();
      } else {
        alert('Échec de la création du compte');
      }
    });
  }
});
