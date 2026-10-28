# Ovunque Accessibile – sito e web-app

Sito definitivo (prototipo con luoghi di esempio) e web-app con account, preferiti, recensioni e segnalazioni con foto. Realizzati da Mockly.

- **Front-end**: HTML5, CSS3, JavaScript vanilla. Sito statico, nessun framework, nessun CDN, nessun tracker, nessun cookie. Font e librerie ospitati in `assets/`.
- **Dati della web-app**: Supabase (progetto «ovunque accessibile», UE), vedi «Web-app e database Supabase».
- **Demo online** (GitHub Pages, dal ramo `main`): sito https://mockly-website.github.io/ovunque-accessibile/ e web-app https://mockly-website.github.io/ovunque-accessibile/app/.
- **Pagina «in arrivo»**: resta online su https://ovunqueaccessibile.altervista.org/ ma non è più in questo repository. L'ultima versione è nel commit `8dfbc6c` e nella cartella `ovunque-altervista-upload/` sul Desktop.

## Struttura

```
├── index.html     home: ricerca, anteprima della mappa, come funziona, blocco app
├── mappa.html     mappa ed elenco con filtri
├── luogo.html     scheda del luogo
├── privacy.html   privacy del sito (bozza)
├── assets/        CSS, JS comune (oa-core.js), dati di esempio, font, immagini, Leaflet
├── app/           web-app (PWA): usa ../assets/ per stile, font e regole
└── supabase/      migrazioni, luoghi di esempio, prove automatiche
```

## Vedere sito e app in locale

```bash
cd "/Users/noahmelis/Desktop/PROGECT/OVUNQUE ACCESSIBILE" && /Applications/MAMP/bin/php/php8.4.17/bin/php -S 0.0.0.0:8091
```
Poi apri http://localhost:8091/ (sito) e http://localhost:8091/app/ (web-app). Dal telefono sulla stessa Wi-Fi usa l'indirizzo IP del Mac sulla porta 8091.

## Pubblicare

GitHub Pages pubblica da solo il ramo `main` a ogni push. Per un altro hosting (es. Altervista) si caricano `index.html`, `mappa.html`, `luogo.html`, `privacy.html`, `assets/` e `app/`; **non** `supabase/`, i file `.md` e `doc/`. Gli indirizzi della web-app vanno aggiunti in Supabase → Authentication → URL Configuration → Redirect URLs.

Dopo ogni modifica a CSS o JS aggiorna la versione `?v=` nei link delle pagine (e `VERSION` in `app/sw.js` per la web-app), così i browser non usano i file vecchi.

---

## Grafica e caricamento (27 ottobre 2026)

- **Tecnologia**: restiamo su HTML, CSS e JavaScript senza framework. Il sito va su hosting statico (Altervista) senza passaggi di compilazione, sito e app condividono lo stesso codice (`assets/js/oa-core.js`, `assets/css/sito.css`), le pagine pesano poco e restano veloci anche con connessioni lente, e l'accessibilità si controlla riga per riga. Un framework (React, Vue, Flutter…) servirebbe solo con un'app molto più grande o un team dedicato.
- **Schermata di caricamento**: `assets/js/intro.js` (nel `<head>`, senza `defer`) mette la classe `oa-intro` su `<html>` alla prima pagina della visita (una volta per il sito, una per l'app: `sessionStorage`); `sito.css` sezione 13 mostra `assets/img/intro.svg` (ragazzo in carrozzina che gira sulla pista intorno al segnaposto) e il nome. Dura almeno 1,4 s, al massimo 2,5 s. Con «riduci movimento» del sistema usa `intro-fermo.svg` e dura 0,5 s. È decorativa: per gli screen reader non esiste.
- **Solo luoghi accessibili**: mappa ed elenchi (sito e app) non mostrano i luoghi «non accessibili» per l'esigenza scelta (`visibile()` in `oa-core.js`); la scheda resta raggiungibile dal suo link. La legenda non ha più «Non accessibile». Nell'app non si può segnalare un luogo nuovo che non è accessibile, almeno in parte, per nessuna esigenza (vista e udito senza informazioni non contano); se una correzione lo rende tale, il pannello di moderazione lo dice prima dell'approvazione.
- **Telefono e tablet** (`sito.css` sezioni 14–15, `app.css` sezione 9): nella pagina mappa i pulsanti «Mappa / Elenco (n)» mostrano una vista alla volta e la mappa riempie lo schermo; «La tua esigenza» in due righe da tre (due colonne sotto i 352 px e nella colonna della mappa sul computer); ricerca a pillola con la lente; pulsanti della mappa solo icona (il testo resta per gli screen reader); giudizi della scheda in righe compatte. Nell'app: barra in basso che galleggia, schede più arrotondate, «Segnala» solo nella barra.

## Nuove funzioni (27 ottobre 2026, sera)

Scelte con il cliente dall'elenco di proposte: sì a 1, 3, 4, 5, 7, 8, 9; la segnalazione guidata con foto della misura (2) è rimandata; itinerari, APK con notifiche e inglese (10–12) dopo i primi test. Migrazione `supabase/migrations/20261027010000_esigenze_avvisi_gestori.sql` (applicata su Supabase il 27 ottobre), prove nella sezione 12 di `supabase/tests/rls.sql`.

- **Sei esigenze** (`oa-core.js`, sezione 2): carrozzina manuale, carrozzina elettrica, difficoltà a camminare, **persona anziana**, **disabilità visiva**, **disabilità uditiva**. Ogni esigenza ha le sue voci (`ESIGENZE[e].voci`) e le tre mostrate nelle card (`card`). Il selettore si chiama «La tua esigenza»; `?per=anziani|vista|udito` nei link.
  - *Persona anziana*: regole di «difficoltà a camminare» (gradini con corrimano, scale con corrimano, maniglioni) **più** «Sedute» lungo il percorso (`facoltativi.sedute`).
  - *Disabilità visiva*: voci «Cane guida» (ammesso ✓, non ammesso ✕ e il luogo sparisce dalla mappa per questa esigenza), «Orientarsi» (percorso tattile, mappa tattile, personale che accompagna), «Informazioni da leggere» (Braille, grandi caratteri, audioguida), «Gradini e ostacoli» (colori a contrasto). Dati in `facoltativi.vista`.
  - *Disabilità uditiva*: «Lingua dei segni» (personale che conosce la LIS), «Contatti senza telefono» (chat, email, SMS), «Ascolto e avvisi» (anello magnetico, sottotitoli, allarmi luminosi). Dati in `facoltativi.udito`.
  - Per vista e udito: ✓ se c'è almeno un aiuto, «in parte» se si sa solo che mancano, «da verificare» se non si sa niente. **Regole da confermare con Angelo e Lorenzo** e, per vista e udito, con UICI ed ENS.
  - Scheda: sezione «Vista e udito» (sito e app); nel modulo «Segnala» una tendina facoltativa «Vista e udito». Il percorso tattile prima stava nei dettagli di musei e parchi: ora è una voce di «Vista e udito» (il modulo lo sposta da solo alla prima correzione).
- **Avvisi temporanei** (solo app, tabella `avvisi`): «ascensore fuori servizio», «rampa non utilizzabile», «bagno fuori servizio», «ingresso accessibile chiuso», «lavori in corso», «altro», con dettagli fino a 300 caratteri e durata da oggi a 30 giorni. Li scrive chi è registrato e si vedono **subito** (servono in giornata), con il nome pubblico; scadono da soli. «È risolto» per chi l'ha scritto, «Togli l'avviso» per i moderatori (`chiudi_avviso`). Limiti: 5 al giorno a persona, 5 attivi per luogo. Le card della mappa mostrano «Avviso: …».
- **Bagni accessibili vicino a me**: link nella home del sito e nell'app (`?f=bagno&vicino=1#results`). Chiede la posizione (resta nel browser), filtra «Bagno accessibile» e ordina l'elenco per distanza («a 350 m»). Anche il pulsante «Vicino a me» sulla mappa ora ordina l'elenco.
- **Recensioni con domande guidate** (colonna `recensioni.risposte`): «Le informazioni della scheda erano giuste?», «Sei riuscito a entrare senza chiedere aiuto?», «Il personale è stato disponibile?», «Hai potuto usare il bagno?», «Ci torneresti?» (sì / no / non so). Il testo diventa facoltativo se si risponde ad almeno una domanda. Sopra le recensioni c'è il riepilogo «Cosa dicono i visitatori» (es. «Personale disponibile: sì per 4 su 5»). Se la scheda era sbagliata, dopo l'invio compare il link «proponi una correzione».
- **Gestori dei luoghi** (tabella `gestori`): nella scheda «Sei il titolare?» → ruolo e un contatto **del luogo** (telefono o email pubblici, li vedono solo i moderatori). Nel pannello di moderazione «Gestori dei luoghi»: si chiama o si scrive al contatto e si approva (`decidi_gestore`). Il gestore approvato risponde alle recensioni del suo luogo (`rispondi_recensione`: la risposta si vede subito, «Risposta del gestore»; un moderatore può toglierla). Per cambiare la scheda il gestore usa «Proponi una correzione» come tutti.
- **Bollino per la vetrina** (`app/bollino.html?id=…`): solo per i luoghi **verificati sul posto**, link visibile al gestore e ai moderatori. Logo, «Verificato sul posto da Ovunque Accessibile», nome, giudizi «accessibile» e «in parte», **codice QR** che apre la scheda nell'app (sempre aggiornata), data della verifica. «Stampa il bollino» stampa solo il bollino (13 cm). QR generato nel browser con `assets/vendor/qrcode/qrcode.js` (qrcode-generator 1.4.4 di Kazuhiko Arase, MIT, nessuna chiamata di rete); verificato con il lettore di codici del browser.
- **Luoghi da OpenStreetMap** (`supabase/strumenti/import_osm.py`): per un comune prende i luoghi con `wheelchair=yes`, nome e via, di tipo ristorante/bar, museo, alloggio, stabilimento balneare, parco, cultura, stazione o negozio. Nessuna misura inventata: misure vuote, `verifica_livello = 'osm'`, card «Da OpenStreetMap: da verificare», nella scheda «OpenStreetMap: accesso in carrozzina / bagno accessibile» e il link al luogo su openstreetmap.org. Un luogo già importato non si duplica.
  ```bash
  python3 supabase/strumenti/import_osm.py --comune "Cagliari" --regione Sardegna --provincia CA --anteprima
  python3 supabase/strumenti/import_osm.py --comune "Cagliari" --regione Sardegna --provincia CA
  ```
  Il secondo comando scrive `supabase/import/osm-cagliari.sql` (da incollare nel SQL Editor, va bene per i comuni piccoli) e `osm-cagliari.json`. Per le città grandi il SQL è troppo lungo per l'editor: si carica il JSON da **Moderazione → «Importa da OpenStreetMap»** (solo admin; funzione `importa_luoghi_osm`, migrazione `20261028010000_import_osm.sql`). Il comune lo trova Nominatim (capisce i nomi bilingui come «Casteddu/Cagliari»; con `--provincia` scarta gli omonimi), Overpass cerca i luoghi dentro i suoi confini (due server, riprova se sono pieni). Con `--limite` (predefinito 300) le schede si scelgono a rotazione tra i tipi, prima quelle con anche il bagno accessibile. La cartella `supabase/import/` non va nel repository (dati scaricati, si rigenerano). Per toglierli: `delete from public.places where verifica_livello = 'osm' and citta = 'Cagliari';`. Il server pubblico Overpass a volte è pieno: lo script riprova da solo (20 s, 60 s, 120 s). **Licenza**: i dati sono © contributori di OpenStreetMap, **ODbL**: va citata la fonte (fatto nella scheda) e la banca dati che li contiene, se la si distribuisce, resta ODbL (coerente con la decisione 9: schede come dati aperti ODbL). Da far confermare al consulente legale prima di importare in grande.
- **Mappe e punto sul telefono**: le mappe dentro pagine che scorrono (anteprima della home, scheda del luogo, «Dov'è l'ingresso?») si spostano con **due dita**; un dito fa scorrere la pagina e compare l'avviso «Usa due dita per spostare la mappa» (`createMap(…, { dueDita: true })` in `oa-core.js`, solo su schermi touch). La mappa della pagina «Mappa» resta con un dito. Nel modulo «Segnala»: da lontano il primo tocco **avvicina** la mappa (Italia → città → strada), da ingrandimento 15 in su mette il punto; toccando la mappa o trascinando il segnaposto (con un dito) l'app cerca l'indirizzo di quel punto (Nominatim *reverse*) e lo scrive se i campi sono vuoti, altrimenti propone «Usa questo indirizzo: …». «Trova l'indirizzo sulla mappa» prova la ricerca per campi, poi quella libera (piazze, lungomari, «n. 120»), poi la sola città, e completa CAP, provincia e regione; **Invio** nei campi dell'indirizzo cerca invece di inviare il modulo. Mentre si scrive, la barra in basso dell'app si nasconde (sul telefono saliva sopra la tastiera e copriva il campo). Provato sul simulatore iPhone.
- **Più tipi di luogo** (`supabase/migrations/20261027020000_tipi_di_luogo.sql`, applicata su Supabase il 28 ottobre): oltre agli 8 di prima, **Salute** (farmacie, ospedali, studi medici), **Uffici e servizi** (comune, poste, banche), **Sport**, **Luogo di culto**, **Scuola e università**, **Supermercato**, **Bagno pubblico**, **Svago** (zoo, acquari, parchi divertimento). L'elenco del database sta in `oa_categorie()`; nel codice in `CATEGORIE` e `ESEMPI_CATEGORIE` (`oa-core.js`): gli esempi compaiono nel modulo «Segnala» e valgono nella ricerca («farmacia» trova i luoghi «Salute»). Anche `import_osm.py` li riconosce (farmacie, ospedali, comuni, poste, banche, palestre, piscine, chiese, scuole, supermercati, zoo; i bagni pubblici senza nome diventano «Bagno pubblico»). Per aggiungerne altri: `oa_categorie()` in una nuova migrazione, `CATEGORIE` ed `ESEMPI_CATEGORIE`, le `<option>` del filtro in `mappa.html` e `app/index.html`.
- **Indirizzi suggeriti mentre si scrive** (modulo «Segnala»): dalla terza lettera della via compare l'elenco di **Photon** (komoot, Germania; Nominatim per regolamento non permette il completamento automatico). Si sceglie col dito o con frecce e Invio (combobox ARIA, annunciato agli screen reader): il segnaposto va sul civico. «Città» ora viene prima della via, così i suggerimenti sono di quella città. Photon pubblico è gratuito con uso ragionevole: con tanto traffico conviene un'istanza propria o il servizio di geocodifica del fornitore di mappe (es. MapTiler). CSP di `segnala.html` e privacy dell'app aggiornate.
- **CAP, provincia e regione dal punto**: ogni volta che il punto cambia (indirizzo scelto, ricerca, tocco, segnaposto trascinato, coordinate scritte) l'app chiede a Nominatim l'indirizzo del punto e **riscrive** CAP, sigla della provincia e regione, e lo dice nel messaggio sotto i pulsanti. Via e città invece si scrivono da sole solo se sono vuote (altrimenti «Usa questo indirizzo: …»). Nella correzione di una scheda il punto iniziale non cambia niente.
- **Per i locali e verifica sul posto** (`supabase/migrations/20261028000000_verifiche.sql`, applicata su Supabase il 28 ottobre; prove nella sezione 14 di `rls.sql`):
  - **Sito**: `locali.html` (voce «Per i locali» nel menu e nel piè di pagina, blocco «Hai un locale o un negozio?» nella home) spiega i 4 passi e porta all'app.
  - **App**: `app/locali.html` (link nel piè di pagina, nel profilo e nella scheda «Sei il titolare?»): i 4 passi e «I tuoi locali», con lo stato di ogni locale. Il gestore approvato preme «Richiedi la verifica sul posto», scrive quando si può passare (e note); vede «in attesa», poi la data scritta dal moderatore; può ritirare la richiesta finché è in attesa. Dopo la verifica: «Verificato sul posto il …» e il bollino.
  - **Moderazione**: sezione «Verifiche sul posto» con indirizzo, disponibilità e contatto del gestore. «Fissata» (serve scrivere data e ora: il gestore la vede), «Fatta: verificato sul posto» (`decidi_verifica` mette la scheda a `sul-posto` con la data di oggi; se le misure sono cambiate, prima si approva una correzione con «Correggi le misure»), «Non possibile» con il motivo.
  - Regole: chiede solo il gestore approvato del luogo, una richiesta aperta per luogo, 3 al giorno. Il bollino non è una certificazione di legge (scritto nelle pagine).
  - Nella stessa migrazione i controlli sui caratteri di nome pubblico, descrizioni delle foto, avvisi e contatti dei gestori usano un intervallo esplicito invece di `[[:cntrl:]]`: su Supabase (`en_US.UTF-8`) non cambia niente, ma ora anche le prove locali (lingua «C») accettano «ò», «’», «–».
- **Scheda più chiara** (28 ottobre): in cima **«In breve»** con il giudizio per l'esigenza scelta e le voci principali (ingresso, porta, piani, bagno, parcheggio; per vista e udito le loro voci); poi i giudizi per tutte le esigenze e «Le misure». Le informazioni facoltative sono in **«Altre informazioni»**, in tendine chiuse con il numero di informazioni presenti: «Vista e udito» (aperta da sola per chi ha scelto vista o udito), «Porta, pavimento, parcheggio e assistenza», dettagli per tipo di luogo (`renderSummary` e `contaNote` in `oa-core.js`, `sito.css` sezione 19).
- **Titolari più semplice** (28 ottobre): «Locali» è una voce della barra dell'app; ogni scheda ha il pulsante «Sei il titolare?» accanto alle indicazioni (apre la richiesta; per il gestore diventa «Il tuo locale»). La richiesta chiede solo il telefono o l'email del locale e il ruolo. La pagina «Per i locali» parte da «1. Trova il tuo locale» (cerca → «Gestisci»), poi «2. I tuoi locali» con completezza della scheda e «Completa la scheda»; «Come funziona» e i consigli pratici sono in tendine.
- **Luoghi reali caricati** (28 ottobre): 2.100 schede da OpenStreetMap (`wheelchair=yes`, con nome e via) in 11 città: Roma 300, Milano 300, Torino 300, Firenze 245, Bologna 238, Venezia 181, Palermo 147, Genova 141, Bari 135, Cagliari 69, Napoli 44. Sono «Da OpenStreetMap: da verificare»; nella scheda «In breve» mostra cosa dice OpenStreetMap (accesso in carrozzina, bagno) e invita a misurare. Per toglierle tutte: `delete from public.places where verifica_livello = 'osm';`. L'app legge i luoghi a pagine da 1000 (limite di Supabase per richiesta).
- **Niente più luoghi inventati** (28 ottobre): tolti da Supabase i 18 luoghi di esempio (`delete from public.places where esempio;`). Il **sito** ora legge le schede reali dal database (`assets/js/sito.js`: sola lettura con la chiave pubblica di `app/assets/js/config.js`, a pagine da 1000) e «Segnala una correzione» porta all'app. `assets/data/luoghi.json` (esempi inventati) resta solo per la modalità prova dell'app; `supabase/seed.sql` non va più eseguito sul progetto vero. La home mostra fra gli «ultimi verificati» solo le schede verificate (non quelle da OpenStreetMap).
- **Luoghi da OpenStreetMap in moderazione** (`supabase/migrations/20261028020000_osm_da_approvare.sql`, applicata il 28 ottobre): i luoghi importati entrano con stato `da-approvare`, che il pubblico non vede. Nel pannello di moderazione «Luoghi da OpenStreetMap da approvare»: filtro per città, 20 alla volta, link a OpenStreetMap e a Google Maps/Street View per controllarli, «Approva» o «Non approvare» uno per uno o per i selezionati (`decidi_osm`, al massimo 500 per volta). Approvati → sulla mappa come «da verificare»; non approvati → archiviati, e un nuovo import non li riporta. Lo script ora mette come città sempre il nome del comune (non `addr:city`, che a volte è una frazione o è bilingue) e importa anche le spiagge (`natural=beach`).
- **Email per tutti (SMTP con Brevo)**: da fare **dai titolari** (account e chiavi li creano e inseriscono loro):
  1. account gratuito su brevo.com con ovunqueaccessibile@gmail.com (300 email al giorno gratis);
  2. Brevo → *Senders, Domains & Dedicated IPs* → aggiungi e conferma il mittente ovunqueaccessibile@gmail.com (con un dominio proprio, più avanti, si autentica il dominio: arrivano meno email nello spam);
  3. Brevo → *SMTP & API* → *SMTP* → «Generate a new SMTP key»: copia login e chiave nel gestore di password;
  4. Supabase → *Authentication → Emails → SMTP Settings* → «Enable custom SMTP»: host `smtp-relay.brevo.com`, porta `587`, utente = login SMTP di Brevo, password = chiave SMTP, mittente ovunqueaccessibile@gmail.com, nome «Ovunque Accessibile»;
  5. Supabase → *Authentication → Rate Limits*: alza «email inviate all'ora» (es. 30);
  6. prova: registrazione con un indirizzo esterno a Mockly e conferma dell'email.

## Il sito – prototipo

Prima versione funzionante del sito definitivo, nella cartella principale. In locale: http://localhost:8091/ con il server `lan-preview`.

**Ruolo del sito**: parte informativa. Mappa, ricerca e schede dei luoghi. Il login, i preferiti e le segnalazioni stanno nell'app (web-app + APK Android), raggiungibile dal pulsante "Apri la web-app" (link relativo `app/`).

| Pagina | Cosa fa |
|---|---|
| `index.html` | Ricerca, ricerche rapide (ingresso, bagno, parcheggio), anteprima della mappa, come funziona, cosa c'è in ogni scheda, blocco app (web-app con il pulsante "Apri la web-app", APK ancora "In arrivo"), chi siamo |
| `mappa.html` | Ricerca per città/nome/tipo, filtri, elenco e mappa sincronizzati. I filtri finiscono nell'indirizzo (`?q=roma&f=bagno`), quindi una ricerca si può condividere |
| `luogo.html?id=…` | Scheda: indirizzo, "Indicazioni stradali" con scelta dell'app (Google Maps, Apple Mappe, Waze, OpenStreetMap; su Android anche "Altra app del telefono" con il link `geo:`), stato di ingresso, porta, interni, piani, bagno e parcheggio, data dell'ultima verifica, "Segnala una correzione" (email) |

- **Giudizi per esigenza** (decisione 1): `oa-core.js` (codice comune a sito e app; `sito.js` lo avvia), sezione 2 «Regole per esigenza». Le soglie sono tutte nell'oggetto `SOGLIE` (un numero cambiato lì aggiorna tutto il sito). Ogni voce (ingresso, porta, spazi, piani, bagno) dà ✓ / – / ✕ / ? / «non previsto» per carrozzina manuale, carrozzina elettrica e difficoltà a camminare; il giudizio complessivo segue le regole della tabella nelle Decisioni.
- **«La tua esigenza»** (prima «Come ti muovi?»): sulla pagina mappa e nella scheda. Alla prima visita il riquadro è evidenziato e i giudizi provvisori sono per la carrozzina manuale; la scelta resta nel browser (`localStorage`, chiave `oa-esigenza`, nessun cookie) e nell'indirizzo (`?per=manuale|elettrica|cammino|anziani|vista|udito`), quindi un link condiviso mostra gli stessi giudizi. Filtri «Solo luoghi accessibili», «Ingresso accessibile», «Bagno accessibile» calcolati per l'esigenza scelta.
- **Scheda** (decisione 2): tre giudizi affiancati; «Le misure» con descrizione e stato per ognuna delle tre esigenze; «Altre informazioni» (porta, pavimento, sedute, parcheggio, assistenza); dettagli per tipo di luogo; affidabilità («Verificato sul posto», «Segnalato dalla community», «Da ricontrollare» dopo 24 mesi).
- **Dati** (formato v2): misure in numeri (`gradini`, `gradino_cm`, `rampa_pct`, `porta_cm`, `ascensore_cm` [larghezza, profondità], `rotazione_cm`); `porta_cm: 0` = nessuna porta; `null` = non misurato. `facoltativi`, `dettagli` e `verifica {livello, data}`.
- **Dati**: `assets/data/luoghi.json`, **solo esempi inventati** (nomi "… di esempio", indirizzi "di Prova"). Ogni pagina mostra la striscia "Prototipo". Ogni caratteristica ha tre stati: `"si"`, `"no"`, `null` = non verificato (più `"parziale"`/`"rampa"`/… dove serve). È la stessa forma della futura tabella Supabase `places`.
- **Mappa**: Leaflet 1.9.4 e Leaflet.markercluster 1.5.3 ospitati in `assets/vendor/` (integrità dei pacchetti npm verificata, licenze BSD e MIT incluse). Sfondo attenuato con un filtro CSS; segnaposto con colore + simbolo del giudizio complessivo (accessibile, in parte, no, da verificare: calcolato da ingresso e spazi interni in `giudizio()` di `sito.js`), legenda sotto la mappa, luoghi vicini raggruppati in cerchi numerati, pulsanti "Vicino a me" (la posizione resta nel browser) e "Tutta Italia", "Mostra sulla mappa" su ogni card. Sfondo da `tile.openstreetmap.org`: è l'unica risorsa esterna e va citata nella privacy (il browser contatta i server di OpenStreetMap). Per il lancio, con molto traffico, conviene un fornitore di mappe dedicato in UE (le regole d'uso dei server OSM vietano l'uso intensivo).
- **Privacy del sito**: `privacy.html` (bozza), copre log dell'hosting, sfondo della mappa da OpenStreetMap, «Vicino a me» (posizione solo nel browser), app di navigazione e segnalazioni via email. Va completata con cognomi/città dei titolari e fornitori definitivi.
- **Senza JavaScript**: ogni pagina spiega che mappa e luoghi hanno bisogno di JavaScript e offre il contatto email; i messaggi «Caricamento…» compaiono solo con JavaScript attivo.
- **Accessibilità**: l'elenco è l'equivalente testuale della mappa; segnaposto e gruppi sono fuori dall'ordine di Tab nelle mappe con elenco (si usa «Mostra sulla mappa»), restano raggiungibili nella scheda del luogo; controlli di Leaflet tradotti («Avvicina», «Allontana», «Chiudi»), pulsante «Chiudi» del riquadro 44 × 44 px; stato sempre con icona + testo (+ prefisso per screen reader), mai solo colore; segnaposto raggiungibili con Tab; rotella del mouse che non "cattura" la pagina; axe 0 violazioni su tutte le pagine a 375 e 1280 px; nessuno scroll orizzontale anche a 320 px.
- **Sicurezza**: i testi dei luoghi entrano nella pagina solo con `textContent` (mai `innerHTML`), così i contenuti degli utenti non possono iniettare codice.

**Prossimi passi**: tabella `places` su Supabase con lettura pubblica solo dei luoghi approvati; pagina privacy del sito (tile OSM); link all'APK; dati reali raccolti da Angelo e Lorenzo.

---

## Decisioni per il sito definitivo (24 ottobre 2026)

| # | Tema | Decisione |
|---|---|---|
| 1 | **Giudizio** | Un giudizio per ogni esigenza: **carrozzina manuale**, **carrozzina elettrica**, **difficoltà a camminare**; dal 27 ottobre anche **persona anziana**, **disabilità visiva** e **disabilità uditiva** (vedi «Nuove funzioni»). Soglie iniziali proposte da Mockly (sotto), da far correggere ad Angelo e Lorenzo. Sulla mappa l'esigenza si sceglie alla prima visita («La tua esigenza») e resta salvata nel browser. |
| 2 | **Scheda** | Scheda **base obbligatoria** (ingresso, spazi interni, piani, bagno) + voci **facoltative** (tipo di porta, pavimento, sedute, parcheggio, assistenza) + **dettagli per tipo di luogo già al lancio** (tavoli, camere, passerelle, posti in sala, assistenza ai trasporti). Nota libera per ogni voce. Misure salvate come numeri (cm, gradini, %). |
| 3 | **Verifica** | Niente online senza approvazione. Approvano **Angelo e Lorenzo**, poi **verificatori di fiducia**. Livelli visibili: "Verificato sul posto" / "Segnalato dalla community". **Scadenza 24 mesi** → "Informazioni da ricontrollare". Segnalazioni in conflitto → scheda in revisione. GPS tolto dalle foto; regole per le recensioni e diritto di replica dei gestori. |
| 4 | **Mappe** | Fornitore europeo (es. **MapTiler**, Svizzera) per mappa e geocodifica, stile nei colori del sito, chiave limitata al dominio. In futuro possibile mappa ospitata (Protomaps). |
| 5 | **Supabase** | Regione UE. **Gratuito in sviluppo, Pro al lancio** (backup, niente pause). Vista pubblica solo dei contenuti approvati; segnalazioni in tabella "in attesa"; storico di ogni modifica. **Pannello di moderazione nostro**. Accesso all'app con **email e password** (password robuste e controllo di quelle rubate, conferma email e reset via SMTP proprio es. Brevo, limiti ai tentativi, 2FA obbligatoria per moderatori). |
| 6 | **Google** | **Pagine statiche generate a ogni approvazione** (`/luoghi/citta/nome`), con anteprime social, dati strutturati e sitemap. |
| 7 | **Hosting** | **Per ora Altervista**: pubblicazione automatica via FTP da GitHub (password FTP nei secrets di GitHub, inserita dai titolari). Header di sicurezza non disponibili su Altervista: già pronti per un hosting futuro. **Dominio da decidere** prima del lancio (`ovunqueaccessibile.it` e `.com` liberi al 24/10/2026). |
| 8 | **App** | **Un'unica web-app (PWA) + APK Android che la impacchetta (TWA)**: si aggiorna da sola. APK scaricabile dal sito, **Play Store più avanti**. Chiave di firma da custodire con backup. |
| 9 | **Legale** | Titolari: **Angelo e Lorenzo come persone** (servono cognomi e città). Schede dei luoghi come **dati aperti ODbL**; recensioni e foto restano degli autori (licenza d'uso a Ovunque Accessibile). Servono Privacy, **Termini d'uso** (con procedura di rimozione DSA) e Dichiarazione di accessibilità: bozze di Mockly, **rilette dal cliente e da un suo consulente legale**. |

### Soglie iniziali per esigenza (base DM 236/1989, da confermare)

| Voce | Carrozzina manuale | Carrozzina elettrica | Difficoltà a camminare |
|---|---|---|---|
| Ingresso ✓ | nessun gradino (≤ 2,5 cm) o rampa ≤ 8% | nessun gradino o rampa ≤ 8% | nessun gradino o ≤ 3 gradini con corrimano |
| Ingresso – | un gradino ≤ 5 cm o rampa ≤ 12% | rampa 8–12% | > 3 gradini con corrimano |
| Porta ✓ | ≥ 80 cm | ≥ 90 cm | ≥ 75 cm |
| Piani ✓ | un piano o ascensore ≥ 120 × 80 cm | un piano o ascensore ≥ 140 × 110 cm | ascensore o scale con corrimano |
| Bagno ✓ (dove previsto) | spazio di rotazione 150 cm + maniglioni | come manuale, 150 cm obbligatorio | maniglioni |
| In più | — | — | sedute, parcheggio entro 50 m |

**Persona anziana**: come «difficoltà a camminare», più la voce «Sedute» (✓ se ci sono, «in parte» se mancano). **Vista** e **udito**: vedi «Nuove funzioni».

Giudizio per esigenza: ✓ se tutte le voci sono ✓; ✕ se ingresso o spazi principali sono ✕; – negli altri casi; ? se mancano le misure dell'ingresso.

---

## Web-app (cartella `app/`) e database Supabase

**Cosa c'è**: una web-app installabile (PWA) con mappa, scheda del luogo, accesso, profilo, segnalazioni e pannello di moderazione. Usa lo stesso codice del sito per regole e giudizi (`assets/js/oa-core.js`, `window.OA`): una soglia cambiata vale per entrambi.

| Pagina | Cosa fa |
|---|---|
| `index.html` | Mappa ed elenco con «La tua esigenza», filtri e «Bagni accessibili vicino a me» (come il sito) |
| `luogo.html` | Scheda + **avvisi temporanei**, **Salva nei preferiti**, **Proponi una correzione**, recensioni approvate con riepilogo delle domande guidate, modulo «Racconta la tua visita», **«Sei il titolare?»** e risposte del gestore |
| `bollino.html` | Bollino «Verificato sul posto» da stampare, con il codice QR della scheda |
| `locali.html` | Per i locali: come funziona, i locali che gestisco, richiesta di verifica sul posto |
| `accedi.html`, `registrati.html`, `password.html` | Accesso con email e password; registrazione con nome pubblico, conferma 14 anni e privacy; password dimenticata |
| `segnala.html` | Nuovo luogo o correzione (`?id=`): misure base, posizione con «Trova l'indirizzo sulla mappa» (Nominatim di OpenStreetMap), tocco sulla mappa o coordinate, **fino a 5 foto** con descrizione obbligatoria. Le domande facoltative (CAP, provincia, regione, descrizione, note, «Altre informazioni», dettagli per tipo) sono in tendine da aprire. Rampa descritta a parole (lieve / media / ripida). Servono almeno il numero di gradini e una risposta tra spazi, piani e bagno; valori fuori misura bloccati, valori strani (porta sotto 60 cm, oltre 30 gradini…) da confermare; se il punto è a più di 25 km dalla città l'app chiede di controllare |
| `profilo.html` | Esigenza salvata nell'account, preferiti, stato delle proprie segnalazioni e recensioni, nome pubblico, password, **scarica i miei dati**, esci, **elimina l'account** |
| `moderazione.html` | Solo verificatori e admin (dal 27 ottobre senza verifica in due passaggi, decisione dei titolari): proposte con confronto «Ora / Proposto» e anteprima dei giudizi, approva (community o «verificato sul posto») o respingi con motivo; recensioni (con le risposte alle domande); richieste dei gestori; stato delle schede (pubblicata / in revisione / archiviata) |
| `privacy.html` | Bozza dell'informativa dell'app (versione `app-2026-10-v1`), da rileggere con il consulente |

**Modalità prova**: con `app/assets/js/config.js` vuoto l'app usa i luoghi di esempio e account finti salvati solo nel browser (pulsanti «Entra come utente / moderatore di prova»). Serve per rivedere grafica e flussi prima di Supabase.

**File**: `assets/js/api.js` (stesse funzioni per Supabase e per la prova), `assets/js/app.js` (pagine), `assets/css/app.css` (si aggiunge a `sito.css`; sul telefono la navigazione è una barra in basso), `manifest.webmanifest`, `sw.js` (pagine dalla rete, file statici in cache, **mai** in cache dati e accessi), `assets/vendor/supabase/` (supabase-js 2.117.3, integrità npm verificata, licenza MIT). CSP nelle pagine con `<meta>` (Altervista non applica gli header). Le icone 192/512 sono ingrandite dal logo 180 × 225: **serve il logo in alta risoluzione**.

### Database (`supabase/migrations/20261024000000_app.sql`)

- `profiles` (nome pubblico, esigenza, ruolo `utente` / `verificatore` / `admin`), creato alla registrazione: senza conferma dei 14 anni e della privacy la registrazione fallisce.
- `places`: schede; tutti leggono solo `pubblicato` e `in-revisione`; **nessuno scrive direttamente**, solo le funzioni di moderazione. `scheda_valida()` controlla ogni misura (tipi, intervalli, voci ammesse).
- `proposte` (nuovo luogo / correzione), `recensioni`, `preferiti`: ognuno vede e cancella solo i propri; limite 10 proposte e 10 recensioni al giorno, 500 preferiti. L'id dell'autore non è mai pubblico.
- `storico_luoghi`: ogni modifica alle schede, con la proposta che l'ha causata.
- **Foto** (`supabase/migrations/20261024010000_foto.sql`): bucket privato `foto` (max 3 MB, solo JPEG/WebP), ogni utente scrive solo in `<suo id>/`. L'app ricomprime le foto nel browser (lato lungo 1600 px): così sparisce la posizione GPS. Tabella `foto` con descrizione obbligatoria (testo alternativo, 5–200 caratteri), massimo 5 per segnalazione e 20 al giorno. Restano private finché la proposta non è approvata (allora diventano pubbliche con la scheda; se respinta, restano escluse); il moderatore può escluderne una singola (`modera_foto`). Si mostrano con URL firmati validi un'ora. Eliminando l'account l'app cancella anche i file.
- **Segnalazioni affidabili** (`supabase/migrations/20261024020000_segnalazioni.sql`): `misure.ingresso.rampa_pendenza` (`lieve` ≈ fino all'8%, `media` ≈ 8–12%, `ripida`; i giudizi la usano quando manca `rampa_pct`). `scheda_plausibile()` (numero di gradini, almeno una risposta su spazi/piani/bagno, porta 40–300 cm o 0, rampa ≤ 30%, gradino 1–50 cm, cabina e bagno 50–400 cm, parcheggio ≤ 2 km…) controllata da un trigger all'invio e all'approvazione; le schede già pubblicate restano con i limiti larghi di `scheda_valida()`.
- Funzioni: `approva_proposta`, `respingi_proposta`, `modera_recensione`, `stato_luogo`, `imposta_ruolo` (solo admin), `i_miei_dati` (export), `elimina_account`. Moderatore = ruolo `verificatore` o `admin` (`supabase/migrations/20261027000000_moderazione_senza_2fa.sql` ha tolto l'obbligo del token `aal2`).
- `supabase/seed.sql`: i 18 luoghi di esempio (`esempio = true`), rigenerabili con `python3 supabase/strumenti/seed_da_json.py`. Prima del lancio: `delete from public.places where esempio;`
- **Prove**: `sh supabase/tests/esegui.sh` avvia un Postgres locale usa e getta e verifica le regole (`supabase/tests/rls.sql`: anonimi, utenti, utenti normali e moderatori, limiti, eliminazione account).

### Stato attuale (24 ottobre 2026)

Progetto **«ovunque accessibile»** nell'organizzazione Supabase «OVVUNQUE ACCESSIBILE» dell'account Mockly, regione Central EU (Frankfurt), piano Free, URL `https://fzqibkvdpywgvlejzeks.supabase.co`. Fatti i passi 2–4 e 6–7 qui sotto: migrazioni `app.sql`, `foto.sql` e `segnalazioni.sql`, 18 luoghi di esempio (il 27 ottobre tolto quello non accessibile per nessuno), Site URL e Redirect URLs, password minima 10 con lettere e numeri, conferma email attiva, TOTP attivo, chiave publishable in `app/assets/js/config.js`. Demo su GitHub Pages (dal ramo `main`): sito https://mockly-website.github.io/ovunque-accessibile/ e web-app https://mockly-website.github.io/ovunque-accessibile/app/. Verificato dall'esterno con la chiave pubblica: si leggono solo le schede; profili, proposte, storico, scritture e funzioni di moderazione sono rifiutati.

**Ancora da fare**: SMTP proprio (passo 5: con il servizio email di Supabase le email di conferma arrivano solo agli indirizzi dei membri dell'organizzazione, quindi gli utenti esterni non riescono a registrarsi), nomina degli admin (passo 8), pubblicazione della cartella `app/` su Altervista.

### Configurare Supabase (da fare con i titolari: account e password li inseriscono loro)

1. Su supabase.com crea il progetto **Ovunque Accessibile**, regione **Central EU (Frankfurt)**, piano Free per ora. La password del database va nel gestore di password dei titolari, **mai** nel repository o in chat.
2. **SQL Editor** → incolla ed esegui, nell'ordine: `supabase/migrations/20261024000000_app.sql`, `supabase/migrations/20261024010000_foto.sql` (crea anche il bucket delle foto), `supabase/migrations/20261024020000_segnalazioni.sql`, `supabase/migrations/20261027000000_moderazione_senza_2fa.sql`, `supabase/migrations/20261027010000_esigenze_avvisi_gestori.sql`, `supabase/migrations/20261027020000_tipi_di_luogo.sql`, `supabase/migrations/20261028000000_verifiche.sql`, `supabase/migrations/20261028010000_import_osm.sql`, `supabase/migrations/20261028020000_osm_da_approvare.sql`, poi (facoltativo, per avere luoghi da guardare) `supabase/seed.sql`.
3. **Authentication → Sign In / Providers → Email**: attivo, «Confirm email» attivo, lunghezza minima password **10**, requisiti «lettere e numeri». Sul piano Pro attivare anche «Leaked password protection».
4. **Authentication → URL Configuration**: Site URL `https://ovunqueaccessibile.altervista.org/app/`; Redirect URLs `https://ovunqueaccessibile.altervista.org/app/**` (e `http://localhost:8091/app/**` e `https://mockly-website.github.io/ovunque-accessibile/app/**` per le prove).
5. **Authentication → Emails**: testi in italiano; **SMTP proprio** (es. Brevo) prima del lancio, perché quello di Supabase manda pochissime email all'ora.
6. **Authentication → Multi-Factor**: non serve più (la moderazione non chiede la 2FA).
7. **Project Settings → API**: copia *Project URL* e la chiave **publishable** (o *anon*) in `app/assets/js/config.js`. È pubblica per natura; la chiave *secret / service_role* non va mai nell'app.
8. Angelo e Lorenzo si registrano dall'app; poi nel SQL Editor: `update public.profiles set ruolo = 'admin' where id = (select id from auth.users where email = '…');`. Gli altri verificatori li nomina un admin con `select public.imposta_ruolo('email', 'verificatore');`.

**Da fare dopo**: pulizia periodica dei file delle foto respinte o ritirate, pagine statiche generate a ogni approvazione, MapTiler, APK (TWA), Termini d'uso e Dichiarazione di accessibilità, caricamento della mappa per zona quando i luoghi (anche da OpenStreetMap) saranno migliaia: oggi l'app ne scarica fino a 5000 in una volta.
