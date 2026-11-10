/* Ovunque Accessibile – web-app, accesso e registrazione (accedi.html, registrati.html, password.html).
   Si carica dopo app.js, che dà le utilità comuni (window.OAApp) e chiama la funzione della pagina. */
(function () {
  'use strict';

  var OA = window.OA;
  var api = window.OAApi;
  var el = OA.el;
  var icon = OA.icon;
  var A = window.OAApp;
  var $ = A.$;
  var busy = A.busy;
  var focusHeading = A.focusHeading;
  var isBusy = A.isBusy;
  var message = A.message;
  var params = A.params;
  var passwordProblem = A.passwordProblem;
  var safeReturn = A.safeReturn;
  var show = A.show;
  var showErrors = A.showErrors;
  var validEmail = A.validEmail;

  /* ---------- Accesso e registrazione ---------- */
  function afterLogin() {
    location.replace(safeReturn(params.get('torna')) || 'profilo.html');
  }

  /* Pulsante «Continua con Google»: dopo Google si torna ad accedi.html, poi app.js porta dove serve */
  function initGoogle(note, destinazione) {
    var box = $('google-box');
    var btn = $('google-btn');
    api.googleDisponibile().then(function (si) { show(box, si); });
    btn.addEventListener('click', function () {
      btn.disabled = true;
      api.signInGoogle(destinazione()).catch(function (err) {
        btn.disabled = false;
        message(note, err.message, 'error');
      });
    });
  }

  function initAccedi() {
    var form = $('login-form');
    var note = $('login-note');
    if (api.user()) return afterLogin();
    initGoogle(note, function () { return safeReturn(params.get('torna')); });
    if (params.get('error')) {
      message(note, params.get('error') === 'access_denied'
        ? 'Accesso con Google annullato. Puoi riprovare o usare email e password.'
        : 'L\'accesso con Google non è riuscito. Riprova tra poco o usa email e password.', 'error');
    }
    else if (params.get('confermata')) message(note, 'Email confermata. Ora puoi accedere.', 'ok');
    else if (params.get('eliminato')) message(note, 'Il tuo account è stato eliminato, insieme a profilo, recensioni e preferiti.', 'ok');
    else if (params.get('torna')) message(note, 'Per continuare accedi al tuo account.');

    var reg = $('signup-link');
    if (reg && params.get('torna')) reg.href = 'registrati.html?torna=' + encodeURIComponent(params.get('torna'));

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
    if (api.user() && params.get('completa')) return initCompleta(form);
    if (api.user()) return afterLogin();
    initGoogle($('signup-note'), function () {
      return form.elements.locale.checked ? 'locali.html' : safeReturn(params.get('torna'));
    });
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
      /* «Ho un locale»: dopo l'accesso (subito o dal link di conferma) si arriva a «Per i locali» */
      var torna = f.locale.checked ? 'locali.html' : safeReturn(params.get('torna'));
      api.signUp({ nome: nome, email: f.email.value.trim(), password: f.password.value, torna: torna }).then(function (res) {
        if (!res.confirm) return location.replace(torna || 'profilo.html');
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

  /* Primo accesso con Google: stessa pagina, senza email e password. Il nome di Google è solo un suggerimento */
  function initCompleta(form) {
    var f = form.elements;
    var note = $('signup-note');
    api.profile().then(function (prof) {
      if (!prof || prof.completo !== false) return afterLogin();
      $('signup-title').textContent = 'Ancora un passo';
      $('signup-intro').textContent = 'Hai effettuato l\'accesso con Google. Scegli il nome che comparirà accanto alle tue recensioni e conferma i due punti qui sotto.';
      show(f.email.closest('.field'), false);
      show(f.password.closest('.field'), false);
      show($('signin-link'), false);
      show($('signup-cancel'), true);
      form.querySelector('[type="submit"]').textContent = 'Conferma';
      var meta = api.user().user_metadata || {};
      f.nome.value = String(meta.name || '').trim().split(/\s+/)[0].slice(0, 40);
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var nome = f.nome.value.trim();
      var errors = [];
      if (nome.length < 2 || nome.length > 40) errors.push({ input: f.nome, text: 'Il nome pubblico deve avere da 2 a 40 caratteri.' });
      if (!f.eta.checked) errors.push({ input: f.eta, text: 'Per usare un account devi avere almeno 14 anni.' });
      if (!f.privacy.checked) errors.push({ input: f.privacy, text: 'Per continuare devi aver letto la privacy dell\'app.' });
      if (showErrors(form, errors)) return;
      busy(form, true, 'Salvataggio…');
      api.completeProfile(nome).then(function () {
        location.replace(f.locale.checked ? 'locali.html' : safeReturn(params.get('torna')) || 'profilo.html');
      }).catch(function (err) {
        busy(form, false);
        showErrors(form, [{ input: f.nome, text: err.message }]);
      });
    });
    /* Chi non vuole confermare non resta con un account a metà: finché è incompleto non contiene niente */
    $('signup-cancel').addEventListener('click', function () {
      this.disabled = true;
      var bottone = this;
      api.deleteAccount().then(function () {
        location.replace('accedi.html?eliminato=1');
      }).catch(function (err) {
        bottone.disabled = false;
        message(note, err.message, 'error');
      });
    });
  }

  function initPassword() {
    var requestForm = $('reset-form');
    var newForm = $('new-password-form');
    var note = $('password-note');

    var fattore = null;
    if (params.get('nuova')) {
      if (api.user()) {
        show(requestForm, false);
        show(newForm, true);
        $('password-title').textContent = 'Scegli una nuova password';
        /* Con la verifica in due passaggi serve anche il codice: il campo compare solo in quel caso */
        if (api.mfaDaVerificare) {
          api.mfaDaVerificare().then(function (id) {
            fattore = id;
            show($('mfa-field'), !!id);
          }).catch(function () { /* senza controllo resta il messaggio d'errore all'invio */ });
        }
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
      var codice = newForm.elements.codice;
      var problem = passwordProblem(pw.value);
      var errors = problem ? [{ input: pw, text: problem }] : [];
      if (fattore && !/^[0-9]{6}$/.test(codice.value.trim())) errors.push({ input: codice, text: 'Scrivi le 6 cifre che vedi nell\'app di autenticazione.' });
      if (showErrors(newForm, errors)) return;
      busy(newForm, true, 'Salvataggio…');
      (fattore ? api.verificaMfa(fattore, codice.value.trim()).then(function () { fattore = null; }) : Promise.resolve()).then(function () {
        return api.updatePassword(pw.value);
      }).then(function () {
        show(newForm, false);
        message(note, 'Password cambiata. Da ora usa quella nuova per accedere.', 'ok');
        show($('password-done'), true);
        note.focus();
      }).catch(function (err) {
        busy(newForm, false);
        /* errori del codice sul campo del codice; se il codice serviva e il campo non c'era, compare */
        var sulCodice = /codice/i.test(err.message);
        if (sulCodice && $('mfa-field').hidden) {
          api.mfaDaVerificare().then(function (id) { fattore = id; show($('mfa-field'), !!id); }).catch(function () {});
        }
        showErrors(newForm, [{ input: sulCodice ? newForm.elements.codice : pw, text: err.message }]);
      });
    });
  }

  A.pagine.accedi = initAccedi;
  A.pagine.registrati = initRegistrati;
  A.pagine.password = initPassword;
})();
