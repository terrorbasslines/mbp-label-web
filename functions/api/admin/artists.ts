import { id, isCollabArtistName, isResponse, json, methodNotAllowed, optionalString, readJson, requireAdmin, requireDb, requiredString, slugify, type Env } from "../_shared";

type ArtistRow = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  profile: string | null;
  image_url: string | null;
  links_json: string;
  is_featured: number;
  created_at: string;
  updated_at: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const result = await db.prepare("SELECT * FROM artists ORDER BY name ASC").all<ArtistRow>();
  return json({
    ok: true,
    artists: (result.results ?? [])
      .filter((artist) => !isCollabArtistName(artist.name))
      .map((artist) => ({
        ...artist,
        links: JSON.parse(artist.links_json || "[]"),
        is_featured: Boolean(artist.is_featured)
      }))
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const name = requiredString(body.name, "name", 2, 160);
  if (isResponse(name)) return name;

  const artistId = id("art");
  const slug = slugify(optionalString(body.slug, 120) ?? name);
  const links = Array.isArray(body.links) ? body.links : [];

  await db
    .prepare(
      `INSERT INTO artists (id, slug, name, country, profile, image_url, links_json, is_featured, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(
      artistId,
      slug,
      name,
      optionalString(body.country, 120),
      optionalString(body.profile, 4000),
      optionalString(body.image_url, 2000),
      JSON.stringify(links),
      body.is_featured ? 1 : 0
    )
    .run();

  return json({ ok: true, artist: { id: artistId, slug, name } }, { status: 201 });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
