import { id, isResponse, json, methodNotAllowed, optionalString, readJson, requireDb, type Env } from "../_shared";
import {
  createAgreementVersion,
  createAuditEvent,
  parseSplitsText,
  validateArtistPoolSplits,
  type AgreementPartyRow,
  type AgreementRow,
  type AgreementSplitRow,
  type AgreementVersionRow,
  type ChecklistRow
} from "../_agreements";
import { loadAgreementByToken, loadAgreementDetail, migrationMissing } from "../_agreement_review";

function cleanSignatureImage(value: unknown) {
  const text = optionalString(value, 180000);
  if (!text) return null;
  if (!/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(text)) return null;
  return text;
}

async function tokenDetail(db: D1Database, params: Record<string, unknown>) {
  const token = String(params.token ?? "");
  if (!token) return null;
  return loadAgreementByToken(db, token);
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    const access = await tokenDetail(db, params);
    if (!access) return json({ ok: false, error: "Agreement review link is invalid or expired." }, { status: 404 });
    return json({ ok: true, access: { expires_at: access.token.expires_at, email: access.token.email }, ...access.detail });
  } catch (error) {
    if (migrationMissing(error)) return json({ ok: false, error: "Run D1 migration 0015_calendar_import_and_agreement_tokens.sql first." }, { status: 409 });
    throw error;
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ params, request, env }) => {
  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  try {
    const access = await tokenDetail(db, params);
    if (!access) return json({ ok: false, error: "Agreement review link is invalid or expired." }, { status: 404 });

    const agreementId = access.token.agreement_id;
    const detail = access.detail;
    const action = optionalString(body.action, 80);
    const artistParty = detail.parties.find((party) => party.role === "artist") as AgreementPartyRow | undefined;
    if (!artistParty) return json({ ok: false, error: "Artist party is missing from this agreement." }, { status: 409 });
    if (["completed", "cancelled", "expired"].includes(String(detail.agreement.status || "").toLowerCase())) {
      return json({ ok: false, error: "This agreement is no longer open for artist edits." }, { status: 400 });
    }

    const actorEmail = access.token.email || detail.agreement.artist_email || artistParty.email;

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
          .bind(confirmed ? "confirmed" : "pending", confirmed ? actorEmail : null, confirmed ? new Date().toISOString() : null, null, item.id)
          .run();
      }

      const refreshed = await loadAgreementDetail(db, agreementId);
      const refreshedParty = refreshed?.parties.find((party) => party.role === "artist") as AgreementPartyRow | undefined;
      if (refreshed && refreshedParty) {
        await createAgreementVersion(
          db,
          refreshed.agreement as AgreementRow,
          refreshedParty,
          refreshed.splits as AgreementSplitRow[],
          refreshed.checklist as ChecklistRow[],
          "artist",
          actorEmail
        );
      }
      await createAuditEvent(db, request, agreementId, "artist_details_saved", "artist", actorEmail, { split_total: splitValidation.total });

      return json({ ok: true, detail: await loadAgreementDetail(db, agreementId) });
    }

    if (action === "sign_artist") {
      const pending = detail.checklist.filter((item) => item.status !== "confirmed");
      if (pending.length > 0) {
        return json({ ok: false, error: "Confirm every rights checklist item before signing." }, { status: 400 });
      }

      const signatureType = optionalString(body.signature_type, 40) === "drawn" ? "drawn" : "typed";
      const signatureText = optionalString(body.signature_text, 240);
      const signatureImage = cleanSignatureImage(body.signature_image_data_url);
      if (signatureType === "typed" && !signatureText) return json({ ok: false, error: "Typed artist signature is required." }, { status: 400 });
      if (signatureType === "drawn" && !signatureImage) return json({ ok: false, error: "Drawn artist signature is required." }, { status: 400 });

      const version = await db
        .prepare("SELECT * FROM agreement_versions WHERE agreement_id = ? ORDER BY version_number DESC LIMIT 1")
        .bind(agreementId)
        .first<AgreementVersionRow>();
      if (!version) return json({ ok: false, error: "No locked agreement snapshot exists." }, { status: 400 });

      await db
        .prepare(
          `INSERT INTO agreement_signatures
           (id, agreement_id, agreement_version_id, party_id, signer_name, signer_email, signature_type, signature_text,
            signature_image_data_url, ip_address, user_agent, document_hash_at_signing, checkbox_confirmations_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id("agrsig"),
          agreementId,
          version.id,
          artistParty.id,
          optionalString(body.signer_name, 160) ?? artistParty.legal_name ?? artistParty.name,
          actorEmail,
          signatureType,
          signatureText ?? "Drawn signature",
          signatureImage,
          request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
          request.headers.get("user-agent"),
          version.snapshot_hash,
          JSON.stringify(detail.checklist.map((item) => item.item_key))
        )
        .run();

      await db.prepare("UPDATE agreement_parties SET signature_status = 'signed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(artistParty.id).run();
      await db.prepare("UPDATE release_agreements SET status = 'waiting_label_signature', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(agreementId).run();
      await createAuditEvent(db, request, agreementId, "artist_signed", "artist", actorEmail, { version_id: version.id, signature_type: signatureType });

      return json({ ok: true, detail: await loadAgreementDetail(db, agreementId) });
    }

    return json({ ok: false, error: "Unsupported agreement action." }, { status: 400 });
  } catch (error) {
    if (migrationMissing(error)) return json({ ok: false, error: "Run D1 migration 0015_calendar_import_and_agreement_tokens.sql first." }, { status: 409 });
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
