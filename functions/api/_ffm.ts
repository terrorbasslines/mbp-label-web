export type ParsedFfmRelease = {
  catalogNumber: string;
  ffmUrl: string;
  title: string;
  artist: string;
  trackTitle: string;
  description: string | null;
  artworkUrl: string | null;
  status: "published" | "presave";
  platformLinks: Array<{
    platform: string;
    label: string;
    url: string;
    is_playable: boolean;
  }>;
};

function decodeHtml(value: string | null) {
  if (!value) return null;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function meta(html: string, key: string) {
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"));
  return decodeHtml(match?.[1] ?? null);
}

function titleFromHtml(html: string) {
  return decodeHtml(html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? null);
}

function decodeBase64Json(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

export function parseFfmRelease(catalogNumber: string, ffmUrl: string, html: string): ParsedFfmRelease | null {
  if (/not found|page does not exist/i.test(html) && !html.includes("og:title")) {
    return null;
  }

  const normalized = html.replace(/\\u002F/g, "/").replace(/&amp;/g, "&");
  const title = meta(html, "og:title") ?? titleFromHtml(html);
  if (!title) return null;

  const description = meta(html, "og:description") ?? meta(html, "description");
  const artworkUrl = meta(html, "og:image");
  const [artistPart, ...trackParts] = title.split(" - ");
  const artist = artistPart?.trim() || "Unknown Artist";
  const trackTitle = trackParts.join(" - ").trim() || title;
  const links = new Map<string, ParsedFfmRelease["platformLinks"][number]>();
  const serviceRegex = /service:"([^"]+)".{0,500}?serviceName:"([^"]+)".{0,2500}?url:"(https:\/\/api\.ffm\.to\/sl\/e\/c\/[^"]+)"/gs;

  for (const match of normalized.matchAll(serviceRegex)) {
    const [, platformRaw, labelRaw, urlRaw] = match;
    const url = urlRaw.replace(/\\\//g, "/");
    try {
      const decodedUrl = new URL(url);
      const cd = decodedUrl.searchParams.get("cd");
      if (!cd) continue;
      const decoded = decodeBase64Json(cd) as { destUrl?: string; srvc?: string };
      if (!decoded.destUrl || !decoded.destUrl.startsWith("http")) continue;

      const platform = (decoded.srvc || platformRaw).toLowerCase();
      if (!links.has(platform)) {
        links.set(platform, {
          platform,
          label: labelRaw,
          url: decoded.destUrl,
          is_playable: true
        });
      }
    } catch {
      // FFM occasionally embeds services without a direct destination URL. Ignore those.
    }
  }

  const platformLinks = [...links.values()];
  const status =
    platformLinks.length === 0 || /pre[- ]?save|pre[- ]?order|coming soon/i.test(description ?? normalized)
      ? "presave"
      : "published";

  return {
    catalogNumber,
    ffmUrl,
    title,
    artist,
    trackTitle,
    description,
    artworkUrl,
    status,
    platformLinks
  };
}

export function catalogNumberFromIndex(index: number) {
  return `MBP${String(index).padStart(3, "0")}`;
}
