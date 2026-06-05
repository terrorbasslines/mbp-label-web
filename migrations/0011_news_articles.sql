CREATE TABLE IF NOT EXISTS news_articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  category TEXT,
  author_name TEXT,
  social_title TEXT,
  social_description TEXT,
  accent_color TEXT NOT NULL DEFAULT '#bd00ff',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_reactions (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  artist_email TEXT,
  reaction TEXT NOT NULL CHECK (reaction IN ('energy', 'massive', 'support', 'replay', 'respect')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  UNIQUE(article_id, artist_id)
);

CREATE TABLE IF NOT EXISTS news_comments (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  artist_email TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_news_articles_status_published_at ON news_articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_updated_at ON news_articles (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_reactions_article ON news_reactions (article_id);
CREATE INDEX IF NOT EXISTS idx_news_comments_article_status ON news_comments (article_id, status, created_at DESC);
