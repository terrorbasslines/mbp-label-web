import { verifySession, type Env } from "../../api/_shared";
import { absoluteUrl, escapeHtml, SITE_URL } from "../../_seo";
import { articleExcerpt, findArticleBySlug, findPublishedArticle, isNewsTableMissing } from "../../api/_news";

type CanvasSpec = {
  width: number;
  height: number;
  label: string;
  kind: "og" | "square" | "story";
};

type ImageData = {
  title: string;
  description: string;
  category: string;
  cover: string;
  accent: string;
  logo: string;
  domain: string;
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
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function wrapWords(value: string, maxChars: number, maxLines: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = `${current} ${word}`.trim();
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines).map((line, index, list) => (index === list.length - 1 ? truncate(line, maxChars) : line));
}

function renderTextLines(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  lineGap: number,
  color: string,
  weight = "900",
  family = "Arial Black, Arial, sans-serif"
) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineGap}" fill="${color}" font-family="${family}" font-size="${fontSize}" font-weight="${weight}" letter-spacing="0">${escapeHtml(line.toUpperCase())}</text>`
    )
    .join("\n  ");
}

function renderBrand(data: ImageData, x: number, y: number, logoSize: number, titleSize: number, projectSize: number) {
  return `
  <image href="${escapeHtml(data.logo)}" x="${x}" y="${y}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${x + logoSize + 18}" y="${y + logoSize * 0.42}" fill="#ffffff" font-family="Arial Black, Arial, sans-serif" font-size="${titleSize}" font-weight="900" letter-spacing="0">THE MASTERBEAT</text>
  <text x="${x + logoSize + 20}" y="${y + logoSize * 0.72}" fill="#d6dbef" font-family="Arial, sans-serif" font-size="${projectSize}" font-weight="900" letter-spacing="8">PROJECT</text>`;
}

function commonDefs(data: ImageData, spec: CanvasSpec) {
  return `
  <defs>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#030307" stop-opacity="0.92"/>
      <stop offset="0.45" stop-color="#050508" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#050508" stop-opacity="0.94"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" x2="1">
      <stop offset="0" stop-color="#040407" stop-opacity="0.98"/>
      <stop offset="0.72" stop-color="#070711" stop-opacity="0.88"/>
      <stop offset="1" stop-color="#0b0b13" stop-opacity="0.7"/>
    </linearGradient>
    <linearGradient id="rail" x1="0" x2="1">
      <stop offset="0" stop-color="${escapeHtml(data.accent)}" stop-opacity="1"/>
      <stop offset="1" stop-color="#22f7ff" stop-opacity="0.4"/>
    </linearGradient>
    <radialGradient id="accentGlow">
      <stop offset="0" stop-color="${escapeHtml(data.accent)}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${escapeHtml(data.accent)}" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="${spec.kind === "story" ? 8 : 6}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft">
      <feGaussianBlur stdDeviation="24"/>
    </filter>
  </defs>`;
}

function renderBase(spec: CanvasSpec, data: ImageData) {
  return `  <rect width="100%" height="100%" fill="#050508"/>
  <image href="${escapeHtml(data.cover)}" x="0" y="0" width="${spec.width}" height="${spec.height}" preserveAspectRatio="xMidYMid slice" opacity="0.86"/>
  <rect width="100%" height="100%" fill="url(#shade)"/>
  <circle cx="${spec.width * 0.86}" cy="${spec.height * 0.18}" r="${spec.kind === "story" ? 430 : 290}" fill="url(#accentGlow)" filter="url(#soft)"/>
  <path d="M0 ${spec.height * 0.78} C${spec.width * 0.28} ${spec.height * 0.7} ${spec.width * 0.68} ${spec.height * 0.92} ${spec.width} ${spec.height * 0.8}" fill="none" stroke="${escapeHtml(data.accent)}" stroke-width="${spec.kind === "story" ? 3 : 2}" opacity="0.28"/>`;
}

function renderOg(data: ImageData) {
  const titleLines = wrapWords(data.title, 17, 3);
  const titleFont = titleLines.length > 2 ? 52 : 58;
  const titleGap = titleFont * 1.05;
  const descriptionY = 264 + titleLines.length * titleGap + 34;
  const descriptionLines = wrapWords(data.description, 34, 2);
  const meta = truncate(`${data.category} / MBP News`, 42).toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${commonDefs(data, { width: 1200, height: 630, label: "Open Graph", kind: "og" })}
${renderBase({ width: 1200, height: 630, label: "Open Graph", kind: "og" }, data)}
  <rect x="54" y="46" width="632" height="538" rx="28" fill="url(#glass)" stroke="rgba(255,255,255,.16)"/>
  <rect x="54" y="46" width="5" height="538" rx="3" fill="${escapeHtml(data.accent)}" filter="url(#glow)"/>
  <path d="M86 82 H430" stroke="url(#rail)" stroke-width="3" opacity="0.9"/>
  <image href="${escapeHtml(data.logo)}" x="760" y="104" width="360" height="360" preserveAspectRatio="xMidYMid meet" opacity="0.28"/>
  <rect x="732" y="88" width="388" height="388" rx="28" fill="#050508" opacity="0.24"/>
  ${renderBrand(data, 88, 86, 72, 29, 14)}
  <text x="88" y="206" fill="${escapeHtml(data.accent)}" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="7">${escapeHtml(meta)}</text>
  ${renderTextLines(titleLines, 88, 264, titleFont, titleGap, "#ffffff")}
  ${renderTextLines(descriptionLines, 88, descriptionY, 25, 38, "#e8ecff", "800", "Arial, sans-serif")}
  <text x="88" y="542" fill="#ffffff" font-family="Arial Black, Arial, sans-serif" font-size="23" font-weight="900" letter-spacing="0">${escapeHtml(data.domain)}</text>
  <rect x="88" y="559" width="262" height="5" fill="${escapeHtml(data.accent)}"/>
</svg>`;
}

function renderSquare(data: ImageData) {
  const titleLines = wrapWords(data.title, 12, 5);
  const titleFont = titleLines.length > 4 ? 56 : 62;
  const titleGap = titleFont * 1.03;
  const descriptionY = Math.min(770, 332 + titleLines.length * titleGap + 72);
  const descriptionLines = wrapWords(data.description, 26, 4);
  const meta = truncate(`${data.category} / MBP News`, 34).toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  ${commonDefs(data, { width: 1080, height: 1080, label: "Instagram Post", kind: "square" })}
${renderBase({ width: 1080, height: 1080, label: "Instagram Post", kind: "square" }, data)}
  <rect x="64" y="64" width="952" height="952" rx="30" fill="#050508" opacity="0.38" stroke="${escapeHtml(data.accent)}" stroke-width="2"/>
  <rect x="64" y="64" width="548" height="952" rx="30" fill="url(#glass)" opacity="0.94"/>
  <rect x="98" y="92" width="350" height="4" fill="url(#rail)"/>
  <image href="${escapeHtml(data.logo)}" x="574" y="292" width="490" height="490" preserveAspectRatio="xMidYMid meet" opacity="0.28"/>
  <rect x="574" y="278" width="432" height="520" rx="30" fill="#050508" opacity="0.18"/>
  ${renderBrand(data, 98, 118, 82, 28, 13)}
  <text x="98" y="252" fill="${escapeHtml(data.accent)}" font-family="Arial, sans-serif" font-size="19" font-weight="900" letter-spacing="8">${escapeHtml(meta)}</text>
  ${renderTextLines(titleLines, 98, 332, titleFont, titleGap, "#ffffff")}
  ${renderTextLines(descriptionLines, 98, descriptionY, 27, 40, "#e8ecff", "800", "Arial, sans-serif")}
  <text x="98" y="940" fill="#ffffff" font-family="Arial Black, Arial, sans-serif" font-size="25" font-weight="900" letter-spacing="0">${escapeHtml(data.domain)}</text>
  <rect x="98" y="960" width="250" height="6" fill="${escapeHtml(data.accent)}"/>
</svg>`;
}

function renderStory(data: ImageData) {
  const titleLines = wrapWords(data.title, 11, 6);
  const titleFont = titleLines.length > 5 ? 62 : 68;
  const titleGap = titleFont * 1.05;
  const descriptionY = Math.min(1120, 424 + titleLines.length * titleGap + 92);
  const descriptionLines = wrapWords(data.description, 25, 4);
  const meta = truncate(`${data.category} / MBP News`, 32).toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  ${commonDefs(data, { width: 1080, height: 1920, label: "Instagram Story", kind: "story" })}
${renderBase({ width: 1080, height: 1920, label: "Instagram Story", kind: "story" }, data)}
  <rect x="56" y="72" width="620" height="1776" rx="34" fill="url(#glass)" stroke="${escapeHtml(data.accent)}" stroke-width="3"/>
  <rect x="88" y="110" width="350" height="4" fill="url(#rail)"/>
  <rect x="56" y="72" width="7" height="1776" rx="4" fill="${escapeHtml(data.accent)}" filter="url(#glow)"/>
  <image href="${escapeHtml(data.logo)}" x="430" y="574" width="720" height="720" preserveAspectRatio="xMidYMid meet" opacity="0.3"/>
  <rect x="404" y="560" width="600" height="736" rx="34" fill="#050508" opacity="0.18"/>
  ${renderBrand(data, 98, 142, 86, 30, 13)}
  <text x="98" y="330" fill="${escapeHtml(data.accent)}" font-family="Arial, sans-serif" font-size="19" font-weight="900" letter-spacing="8">${escapeHtml(meta)}</text>
  ${renderTextLines(titleLines, 98, 424, titleFont, titleGap, "#ffffff")}
  ${renderTextLines(descriptionLines, 98, descriptionY, 30, 44, "#e8ecff", "800", "Arial, sans-serif")}
  <text x="98" y="1708" fill="#ffffff" font-family="Arial Black, Arial, sans-serif" font-size="28" font-weight="900" letter-spacing="0">${escapeHtml(data.domain)}</text>
  <rect x="98" y="1732" width="285" height="7" fill="${escapeHtml(data.accent)}"/>
</svg>`;
}

function renderSocialImage(spec: CanvasSpec, data: ImageData) {
  if (spec.kind === "story") return renderStory(data);
  if (spec.kind === "square") return renderSquare(data);
  return renderOg(data);
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

  const data: ImageData = {
    title: article.social_title || article.title,
    description: article.social_description || articleExcerpt(article),
    category: article.category || "MBP News",
    cover: absoluteUrl(article.cover_image_url || "/assets/brand/season4-banner.png"),
    accent: /^#[0-9a-f]{6}$/i.test(article.accent_color || "") ? article.accent_color : "#bd00ff",
    logo: `${SITE_URL}/assets/brand/logo-official-purple.png`,
    domain: SITE_URL.replace("https://", "")
  };

  return new Response(renderSocialImage(spec, data), {
    headers: {
      "content-type": "image/svg+xml; charset=UTF-8",
      "cache-control": "public, max-age=3600"
    }
  });
};
