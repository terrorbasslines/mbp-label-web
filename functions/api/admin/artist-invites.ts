import {
  isResponse,
  json,
  methodNotAllowed,
  optionalString,
  randomToken,
  readJson,
  requireAdmin,
  requireDb,
  requiredString,
  sendArtistInviteEmail,
  sha256Hex,
  type Env
} from "../_shared";

type ArtistRow = {
  id: string;
  name: string;
  slug: string;
};

type ExistingClaimRow = {
  email: string;
  role: string;
};

const MANAGEMENT_ADMIN_NAMES = new Set(["romee storm", "alexair", "rodrigo stadt"]);

function siteOrigin(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const result = await db
    .prepare(
      `SELECT t.id, t.email, t.role, t.expires_at, t.claimed_at, t.created_at, a.name AS artist_name, a.slug AS artist_slug
       FROM artist_claim_tokens t
       INNER JOIN artists a ON a.id = t.artist_id
       ORDER BY t.created_at DESC
       LIMIT 100`
    )
    .all<Record<string, unknown>>();

  return json({ ok: true, invites: result.results ?? [] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const artistId = requiredString(body.artist_id, "artist_id", 3, 160);
  if (isResponse(artistId)) return artistId;

  const artist = await db.prepare("SELECT id, name, slug FROM artists WHERE id = ? LIMIT 1").bind(artistId).first<ArtistRow>();
  if (!artist) {
    return json({ ok: false, error: "Artist not found." }, { status: 404 });
  }

  const existingClaim = await db
    .prepare(
      `SELECT u.email, u.role
       FROM user_artists ua
       INNER JOIN users u ON u.id = ua.user_id
       WHERE ua.artist_id = ?
       LIMIT 1`
    )
    .bind(artist.id)
    .first<ExistingClaimRow>();
  if (existingClaim) {
    return json(
      {
        ok: false,
        error: `Artist profile is already claimed by ${existingClaim.email} (${existingClaim.role}).`
      },
      { status: 409 }
    );
  }

  const forcedAdmin = MANAGEMENT_ADMIN_NAMES.has(artist.name.toLowerCase());
  const role = forcedAdmin || body.role === "admin" ? "admin" : "artist";
  const rawToken = randomToken(36);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const inviteId = crypto.randomUUID();
  const email = optionalString(body.email, 240);

  await db
    .prepare(
      `INSERT INTO artist_claim_tokens (id, artist_id, email, token_hash, role, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(inviteId, artist.id, email, tokenHash, role, expiresAt, admin.sub)
    .run();

  const claimUrl = `${siteOrigin(request)}/claim-artist?token=${encodeURIComponent(rawToken)}`;
  const emailResult = email
    ? await sendArtistInviteEmail(env, { to: email, artistName: artist.name, claimUrl, role })
    : { sent: false, status: "email_not_requested" };

  return json(
    {
      ok: true,
      invite: {
        id: inviteId,
        artist_id: artist.id,
        artist_name: artist.name,
        artist_slug: artist.slug,
        role,
        expires_at: expiresAt,
        claim_url: claimUrl
      },
      email: emailResult
    },
    { status: 201 }
  );
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
