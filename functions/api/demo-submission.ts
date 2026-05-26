interface Env {
  DB?: D1Database;
  DEMO_BUCKET?: R2Bucket;
  DEMO_NOTIFICATION_EMAIL?: string;
}

const jsonHeaders = {
  "content-type": "application/json; charset=UTF-8",
  "cache-control": "no-store"
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // TODO: Validate origin, method, content type and rate limits before accepting production traffic.
  // TODO: Parse multipart/form-data so metadata can go to D1 and audio/artwork files can go to R2.
  // TODO: Add server-side validation matching the frontend fields.
  // TODO: Insert submission metadata into env.DB once the D1 binding is created.
  // TODO: Store uploaded files in env.DEMO_BUCKET once the R2 binding is created.
  // TODO: Send notification email to env.DEMO_NOTIFICATION_EMAIL after review workflow is approved.
  const hasPlannedBindings = Boolean(env.DB || env.DEMO_BUCKET);

  return new Response(
    JSON.stringify({
      ok: false,
      message: "Demo submission backend is planned but not enabled yet.",
      endpoint: new URL(request.url).pathname,
      plannedBindingsDetected: hasPlannedBindings
    }),
    { status: 501, headers: jsonHeaders }
  );
};

export const onRequest: PagesFunction<Env> = async () =>
  new Response(
    JSON.stringify({
      ok: false,
      message: "Use POST when the demo submission backend is implemented."
    }),
    { status: 405, headers: { ...jsonHeaders, allow: "POST" } }
  );
