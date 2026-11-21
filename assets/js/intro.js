/* Ovunque Accessibile – schermata di caricamento (sito e web-app).
   Si carica nel <head> senza defer: mette la classe "oa-intro" su <html> prima che la pagina si disegni,
   così il CSS copre la pagina con il logo dentro un anello che gira, il nome e la frase del progetto
   (assets/img/intro-anello.svg; sito.css, sezione 12).
   Solo alla prima pagina della visita (sessionStorage, chiave diversa per sito e app): almeno 0,6 s, mai oltre 1,5 s;
   all'uscita la schermata sale come un sipario (0,5 s).
   È decorativa: per gli screen reader non esiste (pseudo-elementi di <html>). */
/* Alto contrasto (21 novembre 2026, richiesta di Angelo): pulsante [data-contrasto] nelle intestazioni (e nel profilo
   dell'app). La scelta resta su questo dispositivo (localStorage) e si applica qui, prima che la pagina si disegni. */
(function () {
  var root = document.documentElement;
  var KEY = 'oa-contrasto';
  var attivo = false;
  try { attivo = localStorage.getItem(KEY) === 'alto'; } catch (e) { /* senza memoria: contrasto normale */ }
  function applica() {
    if (attivo) root.setAttribute('data-contrasto', 'alto'); else root.removeAttribute('data-contrasto');
    [].forEach.call(document.querySelectorAll('button[data-contrasto]'), function (b) { b.setAttribute('aria-pressed', attivo ? 'true' : 'false'); });
  }
  applica();
  document.addEventListener('DOMContentLoaded', applica);
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('button[data-contrasto]');
    if (!b) return;
    attivo = !attivo;
    try { if (attivo) localStorage.setItem(KEY, 'alto'); else localStorage.removeItem(KEY); } catch (e) { /* vale solo per questa pagina */ }
    applica();
  });
})();

(function () {
  var root = document.documentElement;
  /* Mai dentro un riquadro di un altro sito (clickjacking): GitHub Pages non permette l'intestazione
     frame-ancestors, quindi la pagina si nasconde e si riapre da sola a tutta finestra (19 novembre) */
  if (window.top !== window.self) {
    var stessoSito = false;
    try { stessoSito = window.top.location.origin === location.origin; } catch (e) { stessoSito = false; }
    if (!stessoSito) {
      root.style.display = 'none';
      try { window.top.location.href = location.href; } catch (e) { /* il sito esterno lo blocca: resta nascosta */ }
      return;
    }
  }
  /* Subito, prima che la pagina si disegni: con JavaScript il menu del sito sul telefono parte chiuso (menu.js) */
  root.classList.add('js');
  /* App: la pagina nuova entra dal lato della scheda scelta (app.js salva «oa-verso» al tocco sulla barra).
     Va fatto qui, prima del primo disegno: «pagereveal» arriva prima degli script con defer. */
  if (/\/app\//.test(location.pathname) && 'onpagereveal' in window) {
    window.addEventListener('pagereveal', function (e) {
      var verso = null;
      try {
        verso = sessionStorage.getItem('oa-verso');
        sessionStorage.removeItem('oa-verso');
      } catch (err) { return; }
      if (!e.viewTransition || !verso) return;
      root.classList.add('vt-' + verso);
      e.viewTransition.finished.then(function () { root.classList.remove('vt-' + verso); });
    });
  }
  var key = 'oa-intro-' + (/\/app\//.test(location.pathname) ? 'app' : 'sito');
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch (e) {
    return;   /* senza sessionStorage (navigazione privata bloccata) niente intro: non la ripetiamo a ogni pagina */
  }
  var start = Date.now();
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var min = calm ? 300 : 600;
  var done = false;
  root.className += ' oa-intro';

  function end() {
    if (done) return;
    done = true;
    root.className = root.className.replace(/\s*oa-intro\b/, '') + ' oa-intro-out';
    setTimeout(function () { root.className = root.className.replace(/\s*oa-intro-out\b/, ''); }, 550);
  }
  function ready() {
    setTimeout(end, Math.max(0, min - (Date.now() - start)));
  }
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready);
  setTimeout(end, 1500);
})();
