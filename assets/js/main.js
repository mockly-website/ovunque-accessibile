/* Ovunque Accessibile – progressive enhancement.
   Senza JS: la carrozzina resta ferma sulla stradina e il form fa un POST classico
   alla Edge Function "subscribe" (Supabase). */
(function () {
  'use strict';

  /* Paesaggio: colline, alberi, sole e stradina disegnati in base alla larghezza reale dello
     schermo (niente deformazioni); la carrozzina percorre la strada da sinistra a destra.
     Parte da sola solo se l'utente non ha chiesto di ridurre il movimento; il pulsante la ferma (WCAG 2.2.2). */
  (function initScene() {
    var svg = document.getElementById('scene');
    var road = document.getElementById('journey-road');
    var line = document.getElementById('journey-line');
    var pins = document.getElementById('journey-pins');
    var trees = document.getElementById('scene-trees');
    var rider = document.getElementById('journey-rider');
    var wheel = document.getElementById('journey-wheel');
    var toggle = document.querySelector('.trail__toggle');
    if (!svg || !road || !toggle || !window.requestAnimationFrame) return;

    var NS = 'http://www.w3.org/2000/svg';
    var SPEED = 90;                  /* px al secondo */
    var MAX_TILT = 22;
    var WHEEL_R = 22;
    var total = 0;
    var dist = 0;
    var scale = 1;
    var running = false;
    var last = 0;
    var raf = 0;

    function el(name, attrs, parent) {
      var n = document.createElementNS(NS, name);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      parent.appendChild(n);
      return n;
    }

    function f(v) { return v.toFixed(1); }

    /* Collina: onda morbida da sinistra a destra, chiusa in basso */
    function hill(W, H, y0, y1, amp, phase) {
      return 'M -10 ' + f(H + 10) + ' L -10 ' + f(y0) +
        ' C ' + f(W * 0.25) + ' ' + f(y0 - amp * phase) + ', ' + f(W * 0.45) + ' ' + f(y0 + amp * phase) + ', ' + f(W * 0.6) + ' ' + f((y0 + y1) / 2) +
        ' S ' + f(W * 0.9) + ' ' + f(y1 - amp) + ', ' + f(W + 10) + ' ' + f(y1) +
        ' L ' + f(W + 10) + ' ' + f(H + 10) + ' Z';
    }

    function tree(x, y, size, parent) {
      var g = el('g', { transform: 'translate(' + f(x) + ' ' + f(y) + ')' }, parent);
      el('rect', { class: 'scene__trunk', x: f(-size * 0.08), y: f(-size * 0.55), width: f(size * 0.16), height: f(size * 0.55), rx: '2' }, g);
      el('circle', { class: 'scene__crown', cx: '0', cy: f(-size * 0.78), r: f(size * 0.38) }, g);
    }

    function pin(x, y) {
      var g = el('g', { transform: 'translate(' + f(x) + ' ' + f(y - 16) + ')' }, pins);
      el('path', { class: 'journey__pin', d: 'M0 0 C -13 -15, -15 -21, -15 -28 A 15 15 0 1 1 15 -28 C 15 -21, 13 -15, 0 0 Z' }, g);
      el('circle', { cx: '0', cy: '-28', r: '6.5', fill: '#ffffff' }, g);
    }

    function build() {
      var W = svg.clientWidth;
      var H = svg.clientHeight;
      if (!W || !H) return;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var narrow = W < 600;

      document.getElementById('scene-sun').setAttribute('cx', f(W * (narrow ? 0.82 : 0.5)));
      document.getElementById('scene-sun').setAttribute('cy', f(H * 0.32));
      document.getElementById('scene-hill-back').setAttribute('d', hill(W, H, H * 0.42, H * 0.3, H * 0.08, 1));
      document.getElementById('scene-hill-mid').setAttribute('d', hill(W, H, H * 0.5, H * 0.58, H * 0.07, -1));
      document.getElementById('scene-hill-front').setAttribute('d', hill(W, H, H * 0.7, H * 0.66, H * 0.05, 1));

      /* Alberelli sulla collina di mezzo */
      trees.textContent = '';
      var spots = narrow ? [0.08, 0.9] : [0.06, 0.11, 0.33, 0.7, 0.88, 0.93];
      spots.forEach(function (fx, i) {
        var size = (narrow ? 34 : 46) * (i % 2 ? 0.8 : 1);
        tree(W * fx, H * (0.56 + (i % 3) * 0.015), size, trees);
      });

      /* Stradina sulla collina davanti: entra da sinistra ed esce a destra */
      var o = 120;
      var y = H * 0.84;
      var a = Math.min(26, H * 0.08);
      var d = 'M ' + (-o) + ' ' + f(y) +
        ' C ' + f(W * 0.2) + ' ' + f(y - a * 2) + ', ' + f(W * 0.38) + ' ' + f(y + a) + ', ' + f(W * 0.55) + ' ' + f(y - a * 0.4) +
        ' S ' + f(W * 0.85) + ' ' + f(y - a * 1.6) + ', ' + f(W + o) + ' ' + f(y - a * 0.5);
      road.setAttribute('d', d);
      line.setAttribute('d', d);
      total = road.getTotalLength();
      scale = narrow ? 0.75 : 1.1;

      pins.textContent = '';
      [0.3, 0.68].forEach(function (fr) {
        var pt = road.getPointAtLength(total * fr);
        pin(pt.x, pt.y);
      });
      place();
    }

    function place() {
      var s = dist % total;
      var p = road.getPointAtLength(s);
      var q = road.getPointAtLength(Math.min(total, s + 4));
      var tilt = Math.atan2(q.y - p.y, (q.x - p.x) || 0.001) * 180 / Math.PI;
      tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt));
      rider.setAttribute('transform', 'translate(' + f(p.x) + ' ' + f(p.y + 5) + ') rotate(' + f(tilt) + ') scale(' + scale + ')');
      wheel.setAttribute('transform', 'rotate(' + f((dist / WHEEL_R) * 180 / Math.PI % 360) + ')');
    }

    function frame(t) {
      if (!running) return;
      var dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      dist += SPEED * dt;
      place();
      raf = requestAnimationFrame(frame);
    }

    var label = toggle.querySelector('.trail__toggle-label');
    var icon = toggle.querySelector('use');
    function render() {
      label.textContent = running ? "Ferma l'animazione" : "Avvia l'animazione";
      icon.setAttribute('href', running ? '#icon-pause' : '#icon-play');
    }
    function play() { running = true; last = 0; raf = requestAnimationFrame(frame); render(); }
    function pause() { running = false; cancelAnimationFrame(raf); render(); }
    toggle.addEventListener('click', function () { if (running) pause(); else play(); });

    svg.hidden = false;
    toggle.hidden = false;
    build();
    dist = total * 0.42;             /* posizione di partenza: al centro, ben visibile */
    place();

    var resizeTimer = 0;
    function rebuildSoon() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 120);
    }
    if (window.ResizeObserver) new ResizeObserver(rebuildSoon).observe(svg);
    else window.addEventListener('resize', rebuildSoon);

    var motionOk = window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    if (motionOk) play(); else render();
  })();

  var form = document.getElementById('subscribe-form');
  if (!form || !window.fetch || !window.FormData) return;

  var MIN_SECONDS = 3;          /* deve coincidere con MIN_FILL_SECONDS nei secrets della funzione */

  var statusBox = document.getElementById('form-status');
  var summary = document.getElementById('error-summary');
  var summaryTitle = document.getElementById('error-summary-title');
  var summaryList = document.getElementById('error-summary-list');
  var submitBtn = form.querySelector('[type="submit"]');
  var submitLabel = submitBtn.textContent;
  var tokenInput = form.elements.form_token;

  var tokenPromise = null;
  var tokenIssuedAt = 0;
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
      var anchor = el.type === 'checkbox' ? el.parentNode.lastElementChild : el;
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

  /* Token firmato (anti-bot, tempo minimo): richiesto al primo contatto col form. Nessun cookie. */
  function ensureToken(force) {
    if (tokenPromise && !force) return tokenPromise;
    tokenPromise = fetch(form.action + '?action=token', {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store'
    })
      .then(function (r) { if (!r.ok) throw new Error('token'); return r.json(); })
      .then(function (data) {
        tokenInput.value = data.token;
        tokenIssuedAt = Date.now();
        return data.token;
      })
      .catch(function (err) { tokenPromise = null; throw err; });
    return tokenPromise;
  }
  form.addEventListener('focusin', function () {
    if ((form.getAttribute('action') || '').indexOf('[PROJECT-REF]') !== -1) return;
    ensureToken().catch(function () {});
  }, { once: true });

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

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

  function post() {
    return fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
      credentials: 'omit'
    }).then(function (r) {
      return r.json().catch(function () { throw new Error('json'); });
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

    /* Backend non ancora configurato (segnaposto [PROJECT-REF]): niente errore del browser */
    if ((form.getAttribute('action') || '').indexOf('[PROJECT-REF]') !== -1) {
      showStatus('info', 'Le iscrizioni aprono a breve',
        'Il modulo non è ancora attivo. Nel frattempo puoi seguirci su Instagram: @ovunque_accessibile.');
      return;
    }

    setSending(true);
    var retried = false;

    ensureToken()
      .then(function () {
        var elapsed = Date.now() - tokenIssuedAt;
        var minMs = MIN_SECONDS * 1000 + 200;
        return elapsed < minMs ? wait(minMs - elapsed) : null;
      })
      .then(function send() {
        return post().then(function (data) {
          if (data.status === 'expired' && !retried) {
            retried = true;
            return ensureToken(true).then(function () { return wait(MIN_SECONDS * 1000 + 200); }).then(send);
          }
          return data;
        });
      })
      .then(function (data) {
        setSending(false);
        if (data.status === 'ok') {
          form.hidden = true;
          showStatus('success', data.title, data.message);
        } else if (data.status === 'invalid' && data.errors) {
          showErrors(data.errors);
        } else {
          showStatus('error', data.title || 'Non siamo riusciti a iscriverti', data.message || 'Riprova tra qualche minuto.');
        }
      })
      .catch(function () {
        setSending(false);
        if (!tokenInput.value) {
          /* Endpoint non raggiungibile via fetch: ripiego sull'invio classico */
          form.submit();
          return;
        }
        showStatus('error', 'Non siamo riusciti a inviare il modulo',
          'Controlla la connessione e riprova. La tua email è ancora nel modulo.');
      });
  });
})();
