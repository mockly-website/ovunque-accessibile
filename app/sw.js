/* Ovunque Accessibile – service worker della web-app.
   - Pagine: prima la rete (contenuti sempre aggiornati), la copia salvata solo senza connessione.
   - File statici (CSS, JS, font, icone): dalla copia salvata, aggiornata in sottofondo.
   - Mai in cache: dati e accesso (Supabase), immagini della mappa, altri siti.
   Cambiare VERSION a ogni rilascio per buttare le copie vecchie. */
var VERSION = 'oa-app-3f338e92';
var SHELL = [
  './', 'index.html', 'luogo.html', 'accedi.html', 'registrati.html', 'password.html', 'segnala.html',
  'profilo.html', 'moderazione.html', 'privacy.html', 'bollino.html', 'locali.html', 'manifest.webmanifest',
  'assets/css/app.css?v=7e35c17b', 'assets/js/config.js?v=90a84c77', 'assets/js/api.js?v=4db84fc3', 'assets/js/app.js?v=11208395',
  'assets/js/accesso.js?v=209771b2', 'assets/js/scheda.js?v=320845b0', 'assets/js/segnala.js?v=38e6d02f', 'assets/js/profilo.js?v=d79286f4',
  'assets/js/moderazione.js?v=c88a1130', 'assets/js/bollino.js?v=28f9a403',
  'assets/vendor/supabase/supabase.js?v=2.117.3', 'assets/img/icon-192.png',
  '../assets/css/sito.css?v=5df39cdd', '../assets/js/oa-core.js?v=d749ee7e',
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
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);
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
