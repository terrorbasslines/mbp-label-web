INSERT OR IGNORE INTO news_categories (id, slug, name, description, accent_color)
VALUES
  ('newscat_label_news', 'label-news', 'Label News', 'Official updates from The MasterBeat Project.', '#bd00ff'),
  ('newscat_release_stories', 'release-stories', 'Release Stories', 'New catalogue drops, pre-save announcements and release context.', '#00e5ff'),
  ('newscat_artist_spotlight', 'artist-spotlight', 'Artist Spotlight', 'Profiles, interviews and highlights from the MBP roster.', '#ffd000'),
  ('newscat_behind_the_label', 'behind-the-label', 'Behind The Label', 'Inside the label process, creative direction and catalogue work.', '#23df1e'),
  ('newscat_industry_notes', 'industry-notes', 'Industry Notes', 'Hard dance, electronic music and label business observations.', '#ff1808'),
  ('newscat_demo_room', 'demo-room', 'Demo Room', 'Submission guidance, demo review notes and artist development updates.', '#22f7ff'),
  ('newscat_mbp_regions', 'mbp-regions', 'MBP Regions', 'Europe, America, Asia, Australia and World catalogue stories.', '#2455ff'),
  ('newscat_playlists', 'playlist-updates', 'Playlist Updates', 'YouTube, streaming and curated MBP playlist announcements.', '#14d81b'),
  ('newscat_events_community', 'events-community', 'Events & Community', 'Community moves, shows, collaborations and MBP culture.', '#ff7a00');

INSERT OR IGNORE INTO news_articles (
  id,
  slug,
  title,
  excerpt,
  content,
  cover_image_url,
  status,
  category_id,
  category,
  author_name,
  seo_title,
  seo_description,
  social_title,
  social_description,
  accent_color,
  published_at,
  updated_at
)
VALUES (
  'news_draft_mbp_newsroom_launch',
  'mbp-newsroom-launch-draft',
  'Inside The MasterBeat Project Newsroom',
  'A draft preview of how MBP News can publish release stories, artist updates and label notes with clean SEO metadata.',
  '<h2>Built for official MBP updates</h2><p>The MasterBeat Project News section is designed for release stories, artist spotlights, playlist updates and behind the label articles that can be shared cleanly across social platforms.</p><p>This draft checks the article editor, cover image handling, SEO title, SEO description, category assignment and admin-only draft preview flow.</p><h3>What this format supports</h3><ul><li>SEO-ready article headlines and descriptions</li><li>Cover images for public cards and generated social thumbnails</li><li>Rich article content with links, images and media embeds</li><li>Artist reactions and comments after login</li></ul>',
  '/assets/brand/season4-banner.png',
  'draft',
  (SELECT id FROM news_categories WHERE slug = 'behind-the-label' LIMIT 1),
  'Behind The Label',
  'Terror Basslines',
  'Inside The MasterBeat Project Newsroom',
  'Draft article testing the MBP News publishing workflow with category, cover image, SEO metadata and rich content.',
  'Inside The MasterBeat Project Newsroom',
  'A draft preview for MBP News publishing, release stories and label updates.',
  '#bd00ff',
  NULL,
  CURRENT_TIMESTAMP
);
