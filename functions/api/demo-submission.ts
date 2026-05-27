import { id, isResponse, json, methodNotAllowed, readJson, requireDb, requiredString, type Env } from "./_shared";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

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
  await db
    .prepare(
      `INSERT INTO demo_submissions
       (id, artist_name, email, country, links, track_title, genre, streaming_link, message, agreement, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`
    )
    .bind(submissionId, artistName, email, country, links, trackTitle, genre, streamingLink, message)
    .run();

  return json(
    {
      ok: true,
      id: submissionId,
      message: "Demo received. The MasterBeat Project will review it from the admin dashboard."
    },
    { status: 201 }
  );
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
