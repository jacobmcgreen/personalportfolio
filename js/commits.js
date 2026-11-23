/**
 * Sparse GitHub commit tape — quiet ticker, not a chart.
 */

function formatEntry(c) {
  const sha = c.sha || '';
  const repo = c.repo || '';
  const message = c.message || '';
  const parts = [sha, message, repo].filter(Boolean);
  return parts.join(' · ');
}

export function initCommits() {
  const root = document.getElementById('commit-tape');
  const track = document.getElementById('commit-tape-track');
  if (!root || !track) return () => {};

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const paint = (commits) => {
    track.replaceChildren();
    if (!commits.length) {
      root.hidden = true;
      return;
    }
    root.hidden = false;

    const frag = document.createDocumentFragment();
    const items = commits.slice(0, 12);

    const appendSet = (dup) => {
      items.forEach((c) => {
        const a = document.createElement('a');
        a.className = 'commit-item';
        a.href = c.url || `https://github.com/jacobmcgreen`;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = formatEntry(c);
        if (dup) a.setAttribute('tabindex', '-1');
        a.setAttribute('aria-hidden', dup ? 'true' : 'false');
        frag.appendChild(a);
        const sep = document.createElement('span');
        sep.className = 'commit-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '✕';
        frag.appendChild(sep);
      });
    };

    appendSet(false);
    // Duplicate for seamless marquee when motion allowed
    if (!reduce.matches && items.length > 2) {
      appendSet(true);
    }

    track.appendChild(frag);
    track.classList.toggle('is-marquee', !reduce.matches && items.length > 2);
  };

  const load = async () => {
    try {
      const res = await fetch('/api/commits', { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({ commits: [] }));
      paint(Array.isArray(data.commits) ? data.commits : []);
    } catch {
      root.hidden = true;
    }
  };

  load();
  return () => {};
}
