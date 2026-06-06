import { isResponse, json, methodNotAllowed, optionalString, requireAdmin, type Env } from "../../_shared";

function safeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function mediaKind(type: string) {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  if (!env.DEMO_BUCKET) {
    return json({ ok: false, error: "Cloudflare R2 binding DEMO_BUCKET is not configured for News media uploads." }, { status: 503 });
  }

  const formData = await request.formData();
  const articleId = optionalString(formData.get("article_id"), 160) || "draft";
  const media = formData.get("media");
  if (!(media instanceof File) || media.size === 0) {
    return json({ ok: false, error: "Choose an image, audio or video file to upload." }, { status: 400 });
  }

  const kind = mediaKind(media.type || "");
  if (!kind) {
    return json({ ok: false, error: "News media upload must be an image, audio or video file." }, { status: 400 });
  }
  if (media.size > 50 * 1024 * 1024) {
    return json({ ok: false, error: "News media upload is too large. Maximum size is 50 MB." }, { status: 400 });
  }

  const fileName = `${articleId}-${crypto.randomUUID()}-${safeFileName(media.name || "news-media")}`;
  const key = `news-media/${fileName}`;
  await env.DEMO_BUCKET.put(key, media.stream(), {
    httpMetadata: { contentType: media.type || "application/octet-stream" },
    customMetadata: {
      articleId,
      kind,
      originalName: media.name
    }
  });

  return json({ ok: true, url: `/media/news-media/${encodeURIComponent(fileName)}`, key, kind, type: media.type });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
