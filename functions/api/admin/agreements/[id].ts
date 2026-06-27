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
} from "../../_shared";
import {
  createAuditEvent,
  type AgreementVersionRow,
} from "../../_agreements";
import { createAgreementAccessToken, loadAgreementDetail, migrationMissing } from "../../_agreement_review";

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    const detail = await loadAgreementDetail(db, String(params.id ?? ""), true);
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

    if (action === "send_artist_link") {
      const access = await createAgreementAccessToken(
        db,
        request,
        agreementId,
        String(detail.agreement.artist_email || ""),
        admin.email ?? "admin"
      );
      const email = await sendAgreementReviewEmail(env, {
        to: String(detail.agreement.artist_email || ""),
        artistName: String(detail.agreement.artist_name || "Artist"),
        trackTitle: String(detail.agreement.release_title || "Release agreement"),
        brand: String(detail.agreement.brand || "MBP"),
        releaseDate: String(detail.agreement.planned_release_date || ""),
        agreementUrl: access.review_url
      });
      await createAuditEvent(db, request, agreementId, "artist_review_link_created", "admin", admin.email ?? "admin", {
        email_status: email.status,
        expires_at: access.expires_at
      });
      return json({ ok: true, review_url: access.review_url, access_expires_at: access.expires_at, email });
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
