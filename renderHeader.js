async function renderHeader(title, extra) {
  const headerUrl = 'partials/header.html';
  const showHeaderError = (message) => {
    const alert = document.createElement('div');
    alert.style.cssText = 'background:#fff3cd;color:#856404;padding:8px 12px;margin:8px;border:1px solid #ffeeba;border-radius:4px;font-size:0.9rem;';
    alert.textContent = message;
    document.body.insertAdjacentElement('afterbegin', alert);
  };

  try {
    const res = await fetch(headerUrl);
    if (!res.ok) {
      console.error(`Failed to load header (${res.status} ${res.statusText}) from ${headerUrl}`);
      showHeaderError('Le chargement de l’en-tête a échoué. Vous pouvez continuer, mais certaines fonctionnalités peuvent être limitées.');
      return;
    }

    const html = await res.text();
    document.body.insertAdjacentHTML('afterbegin', html);
    const titleEl = document.getElementById('headerTitle');
    if (titleEl) titleEl.textContent = title || '';
    if (typeof extra === 'function') extra();
  } catch (error) {
    console.error(`Erreur réseau lors du chargement de ${headerUrl}:`, error);
    showHeaderError('Le chargement de l’en-tête a échoué. Vous pouvez continuer, mais certaines fonctionnalités peuvent être limitées.');
  }
}
