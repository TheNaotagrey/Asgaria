(() => {
  const MAX_RESULTS_DEFAULT = 8;

  function normalizeText(value) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function isSubsequence(needle, haystack) {
    let index = 0;
    for (const char of needle) {
      index = haystack.indexOf(char, index);
      if (index === -1) return false;
      index += 1;
    }
    return true;
  }

  function getFuzzyScore(query, candidate) {
    const terms = query.split(/\s+/).filter(Boolean);
    if (!terms.length) return null;
    let score = 0;
    for (const term of terms) {
      const index = candidate.indexOf(term);
      if (index !== -1) {
        score += 100 - index;
        continue;
      }
      if (isSubsequence(term, candidate)) {
        score += 10;
        continue;
      }
      return null;
    }
    return score;
  }

  function prepareEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((entry) => entry && entry.name)
      .map((entry) => ({
        ...entry,
        normalizedName: normalizeText(entry.name)
      }));
  }

  function searchEntries(entries, query, maxResults = MAX_RESULTS_DEFAULT) {
    const normalizedQuery = normalizeText(query.trim());
    if (!normalizedQuery) return [];
    return entries
      .map((entry) => {
        const score = getFuzzyScore(normalizedQuery, entry.normalizedName);
        if (score === null) return null;
        return { ...entry, score };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const left = a.sortName || a.displayName || a.name;
        const right = b.sortName || b.displayName || b.name;
        return left.localeCompare(right, 'fr');
      })
      .slice(0, maxResults);
  }

  function createSearchElements({
    inputId,
    resultsId,
    placeholder,
    ariaLabel,
    resultsAriaLabel
  }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'seigneur-search';

    const input = document.createElement('input');
    if (inputId) input.id = inputId;
    input.type = 'search';
    input.placeholder = placeholder || 'Rechercher…';
    input.autocomplete = 'off';
    if (ariaLabel) input.setAttribute('aria-label', ariaLabel);

    const results = document.createElement('div');
    if (resultsId) results.id = resultsId;
    results.className = 'seigneur-search-results';
    results.setAttribute('role', 'listbox');
    if (resultsAriaLabel) results.setAttribute('aria-label', resultsAriaLabel);

    wrapper.append(input, results);
    return { wrapper, input, results };
  }

  function attachSearch({
    input,
    results,
    getEntries,
    onSelect,
    emptyMessage,
    maxResults = MAX_RESULTS_DEFAULT
  }) {
    if (!input || !results) return null;

    const hideResults = () => {
      results.style.display = 'none';
      results.innerHTML = '';
    };

    const renderResults = (query) => {
      const entries = typeof getEntries === 'function' ? getEntries() : [];
      const matches = searchEntries(entries, query, maxResults);
      results.innerHTML = '';

      if (!query.trim()) {
        hideResults();
        return;
      }

      if (!matches.length) {
        const empty = document.createElement('div');
        empty.className = 'seigneur-search-empty';
        empty.textContent = emptyMessage || 'Aucun résultat trouvé.';
        results.appendChild(empty);
        results.style.display = 'block';
        return;
      }

      matches.forEach((match) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.textContent = match.displayName || match.name;
        button.addEventListener('click', () => {
          input.value = '';
          hideResults();
          if (typeof onSelect === 'function') onSelect(match);
        });
        results.appendChild(button);
      });
      results.style.display = 'block';
    };

    input.addEventListener('input', (event) => {
      renderResults(event.target.value);
    });

    input.addEventListener('focus', (event) => {
      renderResults(event.target.value);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const firstResult = results.querySelector('button');
        if (firstResult) firstResult.click();
      }
      if (event.key === 'Escape') {
        hideResults();
        input.blur();
      }
    });

    document.addEventListener('click', (event) => {
      if (results.contains(event.target) || input.contains(event.target)) return;
      hideResults();
    });

    return { hideResults, renderResults };
  }

  window.SeigneurSearch = {
    normalizeText,
    prepareEntries,
    searchEntries,
    createSearchElements,
    attachSearch
  };
})();
