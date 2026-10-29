/* Ovunque Accessibile – sito: avvia il codice comune (oa-core.js) con i luoghi reali del database (Supabase).
   Legge solo le schede pubbliche, con la chiave pubblica dell'app (app/assets/js/config.js): niente account, niente scritture.
   Mappa ed elenco chiedono solo l'area visibile (luoghi_area), la ricerca per testo la fa il database (cerca_luoghi),
   i contatori della home arrivano già contati (statistiche_luoghi). La memoria dei riquadri già visti è in oa-core.js. */
(function () {
  'use strict';

  var CFG = window.OA_CONFIG || {};
  var COLONNE = 'id,slug,nome,categoria,indirizzo,cap,citta,provincia,regione,lat,lng,descrizione,misure,facoltativi,dettagli,verifica_livello,verifica_data,stato,esempio,osm';
  /* Per mappa ed elenchi basta meno (niente descrizione): le stesse colonne le restituiscono luoghi_area e cerca_luoghi */
  var COLONNE_ELENCO = 'id,nome,categoria,indirizzo,cap,citta,provincia,regione,lat,lng,misure,facoltativi,dettagli,verifica_livello,verifica_data,stato,osm';

  function toPlace(r) {
    return {
      id: r.id, slug: r.slug, nome: r.nome, categoria: r.categoria, indirizzo: r.indirizzo, cap: r.cap,
      citta: r.citta, provincia: r.provincia, regione: r.regione, lat: r.lat, lng: r.lng, descrizione: r.descrizione,
      misure: r.misure, facoltativi: r.facoltativi || {}, dettagli: r.dettagli || {},
      verifica: { livello: r.verifica_livello, data: r.verifica_data }, stato: r.stato, esempio: r.esempio, osm: r.osm || null
    };
  }

  var HEAD = { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey };

  function leggi(percorso) {
    return fetch(CFG.supabaseUrl + '/rest/v1/' + percorso, { credentials: 'omit', headers: HEAD })
      .then(function (r) { if (!r.ok) throw new Error('dati'); return r.json(); });
  }

  function rpc(nome, args) {
    return fetch(CFG.supabaseUrl + '/rest/v1/rpc/' + nome, {
      method: 'POST', credentials: 'omit',
      headers: Object.assign({ 'Content-Type': 'application/json' }, HEAD),
      body: JSON.stringify(args || {})
    }).then(function (r) { if (!r.ok) throw new Error('dati'); return r.json(); });
  }

  /* { totale, luoghi } → luoghi nella forma di oa-core.js (le zone passano così come sono) */
  function conLuoghi(x) {
    if (x.luoghi) x.luoghi = x.luoghi.map(toPlace);
    return x;
  }

  if (CFG.supabaseUrl && CFG.supabaseKey) {
    window.OA.config.areaPlaces = function (q) {
      return rpc('luoghi_area', {
        p_sud: q.sud, p_ovest: q.ovest, p_nord: q.nord, p_est: q.est,
        p_categoria: q.categoria, p_sensi: q.sensi, p_max: q.max, p_passo: q.passo
      }).then(conLuoghi);
    };
    window.OA.config.searchPlaces = function (testo, categoria) {
      return rpc('cerca_luoghi', { p_testo: testo, p_categoria: categoria || null }).then(conLuoghi);
    };
    /* Home: le ultime schede verificate (non quelle importate da OpenStreetMap); oa-core ne mostra 3 per l'esigenza scelta */
    window.OA.config.latestPlaces = function () {
      return leggi('places?select=' + COLONNE_ELENCO + '&stato=in.(pubblicato,in-revisione)&verifica_livello=neq.osm' +
        '&verifica_data=not.is.null&order=verifica_data.desc,nome&limit=24').then(function (rows) { return rows.map(toPlace); });
    };
    window.OA.config.stats = function () {
      return rpc('statistiche_luoghi');
    };
    window.OA.config.loadPlace = function (id) {
      if (!/^[0-9a-f-]{36}$/.test(id || '')) return Promise.resolve(null);
      return leggi('places?select=' + COLONNE + '&id=eq.' + id + '&stato=in.(pubblicato,in-revisione)')
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

