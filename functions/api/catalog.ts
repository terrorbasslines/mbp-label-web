import { isResponse, json, requireDb, type Env } from "./_shared";

type ReleaseRow = Record<string, unknown> & { id: string };
type ArtistRow = Record<string, unknown> & { id: string; links_json?: string };
type LinkRow = Record<string, unknown> & { release_id: string };

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const db = requireDb(env);
  if (isResponse(db)) {
    return json({ ok: false, artists: [], releases: [], error: "D1 is not configured yet." });
  }

  const [artists, releases, links] = await Promise.all([
    db.prepare("SELECT * FROM artists ORDER BY is_featured DESC, name ASC").all<ArtistRow>(),
    db.prepare("SELECT * FROM releases WHERE status IN ('published', 'presave') ORDER BY catalog_number DESC").all<ReleaseRow>(),
    db.prepare("SELECT * FROM release_platform_links ORDER BY sort_order ASC").all<LinkRow>()
  ]);

  return json({
    ok: true,
    artists: (artists.results ?? []).map((artist) => ({
      ...artist,
      links: JSON.parse(String(artist.links_json ?? "[]")),
      is_featured: Boolean(artist.is_featured)
    })),
    releases: (releases.results ?? []).map((release) => ({
      ...release,
      platform_links: (links.results ?? []).filter((link) => link.release_id === release.id)
    }))
  });
};
