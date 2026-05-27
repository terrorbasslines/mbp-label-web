WITH RECURSIVE source AS (
  SELECT id AS release_id, replace(artist_display, ',', ' & ') || ' & ' AS rest
  FROM releases
  WHERE artist_display LIKE '%&%' OR artist_display LIKE '%,%'
),
parts(release_id, rest, name, position) AS (
  SELECT release_id, rest, '', 0 FROM source
  UNION ALL
  SELECT
    release_id,
    substr(rest, instr(rest, ' & ') + 3),
    trim(substr(rest, 1, instr(rest, ' & ') - 1)),
    position + 1
  FROM parts
  WHERE instr(rest, ' & ') > 0
),
distinct_names AS (
  SELECT DISTINCT name
  FROM parts
  WHERE name <> ''
)
INSERT OR IGNORE INTO artists (id, slug, name, profile, links_json, is_featured, updated_at)
SELECT
  'art_' || lower(hex(randomblob(16))),
  lower(replace(replace(replace(replace(replace(name, ' ', '-'), '_', '-'), '.', ''), '''', ''), '"', '')),
  name,
  'Imported from collaboration catalogue split',
  '[]',
  0,
  CURRENT_TIMESTAMP
FROM distinct_names
WHERE NOT EXISTS (SELECT 1 FROM artists a WHERE lower(a.name) = lower(distinct_names.name));

WITH RECURSIVE source AS (
  SELECT id AS release_id, replace(artist_display, ',', ' & ') || ' & ' AS rest
  FROM releases
  WHERE artist_display LIKE '%&%' OR artist_display LIKE '%,%'
),
parts(release_id, rest, name, position) AS (
  SELECT release_id, rest, '', 0 FROM source
  UNION ALL
  SELECT
    release_id,
    substr(rest, instr(rest, ' & ') + 3),
    trim(substr(rest, 1, instr(rest, ' & ') - 1)),
    position + 1
  FROM parts
  WHERE instr(rest, ' & ') > 0
)
INSERT OR IGNORE INTO release_artists (release_id, artist_id, role)
SELECT p.release_id, a.id, CASE WHEN p.position = 1 THEN 'primary' ELSE 'collaborator' END
FROM parts p
INNER JOIN artists a ON lower(a.name) = lower(p.name)
WHERE p.name <> '';

WITH RECURSIVE source AS (
  SELECT id AS release_id, replace(artist_display, ',', ' & ') || ' & ' AS rest
  FROM releases
  WHERE artist_display LIKE '%&%' OR artist_display LIKE '%,%'
),
parts(release_id, rest, name, position) AS (
  SELECT release_id, rest, '', 0 FROM source
  UNION ALL
  SELECT
    release_id,
    substr(rest, instr(rest, ' & ') + 3),
    trim(substr(rest, 1, instr(rest, ' & ') - 1)),
    position + 1
  FROM parts
  WHERE instr(rest, ' & ') > 0
),
first_parts AS (
  SELECT release_id, name
  FROM parts
  WHERE position = 1 AND name <> ''
)
UPDATE releases
SET primary_artist_id = (
  SELECT a.id
  FROM first_parts fp
  INNER JOIN artists a ON lower(a.name) = lower(fp.name)
  WHERE fp.release_id = releases.id
  LIMIT 1
)
WHERE id IN (SELECT release_id FROM first_parts);

DELETE FROM release_artists
WHERE artist_id IN (
  SELECT id
  FROM artists
  WHERE (name LIKE '%&%' OR name LIKE '%,%')
    AND lower(profile) LIKE 'imported from %'
);

DELETE FROM artists
WHERE (name LIKE '%&%' OR name LIKE '%,%')
  AND lower(profile) LIKE 'imported from %';
