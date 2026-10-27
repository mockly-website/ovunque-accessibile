# Brief – Web-app e Supabase (24 ottobre 2026)

## Fatto
- **Web-app** in `app/`, installabile sul telefono (PWA). Pagine: mappa, scheda luogo, accedi, registrati, password dimenticata, segnala un luogo, profilo, moderazione, privacy.
- **Collegata a Supabase** (progetto «ovunque accessibile» di Mockly). La **modalità prova** resta per chi sviluppa: finché `app/assets/js/config.js` è vuoto, l'app usa i luoghi di esempio e account finti salvati nel browser. Si entra con «Entra come utente di prova» o «Entra come moderatore di prova»; come codice 2FA va bene qualsiasi numero di 6 cifre.
- **Stesse regole del sito**: soglie e giudizi stanno in `assets/js/oa-core.js`, usato da sito e app.
- **Database Supabase** pronto in `supabase/migrations/20261024000000_app.sql`:
  - tabelle: profili, schede, proposte, recensioni, preferiti, storico delle modifiche;
  - regole di accesso (RLS) e moderazione riservata a verificatori e admin (senza 2FA dal 27 ottobre, su richiesta dei titolari);
  - limiti giornalieri, esportazione dei propri dati ed eliminazione dell'account.
- **Esempi per il database**: `supabase/seed.sql` contiene i 18 luoghi di esempio (tutti accessibili almeno in parte per qualcuno).
- **Prove automatiche**: `sh supabase/tests/esegui.sh` usa un Postgres locale e passano tutte. axe dà 0 violazioni su tutte le pagine dell'app, su telefono e computer, senza scorrimento orizzontale.
- **Guida passo passo** in `DOCUMENTAZIONE.md`, sezione «Configurare Supabase».

## Cosa può fare chi usa l'app
- Guardare mappa e schede senza account.
- Con l'account:
  - salvare i preferiti;
  - scrivere recensioni (escono dopo la moderazione);
  - segnalare luoghi nuovi o correzioni, con misure (rampa descritta a parole), posizione trovata dall'indirizzo e **fino a 5 foto** (GPS tolto, descrizione obbligatoria per chi non vede, pubbliche solo dopo l'approvazione);
  - seguire lo stato delle proprie segnalazioni nel profilo;
  - scaricare i propri dati ed eliminare l'account.
- Moderatori (verificatori e admin):
  - confronto «Ora / Proposto», anteprima dei giudizi e foto da controllare (si può escluderne una);
  - approvare («community» o «verificato sul posto») o respingere con motivo;
  - moderare le recensioni;
  - mettere una scheda in revisione o archiviarla.

## Da fare (servono i titolari)
1. **Creare il progetto Supabase**, regione Francoforte (lo fanno loro, con la loro password).
2. **Eseguire le tre migrazioni** (`app.sql`, `foto.sql`, `segnalazioni.sql`) e il seed nel SQL Editor.
3. **Impostare l'accesso**: conferma email, password minima di 10 caratteri, URL di redirect.
4. **Collegare l'app**: copiare URL e chiave *publishable* in `config.js`.
5. **Nominare gli admin**: Angelo e Lorenzo si registrano, poi diventano admin con una riga SQL.
6. **SMTP proprio** (es. Brevo) prima del lancio.
7. **Logo** in alta risoluzione per le icone dell'app.
8. **Rileggere la privacy** dell'app (bozza) con il consulente.

## Dopo
Pulizia dei file delle foto respinte · pagine statiche per Google · MapTiler · APK Android (TWA) · Termini d'uso e Dichiarazione di accessibilità.

## Provarla ora
- Su GitHub Pages, dopo il push: sito https://mockly-website.github.io/ovunque-accessibile/ e web-app https://mockly-website.github.io/ovunque-accessibile/app/
- Dal computer: http://localhost:8091/app/
- Dal telefono, sulla stessa rete Wi-Fi: http://192.168.1.12:8091/app/
