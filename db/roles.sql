-- Run ONCE as the database owner AFTER the first migration (see docs/DEPLOYMENT.md step 3).
-- The web app then connects as repair_app: it can read/write rows but cannot DROP/ALTER tables,
-- so even a hypothetical SQL-injection bug could never destroy the schema.
-- Replace CHANGE_ME and, if your owner role isn't "repair_owner", the role name below.
CREATE ROLE repair_app LOGIN PASSWORD 'CHANGE_ME' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE repair TO repair_app;
GRANT USAGE ON SCHEMA public TO repair_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO repair_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO repair_app;
-- tables created by FUTURE migrations (run by the owner) get the same grants automatically:
ALTER DEFAULT PRIVILEGES FOR ROLE repair_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO repair_app;
ALTER DEFAULT PRIVILEGES FOR ROLE repair_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO repair_app;
REVOKE ALL ON schema_migrations FROM repair_app;
