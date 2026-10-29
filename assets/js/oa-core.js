/* Ovunque Accessibile – codice comune a sito e web-app (window.OA).
   Il sito lo avvia con sito.js, l'app con app/assets/js/app.js: le regole e i giudizi sono gli stessi.
   Dati: da Supabase (sito.js e api.js impostano OA.config.areaPlaces, searchPlaces, loadPlace e, per la home,
   latestPlaces e stats). Mappa ed elenco chiedono solo i luoghi dell'area visibile (sezione 6b).
   Tutto il testo dei luoghi entra nel DOM con textContent: mai innerHTML con dati esterni.
   Indice: 1. Configurazione · 2. Regole per esigenza · 3. Scelta «La tua esigenza»
           4. Utilità DOM · 5. Componenti · 6. Mappa · 7. Home · 8. Pagina mappa
           9. Indicazioni stradali · 10. Scheda luogo */
(function () {
  'use strict';

  /* Con JavaScript attivo si mostrano i messaggi "Caricamento…" (classe js-only) */
  document.documentElement.classList.add('js');

  /* ---------- 1. Configurazione ---------- */
  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  var ITALY = { center: [42.5, 12.5], zoom: 5 };
  var SCADENZA_MESI = 24;          /* dopo questo tempo: "Informazioni da ricontrollare" */
  var STORAGE_KEY = 'oa-esigenza';

  /* Punti di aggancio per sito e app: areaPlaces(riquadro) → Promise di { totale, luoghi } o { totale, zone },
     searchPlaces(testo, tipo) → Promise di { totale, luoghi }, latestPlaces(), stats(), loadPlace(id), reportHref(p), onDetail(p) */
  var config = {};

  var CATEGORIE = {
    ristorante: 'Ristorante e bar',
    museo: 'Museo',
    hotel: 'Hotel e alloggi',
    spiaggia: 'Spiaggia',
    parco: 'Parco e natura',
    cultura: 'Cinema, teatro e cultura',
    negozio: 'Negozio',
    trasporti: 'Trasporti',
    sanita: 'Salute',
    servizi: 'Uffici e servizi',
    sport: 'Sport',
    culto: 'Luogo di culto',
    istruzione: 'Scuola e università',
    supermercato: 'Supermercato',
    bagni: 'Bagno pubblico',
    svago: 'Svago'
  };

  /* Esempi per ogni tipo: nel modulo «Segnala» e nella ricerca (chi cerca «farmacia» trova i luoghi «Salute») */
  var ESEMPI_CATEGORIE = {
    ristorante: 'pizzeria, trattoria, bar, gelateria, pub',
    museo: 'museo, galleria, mostra',
    hotel: 'hotel, B&B, ostello, agriturismo, casa vacanze',
    spiaggia: 'spiaggia, lido, stabilimento balneare',
    parco: 'parco, giardino, riserva naturale, sentiero',
    cultura: 'cinema, teatro, biblioteca, sala concerti',
    negozio: 'negozio, centro commerciale, libreria',
    trasporti: 'stazione, aeroporto, porto, fermata',
    sanita: 'farmacia, ospedale, ambulatorio, studio medico, dentista',
    servizi: 'comune, ufficio postale, banca, anagrafe, INPS',
    sport: 'palestra, piscina, stadio, palazzetto, campo sportivo',
    culto: 'chiesa, moschea, sinagoga, tempio',
    istruzione: 'scuola, università, asilo, biblioteca universitaria',
    supermercato: 'supermercato, alimentari, mercato',
    bagni: 'bagno pubblico, servizi igienici',
    svago: 'zoo, acquario, parco divertimenti, sala giochi'
  };

  /* ---------- 2. Regole per esigenza ----------
     Soglie iniziali (base DM 236/1989), DA CONFERMARE con Angelo e Lorenzo.
     Cambiare un numero qui aggiorna tutti i giudizi del sito. */
  /* voci: cosa conta per il giudizio; card: le tre voci mostrate nelle schede brevi (elenco, mappa) */
  var FISICHE = ['ingresso', 'porta', 'spazi', 'piani', 'bagno'];
  var CARD_FISICHE = ['ingresso', 'piani', 'bagno'];
  var ESIGENZE = {
    manuale: { nome: 'Carrozzina manuale', breve: 'Manuale', icona: '#icon-wheelchair', voci: FISICHE, card: CARD_FISICHE },
    elettrica: { nome: 'Carrozzina elettrica', breve: 'Elettrica', icona: '#icon-wheelchair-e', voci: FISICHE, card: CARD_FISICHE },
    cammino: { nome: 'Difficoltà a camminare', breve: 'Camminare', icona: '#icon-walk', voci: FISICHE, card: CARD_FISICHE },
    anziani: { nome: 'Persona anziana', breve: 'Anziani', icona: '#icon-elder', voci: FISICHE.concat(['sedute']), card: CARD_FISICHE },
    vista: { nome: 'Disabilità visiva', breve: 'Vista', icona: '#icon-eye', voci: ['cane', 'orientamento', 'leggere', 'ostacoli'], card: ['cane', 'orientamento', 'leggere'], sensi: true },
    udito: { nome: 'Disabilità uditiva', breve: 'Udito', icona: '#icon-ear', voci: ['comunicare', 'contatti', 'ascolto'], card: ['comunicare', 'contatti', 'ascolto'], sensi: true }
  };
  var ORDINE_ESIGENZE = ['manuale', 'elettrica', 'cammino', 'anziani', 'vista', 'udito'];

  /* Chi cammina con fatica (difficoltà a camminare, persone anziane): gradini con corrimano e scale si possono fare */
  function aPiedi(e) {
    return e === 'cammino' || e === 'anziani';
  }

  var SOGLIE = {
    manuale: {
      gradinoSenza: 2.5,           /* cm: un gradino così basso conta come "nessun gradino" */
      gradinoInParte: 5,           /* cm: un solo gradino fino a questa altezza è "in parte" */
      rampaOk: 8, rampaInParte: 12, /* % di pendenza */
      portaOk: 80, portaInParte: 75, /* cm */
      ascensore: [80, 120],        /* cm: larghezza × profondità minime della cabina */
      rotazioneBagno: 150          /* cm: spazio per girarsi */
    },
    elettrica: {
      gradinoSenza: 2.5,
      gradinoInParte: null,        /* nessun gradino è superabile */
      rampaOk: 8, rampaInParte: 12,
      portaOk: 90, portaInParte: 80,
      ascensore: [110, 140],
      rotazioneBagno: 150,
      rotazioneObbligatoria: true
    },
    cammino: {
      gradinoSenza: 2.5,
      gradiniConCorrimano: 3,      /* fino a 3 gradini con corrimano: accessibile */
      portaOk: 75, portaInParte: 70
    },
    anziani: {                     /* come «difficoltà a camminare», più le sedute lungo il percorso */
      gradinoSenza: 2.5,
      gradiniConCorrimano: 3,
      portaOk: 75, portaInParte: 70
    }
  };

  /* Pendenza della rampa descritta a parole da chi segnala (rampa_pendenza), quando manca la misura in %.
     Lieve ≈ fino all'8%, media ≈ 8–12%, ripida = oltre: stessi gradini delle soglie qui sopra. */
  var PENDENZE = { lieve: 'lieve', media: 'media', ripida: 'ripida' };

  /* Ogni regola restituisce [stato, testo]: stato è si, parziale, no, nv (non verificato) o np (non previsto) */
  function valutaIngresso(m, e) {
    var s = SOGLIE[e];
    if (m.gradini == null && m.rampa == null) return ['nv', 'Da verificare'];
    var g = m.gradini || 0;
    var h = m.gradino_cm;
    var gradiniTxt = g === 0 ? 'nessun gradino'
      : (g === 1 ? 'un gradino' : g + ' gradini') + (h != null ? (g === 1 ? ' di ' : ' da ') + h + ' cm' : '');
    var senzaGradini = g === 0 || (g === 1 && h != null && h <= s.gradinoSenza);
    var testo;
    if (m.rampa) {
      testo = 'Rampa' + (m.rampa_pct != null ? ' ' + m.rampa_pct + '%'
        : (PENDENZE[m.rampa_pendenza] ? ' ' + PENDENZE[m.rampa_pendenza] : ' (pendenza non indicata)')) + (g ? ', in alternativa a ' + gradiniTxt : '');
    } else {
      testo = senzaGradini ? 'Senza gradini' : gradiniTxt.charAt(0).toUpperCase() + gradiniTxt.slice(1);
      if (g && m.corrimano) testo += ', con corrimano';
    }

    if (aPiedi(e)) {
      if (senzaGradini || m.rampa) return ['si', testo];
      if (m.corrimano === true) return [g <= s.gradiniConCorrimano ? 'si' : 'parziale', testo];
      if (m.corrimano === false) return [g <= 1 ? 'parziale' : 'no', testo + ', senza corrimano'];
      return ['parziale', testo];
    }

    if (senzaGradini) return ['si', testo];
    if (m.rampa) {
      if (m.rampa_pct == null) return [{ lieve: 'si', media: 'parziale', ripida: 'no' }[m.rampa_pendenza] || 'parziale', testo];
      if (m.rampa_pct <= s.rampaOk) return ['si', testo];
      if (m.rampa_pct <= s.rampaInParte) return ['parziale', testo];
      return ['no', testo];
    }
    if (s.gradinoInParte && g === 1 && h != null && h <= s.gradinoInParte) return ['parziale', testo];
    return ['no', testo];
  }

  function valutaPorta(m, e) {
    var s = SOGLIE[e];
    var cm = m.porta_cm;
    if (cm === 0) return ['np', 'Nessuna porta'];
    if (cm == null) return ['nv', 'Da verificare'];
    var testo = 'Larga ' + cm + ' cm';
    if (cm >= s.portaOk) return ['si', testo];
    if (cm >= s.portaInParte) return ['parziale', testo];
    return ['no', testo];
  }

  function valutaSpazi(m) {
    return {
      tutti: ['si', 'Tutti gli spazi accessibili'],
      parziale: ['parziale', 'Accessibili in parte'],
      no: ['no', 'Non accessibili']
    }[m.valore] || ['nv', 'Da verificare'];
  }

  function valutaPiani(m, e) {
    var s = SOGLIE[e];
    if (m.valore === 'uno') return ['si', 'Tutto su un piano'];
    if (m.valore === 'ascensore') {
      var d = m.ascensore_cm;
      var misure = d ? d[0] + ' × ' + d[1] + ' cm' : '';
      if (aPiedi(e)) return ['si', 'Ascensore' + (misure ? ' ' + misure : '')];
      if (!d) return ['parziale', 'Ascensore (cabina non misurata)'];
      if (d[0] >= s.ascensore[0] && d[1] >= s.ascensore[1]) return ['si', 'Ascensore ' + misure];
      return ['parziale', 'Ascensore piccolo: ' + misure];
    }
    if (m.valore === 'scale') {
      if (aPiedi(e)) return m.corrimano_scale ? ['si', 'Scale con corrimano'] : ['parziale', 'Scale senza corrimano'];
      return ['no', 'Solo scale'];
    }
    return ['nv', 'Da verificare'];
  }

  function valutaBagno(m, e) {
    var s = SOGLIE[e];
    var r = m.rotazione_cm;
    switch (m.valore) {
      case 'non-previsto': return ['np', 'Non previsto in questo luogo'];
      case 'assente': return ['no', 'Nessun bagno accessibile'];
      case 'non-attrezzato': return [e === 'elettrica' ? 'no' : 'parziale', 'Bagno non attrezzato'];
      case 'attrezzato':
        if (aPiedi(e)) return m.maniglioni === false ? ['parziale', 'Bagno senza maniglioni'] : ['si', 'Bagno con maniglioni'];
        if (m.maniglioni === false) return ['parziale', 'Bagno senza maniglioni'];
        if (r == null) return s.rotazioneObbligatoria ? ['parziale', 'Spazio per girarsi non misurato'] : ['si', 'Bagno attrezzato'];
        if (r >= s.rotazioneBagno) return ['si', 'Bagno attrezzato, spazio per girarsi ' + r + ' cm'];
        return [s.rotazioneObbligatoria ? 'no' : 'parziale', 'Spazio per girarsi solo ' + r + ' cm'];
    }
    return ['nv', 'Da verificare'];
  }

  function valutaSedute(f) {
    if (f.sedute === true) return ['si', 'Sedute lungo il percorso'];
    if (f.sedute === false) return ['parziale', 'Nessuna seduta lungo il percorso'];
    return ['nv', 'Da verificare'];
  }

  /* Vista e udito: voci sì/no in facoltativi.vista e facoltativi.udito.
     Con almeno un aiuto presente la voce è ✓; se si sa solo che mancano è «in parte» (si entra, ma senza aiuti). */
  function aiuti(o, defs, nessuno) {
    var si = defs.filter(function (d) { return o[d[0]] === true; }).map(function (d) { return d[1]; });
    var no = defs.filter(function (d) { return o[d[0]] === false; }).map(function (d) { return d[1]; });
    if (si.length) return ['si', si.join(', ').replace(/^./, function (c) { return c.toUpperCase(); })];
    if (no.length) return ['parziale', nessuno + ' ' + no.join(', ')];
    return ['nv', 'Da verificare'];
  }

  function sensi(p, k) {
    return (p.facoltativi && p.facoltativi[k]) || {};
  }

  var VOCI = [
    { key: 'ingresso', nome: 'Ingresso', valuta: function (p, e) { return valutaIngresso(p.misure.ingresso, e); }, nota: function (p) { return p.misure.ingresso.nota; } },
    { key: 'porta', nome: 'Porta d\'ingresso', valuta: function (p, e) { return valutaPorta(p.misure.ingresso, e); }, nota: function (p) { return p.misure.ingresso.nota_porta; } },
    { key: 'spazi', nome: 'Spazi e percorsi', valuta: function (p) { return valutaSpazi(p.misure.spazi); }, nota: function (p) { return p.misure.spazi.nota; } },
    { key: 'piani', nome: 'Piani e ascensore', valuta: function (p, e) { return valutaPiani(p.misure.piani, e); }, nota: function (p) { return p.misure.piani.nota; } },
    { key: 'bagno', nome: 'Bagno', valuta: function (p, e) { return valutaBagno(p.misure.bagno, e); }, nota: function (p) { return p.misure.bagno.nota; } },
    { key: 'sedute', nome: 'Sedute', valuta: function (p) { return valutaSedute(p.facoltativi || {}); }, nota: function () { return null; } },
    { key: 'cane', nome: 'Cane guida', sensi: true, valuta: function (p) {
      var v = sensi(p, 'vista').cane_guida;
      return v === true ? ['si', 'Cani guida ammessi'] : v === false ? ['no', 'Cani guida non ammessi'] : ['nv', 'Da verificare'];
    }, nota: function (p) { return sensi(p, 'vista').nota; } },
    { key: 'orientamento', nome: 'Orientarsi', sensi: true, valuta: function (p) {
      var v = Object.assign({}, sensi(p, 'vista'));
      if (v.percorso_tattile == null && p.dettagli) v.percorso_tattile = p.dettagli.percorso_tattile;
      return aiuti(v, [['percorso_tattile', 'percorso tattile'], ['mappa_tattile', 'mappa tattile'], ['accompagnamento', 'personale che accompagna']], 'Senza');
    }, nota: function () { return null; } },
    { key: 'leggere', nome: 'Informazioni da leggere', sensi: true, valuta: function (p) {
      return aiuti(sensi(p, 'vista'), [['braille', 'testi in Braille'], ['grandi_caratteri', 'testi a grandi caratteri'], ['audioguida', 'audioguida o audiodescrizione']], 'Senza');
    }, nota: function () { return null; } },
    { key: 'ostacoli', nome: 'Gradini e ostacoli', sensi: true, valuta: function (p) {
      var v = sensi(p, 'vista').contrasto;
      return v === true ? ['si', 'Segnalati con colori a contrasto'] : v === false ? ['parziale', 'Non segnalati con colori a contrasto'] : ['nv', 'Da verificare'];
    }, nota: function () { return null; } },
    { key: 'comunicare', nome: 'Lingua dei segni', sensi: true, valuta: function (p) {
      var v = sensi(p, 'udito').lis;
      return v === true ? ['si', 'Personale che conosce la LIS'] : v === false ? ['parziale', 'Nessuno conosce la LIS'] : ['nv', 'Da verificare'];
    }, nota: function (p) { return sensi(p, 'udito').nota; } },
    { key: 'contatti', nome: 'Contatti senza telefono', sensi: true, valuta: function (p) {
      var v = sensi(p, 'udito').scritto;
      return v === true ? ['si', 'Si prenota e si chiede per scritto (chat, email, SMS)'] : v === false ? ['parziale', 'Solo per telefono'] : ['nv', 'Da verificare'];
    }, nota: function () { return null; } },
    { key: 'ascolto', nome: 'Ascolto e avvisi', sensi: true, valuta: function (p) {
      return aiuti(sensi(p, 'udito'), [['anello', 'anello magnetico'], ['sottotitoli', 'sottotitoli'], ['avvisi_visivi', 'avvisi e allarmi luminosi']], 'Senza');
    }, nota: function () { return null; } }
  ];

  function voce(key) {
    return VOCI.filter(function (v) { return v.key === key; })[0];
  }

  /* Giudizio per esigenza: ✓ se tutte le voci sono ✓ (le "non previste" non contano); – negli altri casi.
     Muoversi: ✕ se ingresso o spazi sono ✕; ? se manca l'ingresso.
     Vista e udito: ? se non si sa ancora niente; ✕ (vista) se i cani guida non sono ammessi. */
  /* Luoghi da OpenStreetMap ancora senza misure: il giudizio per chi si muove viene dal tag wheelchair
     (yes → accessibile, limited → in parte). Per vista e udito OpenStreetMap non dice niente. */
  var OSM_GIUDIZIO = { yes: 'si', limited: 'parziale', no: 'no' };
  function soloOsm(p) {
    return !!(p.osm && p.verifica && p.verifica.livello === 'osm' && p.misure.ingresso.gradini == null && p.misure.ingresso.rampa == null);
  }

  var cacheGiudizi = {};
  function giudizio(p, e) {
    var k = p.id + '|' + e;
    if (cacheGiudizi[k]) return cacheGiudizi[k];
    var stati = {};
    ESIGENZE[e].voci.forEach(function (key) { stati[key] = voce(key).valuta(p, e)[0]; });
    var tutte = Object.keys(stati);
    var g;
    if (ESIGENZE[e].sensi ? tutte.every(function (k2) { return stati[k2] === 'nv'; }) : stati.ingresso === 'nv') g = 'nv';
    else if (stati.ingresso === 'no' || stati.spazi === 'no' || stati.cane === 'no') g = 'no';
    else if (tutte.every(function (k2) { return stati[k2] === 'si' || stati[k2] === 'np'; })) g = 'si';
    else g = 'parziale';
    if (g === 'nv' && !ESIGENZE[e].sensi && soloOsm(p) && OSM_GIUDIZIO[p.osm.wheelchair]) g = OSM_GIUDIZIO[p.osm.wheelchair];
    cacheGiudizi[k] = g;
    return g;
  }

  var GIUDIZIO = { si: 'Accessibile', parziale: 'Accessibile in parte', no: 'Non accessibile', nv: 'Da verificare' };
  var ICONA_STATO = { si: '#icon-yes', parziale: '#icon-partial', no: '#icon-no', nv: '#icon-unknown', np: '#icon-na' };
  var PREFISSO_STATO = { si: 'Sì: ', parziale: 'In parte: ', no: 'No: ', nv: 'Non verificato: ', np: 'Non previsto: ' };

  /* Quanto è completa una scheda: per ogni voce, se si sa com'è (per la prima esigenza a cui serve).
     → { note, totale, mancano: [nomi delle voci «da verificare»] }. Serve ai gestori («Per i locali»). */
  function completezza(p) {
    var mancano = [];
    VOCI.forEach(function (v) {
      var e = ORDINE_ESIGENZE.filter(function (k) { return ESIGENZE[k].voci.indexOf(v.key) !== -1; })[0];
      if (v.valuta(p, e)[0] === 'nv') mancano.push(v.nome);
    });
    return { note: VOCI.length - mancano.length, totale: VOCI.length, mancano: mancano };
  }

  /* Ovunque Accessibile mostra su mappa ed elenchi solo luoghi accessibili o accessibili in parte per l'esigenza
     scelta: né «non accessibili» né «da verificare» (la scheda resta raggiungibile con il suo link) */
  function visibile(p, e) {
    var g = giudizio(p, e);
    return g === 'si' || g === 'parziale';
  }

  /* Filtri della pagina mappa, calcolati per l'esigenza scelta (per vista e udito: ingresso e bagno
     come per chi cammina con fatica, l'esigenza «fisica» più vicina) */
  function fisica(e) {
    return ESIGENZE[e].sensi ? 'cammino' : e;
  }
  var FILTRI = {
    accessibile: function (p, e) { return giudizio(p, e) === 'si'; },
    ingresso: function (p, e) { return soloOsm(p) ? p.osm.wheelchair === 'yes' : valutaIngresso(p.misure.ingresso, fisica(e))[0] === 'si'; },
    bagno: function (p, e) { return soloOsm(p) ? p.osm.toilets_wheelchair === 'yes' : valutaBagno(p.misure.bagno, fisica(e))[0] === 'si'; },
    parcheggio: function (p) { return !!(p.facoltativi && p.facoltativi.parcheggio && p.facoltativi.parcheggio.posti); }
  };

  /* Verifica: livello e scadenza */
  function verifica(p) {
    var v = p.verifica || {};
    var scaduta = false;
    if (v.data) {
      var d = new Date(v.data + 'T12:00:00');
      var limite = new Date();
      limite.setMonth(limite.getMonth() - SCADENZA_MESI);
      scaduta = d < limite;
    }
    return { livello: v.livello, data: v.data, scaduta: scaduta };
  }

  /* ---------- 3. Scelta «La tua esigenza» ----------
     Salvata nel browser (localStorage: preferenza chiesta dall'utente, nessun cookie) e nell'indirizzo (?per=). */
  var ascoltatori = [];

  function esigenzaSalvata() {
    var fromUrl = new URLSearchParams(location.search).get('per');
    if (ESIGENZE[fromUrl]) return fromUrl;
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return ESIGENZE[v] ? v : null;
    } catch (err) {
      return null;
    }
  }

  var esigenzaCorrente = esigenzaSalvata();

  function esigenza() {
    return esigenzaCorrente || 'manuale';   /* finché non si sceglie: carrozzina manuale, con l'invito a scegliere */
  }

  function setEsigenza(e) {
    if (!ESIGENZE[e]) return;
    esigenzaCorrente = e;
    try { localStorage.setItem(STORAGE_KEY, e); } catch (err) { /* navigazione privata: resta solo per questa pagina */ }
    var params = new URLSearchParams(location.search);
    params.set('per', e);
    history.replaceState(null, '', '?' + params.toString());
    ascoltatori.forEach(function (fn) { fn(e); });
  }

  function onEsigenza(fn) {
    ascoltatori.push(fn);
  }

  /* Gruppo di scelta nelle pagine (fieldset con radio, già nell'HTML: .needs) */
  function initNeedsPicker() {
    [].forEach.call(document.querySelectorAll('.needs'), function (box) {
      var help = box.querySelector('.needs__help');
      var live = box.querySelector('.needs__live');
      function sync(announce) {
        [].forEach.call(box.querySelectorAll('input[name="esigenza"]'), function (r) {
          r.checked = r.value === esigenza() && !!esigenzaCorrente;
        });
        box.classList.toggle('needs--ask', !esigenzaCorrente);
        if (help) {
          help.textContent = esigenzaCorrente
            ? 'Giudizi calcolati per: ' + ESIGENZE[esigenza()].nome.toLowerCase() + '.'
            : 'Scegli la tua esigenza: i giudizi cambiano in base a quella. Per ora vedi quelli per la carrozzina manuale.';
        }
        if (announce && live) live.textContent = 'Giudizi aggiornati per ' + ESIGENZE[esigenza()].nome.toLowerCase() + '.';
      }
      box.addEventListener('change', function (ev) {
        if (ev.target.name === 'esigenza') setEsigenza(ev.target.value);
      });
      onEsigenza(function () { sync(true); });
      sync(false);
    });
  }

  /* ---------- 4. Utilità DOM ---------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'className') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function icon(id, extraClass) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', id);
    svg.appendChild(use);
    return svg;
  }

  function placeUrl(p) {
    return 'luogo.html?id=' + encodeURIComponent(p.id) + (esigenzaCorrente ? '&per=' + esigenzaCorrente : '');
  }

  function formatDate(iso, short) {
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('it-IT', short ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* Un solo luogo (scheda): se sito o app sanno chiederlo al database, non si scaricano tutti */
  function loadPlace(id) {
    return config.loadPlace ? config.loadPlace(id) : Promise.reject(new Error('dati'));
  }


  /* Le tre cose che chi passa di lì sa dire in pochi secondi e che spesso mancano: gradini, porta, bagno */
  function mancanti(p) {
    var m = p.misure || {};
    var ing = m.ingresso || {};
    var out = [];
    if (ing.gradini == null) out.push('gradini');
    if (ing.porta_cm == null) out.push('porta');
    if ((m.bagno || {}).valore == null) out.push('bagno');
    return out;
  }

  /* ---------- 5. Componenti ---------- */

  /* Stato con icona + prefisso nascosto per screen reader: il significato non dipende dal colore */
  function statusNode(st, label) {
    return el('span', { className: 'status status--' + st[0] }, [
      icon(ICONA_STATO[st[0]]),
      el('span', {}, [
        el('span', { className: 'visually-hidden', text: (label ? label + ': ' : '') + PREFISSO_STATO[st[0]] }),
        document.createTextNode(st[1])
      ])
    ]);
  }

  function verdictNode(p, e) {
    var g = giudizio(p, e);
    return el('span', { className: 'verdict verdict--' + g }, [
      icon(ICONA_STATO[g]),
      el('span', {}, [
        document.createTextNode(GIUDIZIO[g]),
        el('span', { className: 'visually-hidden', text: ' per ' + ESIGENZE[e].nome.toLowerCase() })
      ])
    ]);
  }

  function verificaNode(p) {
    var v = verifica(p);
    if (p.stato === 'in-revisione') return el('span', { className: 'trust trust--old' }, [icon('#icon-clock'), el('span', { text: 'Scheda in revisione' })]);
    if (v.livello === 'osm') return el('span', { className: 'trust trust--old' }, [icon('#icon-map'), el('span', { text: 'Secondo OpenStreetMap, non ancora misurato' })]);
    if (v.scaduta) return el('span', { className: 'trust trust--old' }, [icon('#icon-clock'), el('span', { text: 'Da ricontrollare' })]);
    if (v.livello === 'sul-posto') return el('span', { className: 'trust trust--onsite' }, [icon('#icon-shield'), el('span', { text: 'Verificato sul posto' })]);
    return el('span', { className: 'trust' }, [icon('#icon-people'), el('span', { text: 'Segnalato dalla community' })]);
  }

  /* Avvisi temporanei (solo nell'app: p.avvisi arriva dal database) */
  var AVVISI = {
    ascensore: 'Ascensore fuori servizio',
    rampa: 'Rampa non utilizzabile',
    bagno: 'Bagno accessibile fuori servizio',
    ingresso: 'Ingresso accessibile chiuso',
    lavori: 'Lavori in corso',
    altro: 'Avviso temporaneo'
  };

  function alertNode(p) {
    var list = p.avvisi || [];
    if (!list.length) return null;
    var testo = AVVISI[list[0].tipo] || AVVISI.altro;
    return el('p', { className: 'place__alert' }, [
      icon('#icon-alert'),
      el('span', { text: 'Avviso: ' + testo.charAt(0).toLowerCase() + testo.slice(1) + (list.length > 1 ? ' e altri ' + (list.length - 1) : '') })
    ]);
  }

  function distanzaTxt(km) {
    return km < 1 ? 'a ' + Math.max(10, Math.round(km * 100) * 10) + ' m' : 'a ' + (km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)) + ' km';
  }

  /* Cosa dice OpenStreetMap, per i luoghi senza misure: [stato, testo] */
  var OSM_STATO = { yes: ['si', 'sì'], limited: ['parziale', 'in parte'], no: ['no', 'no'] };
  function osmFatti(p) {
    var a = OSM_STATO[p.osm.wheelchair] || ['nv', 'non indicato'];
    var b = OSM_STATO[p.osm.toilets_wheelchair] || ['nv', 'non indicato'];
    return [[a[0], 'In carrozzina: ' + a[1]], [b[0], 'Bagno accessibile: ' + b[1]]];
  }

  function featuresNode(p, e, className) {
    if (soloOsm(p) && !ESIGENZE[e].sensi) {
      return el('span', { className: className }, osmFatti(p).map(function (f) { return statusNode(f, 'Secondo OpenStreetMap'); }));
    }
    return el('span', { className: className }, ESIGENZE[e].card.map(function (k) {
      var v = voce(k);
      return statusNode(v.valuta(p, e), v.nome);
    }));
  }

  /* Card di un luogo (elenco della mappa e home). onShow: pulsante "Mostra sulla mappa"; km: distanza da chi cerca */
  function placeCard(p, headingTag, onShow, km) {
    var e = esigenza();
    return el('li', { className: 'place', 'data-id': p.id }, [
      el('div', { className: 'place__top' }, [verdictNode(p, e), verificaNode(p)]),
      el(headingTag || 'h3', { className: 'place__title' }, [el('a', { className: 'place__link', href: placeUrl(p), text: p.nome })]),
      el('p', { className: 'place__meta', text: (km != null ? distanzaTxt(km) + ' · ' : '') + (CATEGORIE[p.categoria] || '') + ' · ' + p.indirizzo + ', ' + p.citta }),
      alertNode(p),
      featuresNode(p, e, 'place__features'),
      onShow ? showButton(p, onShow) : null
    ]);
  }

  function showButton(p, onShow) {
    var btn = el('button', { type: 'button', className: 'place__show' }, [
      icon('#icon-pin'),
      el('span', {}, [
        document.createTextNode('Mostra sulla mappa'),
        el('span', { className: 'visually-hidden', text: ': ' + p.nome })
      ])
    ]);
    btn.addEventListener('click', function () { onShow(p.id); });
    return btn;
  }

  /* ---------- 6. Mappa (Leaflet + OpenStreetMap) ----------
     options.dueDita: mappa dentro una pagina che scorre (home, scheda, «Dov'è l'ingresso?»). Sul telefono un dito
     fa scorrere la pagina e due dita spostano e ingrandiscono la mappa, così non si resta «bloccati» sulla mappa.
     Il tocco singolo resta un clic (per mettere il punto) e i pulsanti + e − funzionano come sempre. */
  var TOUCH = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  function dueDita(map) {
    var box = map.getContainer();
    var hint = el('p', { className: 'map-hint', 'aria-hidden': 'true', text: 'Usa due dita per spostare la mappa' });
    var timer = null;
    map.dragging.disable();
    box.classList.add('map--due-dita');
    box.appendChild(hint);
    box.addEventListener('touchmove', function (ev) {
      if (ev.touches.length !== 1 || ev.target.closest('.leaflet-marker-draggable')) return;
      hint.classList.add('is-on');
      clearTimeout(timer);
      timer = setTimeout(function () { hint.classList.remove('is-on'); }, 1400);
    }, { passive: true });
    box.addEventListener('touchstart', function (ev) {
      if (ev.touches.length > 1) hint.classList.remove('is-on');
    }, { passive: true });
  }

  function createMap(container, options) {
    if (!window.L) return null;
    var opts = Object.assign({}, options || {});
    var cooperative = opts.dueDita && TOUCH;
    delete opts.dueDita;
    var map = L.map(container, Object.assign({
      scrollWheelZoom: false,     /* la rotella scorre la pagina, non la mappa */
      keyboard: true,
      tapTolerance: 20            /* un tocco un po' mosso conta ancora come tocco (dita tremanti, carrozzina in movimento) */
    }, opts, { zoomControl: false }));
    if (cooperative) dueDita(map);
    /* Testi dei controlli di Leaflet in italiano (WCAG 3.1.2) */
    L.control.zoom({ zoomInTitle: 'Avvicina', zoomOutTitle: 'Allontana' }).addTo(map);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    map.attributionControl.setPrefix(false);
    map.on('popupopen', function (ev) {
      var close = ev.popup.getElement().querySelector('.leaflet-popup-close-button');
      if (close) {
        close.setAttribute('aria-label', 'Chiudi');
        close.setAttribute('title', 'Chiudi');
      }
    });
    return map;
  }

  /* Segnaposto: colore + simbolo del giudizio (il significato non dipende solo dal colore) */
  function pinIcon(g) {
    return L.divIcon({
      className: 'pin pin--' + g,
      iconSize: null,
      html: '<span class="pin__drop"><svg class="pin__glyph" aria-hidden="true" focusable="false"><use href="' + ICONA_STATO[g] + '"/></svg></span>'
    });
  }

  /* Cerchio con il numero dei luoghi (gruppi di segnaposto e zone) */
  function iconaGruppo(n) {
    var t = n.toLocaleString('it-IT');
    return L.divIcon({
      className: 'cluster' + (n > 999 ? ' cluster--tanti' : ''),
      iconSize: L.point(48, 48),
      html: '<span aria-hidden="true">' + t + '</span><span class="visually-hidden">' + t + ' luoghi in questa zona: premi per avvicinarti</span>'
    });
  }

  /* Gruppi di luoghi vicini: cerchio con il numero, si apre zoomando.
     zone: il gruppo raccoglie zone (sezione 6b) e somma i loro luoghi, così due zone vicine non si sovrappongono */
  function clusterLayer(zone) {
    if (!L.markerClusterGroup) return L.layerGroup();
    /* Mappe con elenco accanto: gruppi e segnaposto fuori dall'ordine di tabulazione.
       Con la tastiera si usa l'elenco ("Mostra sulla mappa"), che ha le stesse informazioni. */
    L.MarkerCluster.mergeOptions({ keyboard: false });
    return L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      spiderfyDistanceMultiplier: 1.6,
      iconCreateFunction: function (cluster) {
        return iconaGruppo(zone
          ? cluster.getAllChildMarkers().reduce(function (s, m) { return s + m.options.n; }, 0)
          : cluster.getChildCount());
      }
    });
  }

  function popupContent(p) {
    var e = esigenza();
    return el('div', { className: 'popup' }, [
      verdictNode(p, e),
      el('strong', { className: 'popup__title', text: p.nome }),
      el('span', { className: 'popup__meta', text: (CATEGORIE[p.categoria] || '') + ' · ' + p.citta }),
      alertNode(p),
      featuresNode(p, e, 'popup__features'),
      el('a', { className: 'btn btn--primary btn--small popup__link', href: placeUrl(p) }, [
        document.createTextNode('Apri la scheda'),
        el('span', { className: 'visually-hidden', text: ': ' + p.nome })
      ])
    ]);
  }

  function segnaposto(p, onSelect, focusable) {
    var g = giudizio(p, esigenza());
    var marker = L.marker([p.lat, p.lng], {
      icon: pinIcon(g),
      title: p.nome + ', ' + p.citta + ': ' + GIUDIZIO[g].toLowerCase(),
      keyboard: !!focusable,
      riseOnHover: true
    });
    marker._oaG = g;
    marker.bindPopup(function () { return popupContent(p); }, { maxWidth: 280, minWidth: 220 });
    if (onSelect) marker.on('click', function () { onSelect(p.id); });
    return marker;
  }

  function addMarker(layer, p, onSelect, focusable) {
    return segnaposto(p, onSelect, focusable).addTo(layer);
  }

  /* Segnaposto aggiornati senza rifarli tutti, così un riquadro aperto resta aperto quando la mappa si sposta:
     toglie quelli che non servono più, aggiunge i nuovi, rifà quelli con un giudizio diverso (altra esigenza).
     markers: { id → segnaposto }, aggiornato qui */
  function aggiornaSegnaposto(layer, markers, found, onSelect) {
    var e = esigenza();
    var resta = {};
    var via = [];
    var nuovi = [];
    found.forEach(function (p) { resta[p.id] = giudizio(p, e); });
    Object.keys(markers).forEach(function (id) {
      if (resta[id] === markers[id]._oaG) return;
      via.push(markers[id]);
      delete markers[id];
    });
    found.forEach(function (p) {
      if (!markers[p.id]) nuovi.push(markers[p.id] = segnaposto(p, onSelect));
    });
    if (layer.removeLayers) {
      layer.removeLayers(via);
      layer.addLayers(nuovi);
    } else {
      via.forEach(function (m) { layer.removeLayer(m); });
      nuovi.forEach(function (m) { layer.addLayer(m); });
    }
  }

  /* ---------- 6b. Luoghi per area ----------
     Le mappe chiedono al database solo il riquadro che si vede, un po' più largo e allineato a una griglia, così i
     piccoli spostamenti non rifanno la richiesta. Se nel riquadro ci sono più di MAX_AREA luoghi arrivano le «zone»
     (quanti luoghi in ogni cella, con il comune più frequente): si avvicina la mappa per vederli uno per uno.
     Le risposte restano in memoria per 5 minuti (al massimo 24 riquadri); un riquadro arrivato per intero serve
     anche per tutti quelli che contiene, quindi avvicinarsi non rifà la richiesta. */
  var MAX_AREA = 800;
  var AREA_MS = 5 * 60 * 1000;
  var aree = [];

  /* Area visibile; con la mappa nascosta (telefono, vista «Elenco») si stima dalla misura della finestra */
  function areaVisibile(map) {
    var s = map.getSize();
    if (s.x && s.y) return map.getBounds();
    var c = map.project(map.getCenter());
    var m = L.point(window.innerWidth / 2, window.innerHeight / 2);
    return L.latLngBounds(map.unproject(c.subtract(m)), map.unproject(c.add(m)));
  }

  /* Riquadro da chiedere: l'area visibile allargata a mezza «piastrella» di mappa (256 pixel) per lato.
     passo: lato delle celle delle zone, circa 64 pixel */
  function riquadro(map) {
    var b = areaVisibile(map);
    var z = map.getZoom();
    var g = 180 / Math.pow(2, z);
    function giu(v) { return Math.floor(v / g) * g; }
    function su(v) { return Math.ceil(v / g) * g; }
    return {
      sud: Math.max(-90, giu(b.getSouth())), ovest: Math.max(-180, giu(b.getWest())),
      nord: Math.min(90, su(b.getNorth())), est: Math.min(180, su(b.getEast())),
      passo: g / 2
    };
  }

  function contiene(a, b) {
    return a.sud <= b.sud && a.ovest <= b.ovest && a.nord >= b.nord && a.est >= b.est;
  }

  function nelRiquadro(p, r) {
    return p.lat >= r.sud && p.lat <= r.nord && p.lng >= r.ovest && p.lng <= r.est;
  }

  /* → Promise di { luoghi } oppure { totale, zone } */
  function luoghiArea(r, cat, sensi) {
    var adesso = Date.now();
    aree = aree.filter(function (a) { return adesso - a.t < AREA_MS; });
    var chiave = [r.sud, r.ovest, r.nord, r.est, r.passo, cat || '', sensi ? 1 : 0].join('|');
    var a = aree.filter(function (x) { return x.chiave === chiave; })[0];
    if (a) return a.promessa;
    var largo = aree.filter(function (x) {
      return x.luoghi && (!x.cat || x.cat === cat) && (!x.sensi || sensi) && contiene(x, r);
    })[0];
    if (largo) {
      return Promise.resolve({ luoghi: largo.luoghi.filter(function (p) { return nelRiquadro(p, r) && (!cat || p.categoria === cat); }) });
    }
    a = { chiave: chiave, sud: r.sud, ovest: r.ovest, nord: r.nord, est: r.est, cat: cat || '', sensi: !!sensi, t: adesso };
    a.promessa = config.areaPlaces({
      sud: r.sud, ovest: r.ovest, nord: r.nord, est: r.est, categoria: cat || null, sensi: !!sensi, max: MAX_AREA, passo: r.passo
    }).then(function (x) {
      if (x.luoghi) a.luoghi = x.luoghi;
      return x;
    });
    a.promessa.catch(function () { aree = aree.filter(function (x) { return x !== a; }); });
    aree.unshift(a);
    aree.length = Math.min(aree.length, 24);
    return a.promessa;
  }

  /* Ricerca per testo sul server (con il tipo di luogo, se scelto); le ricerche già fatte restano in memoria
     finché la pagina è aperta */
  var ricerche = {};
  function cercaLuoghi(q, cat) {
    var k = normalize(q).replace(/\s+/g, ' ') + '|' + (cat || '');
    if (!ricerche[k]) {
      ricerche[k] = config.searchPlaces(q, cat || null);
      ricerche[k].catch(function () { delete ricerche[k]; });
    }
    return ricerche[k];
  }

  /* fn() alla fine di ogni spostamento della mappa (una volta sola se se ne fanno tanti di fila) */
  function dopoOgniSpostamento(map, fn) {
    var timer = null;
    map.on('moveend', function () {
      clearTimeout(timer);
      timer = setTimeout(fn, 200);
    });
  }

  function nomeZona(z) {
    return z.citta ? 'Intorno a ' + z.citta : 'In questa zona';
  }

  function quantiLuoghi(n) {
    return n === 1 ? '1 luogo' : n.toLocaleString('it-IT') + ' luoghi';
  }

  /* Porta la mappa sulla zona: i luoghi arrivano uno per uno, o zone più piccole */
  function avvicinaZona(map, z) {
    if (z.nord - z.sud < 0.002 && z.est - z.ovest < 0.002) map.setView([z.lat, z.lng], Math.max(map.getZoom() + 3, 15));
    else map.fitBounds([[z.sud, z.ovest], [z.nord, z.est]], { padding: [32, 32], maxZoom: 16 });
  }

  /* Zone sulla mappa: cerchio con il numero, come i gruppi di segnaposto; premendolo la mappa si avvicina */
  function disegnaZone(layer, map, zone) {
    layer.clearLayers();
    var mm = zone.map(function (z) {
      return L.marker([z.lat, z.lng], { keyboard: false, n: z.n, icon: iconaGruppo(z.n) })
        .on('click', function () { avvicinaZona(map, z); });
    });
    if (layer.addLayers) layer.addLayers(mm);
    else mm.forEach(function (m) { layer.addLayer(m); });
  }

  /* Pulsanti sulla mappa: "Vicino a me" (posizione solo nel browser, mai inviata) e "Tutta Italia".
     onLocate(lat, lng): chi usa la mappa riceve la posizione (es. per ordinare l'elenco per distanza).
     Restituisce { locate }, per cercare la posizione anche senza il pulsante (link «vicino a me»). */
  function addMapButtons(map, status, onLocate) {
    var api = {};
    var Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var box = L.DomUtil.create('div', 'map-tools');
        var near = el('button', { type: 'button', className: 'map-tools__btn' }, [icon('#icon-locate'), el('span', { text: 'Vicino a me' })]);
        var all = el('button', { type: 'button', className: 'map-tools__btn' }, [icon('#icon-italy'), el('span', { text: 'Tutta Italia' })]);
        box.appendChild(near);
        box.appendChild(all);
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);

        var me = null;
        api.locate = locate;
        near.addEventListener('click', locate);
        function locate() {
          if (!navigator.geolocation) {
            if (status) status.textContent = 'Il tuo browser non permette di trovare la posizione.';
            return;
          }
          if (status) status.textContent = 'Cerco la tua posizione…';
          navigator.geolocation.getCurrentPosition(function (pos) {
            var ll = [pos.coords.latitude, pos.coords.longitude];
            if (me) me.remove();
            me = L.circleMarker(ll, { radius: 9, color: '#ffffff', weight: 3, fillColor: '#162841', fillOpacity: 1, interactive: false }).addTo(map);
            map.setView(ll, 14);
            if (status) status.textContent = onLocate ? 'Mappa centrata sulla tua posizione. L\'elenco è in ordine di distanza.' : 'Mappa centrata sulla tua posizione.';
            if (onLocate) onLocate(ll[0], ll[1]);
          }, function () {
            if (status) status.textContent = 'Non è stato possibile trovare la tua posizione. Controlla i permessi del browser.';
          }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
        }
        all.addEventListener('click', function () {
          map.setView(ITALY.center, ITALY.zoom);
          if (status) status.textContent = 'Mappa di tutta Italia.';
        });
        return box;
      }
    });
    map.addControl(new Ctl());
    return api;
  }

  function distanceKm(a, b) {
    var r = Math.PI / 180;
    var x = Math.sin((b.lat - a.lat) * r / 2);
    var y = Math.sin((b.lng - a.lng) * r / 2);
    var h = x * x + Math.cos(a.lat * r) * Math.cos(b.lat * r) * y * y;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  /* ---------- 7. Home: mappa d'anteprima e ultimi luoghi ---------- */
  function initHome() {
    var box = document.getElementById('home-map');
    var latest = document.getElementById('latest-list');
    if (latest && config.latestPlaces) {
      config.latestPlaces().then(function (places) {
        function render() {
          latest.textContent = '';
          places
            .filter(function (p) { return visibile(p, esigenza()); })
            .slice(0, 3)
            .forEach(function (p) { latest.appendChild(placeCard(p)); });
        }
        render();
        onEsigenza(render);
      }).catch(function () {});
    }
    if (document.getElementById('home-stats') && config.stats) config.stats().then(statistiche).catch(function () {});

    var map = box && config.areaPlaces && createMap(box, { zoomControl: true, dueDita: true });
    if (!map) return;
    map.setView(ITALY.center, ITALY.zoom);
    var group = clusterLayer().addTo(map);
    var zoneLayer = clusterLayer(true).addTo(map);
    var markers = {};
    var area = null;
    var giro = 0;
    function disegna() {
      if (!area) return;
      if (area.zone) {
        group.clearLayers();
        markers = {};
        disegnaZone(zoneLayer, map, area.zone);
      } else {
        zoneLayer.clearLayers();
        aggiornaSegnaposto(group, markers, area.luoghi.filter(function (p) { return visibile(p, esigenza()); }));
      }
    }
    function carica() {
      var mio = ++giro;
      luoghiArea(riquadro(map), '', ESIGENZE[esigenza()].sensi).then(function (x) {
        if (mio !== giro) return;
        area = x;
        disegna();
      }).catch(function () {});
    }
    carica();
    dopoOgniSpostamento(map, carica);
    onEsigenza(function () { disegna(); carica(); });
  }

  /* Home: quanti luoghi e in quanti comuni (contati dal database). Il numero sale fino al valore quando si vede;
     per gli screen reader c'è subito il valore finale (il numero che si muove è nascosto). */
  function statistiche(valori) {
    var box = document.getElementById('home-stats');
    if (!box) return;
    var calmo = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dd = [].slice.call(box.querySelectorAll('[data-conta]'));
    dd.forEach(function (d) {
      var n = valori[d.getAttribute('data-conta')] || 0;
      d.textContent = '';
      d.appendChild(el('span', { className: 'stats__num', text: calmo ? n.toLocaleString('it-IT') : '0' }));
      d.lastChild.setAttribute('aria-hidden', 'true');
      d.appendChild(el('span', { className: 'visually-hidden', text: n.toLocaleString('it-IT') }));
      d._n = n;
    });
    box.hidden = false;
    if (calmo || !('IntersectionObserver' in window)) {
      dd.forEach(function (d) { d.firstChild.textContent = d._n.toLocaleString('it-IT'); });
      return;
    }
    var io = new IntersectionObserver(function (voci) {
      if (!voci.some(function (v) { return v.isIntersecting; })) return;
      io.disconnect();
      var t0 = null;
      function passo(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / 1400);
        var e = 1 - Math.pow(1 - k, 3);
        dd.forEach(function (d) { d.firstChild.textContent = Math.round(d._n * e).toLocaleString('it-IT'); });
        if (k < 1) requestAnimationFrame(passo);
      }
      requestAnimationFrame(passo);
    }, { threshold: 0.6 });
    io.observe(box);
  }

  /* ---------- 8. Pagina mappa: ricerca, filtri, elenco e mappa ----------
     Senza testo da cercare, mappa ed elenco mostrano i luoghi dell'area visibile (sezione 6b) e l'elenco segue la
     mappa. Con un testo, i luoghi arrivano dalla ricerca sul server e la mappa si adatta ai risultati. */
  function initExplore() {
    var form = document.getElementById('filters');
    var list = document.getElementById('results-list');
    var count = document.getElementById('results-count');
    var mapBox = document.getElementById('explore-map');
    if (!form || !list) return;

    var params = new URLSearchParams(location.search);
    form.elements.q.value = params.get('q') || '';
    form.elements.cat.value = params.get('cat') || '';
    params.getAll('f').forEach(function (f) {
      var box = form.querySelector('input[name="f"][value="' + CSS.escape(f) + '"]');
      if (box) box.checked = true;
    });

    /* Sul computer la tendina dei filtri è aperta; sul telefono chiusa, così la mappa si vede subito */
    var more = document.getElementById('filters-more');
    if (more && window.matchMedia('(min-width: 64em)').matches) more.open = true;

    var area = null;              /* luoghi (o zone) dell'area della mappa */
    var ricerca = null;           /* { totale, luoghi } quando si cerca per testo */
    var giro = 0;                 /* conta solo l'ultima richiesta: le risposte arrivate tardi si ignorano */
    var firma = '';               /* cosa c'è nell'elenco: se non cambia, l'elenco non si rifà */
    var map = null;
    var markers = {};
    var layer = null;
    var zoneLayer = null;
    var origin = null;            /* posizione di chi cerca, dopo «Vicino a me»: elenco in ordine di distanza */
    var tools = null;
    var view = viewSwitch();

    /* Telefono e tablet: «Mappa» o «Elenco», uno alla volta, così la mappa riempie lo schermo.
       Sul computer si vedono insieme e i due pulsanti spariscono (CSS). */
    function viewSwitch() {
      var layout = mapBox && mapBox.closest('.explore__layout');
      var wrap = mapBox && mapBox.closest('.explore__map-wrap');
      if (!layout || !wrap) return null;
      var num = el('span', { className: 'view-switch__count' });
      var bMap = el('button', { type: 'button', className: 'view-switch__btn', 'aria-pressed': 'true' }, [icon('#icon-map'), el('span', { text: 'Mappa' })]);
      var bList = el('button', { type: 'button', className: 'view-switch__btn', 'aria-pressed': 'false' }, [icon('#icon-list'), el('span', { text: 'Elenco' }), num]);
      layout.insertBefore(el('div', { className: 'view-switch', role: 'group', 'aria-label': 'Come vuoi vedere i luoghi' }, [bMap, bList]), wrap);
      function set(v) {
        layout.setAttribute('data-view', v);
        bMap.setAttribute('aria-pressed', v === 'map' ? 'true' : 'false');
        bList.setAttribute('aria-pressed', v === 'list' ? 'true' : 'false');
        if (v === 'map' && map) setTimeout(function () { map.invalidateSize(); }, 0);
      }
      bMap.addEventListener('click', function () { set('map'); });
      bList.addEventListener('click', function () { set('list'); });
      /* Il link «Vai all'elenco dei luoghi» mostra l'elenco */
      [].forEach.call(document.querySelectorAll('a[href="#results"]'), function (a) {
        a.addEventListener('click', function () { set('list'); });
      });
      if (location.hash === '#results') set('list'); else set('map');
      return { set: set, count: function (n) { num.textContent = ' (' + n.toLocaleString('it-IT') + ')'; } };
    }

    function selected() {
      return [].slice.call(form.querySelectorAll('input[name="f"]:checked')).map(function (i) { return i.value; });
    }

    function matches(p, cat, filters, e) {
      if (!visibile(p, e)) return false;
      if (cat && p.categoria !== cat) return false;
      for (var i = 0; i < filters.length; i++) {
        if (FILTRI[filters[i]] && !FILTRI[filters[i]](p, e)) return false;
      }
      return true;
    }

    function highlight(id) {
      [].forEach.call(list.querySelectorAll('.place'), function (li) {
        li.classList.toggle('is-active', li.getAttribute('data-id') === id);
      });
      Object.keys(markers).forEach(function (k) {
        var icn = markers[k].getElement();
        if (icn) icn.classList.toggle('is-active', k === id);
      });
    }

    /* "Mostra sulla mappa": porta la mappa sul luogo e apre il riquadro */
    function showOnMap(id) {
      var m = markers[id];
      if (!m || !map) return;
      highlight(id);
      if (view) view.set('map');
      if (window.matchMedia('(max-width: 63.99em)').matches) {
        mapBox.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      var open = function () { m.openPopup(); };
      if (layer.zoomToShowLayer) layer.zoomToShowLayer(m, open);
      else { map.setView(m.getLatLng(), 15); open(); }
    }

    /* Elenco rifatto senza perdere il punto in cui si era con la tastiera: stesso luogo e stesso comando,
       oppure il conteggio se quel luogo non c'è più */
    function rifaiElenco(items) {
      var a = document.activeElement;
      var dentro = !!a && a !== list && list.contains(a);
      var li = dentro ? a.closest('li[data-id]') : null;
      var cls = dentro && a.classList.length ? a.classList[0] : null;
      list.textContent = '';
      items.forEach(function (n) { list.appendChild(n); });
      if (!dentro) return;
      var stesso = li && list.querySelector('li[data-id="' + CSS.escape(li.getAttribute('data-id')) + '"]');
      var t = stesso && cls ? stesso.querySelector('.' + cls) : null;
      (t || count).focus();
    }

    function testo(node, t) {
      if (node.textContent !== t) node.textContent = t;
    }

    function vuoto(e) {
      return el('li', { className: 'empty vuoto vuoto--elenco' }, [
        el('span', { className: 'vuoto__icona' }, [icon('#icon-search')]),
        el('p', { text: ricerca ? 'Nessun luogo accessibile corrisponde alla ricerca.' : 'In quest\'area della mappa non c\'è nessun luogo accessibile che corrisponde ai filtri.' }),
        el('p', { text: ESIGENZE[e].sensi
          ? 'Per chi non vede o non sente bene abbiamo ancora poche informazioni: se conosci un luogo con Braille, LIS, percorsi tattili o anello magnetico, segnalalo dall\'app.'
          : ricerca ? 'Prova a togliere qualche filtro o a cercare un\'altra città.' : 'Prova ad allontanare la mappa, a togliere qualche filtro o a cercare una città.' })
      ]);
    }

    /* Zona dell'elenco (quando nell'area i luoghi sono troppi): porta la mappa lì */
    function zonaItem(z, i) {
      var btn = el('button', { type: 'button', className: 'place__show' }, [
        icon('#icon-pin'),
        el('span', {}, [
          document.createTextNode('Avvicina la mappa'),
          el('span', { className: 'visually-hidden', text: ': ' + nomeZona(z).toLowerCase() })
        ])
      ]);
      btn.addEventListener('click', function () {
        if (view) view.set('map');
        if (!list.offsetParent) map.getContainer().focus();
        setTimeout(function () { avvicinaZona(map, z); }, 0);
      });
      return el('li', { className: 'place place--zona', 'data-id': 'zona-' + i }, [
        el('h3', { className: 'place__title', text: nomeZona(z) }),
        el('p', { className: 'place__meta', text: quantiLuoghi(z.n) }),
        map ? btn : null
      ]);
    }

    function renderZone(attivi) {
      var vista = map ? areaVisibile(map) : null;
      var zone = area.zone.filter(function (z) { return !vista || vista.contains([z.lat, z.lng]); });
      var n = zone.reduce(function (s, z) { return s + z.n; }, 0);
      var nuova = 'zone|' + zone.map(function (z) { return z.lat + ',' + z.lng + ',' + z.n; }).join('|');
      if (nuova !== firma) {
        firma = nuova;
        rifaiElenco(zone.map(zonaItem));
      }
      if (view) view.count(n);
      testo(count, quantiLuoghi(n) + ' in quest\'area: scegli una zona o avvicina la mappa per vederli uno per uno' +
        (attivi ? '; i filtri valgono sui singoli luoghi' : '') + '.');
      if (map) {
        layer.clearLayers();
        markers = {};
        disegnaZone(zoneLayer, map, area.zone);
      }
    }

    function render(updateUrl, keepView) {
      var e = esigenza();
      var q = form.elements.q.value.trim();
      var cat = form.elements.cat.value;
      var filters = selected();
      /* «Filtri e tipo di luogo» (tendina): quanti sono attivi */
      var attivi = filters.length + (cat ? 1 : 0);
      var badge = document.getElementById('filters-active');
      if (badge) badge.textContent = attivi ? '(' + attivi + (attivi === 1 ? ' attivo)' : ' attivi)') : '';

      if (updateUrl) {
        var next = new URLSearchParams();
        if (esigenzaCorrente) next.set('per', esigenzaCorrente);
        if (q) next.set('q', q);
        if (cat) next.set('cat', cat);
        filters.forEach(function (f) { next.append('f', f); });
        var qs = next.toString();
        history.replaceState(null, '', qs ? '?' + qs : location.pathname);
      }

      if (!ricerca && !area) return;              /* i luoghi non sono ancora arrivati */
      list.removeAttribute('aria-busy');
      if (!ricerca && area.zone) return renderZone(attivi);

      /* Sulla mappa tutti i luoghi arrivati (anche appena fuori dai bordi); nell'elenco quelli che si vedono */
      var tutti = (ricerca || area).luoghi.filter(function (p) { return matches(p, cat, filters, e); });
      var vista = !ricerca && map ? areaVisibile(map) : null;
      var found = vista ? tutti.filter(function (p) { return vista.contains([p.lat, p.lng]); }) : tutti.slice();
      var km = {};
      if (origin) {
        found.forEach(function (p) { km[p.id] = distanceKm(origin, p); });
        found.sort(function (a, b) { return km[a.id] - km[b.id]; });
      }

      var nuova = [e, origin ? origin.lat + ',' + origin.lng : ''].concat(found.map(function (p) { return p.id; })).join('|');
      if (nuova !== firma) {
        firma = nuova;
        rifaiElenco(found.length
          ? found.map(function (p) { return placeCard(p, 'h3', map ? showOnMap : null, origin ? km[p.id] : null); })
          : [vuoto(e)]);
      }
      if (view) view.count(found.length);
      var piu = ricerca && ricerca.totale > ricerca.luoghi.length;
      /* Oltre i primi risultati: «I primi 200 dei 306 luoghi trovati», o quanti ne restano con i filtri */
      var primi = piu && 'i primi ' + ricerca.luoghi.length + ' dei ' + ricerca.totale.toLocaleString('it-IT') + ' luoghi trovati';
      testo(count, (ricerca
        ? (piu
          ? (found.length === ricerca.luoghi.length ? 'I' + primi.slice(1) : quantiLuoghi(found.length) + ' tra ' + primi) +
            ': aggiungi una parola per restringere la ricerca'
          : (found.length === 1 ? '1 luogo trovato' : found.length.toLocaleString('it-IT') + ' luoghi trovati'))
        : quantiLuoghi(found.length) + ' in quest\'area della mappa') +
        (origin ? ', dal più vicino' : '') + ' · giudizi per ' + ESIGENZE[e].nome.toLowerCase());

      if (map) {
        zoneLayer.clearLayers();
        aggiornaSegnaposto(layer, markers, tutti, highlight);
        if (ricerca && !keepView) {
          if (tutti.length) {
            /* Nell'app la barra in basso copre il fondo della mappa: i luoghi restano sopra la barra */
            var nav = document.querySelector('.app-nav');
            var sotto = nav && getComputedStyle(nav).position === 'fixed' ? nav.offsetHeight + 16 : 0;
            map.fitBounds(L.latLngBounds(tutti.map(function (p) { return [p.lat, p.lng]; })),
              { paddingTopLeft: [40, 40], paddingBottomRight: [40, 40 + sotto], maxZoom: 14 });
          } else {
            map.setView(ITALY.center, ITALY.zoom);
          }
        }
      }
    }

    function errore() {
      list.removeAttribute('aria-busy');
      testo(count, 'Non siamo riusciti a caricare i luoghi. Riprova tra poco.');
    }

    /* Luoghi dell'area della mappa (senza testo da cercare) */
    function caricaArea() {
      if (ricerca || form.elements.q.value.trim()) return;
      var r = map ? riquadro(map) : { sud: 35, ovest: 6, nord: 48, est: 19, passo: 0.5 };
      var mio = ++giro;
      list.setAttribute('aria-busy', 'true');
      luoghiArea(r, form.elements.cat.value, ESIGENZE[esigenza()].sensi).then(function (x) {
        if (mio !== giro) return;
        area = x;
        render(false, true);
      }).catch(function () { if (mio === giro) errore(); });
    }

    /* Ricerca per testo sul server; adatta: la mappa si sposta sui risultati */
    function cerca(adatta) {
      var q = form.elements.q.value.trim();
      var mio = ++giro;
      if (!q) {
        ricerca = null;
        firma = '';
        render(true, true);
        caricaArea();
        return;
      }
      list.setAttribute('aria-busy', 'true');
      cercaLuoghi(q, form.elements.cat.value).then(function (x) {
        if (mio !== giro) return;
        ricerca = x;
        firma = '';
        render(true, !adatta);
      }).catch(function () { if (mio === giro) errore(); });
    }

    var timer = null;
    form.addEventListener('input', function (ev) {
      var n = ev.target.name;
      if (n === 'esigenza') return;      /* gestito da onEsigenza */
      clearTimeout(timer);
      if (n === 'q') {
        timer = setTimeout(function () { cerca(true); }, 300);
      } else if (n === 'cat' && ricerca) {
        cerca(true);
      } else {
        render(true, !ricerca);
        if (n === 'cat') caricaArea();
      }
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      clearTimeout(timer);
      cerca(true);
      count.focus();
    });
    form.addEventListener('reset', function () {
      setTimeout(function () { cerca(true); }, 0);
    });

    if (!config.areaPlaces) {
      errore();
      return;
    }
    if (mapBox) {
      map = createMap(mapBox);
      if (map) {
        layer = clusterLayer().addTo(map);
        zoneLayer = clusterLayer(true).addTo(map);
        map.setView(ITALY.center, ITALY.zoom);
        tools = addMapButtons(map, document.getElementById('map-status'), function (lat, lng) {
          origin = { lat: lat, lng: lng };
          render(false, true);
        });
        dopoOgniSpostamento(map, caricaArea);
      }
    }
    cerca(true);
    /* Link «… vicino a me» (es. bagni accessibili): la posizione si chiede perché l'ha scelto chi usa il sito */
    if (tools && params.get('vicino') === '1') tools.locate();
    onEsigenza(function () {
      render(true, true);
      caricaArea();
    });
    /* «Bagni accessibili vicino a me» nella stessa pagina: filtro, posizione, elenco (senza ricaricare) */
    [].forEach.call(document.querySelectorAll('a.quick__link--near'), function (a) {
      a.addEventListener('click', function (ev) {
        if (!tools || new URL(a.href).pathname !== location.pathname) return;
        ev.preventDefault();
        var box = form.querySelector('input[name="f"][value="bagno"]');
        if (box) box.checked = true;
        render(true, !ricerca);
        if (view) view.set('list');
        tools.locate();
      });
    });
  }

  /* ---------- 9. Indicazioni stradali: si sceglie l'app ---------- */
  function directionsLinks(p) {
    var ll = p.lat + ',' + p.lng;
    var enc = encodeURIComponent(ll);
    var links = [
      ['Google Maps', 'https://www.google.com/maps/dir/?api=1&destination=' + enc],
      ['Apple Mappe', 'https://maps.apple.com/?daddr=' + enc + '&dirflg=d'],
      ['Waze', 'https://waze.com/ul?ll=' + enc + '&navigate=yes'],
      ['OpenStreetMap', 'https://www.openstreetmap.org/directions?to=' + enc]
    ];
    /* geo: fa scegliere al telefono tra le app installate (solo Android) */
    if (/Android/i.test(navigator.userAgent)) {
      links.push(['Altra app del telefono', 'geo:' + ll + '?q=' + enc + '(' + encodeURIComponent(p.nome) + ')']);
    }
    return links;
  }

  function initDirections(p) {
    var toggle = document.getElementById('directions-toggle');
    var panel = document.getElementById('directions-list');
    if (!toggle || !panel) return;
    var list = panel.querySelector('ul');
    list.textContent = '';
    directionsLinks(p).forEach(function (l) {
      var external = l[1].indexOf('geo:') !== 0;
      list.appendChild(el('li', {}, [
        el('a', external ? { className: 'directions__link', href: l[1], rel: 'noopener', target: '_blank' } : { className: 'directions__link', href: l[1] }, [
          el('span', { text: l[0] }),
          external ? el('span', { className: 'visually-hidden', text: ' (app o sito esterno)' }) : null,
          external ? icon('#icon-external') : null
        ])
      ]));
    });

    function setOpen(open, focusToggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
      if (!open && focusToggle) toggle.focus();
    }
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      setOpen(open);
      if (open) list.querySelector('a').focus();
    });
    panel.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') setOpen(false, true);
    });
    toggle.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') setOpen(false);
    });
    document.addEventListener('click', function (ev) {
      if (!panel.hidden && !panel.contains(ev.target) && !toggle.contains(ev.target)) setOpen(false);
    });
    /* Su iPhone, toccando un link il focus passa prima a <main> (tabindex -1): senza questo controllo
       il pannello si chiuderebbe prima del clic e il link non si aprirebbe. Il focusout chiude solo con la tastiera. */
    var pressing = false;
    function press() {
      pressing = true;
      setTimeout(function () { pressing = false; }, 800);
    }
    panel.addEventListener('touchstart', press, { passive: true });
    panel.addEventListener('mousedown', press);
    panel.addEventListener('focusout', function (ev) {
      if (pressing) return;
      if (ev.relatedTarget && !panel.contains(ev.relatedTarget) && ev.relatedTarget !== toggle) setOpen(false);
    });
  }

  /* ---------- 10. Scheda luogo ---------- */
  var DETTAGLI = {
    tavoli_cm: ['Altezza dei tavoli', 'cm'],
    spazio_gambe: ['Spazio per le gambe sotto il tavolo'],
    camere_accessibili: ['Camere accessibili', 'num'],
    doccia_filo: ['Doccia a filo pavimento'],
    passerella: ['Passerella fino all\'acqua'],
    sedia_mare: ['Sedia da mare disponibile'],
    posti_carrozzina: ['Posti per carrozzina in sala', 'num'],
    accompagnatore_gratis: ['Biglietto gratuito per l\'accompagnatore'],
    assistenza_prenotabile: ['Assistenza da prenotare'],
    preavviso_ore: ['Preavviso per l\'assistenza', 'ore'],
    percorso_tattile: ['Percorso tattile'],
    ausili_prestito: ['Ausili in prestito (es. sedia a rotelle)']
  };

  var TITOLO_DETTAGLI = {
    ristorante: 'Al tavolo', hotel: 'Camere', spiaggia: 'In spiaggia', cultura: 'In sala',
    trasporti: 'Il viaggio', museo: 'La visita', parco: 'Nel parco', negozio: 'Nel negozio'
  };

  function siNo(v) {
    return v === true ? ['si', 'Sì'] : v === false ? ['no', 'No'] : ['nv', 'Da verificare'];
  }

  function valoreDettaglio(key, v) {
    var tipo = DETTAGLI[key][1];
    if (!tipo) return siNo(v);
    if (v == null) return ['nv', 'Da verificare'];
    if (tipo === 'cm') return ['info', v + ' cm'];
    if (tipo === 'ore') return ['info', 'Almeno ' + v + ' ore prima'];
    return ['info', String(v)];
  }

  function infoRow(label, st, note) {
    var value = st[0] === 'info'
      ? el('span', { className: 'status status--info', text: st[1] })
      : statusNode(st);
    return el('div', { className: 'facts__row' }, [
      el('dt', { text: label }),
      el('dd', {}, [value, note ? el('p', { className: 'facts__note', text: note }) : null])
    ]);
  }

  /* «In breve»: il giudizio per l'esigenza scelta e le voci che contano di più, in cima alla scheda */
  function renderSummary(p, e) {
    var box = document.getElementById('summary-list');
    var verdict = document.getElementById('summary-verdict');
    if (!box || !verdict) return;
    var g = giudizio(p, e);
    verdict.className = 'summary__verdict summary__verdict--' + g;
    verdict.textContent = '';
    verdict.appendChild(icon(ICONA_STATO[g]));
    verdict.appendChild(el('span', {}, [
      el('strong', { text: GIUDIZIO[g] }),
      el('span', { className: 'summary__who', text: ' per ' + ESIGENZE[e].nome.toLowerCase() +
        (soloOsm(p) && g !== 'nv' ? ', secondo OpenStreetMap' : '') })
    ]));
    var aiuto = document.getElementById('per-chi-aiuto');
    if (aiuto) {
      aiuto.textContent = esigenzaCorrente ? '' : 'Non hai ancora scelto la tua esigenza: per ora vedi i giudizi per la carrozzina manuale. Cambiala da «Valuto per».';
      aiuto.hidden = !!esigenzaCorrente;
    }
    box.textContent = '';
    /* Luoghi da OpenStreetMap ancora senza misure: in evidenza cosa dice la mappa, invece di quattro «da verificare» */
    if (soloOsm(p)) {
      var OSM_TXT = { yes: ['si', 'Sì, secondo OpenStreetMap'], limited: ['parziale', 'In parte, secondo OpenStreetMap'], no: ['no', 'No, secondo OpenStreetMap'] };
      [['Accesso in carrozzina', p.osm.wheelchair], ['Bagno accessibile', p.osm.toilets_wheelchair]].forEach(function (r) {
        var st = OSM_TXT[r[1]] || ['nv', 'Non indicato'];
        box.appendChild(el('li', { className: 'summary__item summary__item--' + st[0] }, [
          icon(ICONA_STATO[st[0]]),
          el('span', {}, [
            el('span', { className: 'visually-hidden', text: PREFISSO_STATO[st[0]] }),
            el('strong', { className: 'summary__name', text: r[0] }),
            el('span', { className: 'summary__text', text: st[1] })
          ])
        ]));
      });
      box.appendChild(el('li', { className: 'summary__item summary__item--nv summary__item--wide' }, [
        icon(ICONA_STATO.nv),
        el('span', {}, [
          el('strong', { className: 'summary__name', text: 'Misure da raccogliere' }),
          el('span', { className: 'summary__text', text: 'Gradini, porta e bagno non li ha ancora misurati nessuno. Ci sei stato? Rispondi alle domande qui sotto.' })
        ])
      ]));
      return;
    }
    var keys = ESIGENZE[e].sensi ? ESIGENZE[e].voci : ['ingresso', 'porta', 'piani', 'bagno'].concat(e === 'anziani' ? ['sedute'] : []);
    keys.forEach(function (k) {
      var v = voce(k);
      var st = v.valuta(p, e);
      if (k === 'porta' && st[0] === 'np') return;
      box.appendChild(el('li', { className: 'summary__item summary__item--' + st[0] }, [
        icon(ICONA_STATO[st[0]]),
        el('span', {}, [
          el('span', { className: 'visually-hidden', text: PREFISSO_STATO[st[0]] }),
          el('strong', { className: 'summary__name', text: v.nome }),
          el('span', { className: 'summary__text', text: st[1] })
        ])
      ]));
    });
    var park = (p.facoltativi || {}).parcheggio || {};
    if (park.posti === true && !ESIGENZE[e].sensi) {
      box.appendChild(el('li', { className: 'summary__item summary__item--si' }, [
        icon(ICONA_STATO.si),
        el('span', {}, [
          el('span', { className: 'visually-hidden', text: PREFISSO_STATO.si }),
          el('strong', { className: 'summary__name', text: 'Parcheggio' }),
          el('span', { className: 'summary__text', text: 'Posti riservati' + (park.distanza_m != null ? (park.distanza_m === 0 ? ' all\'ingresso' : ' a ' + park.distanza_m + ' m') : '') })
        ])
      ]));
    }
  }

  /* Scheda divisa per momento della visita: Entrare, Dentro, Bagno, Arrivare, Vista e udito, dettagli del tipo di
     luogo. Ogni voce ha un giudizio solo, quello per l'esigenza scelta («Valuto per», in «In breve»); le voci che non
     contano per quell'esigenza (gradini per chi non vede, per esempio) si giudicano come per chi cammina con fatica. */
  var GRUPPI_VOCI = { ingresso: 'entrare', porta: 'entrare', spazi: 'dentro', piani: 'dentro', sedute: 'dentro', bagno: 'bagno' };

  function rigaVoce(v, p, e) {
    var st = v.valuta(p, ESIGENZE[e].sensi && !v.sensi ? 'cammino' : e);
    if (v.key === 'porta' && st[0] === 'np') return null;
    return infoRow(v.nome, st, v.nota(p));
  }

  function renderDetail(p) {
    var e = esigenza();
    renderSummary(p, e);

    var box = {};
    ['entrare', 'dentro', 'bagno', 'arrivare'].forEach(function (k) {
      box[k] = document.getElementById('detail-' + k);
      if (box[k]) box[k].textContent = '';
    });
    var senses = document.getElementById('detail-senses');
    var sensesEmpty = document.getElementById('detail-senses-empty');
    if (senses) senses.textContent = '';
    var sensiNoti = false;
    var f = p.facoltativi || {};

    VOCI.forEach(function (v) {
      if (v.sensi) {
        if (!senses) return;
        if (v.valuta(p, e)[0] !== 'nv') sensiNoti = true;
        senses.appendChild(rigaVoce(v, p, e));
        return;
      }
      var dove = box[GRUPPI_VOCI[v.key]];
      var riga = dove && rigaVoce(v, p, e);
      if (riga) dove.appendChild(riga);
      /* dopo la porta, com'è fatta e il pavimento */
      if (v.key === 'porta' && box.entrare) {
        var porta = { automatica: 'Automatica', manuale: 'Da aprire a mano', pesante: 'Pesante da aprire' }[f.porta_tipo];
        var pav = { liscio: 'Liscio', irregolare: 'Irregolare (sampietrini, legno, sabbia)', ghiaia: 'Ghiaia' }[f.pavimento];
        if (p.misure.ingresso.porta_cm !== 0) box.entrare.appendChild(infoRow('Tipo di porta', porta ? ['info', porta] : ['nv', 'Da verificare']));
        box.entrare.appendChild(infoRow('Pavimento', pav ? ['info', pav] : ['nv', 'Da verificare']));
      }
    });
    if (senses) {
      senses.hidden = !sensiNoti;
      if (sensesEmpty) sensesEmpty.hidden = sensiNoti;
    }

    if (box.arrivare) {
      var park = f.parcheggio || {};
      var parkSt = park.posti === true
        ? ['si', 'Posti riservati' + (park.distanza_m != null ? (park.distanza_m === 0 ? ' all\'ingresso' : ' a ' + park.distanza_m + ' m') : '')]
        : park.posti === false ? ['no', 'Nessun posto riservato vicino'] : ['nv', 'Da verificare'];
      box.arrivare.appendChild(infoRow('Parcheggio', parkSt, park.nota));
      var ass = f.assistenza || {};
      box.arrivare.appendChild(infoRow('Assistenza del personale', ass.valore === true ? ['si', 'Disponibile'] : ass.valore === false ? ['no', 'Non disponibile'] : ['nv', 'Da verificare'], ass.nota));
    }

    /* Un riquadro in cui non si sa ancora niente: una riga sola invece di tanti «Da verificare» */
    Object.keys(box).forEach(function (k) {
      var dl = box[k];
      if (!dl) return;
      var vuoto = !dl.querySelector('.status:not(.status--nv)');
      var msg = dl.parentNode.querySelector('.detail__vuoto');
      if (!msg) {
        msg = el('p', { className: 'place__meta detail__vuoto', text: 'Nessuno ha ancora raccolto queste informazioni. Ci sei stato? Proponi una correzione.' });
        dl.parentNode.insertBefore(msg, dl);
      }
      msg.hidden = !vuoto;
      dl.hidden = vuoto;
    });

    /* Luoghi importati da OpenStreetMap: cosa dice la mappa, nella parte sulla provenienza dei dati */
    var osmBox = document.getElementById('detail-osm');
    if (osmBox) {
      osmBox.textContent = '';
      var osm = p.osm || null;
      osmBox.hidden = !osm;
      if (osm) {
        var OSM_VAL = { yes: ['si', 'Sì'], limited: ['parziale', 'In parte'], no: ['no', 'No'] };
        osmBox.appendChild(infoRow('OpenStreetMap: accesso in carrozzina', OSM_VAL[osm.wheelchair] || ['nv', 'Non indicato']));
        osmBox.appendChild(infoRow('OpenStreetMap: bagno accessibile', OSM_VAL[osm.toilets_wheelchair] || ['nv', 'Non indicato']));
      }
    }

    /* Dettagli per tipo di luogo */
    var det = p.dettagli || {};
    var keys = Object.keys(det).filter(function (k) { return DETTAGLI[k]; });
    var detBox = document.getElementById('detail-specific');
    var detList = document.getElementById('detail-specific-list');
    detList.textContent = '';
    detBox.hidden = !keys.length;
    var detTitle = document.getElementById('detail-specific-title');
    detTitle.lastChild.textContent = TITOLO_DETTAGLI[p.categoria] || 'Dettagli';
    keys.forEach(function (k) { detList.appendChild(infoRow(DETTAGLI[k][0], valoreDettaglio(k, det[k]))); });
  }

  function initDetail() {
    var root = document.getElementById('detail');
    if (!root) return;
    var id = new URLSearchParams(location.search).get('id');

    loadPlace(id).then(function (p) {
      if (!p) {
        document.getElementById('detail-title').textContent = 'Luogo non trovato';
        document.getElementById('detail-intro').textContent = 'Il luogo che cerchi non esiste o è stato rimosso.';
        document.getElementById('detail-body').hidden = true;
        root.classList.add('detail--missing');
        document.title = 'Luogo non trovato – Ovunque Accessibile';
        return;
      }

      document.title = p.nome + ', ' + p.citta + ' – Ovunque Accessibile';
      document.getElementById('crumb-current').textContent = p.nome;
      document.getElementById('detail-cat').textContent = CATEGORIE[p.categoria] || '';
      document.getElementById('detail-title').textContent = p.nome;
      /* CAP e provincia sono facoltativi nelle segnalazioni: si mostrano solo se ci sono */
      document.getElementById('detail-address').textContent = p.indirizzo + ', ' + (p.cap ? p.cap + ' ' : '') + p.citta + (p.provincia ? ' (' + p.provincia + ')' : '');
      document.getElementById('detail-intro').textContent = p.descrizione || '';

      var v = verifica(p);
      var trust = document.getElementById('detail-trust');
      trust.textContent = '';
      trust.appendChild(verificaNode(p));
      var dateBox = document.getElementById('detail-date');
      dateBox.textContent = v.livello === 'osm'
        ? 'Dati di OpenStreetMap (© contributori di OpenStreetMap, licenza ODbL), importati il ' + formatDate(p.osm && p.osm.importato || v.data) +
          '. Nessuno di noi li ha ancora controllati: se ci sei stato, proponi una correzione con le misure. '
        : v.data
        ? (v.scaduta
          ? 'Ultima verifica: ' + formatDate(v.data) + '. Sono passati più di ' + SCADENZA_MESI + ' mesi: le informazioni potrebbero essere cambiate.'
          : 'Ultima verifica: ' + formatDate(v.data) + '.')
        : 'Non ancora verificato: le informazioni arrivano da una segnalazione.';
      if (v.livello === 'osm' && p.osm && p.osm.ref) {
        dateBox.appendChild(el('a', { href: 'https://www.openstreetmap.org/' + p.osm.ref, rel: 'noopener', target: '_blank' }, [
          document.createTextNode('Vedi il luogo su OpenStreetMap'), el('span', { className: 'visually-hidden', text: ' (si apre in una nuova scheda)' })
        ]));
      }

      initDirections(p);

      var report = document.getElementById('detail-report');
      report.href = config.reportHref ? config.reportHref(p) : 'mailto:ovunqueaccessibile@gmail.com?subject=' +
        encodeURIComponent('Correzione scheda: ' + p.nome + ', ' + p.citta + ' (' + p.id + ')');

      var invito = document.getElementById('veloce-link');
      if (invito) {
        invito.hidden = !mancanti(p).length;
        invito.querySelector('a').href = 'app/luogo.html?id=' + encodeURIComponent(p.id) + '#veloce';
      }

      var fix = document.getElementById('detail-source-fix');
      if (fix) {
        fix.textContent = 'Qualcosa non torna o è cambiato? ';
        fix.appendChild(el('a', { href: report.href, text: 'Proponi una correzione' }));
      }

      var per = document.getElementById('per-chi');
      if (per) {
        per.value = esigenza();
        per.addEventListener('change', function () {
          setEsigenza(per.value);
          var live = document.getElementById('per-chi-live');
          if (live) live.textContent = 'Giudizi aggiornati per ' + ESIGENZE[esigenza()].nome.toLowerCase() + '.';
        });
        onEsigenza(function () { per.value = esigenza(); });
      }

      renderDetail(p);
      onEsigenza(function () { renderDetail(p); });
      document.getElementById('detail-body').hidden = false;
      if (config.onDetail) config.onDetail(p);

      var box = document.getElementById('detail-map');
      var map = createMap(box, { zoomControl: true, dueDita: true });
      if (map) {
        map.setView([p.lat, p.lng], 16);
        var marker = addMarker(map, p, null, true);
        marker.openPopup();
        onEsigenza(function () {
          marker.setIcon(pinIcon(giudizio(p, esigenza())));
          marker.setPopupContent(popupContent(p));
        });
      }
    }).catch(function () {
      document.getElementById('detail-intro').textContent = 'Non siamo riusciti a caricare la scheda. Ricarica la pagina tra poco.';
    });
  }

  window.OA = {
    config: config,
    start: function () {
      initNeedsPicker();
      initHome();
      initExplore();
      initDetail();
    },
    CATEGORIE: CATEGORIE, ESEMPI_CATEGORIE: ESEMPI_CATEGORIE, ESIGENZE: ESIGENZE, ORDINE_ESIGENZE: ORDINE_ESIGENZE,
    GIUDIZIO: GIUDIZIO, ICONA_STATO: ICONA_STATO, TITOLO_DETTAGLI: TITOLO_DETTAGLI, AVVISI: AVVISI,
    giudizio: giudizio, distanceKm: distanceKm, completezza: completezza, mancanti: mancanti,
    esigenza: esigenza, scelta: function () { return esigenzaCorrente; }, setEsigenza: setEsigenza, onEsigenza: onEsigenza,
    el: el, icon: icon, formatDate: formatDate, normalize: normalize,
    statusNode: statusNode, verdictNode: verdictNode, placeCard: placeCard,
    createMap: createMap, pinIcon: pinIcon, ITALY: ITALY,
    /* dopo una modifica (avviso aggiunto o chiuso): i riquadri e le ricerche si richiedono al database */
    svuotaLuoghi: function () { aree = []; ricerche = {}; }
  };
})();
