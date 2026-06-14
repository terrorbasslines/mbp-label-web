import { id, optionalString, sha256Hex } from "./_shared";

export const CALENDAR_BRANDS = ["MBP", "MBH", "S7"] as const;
export type CalendarBrand = (typeof CALENDAR_BRANDS)[number];

export const SLOT_STATUSES = ["available", "reserved", "confirmed", "locked", "released", "cancelled"] as const;
export type CalendarSlotStatus = (typeof SLOT_STATUSES)[number];

export const AGREEMENT_STATUSES = [
  "draft",
  "waiting_artist_details",
  "artist_review",
  "artist_signed",
  "waiting_label_signature",
  "completed",
  "cancelled",
  "expired",
  "amended"
] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const CHECKLIST_ITEMS = [
  { key: "master_control", label: "I own or control the master recording and have authority to license it." },
  { key: "collaborator_credits", label: "All collaborators, vocalists, producers and contributors are correctly credited." },
  { key: "third_party_clearance", label: "Samples, loops, beats, vocals and third-party material are cleared or not used." },
  { key: "ai_media", label: "No unauthorized AI impersonation or misleading synthetic media is included." },
  { key: "lyrics_explicit", label: "Lyrics, explicit content and metadata information are accurate." },
  { key: "delivery_complete", label: "Delivered files, artwork and metadata are complete and accurate." }
] as const;

export type AgreementRow = {
  id: string;
  demo_submission_id: string;
  calendar_slot_id: string;
  brand: string;
  status: string;
  template_version: string;
  current_version_id: string | null;
  release_title: string;
  artist_name: string;
  artist_email: string;
  planned_release_date: string;
  genre: string | null;
  label_share: number;
  artist_pool_share: number;
  distributor: string;
  created_at: string;
  updated_at: string;
};

export type AgreementPartyRow = {
  id: string;
  agreement_id: string;
  role: string;
  name: string;
  legal_name: string | null;
  email: string;
  payment_email: string | null;
  splitshare_email: string | null;
  street_address: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  signature_status: string;
};

export type AgreementSplitRow = {
  id: string;
  agreement_id: string;
  payee_name: string;
  role: string;
  email: string | null;
  share_of_artist_pool: number;
  direct_split_percentage: number;
  is_bonus: number;
};

export type ChecklistRow = {
  id: string;
  agreement_id: string;
  item_key: string;
  label: string;
  status: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  notes: string | null;
};

export type AgreementVersionRow = {
  id: string;
  agreement_id: string;
  version_number: number;
  snapshot_html: string;
  snapshot_hash: string;
  created_by_email: string | null;
  created_by_role: string | null;
  created_at: string;
};

export function normalizeBrand(value: unknown): CalendarBrand {
  const normalized = String(value ?? "").trim().toUpperCase();
  return CALENDAR_BRANDS.includes(normalized as CalendarBrand) ? (normalized as CalendarBrand) : "MBP";
}

export function normalizeSlotStatus(value: unknown): CalendarSlotStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SLOT_STATUSES.includes(normalized as CalendarSlotStatus) ? (normalized as CalendarSlotStatus) : "available";
}

export function normalizeAgreementStatus(value: unknown): AgreementStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  return AGREEMENT_STATUSES.includes(normalized as AgreementStatus) ? (normalized as AgreementStatus) : "waiting_artist_details";
}

export function toDateString(value: unknown) {
  const text = optionalString(value, 40);
  if (!text) return null;
  const date = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calendarDeadlines(releaseDate: string) {
  return {
    agreement_deadline: addDays(releaseDate, -35),
    asset_deadline: addDays(releaseDate, -28),
    distributor_delivery_deadline: addDays(releaseDate, -21),
    promo_start_date: addDays(releaseDate, -14)
  };
}

export function directSplitFromPool(shareOfArtistPool: number, artistPoolShare = 70) {
  return Math.round(((shareOfArtistPool * artistPoolShare) / 100) * 10000) / 10000;
}

export type ParsedSplit = {
  payee_name: string;
  role: string;
  email: string | null;
  share_of_artist_pool: number;
  direct_split_percentage: number;
};

export function parseSplitsText(input: unknown, fallbackName: string, fallbackEmail: string, artistPoolShare = 70): ParsedSplit[] {
  const text = optionalString(input, 12000);
  if (!text) {
    return [
      {
        payee_name: fallbackName,
        role: "artist",
        email: fallbackEmail,
        share_of_artist_pool: 100,
        direct_split_percentage: directSplitFromPool(100, artistPoolShare)
      }
    ];
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes("|") ? line.split("|") : line.split(",");
      const [name, role, email, share] = parts.map((part) => part.trim());
      const poolShare = Number(share);
      return {
        payee_name: name || fallbackName,
        role: role || "artist",
        email: email || null,
        share_of_artist_pool: Number.isFinite(poolShare) ? poolShare : 0,
        direct_split_percentage: directSplitFromPool(Number.isFinite(poolShare) ? poolShare : 0, artistPoolShare)
      };
    });
}

export function validateArtistPoolSplits(rows: Array<{ share_of_artist_pool: number }>) {
  const total = rows.reduce((sum, row) => sum + Number(row.share_of_artist_pool ?? 0), 0);
  return {
    ok: Math.abs(total - 100) < 0.01,
    total: Math.round(total * 100) / 100
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function paragraph(label: string, value: unknown) {
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value || "Not provided")}</p>`;
}

export async function buildAgreementSnapshot(
  agreement: AgreementRow,
  party: AgreementPartyRow,
  splits: AgreementSplitRow[] | ParsedSplit[],
  checklist: ChecklistRow[]
) {
  const splitsRows = splits
    .map(
      (split) =>
        `<tr><td>${escapeHtml(split.payee_name)}</td><td>${escapeHtml(split.role)}</td><td>${escapeHtml(split.email ?? "")}</td><td>${escapeHtml(
          split.share_of_artist_pool
        )}%</td><td>${escapeHtml(split.direct_split_percentage)}%</td></tr>`
    )
    .join("");
  const checklistRows = checklist
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.status === "confirmed" ? "Confirmed" : "Pending")}:</strong> ${escapeHtml(item.label)}</li>`
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(agreement.release_title)} - MBP Release Agreement</title>
</head>
<body>
  <h1>The MasterBeat Project Exclusive Master Licence Agreement</h1>
  <p><strong>Template version:</strong> ${escapeHtml(agreement.template_version)}</p>
  <p>This agreement snapshot is prepared for custom electronic signature workflow on themasterbeatproject.com. It is not a qualified electronic signature service.</p>
  <h2>Schedule A - Release Details</h2>
  ${paragraph("Brand", agreement.brand)}
  ${paragraph("Release title", agreement.release_title)}
  ${paragraph("Artist name", agreement.artist_name)}
  ${paragraph("Planned release date", agreement.planned_release_date)}
  ${paragraph("Genre", agreement.genre)}
  ${paragraph("Distributor", agreement.distributor)}
  <h2>Schedule B - Parties and Splits</h2>
  ${paragraph("Artist legal name", party.legal_name)}
  ${paragraph("Artist email", party.email)}
  ${paragraph("Payment email", party.payment_email)}
  ${paragraph("SplitShare email", party.splitshare_email)}
  ${paragraph("Address", [party.street_address, party.city, party.state_province, party.postal_code, party.country].filter(Boolean).join(", "))}
  <p><strong>Label share:</strong> ${escapeHtml(agreement.label_share)}%</p>
  <p><strong>Artist pool:</strong> ${escapeHtml(agreement.artist_pool_share)}%</p>
  <table border="1" cellspacing="0" cellpadding="6">
    <thead><tr><th>Payee</th><th>Role</th><th>Email</th><th>Share of artist pool</th><th>Direct split</th></tr></thead>
    <tbody>${splitsRows}</tbody>
  </table>
  <h2>Schedule C - Rights Checklist</h2>
  <ol>${checklistRows}</ol>
  <h2>Signature Terms</h2>
  <p>The artist confirms that the information above is accurate and agrees to sign this locked snapshot by typed signature. The label signs after review.</p>
</body>
</html>`;

  return {
    html,
    hash: await sha256Hex(html)
  };
}

export async function createAgreementVersion(
  db: D1Database,
  agreement: AgreementRow,
  party: AgreementPartyRow,
  splits: AgreementSplitRow[] | ParsedSplit[],
  checklist: ChecklistRow[],
  actorRole: string,
  actorEmail: string | null
) {
  const previous = await db
    .prepare("SELECT MAX(version_number) AS version_number FROM agreement_versions WHERE agreement_id = ?")
    .bind(agreement.id)
    .first<{ version_number: number | null }>();
  const versionNumber = Number(previous?.version_number ?? 0) + 1;
  const snapshot = await buildAgreementSnapshot(agreement, party, splits, checklist);
  const versionId = id("agrver");

  await db
    .prepare(
      `INSERT INTO agreement_versions
       (id, agreement_id, version_number, snapshot_html, snapshot_hash, created_by_email, created_by_role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(versionId, agreement.id, versionNumber, snapshot.html, snapshot.hash, actorEmail, actorRole)
    .run();

  await db
    .prepare("UPDATE release_agreements SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(versionId, agreement.id)
    .run();

  return { id: versionId, version_number: versionNumber, snapshot_hash: snapshot.hash };
}

export async function createAuditEvent(
  db: D1Database,
  request: Request,
  agreementId: string,
  eventType: string,
  actorRole: string,
  actorEmail: string | null,
  data: Record<string, unknown> = {}
) {
  const previous = await db
    .prepare("SELECT event_hash FROM agreement_audit_events WHERE agreement_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 1")
    .bind(agreementId)
    .first<{ event_hash: string }>();
  const eventId = id("agrevt");
  const payload = {
    id: eventId,
    agreement_id: agreementId,
    event_type: eventType,
    actor_email: actorEmail,
    actor_role: actorRole,
    data,
    previous_hash: previous?.event_hash ?? null,
    at: new Date().toISOString()
  };
  const eventHash = await sha256Hex(JSON.stringify(payload));

  await db
    .prepare(
      `INSERT INTO agreement_audit_events
       (id, agreement_id, event_type, actor_email, actor_role, event_data_json, ip_address, user_agent, previous_hash, event_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      eventId,
      agreementId,
      eventType,
      actorEmail,
      actorRole,
      JSON.stringify(data),
      request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
      request.headers.get("user-agent"),
      previous?.event_hash ?? null,
      eventHash
    )
    .run();

  return eventHash;
}

export function serializeAgreement(row: AgreementRow & Record<string, unknown>) {
  return {
    ...row,
    label_share: Number(row.label_share ?? 30),
    artist_pool_share: Number(row.artist_pool_share ?? 70)
  };
}
