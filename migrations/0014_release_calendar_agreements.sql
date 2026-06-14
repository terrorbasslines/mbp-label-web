CREATE TABLE IF NOT EXISTS release_calendar_slots (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL DEFAULT 'MBP',
  release_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  max_releases INTEGER NOT NULL DEFAULT 1,
  current_release_count INTEGER NOT NULL DEFAULT 0,
  agreement_deadline TEXT,
  asset_deadline TEXT,
  distributor_delivery_deadline TEXT,
  promo_start_date TEXT,
  artist_name TEXT,
  track_title TEXT,
  catalog_number TEXT,
  source_sheet TEXT,
  internal_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (brand, release_date, catalog_number)
);

CREATE INDEX IF NOT EXISTS idx_release_calendar_slots_date ON release_calendar_slots (release_date);
CREATE INDEX IF NOT EXISTS idx_release_calendar_slots_brand_status ON release_calendar_slots (brand, status);

CREATE TABLE IF NOT EXISTS release_agreements (
  id TEXT PRIMARY KEY,
  demo_submission_id TEXT NOT NULL,
  calendar_slot_id TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'MBP',
  status TEXT NOT NULL DEFAULT 'waiting_artist_details',
  template_version TEXT NOT NULL DEFAULT '2026.1',
  current_version_id TEXT,
  release_title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  artist_email TEXT NOT NULL,
  planned_release_date TEXT NOT NULL,
  genre TEXT,
  label_share REAL NOT NULL DEFAULT 30,
  artist_pool_share REAL NOT NULL DEFAULT 70,
  distributor TEXT NOT NULL DEFAULT 'Symphonic Distribution / SymphonicMS',
  signed_pdf_file_key TEXT,
  audit_certificate_file_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (demo_submission_id)
);

CREATE INDEX IF NOT EXISTS idx_release_agreements_status ON release_agreements (status);
CREATE INDEX IF NOT EXISTS idx_release_agreements_artist_email ON release_agreements (artist_email);
CREATE INDEX IF NOT EXISTS idx_release_agreements_slot ON release_agreements (calendar_slot_id);

CREATE TABLE IF NOT EXISTS agreement_versions (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  snapshot_html TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  created_by_email TEXT,
  created_by_role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agreement_versions_agreement ON agreement_versions (agreement_id);

CREATE TABLE IF NOT EXISTS agreement_parties (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  email TEXT NOT NULL,
  payment_email TEXT,
  splitshare_email TEXT,
  street_address TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT,
  signature_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agreement_parties_email ON agreement_parties (email);
CREATE INDEX IF NOT EXISTS idx_agreement_parties_agreement ON agreement_parties (agreement_id);

CREATE TABLE IF NOT EXISTS agreement_splits (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  payee_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'artist',
  email TEXT,
  share_of_artist_pool REAL NOT NULL,
  direct_split_percentage REAL NOT NULL,
  is_bonus INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agreement_splits_agreement ON agreement_splits (agreement_id);

CREATE TABLE IF NOT EXISTS agreement_checklist_items (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  confirmed_by TEXT,
  confirmed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (agreement_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_agreement_checklist_agreement ON agreement_checklist_items (agreement_id);

CREATE TABLE IF NOT EXISTS agreement_signatures (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  agreement_version_id TEXT NOT NULL,
  party_id TEXT,
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signature_type TEXT NOT NULL DEFAULT 'typed',
  signature_text TEXT NOT NULL,
  signature_image_key TEXT,
  signed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  document_hash_at_signing TEXT NOT NULL,
  checkbox_confirmations_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agreement_signatures_agreement ON agreement_signatures (agreement_id);

CREATE TABLE IF NOT EXISTS agreement_audit_events (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_email TEXT,
  actor_role TEXT,
  event_data_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  previous_hash TEXT,
  event_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agreement_audit_agreement ON agreement_audit_events (agreement_id);
