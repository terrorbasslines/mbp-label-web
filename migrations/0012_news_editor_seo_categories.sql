CREATE TABLE IF NOT EXISTS news_categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  accent_color TEXT NOT NULL DEFAULT '#bd00ff',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO news_categories (id, slug, name, description, accent_color)
VALUES
  ('newscat_label_news', 'label-news', 'Label News', 'Official updates from The MasterBeat Project.', '#bd00ff'),
  ('newscat_release_stories', 'release-stories', 'Release Stories', 'New catalogue drops, pre-save announcements and release context.', '#00e5ff'),
  ('newscat_artist_spotlight', 'artist-spotlight', 'Artist Spotlight', 'Profiles, interviews and highlights from the MBP roster.', '#ffd000'),
  ('newscat_behind_the_label', 'behind-the-label', 'Behind The Label', 'Inside the label process, creative direction and catalogue work.', '#23df1e'),
  ('newscat_industry_notes', 'industry-notes', 'Industry Notes', 'Hard dance, electronic music and label business observations.', '#ff1808');

ALTER TABLE news_articles ADD COLUMN category_id TEXT REFERENCES news_categories(id) ON DELETE SET NULL;
ALTER TABLE news_articles ADD COLUMN seo_title TEXT;
ALTER TABLE news_articles ADD COLUMN seo_description TEXT;

UPDATE news_articles
SET category_id = (
  SELECT id
  FROM news_categories
  WHERE lower(news_categories.name) = lower(news_articles.category)
     OR news_categories.slug = lower(replace(news_articles.category, ' ', '-'))
  LIMIT 1
)
WHERE category_id IS NULL
  AND category IS NOT NULL
  AND trim(category) != '';

CREATE INDEX IF NOT EXISTS idx_news_categories_slug ON news_categories (slug);
CREATE INDEX IF NOT EXISTS idx_news_articles_category_id ON news_articles (category_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_status_category ON news_articles (status, category_id, published_at DESC);
