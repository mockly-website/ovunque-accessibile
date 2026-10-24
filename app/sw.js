/* Ovunque Accessibile – service worker della web-app.
   - Pagine: prima la rete (contenuti sempre aggiornati), la copia salvata solo senza connessione.
   - File statici (CSS, JS, font, icone): dalla copia salvata, aggiornata in sottofondo.
   - Mai in cache: dati e accesso (Supabase), immagini della mappa, altri siti.
   Cambiare VERSION a ogni rilascio per buttare le copie vecchie. */
var VERSION = 'oa-app-a5';
var SHELL = [
  './', 'index.html', 'luogo.html', 'accedi.html', 'registrati.html', 'password.html', 'segnala.html',
  'profilo.html', 'moderazione.html', 'privacy.html', 'manifest.webmanifest',
  'assets/css/app.css?v=a5', 'assets/js/config.js?v=a5', 'assets/js/api.js?v=a5', 'assets/js/app.js?v=a5',
  'assets/vendor/supabase/supabase.js?v=2.117.3', 'assets/img/icon-192.png',
  '../assets/css/sito.css?v=p15', '../assets/js/oa-core.js?v=p16',
  '../assets/vendor/leaflet/leaflet.js', '../assets/vendor/leaflet/leaflet.css',
  '../assets/vendor/markercluster/leaflet.markercluster.js', '../assets/vendor/markercluster/MarkerCluster.css',
  '../assets/fonts/atkinson-hyperlegible-400-latin.woff2', '../assets/fonts/atkinson-hyperlegible-700-latin.woff2',
  '../assets/fonts/fredoka-latin.woff2', '../assets/img/logo.webp'
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
  if (/\.json$/.test(url.pathname)) return;          /* luoghi di esempio: sempre dalla rete */

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
