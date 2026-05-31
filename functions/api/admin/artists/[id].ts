import { inferMbpRegionFromArtistName, inferMbpRegionFromCountry, isResponse, json, methodNotAllowed, normalizeMbpRegion, optionalString, readJson, requireAdmin, requireDb, requiredString, slugify, type Env } from "../../_shared";

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const name = requiredString(body.name, "name", 2, 160);
  if (isResponse(name)) return name;

  const links = Array.isArray(body.links) ? body.links : [];
  const slug = slugify(optionalString(body.slug, 120) ?? name);
  const country = optionalString(body.country, 120);
  const mbpRegion = normalizeMbpRegion(body.mbp_region, inferMbpRegionFromCountry(country, inferMbpRegionFromArtistName(name)));

  await db
    .prepare(
      `UPDATE artists
       SET slug = ?, name = ?, country = ?, profile = ?, image_url = ?, links_json = ?, is_featured = ?, mbp_region = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
      slug,
      name,
      country,
      optionalString(body.profile, 4000),
      optionalString(body.image_url, 2000),
      JSON.stringify(links),
      body.is_featured ? 1 : 0,
      mbpRegion,
      params.id
    )
    .run();

  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  await db.prepare("DELETE FROM artists WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["PUT", "DELETE"]);
