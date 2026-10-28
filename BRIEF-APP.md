# Brief – Web-app e Supabase (24 ottobre 2026)

## Fatto
- **Web-app** in `app/`, installabile sul telefono (PWA). Pagine: mappa, scheda luogo, accedi, registrati, password dimenticata, segnala un luogo, profilo, moderazione, privacy.
- **Collegata a Supabase** (progetto «ovunque accessibile» di Mockly). La **modalità prova** resta per chi sviluppa: finché `app/assets/js/config.js` è vuoto, l'app usa i luoghi di esempio e account finti salvati nel browser. Si entra con «Entra come utente di prova» o «Entra come moderatore di prova».
- **Stesse regole del sito**: soglie e giudizi stanno in `assets/js/oa-core.js`, usato da sito e app.
- **Database Supabase** pronto in `supabase/migrations/20261024000000_app.sql`:
  - tabelle: profili, schede, proposte, recensioni, preferiti, storico delle modifiche;
  - regole di accesso (RLS) e moderazione riservata a verificatori e admin (senza 2FA dal 27 ottobre, su richiesta dei titolari);
  - limiti giornalieri, esportazione dei propri dati ed eliminazione dell'account.
- **Esempi per il database**: `supabase/seed.sql` contiene i 18 luoghi di esempio (tutti accessibili almeno in parte per qualcuno).
- **Prove automatiche**: `sh supabase/tests/esegui.sh` usa un Postgres locale e passano tutte. axe dà 0 violazioni su tutte le pagine dell'app, su telefono e computer, senza scorrimento orizzontale.
- **Guida passo passo** in `DOCUMENTAZIONE.md`, sezione «Configurare Supabase».

## Cosa può fare chi usa l'app
- Guardare mappa e schede senza account, con i giudizi per sei esigenze: carrozzina manuale, carrozzina elettrica, difficoltà a camminare, persona anziana, disabilità visiva, disabilità uditiva.
- Trovare i **bagni accessibili vicino a sé**, con l'elenco in ordine di distanza.
- Vedere gli **avvisi di oggi** (ascensore guasto, lavori…) e il riepilogo «Cosa dicono i visitatori».
- Con l'account:
  - salvare i preferiti;
  - scrivere recensioni con **domande guidate** (sì / no) e, se si vuole, un testo (escono dopo la moderazione);
  - pubblicare un **avviso temporaneo** (si vede subito e scade da solo);
  - dalla pagina **«Per i locali»**, da gestori riconosciuti, chiedere la **verifica sul posto** del proprio locale;
  - chiedere di essere riconosciuti come **gestori** di un luogo: dopo l'approvazione si risponde alle recensioni e, per i luoghi verificati sul posto, si stampa il **bollino con il codice QR** per la vetrina;
  - segnalare luoghi nuovi o correzioni, con misure (rampa descritta a parole), posizione trovata dall'indirizzo e **fino a 5 foto** (GPS tolto, descrizione obbligatoria per chi non vede, pubbliche solo dopo l'approvazione);
  - seguire lo stato delle proprie segnalazioni nel profilo;
  - scaricare i propri dati ed eliminare l'account.
- Moderatori (verificatori e admin):
  - confronto «Ora / Proposto», anteprima dei giudizi e foto da controllare (si può escluderne una);
  - approvare («community» o «verificato sul posto») o respingere con motivo;
  - moderare le recensioni e le richieste dei gestori (si verifica il contatto del luogo prima di approvare);
  - organizzare le **verifiche sul posto** chieste dai gestori (data, poi «fatta»: la scheda diventa «Verificato sul posto»);
  - togliere avvisi e risposte non adatti;
  - mettere una scheda in revisione o archiviarla.

## Da fare (servono i titolari)
1. **Creare il progetto Supabase**, regione Francoforte (lo fanno loro, con la loro password).
2. **Eseguire le tre migrazioni** (`app.sql`, `foto.sql`, `segnalazioni.sql`) e il seed nel SQL Editor.
3. **Impostare l'accesso**: conferma email, password minima di 10 caratteri, URL di redirect.
4. **Collegare l'app**: copiare URL e chiave *publishable* in `config.js`.
5. **Nominare gli admin**: Angelo e Lorenzo si registrano, poi diventano admin con una riga SQL.
6. **SMTP proprio** (Brevo) prima del lancio: passi in `DOCUMENTAZIONE.md`, «Nuove funzioni».
7. **Confermare le regole** per persone anziane, vista e udito (e chiedere a UICI ed ENS).
8. **Scegliere i primi comuni** da importare da OpenStreetMap (schede «da verificare») e far confermare la licenza ODbL al consulente.
9. **Logo** in alta risoluzione per le icone dell'app.
10. **Rileggere la privacy** dell'app (bozza) con il consulente.

## Dopo
Pulizia dei file delle foto respinte · pagine statiche per Google · MapTiler · APK Android (TWA) · Termini d'uso e Dichiarazione di accessibilità.

## Provarla ora
- Su GitHub Pages, dopo il push: sito https://mockly-website.github.io/ovunque-accessibile/ e web-app https://mockly-website.github.io/ovunque-accessibile/app/
- Dal computer: http://localhost:8091/app/
- Dal telefono, sulla stessa rete Wi-Fi: http://192.168.1.12:8091/app/
