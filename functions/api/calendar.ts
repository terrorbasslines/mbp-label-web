import { isResponse, json, methodNotAllowed, requireDb, requireSession, type Env } from "./_shared";
import { normalizeBrand, normalizeSlotStatus, toDateString } from "./_agreements";

function defaultDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const url = new URL(request.url);
  const from = toDateString(url.searchParams.get("from")) ?? defaultDate(-30);
  const to = toDateString(url.searchParams.get("to")) ?? defaultDate(365);
  const brand = url.searchParams.get("brand");
  const status = url.searchParams.get("status");

  const clauses = ["release_date >= ?", "release_date <= ?"];
  const values: unknown[] = [from, to];
  if (brand) {
    clauses.push("brand = ?");
    values.push(normalizeBrand(brand));
  }
  if (status) {
    clauses.push("status = ?");
    values.push(normalizeSlotStatus(status));
  }

  try {
    const result = await db
      .prepare(`SELECT * FROM release_calendar_slots WHERE ${clauses.join(" AND ")} ORDER BY release_date ASC, brand ASC LIMIT 500`)
      .bind(...values)
      .all();

    return json({ ok: true, slots: result.results ?? [] });
  } catch (error) {
    console.warn("Unable to load release calendar.", error);
    return json({ ok: false, error: "Release calendar is not installed yet. Run D1 migration 0014." }, { status: 409 });
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET"]);
