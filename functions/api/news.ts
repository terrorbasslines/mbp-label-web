import { isResponse, json, methodNotAllowed, optionalString, requireDb, verifySession, type Env } from "./_shared";
import { invalidNewsTableResponse, isNewsTableMissing, serializeArticle, type NewsArticleRow } from "./_news";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const db = requireDb(env);
  if (isResponse(db)) return json({ ok: true, articles: [], error: "D1 is not configured yet." });

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 24), 1), 48);
  const categoryFilter = optionalString(url.searchParams.get("category"), 120);
  const session = await verifySession(request, env);
  const includeDrafts = url.searchParams.get("preview") === "admin" && session?.role === "admin";

  try {
    const where: string[] = [];
    const bindValues: Array<string | number> = [];
    if (!includeDrafts) where.push("a.status = 'published'");
    if (categoryFilter) {
      where.push("(c.slug = ? OR c.id = ? OR lower(a.category) = lower(?))");
      bindValues.push(categoryFilter, categoryFilter, categoryFilter);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const result = await db
      .prepare(
        `SELECT a.*, c.slug AS category_slug, c.name AS category_name, c.description AS category_description,
          COALESCE(c.accent_color, a.accent_color) AS category_accent_color,
          (SELECT COUNT(*) FROM news_comments nc WHERE nc.article_id = a.id AND nc.status = 'published') AS comments_count,
          (SELECT COUNT(*) FROM news_reactions r WHERE r.article_id = a.id) AS reactions_count
         FROM news_articles a
         LEFT JOIN news_categories c ON c.id = a.category_id
         ${whereSql}
         ORDER BY datetime(COALESCE(a.published_at, a.updated_at, a.created_at)) DESC
         LIMIT ?`
      )
      .bind(...bindValues, limit)
      .all<NewsArticleRow & { comments_count?: number; reactions_count?: number }>();

    const categoryCounts = await db
      .prepare(
        `SELECT c.id, c.slug, c.name, c.description, c.accent_color, COUNT(a.id) AS count
         FROM news_categories c
         LEFT JOIN news_articles a ON a.category_id = c.id ${includeDrafts ? "" : "AND a.status = 'published'"}
         GROUP BY c.id, c.slug, c.name, c.description, c.accent_color
         HAVING COUNT(a.id) > 0
         ORDER BY lower(c.name)`
      )
      .all<{ id: string; slug: string; name: string; description: string | null; accent_color: string; count: number }>();

    return json(
      {
        ok: true,
        include_drafts: includeDrafts,
        categories: (categoryCounts.results ?? []).map((category) => ({
          ...category,
          count: Number(category.count ?? 0)
        })),
        articles: (result.results ?? []).map((article) =>
          serializeArticle(article, {
            comments_count: Number(article.comments_count ?? 0),
            reactions_count: Number(article.reactions_count ?? 0),
            url: `/news/${article.slug}${article.status === "draft" ? "?preview=admin" : ""}`
          })
        )
      },
      {
        headers: {
          "cache-control": includeDrafts ? "no-store" : "public, max-age=120"
        }
      }
    );
  } catch (error) {
    if (isNewsTableMissing(error)) return invalidNewsTableResponse();
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET"]);
