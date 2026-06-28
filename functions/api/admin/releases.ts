import { id, isResponse, json, methodNotAllowed, normalizeMbpRegion, optionalString, readJson, requireAdmin, requireDb, requiredString, slugify, syncReleaseArtistCredits, type Env } from "../_shared";
import { labelDetails, labelFromCatalogNumber } from "../_labels";
import { isPlayableReleaseLink, normalizeReleasePlatformLinks } from "../_release_links";

type ReleaseRow = {
  id: string;
  catalog_number: string;
  slug: string;
  title: string;
  artist_display: string;
  primary_artist_id: string | null;
  release_date: string | null;
  release_type: string;
  genre: string | null;
  artwork_url: string | null;
  ffm_url: string | null;
  presave_url: string | null;
  status: string;
  mbp_region: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

async function replaceLinks(db: D1Database, releaseId: string, links: unknown) {
  await db.prepare("DELETE FROM release_platform_links WHERE release_id = ?").bind(releaseId).run();
  if (!Array.isArray(links)) return;

  const normalizedLinks = normalizeReleasePlatformLinks(links as Record<string, unknown>[]);
  for (let index = 0; index < normalizedLinks.length; index += 1) {
    const link = normalizedLinks[index];
    await db
      .prepare(
        `INSERT INTO release_platform_links (id, release_id, platform, label, url, is_playable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id("lnk"),
        releaseId,
        link.platform,
        link.label,
        link.url,
        link.is_playable === false ? 0 : 1,
        index
      )
      .run();
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const releases = await db
    .prepare("SELECT * FROM releases ORDER BY catalog_number DESC, created_at DESC")
    .all<ReleaseRow>();
  const links = await db
    .prepare("SELECT * FROM release_platform_links ORDER BY sort_order ASC")
    .all<Record<string, unknown>>();

  return json({
    ok: true,
    releases: (releases.results ?? []).map((release) => {
      const rawPlatformLinks = (links.results ?? []).filter((link) => link.release_id === release.id);
      const platformLinks = normalizeReleasePlatformLinks(rawPlatformLinks);
      const playableLinks = platformLinks.filter(isPlayableReleaseLink);
      const releaseLabel = labelDetails(labelFromCatalogNumber(release.catalog_number));
      return {
        ...release,
        release_label: releaseLabel.key,
        release_label_name: releaseLabel.name,
        release_label_short_name: releaseLabel.shortName,
        release_label_color: releaseLabel.color,
        status: playableLinks.length > 0 ? "published" : "presave",
        platform_links: platformLinks
      };
    })
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const catalogNumber = requiredString(body.catalog_number, "catalog_number", 3, 24);
  const title = requiredString(body.title, "title", 1, 240);
  const artistDisplay = requiredString(body.artist_display, "artist_display", 1, 240);
  if (isResponse(catalogNumber)) return catalogNumber;
  if (isResponse(title)) return title;
  if (isResponse(artistDisplay)) return artistDisplay;

  const releaseId = id("rel");
  const slug = slugify(optionalString(body.slug, 120) ?? `${catalogNumber}-${artistDisplay}-${title}`);
  const primaryArtistId = optionalString(body.primary_artist_id, 120);

  await db
    .prepare(
      `INSERT INTO releases
       (id, catalog_number, slug, title, artist_display, primary_artist_id, release_date, release_type, genre, artwork_url, ffm_url, presave_url, status, mbp_region, description, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(
      releaseId,
      catalogNumber.toUpperCase(),
      slug,
      title,
      artistDisplay,
      primaryArtistId,
      optionalString(body.release_date, 40),
      optionalString(body.release_type, 60) ?? "single",
      optionalString(body.genre, 120),
      optionalString(body.artwork_url, 2000),
      optionalString(body.ffm_url, 2000),
      optionalString(body.presave_url, 2000),
      optionalString(body.status, 40) ?? "published",
      normalizeMbpRegion(body.mbp_region),
      optionalString(body.description, 4000)
    )
    .run();

  const credits = await syncReleaseArtistCredits(db, releaseId, artistDisplay, primaryArtistId, optionalString(body.ffm_url, 2000));
  await db.prepare("UPDATE releases SET primary_artist_id = ? WHERE id = ?").bind(credits.primaryArtistId, releaseId).run();
  await replaceLinks(db, releaseId, body.platform_links);

  return json({ ok: true, release: { id: releaseId, catalog_number: catalogNumber.toUpperCase(), slug, title } }, { status: 201 });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
