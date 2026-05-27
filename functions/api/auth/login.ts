import { createSessionToken, json, methodNotAllowed, readJson, setSessionCookie, type Env } from "../_shared";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ ok: false, error: "ADMIN_PASSWORD and SESSION_SECRET must be configured in Cloudflare." }, { status: 503 });
  }

  const body = await readJson<{ password?: unknown }>(request);
  if (body instanceof Response) return body;

  if (typeof body.password !== "string" || body.password !== env.ADMIN_PASSWORD) {
    return json({ ok: false, error: "Invalid admin password." }, { status: 401 });
  }

  const token = await createSessionToken(env);
  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": setSessionCookie(token)
      }
    }
  );
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
