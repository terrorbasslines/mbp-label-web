import { isResponse, json, methodNotAllowed, normalizeMbpRegion, optionalString, readJson, requireAdmin, requireDb, requiredString, slugify, syncReleaseArtistCredits, type Env } from "../../_shared";

async function replaceLinks(db: D1Database, releaseId: string, links: unknown) {
  await db.prepare("DELETE FROM release_platform_links WHERE release_id = ?").bind(releaseId).run();
  if (!Array.isArray(links)) return;

  for (let index = 0; index < links.length; index += 1) {
    const link = links[index] as Record<string, unknown>;
    if (typeof link.url !== "string" || typeof link.platform !== "string") continue;
    await db
      .prepare(
        `INSERT INTO release_platform_links (id, release_id, platform, label, url, is_playable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `lnk_${crypto.randomUUID().replace(/-/g, "")}`,
        releaseId,
        link.platform.trim().toLowerCase(),
        typeof link.label === "string" && link.label.trim() ? link.label.trim() : link.platform.trim(),
        link.url.trim(),
        link.is_playable === false ? 0 : 1,
        index
      )
      .run();
  }
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
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

  const primaryArtistId = optionalString(body.primary_artist_id, 120);
  const slug = slugify(optionalString(body.slug, 120) ?? `${catalogNumber}-${artistDisplay}-${title}`);

  await db
    .prepare(
      `UPDATE releases
       SET catalog_number = ?, slug = ?, title = ?, artist_display = ?, primary_artist_id = ?, release_date = ?,
           release_type = ?, genre = ?, artwork_url = ?, ffm_url = ?, presave_url = ?, status = ?, mbp_region = ?, description = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
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
      optionalString(body.description, 4000),
      params.id
    )
    .run();

  const credits = await syncReleaseArtistCredits(db, String(params.id), artistDisplay, primaryArtistId, optionalString(body.ffm_url, 2000));
  await db.prepare("UPDATE releases SET primary_artist_id = ? WHERE id = ?").bind(credits.primaryArtistId, params.id).run();
  await replaceLinks(db, String(params.id), body.platform_links);

  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  await db.prepare("DELETE FROM releases WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["PUT", "DELETE"]);
