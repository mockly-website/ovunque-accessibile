/* Ovunque Accessibile – progressive enhancement.
   Senza JS: la carrozzina resta ferma sulla stradina e il form fa un POST classico
   alla Edge Function "subscribe" (Supabase). */
(function () {
  'use strict';

  /* Paesaggio all'alba: colline a strati, strada in prospettiva verso il segnaposto luminoso
     all'orizzonte, carrozzina che si allontana. Tutto è calcolato sulle dimensioni reali dello
     schermo. Su computer gli strati seguono leggermente il mouse (profondità).
     Parte da solo solo se l'utente non ha chiesto di ridurre il movimento; il pulsante lo ferma (WCAG 2.2.2). */
  (function initLandscape() {
    var svg = document.getElementById('landscape');
    var main = document.getElementById('main');
    var toggle = document.querySelector('.trail__toggle');
    if (!svg || !main || !toggle || !window.requestAnimationFrame) return;

    var NS = 'http://www.w3.org/2000/svg';
    var $ = function (id) { return document.getElementById(id); };
    var road = $('ls-road');
    var dashes = $('ls-dashes');
    var rider = $('ls-rider');
    var wheel = $('ls-wheel');
    var goal = $('ls-goal');
    var layers = svg.querySelectorAll('.landscape__layer');

    var LOOP = 16;                   /* secondi per percorrere la strada */
    var t = 0.18;                    /* posizione lungo la strada: 0 = primo piano, 1 = orizzonte */
    var spin = 0;
    var running = false;
    var last = 0;
    var raf = 0;
    var curve = null;                /* punti di controllo della strada (bezier cubica) */
    var horizon = 0;
    var W = 0;
    var H = 0;

    function f(v) { return v.toFixed(1); }
    function lerp(a, b, k) { return a + (b - a) * k; }

    function bez(k) {
      var u = 1 - k, c = curve;
      return {
        x: u * u * u * c[0] + 3 * u * u * k * c[2] + 3 * u * k * k * c[4] + k * k * k * c[6],
        y: u * u * u * c[1] + 3 * u * u * k * c[3] + 3 * u * k * k * c[5] + k * k * k * c[7]
      };
    }

    /* Larghezza della strada: grande in primo piano, sottile all'orizzonte */
    function width(k) { return lerp(Math.min(W * (W < 700 ? 0.42 : 0.2), 260), 4, Math.pow(k, 0.7)); }

    /* Bordo sinistro/destro della strada nel punto k */
    function edges(k) {
      var p = bez(k);
      var q = bez(Math.min(1, k + 0.002));
      var dx = q.x - p.x, dy = q.y - p.y;
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var w = width(k) / 2;
      return { l: [p.x + nx * w, p.y + ny * w], r: [p.x - nx * w, p.y - ny * w], p: p };
    }

    function ridge(y0, amp, waves, phase) {
      var d = 'M -20 ' + f(H + 20) + ' L -20 ' + f(y0);
      var steps = 24;
      for (var i = 0; i <= steps; i++) {
        var x = -20 + (W + 40) * i / steps;
        var y = y0 - amp * Math.sin(i / steps * Math.PI * waves + phase) * (0.6 + 0.4 * Math.sin(i * 1.7 + phase));
        d += ' L ' + f(x) + ' ' + f(y);
      }
      return d + ' L ' + f(W + 20) + ' ' + f(H + 20) + ' Z';
    }

    function tree(parent, x, y, h) {
      var g = document.createElementNS(NS, 'path');
      /* Abete stilizzato: tre triangoli sovrapposti + tronco */
      var w = h * 0.42;
      g.setAttribute('d',
        'M ' + f(x) + ' ' + f(y - h) + ' L ' + f(x + w * 0.6) + ' ' + f(y - h * 0.55) + ' L ' + f(x - w * 0.6) + ' ' + f(y - h * 0.55) + ' Z ' +
        'M ' + f(x) + ' ' + f(y - h * 0.78) + ' L ' + f(x + w * 0.8) + ' ' + f(y - h * 0.28) + ' L ' + f(x - w * 0.8) + ' ' + f(y - h * 0.28) + ' Z ' +
        'M ' + f(x) + ' ' + f(y - h * 0.55) + ' L ' + f(x + w) + ' ' + f(y - h * 0.08) + ' L ' + f(x - w) + ' ' + f(y - h * 0.08) + ' Z ' +
        'M ' + f(x - w * 0.09) + ' ' + f(y - h * 0.1) + ' h ' + f(w * 0.18) + ' v ' + f(h * 0.12) + ' h ' + f(-w * 0.18) + ' Z');
      parent.appendChild(g);
    }

    function build() {
      W = main.clientWidth;
      H = main.clientHeight;
      if (!W || !H) return;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var narrow = W < 700;
      /* Su telefono l'orizzonte sta sotto il modulo (il paesaggio si scopre scorrendo);
         su computer a due terzi dello schermo, con la destinazione accanto al modulo */
      var card = document.querySelector('.launch__form');
      var cardBottom = card ? card.getBoundingClientRect().bottom - main.getBoundingClientRect().top : H * 0.6;
      horizon = narrow ? Math.min(H - 140, cardBottom + 70) : Math.max(H * 0.62, Math.min(H * 0.7, cardBottom - 120));

      /* Alba dietro l'orizzonte */
      var glow = $('ls-glow');
      var gx = narrow ? W * 0.5 : W * 0.8;
      glow.setAttribute('cx', f(gx));
      glow.setAttribute('cy', f(horizon));
      glow.setAttribute('r', f(Math.min(W, 900) * (narrow ? 0.6 : 0.42)));

      $('ls-far').setAttribute('d', ridge(horizon - H * 0.03, H * 0.05, 3, 0.4));
      $('ls-mid').setAttribute('d', ridge(horizon + H * 0.025, H * 0.04, 2.2, 2.1));
      $('ls-near').setAttribute('d', ridge(horizon + H * 0.075, H * 0.025, 1.6, 4));

      /* Strada: dal basso (fuori schermo) fino all'orizzonte, con una curva a S */
      var below = H - horizon;
      curve = narrow ? [
        W * 0.55, H + 60,
        W * 0.02, horizon + below * 0.75,
        W * 0.98, horizon + below * 0.35,
        gx, horizon + 6
      ] : [
        W * 0.9, H + 60,
        W * 0.66, horizon + below * 0.7,
        W * 1.02, horizon + below * 0.3,
        gx, horizon + 6
      ];
      var left = [], right = [];
      for (var i = 0; i <= 60; i++) {
        var e = edges(i / 60);
        left.push(f(e.l[0]) + ' ' + f(e.l[1]));
        right.unshift(f(e.r[0]) + ' ' + f(e.r[1]));
      }
      road.setAttribute('d', 'M ' + left.join(' L ') + ' L ' + right.join(' L ') + ' Z');

      /* Tratteggio centrale: trattini che rimpiccioliscono con la distanza */
      dashes.textContent = '';
      var k = 0, on = true;
      while (k < 0.97) {
        var step = 0.035 * Math.pow(1 - k, 0.9) + 0.006;
        if (on) {
          var p1 = bez(k), p2 = bez(Math.min(1, k + step));
          var hw = Math.max(0.6, width(k) * 0.025);
          var dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
          var nx = -dy / len * hw, ny = dx / len * hw;
          var d = document.createElementNS(NS, 'path');
          d.setAttribute('d', 'M ' + f(p1.x + nx) + ' ' + f(p1.y + ny) + ' L ' + f(p2.x + nx) + ' ' + f(p2.y + ny) +
            ' L ' + f(p2.x - nx) + ' ' + f(p2.y - ny) + ' L ' + f(p1.x - nx) + ' ' + f(p1.y - ny) + ' Z');
          dashes.appendChild(d);
        }
        k += step;
        on = !on;
      }

      /* Destinazione: il segnaposto luminoso dove finisce la strada */
      var end = bez(1);
      var gs = narrow ? 0.9 : 1.2;
      goal.setAttribute('transform', 'translate(' + f(end.x) + ' ' + f(end.y - 2) + ') scale(' + gs + ')');

      /* Abeti: lontani piccoli sulla collina di mezzo, vicini grandi ai lati */
      var mid = $('ls-trees-mid'), near = $('ls-trees-near');
      mid.textContent = ''; near.textContent = '';
      var farSpots = narrow ? [0.06, 0.13, 0.82, 0.9] : [0.04, 0.09, 0.15, 0.24, 0.71, 0.8, 0.86, 0.93];
      farSpots.forEach(function (fx, i) { tree(mid, W * fx, horizon + H * 0.03 + (i % 2) * 6, (narrow ? 22 : 30) + (i % 3) * 6); });
      var nearSpots = narrow ? [[0.04, 1.0], [0.96, 0.9]] : [[0.03, 1.1], [0.1, 0.8], [0.9, 0.95], [0.97, 1.15]];
      nearSpots.forEach(function (s) { tree(near, W * s[0], H * 0.97, (narrow ? 90 : 140) * s[1]); });

      place();
    }

    function place() {
      if (!curve) return;
      var p = bez(t);
      var q = bez(Math.min(1, t + 0.01));
      var dir = q.x >= p.x ? 1 : -1;
      var sc = lerp(narrowScale(), 0.08, Math.pow(t, 0.75));
      /* Compare dal basso e svanisce all'orizzonte */
      var op = t < 0.04 ? t / 0.04 : t > 0.86 ? Math.max(0, (1 - t) / 0.14) : 1;
      rider.setAttribute('transform', 'translate(' + f(p.x) + ' ' + f(p.y) + ') scale(' + f(sc * dir) + ' ' + f(sc) + ')');
      rider.setAttribute('opacity', op.toFixed(2));
      wheel.setAttribute('transform', 'rotate(' + f(spin % 360) + ')');
    }

    function narrowScale() { return W < 700 ? 1.05 : 1.6; }

    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      t += dt / LOOP;
      if (t >= 1) t = 0;
      spin += dt * 360 * (1.2 - t);    /* le ruote rallentano con la distanza */
      place();
      raf = requestAnimationFrame(frame);
    }

    /* Profondità: gli strati si spostano un po' seguendo il puntatore (solo mouse, solo se in movimento) */
    function parallax(e) {
      if (!running || e.pointerType !== 'mouse') return;
      var mx = (e.clientX / window.innerWidth - 0.5) * 2;
      var my = (e.clientY / window.innerHeight - 0.5) * 2;
      layers.forEach(function (l) {
        var dpt = parseFloat(l.getAttribute('data-depth')) || 0;
        l.style.transform = 'translate(' + f(-mx * 18 * dpt) + 'px, ' + f(-my * 8 * dpt) + 'px)';
      });
    }
    window.addEventListener('pointermove', parallax, { passive: true });

    var label = toggle.querySelector('.trail__toggle-label');
    var icon = toggle.querySelector('use');
    function render() {
      label.textContent = running ? "Ferma l'animazione" : "Avvia l'animazione";
      icon.setAttribute('href', running ? '#icon-pause' : '#icon-play');
    }
    function play() { running = true; last = 0; raf = requestAnimationFrame(frame); render(); }
    function pause() {
      running = false;
      cancelAnimationFrame(raf);
      layers.forEach(function (l) { l.style.transform = ''; });
      render();
    }
    toggle.addEventListener('click', function () { if (running) pause(); else play(); });

    svg.hidden = false;
    toggle.hidden = false;
    build();

    var resizeTimer = 0;
    function rebuildSoon() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 120);
    }
    if (window.ResizeObserver) new ResizeObserver(rebuildSoon).observe(main);
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
