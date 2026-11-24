/* Ovunque Accessibile – service worker della web-app.
   - Pagine: prima la rete (contenuti sempre aggiornati), la copia salvata solo senza connessione.
   - File statici (CSS, JS, font, icone): dalla copia salvata, aggiornata in sottofondo.
   - Immagini della mappa (tile.openstreetmap.org): copia delle sole immagini già viste, al massimo 400 (circa 6-8 MB),
     per vedere la mappa anche senza connessione; dalla copia se ha meno di 7 giorni, altrimenti dalla rete.
   - Mai in cache: dati e accesso (Supabase, la copia leggera dei luoghi la tiene api.js), altri siti.
   Cambiare VERSION a ogni rilascio per buttare le copie vecchie. */
var VERSION = 'oa-app-3802846e';
var SHELL = [
  './', 'index.html', 'luogo.html', 'accedi.html', 'registrati.html', 'password.html', 'segnala.html',
  'profilo.html', 'moderazione.html', 'privacy.html', 'bollino.html', 'locali.html', 'manifest.webmanifest',
  'assets/css/app.css?v=de5017f3', 'assets/js/config.js?v=90a84c77', 'assets/js/api.js?v=8addd012', 'assets/js/app.js?v=f4916fce',
  'assets/js/accesso.js?v=209771b2', 'assets/js/scheda.js?v=867968a6', 'assets/js/segnala.js?v=d1c4d370', 'assets/js/profilo.js?v=d79286f4',
  'assets/js/mappa.js?v=59da74b1', 'assets/js/moderazione.js?v=55a2d9b4', 'assets/js/bollino.js?v=28f9a403',
  'assets/vendor/supabase/supabase.js?v=2.117.3', 'assets/img/icon-192.png',
  '../assets/css/sito.css?v=114d2991', '../assets/js/oa-core.js?v=b35e2d0e',
  '../assets/vendor/leaflet/leaflet.js', '../assets/vendor/leaflet/leaflet.css',
  '../assets/vendor/markercluster/leaflet.markercluster.js', '../assets/vendor/markercluster/MarkerCluster.css',
  '../assets/fonts/atkinson-hyperlegible-400-latin.woff2', '../assets/fonts/atkinson-hyperlegible-700-latin.woff2',
  '../assets/fonts/fredoka-latin.woff2', '../assets/img/logo.webp', '../assets/vendor/qrcode/qrcode.js?v=1.4.4'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== TILES; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

var TILES = 'oa-mappa';
var TILES_MAX = 400;
var TILES_MS = 7 * 24 * 60 * 60 * 1000;

function tile(req) {
  return caches.open(TILES).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var t = hit && Number(hit.headers.get('x-oa-salvata'));
      if (hit && t && Date.now() - t < TILES_MS) return hit;
      return fetch(req).then(function (res) {
        if (res.ok && res.type === 'cors') {
          res.clone().blob().then(function (b) {
            var h = new Headers(res.headers);
            h.set('x-oa-salvata', String(Date.now()));
            return cache.put(req, new Response(b, { status: 200, headers: h }));
          }).then(function () {
            return cache.keys();
          }).then(function (keys) {
            /* le più vecchie escono per prime (l'ordine delle chiavi è quello di inserimento) */
            return Promise.all(keys.slice(0, Math.max(0, keys.length - TILES_MAX)).map(function (k) { return cache.delete(k); }));
          }).catch(function () { /* memoria piena: niente copia */ });
        }
        return res;
      }).catch(function () {
        if (hit) return hit;
        throw new Error('offline');
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);
  if (req.method === 'GET' && url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(tile(req));
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      if (res.ok) caches.open(VERSION).then(function (c) { c.put(url.pathname.endsWith('/') ? './' : req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('./'); });
    }));
    return;
  }

  event.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    });
    return hit || net;
  }));
});
