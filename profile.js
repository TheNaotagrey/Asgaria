async function loadProfile() {
  const res = await fetch('/api/users/me');
  if (!res.ok) {
    window.location = '/';
    return;
  }
  const user = await res.json();
  document.getElementById('firstName').value = user.first_name || '';
  document.getElementById('lastName').value = user.last_name || '';
}

loadProfile();

document.getElementById('infoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const first_name = document.getElementById('firstName').value;
  const last_name = document.getElementById('lastName').value;
  const res = await fetch('/api/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name, last_name })
  });
  if (res.ok) {
    alert('Informations mises à jour');
  } else {
    alert("Échec de la mise à jour");
  }
});

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current_password = document.getElementById('currentPassword').value;
  const new_password = document.getElementById('newPassword').value;
  const res = await fetch('/api/users/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password, new_password })
  });
  if (res.ok) {
    alert('Mot de passe changé');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
  } else {
    alert('Échec du changement');
  }
});
