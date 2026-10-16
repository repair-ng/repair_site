#!/bin/sh
# Runs ONCE, the first time the Postgres volume is created (docker-entrypoint-initdb.d).
# Creates the least-privilege role the web app uses at runtime. Tables are created later by the
# migration runner as the owner role; the default privileges below give repair_app DML-only access to them.
set -e
psql -v ON_ERROR_STOP=1 -v app_pw="$REPAIR_APP_PASSWORD" -v db="$POSTGRES_DB" -v owner="$POSTGRES_USER" \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE repair_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE :"db" TO repair_app;
GRANT USAGE ON SCHEMA public TO repair_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO repair_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO repair_app;
SQL
