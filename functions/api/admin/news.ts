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
  ensureDefaultNewsCategories,
  findArticleById,
  invalidNewsTableResponse,
  isNewsTableMissing,
  normalizeAccentColor,
  normalizeArticleStatus,
  resolveNewsCategory,
  sanitizeArticleHtml,
  serializeArticle,
  stripHtml,
  uniqueArticleSlug,
  type NewsCategoryRow,
  type NewsArticleRow
} from "../_news";

async function listNewsAuthors(db: D1Database) {
  const names = new Set<string>(["The MasterBeat Project"]);

  const claimedAdmins = await db
    .prepare(
      `SELECT DISTINCT COALESCE(NULLIF(u.name, ''), NULLIF(a.name, ''), u.email) AS name, u.email
       FROM users u
       LEFT JOIN user_artists ua ON ua.user_id = u.id
       LEFT JOIN artists a ON a.id = ua.artist_id
       WHERE lower(u.role) = 'admin'
       ORDER BY lower(name)`
    )
    .all<{ name: string | null; email: string | null }>();
  for (const row of claimedAdmins.results ?? []) {
    const name = optionalString(row.name, 160) || optionalString(row.email, 160);
    if (name) names.add(name);
  }

  const managementAuthors = await db
    .prepare(
      `SELECT name
       FROM artists
       WHERE lower(name) IN ('terror basslines', 'romee storm', 'alexair', 'rodrigo stadt')
       ORDER BY CASE lower(name)
         WHEN 'terror basslines' THEN 1
         WHEN 'romee storm' THEN 2
         WHEN 'alexair' THEN 3
         WHEN 'rodrigo stadt' THEN 4
         ELSE 99
       END`
    )
    .all<{ name: string | null }>();
  for (const row of managementAuthors.results ?? []) {
    const name = optionalString(row.name, 160);
    if (name) names.add(name);
  }

  return [...names].map((name) => ({ name }));
}

async function listNewsCategories(db: D1Database) {
  await ensureDefaultNewsCategories(db);
  const result = await db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM news_articles a WHERE a.category_id = c.id) AS article_count,
              (SELECT COUNT(*) FROM news_articles a WHERE a.category_id = c.id AND a.status = 'published') AS published_count,
              (SELECT COUNT(*) FROM news_articles a WHERE a.category_id = c.id AND a.status = 'draft') AS draft_count
       FROM news_categories c
       ORDER BY lower(c.name)`
    )
    .all<NewsCategoryRow & { article_count?: number; published_count?: number; draft_count?: number }>();
  return (result.results ?? []).map((category) => ({
    ...category,
    article_count: Number(category.article_count ?? 0),
    published_count: Number(category.published_count ?? 0),
    draft_count: Number(category.draft_count ?? 0)
  }));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    await ensureDefaultNewsCategories(db);
    const result = await db
      .prepare(
        `SELECT a.*, c.slug AS category_slug, c.name AS category_name, c.description AS category_description,
                COALESCE(c.accent_color, a.accent_color) AS category_accent_color,
          (SELECT COUNT(*) FROM news_comments nc WHERE nc.article_id = a.id AND nc.status = 'published') AS comments_count,
          (SELECT COUNT(*) FROM news_reactions r WHERE r.article_id = a.id) AS reactions_count
         FROM news_articles a
         LEFT JOIN news_categories c ON c.id = a.category_id
         ORDER BY datetime(COALESCE(a.published_at, a.updated_at, a.created_at)) DESC`
      )
      .all<NewsArticleRow & { comments_count?: number; reactions_count?: number }>();

    return json({
      ok: true,
      authors: await listNewsAuthors(db),
      categories: await listNewsCategories(db),
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
  const contentHtml = sanitizeArticleHtml(body.content);
  const content = requiredString(stripHtml(contentHtml) || contentHtml, "content", 10, 60000);
  if (isResponse(title)) return title;
  if (isResponse(content)) return content;

  try {
    await ensureDefaultNewsCategories(db);
    const articleId = id("news");
    const status = normalizeArticleStatus(body.status);
    const publishedAt = status === "published" ? optionalString(body.published_at, 80) ?? new Date().toISOString() : optionalString(body.published_at, 80);
    const slug = await uniqueArticleSlug(db, title, optionalString(body.slug, 160));
    const category = await resolveNewsCategory(db, body.category_id);
    if (optionalString(body.category_id, 160) && !category) {
      return json({ ok: false, error: "News category not found." }, { status: 400 });
    }

    await db
      .prepare(
        `INSERT INTO news_articles
         (id, slug, title, excerpt, content, cover_image_url, status, category_id, category, author_name, seo_title, seo_description,
          social_title, social_description, accent_color, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(
        articleId,
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
        publishedAt
      )
      .run();

    const article = await findArticleById(db, articleId);
    return json({ ok: true, article: article ? serializeArticle(article) : { id: articleId, slug, title } }, { status: 201 });
  } catch (error) {
    if (isNewsTableMissing(error)) {
      return json(
        { ok: false, error: "News articles are not installed yet. Run D1 migrations 0011, 0012 and 0013 for the production database." },
        { status: 409 }
      );
    }
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
