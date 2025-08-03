document.addEventListener('DOMContentLoaded', async () => {
  const res = await fetch('/api/me');
  const user = await res.json();
  if (!user) {
    location.href = '/';
    return;
  }
  const form = document.getElementById('profileForm');
  form.email.value = user.email || '';
  form.first_name.value = user.first_name || '';
  form.last_name.value = user.last_name || '';
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.password.value && form.password.value !== form.confirm_password.value) {
      alert('Les mots de passe ne correspondent pas');
      return;
    }
    const data = {
      first_name: form.first_name.value,
      last_name: form.last_name.value
    };
    if (form.password.value) {
      data.password = form.password.value;
      data.current_password = form.current_password.value;
    }
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      alert('Profil mis à jour');
      form.password.value = '';
      form.confirm_password.value = '';
      form.current_password.value = '';
    } else {
      alert('Erreur lors de la mise à jour');
    }
  });
});
