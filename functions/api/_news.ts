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
  category_id: string | null;
  category: string | null;
  category_slug?: string | null;
  category_name?: string | null;
  category_description?: string | null;
  category_accent_color?: string | null;
  author_name: string | null;
  seo_title: string | null;
  seo_description: string | null;
  social_title: string | null;
  social_description: string | null;
  accent_color: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NewsCategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  accent_color: string;
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
  const message = String(error instanceof Error ? error.message : error);
  return (
    /no such table:\s*news_/i.test(message) ||
    /no such table:\s*news_categories/i.test(message) ||
    /no such column:.*\b(category_id|seo_title|seo_description)\b/i.test(message)
  );
}

export function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeArticleHtml(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, 60000)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
    .replace(/<\/?(iframe|object|embed|form|input|button|textarea|select|option|script|style)[^>]*>/gi, "");
}

export function articleExcerpt(article: Partial<NewsArticleRow>) {
  const explicit = optionalString(article.excerpt, 320);
  if (explicit) return explicit;
  return stripHtml(article.content).slice(0, 220);
}

export function articleSeoTitle(article: Partial<NewsArticleRow>) {
  return optionalString(article.seo_title, 180) || optionalString(article.social_title, 180) || optionalString(article.title, 180) || "MBP News";
}

export function articleSeoDescription(article: Partial<NewsArticleRow>) {
  return optionalString(article.seo_description, 320) || optionalString(article.social_description, 320) || articleExcerpt(article);
}

export function serializeArticle(article: NewsArticleRow, extras: Record<string, unknown> = {}) {
  const categoryName = article.category_name || article.category || "News";
  const categorySlug = article.category_slug || slugify(categoryName) || "news";
  const accent = normalizeAccentColor(article.category_accent_color || article.accent_color);
  return {
    ...article,
    category: categoryName,
    category_slug: categorySlug,
    excerpt: articleExcerpt(article),
    status: article.status || "draft",
    accent_color: accent,
    seo_title: articleSeoTitle(article),
    seo_description: articleSeoDescription(article),
    social_title: article.social_title || article.title,
    social_description: article.social_description || articleExcerpt(article),
    ...extras
  };
}

export async function findPublishedArticle(db: D1Database, slug: string) {
  return db
    .prepare(
      `SELECT a.*, c.slug AS category_slug, c.name AS category_name, c.description AS category_description,
              COALESCE(c.accent_color, a.accent_color) AS category_accent_color
       FROM news_articles a
       LEFT JOIN news_categories c ON c.id = a.category_id
       WHERE a.slug = ? AND a.status = 'published'
       LIMIT 1`
    )
    .bind(slug)
    .first<NewsArticleRow>();
}

export async function findArticleBySlug(db: D1Database, slug: string) {
  return db
    .prepare(
      `SELECT a.*, c.slug AS category_slug, c.name AS category_name, c.description AS category_description,
              COALESCE(c.accent_color, a.accent_color) AS category_accent_color
       FROM news_articles a
       LEFT JOIN news_categories c ON c.id = a.category_id
       WHERE a.slug = ?
       LIMIT 1`
    )
    .bind(slug)
    .first<NewsArticleRow>();
}

export async function findArticleById(db: D1Database, articleId: string) {
  return db
    .prepare(
      `SELECT a.*, c.slug AS category_slug, c.name AS category_name, c.description AS category_description,
              COALESCE(c.accent_color, a.accent_color) AS category_accent_color
       FROM news_articles a
       LEFT JOIN news_categories c ON c.id = a.category_id
       WHERE a.id = ?
       LIMIT 1`
    )
    .bind(articleId)
    .first<NewsArticleRow>();
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

export async function uniqueNewsCategorySlug(db: D1Database, name: string, preferredSlug?: string | null, ignoreId?: string | null) {
  const baseSlug = slugify(preferredSlug || name) || id("newscat");
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await db.prepare("SELECT id FROM news_categories WHERE slug = ? LIMIT 1").bind(slug).first<{ id: string }>();
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function resolveNewsCategory(db: D1Database, categoryId: unknown) {
  const normalizedId = optionalString(categoryId, 160);
  if (!normalizedId) return null;
  return db.prepare("SELECT * FROM news_categories WHERE id = ? LIMIT 1").bind(normalizedId).first<NewsCategoryRow>();
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
  return json({ ok: true, articles: [], categories: [], authors: [{ name: "The MasterBeat Project" }], migration_required: true });
}
