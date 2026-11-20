-- 129: mallar och rutiner på admin.halkvakt.se (DECISIONS #913). Idempotent.
-- Texterna (inläggsmallar, mejlmallar, rutiner) ligger i databasen och inte i repot, eftersom repot är publikt och
-- texterna nämner kontakter och pågående samtal. Edge-funktionen admin läser och skriver dem för den som har menyvalet mallar.
CREATE TABLE IF NOT EXISTS admin_dokument (
  slug text PRIMARY KEY,
  grupp text NOT NULL,
  rubrik text NOT NULL,
  text text NOT NULL DEFAULT '',
  ordning int NOT NULL DEFAULT 0,
  andrad timestamptz NOT NULL DEFAULT now(),
  andrad_av text NOT NULL DEFAULT ''
);
ALTER TABLE admin_dokument ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_dokument FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE admin_dokument FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE admin_dokument FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE admin_dokument TO service_role;
  END IF;
END $$;
