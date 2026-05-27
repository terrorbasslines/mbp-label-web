import {
  isResponse,
  json,
  methodNotAllowed,
  optionalString,
  readJson,
  requireDb,
  requireSession,
  slugify,
  type Env
} from "../_shared";

type ArtistRow = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  profile: string | null;
  image_url: string | null;
  links_json: string;
  is_featured: number;
};

function parseLinks(value: string) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function canEditArtist(db: D1Database, userId: string, artistId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const row = await db
    .prepare("SELECT user_id FROM user_artists WHERE user_id = ? AND artist_id = ? LIMIT 1")
    .bind(userId, artistId)
    .first();
  return Boolean(row);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const url = new URL(request.url);
  const requestedArtistId = url.searchParams.get("artist_id");
  const artistId = requestedArtistId || session.artistIds?.[0];
  if (!artistId) {
    return json({ ok: true, artists: [] });
  }
  if (!(await canEditArtist(db, session.sub, artistId, session.role === "admin"))) {
    return json({ ok: false, error: "You do not have access to this artist profile." }, { status: 403 });
  }

  const artist = await db.prepare("SELECT * FROM artists WHERE id = ? LIMIT 1").bind(artistId).first<ArtistRow>();
  if (!artist) return json({ ok: false, error: "Artist not found." }, { status: 404 });

  return json({
    ok: true,
    artist: {
      ...artist,
      links: parseLinks(artist.links_json),
      is_featured: Boolean(artist.is_featured)
    }
  });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const artistId = optionalString(body.artist_id, 160);
  if (!artistId) return json({ ok: false, error: "artist_id is required." }, { status: 400 });
  if (!(await canEditArtist(db, session.sub, artistId, session.role === "admin"))) {
    return json({ ok: false, error: "You do not have access to this artist profile." }, { status: 403 });
  }

  const existing = await db.prepare("SELECT * FROM artists WHERE id = ? LIMIT 1").bind(artistId).first<ArtistRow>();
  if (!existing) return json({ ok: false, error: "Artist not found." }, { status: 404 });

  const name = optionalString(body.name, 160) || existing.name;
  const slug = optionalString(body.slug, 120) ? slugify(String(body.slug)) : existing.slug;
  const links = Array.isArray(body.links) ? body.links : parseLinks(existing.links_json);

  await db
    .prepare(
      `UPDATE artists
       SET slug = ?, name = ?, country = ?, profile = ?, image_url = ?, links_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
      slug,
      name,
      optionalString(body.country, 120),
      optionalString(body.profile, 4000),
      optionalString(body.image_url, 2000),
      JSON.stringify(links),
      artistId
    )
    .run();

  return json({ ok: true, artist: { id: artistId, slug, name } });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "PUT"]);
