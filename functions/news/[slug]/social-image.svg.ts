import { verifySession, type Env } from "../../api/_shared";
import { absoluteUrl, escapeHtml, SITE_URL } from "../../_seo";
import { articleExcerpt, findArticleBySlug, findPublishedArticle, isNewsTableMissing } from "../../api/_news";

/* ─── Types ─── */

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

/** Cross-platform system font stack for consistent SVG rendering */
const FONT = `'Segoe UI',system-ui,-apple-system,sans-serif`;

/* ─── Utilities ─── */

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
  return clean.length > max ? `${clean.slice(0, max - 1)}\u2026` : clean;
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
  return lines
    .slice(0, maxLines)
    .map((l, i, a) => (i === a.length - 1 ? truncate(l, maxChars) : l));
}

/* ─── SVG building blocks ─── */

function svgTitle(
  lines: string[],
  x: number,
  y: number,
  size: number,
  gap: number
) {
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${y + i * gap}" fill="#fff" font-family="${FONT}" font-size="${size}" font-weight="800" letter-spacing="-0.5" filter="url(#ts)">${escapeHtml(l.toUpperCase())}</text>`
    )
    .join("\n  ");
}

function svgDesc(
  lines: string[],
  x: number,
  y: number,
  size: number,
  gap: number
) {
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${y + i * gap}" fill="#c0c6dc" font-family="${FONT}" font-size="${size}" font-weight="400" filter="url(#ts)">${escapeHtml(l)}</text>`
    )
    .join("\n  ");
}

function svgBrand(
  d: ImageData,
  x: number,
  y: number,
  sz: number,
  tf: number,
  sf: number
) {
  return `<image href="${escapeHtml(d.logo)}" x="${x}" y="${y}" width="${sz}" height="${sz}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${x + sz + 14}" y="${y + Math.round(sz * 0.44)}" fill="#fff" font-family="${FONT}" font-size="${tf}" font-weight="800" letter-spacing="0.5" filter="url(#ts)">THE MASTERBEAT</text>
  <text x="${x + sz + 16}" y="${y + Math.round(sz * 0.76)}" fill="#8b91a8" font-family="${FONT}" font-size="${sf}" font-weight="700" letter-spacing="5">PROJECT</text>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   OG — 1200 × 630
   Full-bleed cover with a left-to-right dark gradient so text on the
   left stays readable while the cover image is visible on the right.
   ═══════════════════════════════════════════════════════════════════════ */

function renderOg(data: ImageData, spec: CanvasSpec) {
  const W = 1200, H = 630, P = 44;
  const tl = wrapWords(data.title, 24, 3);
  const tf = tl.length > 2 ? 48 : 56;
  const tg = Math.round(tf * 1.1);
  const tY = 218;
  const dY = tY + (tl.length - 1) * tg + tf + 16;
  const dl = wrapWords(data.description, 42, 2);
  const cat = truncate(`${data.category} / ${spec.label}`, 40).toUpperCase();
  const a = escapeHtml(data.accent);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="ts" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.8"/></filter>
    <filter id="gl"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#22f7ff"/></linearGradient>
    <linearGradient id="agh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#22f7ff" stop-opacity="0.3"/></linearGradient>
    <linearGradient id="ovlr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#050508" stop-opacity="0.95"/>
      <stop offset="0.48" stop-color="#050508" stop-opacity="0.78"/>
      <stop offset="0.72" stop-color="#050508" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#050508" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="ovtb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#050508" stop-opacity="0.38"/>
      <stop offset="0.18" stop-color="#050508" stop-opacity="0"/>
      <stop offset="0.72" stop-color="#050508" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#050508" stop-opacity="0.52"/>
    </linearGradient>
    <radialGradient id="acg" cx="0.82" cy="0.22" r="0.5">
      <stop offset="0" stop-color="${a}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${a}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background with cover -->
  <rect width="100%" height="100%" fill="#050508"/>
  <image href="${escapeHtml(data.cover)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="100%" height="100%" fill="url(#ovlr)"/>
  <rect width="100%" height="100%" fill="url(#ovtb)"/>
  <rect width="100%" height="100%" fill="url(#acg)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="4" height="${H}" fill="url(#ag)" filter="url(#gl)"/>

  <!-- Brand -->
  ${svgBrand(data, P, 34, 50, 22, 11)}

  <!-- Separator -->
  <rect x="${P}" y="104" width="260" height="1" fill="rgba(255,255,255,0.08)"/>

  <!-- Category -->
  <text x="${P}" y="146" fill="${a}" font-family="${FONT}" font-size="13" font-weight="700" letter-spacing="4" filter="url(#ts)">${escapeHtml(cat)}</text>
  <rect x="${P}" y="156" width="52" height="2" fill="url(#agh)" opacity="0.5"/>

  <!-- Title -->
  ${svgTitle(tl, P, tY, tf, tg)}

  <!-- Description -->
  ${svgDesc(dl, P, dY, 19, 30)}

  <!-- Domain -->
  <text x="${P}" y="${H - 38}" fill="#8b91a8" font-family="${FONT}" font-size="15" font-weight="700" letter-spacing="0.8" filter="url(#ts)">${escapeHtml(data.domain)}</text>
  <rect x="${P}" y="${H - 24}" width="180" height="3" fill="url(#agh)"/>
</svg>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Instagram Post — 1080 × 1080
   Cover image fills the canvas, content is bottom-anchored with a
   bottom-up gradient. Brand sits top-left with a dark pill backdrop.
   ═══════════════════════════════════════════════════════════════════════ */

function renderSquare(data: ImageData, spec: CanvasSpec) {
  const W = 1080, H = 1080, P = 52;
  const tl = wrapWords(data.title, 16, 4);
  const tf = tl.length > 3 ? 48 : 54;
  const tg = Math.round(tf * 1.08);
  const dl = wrapWords(data.description, 32, 3);
  const dgap = 28;
  const cat = truncate(`${data.category} / ${spec.label}`, 34).toUpperCase();
  const a = escapeHtml(data.accent);

  // Bottom-anchored content positioning
  const domainY = H - 66;
  const ulY = domainY + 16;
  const descEndY = domainY - 46;
  const descStartY = descEndY - Math.max(0, dl.length - 1) * dgap;
  const titleEndY = descStartY - 28;
  const titleStartY = titleEndY - Math.max(0, tl.length - 1) * tg;
  const catY = titleStartY - 56;
  const catLineY = catY + 12;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="ts" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000" flood-opacity="0.82"/></filter>
    <filter id="gl"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#22f7ff"/></linearGradient>
    <linearGradient id="agh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#22f7ff" stop-opacity="0.3"/></linearGradient>
    <linearGradient id="ovbu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#050508" stop-opacity="0.12"/>
      <stop offset="0.30" stop-color="#050508" stop-opacity="0.04"/>
      <stop offset="0.48" stop-color="#050508" stop-opacity="0.22"/>
      <stop offset="0.65" stop-color="#050508" stop-opacity="0.68"/>
      <stop offset="0.80" stop-color="#050508" stop-opacity="0.90"/>
      <stop offset="1" stop-color="#050508" stop-opacity="0.97"/>
    </linearGradient>
    <radialGradient id="acg" cx="0.5" cy="0.4" r="0.5">
      <stop offset="0" stop-color="${a}" stop-opacity="0.12"/>
      <stop offset="1" stop-color="${a}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background with cover -->
  <rect width="100%" height="100%" fill="#050508"/>
  <image href="${escapeHtml(data.cover)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="100%" height="100%" fill="url(#ovbu)"/>
  <rect width="100%" height="100%" fill="url(#acg)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="4" height="${H}" fill="url(#ag)" filter="url(#gl)"/>

  <!-- Brand with dark backdrop for readability -->
  <rect x="36" y="30" width="310" height="76" rx="12" fill="#050508" opacity="0.5"/>
  ${svgBrand(data, P, 42, 48, 21, 10)}

  <!-- Category -->
  <text x="${P}" y="${catY}" fill="${a}" font-family="${FONT}" font-size="14" font-weight="700" letter-spacing="4.5" filter="url(#ts)">${escapeHtml(cat)}</text>
  <rect x="${P}" y="${catLineY}" width="52" height="2" fill="url(#agh)" opacity="0.5"/>

  <!-- Title -->
  ${svgTitle(tl, P, titleStartY, tf, tg)}

  <!-- Description -->
  ${svgDesc(dl, P, descStartY, 18, dgap)}

  <!-- Domain -->
  <text x="${P}" y="${domainY}" fill="#8b91a8" font-family="${FONT}" font-size="16" font-weight="700" letter-spacing="0.8" filter="url(#ts)">${escapeHtml(data.domain)}</text>
  <rect x="${P}" y="${ulY}" width="200" height="3" fill="url(#agh)"/>
</svg>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Instagram Story — 1080 × 1920
   Tall format. Cover fills upper portion, content sits in the lower
   half over a strong bottom-up gradient.
   ═══════════════════════════════════════════════════════════════════════ */

function renderStory(data: ImageData, spec: CanvasSpec) {
  const W = 1080, H = 1920, P = 56;
  const tl = wrapWords(data.title, 14, 5);
  const tf = tl.length > 4 ? 56 : 64;
  const tg = Math.round(tf * 1.08);
  const dl = wrapWords(data.description, 28, 3);
  const dgap = 34;
  const cat = truncate(`${data.category} / ${spec.label}`, 30).toUpperCase();
  const a = escapeHtml(data.accent);

  // Bottom-anchored content positioning
  const domainY = H - 100;
  const ulY = domainY + 18;
  const descEndY = domainY - 56;
  const descStartY = descEndY - Math.max(0, dl.length - 1) * dgap;
  const titleEndY = descStartY - 36;
  const titleStartY = titleEndY - Math.max(0, tl.length - 1) * tg;
  const catY = titleStartY - 64;
  const catLineY = catY + 14;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="ts" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000" flood-opacity="0.82"/></filter>
    <filter id="gl"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#22f7ff"/></linearGradient>
    <linearGradient id="agh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#22f7ff" stop-opacity="0.3"/></linearGradient>
    <linearGradient id="ovbu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#050508" stop-opacity="0.10"/>
      <stop offset="0.28" stop-color="#050508" stop-opacity="0.03"/>
      <stop offset="0.46" stop-color="#050508" stop-opacity="0.15"/>
      <stop offset="0.60" stop-color="#050508" stop-opacity="0.55"/>
      <stop offset="0.75" stop-color="#050508" stop-opacity="0.88"/>
      <stop offset="1" stop-color="#050508" stop-opacity="0.97"/>
    </linearGradient>
    <radialGradient id="acg" cx="0.5" cy="0.3" r="0.5">
      <stop offset="0" stop-color="${a}" stop-opacity="0.12"/>
      <stop offset="1" stop-color="${a}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background with cover -->
  <rect width="100%" height="100%" fill="#050508"/>
  <image href="${escapeHtml(data.cover)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="100%" height="100%" fill="url(#ovbu)"/>
  <rect width="100%" height="100%" fill="url(#acg)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="5" height="${H}" fill="url(#ag)" filter="url(#gl)"/>

  <!-- Brand with dark backdrop -->
  <rect x="38" y="38" width="330" height="84" rx="14" fill="#050508" opacity="0.5"/>
  ${svgBrand(data, P, 52, 54, 23, 11)}

  <!-- Category -->
  <text x="${P}" y="${catY}" fill="${a}" font-family="${FONT}" font-size="15" font-weight="700" letter-spacing="4.5" filter="url(#ts)">${escapeHtml(cat)}</text>
  <rect x="${P}" y="${catLineY}" width="55" height="2" fill="url(#agh)" opacity="0.5"/>

  <!-- Title -->
  ${svgTitle(tl, P, titleStartY, tf, tg)}

  <!-- Description -->
  ${svgDesc(dl, P, descStartY, 22, dgap)}

  <!-- Domain -->
  <text x="${P}" y="${domainY}" fill="#8b91a8" font-family="${FONT}" font-size="18" font-weight="700" letter-spacing="0.8" filter="url(#ts)">${escapeHtml(data.domain)}</text>
  <rect x="${P}" y="${ulY}" width="220" height="4" fill="url(#agh)"/>
</svg>`;
}

/* ─── Router ─── */

function renderSocialImage(spec: CanvasSpec, data: ImageData) {
  if (spec.kind === "story") return renderStory(data, spec);
  if (spec.kind === "square") return renderSquare(data, spec);
  return renderOg(data, spec);
}

/* ─── Handler ─── */

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
