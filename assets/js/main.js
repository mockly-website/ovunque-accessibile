/* Ovunque Accessibile – progressive enhancement.
   Senza JS: la mappa resta ferma (con alcuni punti già accesi) e il form fa un POST classico
   a Formspree. */
(function () {
  'use strict';

  /* Mappa dell'Italia a puntini: i punti si accendono uno alla volta (con un'onda e, ogni tanto,
     un segnaposto), come una community che aggiunge luoghi. È un'illustrazione: nessun luogo reale.
     Parte da sola solo se l'utente non ha chiesto di ridurre il movimento; il pulsante la ferma (WCAG 2.2.2). */
  (function initMap() {
    var map = document.getElementById('italy-map');
    var fx = document.getElementById('italy-fx');
    var toggle = document.querySelector('.italy__toggle');
    if (!map || !fx || !toggle) return;

    var NS = 'http://www.w3.org/2000/svg';
    var dots = Array.prototype.slice.call(map.querySelectorAll('.italy__dots circle'));
    var lit = dots.filter(function (d) { return d.classList.contains('is-lit'); });
    var MAX_LIT = 90;                /* oltre, i punti più vecchi si spengono e il ciclo continua */
    var EVERY = 700;                 /* ms tra un punto e l'altro */
    var timer = 0;
    var running = false;
    var count = 0;

    function el(name, attrs) {
      var n = document.createElementNS(NS, name);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      return n;
    }

    function lightOne() {
      var off = dots.filter(function (d) { return !d.classList.contains('is-lit'); });
      if (!off.length) return;
      var d = off[Math.floor(Math.random() * off.length)];
      d.classList.add('is-lit');
      lit.push(d);
      if (lit.length > MAX_LIT) lit.shift().classList.remove('is-lit');

      var cx = d.getAttribute('cx'), cy = d.getAttribute('cy');
      var ring = el('circle', { class: 'italy__ripple', cx: cx, cy: cy, r: '6' });
      fx.appendChild(ring);
      setTimeout(function () { ring.remove(); }, 1700);

      /* Ogni quattro punti, un segnaposto (forma del logo) che resta qualche secondo */
      count += 1;
      if (count % 4 === 0) {
        var pin = el('g', { transform: 'translate(' + cx + ' ' + (cy - 4) + ')' });
        var shape = el('path', { class: 'italy__pin', d: 'M0 0 C -11 -13, -13 -18, -13 -24 A 13 13 0 1 1 13 -24 C 13 -18, 11 -13, 0 0 Z' });
        pin.appendChild(shape);
        pin.appendChild(el('circle', { cx: '0', cy: '-24', r: '5.5', fill: '#ffffff' }));
        fx.appendChild(pin);
        setTimeout(function () { pin.remove(); }, 3600);
      }
    }

    var label = toggle.querySelector('.trail__toggle-label');
    var icon = toggle.querySelector('use');
    function render() {
      label.textContent = running ? "Ferma l'animazione" : "Avvia l'animazione";
      icon.setAttribute('href', running ? '#icon-pause' : '#icon-play');
    }
    var startTimer = 0;
    function play() {
      running = true;
      clearInterval(timer);
      timer = setInterval(function () { if (!document.hidden) lightOne(); }, EVERY);
      render();
    }
    function pause() {
      running = false;
      clearTimeout(startTimer);
      clearInterval(timer);
      render();
    }
    toggle.addEventListener('click', function () { if (running) pause(); else play(); });

    toggle.hidden = false;
    var motionOk = window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    if (motionOk) {
      running = true;                /* parte dopo l'ingresso della mappa */
      startTimer = setTimeout(play, 900);
    }
    render();
  })();

  var form = document.getElementById('subscribe-form');
  if (!form || !window.fetch || !window.FormData) return;

  var statusBox = document.getElementById('form-status');
  var summary = document.getElementById('error-summary');
  var summaryTitle = document.getElementById('error-summary-title');
  var summaryList = document.getElementById('error-summary-list');
  var submitBtn = form.querySelector('[type="submit"]');
  var submitLabel = submitBtn.textContent;

  var attempted = false;
  var sending = false;

  /* Con JS i messaggi di validazione sono nostri, in italiano */
  form.setAttribute('novalidate', '');

  /* Campi validati (solo quelli presenti nel form) */
  var labels = { email: 'Email', consent: 'Consenso' };

  /* Validazione lato client (quella vera resta lato server) */
  function validateField(name) {
    var el = form.elements[name];
    if (!el) return '';
    var value = el.type === 'checkbox' ? el.checked : el.value.trim();

    switch (name) {
      case 'email':
        if (!value) return 'Scrivi il tuo indirizzo email.';
        if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
          return 'Controlla l\'indirizzo email: deve essere nel formato nome@esempio.it.';
        }
        return '';
      case 'consent':
        return value ? '' : 'Per iscriverti serve il tuo consenso a ricevere gli aggiornamenti via email.';
    }
    return '';
  }

  function validateAll() {
    var errors = {};
    Object.keys(labels).forEach(function (name) {
      var msg = validateField(name);
      if (msg) errors[name] = msg;
    });
    return errors;
  }

  function makeIcon(id) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', id);
    svg.appendChild(use);
    return svg;
  }

  /* Errore sotto il campo + aria-invalid + aria-describedby */
  function setFieldError(name, message) {
    var el = form.elements[name];
    if (!el) return;
    var id = name + '-error';
    var box = document.getElementById(id);

    if (el.dataset.describedby === undefined) {
      el.dataset.describedby = el.getAttribute('aria-describedby') || '';
    }

    if (!message) {
      if (box) box.remove();
      el.removeAttribute('aria-invalid');
      if (el.dataset.describedby) el.setAttribute('aria-describedby', el.dataset.describedby);
      else el.removeAttribute('aria-describedby');
      return;
    }

    if (!box) {
      box = document.createElement('p');
      box.className = 'field__error';
      box.id = id;
      var anchor = el.type === 'checkbox' ? el.parentNode.lastElementChild : (el.closest('.form__inline') || el);
      anchor.insertAdjacentElement('afterend', box);
    }
    box.textContent = '';
    box.appendChild(makeIcon('#icon-error'));
    var text = document.createElement('span');
    var prefix = document.createElement('span');
    prefix.className = 'visually-hidden';
    prefix.textContent = 'Errore: ';
    text.appendChild(prefix);
    text.appendChild(document.createTextNode(message));
    box.appendChild(text);

    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', (id + ' ' + el.dataset.describedby).trim());
  }

  /* Riepilogo in cima al form con link ai campi */
  function renderSummary(errors) {
    var names = Object.keys(errors).filter(function (n) { return labels[n]; });
    summaryList.textContent = '';
    if (!names.length) {
      summary.hidden = true;
      return;
    }
    summaryTitle.textContent = names.length === 1
      ? 'C\'è un campo da controllare'
      : 'Ci sono ' + names.length + ' campi da controllare';
    names.forEach(function (name) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + form.elements[name].id;
      a.textContent = labels[name] + ': ' + errors[name];
      li.appendChild(a);
      summaryList.appendChild(li);
    });
    summary.hidden = false;
  }

  /* Link del riepilogo: portano il focus sul campo */
  summaryList.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    var field = link && document.getElementById(link.getAttribute('href').slice(1));
    if (!field) return;
    e.preventDefault();
    var label = form.querySelector('label[for="' + field.id + '"]');
    (label || field).scrollIntoView({ block: 'center' });
    field.focus({ preventScroll: true });
  });

  function showErrors(errors) {
    Object.keys(labels).forEach(function (name) {
      setFieldError(name, errors[name] || '');
    });
    renderSummary(errors);
    if (Object.keys(errors).some(function (n) { return labels[n]; })) summary.focus();
  }

  /* Dopo il primo tentativo, gli errori si aggiornano mentre l'utente corregge */
  function revalidate(e) {
    if (!attempted || !labels[e.target.name]) return;
    var msg = validateField(e.target.name);
    var hadError = e.target.getAttribute('aria-invalid') === 'true';
    if (!msg && hadError) {
      setFieldError(e.target.name, '');
      renderSummary(validateAll());
    } else if (msg && e.type !== 'input') {
      setFieldError(e.target.name, msg);
      renderSummary(validateAll());
    }
  }
  form.addEventListener('input', revalidate);
  form.addEventListener('change', revalidate);
  form.addEventListener('focusout', revalidate);

  function setSending(on) {
    sending = on;
    submitBtn.setAttribute('aria-disabled', on ? 'true' : 'false');
    submitBtn.textContent = on ? 'Invio in corso…' : submitLabel;
  }

  /* Messaggio di esito nella regione live, con focus */
  function showStatus(type, title, text) {
    statusBox.className = 'form-status form-status--' + type;
    statusBox.textContent = '';
    var body = document.createElement('div');
    var strong = document.createElement('strong');
    strong.className = 'form-status__title';
    strong.textContent = title;
    var p = document.createElement('p');
    p.textContent = text;
    body.appendChild(strong);
    body.appendChild(p);
    statusBox.appendChild(makeIcon(type === 'error' ? '#icon-error' : type === 'info' ? '#icon-soon' : '#icon-check'));
    statusBox.appendChild(body);
    statusBox.focus();
  }

  function clearStatus() {
    statusBox.className = 'form-status';
    statusBox.textContent = '';
  }

  /* Formspree risponde in JSON: { ok: true } oppure { errors: [{ field, message }] } */
  function post() {
    return fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
      credentials: 'omit'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        data.httpOk = r.ok;
        return data;
      });
    });
  }

  /* Form: validazione lato client + invio via fetch */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    attempted = true;
    clearStatus();

    var errors = validateAll();
    showErrors(errors);
    if (Object.keys(errors).length) return;

    setSending(true);
    post()
      .then(function (data) {
        setSending(false);
        if (data.httpOk && data.ok !== false && !data.errors) {
          form.hidden = true;
          showStatus('success', 'Grazie, sei nella lista!',
            'Ti avviseremo appena il sito e la web-app saranno online.');
          return;
        }
        /* Errori sui campi segnalati da Formspree (es. email non valida) */
        var fieldErrors = {};
        (data.errors || []).forEach(function (err) {
          if (err.field === 'email') fieldErrors.email = 'Controlla l\'indirizzo email: deve essere nel formato nome@esempio.it.';
        });
        if (Object.keys(fieldErrors).length) {
          showErrors(fieldErrors);
        } else {
          showStatus('error', 'Non siamo riusciti a iscriverti',
            'Riprova tra qualche minuto. Se il problema continua, scrivici a ovunqueaccessibile@gmail.com.');
        }
      })
      .catch(function () {
        setSending(false);
        showStatus('error', 'Non siamo riusciti a inviare il modulo',
          'Controlla la connessione e riprova. La tua email è ancora nel modulo.');
      });
  });
})();
