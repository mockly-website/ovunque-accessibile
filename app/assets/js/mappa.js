/* Ovunque Accessibile – web-app, pagina della mappa (index.html): pannello in stile Mappe di iPhone.
   Si carica dopo app.js, che dà le utilità comuni (window.OAApp), e si registra in OAApp.pagine.mappa: l'avvio la
   chiama dopo OA.start(), quando mappa ed elenco (oa-core.js, initExplore) ci sono già. Separato da app.js il
   21 novembre 2026, così le altre pagine non scaricano questo codice. */
(function () {
  'use strict';

  var OA = window.OA;
  var api = window.OAApi;
  var el = OA.el;
  var icon = OA.icon;
  var A = window.OAApp;

  /* Mappa in stile Mappe di iPhone (21 novembre 2026, scelta dei titolari).
     La mappa riempie lo schermo; la barra in alto e le schede in basso non ci sono. Tutto il resto sta in un pannello:
     - telefono: pannello in basso su tre altezze (basso: solo ricerca e profilo; metà; alto). Si trascina dalla
       maniglia o dalla testa, ma c'è sempre anche il tocco sulla maniglia («Mostra di più / di meno») e Esc, quindi
       niente richiede di trascinare (WCAG 2.5.7);
     - tablet e computer (da 48em, schermi non bassi): colonna fissa a sinistra, sempre aperta.
     La barra delle schede resta (scelta del 21 novembre, dopo una prova senza): il pannello le sta sopra.
     Nel pannello: ricerca, pulsanti rapidi (🚻 Bagni, Esigenza, Filtri), elenco dei luoghi.
     Toccando un segnaposto il riquadro del luogo si apre nel pannello (evento oa-riquadro da oa-core.js), non sulla
     mappa. Sulla mappa, in alto a destra sotto «Vicino a me» e «Tutta Italia»: Legenda. */
  function initFoglio() {
    var layout = document.querySelector('.explore__layout');
    var controls = document.querySelector('.explore__controls');
    var form = document.getElementById('filters');
    var results = document.getElementById('results');
    var mapBox = document.getElementById('explore-map');
    var wrap = document.querySelector('.explore__map-wrap');
    if (!layout || !controls || !form || !results || !mapBox || !wrap) return;
    document.body.classList.add('mappa-mappe');
    layout.setAttribute('data-view', 'map');
    var colonna = window.matchMedia('(min-width: 48em) and (min-height: 30.01em)');
    var ridotto = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* --- testa: ricerca + profilo --- */
    var cerca = form.querySelector('.search');
    var q = document.getElementById('q');
    [q, cerca && cerca.querySelector('button')].forEach(function (c) { if (c) c.setAttribute('form', 'filters'); });
    if (q) {
      q.setAttribute('aria-label', 'Cerca un luogo o una città');
      q.placeholder = 'Cerca un luogo o una città';
    }
    var testa = el('div', { className: 'foglio__testa' }, [cerca]);

    /* --- pulsanti rapidi --- */
    var vicino = form.querySelector('.filters__near .quick__link--near');
    var needs = document.getElementById('come-ti-muovi');
    var more = document.getElementById('filters-more');
    var rapidi = el('div', { className: 'foglio__rapidi', role: 'group', 'aria-label': 'Scelte rapide' });
    if (vicino) {
      vicino.className = 'quick__link--near foglio__rapido';
      vicino.textContent = '';
      vicino.appendChild(el('span', { className: 'foglio__emoji', 'aria-hidden': 'true', text: '🚻' }));
      vicino.appendChild(el('span', { text: 'Bagni' }));
      vicino.appendChild(el('span', { className: 'visually-hidden', text: ' accessibili vicino a me' }));
      rapidi.appendChild(vicino);
    }
    function bottoneSezione(testo, sezione, id) {
      if (!sezione) return null;
      sezione.id = sezione.id || id;
      var b = el('button', { type: 'button', className: 'foglio__rapido', 'aria-expanded': 'false', 'aria-controls': sezione.id }, [
        el('span', { className: 'foglio__rapido-testo', text: testo }), icon('#icon-chevron')
      ]);
      rapidi.appendChild(b);
      return b;
    }
    var bEsigenza = bottoneSezione('Esigenza', needs, 'come-ti-muovi');
    var bFiltri = bottoneSezione('Filtri', more, 'filters-more');
    var attivi = document.getElementById('filters-active');
    if (bFiltri && attivi) bFiltri.insertBefore(attivi, bFiltri.lastChild);

    function nomeEsigenza() {
      var r = needs && needs.querySelector('input[name="esigenza"]:checked');
      var lab = r && needs.querySelector('label[for="' + r.id + '"]');
      return lab ? lab.textContent.trim() : 'Esigenza';
    }
    function aggiornaEsigenza() {
      if (bEsigenza) bEsigenza.querySelector('.foglio__rapido-testo').textContent = nomeEsigenza();
    }
    if (needs) needs.addEventListener('change', aggiornaEsigenza);
    aggiornaEsigenza();
    setTimeout(aggiornaEsigenza, 500);   /* l'esigenza salvata nel profilo arriva dopo */

    /* Esigenza e Filtri: sezioni chiuse finché non si toccano (la tendina dei filtri perde il suo «summary») */
    if (more) {
      more.open = true;
      var sum = more.querySelector('summary');
      if (sum) sum.hidden = true;
    }
    function apriSezione(b, sezione, on) {
      b.setAttribute('aria-expanded', on ? 'true' : 'false');
      sezione.hidden = !on;
    }
    [[bEsigenza, needs], [bFiltri, more]].forEach(function (x) {
      if (!x[0]) return;
      apriSezione(x[0], x[1], false);
      x[0].addEventListener('click', function () {
        var on = x[0].getAttribute('aria-expanded') !== 'true';
        apriSezione(x[0], x[1], on);
        if (on && altezza === 'basso') setAltezza('meta');
      });
    });

    /* --- riquadro del luogo nel pannello --- */
    var luogo = el('div', { className: 'foglio__luogo', hidden: '', tabindex: '-1', role: 'region', 'aria-label': 'Luogo scelto sulla mappa' });
    var chiudiLuogo = el('button', { type: 'button', className: 'foglio__chiudi' }, [icon('#icon-no'), el('span', { className: 'visually-hidden', text: 'Chiudi il luogo' })]);
    var contenutoLuogo = el('div', { className: 'foglio__luogo-corpo' });
    luogo.appendChild(chiudiLuogo);
    luogo.appendChild(contenutoLuogo);
    var popupAperto = null;

    /* --- ricerche recenti e preferiti, come in Mappe: si vedono con il campo di ricerca vuoto --- */
    var sugg = el('div', { className: 'foglio__sugg' });
    var KEY_RICERCHE = 'oa-ricerche';
    function recenti() {
      try { var r = JSON.parse(localStorage.getItem(KEY_RICERCHE) || '[]'); return Array.isArray(r) ? r.filter(function (t) { return typeof t === 'string'; }).slice(0, 5) : []; }
      catch (e) { return []; }
    }
    function salvaRicerca(t) {
      t = (t || '').trim().slice(0, 80);
      if (t.length < 2) return;
      var r = recenti().filter(function (x) { return x.toLowerCase() !== t.toLowerCase(); });
      r.unshift(t);
      try { localStorage.setItem(KEY_RICERCHE, JSON.stringify(r.slice(0, 5))); } catch (e) { /* solo per questa visita */ }
    }
    var boxRecenti = el('section', { className: 'foglio__gruppo', 'aria-labelledby': 'sugg-recenti', hidden: '' });
    var boxPreferiti = el('section', { className: 'foglio__gruppo', 'aria-labelledby': 'sugg-preferiti', hidden: '' });
    sugg.appendChild(boxRecenti);
    sugg.appendChild(boxPreferiti);
    function disegnaRecenti() {
      var r = recenti();
      boxRecenti.textContent = '';
      boxRecenti.hidden = !r.length;
      if (!r.length) return;
      var cancella = el('button', { type: 'button', className: 'foglio__gruppo-azione', text: 'Cancella' });
      cancella.appendChild(el('span', { className: 'visually-hidden', text: ' le ricerche recenti' }));
      boxRecenti.appendChild(el('div', { className: 'foglio__gruppo-testa' }, [el('h2', { id: 'sugg-recenti', className: 'foglio__gruppo-titolo', text: 'Ricerche recenti' }), cancella]));
      boxRecenti.appendChild(el('ul', { className: 'foglio__voci', role: 'list' }, r.map(function (t) {
        var b = el('button', { type: 'button', className: 'foglio__voce' }, [icon('#icon-clock'), el('span', { text: t })]);
        b.addEventListener('click', function () {
          q.value = t;
          if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
        });
        return el('li', {}, [b]);
      })));
      cancella.addEventListener('click', function () {
        try { localStorage.removeItem(KEY_RICERCHE); } catch (e) { /* niente */ }
        disegnaRecenti();
        if (q) q.focus();
      });
    }
    function disegnaPreferiti() {
      if (!api.user() || !api.favorites || !api.placesByIds) return;
      api.favorites().then(function (ids) {
        return ids.length ? api.placesByIds(ids.slice(0, 8)) : [];
      }).then(function (pp) {
        boxPreferiti.textContent = '';
        boxPreferiti.hidden = !pp.length;
        if (!pp.length) return;
        boxPreferiti.appendChild(el('div', { className: 'foglio__gruppo-testa' }, [
          el('h2', { id: 'sugg-preferiti', className: 'foglio__gruppo-titolo', text: 'I tuoi preferiti' }),
          el('a', { className: 'foglio__gruppo-azione', href: 'profilo.html#preferiti', text: 'Tutti' }, [el('span', { className: 'visually-hidden', text: ' i preferiti' })])
        ]));
        boxPreferiti.appendChild(el('ul', { className: 'foglio__voci', role: 'list' }, pp.map(function (p) {
          return el('li', {}, [el('a', { className: 'foglio__voce', href: 'luogo.html?id=' + encodeURIComponent(p.id) }, [
            icon('#icon-heart'), el('span', { className: 'foglio__voce-testo' }, [el('span', { text: p.nome }), el('span', { className: 'foglio__voce-sub', text: p.citta || '' })])
          ])]);
        })));
      }).catch(function () { /* senza preferiti va bene lo stesso */ });
    }
    /* Suggerimenti mentre si scrive (combobox ARIA 1.2): città e luoghi dal database (cerca_luoghi, 8 risultati),
       dopo 2 lettere e una pausa di 250 ms. Frecce su e giù per scegliere, Invio per aprire, Esc per chiudere. */
    var boxSugg = el('section', { className: 'foglio__gruppo foglio__suggerimenti', 'aria-labelledby': 'sugg-titolo', hidden: '' });
    var listaSugg = el('ul', { className: 'foglio__voci', id: 'sugg-lista', role: 'listbox', 'aria-label': 'Suggerimenti' });
    var statoSugg = el('p', { className: 'visually-hidden', role: 'status' });
    boxSugg.appendChild(el('h2', { id: 'sugg-titolo', className: 'foglio__gruppo-titolo', text: 'Suggerimenti' }));
    boxSugg.appendChild(listaSugg);
    var attesa = null;
    var giroSugg = 0;
    var attiva = -1;
    if (q) {
      q.setAttribute('role', 'combobox');
      q.setAttribute('aria-autocomplete', 'list');
      q.setAttribute('aria-controls', 'sugg-lista');
      q.setAttribute('aria-expanded', 'false');
    }
    function opzioni() { return [].slice.call(listaSugg.querySelectorAll('[role="option"]')); }
    function chiudiSugg() {
      boxSugg.hidden = true;
      rapidi.hidden = false;
      listaSugg.textContent = '';
      attiva = -1;
      if (q) { q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); }
    }
    function evidenzia(i) {
      var o = opzioni();
      if (!o.length) return;
      attiva = (i + o.length) % o.length;
      o.forEach(function (x, k) { x.setAttribute('aria-selected', k === attiva ? 'true' : 'false'); });
      q.setAttribute('aria-activedescendant', o[attiva].id);
      o[attiva].scrollIntoView({ block: 'nearest' });
    }
    function scegli(o) {
      if (o.dataset.citta) {
        q.value = o.dataset.citta;
        chiudiSugg();
        if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
      } else if (o.dataset.href) {
        salvaRicerca(q.value);
        location.href = o.dataset.href;
      }
    }
    function voceSugg(id, icona, testo, sub, dati) {
      var li = el('li', { id: id, role: 'option', 'aria-selected': 'false', className: 'foglio__voce' }, [
        icon(icona), el('span', { className: 'foglio__voce-testo' }, [el('span', { text: testo }), sub ? el('span', { className: 'foglio__voce-sub', text: sub }) : null])
      ]);
      Object.keys(dati).forEach(function (k) { li.dataset[k] = dati[k]; });
      li.addEventListener('click', function () { scegli(li); });
      return li;
    }
    function suggerisci() {
      var t = q.value.trim();
      if (t.length < 2 || !api.searchPlaces) { chiudiSugg(); return; }
      var mio = ++giroSugg;
      api.searchPlaces(t, null, 8).then(function (r) {
        if (mio !== giroSugg || q.value.trim() !== t) return;
        var pp = (r && r.luoghi) || [];
        var n = OA.normalize ? OA.normalize(t) : t.toLowerCase();
        var citta = [];
        pp.forEach(function (p) {
          var c = (p.citta || '').trim();
          var cn = OA.normalize ? OA.normalize(c) : c.toLowerCase();
          if (c && cn.indexOf(n) === 0 && citta.indexOf(c) === -1) citta.push(c);
        });
        listaSugg.textContent = '';
        citta.slice(0, 3).forEach(function (c, i) {
          listaSugg.appendChild(voceSugg('sugg-c-' + i, '#icon-pin', c, 'Cerca i luoghi a ' + c, { citta: c }));
        });
        pp.slice(0, 6).forEach(function (p, i) {
          listaSugg.appendChild(voceSugg('sugg-l-' + i, '#icon-store', p.nome, (OA.CATEGORIE[p.categoria] || '') + ' · ' + p.citta, { href: 'luogo.html?id=' + encodeURIComponent(p.id) }));
        });
        var tot = opzioni().length;
        boxSugg.hidden = !tot;
        rapidi.hidden = !!tot;
        if (tot) corpo.scrollTop = 0;
        attiva = -1;
        q.setAttribute('aria-expanded', tot ? 'true' : 'false');
        q.removeAttribute('aria-activedescendant');
        statoSugg.textContent = tot ? (tot === 1 ? '1 suggerimento' : tot + ' suggerimenti') + ': usa le frecce per sceglierne uno.' : 'Nessun suggerimento.';
      }).catch(function () { if (mio === giroSugg) chiudiSugg(); });
    }
    if (q) {
      q.addEventListener('input', function () {
        clearTimeout(attesa);
        attesa = setTimeout(suggerisci, 250);
      });
      q.addEventListener('keydown', function (ev) {
        if (boxSugg.hidden) return;
        if (ev.key === 'ArrowDown') { ev.preventDefault(); evidenzia(attiva + 1); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); evidenzia(attiva - 1); }
        else if (ev.key === 'Enter' && attiva >= 0) { ev.preventDefault(); scegli(opzioni()[attiva]); }
        else if (ev.key === 'Escape') { ev.stopPropagation(); chiudiSugg(); }
      });
    }
    form.addEventListener('submit', function () { clearTimeout(attesa); giroSugg++; chiudiSugg(); });

    function aggiornaSugg() { sugg.hidden = !!(q && q.value.trim()); }
    disegnaRecenti();
    disegnaPreferiti();
    aggiornaSugg();
    if (q) q.addEventListener('input', aggiornaSugg);
    form.addEventListener('submit', function () { if (q) salvaRicerca(q.value); disegnaRecenti(); aggiornaSugg(); });
    form.addEventListener('reset', function () { setTimeout(aggiornaSugg, 0); });

    /* --- pannello --- */
    var corpo = el('div', { className: 'foglio__corpo', id: 'foglio-corpo' });
    /* i suggerimenti per primi, subito sotto il campo: con la tastiera aperta il resto del pannello è coperto */
    corpo.appendChild(boxSugg);
    corpo.appendChild(statoSugg);
    corpo.appendChild(luogo);
    corpo.appendChild(rapidi);
    corpo.appendChild(sugg);
    corpo.appendChild(controls);
    corpo.appendChild(results);
    var maniglia = el('button', { type: 'button', className: 'foglio__maniglia', 'aria-controls': 'foglio-corpo', 'aria-expanded': 'false' }, [
      el('span', { className: 'foglio__tacca', 'aria-hidden': 'true' }), el('span', { className: 'visually-hidden foglio__maniglia-testo', text: 'Mostra i luoghi' })
    ]);
    var foglio = el('section', { className: 'foglio', 'aria-label': 'Cerca e luoghi', 'data-altezza': 'basso' }, [maniglia, testa, corpo]);
    layout.insertBefore(foglio, layout.firstChild);

    /* --- pulsanti sulla mappa: Segnala e Legenda --- */
    var tasti = el('div', { className: 'mappa-tasti' });
    var leg = wrap.querySelector('.map-legend');
    if (leg) {
      leg.id = 'mappa-legenda';
      var bLeg = el('button', { type: 'button', className: 'mappa-tasti__btn', 'aria-expanded': 'false', 'aria-controls': 'mappa-legenda' }, [
        el('span', { className: 'mappa-tasti__i', 'aria-hidden': 'true', text: 'i' }), el('span', { className: 'visually-hidden', text: 'Legenda dei segnaposto' })
      ]);
      tasti.appendChild(bLeg);
      tasti.appendChild(leg);
      leg.hidden = true;
      bLeg.addEventListener('click', function () {
        var on = leg.hidden;
        leg.hidden = !on;
        bLeg.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
    }
    wrap.appendChild(tasti);
    /* Barra delle schede (in basso fino a 64em) e intestazione (in alto da 64em): il pannello e la mappa le evitano */
    function misura() {
      var nav = document.querySelector('.app-nav');
      var head = document.querySelector('.site-header');
      var nr = nav && nav.getBoundingClientRect();
      var basso = nr && nr.height && getComputedStyle(nav).position === 'fixed' && nr.top > window.innerHeight / 2 ? window.innerHeight - nr.top : 0;
      var hr = head && head.getBoundingClientRect();
      var alto = hr && hr.height > 8 && !basso ? hr.bottom : 0;
      document.body.style.setProperty('--barra-h', Math.round(basso) + 'px');
      document.body.style.setProperty('--testa-h', Math.round(alto) + 'px');
    }
    misura();
    window.addEventListener('resize', misura);
    /* con la tastiera aperta la barra delle schede si nasconde (CSS): il pannello scende con lei */
    document.addEventListener('focusin', function () { setTimeout(misura, 60); });
    document.addEventListener('focusout', function () { setTimeout(misura, 60); });
    /* la mappa ora è a tutto schermo: Leaflet ricalcola le dimensioni */
    window.dispatchEvent(new Event('resize'));
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 300);

    /* --- altezze --- */
    var ALTEZZE = ['basso', 'meta', 'alto'];
    var altezza = 'basso';
    function setAltezza(a, daIndietro) {
      altezza = a;
      foglio.setAttribute('data-altezza', a);
      var chiuso = a === 'basso' && !colonna.matches;
      corpo.inert = chiuso;
      if (chiuso) corpo.setAttribute('aria-hidden', 'true'); else corpo.removeAttribute('aria-hidden');
      maniglia.setAttribute('aria-expanded', a === 'basso' ? 'false' : 'true');
      maniglia.querySelector('.foglio__maniglia-testo').textContent = a === 'alto' ? 'Riduci il pannello' : a === 'meta' ? 'Allarga il pannello' : 'Mostra i luoghi';
      if (a !== 'basso') spingi();
      else if (!daIndietro && !popupAperto) consuma();
    }
    maniglia.addEventListener('click', function () {
      if (trascinato) { trascinato = false; return; }
      setAltezza(altezza === 'basso' ? 'meta' : altezza === 'meta' ? 'alto' : 'basso');
    });
    colonna.addEventListener('change', function () { setAltezza(altezza); });

    /* «Indietro» del telefono (Android, gesto su iPhone): chiude prima il luogo, poi riduce il pannello.
       Una sola voce nella cronologia finché il pannello è aperto; chiudendo a mano la si consuma. */
    var inStoria = false;
    var ignora = false;
    function spingi() {
      if (colonna.matches || inStoria) return;
      history.pushState({ oaFoglio: true }, '', location.href);
      inStoria = true;
    }
    function consuma() {
      if (!inStoria) return;
      inStoria = false;
      ignora = true;
      history.back();
    }
    window.addEventListener('popstate', function () {
      if (ignora) { ignora = false; return; }
      inStoria = false;
      if (popupAperto) {
        chiudi(true);
        if (altezza !== 'basso') spingi();
        return;
      }
      if (altezza !== 'basso') setAltezza('basso', true);
    });

    /* aggancio all'altezza più vicina, dopo un trascinamento */
    function aggancia(h) {
      foglio.style.height = '';
      foglio.classList.remove('is-trascina');
      var vh = window.innerHeight;
      var vicine = ALTEZZE.map(function (a) { return { a: a, d: Math.abs(h - (a === 'basso' ? 108 + (parseInt(document.body.style.getPropertyValue('--barra-h'), 10) || 0) : a === 'meta' ? vh * 0.5 : vh - 48)) }; })
        .sort(function (x, y) { return x.d - y.d; });
      setAltezza(vicine[0].a);
    }
    function trascina(h) {
      foglio.classList.add('is-trascina');
      foglio.style.height = Math.max(80, Math.min(window.innerHeight - 40, h)) + 'px';
    }

    /* trascinare (solo telefono) dalla maniglia e dalla testa, non dal campo di ricerca */
    var inizio = null;
    var trascinato = false;
    function suInizio(ev) {
      if (colonna.matches || ev.button > 0) return;
      if (ev.target.closest('input, a, button:not(.foglio__maniglia)')) return;
      inizio = { y: ev.clientY, h: foglio.getBoundingClientRect().height };
      trascinato = false;
      if (foglio.setPointerCapture) foglio.setPointerCapture(ev.pointerId);
    }
    function suMossa(ev) {
      if (!inizio) return;
      var dy = inizio.y - ev.clientY;
      if (Math.abs(dy) > 6) trascinato = true;
      if (trascinato) trascina(inizio.h + dy);
    }
    function suFine() {
      if (!inizio) return;
      if (trascinato) aggancia(foglio.getBoundingClientRect().height);
      inizio = null;
    }
    maniglia.addEventListener('pointerdown', suInizio);
    testa.addEventListener('pointerdown', suInizio);
    foglio.addEventListener('pointermove', suMossa);
    foglio.addEventListener('pointerup', suFine);
    foglio.addEventListener('pointercancel', suFine);

    /* ...e dall'elenco, come in Mappe: a metà schermo il dito allarga o riduce il pannello; a tutto schermo l'elenco
       scorre, e solo quando è in cima un trascinamento verso il basso riduce il pannello */
    var tocco = null;
    corpo.addEventListener('touchstart', function (ev) {
      if (colonna.matches || ev.touches.length > 1) { tocco = null; return; }
      if (ev.target.closest('input, select, textarea, .chips, .foglio__rapidi')) { tocco = null; return; }
      tocco = { y: ev.touches[0].clientY, h: foglio.getBoundingClientRect().height, attivo: false };
    }, { passive: true });
    corpo.addEventListener('touchmove', function (ev) {
      if (!tocco) return;
      var dy = tocco.y - ev.touches[0].clientY;
      if (!tocco.attivo) {
        if (altezza !== 'alto' && Math.abs(dy) > 8) tocco.attivo = true;
        else if (altezza === 'alto' && corpo.scrollTop <= 0 && dy < -8) tocco.attivo = true;
        else if (Math.abs(dy) > 8) { tocco = null; return; }
      }
      if (tocco.attivo) {
        if (ev.cancelable) ev.preventDefault();
        trascina(tocco.h + dy);
      }
    }, { passive: false });
    function fineTocco() {
      if (tocco && tocco.attivo) aggancia(foglio.getBoundingClientRect().height);
      tocco = null;
    }
    corpo.addEventListener('touchend', fineTocco);
    corpo.addEventListener('touchcancel', fineTocco);

    setAltezza(location.hash === '#results' ? 'meta' : 'basso');

    /* all'apertura l'Italia sta nella parte di mappa libera dal pannello (non quando si arriva da una ricerca) */
    var p0 = new URLSearchParams(location.search);
    if (!p0.get('q') && p0.get('vicino') !== '1' && mapBox._oaMap && OA.italia) {
      setTimeout(function () { OA.italia(mapBox._oaMap); }, 350);
      /* «Vicino a me» da solo, ma solo se il permesso della posizione c'è già (non lo chiediamo mai all'apertura)
         e una volta per visita: tornando dalla scheda di un luogo la mappa resta dov'era */
      var giaFatto = false;
      try { giaFatto = sessionStorage.getItem('oa-vicino-auto') === '1'; } catch (e) { giaFatto = true; }
      if (!giaFatto && navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
          if (st.state !== 'granted') return;
          try { sessionStorage.setItem('oa-vicino-auto', '1'); } catch (e) { /* niente */ }
          var b = mapBox.querySelector('.map-tools__btn');
          if (b) setTimeout(function () { b.click(); }, 450);
        }).catch(function () { /* il browser non lo dice: niente */ });
      }
    }

    /* --- cosa apre il pannello --- */
    /* come in Mappe: toccando la ricerca il pannello va in alto, così campo e suggerimenti restano sopra la tastiera */
    if (q) q.addEventListener('focus', function () { if (!colonna.matches && altezza !== 'alto') setAltezza('alto'); });
    form.addEventListener('submit', function () {
      /* dopo la ricerca: pannello a metà, così si vedono i risultati sulla mappa e in elenco */
      if (!colonna.matches && altezza !== 'meta') setAltezza('meta');
      if (q) q.blur();
    });
    if (vicino) vicino.addEventListener('click', function () { if (altezza === 'basso') setAltezza('meta'); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (leg && !leg.hidden) { leg.hidden = true; tasti.querySelector('[aria-controls="mappa-legenda"]').setAttribute('aria-expanded', 'false'); return; }
      if (popupAperto) { chiudi(); return; }
      if (altezza !== 'basso' && !colonna.matches) { setAltezza('basso'); maniglia.focus(); }
    });

    /* --- riquadro del luogo: distanza da chi guarda (se ha usato «Vicino a me») e indicazioni stradali --- */
    function extraLuogo(ll, nome) {
      var pos = null;
      try { pos = JSON.parse(sessionStorage.getItem('oa-posizione') || 'null'); } catch (e) { pos = null; }
      var meta = contenutoLuogo.querySelector('.popup__meta');
      if (pos && meta && OA.distanceKm && OA.distanzaTxt) {
        var km = OA.distanceKm({ lat: pos.lat, lng: pos.lng }, { lat: ll.lat, lng: ll.lng });
        meta.textContent = OA.distanzaTxt(km).replace(/^a /, 'A ') + ' da te · ' + meta.textContent;
      }
      if (!OA.directionsLinks) return;
      var links = OA.directionsLinks({ lat: ll.lat, lng: ll.lng, nome: nome });
      var det = el('details', { className: 'foglio__indicazioni' }, [
        el('summary', { className: 'btn btn--secondary btn--small' }, [icon('#icon-route'), document.createTextNode('Indicazioni')]),
        el('ul', { className: 'foglio__voci', role: 'list' }, links.map(function (l) {
          var ext = l[1].indexOf('geo:') !== 0;
          return el('li', {}, [el('a', ext ? { className: 'foglio__voce', href: l[1], rel: 'noopener', target: '_blank' } : { className: 'foglio__voce', href: l[1] }, [
            el('span', { text: l[0] }), ext ? el('span', { className: 'visually-hidden', text: ' (si apre in una nuova scheda)' }) : null
          ])]);
        }))
      ]);
      var pop = contenutoLuogo.querySelector('.popup');
      (pop || contenutoLuogo).appendChild(det);
    }

    /* --- riquadro del luogo --- */
    function chiudi(daIndietro) {
      var p = popupAperto;
      popupAperto = null;
      luogo.hidden = true;
      contenutoLuogo.textContent = '';
      if (p) p.map.closePopup(p.popup);
      if (daIndietro !== true && altezza === 'basso') consuma();
    }
    chiudiLuogo.addEventListener('click', function () { chiudi(); });
    mapBox.addEventListener('oa-riquadro', function (ev) {
      var d = ev.detail;
      if (!d.aperto) {
        if (popupAperto && popupAperto.popup === d.popup) { popupAperto = null; luogo.hidden = true; contenutoLuogo.textContent = ''; }
        return;
      }
      var nodo = d.popup.getElement() && d.popup.getElement().querySelector('.popup');
      if (!nodo) return;
      popupAperto = d;
      contenutoLuogo.textContent = '';
      contenutoLuogo.appendChild(nodo.cloneNode(true));
      extraLuogo(d.popup.getLatLng(), (nodo.querySelector('.popup__title') || {}).textContent || '');
      luogo.hidden = false;
      if (altezza === 'basso') setAltezza('meta'); else spingi();
      corpo.scrollTop = 0;
      /* il segnaposto resta visibile: se finisce sotto il pannello, la mappa si sposta */
      setTimeout(function () {
        var pt = d.map.latLngToContainerPoint(d.popup.getLatLng());
        var r = foglio.getBoundingClientRect();
        var box = mapBox.getBoundingClientRect();
        var dx = 0, dy = 0;
        if (colonna.matches) { if (pt.x + box.left < r.right + 40) dx = pt.x + box.left - (r.right + (box.right - r.right) / 2); }
        else if (pt.y + box.top > r.top - 40) dy = pt.y + box.top - r.top / 2;
        if (dx || dy) d.map.panBy([dx, dy], { animate: !ridotto.matches });
      }, 30);
      if (document.activeElement && foglio.contains(document.activeElement) === false && document.activeElement.closest && document.activeElement.closest('.leaflet-container') === null) luogo.focus();
    });
  }


  A.pagine.mappa = initFoglio;
})();
