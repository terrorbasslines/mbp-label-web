import { verifySession, type Env } from "../../api/_shared";
import { absoluteUrl, escapeHtml, SITE_URL } from "../../_seo";
import { articleExcerpt, findArticleBySlug, findPublishedArticle, isNewsTableMissing } from "../../api/_news";

type CanvasSpec = {
  width: number;
  height: number;
  label: string;
};

function canvasSpec(platform: string | null): CanvasSpec {
  if (platform === "square" || platform === "instagram") return { width: 1080, height: 1080, label: "Social Square" };
  if (platform === "story") return { width: 1080, height: 1920, label: "Story" };
  return { width: 1200, height: 630, label: "Open Graph" };
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function wrapWords(value: string, maxChars: number, maxLines: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines).map((line, index, list) => (index === list.length - 1 ? truncate(line, maxChars) : line));
}

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const url = new URL(request.url);
  const spec = canvasSpec(url.searchParams.get("platform"));

  if (!env.DB) {
    return new Response("News article not available.", { status: 404 });
  }

  let article;
  try {
    article = await findPublishedArticle(env.DB, String(params.slug ?? "").toLowerCase());
    if (!article && url.searchParams.get("preview") === "admin") {
      const session = await verifySession(request, env);
      if (session?.role === "admin") {
        article = await findArticleBySlug(env.DB, String(params.slug ?? "").toLowerCase());
      }
    }
  } catch (error) {
    if (isNewsTableMissing(error)) {
      return new Response("News article not available.", { status: 404 });
    }
    throw error;
  }

  if (!article) return new Response("News article not found.", { status: 404 });

  const titleLines = wrapWords(article.social_title || article.title, spec.width > 1100 ? 18 : 14, spec.height > 1200 ? 5 : 3);
  const descriptionLines = wrapWords(article.social_description || articleExcerpt(article), spec.width > 1100 ? 42 : 28, spec.height > 1200 ? 5 : 3);
  const cover = absoluteUrl(article.cover_image_url || "/assets/brand/season4-banner.png");
  const accent = /^#[0-9a-f]{6}$/i.test(article.accent_color || "") ? article.accent_color : "#bd00ff";
  const titleFont = spec.height > 1200 ? 82 : 68;
  const bodyFont = spec.height > 1200 ? 30 : 26;
  const logo = `${SITE_URL}/assets/brand/logo-official-purple.png`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#050508"/>
      <stop offset="0.46" stop-color="#100017"/>
      <stop offset="1" stop-color="#050508"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" x2="1">
      <stop offset="0" stop-color="#050508" stop-opacity="0.98"/>
      <stop offset="0.58" stop-color="#050508" stop-opacity="0.76"/>
      <stop offset="1" stop-color="#050508" stop-opacity="0.12"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <image href="${escapeHtml(cover)}" x="${spec.width * 0.42}" y="0" width="${spec.width * 0.68}" height="${spec.height}" preserveAspectRatio="xMidYMid slice" opacity="0.72"/>
  <rect width="100%" height="100%" fill="url(#fade)"/>
  <rect x="${spec.width * 0.06}" y="${spec.height * 0.07}" width="${spec.width * 0.88}" height="${spec.height * 0.86}" rx="26" fill="none" stroke="${escapeHtml(accent)}" stroke-width="3" opacity="0.75" filter="url(#glow)"/>
  <image href="${escapeHtml(logo)}" x="${spec.width * 0.08}" y="${spec.height * 0.095}" width="82" height="82" preserveAspectRatio="xMidYMid meet"/>
  <text x="${spec.width * 0.08 + 106}" y="${spec.height * 0.125}" fill="#ffffff" font-family="Arial Black, Arial, sans-serif" font-size="34" font-weight="900" letter-spacing="0">THE MASTERBEAT</text>
  <text x="${spec.width * 0.08 + 108}" y="${spec.height * 0.157}" fill="#9ca3b8" font-family="Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="8">PROJECT</text>
  <text x="${spec.width * 0.08}" y="${spec.height * 0.255}" fill="${escapeHtml(accent)}" font-family="Arial, sans-serif" font-size="22" font-weight="900" letter-spacing="8">${escapeHtml(article.category || "NEWS")} / ${escapeHtml(spec.label)}</text>
  ${titleLines
    .map(
      (line, index) =>
        `<text x="${spec.width * 0.08}" y="${spec.height * 0.36 + index * (titleFont * 1.05)}" fill="#ffffff" font-family="Arial Black, Arial, sans-serif" font-size="${titleFont}" font-weight="900">${escapeHtml(line.toUpperCase())}</text>`
    )
    .join("\n  ")}
  ${descriptionLines
    .map(
      (line, index) =>
        `<text x="${spec.width * 0.08}" y="${spec.height * 0.68 + index * (bodyFont * 1.55)}" fill="#d7def5" font-family="Arial, sans-serif" font-size="${bodyFont}" font-weight="600">${escapeHtml(line)}</text>`
    )
    .join("\n  ")}
  <text x="${spec.width * 0.08}" y="${spec.height * 0.89}" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="900">${escapeHtml(SITE_URL.replace("https://", ""))}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=UTF-8",
      "cache-control": "public, max-age=3600"
    }
  });
};
