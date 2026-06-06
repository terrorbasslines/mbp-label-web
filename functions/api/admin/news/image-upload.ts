import { isResponse, json, methodNotAllowed, optionalString, requireAdmin, type Env } from "../../_shared";

function safeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  if (!env.DEMO_BUCKET) {
    return json({ ok: false, error: "Cloudflare R2 binding DEMO_BUCKET is not configured for News image uploads." }, { status: 503 });
  }

  const formData = await request.formData();
  const articleId = optionalString(formData.get("article_id"), 160) || "draft";
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return json({ ok: false, error: "Choose a News cover image to upload." }, { status: 400 });
  }
  if (!image.type.startsWith("image/")) {
    return json({ ok: false, error: "News cover upload must be an image file." }, { status: 400 });
  }
  if (image.size > 15 * 1024 * 1024) {
    return json({ ok: false, error: "News cover upload is too large. Maximum size is 15 MB." }, { status: 400 });
  }

  const fileName = `${articleId}-${crypto.randomUUID()}-${safeFileName(image.name || "news-cover")}`;
  const key = `news-images/${fileName}`;
  await env.DEMO_BUCKET.put(key, image.stream(), {
    httpMetadata: { contentType: image.type || "application/octet-stream" },
    customMetadata: {
      articleId,
      originalName: image.name
    }
  });

  return json({ ok: true, url: `/media/news-images/${encodeURIComponent(fileName)}`, key });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
