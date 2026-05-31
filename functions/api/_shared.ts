export interface Env {
  DB?: D1Database;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  RESEND_API_KEY?: string;
  DEMO_FROM_EMAIL?: string;
  DEMO_REPLY_TO_EMAIL?: string;
  DEMO_NOTIFY_EMAIL?: string;
  DEMO_BUCKET?: R2Bucket;
}

export type SessionRole = "admin" | "artist";

export interface AppSession {
  sub: string;
  role: SessionRole;
  email?: string;
  artistIds?: string[];
  exp: number;
}

export type AdminSession = AppSession & { role: "admin" };

const encoder = new TextEncoder();

export type ArtistCreditRole = "primary" | "collaborator" | "featured";

export type ArtistCredit = {
  name: string;
  role: ArtistCreditRole;
};

export type MbpRegion = "europe" | "america" | "asia" | "world" | "australia";

export const MBP_REGION_KEYS: MbpRegion[] = ["europe", "america", "asia", "world", "australia"];

export const MBP_REGION_META: Record<MbpRegion, { label: string; color: string }> = {
  europe: { label: "MBP Europe", color: "#ffd000" },
  america: { label: "MBP America", color: "#23df1e" },
  asia: { label: "MBP Asia", color: "#ff1808" },
  world: { label: "MBP World", color: "#bd00ff" },
  australia: { label: "MBP Australia", color: "#1d27ff" }
};

export function normalizeMbpRegion(value: unknown, fallback: MbpRegion = "world"): MbpRegion {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/^mbp\s+/, "");
  return MBP_REGION_KEYS.includes(normalized as MbpRegion) ? (normalized as MbpRegion) : fallback;
}

export function mbpRegionDetails(value: unknown) {
  return MBP_REGION_META[normalizeMbpRegion(value)];
}

export function inferMbpRegionFromCountry(value: unknown, fallback: MbpRegion = "world"): MbpRegion {
  const country = String(value ?? "").trim().toLowerCase();
  if (!country) return fallback;

  if (["australia", "new zealand"].includes(country)) return "australia";
  if (
    [
      "usa",
      "united states",
      "united states of america",
      "canada",
      "mexico",
      "brazil",
      "argentina",
      "chile",
      "peru",
      "colombia",
      "venezuela",
      "ecuador",
      "uruguay",
      "paraguay",
      "bolivia",
      "panama",
      "costa rica"
    ].includes(country)
  ) {
    return "america";
  }
  if (
    [
      "china",
      "japan",
      "south korea",
      "korea",
      "india",
      "indonesia",
      "malaysia",
      "philippines",
      "thailand",
      "vietnam",
      "taiwan",
      "singapore",
      "hong kong",
      "israel",
      "turkey",
      "uae",
      "united arab emirates"
    ].includes(country)
  ) {
    return "asia";
  }
  if (
    [
      "slovakia",
      "slovensko",
      "czech republic",
      "czechia",
      "poland",
      "germany",
      "austria",
      "netherlands",
      "belgium",
      "france",
      "italy",
      "spain",
      "portugal",
      "united kingdom",
      "uk",
      "ireland",
      "sweden",
      "norway",
      "finland",
      "denmark",
      "romania",
      "hungary",
      "croatia",
      "serbia",
      "slovenia",
      "greece",
      "ukraine"
    ].includes(country)
  ) {
    return "europe";
  }

  return fallback;
}

const ARTIST_REGION_HINTS: Array<[RegExp, MbpRegion]> = [
  [/\b(terror basslines|romee storm|ayla|riax|the-wolfs|the wolfs|daniel joseph)\b/i, "europe"],
  [/\b(rodrigo stadt|dulehec|artphazers|valkrize)\b/i, "america"],
  [/\b(donkey tae|kapkakasmaka|k3nto|mitsucaster|chris ponate|emrion|star-shards|star shards|blastrix|il4um|zha_sty|yuebai)\b/i, "asia"],
  [/\b(id pleaz|rikkore)\b/i, "australia"]
];

export function inferMbpRegionFromArtistName(value: unknown, fallback: MbpRegion = "world"): MbpRegion {
  const name = String(value ?? "").trim();
  if (!name) return fallback;

  for (const [pattern, region] of ARTIST_REGION_HINTS) {
    if (pattern.test(name)) return region;
  }

  return fallback;
}

export function inferReleaseRegion(regions: unknown[], fallback: MbpRegion = "world"): MbpRegion {
  const normalized = [...new Set(regions.map((region) => normalizeMbpRegion(region)))];
  if (normalized.length === 0) return fallback;
  return normalized.length === 1 ? normalized[0] : "world";
}

const FEATURE_MARKER_PATTERN = /\s*(?:[\(\[]\s*)?(?:feat\.?|ft\.?|featuring)\s+/i;

function cleanArtistCreditName(value: string) {
  return value
    .replace(/^[\s\(\[\{]+/g, "")
    .replace(/[\s\)\]\}]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitArtistCreditPart(value: string) {
  return value
    .split(/\s*(?:&|,|\sx\s|\sX\s)\s*/)
    .map(cleanArtistCreditName)
    .filter(Boolean);
}

export function parseArtistCredits(value: string | null | undefined): ArtistCredit[] {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const marker = normalized.match(FEATURE_MARKER_PATTERN);
  const mainPart = marker?.index !== undefined ? normalized.slice(0, marker.index) : normalized;
  const featuredPart = marker?.index !== undefined ? normalized.slice(marker.index + marker[0].length) : "";
  const seen = new Set<string>();
  const credits: ArtistCredit[] = [];

  for (const name of splitArtistCreditPart(mainPart)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({ name, role: credits.length === 0 ? "primary" : "collaborator" });
  }

  for (const name of splitArtistCreditPart(featuredPart)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({ name, role: "featured" });
  }

  if (credits.length === 0 && normalized) {
    credits.push({ name: cleanArtistCreditName(normalized), role: "primary" });
  }

  return credits;
}

export function splitArtistNames(value: string) {
  const names = parseArtistCredits(value).map((credit) => credit.name);
  const seen = new Set<string>();
  return names
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function isCollabArtistName(value: string | null | undefined) {
  const text = String(value ?? "");
  return FEATURE_MARKER_PATTERN.test(text) || parseArtistCredits(text).length > 1;
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      ...(init.headers ?? {})
    }
  });
}

export function methodNotAllowed(methods: string[]) {
  return json(
    { ok: false, error: `Use ${methods.join(" or ")} for this endpoint.` },
    { status: 405, headers: { allow: methods.join(", ") } }
  );
}

export function requireDb(env: Env): D1Database | Response {
  if (!env.DB) {
    return json(
      { ok: false, error: "Cloudflare D1 binding DB is not configured for this deployment." },
      { status: 503 }
    );
  }
  return env.DB;
}

export async function readJson<T extends Record<string, unknown>>(request: Request): Promise<T | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Expected application/json request body." }, { status: 415 });
  }

  try {
    return (await request.json()) as T;
  } catch {
    return json({ ok: false, error: "Invalid JSON request body." }, { status: 400 });
  }
}

export function requiredString(value: unknown, field: string, min = 1, max = 2000): string | Response {
  if (typeof value !== "string") {
    return json({ ok: false, error: `${field} is required.` }, { status: 400 });
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return json({ ok: false, error: `${field} is too short.` }, { status: 400 });
  }
  if (trimmed.length > max) {
    return json({ ok: false, error: `${field} is too long.` }, { status: 400 });
  }
  return trimmed;
}

export function optionalString(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.slice(0, max) : null;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function upsertCreditArtist(db: D1Database, artistName: string, sourceUrl?: string | null) {
  const slug = slugify(artistName);
  let artist = await db
    .prepare("SELECT id FROM artists WHERE lower(name) = lower(?) OR slug = ? LIMIT 1")
    .bind(artistName, slug)
    .first<{ id: string }>();

  if (!artist) {
    const artistId = id("art");
    const mbpRegion = inferMbpRegionFromArtistName(artistName);
    await db
      .prepare(
        `INSERT INTO artists (id, slug, name, profile, image_url, is_featured, mbp_region, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)`
      )
      .bind(artistId, slug, artistName, sourceUrl ? `Imported from ${sourceUrl}` : null, null, mbpRegion)
      .run();
    artist = { id: artistId };
  }

  return artist;
}

export async function syncReleaseArtistCredits(
  db: D1Database,
  releaseId: string,
  artistDisplay: string,
  preferredPrimaryArtistId?: string | null,
  sourceUrl?: string | null
) {
  const credits = parseArtistCredits(artistDisplay);
  const linked: Array<{ id: string; role: ArtistCreditRole }> = [];

  for (const credit of credits) {
    const artist = await upsertCreditArtist(db, credit.name, sourceUrl);
    linked.push({ id: artist.id, role: credit.role });
  }

  const primaryArtistId = preferredPrimaryArtistId || linked.find((artist) => artist.role === "primary")?.id || linked[0]?.id || null;

  await db.prepare("DELETE FROM release_artists WHERE release_id = ?").bind(releaseId).run();

  if (preferredPrimaryArtistId) {
    await db
      .prepare("INSERT OR IGNORE INTO release_artists (release_id, artist_id, role) VALUES (?, ?, 'primary')")
      .bind(releaseId, preferredPrimaryArtistId)
      .run();
  }

  for (const artist of linked) {
    if (preferredPrimaryArtistId && artist.id === preferredPrimaryArtistId) continue;
    await db
      .prepare("INSERT OR IGNORE INTO release_artists (release_id, artist_id, role) VALUES (?, ?, ?)")
      .bind(releaseId, artist.id, artist.role)
      .run();
  }

  return { primaryArtistId, linkedArtists: new Set(linked.map((artist) => artist.id)).size };
}

function base64UrlEncode(input: string | ArrayBuffer) {
  let binary = "";
  if (typeof input === "string") {
    binary = input;
  } else {
    const bytes = new Uint8Array(input);
    for (const byte of bytes) binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return atob(padded);
}

function base64UrlToBytes(input: string) {
  const binary = base64UrlDecode(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hmac(message: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

export function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64UrlEncode(bytes.buffer as ArrayBuffer);
}

export async function sha256Hex(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hashPassword(password: string) {
  const iterations = 10000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordBytes = encoder.encode(password);
  let hash: Uint8Array | ArrayBuffer = passwordBytes;
  for (let index = 0; index < iterations; index += 1) {
    const input = new Uint8Array(salt.byteLength + hash.byteLength + passwordBytes.byteLength);
    input.set(salt, 0);
    input.set(new Uint8Array(hash), salt.byteLength);
    input.set(passwordBytes, salt.byteLength + hash.byteLength);
    hash = await crypto.subtle.digest("SHA-256", input);
  }
  return `sha256_iter$${iterations}$${base64UrlEncode(salt.buffer as ArrayBuffer)}$${base64UrlEncode(hash as ArrayBuffer)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationsText, saltText, hashText] = stored.split("$");
  if (!iterationsText || !saltText || !hashText) return false;

  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 1000) return false;

  const salt = base64UrlToBytes(saltText);

  if (algorithm === "pbkdf2_sha256") {
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      keyMaterial,
      256
    );
    return constantTimeEqual(base64UrlEncode(bits), hashText);
  }

  if (algorithm !== "sha256_iter") return false;

  const passwordBytes = encoder.encode(password);
  let hash: Uint8Array | ArrayBuffer = passwordBytes;
  for (let index = 0; index < iterations; index += 1) {
    const input = new Uint8Array(salt.byteLength + hash.byteLength + passwordBytes.byteLength);
    input.set(salt, 0);
    input.set(new Uint8Array(hash), salt.byteLength);
    input.set(passwordBytes, salt.byteLength + hash.byteLength);
    hash = await crypto.subtle.digest("SHA-256", input);
  }
  return constantTimeEqual(base64UrlEncode(hash as ArrayBuffer), hashText);
}

export async function createSessionToken(env: Env, input: Omit<AppSession, "exp"> = { sub: "admin", role: "admin" }) {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not configured.");
  }
  const payload: AppSession = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(await hmac(body, env.SESSION_SECRET));
  return `${body}.${signature}`;
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const prefix = `${name}=`;
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export async function verifySession(request: Request, env: Env): Promise<AppSession | null> {
  if (!env.SESSION_SECRET) return null;
  const token = getCookie(request, "mbp_admin");
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = base64UrlEncode(await hmac(body, env.SESSION_SECRET));
  if (expected !== signature) return null;

  try {
    const session = JSON.parse(base64UrlDecode(body)) as Partial<AppSession> & { sub?: string };
    if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    if (!session.role && session.sub === "admin") {
      return { sub: "admin", role: "admin", exp: session.exp };
    }
    if (session.role !== "admin" && session.role !== "artist") return null;
    return {
      sub: session.sub,
      role: session.role,
      email: session.email,
      artistIds: Array.isArray(session.artistIds) ? session.artistIds : [],
      exp: session.exp
    };
  } catch {
    return null;
  }
}

export async function requireSession(request: Request, env: Env): Promise<Response | AppSession> {
  const session = await verifySession(request, env);
  if (!session) {
    return json({ ok: false, error: "Login required." }, { status: 401 });
  }
  return session;
}

export async function requireAdmin(request: Request, env: Env): Promise<Response | AdminSession> {
  const session = await requireSession(request, env);
  if (isResponse(session)) return session;
  if (session.role !== "admin") {
    return json({ ok: false, error: "Admin permission required." }, { status: 403 });
  }
  return session as AdminSession;
}

export function setSessionCookie(token: string) {
  return `mbp_admin=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 8}`;
}

export function clearSessionCookie() {
  return "mbp_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function emailFailureStatus(status: number) {
  if (status === 401) return "email_failed_401_check_resend_api_key";
  if (status === 403) return "email_failed_403_check_sender_domain";
  return `email_failed_${status}`;
}

function emailConfig(env: Env) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.DEMO_FROM_EMAIL?.trim();
  const replyTo = env.DEMO_REPLY_TO_EMAIL?.trim() || from;
  if (!apiKey) return { ok: false as const, status: "email_missing_resend_api_key" };
  if (apiKey === "re_xxxxx") return { ok: false as const, status: "email_placeholder_resend_api_key" };
  if (!from) return { ok: false as const, status: "email_missing_from_email" };
  return { ok: true as const, apiKey, from, replyTo };
}

export async function sendDemoDecisionEmail(env: Env, input: { to: string; artistName: string; trackTitle: string; status: string; reason: string }) {
  const config = emailConfig(env);
  if (!config.ok) {
    return { sent: false, status: config.status };
  }

  const accepted = input.status === "approved";
  const subject = accepted
    ? `The MasterBeat Project demo review: ${input.trackTitle}`
    : `Demo review update: ${input.trackTitle}`;
  const text = [
    `Hi ${input.artistName},`,
    "",
    accepted
      ? `Thank you for sending "${input.trackTitle}" to The MasterBeat Project. We reviewed the demo and would like to continue the conversation.`
      : `Thank you for sending "${input.trackTitle}" to The MasterBeat Project. After review, we are not moving forward with this demo at this time.`,
    "",
    `Reason / note: ${input.reason}`,
    "",
    "The MasterBeat Project"
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: config.from,
      to: input.to,
      reply_to: config.replyTo,
      subject,
      text
    })
  });

  if (!response.ok) {
    return { sent: false, status: emailFailureStatus(response.status) };
  }

  return { sent: true, status: "email_sent" };
}

export async function sendDemoReceivedEmail(env: Env, input: { to: string; artistName: string; trackTitle: string }) {
  const config = emailConfig(env);
  if (!config.ok) {
    return { sent: false, status: config.status };
  }

  const text = [
    `Hi ${input.artistName},`,
    "",
    `Your demo "${input.trackTitle}" was successfully received by The MasterBeat Project.`,
    "",
    "Our A&R team will listen as soon as possible. When the review is complete, you will receive an approval or rejection update by email.",
    "",
    "The MasterBeat Project"
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: config.from,
      to: input.to,
      reply_to: config.replyTo,
      subject: `Demo received: ${input.trackTitle}`,
      text
    })
  });

  if (!response.ok) {
    return { sent: false, status: emailFailureStatus(response.status) };
  }

  return { sent: true, status: "demo_received_email_sent" };
}

export async function sendDemoNotificationEmail(env: Env, input: { artistName: string; artistEmail: string; country: string; trackTitle: string; genre: string; streamingLink: string; hasUpload: boolean }) {
  const config = emailConfig(env);
  if (!config.ok) {
    return { sent: false, status: config.status };
  }

  const notifyEmail = env.DEMO_NOTIFY_EMAIL?.trim() || "demo@themasterbeatproject.com";
  const text = [
    "New demo submission received.",
    "",
    `Artist: ${input.artistName}`,
    `Email: ${input.artistEmail}`,
    `Country: ${input.country}`,
    `Track: ${input.trackTitle}`,
    `Genre: ${input.genre}`,
    `Private stream: ${input.streamingLink}`,
    `Uploaded file: ${input.hasUpload ? "yes" : "no"}`,
    "",
    "Review it in the MBP admin dashboard."
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: config.from,
      to: notifyEmail,
      reply_to: input.artistEmail || config.replyTo,
      subject: `New MBP demo: ${input.artistName} - ${input.trackTitle}`,
      text
    })
  });

  if (!response.ok) {
    return { sent: false, status: emailFailureStatus(response.status) };
  }

  return { sent: true, status: "demo_notify_email_sent" };
}

export async function sendArtistInviteEmail(env: Env, input: { to: string; artistName: string; claimUrl: string; role: string }) {
  const config = emailConfig(env);
  if (!config.ok) {
    return { sent: false, status: config.status };
  }

  const text = [
    `Hi ${input.artistName},`,
    "",
    `You have been invited to claim your The MasterBeat Project artist profile as ${input.role}.`,
    "",
    `Claim your profile here: ${input.claimUrl}`,
    "",
    "This private invite link expires in 30 days.",
    "",
    "The MasterBeat Project"
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: config.from,
      to: input.to,
      reply_to: config.replyTo,
      subject: `Claim your ${input.artistName} profile on The MasterBeat Project`,
      text
    })
  });

  if (!response.ok) {
    return { sent: false, status: emailFailureStatus(response.status) };
  }

  return { sent: true, status: "email_sent" };
}

export async function sendPasswordResetEmail(env: Env, input: { to: string; name: string; resetUrl: string }) {
  const config = emailConfig(env);
  if (!config.ok) {
    return { sent: false, status: config.status };
  }

  const text = [
    `Hi ${input.name},`,
    "",
    "A password reset was requested for your The MasterBeat Project artist account.",
    "",
    `Reset your password here: ${input.resetUrl}`,
    "",
    "This private reset link expires in 60 minutes. If you did not request it, you can ignore this email.",
    "",
    "The MasterBeat Project"
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: config.from,
      to: input.to,
      reply_to: config.replyTo,
      subject: "Reset your The MasterBeat Project password",
      text
    })
  });

  if (!response.ok) {
    return { sent: false, status: emailFailureStatus(response.status) };
  }

  return { sent: true, status: "password_reset_email_sent" };
}
