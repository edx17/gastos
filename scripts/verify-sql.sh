#!/usr/bin/env bash
# Aplica todas las migraciones sobre una base limpia y ejecuta comprobaciones
# de RLS, seed y reportes. Uso: scripts/verify-sql.sh "postgres://..."
set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "Falta la URL de la base de datos." >&2
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/harness.sql
for file in supabase/migrations/*.sql; do
  echo "→ $file"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$file"
done
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/checks.sql
echo "SQL verificado."
