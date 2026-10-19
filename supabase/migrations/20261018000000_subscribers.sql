-- Ovunque Accessibile – iscritti alla lista "Rimani aggiornato" (Supabase / Postgres)
--
-- Modello di sicurezza:
-- 1. La tabella sta nello schema "private", che NON è esposto dalle API di Supabase (REST/GraphQL):
--    nessuna chiave anon/publishable può leggerla o scriverla, nemmeno per errore.
-- 2. RLS attiva senza alcuna policy: anche se un giorno lo schema venisse esposto, nessuno vede nulla.
-- 3. L'unico modo per scrivere è la funzione private.subscribe(), eseguibile solo dal ruolo
--    "form_writer", usato dalla Edge Function. form_writer non può leggere la tabella.
-- 4. Niente indirizzo IP né user agent (minimizzazione dei dati).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.subscribers (
  id              bigint generated always as identity primary key,
  name            text        not null check (char_length(name) between 1 and 100),
  email           text        not null check (
                    char_length(email) between 3 and 254
                    and email = lower(email)
                    and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
                  ),
  role            text        check (role in ('disability', 'family', 'business', 'other')),
  city            text        check (char_length(city) <= 100),
  place_note      text        check (char_length(place_note) <= 10000),
  consent_at      timestamptz not null,
  privacy_version text        not null check (char_length(privacy_version) <= 20),
  created_at      timestamptz not null default now(),
  constraint subscribers_email_key unique (email)
);

create index if not exists subscribers_created_at_idx on private.subscribers (created_at);

alter table private.subscribers enable row level security;
revoke all on table private.subscribers from public, anon, authenticated, service_role;

-- Iscrizione: inserisce, oppure (email già presente) aggiunge il luogo raccontato senza toccare il resto.
-- Restituisce 'ok' (nuova), 'already' (già iscritta) o 'busy' (troppe iscrizioni in poco tempo).
create or replace function private.subscribe(
  p_name            text,
  p_email           text,
  p_role            text,
  p_city            text,
  p_place_note      text,
  p_privacy_version text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted boolean;
begin
  -- Limite globale anti-flood, senza usare IP: massimo 60 nuove iscrizioni ogni 10 minuti
  if (select count(*) from private.subscribers
       where created_at > now() - interval '10 minutes') >= 60 then
    return 'busy';
  end if;

  insert into private.subscribers as s
    (name, email, role, city, place_note, consent_at, privacy_version)
  values
    (p_name, lower(p_email), nullif(p_role, ''), nullif(p_city, ''), nullif(p_place_note, ''), now(), p_privacy_version)
  on conflict (email) do update
    set place_note = case
      when excluded.place_note is null then s.place_note
      when s.place_note is null then excluded.place_note
      when char_length(s.place_note) + char_length(excluded.place_note) + 5 > 10000 then s.place_note
      else s.place_note || E'\n---\n' || excluded.place_note
    end
  returning (xmax = 0) into v_inserted;

  return case when v_inserted then 'ok' else 'already' end;
end;
$$;

revoke all on function private.subscribe(text, text, text, text, text, text)
  from public, anon, authenticated, service_role;

-- Ruolo minimo per la Edge Function: può solo chiamare private.subscribe().
-- La password NON è qui: impostala dal SQL Editor (vedi README, "Configurare Supabase").
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'form_writer') then
    create role form_writer with login noinherit nocreatedb nocreaterole connection limit 10;
  end if;
end;
$$;

alter role form_writer set statement_timeout = '5s';
alter role form_writer set search_path = '';
grant usage on schema private to form_writer;
grant execute on function private.subscribe(text, text, text, text, text, text) to form_writer;
