import { isResponse, json, methodNotAllowed, readJson, requireAdmin, requireDb, requiredString, sendDemoDecisionEmail, type Env } from "../../../_shared";

type SubmissionRow = {
  id: string;
  artist_name: string;
  email: string;
  track_title: string;
  status: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const status = requiredString(body.status, "status", 6, 20);
  const reason = requiredString(body.reason, "reason", 3, 2000);
  if (isResponse(status)) return status;
  if (isResponse(reason)) return reason;
  if (!["approved", "rejected"].includes(status)) {
    return json({ ok: false, error: "status must be approved or rejected." }, { status: 400 });
  }

  const submission = await db
    .prepare("SELECT id, artist_name, email, track_title, status FROM demo_submissions WHERE id = ?")
    .bind(params.id)
    .first<SubmissionRow>();

  if (!submission) {
    return json({ ok: false, error: "Demo submission not found." }, { status: 404 });
  }

  const email = await sendDemoDecisionEmail(env, {
    to: submission.email,
    artistName: submission.artist_name,
    trackTitle: submission.track_title,
    status,
    reason
  });

  await db
    .prepare(
      `UPDATE demo_submissions
       SET status = ?, decision_reason = ?, email_status = ?, response_sent_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE response_sent_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(status, reason, email.status, email.sent ? 1 : 0, params.id)
    .run();

  return json({ ok: true, email });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
