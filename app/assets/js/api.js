/* Ovunque Accessibile – web-app: accesso ai dati (window.OAApi).
   Due versioni con le stesse funzioni:
   - Supabase: quando config.js contiene URL e chiave pubblica del progetto;
   - Prova: senza configurazione. Luoghi di esempio del sito, account finti, tutto salvato solo in questo browser.
   Ogni funzione restituisce una Promise; gli errori arrivano già scritti in italiano (Error.message). */
(function () {
  'use strict';

  var CFG = window.OA_CONFIG || {};
  var PRIVACY = CFG.privacyVersion || 'app';
  var COLONNE = 'id,slug,nome,categoria,indirizzo,cap,citta,provincia,regione,lat,lng,descrizione,misure,facoltativi,dettagli,verifica_livello,verifica_data,stato,esempio,osm';
  var COLONNE_AVVISI = 'id,place_id,autore_nome,tipo,testo,scade_il,created_at';
  var COLONNE_RECENSIONI = 'id,autore_nome,esigenza,data_visita,testo,risposte,risposta,risposta_at,created_at';
  var authListeners = [];

  function notify(user) {
    authListeners.forEach(function (fn) { fn(user); });
  }

  /* Riga del database → forma usata da oa-core.js (come luoghi.json) */
  function toPlace(r) {
    return {
      id: r.id, slug: r.slug, nome: r.nome, categoria: r.categoria, indirizzo: r.indirizzo, cap: r.cap,
      citta: r.citta, provincia: r.provincia, regione: r.regione, lat: r.lat, lng: r.lng, descrizione: r.descrizione,
      misure: r.misure, facoltativi: r.facoltativi || {}, dettagli: r.dettagli || {},
      verifica: { livello: r.verifica_livello, data: r.verifica_data }, stato: r.stato, esempio: r.esempio,
      osm: r.osm || null, avvisi: []
    };
  }

  function oggi() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function traGiorni(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* Avvisi attivi attaccati ai luoghi (p.avvisi), i più recenti prima */
  function withAlerts(places, alerts) {
    var by = {};
    alerts.forEach(function (a) { (by[a.place_id] = by[a.place_id] || []).push(a); });
    places.forEach(function (p) {
      p.avvisi = (by[p.id] || []).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    });
    return places;
  }

  /* Messaggi d'errore comprensibili (i testi in italiano arrivano già dal database) */
  var AUTH_ERRORI = {
    invalid_credentials: 'Email o password non corrette.',
    email_not_confirmed: 'Prima devi confermare l\'email: apri il link che ti abbiamo mandato.',
    user_already_exists: 'Esiste già un account con questa email. Prova ad accedere.',
    weak_password: 'Password troppo debole: usa almeno 10 caratteri, con lettere e numeri, e non riusarne una di altri siti.',
    same_password: 'La nuova password deve essere diversa da quella attuale.',
    over_email_send_rate_limit: 'Troppe email inviate: aspetta qualche minuto e riprova.',
    over_request_rate_limit: 'Troppi tentativi: aspetta qualche minuto e riprova.',
    session_not_found: 'La sessione è scaduta: accedi di nuovo.'
  };

  function friendly(err) {
    if (!err) return new Error('Qualcosa è andato storto. Riprova tra poco.');
    if (AUTH_ERRORI[err.code]) return new Error(AUTH_ERRORI[err.code]);
    var msg = String(err.message || '');
    if (/fetch|network|Failed to/i.test(msg)) return new Error('Connessione assente o instabile: controlla internet e riprova.');
    if (/Invalid login credentials/i.test(msg)) return new Error(AUTH_ERRORI.invalid_credentials);
    if (/violates check constraint|invalid input|violates/i.test(msg)) return new Error('Alcuni dati non sono validi: controlla i campi e riprova.');
    if (/permission denied|JWT|row-level security/i.test(msg)) return new Error('Non hai i permessi per questa operazione. Prova ad accedere di nuovo.');
    /* Messaggi scritti da noi nel database (raise exception) */
    if (/^[A-ZÀ-Ú][^<>]{3,200}$/.test(msg) && !/[a-z]+_[a-z]+/.test(msg)) return new Error(msg);
    return new Error('Qualcosa è andato storto. Riprova tra poco.');
  }

  function check(res) {
    if (res.error) throw friendly(res.error);
    return res.data;
  }

  /* ======================================================================
     Versione Supabase
     ====================================================================== */
  function supabaseApi() {
    var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'oa-auth' },
      global: { headers: { 'x-client-info': 'ovunque-accessibile-app' } }
    });
    var current = null;
    var profileCache = null;

    var ready = sb.auth.getSession().then(function (res) {
      current = res.data && res.data.session ? res.data.session.user : null;
    }).catch(function () { current = null; });

    sb.auth.onAuthStateChange(function (event, session) {
      var next = session ? session.user : null;
      if ((next && next.id) !== (current && current.id)) profileCache = null;
      current = next;
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') notify(current);
    });

    function uid() {
      if (!current) throw new Error('Serve l\'accesso.');
      return current.id;
    }

    /* URL firmati, validi un'ora: il bucket è privato e le policy decidono chi può leggere cosa */
    function signPhotos(rows) {
      if (!rows.length) return [];
      return sb.storage.from('foto').createSignedUrls(rows.map(function (r) { return r.path; }), 3600).then(check).then(function (urls) {
        return rows.map(function (r, i) {
          return { id: r.id, alt: r.alt, autore_nome: r.autore_nome, stato: r.stato, url: urls[i] && urls[i].signedUrl };
        }).filter(function (r) { return r.url; });
      });
    }

    function redirect(page) {
      return new URL(page, location.href).href;
    }

    /* Supabase restituisce al massimo 1000 righe per richiesta: si leggono a pagine finché non finiscono */
    var PAGINA = 1000;
    function allRows(query, from, acc) {
      from = from || 0;
      acc = acc || [];
      return query(from, from + PAGINA - 1).then(check).then(function (rows) {
        acc = acc.concat(rows);
        return rows.length < PAGINA || acc.length >= 20000 ? acc : allRows(query, from + PAGINA, acc);
      });
    }

    function activeAlerts(placeId) {
      var q = sb.from('avvisi').select(COLONNE_AVVISI).eq('stato', 'attivo').gte('scade_il', oggi());
      if (placeId) q = q.eq('place_id', placeId);
      return q.order('created_at', { ascending: false }).limit(placeId ? 5 : 1000).then(check);
    }

    return {
      mode: 'supabase',
      ready: ready,
      user: function () { return current; },
      onAuth: function (fn) { authListeners.push(fn); },

      signUp: function (d) {
        return sb.auth.signUp({
          email: d.email, password: d.password,
          options: {
            emailRedirectTo: redirect('accedi.html?confermata=1'),
            data: { nome_pubblico: d.nome, privacy_version: PRIVACY, eta_minima: true }
          }
        }).then(check).then(function (data) {
          return { confirm: !data.session };
        });
      },
      signIn: function (email, password) {
        return sb.auth.signInWithPassword({ email: email, password: password }).then(check);
      },
      signOut: function () {
        profileCache = null;
        return sb.auth.signOut({ scope: 'local' }).then(function () { current = null; notify(null); });
      },
      requestReset: function (email) {
        return sb.auth.resetPasswordForEmail(email, { redirectTo: redirect('password.html?nuova=1') }).then(check);
      },
      updatePassword: function (password) {
        return sb.auth.updateUser({ password: password }).then(check);
      },

      profile: function () {
        if (!current) return Promise.resolve(null);
        if (profileCache) return Promise.resolve(profileCache);
        return sb.from('profiles').select('nome_pubblico,esigenza,ruolo').eq('id', uid()).maybeSingle()
          .then(check).then(function (p) { profileCache = p; return p; });
      },
      updateProfile: function (patch) {
        return sb.from('profiles').update(patch).eq('id', uid()).select('nome_pubblico,esigenza,ruolo').single()
          .then(check).then(function (p) { profileCache = p; return p; });
      },

      listPlaces: function () {
        return Promise.all([
          allRows(function (from, to) {
            /* solo le schede pubbliche: anche per i moderatori, i luoghi «da approvare» stanno nel pannello */
            return sb.from('places').select(COLONNE).in('stato', ['pubblicato', 'in-revisione']).order('nome').order('id').range(from, to);
          }),
          activeAlerts().catch(function () { return []; })
        ]).then(function (r) { return withAlerts(r[0].map(toPlace), r[1]); });
      },
      allPlacesForModeration: function () {
        return allRows(function (from, to) {
          return sb.from('places').select('id,nome,citta,stato').order('nome').order('id').range(from, to);
        });
      },
      getPlace: function (id) {
        return sb.from('places').select(COLONNE).eq('id', id).maybeSingle()
          .then(check).then(function (r) { return r ? toPlace(r) : null; });
      },
      reviews: function (placeId) {
        return sb.from('recensioni').select(COLONNE_RECENSIONI)
          .eq('place_id', placeId).eq('stato', 'pubblicata').order('created_at', { ascending: false }).limit(50)
          .then(check);
      },

      /* Avvisi temporanei: { list, mine: [id…] } */
      alerts: function (placeId) {
        return Promise.all([
          activeAlerts(placeId),
          current ? sb.rpc('avvisi_miei', { p_place: placeId }).then(check) : Promise.resolve([])
        ]).then(function (r) {
          return { list: r[0], mine: (r[1] || []).map(function (x) { return typeof x === 'string' ? x : x.avvisi_miei; }) };
        });
      },
      addAlert: function (a) {
        return sb.from('avvisi').insert({ place_id: a.place_id, tipo: a.tipo, testo: a.testo || null, scade_il: traGiorni(a.giorni - 1) }).then(check);
      },
      closeAlert: function (id, stato) {
        return sb.rpc('chiudi_avviso', { p_id: id, p_stato: stato }).then(check);
      },

      /* Gestori: la mia richiesta per un luogo (o null), nuova richiesta, risposta a una recensione */
      ownerStatus: function (placeId) {
        if (!current) return Promise.resolve(null);
        return sb.from('gestori').select('id,stato,motivo,created_at').eq('place_id', placeId).maybeSingle().then(check);
      },
      requestOwner: function (g) {
        return sb.from('gestori').insert(g).then(check);
      },
      replyReview: function (id, testo) {
        return sb.rpc('rispondi_recensione', { p_id: id, p_testo: testo }).then(check);
      },
      decideOwner: function (id, stato, motivo) {
        return sb.rpc('decidi_gestore', { p_id: id, p_stato: stato, p_motivo: motivo || null }).then(check);
      },

      /* Locali che gestisco (richieste da gestore, con la scheda) e richieste di verifica sul posto */
      myOwnerships: function () {
        if (!current) return Promise.resolve([]);
        return sb.from('gestori').select('id,place_id,stato,motivo,created_at,places(id,nome,citta,verifica_livello,verifica_data)')
          .order('created_at', { ascending: false }).then(check);
      },
      myVerifications: function () {
        if (!current) return Promise.resolve([]);
        return sb.from('verifiche').select('id,place_id,disponibilita,nota,stato,risposta,created_at,deciso_at')
          .order('created_at', { ascending: false }).then(check);
      },
      requestVerification: function (v) {
        return sb.from('verifiche').insert(v).then(check);
      },
      withdrawVerification: function (id) {
        return sb.from('verifiche').delete().eq('id', id).then(check);
      },
      pendingVerifications: function () {
        return Promise.all([
          sb.from('verifiche').select('id,place_id,nome,disponibilita,nota,stato,risposta,created_at,places(nome,citta,indirizzo)')
            .in('stato', ['in-attesa', 'fissata']).order('created_at').limit(200),
          sb.from('gestori').select('place_id,nome,ruolo,contatto').eq('stato', 'approvato').limit(2000)
        ]).then(function (r) {
          var gest = check(r[1]);
          return check(r[0]).map(function (v) {
            v.gestori = gest.filter(function (g) { return g.place_id === v.place_id; });
            return v;
          });
        });
      },
      importOsm: function (righe) {
        return sb.rpc('importa_luoghi_osm', { p_righe: righe }).then(check);
      },
      /* Luoghi da OpenStreetMap da approvare: città con il numero di luoghi, poi i luoghi di una città a pagine */
      osmCities: function () {
        return allRows(function (from, to) {
          return sb.from('places').select('citta').eq('stato', 'da-approvare').order('citta').order('id').range(from, to);
        }).then(function (rows) {
          var by = {};
          rows.forEach(function (r) { by[r.citta] = (by[r.citta] || 0) + 1; });
          return Object.keys(by).sort(function (a, b) { return a.localeCompare(b, 'it'); }).map(function (c) { return { citta: c, n: by[c] }; });
        });
      },
      pendingOsm: function (citta, from, n) {
        var q = sb.from('places').select(COLONNE, { count: 'exact' }).eq('stato', 'da-approvare');
        if (citta) q = q.eq('citta', citta);
        return q.order('categoria').order('nome').range(from, from + n - 1).then(function (res) {
          return { rows: check(res).map(toPlace), totale: res.count || 0 };
        });
      },
      decideOsm: function (ids, approva) {
        return sb.rpc('decidi_osm', { p_ids: ids, p_approva: approva }).then(check);
      },
      decideVerification: function (id, stato, risposta) {
        return sb.rpc('decidi_verifica', { p_id: id, p_stato: stato, p_risposta: risposta || null }).then(check);
      },
      addReview: function (r) {
        return sb.from('recensioni').insert(r).then(check);
      },
      deleteReview: function (id) {
        return sb.from('recensioni').delete().eq('id', id).then(check);
      },
      favorites: function () {
        if (!current) return Promise.resolve([]);
        return sb.from('preferiti').select('place_id').then(check).then(function (rows) {
          return rows.map(function (r) { return r.place_id; });
        });
      },
      setFavorite: function (placeId, on) {
        return (on
          ? sb.from('preferiti').insert({ place_id: placeId })
          : sb.from('preferiti').delete().eq('place_id', placeId)
        ).then(function (res) {
          if (res.error && res.error.code === '23505') return null;   /* già nei preferiti */
          return check(res);
        });
      },
      /* Restituisce l'id della proposta, che serve per collegarle le foto */
      propose: function (p) {
        return sb.from('proposte').insert(p).select('id').single().then(check).then(function (r) { return r.id; });
      },
      withdrawProposal: function (id) {
        return sb.from('foto').select('path').eq('proposta_id', id).then(check).then(function (rows) {
          return rows.length ? sb.storage.from('foto').remove(rows.map(function (r) { return r.path; })) : null;
        }).then(function () {
          return sb.from('proposte').delete().eq('id', id).then(check);
        });
      },

      /* Foto: il file va nella cartella dell'utente, poi la riga in public.foto (se fallisce, il file si cancella) */
      uploadPhoto: function (propostaId, blob, alt) {
        var path = uid() + '/' + crypto.randomUUID() + '.jpg';
        var bucket = sb.storage.from('foto');
        return bucket.upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }).then(check).then(function () {
          return sb.from('foto').insert({ proposta_id: propostaId, path: path, alt: alt }).then(function (res) {
            if (res.error) return bucket.remove([path]).then(function () { throw friendly(res.error); });
            return null;
          });
        });
      },
      placePhotos: function (placeId) {
        return sb.from('foto').select('id,path,alt,autore_nome').eq('place_id', placeId).eq('stato', 'pubblicata')
          .order('created_at').limit(30).then(check).then(signPhotos);
      },
      proposalPhotos: function (propostaId) {
        return sb.from('foto').select('id,path,alt,autore_nome,stato').eq('proposta_id', propostaId).neq('stato', 'respinta')
          .order('created_at').then(check).then(signPhotos);
      },
      moderatePhoto: function (id, stato) {
        return sb.rpc('modera_foto', { p_id: id, p_stato: stato }).then(check);
      },
      myData: function () {
        return sb.rpc('i_miei_dati').then(check);
      },
      deleteAccount: function () {
        /* Prima i file delle foto (il database non può cancellarli), poi l'account */
        var bucket = sb.storage.from('foto');
        return bucket.list(uid(), { limit: 1000 }).then(check).then(function (files) {
          var paths = files.map(function (f) { return uid() + '/' + f.name; });
          return paths.length ? bucket.remove(paths).then(check) : null;
        }).then(function () {
          return sb.rpc('elimina_account').then(check);
        }).then(function () {
          return sb.auth.signOut({ scope: 'local' });
        }).then(function () { current = null; profileCache = null; notify(null); });
      },

      pending: function () {
        return Promise.all([
          sb.from('proposte').select('id,tipo,place_id,autore_nome,dati,nota,created_at').eq('stato', 'in-attesa').order('created_at').limit(200),
          sb.from('recensioni').select('id,place_id,autore_nome,esigenza,data_visita,testo,risposte,created_at,places(nome,citta)').eq('stato', 'in-attesa').order('created_at').limit(200),
          sb.from('gestori').select('id,place_id,nome,ruolo,contatto,nota,created_at,places(nome,citta)').eq('stato', 'in-attesa').order('created_at').limit(200)
        ]).then(function (r) {
          return { proposte: check(r[0]), recensioni: check(r[1]), gestori: check(r[2]) };
        });
      },
      approve: function (id, livello) {
        return sb.rpc('approva_proposta', { p_id: id, p_livello: livello }).then(check);
      },
      reject: function (id, motivo) {
        return sb.rpc('respingi_proposta', { p_id: id, p_motivo: motivo }).then(check);
      },
      moderateReview: function (id, stato, motivo) {
        return sb.rpc('modera_recensione', { p_id: id, p_stato: stato, p_motivo: motivo || null }).then(check);
      },
      setPlaceState: function (id, stato) {
        return sb.rpc('stato_luogo', { p_id: id, p_stato: stato }).then(check);
      }
    };
  }

  /* ======================================================================
     Versione di prova: nessun server, tutto in questo browser (localStorage)
     ====================================================================== */
  function provaApi() {
    var KEY = 'oa-prova-v1';
    var PHOTO_KEY = 'oa-prova-foto-v1';
    var memory = null;
    var photoMemory = null;

    /* Le foto di prova (piccole, in data URL) stanno a parte: se il browser non ha spazio restano in memoria */
    function photos() {
      if (photoMemory) return photoMemory;
      try { photoMemory = JSON.parse(localStorage.getItem(PHOTO_KEY) || '[]'); } catch (e) { photoMemory = []; }
      return photoMemory;
    }
    function savePhotos() {
      try { localStorage.setItem(PHOTO_KEY, JSON.stringify(photoMemory)); } catch (e) { /* spazio finito: solo in memoria */ }
    }
    function blobToDataUrl(blob) {
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(r.result); };
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
    }

    function load() {
      if (memory) return memory;
      try { memory = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { memory = null; }
      if (!memory) memory = seed();
      memory.avvisi = memory.avvisi || [];      /* dati di prova salvati prima di avvisi e gestori */
      memory.gestori = memory.gestori || [];
      memory.verifiche = memory.verifiche || [];
      return memory;
    }
    function attivi() {
      return load().avvisi.filter(function (a) { return a.stato === 'attivo' && a.scade_il >= oggi(); });
    }
    function publicAlert(a) {
      return { id: a.id, place_id: a.place_id, autore_nome: a.autore_nome, tipo: a.tipo, testo: a.testo, scade_il: a.scade_il, created_at: a.created_at };
    }
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* navigazione privata: resta in memoria */ }
    }
    function rid() {
      return 'prova-' + Math.random().toString(36).slice(2, 10);
    }
    function now() {
      return new Date().toISOString();
    }
    function wait(v) {
      return new Promise(function (res) { setTimeout(function () { res(v); }, 150); });
    }
    function fail(msg) {
      return new Promise(function (res, rej) { setTimeout(function () { rej(new Error(msg)); }, 150); });
    }

    /* Una proposta e una recensione già in attesa, per vedere il pannello di moderazione */
    function seed() {
      return {
        users: { 'prova-altro': { email: 'altro@prova.it' } },
        profiles: { 'prova-altro': { nome_pubblico: 'Giulia (prova)', esigenza: 'manuale', ruolo: 'utente' } },
        session: null,
        proposte: [{
          id: 'prova-p1', tipo: 'correzione', place_id: 'esempio-trattoria-roma', autore: 'prova-altro', autore_nome: 'Giulia (prova)',
          dati: null, patch: { 'misure.ingresso.rampa': true, 'misure.ingresso.rampa_pct': 7 },
          nota: 'Ci sono stata sabato: adesso c\'è una rampa mobile che portano su richiesta.', stato: 'in-attesa', created_at: now()
        }],
        recensioni: [{
          id: 'prova-r1', place_id: 'esempio-museo-roma', autore: 'prova-altro', autore_nome: 'Giulia (prova)', esigenza: 'manuale',
          data_visita: null, testo: 'Rampa comoda e personale gentilissimo. L\'ascensore è un po\' lento ma ci si sta bene.',
          stato: 'in-attesa', created_at: now()
        }],
        preferiti: {},
        avvisi: [],
        gestori: [],
        verifiche: [],
        places: {},          /* schede create o modificate dalle approvazioni, per id */
        stati: {}            /* stato delle schede cambiato dai moderatori */
      };
    }

    var base = null;
    function basePlaces() {
      if (base) return Promise.resolve(base);
      return fetch('../assets/data/luoghi.json', { credentials: 'omit' })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function (d) {
          base = (d.luoghi || []).map(function (p) { p.stato = 'pubblicato'; p.esempio = true; return p; });
          return base;
        })
        .catch(function () { throw new Error('Non siamo riusciti a caricare i luoghi. Ricarica la pagina tra poco.'); });
    }
    function allPlaces() {
      return basePlaces().then(function (list) {
        var db = load();
        var byId = {};
        list.forEach(function (p) { byId[p.id] = p; });
        Object.keys(db.places).forEach(function (id) { byId[id] = db.places[id]; });
        return Object.keys(byId).map(function (id) {
          var p = JSON.parse(JSON.stringify(byId[id]));
          if (db.stati[id]) p.stato = db.stati[id];
          return p;
        });
      });
    }
    function setPath(obj, path, value) {
      var parts = path.split('.');
      var o = obj;
      for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
      o[parts[parts.length - 1]] = value;
    }
    function placeToDati(p) {
      return {
        nome: p.nome, categoria: p.categoria, indirizzo: p.indirizzo, cap: p.cap, citta: p.citta, provincia: p.provincia,
        regione: p.regione, lat: p.lat, lng: p.lng, descrizione: p.descrizione,
        misure: p.misure, facoltativi: p.facoltativi || {}, dettagli: p.dettagli || {}
      };
    }
    /* La proposta d'esempio contiene solo le differenze: la completo con la scheda attuale */
    function fillSeedProposal(db) {
      var pending = db.proposte.filter(function (x) { return !x.dati && x.patch; });
      if (!pending.length) return Promise.resolve();
      return allPlaces().then(function (list) {
        pending.forEach(function (x) {
          var p = list.filter(function (q) { return q.id === x.place_id; })[0];
          if (!p) return;
          x.dati = JSON.parse(JSON.stringify(placeToDati(p)));
          Object.keys(x.patch).forEach(function (k) { setPath(x.dati, k, x.patch[k]); });
          delete x.patch;
        });
        save();
      });
    }
    function me() {
      var db = load();
      return db.session ? { id: db.session, email: (db.users[db.session] || {}).email } : null;
    }
    function needUser() {
      var u = me();
      if (!u) throw new Error('Serve l\'accesso.');
      return u;
    }
    function isMod() {
      var u = me();
      var db = load();
      return !!(u && db.profiles[u.id] && db.profiles[u.id].ruolo !== 'utente');
    }
    function login(id, email, profile) {
      var db = load();
      db.users[id] = { email: email };
      if (!db.profiles[id]) db.profiles[id] = profile;
      db.session = id;
      save();
      notify(me());
    }

    return {
      mode: 'prova',
      ready: Promise.resolve(),
      user: me,
      onAuth: function (fn) { authListeners.push(fn); },

      signUp: function (d) {
        var id = 'prova-u-' + d.email.toLowerCase().replace(/[^a-z0-9]/g, '');
        login(id, d.email, { nome_pubblico: d.nome, esigenza: null, ruolo: 'utente' });
        return wait({ confirm: false });
      },
      signIn: function (email) {
        var id = 'prova-u-' + email.toLowerCase().replace(/[^a-z0-9]/g, '');
        login(id, email, { nome_pubblico: email.split('@')[0], esigenza: null, ruolo: 'utente' });
        return wait();
      },
      signInDemo: function (moderatore) {
        if (moderatore) login('prova-mod', 'moderatore@prova.it', { nome_pubblico: 'Moderatore di prova', esigenza: null, ruolo: 'verificatore' });
        else login('prova-utente', 'utente@prova.it', { nome_pubblico: 'Utente di prova', esigenza: null, ruolo: 'utente' });
        return wait();
      },
      signOut: function () {
        var db = load();
        db.session = null;
        save();
        notify(null);
        return wait();
      },
      requestReset: function () { return wait(); },
      updatePassword: function () { return wait(); },

      profile: function () {
        var u = me();
        return wait(u ? JSON.parse(JSON.stringify(load().profiles[u.id] || null)) : null);
      },
      updateProfile: function (patch) {
        var u = needUser();
        var db = load();
        Object.keys(patch).forEach(function (k) { db.profiles[u.id][k] = patch[k]; });
        save();
        return wait(JSON.parse(JSON.stringify(db.profiles[u.id])));
      },

      listPlaces: function () {
        return allPlaces().then(function (list) {
          return withAlerts(list.filter(function (p) { return p.stato !== 'archiviato'; }), attivi().map(publicAlert));
        });
      },
      allPlacesForModeration: function () {
        return allPlaces().then(function (list) {
          return list.map(function (p) { return { id: p.id, nome: p.nome, citta: p.citta, stato: p.stato }; })
            .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'it'); });
        });
      },
      getPlace: function (id) {
        return allPlaces().then(function (list) {
          return list.filter(function (p) { return p.id === id && (p.stato !== 'archiviato' || isMod()); })[0] || null;
        });
      },
      reviews: function (placeId) {
        return wait(load().recensioni.filter(function (r) { return r.place_id === placeId && r.stato === 'pubblicata'; }).reverse());
      },
      alerts: function (placeId) {
        var u = me();
        var mine = attivi().filter(function (a) { return a.place_id === placeId; });
        return wait({
          list: mine.map(publicAlert).reverse(),
          mine: u ? mine.filter(function (a) { return a.autore === u.id; }).map(function (a) { return a.id; }) : []
        });
      },
      addAlert: function (a) {
        var u = needUser();
        var db = load();
        if (attivi().filter(function (x) { return x.place_id === a.place_id; }).length >= 5) return fail('Questo luogo ha già 5 avvisi attivi');
        db.avvisi.push({ id: rid(), place_id: a.place_id, autore: u.id, autore_nome: db.profiles[u.id].nome_pubblico, tipo: a.tipo,
          testo: a.testo || null, scade_il: traGiorni(a.giorni - 1), stato: 'attivo', created_at: now() });
        save();
        return wait();
      },
      closeAlert: function (id, stato) {
        var u = needUser();
        var db = load();
        var a = db.avvisi.filter(function (x) { return x.id === id && x.stato === 'attivo'; })[0];
        if (!a) return fail('Avviso non trovato o già chiuso');
        if (!(isMod() || (a.autore === u.id && stato === 'risolto'))) return fail('Solo chi ha scritto l\'avviso o un moderatore può chiuderlo');
        a.stato = stato;
        a.chiuso_at = now();
        save();
        return wait();
      },
      ownerStatus: function (placeId) {
        var u = me();
        if (!u) return wait(null);
        var g = load().gestori.filter(function (x) { return x.place_id === placeId && x.user_id === u.id; })[0];
        return wait(g ? { id: g.id, stato: g.stato, motivo: g.motivo || null, created_at: g.created_at } : null);
      },
      requestOwner: function (g) {
        var u = needUser();
        var db = load();
        if (db.gestori.some(function (x) { return x.place_id === g.place_id && x.user_id === u.id; })) return fail('Hai già chiesto di gestire questo luogo');
        db.gestori.push(Object.assign({ id: rid(), user_id: u.id, nome: db.profiles[u.id].nome_pubblico, stato: 'in-attesa', created_at: now() }, g));
        save();
        return wait();
      },
      replyReview: function (id, testo) {
        var u = needUser();
        var db = load();
        var r = db.recensioni.filter(function (x) { return x.id === id && x.stato === 'pubblicata'; })[0];
        if (!r) return fail('Recensione non trovata');
        var text = (testo || '').trim();
        var gestore = db.gestori.some(function (x) { return x.place_id === r.place_id && x.user_id === u.id && x.stato === 'approvato'; });
        if (!(gestore || (isMod() && !text))) return fail('Solo il gestore del luogo può rispondere');
        r.risposta = text || null;
        r.risposta_at = text ? now() : null;
        save();
        return wait();
      },
      myOwnerships: function () {
        var u = me();
        if (!u) return wait([]);
        var db = load();
        return allPlaces().then(function (list) {
          return db.gestori.filter(function (g) { return g.user_id === u.id; }).map(function (g) {
            var p = list.filter(function (x) { return x.id === g.place_id; })[0];
            return { id: g.id, place_id: g.place_id, stato: g.stato, motivo: g.motivo || null, created_at: g.created_at,
              places: p ? { id: p.id, nome: p.nome, citta: p.citta, verifica_livello: (p.verifica || {}).livello, verifica_data: (p.verifica || {}).data } : null };
          }).reverse();
        });
      },
      myVerifications: function () {
        var u = me();
        return wait(u ? load().verifiche.filter(function (v) { return v.user_id === u.id; }).slice().reverse() : []);
      },
      requestVerification: function (v) {
        var u = needUser();
        var db = load();
        if (!db.gestori.some(function (g) { return g.place_id === v.place_id && g.user_id === u.id && g.stato === 'approvato'; })) {
          return fail('La verifica sul posto la chiede il gestore riconosciuto del luogo');
        }
        if (db.verifiche.some(function (x) { return x.place_id === v.place_id && (x.stato === 'in-attesa' || x.stato === 'fissata'); })) {
          return fail('Per questo luogo c\'è già una richiesta aperta');
        }
        db.verifiche.push(Object.assign({ id: rid(), user_id: u.id, nome: db.profiles[u.id].nome_pubblico, stato: 'in-attesa', risposta: null, created_at: now() }, v));
        save();
        return wait();
      },
      withdrawVerification: function (id) {
        var u = needUser();
        var db = load();
        db.verifiche = db.verifiche.filter(function (x) { return !(x.id === id && x.user_id === u.id && x.stato === 'in-attesa'); });
        save();
        return wait();
      },
      pendingVerifications: function () {
        if (!isMod()) return fail('Riservato ai moderatori');
        var db = load();
        return allPlaces().then(function (list) {
          return db.verifiche.filter(function (v) { return v.stato === 'in-attesa' || v.stato === 'fissata'; }).map(function (v) {
            var p = list.filter(function (x) { return x.id === v.place_id; })[0];
            return Object.assign({}, v, {
              places: p ? { nome: p.nome, citta: p.citta, indirizzo: p.indirizzo } : null,
              gestori: db.gestori.filter(function (g) { return g.place_id === v.place_id && g.stato === 'approvato'; })
            });
          });
        });
      },
      importOsm: function () {
        return fail('In modalità prova non si importa: serve Supabase');
      },
      osmCities: function () { return wait([]); },
      pendingOsm: function () { return wait({ rows: [], totale: 0 }); },
      decideOsm: function () { return fail('In modalità prova non ci sono luoghi da OpenStreetMap'); },
      decideVerification: function (id, stato, risposta) {
        if (!isMod()) return fail('Riservato ai moderatori');
        var db = load();
        var v = db.verifiche.filter(function (x) { return x.id === id && (x.stato === 'in-attesa' || x.stato === 'fissata'); })[0];
        if (!v) return fail('Richiesta non trovata o già chiusa');
        v.stato = stato;
        v.risposta = risposta || null;
        v.deciso_at = now();
        if (stato === 'fatta') {
          return allPlaces().then(function (list) {
            var p = list.filter(function (x) { return x.id === v.place_id; })[0];
            if (p) {
              p.verifica = { livello: 'sul-posto', data: now().slice(0, 10) };
              db.places[p.id] = p;
            }
            save();
          });
        }
        save();
        return wait();
      },
      decideOwner: function (id, stato, motivo) {
        if (!isMod()) return fail('Riservato ai moderatori');
        var db = load();
        var g = db.gestori.filter(function (x) { return x.id === id && x.stato === 'in-attesa'; })[0];
        if (!g) return fail('Richiesta non trovata o già decisa');
        g.stato = stato;
        g.motivo = motivo || null;
        save();
        return wait();
      },
      addReview: function (r) {
        var u = needUser();
        var db = load();
        var answered = r.risposte && Object.keys(r.risposte).length;
        if (!answered && (!r.testo || r.testo.trim().length < 20)) return fail('Racconta un po\' di più: almeno 20 caratteri.');
        db.recensioni.push(Object.assign({ id: rid(), autore: u.id, autore_nome: db.profiles[u.id].nome_pubblico, stato: 'in-attesa', created_at: now() }, r));
        save();
        return wait();
      },
      deleteReview: function (id) {
        var u = needUser();
        var db = load();
        db.recensioni = db.recensioni.filter(function (r) { return !(r.id === id && r.autore === u.id); });
        save();
        return wait();
      },
      favorites: function () {
        var u = me();
        return wait(u ? (load().preferiti[u.id] || []).slice() : []);
      },
      setFavorite: function (placeId, on) {
        var u = needUser();
        var db = load();
        var list = (db.preferiti[u.id] || []).filter(function (id) { return id !== placeId; });
        if (on) list.unshift(placeId);
        db.preferiti[u.id] = list;
        save();
        return wait();
      },
      propose: function (p) {
        var u = needUser();
        var db = load();
        var id = rid();
        db.proposte.push(Object.assign({ id: id, autore: u.id, autore_nome: db.profiles[u.id].nome_pubblico, stato: 'in-attesa', created_at: now() }, p,
          { place_id: p.tipo === 'nuovo' ? null : p.place_id }));
        save();
        return wait(id);
      },
      withdrawProposal: function (id) {
        var u = needUser();
        var db = load();
        db.proposte = db.proposte.filter(function (x) { return !(x.id === id && x.autore === u.id && x.stato === 'in-attesa'); });
        photoMemory = photos().filter(function (f) { return f.proposta_id !== id; });
        savePhotos();
        save();
        return wait();
      },
      uploadPhoto: function (propostaId, blob, alt) {
        var u = needUser();
        if (photos().filter(function (f) { return f.proposta_id === propostaId; }).length >= 5) return fail('Al massimo 5 foto per segnalazione');
        return blobToDataUrl(blob).then(function (url) {
          photos().push({ id: rid(), proposta_id: propostaId, place_id: null, autore: u.id, autore_nome: load().profiles[u.id].nome_pubblico,
            alt: alt, url: url, stato: 'in-attesa', created_at: now() });
          savePhotos();
          return wait();
        });
      },
      placePhotos: function (placeId) {
        return wait(photos().filter(function (f) { return f.place_id === placeId && f.stato === 'pubblicata'; }));
      },
      proposalPhotos: function (propostaId) {
        return wait(photos().filter(function (f) { return f.proposta_id === propostaId && f.stato !== 'respinta'; }));
      },
      moderatePhoto: function (id, stato) {
        if (!isMod()) return fail('Riservato ai moderatori');
        photos().forEach(function (f) { if (f.id === id) f.stato = stato; });
        savePhotos();
        return wait();
      },
      myData: function () {
        var u = needUser();
        var db = load();
        function mine(x) { return x.autore === u.id; }
        function strip(x) { var c = Object.assign({}, x); delete c.autore; return c; }
        return wait({
          esportato_il: now(), modalita: 'prova',
          account: { email: u.email },
          profilo: db.profiles[u.id],
          proposte: db.proposte.filter(mine).map(strip).reverse(),
          recensioni: db.recensioni.filter(mine).map(strip).reverse(),
          foto: photos().filter(mine).map(function (f) { var c = strip(f); delete c.url; return c; }),
          avvisi: db.avvisi.filter(mine).map(strip).reverse(),
          gestore: db.gestori.filter(function (g) { return g.user_id === u.id; }).map(function (g) { var c = Object.assign({}, g); delete c.user_id; return c; }),
          verifiche: db.verifiche.filter(function (v) { return v.user_id === u.id; }).map(function (v) { var c = Object.assign({}, v); delete c.user_id; return c; }),
          preferiti: (db.preferiti[u.id] || []).map(function (id) { return { place_id: id }; })
        });
      },
      deleteAccount: function () {
        var u = needUser();
        var db = load();
        db.proposte = db.proposte.filter(function (x) { return !(x.autore === u.id && x.stato === 'in-attesa'); });
        db.proposte.forEach(function (x) { if (x.autore === u.id) { x.autore = null; x.autore_nome = 'Utente eliminato'; } });
        db.recensioni = db.recensioni.filter(function (r) { return r.autore !== u.id; });
        db.avvisi = db.avvisi.filter(function (a) { return a.autore !== u.id; });
        db.gestori = db.gestori.filter(function (g) { return g.user_id !== u.id; });
        db.verifiche = db.verifiche.filter(function (v) { return v.user_id !== u.id; });
        delete db.preferiti[u.id];
        delete db.profiles[u.id];
        delete db.users[u.id];
        photoMemory = photos().filter(function (f) { return f.autore !== u.id; });
        savePhotos();
        db.session = null;
        save();
        notify(null);
        return wait();
      },

      pending: function () {
        if (!isMod()) return fail('Riservato ai moderatori');
        var db = load();
        return fillSeedProposal(db).then(function () {
          return allPlaces();
        }).then(function (list) {
          var names = {};
          list.forEach(function (p) { names[p.id] = { nome: p.nome, citta: p.citta }; });
          return {
            proposte: db.proposte.filter(function (x) { return x.stato === 'in-attesa'; }),
            recensioni: db.recensioni.filter(function (r) { return r.stato === 'in-attesa'; })
              .map(function (r) { return Object.assign({ places: names[r.place_id] || null }, r); }),
            gestori: db.gestori.filter(function (g) { return g.stato === 'in-attesa'; })
              .map(function (g) { return Object.assign({ places: names[g.place_id] || null }, g); })
          };
        });
      },
      approve: function (id, livello) {
        if (!isMod()) return fail('Riservato ai moderatori');
        var db = load();
        var x = db.proposte.filter(function (q) { return q.id === id && q.stato === 'in-attesa'; })[0];
        if (!x) return fail('Proposta non trovata o già decisa');
        var placeId = x.place_id || ('nuovo-' + id);
        db.places[placeId] = Object.assign({ id: placeId }, JSON.parse(JSON.stringify(x.dati)), {
          verifica: { livello: livello, data: now().slice(0, 10) }, stato: 'pubblicato', esempio: false
        });
        delete db.stati[placeId];
        x.stato = 'approvata';
        x.place_id = placeId;
        x.deciso_at = now();
        photos().forEach(function (f) {
          if (f.proposta_id === id && f.stato === 'in-attesa') { f.stato = 'pubblicata'; f.place_id = placeId; }
        });
        savePhotos();
        save();
        return wait(placeId);
      },
      reject: function (id, motivo) {
        if (!isMod()) return fail('Riservato ai moderatori');
        var db = load();
        var x = db.proposte.filter(function (q) { return q.id === id && q.stato === 'in-attesa'; })[0];
        if (!x) return fail('Proposta non trovata o già decisa');
        x.stato = 'respinta';
        x.motivo = motivo || null;
        x.deciso_at = now();
        photos().forEach(function (f) { if (f.proposta_id === id && f.stato === 'in-attesa') f.stato = 'respinta'; });
        savePhotos();
        save();
        return wait();
      },
      moderateReview: function (id, stato, motivo) {
        if (!isMod()) return fail('Riservato ai moderatori');
        var db = load();
        var r = db.recensioni.filter(function (q) { return q.id === id; })[0];
        if (!r) return fail('Recensione non trovata');
        r.stato = stato;
        r.motivo = motivo || null;
        r.deciso_at = now();
        save();
        return wait();
      },
      setPlaceState: function (id, stato) {
        if (!isMod()) return fail('Riservato ai moderatori');
        var db = load();
        db.stati[id] = stato;
        save();
        return wait();
      },
      resetProva: function () {
        try { localStorage.removeItem(KEY); localStorage.removeItem(PHOTO_KEY); } catch (e) { /* niente da cancellare */ }
        memory = null;
        photoMemory = null;
      }
    };
  }

  var configured = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase && window.supabase.createClient);
  window.OAApi = configured ? supabaseApi() : provaApi();
})();
