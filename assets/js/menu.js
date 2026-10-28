/* Ovunque Accessibile – menu del sito sul telefono.
   Sotto i 48em le voci e «Apri la web-app» stanno dietro il pulsante «Menu» (aria-expanded); sul computer sono sempre
   visibili e il pulsante è nascosto (CSS). Senza JavaScript il menu resta aperto: la classe «js» la mette intro.js. */
(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  var nav = header && header.querySelector('.nav');
  if (!nav) return;
  var brand = header.querySelector('.brand');
  nav.id = nav.id || 'menu-principale';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-toggle';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', nav.id);
  btn.innerHTML = '<span class="menu-toggle__bars" aria-hidden="true"></span><span class="menu-toggle__label">Menu</span>';
  (header.querySelector('.beta') || brand).after(btn);

  function set(open) {
    header.classList.toggle('site-header--open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.querySelector('.menu-toggle__label').textContent = open ? 'Chiudi' : 'Menu';
  }
  btn.addEventListener('click', function () { set(btn.getAttribute('aria-expanded') !== 'true'); });
  header.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); }
  });
  /* Un link a una sezione della stessa pagina (es. «Come funziona») chiude il menu */
  nav.addEventListener('click', function (ev) { if (ev.target.closest('a')) set(false); });
})();
