import { json, methodNotAllowed, verifySession, type Env } from "../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await verifySession(request, env);
  return json({ ok: true, authenticated: Boolean(session), session });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET"]);
