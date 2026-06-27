DELETE FROM release_artists
WHERE artist_id IN (
  SELECT id
  FROM artists
  WHERE lower(name) = 'close to heaven (remixes)'
     OR lower(name) LIKE '%#x27;t give up%remix%'
     OR lower(name) LIKE '%&#x27;t give up%remix%'
     OR lower(name) LIKE '%&apos;t give up%remix%'
);

DELETE FROM artists
WHERE lower(COALESCE(profile, '')) LIKE 'imported from %'
  AND (
    lower(name) = 'close to heaven (remixes)'
    OR lower(name) LIKE '%#x27;t give up%remix%'
    OR lower(name) LIKE '%&#x27;t give up%remix%'
    OR lower(name) LIKE '%&apos;t give up%remix%'
  );

UPDATE releases
SET artist_display = 'Imo Music, Zedean, Nathan Brumley',
    updated_at = CURRENT_TIMESTAMP
WHERE lower(catalog_number) = 'mbh011r'
  AND lower(artist_display) = 'close to heaven (remixes)';

INSERT OR IGNORE INTO release_artists (release_id, artist_id, role)
SELECT r.id, a.id, 'primary'
FROM releases r
INNER JOIN artists a ON lower(a.name) IN ('imo music', 'zedean', 'nathan brumley')
WHERE lower(r.catalog_number) = 'mbh011r';
