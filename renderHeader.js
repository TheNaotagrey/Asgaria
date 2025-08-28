async function renderHeader(title, extra) {
  const res = await fetch('partials/header.html');
  const html = await res.text();
  document.body.insertAdjacentHTML('afterbegin', html);
  const titleEl = document.getElementById('headerTitle');
  if (titleEl) titleEl.textContent = title || '';
  if (typeof extra === 'function') extra();
}
