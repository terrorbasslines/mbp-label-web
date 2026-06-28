import { id, inferMbpRegionFromArtistName, inferMbpRegionFromCountry, isCollabArtistName, isReleaseTitleArtistName, isResponse, json, methodNotAllowed, normalizeMbpRegion, optionalString, readJson, requireAdmin, requireDb, requiredString, slugify, type Env } from "../_shared";
import { labelDetails, labelFromCatalogNumber, type LabelKey } from "../_labels";

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

type ArtistReleaseLabelRow = {
  artist_id: string;
  catalog_number: string;
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
  const artistReleaseLabelResult = await db
    .prepare(
      `SELECT ra.artist_id, r.catalog_number
       FROM release_artists ra
       INNER JOIN releases r ON r.id = ra.release_id`
    )
    .all<ArtistReleaseLabelRow>();
  const claimsByArtist = new Map((claimResult.results ?? []).map((claim) => [claim.artist_id, claim]));
  const labelsByArtist = new Map<string, Set<LabelKey>>();
  for (const row of artistReleaseLabelResult.results ?? []) {
    const labels = labelsByArtist.get(row.artist_id) ?? new Set<LabelKey>();
    labels.add(labelFromCatalogNumber(row.catalog_number));
    labelsByArtist.set(row.artist_id, labels);
  }

  return json({
    ok: true,
    artists: (result.results ?? [])
      .filter((artist) => !isCollabArtistName(artist.name))
      .filter((artist) => !isReleaseTitleArtistName(artist.name))
      .map((artist) => {
        const claim = claimsByArtist.get(artist.id);
        const artistLabels = Array.from(labelsByArtist.get(artist.id) ?? new Set<LabelKey>(["mbp"]));
        const primaryLabel = labelDetails(artistLabels[0] ?? "mbp");
        return {
          ...artist,
          links: JSON.parse(artist.links_json || "[]"),
          is_featured: Boolean(artist.is_featured),
          release_label: primaryLabel.key,
          release_label_name: primaryLabel.name,
          release_label_short_name: primaryLabel.shortName,
          release_label_color: primaryLabel.color,
          labels: artistLabels.map((label) => labelDetails(label)),
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
