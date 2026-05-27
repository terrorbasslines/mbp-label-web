import { isResponse, json, methodNotAllowed, requireAdmin, requireDb, type Env } from "../../../_shared";

type SubmissionFileRow = {
  id: string;
  message: string | null;
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
  const key = note.match(/- R2 key:\s*([^\n]+)/)?.[1]?.trim() ?? null;
  if (!key) return null;
  return { key, name, type };
}

function safeDispositionName(value: string | null | undefined) {
  const clean = String(value || "demo-upload")
    .replace(/["\\]/g, "")
    .replace(/[^\x20-\x7E]+/g, "_")
    .trim()
    .slice(0, 120);
  return clean || "demo-upload";
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  if (!env.DEMO_BUCKET) {
    return json({ ok: false, error: "Cloudflare R2 binding DEMO_BUCKET is not configured." }, { status: 503 });
  }

  const submissionId = String(params.id ?? "");
  const submission = await db
    .prepare("SELECT id, message, upload_key, upload_name, upload_type, upload_size FROM demo_submissions WHERE id = ?")
    .bind(submissionId)
    .first<SubmissionFileRow>();

  if (!submission) {
    return json({ ok: false, error: "Demo submission not found." }, { status: 404 });
  }

  const legacy = legacyUploadFromMessage(submission.message ?? "");
  const key = submission.upload_key || legacy?.key;
  if (!key) {
    return json({ ok: false, error: "No uploaded file is stored for this submission." }, { status: 404 });
  }

  const object = await env.DEMO_BUCKET.get(key);
  if (!object) {
    return json({ ok: false, error: "Uploaded file was not found in R2." }, { status: 404 });
  }

  const contentType = submission.upload_type || legacy?.type || object.httpMetadata?.contentType || "application/octet-stream";
  const filename = safeDispositionName(submission.upload_name || legacy?.name);

  return new Response(object.body, {
    headers: {
      "content-type": contentType,
      "content-length": String(object.size),
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store"
    }
  });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET"]);
