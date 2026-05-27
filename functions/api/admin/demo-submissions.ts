import { isResponse, json, requireAdmin, requireDb, type Env } from "../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const result = await db
    .prepare("SELECT * FROM demo_submissions ORDER BY created_at DESC LIMIT 200")
    .all<Record<string, unknown>>();

  return json({ ok: true, submissions: result.results ?? [] });
};
