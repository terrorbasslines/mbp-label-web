import {
  createSessionToken,
  isResponse,
  json,
  methodNotAllowed,
  readJson,
  requireDb,
  setSessionCookie,
  verifyPassword,
  type Env
} from "../_shared";

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "artist";
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SESSION_SECRET) {
    return json({ ok: false, error: "SESSION_SECRET must be configured in Cloudflare." }, { status: 503 });
  }

  const body = await readJson<{ email?: unknown; password?: unknown }>(request);
  if (body instanceof Response) return body;

  if (typeof body.password !== "string") {
    return json({ ok: false, error: "Password is required." }, { status: 400 });
  }

  if (typeof body.email === "string" && body.email.trim()) {
    const db = requireDb(env);
    if (isResponse(db)) return db;

    const user = await db
      .prepare("SELECT id, email, name, password_hash, role FROM users WHERE lower(email) = lower(?) LIMIT 1")
      .bind(body.email.trim())
      .first<UserRow>();

    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return json({ ok: false, error: "Invalid email or password." }, { status: 401 });
    }

    const artistRows = await db.prepare("SELECT artist_id FROM user_artists WHERE user_id = ?").bind(user.id).all<{ artist_id: string }>();
    const token = await createSessionToken(env, {
      sub: user.id,
      role: user.role === "admin" ? "admin" : "artist",
      email: user.email,
      artistIds: (artistRows.results ?? []).map((row) => row.artist_id)
    });
    return json(
      { ok: true, role: user.role, name: user.name },
      {
        headers: {
          "set-cookie": setSessionCookie(token)
        }
      }
    );
  }

  if (!env.ADMIN_PASSWORD) {
    return json({ ok: false, error: "ADMIN_PASSWORD must be configured in Cloudflare." }, { status: 503 });
  }

  if (body.password !== env.ADMIN_PASSWORD) {
    return json({ ok: false, error: "Invalid admin password." }, { status: 401 });
  }

  const token = await createSessionToken(env);
  return json(
    { ok: true, role: "admin", name: "Admin" },
    {
      headers: {
        "set-cookie": setSessionCookie(token)
      }
    }
  );
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
