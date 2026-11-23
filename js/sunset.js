/**
 * Bay sky — realtime Golden Gate day cycle (America/Los_Angeles).
 * Phases morph: dawn → morning → high → golden → sunset → blue → night (moon).
 * Sun/moon use real az/el. Vantage: south-facing (east = left, west = right).
 */

const BAY = { lat: 37.7749, lng: -122.4194 }; // SF / GG
const TZ = 'America/Los_Angeles';

const HORIZON_Y = 0.695;
const MAX_EL = 36;
const AZ_LEFT = 90;
const AZ_RIGHT = 270;

const PHASES = ['dawn', 'morning', 'high', 'golden', 'sunset', 'blue', 'night'];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const lerp = (a, b, t) => a + (b - a) * t;

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

/**
 * Approximate lunar az/el (compact formula; atmosphere-grade, not ephemeris).
 */
export function lunarPosition(date, lat = BAY.lat, lng = BAY.lng) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const jd = d.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;

  // Mean longitude / anomaly / elongation (deg)
  const L = (218.316 + 13.176396 * n) % 360;
  const M = rad((134.963 + 13.064993 * n) % 360);
  const F = rad((93.272 + 13.229350 * n) % 360);

  const lambda = rad(L + 6.289 * Math.sin(M));
  const beta = rad(5.128 * Math.sin(F));
  const distance = 385001 - 20905 * Math.cos(M); // km, for phase approx

  const epsilon = rad(23.439 - 0.0000004 * n);
  const sinDec = Math.sin(beta) * Math.cos(epsilon)
    + Math.cos(beta) * Math.sin(epsilon) * Math.sin(lambda);
  const dec = Math.asin(clamp(sinDec, -1, 1));
  const cosDec = Math.cos(dec);
  const yRa = Math.sin(lambda) * Math.cos(epsilon) - Math.tan(beta) * Math.sin(epsilon);
  const xRa = Math.cos(lambda);
  const ra = Math.atan2(yRa, xRa);

  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst + lng / 15 + 24) % 24;
  const ha = rad((lst * 15) - deg(ra));

  const sinLat = Math.sin(rad(lat));
  const cosLat = Math.cos(rad(lat));
  const sinEl = sinLat * Math.sin(dec) + cosLat * cosDec * Math.cos(ha);
  const elevation = deg(Math.asin(clamp(sinEl, -1, 1)));

  const y = -cosDec * Math.sin(ha);
  const x = cosLat * Math.sin(dec) - sinLat * cosDec * Math.cos(ha);
  let azimuth = deg(Math.atan2(y, x));
  if (azimuth < 0) azimuth += 360;

  // Illumination fraction 0..1 (new→full); from elongation vs sun
  const sun = solarPosition(d, lat, lng);
  let phase = 0.5;
  if (sun) {
    const elong = Math.abs(((azimuth - sun.azimuth + 540) % 360) - 180);
    // Better: use lunar age via mean elongation
    const D = rad((297.850 + 12.190749 * n) % 360);
    phase = clamp((1 - Math.cos(D)) / 2, 0.05, 0.98);
    void elong;
  }

  return { elevation, azimuth, phase, distance };
}

export function solarElevation(date, lat = BAY.lat, lng = BAY.lng) {
  const pos = solarPosition(date, lat, lng);
  return pos ? pos.elevation : null;
}

/**
 * Continuous phase blend weights from solar elevation + morning/afternoon.
 * Returns { phase, weights } with weights summing to 1.
 */
export function phaseBlend(elev, azimuth = 180) {
  const morning = azimuth < 180;
  const weights = Object.fromEntries(PHASES.map((p) => [p, 0]));

  const pair = (a, b, t) => {
    if (a === b) {
      weights[a] = 1;
      return;
    }
    const u = clamp(t, 0, 1);
    weights[a] = 1 - u;
    weights[b] = u;
  };

  if (elev == null || Number.isNaN(elev) || elev < -18) {
    weights.night = 1;
  } else if (elev < -8) {
    // night ↔ blue / pre-dawn
    pair('night', morning ? 'dawn' : 'blue', (elev + 18) / 10);
  } else if (elev < -2) {
    // blue hour / civil twilight
    weights[morning ? 'dawn' : 'blue'] = 1;
  } else if (elev < 4) {
    // on horizon
    if (morning) pair('dawn', 'morning', ((elev + 2) / 6) * 0.4);
    else pair('sunset', 'blue', 1 - (elev + 2) / 6);
  } else if (elev < 14) {
    if (morning) pair('dawn', 'morning', 0.35 + ((elev - 4) / 10) * 0.65);
    else pair('golden', 'sunset', 1 - (elev - 4) / 10);
  } else if (elev < 28) {
    if (morning) pair('morning', 'high', (elev - 14) / 14);
    else pair('golden', 'high', (elev - 14) / 14);
  } else {
    weights.high = 1;
  }

  let sum = PHASES.reduce((s, p) => s + weights[p], 0);
  if (sum <= 0) {
    weights.night = 1;
    sum = 1;
  }
  PHASES.forEach((p) => { weights[p] /= sum; });

  let phase = 'night';
  let best = -1;
  PHASES.forEach((p) => {
    if (weights[p] > best) {
      best = weights[p];
      phase = p;
    }
  });

  return { phase, weights, morning };
}

/** Demo / QA overrides matching cull sheet. */
const FORCE = {
  dawn: { elevation: 0, azimuth: 118, phase: 'dawn' },
  morning: { elevation: 25, azimuth: 145, phase: 'morning' },
  day: { elevation: 25, azimuth: 145, phase: 'morning' },
  high: { elevation: 33, azimuth: 180, phase: 'high' },
  golden: { elevation: 10, azimuth: 230, phase: 'golden' },
  sunset: { elevation: 0, azimuth: 242, phase: 'sunset' },
  dusk: { elevation: -6, azimuth: 248, phase: 'blue' },
  blue: { elevation: -6, azimuth: 248, phase: 'blue' },
  night: { elevation: -25, azimuth: 250, phase: 'night', moonAz: 250, moonEl: 42 },
};

export function sunScreenPosition(azimuth, elevation) {
  const x = ((azimuth - AZ_LEFT) / (AZ_RIGHT - AZ_LEFT)) * 100;
  const y = (HORIZON_Y - (elevation / MAX_EL) * (HORIZON_Y - 0.12)) * 100;
  return {
    x: clamp(x, -8, 108),
    y: clamp(y, 6, 82),
  };
}

const PHASE_UI = {
  dawn: {
    bg: '#0b0d18',
    ink: '#f3f1f4',
    muted: '#b4aeb8',
    veil: 'rgba(8, 10, 22, 0.2)',
    horizon: 'rgba(255, 186, 150, 0.22)',
    sun: 'rgba(255, 236, 210, 0.95)',
    glow: 'rgba(255, 176, 130, 0.45)',
    dim: 0,
    light: false,
    theme: '#0b0d18',
  },
  morning: {
    bg: '#c8ced6',
    ink: '#1a1c20',
    muted: '#4a5058',
    veil: 'rgba(200, 210, 220, 0.12)',
    horizon: 'rgba(255, 250, 240, 0.18)',
    sun: 'rgba(255, 252, 245, 0.95)',
    glow: 'rgba(255, 240, 210, 0.4)',
    dim: 0,
    light: true,
    theme: '#c8ced6',
  },
  high: {
    bg: '#d8dde4',
    ink: '#16181c',
    muted: '#454a52',
    veil: 'rgba(230, 235, 240, 0.1)',
    horizon: 'rgba(255, 255, 255, 0.2)',
    sun: 'rgba(255, 255, 252, 0.95)',
    glow: 'rgba(255, 250, 235, 0.35)',
    dim: 0,
    light: true,
    theme: '#d8dde4',
  },
  golden: {
    bg: '#1a1210',
    ink: '#f6f0ea',
    muted: '#b5a89c',
    veil: 'rgba(18, 10, 8, 0.2)',
    horizon: 'rgba(240, 160, 100, 0.18)',
    sun: 'rgba(255, 210, 150, 0.95)',
    glow: 'rgba(255, 150, 80, 0.4)',
    dim: 0.04,
    light: false,
    theme: '#1a1210',
  },
  sunset: {
    bg: '#120e10',
    ink: '#f5efe9',
    muted: '#b0a49a',
    veil: 'rgba(16, 10, 12, 0.24)',
    horizon: 'rgba(230, 150, 120, 0.22)',
    sun: 'rgba(255, 200, 160, 0.92)',
    glow: 'rgba(240, 130, 90, 0.4)',
    dim: 0.08,
    light: false,
    theme: '#120e10',
  },
  blue: {
    bg: '#070812',
    ink: '#eef0f5',
    muted: '#9aa0b0',
    veil: 'rgba(4, 6, 18, 0.4)',
    horizon: 'rgba(120, 130, 180, 0.14)',
    sun: 'rgba(200, 210, 255, 0.3)',
    glow: 'rgba(100, 120, 180, 0.22)',
    dim: 0.28,
    light: false,
    theme: '#070812',
  },
  night: {
    bg: '#050508',
    ink: '#ececf0',
    muted: '#8e8e98',
    veil: 'rgba(2, 3, 8, 0.35)',
    horizon: 'rgba(40, 45, 70, 0.06)',
    sun: 'transparent',
    glow: 'transparent',
    dim: 0.15,
    light: false,
    theme: '#050508',
  },
};

function mixUi(weights) {
  const base = {
    bg: PHASE_UI.night.bg,
    ink: PHASE_UI.night.ink,
    muted: PHASE_UI.night.muted,
    veil: PHASE_UI.night.veil,
    horizon: PHASE_UI.night.horizon,
    sun: PHASE_UI.night.sun,
    glow: PHASE_UI.night.glow,
    dim: 0,
    light: false,
    theme: PHASE_UI.night.theme,
  };

  // Pick dominant phase for non-lerpable color strings; lerp dim + light flag
  let phase = 'night';
  let best = -1;
  PHASES.forEach((p) => {
    if ((weights[p] || 0) > best) {
      best = weights[p] || 0;
      phase = p;
    }
  });
  const ui = { ...PHASE_UI[phase] };
  ui.dim = PHASES.reduce((s, p) => s + (PHASE_UI[p].dim * (weights[p] || 0)), 0);
  ui.light = !!PHASE_UI[phase].light;
  void base;
  return { phase, ui };
}

function applyPhotoWeights(weights) {
  const root = document.documentElement;
  PHASES.forEach((p) => {
    root.style.setProperty(`--sky-${p}`, String(weights[p] || 0));
  });
}

function placeBody(el, azimuth, elevation, softKey) {
  if (!el) return;
  const screen = sunScreenPosition(azimuth, Math.max(elevation, -2));
  el.style.setProperty('--sun-x', `${screen.x}%`);
  el.style.setProperty('--sun-y', `${screen.y}%`);
  const nearHorizon = clamp(1 - Math.abs(elevation) / 14, 0.35, 1);
  el.style.setProperty('--sun-scale', String(0.75 + nearHorizon * 0.45));
  el.style.setProperty('--sun-soft', String(softKey ?? (0.35 + nearHorizon * 0.65)));
}

function applySky({ phase, weights, sun, moon }) {
  const { ui } = mixUi(weights);
  const root = document.documentElement;

  root.style.setProperty('--bg', ui.bg);
  root.style.setProperty('--ink', ui.ink);
  root.style.setProperty('--muted', ui.muted);
  root.style.setProperty('--sky-veil', ui.veil);
  root.style.setProperty('--sky-horizon', ui.horizon);
  root.style.setProperty('--sun-color', ui.sun);
  root.style.setProperty('--sun-glow', ui.glow);
  root.style.setProperty('--sky-dim', String(ui.dim));
  root.dataset.sky = phase;
  root.dataset.skyLight = ui.light ? 'true' : 'false';
  document.body.classList.toggle('sky-light', ui.light);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', ui.theme);

  applyPhotoWeights(weights);

  const sunEl = document.getElementById('bay-sun');
  const moonEl = document.getElementById('bay-moon');

  const sunVisible = sun && sun.elevation > -3 && phase !== 'night' && phase !== 'blue'
    && (weights.blue || 0) < 0.55 && (weights.night || 0) < 0.55;
  // Allow faint sun during blue? mockup says no disk — hide for blue/night
  const showSun = sun && sun.elevation > -3
    && (weights.dawn + weights.morning + weights.high + weights.golden + weights.sunset) > 0.35;

  if (sunEl) {
    sunEl.dataset.visible = showSun ? 'true' : 'false';
    sunEl.setAttribute('aria-hidden', showSun ? 'false' : 'true');
    if (showSun) placeBody(sunEl, sun.azimuth, sun.elevation);
  }

  const showMoon = moon && moon.elevation > 2
    && (weights.night + weights.blue) > 0.4
    && !showSun;

  if (moonEl) {
    moonEl.dataset.visible = showMoon ? 'true' : 'false';
    moonEl.setAttribute('aria-hidden', showMoon ? 'false' : 'true');
    if (showMoon) {
      placeBody(moonEl, moon.azimuth, moon.elevation, 0.5);
      const illum = moon.phase ?? 0.35;
      moonEl.style.setProperty('--moon-phase', String(illum));
      // Crescent offset: waxing vs — use illumination to shift shadow
      moonEl.style.setProperty('--moon-shade', String(lerp(0.15, 0.85, illum)));
    }
  }

  void sunVisible;
}

function forcedWeights(phase) {
  const weights = Object.fromEntries(PHASES.map((p) => [p, 0]));
  weights[phase] = 1;
  return weights;
}

export function initSunset() {
  const tick = () => {
    try {
      const forcedKey = new URLSearchParams(window.location.search).get('sky');
      if (forcedKey && FORCE[forcedKey]) {
        const f = FORCE[forcedKey];
        const weights = forcedWeights(f.phase);
        const moon = f.phase === 'night' || f.phase === 'blue'
          ? {
            elevation: f.moonEl ?? 40,
            azimuth: f.moonAz ?? 250,
            phase: 0.28,
          }
          : lunarPosition(new Date());
        applySky({
          phase: f.phase,
          weights,
          sun: { elevation: f.elevation, azimuth: f.azimuth },
          moon,
        });
        return;
      }

      const now = new Date();
      const sun = solarPosition(now);
      const moon = lunarPosition(now);
      if (!sun) {
        applySky({
          phase: 'night',
          weights: forcedWeights('night'),
          sun: { elevation: -40, azimuth: 250 },
          moon,
        });
        return;
      }
      const { phase, weights } = phaseBlend(sun.elevation, sun.azimuth);
      applySky({ phase, weights, sun, moon });
    } catch {
      applySky({
        phase: 'night',
        weights: forcedWeights('night'),
        sun: { elevation: -40, azimuth: 250 },
        moon: { elevation: 35, azimuth: 240, phase: 0.3 },
      });
    }
  };

  tick();
  const id = window.setInterval(tick, 45_000);
  return () => window.clearInterval(id);
}
