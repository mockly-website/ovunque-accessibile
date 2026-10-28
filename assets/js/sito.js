/* Ovunque Accessibile – sito: avvia il codice comune (oa-core.js) con i luoghi reali del database (Supabase).
   Legge solo le schede pubbliche, con la chiave pubblica dell'app (app/assets/js/config.js): niente account, niente scritture.
   Supabase restituisce al massimo 1000 righe per richiesta: si leggono a pagine. */
(function () {
  'use strict';

  var CFG = window.OA_CONFIG || {};
  var COLONNE = 'id,slug,nome,categoria,indirizzo,cap,citta,provincia,regione,lat,lng,descrizione,misure,facoltativi,dettagli,verifica_livello,verifica_data,stato,esempio,osm';
  var PAGINA = 1000;

  function toPlace(r) {
    return {
      id: r.id, slug: r.slug, nome: r.nome, categoria: r.categoria, indirizzo: r.indirizzo, cap: r.cap,
      citta: r.citta, provincia: r.provincia, regione: r.regione, lat: r.lat, lng: r.lng, descrizione: r.descrizione,
      misure: r.misure, facoltativi: r.facoltativi || {}, dettagli: r.dettagli || {},
      verifica: { livello: r.verifica_livello, data: r.verifica_data }, stato: r.stato, esempio: r.esempio, osm: r.osm || null
    };
  }

  function pagina(from, acc) {
    var url = CFG.supabaseUrl + '/rest/v1/places?select=' + COLONNE + '&stato=neq.archiviato&order=nome,id' +
      '&limit=' + PAGINA + '&offset=' + from;
    return fetch(url, { credentials: 'omit', headers: { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey } })
      .then(function (r) { if (!r.ok) throw new Error('dati'); return r.json(); })
      .then(function (rows) {
        acc = acc.concat(rows);
        return rows.length < PAGINA || acc.length >= 20000 ? acc : pagina(from + PAGINA, acc);
      });
  }

  var cache = null;
  if (CFG.supabaseUrl && CFG.supabaseKey) {
    window.OA.config.loadPlaces = function () {
      cache = cache || pagina(0, []).then(function (rows) { return rows.map(toPlace); });
      return cache;
    };
    /* Le correzioni si propongono dall'app (con le misure), non per email */
    window.OA.config.reportHref = function (p) { return 'app/segnala.html?id=' + encodeURIComponent(p.id); };
  }
  window.OA.start();
})();
