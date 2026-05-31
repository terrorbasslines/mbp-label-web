import {
  id,
  isResponse,
  json,
  methodNotAllowed,
  randomToken,
  readJson,
  requireDb,
  requiredString,
  sendPasswordResetEmail,
  sha256Hex,
  type Env
} from "../_shared";

type ClaimedUserRow = {
  id: string;
  email: string;
  name: string;
};

function siteOrigin(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const email = requiredString(body.email, "email", 5, 240);
  if (isResponse(email)) return email;

  const user = await db
    .prepare(
      `SELECT u.id, u.email, u.name
       FROM users u
       INNER JOIN user_artists ua ON ua.user_id = u.id
       WHERE lower(u.email) = lower(?)
       LIMIT 1`
    )
    .bind(email)
    .first<ClaimedUserRow>();

  if (!user) {
    return json({ ok: true, email: { sent: false, status: "account_not_claimed" } });
  }

  const rawToken = randomToken(36);
  const tokenHash = await sha256Hex(rawToken);
  const resetId = id("pwd");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();

  await db
    .prepare(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(resetId, user.id, tokenHash, expiresAt)
    .run();

  const resetUrl = `${siteOrigin(request)}/artist-dashboard/?reset=${encodeURIComponent(rawToken)}`;
  const emailResult = await sendPasswordResetEmail(env, { to: user.email, name: user.name, resetUrl });

  return json({ ok: true, email: emailResult });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
