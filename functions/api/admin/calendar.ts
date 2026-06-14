import {
  id,
  isResponse,
  json,
  methodNotAllowed,
  optionalString,
  readJson,
  requireAdmin,
  requireDb,
  type Env
} from "../_shared";
import { calendarDeadlines, normalizeBrand, normalizeSlotStatus, toDateString } from "../_agreements";

function defaultDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function listSlots(db: D1Database, request: Request) {
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

  const result = await db
    .prepare(`SELECT * FROM release_calendar_slots WHERE ${clauses.join(" AND ")} ORDER BY release_date ASC, brand ASC LIMIT 800`)
    .bind(...values)
    .all();
  return result.results ?? [];
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    return json({ ok: true, slots: await listSlots(db, request) });
  } catch (error) {
    console.warn("Unable to load admin calendar.", error);
    return json({ ok: false, error: "Release calendar is not installed yet. Run D1 migration 0014." }, { status: 409 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const action = optionalString(body.action, 80) ?? "save_slot";

  if (action === "delete_slot") {
    const slotId = optionalString(body.id, 160);
    if (!slotId) return json({ ok: false, error: "slot id is required." }, { status: 400 });
    await db.prepare("DELETE FROM release_calendar_slots WHERE id = ?").bind(slotId).run();
    return json({ ok: true });
  }

  if (action === "generate_slots") {
    const brand = normalizeBrand(body.brand);
    const from = toDateString(body.from);
    const to = toDateString(body.to);
    if (!from || !to) return json({ ok: false, error: "from and to dates are required." }, { status: 400 });

    const weekdays = new Set(
      String(body.weekdays ?? "1,4")
        .split(",")
        .map((day) => Number(day.trim()))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    );
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    let created = 0;

    while (cursor <= end) {
      if (weekdays.has(cursor.getUTCDay())) {
        const releaseDate = cursor.toISOString().slice(0, 10);
        const deadlines = calendarDeadlines(releaseDate);
        const slotId = id("slot");
        const result = await db
          .prepare(
            `INSERT OR IGNORE INTO release_calendar_slots
             (id, brand, release_date, status, max_releases, current_release_count, agreement_deadline, asset_deadline,
              distributor_delivery_deadline, promo_start_date, updated_at)
             VALUES (?, ?, ?, 'available', 1, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
          )
          .bind(
            slotId,
            brand,
            releaseDate,
            deadlines.agreement_deadline,
            deadlines.asset_deadline,
            deadlines.distributor_delivery_deadline,
            deadlines.promo_start_date
          )
          .run();
        created += result.meta.changes ?? 0;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return json({ ok: true, created });
  }

  const releaseDate = toDateString(body.release_date);
  if (!releaseDate) return json({ ok: false, error: "release_date is required." }, { status: 400 });

  const slotId = optionalString(body.id, 160) ?? id("slot");
  const brand = normalizeBrand(body.brand);
  const status = normalizeSlotStatus(body.status);
  const maxReleases = Math.max(1, Math.min(10, Number(body.max_releases ?? 1) || 1));
  const deadlines = calendarDeadlines(releaseDate);

  await db
    .prepare(
      `INSERT INTO release_calendar_slots
       (id, brand, release_date, status, max_releases, current_release_count, agreement_deadline, asset_deadline,
        distributor_delivery_deadline, promo_start_date, artist_name, track_title, catalog_number, internal_notes, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
        brand = excluded.brand,
        release_date = excluded.release_date,
        status = excluded.status,
        max_releases = excluded.max_releases,
        agreement_deadline = excluded.agreement_deadline,
        asset_deadline = excluded.asset_deadline,
        distributor_delivery_deadline = excluded.distributor_delivery_deadline,
        promo_start_date = excluded.promo_start_date,
        artist_name = excluded.artist_name,
        track_title = excluded.track_title,
        catalog_number = excluded.catalog_number,
        internal_notes = excluded.internal_notes,
        updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      slotId,
      brand,
      releaseDate,
      status,
      maxReleases,
      deadlines.agreement_deadline,
      deadlines.asset_deadline,
      deadlines.distributor_delivery_deadline,
      deadlines.promo_start_date,
      optionalString(body.artist_name, 200),
      optionalString(body.track_title, 240),
      optionalString(body.catalog_number, 80),
      optionalString(body.internal_notes, 2000)
    )
    .run();

  return json({ ok: true, slot: { id: slotId } });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
