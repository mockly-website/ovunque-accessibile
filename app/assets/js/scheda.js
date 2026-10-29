/* Ovunque Accessibile – web-app, scheda del luogo (luogo.html): preferiti, avvisi, «Ci sei stato?», recensioni, titolare.
   Si carica dopo app.js, che dà le utilità comuni (window.OAApp); si aggancia alla scheda con OA.config.onDetail. */
(function () {
  'use strict';

  var OA = window.OA;
  var api = window.OAApi;
  var el = OA.el;
  var icon = OA.icon;
  var A = window.OAApp;
  var $ = A.$;
  var DOMANDE = A.DOMANDE;
  var answersNode = A.answersNode;
  var busy = A.busy;
  var dateIt = A.dateIt;
  var goLogin = A.goLogin;
  var here = A.here;
  var isBusy = A.isBusy;
  var message = A.message;
  var params = A.params;
  var preparePhoto = A.preparePhoto;
  var show = A.show;
  var showErrors = A.showErrors;

  /* ---------- Scheda luogo: preferiti, avvisi, recensioni, gestori ---------- */

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* «Ci sei stato?»: fino a tre domande veloci su quello che manca (gradini e rampa, porta, bagno). Le risposte
     diventano una proposta di correzione come le altre: la scheda attuale con solo quei valori cambiati, che i
     moderatori vedono con le differenze evidenziate e approvano. */
  function initVeloce(p) {
    var box = $('veloce');
    var form = $('veloce-form');
    if (!box || !form) return;
    var manca = OA.mancanti(p);
    if (!manca.length) return;
    show(box, true);
    if (!api.user()) {
      show(form, false);
      show($('veloce-login'), true);
      $('veloce-login-link').href = 'accedi.html?torna=' + encodeURIComponent(here() + '#veloce');
      return;
    }
    function radios(id, legend, opts) {
      return el('fieldset', { className: 'group', id: id }, [el('legend', { className: 'field__label', text: legend })].concat(opts.map(function (o, i) {
        return el('div', { className: 'radio' }, [
          el('input', { type: 'radio', id: id + '-' + i, name: id, value: o[0] }),
          el('label', { 'for': id + '-' + i, text: o[1] })
        ]);
      })));
    }
    function numero(id, label, help, min, max) {
      return el('div', { className: 'field field--short' }, [
        el('label', { className: 'field__label', 'for': id, text: label }),
        el('p', { className: 'field__help', id: id + '-aiuto', text: help }),
        el('input', { className: 'input', type: 'number', id: id, name: id, min: String(min), max: String(max), inputmode: 'numeric', 'aria-describedby': id + '-aiuto' })
      ]);
    }
    var rampa = null;
    if (manca.indexOf('gradini') !== -1) {
      form.appendChild(numero('v-gradini', 'Quanti gradini ci sono per entrare?', 'Scrivi 0 se non ce ne sono.', 0, 100));
      rampa = radios('v-rampa', 'C\'è una rampa?', [['true', 'Sì'], ['false', 'No']]);
      show(rampa, false);
      form.appendChild(rampa);
      $('v-gradini').addEventListener('input', function () { show(rampa, Number(this.value) > 0); });
    }
    if (manca.indexOf('porta') !== -1) {
      form.appendChild(numero('v-porta', 'Quanto è larga la porta d\'ingresso? (cm)', 'Lo spazio libero quando è aperta, se l\'hai misurato.', 40, 300));
    }
    if (manca.indexOf('bagno') !== -1) {
      form.appendChild(radios('v-bagno', 'C\'è un bagno accessibile?', [['attrezzato', 'Sì, attrezzato'], ['non-attrezzato', 'C\'è, ma non è attrezzato'], ['assente', 'No'], ['non-previsto', 'Qui non c\'è un bagno']]));
    }
    form.appendChild(el('button', { className: 'btn btn--primary', type: 'submit', text: 'Invia le risposte' }));

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var f = form.elements;
      var errors = [];
      var d = {
        nome: p.nome, categoria: p.categoria, indirizzo: p.indirizzo, cap: p.cap || null, citta: p.citta,
        provincia: p.provincia || null, regione: p.regione || null, lat: p.lat, lng: p.lng, descrizione: p.descrizione || null,
        misure: JSON.parse(JSON.stringify(p.misure || {})), facoltativi: JSON.parse(JSON.stringify(p.facoltativi || {})),
        dettagli: JSON.parse(JSON.stringify(p.dettagli || {}))
      };
      var ing = d.misure.ingresso = d.misure.ingresso || {};
      d.misure.bagno = d.misure.bagno || {};
      var risposte = 0;
      if (f['v-gradini'] && f['v-gradini'].value !== '') {
        var g = Number(f['v-gradini'].value);
        if (!Number.isInteger(g) || g < 0 || g > 100) errors.push({ input: f['v-gradini'], text: 'Scrivi un numero di gradini da 0 a 100.' });
        else {
          ing.gradini = g;
          risposte++;
          if (g === 0) { ing.gradino_cm = null; ing.corrimano = null; }
          var r = form.querySelector('input[name="v-rampa"]:checked');
          if (g > 0 && r) { ing.rampa = r.value === 'true'; if (!ing.rampa) ing.rampa_pendenza = null; }
        }
      }
      if (f['v-porta'] && f['v-porta'].value !== '') {
        var c = Number(f['v-porta'].value);
        if (!(c >= 40 && c <= 300)) errors.push({ input: f['v-porta'], text: 'Scrivi una larghezza tra 40 e 300 cm.' });
        else { ing.porta_cm = Math.round(c); risposte++; }
      }
      var b = form.querySelector('input[name="v-bagno"]:checked');
      if (b) { d.misure.bagno.valore = b.value; risposte++; }
      if (!errors.length && !risposte) errors.push({ input: form.querySelector('input'), text: 'Rispondi ad almeno una domanda.' });
      if (showErrors(form, errors)) return;
      busy(form, true, 'Invio…');
      api.propose({ tipo: 'correzione', place_id: p.id, dati: d, nota: 'Risposte veloci dalla scheda' }).then(function () {
        show(form, false);
        message($('veloce-note'), 'Grazie! Controlliamo le risposte e aggiorniamo la scheda. Le trovi nel tuo profilo, in «Le tue segnalazioni».', 'ok');
        $('veloce-note').focus();
      }).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: form.querySelector('input'), text: err.message }]);
      });
    });
  }

  function initDetailExtras(p) {
    initVeloce(p);
    var favBtn = $('fav-toggle');
    var favStatus = $('fav-status');
    var saved = false;

    function paintFav() {
      favBtn.setAttribute('aria-pressed', saved ? 'true' : 'false');
      favBtn.querySelector('[data-fav-label]').textContent = saved ? 'Nei preferiti' : 'Salva nei preferiti';
    }
    if (favBtn) {
      api.favorites().then(function (ids) { saved = ids.indexOf(p.id) !== -1; paintFav(); }).catch(function () {});
      favBtn.addEventListener('click', function () {
        if (!api.user()) return goLogin();
        var next = !saved;
        api.setFavorite(p.id, next).then(function () {
          saved = next;
          paintFav();
          favStatus.textContent = next ? p.nome + ' aggiunto ai preferiti.' : p.nome + ' tolto dai preferiti.';
        }).catch(function (err) { favStatus.textContent = err.message; });
      });
    }

    var gallery = $('photos-list');
    if (gallery) {
      api.placePhotos(p.id).then(function (rows) {
        gallery.textContent = '';
        show($('photos-card'), rows.length > 0);
        rows.forEach(function (f) {
          gallery.appendChild(el('li', {}, [el('figure', { className: 'photo' }, [
            el('img', { src: f.url, alt: f.alt, loading: 'lazy', decoding: 'async' }),
            el('figcaption', { text: 'Foto di ' + (f.autore_nome || 'un utente') })
          ])]));
        });
      }).catch(function () { show($('photos-card'), false); });
    }

    /* Chi guarda: moderatore? gestore riconosciuto del luogo? */
    Promise.all([
      api.profile().catch(function () { return null; }),
      api.ownerStatus ? api.ownerStatus(p.id).catch(function () { return null; }) : null
    ]).then(function (r) {
      var who = { mod: !!(r[0] && r[0].ruolo !== 'utente'), owner: r[1], gestore: !!(r[1] && r[1].stato === 'approvato') };
      initAlerts(p, who);
      initReviews(p, who);
      initOwner(p, who);
    });
  }

  /* Avvisi temporanei: elenco, «È risolto» per chi l'ha scritto, «Togli» per i moderatori, modulo per chi è registrato */
  function initAlerts(p, who) {
    var list = $('alerts-list');
    var note = $('alerts-note');
    var form = $('alert-form');
    if (!list) return;

    function load() {
      api.alerts(p.id).then(function (res) {
        list.textContent = '';
        res.list.forEach(function (a) {
          var mine = res.mine.indexOf(a.id) !== -1;
          var titolo = OA.AVVISI[a.tipo] || OA.AVVISI.altro;
          var btn = null;
          if (mine || who.mod) {
            btn = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [
              document.createTextNode(mine ? 'È risolto' : 'Togli l\'avviso'),
              el('span', { className: 'visually-hidden', text: ': ' + titolo })
            ]);
            btn.addEventListener('click', function () {
              api.closeAlert(a.id, mine ? 'risolto' : 'rimosso').then(function () {
                message(note, mine ? 'Grazie: avviso segnato come risolto.' : 'Avviso tolto.', 'ok');
                note.focus();
                load();
              }).catch(function (err) { message(note, err.message, 'error'); note.focus(); });
            });
          }
          list.appendChild(el('li', { className: 'alert-item' }, [
            icon('#icon-alert', 'alert-item__icon'),
            el('div', { className: 'alert-item__body' }, [
              el('p', { className: 'alert-item__title', text: titolo }),
              a.testo ? el('p', { className: 'alert-item__text', text: a.testo }) : null,
              el('p', { className: 'alert-item__meta', text: 'Segnalato da ' + (a.autore_nome || 'un utente') + ' il ' + dateIt(a.created_at) +
                ' · ' + (a.scade_il === today() ? 'vale solo oggi' : 'fino al ' + dateIt(a.scade_il)) })
            ]),
            btn
          ]));
        });
      }).catch(function () { list.textContent = ''; });
    }
    load();

    var logged = !!api.user();
    show($('alert-new'), logged);
    show($('alert-login'), !logged);
    $('alert-login-link').href = 'accedi.html?torna=' + encodeURIComponent(here());
    if (!logged || !form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var f = form.elements;
      var testo = f.testo.value.trim();
      if (showErrors(form, testo.length > 300 ? [{ input: f.testo, text: 'I dettagli possono avere al massimo 300 caratteri.' }] : [])) return;
      busy(form, true, 'Pubblicazione…');
      api.addAlert({ place_id: p.id, tipo: f.tipo.value, testo: testo, giorni: Number(f.durata.value) }).then(function () {
        busy(form, false);
        form.reset();
        $('alert-new').open = false;
        message(note, 'Avviso pubblicato. Grazie: chi arriva oggi lo sa prima di partire.', 'ok');
        note.focus();
        load();
      }).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: f.tipo, text: err.message }]);
      });
    });
  }

  /* «Cosa dicono i visitatori»: per ogni domanda, quanti hanno risposto sì */
  function summaryNode(rows) {
    var items = DOMANDE.map(function (d) {
      var risp = rows.map(function (r) { return r.risposte && r.risposte[d[0]]; }).filter(function (v) { return v === 'si' || v === 'no'; });
      if (!risp.length) return null;
      var si = risp.filter(function (v) { return v === 'si'; }).length;
      var st = si === risp.length ? 'si' : si === 0 ? 'no' : 'parziale';
      /* Il numero dice già tutto: icona decorativa, niente «Sì:» o «No:» letto prima */
      return el('li', {}, [el('span', { className: 'status status--' + st }, [icon(OA.ICONA_STATO[st]), el('span', { text: d[2] + ': sì per ' + si + ' su ' + risp.length })])]);
    }).filter(Boolean);
    if (!items.length) return null;
    return el('div', { className: 'review-summary' }, [
      el('h3', { className: 'review-summary__title', text: 'Cosa dicono i visitatori' }),
      el('ul', { className: 'review-summary__list', role: 'list' }, items)
    ]);
  }

  function initReviews(p, who) {
    var list = $('reviews-list');
    var summaryBox = null;

    function replyBox(r) {
      var box = el('div', { className: 'review__reply-box' });
      if (r.risposta) {
        box.appendChild(el('div', { className: 'review__reply' }, [
          el('p', { className: 'review__reply-title', text: 'Risposta del gestore' + (r.risposta_at ? ' · ' + dateIt(r.risposta_at) : '') }),
          el('p', { text: r.risposta })
        ]));
      }
      if (!who.gestore && !(who.mod && r.risposta)) return box;
      var toggle = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [
        document.createTextNode(who.gestore ? (r.risposta ? 'Modifica la risposta' : 'Rispondi') : 'Togli la risposta'),
        el('span', { className: 'visually-hidden', text: ' alla recensione di ' + (r.autore_nome || 'un utente') })
      ]);
      box.appendChild(toggle);
      var status = el('p', { className: 'notice', role: 'status', tabindex: '-1', hidden: '' });
      box.appendChild(status);
      if (!who.gestore) {
        toggle.addEventListener('click', function () {
          api.replyReview(r.id, '').then(loadReviews).catch(function (err) { message(status, err.message, 'error'); status.focus(); });
        });
        return box;
      }
      var id = 'reply-' + r.id;
      var form = el('form', { className: 'stack review__reply-form', hidden: '', novalidate: '' }, [
        el('div', { className: 'field' }, [
          el('label', { className: 'field__label', 'for': id, text: 'La tua risposta, come gestore' }),
          el('p', { className: 'field__help', id: id + '-aiuto', text: 'Si vede subito sotto la recensione. Da 2 a 1000 caratteri: ringrazia, spiega cosa è cambiato. Niente dati personali.' }),
          el('textarea', { className: 'input', id: id, name: 'risposta', rows: '3', maxlength: '1000', 'aria-describedby': id + '-aiuto' })
        ]),
        el('div', { className: 'decision__actions' }, [
          el('button', { type: 'submit', className: 'btn btn--primary btn--small', text: 'Pubblica la risposta' }),
          r.risposta ? el('button', { type: 'button', className: 'btn btn--secondary btn--small', 'data-remove': '', text: 'Togli la risposta' }) : null
        ])
      ]);
      form.elements.risposta.value = r.risposta || '';
      box.appendChild(form);
      toggle.addEventListener('click', function () {
        form.hidden = !form.hidden;
        if (!form.hidden) form.elements.risposta.focus();
      });
      function send(text) {
        if (isBusy(form)) return;
        busy(form, true, 'Invio…');
        api.replyReview(r.id, text).then(loadReviews).catch(function (err) {
          busy(form, false);
          showErrors(form, [{ input: form.elements.risposta, text: err.message }]);
        });
      }
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = form.elements.risposta.value.trim();
        if (showErrors(form, v.length < 2 ? [{ input: form.elements.risposta, text: 'Scrivi almeno 2 caratteri.' }] : [])) return;
        send(v);
      });
      var rm = form.querySelector('[data-remove]');
      if (rm) rm.addEventListener('click', function () { send(''); });
      return box;
    }

    function loadReviews() {
      api.reviews(p.id).then(function (rows) {
        list.textContent = '';
        if (summaryBox) summaryBox.remove();
        summaryBox = summaryNode(rows);
        if (summaryBox) list.parentNode.insertBefore(summaryBox, list);
        /* lo stesso riepilogo anche in «In breve», in cima alla scheda */
        var sv = $('summary-visitors');
        if (sv) {
          sv.textContent = '';
          if (summaryBox) sv.appendChild(summaryBox.cloneNode(true));
        }
        show($('reviews-empty'), !rows.length);
        rows.forEach(function (r) {
          list.appendChild(el('li', {}, [
            el('article', { className: 'review review--real' }, [
              el('div', { className: 'review__head' }, [
                el('span', { className: 'review__avatar', 'aria-hidden': 'true', text: (r.autore_nome || '?').charAt(0).toUpperCase() }),
                el('strong', { text: r.autore_nome }),
                el('span', { className: 'pill', text: OA.ESIGENZE[r.esigenza] ? OA.ESIGENZE[r.esigenza].nome : '' }),
                el('span', { className: 'review__date', text: r.data_visita ? '· visita del ' + dateIt(r.data_visita) : '· ' + dateIt(r.created_at) })
              ]),
              answersNode(r.risposte),
              r.testo ? el('p', { className: 'review__text', text: r.testo }) : null,
              replyBox(r)
            ])
          ]));
        });
      }).catch(function () {
        list.textContent = '';
        message($('reviews-note'), 'Non siamo riusciti a caricare le recensioni.', 'error');
      });
    }
    if (list) loadReviews();

    var form = $('review-form');
    if (!form) return;
    var logged = !!api.user();
    show(form, logged);
    show($('review-login'), !logged);
    $('review-login-link').href = 'accedi.html?torna=' + encodeURIComponent(here());

    /* Domande guidate: Sì / No / Non so (per il bagno anche «Non l'ho usato») */
    var qBox = $('review-questions');
    if (qBox && !qBox.childNodes.length) {
      qBox.appendChild(el('p', { className: 'field__help', text: 'Rispondi solo a quello che sai: le risposte di tutti diventano il riepilogo «Cosa dicono i visitatori».' }));
      DOMANDE.forEach(function (d) {
        var gid = 'q-' + d[0];
        var opts = [['si', 'Sì'], ['no', 'No']].concat(d[3] ? [['non-usato', 'Non l\'ho usato']] : []).concat([['', 'Non so']]);
        qBox.appendChild(el('fieldset', { className: 'group group--inline', id: gid }, [
          el('legend', { className: 'field__label', text: d[1] })
        ].concat(opts.map(function (o, i) {
          var attrs = { type: 'radio', id: gid + '-' + i, name: gid, value: o[0] };
          if (o[0] === '') attrs.checked = '';
          return el('div', { className: 'radio' }, [el('input', attrs), el('label', { 'for': gid + '-' + i, text: o[1] })]);
        }))));
      });
    }

    form.elements.esigenza.value = OA.esigenza();
    form.elements.data_visita.max = new Date().toISOString().slice(0, 10);
    var counter = $('review-counter');
    form.elements.testo.addEventListener('input', function () {
      counter.textContent = form.elements.testo.value.length + ' / 2000';
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var f = form.elements;
      var testo = f.testo.value.trim();
      var risposte = {};
      DOMANDE.forEach(function (d) {
        var c = form.querySelector('input[name="q-' + d[0] + '"]:checked');
        if (c && c.value) risposte[d[0]] = c.value;
      });
      var answered = Object.keys(risposte).length > 0;
      var errors = [];
      if (!answered && !testo) errors.push({ input: f.testo, text: 'Rispondi ad almeno una domanda o racconta com\'è andata.' });
      else if (testo && testo.length < 20) errors.push({ input: f.testo, text: 'Racconta un po\' di più: servono almeno 20 caratteri (oppure lascia vuoto e rispondi solo alle domande).' });
      if (f.data_visita.value && f.data_visita.value > f.data_visita.max) errors.push({ input: f.data_visita, text: 'La data della visita non può essere nel futuro.' });
      if (showErrors(form, errors)) return;
      busy(form, true, 'Invio…');
      api.addReview({ place_id: p.id, esigenza: f.esigenza.value, data_visita: f.data_visita.value || null, testo: testo, risposte: risposte }).then(function () {
        busy(form, false);
        form.reset();
        f.esigenza.value = OA.esigenza();
        counter.textContent = '0 / 2000';
        var note = $('reviews-note');
        message(note, 'Grazie! La recensione sarà visibile dopo il controllo dei moderatori. La trovi nel tuo profilo.', 'ok');
        /* Scheda sbagliata: subito il link per correggerla */
        if (risposte.scheda_giusta === 'no') {
          note.appendChild(document.createTextNode(' Hai trovato informazioni diverse dalla scheda: '));
          note.appendChild(el('a', { href: 'segnala.html?id=' + encodeURIComponent(p.id), text: 'proponi una correzione' }));
          note.appendChild(document.createTextNode('.'));
        }
        note.focus();
      }).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: f.testo, text: err.message }]);
      });
    });
  }

  /* Gestori: richiesta, stato della richiesta, bollino per la vetrina (solo luoghi verificati sul posto) */
  function initOwner(p, who) {
    var card = $('owner-card');
    if (!card) return;
    var note = $('owner-note');
    var sulPosto = p.verifica && p.verifica.livello === 'sul-posto';
    $('badge-link').href = 'bollino.html?id=' + encodeURIComponent(p.id);
    $('badge-link').lastChild.textContent = sulPosto ? 'Bollino per la vetrina' : 'Scarica il codice QR per la vetrina';
    $('badge-link').querySelector('use').setAttribute('href', sulPosto ? '#icon-shield' : '#icon-qr');
    show($('owner-badge'), who.gestore || who.mod);
    var jump = $('owner-jump');
    var g = who.owner;

    /* «Sei il titolare?» in cima alla scheda: porta al riquadro in fondo e apre la richiesta */
    function goToCard() {
      var form = $('owner-new');
      if (!form.hidden) form.open = true;
      card.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      var target = !form.hidden ? $('o-titolare') : (!$('owner-login').hidden ? $('owner-login-link') : $('owner-title'));
      if (target === $('owner-title') && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
    if (jump) {
      if (g && g.stato === 'approvato') {
        jump.href = 'locali.html?id=' + encodeURIComponent(p.id);
        jump.lastChild.textContent = ' Il tuo locale ';
      } else {
        jump.addEventListener('click', function (ev) { ev.preventDefault(); goToCard(); });
      }
    }
    /* Arrivo da «Per i locali → Gestisci»: dopo un attimo (foto, recensioni e mappa spostano la scheda) */
    if (params.get('gestisci')) setTimeout(goToCard, 600);

    if (!api.user()) {
      show($('owner-login'), true);
      $('owner-login-link').href = 'accedi.html?torna=' + encodeURIComponent(here());
      return;
    }
    if (!g) {
      show($('owner-new'), true);
    } else if (g.stato === 'approvato') {
      $('owner-title').textContent = 'Sei il gestore di questo luogo';
      $('owner-intro').textContent = 'Puoi rispondere alle recensioni qui sopra. Se qualcosa cambia (una rampa nuova, un bagno rifatto), proponi una correzione: la controlliamo e aggiorniamo la scheda.' +
        (sulPosto ? '' : ' Puoi già scaricare il codice QR con il nostro logo da mettere in vetrina o sui social; dopo la verifica sul posto diventa il bollino «Verificato sul posto».');
      $('owner-intro').after(el('p', {}, [el('a', { href: 'locali.html?id=' + encodeURIComponent(p.id), text: sulPosto ? 'I tuoi locali e la verifica sul posto' : 'Richiedi la verifica sul posto' })]));
    } else if (g.stato === 'in-attesa') {
      message(note, 'La tua richiesta è in attesa: ti contatteremo al recapito che hai indicato per confermare.', '');
    } else {
      message(note, 'La richiesta non è stata approvata.' + (g.motivo ? ' Motivo: ' + g.motivo : '') + ' Per chiarimenti scrivi a ovunqueaccessibile@gmail.com.', 'error');
    }

    /* Richiesta: nome e cognome del titolare, telefono, email e foto dell'ingresso (ricompressa: niente GPS) */
    var form = $('owner-form');
    var fotoIn = $('o-foto');
    var anteprima = $('o-foto-anteprima');
    if (api.user() && api.user().email && !form.elements.email.value) form.elements.email.value = api.user().email;
    fotoIn.addEventListener('change', function () {
      var file = fotoIn.files && fotoIn.files[0];
      if (anteprima.src) URL.revokeObjectURL(anteprima.src);
      if (!file) { show(anteprima, false); anteprima.removeAttribute('src'); return; }
      anteprima.src = URL.createObjectURL(file);
      show(anteprima, true);
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var f = form.elements;
      var titolare = f.titolare.value.trim().replace(/\s+/g, ' ');
      var telefono = f.telefono.value.trim();
      var email = f.email.value.trim();
      var file = fotoIn.files && fotoIn.files[0];
      var errors = [];
      if (titolare.length < 3 || titolare.indexOf(' ') < 0) errors.push({ input: f.titolare, text: 'Scrivi nome e cognome del titolare.' });
      if (!/^\+?[0-9 .\/()-]{6,25}$/.test(telefono) || telefono.replace(/[^0-9]/g, '').length < 6) errors.push({ input: f.telefono, text: 'Scrivi un numero di telefono valido, per esempio 070 123 4567.' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push({ input: f.email, text: 'Scrivi un indirizzo email valido, per esempio nome@esempio.it.' });
      if (!file) errors.push({ input: fotoIn, text: 'Aggiungi una foto dell\'ingresso del locale.' });
      else if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) errors.push({ input: fotoIn, text: 'Il file deve essere una foto (JPEG, PNG, WebP o HEIC).' });
      if (showErrors(form, errors)) return;
      busy(form, true, 'Invio…');
      preparePhoto(file, 1600).then(function (blob) {
        return api.requestOwner({ place_id: p.id, ruolo: f.ruolo.value, titolare: titolare, telefono: telefono, email: email, nota: null }, blob);
      }).then(function () {
        show($('owner-new'), false);
        message(note, 'Richiesta inviata. La controlliamo e ti chiamiamo al ' + telefono + ' per confermare. Appena la approviamo, qui trovi il codice QR per la vetrina.', 'ok');
        note.focus();
      }).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: file ? f.titolare : fotoIn, text: err.message }]);
      });
    });
  }

  OA.config.onDetail = initDetailExtras;
})();
