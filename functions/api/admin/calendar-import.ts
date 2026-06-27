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
import { calendarDeadlines, normalizeBrand, toDateString } from "../_agreements";

type ImportRow = {
  brand?: unknown;
  source_sheet?: unknown;
  source_row?: unknown;
  release_date?: unknown;
  artist_name?: unknown;
  track_title?: unknown;
  remix?: unknown;
  catalog_number?: unknown;
  status?: unknown;
};

type ExistingSlotRow = {
  id: string;
};

function importedSlotStatus(row: {
  releaseDate: string;
  artistName: string | null;
  trackTitle: string | null;
  catalogNumber: string | null;
  importedStatus: string | null;
}) {
  const status = String(row.importedStatus ?? "").trim().toLowerCase();
  const occupied = Boolean(row.artistName || row.trackTitle);
  const today = new Date().toISOString().slice(0, 10);

  if (status.includes("cancel")) return "cancelled";
  if (!occupied) return "available";
  if (row.releaseDate < today) return "released";
  if (status.includes("signed")) return "locked";
  if (status.includes("pending") || status.includes("signing")) return "confirmed";
  return "confirmed";
}

function compactNotes(parts: Array<string | null>) {
  return parts.filter(Boolean).join(" | ") || null;
}

async function findExistingSlot(db: D1Database, brand: string, releaseDate: string, catalogNumber: string | null) {
  if (catalogNumber) {
    return db
      .prepare(
        `SELECT id FROM release_calendar_slots
         WHERE brand = ? AND release_date = ? AND lower(catalog_number) = lower(?)
         LIMIT 1`
      )
      .bind(brand, releaseDate, catalogNumber)
      .first<ExistingSlotRow>();
  }

  return db
    .prepare(
      `SELECT id FROM release_calendar_slots
       WHERE brand = ? AND release_date = ? AND (catalog_number IS NULL OR trim(catalog_number) = '')
       LIMIT 1`
    )
    .bind(brand, releaseDate)
    .first<ExistingSlotRow>();
}

async function removeBlankGeneratedSlots(db: D1Database, brand: string, releaseDate: string) {
  await db
    .prepare(
      `DELETE FROM release_calendar_slots
       WHERE brand = ?
         AND release_date = ?
         AND current_release_count = 0
         AND (catalog_number IS NULL OR trim(catalog_number) = '')
         AND (artist_name IS NULL OR trim(artist_name) = '')
         AND (track_title IS NULL OR trim(track_title) = '')`
    )
    .bind(brand, releaseDate)
    .run();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const rows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : [];
  if (!rows.length) return json({ ok: false, error: "No calendar rows were provided." }, { status: 400 });
  if (rows.length > 3000) return json({ ok: false, error: "Import is limited to 3000 rows per upload." }, { status: 400 });

  const sourceFile = optionalString(body.source_file, 240) ?? "calendar-import.xlsx";
  const summary: Record<string, { imported: number; skipped: number }> = {
    MBP: { imported: 0, skipped: 0 },
    MBH: { imported: 0, skipped: 0 },
    S7: { imported: 0, skipped: 0 }
  };
  const importedIds: string[] = [];

  for (const sourceRow of rows) {
    const brand = normalizeBrand(sourceRow.brand);
    const releaseDate = toDateString(sourceRow.release_date);
    const artistName = optionalString(sourceRow.artist_name, 200);
    const trackTitle = optionalString(sourceRow.track_title, 240);
    const remix = optionalString(sourceRow.remix, 200);
    const catalogNumber = optionalString(sourceRow.catalog_number, 80);
    const importedStatus = optionalString(sourceRow.status, 120);
    const sourceSheet = optionalString(sourceRow.source_sheet, 120);
    const sourceRowNumber = Math.max(0, Math.floor(Number(sourceRow.source_row ?? 0) || 0)) || null;
    const hasUsefulData = Boolean(releaseDate && (artistName || trackTitle || catalogNumber || importedStatus));

    if (!releaseDate || !hasUsefulData) {
      summary[brand].skipped += 1;
      continue;
    }

    if (artistName || trackTitle || catalogNumber) {
      await removeBlankGeneratedSlots(db, brand, releaseDate);
    }

    const status = importedSlotStatus({ releaseDate, artistName, trackTitle, catalogNumber, importedStatus });
    const occupied = Boolean(artistName || trackTitle);
    const deadlines = calendarDeadlines(releaseDate);
    const slotId = (await findExistingSlot(db, brand, releaseDate, catalogNumber))?.id ?? id("slot");
    const internalNotes = compactNotes([
      remix ? `Remix: ${remix}` : null,
      importedStatus ? `Imported status: ${importedStatus}` : null,
      sourceSheet ? `Source: ${sourceSheet}${sourceRowNumber ? ` row ${sourceRowNumber}` : ""}` : null
    ]);

    await db
      .prepare(
        `INSERT INTO release_calendar_slots
         (id, brand, release_date, status, max_releases, current_release_count, agreement_deadline, asset_deadline,
          distributor_delivery_deadline, promo_start_date, artist_name, track_title, catalog_number, source_sheet,
          internal_notes, imported_source_file, imported_row_number, imported_status, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
          brand = excluded.brand,
          release_date = excluded.release_date,
          status = excluded.status,
          max_releases = excluded.max_releases,
          current_release_count = excluded.current_release_count,
          agreement_deadline = excluded.agreement_deadline,
          asset_deadline = excluded.asset_deadline,
          distributor_delivery_deadline = excluded.distributor_delivery_deadline,
          promo_start_date = excluded.promo_start_date,
          artist_name = excluded.artist_name,
          track_title = excluded.track_title,
          catalog_number = excluded.catalog_number,
          source_sheet = excluded.source_sheet,
          internal_notes = excluded.internal_notes,
          imported_source_file = excluded.imported_source_file,
          imported_row_number = excluded.imported_row_number,
          imported_status = excluded.imported_status,
          updated_at = CURRENT_TIMESTAMP`
      )
      .bind(
        slotId,
        brand,
        releaseDate,
        status,
        occupied ? 1 : 0,
        deadlines.agreement_deadline,
        deadlines.asset_deadline,
        deadlines.distributor_delivery_deadline,
        deadlines.promo_start_date,
        artistName,
        trackTitle,
        catalogNumber,
        sourceSheet,
        internalNotes,
        sourceFile,
        sourceRowNumber,
        importedStatus
      )
      .run();

    importedIds.push(slotId);
    summary[brand].imported += 1;
  }

  return json({ ok: true, imported: importedIds.length, summary });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
