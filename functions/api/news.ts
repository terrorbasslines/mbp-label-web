import { isResponse, json, methodNotAllowed, requireDb, type Env } from "./_shared";
import { invalidNewsTableResponse, isNewsTableMissing, serializeArticle, type NewsArticleRow } from "./_news";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const db = requireDb(env);
  if (isResponse(db)) return json({ ok: true, articles: [], error: "D1 is not configured yet." });

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 24), 1), 48);

  try {
    const result = await db
      .prepare(
        `SELECT a.*,
          (SELECT COUNT(*) FROM news_comments c WHERE c.article_id = a.id AND c.status = 'published') AS comments_count,
          (SELECT COUNT(*) FROM news_reactions r WHERE r.article_id = a.id) AS reactions_count
         FROM news_articles a
         WHERE a.status = 'published'
         ORDER BY datetime(COALESCE(a.published_at, a.updated_at, a.created_at)) DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<NewsArticleRow & { comments_count?: number; reactions_count?: number }>();

    return json(
      {
        ok: true,
        articles: (result.results ?? []).map((article) =>
          serializeArticle(article, {
            comments_count: Number(article.comments_count ?? 0),
            reactions_count: Number(article.reactions_count ?? 0),
            url: `/news/${article.slug}`
          })
        )
      },
      {
        headers: {
          "cache-control": "public, max-age=120"
        }
      }
    );
  } catch (error) {
    if (isNewsTableMissing(error)) return invalidNewsTableResponse();
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET"]);
