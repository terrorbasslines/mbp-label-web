UPDATE releases
SET status = 'published',
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT release_id
  FROM release_platform_links
  WHERE lower(COALESCE(platform, '') || ' ' || COALESCE(label, '')) NOT LIKE '%email%'
    AND lower(COALESCE(platform, '') || ' ' || COALESCE(label, '')) NOT LIKE '%subscribe%'
);

UPDATE releases
SET status = 'presave',
    updated_at = CURRENT_TIMESTAMP
WHERE status IN ('published', 'presave')
  AND id NOT IN (
    SELECT release_id
    FROM release_platform_links
    WHERE lower(COALESCE(platform, '') || ' ' || COALESCE(label, '')) NOT LIKE '%email%'
      AND lower(COALESCE(platform, '') || ' ' || COALESCE(label, '')) NOT LIKE '%subscribe%'
  );

DELETE FROM release_artists
WHERE artist_id IN (
  SELECT id
  FROM artists
  WHERE (
      lower(name) LIKE '% feat.%'
      OR lower(name) LIKE '%(feat.%'
      OR lower(name) LIKE '% ft.%'
      OR lower(name) LIKE '%(ft.%'
      OR lower(name) LIKE '% featuring %'
      OR name LIKE '%&%'
      OR name LIKE '%,%'
    )
    AND lower(COALESCE(profile, '')) LIKE 'imported from %'
);

DELETE FROM artists
WHERE (
    lower(name) LIKE '% feat.%'
    OR lower(name) LIKE '%(feat.%'
    OR lower(name) LIKE '% ft.%'
    OR lower(name) LIKE '%(ft.%'
    OR lower(name) LIKE '% featuring %'
    OR name LIKE '%&%'
    OR name LIKE '%,%'
  )
  AND lower(COALESCE(profile, '')) LIKE 'imported from %';
