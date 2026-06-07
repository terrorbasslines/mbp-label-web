import { id, isResponse, json, methodNotAllowed, readJson, requireDb, requireSession, type Env } from "../../_shared";
import { findPublishedArticle, getSessionArtist, isNewsTableMissing, NEWS_REACTIONS, type NewsReaction, type ReactionCountRow } from "../../_news";

function emptyCounts() {
  return Object.fromEntries(NEWS_REACTIONS.map((reaction) => [reaction, 0]));
}

async function reactionCounts(db: D1Database, articleId: string) {
  const rows = await db
    .prepare("SELECT reaction, COUNT(*) AS count FROM news_reactions WHERE article_id = ? GROUP BY reaction")
    .bind(articleId)
    .all<ReactionCountRow>();
  const counts = emptyCounts();
  for (const row of rows.results ?? []) {
    const reaction = String(row.reaction ?? "").toLowerCase() as NewsReaction;
    if (NEWS_REACTIONS.includes(reaction)) {
      counts[reaction] = Number(row.count ?? 0);
    }
  }
  return counts;
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const db = requireDb(env);
  if (isResponse(db)) return json({ ok: true, counts: emptyCounts() });

  try {
    const article = await findPublishedArticle(db, String(params.slug ?? "").toLowerCase());
    if (!article) return json({ ok: false, error: "News article not found." }, { status: 404 });

    return json({ ok: true, counts: await reactionCounts(db, article.id) });
  } catch (error) {
    if (isNewsTableMissing(error)) return json({ ok: true, counts: emptyCounts(), migration_required: true });
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
  if (!artist) return json({ ok: false, error: "Claimed artist account required to react." }, { status: 403 });

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const reaction = String(body.reaction ?? "").toLowerCase() as NewsReaction;
  if (!NEWS_REACTIONS.includes(reaction)) {
    return json({ ok: false, error: "Unknown reaction." }, { status: 400 });
  }

  await db
    .prepare(
      `INSERT INTO news_reactions (id, article_id, artist_id, artist_name, artist_email, reaction, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(article_id, artist_id)
       DO UPDATE SET reaction = excluded.reaction, artist_name = excluded.artist_name, artist_email = excluded.artist_email, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(id("nrea"), article.id, artist.id, artist.name, artist.email, reaction)
    .run();

  return json({ ok: true, counts: await reactionCounts(db, article.id), reaction });
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
