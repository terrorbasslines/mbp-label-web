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

const OFFICIAL_2026_CALENDAR_DATES: Record<string, string[]> = {
  MBP: `2026-01-02 2026-01-05 2026-01-07 2026-01-09 2026-01-12 2026-01-14 2026-01-16 2026-01-19 2026-01-21 2026-01-23 2026-01-26 2026-01-28 2026-01-30 2026-02-02 2026-02-04 2026-02-06 2026-02-07 2026-02-11 2026-02-13 2026-02-16 2026-02-18 2026-02-20 2026-02-23 2026-02-25 2026-03-02 2026-03-04 2026-03-06 2026-03-09 2026-03-11 2026-03-13 2026-03-16 2026-03-18 2026-03-20 2026-03-23 2026-03-25 2026-03-27 2026-03-30 2026-04-01 2026-04-08 2026-04-10 2026-04-13 2026-04-15 2026-04-17 2026-04-20 2026-04-22 2026-04-24 2026-04-27 2026-04-29 2026-05-01 2026-05-06 2026-05-08 2026-05-13 2026-05-15 2026-05-18 2026-05-22 2026-05-27 2026-05-29 2026-06-01 2026-06-03 2026-06-10 2026-06-12 2026-06-15 2026-06-17 2026-06-19 2026-06-22 2026-06-24 2026-06-26 2026-06-29 2026-07-01 2026-07-03 2026-07-06 2026-07-08 2026-07-10 2026-07-13 2026-07-15 2026-07-17 2026-07-20 2026-07-24 2026-07-29 2026-07-31 2026-08-03 2026-08-05 2026-08-07 2026-08-10 2026-08-12 2026-08-14 2026-08-17 2026-08-19 2026-08-21 2026-08-24 2026-08-26 2026-08-28 2026-08-31 2026-09-05 2026-09-07 2026-09-09 2026-09-11 2026-09-14 2026-09-16 2026-09-23 2026-09-25 2026-09-30 2026-10-02 2026-10-07 2026-10-09 2026-10-14 2026-10-16 2026-10-21 2026-10-23 2026-10-28 2026-10-30 2026-11-04 2026-11-06 2026-11-11 2026-11-13 2026-11-18 2026-11-20 2026-11-25 2026-11-27 2026-12-02 2026-12-04 2026-12-09 2026-12-11 2026-12-16 2026-12-18 2026-12-21`.split(/\s+/),
  MBH: `2026-02-06 2026-02-20 2026-02-25 2026-02-27 2026-03-04 2026-03-06 2026-03-11 2026-05-29 2026-06-24 2026-07-03 2026-07-10 2026-07-17 2026-07-24 2026-08-07`.split(/\s+/)
};

type CalendarSlotRow = {
  id: string;
  release_date: string;
  status: string;
  current_release_count: number | null;
  catalog_number: string | null;
  artist_name: string | null;
  track_title: string | null;
  internal_notes: string | null;
};

function officialDatesForRange(brand: string, from: string, to: string) {
  const dates = OFFICIAL_2026_CALENDAR_DATES[brand] ?? [];
  return dates.filter((date) => date >= from && date <= to);
}

function weekdayDatesForRange(from: string, to: string, weekdays: Set<number>) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    if (weekdays.has(cursor.getUTCDay())) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function isBlankGeneratedSlot(slot: CalendarSlotRow) {
  return (
    slot.status === "available" &&
    Number(slot.current_release_count ?? 0) === 0 &&
    !slot.catalog_number &&
    !slot.artist_name &&
    !slot.track_title &&
    !slot.internal_notes
  );
}

async function removeUnofficialBlankSlots(db: D1Database, brand: string, from: string, to: string, officialDates: Set<string>) {
  const result = await db
    .prepare(
      `SELECT id, release_date, status, current_release_count, catalog_number, artist_name, track_title, internal_notes
       FROM release_calendar_slots
       WHERE brand = ? AND release_date >= ? AND release_date <= ?`
    )
    .bind(brand, from, to)
    .all<CalendarSlotRow>();

  let removed = 0;
  for (const slot of result.results ?? []) {
    if (!officialDates.has(slot.release_date) && isBlankGeneratedSlot(slot)) {
      const deletion = await db.prepare("DELETE FROM release_calendar_slots WHERE id = ?").bind(slot.id).run();
      removed += deletion.meta.changes ?? 0;
    }
  }
  return removed;
}

async function createAvailableSlot(db: D1Database, brand: string, releaseDate: string) {
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
  return result.meta.changes ?? 0;
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
    .prepare(`SELECT * FROM release_calendar_slots WHERE ${clauses.join(" AND ")} ORDER BY release_date ASC, brand ASC LIMIT 1200`)
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
    if (from > to) return json({ ok: false, error: "from date must be before to date." }, { status: 400 });

    const weekdays = new Set(
      String(body.weekdays ?? "1,4")
        .split(",")
        .map((day) => Number(day.trim()))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    );
    const officialDates = officialDatesForRange(brand, from, to);
    const useOfficialCalendar = officialDates.length > 0;
    const datesToCreate = useOfficialCalendar ? officialDates : weekdayDatesForRange(from, to, weekdays);
    const removed = useOfficialCalendar ? await removeUnofficialBlankSlots(db, brand, from, to, new Set(officialDates)) : 0;
    let created = 0;

    for (const releaseDate of datesToCreate) {
      created += await createAvailableSlot(db, brand, releaseDate);
    }

    return json({
      ok: true,
      created,
      removed,
      source: useOfficialCalendar ? "official_2026_calendar" : "weekday_pattern"
    });
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
