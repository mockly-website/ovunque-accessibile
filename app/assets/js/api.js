/* Ovunque Accessibile – web-app: accesso ai dati (window.OAApi).
   Due versioni con le stesse funzioni:
   - Supabase: quando config.js contiene URL e chiave pubblica del progetto;
   - Prova: senza configurazione. Luoghi di esempio del sito, account finti, tutto salvato solo in questo browser.
   Ogni funzione restituisce una Promise; gli errori arrivano già scritti in italiano (Error.message). */
(function () {
  'use strict';

  var CFG = window.OA_CONFIG || {};
  var PRIVACY = CFG.privacyVersion || 'app';
  var COLONNE = 'id,slug,nome,categoria,indirizzo,cap,citta,provincia,regione,lat,lng,descrizione,misure,facoltativi,dettagli,verifica_livello,verifica_data,stato,esempio';
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
      verifica: { livello: r.verifica_livello, data: r.verifica_data }, stato: r.stato, esempio: r.esempio
    };
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
    mfa_verification_failed: 'Codice non corretto o scaduto: riprova con quello nuovo.',
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

    function redirect(page) {
      return new URL(page, location.href).href;
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
        return sb.from('places').select(COLONNE).neq('stato', 'archiviato').order('nome').limit(1000)
          .then(check).then(function (rows) { return rows.map(toPlace); });
      },
      allPlacesForModeration: function () {
        return sb.from('places').select('id,nome,citta,stato').order('nome').limit(2000).then(check);
      },
      getPlace: function (id) {
        return sb.from('places').select(COLONNE).eq('id', id).maybeSingle()
          .then(check).then(function (r) { return r ? toPlace(r) : null; });
      },
      reviews: function (placeId) {
        return sb.from('recensioni').select('id,autore_nome,esigenza,data_visita,testo,created_at')
          .eq('place_id', placeId).eq('stato', 'pubblicata').order('created_at', { ascending: false }).limit(50)
          .then(check);
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
      propose: function (p) {
        return sb.from('proposte').insert(p).then(check);
      },
      withdrawProposal: function (id) {
        return sb.from('proposte').delete().eq('id', id).then(check);
      },
      myData: function () {
        return sb.rpc('i_miei_dati').then(check);
      },
      deleteAccount: function () {
        return sb.rpc('elimina_account').then(check).then(function () {
          return sb.auth.signOut({ scope: 'local' });
        }).then(function () { current = null; profileCache = null; notify(null); });
      },

      /* Moderazione: verifica in due passaggi (TOTP) */
      mfa: function () {
        return Promise.all([sb.auth.mfa.getAuthenticatorAssuranceLevel(), sb.auth.mfa.listFactors()]).then(function (r) {
          var aal = check(r[0]);
          var factors = check(r[1]);
          return {
            level: aal.currentLevel,
            verified: (factors.totp || []).filter(function (f) { return f.status === 'verified'; }),
            stale: (factors.all || []).filter(function (f) { return f.factor_type === 'totp' && f.status !== 'verified'; })
          };
        });
      },
      mfaEnroll: function () {
        return this.mfa().then(function (st) {
          return Promise.all(st.stale.map(function (f) { return sb.auth.mfa.unenroll({ factorId: f.id }); }));
        }).then(function () {
          return sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Ovunque Accessibile ' + new Date().toISOString().slice(0, 10) });
        }).then(check).then(function (d) {
          return { factorId: d.id, qr: d.totp.qr_code, secret: d.totp.secret };
        });
      },
      mfaVerify: function (factorId, code) {
        return sb.auth.mfa.challengeAndVerify({ factorId: factorId, code: code }).then(check).then(function () {
          profileCache = null;
        });
      },
      pending: function () {
        return Promise.all([
          sb.from('proposte').select('id,tipo,place_id,autore_nome,dati,nota,created_at').eq('stato', 'in-attesa').order('created_at').limit(200),
          sb.from('recensioni').select('id,place_id,autore_nome,esigenza,data_visita,testo,created_at,places(nome,citta)').eq('stato', 'in-attesa').order('created_at').limit(200)
        ]).then(function (r) {
          return { proposte: check(r[0]), recensioni: check(r[1]) };
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
    var memory = null;

    function load() {
      if (memory) return memory;
      try { memory = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { memory = null; }
      if (!memory) memory = seed();
      return memory;
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
        aal2: false,
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
        places: {},          /* schede create o modificate dalle approvazioni, per id */
        stati: {}            /* stato delle schede cambiato dai moderatori */
      };
    }

    var base = null;
    function basePlaces() {
      if (base) return Promise.resolve(base);
      return fetch('../sito/assets/data/luoghi.json', { credentials: 'omit' })
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
      return !!(u && db.profiles[u.id] && db.profiles[u.id].ruolo !== 'utente' && db.aal2);
    }
    function login(id, email, profile) {
      var db = load();
      db.users[id] = { email: email };
      if (!db.profiles[id]) db.profiles[id] = profile;
      db.session = id;
      db.aal2 = false;
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
        db.aal2 = false;
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
          return list.filter(function (p) { return p.stato !== 'archiviato'; });
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
      addReview: function (r) {
        var u = needUser();
        var db = load();
        if (!r.testo || r.testo.trim().length < 20) return fail('Racconta un po\' di più: almeno 20 caratteri.');
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
        db.proposte.push(Object.assign({ id: rid(), autore: u.id, autore_nome: db.profiles[u.id].nome_pubblico, stato: 'in-attesa', created_at: now() }, p,
          { place_id: p.tipo === 'nuovo' ? null : p.place_id }));
        save();
        return wait();
      },
      withdrawProposal: function (id) {
        var u = needUser();
        var db = load();
        db.proposte = db.proposte.filter(function (x) { return !(x.id === id && x.autore === u.id && x.stato === 'in-attesa'); });
        save();
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
          preferiti: (db.preferiti[u.id] || []).map(function (id) { return { place_id: id }; })
        });
      },
      deleteAccount: function () {
        var u = needUser();
        var db = load();
        db.proposte = db.proposte.filter(function (x) { return !(x.autore === u.id && x.stato === 'in-attesa'); });
        db.proposte.forEach(function (x) { if (x.autore === u.id) { x.autore = null; x.autore_nome = 'Utente eliminato'; } });
        db.recensioni = db.recensioni.filter(function (r) { return r.autore !== u.id; });
        delete db.preferiti[u.id];
        delete db.profiles[u.id];
        delete db.users[u.id];
        db.session = null;
        save();
        notify(null);
        return wait();
      },

      mfa: function () {
        var db = load();
        return wait({ level: db.aal2 ? 'aal2' : 'aal1', verified: db.mfaFactor ? [{ id: 'prova-factor' }] : [], stale: [] });
      },
      mfaEnroll: function () {
        return wait({ factorId: 'prova-factor', qr: null, secret: 'PROVA-NESSUN-SEGRETO' });
      },
      mfaVerify: function (factorId, code) {
        if (!/^[0-9]{6}$/.test(code)) return fail('Il codice è fatto di 6 cifre.');
        var db = load();
        db.aal2 = true;
        db.mfaFactor = true;
        save();
        return wait();
      },
      pending: function () {
        if (!isMod()) return fail('Riservato ai moderatori con verifica in due passaggi');
        var db = load();
        return fillSeedProposal(db).then(function () {
          return allPlaces();
        }).then(function (list) {
          var names = {};
          list.forEach(function (p) { names[p.id] = { nome: p.nome, citta: p.citta }; });
          return {
            proposte: db.proposte.filter(function (x) { return x.stato === 'in-attesa'; }),
            recensioni: db.recensioni.filter(function (r) { return r.stato === 'in-attesa'; })
              .map(function (r) { return Object.assign({ places: names[r.place_id] || null }, r); })
          };
        });
      },
      approve: function (id, livello) {
        if (!isMod()) return fail('Riservato ai moderatori con verifica in due passaggi');
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
        save();
        return wait(placeId);
      },
      reject: function (id, motivo) {
        if (!isMod()) return fail('Riservato ai moderatori con verifica in due passaggi');
        var db = load();
        var x = db.proposte.filter(function (q) { return q.id === id && q.stato === 'in-attesa'; })[0];
        if (!x) return fail('Proposta non trovata o già decisa');
        x.stato = 'respinta';
        x.motivo = motivo || null;
        x.deciso_at = now();
        save();
        return wait();
      },
      moderateReview: function (id, stato, motivo) {
        if (!isMod()) return fail('Riservato ai moderatori con verifica in due passaggi');
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
        if (!isMod()) return fail('Riservato ai moderatori con verifica in due passaggi');
        var db = load();
        db.stati[id] = stato;
        save();
        return wait();
      },
      resetProva: function () {
        try { localStorage.removeItem(KEY); } catch (e) { /* niente da cancellare */ }
        memory = null;
      }
    };
  }

  var configured = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase && window.supabase.createClient);
  window.OAApi = configured ? supabaseApi() : provaApi();
})();
