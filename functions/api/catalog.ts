import { isCollabArtistName, isResponse, json, requireDb, type Env } from "./_shared";
import { parseFfmRelease } from "./_ffm";

type ReleaseRow = Record<string, unknown> & { id: string };
type ArtistRow = Record<string, unknown> & { id: string; links_json?: string };
type LinkRow = Record<string, unknown> & { release_id: string };
type RefreshCandidate = ReleaseRow & {
  catalog_number: string;
  ffm_url?: string | null;
};

const MANAGEMENT_PROFILES = new Map([
  ["terror basslines", "CEO of The MasterBeat Project, leading label strategy, catalogue direction and MBP brand development."],
  ["romee storm", "A&R for The MasterBeat Project, focused on artist relations, demo review and release development."],
  ["alexair", "A&R for The MasterBeat Project, focused on roster scouting, music feedback and catalogue quality control."],
  ["rodrigo stadt", "MBP Ambassador representing The MasterBeat Project community, label presence and artist support."]
]);

function publicArtistProfile(artist: ArtistRow) {
  const name = String(artist.name ?? "").toLowerCase();
  const profile = String(artist.profile ?? "");
  if (profile && !profile.toLowerCase().startsWith("imported from ")) return profile;
  return MANAGEMENT_PROFILES.get(name) ?? null;
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const db = requireDb(env);
  if (isResponse(db)) {
    return json({ ok: false, artists: [], releases: [], error: "D1 is not configured yet." });
  }

  waitUntil(refreshPresaveCandidates(db));

  const [artists, releases, links] = await Promise.all([
    db.prepare("SELECT * FROM artists ORDER BY is_featured DESC, name ASC").all<ArtistRow>(),
    db.prepare("SELECT * FROM releases WHERE status IN ('published', 'presave') ORDER BY catalog_number DESC").all<ReleaseRow>(),
    db.prepare("SELECT * FROM release_platform_links ORDER BY sort_order ASC").all<LinkRow>()
  ]);
  const url = new URL(request.url);
  const view = url.searchParams.get("view");
  const cacheHeaders = {
    "cache-control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600"
  };
  const publicArtists = (artists.results ?? [])
    .filter((artist) => !isCollabArtistName(String(artist.name ?? "")))
    .map((artist) => ({
      ...artist,
      profile: publicArtistProfile(artist),
      links: JSON.parse(String(artist.links_json ?? "[]")),
      is_featured: Boolean(artist.is_featured)
    }));
  const publicReleases = (releases.results ?? []).map((release) => {
    const platform_links = (links.results ?? []).filter((link) => link.release_id === release.id);
    return {
      ...release,
      status: release.status === "presave" || platform_links.length === 0 ? "presave" : release.status,
      platform_links
    };
  });

  if (view === "home") {
    const published = publicReleases.filter((release) => release.status !== "presave").slice(0, 4);
    const presaves = publicReleases.filter((release) => release.status === "presave").slice(0, 4);
    return json({ ok: true, artists: [], releases: published, presaves }, { headers: cacheHeaders });
  }

  return json({
    ok: true,
    artists: publicArtists,
    releases: publicReleases
  }, { headers: cacheHeaders });
};
