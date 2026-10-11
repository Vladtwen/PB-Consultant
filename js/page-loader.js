"use strict";
(() => {
    const root = document.documentElement;
    const loader = document.getElementById('page-loader');
    if (!loader || !root.classList.contains('pb-loading')) return;
    const reveal = () => { root.classList.remove('pb-loading'); loader.remove(); };
    // Deferred scripts run after blocking CSS. Lazy images must not delay the hero.
    // An independent inline timer reveals the page even if this script fails to load.
    const hero = document.querySelector('.hero-image img');
    const ready = hero?.decode ? hero.decode().catch(() => {}) : Promise.resolve();
    ready.then(() => {
        if (!root.classList.contains('pb-loading')) { loader.remove(); return; }
        loader.classList.add('is-leaving');
        setTimeout(reveal, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
    });
})();
