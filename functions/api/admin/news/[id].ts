import {
  isResponse,
  json,
  methodNotAllowed,
  optionalString,
  readJson,
  requireAdmin,
  requireDb,
  requiredString,
  type Env
} from "../../_shared";
import {
  findArticleById,
  isNewsTableMissing,
  normalizeAccentColor,
  normalizeArticleStatus,
  resolveNewsCategory,
  sanitizeArticleHtml,
  serializeArticle,
  stripHtml,
  uniqueArticleSlug
} from "../../_news";

export const onRequestPut: PagesFunction<Env> = async ({ params, request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const articleId = String(params.id ?? "");
  const existing = await findArticleById(db, articleId);
  if (!existing) return json({ ok: false, error: "News article not found." }, { status: 404 });

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const title = requiredString(body.title, "title", 2, 180);
  const contentHtml = sanitizeArticleHtml(body.content);
  const content = requiredString(stripHtml(contentHtml) || contentHtml, "content", 10, 60000);
  if (isResponse(title)) return title;
  if (isResponse(content)) return content;

  const status = normalizeArticleStatus(body.status);
  const slug = await uniqueArticleSlug(db, title, optionalString(body.slug, 160) ?? existing.slug, articleId);
  const publishedAt =
    status === "published"
      ? optionalString(body.published_at, 80) ?? existing.published_at ?? new Date().toISOString()
      : optionalString(body.published_at, 80);
  const category = await resolveNewsCategory(db, body.category_id);
  if (optionalString(body.category_id, 160) && !category) {
    return json({ ok: false, error: "News category not found." }, { status: 400 });
  }

  await db
    .prepare(
      `UPDATE news_articles
       SET slug = ?, title = ?, excerpt = ?, content = ?, cover_image_url = ?, status = ?, category_id = ?, category = ?,
           author_name = ?, seo_title = ?, seo_description = ?, social_title = ?, social_description = ?, accent_color = ?, published_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
      slug,
      title,
      optionalString(body.excerpt, 500),
      contentHtml,
      optionalString(body.cover_image_url, 2000),
      status,
      category?.id ?? null,
      category?.name ?? optionalString(body.category, 120),
      optionalString(body.author_name, 160) ?? "The MasterBeat Project",
      optionalString(body.seo_title, 180),
      optionalString(body.seo_description, 320),
      optionalString(body.social_title, 180),
      optionalString(body.social_description, 320),
      normalizeAccentColor(body.accent_color ?? category?.accent_color),
      publishedAt,
      articleId
    )
    .run();

  const article = await findArticleById(db, articleId);
  return json({ ok: true, article: article ? serializeArticle(article) : { id: articleId, slug, title } });
};

export const onRequestDelete: PagesFunction<Env> = async ({ params, request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    await db.prepare("DELETE FROM news_articles WHERE id = ?").bind(String(params.id ?? "")).run();
    return json({ ok: true });
  } catch (error) {
    if (isNewsTableMissing(error)) return json({ ok: true });
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["PUT", "DELETE"]);
