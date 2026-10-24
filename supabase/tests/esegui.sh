#!/bin/sh
# Prova le migrazioni e le regole di accesso (RLS) su un Postgres locale usa e getta.
# Uso: sh supabase/tests/esegui.sh   (serve PostgreSQL installato, es. brew install postgresql@17)
set -eu
export LC_ALL=C LANG=C PGOPTIONS="-c client_min_messages=warning"
cd "$(dirname "$0")/.."
DIR=$(mktemp -d)
PORT=${PORT:-54329}
trap 'pg_ctl -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
initdb -D "$DIR" -U postgres -A trust >/dev/null
pg_ctl -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=" -l "$DIR/log" start >/dev/null || { cat "$DIR/log"; exit 1; }
PSQL="psql -h $DIR -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f tests/stub_supabase.sql
for f in migrations/*.sql; do $PSQL -f "$f"; done
$PSQL -f seed.sql
$PSQL -o /dev/null -f tests/rls.sql
echo "Tutte le prove sono passate."
