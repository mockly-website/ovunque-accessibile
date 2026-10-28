-- Ovunque Accessibile – import dei luoghi da OpenStreetMap dall'app (28 ottobre 2026)
--
-- I file SQL di supabase/strumenti/import_osm.py per le grandi città sono troppo lunghi per il SQL Editor.
-- importa_luoghi_osm() riceve le stesse righe in JSON (import_osm.py --json) e le inserisce come schede «da verificare».
-- Solo un admin può chiamarla. Ogni riga passa gli stessi controlli della tabella (tipo, coordinate, osm_valido…);
-- i luoghi già presenti (stesso riferimento OSM o stesso slug) si saltano. Restituisce quante schede sono state create.
-- Da eseguire nel SQL Editor dopo 20261028000000_verifiche.sql.

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
                               verifica_livello, verifica_data, osm)
    values (r ->> 'slug', btrim(r ->> 'nome'), r ->> 'categoria', btrim(r ->> 'indirizzo'), nullif(r ->> 'cap', ''),
            btrim(r ->> 'citta'), nullif(r ->> 'provincia', ''), nullif(r ->> 'regione', ''),
            (r ->> 'lat')::double precision, (r ->> 'lng')::double precision,
            '{"ingresso": {}, "spazi": {}, "piani": {}, "bagno": {}}', 'osm', current_date, r -> 'osm')
    on conflict do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;

revoke all on function public.importa_luoghi_osm(jsonb) from public, anon, authenticated;
grant execute on function public.importa_luoghi_osm(jsonb) to authenticated;
