import fs from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  })
);

const from = Number(args.from ?? 1);
const to = Number(args.to ?? 185);
const outDir = path.resolve("data");

function catalogNumber(index) {
  return `MBP${String(index).padStart(3, "0")}`;
}

function decodeHtml(value) {
  if (!value) return null;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function meta(html, key) {
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"));
  return decodeHtml(match?.[1] ?? null);
}

function titleFromHtml(html) {
  return decodeHtml(html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? null);
}

function decodeBase64Json(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
}

function parseFfmRelease(number, ffmUrl, html) {
  const normalized = html.replace(/\\u002F/g, "/").replace(/&amp;/g, "&");
  const title = meta(html, "og:title") ?? titleFromHtml(html);
  if (!title) return null;

  const description = meta(html, "og:description") ?? meta(html, "description");
  const artworkUrl = meta(html, "og:image");
  const [artistPart, ...trackParts] = title.split(" - ");
  const artist = artistPart?.trim() || "Unknown Artist";
  const trackTitle = trackParts.join(" - ").trim() || title;
  const status = /pre[- ]?save|pre[- ]?order|coming soon/i.test(description ?? normalized) ? "presave" : "published";
  const links = new Map();
  const serviceRegex = /service:"([^"]+)".{0,500}?serviceName:"([^"]+)".{0,2500}?url:"(https:\/\/api\.ffm\.to\/sl\/e\/c\/[^"]+)"/gs;

  for (const match of normalized.matchAll(serviceRegex)) {
    const [, platformRaw, labelRaw, urlRaw] = match;
    const url = urlRaw.replace(/\\\//g, "/");
    try {
      const decodedUrl = new URL(url);
      const cd = decodedUrl.searchParams.get("cd");
      if (!cd) continue;
      const decoded = decodeBase64Json(cd);
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
      // Ignore services without a direct destination URL.
    }
  }

  return {
    catalog_number: number,
    ffm_url: ffmUrl,
    title: trackTitle,
    artist_display: artist,
    description,
    artwork_url: artworkUrl,
    status,
    platform_links: [...links.values()]
  };
}

await fs.mkdir(outDir, { recursive: true });

const releases = [];
const skipped = [];

for (let index = from; index <= to; index += 1) {
  const number = catalogNumber(index);
  const ffmUrl = `https://ffm.to/${number.toLowerCase()}`;
  process.stdout.write(`Fetching ${ffmUrl}... `);
  try {
    const response = await fetch(ffmUrl, { headers: { "user-agent": "The MasterBeat Project catalog importer" } });
    if (!response.ok) {
      skipped.push({ catalog_number: number, status: response.status });
      console.log(`skip ${response.status}`);
      continue;
    }
    const parsed = parseFfmRelease(number, ffmUrl, await response.text());
    if (!parsed) {
      skipped.push({ catalog_number: number, status: "not_found" });
      console.log("skip not_found");
      continue;
    }
    releases.push(parsed);
    console.log(`${parsed.artist_display} - ${parsed.title} (${parsed.platform_links.length} links)`);
  } catch (error) {
    skipped.push({ catalog_number: number, status: error.message });
    console.log(`error ${error.message}`);
  }
}

const output = {
  generated_at: new Date().toISOString(),
  from,
  to,
  releases,
  skipped
};

await fs.writeFile(path.join(outDir, "ffm-catalog.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${path.join(outDir, "ffm-catalog.json")}`);
