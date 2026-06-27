ALTER TABLE release_calendar_slots ADD COLUMN imported_source_file TEXT;
ALTER TABLE release_calendar_slots ADD COLUMN imported_row_number INTEGER;
ALTER TABLE release_calendar_slots ADD COLUMN imported_status TEXT;

ALTER TABLE agreement_signatures ADD COLUMN signature_image_data_url TEXT;

CREATE TABLE IF NOT EXISTS agreement_access_tokens (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agreement_access_tokens_hash ON agreement_access_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_agreement_access_tokens_agreement ON agreement_access_tokens (agreement_id);
