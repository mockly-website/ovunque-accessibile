-- Ovunque Accessibile – più tipi di luogo (27 ottobre 2026)
--
-- Oltre a ristoranti e bar, musei, alloggi, spiagge, parchi, cultura, negozi e trasporti: salute, uffici e servizi,
-- sport, luoghi di culto, scuole e università, supermercati, bagni pubblici, svago (zoo, acquari, parchi divertimento).
-- L'elenco sta in un posto solo, oa_categorie(), usato dalla tabella places e da proposta_valida().
-- Da eseguire nel SQL Editor dopo 20261027010000_esigenze_avvisi_gestori.sql.

create or replace function public.oa_categorie()
returns text[] language sql immutable set search_path = '' as $$
  select array['ristorante', 'museo', 'hotel', 'spiaggia', 'parco', 'cultura', 'negozio', 'trasporti',
               'sanita', 'servizi', 'sport', 'culto', 'istruzione', 'supermercato', 'bagni', 'svago'];
$$;

alter table public.places drop constraint if exists places_categoria_check;
alter table public.places add constraint places_categoria_check check (categoria = any (public.oa_categorie()));

create or replace function public.proposta_valida(x jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select public.oa_obj(x, array['nome', 'categoria', 'indirizzo', 'cap', 'citta', 'provincia', 'regione',
           'lat', 'lng', 'descrizione', 'misure', 'facoltativi', 'dettagli'])
     and jsonb_typeof(x -> 'nome') = 'string' and char_length(btrim(x ->> 'nome')) between 2 and 120
     and public.oa_text(x -> 'nome', 120)
     and public.oa_enum(x -> 'categoria', public.oa_categorie())
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

revoke all on function public.oa_categorie() from public, anon, authenticated;
grant execute on function public.oa_categorie() to authenticated;
