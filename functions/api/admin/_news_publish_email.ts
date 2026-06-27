import { sendNewsPublishedEmail, type Env } from "../_shared";
import { serializeArticle, type NewsArticleRow } from "../_news";

async function listAccountRecipients(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT DISTINCT lower(email) AS email
       FROM users
       WHERE email IS NOT NULL AND trim(email) <> ''`
    )
    .all<{ email: string | null }>();

  return (result.results ?? []).map((row) => row.email || "").filter(Boolean);
}

export async function sendPublishedNewsNotification(db: D1Database, env: Env, article: NewsArticleRow) {
  let recipients: string[] = [];
  try {
    recipients = await listAccountRecipients(db);
  } catch (error) {
    console.warn("Unable to load news notification recipients.", error);
    return { sent: false, status: "news_email_recipients_unavailable", recipient_count: 0 };
  }

  const serialized = serializeArticle(article);
  return sendNewsPublishedEmail(env, {
    recipients,
    title: String(serialized.social_title || serialized.title || "New MBP article"),
    excerpt: String(serialized.social_description || serialized.excerpt || "A new article has been published on The MasterBeat Project."),
    category: String(serialized.category || "MBP News"),
    authorName: serialized.author_name,
    articleUrl: `/news/${serialized.slug}`,
    accentColor: String(serialized.accent_color || "#bd00ff")
  });
}
