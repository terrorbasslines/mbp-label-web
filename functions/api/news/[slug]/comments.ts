import { id, isResponse, json, methodNotAllowed, readJson, requireDb, requireSession, requiredString, type Env } from "../../_shared";
import { findPublishedArticle, getSessionArtist, isNewsTableMissing, type NewsCommentRow } from "../../_news";

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const db = requireDb(env);
  if (isResponse(db)) return json({ ok: true, comments: [] });

  try {
    const article = await findPublishedArticle(db, String(params.slug ?? "").toLowerCase());
    if (!article) return json({ ok: false, error: "News article not found." }, { status: 404 });

    const comments = await db
      .prepare(
        `SELECT id, article_id, artist_id, artist_name, artist_email, body, status, created_at, updated_at
         FROM news_comments
         WHERE article_id = ? AND status = 'published'
         ORDER BY datetime(created_at) DESC
         LIMIT 100`
      )
      .bind(article.id)
      .all<NewsCommentRow>();

    return json({ ok: true, comments: comments.results ?? [] });
  } catch (error) {
    if (isNewsTableMissing(error)) return json({ ok: true, comments: [], migration_required: true });
    throw error;
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ params, request, env }) => {
  const session = await requireSession(request, env);
  if (isResponse(session)) return session;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const article = await findPublishedArticle(db, String(params.slug ?? "").toLowerCase());
  if (!article) return json({ ok: false, error: "News article not found." }, { status: 404 });

  const artist = await getSessionArtist(db, session);
  if (!artist) return json({ ok: false, error: "Claimed artist account required to comment." }, { status: 403 });

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const commentBody = requiredString(body.body, "body", 2, 2000);
  if (isResponse(commentBody)) return commentBody;

  const commentId = id("ncom");
  await db
    .prepare(
      `INSERT INTO news_comments (id, article_id, artist_id, artist_name, artist_email, body, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP)`
    )
    .bind(commentId, article.id, artist.id, artist.name, artist.email, commentBody)
    .run();

  const comment = await db.prepare("SELECT * FROM news_comments WHERE id = ? LIMIT 1").bind(commentId).first<NewsCommentRow>();
  return json({ ok: true, comment }, { status: 201 });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
