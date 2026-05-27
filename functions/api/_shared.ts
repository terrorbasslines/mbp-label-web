export interface Env {
  DB?: D1Database;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  RESEND_API_KEY?: string;
  DEMO_FROM_EMAIL?: string;
  DEMO_REPLY_TO_EMAIL?: string;
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

export function splitArtistNames(value: string) {
  const seen = new Set<string>();
  return value
    .split(/\s*(?:&|,|\sx\s|\sX\s)\s*/)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function isCollabArtistName(value: string | null | undefined) {
  return splitArtistNames(String(value ?? "")).length > 1;
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

export async function sendDemoDecisionEmail(env: Env, input: { to: string; artistName: string; trackTitle: string; status: string; reason: string }) {
  if (!env.RESEND_API_KEY || !env.DEMO_FROM_EMAIL) {
    return { sent: false, status: "email_not_configured" };
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
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: env.DEMO_FROM_EMAIL,
      to: input.to,
      reply_to: env.DEMO_REPLY_TO_EMAIL ?? env.DEMO_FROM_EMAIL,
      subject,
      text
    })
  });

  if (!response.ok) {
    return { sent: false, status: `email_failed_${response.status}` };
  }

  return { sent: true, status: "email_sent" };
}

export async function sendArtistInviteEmail(env: Env, input: { to: string; artistName: string; claimUrl: string; role: string }) {
  if (!env.RESEND_API_KEY || !env.DEMO_FROM_EMAIL) {
    return { sent: false, status: "email_not_configured" };
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
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: env.DEMO_FROM_EMAIL,
      to: input.to,
      reply_to: env.DEMO_REPLY_TO_EMAIL ?? env.DEMO_FROM_EMAIL,
      subject: `Claim your ${input.artistName} profile on The MasterBeat Project`,
      text
    })
  });

  if (!response.ok) {
    return { sent: false, status: `email_failed_${response.status}` };
  }

  return { sent: true, status: "email_sent" };
}
