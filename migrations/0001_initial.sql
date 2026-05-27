CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT,
  profile TEXT,
  image_url TEXT,
  links_json TEXT NOT NULL DEFAULT '[]',
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  catalog_number TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist_display TEXT NOT NULL,
  primary_artist_id TEXT,
  release_date TEXT,
  release_type TEXT NOT NULL DEFAULT 'single',
  genre TEXT,
  artwork_url TEXT,
  ffm_url TEXT,
  presave_url TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (primary_artist_id) REFERENCES artists(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS release_artists (
  release_id TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary',
  PRIMARY KEY (release_id, artist_id, role),
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS release_platform_links (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  is_playable INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_submissions (
  id TEXT PRIMARY KEY,
  artist_name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT NOT NULL,
  links TEXT NOT NULL,
  track_title TEXT NOT NULL,
  genre TEXT NOT NULL,
  streaming_link TEXT NOT NULL,
  message TEXT NOT NULL,
  agreement INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  decision_reason TEXT,
  response_sent_at TEXT,
  email_status TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_releases_catalog_number ON releases (catalog_number);
CREATE INDEX IF NOT EXISTS idx_releases_primary_artist ON releases (primary_artist_id);
CREATE INDEX IF NOT EXISTS idx_release_platform_links_release ON release_platform_links (release_id);
CREATE INDEX IF NOT EXISTS idx_demo_submissions_status ON demo_submissions (status);
CREATE INDEX IF NOT EXISTS idx_demo_submissions_created_at ON demo_submissions (created_at DESC);
