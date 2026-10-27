-- Ovunque Accessibile – moderazione senza verifica in due passaggi (27 ottobre 2026)
--
-- Decisione dei titolari: per moderare bastano il ruolo (verificatore o admin) e la password.
-- Prima serviva anche il token aal2 (codice TOTP). Chi ha già collegato un'app di autenticazione
-- può tenerla: non dà fastidio e non viene più chiesta dal pannello.
-- Da eseguire nel SQL Editor dopo le migrazioni del 24 ottobre.

create or replace function public.is_moderatore()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.ruolo in ('verificatore', 'admin') from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function private.richiedi_moderatore()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderatore() then
    raise exception 'Riservato ai moderatori' using errcode = 'insufficient_privilege';
  end if;
end;
$$;
