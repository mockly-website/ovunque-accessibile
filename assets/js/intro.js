/* Ovunque Accessibile – schermata di caricamento (sito e web-app).
   Si carica nel <head> senza defer: mette la classe "oa-intro" su <html> prima che la pagina si disegni,
   così il CSS copre la pagina con la carrozzina che gira (assets/img/intro.svg).
   Solo alla prima pagina della visita (sessionStorage, chiave diversa per sito e app), mai oltre 2,5 s.
   È decorativa: per gli screen reader non esiste (pseudo-elementi di <html>). */
(function () {
  var root = document.documentElement;
  var key = 'oa-intro-' + (/\/app\//.test(location.pathname) ? 'app' : 'sito');
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch (e) {
    return;   /* senza sessionStorage (navigazione privata bloccata) niente intro: non la ripetiamo a ogni pagina */
  }
  var start = Date.now();
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var min = calm ? 500 : 1400;
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
  setTimeout(end, 2500);
})();
