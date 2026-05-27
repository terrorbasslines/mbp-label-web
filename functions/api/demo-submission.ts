import { id, isResponse, json, methodNotAllowed, readJson, requireDb, requiredString, type Env } from "./_shared";

function safeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("fileUpload");
    return {
      body: {
        artistName: formData.get("artistName"),
        email: formData.get("email"),
        country: formData.get("country"),
        links: formData.get("links"),
        trackTitle: formData.get("trackTitle"),
        genre: formData.get("genre"),
        streamingLink: formData.get("streamingLink"),
        message: formData.get("message"),
        agreement: formData.get("agreement") === "on" || formData.get("agreement") === "true"
      },
      file: file instanceof File && file.size > 0 ? file : null
    };
  }

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  return { body, file: null };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const db = requireDb(env);
  if (isResponse(db)) return db;

  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  const { body, file } = payload;

  const artistName = requiredString(body.artistName, "artistName", 2, 160);
  const email = requiredString(body.email, "email", 5, 240);
  const country = requiredString(body.country, "country", 2, 120);
  const links = requiredString(body.links, "links", 8, 1000);
  const trackTitle = requiredString(body.trackTitle, "trackTitle", 2, 180);
  const genre = requiredString(body.genre, "genre", 2, 120);
  const streamingLink = requiredString(body.streamingLink, "streamingLink", 8, 1000);
  const message = requiredString(body.message, "message", 20, 1200);
  if (isResponse(artistName)) return artistName;
  if (isResponse(email)) return email;
  if (isResponse(country)) return country;
  if (isResponse(links)) return links;
  if (isResponse(trackTitle)) return trackTitle;
  if (isResponse(genre)) return genre;
  if (isResponse(streamingLink)) return streamingLink;
  if (isResponse(message)) return message;

  if (body.agreement !== true) {
    return json({ ok: false, error: "Agreement is required." }, { status: 400 });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return json({ ok: false, error: "Valid email is required." }, { status: 400 });
  }

  const submissionId = id("demo");
  let uploadKey: string | null = null;
  let uploadName: string | null = null;
  let uploadType: string | null = null;
  let uploadSize: number | null = null;

  if (file) {
    if (!env.DEMO_BUCKET) {
      return json({ ok: false, error: "Cloudflare R2 binding DEMO_BUCKET is not configured for file uploads yet." }, { status: 503 });
    }

    const maxBytes = 100 * 1024 * 1024;
    if (file.size > maxBytes) {
      return json({ ok: false, error: "File upload is too large. Maximum size is 100 MB." }, { status: 400 });
    }

    const allowedType = file.type.startsWith("audio/") || file.type.startsWith("image/") || /\.(wav|mp3|aiff|aif|flac)$/i.test(file.name);
    if (!allowedType) {
      return json({ ok: false, error: "Upload must be an audio file or artwork image." }, { status: 400 });
    }

    const fileName = safeFileName(file.name || "demo-upload");
    const fileKey = `demo-submissions/${submissionId}/${fileName}`;
    await env.DEMO_BUCKET.put(fileKey, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: {
        submissionId,
        artistName,
        trackTitle,
        originalName: file.name
      }
    });

    uploadKey = fileKey;
    uploadName = file.name || fileName;
    uploadType = file.type || "application/octet-stream";
    uploadSize = file.size;
  }

  await db
    .prepare(
      `INSERT INTO demo_submissions
       (id, artist_name, email, country, links, track_title, genre, streaming_link, message, agreement, upload_key, upload_name, upload_type, upload_size, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(submissionId, artistName, email, country, links, trackTitle, genre, streamingLink, message, uploadKey, uploadName, uploadType, uploadSize)
    .run();

  return json(
    {
      ok: true,
      id: submissionId,
      fileUploaded: Boolean(file),
      message: "Demo received. The MasterBeat Project will review it from the admin dashboard."
    },
    { status: 201 }
  );
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
