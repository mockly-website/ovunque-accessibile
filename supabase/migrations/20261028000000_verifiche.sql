-- Ovunque Accessibile – richieste di verifica sul posto dei locali (28 ottobre 2026)
--
-- Il gestore riconosciuto di un luogo (tabella gestori, stato 'approvato') chiede che veniamo a verificare il luogo
-- e dice quando si può passare. I moderatori vedono le richieste con il contatto del gestore e le segnano:
--   'fissata'   → il sopralluogo ha una data (scritta nella risposta);
--   'fatta'     → il sopralluogo è fatto: la scheda diventa «Verificato sul posto» con la data di oggi
--                 (le misure si correggono prima, con una proposta di correzione approvata come al solito);
--   'respinta'  → non si può fare (motivo nella risposta).
-- Una sola richiesta aperta (in attesa o fissata) per luogo. Il gestore vede le sue richieste e la risposta.
-- In più: i controlli «niente caratteri di controllo» su nome pubblico, descrizione delle foto, avvisi e contatti dei
-- gestori usano un intervallo esplicito invece di [[:cntrl:]], che con la lingua «C» del database rifiuta anche «ò», «’», «–».
-- Da eseguire nel SQL Editor dopo 20261027020000_tipi_di_luogo.sql.

create table if not exists public.verifiche (
  id            uuid primary key default gen_random_uuid(),
  place_id      uuid not null references public.places (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome          text not null default '',
  disponibilita text not null check (char_length(btrim(disponibilita)) between 3 and 300 and disponibilita !~ '[\x00-\x1F\x7F]'),
  nota          text check (char_length(nota) <= 500 and nota !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  stato         text not null default 'in-attesa' check (stato in ('in-attesa', 'fissata', 'fatta', 'respinta')),
  risposta      text check (char_length(risposta) <= 500),
  moderatore    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  deciso_at     timestamptz
);

-- [[:cntrl:]] dipende dalla lingua del database: con «C» scarta anche lettere accentate e «–». Intervallo esplicito.
alter table public.avvisi drop constraint if exists avvisi_testo_check;
alter table public.avvisi add constraint avvisi_testo_check check (char_length(testo) <= 300 and testo !~ '[\x00-\x1F\x7F]');
alter table public.profiles drop constraint if exists profiles_nome_pubblico_check;
alter table public.profiles add constraint profiles_nome_pubblico_check
  check (char_length(btrim(nome_pubblico)) between 2 and 40 and nome_pubblico !~ '[\x00-\x1F\x7F]');
alter table public.foto drop constraint if exists foto_alt_check;
alter table public.foto add constraint foto_alt_check check (char_length(btrim(alt)) between 5 and 200 and alt !~ '[\x00-\x1F\x7F]');
alter table public.gestori drop constraint if exists gestori_contatto_check;
alter table public.gestori add constraint gestori_contatto_check
  check (char_length(btrim(contatto)) between 5 and 200 and contatto !~ '[\x00-\x1F\x7F]');

create unique index if not exists verifiche_una_aperta_idx on public.verifiche (place_id) where stato in ('in-attesa', 'fissata');
create index if not exists verifiche_stato_idx on public.verifiche (stato, created_at);
create index if not exists verifiche_user_idx on public.verifiche (user_id);

alter table public.verifiche enable row level security;
revoke all on table public.verifiche from public, anon, authenticated;
grant select (id, place_id, nome, disponibilita, nota, stato, risposta, created_at, deciso_at) on table public.verifiche to authenticated;
grant insert (place_id, disponibilita, nota) on table public.verifiche to authenticated;
grant delete on table public.verifiche to authenticated;

create policy "verifiche: le mie e, per i moderatori, tutte" on public.verifiche
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_moderatore()));
create policy "verifiche: chiedo per i luoghi che gestisco" on public.verifiche
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "verifiche: ritiro le mie in attesa" on public.verifiche
  for delete to authenticated using (user_id = (select auth.uid()) and stato = 'in-attesa');

create or replace function private.prima_della_verifica()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Serve l''accesso' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.gestori where place_id = new.place_id and user_id = v_uid and stato = 'approvato') then
    raise exception 'La verifica sul posto la chiede il gestore riconosciuto del luogo' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.verifiche where place_id = new.place_id and stato in ('in-attesa', 'fissata')) then
    raise exception 'Per questo luogo c''è già una richiesta aperta' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.verifiche where user_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Hai già inviato 3 richieste oggi: riprova domani' using errcode = 'check_violation';
  end if;
  new.user_id := v_uid;
  new.nome := coalesce((select nome_pubblico from public.profiles where id = v_uid), '');
  new.disponibilita := btrim(new.disponibilita);
  new.nota := nullif(btrim(coalesce(new.nota, '')), '');
  new.stato := 'in-attesa';
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists verifiche_prima on public.verifiche;
create trigger verifiche_prima before insert on public.verifiche for each row execute function private.prima_della_verifica();

create or replace function public.decidi_verifica(p_id uuid, p_stato text, p_risposta text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.verifiche;
begin
  perform private.richiedi_moderatore();
  if p_stato not in ('fissata', 'fatta', 'respinta') then
    raise exception 'Stato non valido' using errcode = 'check_violation';
  end if;
  select * into v from public.verifiche where id = p_id and stato in ('in-attesa', 'fissata') for update;
  if not found then
    raise exception 'Richiesta non trovata o già chiusa' using errcode = 'no_data_found';
  end if;
  update public.verifiche
     set stato = p_stato, risposta = left(nullif(btrim(coalesce(p_risposta, '')), ''), 500), moderatore = auth.uid(), deciso_at = now()
   where id = p_id;
  if p_stato = 'fatta' then
    update public.places set verifica_livello = 'sul-posto', verifica_data = current_date where id = v.place_id;
  end if;
end;
$$;

/* I miei dati: anche le richieste di verifica */
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
    'foto', coalesce((select jsonb_agg(to_jsonb(f) - 'autore' order by f.created_at desc)
                        from public.foto f where f.autore = auth.uid()), '[]'::jsonb),
    'avvisi', coalesce((select jsonb_agg(to_jsonb(a) - 'autore' - 'chiuso_da' order by a.created_at desc)
                          from public.avvisi a where a.autore = auth.uid()), '[]'::jsonb),
    'gestore', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' - 'moderatore' order by g.created_at desc)
                           from public.gestori g where g.user_id = auth.uid()), '[]'::jsonb),
    'verifiche', coalesce((select jsonb_agg(to_jsonb(v) - 'user_id' - 'moderatore' order by v.created_at desc)
                             from public.verifiche v where v.user_id = auth.uid()), '[]'::jsonb),
    'preferiti', coalesce((select jsonb_agg(jsonb_build_object('place_id', f.place_id, 'created_at', f.created_at) order by f.created_at desc)
                             from public.preferiti f where f.user_id = auth.uid()), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

revoke all on function public.decidi_verifica(uuid, text, text), public.i_miei_dati() from public, anon, authenticated;
grant execute on function public.decidi_verifica(uuid, text, text), public.i_miei_dati() to authenticated;
revoke all on function private.prima_della_verifica() from public, anon, authenticated;
