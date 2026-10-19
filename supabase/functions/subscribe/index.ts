/*
 * Ovunque Accessibile – Edge Function "subscribe" (sostituisce subscribe.php).
 *
 * GET  ?action=token → { token } firmato con HMAC (orario + nonce): serve al controllo
 *                      del tempo minimo di compilazione, senza cookie né sessioni.
 * POST               → iscrizione. JSON se la richiesta chiede application/json (fetch),
 *                      altrimenti redirect 303 a grazie.html / iscrizione-errore.html.
 *
 * Va pubblicata con verify_jwt = false (vedi supabase/config.toml): il sito non contiene
 * nessuna chiave Supabase, e il form senza JavaScript non può inviare header.
 * Il database è raggiungibile solo col ruolo form_writer, che può solo chiamare private.subscribe().
 */

import postgres from 'npm:postgres@3.4.5';

/* ---------- Configurazione (secrets della funzione) ---------- */

function env(name: string, fallback = ''): string {
  return Deno.env.get(name) ?? fallback;
}

const SITE_URL = env('SITE_URL').replace(/\/+$/, '');
const ALLOWED_ORIGINS = env('ALLOWED_ORIGINS', SITE_URL)
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const FORM_SECRET = env('FORM_SECRET');
const PRIVACY_VERSION = env('PRIVACY_VERSION', '2026-10-v1');
const MIN_FILL_SECONDS = Number(env('MIN_FILL_SECONDS', '3'));
const TOKEN_TTL_SECONDS = Number(env('TOKEN_TTL_SECONDS', '7200'));
const NOTIFY_TO = env('NOTIFY_TO');
const NOTIFY_FROM = env('NOTIFY_FROM');
const BREVO_API_KEY = env('BREVO_API_KEY');

if (!SITE_URL || FORM_SECRET.length < 32 || !env('FORM_DB_URL')) {
  console.error('[subscribe] configurazione incompleta: SITE_URL, FORM_SECRET (>= 32 caratteri), FORM_DB_URL');
}

const sql = postgres(env('FORM_DB_URL'), {
  prepare: false,          // obbligatorio con il pooler di Supabase in transaction mode
  ssl: env('FORM_DB_SSL', 'require') === 'disable' ? false : 'require',
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

const ROLES = new Set(['disability', 'family', 'business', 'other']);
const LIMITS = { name: 100, email: 254, city: 100, place_note: 1000 } as const;

/* ---------- Token firmato (HMAC-SHA256) ---------- */

const encoder = new TextEncoder();
const hmacKey = crypto.subtle.importKey(
  'raw',
  encoder.encode(FORM_SECRET),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function issueToken(): Promise<string> {
  const payload = `${Math.floor(Date.now() / 1000)}.${toBase64Url(crypto.getRandomValues(new Uint8Array(16)))}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey, encoder.encode(payload)));
  return `${payload}.${toBase64Url(sig)}`;
}

/** 'valid' | 'too_fast' | 'invalid' (firma errata o scaduto) */
async function checkToken(token: string): Promise<'valid' | 'too_fast' | 'invalid'> {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 200) return 'invalid';
  const sig = fromBase64Url(parts[2]);
  if (!sig) return 'invalid';
  const ok = await crypto.subtle.verify('HMAC', await hmacKey, sig, encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return 'invalid';
  const age = Math.floor(Date.now() / 1000) - Number(parts[0]);
  if (!Number.isFinite(age) || age > TOKEN_TTL_SECONDS || age < -60) return 'invalid';
  return age < MIN_FILL_SECONDS ? 'too_fast' : 'valid';
}

/* ---------- Input: normalizzazione e validazione ---------- */

type Data = { name: string; email: string; role: string; city: string; place_note: string; consent: boolean };

function cleanLine(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalize(form: FormData): Data {
  const note = String(form.get('place_note') ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  const role = String(form.get('role') ?? '');
  return {
    name: cleanLine(form.get('name')),
    email: cleanLine(form.get('email')).toLowerCase(),
    role: ROLES.has(role) ? role : '',
    city: cleanLine(form.get('city')),
    place_note: note,
    consent: form.get('consent') === '1',
  };
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/u;

function validate(d: Data): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name) errors.name = 'Scrivi il tuo nome.';
  else if (d.name.length > LIMITS.name) errors.name = `Il nome può avere al massimo ${LIMITS.name} caratteri.`;

  if (!d.email) errors.email = 'Scrivi il tuo indirizzo email.';
  else if (d.email.length > LIMITS.email || !EMAIL_RE.test(d.email)) {
    errors.email = "Controlla l'indirizzo email: deve essere nel formato nome@esempio.it.";
  }

  if (d.city.length > LIMITS.city) errors.city = `La città può avere al massimo ${LIMITS.city} caratteri.`;
  if (d.place_note.length > LIMITS.place_note) {
    errors.place_note = `Il racconto può avere al massimo ${LIMITS.place_note} caratteri.`;
  }
  if (!d.consent) errors.consent = 'Per iscriverti serve il tuo consenso a ricevere gli aggiornamenti via email.';
  return errors;
}

/* ---------- Risposte ---------- */

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (origin && origin !== 'null') return ALLOWED_ORIGINS.includes(origin) ? origin : null;
  const referer = req.headers.get('referer');
  if (!referer) return null;
  try {
    const o = new URL(referer).origin;
    return ALLOWED_ORIGINS.includes(o) ? o : null;
  } catch {
    return null;
  }
}

function baseHeaders(origin: string | null): Headers {
  const h = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Origin',
  });
  if (origin) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Accept, Content-Type');
    h.set('Access-Control-Max-Age', '86400');
  }
  return h;
}

function json(status: number, body: Record<string, unknown>, origin: string | null): Response {
  const h = baseHeaders(origin);
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: h });
}

function redirect(page: string, origin: string | null): Response {
  const h = baseHeaders(origin);
  h.set('Location', `${SITE_URL}/${page}`);
  return new Response(null, { status: 303, headers: h });
}

const MESSAGES = {
  expired: { title: 'La sessione è scaduta', message: 'Ricarica la pagina e invia di nuovo il modulo.' },
  too_fast: {
    title: 'Un attimo di pazienza',
    message: 'Hai fatto prestissimo! Attendi qualche secondo e premi di nuovo “Iscriviti alla lista”.',
  },
  busy: {
    title: 'Stiamo ricevendo molte iscrizioni',
    message: 'Riprova tra qualche minuto: i dati che hai scritto sono ancora nel modulo.',
  },
  error: {
    title: 'Non siamo riusciti a iscriverti',
    message: "C'è stato un problema tecnico da parte nostra. Riprova tra qualche minuto.",
  },
};

/* Stessa risposta per email nuova e già iscritta: chi prova un indirizzo non deve poter
   scoprire se quella persona è nella lista (email enumeration). */
function success(name: string, withNote: boolean, wantsJson: boolean, origin: string | null) {
  if (!wantsJson) return redirect('grazie.html', origin);
  return json(200, {
    status: 'ok',
    title: name ? `Grazie, ${name}!` : 'Grazie!',
    message: 'Il tuo indirizzo è nella lista: ti scriveremo quando Ovunque Accessibile sarà pronta.' +
      ' Se eri già iscritto o iscritta, non devi fare altro.' +
      (withNote ? ' Grazie anche per il luogo che ci hai raccontato.' : ''),
  }, origin);
}

/* ---------- Notifica email facoltativa (Brevo, azienda UE) ---------- */

const ROLE_LABELS: Record<string, string> = {
  disability: 'Persona con disabilità',
  family: 'Familiare o accompagnatore',
  business: 'Struttura o attività',
  other: 'Altro',
};

async function notify(d: Data): Promise<void> {
  if (!BREVO_API_KEY || !NOTIFY_TO || !NOTIFY_FROM) return;
  const text = 'Nuova iscrizione a Ovunque Accessibile\n\n' +
    `Nome: ${d.name}\nEmail: ${d.email}\n` +
    `Chi è: ${ROLE_LABELS[d.role] ?? '-'}\nCittà: ${d.city || '-'}\n` +
    `Luogo segnalato:\n${d.place_note || '-'}\n`;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: NOTIFY_FROM, name: 'Ovunque Accessibile' },
        to: [{ email: NOTIFY_TO }],
        subject: 'Nuova iscrizione – Ovunque Accessibile',
        textContent: text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('[subscribe] notifica non inviata, HTTP', res.status);
  } catch {
    console.error('[subscribe] notifica non inviata');
  }
}

/* ---------- Gestione richieste ---------- */

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const origin = allowedOrigin(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: origin ? 204 : 403, headers: baseHeaders(origin) });
  }

  if (req.method === 'GET' && url.searchParams.get('action') === 'token') {
    if (!origin) return json(403, { status: 'forbidden' }, null);
    return json(200, { token: await issueToken() }, origin);
  }

  if (req.method !== 'POST') return redirect('index.html#iscriviti', origin);

  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');

  // Solo dal sito: blocca invii da altre pagine (Origin, o Referer se Origin manca)
  if (!origin) {
    return wantsJson ? json(403, { status: 'forbidden', ...MESSAGES.error }, null) : redirect('iscrizione-errore.html', null);
  }

  // Corpo massimo ~20 KB: il modulo legittimo pesa molto meno
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > 20_000) return json(413, { status: 'invalid', ...MESSAGES.error }, origin);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return wantsJson ? json(400, { status: 'invalid', ...MESSAGES.error }, origin) : redirect('iscrizione-errore.html', origin);
  }

  // Honeypot compilato: fingiamo un successo e non salviamo nulla
  if (String(form.get('website') ?? '').trim() !== '') {
    return success('', false, wantsJson, origin);
  }

  // Con JavaScript il token è obbligatorio; senza JavaScript (POST classico) non può esserci
  const token = String(form.get('form_token') ?? '');
  if (wantsJson || token) {
    const check = await checkToken(token);
    if (check === 'invalid') {
      return wantsJson ? json(403, { status: 'expired', ...MESSAGES.expired }, origin) : redirect('iscrizione-errore.html', origin);
    }
    if (check === 'too_fast') {
      return wantsJson ? json(429, { status: 'too_fast', ...MESSAGES.too_fast }, origin) : redirect('iscrizione-errore.html', origin);
    }
  }

  const data = normalize(form);
  const errors = validate(data);
  if (Object.keys(errors).length) {
    return wantsJson
      ? json(422, { status: 'invalid', title: 'Controlla i campi indicati', message: 'Alcuni campi non sono corretti.', errors }, origin)
      : redirect('iscrizione-errore.html', origin);
  }

  let result: string;
  try {
    const rows = await sql<{ result: string }[]>`
      select private.subscribe(
        ${data.name}, ${data.email}, ${data.role}, ${data.city}, ${data.place_note}, ${PRIVACY_VERSION}
      ) as result`;
    result = rows[0]?.result ?? '';
  } catch (err) {
    // Mai dati personali nei log: solo il tipo di errore
    console.error('[subscribe] errore database:', (err as { code?: string }).code ?? 'sconosciuto');
    return wantsJson ? json(500, { status: 'error', ...MESSAGES.error }, origin) : redirect('iscrizione-errore.html', origin);
  }

  if (result === 'busy') {
    return wantsJson ? json(503, { status: 'busy', ...MESSAGES.busy }, origin) : redirect('iscrizione-errore.html', origin);
  }
  if (result !== 'ok' && result !== 'already') {
    console.error('[subscribe] risultato inatteso');
    return wantsJson ? json(500, { status: 'error', ...MESSAGES.error }, origin) : redirect('iscrizione-errore.html', origin);
  }

  // Notifica in background (EdgeRuntime.waitUntil): la risposta non deve essere più lenta per le email nuove
  if (result === 'ok') {
    const pending = notify(data);
    (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(pending);
  }
  return success(data.name, data.place_note !== '', wantsJson, origin);
});
