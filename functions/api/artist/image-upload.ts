import { isResponse, json, methodNotAllowed, optionalString, requireDb, requireSession, type Env } from "../_shared";

function safeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function canEditArtist(db: D1Database, userId: string, artistId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const row = await db
    .prepare("SELECT user_id FROM user_artists WHERE user_id = ? AND artist_id = ? LIMIT 1")
    .bind(userId, artistId)
    .first();
  return Boolean(row);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  if (!env.DEMO_BUCKET) {
    return json({ ok: false, error: "Cloudflare R2 binding DEMO_BUCKET is not configured for image uploads." }, { status: 503 });
  }

  const formData = await request.formData();
  const artistId = optionalString(formData.get("artist_id"), 160);
  const image = formData.get("image");
  if (!artistId) return json({ ok: false, error: "artist_id is required." }, { status: 400 });
  if (!(await canEditArtist(db, session.sub, artistId, session.role === "admin"))) {
    return json({ ok: false, error: "You do not have access to this artist profile." }, { status: 403 });
  }
  if (!(image instanceof File) || image.size === 0) {
    return json({ ok: false, error: "Choose an image file to upload." }, { status: 400 });
  }
  if (!image.type.startsWith("image/")) {
    return json({ ok: false, error: "Artist profile upload must be an image file." }, { status: 400 });
  }
  if (image.size > 10 * 1024 * 1024) {
    return json({ ok: false, error: "Image upload is too large. Maximum size is 10 MB." }, { status: 400 });
  }

  const fileName = `${artistId}-${crypto.randomUUID()}-${safeFileName(image.name || "artist-image")}`;
  const key = `artist-images/${fileName}`;
  await env.DEMO_BUCKET.put(key, image.stream(), {
    httpMetadata: { contentType: image.type || "application/octet-stream" },
    customMetadata: {
      artistId,
      originalName: image.name
    }
  });

  return json({ ok: true, url: `/media/artist-images/${encodeURIComponent(fileName)}`, key });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
