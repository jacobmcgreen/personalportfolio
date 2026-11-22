(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (reduceMotion.matches) {
        document.documentElement.classList.add('reduce-motion');
    }
})();
