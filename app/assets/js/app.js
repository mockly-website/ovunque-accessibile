/* Ovunque Accessibile – web-app, parte comune a tutte le pagine.
   Usa il codice comune del sito (window.OA, ../assets/js/oa-core.js) e i dati di window.OAApi (api.js).
   Ogni pagina ha <body data-page="…">: mappa, luogo, accedi, registrati, password, segnala, profilo, moderazione,
   privacy, locali, bollino. Il codice di una pagina sta nel suo file, caricato solo lì dopo questo:
     accesso.js (accedi, registrati, password) · scheda.js (luogo) · segnala.js (segnala, moderazione)
     profilo.js (profilo, locali) · moderazione.js · bollino.js
   Ogni file di pagina prende da window.OAApp le utilità qui sotto e si registra in OAApp.pagine[nome]; l'avvio
   (sezione 3) parte quando tutti gli script sono stati eseguiti e chiama la funzione della pagina.
   Tutti i testi arrivati dal database entrano nel DOM con textContent, mai con innerHTML.
   Indice: 1. Utilità · 2. Moduli e errori · 3. Pezzi usati da più pagine · 4. Avvio comune (barra delle schede,
           «Come ti muovi?») · 5. Cosa vedono i file delle pagine */
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

  var STATO_PROPOSTA = { 'in-attesa': 'In attesa di controllo', approvata: 'Approvata', respinta: 'Non approvata', chiusa: 'Luogo chiuso: tolto dalla mappa' };
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

  /* ---------- 3. Pezzi usati da più pagine ---------- */
  /* Domande guidate delle recensioni: [chiave, domanda, etichetta breve, risposta «non l'ho usato»] */
  var DOMANDE = [
    ['scheda_giusta', 'Le informazioni della scheda erano giuste?', 'Scheda giusta'],
    ['entrato', 'Sei riuscito a entrare senza chiedere aiuto?', 'Entrato senza aiuto'],
    ['personale', 'Il personale è stato disponibile?', 'Personale disponibile'],
    ['bagno', 'Hai potuto usare il bagno?', 'Bagno usabile', true],
    ['tornerei', 'Ci torneresti?', 'Ci tornerebbe']
  ];

  function answersNode(risposte) {
    var items = DOMANDE.filter(function (d) { return risposte && (risposte[d[0]] === 'si' || risposte[d[0]] === 'no'); });
    if (!items.length) return null;
    return el('ul', { className: 'review__answers', role: 'list' }, items.map(function (d) {
      return el('li', {}, [OA.statusNode([risposte[d[0]] === 'si' ? 'si' : 'no', d[2]])]);
    }));
  }

  /* Foto: ricompresse nel browser in JPEG (lato lungo 1600 px). Ridisegnarle su un canvas toglie
     i dati EXIF, compresa la posizione GPS di chi ha scattato. */
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
    }).catch(function () {
      /* Le foto HEIC dell'iPhone si aprono in Safari ma non in Chrome o Firefox: lo diciamo in chiaro */
      var heic = /heic|heif/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
      throw new Error(heic
        ? 'La foto «' + file.name + '» è in formato HEIC (iPhone) e questo browser non riesce ad aprirla: salvala come JPG, apri l\'app con Safari oppure scatta la foto direttamente dall\'app.'
        : 'Non riesco ad aprire «' + (file.name || 'la foto') + '»: usa una foto JPG o PNG.');
    });
  }

  /* ---------- 4. Avvio comune ---------- */
  OA.config.areaPlaces = api.areaPlaces;
  OA.config.searchPlaces = api.searchPlaces;
  OA.config.loadPlace = api.getPlace;
  OA.config.reportHref = function (p) { return 'segnala.html?id=' + encodeURIComponent(p.id); };

  /* Avvisi sull'esito (11 novembre): dai dati dell'utente (i_miei_dati) le decisioni prese su segnalazioni, recensioni,
     richieste di gestione e verifiche sul posto, più le risposte dei locali alle recensioni. Niente tabella nuova:
     «nuovo» vuol dire più recente dell'ultima apertura degli avvisi nel profilo (localStorage, per utente).
     nomi: id del luogo → nome (per recensioni, gestione e verifiche; le segnalazioni hanno il nome dentro). */
  function avvisi(data, nomi) {
    data = data || {};
    nomi = nomi || {};
    var out = [];
    function nome(id) { return nomi[id] ? '«' + nomi[id] + '»' : 'il luogo'; }
    function scheda(id) { return id ? 'luogo.html?id=' + encodeURIComponent(id) : null; }
    function motivo(m) { return m ? ' Motivo: ' + m : ''; }
    (data.proposte || []).forEach(function (x) {
      if (!x.deciso_at) return;
      var n = x.dati && x.dati.nome ? '«' + x.dati.nome + '»' : 'il luogo';
      if (x.stato === 'approvata') out.push({ t: x.deciso_at, tipo: 'ok', titolo: 'Segnalazione pubblicata', testo: n + ' è sulla mappa. Grazie!', href: scheda(x.place_id) });
      if (x.stato === 'respinta') out.push({ t: x.deciso_at, tipo: 'no', titolo: 'Segnalazione non pubblicata', testo: n + '.' + motivo(x.motivo) });
    });
    (data.recensioni || []).forEach(function (r) {
      if (r.deciso_at && r.stato === 'pubblicata') out.push({ t: r.deciso_at, tipo: 'ok', titolo: 'Recensione pubblicata', testo: 'Su ' + nome(r.place_id) + '.', href: scheda(r.place_id) });
      if (r.deciso_at && r.stato === 'respinta') out.push({ t: r.deciso_at, tipo: 'no', titolo: 'Recensione non pubblicata', testo: 'Su ' + nome(r.place_id) + '.' + motivo(r.motivo) });
      if (r.risposta_at) out.push({ t: r.risposta_at, tipo: 'info', titolo: 'Il locale ti ha risposto', testo: 'Alla tua recensione su ' + nome(r.place_id) + '.', href: scheda(r.place_id) });
    });
    (data.gestore || []).forEach(function (g) {
      if (!g.deciso_at) return;
      if (g.stato === 'approvato') out.push({ t: g.deciso_at, tipo: 'ok', titolo: 'Ora gestisci ' + nome(g.place_id), testo: 'Scarica il codice QR per la vetrina.', href: 'bollino.html?id=' + encodeURIComponent(g.place_id) });
      if (g.stato === 'respinto') out.push({ t: g.deciso_at, tipo: 'no', titolo: 'Richiesta di gestione non approvata', testo: 'Per ' + nome(g.place_id) + '.' + motivo(g.motivo) });
    });
    (data.verifiche || []).forEach(function (v) {
      if (!v.deciso_at) return;
      var r = v.risposta ? ' ' + v.risposta : '';
      if (v.stato === 'fissata') out.push({ t: v.deciso_at, tipo: 'info', titolo: 'Verifica sul posto fissata', testo: 'Per ' + nome(v.place_id) + '.' + r, href: 'locali.html' });
      if (v.stato === 'fatta') out.push({ t: v.deciso_at, tipo: 'ok', titolo: 'Verifica sul posto fatta', testo: nome(v.place_id).replace(/^il/, 'Il') + ' ora è «Verificato sul posto».', href: scheda(v.place_id) });
      if (v.stato === 'respinta') out.push({ t: v.deciso_at, tipo: 'no', titolo: 'Verifica sul posto non possibile', testo: 'Per ' + nome(v.place_id) + '.' + r });
    });
    var visti = avvisiVisti();
    out.forEach(function (a) { a.nuovo = a.t > visti; });
    return out.sort(function (a, b) { return a.t < b.t ? 1 : -1; });
  }

  function chiaveVisti() {
    return 'oa-avvisi-visti-' + (api.user() ? api.user().id : '');
  }
  function avvisiVisti() {
    try { return localStorage.getItem(chiaveVisti()) || ''; } catch (e) { return ''; }
  }
  /* Profilo aperto: gli avvisi diventano «visti» e il pallino si aggiorna */
  function segnaAvvisiVisti() {
    try {
      localStorage.setItem(chiaveVisti(), new Date().toISOString());
      sessionStorage.removeItem('oa-avvisi-nuovi');
    } catch (e) { /* niente */ }
    updateChrome();
  }

  /* Quanti avvisi nuovi (in memoria 90 secondi, come il conteggio dei moderatori) */
  function avvisiNuovi() {
    var c = null;
    try { c = JSON.parse(sessionStorage.getItem('oa-avvisi-nuovi') || 'null'); } catch (e) { /* niente */ }
    if (c && Date.now() - c.t < 90000 && c.u === api.user().id) return Promise.resolve(c.n);
    return api.myData().then(function (data) {
      var n = avvisi(data).filter(function (a) { return a.nuovo; }).length;
      try { sessionStorage.setItem('oa-avvisi-nuovi', JSON.stringify({ n: n, t: Date.now(), u: api.user().id })); } catch (e) { /* niente */ }
      return n;
    });
  }

  /* Pallino sulla scheda «Profilo»: avvisi nuovi per tutti e, per i moderatori, quante cose aspettano una decisione
     (segnalazioni, recensioni, richieste dei gestori, verifiche sul posto). I numeri restano in memoria 90 secondi per
     non contare a ogni pagina; nel pannello di moderazione si ricalcola sempre. Per gli screen reader è nel nome della
     voce («Profilo, 2 avvisi nuovi, 3 da moderare»). */
  function updateChrome() {
    var link = document.querySelector('.app-nav__link[data-account-link]');
    if (!link) return;
    var vecchio = link.querySelector('.app-nav__badge');
    if (vecchio) vecchio.remove();
    var sr = link.querySelector('.app-nav__badge-sr');
    if (sr) sr.remove();
    if (!api.user() || !api.pendingCount) return;
    var daModerare = api.profile().then(function (prof) {
      if (!prof || prof.ruolo === 'utente') return 0;
      var c = null;
      try { c = JSON.parse(sessionStorage.getItem('oa-da-moderare') || 'null'); } catch (e) { /* niente */ }
      if (c && Date.now() - c.t < 90000 && page !== 'moderazione') return c.n;
      return api.pendingCount().then(function (n) {
        try { sessionStorage.setItem('oa-da-moderare', JSON.stringify({ n: n, t: Date.now() })); } catch (e) { /* niente */ }
        return n;
      });
    }).catch(function () { return 0; });
    var nuovi = avvisiNuovi().catch(function () { return 0; });
    Promise.all([nuovi, daModerare]).then(function (r) {
      var n = r[0] + r[1];
      if (!n || link.querySelector('.app-nav__badge')) return;
      var sr = [r[0] ? (r[0] === 1 ? '1 avviso nuovo' : r[0] + ' avvisi nuovi') : '', r[1] ? r[1] + ' da moderare' : ''].filter(Boolean).join(', ');
      link.appendChild(el('span', { className: 'app-nav__badge', 'aria-hidden': 'true', text: n > 99 ? '99+' : String(n) }));
      link.appendChild(el('span', { className: 'visually-hidden app-nav__badge-sr', text: ', ' + sr }));
    });
  }

  function syncNeeds() {
    return api.profile().catch(function () { return null; }).then(function (prof) {
      /* Un'esigenza spenta salvata nel profilo (vista, udito) conta come non scelta */
      var salvata = prof && OA.esigenzaAttiva(prof.esigenza) ? prof.esigenza : null;
      if (salvata && !params.get('per') && salvata !== OA.scelta()) OA.setEsigenza(salvata);
      else if (prof && !salvata && OA.scelta()) api.updateProfile({ esigenza: OA.scelta() }).catch(function () {});
      /* Da qui in poi la scelta «La tua esigenza» viene salvata anche nel profilo */
      OA.onEsigenza(function (e) {
        if (api.user()) api.updateProfile({ esigenza: e }).catch(function () {});
      });
      return prof;
    });
  }

  /* Funzione di avvio di ogni pagina: la mette il file della pagina (es. pagine.segnala = initSegnala in segnala.js) */
  var pagine = {};

  /* Barra delle schede (telefono e tablet): un indicatore solo, che viaggia da una scheda all'altra.
     Al tocco parte subito, già sulla pagina che si sta lasciando, allungandosi come un elastico; sulla pagina nuova si
     assesta (sessionStorage «oa-viaggio»). Verso «Segnala» entra nel cerchio blu e il «+» fa un giro. L'icona della
     scheda nuova si disegna da sola, tratto per tratto (classe is-arriva). Se si arriva senza tocco (tasto indietro),
     il viaggio si fa tutto sulla pagina nuova. Il contenuto entra dal lato giusto (classi vt-avanti / vt-indietro su
     <html>, vedi intro.js e app.css sezione 22). Con «riduci movimento» niente di tutto questo. */
  var CALMO = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BARRA = matchMedia('(max-width: 63.99em)');
  var ELASTICO = 'cubic-bezier(.3, .7, .2, 1)';

  function tabIndex(links) {
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('aria-current') === 'page' || links[i].classList.contains('is-section')) return i;
    }
    return -1;
  }

  function initTabBar() {
    var list = document.querySelector('.app-nav__list');
    var links = [].slice.call(document.querySelectorAll('.app-nav__link'));
    if (!list || !links.length) return;
    var cur = tabIndex(links);
    var prev = -1;
    try {
      prev = Number(sessionStorage.getItem('oa-scheda') || -1);
      sessionStorage.setItem('oa-scheda', String(cur));
    } catch (e) { /* senza sessionStorage niente viaggio */ }

    var ind = document.createElement('span');
    ind.className = 'app-nav__indice';
    ind.setAttribute('aria-hidden', 'true');
    list.appendChild(ind);

    function centro(i) {
      var r = links[i].getBoundingClientRect();
      return r.left - list.getBoundingClientRect().left + r.width / 2;
    }
    function segnala(i) { return links[i] && links[i].getAttribute('href') === 'segnala.html'; }
    function posa(i) {
      ind.hidden = i < 0 || segnala(i);
      if (i >= 0) ind.style.transform = 'translateX(' + centro(i) + 'px)';
    }
    posa(cur);
    window.addEventListener('resize', function () { posa(cur); });

    var anima = !CALMO && !!Element.prototype.animate;
    function viaggio(da, a, durata) {
      var x0 = centro(da), x1 = centro(a), d = x1 - x0;
      var verso = segnala(a) ? 'translateX(' + x1 + 'px) scale(0.2)' : 'translateX(' + x1 + 'px)';
      var parte = segnala(da) ? 'translateX(' + x0 + 'px) scale(0.2)' : 'translateX(' + x0 + 'px)';
      ind.hidden = false;
      return ind.animate([
        { transform: parte, opacity: segnala(da) ? 0 : 1 },
        { transform: 'translateX(' + (x0 + d * 0.5) + 'px) scaleX(1.7) scaleY(0.8)', opacity: 1, offset: 0.4 },
        { transform: 'translateX(' + (x1 + d * 0.06) + 'px) scaleX(0.9) scaleY(1.08)', opacity: segnala(a) ? 0.4 : 1, offset: 0.78 },
        { transform: verso, opacity: segnala(a) ? 0 : 1 }
      ], { duration: durata, easing: ELASTICO, fill: 'forwards' });
    }
    function arriva(i) {
      if (!anima || i < 0) return;
      links[i].classList.add('is-arriva');
      setTimeout(function () { links[i].classList.remove('is-arriva'); }, 550);
    }

    /* Al tocco l'icona si schiaccia subito (non al rilascio); sui telefoni che lo permettono, una vibrazione minima */
    links.forEach(function (a) {
      a.addEventListener('pointerdown', function (ev) {
        a.classList.add('is-premuto');
        if (anima && ev.pointerType === 'touch' && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* niente */ } }
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
        a.addEventListener(t, function () { a.classList.remove('is-premuto'); });
      });
    });

    links.forEach(function (a, i) {
      a.addEventListener('click', function (ev) {
        if (i === cur || cur < 0 || ev.defaultPrevented) return;
        try {
          sessionStorage.setItem('oa-verso', i > cur ? 'avanti' : 'indietro');
          sessionStorage.setItem('oa-viaggio', JSON.stringify({ a: i, t: Date.now() }));
        } catch (e) { /* niente */ }
        if (anima && BARRA.matches) viaggio(cur, i, 320);
      });
    });

    if (!anima || cur < 0 || !BARRA.matches) return;
    var giro = null;
    try {
      giro = JSON.parse(sessionStorage.getItem('oa-viaggio') || 'null');
      sessionStorage.removeItem('oa-viaggio');
    } catch (e) { /* niente */ }
    if (giro && giro.a === cur && Date.now() - giro.t < 2500) {
      /* il viaggio è già fatto sulla pagina di prima: qui l'indicatore si assesta */
      if (!segnala(cur)) {
        ind.animate([
          { transform: 'translateX(' + centro(cur) + 'px) scaleX(1.25) scaleY(0.85)' },
          { transform: 'translateX(' + centro(cur) + 'px) scaleX(0.95) scaleY(1.06)', offset: 0.5 },
          { transform: 'translateX(' + centro(cur) + 'px)' }
        ], { duration: 280, easing: 'ease-out' });
      }
      arriva(cur);
    } else if (prev >= 0 && prev !== cur && links[prev]) {
      viaggio(prev, cur, 400).onfinish = function () { posa(cur); this.cancel(); };
      arriva(cur);
    }
  }

  /* Onda al tocco sulla barra delle schede (telefono e tablet): parte dal punto toccato e si allarga su tutta la barra.
     Se il tocco porta a un'altra pagina, sulla pagina nuova l'onda riprende dallo stesso punto (sessionStorage),
     così non si interrompe a metà. Con la tastiera parte dal centro della voce. Con «riduci movimento» niente onda. */
  function initOnda() {
    var nav = document.querySelector('.app-nav');
    if (!nav || CALMO || !Element.prototype.animate) return;
    var barra = matchMedia('(max-width: 63.99em)');
    var strato = document.createElement('span');
    strato.className = 'app-nav__onde';
    strato.setAttribute('aria-hidden', 'true');
    nav.insertBefore(strato, nav.firstChild);

    function onda(x, y, da) {
      var r = strato.getBoundingClientRect();
      var raggio = Math.sqrt(Math.pow(Math.max(x, r.width - x), 2) + Math.pow(Math.max(y, r.height - y), 2));
      var o = document.createElement('span');
      o.className = 'app-nav__onda';
      o.style.left = x + 'px';
      o.style.top = y + 'px';
      o.style.width = o.style.height = (raggio * 2) + 'px';
      strato.appendChild(o);
      o.animate([
        { transform: 'translate(-50%, -50%) scale(' + (da || 0.02) + ')', opacity: 1 },
        { opacity: 0.85, offset: 0.55 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }
      ], { duration: 700, easing: 'cubic-bezier(.2, .7, .3, 1)' }).onfinish = function () { o.remove(); };
    }

    var ultimo = null;
    nav.addEventListener('pointerdown', function (ev) {
      if (!barra.matches) return;
      var r = strato.getBoundingClientRect();
      ultimo = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      onda(ultimo.x, ultimo.y);
    });
    nav.addEventListener('click', function (ev) {
      var a = ev.target.closest('.app-nav__link');
      if (!a || !barra.matches) return;
      var r = strato.getBoundingClientRect();
      var p = ultimo;
      if (ev.detail === 0) {   /* tastiera: dal centro della voce */
        var ra = a.getBoundingClientRect();
        p = { x: ra.left - r.left + ra.width / 2, y: ra.top - r.top + ra.height / 2 };
        onda(p.x, p.y);
      }
      ultimo = null;
      if (!p || a.getAttribute('aria-current') === 'page') return;
      try { sessionStorage.setItem('oa-onda', JSON.stringify({ x: p.x / r.width, y: p.y, t: Date.now() })); } catch (e) { /* niente */ }
    });

    var prima = null;
    try {
      prima = JSON.parse(sessionStorage.getItem('oa-onda') || 'null');
      sessionStorage.removeItem('oa-onda');
    } catch (e) { /* niente */ }
    if (prima && Date.now() - prima.t < 1500 && barra.matches) {
      onda(prima.x * strato.getBoundingClientRect().width, prima.y, 0.3);
    }
  }

  /* Linea sotto la barra in alto mentre si va a un'altra pagina dell'app */
  function initPageLine() {
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href]');
      if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (a.target === '_blank' || a.hasAttribute('download') || a.origin !== location.origin) return;
      if (a.pathname === location.pathname && a.search === location.search) return;   /* solo un'ancora */
      document.documentElement.classList.add('oa-va');
    });
    window.addEventListener('pageshow', function () { document.documentElement.classList.remove('oa-va'); });
    /* Pagina che se ne va: la stessa direzione anche per la vecchia */
    window.addEventListener('pageswap', function (e) {
      var verso = null;
      try { verso = sessionStorage.getItem('oa-verso'); } catch (err) { /* niente */ }
      if (e.viewTransition && verso) document.documentElement.classList.add('vt-' + verso);
    });
  }

  initTabBar();
  initOnda();
  initPageLine();

  /* Prima apertura della mappa senza un'esigenza scelta: una finestra chiede «Come ti muovi?», così i giudizi di tutte le
     schede sono subito quelli giusti. Si apre dopo la schermata di caricamento, una volta sola (anche con «Scegli dopo»). */
  function initBenvenuto() {
    if (page !== 'mappa' || OA.scelta() || !window.HTMLDialogElement) return;
    try {
      if (localStorage.getItem('oa-benvenuto')) return;
    } catch (e) { return; }
    var dlg = el('dialog', { className: 'benvenuto', 'aria-labelledby': 'benvenuto-title', 'aria-describedby': 'benvenuto-testo' }, [
      el('h2', { id: 'benvenuto-title', text: 'Come ti muovi?' }),
      el('p', { id: 'benvenuto-testo', text: 'Scegli la tua esigenza: i giudizi di tutte le schede si adattano a te. Puoi cambiarla quando vuoi.' }),
      el('ul', { className: 'benvenuto__scelte', role: 'list' }, OA.ORDINE_ESIGENZE.map(function (k) {
        var b = el('button', { type: 'button', className: 'benvenuto__scelta' }, [
          el('span', { className: 'benvenuto__icona' }, [icon(OA.ESIGENZE[k].icona)]), document.createTextNode(OA.ESIGENZE[k].nome)
        ]);
        b.addEventListener('click', function () { OA.setEsigenza(k); dlg.close(); });
        return el('li', {}, [b]);
      })),
      el('button', { type: 'button', className: 'btn btn--secondary benvenuto__dopo', text: 'Scegli dopo' })
    ]);
    dlg.querySelector('.benvenuto__dopo').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () {
      try { localStorage.setItem('oa-benvenuto', '1'); } catch (e) { /* niente */ }
      dlg.remove();
    });
    document.body.appendChild(dlg);
    var root = document.documentElement;
    (function apri() {
      if (root.classList.contains('oa-intro') || root.classList.contains('oa-intro-out')) return setTimeout(apri, 150);
      dlg.showModal();
    })();
  }

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
    if (page !== 'mappa') return;
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

  /* Senza connessione: una striscia in alto lo dice, e cosa si vede (le copie salvate da api.js e sw.js) */
  function initRete() {
    var b = el('p', { className: 'rete-avviso', role: 'status', hidden: '' });
    document.body.appendChild(b);
    function aggiorna() {
      b.hidden = navigator.onLine;
      b.textContent = navigator.onLine ? '' : 'Senza connessione: vedi i luoghi e la mappa già salvati su questo telefono.';
    }
    window.addEventListener('online', aggiorna);
    window.addEventListener('offline', aggiorna);
    aggiorna();
  }

  /* Si parte quando anche i file delle pagine (defer, dopo questo) sono stati eseguiti */
  var domPronto = new Promise(function (ok) {
    if (document.readyState === 'complete') ok();
    else document.addEventListener('DOMContentLoaded', ok);
  });

  /* La pagina parte appena c'è la sessione (salvata nel browser) e il documento è pronto: il profilo arriva dal server
     in parallelo, senza far aspettare la pagina (prima ogni cambio di pagina attendeva questa richiesta). */
  var profilo = api.ready.then(syncNeeds);
  profilo.then(function (prof) {
    /* Primo accesso con Google: prima di tutto il resto si completa il profilo (la privacy resta leggibile) */
    if (prof && prof.completo === false && page !== 'registrati' && page !== 'privacy') {
      var torna = page === 'accedi' ? safeReturn(params.get('torna')) : safeReturn(here());
      location.replace('registrati.html?completa=1' + (torna ? '&torna=' + encodeURIComponent(torna) : ''));
    }
  });
  Promise.all([api.ready, domPronto]).then(function () {
    updateChrome();
    api.onAuth(updateChrome);
    initPasswordToggles();
    initRete();
    OA.start();
    if (pagine[page]) pagine[page]();
    initFoglio();
    /* «Come ti muovi?» solo dopo il profilo: chi ha già scelto su un altro dispositivo non la vede */
    profilo.then(initBenvenuto, initBenvenuto);
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* l'app funziona anche senza */ });
  }

  /* ---------- 5. Cosa vedono i file delle pagine ---------- */
  window.OAApp = {
    $: $,
    DOMANDE: DOMANDE,
    STATO_PROPOSTA: STATO_PROPOSTA,
    STATO_RECENSIONE: STATO_RECENSIONE,
    answersNode: answersNode,
    avvisi: avvisi,
    segnaAvvisiVisti: segnaAvvisiVisti,
    busy: busy,
    clearErrors: clearErrors,
    dateIt: dateIt,
    focusHeading: focusHeading,
    goLogin: goLogin,
    here: here,
    isBusy: isBusy,
    message: message,
    params: params,
    passwordProblem: passwordProblem,
    preparePhoto: preparePhoto,
    safeReturn: safeReturn,
    show: show,
    showErrors: showErrors,
    statePill: statePill,
    validEmail: validEmail,
    pagine: pagine
  };
})();
