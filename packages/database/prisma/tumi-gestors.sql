CREATE TABLE IF NOT EXISTS tumi.gestors (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tumi.gestor_sessions (
  id UUID PRIMARY KEY,
  gestor_id UUID NOT NULL REFERENCES tumi.gestors(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gestor_sessions_gestor
  ON tumi.gestor_sessions (gestor_id);
