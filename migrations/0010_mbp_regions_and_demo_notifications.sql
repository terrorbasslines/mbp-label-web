ALTER TABLE artists ADD COLUMN mbp_region TEXT NOT NULL DEFAULT 'world';
ALTER TABLE releases ADD COLUMN mbp_region TEXT NOT NULL DEFAULT 'world';
ALTER TABLE demo_submissions ADD COLUMN demo_notify_email_status TEXT;
ALTER TABLE demo_submissions ADD COLUMN demo_notify_sent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_artists_mbp_region ON artists (mbp_region);
CREATE INDEX IF NOT EXISTS idx_releases_mbp_region ON releases (mbp_region);

UPDATE artists
SET mbp_region = 'europe'
WHERE lower(name) IN ('terror basslines', 'romee storm', 'ayla', 'riax', 'the-wolfs', 'the wolfs', 'daniel joseph')
   OR lower(COALESCE(country, '')) IN (
     'slovakia', 'slovensko', 'czech republic', 'czechia', 'poland', 'germany', 'austria',
     'netherlands', 'belgium', 'france', 'italy', 'spain', 'portugal', 'united kingdom',
     'uk', 'ireland', 'sweden', 'norway', 'finland', 'denmark', 'romania', 'hungary',
     'croatia', 'serbia', 'slovenia', 'greece', 'ukraine'
   );

UPDATE artists
SET mbp_region = 'america'
WHERE lower(name) IN ('rodrigo stadt', 'dulehec', 'artphazers', 'valkrize')
   OR lower(COALESCE(country, '')) IN (
     'usa', 'united states', 'united states of america', 'canada', 'mexico', 'brazil',
     'argentina', 'chile', 'peru', 'colombia', 'venezuela', 'ecuador', 'uruguay',
     'paraguay', 'bolivia', 'panama', 'costa rica'
   );

UPDATE artists
SET mbp_region = 'asia'
WHERE lower(name) IN ('donkey tae', 'kapkakasmaka', 'k3nto', 'mitsucaster', 'chris ponate', 'emrion', 'star-shards', 'star shards', 'blastrix', 'il4um', 'zha_sty', 'yuebai')
   OR lower(COALESCE(country, '')) IN (
  'china', 'japan', 'south korea', 'korea', 'india', 'indonesia', 'malaysia',
  'philippines', 'thailand', 'vietnam', 'taiwan', 'singapore', 'hong kong',
  'israel', 'turkey', 'uae', 'united arab emirates'
);

UPDATE artists
SET mbp_region = 'australia'
WHERE lower(name) IN ('id pleaz', 'rikkore')
   OR lower(COALESCE(country, '')) IN ('australia', 'new zealand');

UPDATE artists
SET mbp_region = 'world'
WHERE lower(name) = 'alexair';

UPDATE releases
SET mbp_region = COALESCE(
  (
    SELECT CASE
      WHEN COUNT(DISTINCT a.mbp_region) = 1 THEN MAX(a.mbp_region)
      ELSE 'world'
    END
    FROM release_artists ra
    INNER JOIN artists a ON a.id = ra.artist_id
    WHERE ra.release_id = releases.id
  ),
  'world'
);
