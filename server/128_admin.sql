-- 128: adminsidorna på admin.halkvakt.se (DECISIONS #913). Idempotent.
-- Inloggningen är Supabase Auth. admin_behorighet säger vilka menyval en inloggad användare får, och edge-funktionen
-- admin prövar varje anrop mot den med service-nyckeln. En användare utan rad här får ingenting, så ett konto som
-- någon skapat själv ger ingen åtkomst. Ingen främmande nyckel mot auth.users: CI:s PostGIS har inget auth-schema.
-- admin_start bär sha256 av en engångskod för det första kontot. Koden sätts för hand, aldrig i repot, och raden
-- raderas av funktionen när den har använts.
CREATE TABLE IF NOT EXISTS admin_behorighet (
  anvandare uuid PRIMARY KEY,
  epost text NOT NULL,
  menyval text[] NOT NULL DEFAULT '{}',
  skapad timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_behorighet ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_start (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hash text NOT NULL
);
ALTER TABLE admin_start ENABLE ROW LEVEL SECURITY;

-- Låst dubbelt: RLS utan policy och REVOKE. Bara service_role når tabellerna.
REVOKE ALL ON TABLE admin_behorighet, admin_start FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE admin_behorighet, admin_start FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE admin_behorighet, admin_start FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE admin_behorighet TO service_role;
    GRANT ALL ON TABLE admin_start TO service_role;
  END IF;
END $$;
