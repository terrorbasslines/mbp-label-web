INSERT INTO artists (id, slug, name, country, profile, links_json, is_featured, updated_at)
SELECT
  'art_terror_basslines',
  'terror-basslines',
  'Terror Basslines',
  'The MasterBeat Project management',
  'CEO of The MasterBeat Project, leading label strategy, catalogue direction and MBP brand development.',
  '[]',
  1,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM artists WHERE lower(name) = 'terror basslines');

INSERT INTO artists (id, slug, name, country, profile, links_json, is_featured, updated_at)
SELECT
  'art_rodrigo_stadt',
  'rodrigo-stadt',
  'Rodrigo Stadt',
  'The MasterBeat Project management',
  'MBP Ambassador representing The MasterBeat Project community, label presence and artist support.',
  '[]',
  1,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM artists WHERE lower(name) = 'rodrigo stadt');
