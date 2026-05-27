import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  })
);

const from = Number(args.from ?? 1);
const to = Number(args.to ?? Number.MAX_SAFE_INTEGER);
const dryRun = Boolean(args["dry-run"]);
const wrangler = process.platform === "win32" && fs.existsSync(path.resolve(".tools/wrangler.cmd"))
  ? path.resolve(".tools/wrangler.cmd")
  : "wrangler";

function numberFromCatalog(catalogNumber) {
  const match = String(catalogNumber).match(/MBP(\d+)/i);
  return match ? Number(match[1]) : 0;
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

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return decodeHtml(match?.[1] ?? null);
}

function coverImageFromHtml(html) {
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

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function extractWranglerJson(output) {
  try {
    return JSON.parse(output);
  } catch {
    // Wrangler 3 sometimes prints banners/warnings around JSON when --json is not honored.
  }
  const start = output.indexOf("[\n");
  const end = output.lastIndexOf("\n]");
  if (start === -1 || end === -1) {
    throw new Error(`Could not parse Wrangler JSON output:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 2));
}

function d1(command) {
  const safeCommand = command.replaceAll("\n", " ").replaceAll('"', '\\"');
  const output = execSync(`"${wrangler}" d1 execute mbp_label_web --remote --json --command "${safeCommand}"`, { encoding: "utf8" });
  return extractWranglerJson(output);
}

async function fetchCover(release) {
  const current_artwork_url = release.artwork_url;
  const response = await fetch(release.ffm_url, {
    headers: { "user-agent": "The MasterBeat Project artwork refresher" }
  });
  if (!response.ok) return { ...release, current_artwork_url, error: `ffm_${response.status}` };
  const artwork_url = coverImageFromHtml(await response.text());
  if (!artwork_url) return { ...release, current_artwork_url, error: "cover_not_found" };
  return { ...release, current_artwork_url, artwork_url };
}

const rows = d1("SELECT catalog_number, ffm_url, artwork_url FROM releases WHERE ffm_url IS NOT NULL ORDER BY catalog_number;")[0]?.results ?? [];
const candidates = rows.filter((release) => {
  const index = numberFromCatalog(release.catalog_number);
  return index >= from && index <= to;
});

const updates = [];
const skipped = [];
for (let index = 0; index < candidates.length; index += 6) {
  const batch = candidates.slice(index, index + 6);
  const results = await Promise.all(batch.map(fetchCover));
  for (const result of results) {
    if (result.error) {
      skipped.push({ catalog_number: result.catalog_number, status: result.error });
      continue;
    }
    if (result.artwork_url === result.current_artwork_url) continue;
    updates.push(result);
    console.log(`${result.catalog_number}: ${result.artwork_url}`);
  }
}

if (!dryRun && updates.length > 0) {
  for (let index = 0; index < updates.length; index += 25) {
    const batch = updates.slice(index, index + 25);
    const sql = batch
      .map((release) =>
        `UPDATE releases SET artwork_url = ${sqlString(release.artwork_url)}, updated_at = CURRENT_TIMESTAMP WHERE catalog_number = ${sqlString(release.catalog_number)};`
      )
      .join("\n");
    d1(sql);
  }
}

console.log(JSON.stringify({ checked: candidates.length, updated: updates.length, skipped }, null, 2));
