"""Importa da OpenStreetMap i luoghi segnati come accessibili in carrozzina (wheelchair=yes), come schede «da verificare».

Uso (dalla cartella del progetto):
  python3 supabase/strumenti/import_osm.py --comune "Roma" --regione Lazio --provincia RM
  python3 supabase/strumenti/import_osm.py --comune "Cagliari" --regione Sardegna --provincia CA --limite 200 --anteprima

Scrive supabase/import/osm-<comune>.sql (da incollare nel SQL Editor) e osm-<comune>.json (per importa_luoghi_osm(),
quando il file SQL è troppo grande per l'editor): vedi DOCUMENTAZIONE.md.
Con --anteprima stampa solo quanti luoghi troverebbe, per tipo, senza scrivere niente.

Regole:
- solo wheelchair=yes (Ovunque Accessibile mostra luoghi davvero accessibili); con --anche-in-parte anche «limited»,
  per le zone con pochi dati (tutti passano comunque dalla moderazione); «no» resta sempre fuori;
- solo luoghi con nome e via (senza indirizzo una scheda non serve a nessuno); i bagni pubblici senza nome si chiamano «Bagno pubblico»;
- nessuna misura inventata: misure vuote, giudizio «da verificare», verifica_livello = 'osm';
- i tag di origine restano nella colonna osm (ref, wheelchair, toilets_wheelchair, data dell'import);
- un luogo già importato non si duplica (indice unico su osm->>'ref'), le schede già verificate non si toccano.
Licenza: i dati sono © contributori di OpenStreetMap, ODbL 1.0. La scheda lo dice e rimanda al luogo su openstreetmap.org.
Overpass: una richiesta per comune, con un User-Agent che dice chi siamo (regole d'uso del servizio).
"""
import argparse
import datetime
import json
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'supabase' / 'import'
# Server Overpass pubblici: se il primo è pieno si prova il secondo
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
NOMINATIM = 'https://nominatim.openstreetmap.org/search'
USER_AGENT = 'OvunqueAccessibile-import/1.0 (ovunqueaccessibile@gmail.com)'

# Tag OSM → categoria della scheda (il primo che corrisponde vince)
CATEGORIE = [
    ('amenity', {'restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'biergarten'}, 'ristorante'),
    ('tourism', {'museum', 'gallery'}, 'museo'),
    ('tourism', {'hotel', 'hostel', 'guest_house', 'motel', 'apartment', 'chalet'}, 'hotel'),
    ('leisure', {'beach_resort'}, 'spiaggia'),
    ('natural', {'beach'}, 'spiaggia'),
    ('leisure', {'park', 'garden', 'nature_reserve'}, 'parco'),
    ('amenity', {'cinema', 'theatre', 'arts_centre', 'library', 'concert_hall'}, 'cultura'),
    ('railway', {'station'}, 'trasporti'),
    ('amenity', {'bus_station', 'ferry_terminal'}, 'trasporti'),
    ('amenity', {'pharmacy', 'hospital', 'clinic', 'doctors', 'dentist'}, 'sanita'),
    ('healthcare', None, 'sanita'),
    ('amenity', {'townhall', 'post_office', 'bank', 'courthouse', 'police'}, 'servizi'),
    ('office', {'government'}, 'servizi'),
    ('leisure', {'sports_centre', 'swimming_pool', 'stadium', 'fitness_centre', 'sports_hall'}, 'sport'),
    ('amenity', {'place_of_worship'}, 'culto'),
    ('amenity', {'school', 'university', 'college', 'kindergarten'}, 'istruzione'),
    ('tourism', {'zoo', 'aquarium', 'theme_park'}, 'svago'),
    ('shop', {'supermarket', 'convenience', 'greengrocer'}, 'supermercato'),
    ('amenity', {'marketplace'}, 'supermercato'),
    ('amenity', {'toilets'}, 'bagni'),
    ('shop', None, 'negozio'),
]

# Tipi che su OpenStreetMap spesso non hanno nome: si usa questo
NOME_PREDEFINITO = {'bagni': 'Bagno pubblico'}

MISURE_VUOTE = {'ingresso': {}, 'spazi': {}, 'piani': {}, 'bagno': {}}


def query(area_id, in_parte=False):
    """Luoghi wheelchair=yes (con in_parte anche =limited) dentro l'area del comune
    (id dell'area Overpass = 3600000000 + id della relazione)."""
    ruota = '["wheelchair"~"^(yes|limited)$"]' if in_parte else '["wheelchair"="yes"]'
    filtri = ''.join(
        '  nwr(area.a)' + ruota + '{}["{}"{}];\n'.format(
            '' if cat in NOME_PREDEFINITO else '["name"]', k, '' if v is None else '~"^({})$"'.format('|'.join(sorted(v))))
        for k, v, cat in CATEGORIE)
    return ('[out:json][timeout:120];\n'
            'area(id:{})->.a;\n'
            '(\n{});\nout center tags;\n').format(area_id, filtri)


def trova_comune(comune, provincia):
    """Il confine del comune lo trova Nominatim, che capisce anche i nomi bilingui («Casteddu/Cagliari», «Bolzano - Bozen»)
    e dice in che provincia è: con --provincia si scarta un comune omonimo di un'altra provincia."""
    params = urllib.parse.urlencode({'city': comune, 'countrycodes': 'it', 'format': 'jsonv2', 'addressdetails': '1',
                                     'limit': '10', 'accept-language': 'it'})
    codice, testo = una_richiesta(NOMINATIM + '?' + params, None)
    if codice != 200:
        sys.exit('Nominatim ha risposto con l\'errore {}.'.format(codice))
    candidati = [r for r in json.loads(testo)
                 if r.get('osm_type') == 'relation' and r.get('addresstype') in ('city', 'town', 'village', 'municipality')]
    def prov(r):
        return str((r.get('address') or {}).get('ISO3166-2-lvl6', '')).replace('IT-', '')
    giusti = [r for r in candidati if not provincia or not prov(r) or prov(r) == provincia]
    # Province appena cambiate (es. Sardegna 2025): se la sigla non torna ma il comune è uno solo, va bene lo stesso
    if not giusti and len(candidati) == 1:
        print('Attenzione: su OpenStreetMap la provincia è {}, non {}'.format(prov(candidati[0]) or '?', provincia), file=sys.stderr)
        giusti = candidati
    for r in giusti:
        return 3600000000 + int(r['osm_id']), r.get('display_name', comune)
    sys.exit('Non trovo il comune «{}»{} su OpenStreetMap.'.format(comune, ' in provincia ' + provincia if provincia else ''))


def categoria(tags):
    for k, valori, cat in CATEGORIE:
        v = tags.get(k)
        if v and (valori is None or v in valori):
            return cat
    return None


def pulito(v, n):
    v = re.sub(r'[\x00-\x1f\x7f]', ' ', str(v or '')).strip()
    return re.sub(r'\s+', ' ', v)[:n]


def lit(v):
    if v is None:
        return 'null'
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def js(v):
    return lit(json.dumps(v, ensure_ascii=False)) + '::jsonb'


def scheda(el, comune, regione, provincia, oggi):
    tags = el.get('tags', {})
    cat = categoria(tags)
    nome = pulito(tags.get('name') or NOME_PREDEFINITO.get(cat, ''), 120)
    via = pulito(tags.get('addr:street'), 180)
    lat = el.get('lat', (el.get('center') or {}).get('lat'))
    lng = el.get('lon', (el.get('center') or {}).get('lon'))
    if not cat or len(nome) < 2 or len(via) < 3 or lat is None or lng is None:
        return None
    if not (35 <= lat <= 48 and 6 <= lng <= 19):
        return None
    civico = pulito(tags.get('addr:housenumber'), 15)
    cap = pulito(tags.get('addr:postcode'), 5)
    # Sempre il nome del comune: addr:city a volte è una frazione o è bilingue («Casteddu/Cagliari») e sporca i filtri
    citta = pulito(comune, 80)
    osm = {'ref': '{}/{}'.format(el['type'], el['id']), 'wheelchair': tags.get('wheelchair', 'yes'), 'importato': oggi}
    if tags.get('toilets:wheelchair') in ('yes', 'limited', 'no'):
        osm['toilets_wheelchair'] = tags['toilets:wheelchair']
    return {
        'slug': 'osm-{}-{}'.format(el['type'], el['id']),
        'nome': nome, 'categoria': cat,
        'indirizzo': (via + (' ' + civico if civico else ''))[:200],
        'cap': cap if re.fullmatch(r'[0-9]{5}', cap) else None,
        'citta': citta, 'provincia': provincia, 'regione': regione,
        'lat': round(lat, 6), 'lng': round(lng, 6), 'osm': osm,
    }


def una_richiesta(url, corpo):
    """→ (codice HTTP, testo); corpo None = GET. Il Python di macOS (LibreSSL vecchia) a volte non parla con questi
    server: allora curl."""
    try:
        req = urllib.request.Request(url, data=corpo, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as err:
        return err.code, b''
    except urllib.error.URLError as err:
        if not shutil.which('curl') or 'SSL' not in str(err):
            raise
        cmd = ['curl', '-sS', '--max-time', '180', '-A', USER_AGENT, '-w', '\n%{http_code}']
        if corpo is not None:
            cmd += ['--data-binary', '@-']
        out = subprocess.run(cmd + [url], input=corpo, capture_output=True)
        testo, _, codice = out.stdout.rpartition(b'\n')
        return int(codice or 0), testo


def scarica(q):
    """Overpass pubblico: se è occupato (429, 502, 504) si riprova aspettando sempre di più, come chiedono le sue regole."""
    corpo = urllib.parse.urlencode({'data': q}).encode()
    for attesa in (0, 20, 60, 120, 240):
        for server in OVERPASS:
            codice, testo = una_richiesta(server, corpo)
            if codice == 200:
                try:
                    dati = json.loads(testo)
                except ValueError:
                    continue                     # pagina d'errore («too busy») invece dei dati
                if 'runtime error' in str(dati.get('remark', '')):
                    continue                     # risposta interrotta: dati incompleti, non si usano
                return dati
            if codice not in (0, 429, 502, 503, 504):
                sys.exit('Overpass ha risposto con l\'errore {}.'.format(codice))
        print('Overpass è occupato: riprovo tra {} secondi…'.format(attesa or 20), file=sys.stderr)
        time.sleep(attesa or 20)
    sys.exit('Overpass è ancora occupato: riprova più tardi.')


def scegli(righe, limite):
    """Al massimo «limite» schede, a rotazione tra i tipi (così non restano fuori farmacie o stazioni perché vengono dopo
    in ordine alfabetico). In ogni tipo prima i luoghi con anche il bagno accessibile (toilets:wheelchair=yes)."""
    gruppi = {}
    for s in righe:
        gruppi.setdefault(s['categoria'], []).append(s)
    for g in gruppi.values():
        g.sort(key=lambda s: (s['osm'].get('wheelchair') != 'yes', s['osm'].get('toilets_wheelchair') != 'yes', s['nome']))
    scelte = []
    while len(scelte) < limite and any(gruppi.values()):
        for cat in sorted(gruppi):
            if gruppi[cat] and len(scelte) < limite:
                scelte.append(gruppi[cat].pop(0))
    return sorted(scelte, key=lambda s: (s['categoria'], s['nome']))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--comune', required=True, help='nome del comune come su OpenStreetMap, es. "Roma"')
    ap.add_argument('--regione', help='es. Lazio')
    ap.add_argument('--provincia', help='sigla, es. RM')
    ap.add_argument('--limite', type=int, default=300, help='al massimo quanti luoghi (predefinito 300)')
    ap.add_argument('--anche-in-parte', action='store_true',
                    help='anche wheelchair=limited (accessibile in parte): per zone con pochi dati; passano comunque dalla moderazione')
    ap.add_argument('--anteprima', action='store_true', help='conta e basta, senza scrivere il file')
    a = ap.parse_args()
    if a.provincia and not re.fullmatch(r'[A-Z]{2}', a.provincia):
        sys.exit('La provincia è una sigla di 2 lettere maiuscole, es. RM')

    area_id, nome_completo = trova_comune(a.comune, a.provincia)
    print('Comune: ' + nome_completo, file=sys.stderr)
    dati = scarica(query(area_id, a.anche_in_parte))
    if dati.get('remark'):
        print('Attenzione, Overpass dice: ' + dati['remark'], file=sys.stderr)

    oggi = datetime.date.today().isoformat()
    righe, visti = [], set()
    for el in dati.get('elements', []):
        s = scheda(el, a.comune, a.regione, a.provincia, oggi)
        if s and s['slug'] not in visti:
            visti.add(s['slug'])
            righe.append(s)
    righe = scegli(righe, a.limite)

    conta = {}
    for s in righe:
        conta[s['categoria']] = conta.get(s['categoria'], 0) + 1
    print('{}: {} elementi da OpenStreetMap, {} schede utilizzabili ({})'.format(
        a.comune, len(dati.get('elements', [])), len(righe),
        ', '.join('{} {}'.format(n, c) for c, n in sorted(conta.items())) or 'nessuna'))
    if a.anteprima or not righe:
        return

    OUT_DIR.mkdir(exist_ok=True)
    out = OUT_DIR / 'osm-{}.sql'.format(re.sub(r'[^a-z0-9]+', '-', a.comune.lower()).strip('-'))
    out.write_text(sql(righe, a.comune, oggi), encoding='utf-8')
    # Stesse righe in JSON, per importa_luoghi_osm() (migrazione 20261028010000): i file grandi non entrano nel SQL Editor
    out.with_suffix('.json').write_text(json.dumps(righe, ensure_ascii=False), encoding='utf-8')
    print('Scritto', out.relative_to(ROOT), 'e', out.with_suffix('.json').name)


def sql(righe, comune, oggi):
    valori = ',\n'.join('  (' + ', '.join([
        lit(s['slug']), lit(s['nome']), lit(s['categoria']), lit(s['indirizzo']), lit(s['cap']), lit(s['citta']),
        lit(s['provincia']), lit(s['regione']), lit(s['lat']), lit(s['lng']), js(MISURE_VUOTE),
        "'osm'", lit(oggi), js(s['osm'])]) + ')' for s in righe)
    return (
        '-- Luoghi da OpenStreetMap (© contributori di OpenStreetMap, ODbL 1.0): {}, importati il {}.\n'
        '-- Generato da supabase/strumenti/import_osm.py. Da incollare nel SQL Editor di Supabase.\n'
        '-- Per toglierli: delete from public.places where verifica_livello = \'osm\' and citta = {};\n'
        'insert into public.places (slug, nome, categoria, indirizzo, cap, citta, provincia, regione, lat, lng, misure,\n'
        '                           verifica_livello, verifica_data, osm)\nvalues\n{}\n'
        'on conflict do nothing;\n'.format(comune, oggi, lit(comune), valori))


if __name__ == '__main__':
    main()
