# Ovunque Accessibile – pagina "in arrivo"

Pagina unica che annuncia l'arrivo del **sito definitivo e della web-app**, con una mappa dell'Italia a puntini che si accende pian piano e un modulo per lasciare **solo l'email** ed essere avvisati.
Realizzata da Mockly.

- **Front-end**: HTML5, CSS3, JavaScript vanilla (solo progressive enhancement). Sito statico, nessun framework, nessun CDN, nessun tracker, **nessun cookie** (quindi niente banner cookie).
- **Modulo**: [Formspree](https://formspree.io), endpoint `https://formspree.io/f/mljjddjo`. Ogni iscrizione resta nell'account Formspree e arriva come email al proprietario del form.
- **Alternativa non attiva**: nella cartella `supabase/` c'è un backend completo (Postgres UE + Edge Function) già testato, da usare se in futuro si vuole tenere i dati in Europa. Vedi "Alternativa: Supabase".

## Struttura

```
/
├── index.html               pagina "in arrivo"
├── privacy.html             informativa privacy (modello DA VERIFICARE)
├── grazie.html              conferma per chi invia senza JavaScript
├── iscrizione-errore.html   errore per chi invia senza JavaScript
├── _headers                 header di sicurezza per Netlify / Cloudflare Pages
├── .htaccess                header di sicurezza per hosting Apache
├── assets/
│   ├── css/style.css
│   ├── js/main.js           animazione della mappa + modulo
│   ├── fonts/               Fredoka 600 (titoli), Atkinson Hyperlegible 400/700 (testi); woff2, licenza OFL inclusa
│   └── img/                 logo, favicon, apple-touch-icon, og-image
├── supabase/                alternativa non attiva; NON va pubblicata con il sito
│   ├── config.toml
│   ├── migrations/          20261018000000_subscribers.sql, 20261022000000_email_only.sql
│   └── functions/subscribe/ index.ts (Edge Function), .env.example (secrets)
└── DOCUMENTAZIONE.md
```

## La pagina

Fondo chiaro e caldo. Su computer due colonne (testo e modulo a sinistra, mappa a destra); su telefono e tablet una colonna centrata, con il modulo nella prima schermata e la mappa sotto.

- **Testo**: badge "In arrivo · sito e web-app", titolo "La mappa dei luoghi davvero accessibili", una frase, firma "Un progetto di Angelo e Lorenzo".
- **Modulo**: email + consenso, pulsante "Avvisami". Invia a Formspree via JavaScript e mostra la conferma nella pagina; senza JavaScript Formspree mostra la sua pagina di conferma.
- **Mappa a puntini** (SVG statico in `index.html`): 987 punti generati dal contorno dell'Italia di [Natural Earth](https://www.naturalearthdata.com) (pubblico dominio), Sicilia e Sardegna comprese.
  - `main.js` accende un punto ogni 0,7 s con un'onda; ogni quattro punti compare un segnaposto. Restano accesi al massimo 90 punti.
  - **I punti accesi sono un'illustrazione, non luoghi reali**: lo dice la nota visibile sotto la mappa. Quando ci saranno luoghi veri, la stessa mappa potrà mostrarli.
  - Tre etichette d'esempio (Ingresso senza gradini, Bagno attrezzato, Parcheggio riservato) mostrano che tipo di informazioni ci saranno.
  - Pulsante **"Ferma / Avvia l'animazione"** (WCAG 2.2.2). Con "riduci movimento" la mappa resta ferma; senza JavaScript restano accesi 16 punti fissi.
  - La mappa è decorativa (`aria-hidden`): il contenuto è tutto nel testo.
- **Footer** (uguale su tutte le pagine): Privacy, `ovunqueaccessibile@gmail.com`, © 2026, "Sito realizzato da Mockly". Instagram è in alto a destra.
- **Pagine interne** (`privacy.html`, `grazie.html`, `iscrizione-errore.html`): stesso header, fondo e footer della home, contenuto in una scheda bianca.

## Il modulo con Formspree

Campi inviati: `email`, `consent` ("sì"), `privacy_version` (versione della privacy accettata: aggiornala in `index.html` quando cambi `privacy.html`), `_subject` (oggetto dell'email di avviso) e il campo anti-spam nascosto `_gotcha` (se è compilato, Formspree scarta l'invio).

1. **Prima iscrizione**: Formspree chiede di confermare il form via email al proprietario dell'account. Finché non è confermato, le iscrizioni non arrivano.
2. **Dove leggere le iscrizioni**: dashboard Formspree → form → Submissions (esportabili in CSV), oltre alle email di avviso.
3. **Account**: attiva la verifica in due passaggi; accesso solo alle persone autorizzate.
4. **Piano gratuito**: ha un limite mensile di invii e non permette di reindirizzare a `grazie.html` senza JavaScript. Controlla i limiti attuali su formspree.io.
5. **Impostazioni consigliate** nella dashboard: protezione spam attiva; se disponibile, limita il form al dominio del sito.

`grazie.html` e `iscrizione-errore.html` restano per l'alternativa Supabase (e per un eventuale piano Formspree con reindirizzamento).

**Rispetto a Supabase**: i dati stanno negli Stati Uniti (serve il DPA di Formspree, vedi privacy) e Formspree può registrare IP e browser per l'antispam. Il sito resta senza cookie e senza tracker.

## Alternativa: Supabase (non attiva)

Questa sezione, le sue sottosezioni e "Consultare ed esportare gli iscritti" descrivono il backend Supabase, pronto ma non collegato. Per attivarlo: segui "Configurare Supabase", poi rimetti nel form `action="https://<ref>.supabase.co/functions/v1/subscribe"`, il campo nascosto `form_token` e il honeypot `website`, e ripristina in `main.js` la logica del token (vedi la cronologia git prima del passaggio a Formspree).

### Come sono protetti i dati (Supabase)

| Livello | Protezione |
|---|---|
| **Solo l'email** | Il modulo raccoglie solo email, data del consenso e versione della privacy. Niente nome, città o dati sanitari. |
| **Nessuna chiave nel sito** | Il front-end non contiene chiavi Supabase: solo l'indirizzo della funzione. |
| **Tabella fuori dalle API** | `subscribers` sta nello schema `private`, non esposto dalle API REST/GraphQL. |
| **RLS attiva, zero policy** | Seconda barriera: anche se lo schema venisse esposto, nessuna riga sarebbe leggibile. Permessi revocati a `anon`, `authenticated`, `service_role`. |
| **Ruolo minimo** | La funzione usa `form_writer`, che può **solo** eseguire `private.subscribe()`: non legge, non modifica, non cancella. Timeout 5 s, massimo 10 connessioni. |
| **Connessione cifrata** | SSL obbligatorio tra funzione e database; Supabase cifra i dati anche su disco. |
| **Solo dal sito** | Invii accettati solo dalle origini in `ALLOWED_ORIGINS`; CORS solo verso quelle. |
| **Anti-bot senza captcha** | Honeypot; token firmato HMAC con tempo minimo (3 s) e scadenza (2 h) per gli invii via JavaScript; massimo 60 nuove iscrizioni ogni 10 minuti (senza IP); corpo massimo 20 KB. |
| **Nessuna enumerazione** | Stessa risposta (e stessi tempi) per email nuova o già iscritta. |
| **Log senza dati personali** | In caso di errore solo il tipo di errore, mai l'email. |
| **Sito** | CSP restrittiva, HSTS, `X-Frame-Options: DENY`, nessuno script di terze parti. |

**Limite noto**: chi ha JavaScript disattivato invia un POST classico senza token (la pagina è statica). Quel percorso è protetto da Origin, honeypot, validazione e limite globale, ma non dal tempo minimo: un bot potrebbe inserire email false, **non** leggere i dati. La difesa completa è il double opt-in (vedi "Prossimi passi").

### Configurare Supabase (una volta)

Servono un account Supabase con **2FA attiva** e la [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`).

1. **Crea il progetto** nella regione **Central EU (Frankfurt)**, con una password del database lunga e generata.
2. **Applica le migrazioni** (entrambe, in ordine):
   ```bash
   supabase login
   supabase link --project-ref IL_TUO_PROJECT_REF
   supabase db push
   ```
   In alternativa: **SQL Editor** → esegui `20261018000000_subscribers.sql`, poi `20261022000000_email_only.sql`.
3. **Password del ruolo `form_writer`** (dal SQL Editor, mai in un file del repository):
   ```sql
   alter role form_writer with password 'UNA-PASSWORD-LUNGA-GENERATA';
   ```
4. **Project Settings → Data API → Exposed schemas**: solo `public` e `graphql_public`. **Mai aggiungere `private`.**
5. **Project Settings → Database → SSL Configuration → Enforce SSL**.
6. **Secrets**: copia `supabase/functions/subscribe/.env.example` come `.env` nella stessa cartella (è in `.gitignore`) e compila `SITE_URL`, `ALLOWED_ORIGINS`, `FORM_SECRET` (`openssl rand -base64 48`) e `FORM_DB_URL` (Connect → Transaction pooler, con utente `form_writer.<ref>` e la password del passo 3).
   ```bash
   supabase secrets set --env-file supabase/functions/subscribe/.env
   ```
7. **Pubblica la funzione**:
   ```bash
   supabase functions deploy subscribe --no-verify-jwt
   ```
8. **Collega il sito**: sostituisci `[PROJECT-REF]` in `index.html` (attributo `action` del form), `_headers` e `.htaccess`.

Notifica email facoltativa: account Brevo con dominio verificato, poi `BREVO_API_KEY`, `NOTIFY_TO`, `NOTIFY_FROM` nei secrets.

## Pubblicare il sito

Il sito è pubblicato su **Altervista**: https://ovunqueaccessibile.altervista.org/ (Apache, HTTPS attivo).

Carica nella cartella principale **solo**: i quattro file `.html`, la cartella `assets/` e il file **`.htaccess`**. **Non** caricare `supabase/`, i file `.md`, `_headers`, `.gitignore`, `.gitattributes` e `.claude/`.

- `.htaccess` si modifica dal pannello: Gestione File → icona `.htaccess` → "Modifica sorgente .htaccess (Avanzato)". Le modifiche hanno effetto dopo qualche minuto.
- Verificato il 24 ottobre 2026 sul sito online: `http://` porta a `https://` (nessun loop), i file `.md` e `.htaccess` danno 403, `supabase/` dà 404, la cache degli asset funziona.
- **Limite di Altervista**: gli header di sicurezza (CSP, HSTS, `X-Frame-Options`) **non vengono inviati**: probabilmente il piano gratuito non attiva `mod_headers`, e il blocco `<IfModule mod_headers.c>` viene ignorato senza errori. Il sito resta comunque senza script esterni né tracker; per avere anche gli header serve un hosting che li supporti (es. Netlify, Cloudflare Pages).
- Dopo il caricamento controlla che la pagina si apra. Se il browser segnala "troppi reindirizzamenti", cancella da `.htaccess` le 4 righe sotto "HTTPS obbligatorio".
- Se avevi già caricato `DOCUMENTAZIONE.md` o `README.md`, cancellali dal server.
- Nel pannello di Altervista lascia **disattivati** banner pubblicitari, AdSense e la loro cookie policy: aggiungerebbero cookie e tracker, e la privacy del sito andrebbe riscritta.

Dopo ogni modifica a CSS o JS aggiorna la versione `?v=` nei link di tutte e quattro le pagine HTML, così i browser non usano i file vecchi.

`_headers` serve solo se un giorno il sito passa a Netlify o Cloudflare Pages. GitHub Pages (https://mockly-website.github.io/ovunque_accessibile/) resta solo come copia del repository.

## Vedere la demo in locale

```bash
cd "/Users/noahmelis/Desktop/PROGECT/OVUNQUE ACCESSIBILE" && /Applications/MAMP/bin/php/php8.4.17/bin/php -S 127.0.0.1:8090
```
Poi apri http://localhost:8090. Per vederla dal telefono sulla stessa Wi-Fi usa `-S 0.0.0.0:8091` e apri l'indirizzo IP del Mac sulla porta 8091. Il server PHP serve solo i file statici; il modulo risponde solo dopo aver configurato Supabase.

### Consultare ed esportare gli iscritti (Supabase)

Dashboard Supabase → **Table Editor** → schema `private` → `subscribers` → esporta CSV. Accesso solo a persone autorizzate, ognuna con il proprio account e la 2FA. Il piano gratuito non ha backup scaricabili e va in pausa dopo circa una settimana senza attività.

## Dove modificare

| Cosa | Dove |
|---|---|
| Testi della pagina | `index.html`, blocco `.home__copy` |
| Mappa: punti, colori, etichette, nota | `index.html` (SVG `#italy-map`, `.italy__tags`, `.italy__note`), colori in `style.css` sezione 7 |
| Velocità e numero di punti accesi | `main.js` → `EVERY` (ms) e `MAX_LIT` in `initMap` |
| Email di contatto | footer di tutte le pagine, `privacy.html` (sezioni 1 e 10), `iscrizione-errore.html` |
| Blu del logo | `style.css` → `--color-brand` |
| Messaggi del modulo | `main.js` (validazione ed esito dell'invio) |
| Indirizzo Formspree | `index.html` (attributo `action` del form), `_headers` e `.htaccess` (CSP) |
| Informativa privacy | `privacy.html` (ora versione `2026-10-v3`) |

## Prossimi passi consigliati

1. **Double opt-in**: email "conferma la tua iscrizione" (Formspree a pagamento, oppure Supabase + Brevo).
2. **Link di disiscrizione** in ogni email.
3. **Pulizia automatica** (pg_cron) oltre il periodo di conservazione.

---

## Report di accessibilità (24 ottobre 2026)

Obiettivo WCAG 2.2 AA. Verifiche fatte nel browser integrato (Chromium) e con un backend locale (Postgres 17 + Deno).

| Verifica | Esito |
|---|---|
| axe-core 4.10.2 (WCAG 2.0/2.1/2.2 A+AA + best practice) | **0 violazioni** su `index.html`, `grazie.html`, `privacy.html`, `iscrizione-errore.html`. axe segnala "da rivedere" i testi sopra gli sfondi a gradiente: i colori sono tutti chiari (bianco caldo, azzurrino, beige), controllati a mano, tutti ≥ 4,5:1 |
| Tastiera | skip link; invio vuoto → focus sul riepilogo errori; correggendo l'errore sparisce; invio → focus sul messaggio; pulsante "Ferma/Avvia l'animazione" raggiungibile e attivabile |
| Errori | `aria-invalid`, messaggio collegato con `aria-describedby`, prefisso nascosto "Errore:", icona + testo + bordo spesso |
| Animazione | mappa in loop ma con pulsante di pausa (2.2.2); non parte con "riduci movimento"; nessun lampeggiamento |
| Telefono e tablet | 320, 375 e 768 px: colonna centrata, titolo e modulo completo nella prima schermata; nessuno scroll orizzontale. Computer 1280×800: tutto in una schermata |
| Aree cliccabili | ≥ 44×44 px, tranne i link dentro le frasi (eccezione WCAG 2.5.8) e la checkbox (28 px, ma l'intera etichetta è cliccabile) |

**Non ancora verificato**: VoiceOver/NVDA reali, Lighthouse sul sito online, dispositivi reali, un invio reale a Formspree.

## Test del backend Supabase (in locale, alternativa non attiva)

Migrazioni applicate da utente non superuser con i ruoli di Supabase simulati; funzione eseguita con Deno 2.9 (`deno check` ok).

| Prova | Esito |
|---|---|
| Migrazioni (anche rieseguite) | ok, idempotenti |
| `form_writer`: iscrizione con sola email | ok |
| `form_writer`: SELECT/INSERT/UPDATE/DELETE/TRUNCATE, creare tabelle o schemi | negato |
| `anon`, `authenticated`, `service_role` | nessun accesso allo schema `private` |
| Vincoli DB (email non valida, nome troppo lungo, ruolo non ammesso) | rifiutati |
| Anti-flood | dopo 60 iscrizioni in 10 minuti → `busy` |
| Token assente/falsificato → 403; troppo presto → 429; origine estranea → 403 | ok |
| Consenso mancante → 422 con errore sul campo | ok |
| Senza JavaScript → 303 a `grazie.html` (o `iscrizione-errore.html`) | ok |
| Email già iscritta → stessa risposta di una nuova | ok |
| Database spento → messaggio gentile, log senza dati personali | ok |
| Flusso completo nel browser (token, attesa, invio, focus sul messaggio) | ok |

---

## Segnaposto da completare

| # | Cosa | Dove |
|---|---|---|
| 1 | ✅ **Email e telefono**: `ovunqueaccessibile@gmail.com`, Angelo 351 833 2819 | footer di tutte le pagine, `privacy.html` |
| 2 | ✅ **Titolari**: Angelo e Lorenzo (contitolari). Consigliato aggiungere cognomi e città | `privacy.html` sezione 1 |
| 3 | **Blu del logo**: brief `#2F5B9C` (in uso), PNG `#215A9F` | `--color-brand` |
| 4 | **Logo vettoriale** (SVG o PNG ≥ 1000 px) | `assets/img/` |
| 5 | ✅ **Dominio** `ovunqueaccessibile.altervista.org`: canonical, og:url, og:image | `index.html`, `privacy.html` |
| 6 | **Conferma del form Formspree** (prima iscrizione) e verifica in due passaggi sull'account | dashboard Formspree |
| 7 | ✅ Privacy: hosting (Altervista), Mockly responsabile, conservazione 24 mesi dal lancio, età minima 14 anni, data 24/10/2026 | `privacy.html` |
| 8 | Da verificare: DPA (accordo sul trattamento) di Formspree, Google e Altervista; dati tecnici che Formspree registra | contratti dei fornitori |

> ⚠️ `privacy.html` è stata compilata con i dati forniti dai titolari, ma non è consulenza legale: conviene farla rileggere da un esperto privacy.

---

## Sito effettivo – prototipo (cartella `sito/`)

Prima versione funzionante del sito definitivo, separata dalla pagina "in arrivo" (che resta nella cartella principale ed è quella online). In locale: http://localhost:8091/sito/ con il server `lan-preview`.

**Ruolo del sito**: parte informativa. Mappa, ricerca e schede dei luoghi. Il login, i preferiti e le segnalazioni stanno nell'app (web-app + APK Android), raggiungibile dal pulsante "Scarica l'app".

| Pagina | Cosa fa |
|---|---|
| `index.html` | Ricerca, ricerche rapide (ingresso, bagno, parcheggio), anteprima della mappa, come funziona, cosa c'è in ogni scheda, blocco app (web-app e APK, ora "In arrivo"), chi siamo |
| `mappa.html` | Ricerca per città/nome/tipo, filtri, elenco e mappa sincronizzati. I filtri finiscono nell'indirizzo (`?q=roma&f=bagno`), quindi una ricerca si può condividere |
| `luogo.html?id=…` | Scheda: indirizzo, "Indicazioni stradali" con scelta dell'app (Google Maps, Apple Mappe, Waze, OpenStreetMap; su Android anche "Altra app del telefono" con il link `geo:`), stato di ingresso, porta, interni, piani, bagno e parcheggio, data dell'ultima verifica, "Segnala una correzione" (email) |

- **Giudizi per esigenza** (decisione 1): `oa-core.js` (codice comune a sito e app; `sito.js` lo avvia), sezione 2 «Regole per esigenza». Le soglie sono tutte nell'oggetto `SOGLIE` (un numero cambiato lì aggiorna tutto il sito). Ogni voce (ingresso, porta, spazi, piani, bagno) dà ✓ / – / ✕ / ? / «non previsto» per carrozzina manuale, carrozzina elettrica e difficoltà a camminare; il giudizio complessivo segue le regole della tabella nelle Decisioni.
- **«Come ti muovi?»**: sulla pagina mappa e nella scheda. Alla prima visita il riquadro è evidenziato e i giudizi provvisori sono per la carrozzina manuale; la scelta resta nel browser (`localStorage`, chiave `oa-esigenza`, nessun cookie) e nell'indirizzo (`?per=manuale|elettrica|cammino`), quindi un link condiviso mostra gli stessi giudizi. Filtri «Solo luoghi accessibili», «Ingresso accessibile», «Bagno accessibile» calcolati per l'esigenza scelta.
- **Scheda** (decisione 2): tre giudizi affiancati; «Le misure» con descrizione e stato per ognuna delle tre esigenze; «Altre informazioni» (porta, pavimento, sedute, parcheggio, assistenza); dettagli per tipo di luogo; affidabilità («Verificato sul posto», «Segnalato dalla community», «Da ricontrollare» dopo 24 mesi).
- **Dati** (formato v2): misure in numeri (`gradini`, `gradino_cm`, `rampa_pct`, `porta_cm`, `ascensore_cm` [larghezza, profondità], `rotazione_cm`); `porta_cm: 0` = nessuna porta; `null` = non misurato. `facoltativi`, `dettagli` e `verifica {livello, data}`.
- **Dati**: `sito/assets/data/luoghi.json`, **solo esempi inventati** (nomi "… di esempio", indirizzi "di Prova"). Ogni pagina mostra la striscia "Prototipo". Ogni caratteristica ha tre stati: `"si"`, `"no"`, `null` = non verificato (più `"parziale"`/`"rampa"`/… dove serve). È la stessa forma della futura tabella Supabase `places`.
- **Mappa**: Leaflet 1.9.4 e Leaflet.markercluster 1.5.3 ospitati in `sito/assets/vendor/` (integrità dei pacchetti npm verificata, licenze BSD e MIT incluse). Sfondo attenuato con un filtro CSS; segnaposto con colore + simbolo del giudizio complessivo (accessibile, in parte, no, da verificare: calcolato da ingresso e spazi interni in `giudizio()` di `sito.js`), legenda sotto la mappa, luoghi vicini raggruppati in cerchi numerati, pulsanti "Vicino a me" (la posizione resta nel browser) e "Tutta Italia", "Mostra sulla mappa" su ogni card. Sfondo da `tile.openstreetmap.org`: è l'unica risorsa esterna e va citata nella privacy (il browser contatta i server di OpenStreetMap). Per il lancio, con molto traffico, conviene un fornitore di mappe dedicato in UE (le regole d'uso dei server OSM vietano l'uso intensivo).
- **Privacy del sito**: `sito/privacy.html` (bozza), copre log dell'hosting, sfondo della mappa da OpenStreetMap, «Vicino a me» (posizione solo nel browser), app di navigazione e segnalazioni via email. Va completata con cognomi/città dei titolari e fornitori definitivi.
- **Senza JavaScript**: ogni pagina spiega che mappa e luoghi hanno bisogno di JavaScript e offre il contatto email; i messaggi «Caricamento…» compaiono solo con JavaScript attivo.
- **Accessibilità**: l'elenco è l'equivalente testuale della mappa; segnaposto e gruppi sono fuori dall'ordine di Tab nelle mappe con elenco (si usa «Mostra sulla mappa»), restano raggiungibili nella scheda del luogo; controlli di Leaflet tradotti («Avvicina», «Allontana», «Chiudi»), pulsante «Chiudi» del riquadro 44 × 44 px; stato sempre con icona + testo (+ prefisso per screen reader), mai solo colore; segnaposto raggiungibili con Tab; rotella del mouse che non "cattura" la pagina; axe 0 violazioni su tutte le pagine a 375 e 1280 px; nessuno scroll orizzontale anche a 320 px.
- **Sicurezza**: i testi dei luoghi entrano nella pagina solo con `textContent` (mai `innerHTML`), così i contenuti degli utenti non possono iniettare codice.

**Prossimi passi**: tabella `places` su Supabase con lettura pubblica solo dei luoghi approvati; pagina privacy del sito (tile OSM); link veri a web-app e APK; dati reali raccolti da Angelo e Lorenzo.

---

## Decisioni per il sito definitivo (24 ottobre 2026)

| # | Tema | Decisione |
|---|---|---|
| 1 | **Giudizio** | Un giudizio per ogni esigenza: **carrozzina manuale**, **carrozzina elettrica**, **difficoltà a camminare**. Disabilità visive e uditive in una fase successiva (modello dati già pronto). Soglie iniziali proposte da Mockly (sotto), da far correggere ad Angelo e Lorenzo. Sulla mappa l'esigenza si sceglie alla prima visita ("Come ti muovi?") e resta salvata nel browser. |
| 2 | **Scheda** | Scheda **base obbligatoria** (ingresso, spazi interni, piani, bagno) + voci **facoltative** (tipo di porta, pavimento, sedute, parcheggio, assistenza) + **dettagli per tipo di luogo già al lancio** (tavoli, camere, passerelle, posti in sala, assistenza ai trasporti). Nota libera per ogni voce. Misure salvate come numeri (cm, gradini, %). |
| 3 | **Verifica** | Niente online senza approvazione. Approvano **Angelo e Lorenzo**, poi **verificatori di fiducia**. Livelli visibili: "Verificato sul posto" / "Segnalato dalla community". **Scadenza 24 mesi** → "Informazioni da ricontrollare". Segnalazioni in conflitto → scheda in revisione. GPS tolto dalle foto; regole per le recensioni e diritto di replica dei gestori. |
| 4 | **Mappe** | Fornitore europeo (es. **MapTiler**, Svizzera) per mappa e geocodifica, stile nei colori del sito, chiave limitata al dominio. In futuro possibile mappa ospitata (Protomaps). |
| 5 | **Supabase** | Regione UE. **Gratuito in sviluppo, Pro al lancio** (backup, niente pause). Vista pubblica solo dei contenuti approvati; segnalazioni in tabella "in attesa"; storico di ogni modifica. **Pannello di moderazione nostro**. Accesso all'app con **email e password** (password robuste e controllo di quelle rubate, conferma email e reset via SMTP proprio es. Brevo, limiti ai tentativi, 2FA obbligatoria per moderatori). |
| 6 | **Google** | **Pagine statiche generate a ogni approvazione** (`/luoghi/citta/nome`), con anteprime social, dati strutturati e sitemap. |
| 7 | **Hosting** | **Per ora Altervista**: pubblicazione automatica via FTP da GitHub (password FTP nei secrets di GitHub, inserita dai titolari). Header di sicurezza non disponibili su Altervista: già pronti per un hosting futuro. **Dominio da decidere** prima del lancio (`ovunqueaccessibile.it` e `.com` liberi al 24/10/2026). |
| 8 | **App** | **Un'unica web-app (PWA) + APK Android che la impacchetta (TWA)**: si aggiorna da sola. APK scaricabile dal sito, **Play Store più avanti**. Chiave di firma da custodire con backup. |
| 9 | **Legale** | Titolari: **Angelo e Lorenzo come persone** (servono cognomi e città). Schede dei luoghi come **dati aperti ODbL**; recensioni e foto restano degli autori (licenza d'uso a Ovunque Accessibile). Servono Privacy, **Termini d'uso** (con procedura di rimozione DSA) e Dichiarazione di accessibilità: bozze di Mockly, **rilette dal cliente e da un suo consulente legale**. |

### Soglie iniziali per esigenza (base DM 236/1989, da confermare)

| Voce | Carrozzina manuale | Carrozzina elettrica | Difficoltà a camminare |
|---|---|---|---|
| Ingresso ✓ | nessun gradino (≤ 2,5 cm) o rampa ≤ 8% | nessun gradino o rampa ≤ 8% | nessun gradino o ≤ 3 gradini con corrimano |
| Ingresso – | un gradino ≤ 5 cm o rampa ≤ 12% | rampa 8–12% | > 3 gradini con corrimano |
| Porta ✓ | ≥ 80 cm | ≥ 90 cm | ≥ 75 cm |
| Piani ✓ | un piano o ascensore ≥ 120 × 80 cm | un piano o ascensore ≥ 140 × 110 cm | ascensore o scale con corrimano |
| Bagno ✓ (dove previsto) | spazio di rotazione 150 cm + maniglioni | come manuale, 150 cm obbligatorio | maniglioni |
| In più | — | — | sedute, parcheggio entro 50 m |

Giudizio per esigenza: ✓ se tutte le voci sono ✓; ✕ se ingresso o spazi principali sono ✕; – negli altri casi; ? se mancano le misure dell'ingresso.

---

## Web-app (cartella `app/`) e database Supabase

**Cosa c'è**: una web-app installabile (PWA) con mappa, scheda del luogo, accesso, profilo, segnalazioni e pannello di moderazione. Usa lo stesso codice del sito per regole e giudizi (`sito/assets/js/oa-core.js`, `window.OA`): una soglia cambiata vale per entrambi.

| Pagina | Cosa fa |
|---|---|
| `index.html` | Mappa ed elenco con «Come ti muovi?» e filtri (come il sito) |
| `luogo.html` | Scheda + **Salva nei preferiti**, **Proponi una correzione**, recensioni approvate e modulo «Racconta la tua visita» |
| `accedi.html`, `registrati.html`, `password.html` | Accesso con email e password; registrazione con nome pubblico, conferma 14 anni e privacy; password dimenticata |
| `segnala.html` | Nuovo luogo o correzione (`?id=`): misure base, voci facoltative, dettagli per tipo, posizione sulla mappa o con le coordinate, **fino a 5 foto** con descrizione obbligatoria |
| `profilo.html` | Esigenza salvata nell'account, preferiti, stato delle proprie segnalazioni e recensioni, nome pubblico, password, **scarica i miei dati**, esci, **elimina l'account** |
| `moderazione.html` | Solo verificatori/admin **con verifica in due passaggi (TOTP)**: proposte con confronto «Ora / Proposto» e anteprima dei giudizi, approva (community o «verificato sul posto») o respingi con motivo; recensioni; stato delle schede (pubblicata / in revisione / archiviata) |
| `privacy.html` | Bozza dell'informativa dell'app (versione `app-2026-10-v1`), da rileggere con il consulente |

**Modalità prova**: con `app/assets/js/config.js` vuoto l'app usa i luoghi di esempio e account finti salvati solo nel browser (pulsanti «Entra come utente / moderatore di prova»; codice 2FA: qualsiasi numero di 6 cifre). Serve per rivedere grafica e flussi prima di Supabase.

**File**: `assets/js/api.js` (stesse funzioni per Supabase e per la prova), `assets/js/app.js` (pagine), `assets/css/app.css` (si aggiunge a `sito.css`; sul telefono la navigazione è una barra in basso), `manifest.webmanifest`, `sw.js` (pagine dalla rete, file statici in cache, **mai** in cache dati e accessi), `assets/vendor/supabase/` (supabase-js 2.117.3, integrità npm verificata, licenza MIT). CSP nelle pagine con `<meta>` (Altervista non applica gli header). Le icone 192/512 sono ingrandite dal logo 180 × 225: **serve il logo in alta risoluzione**.

### Database (`supabase/migrations/20261024000000_app.sql`)

- `profiles` (nome pubblico, esigenza, ruolo `utente` / `verificatore` / `admin`), creato alla registrazione: senza conferma dei 14 anni e della privacy la registrazione fallisce.
- `places`: schede; tutti leggono solo `pubblicato` e `in-revisione`; **nessuno scrive direttamente**, solo le funzioni di moderazione. `scheda_valida()` controlla ogni misura (tipi, intervalli, voci ammesse).
- `proposte` (nuovo luogo / correzione), `recensioni`, `preferiti`: ognuno vede e cancella solo i propri; limite 10 proposte e 10 recensioni al giorno, 500 preferiti. L'id dell'autore non è mai pubblico.
- `storico_luoghi`: ogni modifica alle schede, con la proposta che l'ha causata.
- **Foto** (`supabase/migrations/20261024010000_foto.sql`): bucket privato `foto` (max 3 MB, solo JPEG/WebP), ogni utente scrive solo in `<suo id>/`. L'app ricomprime le foto nel browser (lato lungo 1600 px): così sparisce la posizione GPS. Tabella `foto` con descrizione obbligatoria (testo alternativo, 5–200 caratteri), massimo 5 per segnalazione e 20 al giorno. Restano private finché la proposta non è approvata (allora diventano pubbliche con la scheda; se respinta, restano escluse); il moderatore può escluderne una singola (`modera_foto`). Si mostrano con URL firmati validi un'ora. Eliminando l'account l'app cancella anche i file.
- Funzioni: `approva_proposta`, `respingi_proposta`, `modera_recensione`, `stato_luogo`, `imposta_ruolo` (solo admin), `i_miei_dati` (export), `elimina_account`. Moderatore = ruolo giusto **e** token `aal2` (2FA).
- `supabase/seed.sql`: i 19 luoghi di esempio (`esempio = true`), rigenerabili con `python3 supabase/strumenti/seed_da_json.py`. Prima del lancio: `delete from public.places where esempio;`
- **Prove**: `sh supabase/tests/esegui.sh` avvia un Postgres locale usa e getta e verifica le regole (`supabase/tests/rls.sql`: anonimi, utenti, moderatori con e senza 2FA, limiti, eliminazione account).

### Stato attuale (24 ottobre 2026)

Progetto **«ovunque accessibile»** nell'organizzazione Supabase «OVVUNQUE ACCESSIBILE» dell'account Mockly, regione Central EU (Frankfurt), piano Free, URL `https://fzqibkvdpywgvlejzeks.supabase.co`. Fatti i passi 2–4 e 6–7 qui sotto: migrazioni `app.sql` e `foto.sql`, 19 luoghi di esempio, Site URL e Redirect URLs, password minima 10 con lettere e numeri, conferma email attiva, TOTP attivo, chiave publishable in `app/assets/js/config.js`. Verificato dall'esterno con la chiave pubblica: si leggono solo le schede; profili, proposte, storico, scritture e funzioni di moderazione sono rifiutati.

**Ancora da fare**: SMTP proprio (passo 5: con il servizio email di Supabase le email di conferma arrivano solo agli indirizzi dei membri dell'organizzazione, quindi gli utenti esterni non riescono a registrarsi), nomina degli admin (passo 8), pubblicazione della cartella `app/` su Altervista.

### Configurare Supabase (da fare con i titolari: account e password li inseriscono loro)

1. Su supabase.com crea il progetto **Ovunque Accessibile**, regione **Central EU (Frankfurt)**, piano Free per ora. La password del database va nel gestore di password dei titolari, **mai** nel repository o in chat.
2. **SQL Editor** → incolla ed esegui, nell'ordine: `supabase/migrations/20261024000000_app.sql`, `supabase/migrations/20261024010000_foto.sql` (crea anche il bucket delle foto), poi (facoltativo, per avere luoghi da guardare) `supabase/seed.sql`. Le due migrazioni vecchie (`subscribers`) servono solo alla lista d'attesa, non attiva.
3. **Authentication → Sign In / Providers → Email**: attivo, «Confirm email» attivo, lunghezza minima password **10**, requisiti «lettere e numeri». Sul piano Pro attivare anche «Leaked password protection».
4. **Authentication → URL Configuration**: Site URL `https://ovunqueaccessibile.altervista.org/app/`; Redirect URLs `https://ovunqueaccessibile.altervista.org/app/**` (e `http://localhost:8091/app/**` per le prove).
5. **Authentication → Emails**: testi in italiano; **SMTP proprio** (es. Brevo) prima del lancio, perché quello di Supabase manda pochissime email all'ora.
6. **Authentication → Multi-Factor**: TOTP attivo (lo è di default).
7. **Project Settings → API**: copia *Project URL* e la chiave **publishable** (o *anon*) in `app/assets/js/config.js`. È pubblica per natura; la chiave *secret / service_role* non va mai nell'app.
8. Angelo e Lorenzo si registrano dall'app; poi nel SQL Editor: `update public.profiles set ruolo = 'admin' where id = (select id from auth.users where email = '…');`. Al primo ingresso in `moderazione.html` attivano la 2FA. Gli altri verificatori li nomina un admin con `select public.imposta_ruolo('email', 'verificatore');`.

**Da fare dopo**: pulizia periodica dei file delle foto respinte o ritirate, pagine statiche generate a ogni approvazione, MapTiler, APK (TWA), Termini d'uso e Dichiarazione di accessibilità, paginazione oltre 1000 luoghi, diritto di replica dei gestori.
