/**
 * Bay Area twilight atmosphere — solar elevation drives quiet CSS palette shifts.
 * Lat/lng: Palo Alto / mid-Peninsula. Graceful fallback to night palette.
 */

const BAY = { lat: 37.4419, lng: -122.1430 };
const TZ = 'America/Los_Angeles';

/** Degrees → radians */
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/**
 * Approximate solar elevation (degrees) for a local instant.
 * Compact NOAA-style formula; good enough for atmosphere, not navigation.
 */
export function solarElevation(date, lat = BAY.lat, lng = BAY.lng) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  // Julian day
  const jd = d.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;

  // Mean longitude / anomaly
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = rad((357.528 + 0.9856003 * n) % 360);
  const lambda = rad(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));

  const epsilon = rad(23.439 - 0.0000004 * n);
  const sinDec = Math.sin(epsilon) * Math.sin(lambda);
  const dec = Math.asin(sinDec);

  // Sidereal / hour angle
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst + lng / 15 + 24) % 24;
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const ha = rad((lst * 15) - deg(ra));

  const elev = Math.asin(
    Math.sin(rad(lat)) * Math.sin(dec)
    + Math.cos(rad(lat)) * Math.cos(dec) * Math.cos(ha),
  );

  return deg(elev);
}

/**
 * Map elevation → named phase for CSS data-phase.
 * Civil twilight ≈ −6°, nautical ≈ −12°.
 */
export function phaseFromElevation(elev) {
  if (elev == null || Number.isNaN(elev)) return 'night';
  if (elev < -12) return 'night';
  if (elev < -4) return 'dusk'; // or dawn — distinguished by solar azimuth / rising
  if (elev < 4) return 'twilight';
  if (elev < 12) return 'golden';
  if (elev < 35) return 'day';
  return 'high';
}

/** Rising vs setting: use time-of-day in Bay TZ as a soft discriminator near horizon. */
export function refinePhase(elev, date = new Date()) {
  const base = phaseFromElevation(elev);
  if (base !== 'dusk' && base !== 'twilight' && base !== 'golden') return base;

  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date),
  );

  if (base === 'golden') return hour < 12 ? 'dawn' : 'golden';
  if (base === 'twilight') return hour < 12 ? 'dawn' : 'dusk';
  return hour < 12 ? 'dawn' : 'dusk';
}

const PALETTES = {
  night: {
    bg: '#0a0a0a',
    surface: '#121212',
    ink: '#f5f5f7',
    muted: '#a2a2a2',
    fieldA: 'rgba(255, 255, 255, 0.07)',
    fieldB: 'rgba(255, 255, 255, 0.035)',
    fieldGrad: 'linear-gradient(160deg, #121212 0%, #0a0a0a 48%, #050505 100%)',
    presence: 'rgba(255, 255, 255, 0.18)',
    presenceSoft: 'rgba(255, 255, 255, 0.06)',
    washTop: 'rgba(10, 10, 10, 0.15)',
    washBottom: 'rgba(5, 5, 5, 0.55)',
    theme: '#0a0a0a',
  },
  dawn: {
    bg: '#0c0b0c',
    surface: '#161318',
    ink: '#f6f2f0',
    muted: '#b0a59e',
    fieldA: 'rgba(232, 168, 140, 0.14)',
    fieldB: 'rgba(120, 110, 150, 0.08)',
    fieldGrad: 'linear-gradient(160deg, #1a1418 0%, #0e0c10 50%, #08070a 100%)',
    presence: 'rgba(236, 180, 150, 0.22)',
    presenceSoft: 'rgba(160, 130, 170, 0.08)',
    washTop: 'rgba(18, 12, 16, 0.2)',
    washBottom: 'rgba(6, 5, 8, 0.55)',
    theme: '#0c0b0c',
  },
  day: {
    bg: '#0b0c0e',
    surface: '#13151a',
    ink: '#f3f4f6',
    muted: '#9aa0a8',
    fieldA: 'rgba(180, 200, 220, 0.09)',
    fieldB: 'rgba(140, 160, 180, 0.04)',
    fieldGrad: 'linear-gradient(160deg, #14161b 0%, #0b0c0e 48%, #070809 100%)',
    presence: 'rgba(200, 214, 230, 0.16)',
    presenceSoft: 'rgba(160, 180, 200, 0.06)',
    washTop: 'rgba(10, 12, 14, 0.18)',
    washBottom: 'rgba(5, 6, 8, 0.5)',
    theme: '#0b0c0e',
  },
  high: {
    bg: '#0a0b0d',
    surface: '#12141a',
    ink: '#f4f5f7',
    muted: '#9ca3ab',
    fieldA: 'rgba(210, 220, 235, 0.08)',
    fieldB: 'rgba(150, 170, 190, 0.035)',
    fieldGrad: 'linear-gradient(160deg, #13151a 0%, #0a0b0d 50%, #060708 100%)',
    presence: 'rgba(220, 228, 240, 0.14)',
    presenceSoft: 'rgba(170, 190, 210, 0.05)',
    washTop: 'rgba(10, 11, 14, 0.16)',
    washBottom: 'rgba(4, 5, 7, 0.5)',
    theme: '#0a0b0d',
  },
  golden: {
    bg: '#0d0a08',
    surface: '#18120e',
    ink: '#f7f1ea',
    muted: '#b5a698',
    fieldA: 'rgba(240, 160, 90, 0.16)',
    fieldB: 'rgba(180, 90, 60, 0.07)',
    fieldGrad: 'linear-gradient(160deg, #1c140f 0%, #100c09 48%, #080605 100%)',
    presence: 'rgba(245, 170, 100, 0.26)',
    presenceSoft: 'rgba(200, 110, 70, 0.1)',
    washTop: 'rgba(20, 12, 8, 0.22)',
    washBottom: 'rgba(6, 4, 3, 0.58)',
    theme: '#0d0a08',
  },
  dusk: {
    bg: '#0a090e',
    surface: '#14121a',
    ink: '#f2f0f5',
    muted: '#a39eae',
    fieldA: 'rgba(140, 120, 180, 0.12)',
    fieldB: 'rgba(90, 80, 130, 0.06)',
    fieldGrad: 'linear-gradient(160deg, #16121c 0%, #0b0a10 50%, #06050a 100%)',
    presence: 'rgba(160, 140, 200, 0.2)',
    presenceSoft: 'rgba(100, 90, 140, 0.08)',
    washTop: 'rgba(12, 10, 18, 0.22)',
    washBottom: 'rgba(5, 4, 8, 0.58)',
    theme: '#0a090e',
  },
};

function applyPalette(phase) {
  const p = PALETTES[phase] || PALETTES.night;
  const root = document.documentElement;
  root.style.setProperty('--bg', p.bg);
  root.style.setProperty('--surface', p.surface);
  root.style.setProperty('--ink', p.ink);
  root.style.setProperty('--muted', p.muted);
  root.style.setProperty('--field-a', p.fieldA);
  root.style.setProperty('--field-b', p.fieldB);
  root.style.setProperty('--field-grad', p.fieldGrad);
  root.style.setProperty('--presence', p.presence);
  root.style.setProperty('--presence-soft', p.presenceSoft);
  root.style.setProperty('--wash-top', p.washTop);
  root.style.setProperty('--wash-bottom', p.washBottom);
  root.dataset.sky = phase;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.theme);
}

export function initSunset() {
  const tick = () => {
    try {
      // Optional local/demo override: ?sky=golden|dusk|dawn|day|high|night
      const forced = new URLSearchParams(window.location.search).get('sky');
      if (forced && PALETTES[forced]) {
        applyPalette(forced);
        return;
      }
      const now = new Date();
      const elev = solarElevation(now);
      const phase = refinePhase(elev, now);
      applyPalette(phase);
    } catch {
      applyPalette('night');
    }
  };

  tick();
  // Quiet drift — re-evaluate every few minutes, CSS transitions do the rest
  const id = window.setInterval(tick, 3 * 60_000);
  return () => window.clearInterval(id);
}
