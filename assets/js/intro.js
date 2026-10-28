/* Ovunque Accessibile – schermata di caricamento (sito e web-app).
   Si carica nel <head> senza defer: mette la classe "oa-intro" su <html> prima che la pagina si disegni,
   così il CSS copre la pagina con la mappa e il segnaposto che cade (assets/img/intro.svg).
   Solo alla prima pagina della visita (sessionStorage, chiave diversa per sito e app): almeno 0,6 s, mai oltre 1,5 s.
   È decorativa: per gli screen reader non esiste (pseudo-elementi di <html>). */
(function () {
  var root = document.documentElement;
  /* Subito, prima che la pagina si disegni: con JavaScript il menu del sito sul telefono parte chiuso (menu.js) */
  root.classList.add('js');
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
    setTimeout(function () { root.className = root.className.replace(/\s*oa-intro-out\b/, ''); }, 450);
  }
  function ready() {
    setTimeout(end, Math.max(0, min - (Date.now() - start)));
  }
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready);
  setTimeout(end, 1500);
})();
