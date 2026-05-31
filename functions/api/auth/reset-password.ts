import {
  createSessionToken,
  hashPassword,
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

type ResetRow = {
  id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "artist";
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SESSION_SECRET) {
    return json({ ok: false, error: "SESSION_SECRET must be configured in Cloudflare." }, { status: 503 });
  }

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const token = requiredString(body.token, "token", 20, 500);
  const password = requiredString(body.password, "password", 8, 200);
  if (isResponse(token)) return token;
  if (isResponse(password)) return password;

  const tokenHash = await sha256Hex(token);
  const reset = await db
    .prepare("SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ? LIMIT 1")
    .bind(tokenHash)
    .first<ResetRow>();

  if (!reset) {
    return json({ ok: false, error: "Password reset link was not found." }, { status: 404 });
  }
  if (reset.used_at) {
    return json({ ok: false, error: "Password reset link was already used." }, { status: 409 });
  }
  if (Date.parse(reset.expires_at) < Date.now()) {
    return json({ ok: false, error: "Password reset link has expired." }, { status: 410 });
  }

  const user = await db.prepare("SELECT id, email, name, role FROM users WHERE id = ? LIMIT 1").bind(reset.user_id).first<UserRow>();
  if (!user) {
    return json({ ok: false, error: "Artist account no longer exists." }, { status: 404 });
  }

  const artistRows = await db.prepare("SELECT artist_id FROM user_artists WHERE user_id = ?").bind(user.id).all<{ artist_id: string }>();
  if ((artistRows.results ?? []).length === 0) {
    return json({ ok: false, error: "Password reset is available only for claimed artist accounts." }, { status: 403 });
  }

  await db
    .prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(await hashPassword(password), user.id)
    .run();
  await db.prepare("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reset.id).run();

  const sessionToken = await createSessionToken(env, {
    sub: user.id,
    role: user.role === "admin" ? "admin" : "artist",
    email: user.email,
    artistIds: (artistRows.results ?? []).map((row) => row.artist_id)
  });

  return json(
    { ok: true, role: user.role, name: user.name },
    {
      headers: {
        "set-cookie": setSessionCookie(sessionToken)
      }
    }
  );
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
