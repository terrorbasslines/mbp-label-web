import { inferReleaseRegion, isCollabArtistName, isResponse, json, MBP_REGION_KEYS, mbpRegionDetails, normalizeMbpRegion, requireDb, syncReleaseArtistCredits, type Env } from "./_shared";
import { parseFfmRelease } from "./_ffm";
import { labelDetails, labelFromCatalogNumber, normalizeLabelKey, type LabelKey } from "./_labels";
import { isPlayableReleaseLink, normalizeReleasePlatformLinks } from "./_release_links";

type ReleaseRow = Record<string, unknown> & { id: string };
type ArtistRow = Record<string, unknown> & { id: string; links_json?: string };
type LinkRow = Record<string, unknown> & { release_id: string };
type ReleaseArtistRow = { release_id: string; artist_id: string; role: string };
type RefreshCandidate = ReleaseRow & {
  catalog_number: string;
  artist_display: string;
  ffm_url?: string | null;
};

type CreditRepairCandidate = {
  id: string;
  artist_display: string;
  primary_artist_id?: string | null;
  ffm_url?: string | null;
};

const MANAGEMENT_PROFILES = new Map([
  ["terror basslines", "CEO of The MasterBeat Project, leading label strategy, catalogue direction and MBP brand development."],
  ["romee storm", "A&R for The MasterBeat Project, focused on artist relations, demo review and release development."],
  ["alexair", "A&R for The MasterBeat Project, focused on roster scouting, music feedback and catalogue quality control."],
  ["rodrigo stadt", "MBP Ambassador representing The MasterBeat Project community, label presence and artist support."]
]);

const ARTIST_PRIORITY = new Map(
  ["terror basslines", "romee storm", "alexair", "rodrigo stadt"].map((name, index) => [name, index])
);

function publicArtistProfile(artist: ArtistRow) {
  const name = String(artist.name ?? "").toLowerCase();
  const profile = String(artist.profile ?? "");
  if (profile && !profile.toLowerCase().startsWith("imported from ")) return profile;
  return MANAGEMENT_PROFILES.get(name) ?? null;
}

function artistSortRank(artist: { name?: unknown }) {
  return ARTIST_PRIORITY.get(String(artist.name ?? "").toLowerCase()) ?? 1000;
}

function isReleaseTitleArtistName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (/(?:^|[#&])x[0-9a-f]+;/.test(normalized)) return true;
  if (normalized === "close to heaven (remixes)") return true;
  if (/\((?:[^)]*\s)?remixes?\)?$/.test(normalized)) return true;
  if (/\b(?:remix|remixes|compilation|compilations)\b/.test(normalized) && !/^(dj|mc)\b/.test(normalized)) return true;
  return false;
}

async function updateReleaseRegionFromCredits(db: D1Database, releaseId: string) {
  try {
    const current = await db.prepare("SELECT mbp_region FROM releases WHERE id = ?").bind(releaseId).first<{ mbp_region?: string | null }>();
    if (current?.mbp_region && String(current.mbp_region).trim()) return;

    const regions = await db
      .prepare(
        `SELECT a.mbp_region
         FROM release_artists ra
         INNER JOIN artists a ON a.id = ra.artist_id
         WHERE ra.release_id = ?`
      )
      .bind(releaseId)
      .all<{ mbp_region: string }>();
    const region = inferReleaseRegion((regions.results ?? []).map((row) => row.mbp_region));
    await db.prepare("UPDATE releases SET mbp_region = ? WHERE id = ?").bind(region, releaseId).run();
  } catch {
    // Region columns are migration-backed. Keep catalogue refresh working if a deployment races the migration.
  }
}

async function refreshPresaveCandidates(db: D1Database) {
  const candidates = await db
    .prepare(
      `SELECT r.*
       FROM releases r
       LEFT JOIN release_platform_links l ON l.release_id = r.id
       WHERE r.ffm_url IS NOT NULL
         AND (r.status = 'presave' OR l.id IS NULL)
         AND (r.updated_at IS NULL OR r.updated_at < datetime('now', '-10 minutes'))
       GROUP BY r.id
       ORDER BY r.catalog_number DESC
       LIMIT 8`
    )
    .all<RefreshCandidate>();

  for (const release of candidates.results ?? []) {
    if (!release.ffm_url) continue;

    try {
      const response = await fetch(String(release.ffm_url), {
        headers: { "user-agent": "The MasterBeat Project catalogue status refresh" }
      });
      if (!response.ok) continue;

      const parsed = parseFfmRelease(String(release.catalog_number), String(release.ffm_url), await response.text());
      if (!parsed) continue;

      await db
        .prepare(
          `UPDATE releases
           SET title = ?, artist_display = ?, artwork_url = COALESCE(?, artwork_url),
               status = ?, description = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(parsed.trackTitle, parsed.artist, parsed.artworkUrl, parsed.status, parsed.description, release.id)
        .run();

      const credits = await syncReleaseArtistCredits(db, release.id, parsed.artist, null, parsed.ffmUrl);
      await db.prepare("UPDATE releases SET primary_artist_id = ? WHERE id = ?").bind(credits.primaryArtistId, release.id).run();
      await updateReleaseRegionFromCredits(db, release.id);
      await db.prepare("DELETE FROM release_platform_links WHERE release_id = ?").bind(release.id).run();
      for (let index = 0; index < parsed.platformLinks.length; index += 1) {
        const link = parsed.platformLinks[index];
        await db
          .prepare(
            `INSERT INTO release_platform_links (id, release_id, platform, label, url, is_playable, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(crypto.randomUUID(), release.id, link.platform, link.label, link.url, link.is_playable ? 1 : 0, index)
          .run();
      }
    } catch {
      // Keep the existing catalogue data when FFM is temporarily unavailable.
    }
  }
}

async function repairArtistCredits(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT id, artist_display, primary_artist_id, ffm_url
       FROM releases
       WHERE artist_display LIKE '%&%'
          OR artist_display LIKE '%,%'
          OR lower(artist_display) LIKE '% feat.%'
          OR lower(artist_display) LIKE '%(feat.%'
          OR lower(artist_display) LIKE '% ft.%'
          OR lower(artist_display) LIKE '%(ft.%'
          OR lower(artist_display) LIKE '% featuring %'
       ORDER BY catalog_number DESC
       LIMIT 80`
    )
    .all<CreditRepairCandidate>();

  for (const release of rows.results ?? []) {
    const credits = await syncReleaseArtistCredits(db, release.id, release.artist_display, null, release.ffm_url ?? null);
    await db.prepare("UPDATE releases SET primary_artist_id = ? WHERE id = ?").bind(credits.primaryArtistId, release.id).run();
    await updateReleaseRegionFromCredits(db, release.id);
  }

  await db
    .prepare(
      `DELETE FROM artists
       WHERE (lower(name) LIKE '% feat.%' OR lower(name) LIKE '%(feat.%' OR lower(name) LIKE '% ft.%' OR lower(name) LIKE '%(ft.%' OR lower(name) LIKE '% featuring %' OR name LIKE '%&%' OR name LIKE '%,%')
         AND lower(COALESCE(profile, '')) LIKE 'imported from %'`
    )
    .run();
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const db = requireDb(env);
  if (isResponse(db)) {
    return json({ ok: false, artists: [], releases: [], error: "D1 is not configured yet." });
  }

  waitUntil(Promise.all([refreshPresaveCandidates(db), repairArtistCredits(db)]));

  const [artists, releases, links, releaseArtists] = await Promise.all([
    db.prepare("SELECT * FROM artists ORDER BY is_featured DESC, name ASC").all<ArtistRow>(),
    db.prepare("SELECT * FROM releases WHERE status IN ('published', 'presave') ORDER BY catalog_number DESC").all<ReleaseRow>(),
    db.prepare("SELECT * FROM release_platform_links ORDER BY sort_order ASC").all<LinkRow>(),
    db.prepare("SELECT release_id, artist_id, role FROM release_artists").all<ReleaseArtistRow>()
  ]);
  const url = new URL(request.url);
  const view = url.searchParams.get("view");
  const requestedLabel = normalizeLabelKey(url.searchParams.get("label"));
  const selectedLabel = requestedLabel === "all" ? null : requestedLabel;
  const cacheHeaders = {
    "cache-control": "no-store"
  };
  const artistRows = artists.results ?? [];
  const releaseRows = releases.results ?? [];
  const artistsById = new Map(artistRows.map((artist) => [artist.id, artist]));
  const releaseLabelsById = new Map<string, LabelKey>();
  for (const release of releaseRows) {
    releaseLabelsById.set(release.id, labelFromCatalogNumber(release.catalog_number));
  }
  const artistRegionsByRelease = new Map<string, string[]>();
  const artistLabelsByArtist = new Map<string, Set<LabelKey>>();
  for (const credit of releaseArtists.results ?? []) {
    const artist = artistsById.get(credit.artist_id);
    if (!artist) continue;
    const list = artistRegionsByRelease.get(credit.release_id) ?? [];
    list.push(normalizeMbpRegion(artist.mbp_region));
    artistRegionsByRelease.set(credit.release_id, list);
    const releaseLabel = releaseLabelsById.get(credit.release_id);
    if (!releaseLabel) continue;
    const labels = artistLabelsByArtist.get(credit.artist_id) ?? new Set<LabelKey>();
    labels.add(releaseLabel);
    artistLabelsByArtist.set(credit.artist_id, labels);
  }

  const publicArtists = artistRows
    .filter((artist) => !isCollabArtistName(String(artist.name ?? "")))
    .filter((artist) => !isReleaseTitleArtistName(String(artist.name ?? "")))
    .map((artist) => {
      const artistLabelKeys = Array.from(artistLabelsByArtist.get(artist.id) ?? new Set<LabelKey>(["mbp"]));
      const displayLabel = selectedLabel ?? artistLabelKeys[0] ?? "mbp";
      const displayDetails = labelDetails(displayLabel);
      return {
        ...artist,
        name: String(artist.name ?? ""),
        mbp_region: normalizeMbpRegion(artist.mbp_region),
        mbp_region_label: mbpRegionDetails(artist.mbp_region).label,
        mbp_region_color: mbpRegionDetails(artist.mbp_region).color,
        release_label: displayDetails.key,
        release_label_name: displayDetails.name,
        release_label_short_name: displayDetails.shortName,
        release_label_color: displayDetails.color,
        labels: artistLabelKeys.map((key) => labelDetails(key)),
        profile: publicArtistProfile(artist),
        links: JSON.parse(String(artist.links_json ?? "[]")),
        is_featured: Boolean(artist.is_featured)
      };
    })
    .filter((artist) => !selectedLabel || (artist.labels ?? []).some((label) => label.key === selectedLabel))
    .sort((left, right) => artistSortRank(left) - artistSortRank(right) || String(left.name ?? "").localeCompare(String(right.name ?? "")));
  const publicReleases = releaseRows.map((release) => {
    const rawPlatformLinks = (links.results ?? []).filter((link) => link.release_id === release.id);
    const rawPlayableLinks = rawPlatformLinks.filter((link) => !/email|subscribe/i.test(`${link.platform ?? ""} ${link.label ?? ""}`));
    const platform_links = normalizeReleasePlatformLinks(rawPlatformLinks, {
      artistDisplay: String(release.artist_display ?? ""),
      title: String(release.title ?? ""),
      addSpotifyFallback: release.status !== "presave" && rawPlayableLinks.length > 0
    });
    const playableLinks = platform_links.filter(isPlayableReleaseLink);
    const storedRegion = normalizeMbpRegion(release.mbp_region);
    const linkedRegion = inferReleaseRegion(artistRegionsByRelease.get(release.id) ?? [], storedRegion);
    const releaseRegion = storedRegion !== "world" ? storedRegion : linkedRegion;
    const releaseLabel = labelFromCatalogNumber(release.catalog_number);
    const releaseLabelDetails = labelDetails(releaseLabel);
    return {
      ...release,
      mbp_region: releaseRegion,
      mbp_region_label: mbpRegionDetails(releaseRegion).label,
      mbp_region_color: mbpRegionDetails(releaseRegion).color,
      release_label: releaseLabelDetails.key,
      release_label_name: releaseLabelDetails.name,
      release_label_short_name: releaseLabelDetails.shortName,
      release_label_color: releaseLabelDetails.color,
      status: playableLinks.length > 0 ? "published" : "presave",
      platform_links
    };
  }).filter((release) => !selectedLabel || release.release_label === selectedLabel);

  if (view === "home") {
    const published = publicReleases.filter((release) => release.status !== "presave").slice(0, 4);
    const presaves = publicReleases.filter((release) => release.status === "presave").slice(0, 4);
    const regionCounts = Object.fromEntries(MBP_REGION_KEYS.map((region) => [region, 0]));
    for (const release of publicReleases) {
      const region = normalizeMbpRegion(release.mbp_region);
      regionCounts[region] = (regionCounts[region] ?? 0) + 1;
    }
    return json(
      {
        ok: true,
        artists: [],
        releases: published,
        presaves,
        counts: {
          artists: publicArtists.length,
          releases: publicReleases.length,
          published: publicReleases.filter((release) => release.status !== "presave").length,
          presaves: publicReleases.filter((release) => release.status === "presave").length,
          regions: MBP_REGION_KEYS.map((region) => ({
            key: region,
            label: mbpRegionDetails(region).label,
            color: mbpRegionDetails(region).color,
            releases: regionCounts[region] ?? 0
          }))
        }
      },
      { headers: cacheHeaders }
    );
  }

  return json({
    ok: true,
    artists: publicArtists,
    releases: publicReleases
  }, { headers: cacheHeaders });
};
