/* Ovunque Accessibile – web-app.
   Usa il codice comune del sito (window.OA, ../assets/js/oa-core.js) e i dati di window.OAApi (api.js).
   Ogni pagina ha <body data-page="…">: mappa, luogo, accedi, registrati, password, segnala, profilo, moderazione, privacy.
   Tutti i testi arrivati dal database entrano nel DOM con textContent, mai con innerHTML.
   Indice: 1. Utilità · 2. Moduli e errori · 3. Avvio comune · 4. Accesso e registrazione
           5. Scheda luogo (preferiti, recensioni) · 6. Segnala un luogo · 7. Profilo · 8. Moderazione */
(function () {
  'use strict';

  var OA = window.OA;
  var api = window.OAApi;
  var el = OA.el;
  var icon = OA.icon;
  var page = document.body.getAttribute('data-page');
  var params = new URLSearchParams(location.search);
  var MIN_PASSWORD = 10;

  /* ---------- 1. Utilità ---------- */
  function $(id) {
    return document.getElementById(id);
  }

  function show(node, visible) {
    if (node) node.hidden = !visible;
  }

  /* Solo pagine dell'app come destinazione dopo l'accesso: niente redirect verso altri siti */
  function safeReturn(v) {
    return v && /^[a-z-]+\.html(\?[A-Za-z0-9=&%._-]*)?$/.test(v) ? v : null;
  }

  function here() {
    return location.pathname.split('/').pop() + location.search;
  }

  function goLogin() {
    location.href = 'accedi.html?torna=' + encodeURIComponent(safeReturn(here()) || 'profilo.html');
  }

  function focusHeading(node) {
    if (!node) return;
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
    node.focus();
  }

  function message(node, text, kind) {
    if (!node) return;
    node.textContent = text || '';
    node.className = 'notice' + (kind ? ' notice--' + kind : '');
    node.hidden = !text;
  }

  function dateIt(iso) {
    return iso ? OA.formatDate(String(iso).slice(0, 10)) : '';
  }

  /* Durante l'invio il pulsante resta attivo (non perde il focus) ma un secondo invio viene ignorato */
  function busy(form, on, label) {
    var btn = form.querySelector('[type="submit"]');
    form.dataset.busy = on ? '1' : '';
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || 'Attendi…';
      btn.setAttribute('aria-disabled', 'true');
    } else {
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
      btn.removeAttribute('aria-disabled');
    }
  }

  function isBusy(form) {
    return form.dataset.busy === '1';
  }

  var STATO_PROPOSTA = { 'in-attesa': 'In attesa di controllo', approvata: 'Approvata', respinta: 'Non approvata' };
  var STATO_RECENSIONE = { 'in-attesa': 'In attesa di controllo', pubblicata: 'Pubblicata', respinta: 'Non pubblicata' };

  function statePill(stato, labels) {
    return el('span', { className: 'pill state-pill state-pill--' + stato, text: labels[stato] || stato });
  }

  /* ---------- 2. Moduli: errori accessibili (riepilogo + messaggio accanto al campo) ---------- */
  function clearErrors(form) {
    [].forEach.call(form.querySelectorAll('[aria-invalid="true"]'), function (f) { f.removeAttribute('aria-invalid'); });
    [].forEach.call(form.querySelectorAll('.field__error'), function (p) { p.remove(); });
    var sum = form.querySelector('.error-summary');
    if (sum) sum.remove();
  }

  function fieldError(input, text) {
    var id = (input.id || input.name) + '-errore';
    var p = el('p', { className: 'field__error', id: id }, [icon('#icon-no'), el('span', { text: text })]);
    var anchor = input.closest('fieldset.group') || input.closest('.field') || input;
    for (var d = input.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
    if (input.closest('fieldset.group')) {
      anchor.querySelector('legend').after(p);
      anchor.setAttribute('aria-describedby', ((anchor.getAttribute('aria-describedby') || '') + ' ' + id).trim());
    } else {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', ((input.getAttribute('aria-describedby') || '') + ' ' + id).trim());
      anchor.appendChild(p);
    }
  }

  /* errors: [{ input, text }] → messaggi accanto ai campi e riepilogo in cima, che prende il focus */
  function showErrors(form, errors, title) {
    clearErrors(form);
    if (!errors.length) return false;
    var list = el('ul', {}, errors.map(function (e) {
      fieldError(e.input, e.text);
      var a = el('a', { href: '#' + e.input.id, text: e.text });
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        (e.input.matches('fieldset') ? e.input.querySelector('input') : e.input).focus();
      });
      return el('li', {}, [a]);
    }));
    var box = el('div', { className: 'error-summary', role: 'alert', tabindex: '-1' }, [
      el('h2', { className: 'error-summary__title', text: title || (errors.length === 1 ? 'C\'è un problema da correggere' : 'Ci sono ' + errors.length + ' problemi da correggere') }),
      list
    ]);
    form.insertBefore(box, form.firstChild);
    box.focus();
    return true;
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  function passwordProblem(v) {
    if (v.length < MIN_PASSWORD) return 'La password deve avere almeno ' + MIN_PASSWORD + ' caratteri.';
    if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'La password deve contenere lettere e numeri.';
    return null;
  }

  /* Pulsante "Mostra/Nascondi" accanto a ogni campo password */
  function initPasswordToggles() {
    [].forEach.call(document.querySelectorAll('[data-toggle-password]'), function (btn) {
      var input = $(btn.getAttribute('data-toggle-password'));
      btn.addEventListener('click', function () {
        var visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        btn.setAttribute('aria-pressed', visible ? 'false' : 'true');
        btn.textContent = visible ? 'Mostra' : 'Nascondi';
      });
    });
  }

  /* ---------- 3. Avvio comune ---------- */
  OA.config.loadPlaces = api.listPlaces;
  OA.config.reportHref = function (p) { return 'segnala.html?id=' + encodeURIComponent(p.id); };
  OA.config.onDetail = initDetailExtras;

  function updateChrome() {
    var user = api.user();
    var banner = $('mode-banner');
    if (banner) {
      banner.textContent = api.mode === 'prova'
        ? 'Modalità prova: luoghi di esempio e account finti, salvati solo in questo browser.'
        : 'Versione di prova dell\'app: alcuni luoghi sono ancora esempi.';
    }
    [].forEach.call(document.querySelectorAll('[data-account-link]'), function (a) {
      a.querySelector('[data-account-label]').textContent = user ? 'Profilo' : 'Accedi';
      a.href = user ? 'profilo.html' : 'accedi.html';
    });
  }

  function syncNeeds() {
    return api.profile().catch(function () { return null; }).then(function (prof) {
      if (prof && prof.esigenza && !params.get('per') && prof.esigenza !== OA.scelta()) OA.setEsigenza(prof.esigenza);
      else if (prof && !prof.esigenza && OA.scelta()) api.updateProfile({ esigenza: OA.scelta() }).catch(function () {});
      /* Da qui in poi la scelta «La tua esigenza» viene salvata anche nel profilo */
      OA.onEsigenza(function (e) {
        if (api.user()) api.updateProfile({ esigenza: e }).catch(function () {});
      });
      return prof;
    });
  }

  var PAGES = {
    accedi: initAccedi, registrati: initRegistrati, password: initPassword,
    segnala: initSegnala, profilo: initProfilo, moderazione: initModerazione, bollino: initBollino
  };

  api.ready.then(syncNeeds).then(function () {
    updateChrome();
    api.onAuth(updateChrome);
    initPasswordToggles();
    OA.start();
    if (PAGES[page]) PAGES[page]();
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* l'app funziona anche senza */ });
  }

  /* ---------- 4. Accesso e registrazione ---------- */
  function afterLogin() {
    location.replace(safeReturn(params.get('torna')) || 'profilo.html');
  }

  function initAccedi() {
    var form = $('login-form');
    var note = $('login-note');
    if (api.user()) return afterLogin();
    if (params.get('confermata')) message(note, 'Email confermata. Ora puoi accedere.', 'ok');
    if (params.get('eliminato')) message(note, 'Il tuo account è stato eliminato, insieme a profilo, recensioni e preferiti.', 'ok');
    else if (params.get('torna')) message(note, 'Per continuare accedi al tuo account.');

    var reg = $('signup-link');
    if (reg && params.get('torna')) reg.href = 'registrati.html?torna=' + encodeURIComponent(params.get('torna'));

    if (api.mode === 'prova') {
      show($('demo-login'), true);
      $('demo-user').addEventListener('click', function () { api.signInDemo(false).then(afterLogin); });
      $('demo-mod').addEventListener('click', function () { api.signInDemo(true).then(afterLogin); });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var email = form.elements.email;
      var pw = form.elements.password;
      var errors = [];
      if (!validEmail(email.value.trim())) errors.push({ input: email, text: 'Scrivi un indirizzo email valido, per esempio nome@esempio.it.' });
      if (!pw.value) errors.push({ input: pw, text: 'Scrivi la password.' });
      if (showErrors(form, errors)) return;
      busy(form, true, 'Accesso in corso…');
      api.signIn(email.value.trim(), pw.value).then(afterLogin).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: email, text: err.message }]);
      });
    });
  }

  function initRegistrati() {
    var form = $('signup-form');
    if (api.user()) return afterLogin();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var f = form.elements;
      var nome = f.nome.value.trim();
      var errors = [];
      if (nome.length < 2 || nome.length > 40) errors.push({ input: f.nome, text: 'Il nome pubblico deve avere da 2 a 40 caratteri.' });
      if (!validEmail(f.email.value.trim())) errors.push({ input: f.email, text: 'Scrivi un indirizzo email valido, per esempio nome@esempio.it.' });
      var pwErr = passwordProblem(f.password.value);
      if (pwErr) errors.push({ input: f.password, text: pwErr });
      if (!f.eta.checked) errors.push({ input: f.eta, text: 'Per registrarti devi avere almeno 14 anni.' });
      if (!f.privacy.checked) errors.push({ input: f.privacy, text: 'Per registrarti devi aver letto la privacy dell\'app.' });
      if (showErrors(form, errors)) return;
      busy(form, true, 'Registrazione in corso…');
      api.signUp({ nome: nome, email: f.email.value.trim(), password: f.password.value }).then(function (res) {
        if (!res.confirm) return afterLogin();
        show(form, false);
        $('signup-email').textContent = f.email.value.trim();
        show($('signup-done'), true);
        focusHeading($('signup-done-title'));
      }).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: f.email, text: err.message }]);
      });
    });
  }

  function initPassword() {
    var requestForm = $('reset-form');
    var newForm = $('new-password-form');
    var note = $('password-note');

    if (params.get('nuova')) {
      if (api.user()) {
        show(requestForm, false);
        show(newForm, true);
        $('password-title').textContent = 'Scegli una nuova password';
      } else {
        message(note, 'Il link non è più valido: forse è scaduto o l\'hai aperto in un altro browser. Chiedine uno nuovo qui sotto.', 'error');
      }
    }

    requestForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(requestForm)) return;
      var email = requestForm.elements.email;
      if (showErrors(requestForm, validEmail(email.value.trim()) ? [] : [{ input: email, text: 'Scrivi un indirizzo email valido.' }])) return;
      busy(requestForm, true, 'Invio in corso…');
      api.requestReset(email.value.trim()).then(function () {
        busy(requestForm, false);
        message(note, 'Se l\'indirizzo è registrato, ti abbiamo mandato un\'email con il link per scegliere una nuova password. Controlla anche lo spam.', 'ok');
        note.focus();
      }).catch(function (err) {
        busy(requestForm, false);
        showErrors(requestForm, [{ input: email, text: err.message }]);
      });
    });

    newForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(newForm)) return;
      var pw = newForm.elements.password;
      var problem = passwordProblem(pw.value);
      if (showErrors(newForm, problem ? [{ input: pw, text: problem }] : [])) return;
      busy(newForm, true, 'Salvataggio…');
      api.updatePassword(pw.value).then(function () {
        show(newForm, false);
        message(note, 'Password cambiata. Da ora usa quella nuova per accedere.', 'ok');
        show($('password-done'), true);
        note.focus();
      }).catch(function (err) {
        busy(newForm, false);
        showErrors(newForm, [{ input: pw, text: err.message }]);
      });
    });
  }

  /* ---------- 5. Scheda luogo: preferiti, avvisi, recensioni, gestori ---------- */

  /* Domande guidate delle recensioni: [chiave, domanda, etichetta breve, risposta «non l'ho usato»] */
  var DOMANDE = [
    ['scheda_giusta', 'Le informazioni della scheda erano giuste?', 'Scheda giusta'],
    ['entrato', 'Sei riuscito a entrare senza chiedere aiuto?', 'Entrato senza aiuto'],
    ['personale', 'Il personale è stato disponibile?', 'Personale disponibile'],
    ['bagno', 'Hai potuto usare il bagno?', 'Bagno usabile', true],
    ['tornerei', 'Ci torneresti?', 'Ci tornerebbe']
  ];

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function initDetailExtras(p) {
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

  function answersNode(risposte) {
    var items = DOMANDE.filter(function (d) { return risposte && (risposte[d[0]] === 'si' || risposte[d[0]] === 'no'); });
    if (!items.length) return null;
    return el('ul', { className: 'review__answers', role: 'list' }, items.map(function (d) {
      return el('li', {}, [OA.statusNode([risposte[d[0]] === 'si' ? 'si' : 'no', d[2]])]);
    }));
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
    show($('owner-badge'), sulPosto && (who.gestore || who.mod));

    if (!api.user()) {
      show($('owner-login'), true);
      $('owner-login-link').href = 'accedi.html?torna=' + encodeURIComponent(here());
      return;
    }
    var g = who.owner;
    if (!g) {
      show($('owner-new'), true);
    } else if (g.stato === 'approvato') {
      $('owner-title').textContent = 'Sei il gestore di questo luogo';
      $('owner-intro').textContent = 'Puoi rispondere alle recensioni qui sopra. Se qualcosa cambia (una rampa nuova, un bagno rifatto), proponi una correzione: la controlliamo e aggiorniamo la scheda.' +
        (sulPosto ? '' : ' Il bollino per la vetrina arriva quando verifichiamo il luogo sul posto.');
    } else if (g.stato === 'in-attesa') {
      message(note, 'La tua richiesta è in attesa: ti contatteremo al recapito che hai indicato per confermare.', '');
    } else {
      message(note, 'La richiesta non è stata approvata.' + (g.motivo ? ' Motivo: ' + g.motivo : '') + ' Per chiarimenti scrivi a ovunqueaccessibile@gmail.com.', 'error');
    }

    var form = $('owner-form');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var f = form.elements;
      var contatto = f.contatto.value.trim();
      var errors = [];
      if (contatto.length < 5) errors.push({ input: f.contatto, text: 'Scrivi il telefono o l\'email del locale, così possiamo verificare.' });
      if (showErrors(form, errors)) return;
      busy(form, true, 'Invio…');
      api.requestOwner({ place_id: p.id, ruolo: f.ruolo.value, contatto: contatto, nota: f.nota.value.trim() || null }).then(function () {
        show($('owner-new'), false);
        message(note, 'Richiesta inviata. Ti contatteremo al recapito che hai indicato per confermare che gestisci il luogo.', 'ok');
        note.focus();
      }).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: f.contatto, text: err.message }]);
      });
    });
  }

  /* Bollino per la vetrina: solo luoghi verificati sul posto. Il codice QR apre la scheda (sempre aggiornata). */
  function qrSvg(text, label) {
    var qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    var q = 4;                      /* margine bianco richiesto dai lettori */
    var d = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + q) + ',' + (r + q) + 'h1v1h-1z';
    }
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    svg.setAttribute('shape-rendering', 'crispEdges');
    var bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#ffffff');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#162841');
    svg.appendChild(bg);
    svg.appendChild(path);
    return svg;
  }

  function initBollino() {
    var id = params.get('id');
    var note = $('badge-note');
    if (id) $('badge-back').href = 'luogo.html?id=' + encodeURIComponent(id);
    api.getPlace(id).then(function (p) {
      if (!p) return message(note, 'Luogo non trovato.', 'error');
      if (!p.verifica || p.verifica.livello !== 'sul-posto') {
        return message(note, 'Il bollino è per i luoghi verificati sul posto da noi. «' + p.nome + '» non lo è ancora: scrivici a ovunqueaccessibile@gmail.com per organizzare una verifica.', 'error');
      }
      document.title = 'Bollino: ' + p.nome + ' – Ovunque Accessibile';
      $('badge-place').textContent = p.nome + ', ' + p.citta;
      var list = $('badge-verdicts');
      OA.ORDINE_ESIGENZE.forEach(function (e) {
        var g = OA.giudizio(p, e);
        if (g !== 'si' && g !== 'parziale') return;
        list.appendChild(el('li', { className: 'badge__verdict badge__verdict--' + g }, [
          icon(OA.ESIGENZE[e].icona),
          el('span', { text: OA.ESIGENZE[e].nome + ': ' + OA.GIUDIZIO[g].toLowerCase() })
        ]));
      });
      var url = new URL('luogo.html?id=' + encodeURIComponent(p.id), location.href).href;
      if (window.qrcode) $('badge-qr').appendChild(qrSvg(url, 'Codice QR che apre la scheda di ' + p.nome + ' su Ovunque Accessibile'));
      $('badge-date').textContent = 'Verifica del ' + OA.formatDate(p.verifica.data) + ' · ' + url.replace(/^https?:\/\//, '');
      show($('badge'), true);
      show($('badge-actions'), true);
      $('badge-print').addEventListener('click', function () { window.print(); });
    }).catch(function (err) { message(note, err.message, 'error'); });
  }

  /* ---------- 6. Segnala un luogo / proponi una correzione ----------
     Il modulo nasce da SCHEMA: le stesse etichette servono al confronto nel pannello di moderazione. */
  var REGIONI = ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia', 'Lazio', 'Liguria',
    'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria',
    'Valle d\'Aosta', 'Veneto'];

  /* Altezza del gradino e corrimano servono solo se ci sono gradini */
  function gradiniPresenti(get) {
    var g = get('misure.ingresso.gradini');
    return g == null || g > 0;
  }

  var SCHEMA = [
    { id: 'luogo', title: 'Il luogo', fields: [
      { path: 'nome', label: 'Nome del luogo', type: 'text', required: true, max: 120, autocomplete: 'organization' },
      { path: 'categoria', label: 'Tipo di luogo', type: 'select', required: true, options: Object.keys(OA.CATEGORIE).map(function (k) { return [k, OA.CATEGORIE[k] + ' (' + OA.ESEMPI_CATEGORIE[k] + ')']; }) },
      { path: 'citta', label: 'Città', help: 'Scrivila prima della via: i suggerimenti degli indirizzi saranno di questa città.', type: 'text', required: true, max: 80, autocomplete: 'address-level2' },
      { path: 'indirizzo', label: 'Indirizzo', help: 'Via e numero civico. Mentre scrivi compaiono gli indirizzi suggeriti: scegline uno e il segnaposto va sulla mappa.', type: 'text', required: true, max: 200, autocomplete: 'street-address' },
      { path: 'cap', label: 'CAP', help: 'Si scrive da solo quando scegli l\'indirizzo o il punto sulla mappa.', type: 'text', pattern: '^[0-9]{5}$', patternMsg: 'Il CAP è fatto di 5 cifre.', inputmode: 'numeric', autocomplete: 'postal-code', short: true, more: true },
      { path: 'provincia', label: 'Sigla della provincia', help: 'Due lettere, per esempio RM. Si scrive da sola dal punto sulla mappa.', type: 'text', pattern: '^[A-Za-z]{2}$', patternMsg: 'La provincia è una sigla di 2 lettere, per esempio RM.', upper: true, short: true, more: true },
      { path: 'regione', label: 'Regione', type: 'select', options: REGIONI.map(function (r) { return [r, r]; }), more: true },
      { path: 'descrizione', label: 'Descrizione breve', help: 'Cosa c\'è e come si entra.', type: 'textarea', max: 1000, more: true },
      { path: 'lat', label: 'Latitudine', type: 'number', required: true, min: 35, max: 48, step: 'any', short: true, coord: true },
      { path: 'lng', label: 'Longitudine', type: 'number', required: true, min: 6, max: 19, step: 'any', short: true, coord: true }
    ] },
    { id: 'ingresso', title: 'Ingresso', intro: 'Serve almeno il numero di gradini. Per il resto lascia «Non so» se non lo sai: lo segneremo come «da verificare».', fields: [
      { path: 'misure.ingresso.gradini', label: 'Quanti gradini per entrare?', help: 'Scrivi 0 se non ce ne sono.', type: 'number', required: true, min: 0, max: 100, short: true, warnAbove: [30, 'più di 30 gradini all\'ingresso sono tanti'] },
      { path: 'misure.ingresso.gradino_cm', label: 'Altezza del gradino più alto', unit: 'cm', type: 'number', min: 1, max: 50, short: true, when: gradiniPresenti, warnAbove: [25, 'un gradino più alto di 25 cm è raro'] },
      { path: 'misure.ingresso.corrimano', label: 'Ci sono corrimano?', type: 'tri', when: gradiniPresenti },
      { path: 'misure.ingresso.rampa', label: 'C\'è una rampa?', type: 'tri' },
      { path: 'misure.ingresso.rampa_pendenza', label: 'Com\'è la rampa?', type: 'choice', options: [['lieve', 'Lieve: in carrozzina si sale da soli'], ['media', 'Media: serve un po\' di forza o una spinta'], ['ripida', 'Ripida: difficile anche con aiuto']], showIf: ['misure.ingresso.rampa', true] },
      { path: 'x.nessuna_porta', label: 'Non c\'è una porta (spiaggia, parco, pontile…)', type: 'checkbox' },
      { path: 'misure.ingresso.porta_cm', label: 'Larghezza della porta', help: 'Lo spazio libero quando è aperta.', unit: 'cm', type: 'number', min: 40, max: 300, short: true, showIf: ['x.nessuna_porta', false], warnBelow: [60, 'una porta più stretta di 60 cm è molto stretta'] },
      { path: 'misure.ingresso.nota', label: 'Note sull\'ingresso', type: 'textarea', max: 500, more: true },
      { path: 'misure.ingresso.nota_porta', label: 'Note sulla porta', type: 'textarea', max: 500, showIf: ['x.nessuna_porta', false], more: true }
    ] },
    { id: 'spazi', title: 'Spazi e percorsi', fields: [
      { path: 'misure.spazi.valore', label: 'Gli spazi interni sono accessibili?', type: 'choice', options: [['tutti', 'Sì, tutti'], ['parziale', 'Solo in parte'], ['no', 'No']] },
      { path: 'misure.spazi.nota', label: 'Note su spazi e percorsi', type: 'textarea', max: 500, more: true }
    ] },
    { id: 'piani', title: 'Piani e ascensore', fields: [
      { path: 'misure.piani.valore', label: 'Come si raggiungono i piani?', type: 'choice', options: [['uno', 'È tutto su un piano'], ['ascensore', 'C\'è un ascensore'], ['scale', 'Solo con le scale']] },
      { path: 'x.ascensore_l', label: 'Larghezza della cabina', unit: 'cm', type: 'number', min: 50, max: 400, short: true, showIf: ['misure.piani.valore', 'ascensore'], warnBelow: [70, 'una cabina larga meno di 70 cm è molto piccola'] },
      { path: 'x.ascensore_p', label: 'Profondità della cabina', unit: 'cm', type: 'number', min: 50, max: 400, short: true, showIf: ['misure.piani.valore', 'ascensore'], warnBelow: [70, 'una cabina profonda meno di 70 cm è molto piccola'] },
      { path: 'misure.piani.corrimano_scale', label: 'Le scale hanno il corrimano?', type: 'tri', showIf: ['misure.piani.valore', 'scale'] },
      { path: 'misure.piani.nota', label: 'Note su piani e ascensore', type: 'textarea', max: 500, more: true }
    ] },
    { id: 'bagno', title: 'Bagno', fields: [
      { path: 'misure.bagno.valore', label: 'C\'è un bagno accessibile?', type: 'choice', options: [['attrezzato', 'Sì, attrezzato per persone con disabilità'], ['non-attrezzato', 'C\'è, ma non è attrezzato'], ['assente', 'No, nessun bagno accessibile'], ['non-previsto', 'In questo luogo non è previsto un bagno']] },
      { path: 'misure.bagno.rotazione_cm', label: 'Spazio per girarsi con la carrozzina', help: 'Il diametro del cerchio libero davanti al WC.', unit: 'cm', type: 'number', min: 50, max: 400, short: true, showIf: ['misure.bagno.valore', 'attrezzato'] },
      { path: 'misure.bagno.maniglioni', label: 'Ci sono i maniglioni?', type: 'tri', showIf: ['misure.bagno.valore', 'attrezzato'] },
      { path: 'misure.bagno.nota', label: 'Note sul bagno', type: 'textarea', max: 500, more: true }
    ] },
    { id: 'altre', title: 'Altre informazioni', optional: true, fields: [
      { path: 'facoltativi.porta_tipo', label: 'Com\'è la porta?', type: 'choice', options: [['automatica', 'Automatica'], ['manuale', 'Da aprire a mano'], ['pesante', 'Pesante da aprire']], showIf: ['x.nessuna_porta', false] },
      { path: 'facoltativi.pavimento', label: 'Com\'è il pavimento?', type: 'choice', options: [['liscio', 'Liscio'], ['irregolare', 'Irregolare (sampietrini, legno, sabbia)'], ['ghiaia', 'Ghiaia']] },
      { path: 'facoltativi.sedute', label: 'Ci sono sedute lungo il percorso?', type: 'tri' },
      { path: 'facoltativi.parcheggio.posti', label: 'Ci sono posti auto riservati vicino?', type: 'tri' },
      { path: 'facoltativi.parcheggio.distanza_m', label: 'Distanza del parcheggio dall\'ingresso', unit: 'metri', type: 'number', min: 0, max: 2000, short: true, showIf: ['facoltativi.parcheggio.posti', true] },
      { path: 'facoltativi.parcheggio.nota', label: 'Note sul parcheggio', type: 'textarea', max: 500 },
      { path: 'facoltativi.assistenza.valore', label: 'Il personale offre assistenza?', type: 'tri' },
      { path: 'facoltativi.assistenza.nota', label: 'Note sull\'assistenza', type: 'textarea', max: 500 }
    ] },
    { id: 'sensi', title: 'Vista e udito', optional: true, intro: 'Per chi non vede o non sente bene. Rispondi solo a quello che sai.', fields: [
      { path: 'facoltativi.vista.cane_guida', label: 'I cani guida sono ammessi?', type: 'tri' },
      { path: 'facoltativi.vista.percorso_tattile', label: 'C\'è un percorso tattile (strisce in rilievo sul pavimento)?', type: 'tri' },
      { path: 'facoltativi.vista.mappa_tattile', label: 'C\'è una mappa tattile o un plastico?', type: 'tri' },
      { path: 'facoltativi.vista.accompagnamento', label: 'Il personale accompagna chi non vede?', type: 'tri' },
      { path: 'facoltativi.vista.braille', label: 'Ci sono menu, cartelli o didascalie in Braille?', type: 'tri' },
      { path: 'facoltativi.vista.grandi_caratteri', label: 'Ci sono testi a grandi caratteri?', type: 'tri' },
      { path: 'facoltativi.vista.audioguida', label: 'C\'è un\'audioguida o l\'audiodescrizione?', type: 'tri' },
      { path: 'facoltativi.vista.contrasto', label: 'Gradini e ostacoli sono segnalati con colori a contrasto?', type: 'tri' },
      { path: 'facoltativi.vista.nota', label: 'Note per chi non vede', type: 'textarea', max: 500 },
      { path: 'facoltativi.udito.lis', label: 'Qualcuno del personale conosce la LIS (lingua dei segni italiana)?', type: 'tri' },
      { path: 'facoltativi.udito.scritto', label: 'Si può prenotare o chiedere per scritto (chat, email, SMS)?', type: 'tri' },
      { path: 'facoltativi.udito.anello', label: 'C\'è un anello magnetico per gli apparecchi acustici?', type: 'tri' },
      { path: 'facoltativi.udito.sottotitoli', label: 'Video e spettacoli hanno i sottotitoli?', type: 'tri' },
      { path: 'facoltativi.udito.avvisi_visivi', label: 'Avvisi e allarmi sono anche luminosi o scritti?', type: 'tri' },
      { path: 'facoltativi.udito.nota', label: 'Note per chi non sente', type: 'textarea', max: 500 }
    ] },
    { id: 'dettagli', title: 'Dettagli per tipo di luogo', optional: true, fields: [
      { path: 'dettagli.tavoli_cm', label: 'Altezza dei tavoli', unit: 'cm', type: 'number', min: 40, max: 130, short: true, cat: ['ristorante'] },
      { path: 'dettagli.spazio_gambe', label: 'C\'è spazio per le gambe sotto il tavolo?', type: 'tri', cat: ['ristorante'] },
      { path: 'dettagli.camere_accessibili', label: 'Quante camere accessibili?', type: 'number', min: 0, max: 500, short: true, cat: ['hotel'] },
      { path: 'dettagli.doccia_filo', label: 'Doccia a filo pavimento?', type: 'tri', cat: ['hotel'] },
      { path: 'dettagli.passerella', label: 'Passerella fino all\'acqua?', type: 'tri', cat: ['spiaggia'] },
      { path: 'dettagli.sedia_mare', label: 'Sedia da mare disponibile?', type: 'tri', cat: ['spiaggia'] },
      { path: 'dettagli.posti_carrozzina', label: 'Posti per carrozzina in sala', type: 'number', min: 0, max: 500, short: true, cat: ['cultura'] },
      { path: 'dettagli.accompagnatore_gratis', label: 'Biglietto gratuito per l\'accompagnatore?', type: 'tri', cat: ['cultura', 'museo'] },
      { path: 'dettagli.assistenza_prenotabile', label: 'Assistenza da prenotare?', type: 'tri', cat: ['trasporti'] },
      { path: 'dettagli.preavviso_ore', label: 'Preavviso per l\'assistenza', unit: 'ore', type: 'number', min: 0, max: 168, short: true, cat: ['trasporti'] },
      { path: 'dettagli.ausili_prestito', label: 'Ausili in prestito (es. sedia a rotelle)?', type: 'tri', cat: ['museo', 'parco', 'negozio'] }
    ] }
  ];

  var FIELDS = [];
  var LABELS = {};
  SCHEMA.forEach(function (sec) {
    sec.fields.forEach(function (f) {
      f.section = sec;
      FIELDS.push(f);
      LABELS[f.path] = (sec.id === 'luogo' ? '' : sec.title + ' – ') + f.label.replace(/\?$/, '') + (f.unit ? ' (' + f.unit + ')' : '');
    });
  });
  LABELS['misure.piani.ascensore_cm'] = 'Piani e ascensore – Cabina (larghezza × profondità)';
  LABELS['misure.ingresso.rampa_pct'] = 'Ingresso – Pendenza della rampa (%)';
  /* Testo delle scelte (es. «lieve» → «Lieve: in carrozzina si sale da soli») per il confronto dei moderatori */
  var OPTION_LABELS = {};
  FIELDS.forEach(function (f) {
    if (!f.options) return;
    OPTION_LABELS[f.path] = {};
    f.options.forEach(function (o) { OPTION_LABELS[f.path][o[0]] = o[1]; });
  });
  LABELS['misure.ingresso.porta_cm'] = 'Ingresso – Larghezza della porta (0 = nessuna porta)';

  function fid(path) {
    return 'f-' + path.replace(/\./g, '-');
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    o[parts[parts.length - 1]] = value;
  }

  function fieldNode(f) {
    var id = fid(f.path);
    var helpId = f.help ? id + '-aiuto' : null;
    var label = f.label + (f.unit ? ' (' + f.unit + ')' : '');
    var wrap;

    if (f.type === 'tri' || f.type === 'choice') {
      var opts = f.type === 'tri' ? [['true', 'Sì'], ['false', 'No'], ['', 'Non so']] : f.options.concat([['', 'Non so']]);
      wrap = el('fieldset', { className: 'group' + (f.type === 'tri' ? ' group--inline' : ''), id: id }, [
        el('legend', { className: 'field__label', text: f.label })
      ].concat(opts.map(function (o, i) {
        var oid = id + '-' + i;
        var input = el('input', { type: 'radio', id: oid, name: f.path, value: o[0] });
        if (o[0] === '') input.checked = true;
        return el('div', { className: 'radio' }, [input, el('label', { 'for': oid, text: o[1] })]);
      })));
    } else if (f.type === 'checkbox') {
      wrap = el('div', { className: 'field field--check' }, [
        el('input', { type: 'checkbox', id: id, name: f.path }),
        el('label', { 'for': id, text: f.label })
      ]);
    } else {
      var attrs = { id: id, name: f.path, className: f.type === 'select' ? 'select' : 'input' };
      if (helpId) attrs['aria-describedby'] = helpId;
      if (f.required) attrs.required = '';
      if (f.autocomplete) attrs.autocomplete = f.autocomplete;
      if (f.inputmode) attrs.inputmode = f.inputmode;
      var control;
      if (f.type === 'select') {
        control = el('select', attrs, [el('option', { value: '', text: f.required ? 'Scegli…' : 'Non indicata' })].concat(
          f.options.map(function (o) { return el('option', { value: o[0], text: o[1] }); })));
      } else if (f.type === 'textarea') {
        attrs.rows = '3';
        attrs.maxlength = String(f.max);
        control = el('textarea', attrs);
      } else {
        attrs.type = f.type === 'number' ? 'number' : 'text';
        if (f.type === 'number') {
          attrs.inputmode = f.step === 'any' ? 'decimal' : 'numeric';
          attrs.step = f.step || '1';
          attrs.min = String(f.min);
          attrs.max = String(f.max);
        } else if (f.max) {
          attrs.maxlength = String(f.max);
        }
        control = el('input', attrs);
      }
      wrap = el('div', { className: 'field' + (f.short ? ' field--short' : '') }, [
        el('label', { className: 'field__label', 'for': id }, [
          document.createTextNode(label),
          f.required ? el('span', { className: 'field__req', text: ' (obbligatorio)' }) : null
        ]),
        helpId ? el('p', { className: 'field__help', id: helpId, text: f.help }) : null,
        control
      ]);
    }
    wrap.setAttribute('data-path', f.path);
    return wrap;
  }

  function formValue(form, f) {
    if (f.type === 'tri') {
      var t = form.querySelector('input[name="' + f.path + '"]:checked');
      return !t || t.value === '' ? null : t.value === 'true';
    }
    if (f.type === 'choice') {
      var c = form.querySelector('input[name="' + f.path + '"]:checked');
      return !c || c.value === '' ? null : c.value;
    }
    var input = $(fid(f.path));
    if (f.type === 'checkbox') return input.checked;
    var v = input.value.trim();
    if (f.type === 'number') return v === '' ? null : Number(v.replace(',', '.'));
    if (f.upper) v = v.toUpperCase();
    return v === '' ? null : v;
  }

  function setFormValue(form, f, v) {
    if (f.type === 'tri' || f.type === 'choice') {
      var val = v == null ? '' : String(v);
      var r = form.querySelector('input[name="' + f.path + '"][value="' + CSS.escape(val) + '"]');
      if (r) r.checked = true;
      return;
    }
    var input = $(fid(f.path));
    if (f.type === 'checkbox') input.checked = !!v;
    else input.value = v == null ? '' : String(v);
  }

  /* Campi che compaiono solo se servono (es. pendenza solo se c'è una rampa, dettagli per tipo di luogo) */
  function refreshConditional(form) {
    var cat = formValue(form, FIELDS.filter(function (f) { return f.path === 'categoria'; })[0]);
    FIELDS.forEach(function (f) {
      var node = form.querySelector('[data-path="' + f.path + '"]');
      var visible = true;
      if (f.showIf) {
        var dep = FIELDS.filter(function (g) { return g.path === f.showIf[0]; })[0];
        visible = formValue(form, dep) === f.showIf[1];
      }
      if (f.when) visible = visible && f.when(function (path) { return formValue(form, FIELDS.filter(function (g) { return g.path === path; })[0]); });
      if (f.cat) visible = f.cat.indexOf(cat) !== -1;
      node.hidden = !visible;
    });
    var det = $('sec-dettagli');
    var anyDet = FIELDS.some(function (f) { return f.cat && f.cat.indexOf(cat) !== -1; });
    det.hidden = !anyDet;
    $('sec-dettagli-title').textContent = 'Dettagli: ' + (OA.TITOLO_DETTAGLI[cat] || 'tipo di luogo').toLowerCase();
  }

  function placeToForm(form, p) {
    /* Il percorso tattile prima stava nei dettagli di musei e parchi: ora è una voce di «Vista e udito» */
    var fac = JSON.parse(JSON.stringify(p.facoltativi || {}));
    if (p.dettagli && p.dettagli.percorso_tattile != null && !(fac.vista && fac.vista.percorso_tattile != null)) {
      fac.vista = Object.assign({}, fac.vista, { percorso_tattile: p.dettagli.percorso_tattile });
    }
    var src = {
      nome: p.nome, categoria: p.categoria, indirizzo: p.indirizzo, cap: p.cap, citta: p.citta, provincia: p.provincia,
      regione: p.regione, descrizione: p.descrizione, lat: p.lat, lng: p.lng,
      misure: p.misure, facoltativi: fac, dettagli: p.dettagli || {},
      x: {
        nessuna_porta: p.misure.ingresso.porta_cm === 0,
        ascensore_l: p.misure.piani.ascensore_cm ? p.misure.piani.ascensore_cm[0] : null,
        ascensore_p: p.misure.piani.ascensore_cm ? p.misure.piani.ascensore_cm[1] : null
      }
    };
    FIELDS.forEach(function (f) {
      var v = getPath(src, f.path);
      if (f.path === 'misure.ingresso.porta_cm' && v === 0) v = null;
      setFormValue(form, f, v);
      /* Le tendine con qualcosa di già compilato si aprono, così si vede cosa c'è */
      var d = v != null && v !== '' && v !== false ? form.querySelector('[data-path="' + f.path + '"]').closest('details') : null;
      if (d) d.open = true;
    });
    /* La pendenza misurata in % (schede verificate) resta, finché non si cambia la rampa */
    form.oaKeep = { rampa_pct: p.misure.ingresso.rampa_pct, rampa_pendenza: p.misure.ingresso.rampa_pendenza || null };
  }

  /* Legge il modulo → { dati, errors } nella stessa forma delle schede (proposta_valida nel database) */
  function collect(form) {
    var errors = [];
    var cat = null;
    var out = { misure: { ingresso: {}, spazi: {}, piani: {}, bagno: {} }, facoltativi: {}, dettagli: {} };
    var x = {};
    FIELDS.forEach(function (f) {
      if (f.path === 'categoria') cat = formValue(form, f);
    });
    FIELDS.forEach(function (f) {
      var node = form.querySelector('[data-path="' + f.path + '"]');
      var v = node.hidden ? null : formValue(form, f);
      var input = f.type === 'tri' || f.type === 'choice' ? node : $(fid(f.path));
      if (f.required && (v == null || v === '')) {
        errors.push({ input: input, text: f.coord ? 'Indica la posizione: tocca la mappa o scrivi ' + f.label.toLowerCase() + '.' : 'Compila «' + f.label + '».' });
        return;
      }
      if (f.type === 'number' && v != null) {
        if (isNaN(v) || v < f.min || v > f.max || (f.step !== 'any' && Math.round(v) !== v)) {
          errors.push({ input: input, text: '«' + f.label + '»: scrivi un numero ' + (f.step === 'any' ? '' : 'intero ') + 'tra ' + f.min + ' e ' + f.max + '.' });
          return;
        }
      }
      if (f.pattern && v != null && !new RegExp(f.pattern).test(v)) {
        errors.push({ input: input, text: f.patternMsg });
        return;
      }
      if (f.type === 'text' && v != null && f.path === 'nome' && v.length < 2) {
        errors.push({ input: input, text: 'Il nome deve avere almeno 2 caratteri.' });
        return;
      }
      if (f.cat && f.cat.indexOf(cat) === -1) return;
      if (f.path.indexOf('x.') === 0) x[f.path.slice(2)] = v;
      else setPath(out, f.path, v);
    });

    out.misure.ingresso.porta_cm = x.nessuna_porta ? 0 : (out.misure.ingresso.porta_cm == null ? null : out.misure.ingresso.porta_cm);
    if (x.nessuna_porta) out.misure.ingresso.nota_porta = null;
    var asc = null;
    if (out.misure.piani.valore === 'ascensore' && (x.ascensore_l != null || x.ascensore_p != null)) {
      if (x.ascensore_l == null || x.ascensore_p == null) {
        errors.push({ input: $(fid(x.ascensore_l == null ? 'x.ascensore_l' : 'x.ascensore_p')), text: 'Per la cabina servono sia la larghezza sia la profondità (o nessuna delle due).' });
      } else {
        asc = [x.ascensore_l, x.ascensore_p];
      }
    }
    out.misure.piani.ascensore_cm = asc;
    if (out.misure.piani.valore !== 'scale') out.misure.piani.corrimano_scale = null;
    var keep = form.oaKeep || {};
    out.misure.ingresso.rampa_pct = out.misure.ingresso.rampa === true && keep.rampa_pct != null &&
      (out.misure.ingresso.rampa_pendenza || null) === keep.rampa_pendenza ? keep.rampa_pct : null;
    if (out.misure.ingresso.rampa !== true) out.misure.ingresso.rampa_pendenza = null;
    if (out.misure.ingresso.gradini === 0) {
      out.misure.ingresso.gradino_cm = null;
      out.misure.ingresso.corrimano = null;
    }
    /* Scheda minima: senza almeno una risposta su spazi, piani o bagno la scheda resterebbe vuota */
    if (out.misure.spazi.valore == null && out.misure.piani.valore == null && out.misure.bagno.valore == null) {
      errors.push({ input: form.querySelector('[data-path="misure.spazi.valore"]'), text: 'Rispondi ad almeno una domanda tra «Spazi e percorsi», «Piani e ascensore» e «Bagno»: senza, la scheda resterebbe vuota.' });
    }
    /* Le voci facoltative vuote non si salvano */
    ['parcheggio', 'assistenza', 'vista', 'udito'].forEach(function (k) {
      var o = out.facoltativi[k];
      if (o && Object.keys(o).every(function (kk) { return o[kk] == null; })) delete out.facoltativi[k];
    });
    Object.keys(out.facoltativi).forEach(function (k) { if (out.facoltativi[k] == null) delete out.facoltativi[k]; });
    Object.keys(out.dettagli).forEach(function (k) { if (out.dettagli[k] == null) delete out.dettagli[k]; });
    return { dati: out, errors: errors };
  }

  /* Nessuna esigenza con un giudizio almeno «in parte» (le esigenze di vista e udito senza informazioni non contano) */
  var prove = 0;
  function nessunoPuoEntrare(dati) {
    var p = Object.assign({ id: 'segnalazione-' + (++prove) + '-' + Date.now() }, dati);
    return OA.ORDINE_ESIGENZE.every(function (e) { var g = OA.giudizio(p, e); return g === 'no' || g === 'nv'; });
  }

  /* Valori nei limiti ma insoliti (es. porta di 45 cm): non bloccano, chiedono solo di ricontrollare */
  function unusualValues(form) {
    var out = [];
    FIELDS.forEach(function (f) {
      if (!f.warnAbove && !f.warnBelow) return;
      var node = form.querySelector('[data-path="' + f.path + '"]');
      if (node.hidden) return;
      var v = formValue(form, f);
      if (v == null) return;
      var w = f.warnAbove && v > f.warnAbove[0] ? f.warnAbove : (f.warnBelow && v < f.warnBelow[0] ? f.warnBelow : null);
      if (w) out.push({ input: $(fid(f.path)), text: '«' + f.label + '»: hai scritto ' + v + (f.unit ? ' ' + f.unit : '') + ', ma ' + w[1] + '. È giusto?' });
    });
    return out;
  }

  /* Foto: ricompresse nel browser in JPEG (lato lungo 1600 px). Ridisegnarle su un canvas toglie
     i dati EXIF, compresa la posizione GPS di chi ha scattato. */
  var MAX_FOTO = 5;

  function loadImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('formato')); };
      img.src = url;
    });
  }

  function preparePhoto(file, max) {
    var decode = window.createImageBitmap
      ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return loadImage(file); })
      : loadImage(file);
    return decode.then(function (img) {
      var k = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (res, rej) {
        c.toBlob(function (b) { if (b) res(b); else rej(new Error('formato')); }, 'image/jpeg', 0.82);
      });
    });
  }

  /* Sezione "Foto" del modulo: anteprima, descrizione obbligatoria (testo alternativo), "Togli" */
  function photoSection(box) {
    var chosen = [];
    var list = el('ul', { className: 'photo-picks', role: 'list' });
    var status = el('p', { className: 'visually-hidden', role: 'status' });
    var input = el('input', { type: 'file', id: 'photo-input', className: 'photo-input', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif', multiple: '', 'aria-describedby': 'photo-help' });
    var count = 0;

    function renumber() {
      [].forEach.call(list.children, function (li, i) {
        li.querySelector('label').textContent = 'Cosa si vede nella foto ' + (i + 1) + '?';
        li.querySelector('img').alt = 'Anteprima della foto ' + (i + 1);
        li.querySelector('button .visually-hidden').textContent = ' la foto ' + (i + 1);
      });
      input.disabled = chosen.length >= MAX_FOTO;
    }

    input.addEventListener('change', function () {
      var files = [].slice.call(input.files || []);
      input.value = '';
      var room = MAX_FOTO - chosen.length;
      if (files.length > room) status.textContent = 'Puoi aggiungere al massimo ' + MAX_FOTO + ' foto: ne ho prese ' + room + '.';
      files.slice(0, room).reduce(function (prev, file) {
        return prev.then(function () {
          return preparePhoto(file, api.mode === 'prova' ? 800 : 1600).then(function (blob) {
            var id = 'photo-' + (++count);
            var url = URL.createObjectURL(blob);
            var alt = el('input', { type: 'text', className: 'input', id: id, maxlength: '200', 'aria-describedby': id + '-aiuto' });
            var remove = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [
              icon('#icon-trash'), document.createTextNode('Togli'), el('span', { className: 'visually-hidden' })
            ]);
            var li = el('li', { className: 'photo-pick' }, [
              el('img', { src: url, alt: '', width: '160', height: '120' }),
              el('div', { className: 'field' }, [
                el('label', { className: 'field__label', 'for': id }),
                el('p', { className: 'field__help', id: id + '-aiuto', text: 'Serve a chi non vede la foto. Per esempio: «Rampa a sinistra della porta d\'ingresso».' }),
                alt
              ]),
              remove
            ]);
            var item = { blob: blob, input: alt, li: li };
            chosen.push(item);
            list.appendChild(li);
            remove.addEventListener('click', function () {
              chosen.splice(chosen.indexOf(item), 1);
              URL.revokeObjectURL(url);
              li.remove();
              renumber();
              status.textContent = 'Foto tolta. Foto scelte: ' + chosen.length + '.';
              input.focus();
            });
            renumber();
            status.textContent = 'Foto aggiunta. Foto scelte: ' + chosen.length + ' di ' + MAX_FOTO + '. Scrivi cosa si vede.';
          }).catch(function () {
            status.textContent = 'Non riesco ad aprire «' + file.name + '»: usa una foto JPG o PNG.';
          });
        });
      }, Promise.resolve());
    });

    box.appendChild(el('section', { className: 'card form-section', id: 'sec-foto', 'aria-labelledby': 'sec-foto-title' }, [
      el('h2', { id: 'sec-foto-title', text: 'Foto (facoltative)' }),
      el('p', { className: 'field__help', id: 'photo-help', text: 'Fino a ' + MAX_FOTO + ' foto: ingresso, porta, rampa, bagno. Togliamo noi la posizione GPS dalle foto. Non fotografare persone riconoscibili né targhe. Le foto si vedono solo dopo il controllo dei moderatori.' }),
      el('div', { className: 'field' }, [el('label', { className: 'field__label', 'for': 'photo-input', text: 'Aggiungi foto' }), input]),
      list,
      status
    ]));

    return {
      errors: function () {
        return chosen.filter(function (c) {
          var v = c.input.value.trim();
          return v.length < 5 || v.length > 200;
        }).map(function (c) {
          return { input: c.input, text: 'Descrivi la foto ' + (chosen.indexOf(c) + 1) + ' in almeno 5 caratteri: cosa si vede?' };
        });
      },
      items: function () { return chosen; }
    };
  }

  function initSegnala() {
    var form = $('proposal-form');
    var box = $('proposal-fields');
    var id = params.get('id');
    if (!api.user()) {
      show($('need-login'), true);
      $('need-login-link').href = 'accedi.html?torna=' + encodeURIComponent(here());
      $('need-signup-link').href = 'registrati.html?torna=' + encodeURIComponent(here());
      return;
    }

    SCHEMA.forEach(function (sec) {
      var titleId = 'sec-' + sec.id + '-title';
      var main = sec.fields.filter(function (f) { return !f.more && !f.coord; });
      var more = sec.fields.filter(function (f) { return f.more; });
      var body = [
        sec.intro ? el('p', { className: 'field__help', text: sec.intro }) : null,
        el('div', { className: 'form-grid' }, main.map(fieldNode)),
        more.length ? el('details', { className: 'more' }, [
          el('summary', { className: 'more__toggle', text: sec.id === 'luogo' ? 'Altri dati del luogo: CAP, provincia e regione (si scrivono da soli dal punto sulla mappa), descrizione' : (more.length === 1 ? 'Aggiungi una nota' : 'Aggiungi delle note') }),
          el('div', { className: 'form-grid more__body' }, more.map(fieldNode))
        ]) : null
      ];
      if (sec.id === 'luogo') {
        body.push(el('div', { className: 'pick' }, [
          el('h3', { className: 'pick__title', text: 'Dov\'è l\'ingresso?' }),
          el('p', { className: 'field__help', id: 'pick-help', text: 'Premi «Trova l\'indirizzo sulla mappa»: il segnaposto va sulla via. Se l\'ingresso è da un\'altra parte, tocca la mappa in quel punto (da lontano il primo tocco avvicina la mappa) o trascina il segnaposto. Sei lì? Usa «La mia posizione». Sul telefono la mappa si sposta con due dita.' }),
          el('div', { className: 'pick__actions' }, [
            el('button', { type: 'button', id: 'pick-find', className: 'btn btn--primary btn--small' }, [icon('#icon-search'), el('span', { text: 'Trova l\'indirizzo sulla mappa' })]),
            el('button', { type: 'button', id: 'pick-locate', className: 'btn btn--secondary btn--small' }, [icon('#icon-locate'), el('span', { text: 'La mia posizione' })])
          ]),
          el('p', { id: 'pick-status', className: 'pick__status', role: 'status' }),
          el('div', { id: 'pick-suggest', className: 'pick__suggest', hidden: '' }),
          el('div', { id: 'pick-map', className: 'pick__map', role: 'region', 'aria-label': 'Mappa per indicare la posizione del luogo' }),
          el('div', { className: 'form-grid' }, sec.fields.filter(function (f) { return f.coord; }).map(fieldNode))
        ]));
      }
      /* Le sezioni tutte facoltative sono chiuse in una tendina */
      box.appendChild(sec.optional
        ? el('section', { className: 'card form-section form-section--optional', id: 'sec-' + sec.id, 'aria-labelledby': titleId }, [
            el('details', { className: 'more more--section' }, [
              el('summary', { className: 'more__toggle more__toggle--section' }, [el('span', { id: titleId, text: sec.title }), el('span', { className: 'more__hint', text: ' (facoltative)' })]),
              el('div', { className: 'more__body stack' }, body)
            ])
          ])
        : el('section', { className: 'card form-section', id: 'sec-' + sec.id, 'aria-labelledby': titleId }, [el('h2', { id: titleId, text: sec.title })].concat(body)));
    });
    var photosUi = photoSection(box);
    show(form, true);

    form.addEventListener('change', function (ev) {
      if (ev.target.type !== 'file') refreshConditional(form);
    });
    refreshConditional(form);
    var picker = initPicker(form);

    var place = null;
    var initial = null;
    var ready = Promise.resolve();
    if (id) {
      ready = api.getPlace(id).then(function (p) {
        if (!p) {
          message($('proposal-note'), 'Il luogo da correggere non esiste più. Puoi segnalarlo come luogo nuovo.', 'error');
          return;
        }
        place = p;
        document.title = 'Correzione: ' + p.nome + ' – Ovunque Accessibile';
        $('proposal-title').textContent = 'Proponi una correzione';
        $('proposal-intro').textContent = 'Stai correggendo la scheda di «' + p.nome + '», ' + p.citta + '. Cambia solo quello che non va: i moderatori controllano ogni modifica prima di pubblicarla.';
        placeToForm(form, p);
        refreshConditional(form);
        picker.set(p.lat, p.lng);
        initial = JSON.stringify(collect(form).dati);
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var res = collect(form);
      res.errors = res.errors.concat(photosUi.errors());
      /* Solo luoghi accessibili, almeno in parte, per qualcuno: un luogo nuovo «non accessibile» per tutte e tre
         le esigenze non si segnala (una correzione sì: il moderatore vede che il luogo sparirà dalla mappa) */
      if (!res.errors.length && !place && nessunoPuoEntrare(res.dati)) {
        res.errors.push({ input: form.querySelector('[data-path="misure.ingresso.gradini"]').querySelector('input') || $(fid('misure.ingresso.gradini')),
          text: 'Con queste risposte il luogo non è accessibile per nessuna esigenza. Ovunque Accessibile raccoglie solo luoghi accessibili, almeno in parte: controlla ingresso e spazi interni.' });
      }
      if (!res.errors.length && initial && JSON.stringify(res.dati) === initial && !photosUi.items().length) {
        res.errors.push({ input: $(fid('nome')), text: 'Non hai cambiato niente: modifica le voci che non corrispondono più al luogo.' });
      }
      if (showErrors(form, res.errors)) return;
      /* Valori possibili ma strani: si chiede di controllarli, al secondo invio passano */
      var warns = unusualValues(form);
      var sigW = JSON.stringify(warns.map(function (w) { return w.text; }));
      if (warns.length && form.dataset.warned !== sigW) {
        form.dataset.warned = sigW;
        showErrors(form, warns, warns.length === 1 ? 'Controlla questo valore' : 'Controlla questi valori');
        form.querySelector('.error-summary').appendChild(el('p', { text: 'Se è tutto giusto, premi di nuovo «Invia la segnalazione».' }));
        return;
      }
      var nota = form.elements.nota_moderatori.value.trim() || null;
      busy(form, true, 'Controllo la posizione…');
      var items = photosUi.items();
      var failed = 0;
      var stop = false;
      farFromCity(res.dati).then(function (km) {
        var sigG = [res.dati.lat, res.dati.lng, res.dati.citta, res.dati.cap].join('|');
        if (km && form.dataset.farOk !== sigG) {
          stop = true;
          form.dataset.farOk = sigG;
          busy(form, false);
          showErrors(form, [{ input: $(fid('lat')), text: 'Il punto sulla mappa è a circa ' + km + ' km da ' + res.dati.citta + ': controlla la posizione o il nome della città.' }], 'Controlla la posizione');
          form.querySelector('.error-summary').appendChild(el('p', { text: 'Se il punto è giusto, premi di nuovo «Invia la segnalazione».' }));
          return;
        }
        form.querySelector('[type="submit"]').textContent = 'Invio…';
        return ready.then(function () {
          return api.propose({ tipo: place ? 'correzione' : 'nuovo', place_id: place ? place.id : null, dati: res.dati, nota: nota });
        });
      }).then(function (propostaId) {
        if (stop) return;
        /* Le foto una alla volta, dopo la proposta: se una non passa, la segnalazione resta comunque inviata */
        return items.reduce(function (prev, item, i) {
          return prev.then(function () {
            form.querySelector('[type="submit"]').textContent = 'Invio della foto ' + (i + 1) + ' di ' + items.length + '…';
            return api.uploadPhoto(propostaId, item.blob, item.input.value.trim()).catch(function () { failed++; });
          });
        }, Promise.resolve());
      }).then(function () {
        if (stop) return;
        show(form, false);
        if (failed) message($('proposal-photo-note'), failed === 1 ? 'Una foto non è stata caricata. La segnalazione è arrivata: se vuoi, rimandaci la foto con una correzione.' : failed + ' foto non sono state caricate. La segnalazione è arrivata: se vuoi, rimandaci le foto con una correzione.', 'error');
        show($('proposal-done'), true);
        focusHeading($('proposal-done-title'));
      }).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: $(fid('nome')), text: err.message }]);
      });
    });
  }

  /* Ricerca degli indirizzi con Nominatim (OpenStreetMap): parte solo da un pulsante, dal tocco sulla mappa o dal
     controllo all'invio; invia solo l'indirizzo o il punto del luogo, una richiesta al secondo come chiedono le regole
     d'uso del servizio. undefined = il servizio non risponde, null = non trovato. */
  var GEO_URL = 'https://nominatim.openstreetmap.org/search';
  var GEO_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
  var GEO_MAX_KM = 25;
  var PICK_ZOOM = 15;            /* da questo ingrandimento in su un tocco mette il punto */
  var geoCache = {};
  var geoQueue = Promise.resolve();

  function nominatim(url, q) {
    var key = url + JSON.stringify(q);
    if (geoCache[key]) return geoCache[key];
    var params = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'it', addressdetails: '1' });
    Object.keys(q).forEach(function (k) { if (q[k] != null && q[k] !== '') params.set(k, q[k]); });
    var run = geoQueue.then(function () {
      return fetch(url + '?' + params.toString(), { credentials: 'omit' });
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return undefined; });
    geoQueue = run.then(function () { return new Promise(function (res) { setTimeout(res, 1100); }); });
    geoCache[key] = run;
    run.then(function (v) { if (v === undefined) delete geoCache[key]; });
    return run;
  }

  function geocode(q) {
    return nominatim(GEO_URL, Object.assign({ limit: '1', countrycodes: 'it' }, q)).then(function (a) {
      if (a === undefined) return undefined;
      return a && a[0] ? { lat: Number(a[0].lat), lng: Number(a[0].lon), nome: a[0].display_name, address: a[0].address || {} } : null;
    });
  }

  function reverseGeocode(lat, lng) {
    return nominatim(GEO_REVERSE, { lat: lat.toFixed(6), lon: lng.toFixed(6), zoom: '18' }).then(function (r) {
      if (r === undefined) return undefined;
      return r && r.address && r.address.country_code === 'it' ? r.address : null;
    });
  }

  /* «Sardigna/Sardegna», «Trentino-Alto Adige/Südtirol» → la regione come la scriviamo noi (o null) */
  function regionName(state) {
    var parts = String(state || '').split('/').map(OA.normalize);
    return REGIONI.filter(function (r) {
      var k = OA.normalize(r).slice(0, 6);
      return parts.some(function (x) { return x.indexOf(k) === 0; });
    })[0] || null;
  }

  /* Indirizzo di Nominatim → campi del modulo (via e civico, città, CAP, sigla della provincia, regione) */
  function addressParts(a) {
    var via = a.road || a.pedestrian || a.footway || a.square || a.path || a.cycleway || a.place || '';
    var regione = regionName(a.state);
    var prov = String(a['ISO3166-2-lvl6'] || '').replace(/^IT-/, '');
    return {
      indirizzo: via ? via + (a.house_number ? ' ' + a.house_number : '') : '',
      citta: a.city || a.town || a.village || a.municipality || '',
      cap: /^[0-9]{5}$/.test(a.postcode || '') ? a.postcode : '',
      provincia: /^[A-Z]{2}$/.test(prov) ? prov : '',
      regione: regione
    };
  }

  /* «Via Roma, n. 5» → «Via Roma 5»: Nominatim capisce meglio */
  function cleanStreet(v) {
    return v.replace(/\b(n|nr|num|civico)\.?\s*(?=\d)/gi, '').replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* → null se il punto è vicino alla città (o non si può controllare), altrimenti i km di distanza */
  function farFromCity(dati) {
    if (dati.lat == null || dati.lng == null || !dati.citta) return Promise.resolve(null);
    return geocode({ city: dati.citta, postalcode: dati.cap }).then(function (c) {
      if (!c && dati.cap) return geocode({ city: dati.citta });
      return c;
    }).then(function (c) {
      if (!c) return null;
      var km = OA.distanceKm(c, { lat: dati.lat, lng: dati.lng });
      return km > GEO_MAX_KM ? Math.round(km) : null;
    });
  }

  /* Suggerimenti mentre si scrive la via: Photon (komoot, Germania), fatto per il completamento automatico con i dati di
     OpenStreetMap (Nominatim per regolamento non lo permette). Parte da 3 lettere, dopo una pausa di 350 ms, invia solo il
     testo scritto (più la città, se c'è). Elenco accessibile: combobox ARIA 1.2, frecce, Invio, Esc, tocco. */
  var PHOTON_URL = 'https://photon.komoot.io/api/';
  var ITALIA_BBOX = '6.6,35.4,18.6,47.1';

  function addressSuggestions(input, cityInput, onPick, bias) {
    var box = input.closest('.field');
    var listId = 'addr-suggest';
    var list = el('ul', { id: listId, className: 'suggest', role: 'listbox', 'aria-label': 'Indirizzi suggeriti', hidden: '' });
    var live = el('p', { className: 'visually-hidden', role: 'status' });
    var items = [];
    var active = -1;
    var timer = null;
    var ctrl = null;
    var lastQ = '';

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('autocomplete', 'off');
    box.classList.add('field--suggest');
    box.appendChild(list);
    box.appendChild(live);

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function highlight(i) {
      active = i;
      [].forEach.call(list.children, function (li, j) { li.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      if (i >= 0) {
        input.setAttribute('aria-activedescendant', listId + '-' + i);
        list.children[i].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function pick(i) {
      var sug = items[i];
      close();
      if (!sug) return;
      lastQ = sug.indirizzo;
      onPick(sug);
    }

    function render(found) {
      items = found;
      list.textContent = '';
      if (!found.length) {
        close();
        live.textContent = 'Nessun indirizzo suggerito: puoi scriverlo per intero e premere «Trova l\'indirizzo sulla mappa».';
        return;
      }
      found.forEach(function (sug, i) {
        var li = el('li', { id: listId + '-' + i, role: 'option', 'aria-selected': 'false', className: 'suggest__item' }, [
          el('span', { className: 'suggest__main', text: sug.indirizzo }),
          el('span', { className: 'suggest__sub', text: sug.luogo })
        ]);
        /* mousedown, non click: il campo non perde il focus prima della scelta */
        li.addEventListener('mousedown', function (ev) { ev.preventDefault(); pick(i); });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      highlight(-1);
      live.textContent = found.length === 1 ? '1 indirizzo suggerito: freccia giù per sceglierlo.' : found.length + ' indirizzi suggeriti: usa le frecce per sceglierne uno.';
    }

    function search() {
      var q = input.value.trim();
      if (q.length < 3 || q === lastQ) { if (q.length < 3) close(); return; }
      lastQ = q;
      var full = q + (cityInput.value.trim() ? ' ' + cityInput.value.trim() : '');
      var params = new URLSearchParams({ q: full, limit: '5', bbox: ITALIA_BBOX });
      params.append('layer', 'house');
      params.append('layer', 'street');
      var c = bias();
      if (c) { params.set('lat', c.lat.toFixed(3)); params.set('lon', c.lng.toFixed(3)); }
      if (ctrl) ctrl.abort();
      ctrl = window.AbortController ? new AbortController() : null;
      fetch(PHOTON_URL + '?' + params.toString(), { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : { features: [] }; })
        .then(function (data) {
          if (input.value.trim() !== q) return;          /* nel frattempo si è scritto altro */
          var seen = {};
          render((data.features || []).filter(function (f) {
            return f.properties && f.properties.countrycode === 'IT' && (f.properties.street || f.properties.name);
          }).map(function (f) {
            var pr = f.properties;
            var via = pr.street || pr.name;
            var indirizzo = via + (pr.housenumber ? ' ' + pr.housenumber : '');
            var citta = pr.city || pr.town || pr.village || pr.county || '';
            return {
              indirizzo: indirizzo, citta: citta, civico: !!pr.housenumber,
              cap: /^[0-9]{5}$/.test(pr.postcode || '') ? pr.postcode : '',
              luogo: [pr.postcode, citta].filter(Boolean).join(' ') + (regionName(pr.state) ? ' (' + regionName(pr.state) + ')' : ''),
              testo: indirizzo + (citta ? ', ' + citta : ''),
              lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0]
            };
          }).filter(function (sug) {
            var k = sug.testo + sug.cap;
            if (seen[k]) return false;
            seen[k] = true;
            return true;
          }));
        })
        .catch(function () { /* senza suggerimenti resta «Trova l'indirizzo sulla mappa» */ });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(search, 350);
    });
    input.addEventListener('keydown', function (ev) {
      if (list.hidden) {
        if (ev.key === 'ArrowDown' && items.length) { ev.preventDefault(); list.hidden = false; input.setAttribute('aria-expanded', 'true'); highlight(0); }
        return;
      }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); highlight(Math.min(active + 1, items.length - 1)); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); highlight(Math.max(active - 1, -1)); }
      else if (ev.key === 'Enter' && active >= 0) { ev.preventDefault(); pick(active); }
      else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
  }

  /* Mappa per indicare la posizione. Si arriva al punto in quattro modi: «Trova l'indirizzo sulla mappa» (anche con Invio
     nei campi dell'indirizzo), tocco sulla mappa, segnaposto trascinato, «La mia posizione»; oppure con le coordinate.
     Quando il punto arriva dalla mappa, l'app propone l'indirizzo di quel punto (e lo scrive da sola se i campi sono vuoti). */
  function initPicker(form) {
    var latIn = $(fid('lat'));
    var lngIn = $(fid('lng'));
    var status = $('pick-status');
    var suggest = $('pick-suggest');
    var mapBox = $('pick-map');
    var map = OA.createMap(mapBox, { zoomControl: true, dueDita: true, doubleClickZoom: false });   /* qui ogni tocco serve a mettere il punto */
    var marker = null;
    var asked = 0;

    function field(path) {
      return $(fid(path));
    }

    function fill(parts, all) {
      ['indirizzo', 'citta', 'cap', 'provincia', 'regione'].forEach(function (k) {
        var input = field(k);
        if (parts[k] && (all || !input.value.trim())) input.value = parts[k];
      });
    }

    /* CAP, provincia e regione dipendono dal punto: si riscrivono ogni volta che il punto cambia */
    function derived(parts) {
      var done = [];
      ['cap', 'provincia', 'regione'].forEach(function (k) {
        if (!parts[k]) return;
        field(k).value = parts[k];
        done.push(parts[k]);
      });
      return done.length ? ' CAP, provincia e regione presi dal punto: ' + done.join(', ') + '.' : '';
    }

    function placeMarker(lat, lng) {
      if (!map) return;
      if (!marker) {
        marker = L.marker([lat, lng], { draggable: true, keyboard: false, autoPan: true, icon: OA.pinIcon('nv'), title: 'Posizione del luogo: trascina per spostarla' }).addTo(map);
        marker.on('dragend', function () {
          var ll = marker.getLatLng();
          set(ll.lat, ll.lng, 'mappa');
        });
      } else {
        marker.setLatLng([lat, lng]);
      }
    }

    /* origine: 'mappa' (tocco, trascinamento, mia posizione, coordinate scritte) → propone anche via e città;
       'indirizzo' (ricerca) e 'scelta' (suggerimento) → via e città le ha già date chi scrive; msg: testo da mostrare;
       'iniziale' (scheda da correggere) → niente, i dati della scheda restano com'erano */
    function set(lat, lng, origine, zoom, msg) {
      lat = Math.round(lat * 1e6) / 1e6;
      lng = Math.round(lng * 1e6) / 1e6;
      latIn.value = lat;
      lngIn.value = lng;
      placeMarker(lat, lng);
      if (map) map.setView([lat, lng], Math.max(map.getZoom(), zoom || 17));
      suggest.hidden = true;
      if (origine === 'iniziale') return;
      status.textContent = msg || 'Punto messo sulla mappa. Cerco l\'indirizzo di quel punto…';
      var mine = ++asked;
      reverseGeocode(lat, lng).then(function (a) {
        if (mine !== asked) return;              /* nel frattempo il punto è cambiato */
        if (!a) {
          if (origine === 'mappa') status.textContent = 'Punto messo sulla mappa (' + lat + ', ' + lng + '). Non trovo un indirizzo qui: scrivilo tu nei campi qui sopra.';
          return;
        }
        var parts = addressParts(a);
        var extra = derived(parts);
        if (origine !== 'mappa') {
          status.textContent = (msg || '') + extra;
          return;
        }
        var testo = [parts.indirizzo, parts.citta].filter(Boolean).join(', ');
        if (!field('indirizzo').value.trim() && !field('citta').value.trim()) {
          fill(parts, false);
          status.textContent = 'Punto messo sulla mappa. Ho scritto l\'indirizzo di quel punto: ' + testo + '. Controllalo qui sopra.' + extra;
          return;
        }
        var same = !!parts.indirizzo && OA.normalize(field('indirizzo').value).indexOf(OA.normalize(parts.indirizzo)) === 0 &&
          OA.normalize(field('citta').value) === OA.normalize(parts.citta);
        status.textContent = 'Punto messo sulla mappa' + (same ? ', all\'indirizzo che hai scritto.' : testo ? '. Qui l\'indirizzo è: ' + testo + '.' : '.') + extra;
        if (!same && parts.indirizzo) {
          suggest.textContent = '';
          var btn = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [document.createTextNode('Usa questo indirizzo: ' + testo)]);
          btn.addEventListener('click', function () {
            fill(parts, true);
            suggest.hidden = true;
            status.textContent = 'Indirizzo aggiornato: ' + testo + '.';
            field('indirizzo').focus();
          });
          suggest.appendChild(btn);
          suggest.hidden = false;
        }
      });
    }

    if (map) {
      map.setView(OA.ITALY.center, OA.ITALY.zoom);
      /* Da lontano un tocco sbaglia di chilometri: prima si avvicina (Italia → città → strada), poi mette il punto */
      map.on('click', function (ev) {
        var z = map.getZoom();
        if (z < PICK_ZOOM) {
          var next = Math.min(z + 5, PICK_ZOOM);
          map.setView(ev.latlng, next);
          status.textContent = next >= PICK_ZOOM ? 'Ora tocca il punto esatto dell\'ingresso.' : 'Mappa avvicinata: tocca di nuovo vicino al luogo.';
          return;
        }
        set(ev.latlng.lat, ev.latlng.lng, 'mappa');
      });
    }

    function fromInputs() {
      var lat = Number(latIn.value.replace(',', '.'));
      var lng = Number(lngIn.value.replace(',', '.'));
      if (latIn.value && lngIn.value && lat >= 35 && lat <= 48 && lng >= 6 && lng <= 19) set(lat, lng, 'mappa');
    }
    latIn.addEventListener('change', fromInputs);
    lngIn.addEventListener('change', fromInputs);

    /* Sul telefono, dopo una ricerca, la mappa va portata in vista */
    function reveal() {
      var r = mapBox.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        mapBox.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    }

    function find() {
      var via = cleanStreet(field('indirizzo').value);
      var citta = field('citta').value.trim();
      var cap = field('cap').value.trim();
      if (!citta) {
        status.textContent = via ? 'Scrivi anche la città.' : 'Scrivi prima l\'indirizzo e la città.';
        field(via ? 'citta' : 'indirizzo').focus();
        return;
      }
      status.textContent = 'Cerco l\'indirizzo…';
      suggest.hidden = true;
      /* Prima la ricerca per campi, poi quella libera (capisce «Piazza…», «Lungomare…», frazioni), infine la sola città */
      var tries = via ? [
        { street: via, city: citta, postalcode: cap },
        { q: via + ', ' + (cap ? cap + ' ' : '') + citta }
      ] : [];
      var down = false;
      var chain = tries.reduce(function (prev, q) {
        return prev.then(function (r) {
          if (r) return r;
          return geocode(q).then(function (x) { if (x === undefined) down = true; return x; });
        });
      }, Promise.resolve(null));
      chain.then(function (r) {
        if (r) return { r: r, esatto: true };
        return geocode({ city: citta, postalcode: cap }).then(function (c) {
          if (c === undefined) down = true;
          return c ? { r: c, esatto: false } : null;
        });
      }).then(function (res) {
        if (!res) {
          status.textContent = down ? 'La ricerca non risponde: tocca la mappa nel punto dell\'ingresso.' : 'Non trovo «' + citta + '»: controlla il nome della città o tocca la mappa nel punto dell\'ingresso.';
          return;
        }
        var msg = res.esatto
          ? 'Trovato: ' + res.r.nome + '. Se l\'ingresso è da un\'altra parte, tocca la mappa lì o trascina il segnaposto.'
          : (via ? 'Non trovo la via: ho messo il segnaposto al centro di ' + citta + '. ' : 'Ho messo il segnaposto al centro di ' + citta + '. ') + 'Tocca la mappa nel punto dell\'ingresso.';
        set(res.r.lat, res.r.lng, 'indirizzo', res.esatto ? 18 : 14, msg);
        if (!res.esatto && map) map.setView([res.r.lat, res.r.lng], 14);
        reveal();
      });
    }

    $('pick-find').addEventListener('click', find);
    /* Prima i suggerimenti (Invio sceglie quello evidenziato), poi Invio senza suggerimento cerca sulla mappa */
    addressSuggestions(field('indirizzo'), field('citta'), function (sug) {
      field('indirizzo').value = sug.indirizzo;
      if (sug.citta) field('citta').value = sug.citta;
      if (sug.cap) field('cap').value = sug.cap;
      set(sug.lat, sug.lng, 'scelta', sug.civico ? 18 : 17,
        'Indirizzo scelto: ' + sug.testo + '. Il segnaposto è sulla mappa qui sotto: se l\'ingresso è da un\'altra parte, tocca la mappa in quel punto.');
    }, function () {
      return map && map.getZoom() >= 10 ? map.getCenter() : null;
    });

    /* Invio (o «Vai» sulla tastiera del telefono) nei campi dell'indirizzo cerca sulla mappa invece di inviare il modulo */
    ['indirizzo', 'citta', 'cap'].forEach(function (k) {
      field(k).addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' || ev.isComposing || ev.defaultPrevented) return;
        ev.preventDefault();
        find();
      });
    });

    $('pick-locate').addEventListener('click', function () {
      if (!navigator.geolocation) {
        status.textContent = 'Il tuo browser non permette di trovare la posizione.';
        return;
      }
      status.textContent = 'Cerco la tua posizione…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        set(pos.coords.latitude, pos.coords.longitude, 'mappa', 18);
        reveal();
      }, function () {
        status.textContent = 'Non è stato possibile trovare la tua posizione. Controlla i permessi del browser.';
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });

    return {
      /* scheda da correggere: punto già noto, senza proporre indirizzi */
      set: function (lat, lng) { set(lat, lng, 'iniziale'); }
    };
  }

  /* ---------- 7. Profilo ---------- */
  function initProfilo() {
    if (!api.user()) {
      show($('profile-guest'), true);
      return;
    }
    show($('profile-main'), true);
    var user = api.user();
    $('account-email').textContent = user.email || '';

    api.profile().then(function (prof) {
      if (!prof) return;
      $('profile-title').textContent = 'Ciao, ' + prof.nome_pubblico;
      $('name-form').elements.nome.value = prof.nome_pubblico;
      show($('mod-card'), prof.ruolo !== 'utente');
    });

    var nameForm = $('name-form');
    nameForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(nameForm)) return;
      var input = nameForm.elements.nome;
      var v = input.value.trim();
      if (showErrors(nameForm, v.length < 2 || v.length > 40 ? [{ input: input, text: 'Il nome pubblico deve avere da 2 a 40 caratteri.' }] : [])) return;
      busy(nameForm, true, 'Salvataggio…');
      api.updateProfile({ nome_pubblico: v }).then(function (prof) {
        busy(nameForm, false);
        $('profile-title').textContent = 'Ciao, ' + prof.nome_pubblico;
        message($('name-note'), 'Nome salvato. Le recensioni già pubblicate mantengono il nome di quando le hai scritte.', 'ok');
      }).catch(function (err) {
        busy(nameForm, false);
        showErrors(nameForm, [{ input: input, text: err.message }]);
      });
    });

    loadActivity();

    var pwForm = $('password-form');
    pwForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(pwForm)) return;
      var pw = pwForm.elements.password;
      var problem = passwordProblem(pw.value);
      if (showErrors(pwForm, problem ? [{ input: pw, text: problem }] : [])) return;
      busy(pwForm, true, 'Salvataggio…');
      api.updatePassword(pw.value).then(function () {
        busy(pwForm, false);
        pwForm.reset();
        message($('password-note'), 'Password cambiata.', 'ok');
      }).catch(function (err) {
        busy(pwForm, false);
        showErrors(pwForm, [{ input: pw, text: err.message }]);
      });
    });

    $('export-btn').addEventListener('click', function () {
      api.myData().then(function (data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = el('a', { href: URL.createObjectURL(blob), download: 'ovunque-accessibile-i-miei-dati.json' });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        message($('account-note'), 'File con i tuoi dati scaricato.', 'ok');
      }).catch(function (err) { message($('account-note'), err.message, 'error'); });
    });

    $('logout-btn').addEventListener('click', function () {
      api.signOut().then(function () { location.href = 'accedi.html'; });
    });

    var dialog = $('delete-dialog');
    var delForm = $('delete-form');
    $('delete-btn').addEventListener('click', function () {
      delForm.reset();
      clearErrors(delForm);
      dialog.showModal();
    });
    $('delete-cancel').addEventListener('click', function () { dialog.close(); });
    delForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(delForm)) return;
      var input = delForm.elements.conferma;
      if (showErrors(delForm, input.value.trim().toUpperCase() === 'ELIMINA' ? [] : [{ input: input, text: 'Per confermare scrivi ELIMINA.' }])) return;
      busy(delForm, true, 'Eliminazione…');
      api.deleteAccount().then(function () {
        location.href = 'accedi.html?eliminato=1';
      }).catch(function (err) {
        busy(delForm, false);
        showErrors(delForm, [{ input: input, text: err.message }]);
      });
    });
  }

  function loadActivity() {
    Promise.all([api.myData(), api.listPlaces(), api.favorites()]).then(function (r) {
      var data = r[0] || {};
      var places = r[1];
      var byId = {};
      places.forEach(function (p) { byId[p.id] = p; });

      var favList = $('fav-list');
      favList.textContent = '';
      var favs = r[2].map(function (id) { return byId[id]; }).filter(Boolean);
      show($('fav-empty'), !favs.length);
      favs.forEach(function (p) { favList.appendChild(OA.placeCard(p, 'h3')); });

      var props = $('my-proposals');
      props.textContent = '';
      var ps = data.proposte || [];
      show($('proposals-empty'), !ps.length);
      ps.forEach(function (x) {
        var nome = x.dati && x.dati.nome ? x.dati.nome : 'Luogo';
        var link = x.stato === 'approvata' && x.place_id ? el('a', { href: 'luogo.html?id=' + encodeURIComponent(x.place_id), text: nome }) : document.createTextNode(nome);
        var item = el('li', { className: 'activity' }, [
          el('div', { className: 'activity__head' }, [el('h3', { className: 'activity__title' }, [link]), statePill(x.stato, STATO_PROPOSTA)]),
          el('p', { className: 'place__meta', text: (x.tipo === 'nuovo' ? 'Nuovo luogo' : 'Correzione') + (x.dati && x.dati.citta ? ' · ' + x.dati.citta : '') + ' · inviata il ' + dateIt(x.created_at) }),
          x.motivo ? el('p', { className: 'activity__reason', text: 'Motivo: ' + x.motivo }) : null
        ]);
        if (x.stato === 'in-attesa') {
          var btn = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [
            document.createTextNode('Ritira'), el('span', { className: 'visually-hidden', text: ' la proposta per ' + nome })
          ]);
          btn.addEventListener('click', function () {
            api.withdrawProposal(x.id).then(function () {
              message($('activity-note'), 'Proposta per «' + nome + '» ritirata.', 'ok');
              loadActivity();
            }).catch(function (err) { message($('activity-note'), err.message, 'error'); });
          });
          item.appendChild(btn);
        }
        props.appendChild(item);
      });

      var revs = $('my-reviews');
      revs.textContent = '';
      var rs = data.recensioni || [];
      show($('reviews-mine-empty'), !rs.length);
      rs.forEach(function (rv) {
        var p = byId[rv.place_id];
        var nome = p ? p.nome : 'Luogo non più disponibile';
        var del = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [
          document.createTextNode('Elimina'), el('span', { className: 'visually-hidden', text: ' la recensione di ' + nome })
        ]);
        del.addEventListener('click', function () {
          api.deleteReview(rv.id).then(function () {
            message($('activity-note'), 'Recensione di «' + nome + '» eliminata.', 'ok');
            loadActivity();
          }).catch(function (err) { message($('activity-note'), err.message, 'error'); });
        });
        revs.appendChild(el('li', { className: 'activity' }, [
          el('div', { className: 'activity__head' }, [
            el('h3', { className: 'activity__title' }, [p ? el('a', { href: 'luogo.html?id=' + encodeURIComponent(p.id), text: nome }) : document.createTextNode(nome)]),
            statePill(rv.stato, STATO_RECENSIONE)
          ]),
          rv.testo ? el('p', { className: 'activity__text', text: rv.testo }) : answersNode(rv.risposte),
          rv.motivo ? el('p', { className: 'activity__reason', text: 'Motivo: ' + rv.motivo }) : null,
          del
        ]));
      });
    }).catch(function (err) {
      message($('activity-note'), err.message, 'error');
    });
  }

  /* ---------- 8. Moderazione (verificatori e admin) ---------- */
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
    initPlaceState();
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
          el('p', {}, [el('strong', { text: 'Contatto da verificare: ' }), document.createTextNode(g.contatto)]),
          g.nota ? el('blockquote', { className: 'mod-item__note' }, [el('p', { text: g.nota })]) : null,
          el('p', {}, [el('a', { href: 'luogo.html?id=' + encodeURIComponent(g.place_id), text: 'Apri la scheda' })]),
          decisionForm('gestore', g, function () { counts.g--; update(); })
        ])]));
      });
    }).catch(function (err) {
      message($('mod-note'), err.message, 'error');
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
})();
