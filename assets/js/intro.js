/* Ovunque Accessibile – schermata di caricamento (sito e web-app).
   Si carica nel <head> senza defer: mette la classe "oa-intro" su <html> prima che la pagina si disegni,
   così il CSS copre la pagina con una scenetta: qualcuno percorre il sentiero a puntini e la rampa fino alla porta con il
   segnaposto (assets/img/intro-*.svg). A ogni visita una persona diversa, a caso: carrozzina elettrica o manuale,
   stampelle, persona anziana con il bastone, persona cieca con il bastone bianco, oppure la rampa da skate.
   Solo alla prima pagina della visita (sessionStorage, chiave diversa per sito e app): almeno 0,6 s, mai oltre 1,5 s;
   all'uscita la schermata sale come un sipario (0,5 s).
   È decorativa: per gli screen reader non esiste (pseudo-elementi di <html>). */
(function () {
  var root = document.documentElement;
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
  var tipi = ['elettrica', 'manuale', 'stampelle', 'anziana', 'cieco', 'skate'];
  var tipo = ' oa-intro--' + tipi[Math.floor(Math.random() * tipi.length)];
  root.className += ' oa-intro' + tipo;

  function end() {
    if (done) return;
    done = true;
    root.className = root.className.replace(/\s*oa-intro\b/, '') + ' oa-intro-out';
    setTimeout(function () { root.className = root.className.replace(/\s*oa-intro-out\b/, '').replace(tipo, ''); }, 550);
  }
  function ready() {
    setTimeout(end, Math.max(0, min - (Date.now() - start)));
  }
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready);
  setTimeout(end, 1500);
})();
