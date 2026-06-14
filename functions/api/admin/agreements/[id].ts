import { id, isResponse, json, methodNotAllowed, optionalString, readJson, requireAdmin, requireDb, type Env } from "../../_shared";
import {
  createAuditEvent,
  serializeAgreement,
  type AgreementPartyRow,
  type AgreementRow,
  type AgreementSplitRow,
  type AgreementVersionRow,
  type ChecklistRow
} from "../../_agreements";

function migrationMissing(error: unknown) {
  return String((error as Error)?.message ?? error).toLowerCase().includes("no such table");
}

async function loadAgreementDetail(db: D1Database, agreementId: string) {
  const agreement = await db
    .prepare(
      `SELECT a.*, s.release_date AS slot_release_date, s.status AS slot_status, s.catalog_number AS slot_catalog_number,
              s.agreement_deadline, s.asset_deadline, s.distributor_delivery_deadline, s.promo_start_date
       FROM release_agreements a
       LEFT JOIN release_calendar_slots s ON s.id = a.calendar_slot_id
       WHERE a.id = ?
       LIMIT 1`
    )
    .bind(agreementId)
    .first<AgreementRow & Record<string, unknown>>();
  if (!agreement) return null;

  const [parties, splits, checklist, versions, signatures, audit] = await Promise.all([
    db.prepare("SELECT * FROM agreement_parties WHERE agreement_id = ? ORDER BY created_at ASC").bind(agreementId).all<AgreementPartyRow>(),
    db.prepare("SELECT * FROM agreement_splits WHERE agreement_id = ? ORDER BY created_at ASC").bind(agreementId).all<AgreementSplitRow>(),
    db.prepare("SELECT * FROM agreement_checklist_items WHERE agreement_id = ? ORDER BY created_at ASC").bind(agreementId).all<ChecklistRow>(),
    db
      .prepare("SELECT id, agreement_id, version_number, snapshot_hash, created_by_email, created_by_role, created_at FROM agreement_versions WHERE agreement_id = ? ORDER BY version_number DESC")
      .bind(agreementId)
      .all<Omit<AgreementVersionRow, "snapshot_html">>(),
    db.prepare("SELECT * FROM agreement_signatures WHERE agreement_id = ? ORDER BY datetime(signed_at) DESC").bind(agreementId).all(),
    db.prepare("SELECT * FROM agreement_audit_events WHERE agreement_id = ? ORDER BY datetime(created_at) DESC LIMIT 50").bind(agreementId).all()
  ]);

  return {
    agreement: serializeAgreement(agreement),
    parties: parties.results ?? [],
    splits: splits.results ?? [],
    checklist: checklist.results ?? [],
    versions: versions.results ?? [],
    signatures: signatures.results ?? [],
    audit: audit.results ?? []
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    const detail = await loadAgreementDetail(db, String(params.id ?? ""));
    if (!detail) return json({ ok: false, error: "Agreement not found." }, { status: 404 });
    return json({ ok: true, ...detail });
  } catch (error) {
    if (migrationMissing(error)) return json({ ok: false, error: "Run D1 migration 0014_release_calendar_agreements.sql first." }, { status: 409 });
    throw error;
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ params, request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const agreementId = String(params.id ?? "");
  const action = optionalString(body.action, 80);

  try {
    const detail = await loadAgreementDetail(db, agreementId);
    if (!detail) return json({ ok: false, error: "Agreement not found." }, { status: 404 });

    if (action === "cancel") {
      await db.prepare("UPDATE release_agreements SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(agreementId).run();
      await createAuditEvent(db, request, agreementId, "agreement_cancelled", "admin", admin.email ?? "admin", {
        reason: optionalString(body.reason, 1000)
      });
      return json({ ok: true, detail: await loadAgreementDetail(db, agreementId) });
    }

    if (action === "sign_label") {
      const signatureText = optionalString(body.signature_text, 240);
      if (!signatureText) return json({ ok: false, error: "Typed label signature is required." }, { status: 400 });
      const version = await db
        .prepare("SELECT * FROM agreement_versions WHERE agreement_id = ? ORDER BY version_number DESC LIMIT 1")
        .bind(agreementId)
        .first<AgreementVersionRow>();
      if (!version) return json({ ok: false, error: "No locked agreement snapshot exists." }, { status: 400 });

      await db
        .prepare(
          `INSERT INTO agreement_signatures
           (id, agreement_id, agreement_version_id, signer_name, signer_email, signature_text, ip_address, user_agent, document_hash_at_signing, checkbox_confirmations_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id("agrsig"),
          agreementId,
          version.id,
          optionalString(body.signer_name, 160) ?? "The MasterBeat Project",
          admin.email ?? "admin",
          signatureText,
          request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
          request.headers.get("user-agent"),
          version.snapshot_hash,
          JSON.stringify({ label_review: true })
        )
        .run();

      await db.prepare("UPDATE release_agreements SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(agreementId).run();
      await createAuditEvent(db, request, agreementId, "label_signed", "admin", admin.email ?? "admin", { version_id: version.id });
      return json({ ok: true, detail: await loadAgreementDetail(db, agreementId) });
    }

    return json({ ok: false, error: "Unsupported agreement action." }, { status: 400 });
  } catch (error) {
    if (migrationMissing(error)) return json({ ok: false, error: "Run D1 migration 0014_release_calendar_agreements.sql first." }, { status: 409 });
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
