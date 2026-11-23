/**
 * Equation cursor trail — faint math glyphs that dissolve.
 * Reduced-motion: off. Touch / coarse pointer: light tap trails only.
 */

const GLYPHS = [
  '∑', '∫', '∂', '∇', 'π', '∞', '≈', '≠', '≤', '≥', '√', 'λ', 'μ', 'σ',
  'θ', 'φ', 'ψ', 'Ω', 'α', 'β', 'γ', 'δ', 'ε', '∈', '∀', '∃', 'ℝ', 'ℕ',
  '∂t', '∂x', 'e^{iπ}', '⟨x⟩', '∥v∥', 'Δ', 'ξ', 'η', 'ζ', 'ρ', 'τ', 'χ',
];

const MAX_LIVE = 22;
const SPACING = 48;

function pick() {
  return GLYPHS[(Math.random() * GLYPHS.length) | 0];
}

export function initTrail() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return () => {};

  const coarse = window.matchMedia('(pointer: coarse)');
  const layer = document.createElement('div');
  layer.className = 'trail-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  let lastX = null;
  let lastY = null;
  let live = 0;

  const spawn = (x, y, soft = false) => {
    if (live >= MAX_LIVE) return;
    const el = document.createElement('span');
    el.className = soft ? 'trail-glyph trail-glyph--tap' : 'trail-glyph';
    el.textContent = pick();
    const driftX = (Math.random() - 0.5) * 10;
    const driftY = (Math.random() - 0.5) * 10 - 4;
    el.style.left = `${x + driftX}px`;
    el.style.top = `${y + driftY}px`;
    el.style.setProperty('--rot', `${(Math.random() - 0.5) * 18}deg`);
    el.style.setProperty('--life', soft ? '900ms' : `${900 + Math.random() * 500}ms`);
    layer.appendChild(el);
    live += 1;
    el.addEventListener('animationend', () => {
      el.remove();
      live -= 1;
    }, { once: true });
  };

  const onMove = (event) => {
    if (coarse.matches) return;
    if (event.pointerType === 'touch') return;

    const x = event.clientX;
    const y = event.clientY;
    if (lastX == null) {
      lastX = x;
      lastY = y;
      return;
    }
    const dx = x - lastX;
    const dy = y - lastY;
    if (dx * dx + dy * dy < SPACING * SPACING) return;
    lastX = x;
    lastY = y;
    spawn(x, y);
  };

  const onTap = (event) => {
    if (!coarse.matches && event.pointerType !== 'touch') return;
    // One or two quiet glyphs near the tap — not a spray
    const x = event.clientX;
    const y = event.clientY;
    spawn(x, y, true);
    if (Math.random() > 0.45) {
      spawn(x + (Math.random() - 0.5) * 28, y + (Math.random() - 0.5) * 28, true);
    }
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onTap, { passive: true });

  const onReduceChange = () => {
    if (reduce.matches) {
      layer.replaceChildren();
      live = 0;
    }
  };
  reduce.addEventListener?.('change', onReduceChange);

  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onTap);
    reduce.removeEventListener?.('change', onReduceChange);
    layer.remove();
  };
}
