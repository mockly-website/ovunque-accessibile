/* Ovunque Accessibile – web-app, segnala un luogo e proponi una correzione (segnala.html; le etichette servono anche a moderazione.html).
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
  var clearErrors = A.clearErrors;
  var focusHeading = A.focusHeading;
  var here = A.here;
  var isBusy = A.isBusy;
  var message = A.message;
  var params = A.params;
  var preparePhoto = A.preparePhoto;
  var show = A.show;
  var showErrors = A.showErrors;

  /* ---------- Segnala un luogo / proponi una correzione ----------
     Il modulo nasce da SCHEMA: le stesse etichette servono al confronto nel pannello di moderazione. */
  var REGIONI = ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia', 'Lazio', 'Liguria',
    'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria',
    'Valle d\'Aosta', 'Veneto'];

  /* Altezza del gradino e corrimano servono solo se ci sono gradini */
  function gradiniPresenti(get) {
    var g = get('misure.ingresso.gradini');
    return g == null || g > 0;
  }

  var SCHEMA = [
    { id: 'luogo', title: 'Il luogo', fields: [
      { path: 'nome', label: 'Nome del luogo', type: 'text', required: true, max: 120, autocomplete: 'organization' },
      { path: 'categoria', label: 'Tipo di luogo', type: 'select', required: true, options: Object.keys(OA.CATEGORIE).map(function (k) { return [k, OA.CATEGORIE[k] + ' (' + OA.ESEMPI_CATEGORIE[k] + ')']; }) },
      { path: 'citta', label: 'Città', type: 'text', required: true, max: 80, autocomplete: 'address-level2' },
      { path: 'indirizzo', label: 'Via e numero civico', type: 'text', required: true, max: 200, autocomplete: 'street-address' },
      { path: 'cap', label: 'CAP', help: 'Si scrive da solo quando scegli l\'indirizzo o il punto sulla mappa.', type: 'text', pattern: '^[0-9]{5}$', patternMsg: 'Il CAP è fatto di 5 cifre.', inputmode: 'numeric', autocomplete: 'postal-code', short: true, auto: true },
      { path: 'provincia', label: 'Sigla della provincia', help: 'Due lettere, per esempio RM. Si scrive da sola dal punto sulla mappa.', type: 'text', pattern: '^[A-Za-z]{2}$', patternMsg: 'La provincia è una sigla di 2 lettere, per esempio RM.', upper: true, short: true, auto: true },
      { path: 'regione', label: 'Regione', type: 'select', options: REGIONI.map(function (r) { return [r, r]; }), auto: true },
      { path: 'descrizione', label: 'Descrizione breve (facoltativa)', help: 'Cosa c\'è e come si entra.', type: 'textarea', max: 1000, own: true },
      { path: 'lat', label: 'Latitudine', type: 'number', required: true, min: 35, max: 48, step: 'any', short: true, coord: true },
      { path: 'lng', label: 'Longitudine', type: 'number', required: true, min: 6, max: 19, step: 'any', short: true, coord: true }
    ] },
    { id: 'ingresso', title: 'Ingresso', intro: 'Serve almeno il numero di gradini. Per il resto lascia «Non so» se non lo sai: lo segneremo come «da verificare».', fields: [
      { path: 'misure.ingresso.gradini', label: 'Quanti gradini per entrare?', help: 'Scrivi 0 se non ce ne sono.', type: 'number', required: true, min: 0, max: 100, short: true, warnAbove: [30, 'più di 30 gradini all\'ingresso sono tanti'] },
      { path: 'misure.ingresso.gradino_cm', label: 'Altezza del gradino più alto', unit: 'cm', type: 'number', min: 1, max: 50, short: true, when: gradiniPresenti, warnAbove: [25, 'un gradino più alto di 25 cm è raro'] },
      { path: 'misure.ingresso.corrimano', label: 'Ci sono corrimano?', type: 'tri', when: gradiniPresenti },
      { path: 'misure.ingresso.rampa', label: 'C\'è una rampa?', type: 'tri' },
      { path: 'misure.ingresso.rampa_pendenza', label: 'Com\'è la rampa?', type: 'choice', options: [['lieve', 'Lieve: in carrozzina si sale da soli'], ['media', 'Media: serve un po\' di forza o una spinta'], ['ripida', 'Ripida: difficile anche con aiuto']], showIf: ['misure.ingresso.rampa', true] },
      { path: 'x.nessuna_porta', label: 'Non c\'è una porta (spiaggia, parco, pontile…)', type: 'checkbox' },
      { path: 'misure.ingresso.porta_cm', label: 'Larghezza della porta', help: 'Lo spazio libero quando è aperta.', unit: 'cm', type: 'number', min: 40, max: 300, short: true, showIf: ['x.nessuna_porta', false], warnBelow: [60, 'una porta più stretta di 60 cm è molto stretta'] },
      { path: 'misure.ingresso.nota', label: 'Note sull\'ingresso', type: 'textarea', max: 500, more: true },
      { path: 'misure.ingresso.nota_porta', label: 'Note sulla porta', type: 'textarea', max: 500, showIf: ['x.nessuna_porta', false], more: true }
    ] },
    { id: 'spazi', title: 'Spazi e percorsi', fields: [
      { path: 'misure.spazi.valore', label: 'Gli spazi interni sono accessibili?', type: 'choice', options: [['tutti', 'Sì, tutti'], ['parziale', 'Solo in parte'], ['no', 'No']] },
      { path: 'misure.spazi.nota', label: 'Note su spazi e percorsi', type: 'textarea', max: 500, more: true }
    ] },
    { id: 'piani', title: 'Piani e ascensore', fields: [
      { path: 'misure.piani.valore', label: 'Come si raggiungono i piani?', type: 'choice', options: [['uno', 'È tutto su un piano'], ['ascensore', 'C\'è un ascensore'], ['scale', 'Solo con le scale']] },
      { path: 'x.ascensore_l', label: 'Larghezza della cabina', unit: 'cm', type: 'number', min: 50, max: 400, short: true, showIf: ['misure.piani.valore', 'ascensore'], warnBelow: [70, 'una cabina larga meno di 70 cm è molto piccola'] },
      { path: 'x.ascensore_p', label: 'Profondità della cabina', unit: 'cm', type: 'number', min: 50, max: 400, short: true, showIf: ['misure.piani.valore', 'ascensore'], warnBelow: [70, 'una cabina profonda meno di 70 cm è molto piccola'] },
      { path: 'misure.piani.corrimano_scale', label: 'Le scale hanno il corrimano?', type: 'tri', showIf: ['misure.piani.valore', 'scale'] },
      { path: 'misure.piani.nota', label: 'Note su piani e ascensore', type: 'textarea', max: 500, more: true }
    ] },
    { id: 'bagno', title: 'Bagno', fields: [
      { path: 'misure.bagno.valore', label: 'C\'è un bagno accessibile?', type: 'choice', options: [['attrezzato', 'Sì, attrezzato per persone con disabilità'], ['non-attrezzato', 'C\'è, ma non è attrezzato'], ['assente', 'No, nessun bagno accessibile'], ['non-previsto', 'In questo luogo non è previsto un bagno']] },
      { path: 'misure.bagno.rotazione_cm', label: 'Spazio per girarsi con la carrozzina', help: 'Il diametro del cerchio libero davanti al WC.', unit: 'cm', type: 'number', min: 50, max: 400, short: true, showIf: ['misure.bagno.valore', 'attrezzato'] },
      { path: 'misure.bagno.maniglioni', label: 'Ci sono i maniglioni?', type: 'tri', showIf: ['misure.bagno.valore', 'attrezzato'] },
      { path: 'misure.bagno.nota', label: 'Note sul bagno', type: 'textarea', max: 500, more: true }
    ] },
    { id: 'altre', title: 'Altre informazioni', optional: true, fields: [
      { path: 'facoltativi.porta_tipo', label: 'Com\'è la porta?', type: 'choice', options: [['automatica', 'Automatica'], ['manuale', 'Da aprire a mano'], ['pesante', 'Pesante da aprire']], showIf: ['x.nessuna_porta', false] },
      { path: 'facoltativi.pavimento', label: 'Com\'è il pavimento?', type: 'choice', options: [['liscio', 'Liscio'], ['irregolare', 'Irregolare (sampietrini, legno, sabbia)'], ['ghiaia', 'Ghiaia']] },
      { path: 'facoltativi.sedute', label: 'Ci sono sedute lungo il percorso?', type: 'tri' },
      { path: 'facoltativi.parcheggio.posti', label: 'Ci sono posti auto riservati vicino?', type: 'tri' },
      { path: 'facoltativi.parcheggio.distanza_m', label: 'Distanza del parcheggio dall\'ingresso', unit: 'metri', type: 'number', min: 0, max: 2000, short: true, showIf: ['facoltativi.parcheggio.posti', true] },
      { path: 'facoltativi.parcheggio.nota', label: 'Note sul parcheggio', type: 'textarea', max: 500 },
      { path: 'facoltativi.assistenza.valore', label: 'Il personale offre assistenza?', type: 'tri' },
      { path: 'facoltativi.assistenza.nota', label: 'Note sull\'assistenza', type: 'textarea', max: 500 }
    ] },
    /* Vista e udito spente per ora (vedi ORDINE_ESIGENZE in oa-core.js): la sezione resta nel modulo ma nascosta, così
       le risposte già date si conservano quando qualcuno corregge una scheda */
    { id: 'sensi', title: 'Vista e udito', optional: true, spenta: true, intro: 'Per chi non vede o non sente bene. Rispondi solo a quello che sai.', fields: [
      { path: 'facoltativi.vista.cane_guida', label: 'I cani guida sono ammessi?', type: 'tri' },
      { path: 'facoltativi.vista.percorso_tattile', label: 'C\'è un percorso tattile (strisce in rilievo sul pavimento)?', type: 'tri' },
      { path: 'facoltativi.vista.mappa_tattile', label: 'C\'è una mappa tattile o un plastico?', type: 'tri' },
      { path: 'facoltativi.vista.accompagnamento', label: 'Il personale accompagna chi non vede?', type: 'tri' },
      { path: 'facoltativi.vista.braille', label: 'Ci sono menu, cartelli o didascalie in Braille?', type: 'tri' },
      { path: 'facoltativi.vista.grandi_caratteri', label: 'Ci sono testi a grandi caratteri?', type: 'tri' },
      { path: 'facoltativi.vista.audioguida', label: 'C\'è un\'audioguida o l\'audiodescrizione?', type: 'tri' },
      { path: 'facoltativi.vista.contrasto', label: 'Gradini e ostacoli sono segnalati con colori a contrasto?', type: 'tri' },
      { path: 'facoltativi.vista.nota', label: 'Note per chi non vede', type: 'textarea', max: 500 },
      { path: 'facoltativi.udito.lis', label: 'Qualcuno del personale conosce la LIS (lingua dei segni italiana)?', type: 'tri' },
      { path: 'facoltativi.udito.scritto', label: 'Si può prenotare o chiedere per scritto (chat, email, SMS)?', type: 'tri' },
      { path: 'facoltativi.udito.anello', label: 'C\'è un anello magnetico per gli apparecchi acustici?', type: 'tri' },
      { path: 'facoltativi.udito.sottotitoli', label: 'Video e spettacoli hanno i sottotitoli?', type: 'tri' },
      { path: 'facoltativi.udito.avvisi_visivi', label: 'Avvisi e allarmi sono anche luminosi o scritti?', type: 'tri' },
      { path: 'facoltativi.udito.nota', label: 'Note per chi non sente', type: 'textarea', max: 500 }
    ] },
    { id: 'dettagli', title: 'Dettagli per tipo di luogo', optional: true, fields: [
      { path: 'dettagli.tavoli_cm', label: 'Altezza dei tavoli', unit: 'cm', type: 'number', min: 40, max: 130, short: true, cat: ['ristorante'] },
      { path: 'dettagli.spazio_gambe', label: 'C\'è spazio per le gambe sotto il tavolo?', type: 'tri', cat: ['ristorante'] },
      { path: 'dettagli.camere_accessibili', label: 'Quante camere accessibili?', type: 'number', min: 0, max: 500, short: true, cat: ['hotel'] },
      { path: 'dettagli.doccia_filo', label: 'Doccia a filo pavimento?', type: 'tri', cat: ['hotel'] },
      { path: 'dettagli.passerella', label: 'Passerella fino all\'acqua?', type: 'tri', cat: ['spiaggia'] },
      { path: 'dettagli.sedia_mare', label: 'Sedia da mare disponibile?', type: 'tri', cat: ['spiaggia'] },
      { path: 'dettagli.posti_carrozzina', label: 'Posti per carrozzina in sala', type: 'number', min: 0, max: 500, short: true, cat: ['cultura'] },
      { path: 'dettagli.accompagnatore_gratis', label: 'Biglietto gratuito per l\'accompagnatore?', type: 'tri', cat: ['cultura', 'museo'] },
      { path: 'dettagli.assistenza_prenotabile', label: 'Assistenza da prenotare?', type: 'tri', cat: ['trasporti'] },
      { path: 'dettagli.preavviso_ore', label: 'Preavviso per l\'assistenza', unit: 'ore', type: 'number', min: 0, max: 168, short: true, cat: ['trasporti'] },
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
  LABELS['misure.ingresso.rampa_pct'] = 'Ingresso – Pendenza della rampa (%)';
  /* Testo delle scelte (es. «lieve» → «Lieve: in carrozzina si sale da soli») per il confronto dei moderatori */
  var OPTION_LABELS = {};
  FIELDS.forEach(function (f) {
    if (!f.options) return;
    OPTION_LABELS[f.path] = {};
    f.options.forEach(function (o) { OPTION_LABELS[f.path][o[0]] = o[1]; });
  });
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
    /* Coordinate, CAP, provincia e regione non si scrivono: li ricava la mappa dal punto (initPicker) */
    if (f.coord || f.auto) {
      return el('div', { className: 'field--auto', 'data-path': f.path }, [el('input', { type: 'hidden', id: id, name: f.path })]);
    }
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
      if (f.when) visible = visible && f.when(function (path) { return formValue(form, FIELDS.filter(function (g) { return g.path === path; })[0]); });
      if (f.cat) visible = f.cat.indexOf(cat) !== -1;
      node.hidden = !visible;
    });
    var det = $('sec-dettagli');
    var anyDet = FIELDS.some(function (f) { return f.cat && f.cat.indexOf(cat) !== -1; });
    det.hidden = !anyDet;
    $('sec-dettagli-title').textContent = 'Dettagli: ' + (OA.TITOLO_DETTAGLI[cat] || 'tipo di luogo').toLowerCase();
  }

  function placeToForm(form, p) {
    /* Il percorso tattile prima stava nei dettagli di musei e parchi: ora è una voce di «Vista e udito» */
    var fac = JSON.parse(JSON.stringify(p.facoltativi || {}));
    if (p.dettagli && p.dettagli.percorso_tattile != null && !(fac.vista && fac.vista.percorso_tattile != null)) {
      fac.vista = Object.assign({}, fac.vista, { percorso_tattile: p.dettagli.percorso_tattile });
    }
    var src = {
      nome: p.nome, categoria: p.categoria, indirizzo: p.indirizzo, cap: p.cap, citta: p.citta, provincia: p.provincia,
      regione: p.regione, descrizione: p.descrizione, lat: p.lat, lng: p.lng,
      misure: p.misure, facoltativi: fac, dettagli: p.dettagli || {},
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
      /* Le tendine con qualcosa di già compilato si aprono, così si vede cosa c'è */
      var d = v != null && v !== '' && v !== false ? form.querySelector('[data-path="' + f.path + '"]').closest('details') : null;
      if (d) d.open = true;
    });
    /* La pendenza misurata in % (schede verificate) resta, finché non si cambia la rampa */
    form.oaKeep = { rampa_pct: p.misure.ingresso.rampa_pct, rampa_pendenza: p.misure.ingresso.rampa_pendenza || null };
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
      var input = f.type === 'tri' || f.type === 'choice' ? node : (f.coord && $('pick-map')) || $(fid(f.path));
      if (f.coord && errors.some(function (e) { return e.input === input; })) return;   /* un solo errore per il punto */
      if (f.required && (v == null || v === '')) {
        errors.push({ input: input, text: f.coord ? 'Indica dov\'è il luogo: tocca la mappa sull\'ingresso o premi «Trova sulla mappa».' : 'Compila «' + f.label + '».' });
        return;
      }
      if (f.coord && v != null && (isNaN(v) || v < f.min || v > f.max)) {
        errors.push({ input: input, text: 'Il punto è fuori dall\'Italia: tocca la mappa sull\'ingresso del luogo.' });
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

    /* «CABRAS» o «cabras» → «Cabras» (nomi di città scritti tutti maiuscoli o minuscoli) */
    if (out.citta && (out.citta === out.citta.toUpperCase() || out.citta === out.citta.toLowerCase())) {
      out.citta = out.citta.toLowerCase().replace(/(^|[\s'’-])(\S)/g, function (m, sep, ch) { return sep + ch.toUpperCase(); });
    }
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
    var keep = form.oaKeep || {};
    out.misure.ingresso.rampa_pct = out.misure.ingresso.rampa === true && keep.rampa_pct != null &&
      (out.misure.ingresso.rampa_pendenza || null) === keep.rampa_pendenza ? keep.rampa_pct : null;
    if (out.misure.ingresso.rampa !== true) out.misure.ingresso.rampa_pendenza = null;
    if (out.misure.ingresso.gradini === 0) {
      out.misure.ingresso.gradino_cm = null;
      out.misure.ingresso.corrimano = null;
    }
    /* Scheda minima: senza almeno una risposta su spazi, piani o bagno la scheda resterebbe vuota */
    if (out.misure.spazi.valore == null && out.misure.piani.valore == null && out.misure.bagno.valore == null) {
      errors.push({ input: form.querySelector('[data-path="misure.spazi.valore"]'), text: 'Rispondi ad almeno una domanda tra «Spazi e percorsi», «Piani e ascensore» e «Bagno»: senza, la scheda resterebbe vuota.' });
    }
    /* Le voci facoltative vuote non si salvano */
    ['parcheggio', 'assistenza', 'vista', 'udito'].forEach(function (k) {
      var o = out.facoltativi[k];
      if (o && Object.keys(o).every(function (kk) { return o[kk] == null; })) delete out.facoltativi[k];
    });
    Object.keys(out.facoltativi).forEach(function (k) { if (out.facoltativi[k] == null) delete out.facoltativi[k]; });
    Object.keys(out.dettagli).forEach(function (k) { if (out.dettagli[k] == null) delete out.dettagli[k]; });
    return { dati: out, errors: errors };
  }

  /* Nessuna esigenza con un giudizio almeno «in parte» (le esigenze di vista e udito senza informazioni non contano) */
  var prove = 0;
  function nessunoPuoEntrare(dati) {
    var p = Object.assign({ id: 'segnalazione-' + (++prove) + '-' + Date.now() }, dati);
    return OA.ORDINE_ESIGENZE.every(function (e) { var g = OA.giudizio(p, e); return g === 'no' || g === 'nv'; });
  }

  /* Valori nei limiti ma insoliti (es. porta di 45 cm): non bloccano, chiedono solo di ricontrollare */
  function unusualValues(form) {
    var out = [];
    FIELDS.forEach(function (f) {
      if (!f.warnAbove && !f.warnBelow) return;
      var node = form.querySelector('[data-path="' + f.path + '"]');
      if (node.hidden) return;
      var v = formValue(form, f);
      if (v == null) return;
      var w = f.warnAbove && v > f.warnAbove[0] ? f.warnAbove : (f.warnBelow && v < f.warnBelow[0] ? f.warnBelow : null);
      if (w) out.push({ input: $(fid(f.path)), text: '«' + f.label + '»: hai scritto ' + v + (f.unit ? ' ' + f.unit : '') + ', ma ' + w[1] + '. È giusto?' });
    });
    return out;
  }

  /* Al massimo 5 foto per segnalazione */
  var MAX_FOTO = 5;

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
          return preparePhoto(file, 1600).then(function (blob) {
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

  /* Segnala a passi: quattro schermate (Il luogo · Ingresso · Dentro · In più) invece di un modulo lunghissimo.
     «Avanti» controlla solo i campi del passo; all'invio, se c'è un errore, si torna al passo che lo contiene.
     Invio nei campi di un passo che non è l'ultimo vale «Avanti». I passi già visti si riaprono dall'indicatore. */
  var PASSI = [
    { titolo: 'Il luogo', sezioni: ['sec-luogo'] },
    { titolo: 'Ingresso', sezioni: ['sec-ingresso'] },
    { titolo: 'Dentro', sezioni: ['sec-spazi', 'sec-piani', 'sec-bagno'] },
    { titolo: 'In più', sezioni: ['sec-descrizione', 'sec-altre', 'sec-sensi', 'sec-dettagli', 'sec-foto', 'sec-nota'] }
  ];

  function initWizard(form, box, tutti) {
    var submit = form.querySelector('[type="submit"]');
    var cur = 0;
    var maxSeen = tutti ? PASSI.length - 1 : 0;
    var steps = PASSI.map(function (p, i) {
      var step = el('div', { className: 'wizard__step stack', 'data-step': String(i) });
      p.sezioni.forEach(function (id) { if ($(id)) step.appendChild($(id)); });
      box.appendChild(step);
      return step;
    });
    var dots = PASSI.map(function (p, i) {
      var b = el('button', { type: 'button', className: 'wizard__dot' }, [
        el('span', { className: 'wizard__num', 'aria-hidden': 'true', text: String(i + 1) }),
        el('span', { className: 'wizard__name', text: p.titolo })
      ]);
      b.addEventListener('click', function () { go(i, true); });
      return b;
    });
    var bar = el('ol', { className: 'wizard__steps', 'aria-label': 'Passi della segnalazione' }, dots.map(function (b) { return el('li', {}, [b]); }));
    var count = el('p', { className: 'visually-hidden', role: 'status' });
    var back = el('button', { type: 'button', className: 'btn btn--secondary wizard__back', text: 'Indietro' });
    var next = el('button', { type: 'button', className: 'btn btn--primary wizard__next', text: 'Avanti' });
    form.insertBefore(count, form.firstChild);
    form.insertBefore(bar, count);
    form.appendChild(el('div', { className: 'wizard__nav' }, [back, next, submit]));

    function go(i, focus) {
      if (i < 0 || i >= PASSI.length || i > maxSeen) return;
      cur = i;
      steps.forEach(function (s, k) { s.hidden = k !== i; });
      dots.forEach(function (b, k) {
        if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        b.classList.toggle('is-done', k < i);
        b.disabled = k > maxSeen;
      });
      count.textContent = 'Passo ' + (i + 1) + ' di ' + PASSI.length + ': ' + PASSI[i].titolo;
      back.hidden = i === 0;
      next.hidden = i === PASSI.length - 1;
      submit.hidden = i !== PASSI.length - 1;
      window.dispatchEvent(new Event('resize'));   /* Leaflet ricalcola la mappa del punto, se torna visibile */
      if (focus) {
        form.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        var h = steps[i].querySelector('h2');
        if (h) {
          if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
          h.focus({ preventScroll: true });
        }
      }
    }

    back.addEventListener('click', function () { clearErrors(form); go(cur - 1, true); });
    next.addEventListener('click', function () {
      var errs = collect(form).errors.filter(function (e) { return steps[cur].contains(e.input); });
      if (showErrors(form, errs)) return;
      maxSeen = Math.max(maxSeen, cur + 1);
      go(cur + 1, true);
    });
    /* Invio in un campo prima dell'ultimo passo: «Avanti», non l'invio della segnalazione */
    form.addEventListener('submit', function (ev) {
      if (cur === PASSI.length - 1) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      next.click();
    });
    go(0, false);

    return {
      /* Prima di mostrare gli errori dell'invio: apre il passo del primo campo sbagliato */
      reveal: function (errors) {
        if (!errors.length) return;
        var k = steps.findIndex(function (s) { return s.contains(errors[0].input); });
        if (k >= 0 && k !== cur) { maxSeen = Math.max(maxSeen, k); go(k, false); }
      }
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
      var main = sec.fields.filter(function (f) { return !f.more && !f.coord && !f.auto && !f.own; });
      var more = sec.fields.filter(function (f) { return f.more; });
      var body = [
        sec.intro ? el('p', { className: 'field__help', text: sec.intro }) : null,
        el('div', { className: 'form-grid' }, main.map(fieldNode)),
        more.length ? el('details', { className: 'more' }, [
          el('summary', { className: 'more__toggle', text: more.length === 1 ? 'Aggiungi una nota' : 'Aggiungi delle note' }),
          el('div', { className: 'form-grid more__body' }, more.map(fieldNode))
        ]) : null
      ];
      if (sec.id === 'luogo') {
        body.push(el('div', { className: 'pick field' }, [
          el('p', { className: 'field__help', id: 'pick-help', text: 'Tocca la mappa sull\'ingresso o trascina il segnaposto.' }),
          el('div', { className: 'pick__actions' }, [
            el('button', { type: 'button', id: 'pick-find', className: 'btn btn--primary btn--small' }, [icon('#icon-search'), el('span', { text: 'Trova sulla mappa' })]),
            el('button', { type: 'button', id: 'pick-locate', className: 'btn btn--secondary btn--small' }, [icon('#icon-locate'), el('span', { text: 'La mia posizione' })])
          ]),
          el('p', { id: 'pick-status', className: 'pick__status', role: 'status' }),
          el('div', { id: 'pick-suggest', className: 'pick__suggest', hidden: '' }),
          el('div', { id: 'pick-map', className: 'pick__map', role: 'region', 'aria-label': 'Mappa per indicare la posizione del luogo' }),
          el('div', {}, sec.fields.filter(function (f) { return f.coord || f.auto; }).map(fieldNode))
        ]));
      }
      /* Le sezioni tutte facoltative sono chiuse in una tendina */
      box.appendChild(sec.optional
        ? el('section', { className: 'card form-section form-section--optional', id: 'sec-' + sec.id, 'aria-labelledby': titleId }, [
            el('details', { className: 'more more--section' }, [
              el('summary', { className: 'more__toggle more__toggle--section' }, [el('span', { id: titleId, text: sec.title }), el('span', { className: 'more__hint', text: ' (facoltative)' })]),
              el('div', { className: 'more__body stack' }, body)
            ])
          ])
        : el('section', { className: 'card form-section', id: 'sec-' + sec.id, 'aria-labelledby': titleId }, [el('h2', { id: titleId, text: sec.title })].concat(body)));
    });
    /* La descrizione è facoltativa: sta nel passo «In più», non nel primo */
    box.appendChild(el('section', { className: 'card form-section', id: 'sec-descrizione', 'aria-labelledby': 'sec-descrizione-title' }, [
      el('h2', { id: 'sec-descrizione-title', text: 'Descrizione del luogo' }),
      el('div', { className: 'form-grid' }, SCHEMA[0].fields.filter(function (f) { return f.own; }).map(fieldNode))
    ]));
    SCHEMA.forEach(function (sec) { if (sec.spenta) $('sec-' + sec.id).hidden = true; });
    var photosUi = photoSection(box);
    var wizard = initWizard(form, box, !!id);
    function stepErrors(f, errors, title) {
      wizard.reveal(errors);
      return showErrors(f, errors, title);
    }
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
        picker.set(p.lat, p.lng);
        initial = JSON.stringify(collect(form).dati);
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (isBusy(form)) return;
      var res = collect(form);
      res.errors = res.errors.concat(photosUi.errors());
      /* Solo luoghi accessibili, almeno in parte, per qualcuno: un luogo nuovo «non accessibile» per tutte e tre
         le esigenze non si segnala (una correzione sì: il moderatore vede che il luogo sparirà dalla mappa) */
      if (!res.errors.length && !place && nessunoPuoEntrare(res.dati)) {
        res.errors.push({ input: form.querySelector('[data-path="misure.ingresso.gradini"]').querySelector('input') || $(fid('misure.ingresso.gradini')),
          text: 'Con queste risposte il luogo non è accessibile per nessuna esigenza. Ovunque Accessibile raccoglie solo luoghi accessibili, almeno in parte: controlla ingresso e spazi interni.' });
      }
      if (!res.errors.length && initial && JSON.stringify(res.dati) === initial && !photosUi.items().length) {
        res.errors.push({ input: $(fid('nome')), text: 'Non hai cambiato niente: modifica le voci che non corrispondono più al luogo.' });
      }
      if (stepErrors(form, res.errors)) return;
      /* Valori possibili ma strani: si chiede di controllarli, al secondo invio passano */
      var warns = unusualValues(form);
      var sigW = JSON.stringify(warns.map(function (w) { return w.text; }));
      if (warns.length && form.dataset.warned !== sigW) {
        form.dataset.warned = sigW;
        stepErrors(form, warns, warns.length === 1 ? 'Controlla questo valore' : 'Controlla questi valori');
        form.querySelector('.error-summary').appendChild(el('p', { text: 'Se è tutto giusto, premi di nuovo «Invia la segnalazione».' }));
        return;
      }
      var nota = form.elements.nota_moderatori.value.trim() || null;
      busy(form, true, 'Controllo la posizione…');
      var items = photosUi.items();
      var failed = 0;
      var stop = false;
      farFromCity(res.dati).then(function (km) {
        var sigG = [res.dati.lat, res.dati.lng, res.dati.citta, res.dati.cap].join('|');
        if (km && form.dataset.farOk !== sigG) {
          stop = true;
          form.dataset.farOk = sigG;
          busy(form, false);
          stepErrors(form, [{ input: $('pick-map'), text: 'Il punto sulla mappa è a circa ' + km + ' km da ' + res.dati.citta + ': controlla la posizione o il nome della città.' }], 'Controlla la posizione');
          form.querySelector('.error-summary').appendChild(el('p', { text: 'Se il punto è giusto, premi di nuovo «Invia la segnalazione».' }));
          return;
        }
        form.querySelector('[type="submit"]').textContent = 'Invio…';
        return ready.then(function () {
          return api.propose({ tipo: place ? 'correzione' : 'nuovo', place_id: place ? place.id : null, dati: res.dati, nota: nota });
        });
      }).then(function (propostaId) {
        if (stop) return;
        /* Le foto una alla volta, dopo la proposta: se una non passa, la segnalazione resta comunque inviata */
        return items.reduce(function (prev, item, i) {
          return prev.then(function () {
            form.querySelector('[type="submit"]').textContent = 'Invio della foto ' + (i + 1) + ' di ' + items.length + '…';
            return api.uploadPhoto(propostaId, item.blob, item.input.value.trim()).catch(function () { failed++; });
          });
        }, Promise.resolve());
      }).then(function () {
        if (stop) return;
        show(form, false);
        if (failed) message($('proposal-photo-note'), failed === 1 ? 'Una foto non è stata caricata. La segnalazione è arrivata: se vuoi, rimandaci la foto con una correzione.' : failed + ' foto non sono state caricate. La segnalazione è arrivata: se vuoi, rimandaci le foto con una correzione.', 'error');
        show($('proposal-done'), true);
        focusHeading($('proposal-done-title'));
      }).catch(function (err) {
        busy(form, false);
        stepErrors(form, [{ input: $(fid('nome')), text: err.message }]);
      });
    });
  }

  /* Ricerca degli indirizzi con Nominatim (OpenStreetMap): parte solo da un pulsante, dal tocco sulla mappa o dal
     controllo all'invio; invia solo l'indirizzo o il punto del luogo, una richiesta al secondo come chiedono le regole
     d'uso del servizio. undefined = il servizio non risponde, null = non trovato. */
  var GEO_URL = 'https://nominatim.openstreetmap.org/search';
  var GEO_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
  var GEO_MAX_KM = 25;
  var PICK_ZOOM = 15;            /* da questo ingrandimento in su un tocco mette il punto */
  var geoCache = {};
  var geoQueue = Promise.resolve();

  function nominatim(url, q) {
    var key = url + JSON.stringify(q);
    if (geoCache[key]) return geoCache[key];
    var params = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'it', addressdetails: '1' });
    Object.keys(q).forEach(function (k) { if (q[k] != null && q[k] !== '') params.set(k, q[k]); });
    var run = geoQueue.then(function () {
      return fetch(url + '?' + params.toString(), { credentials: 'omit' });
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return undefined; });
    geoQueue = run.then(function () { return new Promise(function (res) { setTimeout(res, 1100); }); });
    geoCache[key] = run;
    run.then(function (v) { if (v === undefined) delete geoCache[key]; });
    return run;
  }

  function geocode(q) {
    return nominatim(GEO_URL, Object.assign({ limit: '1', countrycodes: 'it' }, q)).then(function (a) {
      if (a === undefined) return undefined;
      return a && a[0] ? { lat: Number(a[0].lat), lng: Number(a[0].lon), nome: a[0].display_name, address: a[0].address || {} } : null;
    });
  }

  function reverseGeocode(lat, lng) {
    return nominatim(GEO_REVERSE, { lat: lat.toFixed(6), lon: lng.toFixed(6), zoom: '18' }).then(function (r) {
      if (r === undefined) return undefined;
      return r && r.address && r.address.country_code === 'it' ? r.address : null;
    });
  }

  /* «Sardigna/Sardegna», «Trentino-Alto Adige/Südtirol» → la regione come la scriviamo noi (o null) */
  function regionName(state) {
    var parts = String(state || '').split('/').map(OA.normalize);
    return REGIONI.filter(function (r) {
      var k = OA.normalize(r).slice(0, 6);
      return parts.some(function (x) { return x.indexOf(k) === 0; });
    })[0] || null;
  }

  /* Indirizzo di Nominatim → campi del modulo (via e civico, città, CAP, sigla della provincia, regione) */
  function addressParts(a) {
    var via = a.road || a.pedestrian || a.footway || a.square || a.path || a.cycleway || a.place || '';
    var regione = regionName(a.state);
    var prov = String(a['ISO3166-2-lvl6'] || '').replace(/^IT-/, '');
    return {
      indirizzo: via ? via + (a.house_number ? ' ' + a.house_number : '') : '',
      citta: a.city || a.town || a.village || a.municipality || '',
      cap: /^[0-9]{5}$/.test(a.postcode || '') ? a.postcode : '',
      provincia: /^[A-Z]{2}$/.test(prov) ? prov : '',
      regione: regione
    };
  }

  /* «Via Roma, n. 5» → «Via Roma 5»: Nominatim capisce meglio */
  function cleanStreet(v) {
    return v.replace(/\b(n|nr|num|civico)\.?\s*(?=\d)/gi, '').replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* → null se il punto è vicino alla città (o non si può controllare), altrimenti i km di distanza */
  function farFromCity(dati) {
    if (dati.lat == null || dati.lng == null || !dati.citta) return Promise.resolve(null);
    return geocode({ city: dati.citta, postalcode: dati.cap }).then(function (c) {
      if (!c && dati.cap) return geocode({ city: dati.citta });
      return c;
    }).then(function (c) {
      if (!c) return null;
      var km = OA.distanceKm(c, { lat: dati.lat, lng: dati.lng });
      return km > GEO_MAX_KM ? Math.round(km) : null;
    });
  }

  /* Suggerimenti mentre si scrive la via: Photon (komoot, Germania), fatto per il completamento automatico con i dati di
     OpenStreetMap (Nominatim per regolamento non lo permette). Parte da 3 lettere, dopo una pausa di 350 ms, invia solo il
     testo scritto (più la città, se c'è). Elenco accessibile: combobox ARIA 1.2, frecce, Invio, Esc, tocco. */
  var PHOTON_URL = 'https://photon.komoot.io/api/';
  var ITALIA_BBOX = '6.6,35.4,18.6,47.1';

  function addressSuggestions(input, cityInput, onPick, bias) {
    var box = input.closest('.field');
    var listId = 'addr-suggest';
    var list = el('ul', { id: listId, className: 'suggest', role: 'listbox', 'aria-label': 'Indirizzi suggeriti', hidden: '' });
    var live = el('p', { className: 'visually-hidden', role: 'status' });
    var items = [];
    var active = -1;
    var timer = null;
    var ctrl = null;
    var lastQ = '';

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('autocomplete', 'off');
    box.classList.add('field--suggest');
    box.appendChild(list);
    box.appendChild(live);

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function highlight(i) {
      active = i;
      [].forEach.call(list.children, function (li, j) { li.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      if (i >= 0) {
        input.setAttribute('aria-activedescendant', listId + '-' + i);
        list.children[i].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function pick(i) {
      var sug = items[i];
      close();
      if (!sug) return;
      lastQ = sug.indirizzo;
      onPick(sug);
    }

    function render(found) {
      items = found;
      list.textContent = '';
      if (!found.length) {
        close();
        live.textContent = 'Nessun indirizzo suggerito: puoi scriverlo per intero e premere «Trova l\'indirizzo sulla mappa».';
        return;
      }
      found.forEach(function (sug, i) {
        var li = el('li', { id: listId + '-' + i, role: 'option', 'aria-selected': 'false', className: 'suggest__item' }, [
          el('span', { className: 'suggest__main', text: sug.indirizzo }),
          el('span', { className: 'suggest__sub', text: sug.luogo })
        ]);
        /* mousedown, non click: il campo non perde il focus prima della scelta */
        li.addEventListener('mousedown', function (ev) { ev.preventDefault(); pick(i); });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      highlight(-1);
      live.textContent = found.length === 1 ? '1 indirizzo suggerito: freccia giù per sceglierlo.' : found.length + ' indirizzi suggeriti: usa le frecce per sceglierne uno.';
    }

    function search() {
      var q = input.value.trim();
      if (q.length < 3 || q === lastQ) { if (q.length < 3) close(); return; }
      lastQ = q;
      var full = q + (cityInput.value.trim() ? ' ' + cityInput.value.trim() : '');
      var params = new URLSearchParams({ q: full, limit: '5', bbox: ITALIA_BBOX });
      params.append('layer', 'house');
      params.append('layer', 'street');
      var c = bias();
      if (c) { params.set('lat', c.lat.toFixed(3)); params.set('lon', c.lng.toFixed(3)); }
      if (ctrl) ctrl.abort();
      ctrl = window.AbortController ? new AbortController() : null;
      fetch(PHOTON_URL + '?' + params.toString(), { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : { features: [] }; })
        .then(function (data) {
          if (input.value.trim() !== q) return;          /* nel frattempo si è scritto altro */
          var seen = {};
          render((data.features || []).filter(function (f) {
            return f.properties && f.properties.countrycode === 'IT' && (f.properties.street || f.properties.name);
          }).map(function (f) {
            var pr = f.properties;
            var via = pr.street || pr.name;
            var indirizzo = via + (pr.housenumber ? ' ' + pr.housenumber : '');
            var citta = pr.city || pr.town || pr.village || pr.county || '';
            return {
              indirizzo: indirizzo, citta: citta, civico: !!pr.housenumber,
              cap: /^[0-9]{5}$/.test(pr.postcode || '') ? pr.postcode : '',
              luogo: [pr.postcode, citta].filter(Boolean).join(' ') + (regionName(pr.state) ? ' (' + regionName(pr.state) + ')' : ''),
              testo: indirizzo + (citta ? ', ' + citta : ''),
              lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0]
            };
          }).filter(function (sug) {
            var k = sug.testo + sug.cap;
            if (seen[k]) return false;
            seen[k] = true;
            return true;
          }));
        })
        .catch(function () { /* senza suggerimenti resta «Trova l'indirizzo sulla mappa» */ });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(search, 350);
    });
    input.addEventListener('keydown', function (ev) {
      if (list.hidden) {
        if (ev.key === 'ArrowDown' && items.length) { ev.preventDefault(); list.hidden = false; input.setAttribute('aria-expanded', 'true'); highlight(0); }
        return;
      }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); highlight(Math.min(active + 1, items.length - 1)); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); highlight(Math.max(active - 1, -1)); }
      else if (ev.key === 'Enter' && active >= 0) { ev.preventDefault(); pick(active); }
      else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
  }

  /* Mappa per indicare la posizione. Si arriva al punto in quattro modi: «Trova l'indirizzo sulla mappa» (anche con Invio
     nei campi dell'indirizzo), tocco sulla mappa, segnaposto trascinato, «La mia posizione»; oppure con le coordinate.
     Quando il punto arriva dalla mappa, l'app propone l'indirizzo di quel punto (e lo scrive da sola se i campi sono vuoti). */
  function initPicker(form) {
    var latIn = $(fid('lat'));
    var lngIn = $(fid('lng'));
    var status = $('pick-status');
    var suggest = $('pick-suggest');
    var mapBox = $('pick-map');
    var map = OA.createMap(mapBox, { zoomControl: true, dueDita: true, doubleClickZoom: false });   /* qui ogni tocco serve a mettere il punto */
    var marker = null;
    var asked = 0;

    function field(path) {
      return $(fid(path));
    }

    function fill(parts, all) {
      ['indirizzo', 'citta', 'cap', 'provincia', 'regione'].forEach(function (k) {
        var input = field(k);
        if (parts[k] && (all || !input.value.trim())) input.value = parts[k];
      });
    }

    /* CAP, provincia e regione dipendono dal punto: si riscrivono ogni volta che il punto cambia */
    function derived(parts) {
      var done = [];
      ['cap', 'provincia', 'regione'].forEach(function (k) {
        if (!parts[k]) return;
        field(k).value = parts[k];
        done.push(parts[k]);
      });
      return done.length ? ' CAP, provincia e regione presi dal punto: ' + done.join(', ') + '.' : '';
    }

    function placeMarker(lat, lng) {
      if (!map) return;
      if (!marker) {
        marker = L.marker([lat, lng], { draggable: true, keyboard: false, autoPan: true, icon: OA.pinIcon('nv'), title: 'Posizione del luogo: trascina per spostarla' }).addTo(map);
        marker.on('dragend', function () {
          var ll = marker.getLatLng();
          set(ll.lat, ll.lng, 'mappa');
        });
      } else {
        marker.setLatLng([lat, lng]);
      }
    }

    /* origine: 'mappa' (tocco, trascinamento, mia posizione, coordinate scritte) → propone anche via e città;
       'indirizzo' (ricerca) e 'scelta' (suggerimento) → via e città le ha già date chi scrive; msg: testo da mostrare;
       'iniziale' (scheda da correggere) → niente, i dati della scheda restano com'erano */
    function set(lat, lng, origine, zoom, msg) {
      lat = Math.round(lat * 1e6) / 1e6;
      lng = Math.round(lng * 1e6) / 1e6;
      latIn.value = lat;
      lngIn.value = lng;
      placeMarker(lat, lng);
      if (map) map.setView([lat, lng], Math.max(map.getZoom(), zoom || 17));
      suggest.hidden = true;
      if (origine === 'iniziale') return;
      status.textContent = msg || 'Punto messo sulla mappa. Cerco l\'indirizzo di quel punto…';
      var mine = ++asked;
      reverseGeocode(lat, lng).then(function (a) {
        if (mine !== asked) return;              /* nel frattempo il punto è cambiato */
        if (!a) {
          if (origine === 'mappa') status.textContent = 'Punto messo sulla mappa (' + lat + ', ' + lng + '). Non trovo un indirizzo qui: scrivilo tu nei campi qui sopra.';
          return;
        }
        var parts = addressParts(a);
        var extra = derived(parts);
        if (origine !== 'mappa') {
          status.textContent = (msg || '') + extra;
          return;
        }
        var testo = [parts.indirizzo, parts.citta].filter(Boolean).join(', ');
        if (!field('indirizzo').value.trim() && !field('citta').value.trim()) {
          fill(parts, false);
          status.textContent = 'Punto messo sulla mappa. Ho scritto l\'indirizzo di quel punto: ' + testo + '. Controllalo qui sopra.' + extra;
          return;
        }
        var same = !!parts.indirizzo && OA.normalize(field('indirizzo').value).indexOf(OA.normalize(parts.indirizzo)) === 0 &&
          OA.normalize(field('citta').value) === OA.normalize(parts.citta);
        status.textContent = 'Punto messo sulla mappa' + (same ? ', all\'indirizzo che hai scritto.' : testo ? '. Qui l\'indirizzo è: ' + testo + '.' : '.') + extra;
        if (!same && parts.indirizzo) {
          suggest.textContent = '';
          var btn = el('button', { type: 'button', className: 'btn btn--secondary btn--small' }, [document.createTextNode('Usa questo indirizzo: ' + testo)]);
          btn.addEventListener('click', function () {
            fill(parts, true);
            suggest.hidden = true;
            status.textContent = 'Indirizzo aggiornato: ' + testo + '.';
            field('indirizzo').focus();
          });
          suggest.appendChild(btn);
          suggest.hidden = false;
        }
      });
    }

    if (map) {
      map.setView(OA.ITALY.center, OA.ITALY.zoom);
      /* Da lontano un tocco sbaglia di chilometri: prima si avvicina (Italia → città → strada), poi mette il punto */
      map.on('click', function (ev) {
        var z = map.getZoom();
        if (z < PICK_ZOOM) {
          var next = Math.min(z + 5, PICK_ZOOM);
          map.setView(ev.latlng, next);
          status.textContent = next >= PICK_ZOOM ? 'Ora tocca il punto esatto dell\'ingresso.' : 'Mappa avvicinata: tocca di nuovo vicino al luogo.';
          return;
        }
        set(ev.latlng.lat, ev.latlng.lng, 'mappa');
      });
    }

    function fromInputs() {
      var lat = Number(latIn.value.replace(',', '.'));
      var lng = Number(lngIn.value.replace(',', '.'));
      if (latIn.value && lngIn.value && lat >= 35 && lat <= 48 && lng >= 6 && lng <= 19) set(lat, lng, 'mappa');
    }
    latIn.addEventListener('change', fromInputs);
    lngIn.addEventListener('change', fromInputs);

    /* Sul telefono, dopo una ricerca, la mappa va portata in vista */
    function reveal() {
      var r = mapBox.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        mapBox.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    }

    function find() {
      var via = cleanStreet(field('indirizzo').value);
      var citta = field('citta').value.trim();
      var cap = field('cap').value.trim();
      if (!citta) {
        status.textContent = via ? 'Scrivi anche la città.' : 'Scrivi prima l\'indirizzo e la città.';
        field(via ? 'citta' : 'indirizzo').focus();
        return;
      }
      status.textContent = 'Cerco l\'indirizzo…';
      suggest.hidden = true;
      /* Prima la ricerca per campi, poi quella libera (capisce «Piazza…», «Lungomare…», frazioni), infine la sola città */
      var tries = via ? [
        { street: via, city: citta, postalcode: cap },
        { q: via + ', ' + (cap ? cap + ' ' : '') + citta }
      ] : [];
      var down = false;
      var chain = tries.reduce(function (prev, q) {
        return prev.then(function (r) {
          if (r) return r;
          return geocode(q).then(function (x) { if (x === undefined) down = true; return x; });
        });
      }, Promise.resolve(null));
      chain.then(function (r) {
        if (r) return { r: r, esatto: true };
        return geocode({ city: citta, postalcode: cap }).then(function (c) {
          if (c === undefined) down = true;
          return c ? { r: c, esatto: false } : null;
        });
      }).then(function (res) {
        if (!res) {
          status.textContent = down ? 'La ricerca non risponde: tocca la mappa nel punto dell\'ingresso.' : 'Non trovo «' + citta + '»: controlla il nome della città o tocca la mappa nel punto dell\'ingresso.';
          return;
        }
        var msg = res.esatto
          ? 'Trovato: ' + res.r.nome + '. Se l\'ingresso è da un\'altra parte, tocca la mappa lì o trascina il segnaposto.'
          : (via ? 'Non trovo la via: ho messo il segnaposto al centro di ' + citta + '. ' : 'Ho messo il segnaposto al centro di ' + citta + '. ') + 'Tocca la mappa nel punto dell\'ingresso.';
        set(res.r.lat, res.r.lng, 'indirizzo', res.esatto ? 18 : 14, msg);
        if (!res.esatto && map) map.setView([res.r.lat, res.r.lng], 14);
        reveal();
      });
    }

    $('pick-find').addEventListener('click', find);
    /* Prima i suggerimenti (Invio sceglie quello evidenziato), poi Invio senza suggerimento cerca sulla mappa */
    addressSuggestions(field('indirizzo'), field('citta'), function (sug) {
      field('indirizzo').value = sug.indirizzo;
      if (sug.citta) field('citta').value = sug.citta;
      if (sug.cap) field('cap').value = sug.cap;
      set(sug.lat, sug.lng, 'scelta', sug.civico ? 18 : 17,
        'Indirizzo scelto: ' + sug.testo + '. Il segnaposto è sulla mappa qui sotto: se l\'ingresso è da un\'altra parte, tocca la mappa in quel punto.');
    }, function () {
      return map && map.getZoom() >= 10 ? map.getCenter() : null;
    });

    /* Invio (o «Vai» sulla tastiera del telefono) nei campi dell'indirizzo cerca sulla mappa invece di inviare il modulo */
    ['indirizzo', 'citta', 'cap'].forEach(function (k) {
      field(k).addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' || ev.isComposing || ev.defaultPrevented) return;
        ev.preventDefault();
        find();
      });
    });

    $('pick-locate').addEventListener('click', function () {
      if (!navigator.geolocation) {
        status.textContent = 'Il tuo browser non permette di trovare la posizione.';
        return;
      }
      status.textContent = 'Cerco la tua posizione…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        set(pos.coords.latitude, pos.coords.longitude, 'mappa', 18);
        reveal();
      }, function () {
        status.textContent = 'Non è stato possibile trovare la tua posizione. Controlla i permessi del browser.';
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });

    return {
      /* scheda da correggere: punto già noto, senza proporre indirizzi */
      set: function (lat, lng) { set(lat, lng, 'iniziale'); }
    };
  }

  A.pagine.segnala = initSegnala;
  /* Per il confronto nel pannello di moderazione */
  A.segnala = { LABELS: LABELS, OPTION_LABELS: OPTION_LABELS, farFromCity: farFromCity, nessunoPuoEntrare: nessunoPuoEntrare };
})();
