import { initSunset } from './sunset.js';
import { initTrail } from './trail.js';
import { initGuestbook } from './guestbook.js';
import { initCommits } from './commits.js';

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) {
    document.documentElement.classList.add('reduce-motion');
  }

  initSunset();
  initTrail();
  initGuestbook();
  initCommits();
})();
