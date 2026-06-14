import {
  id,
  isResponse,
  json,
  methodNotAllowed,
  optionalString,
  readJson,
  requireDb,
  requireSession,
  type Env
} from "../../_shared";
import {
  createAgreementVersion,
  createAuditEvent,
  parseSplitsText,
  serializeAgreement,
  validateArtistPoolSplits,
  type AgreementPartyRow,
  type AgreementRow,
  type AgreementSplitRow,
  type AgreementVersionRow,
  type ChecklistRow
} from "../../_agreements";

function migrationMissing(error: unknown) {
  return String((error as Error)?.message ?? error).toLowerCase().includes("no such table");
}

async function canAccessAgreement(db: D1Database, agreementId: string, role: string, email: string | undefined) {
  if (role === "admin") return true;
  if (!email) return false;
  const row = await db
    .prepare(
      `SELECT a.id
       FROM release_agreements a
       LEFT JOIN agreement_parties p ON p.agreement_id = a.id
       WHERE a.id = ? AND (lower(a.artist_email) = lower(?) OR lower(p.email) = lower(?))
       LIMIT 1`
    )
    .bind(agreementId, email, email)
    .first();
  return Boolean(row);
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

  const [parties, splits, checklist, versions, signatures] = await Promise.all([
    db.prepare("SELECT * FROM agreement_parties WHERE agreement_id = ? ORDER BY created_at ASC").bind(agreementId).all<AgreementPartyRow>(),
    db.prepare("SELECT * FROM agreement_splits WHERE agreement_id = ? ORDER BY created_at ASC").bind(agreementId).all<AgreementSplitRow>(),
    db.prepare("SELECT * FROM agreement_checklist_items WHERE agreement_id = ? ORDER BY created_at ASC").bind(agreementId).all<ChecklistRow>(),
    db
      .prepare("SELECT id, agreement_id, version_number, snapshot_hash, created_by_email, created_by_role, created_at FROM agreement_versions WHERE agreement_id = ? ORDER BY version_number DESC")
      .bind(agreementId)
      .all<Omit<AgreementVersionRow, "snapshot_html">>(),
    db.prepare("SELECT * FROM agreement_signatures WHERE agreement_id = ? ORDER BY datetime(signed_at) DESC").bind(agreementId).all()
  ]);

  return {
    agreement: serializeAgreement(agreement),
    parties: parties.results ?? [],
    splits: splits.results ?? [],
    checklist: checklist.results ?? [],
    versions: versions.results ?? [],
    signatures: signatures.results ?? []
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const agreementId = String(params.id ?? "");
  try {
    if (!(await canAccessAgreement(db, agreementId, session.role, session.email))) {
      return json({ ok: false, error: "You do not have access to this agreement." }, { status: 403 });
    }
    const detail = await loadAgreementDetail(db, agreementId);
    if (!detail) return json({ ok: false, error: "Agreement not found." }, { status: 404 });
    return json({ ok: true, ...detail });
  } catch (error) {
    if (migrationMissing(error)) return json({ ok: false, error: "Run D1 migration 0014_release_calendar_agreements.sql first." }, { status: 409 });
    throw error;
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ params, request, env }) => {
  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const agreementId = String(params.id ?? "");
  const action = optionalString(body.action, 80);

  try {
    if (!(await canAccessAgreement(db, agreementId, session.role, session.email))) {
      return json({ ok: false, error: "You do not have access to this agreement." }, { status: 403 });
    }
    const detail = await loadAgreementDetail(db, agreementId);
    if (!detail) return json({ ok: false, error: "Agreement not found." }, { status: 404 });

    const artistParty = detail.parties.find((party) => party.role === "artist") as AgreementPartyRow | undefined;
    if (!artistParty) return json({ ok: false, error: "Artist party is missing from this agreement." }, { status: 409 });

    if (action === "save_details") {
      const releaseTitle = optionalString(body.release_title, 200) ?? detail.agreement.release_title;
      const genre = optionalString(body.genre, 120) ?? detail.agreement.genre;
      const parsedSplits = parseSplitsText(body.splits_text, detail.agreement.artist_name, detail.agreement.artist_email, Number(detail.agreement.artist_pool_share ?? 70));
      const splitValidation = validateArtistPoolSplits(parsedSplits);
      if (!splitValidation.ok) {
        return json({ ok: false, error: `Artist pool splits must equal 100%. Current total is ${splitValidation.total}%.` }, { status: 400 });
      }

      await db
        .prepare(
          `UPDATE release_agreements
           SET release_title = ?, genre = ?, status = 'artist_review', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(releaseTitle, genre, agreementId)
        .run();

      await db
        .prepare(
          `UPDATE agreement_parties
           SET legal_name = ?, payment_email = ?, splitshare_email = ?, street_address = ?, city = ?, state_province = ?, postal_code = ?, country = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(
          optionalString(body.legal_name, 200),
          optionalString(body.payment_email, 200),
          optionalString(body.splitshare_email, 200),
          optionalString(body.street_address, 300),
          optionalString(body.city, 120),
          optionalString(body.state_province, 120),
          optionalString(body.postal_code, 80),
          optionalString(body.country, 120),
          artistParty.id
        )
        .run();

      await db.prepare("DELETE FROM agreement_splits WHERE agreement_id = ?").bind(agreementId).run();
      for (const split of parsedSplits) {
        await db
          .prepare(
            `INSERT INTO agreement_splits
             (id, agreement_id, payee_name, role, email, share_of_artist_pool, direct_split_percentage)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(id("agrsplit"), agreementId, split.payee_name, split.role, split.email, split.share_of_artist_pool, split.direct_split_percentage)
          .run();
      }

      const confirmedKeys = new Set(Array.isArray(body.checklist) ? body.checklist.map((key) => String(key)) : []);
      for (const item of detail.checklist) {
        const confirmed = confirmedKeys.has(item.item_key);
        await db
          .prepare(
            `UPDATE agreement_checklist_items
             SET status = ?, confirmed_by = ?, confirmed_at = ?, notes = ?
             WHERE id = ?`
          )
          .bind(
            confirmed ? "confirmed" : "pending",
            confirmed ? session.email ?? detail.agreement.artist_email : null,
            confirmed ? new Date().toISOString() : null,
            null,
            item.id
          )
          .run();
      }

      const refreshed = await loadAgreementDetail(db, agreementId);
      if (refreshed) {
        const refreshedParty = refreshed.parties.find((party) => party.role === "artist") as AgreementPartyRow | undefined;
        if (refreshedParty) {
          await createAgreementVersion(
            db,
            refreshed.agreement as AgreementRow,
            refreshedParty,
            refreshed.splits as AgreementSplitRow[],
            refreshed.checklist as ChecklistRow[],
            session.role,
            session.email ?? detail.agreement.artist_email
          );
        }
      }
      await createAuditEvent(db, request, agreementId, "artist_details_saved", session.role, session.email ?? detail.agreement.artist_email, {
        split_total: splitValidation.total
      });

      return json({ ok: true, detail: await loadAgreementDetail(db, agreementId) });
    }

    if (action === "sign_artist") {
      const pending = detail.checklist.filter((item) => item.status !== "confirmed");
      if (pending.length > 0) {
        return json({ ok: false, error: "Confirm every rights checklist item before signing." }, { status: 400 });
      }
      const signatureText = optionalString(body.signature_text, 240);
      if (!signatureText) return json({ ok: false, error: "Typed artist signature is required." }, { status: 400 });
      const version = await db
        .prepare("SELECT * FROM agreement_versions WHERE agreement_id = ? ORDER BY version_number DESC LIMIT 1")
        .bind(agreementId)
        .first<AgreementVersionRow>();
      if (!version) return json({ ok: false, error: "No locked agreement snapshot exists." }, { status: 400 });

      await db
        .prepare(
          `INSERT INTO agreement_signatures
           (id, agreement_id, agreement_version_id, party_id, signer_name, signer_email, signature_text, ip_address, user_agent, document_hash_at_signing, checkbox_confirmations_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id("agrsig"),
          agreementId,
          version.id,
          artistParty.id,
          optionalString(body.signer_name, 160) ?? artistParty.legal_name ?? artistParty.name,
          session.email ?? artistParty.email,
          signatureText,
          request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
          request.headers.get("user-agent"),
          version.snapshot_hash,
          JSON.stringify(detail.checklist.map((item) => item.item_key))
        )
        .run();

      await db.prepare("UPDATE agreement_parties SET signature_status = 'signed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(artistParty.id).run();
      await db
        .prepare("UPDATE release_agreements SET status = 'waiting_label_signature', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(agreementId)
        .run();
      await createAuditEvent(db, request, agreementId, "artist_signed", session.role, session.email ?? artistParty.email, { version_id: version.id });

      return json({ ok: true, detail: await loadAgreementDetail(db, agreementId) });
    }

    return json({ ok: false, error: "Unsupported agreement action." }, { status: 400 });
  } catch (error) {
    if (migrationMissing(error)) return json({ ok: false, error: "Run D1 migration 0014_release_calendar_agreements.sql first." }, { status: 409 });
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
