/* Ovunque Accessibile – web-app, bollino e codice QR per la vetrina (bollino.html).
   Si carica dopo app.js, che dà le utilità comuni (window.OAApp) e chiama la funzione della pagina. */
(function () {
  'use strict';

  var OA = window.OA;
  var api = window.OAApi;
  var el = OA.el;
  var icon = OA.icon;
  var A = window.OAApp;
  var $ = A.$;
  var message = A.message;
  var params = A.params;
  var show = A.show;

  /* Bollino per la vetrina: solo luoghi verificati sul posto. Il codice QR apre la scheda (sempre aggiornata). */
  function qrSvg(text, label) {
    var qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    var q = 4;                      /* margine bianco richiesto dai lettori */
    var d = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + q) + ',' + (r + q) + 'h1v1h-1z';
    }
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    svg.setAttribute('shape-rendering', 'crispEdges');
    var bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#ffffff');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#162841');
    svg.appendChild(bg);
    svg.appendChild(path);
    return svg;
  }

  /* Codice QR per la vetrina (29 ottobre): appena approviamo il gestore, lui (e i moderatori) può scaricarlo come
     immagine PNG con il logo e il nome dell'app, o stamparlo. Se il luogo è verificato sul posto è il bollino
     «Verificato sul posto», con i giudizi; altrimenti dice solo dove trovare le informazioni, senza promettere niente.
     Per i luoghi verificati la pagina resta pubblica, come prima. */
  function initBollino() {
    var id = params.get('id');
    var note = $('badge-note');
    if (id) $('badge-back').href = 'luogo.html?id=' + encodeURIComponent(id);
    api.getPlace(id).then(function (p) {
      if (!p) return message(note, 'Luogo non trovato.', 'error');
      var sulPosto = !!(p.verifica && p.verifica.livello === 'sul-posto');
      return Promise.all([
        api.profile().catch(function () { return null; }),
        api.user() && api.ownerStatus ? api.ownerStatus(p.id).catch(function () { return null; }) : null
      ]).then(function (r) {
        var puo = sulPosto || !!(r[0] && r[0].ruolo !== 'utente') || !!(r[1] && r[1].stato === 'approvato');
        if (!puo) {
          return message(note, 'Il codice QR per la vetrina è per chi gestisce «' + p.nome + '». Se è il tuo locale, apri la scheda e premi «Sei il titolare?»: appena confermiamo, lo scarichi da qui.', 'error');
        }
        mostraBollino(p, sulPosto);
      });
    }).catch(function (err) { message(note, err.message, 'error'); });
  }

  function mostraBollino(p, sulPosto) {
    document.title = (sulPosto ? 'Bollino: ' : 'Codice QR: ') + p.nome + ' – Ovunque Accessibile';
    document.querySelector('.badge__kicker').textContent = sulPosto ? 'Verificato sul posto da' : 'Le informazioni di accessibilità sono su';
    $('badge-place').textContent = p.nome + ', ' + p.citta;
    var list = $('badge-verdicts');
    if (sulPosto) {
      OA.ORDINE_ESIGENZE.forEach(function (e) {
        var g = OA.giudizio(p, e);
        if (g !== 'si' && g !== 'parziale') return;
        list.appendChild(el('li', { className: 'badge__verdict badge__verdict--' + g }, [
          icon(OA.ESIGENZE[e].icona),
          el('span', { text: OA.ESIGENZE[e].nome + ': ' + OA.GIUDIZIO[g].toLowerCase() })
        ]));
      });
    }
    show(list, sulPosto);
    var url = new URL('luogo.html?id=' + encodeURIComponent(p.id), location.href).href;
    if (window.qrcode) $('badge-qr').appendChild(qrSvg(url, 'Codice QR che apre la scheda di ' + p.nome + ' su Ovunque Accessibile'));
    $('badge-date').textContent = (sulPosto ? 'Verifica del ' + OA.formatDate(p.verifica.data) + ' · ' : '') + url.replace(/^https?:\/\//, '');
    $('badge-help').textContent = sulPosto
      ? 'Si stampa su un foglio A4 (meglio carta adesiva), da tagliare lungo il bordo. L\'immagine va bene anche per i social e il sito del locale. Il codice apre sempre la scheda aggiornata.'
      : 'Mettilo in vetrina, alla cassa o sui social: chi lo inquadra apre la scheda del locale, sempre aggiornata. Quando verifichiamo il locale sul posto diventa il bollino «Verificato sul posto».';
    /* Il titolo nascosto serve solo quando c'è un avviso al posto del bollino: il bollino ha il suo */
    show($('badge-page-title'), false);
    show($('badge'), true);
    show($('badge-actions'), true);
    $('badge-print').addEventListener('click', function () { window.print(); });
    var btn = $('badge-download');
    btn.addEventListener('click', function () {
      var stato = $('badge-download-note');
      btn.disabled = true;
      stato.textContent = 'Preparo l\'immagine…';
      qrPng(p, url, sulPosto).then(function (blob) {
        var a = el('a', { href: URL.createObjectURL(blob) });
        a.download = 'qr-ovunque-accessibile-' + (p.slug || p.nome).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        stato.textContent = 'Immagine scaricata. La trovi nella cartella dei download.';
      }).catch(function () {
        stato.textContent = 'Non sono riuscito a preparare l\'immagine: usa «Stampa» oppure riprova.';
      }).then(function () { btn.disabled = false; });
    });
  }

  /* Immagine PNG da 1200 × 1580 px: logo, «Ovunque Accessibile», nome del locale, codice QR con il logo al centro
     (correzione d'errore alta, così si legge anche con il logo sopra), invito e indirizzo della scheda. */
  function qrPng(p, url, sulPosto) {
    var W = 1200, H = 1580, NAVY = '#162841', BRAND = '#2f5b9c', MUTED = '#4a5568';
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var logo = new Image();
    var caricaLogo = new Promise(function (ok, ko) { logo.onload = ok; logo.onerror = ko; logo.src = '../assets/img/logo.png'; });
    var font = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('600 80px Fredoka'), document.fonts.load('700 40px "Atkinson Hyperlegible"')]).catch(function () {})
      : Promise.resolve();

    function tondo(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function testo(t, y, peso, misura, famiglia, colore, maxW) {
      var s = misura;
      do {
        ctx.font = peso + ' ' + s + 'px ' + famiglia;
        s -= 2;
      } while (ctx.measureText(t).width > maxW && s > 16);
      ctx.fillStyle = colore;
      ctx.fillText(t, W / 2, y);
    }

    return Promise.all([caricaLogo, font]).then(function () {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      tondo(24, 24, W - 48, H - 48, 64);
      ctx.lineWidth = 12;
      ctx.strokeStyle = NAVY;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      var lh = 200, lw = lh * logo.naturalWidth / logo.naturalHeight;
      ctx.drawImage(logo, (W - lw) / 2, 72, lw, lh);
      testo((sulPosto ? 'Verificato sul posto da' : 'Le informazioni di accessibilità sono su').toUpperCase(), 340, '700', 32, '"Atkinson Hyperlegible", sans-serif', BRAND, 1000);
      testo('Ovunque Accessibile', 432, '600', 88, 'Fredoka, sans-serif', NAVY, 1040);
      testo(p.nome + ', ' + p.citta, 512, '700', 48, '"Atkinson Hyperlegible", sans-serif', NAVY, 1040);

      var qr = window.qrcode(0, 'H');
      qr.addData(url);
      qr.make();
      var n = qr.getModuleCount();
      var lato = 820, cella = Math.floor(lato / (n + 8)), qx = Math.round((W - cella * (n + 8)) / 2), qy = 560;
      ctx.fillStyle = NAVY;
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(qx + (c + 4) * cella, qy + (r + 4) * cella, cella, cella);
      }
      /* il logo al centro, su un tondo bianco (circa il 5% dei moduli) */
      var centro = qx + cella * (n + 8) / 2, cy = qy + cella * (n + 8) / 2, box = cella * n * 0.24;
      ctx.fillStyle = '#ffffff';
      tondo(centro - box / 2, cy - box / 2, box, box, box * 0.22);
      ctx.fill();
      var ih = box * 0.82, iw = ih * logo.naturalWidth / logo.naturalHeight;
      ctx.drawImage(logo, centro - iw / 2, cy - ih / 2, iw, ih);

      var fine = qy + cella * (n + 8);
      testo('Inquadra il codice: misure, foto e recensioni di chi c\'è stato.', fine + 40, '700', 34, '"Atkinson Hyperlegible", sans-serif', NAVY, 1040);
      testo((sulPosto ? 'Verifica del ' + OA.formatDate(p.verifica.data) + ' · ' : '') + url.replace(/^https?:\/\//, ''), fine + 96, '400', 26, '"Atkinson Hyperlegible", sans-serif', MUTED, 1060);
      return new Promise(function (ok, ko) {
        if (canvas.toBlob) canvas.toBlob(function (b) { if (b) ok(b); else ko(new Error('png')); }, 'image/png');
        else ko(new Error('png'));
      });
    });
  }

  A.pagine.bollino = initBollino;
})();
