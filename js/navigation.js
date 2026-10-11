"use strict";
(() => {
  const button = document.querySelector('.menu-button');
  const menu = document.getElementById('mobile-nav');
  if (!button || !menu) return;
  button.hidden = false;
  const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', 'Открыть меню'); };
  button.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
    button.setAttribute('aria-label', menu.hidden ? 'Открыть меню' : 'Закрыть меню');
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { close(); button.focus(); } });
  window.addEventListener('resize', () => { if (window.innerWidth > 700) close(); });
})();
