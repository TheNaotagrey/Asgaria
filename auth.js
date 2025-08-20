async function getCurrentUser() {
  try {
    const res = await fetch('/api/me');
    return await res.json();
  } catch {
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await getCurrentUser();
  const params = new URLSearchParams(window.location.search);
  const authArea = document.getElementById('authArea');
  const controls = document.getElementById('controls');
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
  }

  if (controls && authArea && current !== 'index.html') {
    const mapBtn = document.createElement('button');
    mapBtn.className = 'control-btn';
    mapBtn.textContent = 'Carte';
    mapBtn.onclick = () => location.href = 'index.html';
    controls.insertBefore(mapBtn, authArea);
  }

  if (user && controls && authArea) {
    const adminActive = user.is_admin && user.act_as_admin !== false;
    if (adminActive && current !== 'admin.html') {
      const adminBtn = document.createElement('button');
      adminBtn.className = 'control-btn';
      adminBtn.textContent = 'Admin';
      adminBtn.onclick = () => location.href = 'admin.html';
      controls.insertBefore(adminBtn, authArea);
    }
    if (current !== 'gestion.html') {
      const gestionBtn = document.createElement('button');
      gestionBtn.className = 'control-btn';
      gestionBtn.textContent = 'Gestion';
      gestionBtn.onclick = () => location.href = 'gestion.html';
      controls.insertBefore(gestionBtn, authArea);
    }
    if (adminActive && current !== 'mapEditor.html') {
      const editorBtn = document.createElement('button');
      editorBtn.className = 'control-btn';
      editorBtn.textContent = 'Éditeur';
      editorBtn.onclick = () => location.href = 'mapEditor.html';
      controls.insertBefore(editorBtn, authArea);
    }
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
