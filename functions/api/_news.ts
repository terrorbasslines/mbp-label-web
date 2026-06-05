import { id, json, optionalString, slugify, type AppSession } from "./_shared";

export const NEWS_REACTIONS = ["energy", "massive", "support", "replay", "respect"] as const;

export type NewsReaction = (typeof NEWS_REACTIONS)[number];

export type NewsArticleRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  status: "draft" | "published";
  category: string | null;
  author_name: string | null;
  social_title: string | null;
  social_description: string | null;
  accent_color: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NewsCommentRow = {
  id: string;
  article_id: string;
  artist_id: string;
  artist_name: string;
  artist_email: string | null;
  body: string;
  status: "published" | "hidden";
  created_at: string;
  updated_at: string;
};

export type ReactionCountRow = {
  reaction: NewsReaction;
  count: number;
};

export function isNewsTableMissing(error: unknown) {
  return /no such table:\s*news_/i.test(String(error instanceof Error ? error.message : error));
}

export function articleExcerpt(article: Partial<NewsArticleRow>) {
  const explicit = optionalString(article.excerpt, 320);
  if (explicit) return explicit;
  return String(article.content ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export function serializeArticle(article: NewsArticleRow, extras: Record<string, unknown> = {}) {
  return {
    ...article,
    excerpt: articleExcerpt(article),
    status: article.status || "draft",
    accent_color: article.accent_color || "#bd00ff",
    social_title: article.social_title || article.title,
    social_description: article.social_description || articleExcerpt(article),
    ...extras
  };
}

export async function findPublishedArticle(db: D1Database, slug: string) {
  return db
    .prepare("SELECT * FROM news_articles WHERE slug = ? AND status = 'published' LIMIT 1")
    .bind(slug)
    .first<NewsArticleRow>();
}

export async function findArticleById(db: D1Database, articleId: string) {
  return db.prepare("SELECT * FROM news_articles WHERE id = ? LIMIT 1").bind(articleId).first<NewsArticleRow>();
}

export async function uniqueArticleSlug(db: D1Database, title: string, preferredSlug?: string | null, ignoreId?: string | null) {
  const baseSlug = slugify(preferredSlug || title) || id("news");
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await db.prepare("SELECT id FROM news_articles WHERE slug = ? LIMIT 1").bind(slug).first<{ id: string }>();
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export function normalizeArticleStatus(value: unknown) {
  return String(value ?? "").toLowerCase() === "published" ? "published" : "draft";
}

export function normalizeAccentColor(value: unknown) {
  const color = optionalString(value, 32);
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#bd00ff";
}

export async function getSessionArtist(db: D1Database, session: AppSession) {
  const artistId = session.artistIds?.[0];
  if (!artistId) {
    return null;
  }

  const artist = await db.prepare("SELECT id, name FROM artists WHERE id = ? LIMIT 1").bind(artistId).first<{ id: string; name: string }>();
  if (!artist) return null;

  return {
    id: artist.id,
    name: artist.name,
    email: session.email ?? null
  };
}

export function invalidNewsTableResponse() {
  return json({ ok: true, articles: [], migration_required: true });
}
