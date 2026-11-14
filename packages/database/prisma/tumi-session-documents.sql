ALTER TABLE tumi.fact_sessions
  ADD COLUMN IF NOT EXISTS access_key_hash TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS tumi.candidate_documents (
  id UUID PRIMARY KEY,
  hoja_vida_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  byte_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  page_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS candidate_documents_hoja_status
  ON tumi.candidate_documents (hoja_vida_id, status);
