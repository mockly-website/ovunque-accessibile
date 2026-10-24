-- Ovunque Accessibile – database dell'app (Supabase / Postgres)
--
-- Tabelle: profiles (profilo di chi usa l'app), places (schede pubblicate), proposte (nuovi luoghi e
-- correzioni in attesa), recensioni, preferiti, storico_luoghi (ogni modifica alle schede).
--
-- Modello di sicurezza:
-- 1. RLS attiva su ogni tabella. Chi non è registrato legge SOLO le schede pubblicate e le recensioni approvate.
-- 2. Nessuno scrive direttamente su places: le schede cambiano solo con approva_proposta() e
--    stato_luogo(), eseguite da un moderatore.
-- 3. Moderatore = profilo con ruolo 'verificatore' o 'admin' E accesso con verifica in due passaggi
--    (claim aal2 del token). Senza 2FA anche un moderatore vede solo ciò che vede chiunque.
-- 4. Gli utenti scrivono solo le proprie proposte, recensioni e preferiti, solo nelle colonne permesse,
--    con limiti giornalieri. Il contenuto delle schede è validato dal database (scheda_valida).
-- 5. Nessun indirizzo IP, nessun dato oltre a quelli necessari. L'id dell'autore non è mai pubblico:
--    si mostra solo il nome pubblico scelto.
-- Il ruolo del primo admin si assegna dal SQL Editor (vedi DOCUMENTAZIONE.md, "Configurare Supabase").

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

/* ---------- Validazione delle schede ---------- */

-- Valore JSON assente/null oppure numero nell'intervallo
create or replace function public.oa_num(v jsonb, lo numeric, hi numeric)
returns boolean language sql immutable set search_path = '' as $$
  select v is null or jsonb_typeof(v) = 'null'
      or (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between lo and hi);
$$;

create or replace function public.oa_bool(v jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select v is null or jsonb_typeof(v) in ('null', 'boolean');
$$;

create or replace function public.oa_enum(v jsonb, allowed text[])
returns boolean language sql immutable set search_path = '' as $$
  select v is null or jsonb_typeof(v) = 'null'
      or (jsonb_typeof(v) = 'string' and (v #>> '{}') = any (allowed));
$$;

create or replace function public.oa_text(v jsonb, max_len int)
returns boolean language sql immutable set search_path = '' as $$
  select v is null or jsonb_typeof(v) = 'null'
      or (jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= max_len
          and (v #>> '{}') !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]');
$$;

-- Oggetto JSON con sole chiavi ammesse
create or replace function public.oa_obj(v jsonb, allowed text[])
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(v) = 'object'
     and not exists (select 1 from jsonb_object_keys(v) k where k <> all (allowed));
$$;

-- Misure base + voci facoltative + dettagli per tipo di luogo (stessa forma di sito/assets/data/luoghi.json)
create or replace function public.scheda_valida(m jsonb, f jsonb, d jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  i jsonb; s jsonb; p jsonb; b jsonb; park jsonb; ass jsonb;
begin
  if m is null or f is null or d is null then return false; end if;
  if octet_length(m::text) + octet_length(f::text) + octet_length(d::text) > 12000 then return false; end if;
  if not public.oa_obj(m, array['ingresso', 'spazi', 'piani', 'bagno']) then return false; end if;
  i := m -> 'ingresso'; s := m -> 'spazi'; p := m -> 'piani'; b := m -> 'bagno';
  if i is null or s is null or p is null or b is null then return false; end if;

  if not (public.oa_obj(i, array['gradini', 'gradino_cm', 'rampa', 'rampa_pct', 'corrimano', 'porta_cm', 'nota', 'nota_porta'])
      and public.oa_num(i -> 'gradini', 0, 200) and public.oa_num(i -> 'gradino_cm', 0, 100)
      and public.oa_bool(i -> 'rampa') and public.oa_num(i -> 'rampa_pct', 0, 50)
      and public.oa_bool(i -> 'corrimano') and public.oa_num(i -> 'porta_cm', 0, 500)
      and public.oa_text(i -> 'nota', 500) and public.oa_text(i -> 'nota_porta', 500)) then return false; end if;

  if not (public.oa_obj(s, array['valore', 'nota'])
      and public.oa_enum(s -> 'valore', array['tutti', 'parziale', 'no'])
      and public.oa_text(s -> 'nota', 500)) then return false; end if;

  if not (public.oa_obj(p, array['valore', 'ascensore_cm', 'corrimano_scale', 'nota'])
      and public.oa_enum(p -> 'valore', array['uno', 'ascensore', 'scale'])
      and public.oa_bool(p -> 'corrimano_scale') and public.oa_text(p -> 'nota', 500)) then return false; end if;
  if p ? 'ascensore_cm' and jsonb_typeof(p -> 'ascensore_cm') <> 'null' then
    if not (jsonb_typeof(p -> 'ascensore_cm') = 'array' and jsonb_array_length(p -> 'ascensore_cm') = 2
        and jsonb_typeof(p -> 'ascensore_cm' -> 0) = 'number' and jsonb_typeof(p -> 'ascensore_cm' -> 1) = 'number'
        and public.oa_num(p -> 'ascensore_cm' -> 0, 30, 500) and public.oa_num(p -> 'ascensore_cm' -> 1, 30, 500)) then
      return false;
    end if;
  end if;

  if not (public.oa_obj(b, array['valore', 'rotazione_cm', 'maniglioni', 'nota'])
      and public.oa_enum(b -> 'valore', array['non-previsto', 'assente', 'non-attrezzato', 'attrezzato'])
      and public.oa_num(b -> 'rotazione_cm', 0, 500) and public.oa_bool(b -> 'maniglioni')
      and public.oa_text(b -> 'nota', 500)) then return false; end if;

  if not (public.oa_obj(f, array['porta_tipo', 'pavimento', 'sedute', 'parcheggio', 'assistenza'])
      and public.oa_enum(f -> 'porta_tipo', array['automatica', 'manuale', 'pesante'])
      and public.oa_enum(f -> 'pavimento', array['liscio', 'irregolare', 'ghiaia'])
      and public.oa_bool(f -> 'sedute')) then return false; end if;
  park := f -> 'parcheggio';
  if park is not null and jsonb_typeof(park) <> 'null' then
    if not (public.oa_obj(park, array['posti', 'distanza_m', 'nota']) and public.oa_bool(park -> 'posti')
        and public.oa_num(park -> 'distanza_m', 0, 5000) and public.oa_text(park -> 'nota', 500)) then return false; end if;
  end if;
  ass := f -> 'assistenza';
  if ass is not null and jsonb_typeof(ass) <> 'null' then
    if not (public.oa_obj(ass, array['valore', 'nota']) and public.oa_bool(ass -> 'valore')
        and public.oa_text(ass -> 'nota', 500)) then return false; end if;
  end if;

  return public.oa_obj(d, array['tavoli_cm', 'spazio_gambe', 'camere_accessibili', 'doccia_filo', 'passerella',
        'sedia_mare', 'posti_carrozzina', 'accompagnatore_gratis', 'assistenza_prenotabile', 'preavviso_ore',
        'percorso_tattile', 'ausili_prestito'])
    and public.oa_num(d -> 'tavoli_cm', 30, 150) and public.oa_num(d -> 'camere_accessibili', 0, 2000)
    and public.oa_num(d -> 'posti_carrozzina', 0, 2000) and public.oa_num(d -> 'preavviso_ore', 0, 720)
    and public.oa_bool(d -> 'spazio_gambe') and public.oa_bool(d -> 'doccia_filo') and public.oa_bool(d -> 'passerella')
    and public.oa_bool(d -> 'sedia_mare') and public.oa_bool(d -> 'accompagnatore_gratis')
    and public.oa_bool(d -> 'assistenza_prenotabile') and public.oa_bool(d -> 'percorso_tattile')
    and public.oa_bool(d -> 'ausili_prestito');
end;
$$;

-- Proposta completa (nuovo luogo o correzione): dati anagrafici + scheda
create or replace function public.proposta_valida(x jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select public.oa_obj(x, array['nome', 'categoria', 'indirizzo', 'cap', 'citta', 'provincia', 'regione',
           'lat', 'lng', 'descrizione', 'misure', 'facoltativi', 'dettagli'])
     and jsonb_typeof(x -> 'nome') = 'string' and char_length(btrim(x ->> 'nome')) between 2 and 120
     and public.oa_text(x -> 'nome', 120)
     and public.oa_enum(x -> 'categoria', array['ristorante', 'museo', 'hotel', 'spiaggia', 'parco', 'cultura', 'negozio', 'trasporti'])
     and jsonb_typeof(x -> 'categoria') = 'string'
     and jsonb_typeof(x -> 'indirizzo') = 'string' and char_length(btrim(x ->> 'indirizzo')) between 3 and 200
     and public.oa_text(x -> 'indirizzo', 200)
     and jsonb_typeof(x -> 'citta') = 'string' and char_length(btrim(x ->> 'citta')) between 1 and 80
     and public.oa_text(x -> 'citta', 80)
     and (x -> 'cap' is null or jsonb_typeof(x -> 'cap') = 'null' or (x ->> 'cap') ~ '^[0-9]{5}$')
     and (x -> 'provincia' is null or jsonb_typeof(x -> 'provincia') = 'null' or (x ->> 'provincia') ~ '^[A-Z]{2}$')
     and public.oa_text(x -> 'regione', 40)
     and public.oa_text(x -> 'descrizione', 1000)
     and jsonb_typeof(x -> 'lat') = 'number' and public.oa_num(x -> 'lat', 35, 48)
     and jsonb_typeof(x -> 'lng') = 'number' and public.oa_num(x -> 'lng', 6, 19)
     and public.scheda_valida(x -> 'misure', coalesce(x -> 'facoltativi', '{}'), coalesce(x -> 'dettagli', '{}'));
$$;

/* ---------- Profili ---------- */

create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  nome_pubblico   text not null check (char_length(btrim(nome_pubblico)) between 2 and 40
                    and nome_pubblico !~ '[[:cntrl:]]'),
  esigenza        text check (esigenza in ('manuale', 'elettrica', 'cammino')),
  ruolo           text not null default 'utente' check (ruolo in ('utente', 'verificatore', 'admin')),
  privacy_version text not null check (char_length(privacy_version) between 1 and 20),
  consenso_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (nome_pubblico, esigenza) on table public.profiles to authenticated;

create policy "profilo: leggo il mio" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profilo: modifico il mio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Moderatore: ruolo giusto E accesso con 2FA (aal2)
create or replace function public.is_moderatore()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.ruolo in ('verificatore', 'admin') from public.profiles p where p.id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Alla registrazione: profilo con nome pubblico, versione della privacy accettata e conferma dei 14 anni.
-- Senza questi dati la registrazione fallisce (il controllo non si può aggirare dal browser).
create or replace function private.nuovo_profilo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce(meta ->> 'eta_minima', '') <> 'true' then
    raise exception 'Per registrarti devi avere almeno 14 anni' using errcode = 'check_violation';
  end if;
  if coalesce(meta ->> 'privacy_version', '') = '' then
    raise exception 'Manca il consenso alla privacy' using errcode = 'check_violation';
  end if;
  insert into public.profiles (id, nome_pubblico, privacy_version)
  values (new.id, btrim(coalesce(meta ->> 'nome_pubblico', '')), left(meta ->> 'privacy_version', 20));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.nuovo_profilo();

/* ---------- Schede pubblicate ---------- */

create table if not exists public.places (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  nome             text not null check (char_length(btrim(nome)) between 2 and 120),
  categoria        text not null check (categoria in ('ristorante', 'museo', 'hotel', 'spiaggia', 'parco', 'cultura', 'negozio', 'trasporti')),
  indirizzo        text not null check (char_length(indirizzo) between 3 and 200),
  cap              text check (cap ~ '^[0-9]{5}$'),
  citta            text not null check (char_length(citta) between 1 and 80),
  provincia        text check (provincia ~ '^[A-Z]{2}$'),
  regione          text check (char_length(regione) <= 40),
  lat              double precision not null check (lat between 35 and 48),
  lng              double precision not null check (lng between 6 and 19),
  descrizione      text check (char_length(descrizione) <= 1000),
  misure           jsonb not null,
  facoltativi      jsonb not null default '{}'::jsonb,
  dettagli         jsonb not null default '{}'::jsonb,
  verifica_livello text not null default 'community' check (verifica_livello in ('sul-posto', 'community')),
  verifica_data    date,
  stato            text not null default 'pubblicato' check (stato in ('pubblicato', 'in-revisione', 'archiviato')),
  esempio          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint places_scheda_valida check (public.scheda_valida(misure, facoltativi, dettagli))
);

create index if not exists places_stato_idx on public.places (stato);
create index if not exists places_citta_idx on public.places (citta);

alter table public.places enable row level security;
revoke all on table public.places from public, anon, authenticated;
grant select on table public.places to anon, authenticated;

create policy "luoghi: pubblicati per tutti, tutti per i moderatori" on public.places
  for select to anon, authenticated
  using (stato in ('pubblicato', 'in-revisione') or (select public.is_moderatore()));

/* ---------- Storico di ogni modifica alle schede ---------- */

create table if not exists public.storico_luoghi (
  id          bigint generated always as identity primary key,
  place_id    uuid not null,
  azione      text not null check (azione in ('creata', 'modificata', 'eliminata')),
  prima       jsonb,
  dopo        jsonb,
  autore      uuid,
  proposta_id uuid,
  at          timestamptz not null default now()
);

create index if not exists storico_place_idx on public.storico_luoghi (place_id, at desc);

alter table public.storico_luoghi enable row level security;
revoke all on table public.storico_luoghi from public, anon, authenticated;
grant select on table public.storico_luoghi to authenticated;
create policy "storico: solo moderatori" on public.storico_luoghi
  for select to authenticated using ((select public.is_moderatore()));

create or replace function private.registra_storico()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_proposta uuid := nullif(current_setting('oa.proposta', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.storico_luoghi (place_id, azione, dopo, autore, proposta_id)
    values (new.id, 'creata', to_jsonb(new), auth.uid(), v_proposta);
    return new;
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    insert into public.storico_luoghi (place_id, azione, prima, dopo, autore, proposta_id)
    values (new.id, 'modificata', to_jsonb(old), to_jsonb(new), auth.uid(), v_proposta);
    return new;
  else
    insert into public.storico_luoghi (place_id, azione, prima, autore)
    values (old.id, 'eliminata', to_jsonb(old), auth.uid());
    return old;
  end if;
end;
$$;

drop trigger if exists places_storico_ins on public.places;
drop trigger if exists places_storico_upd on public.places;
drop trigger if exists places_storico_del on public.places;
create trigger places_storico_ins after insert on public.places for each row execute function private.registra_storico();
create trigger places_storico_upd before update on public.places for each row execute function private.registra_storico();
create trigger places_storico_del after delete on public.places for each row execute function private.registra_storico();

/* ---------- Proposte: nuovi luoghi e correzioni ---------- */

create table if not exists public.proposte (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('nuovo', 'correzione')),
  place_id    uuid references public.places (id) on delete cascade,
  autore      uuid default auth.uid() references auth.users (id) on delete set null,
  autore_nome text not null default '',
  dati        jsonb not null check (public.proposta_valida(dati)),
  nota        text check (char_length(nota) <= 1000),
  stato       text not null default 'in-attesa' check (stato in ('in-attesa', 'approvata', 'respinta')),
  motivo      text check (char_length(motivo) <= 500),
  moderatore  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  deciso_at   timestamptz,
  constraint proposte_tipo_luogo check (tipo = 'nuovo' or place_id is not null)
);

create index if not exists proposte_stato_idx on public.proposte (stato, created_at);
create index if not exists proposte_autore_idx on public.proposte (autore);
create index if not exists proposte_place_idx on public.proposte (place_id);

alter table public.proposte enable row level security;
revoke all on table public.proposte from public, anon, authenticated;
-- L'utente sceglie solo questi campi; autore, stato e date li mette il database
grant insert (tipo, place_id, dati, nota) on table public.proposte to authenticated;
grant select (id, tipo, place_id, autore_nome, dati, nota, stato, motivo, created_at, deciso_at)
  on table public.proposte to authenticated;
grant delete on table public.proposte to authenticated;

create policy "proposte: invio le mie" on public.proposte
  for insert to authenticated with check (autore = (select auth.uid()));
create policy "proposte: leggo le mie, i moderatori tutte" on public.proposte
  for select to authenticated using (autore = (select auth.uid()) or (select public.is_moderatore()));
create policy "proposte: ritiro le mie in attesa" on public.proposte
  for delete to authenticated using (autore = (select auth.uid()) and stato = 'in-attesa');

/* ---------- Recensioni ---------- */

create table if not exists public.recensioni (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references public.places (id) on delete cascade,
  autore      uuid default auth.uid() references auth.users (id) on delete cascade,
  autore_nome text not null default '',
  esigenza    text not null check (esigenza in ('manuale', 'elettrica', 'cammino')),
  data_visita date check (data_visita >= date '2000-01-01'),
  testo       text not null check (char_length(btrim(testo)) between 20 and 2000),
  stato       text not null default 'in-attesa' check (stato in ('in-attesa', 'pubblicata', 'respinta')),
  motivo      text check (char_length(motivo) <= 500),
  moderatore  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  deciso_at   timestamptz
);

create index if not exists recensioni_place_idx on public.recensioni (place_id, created_at desc) where stato = 'pubblicata';
create index if not exists recensioni_stato_idx on public.recensioni (stato, created_at);
create index if not exists recensioni_autore_idx on public.recensioni (autore);

alter table public.recensioni enable row level security;
revoke all on table public.recensioni from public, anon, authenticated;
grant select (id, place_id, autore_nome, esigenza, data_visita, testo, stato, created_at)
  on table public.recensioni to anon, authenticated;
grant select (motivo, deciso_at) on table public.recensioni to authenticated;
grant insert (place_id, esigenza, data_visita, testo) on table public.recensioni to authenticated;
grant delete on table public.recensioni to authenticated;

create policy "recensioni: approvate per tutti" on public.recensioni
  for select to anon, authenticated using (stato = 'pubblicata');
create policy "recensioni: le mie e, per i moderatori, tutte" on public.recensioni
  for select to authenticated using (autore = (select auth.uid()) or (select public.is_moderatore()));
create policy "recensioni: scrivo le mie" on public.recensioni
  for insert to authenticated with check (autore = (select auth.uid()));
create policy "recensioni: cancello le mie" on public.recensioni
  for delete to authenticated using (autore = (select auth.uid()));

/* ---------- Preferiti ---------- */

create table if not exists public.preferiti (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id   uuid not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index if not exists preferiti_place_idx on public.preferiti (place_id);

alter table public.preferiti enable row level security;
revoke all on table public.preferiti from public, anon, authenticated;
grant select (place_id, created_at) on table public.preferiti to authenticated;
grant insert (place_id) on table public.preferiti to authenticated;
grant delete on table public.preferiti to authenticated;

create policy "preferiti: solo i miei (lettura)" on public.preferiti
  for select to authenticated using (user_id = (select auth.uid()));
create policy "preferiti: solo i miei (aggiunta)" on public.preferiti
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "preferiti: solo i miei (rimozione)" on public.preferiti
  for delete to authenticated using (user_id = (select auth.uid()));

/* ---------- Controlli all'invio: autore, nome pubblico, limiti giornalieri ---------- */

create or replace function private.prima_di_inviare()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_count int;
begin
  if v_uid is null then
    raise exception 'Serve l''accesso' using errcode = 'insufficient_privilege';
  end if;
  select nome_pubblico into v_nome from public.profiles where id = v_uid;
  if v_nome is null then
    raise exception 'Profilo mancante' using errcode = 'insufficient_privilege';
  end if;
  new.autore := v_uid;
  new.autore_nome := v_nome;
  new.created_at := now();

  if tg_table_name = 'proposte' then
    if new.tipo = 'nuovo' then
      new.place_id := null;      -- il luogo nasce solo con l'approvazione
    end if;
    select count(*) into v_count from public.proposte where autore = v_uid and created_at > now() - interval '1 day';
    if v_count >= 10 then
      raise exception 'Hai già inviato 10 proposte oggi: riprova domani' using errcode = 'check_violation';
    end if;
    if new.tipo = 'correzione' and not exists
        (select 1 from public.places where id = new.place_id and stato in ('pubblicato', 'in-revisione')) then
      raise exception 'Luogo non trovato' using errcode = 'foreign_key_violation';
    end if;
  else
    select count(*) into v_count from public.recensioni where autore = v_uid and created_at > now() - interval '1 day';
    if v_count >= 10 then
      raise exception 'Hai già scritto 10 recensioni oggi: riprova domani' using errcode = 'check_violation';
    end if;
    if new.data_visita > current_date then
      raise exception 'La data della visita non può essere nel futuro' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.places where id = new.place_id and stato in ('pubblicato', 'in-revisione')) then
      raise exception 'Luogo non trovato' using errcode = 'foreign_key_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proposte_prima on public.proposte;
create trigger proposte_prima before insert on public.proposte for each row execute function private.prima_di_inviare();
drop trigger if exists recensioni_prima on public.recensioni;
create trigger recensioni_prima before insert on public.recensioni for each row execute function private.prima_di_inviare();

-- Al massimo 500 preferiti a persona
create or replace function private.limite_preferiti()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.preferiti where user_id = new.user_id) >= 500 then
    raise exception 'Hai raggiunto il massimo di 500 preferiti' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists preferiti_limite on public.preferiti;
create trigger preferiti_limite before insert on public.preferiti for each row execute function private.limite_preferiti();

/* ---------- Moderazione (solo moderatori con 2FA) ---------- */

create or replace function private.slug(t text)
returns text language sql immutable set search_path = '' as $$
  select left(trim(both '-' from regexp_replace(
    translate(lower(t), 'àáâäãåèéêëìíîïòóôöõùúûüçñ''’', 'aaaaaaeeeeiiiiooooouuuucn  '),
    '[^a-z0-9]+', '-', 'g')), 100);
$$;

create or replace function private.richiedi_moderatore()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderatore() then
    raise exception 'Riservato ai moderatori con verifica in due passaggi' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Approva una proposta: crea la scheda (nuovo) o la aggiorna (correzione).
-- p_dati: la versione eventualmente corretta dal moderatore (null = quella inviata).
create or replace function public.approva_proposta(p_id uuid, p_livello text default 'community', p_dati jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  pr public.proposte;
  x jsonb;
  v_place uuid;
  v_slug text;
begin
  perform private.richiedi_moderatore();
  if p_livello not in ('sul-posto', 'community') then
    raise exception 'Livello di verifica non valido' using errcode = 'check_violation';
  end if;
  select * into pr from public.proposte where id = p_id for update;
  if not found or pr.stato <> 'in-attesa' then
    raise exception 'Proposta non trovata o già decisa' using errcode = 'no_data_found';
  end if;
  x := coalesce(p_dati, pr.dati);
  if not public.proposta_valida(x) then
    raise exception 'Dati della scheda non validi' using errcode = 'check_violation';
  end if;

  perform set_config('oa.proposta', pr.id::text, true);

  if pr.tipo = 'nuovo' then
    v_slug := private.slug((x ->> 'nome') || ' ' || (x ->> 'citta'));
    if v_slug = '' then v_slug := 'luogo'; end if;
    if exists (select 1 from public.places where slug = v_slug) then
      v_slug := left(v_slug, 90) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;
    insert into public.places (slug, nome, categoria, indirizzo, cap, citta, provincia, regione, lat, lng, descrizione,
                               misure, facoltativi, dettagli, verifica_livello, verifica_data, stato)
    values (v_slug, btrim(x ->> 'nome'), x ->> 'categoria', btrim(x ->> 'indirizzo'), x ->> 'cap', btrim(x ->> 'citta'),
            x ->> 'provincia', x ->> 'regione', (x ->> 'lat')::double precision, (x ->> 'lng')::double precision,
            nullif(btrim(coalesce(x ->> 'descrizione', '')), ''),
            x -> 'misure', coalesce(x -> 'facoltativi', '{}'), coalesce(x -> 'dettagli', '{}'),
            p_livello, current_date, 'pubblicato')
    returning id into v_place;
  else
    update public.places set
      nome = btrim(x ->> 'nome'), categoria = x ->> 'categoria', indirizzo = btrim(x ->> 'indirizzo'),
      cap = x ->> 'cap', citta = btrim(x ->> 'citta'), provincia = x ->> 'provincia', regione = x ->> 'regione',
      lat = (x ->> 'lat')::double precision, lng = (x ->> 'lng')::double precision,
      descrizione = nullif(btrim(coalesce(x ->> 'descrizione', '')), ''),
      misure = x -> 'misure', facoltativi = coalesce(x -> 'facoltativi', '{}'), dettagli = coalesce(x -> 'dettagli', '{}'),
      verifica_livello = p_livello, verifica_data = current_date, stato = 'pubblicato', esempio = false
    where id = pr.place_id
    returning id into v_place;
    if v_place is null then
      raise exception 'Il luogo non esiste più' using errcode = 'no_data_found';
    end if;
  end if;

  update public.proposte
     set stato = 'approvata', dati = x, place_id = coalesce(place_id, v_place),
         moderatore = auth.uid(), deciso_at = now()
   where id = pr.id;
  return v_place;
end;
$$;

create or replace function public.respingi_proposta(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.richiedi_moderatore();
  update public.proposte
     set stato = 'respinta', motivo = left(nullif(btrim(p_motivo), ''), 500), moderatore = auth.uid(), deciso_at = now()
   where id = p_id and stato = 'in-attesa';
  if not found then
    raise exception 'Proposta non trovata o già decisa' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.modera_recensione(p_id uuid, p_stato text, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.richiedi_moderatore();
  if p_stato not in ('pubblicata', 'respinta') then
    raise exception 'Stato non valido' using errcode = 'check_violation';
  end if;
  update public.recensioni
     set stato = p_stato, motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 500), moderatore = auth.uid(), deciso_at = now()
   where id = p_id;
  if not found then
    raise exception 'Recensione non trovata' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Segnalazioni in conflitto → "in revisione"; luogo chiuso → "archiviato"
create or replace function public.stato_luogo(p_id uuid, p_stato text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.richiedi_moderatore();
  if p_stato not in ('pubblicato', 'in-revisione', 'archiviato') then
    raise exception 'Stato non valido' using errcode = 'check_violation';
  end if;
  update public.places set stato = p_stato where id = p_id;
  if not found then
    raise exception 'Luogo non trovato' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Solo un admin (con 2FA) nomina verificatori e admin
create or replace function public.imposta_ruolo(p_email text, p_ruolo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_moderatore() and (select ruolo from public.profiles where id = auth.uid()) = 'admin') then
    raise exception 'Riservato agli admin con verifica in due passaggi' using errcode = 'insufficient_privilege';
  end if;
  if p_ruolo not in ('utente', 'verificatore', 'admin') then
    raise exception 'Ruolo non valido' using errcode = 'check_violation';
  end if;
  update public.profiles set ruolo = p_ruolo
   where id = (select id from auth.users where lower(email) = lower(btrim(p_email)));
  if not found then
    raise exception 'Nessun utente con questa email' using errcode = 'no_data_found';
  end if;
end;
$$;

/* ---------- I miei dati (GDPR): esporta ed elimina ---------- */

create or replace function public.i_miei_dati()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'esportato_il', now(),
    'account', (select jsonb_build_object('email', u.email, 'creato_il', u.created_at) from auth.users u where u.id = auth.uid()),
    'profilo', (select to_jsonb(p) - 'id' from public.profiles p where p.id = auth.uid()),
    'proposte', coalesce((select jsonb_agg(to_jsonb(x) - 'autore' - 'moderatore' order by x.created_at desc)
                            from public.proposte x where x.autore = auth.uid()), '[]'::jsonb),
    'recensioni', coalesce((select jsonb_agg(to_jsonb(r) - 'autore' - 'moderatore' order by r.created_at desc)
                              from public.recensioni r where r.autore = auth.uid()), '[]'::jsonb),
    'preferiti', coalesce((select jsonb_agg(jsonb_build_object('place_id', f.place_id, 'created_at', f.created_at) order by f.created_at desc)
                             from public.preferiti f where f.user_id = auth.uid()), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

-- Elimina l'account: profilo, recensioni e preferiti spariscono; le proposte già approvate
-- restano nello storico delle schede ma senza collegamento alla persona.
create or replace function public.elimina_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Serve l''accesso' using errcode = 'insufficient_privilege';
  end if;
  delete from public.proposte where autore = v_uid and stato = 'in-attesa';
  update public.proposte set autore_nome = 'Utente eliminato' where autore = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

/* ---------- Permessi sulle funzioni ---------- */

revoke all on function public.oa_num(jsonb, numeric, numeric), public.oa_bool(jsonb), public.oa_enum(jsonb, text[]),
  public.oa_text(jsonb, int), public.oa_obj(jsonb, text[]), public.scheda_valida(jsonb, jsonb, jsonb),
  public.proposta_valida(jsonb), public.is_moderatore(), public.approva_proposta(uuid, text, jsonb),
  public.respingi_proposta(uuid, text), public.modera_recensione(uuid, text, text), public.stato_luogo(uuid, text),
  public.imposta_ruolo(text, text), public.i_miei_dati(), public.elimina_account()
  from public, anon, authenticated;

-- Le funzioni di validazione servono ai vincoli quando un utente invia una proposta
grant execute on function public.oa_num(jsonb, numeric, numeric), public.oa_bool(jsonb), public.oa_enum(jsonb, text[]),
  public.oa_text(jsonb, int), public.oa_obj(jsonb, text[]), public.scheda_valida(jsonb, jsonb, jsonb),
  public.proposta_valida(jsonb)
  to authenticated;
-- is_moderatore è usata nelle policy di lettura, anche per chi non è registrato (risponde sempre false)
grant execute on function public.is_moderatore() to anon, authenticated;
grant execute on function public.approva_proposta(uuid, text, jsonb), public.respingi_proposta(uuid, text),
  public.modera_recensione(uuid, text, text), public.stato_luogo(uuid, text), public.imposta_ruolo(text, text),
  public.i_miei_dati(), public.elimina_account()
  to authenticated;

revoke all on function private.nuovo_profilo(), private.registra_storico(), private.prima_di_inviare(),
  private.limite_preferiti(), private.slug(text), private.richiedi_moderatore()
  from public, anon, authenticated;
