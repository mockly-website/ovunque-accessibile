/* Ovunque Accessibile – web-app, profilo e «Per i locali» (profilo.html, locali.html).
   Si carica dopo app.js, che dà le utilità comuni (window.OAApp) e chiama la funzione della pagina. */
(function () {
  'use strict';

  var OA = window.OA;
  var api = window.OAApi;
  var el = OA.el;
  var icon = OA.icon;
  var A = window.OAApp;
  var $ = A.$;
  var STATO_PROPOSTA = A.STATO_PROPOSTA;
  var STATO_RECENSIONE = A.STATO_RECENSIONE;
  var answersNode = A.answersNode;
  var busy = A.busy;
  var clearErrors = A.clearErrors;
  var dateIt = A.dateIt;
  var isBusy = A.isBusy;
  var message = A.message;
  var params = A.params;
  var passwordProblem = A.passwordProblem;
  var show = A.show;
  var showErrors = A.showErrors;
  var statePill = A.statePill;

  /* ---------- Profilo ---------- */
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
    /* Solo i luoghi che servono: preferiti e luoghi delle mie recensioni */
    Promise.all([api.myData(), api.favorites()]).then(function (r) {
      var ids = r[1].concat(((r[0] || {}).recensioni || []).map(function (rv) { return rv.place_id; }));
      return api.placesByIds(ids.filter(function (id, i) { return ids.indexOf(id) === i; }))
        .then(function (places) { return [r[0], places, r[1]]; });
    }).then(function (r) {
      var data = r[0] || {};
      var byId = {};
      r[1].forEach(function (p) { byId[p.id] = p; });

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


  /* «Per i locali»: i luoghi che gestisco, lo stato della verifica sul posto, la richiesta di verifica */
  var STATO_GESTORE = { 'in-attesa': 'Richiesta in attesa', approvato: 'Sei il gestore', respinto: 'Richiesta non approvata', revocato: 'Gestione revocata' };
  var STATO_VERIFICA = { 'in-attesa': 'Verifica richiesta: la stiamo organizzando', fissata: 'Verifica fissata', fatta: 'Verifica fatta', respinta: 'Verifica non possibile' };

  /* Cerca il proprio locale tra le schede pubblicate → scheda con «Sei il titolare?» già aperto */
  function initFindPlace() {
    var input = $('find-q');
    var out = $('find-list');
    var status = $('find-status');
    if (!input) return;
    var timer = null;
    var giro = 0;
    function render(found) {
      out.textContent = '';
      status.textContent = found.length ? (found.length === 1 ? '1 locale trovato.' : found.length + ' locali trovati (al massimo 8: scrivi anche la città per restringere).') : 'Nessun locale trovato con questo nome.';
      found.forEach(function (p) {
        out.appendChild(el('li', { className: 'find-list__item' }, [
          el('div', {}, [
            el('strong', { text: p.nome }),
            el('p', { className: 'place__meta', text: (OA.CATEGORIE[p.categoria] || '') + ' · ' + p.indirizzo + ', ' + p.citta })
          ]),
          el('a', { className: 'btn btn--secondary btn--small', href: 'luogo.html?id=' + encodeURIComponent(p.id) + '&gestisci=1#owner-card' }, [
            document.createTextNode('Gestisci'), el('span', { className: 'visually-hidden', text: ' ' + p.nome + ', ' + p.citta })
          ])
        ]));
      });
    }
    /* La ricerca la fa il database (nome, città, indirizzo…), come nella pagina mappa */
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var mio = ++giro;
      var q = input.value.trim();
      if (q.length < 2) {
        out.textContent = '';
        status.textContent = '';
        return;
      }
      timer = setTimeout(function () {
        status.textContent = 'Cerco i locali…';
        api.searchPlaces(q, 8).then(function (x) {
          if (mio === giro) render(x.luoghi);
        }).catch(function (err) { if (mio === giro) status.textContent = err.message; });
      }, 250);
    });
  }

  function initLocali() {
    var list = $('owned-list');
    var note = $('owned-note');
    initFindPlace();
    if (!api.user()) {
      show($('owned-login'), true);
      return;
    }
    var focusId = params.get('id');
    var byId = {};

    function verificaForm(g) {
      var id = 'ver-' + g.place_id;
      var form = el('form', { className: 'stack owned__form', novalidate: '', hidden: '' }, [
        el('div', { className: 'field' }, [
          el('label', { className: 'field__label', 'for': id + '-quando' }, [document.createTextNode('Quando possiamo passare?'), el('span', { className: 'field__req', text: ' (obbligatorio)' })]),
          el('p', { className: 'field__help', id: id + '-quando-aiuto', text: 'Giorni e orari, per esempio «martedì e giovedì dalle 15 alle 18». Ti scriviamo qui la data.' }),
          el('input', { className: 'input', type: 'text', id: id + '-quando', name: 'disponibilita', maxlength: '300', 'aria-describedby': id + '-quando-aiuto' })
        ]),
        el('div', { className: 'field' }, [
          el('label', { className: 'field__label', 'for': id + '-nota', text: 'Note (facoltative)' }),
          el('textarea', { className: 'input', id: id + '-nota', name: 'nota', rows: '2', maxlength: '500' })
        ]),
        el('button', { type: 'submit', className: 'btn btn--primary btn--small', text: 'Invia la richiesta' })
      ]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (isBusy(form)) return;
        var f = form.elements;
        var quando = f.disponibilita.value.trim();
        if (showErrors(form, quando.length < 3 ? [{ input: f.disponibilita, text: 'Scrivi quando possiamo passare (giorni e orari).' }] : [])) return;
        busy(form, true, 'Invio…');
        api.requestVerification({ place_id: g.place_id, disponibilita: quando, nota: f.nota.value.trim() || null }).then(function () {
          message(note, 'Richiesta inviata per «' + g.places.nome + '». Ti scriviamo qui la data della verifica.', 'ok');
          note.focus();
          load();
        }).catch(function (err) {
          busy(form, false);
          showErrors(form, [{ input: f.disponibilita, text: err.message }]);
        });
      });
      return form;
    }

    function item(g, verifiche) {
      var p = g.places || { nome: 'Luogo non più disponibile' };
      var mine = verifiche.filter(function (v) { return v.place_id === g.place_id; });
      var aperta = mine.filter(function (v) { return v.stato === 'in-attesa' || v.stato === 'fissata'; })[0];
      var ultima = mine[0];
      var sulPosto = p.verifica_livello === 'sul-posto';
      var li = el('li', { className: 'activity owned__item', id: 'locale-' + g.place_id }, [
        el('div', { className: 'activity__head' }, [
          el('h3', { className: 'activity__title' }, [p.id ? el('a', { href: 'luogo.html?id=' + encodeURIComponent(p.id), text: p.nome }) : document.createTextNode(p.nome)]),
          el('span', { className: 'pill state-pill state-pill--' + (g.stato === 'approvato' ? 'approvata' : g.stato === 'in-attesa' ? 'in-attesa' : 'respinta'), text: STATO_GESTORE[g.stato] || g.stato })
        ]),
        p.citta ? el('p', { className: 'place__meta', text: p.citta }) : null
      ]);
      if (g.stato === 'in-attesa') {
        li.appendChild(el('p', { text: 'Ti contatteremo al recapito del locale che hai indicato. Dopo potrai chiedere la verifica sul posto.' }));
        return li;
      }
      if (g.stato !== 'approvato') {
        li.appendChild(el('p', { text: g.motivo ? 'Motivo: ' + g.motivo : 'Per chiarimenti scrivi a ovunqueaccessibile@gmail.com.' }));
        return li;
      }
      /* Quanto è completa la scheda: chi la gestisce sa cosa manca e la completa con una correzione */
      var full = byId[g.place_id];
      if (full) {
        var c = OA.completezza(full);
        var pct = Math.round(c.note / c.totale * 100);
        li.appendChild(el('div', { className: 'completezza' }, [
          el('p', {}, [el('strong', { text: 'Scheda completa al ' + pct + '%' }), document.createTextNode(' (' + c.note + ' voci su ' + c.totale + ')')]),
          el('span', { className: 'completezza__barra', 'aria-hidden': 'true' }, [el('span', { className: 'completezza__pieno completezza__pieno--' + Math.round(pct / 10) })]),
          c.mancano.length ? el('p', { className: 'place__meta', text: 'Da completare: ' + c.mancano.join(', ') + '.' }) : null,
          c.mancano.length ? el('a', { className: 'btn btn--secondary btn--small', href: 'segnala.html?id=' + encodeURIComponent(g.place_id) }, [
            icon('#icon-edit'), document.createTextNode('Completa la scheda'), el('span', { className: 'visually-hidden', text: ' di ' + p.nome })
          ]) : null
        ]));
      }
      if (sulPosto) {
        li.appendChild(el('p', {}, [OA.statusNode(['si', 'Verificato sul posto' + (p.verifica_data ? ' il ' + dateIt(p.verifica_data) : '')])]));
      }
      li.appendChild(el('a', { className: 'btn btn--primary btn--small', href: 'bollino.html?id=' + encodeURIComponent(p.id) }, [
        icon(sulPosto ? '#icon-shield' : '#icon-qr'), document.createTextNode(sulPosto ? 'Bollino per la vetrina' : 'Codice QR per la vetrina'),
        el('span', { className: 'visually-hidden', text: ' di ' + p.nome })
      ]));
      if (aperta) {
        li.appendChild(el('p', {}, [el('strong', { text: STATO_VERIFICA[aperta.stato] }), document.createTextNode(aperta.risposta ? ': ' + aperta.risposta : '.')]));
        li.appendChild(el('p', { className: 'place__meta', text: 'Hai indicato: ' + aperta.disponibilita }));
        if (aperta.stato === 'in-attesa') {
          var del = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [
            document.createTextNode('Ritira la richiesta'), el('span', { className: 'visually-hidden', text: ' per ' + p.nome })
          ]);
          del.addEventListener('click', function () {
            api.withdrawVerification(aperta.id).then(function () {
              message(note, 'Richiesta di verifica per «' + p.nome + '» ritirata.', 'ok');
              note.focus();
              load();
            }).catch(function (err) { message(note, err.message, 'error'); note.focus(); });
          });
          li.appendChild(del);
        }
        return li;
      }
      if (ultima && ultima.stato === 'respinta') {
        li.appendChild(el('p', { text: STATO_VERIFICA.respinta + (ultima.risposta ? ': ' + ultima.risposta : '.') }));
      }
      var form = verificaForm(g);
      var open = el('button', { type: 'button', className: sulPosto ? 'btn btn--secondary btn--small' : 'btn btn--primary btn--small', 'aria-expanded': 'false' }, [
        document.createTextNode(sulPosto ? 'Chiedi una nuova verifica' : 'Richiedi la verifica sul posto'),
        el('span', { className: 'visually-hidden', text: ' per ' + p.nome })
      ]);
      open.addEventListener('click', function () {
        form.hidden = !form.hidden;
        open.setAttribute('aria-expanded', form.hidden ? 'false' : 'true');
        if (!form.hidden) form.elements.disponibilita.focus();
      });
      li.appendChild(open);
      li.appendChild(form);
      return li;
    }

    function load() {
      Promise.all([api.myOwnerships(), api.myVerifications()]).then(function (r) {
        return api.placesByIds(r[0].map(function (g) { return g.place_id; })).catch(function () { return []; })
          .then(function (places) { return r.concat([places]); });
      }).then(function (r) {
        byId = {};
        r[2].forEach(function (x) { byId[x.id] = x; });
        list.textContent = '';
        show($('owned-empty'), !r[0].length);
        r[0].forEach(function (g) { list.appendChild(item(g, r[1])); });
        var target = focusId && $('locale-' + focusId);
        if (target) {
          focusId = null;
          target.scrollIntoView({ block: 'start' });
          var btn = target.querySelector('button[aria-expanded]');
          if (btn) btn.click();
        }
      }).catch(function (err) { message(note, err.message, 'error'); });
    }
    load();
  }

  A.pagine.profilo = initProfilo;
  A.pagine.locali = initLocali;
})();
