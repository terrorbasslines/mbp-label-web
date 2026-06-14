import {
  id,
  isResponse,
  json,
  methodNotAllowed,
  optionalString,
  readJson,
  requireAdmin,
  requireDb,
  sendAgreementReviewEmail,
  type Env
} from "../_shared";
import {
  CHECKLIST_ITEMS,
  buildAgreementSnapshot,
  createAgreementVersion,
  createAuditEvent,
  directSplitFromPool,
  normalizeBrand,
  serializeAgreement,
  type AgreementPartyRow,
  type AgreementRow,
  type AgreementSplitRow,
  type ChecklistRow
} from "../_agreements";

type DemoRow = {
  id: string;
  artist_name: string;
  email: string;
  track_title: string;
  genre: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
};

type SlotRow = {
  id: string;
  brand: string;
  release_date: string;
  status: string;
  max_releases: number;
  current_release_count: number;
  catalog_number: string | null;
  artist_name: string | null;
  track_title: string | null;
};

function migrationMissing(error: unknown) {
  return String((error as Error)?.message ?? error).toLowerCase().includes("no such table");
}

async function listAgreements(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT a.*, s.release_date AS slot_release_date, s.catalog_number AS slot_catalog_number, s.status AS slot_status
       FROM release_agreements a
       LEFT JOIN release_calendar_slots s ON s.id = a.calendar_slot_id
       ORDER BY datetime(a.updated_at) DESC, datetime(a.created_at) DESC
       LIMIT 200`
    )
    .all<AgreementRow & Record<string, unknown>>();
  return (result.results ?? []).map(serializeAgreement);
}

async function listApprovedDemos(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT d.id, d.artist_name, d.email, d.track_title, d.genre, d.status, d.created_at, d.updated_at
       FROM demo_submissions d
       LEFT JOIN release_agreements a ON a.demo_submission_id = d.id
       WHERE d.status = 'approved' AND a.id IS NULL
       ORDER BY datetime(COALESCE(d.updated_at, d.created_at)) DESC
       LIMIT 100`
    )
    .all<DemoRow>();
  return result.results ?? [];
}

async function listOpenSlots(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT *
       FROM release_calendar_slots
       WHERE status IN ('available', 'reserved', 'confirmed', 'locked')
         AND date(release_date) >= date('now', '-30 days')
       ORDER BY date(release_date) ASC, brand ASC
       LIMIT 300`
    )
    .all<SlotRow>();
  return result.results ?? [];
}

async function loadBaseAgreement(db: D1Database, agreementId: string) {
  const agreement = await db.prepare("SELECT * FROM release_agreements WHERE id = ? LIMIT 1").bind(agreementId).first<AgreementRow>();
  if (!agreement) return null;
  const party = await db
    .prepare("SELECT * FROM agreement_parties WHERE agreement_id = ? AND role = 'artist' ORDER BY created_at ASC LIMIT 1")
    .bind(agreementId)
    .first<AgreementPartyRow>();
  const splits = await db
    .prepare("SELECT * FROM agreement_splits WHERE agreement_id = ? ORDER BY created_at ASC")
    .bind(agreementId)
    .all<AgreementSplitRow>();
  const checklist = await db
    .prepare("SELECT * FROM agreement_checklist_items WHERE agreement_id = ? ORDER BY created_at ASC")
    .bind(agreementId)
    .all<ChecklistRow>();
  return { agreement, party, splits: splits.results ?? [], checklist: checklist.results ?? [] };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    return json({
      ok: true,
      agreements: await listAgreements(db),
      approved_demos: await listApprovedDemos(db),
      slots: await listOpenSlots(db)
    });
  } catch (error) {
    if (migrationMissing(error)) {
      return json({ ok: false, error: "Run D1 migration 0014_release_calendar_agreements.sql first." }, { status: 409 });
    }
    throw error;
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const demoSubmissionId = optionalString(body.demo_submission_id, 160);
  const calendarSlotId = optionalString(body.calendar_slot_id, 160);
  if (!demoSubmissionId || !calendarSlotId) {
    return json({ ok: false, error: "demo_submission_id and calendar_slot_id are required." }, { status: 400 });
  }

  try {
    const demo = await db.prepare("SELECT * FROM demo_submissions WHERE id = ? LIMIT 1").bind(demoSubmissionId).first<DemoRow>();
    if (!demo) return json({ ok: false, error: "Approved demo not found." }, { status: 404 });
    if (demo.status !== "approved") return json({ ok: false, error: "Only approved demos can create agreements." }, { status: 400 });

    const slot = await db.prepare("SELECT * FROM release_calendar_slots WHERE id = ? LIMIT 1").bind(calendarSlotId).first<SlotRow>();
    if (!slot) return json({ ok: false, error: "Calendar slot not found." }, { status: 404 });
    if (slot.status === "cancelled" || slot.status === "released") {
      return json({ ok: false, error: "This calendar slot is not open for a new agreement." }, { status: 400 });
    }

    const agreementId = id("agr");
    const partyId = id("agrparty");
    const splitId = id("agrsplit");
    const brand = normalizeBrand(slot.brand);

    await db
      .prepare(
        `INSERT INTO release_agreements
         (id, demo_submission_id, calendar_slot_id, brand, status, release_title, artist_name, artist_email, planned_release_date, genre)
         VALUES (?, ?, ?, ?, 'waiting_artist_details', ?, ?, ?, ?, ?)`
      )
      .bind(agreementId, demo.id, slot.id, brand, demo.track_title, demo.artist_name, demo.email, slot.release_date, demo.genre)
      .run();

    await db
      .prepare(
        `INSERT INTO agreement_parties (id, agreement_id, role, name, email)
         VALUES (?, ?, 'artist', ?, ?)`
      )
      .bind(partyId, agreementId, demo.artist_name, demo.email)
      .run();

    await db
      .prepare(
        `INSERT INTO agreement_splits
         (id, agreement_id, payee_name, role, email, share_of_artist_pool, direct_split_percentage)
         VALUES (?, ?, ?, 'artist', ?, 100, ?)`
      )
      .bind(splitId, agreementId, demo.artist_name, demo.email, directSplitFromPool(100))
      .run();

    for (const item of CHECKLIST_ITEMS) {
      await db
        .prepare(
          `INSERT INTO agreement_checklist_items (id, agreement_id, item_key, label, status)
           VALUES (?, ?, ?, ?, 'pending')`
        )
        .bind(id("agrchk"), agreementId, item.key, item.label)
        .run();
    }

    await db
      .prepare(
        `UPDATE release_calendar_slots
         SET current_release_count = current_release_count + 1,
             status = CASE WHEN current_release_count + 1 >= max_releases THEN 'locked' ELSE 'confirmed' END,
             artist_name = COALESCE(artist_name, ?),
             track_title = COALESCE(track_title, ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(demo.artist_name, demo.track_title, slot.id)
      .run();

    const base = await loadBaseAgreement(db, agreementId);
    if (base?.party) {
      const version = await createAgreementVersion(db, base.agreement, base.party, base.splits, base.checklist, "admin", admin.email ?? "admin");
      await buildAgreementSnapshot(base.agreement, base.party, base.splits, base.checklist);
      await createAuditEvent(db, request, agreementId, "agreement_created", "admin", admin.email ?? "admin", {
        demo_submission_id: demo.id,
        calendar_slot_id: slot.id,
        version_id: version.id
      });
    }

    const agreementUrl = new URL(`/artist-dashboard/?agreement=${encodeURIComponent(agreementId)}`, request.url).toString();
    const email = await sendAgreementReviewEmail(env, {
      to: demo.email,
      artistName: demo.artist_name,
      trackTitle: demo.track_title,
      brand,
      releaseDate: slot.release_date,
      agreementUrl
    });

    return json({ ok: true, agreement_id: agreementId, email, agreements: await listAgreements(db) });
  } catch (error) {
    if (migrationMissing(error)) {
      return json({ ok: false, error: "Run D1 migration 0014_release_calendar_agreements.sql first." }, { status: 409 });
    }
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
