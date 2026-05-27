import {
  createSessionToken,
  hashPassword,
  id,
  isResponse,
  json,
  methodNotAllowed,
  readJson,
  requireDb,
  requiredString,
  setSessionCookie,
  sha256Hex,
  type Env
} from "../_shared";

type ClaimRow = {
  id: string;
  artist_id: string;
  email: string | null;
  role: "admin" | "artist";
  expires_at: string;
  claimed_at: string | null;
};

type ArtistRow = {
  slug: string;
  name: string;
};

type UserRow = {
  id: string;
};

type ClaimedArtistRow = {
  user_id: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.SESSION_SECRET) {
      return json({ ok: false, error: "SESSION_SECRET must be configured in Cloudflare." }, { status: 503 });
    }

    const db = requireDb(env);
    if (isResponse(db)) return db;

    const body = await readJson<Record<string, unknown>>(request);
    if (body instanceof Response) return body;

    const token = requiredString(body.token, "token", 20, 500);
    const email = requiredString(body.email, "email", 5, 240);
    const name = requiredString(body.name, "name", 2, 160);
    const password = requiredString(body.password, "password", 8, 200);
    if (isResponse(token)) return token;
    if (isResponse(email)) return email;
    if (isResponse(name)) return name;
    if (isResponse(password)) return password;

    const tokenHash = await sha256Hex(token);
    const claim = await db
      .prepare("SELECT id, artist_id, email, role, expires_at, claimed_at FROM artist_claim_tokens WHERE token_hash = ? LIMIT 1")
      .bind(tokenHash)
      .first<ClaimRow>();

    if (!claim) {
      return json({ ok: false, error: "Claim invitation was not found." }, { status: 404 });
    }
    if (claim.claimed_at) {
      return json({ ok: false, error: "Claim invitation was already used." }, { status: 409 });
    }
    if (Date.parse(claim.expires_at) < Date.now()) {
      return json({ ok: false, error: "Claim invitation has expired." }, { status: 410 });
    }
    if (claim.email && claim.email.toLowerCase() !== email.toLowerCase()) {
      return json({ ok: false, error: "This invitation was issued for a different email address." }, { status: 403 });
    }

    const artist = await db.prepare("SELECT slug, name FROM artists WHERE id = ? LIMIT 1").bind(claim.artist_id).first<ArtistRow>();
    if (!artist) {
      return json({ ok: false, error: "Artist profile for this invitation no longer exists." }, { status: 404 });
    }

    const claimedArtist = await db.prepare("SELECT user_id FROM user_artists WHERE artist_id = ? LIMIT 1").bind(claim.artist_id).first<ClaimedArtistRow>();
    if (claimedArtist) {
      return json({ ok: false, error: "This artist profile is already claimed." }, { status: 409 });
    }

    const existing = await db.prepare("SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1").bind(email).first<UserRow>();
    if (existing) {
      return json({ ok: false, error: "This email already has an account. Ask an admin for account linking." }, { status: 409 });
    }

    const userId = id("usr");
    const passwordHash = await hashPassword(password);

    await db
      .prepare("INSERT INTO users (id, email, password_hash, name, role, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(userId, email.toLowerCase(), passwordHash, name, claim.role)
      .run();
    await db
      .prepare("INSERT OR IGNORE INTO user_artists (user_id, artist_id, role) VALUES (?, ?, 'owner')")
      .bind(userId, claim.artist_id)
      .run();
    await db.prepare("UPDATE artist_claim_tokens SET claimed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(claim.id).run();

    const sessionToken = await createSessionToken(env, {
      sub: userId,
      role: claim.role,
      email: email.toLowerCase(),
      artistIds: [claim.artist_id]
    });

    return json(
      { ok: true, artist: { id: claim.artist_id, slug: artist.slug, name: artist.name }, role: claim.role },
      {
        headers: {
          "set-cookie": setSessionCookie(sessionToken)
        }
      }
    );
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? `Claim registration failed: ${error.message}` : "Claim registration failed."
      },
      { status: 500 }
    );
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
