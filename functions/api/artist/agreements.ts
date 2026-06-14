import { isResponse, json, methodNotAllowed, requireDb, requireSession, type Env } from "../_shared";
import { serializeAgreement, type AgreementRow } from "../_agreements";

function migrationMissing(error: unknown) {
  return String((error as Error)?.message ?? error).toLowerCase().includes("no such table");
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    const baseQuery = `SELECT a.*, s.release_date AS slot_release_date, s.status AS slot_status, s.catalog_number AS slot_catalog_number,
                              s.agreement_deadline, s.asset_deadline, s.distributor_delivery_deadline, s.promo_start_date
                       FROM release_agreements a
                       LEFT JOIN release_calendar_slots s ON s.id = a.calendar_slot_id`;
    const result =
      session.role === "admin"
        ? await db
            .prepare(`${baseQuery} ORDER BY datetime(a.updated_at) DESC, datetime(a.created_at) DESC LIMIT 200`)
            .all<AgreementRow & Record<string, unknown>>()
        : await db
            .prepare(
              `${baseQuery}
               WHERE lower(a.artist_email) = lower(?)
                  OR EXISTS (SELECT 1 FROM agreement_parties p WHERE p.agreement_id = a.id AND lower(p.email) = lower(?))
               ORDER BY datetime(a.updated_at) DESC, datetime(a.created_at) DESC
               LIMIT 200`
            )
            .bind(session.email ?? "", session.email ?? "")
            .all<AgreementRow & Record<string, unknown>>();

    return json({ ok: true, agreements: (result.results ?? []).map(serializeAgreement) });
  } catch (error) {
    if (migrationMissing(error)) {
      return json({ ok: false, error: "Run D1 migration 0014_release_calendar_agreements.sql first." }, { status: 409 });
    }
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET"]);
