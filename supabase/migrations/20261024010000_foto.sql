-- Ovunque Accessibile – foto delle segnalazioni (Supabase Storage + tabella public.foto)
--
-- Le foto si caricano insieme a una proposta (nuovo luogo o correzione), nella cartella dell'autore
-- del bucket privato "foto": <id utente>/<id casuale>.jpg. L'app le ricomprime nel browser, e così
-- toglie i dati EXIF (posizione GPS compresa) prima dell'invio.
-- Diventano visibili a tutti solo quando la proposta viene approvata (o un moderatore le pubblica);
-- fino ad allora le vedono solo l'autore e i moderatori. Si leggono con URL firmati a scadenza.
-- Ogni foto ha una descrizione obbligatoria (testo alternativo per chi non vede).

create table if not exists public.foto (
  id          uuid primary key default gen_random_uuid(),
  proposta_id uuid references public.proposte (id) on delete cascade,
  place_id    uuid references public.places (id) on delete cascade,
  autore      uuid default auth.uid() references auth.users (id) on delete cascade,
  autore_nome text not null default '',
  path        text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp)$'),
  alt         text not null check (char_length(btrim(alt)) between 5 and 200 and alt !~ '[[:cntrl:]]'),
  stato       text not null default 'in-attesa' check (stato in ('in-attesa', 'pubblicata', 'respinta')),
  created_at  timestamptz not null default now(),
  deciso_at   timestamptz
);

create index if not exists foto_place_idx on public.foto (place_id, created_at) where stato = 'pubblicata';
create index if not exists foto_proposta_idx on public.foto (proposta_id);
create index if not exists foto_autore_idx on public.foto (autore);

alter table public.foto enable row level security;
revoke all on table public.foto from public, anon, authenticated;
grant select (id, proposta_id, place_id, autore_nome, path, alt, stato, created_at) on table public.foto to anon, authenticated;
grant insert (proposta_id, path, alt) on table public.foto to authenticated;
grant delete on table public.foto to authenticated;

create policy "foto: pubblicate per tutti" on public.foto
  for select to anon, authenticated using (stato = 'pubblicata');
create policy "foto: le mie e, per i moderatori, tutte" on public.foto
  for select to authenticated using (autore = (select auth.uid()) or (select public.is_moderatore()));
create policy "foto: carico le mie" on public.foto
  for insert to authenticated
  with check (autore = (select auth.uid()) and split_part(path, '/', 1) = (select auth.uid())::text);
create policy "foto: cancello le mie" on public.foto
  for delete to authenticated using (autore = (select auth.uid()));

-- All'invio: autore, nome pubblico, proposta mia e in attesa, massimo 5 foto per proposta e 20 al giorno
create or replace function private.prima_della_foto()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Serve l''accesso' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.proposte where id = new.proposta_id and autore = v_uid and stato = 'in-attesa') then
    raise exception 'Le foto si aggiungono a una tua segnalazione in attesa' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.foto where proposta_id = new.proposta_id) >= 5 then
    raise exception 'Al massimo 5 foto per segnalazione' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.foto where autore = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Hai già caricato 20 foto oggi: riprova domani' using errcode = 'check_violation';
  end if;
  new.autore := v_uid;
  new.autore_nome := coalesce((select nome_pubblico from public.profiles where id = v_uid), '');
  new.place_id := null;
  new.stato := 'in-attesa';
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists foto_prima on public.foto;
create trigger foto_prima before insert on public.foto for each row execute function private.prima_della_foto();

-- Quando una proposta viene decisa, le sue foto seguono la stessa sorte
-- (quelle già escluse da un moderatore restano escluse)
create or replace function private.foto_dopo_decisione()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stato = 'approvata' then
    update public.foto set stato = 'pubblicata', place_id = new.place_id, deciso_at = now()
     where proposta_id = new.id and stato = 'in-attesa';
  elsif new.stato = 'respinta' then
    update public.foto set stato = 'respinta', deciso_at = now()
     where proposta_id = new.id and stato = 'in-attesa';
  end if;
  return new;
end;
$$;

drop trigger if exists proposte_foto on public.proposte;
create trigger proposte_foto after update of stato on public.proposte
  for each row when (old.stato is distinct from new.stato)
  execute function private.foto_dopo_decisione();

-- Un moderatore esclude (o ripubblica) una singola foto
create or replace function public.modera_foto(p_id uuid, p_stato text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.richiedi_moderatore();
  if p_stato not in ('pubblicata', 'respinta') then
    raise exception 'Stato non valido' using errcode = 'check_violation';
  end if;
  update public.foto f set stato = p_stato, deciso_at = now(),
         place_id = coalesce(f.place_id, (select p.place_id from public.proposte p where p.id = f.proposta_id))
   where f.id = p_id;
  if not found then
    raise exception 'Foto non trovata' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Export dei dati: ora con le foto
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
    'preferiti', coalesce((select jsonb_agg(jsonb_build_object('place_id', f.place_id, 'created_at', f.created_at) order by f.created_at desc)
                             from public.preferiti f where f.user_id = auth.uid()), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

revoke all on function public.modera_foto(uuid, text), public.i_miei_dati() from public, anon, authenticated;
grant execute on function public.modera_foto(uuid, text), public.i_miei_dati() to authenticated;
revoke all on function private.prima_della_foto(), private.foto_dopo_decisione() from public, anon, authenticated;

/* ---------- Storage: bucket privato "foto" ---------- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', false, 3145728, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "foto: carico nella mia cartella" on storage.objects;
drop policy if exists "foto: vedo pubblicate, mie o da moderare" on storage.objects;
drop policy if exists "foto: cancello le mie" on storage.objects;

create policy "foto: carico nella mia cartella" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'foto' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "foto: vedo pubblicate, mie o da moderare" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'foto' and (
    exists (select 1 from public.foto f where f.path = name and f.stato = 'pubblicata')
    or (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_moderatore())
  ));

create policy "foto: cancello le mie" on storage.objects
  for delete to authenticated
  using (bucket_id = 'foto' and (storage.foldername(name))[1] = (select auth.uid())::text);
