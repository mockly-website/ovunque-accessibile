-- Ovunque Accessibile – segnalazioni più affidabili (24 ottobre 2026)
--
-- 1. La pendenza della rampa si può descrivere a parole: misure.ingresso.rampa_pendenza = lieve | media | ripida
--    (rampa_pct, in %, resta per le misure prese sul posto).
-- 2. scheda_plausibile: una segnalazione deve dire almeno quanti gradini ci sono e rispondere a una domanda
--    tra spazi, piani e bagno, con valori realistici (porta 40–300 cm, rampa fino al 30%, gradino fino a 50 cm…).
--    Un trigger la controlla all'invio e all'approvazione (anche con i dati corretti dal moderatore).
-- Da eseguire nel SQL Editor dopo 20261024000000_app.sql e 20261024010000_foto.sql.

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

-- Scheda minima e valori realistici: valgono per le nuove segnalazioni e per le approvazioni.
-- Le schede già pubblicate seguono solo scheda_valida (limiti larghi), così restano modificabili.
create or replace function public.scheda_plausibile(m jsonb, f jsonb, d jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  i jsonb := m -> 'ingresso'; s jsonb := m -> 'spazi'; p jsonb := m -> 'piani'; b jsonb := m -> 'bagno';
  park jsonb := f -> 'parcheggio';
begin
  -- almeno il numero di gradini e una risposta tra spazi, piani e bagno
  if jsonb_typeof(i -> 'gradini') is distinct from 'number' then return false; end if;
  if coalesce(jsonb_typeof(s -> 'valore'), 'null') = 'null' and coalesce(jsonb_typeof(p -> 'valore'), 'null') = 'null'
     and coalesce(jsonb_typeof(b -> 'valore'), 'null') = 'null' then return false; end if;

  if not (public.oa_num(i -> 'gradini', 0, 100) and public.oa_num(i -> 'gradino_cm', 1, 50)
      and public.oa_num(i -> 'rampa_pct', 0, 30)
      and (public.oa_num(i -> 'porta_cm', 40, 300) or (i ->> 'porta_cm') = '0')
      and public.oa_num(b -> 'rotazione_cm', 50, 400)) then return false; end if;
  if jsonb_typeof(p -> 'ascensore_cm') = 'array'
     and not (public.oa_num(p -> 'ascensore_cm' -> 0, 50, 400) and public.oa_num(p -> 'ascensore_cm' -> 1, 50, 400)) then
    return false;
  end if;
  if jsonb_typeof(park) = 'object' and not public.oa_num(park -> 'distanza_m', 0, 2000) then return false; end if;

  return public.oa_num(d -> 'tavoli_cm', 40, 130) and public.oa_num(d -> 'camere_accessibili', 0, 500)
     and public.oa_num(d -> 'posti_carrozzina', 0, 500) and public.oa_num(d -> 'preavviso_ore', 0, 168);
end;
$$;

-- Il controllo vale quando una segnalazione arriva e quando viene approvata (anche con i dati corretti dal
-- moderatore). Non è un vincolo della tabella: le segnalazioni già decise restano modificabili (es. l'autore
-- anonimizzato quando chi le ha scritte elimina l'account).
create or replace function private.proposta_plausibile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or (new.stato = 'approvata' and old.stato is distinct from 'approvata'))
     and not public.scheda_plausibile(new.dati -> 'misure', coalesce(new.dati -> 'facoltativi', '{}'), coalesce(new.dati -> 'dettagli', '{}')) then
    raise exception 'Segnalazione incompleta o con valori impossibili: servono il numero di gradini, una risposta su spazi, piani o bagno e misure realistiche'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists proposte_plausibile on public.proposte;
create trigger proposte_plausibile before insert or update of stato, dati on public.proposte
  for each row execute function private.proposta_plausibile();

revoke all on function public.scheda_plausibile(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.scheda_plausibile(jsonb, jsonb, jsonb) to authenticated;
revoke all on function private.proposta_plausibile() from public, anon, authenticated;
