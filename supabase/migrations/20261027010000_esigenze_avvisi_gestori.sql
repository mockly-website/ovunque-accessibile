-- Ovunque Accessibile – nuove esigenze, avvisi, recensioni guidate, gestori, luoghi da OpenStreetMap (27 ottobre 2026)
--
-- 1. Esigenze: oltre a carrozzina manuale, carrozzina elettrica e difficoltà a camminare, anche persone anziane,
--    disabilità visiva e disabilità uditiva (profilo e recensioni). Le schede hanno due voci facoltative nuove:
--    facoltativi.vista (cane guida, percorso tattile, Braille…) e facoltativi.udito (LIS, anello magnetico…).
-- 2. Avvisi temporanei (ascensore guasto, rampa bloccata, lavori…): li scrive chi è registrato e si vedono subito,
--    perché servono in giornata. Scadono da soli (al massimo dopo 30 giorni); li chiude chi li ha scritti
--    («risolto») o un moderatore («rimosso»).
-- 3. Recensioni con domande guidate (risposte: sì / no): il testo diventa facoltativo se si risponde ad almeno una.
-- 4. Gestori: chi gestisce un luogo chiede di essere riconosciuto, un moderatore controlla il contatto e approva.
--    Il gestore approvato risponde alle recensioni del suo luogo (la risposta si vede subito, i moderatori la tolgono).
-- 5. Luoghi importati da OpenStreetMap: verifica_livello = 'osm' («da verificare») e colonna osm con i tag di origine.
--    L'import si fa con supabase/strumenti/import_osm.py, dal SQL Editor (vedi DOCUMENTAZIONE.md).
-- Da eseguire nel SQL Editor dopo le migrazioni precedenti.

/* ---------- 1. Esigenze e voci per vista e udito ---------- */

alter table public.profiles drop constraint if exists profiles_esigenza_check;
alter table public.profiles add constraint profiles_esigenza_check
  check (esigenza in ('manuale', 'elettrica', 'cammino', 'anziani', 'vista', 'udito'));
alter table public.recensioni drop constraint if exists recensioni_esigenza_check;
alter table public.recensioni add constraint recensioni_esigenza_check
  check (esigenza in ('manuale', 'elettrica', 'cammino', 'anziani', 'vista', 'udito'));

-- Oggetto facoltativo (assente, null o con sole chiavi ammesse, tutte sì/no tranne la nota)
create or replace function public.oa_flags(v jsonb, allowed text[])
returns boolean language sql immutable set search_path = '' as $$
  select v is null or jsonb_typeof(v) = 'null'
      or (public.oa_obj(v, allowed || array['nota'])
          and public.oa_text(v -> 'nota', 500)
          and not exists (select 1 from jsonb_each(v) e where e.key <> 'nota' and jsonb_typeof(e.value) not in ('null', 'boolean')));
$$;

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

  if not (public.oa_obj(i, array['gradini', 'gradino_cm', 'rampa', 'rampa_pct', 'rampa_pendenza', 'corrimano', 'porta_cm', 'nota', 'nota_porta'])
      and public.oa_num(i -> 'gradini', 0, 200) and public.oa_num(i -> 'gradino_cm', 0, 100)
      and public.oa_bool(i -> 'rampa') and public.oa_num(i -> 'rampa_pct', 0, 50)
      and public.oa_enum(i -> 'rampa_pendenza', array['lieve', 'media', 'ripida'])
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

  if not (public.oa_obj(f, array['porta_tipo', 'pavimento', 'sedute', 'parcheggio', 'assistenza', 'vista', 'udito'])
      and public.oa_enum(f -> 'porta_tipo', array['automatica', 'manuale', 'pesante'])
      and public.oa_enum(f -> 'pavimento', array['liscio', 'irregolare', 'ghiaia'])
      and public.oa_bool(f -> 'sedute')
      and public.oa_flags(f -> 'vista', array['cane_guida', 'percorso_tattile', 'mappa_tattile', 'braille', 'grandi_caratteri',
                                              'contrasto', 'audioguida', 'accompagnamento'])
      and public.oa_flags(f -> 'udito', array['lis', 'scritto', 'anello', 'sottotitoli', 'avvisi_visivi'])) then return false; end if;
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

/* ---------- 5. Luoghi da OpenStreetMap ---------- */

alter table public.places drop constraint if exists places_verifica_livello_check;
alter table public.places add constraint places_verifica_livello_check
  check (verifica_livello in ('sul-posto', 'community', 'osm'));

-- Tag di origine: ref (es. node/123), wheelchair, toilets_wheelchair, data dell'import. Solo per i luoghi importati.
create or replace function public.osm_valido(o jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select o is null or (public.oa_obj(o, array['ref', 'wheelchair', 'toilets_wheelchair', 'importato'])
     and (o ->> 'ref') ~ '^(node|way|relation)/[0-9]{1,15}$'
     and public.oa_enum(o -> 'wheelchair', array['yes', 'limited', 'no'])
     and public.oa_enum(o -> 'toilets_wheelchair', array['yes', 'limited', 'no'])
     and (o -> 'importato' is null or (o ->> 'importato') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'));
$$;

alter table public.places add column if not exists osm jsonb;
alter table public.places drop constraint if exists places_osm_valido;
alter table public.places add constraint places_osm_valido check (public.osm_valido(osm));
create unique index if not exists places_osm_ref_idx on public.places ((osm ->> 'ref')) where osm is not null;

/* ---------- 2. Avvisi temporanei ---------- */

create table if not exists public.avvisi (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references public.places (id) on delete cascade,
  autore      uuid default auth.uid() references auth.users (id) on delete cascade,
  autore_nome text not null default '',
  tipo        text not null check (tipo in ('ascensore', 'rampa', 'bagno', 'ingresso', 'lavori', 'altro')),
  testo       text check (char_length(testo) <= 300 and testo !~ '[[:cntrl:]]'),
  scade_il    date not null default (current_date + 7),
  stato       text not null default 'attivo' check (stato in ('attivo', 'risolto', 'rimosso')),
  chiuso_da   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  chiuso_at   timestamptz
);

create index if not exists avvisi_place_idx on public.avvisi (place_id, scade_il) where stato = 'attivo';
create index if not exists avvisi_autore_idx on public.avvisi (autore);

alter table public.avvisi enable row level security;
revoke all on table public.avvisi from public, anon, authenticated;
grant select (id, place_id, autore_nome, tipo, testo, scade_il, stato, created_at, chiuso_at) on table public.avvisi to anon, authenticated;
grant insert (place_id, tipo, testo, scade_il) on table public.avvisi to authenticated;

create policy "avvisi: quelli attivi per tutti" on public.avvisi
  for select to anon, authenticated using (stato = 'attivo' and scade_il >= current_date);
create policy "avvisi: i miei e, per i moderatori, tutti" on public.avvisi
  for select to authenticated using (autore = (select auth.uid()) or (select public.is_moderatore()));
create policy "avvisi: scrivo i miei" on public.avvisi
  for insert to authenticated with check (autore = (select auth.uid()));

-- All'invio: autore, nome pubblico, durata da oggi a 30 giorni, al massimo 5 avvisi al giorno e 5 attivi per luogo
create or replace function private.prima_dell_avviso()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Serve l''accesso' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.places where id = new.place_id and stato in ('pubblicato', 'in-revisione')) then
    raise exception 'Luogo non trovato' using errcode = 'foreign_key_violation';
  end if;
  if new.scade_il is null then new.scade_il := current_date + 7; end if;
  if new.scade_il < current_date or new.scade_il > current_date + 30 then
    raise exception 'Un avviso dura da oggi a un massimo di 30 giorni' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.avvisi where autore = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Hai già scritto 5 avvisi oggi: riprova domani' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.avvisi where place_id = new.place_id and stato = 'attivo' and scade_il >= current_date) >= 5 then
    raise exception 'Questo luogo ha già 5 avvisi attivi' using errcode = 'check_violation';
  end if;
  new.autore := v_uid;
  new.autore_nome := coalesce((select nome_pubblico from public.profiles where id = v_uid), '');
  new.testo := nullif(btrim(coalesce(new.testo, '')), '');
  new.stato := 'attivo';
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists avvisi_prima on public.avvisi;
create trigger avvisi_prima before insert on public.avvisi for each row execute function private.prima_dell_avviso();

-- Chi l'ha scritto lo segna «risolto»; un moderatore lo segna «risolto» o lo toglie («rimosso»)
create or replace function public.chiudi_avviso(p_id uuid, p_stato text default 'risolto')
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.avvisi;
begin
  if auth.uid() is null then
    raise exception 'Serve l''accesso' using errcode = 'insufficient_privilege';
  end if;
  if p_stato not in ('risolto', 'rimosso') then
    raise exception 'Stato non valido' using errcode = 'check_violation';
  end if;
  select * into a from public.avvisi where id = p_id and stato = 'attivo' for update;
  if not found then
    raise exception 'Avviso non trovato o già chiuso' using errcode = 'no_data_found';
  end if;
  if not (public.is_moderatore() or (a.autore = auth.uid() and p_stato = 'risolto')) then
    raise exception 'Solo chi ha scritto l''avviso o un moderatore può chiuderlo' using errcode = 'insufficient_privilege';
  end if;
  update public.avvisi set stato = p_stato, chiuso_da = auth.uid(), chiuso_at = now() where id = p_id;
end;
$$;

-- Quali avvisi attivi di un luogo ho scritto io (per il pulsante «Risolto»): l'id dell'autore resta privato
create or replace function public.avvisi_miei(p_place uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.avvisi where place_id = p_place and autore = auth.uid() and stato = 'attivo';
$$;

/* ---------- 3. Recensioni con domande guidate ---------- */

create or replace function public.risposte_valide(r jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(r) = 'object'
     and public.oa_obj(r, array['scheda_giusta', 'entrato', 'personale', 'bagno', 'tornerei'])
     and public.oa_enum(r -> 'scheda_giusta', array['si', 'no']) and public.oa_enum(r -> 'entrato', array['si', 'no'])
     and public.oa_enum(r -> 'personale', array['si', 'no']) and public.oa_enum(r -> 'bagno', array['si', 'no', 'non-usato'])
     and public.oa_enum(r -> 'tornerei', array['si', 'no']);
$$;

alter table public.recensioni add column if not exists risposte jsonb not null default '{}'::jsonb;
alter table public.recensioni drop constraint if exists recensioni_risposte_valide;
alter table public.recensioni add constraint recensioni_risposte_valide check (public.risposte_valide(risposte));
alter table public.recensioni alter column testo set default '';
alter table public.recensioni drop constraint if exists recensioni_testo_check;
alter table public.recensioni add constraint recensioni_testo_check check (
  char_length(btrim(testo)) between 20 and 2000
  or (btrim(testo) = '' and risposte <> '{}'::jsonb)
);

-- Risposta del gestore (o di un moderatore, per toglierla)
alter table public.recensioni add column if not exists risposta text;
alter table public.recensioni add column if not exists risposta_at timestamptz;
alter table public.recensioni drop constraint if exists recensioni_risposta_check;
alter table public.recensioni add constraint recensioni_risposta_check
  check (risposta is null or char_length(btrim(risposta)) between 2 and 1000);

grant select (risposte, risposta, risposta_at) on table public.recensioni to anon, authenticated;
grant insert (risposte) on table public.recensioni to authenticated;

/* ---------- 4. Gestori dei luoghi ---------- */

create table if not exists public.gestori (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references public.places (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome        text not null default '',
  ruolo       text not null check (ruolo in ('titolare', 'dipendente', 'altro')),
  contatto    text not null check (char_length(btrim(contatto)) between 5 and 200 and contatto !~ '[[:cntrl:]]'),
  nota        text check (char_length(nota) <= 500 and nota !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  stato       text not null default 'in-attesa' check (stato in ('in-attesa', 'approvato', 'respinto', 'revocato')),
  motivo      text check (char_length(motivo) <= 500),
  moderatore  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  deciso_at   timestamptz,
  unique (place_id, user_id)
);

create index if not exists gestori_stato_idx on public.gestori (stato, created_at);
create index if not exists gestori_user_idx on public.gestori (user_id);

alter table public.gestori enable row level security;
revoke all on table public.gestori from public, anon, authenticated;
grant select (id, place_id, nome, ruolo, contatto, nota, stato, motivo, created_at, deciso_at) on table public.gestori to authenticated;
grant insert (place_id, ruolo, contatto, nota) on table public.gestori to authenticated;
grant delete on table public.gestori to authenticated;

create policy "gestori: leggo le mie richieste, i moderatori tutte" on public.gestori
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_moderatore()));
create policy "gestori: chiedo per me" on public.gestori
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "gestori: ritiro le mie" on public.gestori
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function private.prima_del_gestore()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Serve l''accesso' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.places where id = new.place_id and stato in ('pubblicato', 'in-revisione')) then
    raise exception 'Luogo non trovato' using errcode = 'foreign_key_violation';
  end if;
  if (select count(*) from public.gestori where user_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Hai già inviato 3 richieste oggi: riprova domani' using errcode = 'check_violation';
  end if;
  new.user_id := v_uid;
  new.nome := coalesce((select nome_pubblico from public.profiles where id = v_uid), '');
  new.contatto := btrim(new.contatto);
  new.nota := nullif(btrim(coalesce(new.nota, '')), '');
  new.stato := 'in-attesa';
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists gestori_prima on public.gestori;
create trigger gestori_prima before insert on public.gestori for each row execute function private.prima_del_gestore();

create or replace function public.decidi_gestore(p_id uuid, p_stato text, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.richiedi_moderatore();
  if p_stato not in ('approvato', 'respinto', 'revocato') then
    raise exception 'Stato non valido' using errcode = 'check_violation';
  end if;
  update public.gestori
     set stato = p_stato, motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 500), moderatore = auth.uid(), deciso_at = now()
   where id = p_id and (stato = 'in-attesa' or (stato = 'approvato' and p_stato = 'revocato'));
  if not found then
    raise exception 'Richiesta non trovata o già decisa' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Il gestore approvato risponde a una recensione pubblicata del suo luogo; testo vuoto = toglie la risposta.
-- Un moderatore può solo togliere una risposta.
create or replace function public.rispondi_recensione(p_id uuid, p_testo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.recensioni;
  v_testo text := nullif(btrim(coalesce(p_testo, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Serve l''accesso' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.recensioni where id = p_id and stato = 'pubblicata' for update;
  if not found then
    raise exception 'Recensione non trovata' using errcode = 'no_data_found';
  end if;
  if not (exists (select 1 from public.gestori where place_id = r.place_id and user_id = auth.uid() and stato = 'approvato')
          or (public.is_moderatore() and v_testo is null)) then
    raise exception 'Solo il gestore del luogo può rispondere' using errcode = 'insufficient_privilege';
  end if;
  if v_testo is not null and v_testo ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'La risposta contiene caratteri non validi' using errcode = 'check_violation';
  end if;
  update public.recensioni set risposta = left(v_testo, 1000), risposta_at = case when v_testo is null then null else now() end
   where id = p_id;
end;
$$;

/* ---------- I miei dati: anche avvisi e richieste da gestore ---------- */

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
    'preferiti', coalesce((select jsonb_agg(jsonb_build_object('place_id', f.place_id, 'created_at', f.created_at) order by f.created_at desc)
                             from public.preferiti f where f.user_id = auth.uid()), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

/* ---------- Permessi sulle funzioni ---------- */

revoke all on function public.oa_flags(jsonb, text[]), public.osm_valido(jsonb), public.risposte_valide(jsonb),
  public.chiudi_avviso(uuid, text), public.avvisi_miei(uuid), public.decidi_gestore(uuid, text, text), public.rispondi_recensione(uuid, text),
  public.i_miei_dati()
  from public, anon, authenticated;
grant execute on function public.oa_flags(jsonb, text[]), public.osm_valido(jsonb), public.risposte_valide(jsonb) to authenticated;
grant execute on function public.chiudi_avviso(uuid, text), public.avvisi_miei(uuid), public.decidi_gestore(uuid, text, text),
  public.rispondi_recensione(uuid, text), public.i_miei_dati()
  to authenticated;
revoke all on function private.prima_dell_avviso(), private.prima_del_gestore() from public, anon, authenticated;
