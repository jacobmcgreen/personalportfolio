/**
 * One-word guestbook — quiet wall of words; posts to /api/guestbook.
 */

function renderWall(wall, words) {
  wall.replaceChildren();
  if (!words.length) {
    const empty = document.createElement('span');
    empty.className = 'guestbook-empty';
    empty.textContent = '—';
    wall.appendChild(empty);
    return;
  }

  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'guestbook-word';
    span.textContent = word;
    span.style.setProperty('--i', String(i % 7));
    wall.appendChild(span);
    if (i < words.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'guestbook-sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '·';
      wall.appendChild(sep);
    }
  });
}

export function initGuestbook() {
  const wall = document.getElementById('guestbook-wall');
  const form = document.getElementById('guestbook-form');
  const input = document.getElementById('guestbook-word');
  const hint = document.getElementById('guestbook-hint');
  if (!wall || !form || !input) return () => {};

  let busy = false;

  const setHint = (text) => {
    if (!hint) return;
    hint.textContent = text || '';
  };

  const load = async () => {
    try {
      const res = await fetch('/api/guestbook', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('load_failed');
      const data = await res.json();
      renderWall(wall, Array.isArray(data.words) ? data.words : []);
      if (data.storage === 'unconfigured') {
        setHint('');
      }
    } catch {
      renderWall(wall, []);
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const raw = input.value.trim();
    if (!raw) return;

    if (/\s/.test(raw)) {
      setHint('one word');
      return;
    }

    busy = true;
    setHint('');
    form.classList.add('is-busy');

    try {
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ word: raw }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 503) {
        setHint('soon');
        return;
      }
      if (res.status === 429) {
        setHint('wait');
        return;
      }
      if (!res.ok) {
        setHint('one word');
        return;
      }

      input.value = '';
      await load();
      if (data.word) {
        // Soft flash on newest — first in list
        const first = wall.querySelector('.guestbook-word');
        first?.classList.add('is-new');
      }
    } catch {
      setHint('—');
    } finally {
      busy = false;
      form.classList.remove('is-busy');
    }
  });

  input.addEventListener('input', () => {
    // Strip spaces as they type — one word only
    if (/\s/.test(input.value)) {
      input.value = input.value.replace(/\s+/g, '');
      setHint('one word');
    } else if (hint?.textContent === 'one word') {
      setHint('');
    }
  });

  load();
  return () => {};
}
