import { id, json, optionalString, slugify, type AppSession } from "./_shared";

export const NEWS_REACTIONS = ["energy", "massive", "support", "respect"] as const;

export const DEFAULT_NEWS_CATEGORIES = [
  {
    id: "newscat_label_news",
    slug: "label-news",
    name: "Label News",
    description: "Official updates from The MasterBeat Project.",
    accent_color: "#bd00ff"
  },
  {
    id: "newscat_release_stories",
    slug: "release-stories",
    name: "Release Stories",
    description: "New catalogue drops, pre-save announcements and release context.",
    accent_color: "#00e5ff"
  },
  {
    id: "newscat_artist_spotlight",
    slug: "artist-spotlight",
    name: "Artist Spotlight",
    description: "Profiles, interviews and highlights from the MBP roster.",
    accent_color: "#ffd000"
  },
  {
    id: "newscat_behind_the_label",
    slug: "behind-the-label",
    name: "Behind The Label",
    description: "Inside the label process, creative direction and catalogue work.",
    accent_color: "#23df1e"
  },
  {
    id: "newscat_industry_notes",
    slug: "industry-notes",
    name: "Industry Notes",
    description: "Hard dance, electronic music and label business observations.",
    accent_color: "#ff1808"
  },
  {
    id: "newscat_demo_room",
    slug: "demo-room",
    name: "Demo Room",
    description: "Submission guidance, demo review notes and artist development updates.",
    accent_color: "#22f7ff"
  },
  {
    id: "newscat_mbp_regions",
    slug: "mbp-regions",
    name: "MBP Regions",
    description: "Europe, America, Asia, Australia and World catalogue stories.",
    accent_color: "#2455ff"
  },
  {
    id: "newscat_playlists",
    slug: "playlist-updates",
    name: "Playlist Updates",
    description: "YouTube, streaming and curated MBP playlist announcements.",
    accent_color: "#14d81b"
  },
  {
    id: "newscat_events_community",
    slug: "events-community",
    name: "Events & Community",
    description: "Community moves, shows, collaborations and MBP culture.",
    accent_color: "#ff7a00"
  }
] as const;

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

function escapeHtmlAttribute(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeHtmlAttribute(value: unknown) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function readHtmlAttribute(attributes: string, name: string) {
  const quoted = attributes.match(new RegExp(`\\s${name}\\s*=\\s*(['"])(.*?)\\1`, "i"));
  if (quoted) return decodeHtmlAttribute(quoted[2]);
  const unquoted = attributes.match(new RegExp(`\\s${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted ? decodeHtmlAttribute(unquoted[1]) : "";
}

function parseSafeMediaUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const allowedHosts = [
      "youtube.com",
      "youtube-nocookie.com",
      "youtu.be",
      "soundcloud.com",
      "w.soundcloud.com",
      "spotify.com",
      "open.spotify.com",
      "vimeo.com",
      "player.vimeo.com"
    ];
    if (!allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null;
    return url;
  } catch {
    return null;
  }
}

function youtubeEmbedSrc(url: URL) {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  let videoId = "";
  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (url.pathname.startsWith("/watch")) {
    videoId = url.searchParams.get("v") || "";
  } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
    videoId = url.pathname.split("/").filter(Boolean)[1] || "";
  }
  if (!/^[a-zA-Z0-9_-]{6,}$/.test(videoId)) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

export function mediaEmbedSrc(value: unknown) {
  const url = parseSafeMediaUrl(value);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    return youtubeEmbedSrc(url);
  }
  if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) {
    if (host === "w.soundcloud.com" && url.pathname.startsWith("/player")) return url.toString();
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&color=%23bd00ff&auto_play=false&hide_related=false&show_comments=false&show_user=true&show_reposts=false&show_teaser=true`;
  }
  if (host === "open.spotify.com" || host === "spotify.com" || host.endsWith(".spotify.com")) {
    if (url.pathname.startsWith("/embed/")) return url.toString();
    return `https://open.spotify.com/embed${url.pathname}${url.search}`;
  }
  if (host === "vimeo.com") {
    const videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    if (!/^\d+$/.test(videoId)) return null;
    return `https://player.vimeo.com/video/${videoId}`;
  }
  if (host === "player.vimeo.com" && url.pathname.startsWith("/video/")) {
    return url.toString();
  }
  return null;
}

export function renderMediaEmbed(value: unknown) {
  const src = mediaEmbedSrc(value);
  if (!src) return "";
  return `<figure class="media-embed"><iframe src="${escapeHtmlAttribute(src)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen title="Embedded media"></iframe></figure>`;
}

export function renderArticleHtml(value: unknown) {
  const safeContent = sanitizeArticleHtml(value);
  return safeContent
    .replace(
      /<figure\b[^>]*class=(['"])[^'"]*\bmedia\b[^'"]*\1[^>]*>\s*<oembed\b([^>]*)>\s*<\/oembed>\s*<\/figure>/gi,
      (_match, _quote, attrs) => renderMediaEmbed(readHtmlAttribute(attrs, "url"))
    )
    .replace(/<oembed\b([^>]*)>\s*<\/oembed>/gi, (_match, attrs) => renderMediaEmbed(readHtmlAttribute(attrs, "url")));
}

export function sanitizeArticleHtml(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, 60000)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
    .replace(/<iframe\b([^>]*)>[\s\S]*?<\/iframe>/gi, (_match, attrs) => {
      const originalUrl = readHtmlAttribute(attrs, "src");
      const embedSrc = mediaEmbedSrc(originalUrl);
      return embedSrc ? `<figure class="media"><oembed url="${escapeHtmlAttribute(originalUrl)}"></oembed></figure>` : "";
    })
    .replace(/<oembed\b([^>]*)>\s*<\/oembed>/gi, (_match, attrs) => {
      const originalUrl = readHtmlAttribute(attrs, "url");
      return mediaEmbedSrc(originalUrl) ? `<oembed url="${escapeHtmlAttribute(originalUrl)}"></oembed>` : "";
    })
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

export async function ensureDefaultNewsCategories(db: D1Database) {
  for (const category of DEFAULT_NEWS_CATEGORIES) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO news_categories (id, slug, name, description, accent_color, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(category.id, category.slug, category.name, category.description, category.accent_color)
      .run();
  }
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
