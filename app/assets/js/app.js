/* Ovunque Accessibile – web-app.
   Usa il codice comune del sito (window.OA, ../sito/assets/js/oa-core.js) e i dati di window.OAApi (api.js).
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
  function showErrors(form, errors) {
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
      el('h2', { className: 'error-summary__title', text: errors.length === 1 ? 'C\'è un problema da correggere' : 'Ci sono ' + errors.length + ' problemi da correggere' }),
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
      /* Da qui in poi la scelta "Come ti muovi?" viene salvata anche nel profilo */
      OA.onEsigenza(function (e) {
        if (api.user()) api.updateProfile({ esigenza: e }).catch(function () {});
      });
      return prof;
    });
  }

  var PAGES = {
    accedi: initAccedi, registrati: initRegistrati, password: initPassword,
    segnala: initSegnala, profilo: initProfilo, moderazione: initModerazione
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

  /* ---------- 5. Scheda luogo: preferiti e recensioni ---------- */
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

    var list = $('reviews-list');
    function loadReviews() {
      api.reviews(p.id).then(function (rows) {
        list.textContent = '';
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
              el('p', { className: 'review__text', text: r.testo })
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
      var errors = [];
      if (testo.length < 20) errors.push({ input: f.testo, text: 'Racconta un po\' di più: servono almeno 20 caratteri.' });
      if (f.data_visita.value && f.data_visita.value > f.data_visita.max) errors.push({ input: f.data_visita, text: 'La data della visita non può essere nel futuro.' });
      if (showErrors(form, errors)) return;
      busy(form, true, 'Invio…');
      api.addReview({ place_id: p.id, esigenza: f.esigenza.value, data_visita: f.data_visita.value || null, testo: testo }).then(function () {
        busy(form, false);
        form.reset();
        f.esigenza.value = OA.esigenza();
        counter.textContent = '0 / 2000';
        message($('reviews-note'), 'Grazie! La recensione sarà visibile dopo il controllo dei moderatori. La trovi nel tuo profilo.', 'ok');
        $('reviews-note').focus();
      }).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: f.testo, text: err.message }]);
      });
    });
  }

  /* ---------- 6. Segnala un luogo / proponi una correzione ----------
     Il modulo nasce da SCHEMA: le stesse etichette servono al confronto nel pannello di moderazione. */
  var REGIONI = ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia', 'Lazio', 'Liguria',
    'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria',
    'Valle d\'Aosta', 'Veneto'];

  var SCHEMA = [
    { id: 'luogo', title: 'Il luogo', fields: [
      { path: 'nome', label: 'Nome del luogo', type: 'text', required: true, max: 120, autocomplete: 'organization' },
      { path: 'categoria', label: 'Tipo di luogo', type: 'select', required: true, options: Object.keys(OA.CATEGORIE).map(function (k) { return [k, OA.CATEGORIE[k]]; }) },
      { path: 'indirizzo', label: 'Indirizzo', help: 'Via e numero civico.', type: 'text', required: true, max: 200, autocomplete: 'street-address' },
      { path: 'cap', label: 'CAP', type: 'text', pattern: '^[0-9]{5}$', patternMsg: 'Il CAP è fatto di 5 cifre.', inputmode: 'numeric', autocomplete: 'postal-code', short: true },
      { path: 'citta', label: 'Città', type: 'text', required: true, max: 80, autocomplete: 'address-level2' },
      { path: 'provincia', label: 'Sigla della provincia', help: 'Due lettere, per esempio RM.', type: 'text', pattern: '^[A-Za-z]{2}$', patternMsg: 'La provincia è una sigla di 2 lettere, per esempio RM.', upper: true, short: true },
      { path: 'regione', label: 'Regione', type: 'select', options: REGIONI.map(function (r) { return [r, r]; }) },
      { path: 'descrizione', label: 'Descrizione breve', help: 'Facoltativa: cosa c\'è e come si entra.', type: 'textarea', max: 1000 },
      { path: 'lat', label: 'Latitudine', type: 'number', required: true, min: 35, max: 48, step: 'any', short: true, coord: true },
      { path: 'lng', label: 'Longitudine', type: 'number', required: true, min: 6, max: 19, step: 'any', short: true, coord: true }
    ] },
    { id: 'ingresso', title: 'Ingresso', intro: 'Lascia vuoto quello che non sai: lo segneremo come «da verificare».', fields: [
      { path: 'misure.ingresso.gradini', label: 'Quanti gradini per entrare?', help: 'Scrivi 0 se non ce ne sono.', type: 'number', min: 0, max: 200, short: true },
      { path: 'misure.ingresso.gradino_cm', label: 'Altezza del gradino più alto', unit: 'cm', type: 'number', min: 0, max: 100, short: true },
      { path: 'misure.ingresso.rampa', label: 'C\'è una rampa?', type: 'tri' },
      { path: 'misure.ingresso.rampa_pct', label: 'Pendenza della rampa', unit: '%', type: 'number', min: 0, max: 50, short: true, showIf: ['misure.ingresso.rampa', true] },
      { path: 'misure.ingresso.corrimano', label: 'Ci sono corrimano?', type: 'tri' },
      { path: 'x.nessuna_porta', label: 'Non c\'è una porta (spiaggia, parco, pontile…)', type: 'checkbox' },
      { path: 'misure.ingresso.porta_cm', label: 'Larghezza della porta', help: 'Lo spazio libero quando è aperta.', unit: 'cm', type: 'number', min: 1, max: 500, short: true, showIf: ['x.nessuna_porta', false] },
      { path: 'misure.ingresso.nota', label: 'Note sull\'ingresso', type: 'textarea', max: 500 },
      { path: 'misure.ingresso.nota_porta', label: 'Note sulla porta', type: 'textarea', max: 500, showIf: ['x.nessuna_porta', false] }
    ] },
    { id: 'spazi', title: 'Spazi e percorsi', fields: [
      { path: 'misure.spazi.valore', label: 'Gli spazi interni sono accessibili?', type: 'choice', options: [['tutti', 'Sì, tutti'], ['parziale', 'Solo in parte'], ['no', 'No']] },
      { path: 'misure.spazi.nota', label: 'Note su spazi e percorsi', type: 'textarea', max: 500 }
    ] },
    { id: 'piani', title: 'Piani e ascensore', fields: [
      { path: 'misure.piani.valore', label: 'Come si raggiungono i piani?', type: 'choice', options: [['uno', 'È tutto su un piano'], ['ascensore', 'C\'è un ascensore'], ['scale', 'Solo con le scale']] },
      { path: 'x.ascensore_l', label: 'Larghezza della cabina', unit: 'cm', type: 'number', min: 30, max: 500, short: true, showIf: ['misure.piani.valore', 'ascensore'] },
      { path: 'x.ascensore_p', label: 'Profondità della cabina', unit: 'cm', type: 'number', min: 30, max: 500, short: true, showIf: ['misure.piani.valore', 'ascensore'] },
      { path: 'misure.piani.corrimano_scale', label: 'Le scale hanno il corrimano?', type: 'tri', showIf: ['misure.piani.valore', 'scale'] },
      { path: 'misure.piani.nota', label: 'Note su piani e ascensore', type: 'textarea', max: 500 }
    ] },
    { id: 'bagno', title: 'Bagno', fields: [
      { path: 'misure.bagno.valore', label: 'C\'è un bagno accessibile?', type: 'choice', options: [['attrezzato', 'Sì, attrezzato per persone con disabilità'], ['non-attrezzato', 'C\'è, ma non è attrezzato'], ['assente', 'No, nessun bagno accessibile'], ['non-previsto', 'In questo luogo non è previsto un bagno']] },
      { path: 'misure.bagno.rotazione_cm', label: 'Spazio per girarsi con la carrozzina', help: 'Il diametro del cerchio libero davanti al WC.', unit: 'cm', type: 'number', min: 0, max: 500, short: true, showIf: ['misure.bagno.valore', 'attrezzato'] },
      { path: 'misure.bagno.maniglioni', label: 'Ci sono i maniglioni?', type: 'tri', showIf: ['misure.bagno.valore', 'attrezzato'] },
      { path: 'misure.bagno.nota', label: 'Note sul bagno', type: 'textarea', max: 500 }
    ] },
    { id: 'altre', title: 'Altre informazioni', optional: true, fields: [
      { path: 'facoltativi.porta_tipo', label: 'Com\'è la porta?', type: 'choice', options: [['automatica', 'Automatica'], ['manuale', 'Da aprire a mano'], ['pesante', 'Pesante da aprire']], showIf: ['x.nessuna_porta', false] },
      { path: 'facoltativi.pavimento', label: 'Com\'è il pavimento?', type: 'choice', options: [['liscio', 'Liscio'], ['irregolare', 'Irregolare (sampietrini, legno, sabbia)'], ['ghiaia', 'Ghiaia']] },
      { path: 'facoltativi.sedute', label: 'Ci sono sedute lungo il percorso?', type: 'tri' },
      { path: 'facoltativi.parcheggio.posti', label: 'Ci sono posti auto riservati vicino?', type: 'tri' },
      { path: 'facoltativi.parcheggio.distanza_m', label: 'Distanza del parcheggio dall\'ingresso', unit: 'metri', type: 'number', min: 0, max: 5000, short: true, showIf: ['facoltativi.parcheggio.posti', true] },
      { path: 'facoltativi.parcheggio.nota', label: 'Note sul parcheggio', type: 'textarea', max: 500 },
      { path: 'facoltativi.assistenza.valore', label: 'Il personale offre assistenza?', type: 'tri' },
      { path: 'facoltativi.assistenza.nota', label: 'Note sull\'assistenza', type: 'textarea', max: 500 }
    ] },
    { id: 'dettagli', title: 'Dettagli per tipo di luogo', optional: true, fields: [
      { path: 'dettagli.tavoli_cm', label: 'Altezza dei tavoli', unit: 'cm', type: 'number', min: 30, max: 150, short: true, cat: ['ristorante'] },
      { path: 'dettagli.spazio_gambe', label: 'C\'è spazio per le gambe sotto il tavolo?', type: 'tri', cat: ['ristorante'] },
      { path: 'dettagli.camere_accessibili', label: 'Quante camere accessibili?', type: 'number', min: 0, max: 2000, short: true, cat: ['hotel'] },
      { path: 'dettagli.doccia_filo', label: 'Doccia a filo pavimento?', type: 'tri', cat: ['hotel'] },
      { path: 'dettagli.passerella', label: 'Passerella fino all\'acqua?', type: 'tri', cat: ['spiaggia'] },
      { path: 'dettagli.sedia_mare', label: 'Sedia da mare disponibile?', type: 'tri', cat: ['spiaggia'] },
      { path: 'dettagli.posti_carrozzina', label: 'Posti per carrozzina in sala', type: 'number', min: 0, max: 2000, short: true, cat: ['cultura'] },
      { path: 'dettagli.accompagnatore_gratis', label: 'Biglietto gratuito per l\'accompagnatore?', type: 'tri', cat: ['cultura', 'museo'] },
      { path: 'dettagli.assistenza_prenotabile', label: 'Assistenza da prenotare?', type: 'tri', cat: ['trasporti'] },
      { path: 'dettagli.preavviso_ore', label: 'Preavviso per l\'assistenza', unit: 'ore', type: 'number', min: 0, max: 720, short: true, cat: ['trasporti'] },
      { path: 'dettagli.percorso_tattile', label: 'Percorso tattile?', type: 'tri', cat: ['museo', 'parco'] },
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
      if (f.cat) visible = f.cat.indexOf(cat) !== -1;
      node.hidden = !visible;
    });
    var det = $('sec-dettagli');
    var anyDet = FIELDS.some(function (f) { return f.cat && f.cat.indexOf(cat) !== -1; });
    det.hidden = !anyDet;
    $('sec-dettagli-title').textContent = 'Dettagli: ' + (OA.TITOLO_DETTAGLI[cat] || 'tipo di luogo').toLowerCase();
  }

  function placeToForm(form, p) {
    var src = {
      nome: p.nome, categoria: p.categoria, indirizzo: p.indirizzo, cap: p.cap, citta: p.citta, provincia: p.provincia,
      regione: p.regione, descrizione: p.descrizione, lat: p.lat, lng: p.lng,
      misure: p.misure, facoltativi: p.facoltativi || {}, dettagli: p.dettagli || {},
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
    });
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
    if (out.misure.ingresso.rampa !== true) out.misure.ingresso.rampa_pct = null;
    /* Le voci facoltative vuote non si salvano */
    ['parcheggio', 'assistenza'].forEach(function (k) {
      var o = out.facoltativi[k];
      if (o && Object.keys(o).every(function (kk) { return o[kk] == null; })) delete out.facoltativi[k];
    });
    Object.keys(out.facoltativi).forEach(function (k) { if (out.facoltativi[k] == null) delete out.facoltativi[k]; });
    Object.keys(out.dettagli).forEach(function (k) { if (out.dettagli[k] == null) delete out.dettagli[k]; });
    return { dati: out, errors: errors };
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
      box.appendChild(el('section', { className: 'card form-section', id: 'sec-' + sec.id, 'aria-labelledby': titleId }, [
        el('h2', { id: titleId, text: sec.title + (sec.optional ? ' (facoltative)' : '') }),
        sec.intro ? el('p', { className: 'field__help', text: sec.intro }) : null,
        sec.id === 'luogo' ? el('div', { className: 'pick' }, [
          el('p', { className: 'field__help', id: 'pick-help', text: 'Posizione: tocca la mappa nel punto dell\'ingresso, oppure usa «La mia posizione» se sei lì. Puoi anche scrivere le coordinate qui sotto (in Google Maps tieni premuto sul luogo e copiale).' }),
          el('div', { id: 'pick-map', className: 'pick__map', role: 'region', 'aria-label': 'Mappa per indicare la posizione del luogo' }),
          el('button', { type: 'button', id: 'pick-locate', className: 'btn btn--secondary btn--small' }, [icon('#icon-locate'), el('span', { text: 'La mia posizione' })]),
          el('p', { id: 'pick-status', className: 'visually-hidden', role: 'status' })
        ]) : null,
        el('div', { className: 'form-grid' }, sec.fields.map(fieldNode))
      ]));
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
        picker.set(p.lat, p.lng, false);
        initial = JSON.stringify(collect(form).dati);
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var res = collect(form);
      res.errors = res.errors.concat(photosUi.errors());
      if (!res.errors.length && initial && JSON.stringify(res.dati) === initial && !photosUi.items().length) {
        res.errors.push({ input: $(fid('nome')), text: 'Non hai cambiato niente: modifica le voci che non corrispondono più al luogo.' });
      }
      if (showErrors(form, res.errors)) return;
      var nota = form.elements.nota_moderatori.value.trim() || null;
      busy(form, true, 'Invio…');
      var items = photosUi.items();
      var failed = 0;
      ready.then(function () {
        return api.propose({ tipo: place ? 'correzione' : 'nuovo', place_id: place ? place.id : null, dati: res.dati, nota: nota });
      }).then(function (propostaId) {
        /* Le foto una alla volta, dopo la proposta: se una non passa, la segnalazione resta comunque inviata */
        return items.reduce(function (prev, item, i) {
          return prev.then(function () {
            form.querySelector('[type="submit"]').textContent = 'Invio della foto ' + (i + 1) + ' di ' + items.length + '…';
            return api.uploadPhoto(propostaId, item.blob, item.input.value.trim()).catch(function () { failed++; });
          });
        }, Promise.resolve());
      }).then(function () {
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

  /* Mappa per indicare la posizione: tocco, segnaposto trascinabile o campi delle coordinate */
  function initPicker(form) {
    var latIn = $(fid('lat'));
    var lngIn = $(fid('lng'));
    var status = $('pick-status');
    var map = OA.createMap($('pick-map'), { zoomControl: true });
    var marker = null;
    function set(lat, lng, announce) {
      lat = Math.round(lat * 1e6) / 1e6;
      lng = Math.round(lng * 1e6) / 1e6;
      latIn.value = lat;
      lngIn.value = lng;
      if (map) {
        if (!marker) {
          marker = L.marker([lat, lng], { draggable: true, keyboard: false, icon: OA.pinIcon('nv'), title: 'Posizione del luogo' }).addTo(map);
          marker.on('dragend', function () {
            var ll = marker.getLatLng();
            set(ll.lat, ll.lng, true);
          });
        } else {
          marker.setLatLng([lat, lng]);
        }
        map.setView([lat, lng], Math.max(map.getZoom(), 16));
      }
      if (announce) status.textContent = 'Posizione impostata: ' + lat + ', ' + lng + '.';
    }
    if (map) {
      map.setView(OA.ITALY.center, OA.ITALY.zoom);
      map.on('click', function (ev) { set(ev.latlng.lat, ev.latlng.lng, true); });
    }
    function fromInputs() {
      var lat = Number(latIn.value.replace(',', '.'));
      var lng = Number(lngIn.value.replace(',', '.'));
      if (latIn.value && lngIn.value && lat >= 35 && lat <= 48 && lng >= 6 && lng <= 19 && map) {
        if (!marker) set(lat, lng, false);
        else { marker.setLatLng([lat, lng]); map.setView([lat, lng], Math.max(map.getZoom(), 16)); }
      }
    }
    latIn.addEventListener('change', fromInputs);
    lngIn.addEventListener('change', fromInputs);
    $('pick-locate').addEventListener('click', function () {
      if (!navigator.geolocation) {
        status.textContent = 'Il tuo browser non permette di trovare la posizione.';
        return;
      }
      status.textContent = 'Cerco la tua posizione…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        set(pos.coords.latitude, pos.coords.longitude, true);
      }, function () {
        status.textContent = 'Non è stato possibile trovare la tua posizione. Controlla i permessi del browser.';
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
    return { set: set };
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
          el('p', { className: 'activity__text', text: rv.testo }),
          rv.motivo ? el('p', { className: 'activity__reason', text: 'Motivo: ' + rv.motivo }) : null,
          del
        ]));
      });
    }).catch(function (err) {
      message($('activity-note'), err.message, 'error');
    });
  }

  /* ---------- 8. Moderazione (verificatori e admin, con verifica in due passaggi) ---------- */
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
          return el('tr', {}, [el('th', { scope: 'row', text: label })].concat(
            (current ? [fmt(b[k])] : []).concat([fmt(a[k])]).map(function (t) { return el('td', { text: t }); })));
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
      return api.mfa().then(function (st) {
        if (st.level === 'aal2') return showPanel();
        if (st.verified.length) return mfaChallenge(st.verified[0].id);
        show($('mfa-enroll'), true);
        if (api.mode === 'prova') show($('mfa-prova'), true);
      });
    }).catch(function (err) {
      message($('mod-note'), err.message, 'error');
    });

    $('mfa-start').addEventListener('click', function () {
      api.mfaEnroll().then(function (d) {
        show($('mfa-start'), false);
        var img = $('mfa-qr');
        if (d.qr && /^data:image\/svg\+xml/.test(d.qr)) {
          img.src = d.qr;
          show(img, true);
        }
        $('mfa-secret').textContent = d.secret;
        show($('mfa-step2'), true);
        $('mfa-enroll-form').dataset.factor = d.factorId;
        $('mfa-enroll-form').elements.code.focus();
      }).catch(function (err) { message($('mod-note'), err.message, 'error'); });
    });
    [$('mfa-enroll-form'), $('mfa-challenge-form')].forEach(function (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (isBusy(form)) return;
        var code = form.elements.code;
        var v = code.value.replace(/\s/g, '');
        if (showErrors(form, /^[0-9]{6}$/.test(v) ? [] : [{ input: code, text: 'Il codice è fatto di 6 cifre.' }])) return;
        busy(form, true, 'Verifica…');
        api.mfaVerify(form.dataset.factor, v).then(function () {
          busy(form, false);
          show($('mfa-enroll'), false);
          show($('mfa-challenge'), false);
          showPanel();
        }).catch(function (err) {
          busy(form, false);
          showErrors(form, [{ input: code, text: err.message }]);
        });
      });
    });
  }

  function mfaChallenge(factorId) {
    show($('mfa-challenge'), true);
    $('mfa-challenge-form').dataset.factor = factorId;
    if (api.mode === 'prova') show($('mfa-prova-2'), true);
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
    var ok = el('button', { type: 'submit', className: 'btn btn--primary btn--small', value: 'ok' }, [document.createTextNode(kind === 'proposta' ? 'Approva e pubblica' : 'Pubblica')]);
    var no = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [document.createTextNode(kind === 'proposta' ? 'Non approvare' : 'Non pubblicare')]);
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
      } else {
        run(function () { return api.moderateReview(item.id, 'pubblicata'); }, 'Recensione pubblicata.');
      }
    });
    no.addEventListener('click', function () {
      var motivo = form.elements.motivo.value.trim();
      if (kind === 'proposta') run(function () { return api.reject(item.id, motivo); }, 'Proposta non approvata.');
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
        var diffBox = el('div', {}, [el('p', { className: 'place__meta', text: 'Caricamento del confronto…' })]);
        article.appendChild(el('h4', { text: x.tipo === 'nuovo' ? 'Dati proposti' : 'Cosa cambia' }));
        article.appendChild(diffBox);
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
          el('blockquote', { className: 'mod-item__note' }, [el('p', { text: r.testo })]),
          decisionForm('recensione', r, function () { counts.r--; update(); })
        ]);
        listR.appendChild(el('li', {}, [article]));
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
