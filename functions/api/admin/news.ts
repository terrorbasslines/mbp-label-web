import {
  id,
  isResponse,
  json,
  methodNotAllowed,
  optionalString,
  readJson,
  requireAdmin,
  requireDb,
  requiredString,
  type Env
} from "../_shared";
import {
  findArticleById,
  invalidNewsTableResponse,
  isNewsTableMissing,
  normalizeAccentColor,
  normalizeArticleStatus,
  serializeArticle,
  uniqueArticleSlug,
  type NewsArticleRow
} from "../_news";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    const result = await db
      .prepare(
        `SELECT a.*,
          (SELECT COUNT(*) FROM news_comments c WHERE c.article_id = a.id AND c.status = 'published') AS comments_count,
          (SELECT COUNT(*) FROM news_reactions r WHERE r.article_id = a.id) AS reactions_count
         FROM news_articles a
         ORDER BY datetime(COALESCE(a.published_at, a.updated_at, a.created_at)) DESC`
      )
      .all<NewsArticleRow & { comments_count?: number; reactions_count?: number }>();

    return json({
      ok: true,
      articles: (result.results ?? []).map((article) =>
        serializeArticle(article, {
          comments_count: Number(article.comments_count ?? 0),
          reactions_count: Number(article.reactions_count ?? 0)
        })
      )
    });
  } catch (error) {
    if (isNewsTableMissing(error)) return invalidNewsTableResponse();
    throw error;
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const title = requiredString(body.title, "title", 2, 180);
  const content = requiredString(body.content, "content", 10, 30000);
  if (isResponse(title)) return title;
  if (isResponse(content)) return content;

  const articleId = id("news");
  const status = normalizeArticleStatus(body.status);
  const publishedAt = status === "published" ? optionalString(body.published_at, 80) ?? new Date().toISOString() : optionalString(body.published_at, 80);
  const slug = await uniqueArticleSlug(db, title, optionalString(body.slug, 160));

  await db
    .prepare(
      `INSERT INTO news_articles
       (id, slug, title, excerpt, content, cover_image_url, status, category, author_name, social_title, social_description, accent_color, published_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(
      articleId,
      slug,
      title,
      optionalString(body.excerpt, 500),
      content,
      optionalString(body.cover_image_url, 2000),
      status,
      optionalString(body.category, 120),
      optionalString(body.author_name, 160) ?? "The MasterBeat Project",
      optionalString(body.social_title, 180),
      optionalString(body.social_description, 320),
      normalizeAccentColor(body.accent_color),
      publishedAt
    )
    .run();

  const article = await findArticleById(db, articleId);
  return json({ ok: true, article: article ? serializeArticle(article) : { id: articleId, slug, title } }, { status: 201 });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
