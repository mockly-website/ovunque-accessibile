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
- **Limite di Altervista**: gli header di sicurezza (CSP, HSTS, `X-Frame-Options`) **non vengono inviati**, perché il piano gratuito non attiva `mod_headers` (il blocco `<IfModule mod_headers.c>` viene ignorato senza errori). Il sito resta comunque senza script esterni né tracker; per avere anche gli header serve un hosting che li supporti (es. Netlify, Cloudflare Pages).
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
