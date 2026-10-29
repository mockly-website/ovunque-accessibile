/* Ovunque Accessibile – menu del sito sul telefono.
   Sotto i 48em le voci e «Apri la web-app» stanno in un pannello che scende sotto la barra in alto (pulsante «Menu»,
   aria-expanded). Mentre è aperto il resto della pagina è sfocato e scurito, non scorre e non si raggiunge (inert):
   si chiude con «Chiudi», con Esc o toccando la parte sfocata. Sul computer il pannello non esiste (display: contents)
   e il pulsante è nascosto (CSS). Senza JavaScript il menu resta aperto: la classe «js» la mette intro.js. */
(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  var nav = header && header.querySelector('.nav');
  if (!nav) return;
  var root = document.documentElement;
  var brand = header.querySelector('.brand');
  var app = header.querySelector('.site-header__app');
  var telefono = window.matchMedia('(max-width: 47.99em)');
  nav.id = nav.id || 'menu-principale';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-toggle';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', nav.id);
  btn.innerHTML = '<span class="menu-toggle__bars" aria-hidden="true"></span><span class="menu-toggle__label">Menu</span>';
  brand.after(btn);

  /* Voci e pulsante dell'app nello stesso pannello */
  var panel = document.createElement('div');
  panel.className = 'site-header__panel';
  btn.after(panel);
  panel.appendChild(nav);
  if (app) panel.appendChild(app);

  var velo = document.createElement('div');
  velo.className = 'menu-velo';
  velo.setAttribute('aria-hidden', 'true');
  document.body.appendChild(velo);

  function resto() {
    return [].filter.call(document.body.children, function (el) {
      return el !== header && el !== velo && !el.classList.contains('sprite');
    });
  }

  function set(open) {
    header.classList.toggle('site-header--open', open);
    root.classList.toggle('menu-aperto', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.querySelector('.menu-toggle__label').textContent = open ? 'Chiudi' : 'Menu';
    resto().forEach(function (el) { el.inert = open; });
  }
  function aperto() { return btn.getAttribute('aria-expanded') === 'true'; }

  btn.addEventListener('click', function () { set(!aperto()); });
  velo.addEventListener('click', function () { set(false); btn.focus(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && aperto()) { set(false); btn.focus(); }
  });
  /* Un link a una sezione della stessa pagina (es. «Come funziona») chiude il menu */
  panel.addEventListener('click', function (ev) { if (ev.target.closest('a')) set(false); });
  /* Telefono girato o finestra allargata: sul computer il menu non c'è più, quindi si chiude */
  telefono.addEventListener('change', function (ev) { if (!ev.matches && aperto()) set(false); });
})();
