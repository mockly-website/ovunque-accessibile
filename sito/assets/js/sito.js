/* Ovunque Accessibile – sito (prototipo).
   Dati: assets/data/luoghi.json (esempi). In produzione la stessa forma arriverà da Supabase.
   Tutto il testo dei luoghi entra nel DOM con textContent: mai innerHTML con dati esterni. */
(function () {
  'use strict';

  var DATA_URL = 'assets/data/luoghi.json';
  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  var ITALY = { center: [42.5, 12.5], zoom: 5 };

  var CATEGORIE = {
    ristorante: 'Ristorante e bar',
    museo: 'Museo',
    hotel: 'Hotel e alloggi',
    spiaggia: 'Spiaggia',
    parco: 'Parco e natura',
    cultura: 'Cinema, teatro e cultura',
    negozio: 'Negozio',
    trasporti: 'Trasporti'
  };

  /* Filtri: chiave URL → condizione sul luogo */
  var FILTRI = {
    ingresso: function (p) { return p.ingresso === 'senza-gradini' || p.ingresso === 'rampa'; },
    bagno: function (p) { return p.bagno === 'si'; },
    parcheggio: function (p) { return p.parcheggio === 'si'; },
    interni: function (p) { return p.interni === 'tutto'; }
  };

  /* Ogni caratteristica → stato (si, parziale, no, nv) + testo leggibile */
  function stato(p, key) {
    var v = p[key];
    switch (key) {
      case 'ingresso':
        return {
          'senza-gradini': ['si', 'Senza gradini'],
          'rampa': ['si', 'Con rampa'],
          'gradino-basso': ['parziale', 'Un gradino basso'],
          'gradini': ['no', 'Con gradini']
        }[v] || ['nv', 'Da verificare'];
      case 'porta_cm':
        if (typeof v !== 'number') return ['nv', 'Da verificare'];
        return [v >= 80 ? 'si' : 'parziale', 'Larga ' + v + ' cm'];
      case 'bagno':
        return v === 'si' ? ['si', 'Bagno accessibile'] : v === 'no' ? ['no', 'Nessun bagno accessibile'] : ['nv', 'Da verificare'];
      case 'parcheggio':
        return v === 'si' ? ['si', 'Posti riservati vicini'] : v === 'no' ? ['no', 'Nessun posto riservato'] : ['nv', 'Da verificare'];
      case 'ascensore':
        return {
          'si': ['si', 'Ascensore presente'],
          'non-serve': ['si', 'Tutto su un piano'],
          'no': ['no', 'Nessun ascensore']
        }[v] || ['nv', 'Da verificare'];
      case 'interni':
        return {
          'tutto': ['si', 'Tutti gli spazi accessibili'],
          'parziale': ['parziale', 'Accessibili in parte'],
          'non-accessibile': ['no', 'Non accessibili'],
          'no': ['no', 'Non accessibili']
        }[v] || ['nv', 'Da verificare'];
      case 'assistenza':
        return v === 'si' ? ['si', 'Personale disponibile ad aiutare'] : v === 'no' ? ['no', 'Nessuna assistenza'] : ['nv', 'Da verificare'];
    }
    return ['nv', 'Da verificare'];
  }

  var ICONA_STATO = { si: '#icon-yes', parziale: '#icon-partial', no: '#icon-no', nv: '#icon-unknown' };
  var PREFISSO_STATO = { si: 'Sì: ', parziale: 'In parte: ', no: 'No: ', nv: 'Non verificato: ' };

  /* ---------- Utilità DOM ---------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'className') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function icon(id, extraClass) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', id);
    svg.appendChild(use);
    return svg;
  }

  /* Stato con icona + prefisso nascosto per screen reader: il significato non dipende dal colore */
  function statusNode(p, key) {
    var s = stato(p, key);
    return el('span', { className: 'status status--' + s[0] }, [
      icon(ICONA_STATO[s[0]]),
      el('span', {}, [
        el('span', { className: 'visually-hidden', text: PREFISSO_STATO[s[0]] }),
        document.createTextNode(s[1])
      ])
    ]);
  }

  function placeUrl(p) {
    return 'luogo.html?id=' + encodeURIComponent(p.id);
  }

  function formatDate(iso) {
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function loadPlaces() {
    return fetch(DATA_URL, { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('dati'); return r.json(); })
      .then(function (data) { return data.luoghi || []; });
  }

  function labelled(name, node) {
    node.insertBefore(el('span', { className: 'visually-hidden', text: name + ': ' }), node.firstChild);
    return node;
  }

  /* Card di un luogo (elenco della mappa e home) */
  function placeCard(p, headingTag) {
    return el('li', { className: 'place', 'data-id': p.id }, [
      el(headingTag || 'h3', { className: 'place__title' }, [el('a', { className: 'place__link', href: placeUrl(p), text: p.nome })]),
      el('p', { className: 'place__meta', text: (CATEGORIE[p.categoria] || '') + ' · ' + p.indirizzo + ', ' + p.citta }),
      el('div', { className: 'place__features' }, [
        labelled('Ingresso', statusNode(p, 'ingresso')),
        labelled('Bagno', statusNode(p, 'bagno')),
        labelled('Parcheggio', statusNode(p, 'parcheggio'))
      ])
    ]);
  }

  /* ---------- Mappa (Leaflet + OpenStreetMap) ---------- */
  function createMap(container, options) {
    if (!window.L) return null;
    var map = L.map(container, Object.assign({
      scrollWheelZoom: false,     /* la rotella scorre la pagina, non la mappa */
      keyboard: true
    }, options || {}));
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    map.attributionControl.setPrefix(false);
    return map;
  }

  function pinIcon() {
    return L.divIcon({ className: 'pin', iconSize: null, html: '' });
  }

  function popupContent(p) {
    return el('div', {}, [
      el('strong', { text: p.nome }),
      el('span', { text: (CATEGORIE[p.categoria] || '') + ' · ' + p.citta }),
      el('br'),
      el('a', { href: placeUrl(p), text: 'Apri la scheda' })
    ]);
  }

  function addMarker(map, p, onSelect) {
    var marker = L.marker([p.lat, p.lng], {
      icon: pinIcon(),
      title: p.nome + ', ' + p.citta,
      alt: p.nome,
      keyboard: true,
      riseOnHover: true
    }).addTo(map);
    marker.bindPopup(popupContent(p));
    if (onSelect) marker.on('click', function () { onSelect(p.id); });
    return marker;
  }

  /* ---------- Home: mappa d'anteprima ---------- */
  function initHome() {
    var box = document.getElementById('home-map');
    var latest = document.getElementById('latest-list');
    if (!box && !latest) return;
    loadPlaces().then(function (places) {
      if (latest) {
        latest.textContent = '';
        places
          .filter(function (p) { return p.verificato_il; })
          .sort(function (a, b) { return a.verificato_il < b.verificato_il ? 1 : -1; })
          .slice(0, 3)
          .forEach(function (p) { latest.appendChild(placeCard(p)); });
      }
      var map = box && createMap(box, { zoomControl: true });
      if (!map) return;
      map.setView(ITALY.center, ITALY.zoom);
      places.forEach(function (p) { addMarker(map, p); });
    }).catch(function () {});
  }

  /* ---------- Pagina mappa: ricerca, filtri, elenco e mappa ---------- */
  function initExplore() {
    var form = document.getElementById('filters');
    var list = document.getElementById('results-list');
    var count = document.getElementById('results-count');
    var mapBox = document.getElementById('explore-map');
    if (!form || !list) return;

    var params = new URLSearchParams(location.search);
    form.elements.q.value = params.get('q') || '';
    form.elements.cat.value = params.get('cat') || '';
    params.getAll('f').forEach(function (f) {
      var box = form.querySelector('input[name="f"][value="' + CSS.escape(f) + '"]');
      if (box) box.checked = true;
    });

    var places = [];
    var map = null;
    var markers = {};
    var layer = null;

    function selected() {
      return [].slice.call(form.querySelectorAll('input[name="f"]:checked')).map(function (i) { return i.value; });
    }

    function matches(p, q, cat, filters) {
      if (cat && p.categoria !== cat) return false;
      for (var i = 0; i < filters.length; i++) {
        if (FILTRI[filters[i]] && !FILTRI[filters[i]](p)) return false;
      }
      if (!q) return true;
      var hay = normalize([p.nome, p.citta, p.provincia, p.indirizzo, CATEGORIE[p.categoria]].join(' '));
      return normalize(q).split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
    }

    function highlight(id) {
      [].forEach.call(list.querySelectorAll('.place'), function (li) {
        li.classList.toggle('is-active', li.getAttribute('data-id') === id);
      });
      Object.keys(markers).forEach(function (k) {
        var icn = markers[k].getElement();
        if (icn) icn.classList.toggle('is-active', k === id);
      });
    }

    function render(updateUrl) {
      var q = form.elements.q.value.trim();
      var cat = form.elements.cat.value;
      var filters = selected();
      var found = places.filter(function (p) { return matches(p, q, cat, filters); });

      list.textContent = '';
      if (!found.length) {
        list.appendChild(el('li', { className: 'empty' }, [
          el('p', { text: 'Nessun luogo corrisponde alla ricerca.' }),
          el('p', { text: 'Prova a togliere qualche filtro o a cercare un\'altra città.' })
        ]));
      } else {
        found.forEach(function (p) { list.appendChild(placeCard(p)); });
      }
      count.textContent = found.length === 1 ? '1 luogo trovato' : found.length + ' luoghi trovati';

      if (map) {
        layer.clearLayers();
        markers = {};
        found.forEach(function (p) {
          markers[p.id] = addMarker(layer, p, highlight);
        });
        if (found.length) {
          map.fitBounds(L.latLngBounds(found.map(function (p) { return [p.lat, p.lng]; })), { padding: [40, 40], maxZoom: 14 });
        } else {
          map.setView(ITALY.center, ITALY.zoom);
        }
      }

      if (updateUrl) {
        var next = new URLSearchParams();
        if (q) next.set('q', q);
        if (cat) next.set('cat', cat);
        filters.forEach(function (f) { next.append('f', f); });
        var qs = next.toString();
        history.replaceState(null, '', qs ? '?' + qs : location.pathname);
      }
    }

    var timer = null;
    form.addEventListener('input', function (e) {
      clearTimeout(timer);
      timer = setTimeout(function () { render(true); }, e.target.name === 'q' ? 250 : 0);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      render(true);
      count.focus();
    });
    form.addEventListener('reset', function () {
      setTimeout(function () { render(true); }, 0);
    });

    loadPlaces().then(function (data) {
      places = data;
      if (mapBox) {
        map = createMap(mapBox);
        if (map) {
          layer = L.layerGroup().addTo(map);
          map.setView(ITALY.center, ITALY.zoom);
        }
      }
      render(false);
    }).catch(function () {
      count.textContent = 'Non siamo riusciti a caricare i luoghi. Ricarica la pagina tra poco.';
    });
  }

  /* ---------- Scheda luogo ---------- */
  function initDetail() {
    var root = document.getElementById('detail');
    if (!root) return;
    var id = new URLSearchParams(location.search).get('id');

    loadPlaces().then(function (places) {
      var p = places.filter(function (x) { return x.id === id; })[0];
      if (!p) {
        document.getElementById('detail-title').textContent = 'Luogo non trovato';
        document.getElementById('detail-intro').textContent = 'Il luogo che cerchi non esiste o è stato rimosso.';
        document.getElementById('detail-body').hidden = true;
        document.title = 'Luogo non trovato – Ovunque Accessibile';
        return;
      }

      document.title = p.nome + ', ' + p.citta + ' – Ovunque Accessibile';
      document.getElementById('crumb-current').textContent = p.nome;
      document.getElementById('detail-cat').textContent = CATEGORIE[p.categoria] || '';
      document.getElementById('detail-title').textContent = p.nome;
      document.getElementById('detail-address').textContent = p.indirizzo + ', ' + p.cap + ' ' + p.citta + ' (' + p.provincia + ')';
      document.getElementById('detail-intro').textContent = p.descrizione || '';
      document.getElementById('detail-date').textContent = p.verificato_il
        ? 'Ultima verifica sul posto: ' + formatDate(p.verificato_il)
        : 'Non ancora verificato sul posto: le informazioni arrivano da una segnalazione.';

      var dirs = document.getElementById('detail-directions');
      dirs.href = 'https://www.openstreetmap.org/directions?to=' + p.lat + '%2C' + p.lng;

      var report = document.getElementById('detail-report');
      report.href = 'mailto:ovunqueaccessibile@gmail.com?subject=' +
        encodeURIComponent('Correzione scheda: ' + p.nome + ', ' + p.citta + ' (' + p.id + ')');

      var facts = document.getElementById('detail-facts');
      [
        ['ingresso', 'Ingresso'],
        ['porta_cm', 'Porta d\'ingresso'],
        ['interni', 'Spazi e percorsi'],
        ['ascensore', 'Piani e ascensore'],
        ['bagno', 'Bagno'],
        ['parcheggio', 'Parcheggio'],
        ['assistenza', 'Assistenza']
      ].forEach(function (row) {
        var note = p.note && p.note[row[0]];
        facts.appendChild(el('div', { className: 'facts__row' }, [
          el('dt', { text: row[1] }),
          el('dd', {}, [
            statusNode(p, row[0]),
            note ? el('p', { className: 'facts__note', text: note }) : null
          ])
        ]));
      });

      document.getElementById('detail-body').hidden = false;

      var box = document.getElementById('detail-map');
      var map = createMap(box, { zoomControl: true });
      if (map) {
        map.setView([p.lat, p.lng], 16);
        addMarker(map, p).openPopup();
      }
    }).catch(function () {
      document.getElementById('detail-intro').textContent = 'Non siamo riusciti a caricare la scheda. Ricarica la pagina tra poco.';
    });
  }

  initHome();
  initExplore();
  initDetail();
})();
