import { canonicalReleasePlatform, normalizeReleasePlatformLinks, releasePlatformLabel } from "./_release_links";

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

function attr(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return decodeHtml(match?.[1] ?? null);
}

function coverImageFromHtml(html: string) {
  const normalized = html.replace(/\\u002F/g, "/").replace(/&amp;/g, "&");
  for (const match of normalized.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const className = attr(tag, "class") ?? "";
    const src = attr(tag, "src");
    if (src && /\bcover\b/i.test(className) && /^https?:\/\//i.test(src)) return src;
  }

  const imageStoreMatch = normalized.match(/https:\/\/imagestore\.ffm\.to\/link\/[^"'<>\\\s]+?\.(?:png|jpe?g|webp)/i);
  return decodeHtml(imageStoreMatch?.[0] ?? null);
}

function decodeBase64Json(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

function decodedDestination(url: string) {
  try {
    const decodedUrl = new URL(url.replace(/\\\//g, "/"));
    const cd = decodedUrl.searchParams.get("cd");
    if (!cd) return null;
    const decoded = decodeBase64Json(cd) as { destUrl?: string; srvc?: string };
    if (!decoded.destUrl || !decoded.destUrl.startsWith("http")) return null;
    return {
      platform: decoded.srvc || "",
      url: decoded.destUrl
    };
  } catch {
    return null;
  }
}

export function parseFfmRelease(catalogNumber: string, ffmUrl: string, html: string): ParsedFfmRelease | null {
  if (/not found|page does not exist/i.test(html) && !html.includes("og:title")) {
    return null;
  }

  const normalized = html.replace(/\\u002F/g, "/").replace(/&amp;/g, "&");
  const title = meta(html, "og:title") ?? titleFromHtml(html);
  if (!title) return null;

  const description = meta(html, "og:description") ?? meta(html, "description");
  const artworkUrl = coverImageFromHtml(html) ?? meta(html, "og:image");
  const [artistPart, ...trackParts] = title.split(" - ");
  const artist = artistPart?.trim() || "Unknown Artist";
  const trackTitle = trackParts.join(" - ").trim() || title;
  const linkCandidates: ParsedFfmRelease["platformLinks"] = [];
  const seenFfmUrls = new Set<string>();
  const serviceRegex = /service:"([^"]+)".{0,500}?serviceName:"([^"]+)".{0,2500}?url:"(https:\/\/api\.ffm\.to\/sl\/e\/c\/[^"]+)"/gs;

  for (const match of normalized.matchAll(serviceRegex)) {
    const [, platformRaw, labelRaw, urlRaw] = match;
    const decoded = decodedDestination(urlRaw);
    if (!decoded) continue;
    seenFfmUrls.add(urlRaw.replace(/\\\//g, "/"));
    const platform = canonicalReleasePlatform(decoded.platform || platformRaw, labelRaw, decoded.url);
    linkCandidates.push({
      platform,
      label: releasePlatformLabel(platform, labelRaw),
      url: decoded.url,
      is_playable: true
    });
  }

  for (const match of normalized.matchAll(/https:\/\/api\.ffm\.to\/sl\/e\/c\/[^"'<>\\\s]+/gi)) {
    const urlRaw = match[0].replace(/\\\//g, "/");
    if (seenFfmUrls.has(urlRaw)) continue;
    const decoded = decodedDestination(urlRaw);
    if (!decoded) continue;
    const platform = canonicalReleasePlatform(decoded.platform, decoded.platform, decoded.url);
    linkCandidates.push({
      platform,
      label: releasePlatformLabel(platform, decoded.platform),
      url: decoded.url,
      is_playable: true
    });
  }

  const platformLinks = normalizeReleasePlatformLinks(linkCandidates);
  const publishedPlatformLinks = platformLinks.filter((link) => !/email|subscribe/i.test(`${link.platform} ${link.label}`));
  const status = publishedPlatformLinks.length > 0 ? "published" : "presave";

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
