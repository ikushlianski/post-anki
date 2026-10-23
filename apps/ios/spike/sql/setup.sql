-- Run through scripts/setup.sh (psql variables: source_pw, storage_pw). Idempotent.
SELECT format('CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD %L', :'source_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_role') \gexec
SELECT format('ALTER ROLE powersync_role PASSWORD %L', :'source_pw') \gexec

GRANT SELECT ON TABLE public.subjects, public.topics TO powersync_role;

SELECT 'CREATE PUBLICATION powersync FOR TABLE public.subjects, public.topics'
WHERE NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') \gexec

SELECT 'ALTER PUBLICATION powersync ADD TABLE public.topics'
WHERE NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'topics') \gexec

SELECT format('CREATE ROLE powersync_storage_user WITH LOGIN PASSWORD %L', :'storage_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_storage_user') \gexec
SELECT format('ALTER ROLE powersync_storage_user PASSWORD %L', :'storage_pw') \gexec

SELECT 'CREATE DATABASE powersync_storage OWNER powersync_storage_user'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'powersync_storage') \gexec
