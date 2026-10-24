-- Prove delle regole di accesso. Eseguite da supabase/tests/esegui.sh su un Postgres locale.
-- Ogni blocco "do" fallisce (e ferma tutto) se una regola non si comporta come previsto.
-- Persone di prova: A e B utenti normali, M verificatrice (moderatrice).

\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''aaaaaaaa-0000-0000-0000-000000000002'''
\set M '''aaaaaaaa-0000-0000-0000-000000000003'''

-- 1. Registrazione: senza conferma dei 14 anni o senza privacy non si entra
do $$ begin
  begin
    insert into auth.users (email, raw_user_meta_data) values ('x@prova.it', '{"nome_pubblico":"X","privacy_version":"v1"}');
    raise exception 'DOVEVA FALLIRE: registrazione senza 14 anni';
  exception when others then if sqlerrm like 'DOVEVA%' then raise; end if; end;
  begin
    insert into auth.users (email, raw_user_meta_data) values ('y@prova.it', '{"nome_pubblico":"Ypsilon","eta_minima":true}');
    raise exception 'DOVEVA FALLIRE: registrazione senza privacy';
  exception when others then if sqlerrm like 'DOVEVA%' then raise; end if; end;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  (:A, 'a@prova.it', '{"nome_pubblico":"Anna","privacy_version":"app-v1","eta_minima":true}'),
  (:B, 'b@prova.it', '{"nome_pubblico":"Bruno","privacy_version":"app-v1","eta_minima":true}'),
  (:M, 'm@prova.it', '{"nome_pubblico":"Marta","privacy_version":"app-v1","eta_minima":true}');
update public.profiles set ruolo = 'verificatore' where id = :M;
update public.places set stato = 'archiviato' where slug = 'esempio-museo-roma';

do $$ begin
  assert (select count(*) from public.profiles) = 3, 'profili non creati alla registrazione';
  assert (select ruolo from public.profiles where nome_pubblico = 'Anna') = 'utente', 'ruolo predefinito';
end $$;

-- 2. Chi non è registrato
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  assert (select count(*) from public.places) = 18, 'anon deve vedere solo le 18 schede pubblicate';
  assert not exists (select 1 from public.places where stato = 'archiviato'), 'anon vede una scheda archiviata';
  begin
    perform 1 from public.profiles;
    raise exception 'DOVEVA FALLIRE: anon legge i profili';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.proposte (tipo, dati) values ('nuovo', '{}');
    raise exception 'DOVEVA FALLIRE: anon invia una proposta';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.storico_luoghi;
    raise exception 'DOVEVA FALLIRE: anon legge lo storico';
  exception when insufficient_privilege then null; end;
  begin
    update public.places set nome = 'Hackerato' where true;
    raise exception 'DOVEVA FALLIRE: anon modifica una scheda';
  exception when insufficient_privilege then null; end;
  begin
    perform public.approva_proposta(gen_random_uuid());
    raise exception 'DOVEVA FALLIRE: anon chiama approva_proposta';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 3. Utente A: profilo, proposta, recensione, preferiti
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
do $$
declare
  base jsonb;
  pid uuid;
begin
  assert (select count(*) from public.profiles) = 1, 'A deve vedere solo il proprio profilo';
  update public.profiles set esigenza = 'elettrica', nome_pubblico = 'Anna R.' where id = auth.uid();
  assert (select esigenza from public.profiles) = 'elettrica', 'A non riesce a cambiare esigenza';
  begin
    update public.profiles set ruolo = 'admin' where id = auth.uid();
    raise exception 'DOVEVA FALLIRE: A si promuove admin';
  exception when insufficient_privilege then null; end;

  select jsonb_build_object('nome', 'Bar di prova', 'categoria', 'ristorante', 'indirizzo', 'Via Prova 2', 'cap', '00100',
           'citta', 'Roma', 'provincia', 'RM', 'regione', 'Lazio', 'lat', 41.9, 'lng', 12.5, 'descrizione', null,
           'misure', misure, 'facoltativi', facoltativi, 'dettagli', dettagli)
    into base from public.places where slug = 'esempio-trattoria-roma';
  assert base is not null, 'scheda di partenza mancante';

  insert into public.proposte (tipo, dati, nota) values ('nuovo', base, 'Ci sono stata ieri');
  assert (select autore_nome from public.proposte limit 1) = 'Anna R.', 'nome pubblico non copiato';
  assert (select stato from public.proposte limit 1) = 'in-attesa', 'stato iniziale';

  begin
    insert into public.proposte (tipo, dati, stato) values ('nuovo', base, 'approvata');
    raise exception 'DOVEVA FALLIRE: A si approva da sola';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.proposte (tipo, dati) values ('nuovo', jsonb_set(base, '{misure,ingresso,gradini}', '"tanti"'));
    raise exception 'DOVEVA FALLIRE: misura non numerica';
  exception when check_violation then null; end;
  begin
    insert into public.proposte (tipo, dati) values ('nuovo', base || '{"script":"<script>"}');
    raise exception 'DOVEVA FALLIRE: campo sconosciuto';
  exception when check_violation then null; end;
  begin
    insert into public.proposte (tipo, dati) values ('nuovo', jsonb_set(base, '{lat}', '60'));
    raise exception 'DOVEVA FALLIRE: coordinate fuori Italia';
  exception when check_violation then null; end;
  begin
    perform public.approva_proposta((select id from public.proposte limit 1));
    raise exception 'DOVEVA FALLIRE: A approva';
  exception when insufficient_privilege then null; end;

  select id into pid from public.places where slug = 'esempio-trattoria-roma';
  insert into public.recensioni (place_id, esigenza, testo, data_visita)
    values (pid, 'elettrica', 'Gradino all''ingresso, ma il personale ha portato la pedana.', current_date - 3);
  begin
    insert into public.recensioni (place_id, esigenza, testo) values (pid, 'manuale', 'Troppo corta');
    raise exception 'DOVEVA FALLIRE: recensione troppo corta';
  exception when check_violation then null; end;
  begin
    insert into public.recensioni (place_id, esigenza, testo, data_visita)
      values (pid, 'manuale', 'Recensione di una visita che non è ancora avvenuta.', current_date + 5);
    raise exception 'DOVEVA FALLIRE: visita nel futuro';
  exception when check_violation then null; end;

  insert into public.preferiti (place_id) values (pid);
  assert (select count(*) from public.preferiti) = 1, 'preferito non salvato';
  assert jsonb_array_length(public.i_miei_dati() -> 'proposte') = 1, 'export: proposte';
  assert jsonb_array_length(public.i_miei_dati() -> 'recensioni') = 1, 'export: recensioni';
  assert (public.i_miei_dati() -> 'account' ->> 'email') = 'a@prova.it', 'export: email';
end $$;
reset role;

-- 4. Utente B non vede nulla di A; la recensione in attesa non è pubblica
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.proposte) = 0, 'B vede le proposte di A';
  assert (select count(*) from public.recensioni) = 0, 'B vede una recensione non approvata';
  assert (select count(*) from public.preferiti) = 0, 'B vede i preferiti di A';
  delete from public.proposte where true;
  delete from public.preferiti where true;
  begin
    perform autore from public.recensioni;
    raise exception 'DOVEVA FALLIRE: B legge l''id dell''autore';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.proposte) = 1, 'B ha cancellato una proposta di A';
  assert (select count(*) from public.preferiti) = 1, 'B ha cancellato un preferito di A';
end $$;

-- 5. Verificatrice M senza 2FA: è come un utente normale
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.proposte) = 0, 'moderatrice senza 2FA vede le proposte';
  begin
    perform public.approva_proposta(gen_random_uuid());
    raise exception 'DOVEVA FALLIRE: approvazione senza 2FA';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 6. Verificatrice M con 2FA: approva, modera, mette in revisione
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
do $$
declare
  prop uuid;
  nuovo uuid;
  rec uuid;
begin
  assert (select count(*) from public.proposte where stato = 'in-attesa') = 1, 'la moderatrice non vede le proposte';
  assert (select count(*) from public.places) = 19, 'la moderatrice deve vedere anche le archiviate';
  select id into prop from public.proposte limit 1;
  nuovo := public.approva_proposta(prop, 'sul-posto');
  assert (select slug from public.places where id = nuovo) = 'bar-di-prova-roma', 'slug della nuova scheda';
  assert (select verifica_livello from public.places where id = nuovo) = 'sul-posto', 'livello di verifica';
  assert (select stato from public.proposte where id = prop) = 'approvata', 'proposta non segnata come approvata';
  assert (select proposta_id from public.storico_luoghi where place_id = nuovo) = prop, 'storico senza proposta';
  begin
    perform public.approva_proposta(prop);
    raise exception 'DOVEVA FALLIRE: proposta approvata due volte';
  exception when no_data_found then null; end;

  select id into rec from public.recensioni limit 1;
  perform public.modera_recensione(rec, 'pubblicata');
  perform public.stato_luogo((select id from public.places where slug = 'esempio-hotel-napoli'), 'in-revisione');
  begin
    perform public.imposta_ruolo('b@prova.it', 'admin');
    raise exception 'DOVEVA FALLIRE: una verificatrice nomina un admin';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 7. Di nuovo anonimo: vede la nuova scheda, la recensione approvata e la scheda in revisione
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  assert (select count(*) from public.places) = 19, 'anon: 18 + 1 nuova';
  assert exists (select 1 from public.places where slug = 'bar-di-prova-roma'), 'anon non vede la scheda approvata';
  assert (select stato from public.places where slug = 'esempio-hotel-napoli') = 'in-revisione', 'scheda in revisione visibile';
  assert (select autore_nome from public.recensioni) = 'Anna R.', 'anon non vede la recensione approvata';
end $$;
reset role;

-- 8. Correzione di una scheda esistente da parte di B, approvata da M
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
do $$
declare
  p public.places;
  x jsonb;
begin
  select * into p from public.places where slug = 'esempio-trattoria-roma';
  x := jsonb_build_object('nome', p.nome, 'categoria', p.categoria, 'indirizzo', p.indirizzo, 'cap', p.cap,
         'citta', p.citta, 'provincia', p.provincia, 'regione', p.regione, 'lat', p.lat, 'lng', p.lng,
         'descrizione', p.descrizione, 'misure', jsonb_set(p.misure, '{ingresso,rampa}', 'true'),
         'facoltativi', p.facoltativi, 'dettagli', p.dettagli);
  insert into public.proposte (tipo, place_id, dati) values ('correzione', p.id, x);
  begin
    insert into public.proposte (tipo, dati) values ('correzione', x);
    raise exception 'DOVEVA FALLIRE: correzione senza luogo';
  exception when check_violation or foreign_key_violation then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
do $$ begin
  perform public.approva_proposta((select id from public.proposte where tipo = 'correzione'));
  assert (select (misure -> 'ingresso' ->> 'rampa')::boolean from public.places where slug = 'esempio-trattoria-roma'), 'correzione non applicata';
  assert (select esempio from public.places where slug = 'esempio-trattoria-roma') = false, 'scheda corretta ancora "esempio"';
  assert (select count(*) from public.storico_luoghi where azione = 'modificata') >= 2, 'storico delle modifiche';
end $$;
reset role;

-- 9. Limite giornaliero e cancellazione dell'account
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
do $$
declare
  base jsonb := (select dati from public.proposte limit 1);
begin
  for i in 1..9 loop
    insert into public.proposte (tipo, dati) values ('nuovo', base);
  end loop;
  begin
    insert into public.proposte (tipo, dati) values ('nuovo', base);
    raise exception 'DOVEVA FALLIRE: undicesima proposta del giorno';
  exception when check_violation then null; end;
  perform public.elimina_account();
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where email = 'a@prova.it'), 'account non eliminato';
  assert not exists (select 1 from public.profiles where nome_pubblico = 'Anna R.'), 'profilo non eliminato';
  assert not exists (select 1 from public.recensioni), 'recensioni non eliminate';
  assert not exists (select 1 from public.preferiti), 'preferiti non eliminati';
  assert not exists (select 1 from public.proposte where stato = 'in-attesa' and autore_nome = 'Anna R.'), 'proposte in attesa non eliminate';
  assert (select autore_nome from public.proposte where tipo = 'nuovo' and stato = 'approvata') = 'Utente eliminato', 'proposta approvata non anonimizzata';
end $$;

-- 10. I dati come li manda il modulo «Segnala un luogo» dell'app (null espliciti, voci facoltative assenti)
do $$ begin
  assert public.proposta_valida('{"cap": null, "categoria": "ristorante", "citta": "Torino", "descrizione": null,
    "dettagli": {"tavoli_cm": 75}, "facoltativi": {}, "indirizzo": "Via Nuova 3", "lat": 45.0703, "lng": 7.6869,
    "misure": {"bagno": {"maniglioni": true, "nota": null, "rotazione_cm": 150, "valore": "attrezzato"},
      "ingresso": {"corrimano": null, "gradini": 1, "gradino_cm": 3, "nota": null, "nota_porta": null, "porta_cm": 85, "rampa": false, "rampa_pct": null},
      "piani": {"ascensore_cm": [100, 130], "corrimano_scale": null, "nota": null, "valore": "ascensore"},
      "spazi": {"nota": null, "valore": "tutti"}},
    "nome": "Gelateria di prova", "provincia": "TO", "regione": "Piemonte"}'::jsonb), 'dati del modulo dell''app rifiutati';
end $$;

-- 11. Foto: B segnala un luogo con una foto; resta privata finché M non approva
\set PB '''aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000001.jpg'''
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
do $$
declare
  base jsonb := (select dati from public.proposte where tipo = 'correzione' limit 1);
  prop uuid;
begin
  insert into public.proposte (tipo, dati) values ('nuovo', jsonb_set(base, '{nome}', '"Bar con foto"')) returning id into prop;
  insert into storage.objects (bucket_id, name) values ('foto', 'aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000001.jpg');
  insert into public.foto (proposta_id, path, alt) values (prop, 'aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000001.jpg', 'Rampa davanti all''ingresso');
  begin
    insert into storage.objects (bucket_id, name) values ('foto', 'aaaaaaaa-0000-0000-0000-000000000003/bbbbbbbb-0000-0000-0000-000000000002.jpg');
    raise exception 'DOVEVA FALLIRE: carico nella cartella di un altro';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.foto (proposta_id, path, alt) values (prop, 'aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000003.jpg', 'no');
    raise exception 'DOVEVA FALLIRE: descrizione troppo corta';
  exception when check_violation then null; end;
  begin
    insert into public.foto (proposta_id, path, alt) values ((select id from public.proposte where tipo = 'correzione' limit 1),
      'aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000004.jpg', 'Foto su proposta già decisa');
    raise exception 'DOVEVA FALLIRE: foto su una proposta già approvata';
  exception when check_violation then null; end;
  assert (select count(*) from public.foto) = 1, 'B non vede la propria foto';
  assert (select count(*) from storage.objects) = 1, 'B non vede il proprio file';
  assert jsonb_array_length(public.i_miei_dati() -> 'foto') = 1, 'export: foto';
end $$;
reset role;

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  assert (select count(*) from public.foto) = 0, 'anon vede una foto in attesa';
  assert (select count(*) from storage.objects) = 0, 'anon vede un file in attesa';
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
do $$
declare
  nuovo uuid;
begin
  assert (select count(*) from storage.objects) = 1, 'la moderatrice non vede il file da controllare';
  nuovo := public.approva_proposta((select id from public.proposte where dati ->> 'nome' = 'Bar con foto'));
  assert (select place_id from public.foto limit 1) = nuovo, 'foto non collegata alla nuova scheda';
end $$;
reset role;

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  assert (select alt from public.foto where stato = 'pubblicata') = 'Rampa davanti all''ingresso', 'anon non vede la foto approvata';
  assert (select count(*) from storage.objects) = 1, 'anon non vede il file approvato';
  begin
    perform autore from public.foto;
    raise exception 'DOVEVA FALLIRE: anon legge l''autore della foto';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
