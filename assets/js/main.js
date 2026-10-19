/* Ovunque Accessibile – progressive enhancement.
   Senza JS il form funziona comunque: POST classico alla Edge Function "subscribe" (Supabase). */
(function () {
  'use strict';

  /* Animazioni allo scroll: solo se il movimento è consentito. Senza JS il contenuto è già visibile. */
  (function initReveal() {
    var motionOk = window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    if (!motionOk || !('IntersectionObserver' in window)) return;

    var targets = document.querySelectorAll('.reveal, .path-divider, .phone');
    if (!targets.length) return;
    document.documentElement.classList.add('motion');

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('is-visible', 'is-revealing');
        /* Finita la comparsa, niente più ritardi: l'hover resta immediato */
        setTimeout(function () { el.classList.remove('is-revealing'); }, 1200);
        observer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    targets.forEach(function (el) { observer.observe(el); });

    /* Un elemento che riceve il focus da tastiera deve essere subito visibile */
    document.addEventListener('focusin', function (e) {
      var hidden = e.target.closest && e.target.closest('.reveal:not(.is-visible)');
      if (hidden) {
        hidden.classList.add('is-visible');
        observer.unobserve(hidden);
      }
    });
  })();

  var form = document.getElementById('subscribe-form');
  if (!form || !window.fetch || !window.FormData) return;

  var MIN_SECONDS = 3;          /* deve coincidere con MIN_FILL_SECONDS nei secrets della funzione */
  var NOTE_MAX = 1000;

  var statusBox = document.getElementById('form-status');
  var summary = document.getElementById('error-summary');
  var summaryTitle = document.getElementById('error-summary-title');
  var summaryList = document.getElementById('error-summary-list');
  var submitBtn = form.querySelector('[type="submit"]');
  var submitLabel = submitBtn.textContent;
  var tokenInput = form.elements.form_token;
  var note = form.elements.place_note;
  var counter = document.getElementById('place_note-counter');
  var counterLive = document.getElementById('place_note-live');

  var tokenPromise = null;
  var tokenIssuedAt = 0;
  var attempted = false;
  var sending = false;

  /* Con JS i messaggi di validazione sono nostri, in italiano */
  form.setAttribute('novalidate', '');

  var labels = {
    name: 'Nome',
    email: 'Email',
    city: 'Città',
    place_note: 'Luogo accessibile',
    consent: 'Consenso'
  };

  /* Validazione lato client (quella vera resta lato server) */
  function validateField(name) {
    var el = form.elements[name];
    var value = el.type === 'checkbox' ? el.checked : el.value.trim();

    switch (name) {
      case 'name':
        if (!value) return 'Scrivi il tuo nome.';
        if (value.length > 100) return 'Il nome può avere al massimo 100 caratteri.';
        return '';
      case 'email':
        if (!value) return 'Scrivi il tuo indirizzo email.';
        if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
          return 'Controlla l\'indirizzo email: deve essere nel formato nome@esempio.it.';
        }
        return '';
      case 'city':
        return value.length > 100 ? 'La città può avere al massimo 100 caratteri.' : '';
      case 'place_note':
        return value.length > NOTE_MAX ? 'Il racconto può avere al massimo ' + NOTE_MAX + ' caratteri.' : '';
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

  function errorIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#icon-error');
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

    /* Se il campo è nel blocco "Raccontaci di più" chiuso, lo apriamo */
    var details = el.closest('details');
    if (details) details.open = true;

    if (!box) {
      box = document.createElement('p');
      box.className = 'field__error';
      box.id = id;
      var anchor = el.type === 'checkbox' ? el.parentNode.lastElementChild : el;
      anchor.insertAdjacentElement('afterend', box);
    }
    box.textContent = '';
    box.appendChild(errorIcon());
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
    var names = Object.keys(errors);
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

  /* Link del riepilogo: portano il focus sul campo (anche nel riepilogo generato dal server) */
  summaryList.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    var field = link && document.getElementById(link.getAttribute('href').slice(1));
    if (!field) return;
    e.preventDefault();
    var details = field.closest('details');
    if (details) details.open = true;
    var label = form.querySelector('label[for="' + field.id + '"]');
    (label || field).scrollIntoView({ block: 'center' });
    field.focus({ preventScroll: true });
  });

  function showErrors(errors) {
    Object.keys(labels).forEach(function (name) {
      setFieldError(name, errors[name] || '');
    });
    renderSummary(errors);
    if (Object.keys(errors).length) summary.focus();
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

  /* Contatore caratteri: visibile sempre, annunciato solo vicino al limite */
  var lastAnnounced = null;
  function updateCounter() {
    var len = note.value.length;
    var left = NOTE_MAX - len;
    counter.textContent = len + ' caratteri su ' + NOTE_MAX;
    counter.classList.toggle('field__counter--warning', left <= 100);
    var step = [0, 20, 50, 100].filter(function (n) { return left <= n; })[0];
    if (step !== undefined && step !== lastAnnounced) {
      counterLive.textContent = left === 0
        ? 'Hai raggiunto il limite di ' + NOTE_MAX + ' caratteri.'
        : 'Restano ' + left + ' caratteri.';
      lastAnnounced = step;
    } else if (step === undefined) {
      lastAnnounced = null;
    }
  }
  counter.hidden = false;
  note.addEventListener('input', updateCounter);
  updateCounter();

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
  form.addEventListener('focusin', function () { ensureToken().catch(function () {}); }, { once: true });

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
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', type === 'error' ? '#icon-error' : '#icon-check');
    svg.appendChild(use);
    var body = document.createElement('div');
    var strong = document.createElement('strong');
    strong.className = 'form-status__title';
    strong.textContent = title;
    var p = document.createElement('p');
    p.textContent = text;
    body.appendChild(strong);
    body.appendChild(p);
    statusBox.appendChild(svg);
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
          'Controlla la connessione e riprova. I dati che hai scritto sono ancora nel modulo.');
      });
  });
})();
