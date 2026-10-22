# Ovunque Accessibile – pagina "in arrivo"

Pagina unica che annuncia l'arrivo del **sito definitivo e della web-app**, con una carrozzina animata che percorre una stradina e un modulo per lasciare **solo l'email** ed essere avvisati.
Realizzata da Mockly.

- **Front-end**: HTML5, CSS3, JavaScript vanilla (solo progressive enhancement). Sito statico, nessun framework, nessun CDN, nessun tracker, **nessun cookie** (quindi niente banner cookie).
- **Backend**: [Supabase](https://supabase.com) (Postgres, regione UE) + Edge Function `subscribe` che riceve il modulo.
- **Email** (facoltativa): notifica a ogni nuova iscrizione tramite Brevo (azienda UE).

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
│   ├── js/main.js           animazione della carrozzina + modulo
│   ├── fonts/               Comic Neue 700, Atkinson Hyperlegible 400/700 (woff2, licenza OFL inclusa)
│   └── img/                 logo, favicon, apple-touch-icon, og-image
├── supabase/                NON va pubblicato con il sito
│   ├── config.toml
│   ├── migrations/          20261018000000_subscribers.sql, 20261022000000_email_only.sql
│   └── functions/subscribe/ index.ts (Edge Function), .env.example (secrets)
└── DOCUMENTAZIONE.md
```

## La pagina

- **Annuncio**: logo, "In arrivo", nome, slogan e una frase: "Siamo Angelo e Lorenzo. Stiamo preparando il sito e la web-app…".
- **Stradina animata** (SVG): una carrozzina percorre un sentiero (ripreso dal logo) passando accanto a due segnaposto; la ruota gira mentre avanza.
  - Animazione SMIL avviata da `main.js`, in loop. Un pulsante **"Ferma / Avvia l'animazione"** la controlla (WCAG 2.2.2).
  - Se il sistema chiede di ridurre il movimento (`prefers-reduced-motion`), la carrozzina resta ferma e il pulsante permette di avviarla.
  - Senza JavaScript la carrozzina resta ferma a metà strada.
  - La scena è decorativa (`aria-hidden`): il contenuto è tutto nel testo.
- **Modulo "Ti avvisiamo noi"**: email + consenso, pulsante "Avvisami".
- **Footer**: Instagram, email di contatto, privacy, © 2026, "Sito realizzato da Mockly".

## Come sono protetti i dati

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

## Configurare Supabase (una volta)

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

Si pubblicano **solo**: `*.html`, `assets/`, `_headers` (Netlify/Cloudflare Pages) oppure `.htaccess` (Apache). **Non** pubblicare `supabase/`, i file `.md` e `.claude/`.

## Vedere la demo in locale

```bash
cd "/Users/noahmelis/Desktop/PROGECT/OVUNQUE ACCESSIBILE" && /Applications/MAMP/bin/php/php8.4.17/bin/php -S 127.0.0.1:8080
```
Poi apri http://localhost:8080. La pagina e l'animazione funzionano; il modulo risponde solo dopo aver configurato Supabase.

## Consultare ed esportare gli iscritti

Dashboard Supabase → **Table Editor** → schema `private` → `subscribers` → esporta CSV. Accesso solo a persone autorizzate, ognuna con il proprio account e la 2FA. Il piano gratuito non ha backup scaricabili e va in pausa dopo circa una settimana senza attività.

## Dove modificare

| Cosa | Dove |
|---|---|
| Testi dell'annuncio | `index.html`, blocco "Annuncio" |
| Stradina, carrozzina, segnaposto | `index.html` (SVG `.trail__svg`), colori in `style.css` sezione 7, velocità in `dur="14s"` (`animateMotion`) |
| Email di contatto | footer di `index.html`, `privacy.html` (sezioni 1 e 10) |
| Blu del logo | `style.css` → `--color-brand` |
| Messaggi del modulo | `main.js` (client) e `supabase/functions/subscribe/index.ts` (server) |
| Informativa privacy | `privacy.html`; se la cambi, aggiorna il secret `PRIVACY_VERSION` (ora `2026-10-v2`) |

## Prossimi passi consigliati

1. **Double opt-in** con Brevo: email "conferma la tua iscrizione".
2. **Link di disiscrizione** in ogni email.
3. **Pulizia automatica** (pg_cron) oltre il periodo di conservazione.

---

## Report di accessibilità (22 ottobre 2026)

Obiettivo WCAG 2.2 AA. Verifiche fatte nel browser integrato (Chromium) e con un backend locale (Postgres 17 + Deno).

| Verifica | Esito |
|---|---|
| axe-core 4.10.2 (WCAG 2.0/2.1/2.2 A+AA + best practice) | **0 violazioni** su `index.html`, `grazie.html`, `privacy.html`, `iscrizione-errore.html`. In home axe segnala "da rivedere" i testi sopra gli sfondi a gradiente: i colori sono tutti chiari (beige, azzurrino, bianco caldo), il caso peggiore è il link blu in grassetto su beige, 4,75:1 |
| Tastiera | skip link; invio vuoto → focus sul riepilogo errori; correggendo l'errore sparisce; invio riuscito → focus sul messaggio; pulsante "Ferma/Avvia l'animazione" raggiungibile e attivabile |
| Errori | `aria-invalid`, messaggio collegato con `aria-describedby`, prefisso nascosto "Errore:", icona + testo + bordo spesso |
| Animazione | in loop ma con pulsante di pausa (2.2.2); non parte da sola con "riduci movimento"; nessun lampeggiamento |
| Telefono | 375px: annuncio, carrozzina e inizio del modulo nella prima schermata; nessuno scroll orizzontale |
| Aree cliccabili | ≥ 44×44 px, tranne i link dentro le frasi (eccezione WCAG 2.5.8) e la checkbox (28 px, ma l'intera etichetta è cliccabile) |

**Non ancora verificato**: VoiceOver/NVDA reali, Lighthouse sul sito online, dispositivi reali, notifica Brevo.

## Test del backend (in locale)

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
| 1 | **Email di contatto** `[EMAIL DA DEFINIRE]` | footer `index.html`, `privacy.html`, secret `NOTIFY_TO` |
| 2 | **Titolare del trattamento** | `privacy.html` sezione 1 |
| 3 | **Blu del logo**: brief `#2F5B9C` (in uso), PNG `#215A9F` | `--color-brand` |
| 4 | **Logo vettoriale** (SVG o PNG ≥ 1000 px) | `assets/img/` |
| 5 | **Dominio**: canonical, og:url, og:image assoluto, `SITE_URL`, `ALLOWED_ORIGINS`, `NOTIFY_FROM` | `index.html`, secrets |
| 6 | **`[PROJECT-REF]`** di Supabase | `index.html`, `_headers`, `.htaccess` |
| 7 | Privacy: hosting, ruolo di Mockly, conservazione, età minima, log dei fornitori, DPA Supabase, data | `privacy.html` |

> ⚠️ `privacy.html` è un **modello**: non è consulenza legale e va verificato dal titolare del trattamento prima della pubblicazione.
