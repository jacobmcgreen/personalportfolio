/**
 * Bay sky — Golden Gate dawn visual language + real solar az/el.
 * Vantage: Marin-headlands-ish looking south (east = left, west = right).
 * Dawn photo is the hero look; sun disk tracks true Bay position across the day.
 */

const BAY = { lat: 37.7749, lng: -122.4194 }; // SF / GG
const TZ = 'America/Los_Angeles';

/** Screen mapping for south-facing GG vantage (from cull sheet). */
const HORIZON_Y = 0.695; // fraction from top — peach band / fog line in dawn photo
const MAX_EL = 36; // winter Bay noon ≈ 33°; slight headroom
const AZ_LEFT = 90; // due east → left edge
const AZ_RIGHT = 270; // due west → right edge

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/**
 * Solar elevation + azimuth (degrees).
 * Azimuth: 0° N, 90° E, 180° S, 270° W.
 */
export function solarPosition(date, lat = BAY.lat, lng = BAY.lng) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const jd = d.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;

  const L = (280.460 + 0.9856474 * n) % 360;
  const g = rad((357.528 + 0.9856003 * n) % 360);
  const lambda = rad(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));

  const epsilon = rad(23.439 - 0.0000004 * n);
  const sinDec = Math.sin(epsilon) * Math.sin(lambda);
  const cosDec = Math.cos(Math.asin(sinDec));
  const dec = Math.asin(sinDec);

  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst + lng / 15 + 24) % 24;
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const ha = rad((lst * 15) - deg(ra));

  const sinLat = Math.sin(rad(lat));
  const cosLat = Math.cos(rad(lat));

  const sinEl = sinLat * Math.sin(dec) + cosLat * cosDec * Math.cos(ha);
  const elevation = deg(Math.asin(clamp(sinEl, -1, 1)));

  const y = -cosDec * Math.sin(ha);
  const x = cosLat * Math.sin(dec) - sinLat * cosDec * Math.cos(ha);
  let azimuth = deg(Math.atan2(y, x));
  if (azimuth < 0) azimuth += 360;

  return { elevation, azimuth };
}

export function solarElevation(date, lat = BAY.lat, lng = BAY.lng) {
  const pos = solarPosition(date, lat, lng);
  return pos ? pos.elevation : null;
}

export function phaseFromElevation(elev) {
  if (elev == null || Number.isNaN(elev)) return 'night';
  if (elev < -12) return 'night';
  if (elev < -4) return 'blue';
  if (elev < 3) return 'horizon';
  if (elev < 12) return 'golden';
  if (elev < 28) return 'day';
  return 'high';
}

export function refinePhase(elev, date = new Date(), azimuth = 180) {
  const base = phaseFromElevation(elev);
  const morning = azimuth < 180;

  if (base === 'horizon') return morning ? 'dawn' : 'sunset';
  if (base === 'blue') return morning ? 'dawn' : 'blue';
  if (base === 'golden') return morning ? 'dawn' : 'golden';
  return base;
}

/** Demo / QA overrides matching cull sheet table. */
const FORCE = {
  dawn: { elevation: 0, azimuth: 118, phase: 'dawn' },
  day: { elevation: 25, azimuth: 145, phase: 'day' },
  high: { elevation: 33, azimuth: 180, phase: 'high' },
  golden: { elevation: 10, azimuth: 230, phase: 'golden' },
  sunset: { elevation: 0, azimuth: 242, phase: 'sunset' },
  dusk: { elevation: -6, azimuth: 248, phase: 'blue' },
  blue: { elevation: -6, azimuth: 248, phase: 'blue' },
  night: { elevation: -20, azimuth: 250, phase: 'night' },
};

/** Map az/el → CSS left/top % for south-facing vantage. */
export function sunScreenPosition(azimuth, elevation) {
  const x = ((azimuth - AZ_LEFT) / (AZ_RIGHT - AZ_LEFT)) * 100;
  const y = (HORIZON_Y - (elevation / MAX_EL) * (HORIZON_Y - 0.12)) * 100;
  return {
    x: clamp(x, -8, 108),
    y: clamp(y, 6, 78),
  };
}

const PHASE_UI = {
  dawn: {
    bg: '#0b0d18',
    ink: '#f3f1f4',
    muted: '#b4aeb8',
    veil: 'rgba(8, 10, 22, 0.18)',
    horizon: 'rgba(255, 186, 150, 0.22)',
    sun: 'rgba(255, 236, 210, 0.95)',
    glow: 'rgba(255, 176, 130, 0.45)',
    dim: 0,
    theme: '#0b0d18',
  },
  day: {
    bg: '#0c1018',
    ink: '#f2f3f5',
    muted: '#a8aeb6',
    veil: 'rgba(12, 18, 28, 0.28)',
    horizon: 'rgba(200, 210, 230, 0.08)',
    sun: 'rgba(255, 250, 240, 0.92)',
    glow: 'rgba(255, 230, 190, 0.28)',
    dim: 0.08,
    theme: '#0c1018',
  },
  high: {
    bg: '#0b0e14',
    ink: '#f3f4f6',
    muted: '#a4aab2',
    veil: 'rgba(14, 20, 30, 0.32)',
    horizon: 'rgba(210, 220, 235, 0.06)',
    sun: 'rgba(255, 252, 245, 0.9)',
    glow: 'rgba(240, 230, 210, 0.22)',
    dim: 0.12,
    theme: '#0b0e14',
  },
  golden: {
    bg: '#100c0a',
    ink: '#f6f0ea',
    muted: '#b5a89c',
    veil: 'rgba(18, 10, 8, 0.22)',
    horizon: 'rgba(240, 160, 100, 0.18)',
    sun: 'rgba(255, 210, 150, 0.95)',
    glow: 'rgba(255, 150, 80, 0.4)',
    dim: 0.05,
    theme: '#100c0a',
  },
  sunset: {
    bg: '#0e0b0c',
    ink: '#f5efe9',
    muted: '#b0a49a',
    veil: 'rgba(16, 10, 12, 0.26)',
    horizon: 'rgba(230, 150, 120, 0.2)',
    sun: 'rgba(255, 200, 160, 0.9)',
    glow: 'rgba(240, 130, 90, 0.38)',
    dim: 0.1,
    theme: '#0e0b0c',
  },
  blue: {
    bg: '#070812',
    ink: '#eef0f5',
    muted: '#9aa0b0',
    veil: 'rgba(4, 6, 18, 0.45)',
    horizon: 'rgba(120, 130, 180, 0.12)',
    sun: 'rgba(200, 210, 255, 0.35)',
    glow: 'rgba(100, 120, 180, 0.2)',
    dim: 0.35,
    theme: '#070812',
  },
  night: {
    bg: '#050508',
    ink: '#ececf0',
    muted: '#8e8e98',
    veil: 'rgba(2, 3, 8, 0.62)',
    horizon: 'rgba(40, 45, 70, 0.08)',
    sun: 'transparent',
    glow: 'transparent',
    dim: 0.55,
    theme: '#050508',
  },
};

function applyPhase(phase, pos) {
  const p = PHASE_UI[phase] || PHASE_UI.night;
  const root = document.documentElement;
  root.style.setProperty('--bg', p.bg);
  root.style.setProperty('--ink', p.ink);
  root.style.setProperty('--muted', p.muted);
  root.style.setProperty('--sky-veil', p.veil);
  root.style.setProperty('--sky-horizon', p.horizon);
  root.style.setProperty('--sun-color', p.sun);
  root.style.setProperty('--sun-glow', p.glow);
  root.style.setProperty('--sky-dim', String(p.dim));
  root.dataset.sky = phase;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.theme);

  const sun = document.getElementById('bay-sun');
  if (!sun || !pos) return;

  const visible = pos.elevation > -4 && phase !== 'night';
  sun.dataset.visible = visible ? 'true' : 'false';
  sun.setAttribute('aria-hidden', visible ? 'false' : 'true');

  if (!visible) return;

  const screen = sunScreenPosition(pos.azimuth, Math.max(pos.elevation, -2));
  sun.style.setProperty('--sun-x', `${screen.x}%`);
  sun.style.setProperty('--sun-y', `${screen.y}%`);

  // Disk softens near horizon; tighter overhead
  const nearHorizon = clamp(1 - Math.abs(pos.elevation) / 14, 0.35, 1);
  sun.style.setProperty('--sun-scale', String(0.75 + nearHorizon * 0.45));
  sun.style.setProperty('--sun-soft', String(0.35 + nearHorizon * 0.65));
}

export function initSunset() {
  const tick = () => {
    try {
      const forcedKey = new URLSearchParams(window.location.search).get('sky');
      if (forcedKey && FORCE[forcedKey]) {
        const f = FORCE[forcedKey];
        applyPhase(f.phase, { elevation: f.elevation, azimuth: f.azimuth });
        return;
      }

      const now = new Date();
      const pos = solarPosition(now);
      if (!pos) {
        applyPhase('night', { elevation: -30, azimuth: 250 });
        return;
      }
      const phase = refinePhase(pos.elevation, now, pos.azimuth);
      applyPhase(phase, pos);
    } catch {
      applyPhase('night', { elevation: -30, azimuth: 250 });
    }
  };

  tick();
  const id = window.setInterval(tick, 60_000);
  return () => window.clearInterval(id);
}
