import { isResponse, json, requireAdmin, requireDb, type Env } from "../_shared";

type DemoSubmissionRow = Record<string, unknown> & {
  id: string;
  message: string;
  streaming_link: string;
  upload_key?: string | null;
  upload_name?: string | null;
  upload_type?: string | null;
  upload_size?: number | null;
};

function legacyUploadFromMessage(message: string) {
  const noteIndex = message.indexOf("\n\nUploaded file stored in R2:");
  if (noteIndex === -1) return null;

  const note = message.slice(noteIndex);
  const name = note.match(/- Name:\s*([^\n]+)/)?.[1]?.trim() ?? null;
  const type = note.match(/- Type:\s*([^\n]+)/)?.[1]?.trim() ?? null;
  const size = Number(note.match(/- Size:\s*(\d+)\s*bytes/)?.[1] ?? 0) || null;
  const key = note.match(/- R2 key:\s*([^\n]+)/)?.[1]?.trim() ?? null;
  if (!key) return null;
  return { key, name, type, size };
}

function cleanMessage(message: string) {
  return message.split("\n\nUploaded file stored in R2:")[0]?.trim() ?? message;
}

function isAudioUpload(type: string | null | undefined, name: string | null | undefined) {
  return Boolean(type?.startsWith("audio/") || /\.(wav|mp3|aiff|aif|flac|m4a|aac|ogg)$/i.test(name ?? ""));
}

function normalizeSubmission(row: DemoSubmissionRow) {
  const legacy = legacyUploadFromMessage(row.message ?? "");
  const uploadKey = row.upload_key || legacy?.key || null;
  const uploadName = row.upload_name || legacy?.name || null;
  const uploadType = row.upload_type || legacy?.type || null;
  const uploadSize = row.upload_size || legacy?.size || null;
  const hasAudio = Boolean(uploadKey && isAudioUpload(uploadType, uploadName));

  return {
    ...row,
    message: cleanMessage(row.message ?? ""),
    upload: uploadKey
      ? {
          name: uploadName,
          type: uploadType,
          size: uploadSize,
          is_audio: hasAudio,
          playback_url: hasAudio ? `/api/admin/demo-submissions/${encodeURIComponent(row.id)}/file` : null
        }
      : null
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "pending";
  const where = scope === "archive" ? "WHERE status != 'pending'" : scope === "all" ? "" : "WHERE status = 'pending'";
  const limit = scope === "archive" ? 500 : 100;

  const orderBy = scope === "archive" ? "updated_at DESC, created_at DESC" : "created_at DESC";
  const result = await db
    .prepare(`SELECT * FROM demo_submissions ${where} ORDER BY ${orderBy} LIMIT ?`)
    .bind(limit)
    .all<DemoSubmissionRow>();

  const counts = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status != 'pending' THEN 1 ELSE 0 END) AS archived,
        COUNT(*) AS total
       FROM demo_submissions`
    )
    .first<{ pending: number | null; archived: number | null; total: number | null }>();

  return json({
    ok: true,
    counts: {
      pending: counts?.pending ?? 0,
      archived: counts?.archived ?? 0,
      total: counts?.total ?? 0
    },
    submissions: (result.results ?? []).map(normalizeSubmission)
  });
};
