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

/**
 * SVG social cards cannot reliably ship custom fonts unless we embed them.
 * This stack gives us a clean premium look while staying lightweight.
 */
const FONT = `system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`;
const CYAN = "#22f7ff";
const INK = "#050508";

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

function cleanText(value: string, fallback = "") {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function truncate(value: string, max: number) {
  const clean = cleanText(value);
  return clean.length > max ? `${clean.slice(0, Math.max(1, max - 1))}\u2026` : clean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wrapWords(value: string, maxChars: number, maxLines: number) {
  const words = cleanText(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let overflow = false;

  for (const rawWord of words) {
    const word = rawWord.length > maxChars ? `${rawWord.slice(0, Math.max(1, maxChars - 1))}\u2026` : rawWord;
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;

      if (lines.length === maxLines) {
        overflow = true;
        break;
      }
    } else {
      current = candidate;
    }
  }

  if (!overflow && current && lines.length < maxLines) {
    lines.push(current);
  } else if (current && lines.length >= maxLines) {
    overflow = true;
  }

  const result = lines.slice(0, maxLines);
  if (overflow && result.length) {
    result[result.length - 1] = truncate(result[result.length - 1], maxChars);
  }

  return result;
}

function approxWidth(value: string, fontSize: number, extra = 0) {
  return Math.round(value.length * fontSize * 0.56 + extra);
}

/* ─── SVG building blocks ─── */

function svgDefs(accent: string, variant: "og" | "square" | "story") {
  const a = escapeHtml(accent);
  const bottomMidOpacity = variant === "og" ? 0.18 : variant === "square" ? 0.72 : 0.62;
  const bottomEndOpacity = variant === "og" ? 0.58 : 0.96;

  return `<defs>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.74"/>
    </filter>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
    <filter id="accentGlow" x="-150%" y="-150%" width="400%" height="400%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="noise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.18"/>
      </feComponentTransfer>
    </filter>
    <linearGradient id="accentH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${CYAN}"/>
    </linearGradient>
    <linearGradient id="accentV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${CYAN}"/>
    </linearGradient>
    <linearGradient id="glassFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101729" stop-opacity="0.70"/>
      <stop offset="0.58" stop-color="#050810" stop-opacity="0.54"/>
      <stop offset="1" stop-color="#03040a" stop-opacity="0.78"/>
    </linearGradient>
    <linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="ogShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${INK}" stop-opacity="0.94"/>
      <stop offset="0.46" stop-color="${INK}" stop-opacity="0.78"/>
      <stop offset="0.70" stop-color="${INK}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}" stop-opacity="0.06"/>
      <stop offset="0.46" stop-color="${INK}" stop-opacity="${bottomMidOpacity}"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="${bottomEndOpacity}"/>
    </linearGradient>
    <radialGradient id="edgeVignette" cx="0.60" cy="0.42" r="0.78">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.68" stop-color="#000000" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.58"/>
    </radialGradient>
    <radialGradient id="accentBloom" cx="0.82" cy="0.22" r="0.56">
      <stop offset="0" stop-color="${a}" stop-opacity="0.20"/>
      <stop offset="0.38" stop-color="${a}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${a}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

function svgBackground(data: ImageData, width: number, height: number, variant: "og" | "square" | "story") {
  const shade = variant === "og" ? `<rect width="100%" height="100%" fill="url(#ogShade)"/>` : "";

  return `<rect width="100%" height="100%" fill="${INK}"/>
  <image href="${escapeHtml(data.cover)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.92"/>
  ${shade}
  <rect width="100%" height="100%" fill="url(#bottomShade)"/>
  <rect width="100%" height="100%" fill="url(#edgeVignette)"/>
  <rect width="100%" height="100%" fill="url(#accentBloom)"/>
  <rect width="100%" height="100%" fill="#ffffff" opacity="0.045" filter="url(#noise)"/>`;
}

function svgGlassPanel(x: number, y: number, w: number, h: number, r: number, accentSide: "left" | "bottom" = "left") {
  const accent = accentSide === "left"
    ? `<rect x="${x}" y="${y + r}" width="4" height="${h - r * 2}" rx="2" fill="url(#accentV)" filter="url(#accentGlow)"/>`
    : `<rect x="${x + 24}" y="${y + h - 5}" width="${w - 48}" height="3" rx="1.5" fill="url(#accentH)" filter="url(#accentGlow)"/>`;

  return `<g filter="url(#softShadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#glassFill)"/>
    <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${Math.max(0, r - 1)}" fill="none" stroke="url(#glassEdge)" stroke-width="1.2"/>
    <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${Math.min(92, h * 0.32)}" rx="${Math.max(0, r - 1)}" fill="#ffffff" opacity="0.035"/>
    ${accent}
  </g>`;
}

function svgTitle(lines: string[], x: number, y: number, size: number, gap: number, tracking = -1.2) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * gap}" fill="#ffffff" font-family="${FONT}" font-size="${size}" font-weight="850" letter-spacing="${tracking}" filter="url(#textShadow)">${escapeHtml(line)}</text>`
    )
    .join("\n  ");
}

function svgDesc(lines: string[], x: number, y: number, size: number, gap: number, maxWidth: number) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * gap}" fill="#c8cde2" font-family="${FONT}" font-size="${size}" font-weight="450" letter-spacing="0.1" filter="url(#textShadow)" textLength="${Math.min(maxWidth, approxWidth(line, size))}" lengthAdjust="spacingAndGlyphs">${escapeHtml(line)}</text>`
    )
    .join("\n  ");
}

function svgBrand(data: ImageData, x: number, y: number, logoSize: number, titleSize: number, subSize: number, backdrop = false) {
  const pad = 14;
  const bw = Math.round(logoSize + 236);
  const bh = Math.round(logoSize + pad * 1.5);
  const bg = backdrop
    ? `<rect x="${x - pad}" y="${y - pad}" width="${bw}" height="${bh}" rx="18" fill="#05070e" opacity="0.50" stroke="#ffffff" stroke-opacity="0.10"/>`
    : "";

  return `<g>
    ${bg}
    <image href="${escapeHtml(data.logo)}" x="${x}" y="${y}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${x + logoSize + 14}" y="${y + Math.round(logoSize * 0.43)}" fill="#ffffff" font-family="${FONT}" font-size="${titleSize}" font-weight="850" letter-spacing="0.35" filter="url(#textShadow)">THE MASTERBEAT</text>
    <text x="${x + logoSize + 15}" y="${y + Math.round(logoSize * 0.76)}" fill="#a1a8c8" font-family="${FONT}" font-size="${subSize}" font-weight="760" letter-spacing="4.4" filter="url(#textShadow)">PROJECT</text>
  </g>`;
}

function svgCategoryPill(label: string, x: number, y: number, fontSize: number) {
  const text = truncate(label, 38).toUpperCase();
  const h = Math.round(fontSize + 22);
  const w = clamp(approxWidth(text, fontSize, 40), 132, 420);
  const baseline = y + Math.round(h / 2 + fontSize * 0.34);

  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h / 2)}" fill="url(#accentH)" opacity="0.95"/>
    <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${Math.round(h / 2 - 1)}" fill="#ffffff" opacity="0.08"/>
    <text x="${x + 20}" y="${baseline}" fill="#ffffff" font-family="${FONT}" font-size="${fontSize}" font-weight="820" letter-spacing="2.1" filter="url(#textShadow)">${escapeHtml(text)}</text>
  </g>`;
}

function svgDomain(data: ImageData, x: number, y: number, iconSize: number, fontSize: number, underline = 180) {
  return `<g>
    <image href="${escapeHtml(data.logo)}" x="${x}" y="${y - iconSize + 5}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet" opacity="0.88"/>
    <text x="${x + iconSize + 12}" y="${y}" fill="#9ca3bf" font-family="${FONT}" font-size="${fontSize}" font-weight="760" letter-spacing="0.5" filter="url(#textShadow)">${escapeHtml(data.domain)}</text>
    <rect x="${x}" y="${y + 16}" width="${underline}" height="3" rx="1.5" fill="url(#accentH)" opacity="0.82"/>
  </g>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   OG — 1200 × 630
   Editorial left content zone, visible cover on the right, premium glass
   panel for text readability, no ghost watermark.
   ═══════════════════════════════════════════════════════════════════════ */

function renderOg(data: ImageData, spec: CanvasSpec) {
  const W = 1200;
  const H = 630;
  const card = { x: 42, y: 132, w: 704, h: 432, r: 28 };
  const x = card.x + 34;
  const titleLines = wrapWords(data.title, cleanText(data.title).length > 72 ? 22 : 24, 3);
  const titleSize = titleLines.length >= 3 ? 48 : 56;
  const titleGap = Math.round(titleSize * 1.08);
  const titleY = 260;
  const descLines = wrapWords(data.description, 46, 2);
  const descY = titleY + Math.max(0, titleLines.length - 1) * titleGap + titleSize + 18;
  const cat = `${data.category} / ${spec.label}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${svgDefs(data.accent, "og")}

  ${svgBackground(data, W, H, "og")}

  <rect x="0" y="0" width="5" height="${H}" fill="url(#accentV)" filter="url(#accentGlow)"/>
  <path d="M1080 0 L1200 0 L1200 630 L1014 630 C1078 476 1120 278 1080 0Z" fill="#000000" opacity="0.20"/>

  ${svgBrand(data, 56, 36, 50, 22, 11)}
  ${svgGlassPanel(card.x, card.y, card.w, card.h, card.r, "left")}

  ${svgCategoryPill(cat, x, 168, 13)}

  ${svgTitle(titleLines, x, titleY, titleSize, titleGap)}
  ${svgDesc(descLines, x, descY, 19, 30, 585)}

  ${svgDomain(data, x, H - 42, 24, 15, 196)}
</svg>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Instagram Post — 1080 × 1080
   Full cover background, strong bottom gradient, bottom editorial glass
   block, brand anchored top-left.
   ═══════════════════════════════════════════════════════════════════════ */

function renderSquare(data: ImageData, spec: CanvasSpec) {
  const W = 1080;
  const H = 1080;
  const P = 58;
  const titleLines = wrapWords(data.title, cleanText(data.title).length > 78 ? 17 : 19, 4);
  const titleSize = titleLines.length >= 4 ? 48 : 56;
  const titleGap = Math.round(titleSize * 1.07);
  const descLines = wrapWords(data.description, 38, 3);
  const descGap = 29;
  const domainY = H - 68;
  const descY = domainY - 62 - Math.max(0, descLines.length - 1) * descGap;
  const titleY = descY - 36 - Math.max(0, titleLines.length - 1) * titleGap;
  const catY = titleY - 64;
  const cardY = Math.max(548, catY - 30);
  const cardH = H - cardY - 34;
  const cat = `${data.category} / ${spec.label}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${svgDefs(data.accent, "square")}

  ${svgBackground(data, W, H, "square")}

  <rect x="0" y="0" width="5" height="${H}" fill="url(#accentV)" filter="url(#accentGlow)"/>
  <rect x="42" y="156" width="220" height="3" rx="1.5" fill="url(#accentH)" opacity="0.84" filter="url(#accentGlow)"/>

  ${svgBrand(data, 58, 48, 50, 21, 10, true)}
  ${svgGlassPanel(38, cardY, W - 76, cardH, 30, "bottom")}

  ${svgCategoryPill(cat, P, catY, 14)}

  ${svgTitle(titleLines, P, titleY, titleSize, titleGap, -1.25)}
  ${svgDesc(descLines, P, descY, 18, descGap, 850)}

  ${svgDomain(data, P, domainY, 25, 16, 220)}
</svg>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Instagram Story — 1080 × 1920
   Clean upper cover area, lower glass editorial block, large magazine
   title treatment, left accent decorations.
   ═══════════════════════════════════════════════════════════════════════ */

function renderStory(data: ImageData, spec: CanvasSpec) {
  const W = 1080;
  const H = 1920;
  const P = 64;
  const titleLines = wrapWords(data.title, cleanText(data.title).length > 92 ? 14 : 16, 5);
  const titleSize = titleLines.length >= 5 ? 56 : 66;
  const titleGap = Math.round(titleSize * 1.07);
  const descLines = wrapWords(data.description, 32, 3);
  const descGap = 35;
  const domainY = H - 104;
  const descY = domainY - 72 - Math.max(0, descLines.length - 1) * descGap;
  const titleY = descY - 48 - Math.max(0, titleLines.length - 1) * titleGap;
  const catY = titleY - 74;
  const brandY = catY - 116;
  const cardY = Math.max(900, brandY - 42);
  const cardH = H - cardY - 44;
  const cat = `${data.category} / ${spec.label}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${svgDefs(data.accent, "story")}

  ${svgBackground(data, W, H, "story")}

  <rect x="0" y="0" width="6" height="${H}" fill="url(#accentV)" filter="url(#accentGlow)"/>
  <rect x="34" y="520" width="3" height="220" rx="1.5" fill="url(#accentV)" opacity="0.72"/>
  <rect x="34" y="770" width="3" height="82" rx="1.5" fill="#ffffff" opacity="0.24"/>

  ${svgGlassPanel(42, cardY, W - 84, cardH, 34, "left")}

  ${svgBrand(data, P, brandY, 58, 24, 12)}
  ${svgCategoryPill(cat, P, catY, 15)}

  ${svgTitle(titleLines, P, titleY, titleSize, titleGap, -1.35)}
  ${svgDesc(descLines, P, descY, 22, descGap, 870)}

  ${svgDomain(data, P, domainY, 28, 18, 246)}
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
