document.addEventListener('DOMContentLoaded', async () => {
  const res = await fetch('/api/me');
  const user = await res.json();
  if (!user) {
    location.href = '/';
    return;
  }
  const form = document.getElementById('profileForm');
  form.first_name.value = user.first_name || '';
  form.last_name.value = user.last_name || '';
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      alert('Profil mis à jour');
      form.password.value = '';
    } else {
      alert('Erreur lors de la mise à jour');
    }
  });
});
