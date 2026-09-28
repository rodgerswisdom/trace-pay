#!/usr/bin/env bash
# Local Postgres for development: a private cluster in ./.pgdata on port 54329 (doesn't touch any other Postgres).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/.pgdata"
PORT=54329
if ! command -v pg_ctl >/dev/null; then
  echo "Postgres isn't installed. Install it (e.g. brew install postgresql@16) or set DATABASE_URL to any Postgres." >&2
  exit 1
fi
if [ ! -d "$DIR" ]; then
  initdb -D "$DIR" -U postgres --auth=trust --no-locale -E UTF8 >/dev/null
fi
if ! pg_ctl -D "$DIR" status >/dev/null 2>&1; then
  pg_ctl -D "$DIR" -o "-p $PORT -k /tmp" -l "$DIR/server.log" start >/dev/null
  sleep 1
fi
psql -h localhost -p $PORT -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='tracepay'" | grep -q 1 || createdb -h localhost -p $PORT -U postgres tracepay
echo "Local Postgres running: postgres://postgres@localhost:$PORT/tracepay"
