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

/* ─── Design tokens ─── */

const FONT = `system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif`;
const INK = "#050508";
const CYAN = "#22f7ff";
const SOCIAL_IMAGE_VERSION = "mbp-social-v16-og-domain-line-longer-2026-06-07";

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

function approxWidth(value: string, fontSize: number, extra = 0) {
  return Math.round(value.length * fontSize * 0.55 + extra);
}

function wrapWords(value: string, maxChars: number, maxLines: number) {
  const words = cleanText(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let consumedAll = true;

  for (const rawWord of words) {
    const word = rawWord.length > maxChars ? `${rawWord.slice(0, Math.max(1, maxChars - 1))}\u2026` : rawWord;
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;

      if (lines.length >= maxLines) {
        consumedAll = false;
        break;
      }
    } else {
      current = candidate;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  const result = lines.slice(0, maxLines);

  if (!consumedAll && result.length) {
    result[result.length - 1] = truncate(result[result.length - 1], maxChars);
  }

  return result;
}

/* ─── SVG primitives ─── */

function svgDefs(accent: string, variant: CanvasSpec["kind"]) {
  const a = escapeHtml(accent);

  const bottomStart = variant === "story" ? "0.30" : variant === "square" ? "0.38" : "0.52";
  const bottomMid = variant === "story" ? "0.72" : variant === "square" ? "0.78" : "0.42";
  const bottomEnd = variant === "og" ? "0.70" : "0.96";

  return `<defs>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.78"/>
    </filter>

    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000000" flood-opacity="0.44"/>
    </filter>

    <filter id="accentGlow" x="-160%" y="-160%" width="420%" height="420%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="noise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.12"/>
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

    <linearGradient id="ogOverlay" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${INK}" stop-opacity="0.94"/>
      <stop offset="0.46" stop-color="${INK}" stop-opacity="0.76"/>
      <stop offset="0.74" stop-color="${INK}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0.04"/>
    </linearGradient>

    <linearGradient id="bottomOverlay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}" stop-opacity="0.04"/>
      <stop offset="${bottomStart}" stop-color="${INK}" stop-opacity="0.10"/>
      <stop offset="0.74" stop-color="${INK}" stop-opacity="${bottomMid}"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="${bottomEnd}"/>
    </linearGradient>

    <linearGradient id="glassFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#12182a" stop-opacity="0.76"/>
      <stop offset="0.50" stop-color="#080b15" stop-opacity="0.58"/>
      <stop offset="1" stop-color="#03040a" stop-opacity="0.84"/>
    </linearGradient>

    <linearGradient id="glassStroke" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="0.38" stop-color="#ffffff" stop-opacity="0.11"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.04"/>
    </linearGradient>

    <radialGradient id="centerLift" cx="0.58" cy="0.36" r="0.72">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="0.48" stop-color="#ffffff" stop-opacity="0.015"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.46"/>
    </radialGradient>

    <radialGradient id="accentBloom" cx="0.82" cy="0.18" r="0.56">
      <stop offset="0" stop-color="${a}" stop-opacity="0.20"/>
      <stop offset="0.42" stop-color="${a}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="${a}" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="storyReadability" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}" stop-opacity="0"/>
      <stop offset="0.18" stop-color="${INK}" stop-opacity="0.24"/>
      <stop offset="0.52" stop-color="${INK}" stop-opacity="0.76"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0.98"/>
    </linearGradient>
  </defs>`;
}

function svgBackground(data: ImageData, width: number, height: number, variant: CanvasSpec["kind"]) {
  const ogOverlay = variant === "og" ? `<rect width="100%" height="100%" fill="url(#ogOverlay)"/>` : "";
  const storyExtra = variant === "story"
    ? `<rect width="100%" height="100%" fill="#000000" opacity="0.06"/>`
    : "";

  const imageOpacity = variant === "story" ? 0.96 : 1;

  return `<rect width="100%" height="100%" fill="${INK}"/>
  <image href="${escapeHtml(data.cover)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="${imageOpacity}"/>
  <rect width="100%" height="100%" fill="url(#centerLift)"/>
  ${ogOverlay}
  ${storyExtra}
  <rect width="100%" height="100%" fill="url(#bottomOverlay)"/>
  <rect width="100%" height="100%" fill="url(#accentBloom)"/>
  <rect width="100%" height="100%" fill="#ffffff" opacity="0.05" filter="url(#noise)"/>`;
}

function svgGlassCard(x: number, y: number, width: number, height: number, radius: number, accent: "left" | "bottom" | "none" = "left") {
  const leftAccent = accent === "left"
    ? `<rect x="${x}" y="${y + radius}" width="5" height="${height - radius * 2}" rx="2.5" fill="url(#accentV)" filter="url(#accentGlow)"/>`
    : "";

  const bottomAccent = accent === "bottom"
    ? `<rect x="${x + 32}" y="${y + height - 6}" width="${width - 64}" height="4" rx="2" fill="url(#accentH)" filter="url(#accentGlow)"/>`
    : "";

  return `<g filter="url(#cardShadow)">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="url(#glassFill)"/>
    <rect x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${height - 2}" rx="${Math.max(0, radius - 1)}" fill="none" stroke="url(#glassStroke)" stroke-width="1.2"/>
    <path d="M${x + radius} ${y + 1} H${x + width - radius} Q${x + width - 1} ${y + 1} ${x + width - 1} ${y + radius} V${y + 88} H${x + 1} V${y + radius} Q${x + 1} ${y + 1} ${x + radius} ${y + 1}Z" fill="#ffffff" opacity="0.045"/>
    ${leftAccent}
    ${bottomAccent}
  </g>`;
}

function svgBrand(data: ImageData, x: number, y: number, logoSize: number, titleSize: number, subSize: number, backdrop = false) {
  const bg = backdrop
    ? `<rect x="${x - 16}" y="${y - 14}" width="${logoSize + 278}" height="${logoSize + 28}" rx="18" fill="#05070e" opacity="0.58" stroke="#ffffff" stroke-opacity="0.10"/>`
    : "";

  return `<g>
    ${bg}
    <image href="${escapeHtml(data.logo)}" x="${x}" y="${y}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${x + logoSize + 14}" y="${y + Math.round(logoSize * 0.43)}" fill="#ffffff" font-family="${FONT}" font-size="${titleSize}" font-weight="800" letter-spacing="0.2" filter="url(#textShadow)">THE MASTERBEAT</text>
    <text x="${x + logoSize + 15}" y="${y + Math.round(logoSize * 0.76)}" fill="#a2a9c9" font-family="${FONT}" font-size="${subSize}" font-weight="700" letter-spacing="4.2" filter="url(#textShadow)">PROJECT</text>
  </g>`;
}

function svgCategoryPill(label: string, x: number, y: number, fontSize: number, maxWidth: number) {
  const text = truncate(label, Math.max(16, Math.floor(maxWidth / (fontSize * 0.58))));
  const height = Math.round(fontSize + 24);
  const width = clamp(approxWidth(text, fontSize, 44), 150, maxWidth);
  const baseline = y + Math.round(height / 2 + fontSize * 0.34);

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${Math.round(height / 2)}" fill="url(#accentH)" opacity="0.96"/>
    <rect x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${height - 2}" rx="${Math.round(height / 2 - 1)}" fill="#ffffff" opacity="0.08"/>
    <text x="${x + 22}" y="${baseline}" fill="#ffffff" font-family="${FONT}" font-size="${fontSize}" font-weight="800" letter-spacing="2" filter="url(#textShadow)">${escapeHtml(text.toUpperCase())}</text>
  </g>`;
}

function svgCategoryKicker(label: string, x: number, y: number, fontSize: number, maxChars = 46) {
  const text = truncate(label, maxChars).toUpperCase();
  return `<text x="${x}" y="${y}" fill="#39ff4d" font-family="${FONT}" font-size="${fontSize}" font-weight="800" letter-spacing="4.2" filter="url(#textShadow)">${escapeHtml(text)}</text>`;
}

function svgTitle(lines: string[], x: number, y: number, fontSize: number, lineGap: number, letterSpacing = -1.25) {
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * lineGap}" fill="#ffffff" font-family="${FONT}" font-size="${fontSize}" font-weight="850" letter-spacing="${letterSpacing}" filter="url(#textShadow)">${escapeHtml(line)}</text>`)
    .join("\n  ");
}

function svgDescription(lines: string[], x: number, y: number, fontSize: number, lineGap: number) {
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * lineGap}" fill="#c8cde2" font-family="${FONT}" font-size="${fontSize}" font-weight="430" letter-spacing="0.05" filter="url(#textShadow)">${escapeHtml(line)}</text>`)
    .join("\n  ");
}

function svgDomain(data: ImageData, x: number, y: number, iconSize: number, fontSize: number, underlineWidth: number) {
  return `<g>
    <image href="${escapeHtml(data.logo)}" x="${x}" y="${y - iconSize + 5}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet" opacity="0.88"/>
    <text x="${x + iconSize + 12}" y="${y}" fill="#9ca3bf" font-family="${FONT}" font-size="${fontSize}" font-weight="700" letter-spacing="0.45" filter="url(#textShadow)">${escapeHtml(data.domain)}</text>
    <rect x="${x}" y="${y + 17}" width="${underlineWidth}" height="3" rx="1.5" fill="url(#accentH)" opacity="0.85"/>
  </g>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Open Graph — 1200 × 630
   Strong editorial left zone, image remains clearly visible on the right.
   ═══════════════════════════════════════════════════════════════════════ */

function renderOg(data: ImageData, spec: CanvasSpec) {
  const W = 1200;
  const H = 630;
  const P = 54;

  // Match the cleaner square / story style:
  // brand top-left, kicker + title + description + domain bottom-left, no glass card.
  const titleLines = wrapWords(data.title, cleanText(data.title).length > 72 ? 22 : 24, 3);
  const titleSize = titleLines.length >= 3 ? 48 : 56;
  const titleGap = Math.round(titleSize * 1.02);

  const descLines = wrapWords(data.description, 46, 2);
  const descSize = 18;
  const descGap = 28;

  const domainY = H - 42;
  const descY = domainY - 64 - Math.max(0, descLines.length - 1) * descGap;
  const titleY = descY - 28 - titleSize - Math.max(0, titleLines.length - 1) * titleGap;
  const kickerY = titleY - 64;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- ${SOCIAL_IMAGE_VERSION} / open-graph / matched-to-square -->
  ${svgDefs(data.accent, "og")}

  ${svgBackground(data, W, H, "og")}

  <rect x="0" y="0" width="6" height="${H}" fill="url(#accentV)" filter="url(#accentGlow)"/>

  ${svgBrand(data, P, 36, 48, 21, 10, true)}

  ${svgCategoryKicker(`${data.category} / ${spec.label}`, P, kickerY, 13, 42)}
  ${svgTitle(titleLines, P, titleY, titleSize, titleGap, -1.35)}
  ${svgDescription(descLines, P, descY, descSize, descGap)}
  ${svgDomain(data, P, domainY, 24, 15, 255)}
</svg>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Instagram Post — 1080 × 1080
   Full cover, dark editorial lower third, premium stacked hierarchy.
   ═══════════════════════════════════════════════════════════════════════ */

function renderSquare(data: ImageData, spec: CanvasSpec) {
  const W = 1080;
  const H = 1080;
  const P = 48;

  // Same typography style as the liked 1:1 design, but with the kicker placed
  // more clearly above the title and without the top decorative stripe.
  const titleLines = wrapWords(data.title, cleanText(data.title).length > 78 ? 16 : 18, 4);
  const titleSize = titleLines.length >= 4 ? 50 : 60;
  const titleGap = Math.round(titleSize * 1.02);

  const descLines = wrapWords(data.description, 36, 3);
  const descSize = 19;
  const descGap = 30;

  const domainY = H - 66;
  const descY = domainY - 74 - Math.max(0, descLines.length - 1) * descGap;
  const titleY = descY - 34 - titleSize - Math.max(0, titleLines.length - 1) * titleGap;
  const kickerY = titleY - 72;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- ${SOCIAL_IMAGE_VERSION} / instagram-post -->
  ${svgDefs(data.accent, "square")}

  ${svgBackground(data, W, H, "square")}

  <rect x="0" y="0" width="6" height="${H}" fill="url(#accentV)" filter="url(#accentGlow)"/>

  ${svgBrand(data, P, 58, 52, 22, 11, true)}

  ${svgCategoryKicker(`${data.category} / ${spec.label}`, P, kickerY, 14, 42)}
  ${svgTitle(titleLines, P, titleY, titleSize, titleGap, -1.35)}
  ${svgDescription(descLines, P, descY, descSize, descGap)}
  ${svgDomain(data, P, domainY, 26, 16, 262)}
</svg>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Instagram Story — 1080 × 1920
   Taller premium editorial block, stronger visual hierarchy, less dead space.
   ═══════════════════════════════════════════════════════════════════════ */

function renderStory(data: ImageData, spec: CanvasSpec) {
  const W = 1080;
  const H = 1920;
  const P = 48;

  // Match the same bottom typography system as the 1:1 Instagram post:
  // kicker -> big title -> description -> domain, no pill, no glass card.
  const titleLines = wrapWords(data.title, cleanText(data.title).length > 82 ? 16 : 18, 4);
  const titleSize = titleLines.length >= 4 ? 66 : 76;
  const titleGap = Math.round(titleSize * 1.02);
  const descLines = wrapWords(data.description, 34, 3);

  const kickerY = 1290;
  const titleY = 1368;
  const descY = titleY + Math.max(0, titleLines.length - 1) * titleGap + titleSize + 28;
  const domainY = H - 106;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- ${SOCIAL_IMAGE_VERSION} / instagram-story / matched-to-square -->
  ${svgDefs(data.accent, "story")}

  ${svgBackground(data, W, H, "story")}

  <!-- Strong bottom readability fade, matching the same editorial composition -->
  <rect x="0" y="860" width="${W}" height="1060" fill="url(#storyReadability)"/>

  <!-- Top-left brand -->
  <rect x="0" y="0" width="7" height="${H}" fill="url(#accentV)" filter="url(#accentGlow)"/>

  ${svgBrand(data, P, 112, 56, 24, 12, true)}

  <!-- Same bottom text design as the 1:1 version -->
  ${svgCategoryKicker(`${data.category} / ${spec.label}`, P, kickerY, 14, 44)}
  ${svgTitle(titleLines, P, titleY, titleSize, titleGap, -1.45)}
  ${svgDescription(descLines, P, descY, 22, 35)}
  ${svgDomain(data, P, domainY, 30, 18, 302)}
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
    cover: absoluteUrl(article.cover_image_url || "/assets/brand/season4-banner-960.webp"),
    accent: /^#[0-9a-f]{6}$/i.test(article.accent_color || "") ? article.accent_color : "#bd00ff",
    logo: `${SITE_URL}/assets/brand/logo-nav.png`,
    domain: SITE_URL.replace("https://", "")
  };

  return new Response(renderSocialImage(spec, data), {
    headers: {
      "content-type": "image/svg+xml; charset=UTF-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "x-social-image-version": SOCIAL_IMAGE_VERSION,
      "x-social-image-kind": spec.kind
    }
  });
};
