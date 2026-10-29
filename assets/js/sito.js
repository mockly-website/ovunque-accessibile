/* Ovunque Accessibile – sito: avvia il codice comune (oa-core.js) con i luoghi reali del database (Supabase).
   Legge solo le schede pubbliche, con la chiave pubblica dell'app (app/assets/js/config.js): niente account, niente scritture.
   Supabase restituisce al massimo 1000 righe per richiesta: la prima pagina dice quante sono, le altre arrivano insieme.
   I luoghi restano in memoria per 5 minuti (sessionStorage), così passando da una pagina all'altra non si riscaricano. */
(function () {
  'use strict';

  var CFG = window.OA_CONFIG || {};
  var COLONNE = 'id,slug,nome,categoria,indirizzo,cap,citta,provincia,regione,lat,lng,descrizione,misure,facoltativi,dettagli,verifica_livello,verifica_data,stato,esempio,osm';
  /* Per mappa ed elenchi basta meno (niente descrizione): un terzo di dati in meno da scaricare */
  var COLONNE_ELENCO = 'id,nome,categoria,indirizzo,cap,citta,provincia,regione,lat,lng,misure,facoltativi,dettagli,verifica_livello,verifica_data,stato,osm';
  var PAGINA = 1000;
  var CACHE = 'oa-luoghi-sito-v1';
  var CACHE_MS = 5 * 60 * 1000;

  function toPlace(r) {
    return {
      id: r.id, slug: r.slug, nome: r.nome, categoria: r.categoria, indirizzo: r.indirizzo, cap: r.cap,
      citta: r.citta, provincia: r.provincia, regione: r.regione, lat: r.lat, lng: r.lng, descrizione: r.descrizione,
      misure: r.misure, facoltativi: r.facoltativi || {}, dettagli: r.dettagli || {},
      verifica: { livello: r.verifica_livello, data: r.verifica_data }, stato: r.stato, esempio: r.esempio, osm: r.osm || null
    };
  }

  var HEAD = { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey };

  function pagina(from, conta) {
    var url = CFG.supabaseUrl + '/rest/v1/places?select=' + COLONNE_ELENCO + '&stato=in.(pubblicato,in-revisione)&order=nome,id' +
      '&limit=' + PAGINA + '&offset=' + from;
    return fetch(url, { credentials: 'omit', headers: conta ? Object.assign({ Prefer: 'count=exact' }, HEAD) : HEAD })
      .then(function (r) {
        if (!r.ok) throw new Error('dati');
        var tot = Number(((r.headers.get('content-range') || '').split('/')[1]) || 0);
        return r.json().then(function (rows) { return { rows: rows, tot: tot }; });
      });
  }

  function tutti() {
    return pagina(0, true).then(function (first) {
      var altre = [];
      for (var from = PAGINA; from < Math.min(first.tot, 20000); from += PAGINA) altre.push(pagina(from, false));
      return Promise.all(altre).then(function (pp) {
        return pp.reduce(function (acc, x) { return acc.concat(x.rows); }, first.rows);
      });
    });
  }

  function dallaCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE) || 'null');
      return c && Date.now() - c.t < CACHE_MS ? c.rows : null;
    } catch (e) { return null; }
  }

  var cache = null;
  if (CFG.supabaseUrl && CFG.supabaseKey) {
    window.OA.config.loadPlaces = function () {
      if (cache) return cache;
      var rows = dallaCache();
      cache = rows ? Promise.resolve(rows.map(toPlace)) : tutti().then(function (r) {
        try { sessionStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), rows: r })); } catch (e) { /* spazio finito: va bene lo stesso */ }
        return r.map(toPlace);
      });
      return cache;
    };
    window.OA.config.loadPlace = function (id) {
      if (!/^[0-9a-f-]{36}$/.test(id || '')) return Promise.resolve(null);
      var url = CFG.supabaseUrl + '/rest/v1/places?select=' + COLONNE + '&id=eq.' + id + '&stato=in.(pubblicato,in-revisione)';
      return fetch(url, { credentials: 'omit', headers: HEAD })
        .then(function (r) { if (!r.ok) throw new Error('dati'); return r.json(); })
        .then(function (rows) { return rows[0] ? toPlace(rows[0]) : null; });
    };
    /* Le correzioni si propongono dall'app (con le misure), non per email */
    window.OA.config.reportHref = function (p) { return 'app/segnala.html?id=' + encodeURIComponent(p.id); };
  }
  window.OA.start();
})();

/* Movimento allo scorrimento (29 ottobre): titoli, voci degli elenchi e schede della home entrano in sequenza quando
   arrivano sullo schermo (classe «svela», poi «is-visto»); la mappa della home fa spuntare i segnaposto quando si vede.
   Solo con JavaScript e se non si è chiesto di ridurre il movimento: altrimenti tutto è già al suo posto. */
(function () {
  'use strict';
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var gruppi = [
    'main > .section h2', '.needs-home__head p, .map-preview__head > *:not(h2), .facts-home__head p',
    '.needs-home__list > li', '.how__list > li', '.facts-home__list > div', '.apps', '.business-home__inner > *:not(h2)',
    '.about__body > *', '#home-map'
  ];
  var io = new IntersectionObserver(function (voci) {
    voci.forEach(function (v) {
      if (!v.isIntersecting) return;
      v.target.classList.add('is-visto');
      io.unobserve(v.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  gruppi.forEach(function (sel) {
    [].forEach.call(document.querySelectorAll(sel), function (el, i, tutti) {
      el.classList.add('svela');
      /* sfasati dentro lo stesso elenco: fratelli in ordine */
      var idx = el.parentNode ? [].indexOf.call(el.parentNode.children, el) : 0;
      el.style.setProperty('--i', String(Math.min(idx, 8)));
      io.observe(el);
    });
  });
  /* L'elenco «Ultimi luoghi verificati» arriva dopo i dati: le schede entrano quando ci sono */
  var latest = document.getElementById('latest-list');
  if (latest) {
    new MutationObserver(function () {
      [].forEach.call(latest.children, function (li, i) {
        if (li.classList.contains('svela')) return;
        li.classList.add('svela');
        li.style.setProperty('--i', String(i));
        io.observe(li);
      });
    }).observe(latest, { childList: true });
  }
})();

