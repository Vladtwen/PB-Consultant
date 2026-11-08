"use strict";
(() => {
  const header = document.querySelector('.header');
  const button = document.querySelector('.menu-button');
  const menu = document.getElementById('mobile-nav');
  if (!header || !button || !menu) return;
  button.hidden = false;

  const setOpen = (open) => {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    button.textContent = open ? '×' : '☰';
  };
  const close = () => setOpen(false);
  const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 20);

  button.addEventListener('click', () => setOpen(menu.hidden));
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || menu.hidden) return;
    event.preventDefault();
    close();
    button.focus();
  });
  // This is a navigation disclosure: keep normal tab order and page scrolling.
  const closeOutside = (event) => {
    if (!menu.hidden && !header.contains(event.target)) close();
  };
  document.addEventListener('click', closeOutside);
  document.addEventListener('focusin', closeOutside);
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) close();
  });
  window.addEventListener('scroll', updateHeader, { passive: true });
  close();
  updateHeader();
})();
