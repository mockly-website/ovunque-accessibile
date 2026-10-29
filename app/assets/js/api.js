/* Ovunque Accessibile – web-app: accesso ai dati (window.OAApi), su Supabase (URL e chiave pubblica in config.js).
   Ogni funzione restituisce una Promise; gli errori arrivano già scritti in italiano (Error.message). */
(function () {
  'use strict';

  var CFG = window.OA_CONFIG || {};
  var PRIVACY = CFG.privacyVersion || 'app';
  var COLONNE = 'id,slug,nome,categoria,indirizzo,cap,citta,provincia,regione,lat,lng,descrizione,misure,facoltativi,dettagli,verifica_livello,verifica_data,stato,esempio,osm';
  /* Per mappa ed elenchi basta meno (niente descrizione, slug, esempio): un terzo di dati in meno */
  var COLONNE_ELENCO = 'id,nome,categoria,indirizzo,cap,citta,provincia,regione,lat,lng,misure,facoltativi,dettagli,verifica_livello,verifica_data,stato,osm';
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

    /* Supabase restituisce al massimo 1000 righe per richiesta: si leggono a pagine finché non finiscono (allRows) */
    var PAGINA = 1000;

    /* Mappa ed elenco chiedono solo l'area visibile (luoghi_area) e la ricerca la fa il database (cerca_luoghi):
       la memoria dei riquadri già visti è in oa-core.js. Gli avvisi attivi sono pochi: si leggono una volta ogni
       3 minuti e si attaccano ai luoghi che arrivano. Si svuota tutto quando qualcuno aggiunge o chiude un avviso. */
    var AVVISI_MS = 3 * 60 * 1000;
    var avvisi = null;
    function avvisiAttivi() {
      if (!avvisi || Date.now() - avvisi.t > AVVISI_MS) {
        avvisi = { t: Date.now(), p: activeAlerts().catch(function () { return []; }) };
      }
      return avvisi.p;
    }
    function svuota() {
      avvisi = null;
      if (window.OA && window.OA.svuotaLuoghi) window.OA.svuotaLuoghi();
    }

    /* { totale, luoghi } dal database → luoghi nella forma di oa-core.js, con i loro avvisi (le zone passano così) */
    function conLuoghi(x) {
      if (!x.luoghi) return x;
      return avvisiAttivi().then(function (alerts) {
        x.luoghi = withAlerts(x.luoghi.map(toPlace), alerts);
        return x;
      });
    }

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
      ready: ready,
      user: function () { return current; },
      onAuth: function (fn) { authListeners.push(fn); },

      signUp: function (d) {
        return sb.auth.signUp({
          email: d.email, password: d.password,
          options: {
            emailRedirectTo: redirect('accedi.html?confermata=1' + (d.torna ? '&torna=' + encodeURIComponent(d.torna) : '')),
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

      /* solo le schede pubbliche: anche per i moderatori, i luoghi «da approvare» stanno nel pannello */
      areaPlaces: function (q) {
        return sb.rpc('luoghi_area', {
          p_sud: q.sud, p_ovest: q.ovest, p_nord: q.nord, p_est: q.est,
          p_categoria: q.categoria, p_sensi: q.sensi, p_max: q.max, p_passo: q.passo
        }).then(check).then(conLuoghi);
      },
      searchPlaces: function (testo, max) {
        return sb.rpc('cerca_luoghi', { p_testo: testo, p_max: max || 200 }).then(check).then(conLuoghi);
      },
      /* Luoghi pubblici scelti per id (preferiti, locali gestiti): 100 per richiesta, così l'indirizzo resta corto */
      placesByIds: function (ids) {
        ids = (ids || []).filter(function (id) { return /^[0-9a-f-]{36}$/.test(id); });
        var gruppi = [];
        for (var i = 0; i < ids.length; i += 100) {
          gruppi.push(sb.from('places').select(COLONNE_ELENCO).in('id', ids.slice(i, i + 100))
            .in('stato', ['pubblicato', 'in-revisione']).then(check));
        }
        return Promise.all(gruppi).then(function (pp) {
          return conLuoghi({ luoghi: [].concat.apply([], pp) });
        }).then(function (x) { return x.luoghi; });
      },
      allPlacesForModeration: function () {
        return allRows(function (from, to) {
          return sb.from('places').select('id,nome,citta,stato').order('nome').order('id').range(from, to);
        });
      },
      getPlace: function (id) {
        if (!/^[0-9a-f-]{36}$/.test(id || '')) return Promise.resolve(null);
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
        svuota();
        return sb.from('avvisi').insert({ place_id: a.place_id, tipo: a.tipo, testo: a.testo || null, scade_il: traGiorni(a.giorni - 1) }).then(check);
      },
      closeAlert: function (id, stato) {
        svuota();
        return sb.rpc('chiudi_avviso', { p_id: id, p_stato: stato }).then(check);
      },

      /* Gestori: la mia richiesta per un luogo (o null), nuova richiesta, risposta a una recensione */
      ownerStatus: function (placeId) {
        if (!current) return Promise.resolve(null);
        return sb.from('gestori').select('id,stato,motivo,created_at').eq('place_id', placeId).maybeSingle().then(check);
      },
      /* Prima la foto dell'ingresso nella cartella dell'utente, poi la richiesta (se fallisce, il file si cancella) */
      requestOwner: function (g, foto) {
        var path = uid() + '/ingresso-' + crypto.randomUUID() + '.jpg';
        var bucket = sb.storage.from('foto');
        return bucket.upload(path, foto, { contentType: 'image/jpeg', upsert: false }).then(check).then(function () {
          return sb.from('gestori').insert(Object.assign({}, g, { foto_ingresso: path })).then(function (res) {
            if (res.error) return bucket.remove([path]).then(function () { throw friendly(res.error); });
            return null;
          });
        });
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
        svuota();
        return sb.rpc('decidi_osm', { p_ids: ids, p_approva: approva }).then(check);
      },
      decideVerification: function (id, stato, risposta) {
        svuota();
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

      /* Quante cose aspettano i moderatori (solo il numero, senza scaricare le righe) */
      pendingCount: function () {
        function conta(tabella) {
          return sb.from(tabella).select('id', { count: 'exact', head: true }).eq('stato', 'in-attesa').then(function (r) {
            if (r.error) throw friendly(r.error);
            return r.count || 0;
          });
        }
        return Promise.all(['proposte', 'recensioni', 'gestori', 'verifiche'].map(conta)).then(function (n) {
          return n.reduce(function (a, b) { return a + b; }, 0);
        });
      },
      pending: function () {
        return Promise.all([
          sb.from('proposte').select('id,tipo,place_id,autore_nome,dati,nota,created_at').eq('stato', 'in-attesa').order('created_at').limit(200),
          sb.from('recensioni').select('id,place_id,autore_nome,esigenza,data_visita,testo,risposte,created_at,places(nome,citta)').eq('stato', 'in-attesa').order('created_at').limit(200),
          sb.from('gestori').select('id,place_id,nome,ruolo,contatto,titolare,telefono,email,foto_ingresso,nota,created_at,places(nome,citta)').eq('stato', 'in-attesa').order('created_at').limit(200)
        ]).then(function (r) {
          var gestori = check(r[2]);
          /* foto dell'ingresso: link firmati, validi un'ora */
          var paths = gestori.map(function (g) { return g.foto_ingresso; }).filter(Boolean);
          var firme = paths.length ? sb.storage.from('foto').createSignedUrls(paths, 3600).then(check) : Promise.resolve([]);
          return firme.then(function (urls) {
            var byPath = {};
            urls.forEach(function (u) { if (u.signedUrl) byPath[u.path] = u.signedUrl; });
            gestori.forEach(function (g) { g.foto_url = g.foto_ingresso ? byPath[g.foto_ingresso] || null : null; });
            return { proposte: check(r[0]), recensioni: check(r[1]), gestori: gestori };
          });
        });
      },
      approve: function (id, livello) {
        svuota();
        return sb.rpc('approva_proposta', { p_id: id, p_livello: livello }).then(check);
      },
      reject: function (id, motivo) {
        return sb.rpc('respingi_proposta', { p_id: id, p_motivo: motivo }).then(check);
      },
      moderateReview: function (id, stato, motivo) {
        return sb.rpc('modera_recensione', { p_id: id, p_stato: stato, p_motivo: motivo || null }).then(check);
      },
      setPlaceState: function (id, stato) {
        svuota();
        return sb.rpc('stato_luogo', { p_id: id, p_stato: stato }).then(check);
      }
    };
  }

  window.OAApi = supabaseApi();
})();
