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
    });
  }

  /* ---------- 4. Avvio comune ---------- */
  OA.config.areaPlaces = api.areaPlaces;
  OA.config.searchPlaces = api.searchPlaces;
  OA.config.loadPlace = api.getPlace;
  OA.config.reportHref = function (p) { return 'segnala.html?id=' + encodeURIComponent(p.id); };

  /* Pallino sulla scheda «Profilo» per i moderatori: quante cose aspettano una decisione (segnalazioni, recensioni,
     richieste dei gestori, verifiche sul posto). Il numero resta in memoria 90 secondi per non contare a ogni pagina;
     nel pannello di moderazione si ricalcola sempre. Per gli screen reader è nel nome della voce («Profilo, 3 da moderare»). */
  function updateChrome() {
    var link = document.querySelector('.app-nav__link[data-account-link]');
    if (!link) return;
    var vecchio = link.querySelector('.app-nav__badge');
    if (vecchio) vecchio.remove();
    var sr = link.querySelector('.app-nav__badge-sr');
    if (sr) sr.remove();
    if (!api.user() || !api.pendingCount) return;
    api.profile().then(function (prof) {
      if (!prof || prof.ruolo === 'utente') return null;
      var c = null;
      try { c = JSON.parse(sessionStorage.getItem('oa-da-moderare') || 'null'); } catch (e) { /* niente */ }
      if (c && Date.now() - c.t < 90000 && page !== 'moderazione') return c.n;
      return api.pendingCount().then(function (n) {
        try { sessionStorage.setItem('oa-da-moderare', JSON.stringify({ n: n, t: Date.now() })); } catch (e) { /* niente */ }
        return n;
      });
    }).then(function (n) {
      if (!n) return;
      link.appendChild(el('span', { className: 'app-nav__badge', 'aria-hidden': 'true', text: n > 99 ? '99+' : String(n) }));
      link.appendChild(el('span', { className: 'visually-hidden app-nav__badge-sr', text: ', ' + n + ' da moderare' }));
    }).catch(function () { /* senza numero va bene lo stesso */ });
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
      setTimeout(function () { links[i].classList.remove('is-arriva'); }, 900);
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
        if (anima && BARRA.matches) viaggio(cur, i, 420);
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
        ], { duration: 380, easing: 'ease-out' });
      }
      arriva(cur);
    } else if (prev >= 0 && prev !== cur && links[prev]) {
      viaggio(prev, cur, 560).onfinish = function () { posa(cur); this.cancel(); };
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

  /* Si parte quando anche i file delle pagine (defer, dopo questo) sono stati eseguiti */
  var domPronto = new Promise(function (ok) {
    if (document.readyState === 'complete') ok();
    else document.addEventListener('DOMContentLoaded', ok);
  });

  Promise.all([api.ready.then(syncNeeds), domPronto]).then(function () {
    updateChrome();
    api.onAuth(updateChrome);
    initPasswordToggles();
    OA.start();
    if (pagine[page]) pagine[page]();
    initBenvenuto();
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
