"""Genera supabase/seed.sql dai luoghi di esempio del prototipo (assets/data/luoghi.json).

Uso: python3 supabase/strumenti/seed_da_json.py
I luoghi vengono inseriti con esempio = true: si tolgono tutti insieme con
  delete from public.places where esempio;
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'assets' / 'data' / 'luoghi.json'
OUT = ROOT / 'supabase' / 'seed.sql'


def lit(v):
    if v is None:
        return 'null'
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def js(v):
    return lit(json.dumps(v, ensure_ascii=False)) + '::jsonb'


rows = []
for p in json.loads(SRC.read_text(encoding='utf-8'))['luoghi']:
    v = p.get('verifica') or {}
    rows.append('  (' + ', '.join([
        lit(p['id']), lit(p['nome']), lit(p['categoria']), lit(p['indirizzo']), lit(p.get('cap')),
        lit(p['citta']), lit(p.get('provincia')), lit(p.get('regione')), lit(p['lat']), lit(p['lng']),
        lit(p.get('descrizione')), js(p['misure']), js(p.get('facoltativi') or {}), js(p.get('dettagli') or {}),
        lit(v.get('livello') or 'community'), lit(v.get('data')) + '::date', 'true',
    ]) + ')')

OUT.write_text(
    '-- LUOGHI DI ESEMPIO (inventati) generati da assets/data/luoghi.json con\n'
    '-- supabase/strumenti/seed_da_json.py. Prima del lancio: delete from public.places where esempio;\n'
    'insert into public.places (slug, nome, categoria, indirizzo, cap, citta, provincia, regione, lat, lng,\n'
    '  descrizione, misure, facoltativi, dettagli, verifica_livello, verifica_data, esempio)\nvalues\n'
    + ',\n'.join(rows) + '\non conflict (slug) do nothing;\n',
    encoding='utf-8')
print(f'{len(rows)} luoghi scritti in {OUT.relative_to(ROOT)}')
