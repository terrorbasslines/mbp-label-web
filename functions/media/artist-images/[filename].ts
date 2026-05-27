import type { Env } from "../../api/_shared";

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  if (!env.DEMO_BUCKET) return new Response("R2 bucket is not configured.", { status: 503 });

  const filename = String(params.filename ?? "");
  if (!filename || filename.includes("/") || filename.includes("\\")) {
    return new Response("Invalid image path.", { status: 400 });
  }

  const object = await env.DEMO_BUCKET.get(`artist-images/${filename}`);
  if (!object) return new Response("Image not found.", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  return new Response(object.body, { headers });
};
