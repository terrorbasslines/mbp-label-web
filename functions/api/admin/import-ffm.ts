import { catalogNumberFromIndex, parseFfmRelease } from "../_ffm";
import { id, inferReleaseRegion, isResponse, json, methodNotAllowed, readJson, requireAdmin, requireDb, slugify, syncReleaseArtistCredits, type Env } from "../_shared";

async function releaseRegionFromCredits(db: D1Database, releaseId: string) {
  const regions = await db
    .prepare(
      `SELECT a.mbp_region
       FROM release_artists ra
       INNER JOIN artists a ON a.id = ra.artist_id
       WHERE ra.release_id = ?`
    )
    .bind(releaseId)
    .all<{ mbp_region: string }>();
  return inferReleaseRegion((regions.results ?? []).map((row) => row.mbp_region));
}

async function upsertParsedRelease(db: D1Database, parsed: NonNullable<ReturnType<typeof parseFfmRelease>>) {
  let release = await db.prepare("SELECT id FROM releases WHERE catalog_number = ?").bind(parsed.catalogNumber).first<{ id: string }>();
  const releaseId = release?.id ?? id("rel");
  const slug = slugify(`${parsed.catalogNumber}-${parsed.artist}-${parsed.trackTitle}`);

  if (release) {
    await db
      .prepare(
        `UPDATE releases
         SET slug = ?, title = ?, artist_display = ?, primary_artist_id = ?, release_type = 'single', artwork_url = ?,
             ffm_url = ?, presave_url = ?, status = ?, mbp_region = 'world', description = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(slug, parsed.trackTitle, parsed.artist, null, parsed.artworkUrl, parsed.ffmUrl, parsed.ffmUrl, parsed.status, parsed.description, releaseId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO releases
         (id, catalog_number, slug, title, artist_display, primary_artist_id, release_type, artwork_url, ffm_url, presave_url, status, mbp_region, description, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'single', ?, ?, ?, ?, 'world', ?, CURRENT_TIMESTAMP)`
      )
      .bind(releaseId, parsed.catalogNumber, slug, parsed.trackTitle, parsed.artist, null, parsed.artworkUrl, parsed.ffmUrl, parsed.ffmUrl, parsed.status, parsed.description)
      .run();
  }

  const credits = await syncReleaseArtistCredits(db, releaseId, parsed.artist, null, parsed.ffmUrl);
  const mbpRegion = await releaseRegionFromCredits(db, releaseId);
  await db.prepare("UPDATE releases SET primary_artist_id = ?, mbp_region = ? WHERE id = ?").bind(credits.primaryArtistId, mbpRegion, releaseId).run();
  await db.prepare("DELETE FROM release_platform_links WHERE release_id = ?").bind(releaseId).run();

  for (let index = 0; index < parsed.platformLinks.length; index += 1) {
    const link = parsed.platformLinks[index];
    await db
      .prepare(
        `INSERT INTO release_platform_links (id, release_id, platform, label, url, is_playable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id("lnk"), releaseId, link.platform, link.label, link.url, link.is_playable ? 1 : 0, index)
      .run();
  }

  return { releaseId, artistId: credits.primaryArtistId, linkedArtists: credits.linkedArtists, platformLinks: parsed.platformLinks.length };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const from = Number(body.from);
  const to = Number(body.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return json({ ok: false, error: "from and to must be valid MBP numeric ranges." }, { status: 400 });
  }
  if (to > 1000) {
    return json({ ok: false, error: "FFM import is limited to MBP1000 for this dashboard." }, { status: 400 });
  }
  if (to - from > 24) {
    return json({ ok: false, error: "Import max 25 releases at a time to avoid Cloudflare timeout. Run multiple batches." }, { status: 400 });
  }

  const imported = [];
  const skipped = [];

  for (let index = from; index <= to; index += 1) {
    const catalogNumber = catalogNumberFromIndex(index);
    const ffmUrl = `https://ffm.to/${catalogNumber.toLowerCase()}`;
    const response = await fetch(ffmUrl, { headers: { "user-agent": "The MasterBeat Project catalog importer" } });
    if (!response.ok) {
      skipped.push({ catalogNumber, status: response.status });
      continue;
    }

    const html = await response.text();
    const parsed = parseFfmRelease(catalogNumber, ffmUrl, html);
    if (!parsed) {
      skipped.push({ catalogNumber, status: "not_found" });
      continue;
    }

    const saved = await upsertParsedRelease(db, parsed);
    imported.push({ catalogNumber, title: parsed.title, artist: parsed.artist, trackTitle: parsed.trackTitle, ...saved });
  }

  return json({ ok: true, imported, skipped });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
