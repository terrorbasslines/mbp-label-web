import { id, inferMbpRegionFromArtistName, inferMbpRegionFromCountry, isCollabArtistName, isResponse, json, methodNotAllowed, normalizeMbpRegion, optionalString, readJson, requireAdmin, requireDb, requiredString, slugify, type Env } from "../_shared";

type ArtistRow = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  profile: string | null;
  image_url: string | null;
  links_json: string;
  is_featured: number;
  mbp_region: string;
  created_at: string;
  updated_at: string;
};

type ArtistClaimRow = {
  artist_id: string;
  email: string;
  role: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const result = await db.prepare("SELECT * FROM artists ORDER BY name ASC").all<ArtistRow>();
  const claimResult = await db
    .prepare(
      `SELECT ua.artist_id, u.email, u.role
       FROM user_artists ua
       INNER JOIN users u ON u.id = ua.user_id`
    )
    .all<ArtistClaimRow>();
  const claimsByArtist = new Map((claimResult.results ?? []).map((claim) => [claim.artist_id, claim]));

  return json({
    ok: true,
    artists: (result.results ?? [])
      .filter((artist) => !isCollabArtistName(artist.name))
      .map((artist) => {
        const claim = claimsByArtist.get(artist.id);
        return {
          ...artist,
          links: JSON.parse(artist.links_json || "[]"),
          is_featured: Boolean(artist.is_featured),
          claimed: Boolean(claim),
          claimed_email: claim?.email ?? null,
          claimed_role: claim?.role ?? null
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

  const name = requiredString(body.name, "name", 2, 160);
  if (isResponse(name)) return name;

  const artistId = id("art");
  const slug = slugify(optionalString(body.slug, 120) ?? name);
  const links = Array.isArray(body.links) ? body.links : [];
  const country = optionalString(body.country, 120);
  const mbpRegion = normalizeMbpRegion(body.mbp_region, inferMbpRegionFromCountry(country, inferMbpRegionFromArtistName(name)));

  await db
    .prepare(
      `INSERT INTO artists (id, slug, name, country, profile, image_url, links_json, is_featured, mbp_region, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(
      artistId,
      slug,
      name,
      country,
      optionalString(body.profile, 4000),
      optionalString(body.image_url, 2000),
      JSON.stringify(links),
      body.is_featured ? 1 : 0,
      mbpRegion
    )
    .run();

  return json({ ok: true, artist: { id: artistId, slug, name } }, { status: 201 });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
