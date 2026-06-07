import { verifySession, type Env } from "../../api/_shared";
import { absoluteUrl, escapeHtml, SITE_URL } from "../../_seo";
import { articleExcerpt, findArticleBySlug, findPublishedArticle, isNewsTableMissing } from "../../api/_news";

type CanvasSpec = {
  width: number;
  height: number;
  label: string;
  kind: "og" | "square" | "story";
};

function canvasSpec(platform: string | null): CanvasSpec {
  const key = String(platform || "").toLowerCase();
  if (["square", "instagram", "instagram-post", "insta-post", "post"].includes(key)) {
    return { width: 1080, height: 1080, label: "Instagram Post", kind: "square" };
  }
  if (["story", "instagram-story", "insta-story", "stories"].includes(key)) {
    return { width: 1080, height: 1920, label: "Instagram Story", kind: "story" };
  }
  return { width: 1200, height: 630, label: "Open Graph", kind: "og" };
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

function layoutFor(spec: CanvasSpec) {
  if (spec.kind === "story") {
    return {
      safeX: 72,
      panelRight: 566,
      panelSlant: 130,
      brandY: 90,
      logoSize: 86,
      categoryY: 335,
      titleY: 500,
      titleFont: 74,
      titleMaxChars: 11,
      titleMaxLines: 6,
      bodyFont: 30,
      bodyMaxChars: 26,
      bodyMaxLines: 4,
      domainY: 1734,
      watermarkX: 430,
      watermarkY: 455,
      watermarkSize: 780
    };
  }

  if (spec.kind === "square") {
    return {
      safeX: 72,
      panelRight: 592,
      panelSlant: 92,
      brandY: 76,
      logoSize: 82,
      categoryY: 238,
      titleY: 330,
      titleFont: 68,
      titleMaxChars: 13,
      titleMaxLines: 5,
      bodyFont: 29,
      bodyMaxChars: 25,
      bodyMaxLines: 4,
      domainY: 960,
      watermarkX: 505,
      watermarkY: 270,
      watermarkSize: 560
    };
  }

  return {
    safeX: 76,
    panelRight: 702,
    panelSlant: 88,
    brandY: 52,
    logoSize: 72,
    categoryY: 160,
    titleY: 240,
    titleFont: 58,
    titleMaxChars: 18,
    titleMaxLines: 4,
    bodyFont: 26,
    bodyMaxChars: 38,
    bodyMaxLines: 3,
    domainY: 552,
    watermarkX: 755,
    watermarkY: 118,
    watermarkSize: 370
  };
}

function renderTextLines(lines: string[], x: number, y: number, fontSize: number, color: string, weight = "900") {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * (fontSize * 1.08)}" fill="${color}" font-family="Arial Black, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" letter-spacing="0">${escapeHtml(line.toUpperCase())}</text>`
    )
    .join("\n  ");
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

  const layout = layoutFor(spec);
  const titleLines = wrapWords(article.social_title || article.title, layout.titleMaxChars, layout.titleMaxLines);
  const descriptionStart = Math.min(
    spec.height - (spec.kind === "story" ? 430 : 150),
    layout.titleY + titleLines.length * (layout.titleFont * 1.08) + (spec.kind === "story" ? 86 : 54)
  );
  const descriptionLines = wrapWords(
    article.social_description || articleExcerpt(article),
    layout.bodyMaxChars,
    layout.bodyMaxLines
  );
  const cover = absoluteUrl(article.cover_image_url || "/assets/brand/season4-banner.png");
  const accent = /^#[0-9a-f]{6}$/i.test(article.accent_color || "") ? article.accent_color : "#bd00ff";
  const logo = `${SITE_URL}/assets/brand/logo-official-purple.png`;
  const domain = SITE_URL.replace("https://", "");
  const metaLabel = truncate(`${article.category || "MBP News"} / ${spec.label}`, spec.kind === "story" ? 34 : 48).toUpperCase();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#050508"/>
      <stop offset="0.48" stop-color="#130019"/>
      <stop offset="1" stop-color="#050508"/>
    </linearGradient>
    <linearGradient id="vignette" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#050508" stop-opacity="0.68"/>
      <stop offset="0.52" stop-color="#050508" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#050508" stop-opacity="0.82"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" x2="1">
      <stop offset="0" stop-color="#040407" stop-opacity="0.98"/>
      <stop offset="0.7" stop-color="#080810" stop-opacity="0.88"/>
      <stop offset="1" stop-color="#050508" stop-opacity="0.18"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="9" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <image href="${escapeHtml(cover)}" x="0" y="0" width="${spec.width}" height="${spec.height}" preserveAspectRatio="xMidYMid slice" opacity="0.82"/>
  <rect width="100%" height="100%" fill="url(#vignette)"/>
  <circle cx="${spec.width * 0.83}" cy="${spec.height * 0.12}" r="${spec.kind === "story" ? 360 : 260}" fill="${escapeHtml(accent)}" opacity="0.18" filter="url(#soft)"/>
  <path d="M0 0 H${layout.panelRight} L${layout.panelRight - layout.panelSlant} ${spec.height} H0 Z" fill="url(#panel)"/>
  <path d="M${layout.panelRight - 8} 0 L${layout.panelRight - layout.panelSlant - 8} ${spec.height}" stroke="${escapeHtml(accent)}" stroke-width="${spec.kind === "story" ? 6 : 4}" opacity="0.82" filter="url(#glow)"/>
  <path d="M${layout.safeX} ${layout.safeX * 0.72} H${Math.min(layout.panelRight - 108, layout.safeX + 420)}" stroke="${escapeHtml(accent)}" stroke-width="2" opacity="0.75"/>
  <path d="M${layout.safeX} ${spec.height - layout.safeX * 0.82} H${Math.min(layout.panelRight - 122, layout.safeX + 360)}" stroke="#ffffff" stroke-width="2" opacity="0.22"/>
  <image href="${escapeHtml(logo)}" x="${layout.watermarkX}" y="${layout.watermarkY}" width="${layout.watermarkSize}" height="${layout.watermarkSize}" preserveAspectRatio="xMidYMid meet" opacity="${spec.kind === "story" ? 0.38 : 0.32}"/>
  <image href="${escapeHtml(logo)}" x="${layout.safeX}" y="${layout.brandY}" width="${layout.logoSize}" height="${layout.logoSize}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${layout.safeX + layout.logoSize + 18}" y="${layout.brandY + layout.logoSize * 0.38}" fill="#ffffff" font-family="Arial Black, Arial, sans-serif" font-size="${spec.kind === "story" ? 32 : 34}" font-weight="900" letter-spacing="0">THE MASTERBEAT</text>
  <text x="${layout.safeX + layout.logoSize + 20}" y="${layout.brandY + layout.logoSize * 0.72}" fill="#d6dbef" font-family="Arial, sans-serif" font-size="${spec.kind === "story" ? 15 : 16}" font-weight="900" letter-spacing="8">PROJECT</text>
  <text x="${layout.safeX}" y="${layout.categoryY}" fill="${escapeHtml(accent)}" font-family="Arial, sans-serif" font-size="${spec.kind === "story" ? 20 : 21}" font-weight="900" letter-spacing="8">${escapeHtml(metaLabel)}</text>
  ${renderTextLines(titleLines, layout.safeX, layout.titleY, layout.titleFont, "#ffffff")}
  ${descriptionLines
    .map(
      (line, index) =>
        `<text x="${layout.safeX}" y="${descriptionStart + index * (layout.bodyFont * 1.48)}" fill="#e7ecff" font-family="Arial, sans-serif" font-size="${layout.bodyFont}" font-weight="700">${escapeHtml(line)}</text>`
    )
    .join("\n  ")}
  <text x="${layout.safeX}" y="${layout.domainY}" fill="#ffffff" font-family="Arial Black, Arial, sans-serif" font-size="${spec.kind === "story" ? 28 : 24}" font-weight="900">${escapeHtml(domain)}</text>
  <rect x="${layout.safeX}" y="${layout.domainY + 18}" width="${spec.kind === "story" ? 270 : 245}" height="5" fill="${escapeHtml(accent)}" opacity="0.9"/>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=UTF-8",
      "cache-control": "public, max-age=3600"
    }
  });
};
