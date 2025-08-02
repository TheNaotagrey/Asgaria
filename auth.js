(async function() {
  async function getUser() {
    try {
      const res = await fetch('/api/users/me');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  const authBtn = document.getElementById('authBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const profileLink = document.getElementById('profileLink');
  const adminNav = document.getElementById('adminNav');
  const authModal = document.getElementById('authModal');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const closeAuth = document.getElementById('closeAuth');

  const params = new URLSearchParams(window.location.search);
  const forceAuth = params.has('showAuth');

  const user = await getUser();
  if (user) {
    profileLink.style.display = 'inline-block';
    logoutBtn.style.display = 'inline-block';
    if (user.is_admin) {
      adminNav.style.display = 'flex';
    }
    if (forceAuth) authBtn.style.display = 'inline-block';
  } else {
    authBtn.style.display = 'inline-block';
  }

  authBtn?.addEventListener('click', () => {
    authModal.style.display = 'flex';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  });
  closeAuth?.addEventListener('click', () => {
    authModal.style.display = 'none';
  });
  document.getElementById('showRegister')?.addEventListener('click', e => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  });
  document.getElementById('showLogin')?.addEventListener('click', e => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
  });

  document.getElementById('loginSubmit')?.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const res = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      location.reload();
    } else {
      alert('Échec de la connexion');
    }
  });

  document.getElementById('registerSubmit')?.addEventListener('click', async () => {
    const first = document.getElementById('regFirst').value;
    const last = document.getElementById('regLast').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const res = await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: first, last_name: last, email, password })
    });
    if (res.ok) {
      location.reload();
    } else {
      alert('Création échouée');
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await fetch('/api/users/logout', { method: 'POST' });
    location.reload();
  });
})();
