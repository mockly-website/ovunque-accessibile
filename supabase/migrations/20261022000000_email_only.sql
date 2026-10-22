-- Ovunque Accessibile – pagina "in arrivo": l'iscrizione chiede solo email e consenso.
-- Il nome diventa facoltativo; le altre colonne (role, city, place_note) restano per il sito
-- completo, ma la pagina attuale non le raccoglie (minimizzazione dei dati).

alter table private.subscribers alter column name drop not null;
alter table private.subscribers drop constraint if exists subscribers_name_check;
alter table private.subscribers add constraint subscribers_name_check
  check (name is null or char_length(name) between 1 and 100);

-- Stessa firma: un nome vuoto diventa NULL invece di violare il vincolo.
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
    (nullif(p_name, ''), lower(p_email), nullif(p_role, ''), nullif(p_city, ''), nullif(p_place_note, ''), now(), p_privacy_version)
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

-- create or replace mantiene i permessi, ma li riaffermiamo per sicurezza
revoke all on function private.subscribe(text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.subscribe(text, text, text, text, text, text) to form_writer;
