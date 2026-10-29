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

  function initAccedi() {
    var form = $('login-form');
    var note = $('login-note');
    if (api.user()) return afterLogin();
    if (params.get('confermata')) message(note, 'Email confermata. Ora puoi accedere.', 'ok');
    if (params.get('eliminato')) message(note, 'Il tuo account è stato eliminato, insieme a profilo, recensioni e preferiti.', 'ok');
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

  A.pagine.accedi = initAccedi;
  A.pagine.registrati = initRegistrati;
  A.pagine.password = initPassword;
})();
