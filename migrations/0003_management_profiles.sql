UPDATE artists
SET profile = 'CEO of The MasterBeat Project, leading label strategy, catalogue direction and MBP brand development.',
    updated_at = CURRENT_TIMESTAMP
WHERE lower(name) = 'terror basslines'
  AND (profile IS NULL OR profile = '' OR lower(profile) LIKE 'imported from %');

UPDATE artists
SET profile = 'A&R for The MasterBeat Project, focused on artist relations, demo review and release development.',
    updated_at = CURRENT_TIMESTAMP
WHERE lower(name) = 'romee storm'
  AND (profile IS NULL OR profile = '' OR lower(profile) LIKE 'imported from %');

UPDATE artists
SET profile = 'A&R for The MasterBeat Project, focused on roster scouting, music feedback and catalogue quality control.',
    updated_at = CURRENT_TIMESTAMP
WHERE lower(name) = 'alexair'
  AND (profile IS NULL OR profile = '' OR lower(profile) LIKE 'imported from %');

UPDATE artists
SET profile = 'MBP Ambassador representing The MasterBeat Project community, label presence and artist support.',
    updated_at = CURRENT_TIMESTAMP
WHERE lower(name) = 'rodrigo stadt'
  AND (profile IS NULL OR profile = '' OR lower(profile) LIKE 'imported from %');
