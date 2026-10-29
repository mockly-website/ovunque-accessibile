/* Ovunque Accessibile – stili di prova (29 ottobre), per scegliere con il cliente.
   Con ?stile=a, ?stile=b o ?stile=c nell'indirizzo mette <html data-stile="…"> (vedi assets/css/stili-prova.css) e
   mostra in basso a sinistra un selettore A / B / C. La scelta resta per la visita (sessionStorage), anche cambiando
   pagina. Senza il parametro non fa niente. Da togliere quando lo stile è deciso. */
(function () {
  'use strict';
  var root = document.documentElement;
  var STILI = ['a', 'b', 'c'];
  var dalUrl = new URLSearchParams(location.search).get('stile');
  var stile = null;
  try {
    if (STILI.indexOf(dalUrl) >= 0) sessionStorage.setItem('oa-stile', dalUrl);
    stile = sessionStorage.getItem('oa-stile');
  } catch (e) {
    stile = dalUrl;
  }
  if (STILI.indexOf(stile) < 0) return;

  function applica(s) {
    stile = s;
    if (s === 'a') root.removeAttribute('data-stile');
    else root.setAttribute('data-stile', s);
    try { sessionStorage.setItem('oa-stile', s); } catch (e) { /* resta solo per questa pagina */ }
  }
  applica(stile);

  document.addEventListener('DOMContentLoaded', function () {
    var box = document.createElement('aside');
    box.className = 'stili-prova';
    box.setAttribute('aria-label', 'Stile di prova');
    box.innerHTML = '<span class="stili-prova__label" aria-hidden="true">Stile</span>';
    STILI.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.toUpperCase();
      b.setAttribute('aria-label', 'Stile ' + s.toUpperCase());
      b.setAttribute('aria-pressed', s === stile ? 'true' : 'false');
      b.addEventListener('click', function () {
        applica(s);
        [].forEach.call(box.querySelectorAll('button'), function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
      });
      box.appendChild(b);
    });
    document.body.appendChild(box);
  });
})();
