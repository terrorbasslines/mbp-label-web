import type { Env } from "./api/_shared";
import { escapeHtml, SITE_URL } from "./_seo";

type SitemapRow = {
  slug: string;
  updated_at?: string | null;
};

function urlEntry(path: string, priority: string, changefreq: string, lastmod?: string | null) {
  const loc = `${SITE_URL}${path}`;
  const parsedLastmod = lastmod ? new Date(lastmod.includes("T") ? lastmod : `${lastmod.replace(" ", "T")}Z`) : null;
  const safeLastmod =
    parsedLastmod && !Number.isNaN(parsedLastmod.getTime())
      ? `<lastmod>${escapeHtml(parsedLastmod.toISOString())}</lastmod>`
      : "";
  return `<url><loc>${escapeHtml(loc)}</loc>${safeLastmod}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const staticUrls = [
    urlEntry("/", "1.0", "weekly"),
    urlEntry("/news/", "0.8", "daily"),
    urlEntry("/releases/", "0.9", "daily"),
    urlEntry("/horizon/", "0.8", "daily"),
    urlEntry("/section7/", "0.8", "daily"),
    urlEntry("/artists/", "0.9", "daily"),
    urlEntry("/demo-submission/", "0.8", "monthly"),
    urlEntry("/about/", "0.7", "monthly"),
    urlEntry("/contact/", "0.6", "monthly"),
    urlEntry("/privacy-policy/", "0.2", "yearly")
  ];

  let dynamicUrls: string[] = [];
  if (env.DB) {
    try {
      const [releases, artists] = await Promise.all([
        env.DB.prepare("SELECT slug, updated_at FROM releases WHERE status IN ('published', 'presave') ORDER BY catalog_number DESC").all<SitemapRow>(),
        env.DB.prepare("SELECT slug, updated_at FROM artists ORDER BY name ASC").all<SitemapRow>()
      ]);

      dynamicUrls.push(
        ...(releases.results ?? []).map((release) => urlEntry(`/release/${release.slug}`, "0.8", "weekly", release.updated_at)),
        ...(artists.results ?? []).map((artist) => urlEntry(`/artist/${artist.slug}`, "0.7", "weekly", artist.updated_at))
      );
    } catch {
      dynamicUrls = [];
    }

    try {
      const news = await env.DB
        .prepare("SELECT slug, updated_at FROM news_articles WHERE status = 'published' ORDER BY datetime(COALESCE(published_at, updated_at, created_at)) DESC")
        .all<SitemapRow>();

      dynamicUrls.push(...(news.results ?? []).map((article) => urlEntry(`/news/${article.slug}`, "0.7", "weekly", article.updated_at)));
    } catch {
      // News migration may not be applied yet. Keep the public sitemap online.
    }
  }

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...dynamicUrls].join("\n")}\n</urlset>`, {
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      "cache-control": "public, max-age=3600"
    }
  });
};
