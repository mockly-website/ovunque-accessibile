/* Ovunque Accessibile – web-app, pannello di moderazione (moderazione.html, dopo segnala.js).
   Si carica dopo app.js, che dà le utilità comuni (window.OAApp) e chiama la funzione della pagina. */
(function () {
  'use strict';

  var OA = window.OA;
  var api = window.OAApi;
  var el = OA.el;
  var icon = OA.icon;
  var A = window.OAApp;
  var $ = A.$;
  var answersNode = A.answersNode;
  var busy = A.busy;
  var dateIt = A.dateIt;
  var focusHeading = A.focusHeading;
  var goLogin = A.goLogin;
  var isBusy = A.isBusy;
  var message = A.message;
  var show = A.show;
  var showErrors = A.showErrors;
  var LABELS = A.segnala.LABELS;
  var OPTION_LABELS = A.segnala.OPTION_LABELS;
  var farFromCity = A.segnala.farFromCity;
  var nessunoPuoEntrare = A.segnala.nessunoPuoEntrare;

  /* ---------- Moderazione (verificatori e admin) ---------- */
  function flatten(obj, prefix, out) {
    out = out || {};
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      var key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = v;
    });
    return out;
  }

  function fmt(v) {
    if (v === true) return 'Sì';
    if (v === false) return 'No';
    if (v == null || v === '') return '—';
    if (Array.isArray(v)) return v.join(' × ');
    return String(v);
  }

  function placeAsDati(p) {
    return {
      nome: p.nome, categoria: p.categoria, indirizzo: p.indirizzo, cap: p.cap, citta: p.citta, provincia: p.provincia,
      regione: p.regione, lat: p.lat, lng: p.lng, descrizione: p.descrizione,
      misure: p.misure, facoltativi: p.facoltativi || {}, dettagli: p.dettagli || {}
    };
  }

  /* Tabella: per una correzione solo le voci cambiate, per un luogo nuovo tutte quelle compilate */
  function diffTable(proposed, current) {
    var a = flatten(proposed);
    var b = current ? flatten(current) : {};
    var keys = Object.keys(a).concat(Object.keys(b).filter(function (k) { return !(k in a); }));
    var rows = keys.filter(function (k) {
      return current ? fmt(a[k]) !== fmt(b[k]) : a[k] != null && a[k] !== '';
    });
    if (!rows.length) return el('p', { className: 'place__meta', text: 'Nessuna differenza rispetto alla scheda attuale.' });
    var head = current ? ['Voce', 'Ora', 'Proposto'] : ['Voce', 'Proposto'];
    return el('div', { className: 'table-wrap', role: 'region', 'aria-label': current ? 'Modifiche proposte' : 'Dati proposti', tabindex: '0' }, [
      el('table', { className: 'diff' }, [
        el('thead', {}, [el('tr', {}, head.map(function (h) { return el('th', { scope: 'col', text: h }); }))]),
        el('tbody', {}, rows.map(function (k) {
          var label = LABELS[k] || k;
          if (k === 'categoria') return el('tr', {}, [el('th', { scope: 'row', text: label })].concat(
            (current ? [OA.CATEGORIE[b[k]] || fmt(b[k])] : []).concat([OA.CATEGORIE[a[k]] || fmt(a[k])]).map(function (t) { return el('td', { text: t }); })));
          var names = OPTION_LABELS[k] || {};
          var show2 = function (v) { return names[v] || fmt(v); };
          return el('tr', {}, [el('th', { scope: 'row', text: label })].concat(
            (current ? [show2(b[k])] : []).concat([show2(a[k])]).map(function (t) { return el('td', { text: t }); })));
        }))
      ])
    ]);
  }

  /* Giudizi che la scheda avrebbe con i dati proposti */
  function verdictPreview(x, key) {
    var p = Object.assign({ id: 'anteprima-' + key }, x);
    return el('ul', { className: 'verdict-preview', role: 'list', 'aria-label': 'Giudizi con i dati proposti' }, OA.ORDINE_ESIGENZE.map(function (e) {
      return el('li', {}, [el('span', { className: 'verdict-preview__who', text: OA.ESIGENZE[e].nome + ':' }), OA.verdictNode(p, e)]);
    }));
  }

  function initModerazione() {
    if (!api.user()) return goLogin();
    api.profile().then(function (prof) {
      if (!prof || prof.ruolo === 'utente') {
        show($('mod-denied'), true);
        return;
      }
      showPanel();
    }).catch(function (err) {
      message($('mod-note'), err.message, 'error');
    });
  }

  function showPanel() {
    show($('mod-panel'), true);
    focusHeading($('mod-panel-title'));
    loadPending();
    initOsmQueue();
    loadChecks();
    initPlaceState();
    initOsmImport();
  }

  function decisionForm(kind, item, onDone) {
    var idp = 'dec-' + item.id;
    var form = el('form', { className: 'decision' });
    if (kind === 'proposta') {
      form.appendChild(el('fieldset', { className: 'group group--inline' }, [
        el('legend', { className: 'field__label', text: 'Come la pubblichiamo?' }),
        el('div', { className: 'radio' }, [el('input', { type: 'radio', name: 'livello', id: idp + '-c', value: 'community', checked: '' }), el('label', { 'for': idp + '-c', text: 'Segnalato dalla community' })]),
        el('div', { className: 'radio' }, [el('input', { type: 'radio', name: 'livello', id: idp + '-s', value: 'sul-posto' }), el('label', { 'for': idp + '-s', text: 'Verificato sul posto da noi' })])
      ]));
    }
    form.appendChild(el('div', { className: 'field' }, [
      el('label', { className: 'field__label', 'for': idp + '-m', text: 'Motivo, se non approvi (lo vede chi ha scritto)' }),
      el('textarea', { className: 'input', id: idp + '-m', name: 'motivo', rows: '2', maxlength: '500' })
    ]));
    var ok = el('button', { type: 'submit', className: 'btn btn--primary btn--small', value: 'ok' }, [document.createTextNode(kind === 'proposta' ? 'Approva e pubblica' : kind === 'gestore' ? 'Approva: contatto verificato' : 'Pubblica')]);
    var no = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [document.createTextNode(kind === 'recensione' ? 'Non pubblicare' : 'Non approvare')]);
    var status = el('p', { className: 'notice', hidden: '', tabindex: '-1', role: 'status' });
    form.appendChild(el('div', { className: 'decision__actions' }, [ok, no]));
    form.appendChild(status);

    function run(promise, text) {
      if (isBusy(form)) return;
      form.dataset.busy = '1';
      promise().then(function (res) {
        [].forEach.call(form.querySelectorAll('input, textarea, button'), function (c) { c.disabled = true; });
        message(status, text, 'ok');
        if (res && typeof res === 'string') {
          status.appendChild(document.createTextNode(' '));
          status.appendChild(el('a', { href: 'luogo.html?id=' + encodeURIComponent(res), text: 'Apri la scheda' }));
        }
        status.focus();
        onDone();
      }).catch(function (err) {
        form.dataset.busy = '';
        message(status, err.message, 'error');
        status.focus();
      });
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (kind === 'proposta') {
        var livello = form.querySelector('input[name="livello"]:checked').value;
        run(function () { return api.approve(item.id, livello); }, 'Approvata: la scheda è online.');
      } else if (kind === 'gestore') {
        run(function () { return api.decideOwner(item.id, 'approvato'); }, 'Gestore approvato: ora può rispondere alle recensioni.');
      } else {
        run(function () { return api.moderateReview(item.id, 'pubblicata'); }, 'Recensione pubblicata.');
      }
    });
    no.addEventListener('click', function () {
      var motivo = form.elements.motivo.value.trim();
      if (kind === 'proposta') run(function () { return api.reject(item.id, motivo); }, 'Proposta non approvata.');
      else if (kind === 'gestore') run(function () { return api.decideOwner(item.id, 'respinto', motivo); }, 'Richiesta non approvata.');
      else run(function () { return api.moderateReview(item.id, 'respinta', motivo); }, 'Recensione non pubblicata.');
    });
    return form;
  }

  function setCount(id, n, one, many) {
    $(id).textContent = n === 1 ? '1 ' + one : n + ' ' + many;
  }

  function loadPending() {
    var listP = $('mod-proposals');
    var listR = $('mod-reviews');
    api.pending().then(function (res) {
      var counts = { p: res.proposte.length, r: res.recensioni.length };
      function update() {
        setCount('mod-proposals-count', counts.p, 'in attesa', 'in attesa');
        setCount('mod-reviews-count', counts.r, 'in attesa', 'in attesa');
        if (counts.g != null) setCount('mod-owners-count', counts.g, 'in attesa', 'in attesa');
      }
      update();
      listP.textContent = '';
      listR.textContent = '';
      show($('mod-proposals-empty'), !counts.p);
      show($('mod-reviews-empty'), !counts.r);

      res.proposte.forEach(function (x) {
        var article = el('article', { className: 'card mod-item', 'aria-labelledby': 'mod-p-' + x.id });
        var title = (x.tipo === 'nuovo' ? 'Nuovo luogo: ' : 'Correzione: ') + (x.dati.nome || '') + ', ' + (x.dati.citta || '');
        article.appendChild(el('h3', { id: 'mod-p-' + x.id, text: title }));
        article.appendChild(el('p', { className: 'place__meta', text: 'Inviata da ' + (x.autore_nome || 'utente') + ' il ' + dateIt(x.created_at) }));
        if (x.nota) article.appendChild(el('blockquote', { className: 'mod-item__note' }, [el('p', { text: x.nota })]));
        article.appendChild(el('h4', { text: 'Giudizi con questi dati' }));
        article.appendChild(verdictPreview(x.dati, x.id));
        if (nessunoPuoEntrare(x.dati)) {
          article.appendChild(el('p', { className: 'notice notice--error', text: 'Con questi dati il luogo non è accessibile per nessuna esigenza: se approvi, sparisce da mappa ed elenchi.' }));
        }
        var diffBox = el('div', {}, [el('p', { className: 'place__meta', text: 'Caricamento del confronto…' })]);
        article.appendChild(el('h4', { text: x.tipo === 'nuovo' ? 'Dati proposti' : 'Cosa cambia' }));
        article.appendChild(diffBox);
        var geoNote = el('p', { className: 'notice notice--error', hidden: '' });
        article.appendChild(geoNote);
        farFromCity(x.dati).then(function (km) {
          if (!km) return;
          geoNote.textContent = 'Attenzione: il punto sulla mappa è a circa ' + km + ' km da ' + x.dati.citta + '. Controlla la posizione prima di approvare.';
          geoNote.hidden = false;
        });
        if (x.tipo === 'correzione') {
          api.getPlace(x.place_id).then(function (p) {
            diffBox.textContent = '';
            diffBox.appendChild(p ? diffTable(x.dati, placeAsDati(p)) : el('p', { text: 'La scheda originale non esiste più.' }));
            if (p) diffBox.appendChild(el('p', {}, [el('a', { href: 'luogo.html?id=' + encodeURIComponent(p.id), text: 'Apri la scheda attuale' })]));
          });
        } else {
          diffBox.textContent = '';
          diffBox.appendChild(diffTable(x.dati, null));
          diffBox.appendChild(el('p', {}, [el('a', {
            href: 'https://www.openstreetmap.org/?mlat=' + x.dati.lat + '&mlon=' + x.dati.lng + '#map=18/' + x.dati.lat + '/' + x.dati.lng,
            rel: 'noopener', target: '_blank'
          }, [document.createTextNode('Controlla la posizione su OpenStreetMap'), el('span', { className: 'visually-hidden', text: ' (si apre in una nuova scheda)' })])]));
        }
        var photoTitle = el('h4', { text: 'Foto' });
        var photoBox = el('ul', { className: 'photos', role: 'list' });
        article.appendChild(photoTitle);
        article.appendChild(photoBox);
        api.proposalPhotos(x.id).then(function (rows) {
          if (!rows.length) {
            photoTitle.remove();
            photoBox.remove();
            return;
          }
          photoTitle.textContent = rows.length === 1 ? 'Foto (1): si pubblica con la scheda' : 'Foto (' + rows.length + '): si pubblicano con la scheda';
          rows.forEach(function (f, i) {
            var btn = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [
              document.createTextNode('Non pubblicare'), el('span', { className: 'visually-hidden', text: ' la foto ' + (i + 1) })
            ]);
            var li = el('li', {}, [el('figure', { className: 'photo' }, [
              el('img', { src: f.url, alt: f.alt, loading: 'lazy' }),
              el('figcaption', { text: 'Descrizione: ' + f.alt })
            ]), btn]);
            btn.addEventListener('click', function () {
              api.moderatePhoto(f.id, 'respinta').then(function () {
                li.textContent = '';
                li.appendChild(el('p', { className: 'notice', role: 'status', text: 'Foto ' + (i + 1) + ' esclusa: non verrà pubblicata.' }));
              }).catch(function (err) { message($('mod-note'), err.message, 'error'); });
            });
            photoBox.appendChild(li);
          });
        }).catch(function () { photoTitle.textContent = 'Foto: non siamo riusciti a caricarle'; });
        article.appendChild(decisionForm('proposta', x, function () { counts.p--; update(); }));
        listP.appendChild(el('li', {}, [article]));
      });

      res.recensioni.forEach(function (r) {
        var place = r.places ? r.places.nome + ', ' + r.places.citta : 'Luogo';
        var article = el('article', { className: 'card mod-item', 'aria-labelledby': 'mod-r-' + r.id }, [
          el('h3', { id: 'mod-r-' + r.id, text: 'Recensione: ' + place }),
          el('p', { className: 'place__meta', text: 'Di ' + r.autore_nome + ' · ' + (OA.ESIGENZE[r.esigenza] ? OA.ESIGENZE[r.esigenza].nome : '') +
            (r.data_visita ? ' · visita del ' + dateIt(r.data_visita) : '') + ' · scritta il ' + dateIt(r.created_at) }),
          answersNode(r.risposte),
          r.testo ? el('blockquote', { className: 'mod-item__note' }, [el('p', { text: r.testo })]) : el('p', { className: 'place__meta', text: 'Solo risposte alle domande, senza testo.' }),
          decisionForm('recensione', r, function () { counts.r--; update(); })
        ]);
        listR.appendChild(el('li', {}, [article]));
      });

      var listG = $('mod-owners');
      var gs = res.gestori || [];
      counts.g = gs.length;
      update();
      listG.textContent = '';
      show($('mod-owners-empty'), !counts.g);
      var RUOLI = { titolare: 'Titolare', dipendente: 'Lavora nel luogo', altro: 'Altro ruolo' };
      gs.forEach(function (g) {
        var place = g.places ? g.places.nome + ', ' + g.places.citta : 'Luogo';
        listG.appendChild(el('li', {}, [el('article', { className: 'card mod-item', 'aria-labelledby': 'mod-g-' + g.id }, [
          el('h3', { id: 'mod-g-' + g.id, text: 'Gestore: ' + place }),
          el('p', { className: 'place__meta', text: 'Chiesto da ' + (g.nome || 'utente') + ' · ' + (RUOLI[g.ruolo] || g.ruolo) + ' · il ' + dateIt(g.created_at) }),
          g.titolare ? el('dl', { className: 'facts mod-owner' }, [
            el('div', { className: 'facts__row' }, [el('dt', { text: 'Titolare' }), el('dd', { text: g.titolare })]),
            el('div', { className: 'facts__row' }, [el('dt', { text: 'Telefono' }), el('dd', {}, [el('a', { href: 'tel:' + g.telefono.replace(/[^0-9+]/g, ''), text: g.telefono })])]),
            el('div', { className: 'facts__row' }, [el('dt', { text: 'Email' }), el('dd', {}, [el('a', { href: 'mailto:' + g.email, text: g.email })])])
          ]) : el('p', {}, [el('strong', { text: 'Contatto da verificare: ' }), document.createTextNode(g.contatto)]),
          g.foto_url ? el('figure', { className: 'mod-owner__photo' }, [
            el('img', { src: g.foto_url, alt: 'Foto dell\'ingresso di ' + place + ', inviata da chi chiede di gestirlo', loading: 'lazy' }),
            el('figcaption', { className: 'place__meta', text: 'Foto dell\'ingresso: confrontala con la scheda e con le foto pubbliche del locale.' })
          ]) : (g.titolare ? el('p', { className: 'place__meta', text: 'Foto dell\'ingresso non disponibile.' }) : null),
          g.nota ? el('blockquote', { className: 'mod-item__note' }, [el('p', { text: g.nota })]) : null,
          el('p', {}, [el('a', { href: 'luogo.html?id=' + encodeURIComponent(g.place_id), text: 'Apri la scheda' })]),
          decisionForm('gestore', g, function () { counts.g--; update(); })
        ])]));
      });
    }).catch(function (err) {
      message($('mod-note'), err.message, 'error');
    });
  }

  /* Verifiche sul posto chieste dai gestori */
  var RUOLI_GESTORE = { titolare: 'Titolare', dipendente: 'Lavora nel luogo', altro: 'Altro ruolo' };

  function loadChecks() {
    var list = $('mod-checks');
    if (!list) return;
    api.pendingVerifications().then(function (rows) {
      var n = rows.length;
      function update() { setCount('mod-checks-count', n, 'da organizzare', 'da organizzare'); }
      update();
      list.textContent = '';
      show($('mod-checks-empty'), !n);
      rows.forEach(function (v) {
        var place = v.places ? v.places.nome + ', ' + v.places.citta : 'Luogo';
        var idv = 'chk-' + v.id;
        var status = el('p', { className: 'notice', hidden: '', tabindex: '-1', role: 'status' });
        var risposta = el('textarea', { className: 'input', id: idv + '-r', name: 'risposta', rows: '2', maxlength: '500' });
        var buttons = [
          ['fissata', 'Fissata', 'btn--secondary', 'Verifica fissata: il gestore vede la data che hai scritto.'],
          ['fatta', 'Fatta: verificato sul posto', 'btn--primary', 'Fatto: la scheda ora è «Verificato sul posto».'],
          ['respinta', 'Non possibile', 'btn--secondary', 'Richiesta chiusa: il gestore vede il motivo.']
        ].map(function (b) {
          var btn = el('button', { type: 'button', className: 'btn btn--small ' + b[2], text: b[1] });
          btn.addEventListener('click', function () {
            if (b[0] === 'fissata' && !risposta.value.trim()) {
              message(status, 'Scrivi la data e l\'ora del sopralluogo nella risposta per il gestore.', 'error');
              status.focus();
              return;
            }
            api.decideVerification(v.id, b[0], risposta.value.trim()).then(function () {
              message(status, b[3], 'ok');
              status.focus();
              if (b[0] !== 'fissata') {
                [].forEach.call(article.querySelectorAll('button, textarea'), function (c) { c.disabled = true; });
                n--;
                update();
              }
            }).catch(function (err) { message(status, err.message, 'error'); status.focus(); });
          });
          return btn;
        });
        var article = el('article', { className: 'card mod-item', 'aria-labelledby': idv }, [
          el('h3', { id: idv, text: 'Verifica: ' + place }),
          el('p', { className: 'place__meta', text: 'Chiesta da ' + (v.nome || 'gestore') + ' il ' + dateIt(v.created_at) + (v.places && v.places.indirizzo ? ' · ' + v.places.indirizzo : '') }),
          el('p', {}, [el('strong', { text: v.stato === 'fissata' ? 'Fissata: ' : 'Quando passare: ' }), document.createTextNode(v.stato === 'fissata' && v.risposta ? v.risposta + ' (il gestore aveva indicato: ' + v.disponibilita + ')' : v.disponibilita)]),
          v.nota ? el('blockquote', { className: 'mod-item__note' }, [el('p', { text: v.nota })]) : null,
          el('ul', { className: 'place__meta', role: 'list' }, (v.gestori || []).map(function (g) {
            return el('li', { text: 'Contatto del gestore ' + (g.nome || '') + ' (' + (RUOLI_GESTORE[g.ruolo] || g.ruolo) + '): ' + g.contatto });
          })),
          el('p', {}, [el('a', { href: 'luogo.html?id=' + encodeURIComponent(v.place_id), text: 'Apri la scheda' }), document.createTextNode(' · '),
            el('a', { href: 'segnala.html?id=' + encodeURIComponent(v.place_id), text: 'Correggi le misure' })]),
          el('div', { className: 'field' }, [el('label', { className: 'field__label', 'for': idv + '-r', text: 'Risposta per il gestore (data del sopralluogo o motivo)' }), risposta]),
          el('div', { className: 'decision__actions' }, buttons),
          status
        ]);
        list.appendChild(el('li', {}, [article]));
      });
    }).catch(function (err) { message($('mod-note'), err.message, 'error'); });
  }

  /* Luoghi da OpenStreetMap da approvare: per città, 20 alla volta, uno per uno o selezionati in blocco */
  var OSM_PAGINA = 20;
  var OSM_SI = { yes: 'sì', limited: 'in parte', no: 'no' };

  function initOsmQueue() {
    var list = $('mod-osm');
    if (!list) return;
    var select = $('osm-citta');
    var status = $('osm-status');
    var more = $('osm-more');
    var shown = 0;
    var totale = 0;

    function say(text, kind) { message(status, text, kind); status.focus(); }

    function cities() {
      return api.osmCities().then(function (rows) {
        var tot = rows.reduce(function (a, r) { return a + r.n; }, 0);
        setCount('mod-osm-count', tot, 'da approvare', 'da approvare');
        var keep = select.value;
        select.textContent = '';
        select.appendChild(el('option', { value: '', text: 'Tutte le città (' + tot + ')' }));
        rows.forEach(function (r) { select.appendChild(el('option', { value: r.citta, text: r.citta + ' (' + r.n + ')' })); });
        if (keep && rows.some(function (r) { return r.citta === keep; })) select.value = keep;
      });
    }

    function decide(ids, approva, items) {
      if (!ids.length) return say('Seleziona almeno un luogo.', 'error');
      api.decideOsm(ids, approva).then(function (n) {
        items.forEach(function (li) { li.remove(); });
        shown -= items.length;
        totale -= items.length;
        say((approva ? 'Approvati: ' : 'Archiviati: ') + n + (n === 1 ? ' luogo.' : ' luoghi.') + (approva ? ' Ora sono sulla mappa, con il giudizio di OpenStreetMap.' : ''), 'ok');
        show($('mod-osm-empty'), !list.children.length && !totale);
        if (!list.children.length && totale > 0) load(false);
        cities();
      }).catch(function (err) { say(err.message, 'error'); });
    }

    function item(p) {
      var cb = el('input', { type: 'checkbox', id: 'osm-' + p.id, value: p.id });
      var q = encodeURIComponent(p.nome + ', ' + p.indirizzo + ', ' + p.citta);
      var yes = el('button', { type: 'button', className: 'btn btn--primary btn--small' }, [document.createTextNode('Approva'), el('span', { className: 'visually-hidden', text: ' ' + p.nome })]);
      var no = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [document.createTextNode('Non approvare'), el('span', { className: 'visually-hidden', text: ' ' + p.nome })]);
      var li = el('li', { className: 'osm-item' }, [
        el('div', { className: 'osm-item__check' }, [cb, el('label', { 'for': 'osm-' + p.id }, [el('span', { className: 'visually-hidden', text: 'Seleziona ' }), el('strong', { text: p.nome })])]),
        el('p', { className: 'place__meta', text: (OA.CATEGORIE[p.categoria] || '') + ' · ' + p.indirizzo + ', ' + p.citta }),
        el('p', { className: 'osm-item__facts', text: 'Su OpenStreetMap: accesso in carrozzina ' + (OSM_SI[(p.osm || {}).wheelchair] || 'non indicato') +
          ' · bagno accessibile ' + (OSM_SI[(p.osm || {}).toilets_wheelchair] || 'non indicato') }),
        el('p', { className: 'osm-item__links' }, [
          p.osm && p.osm.ref ? el('a', { href: 'https://www.openstreetmap.org/' + p.osm.ref, rel: 'noopener', target: '_blank' }, [document.createTextNode('OpenStreetMap'), el('span', { className: 'visually-hidden', text: ' (si apre in una nuova scheda)' })]) : null,
          document.createTextNode(' · '),
          el('a', { href: 'https://www.google.com/maps/search/?api=1&query=' + q, rel: 'noopener', target: '_blank' }, [document.createTextNode('Google Maps e Street View'), el('span', { className: 'visually-hidden', text: ' (si apre in una nuova scheda)' })])
        ]),
        el('div', { className: 'decision__actions' }, [yes, no])
      ]);
      yes.addEventListener('click', function () { decide([p.id], true, [li]); });
      no.addEventListener('click', function () { decide([p.id], false, [li]); });
      return li;
    }

    function load(append) {
      if (!append) { list.textContent = ''; shown = 0; }
      api.pendingOsm(select.value || null, shown, OSM_PAGINA).then(function (res) {
        totale = res.totale;
        res.rows.forEach(function (p) { list.appendChild(item(p)); });
        shown += res.rows.length;
        show($('mod-osm-empty'), !totale);
        show(more, shown < totale);
        more.textContent = 'Mostra altri (' + (totale - shown) + ')';
      }).catch(function (err) { say(err.message, 'error'); });
    }

    function selected() {
      return [].slice.call(list.querySelectorAll('input[type="checkbox"]:checked'));
    }
    $('osm-all').addEventListener('click', function () {
      var boxes = [].slice.call(list.querySelectorAll('input[type="checkbox"]'));
      var all = boxes.every(function (b) { return b.checked; });
      boxes.forEach(function (b) { b.checked = !all; });
      say(all ? 'Selezione tolta.' : 'Selezionati ' + boxes.length + ' luoghi.', '');
    });
    $('osm-yes').addEventListener('click', function () {
      var cbs = selected();
      decide(cbs.map(function (c) { return c.value; }), true, cbs.map(function (c) { return c.closest('li'); }));
    });
    $('osm-no').addEventListener('click', function () {
      var cbs = selected();
      decide(cbs.map(function (c) { return c.value; }), false, cbs.map(function (c) { return c.closest('li'); }));
    });
    select.addEventListener('change', function () { load(false); });
    more.addEventListener('click', function () { load(true); });
    cities().then(function () { load(false); });
  }

  /* Import da OpenStreetMap (solo admin): file JSON di import_osm.py, a blocchi di 500 */
  function initOsmImport() {
    var card = $('osm-card');
    if (!card) return;
    api.profile().then(function (prof) {
      if (!prof || prof.ruolo !== 'admin') return;
      show(card, true);
      var note = $('osm-note');
      var btn = $('osm-import');
      btn.addEventListener('click', function () {
        var file = $('osm-file').files[0];
        if (!file) { message(note, 'Scegli prima il file JSON.', 'error'); note.focus(); return; }
        if (btn.getAttribute('aria-disabled') === 'true') return;
        btn.setAttribute('aria-disabled', 'true');
        file.text().then(function (txt) {
          var righe = JSON.parse(txt);
          if (!Array.isArray(righe)) throw new Error('Il file non contiene un elenco di luoghi.');
          var fatti = 0;
          var creati = 0;
          message(note, 'Importo ' + righe.length + ' luoghi…', '');
          return righe.reduce(function (prev, _, i) {
            if (i % 500) return prev;
            return prev.then(function () {
              return api.importOsm(righe.slice(i, i + 500)).then(function (n) {
                creati += n;
                fatti = Math.min(i + 500, righe.length);
                message(note, 'Importo… ' + fatti + ' di ' + righe.length, '');
              });
            });
          }, Promise.resolve()).then(function () {
            message(note, 'Fatto: ' + creati + ' schede nuove su ' + righe.length + ' (le altre c\'erano già).', 'ok');
          });
        }).catch(function (err) {
          message(note, err instanceof SyntaxError ? 'Il file non è un JSON valido.' : err.message, 'error');
        }).then(function () {
          btn.removeAttribute('aria-disabled');
          note.focus();
        });
      });
    });
  }

  function initPlaceState() {
    var form = $('state-form');
    var select = form.elements.luogo;
    var STATI = { pubblicato: 'pubblicata', 'in-revisione': 'in revisione', archiviato: 'archiviata' };
    api.allPlacesForModeration().then(function (rows) {
      select.textContent = '';
      select.appendChild(el('option', { value: '', text: 'Scegli una scheda…' }));
      rows.forEach(function (p) {
        select.appendChild(el('option', { value: p.id, text: p.nome + ', ' + p.citta + ' (' + (STATI[p.stato] || p.stato) + ')' }));
      });
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      if (showErrors(form, select.value ? [] : [{ input: select, text: 'Scegli la scheda da cambiare.' }])) return;
      var stato = form.querySelector('input[name="stato"]:checked').value;
      busy(form, true, 'Salvataggio…');
      api.setPlaceState(select.value, stato).then(function () {
        busy(form, false);
        var opt = select.options[select.selectedIndex];
        opt.textContent = opt.textContent.replace(/\([^)]*\)$/, '(' + STATI[stato] + ')');
        message($('state-note'), 'Scheda ora ' + STATI[stato] + '.', 'ok');
      }).catch(function (err) {
        busy(form, false);
        message($('state-note'), err.message, 'error');
      });
    });
  }

  A.pagine.moderazione = initModerazione;
})();
