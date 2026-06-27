import { id, randomToken, sha256Hex } from "./_shared";
import {
  buildAgreementDocumentHtml,
  serializeAgreement,
  type AgreementPartyRow,
  type AgreementRow,
  type AgreementSignatureRow,
  type AgreementSplitRow,
  type AgreementVersionRow,
  type ChecklistRow
} from "./_agreements";

export type AgreementAccessTokenRow = {
  id: string;
  agreement_id: string;
  email: string | null;
  expires_at: string;
  revoked_at: string | null;
};

export function migrationMissing(error: unknown) {
  return String((error as Error)?.message ?? error).toLowerCase().includes("no such table");
}

export async function createAgreementAccessToken(
  db: D1Database,
  request: Request,
  agreementId: string,
  email: string | null,
  createdByEmail: string | null,
  days = 45
) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const tokenId = id("agrtok");

  await db
    .prepare(
      `INSERT INTO agreement_access_tokens
       (id, agreement_id, token_hash, email, expires_at, created_by_email)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(tokenId, agreementId, tokenHash, email, expiresAt, createdByEmail)
    .run();

  return {
    token,
    expires_at: expiresAt,
    review_url: new URL(`/agreement-review/?token=${encodeURIComponent(token)}`, request.url).toString()
  };
}

export async function loadAgreementDetail(db: D1Database, agreementId: string, includeAudit = false) {
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
    db.prepare("SELECT * FROM agreement_signatures WHERE agreement_id = ? ORDER BY datetime(signed_at) DESC").bind(agreementId).all<AgreementSignatureRow>(),
    includeAudit
      ? db.prepare("SELECT * FROM agreement_audit_events WHERE agreement_id = ? ORDER BY datetime(created_at) DESC LIMIT 50").bind(agreementId).all()
      : Promise.resolve({ results: [] })
  ]);

  const serializedAgreement = serializeAgreement(agreement);
  const party = (parties.results ?? []).find((item) => item.role === "artist") ?? (parties.results ?? [])[0] ?? null;
  const documentHtml = party
    ? buildAgreementDocumentHtml(serializedAgreement as AgreementRow, party, splits.results ?? [], checklist.results ?? [], signatures.results ?? [])
    : "";

  return {
    agreement: serializedAgreement,
    parties: parties.results ?? [],
    splits: splits.results ?? [],
    checklist: checklist.results ?? [],
    versions: versions.results ?? [],
    signatures: signatures.results ?? [],
    audit: audit.results ?? [],
    document_html: documentHtml
  };
}

export async function loadAgreementByToken(db: D1Database, rawToken: string) {
  const tokenHash = await sha256Hex(rawToken);
  const token = await db
    .prepare(
      `SELECT id, agreement_id, email, expires_at, revoked_at
       FROM agreement_access_tokens
       WHERE token_hash = ?
       LIMIT 1`
    )
    .bind(tokenHash)
    .first<AgreementAccessTokenRow>();

  if (!token || token.revoked_at || Date.parse(token.expires_at) < Date.now()) {
    return null;
  }

  const detail = await loadAgreementDetail(db, token.agreement_id);
  if (!detail) return null;
  return { token, detail };
}
