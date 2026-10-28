-- Ovunque Accessibile – i luoghi da OpenStreetMap passano dalla moderazione (28 ottobre 2026)
--
-- Decisione 3 («niente online senza approvazione») vale anche per gli import: i luoghi da OpenStreetMap entrano con
-- stato 'da-approvare', che il pubblico non vede (la policy di lettura mostra solo 'pubblicato' e 'in-revisione').
-- Nel pannello di moderazione «Luoghi da OpenStreetMap da approvare»: decidi_osm() li pubblica o li archivia.
-- Archiviati, non tornano con un nuovo import (stesso riferimento OSM). I 2.100 già importati tornano «da approvare».
-- Da eseguire nel SQL Editor dopo 20261028010000_import_osm.sql.

alter table public.places drop constraint if exists places_stato_check;
alter table public.places add constraint places_stato_check
  check (stato in ('pubblicato', 'in-revisione', 'archiviato', 'da-approvare'));

update public.places set stato = 'da-approvare' where verifica_livello = 'osm' and stato = 'pubblicato';

create or replace function public.importa_luoghi_osm(p_righe jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  n integer := 0;
  k integer;
begin
  if not (public.is_moderatore() and (select ruolo from public.profiles where id = auth.uid()) = 'admin') then
    raise exception 'Riservato agli admin' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) > 1000 then
    raise exception 'Al massimo 1000 luoghi per volta' using errcode = 'check_violation';
  end if;
  for r in select * from jsonb_array_elements(p_righe) loop
    if not public.oa_obj(r, array['slug', 'nome', 'categoria', 'indirizzo', 'cap', 'citta', 'provincia', 'regione', 'lat', 'lng', 'osm'])
       or (r ->> 'slug') !~ '^osm-(node|way|relation)-[0-9]{1,15}$'
       or jsonb_typeof(r -> 'osm') <> 'object' or (r -> 'osm' ->> 'wheelchair') is distinct from 'yes' then
      raise exception 'Riga non valida: %', left(r::text, 120) using errcode = 'check_violation';
    end if;
    insert into public.places (slug, nome, categoria, indirizzo, cap, citta, provincia, regione, lat, lng, misure,
                               verifica_livello, verifica_data, osm, stato)
    values (r ->> 'slug', btrim(r ->> 'nome'), r ->> 'categoria', btrim(r ->> 'indirizzo'), nullif(r ->> 'cap', ''),
            btrim(r ->> 'citta'), nullif(r ->> 'provincia', ''), nullif(r ->> 'regione', ''),
            (r ->> 'lat')::double precision, (r ->> 'lng')::double precision,
            '{"ingresso": {}, "spazi": {}, "piani": {}, "bagno": {}}', 'osm', current_date, r -> 'osm', 'da-approvare')
    on conflict do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;

-- Pubblica (p_approva = true) o archivia i luoghi da approvare indicati; al massimo 500 per volta.
create or replace function public.decidi_osm(p_ids uuid[], p_approva boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  perform private.richiedi_moderatore();
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'Da 1 a 500 luoghi per volta' using errcode = 'check_violation';
  end if;
  update public.places
     set stato = case when p_approva then 'pubblicato' else 'archiviato' end
   where id = any (p_ids) and stato = 'da-approvare';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.importa_luoghi_osm(jsonb), public.decidi_osm(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.importa_luoghi_osm(jsonb), public.decidi_osm(uuid[], boolean) to authenticated;
