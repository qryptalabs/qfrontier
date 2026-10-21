/** Cloudflare Access is the only identity provider in this independent export.
 * JWTs are verified against the configured team's keys, never a URL from a JWT.
 * https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */
export type AccessConfiguration = { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string };
export type AccessIdentity = { userId: string; email: string; fullName?: string };
type ResolvedConfiguration = { issuer: string; audience: string };
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type AccessFailureReason = "configuration" | "no_token" | "invalid_header" | "invalid_cookie" | "duplicate_cookie" | "oversized_cookie" | "oversized_token" | "algorithm" | "issuer" | "timestamps" | "audience" | "identity_claims" | "key_unavailable" | "jwks_fetch_failed" | "jwks_timeout" | "jwks_http_error" | "invalid_jwks" | "duplicate_kid" | "import_failed" | "no_usable_keys" | "kid_not_found" | "signature_invalid" | "malformed";
type KeyFailure = { reason: AccessFailureReason; jwksHttpStatus?: number; rsaModulusAvailable?: boolean };
type KeyLookup = { key: CryptoKey | null; failure?: KeyFailure };
type TokenPresence = { assertionPresent: boolean; cookieHeaderPresent: boolean; authorizationCookiePresent: boolean; jwksHttpStatus?: number; rsaModulusAvailable?: boolean };
type VerifierOptions = { fetcher?: Fetcher; now?: () => number; onFailure?: (reason: AccessFailureReason, presence: TokenPresence) => void };
type TokenSelection = { token: string } | { reason: AccessFailureReason };
type KeyCache = { keys: Map<string, CryptoKey>; expiresAt: number; lastAttempt: number; inFlight?: Promise<void>; failure?: KeyFailure };

const MAX_TOKEN_BYTES = 16_384;
const MAX_COOKIE_BYTES = 32_768;
const MAX_JWKS_BYTES = 131_072;
const KEY_TTL_MS = 300_000;
const REFRESH_COOLDOWN_MS = 30_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
export const ACCESS_IDENTITY_HEADERS = {
  userId: "x-qfrontier-user-id", email: "x-qfrontier-user-email", fullName: "x-qfrontier-user-name",
} as const;

function configuration(config: AccessConfiguration): ResolvedConfiguration | null {
  if (typeof config.ACCESS_TEAM_DOMAIN !== "string" || typeof config.ACCESS_AUD !== "string") return null;
  const domain = config.ACCESS_TEAM_DOMAIN.trim();
  const audience = config.ACCESS_AUD.trim();
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(audience)) return null;
  try {
    const url = new URL(domain.includes("://") ? domain : `https://${domain}`);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(url.hostname)) return null;
    return { issuer: url.origin, audience };
  } catch { return null; }
}

export function hasAccessConfiguration(config: AccessConfiguration): boolean { return configuration(config) !== null; }

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function bytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error("Invalid base64url");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  if (btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") !== value) throw new Error("Non-canonical base64url");
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
function objectSegment(segment: string): Record<string, unknown> {
  const value: unknown = JSON.parse(decoder.decode(bytes(segment)));
  if (!record(value)) throw new Error("Invalid JWT object");
  return value;
}
function validKid(value: unknown): value is string { return typeof value === "string" && /^[\x21-\x7e]{1,256}$/.test(value); }
function seconds(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function emailAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254 || value.includes("..")) return false;
  const parts = value.split("@");
  if (parts.length !== 2 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/.test(parts[0]) || parts[0].startsWith(".") || parts[0].endsWith(".")) return false;
  const labels = parts[1].split(".");
  return labels.length >= 2 && labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
function subject(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9._:@-]{1,180}$/.test(value); }

/** Worker-level Access may preserve only its browser cookie. The assertion
 * header remains authoritative whenever present, including an invalid/empty
 * value. A cookie is only a token transport, never proof of authentication. */
function requestAccessToken(request: Request): TokenSelection {
  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (assertion !== null) return assertion ? { token: assertion } : { reason: "invalid_header" };
  const cookies = request.headers.get("cookie");
  if (!cookies) return { reason: "no_token" };
  if (cookies.length > MAX_COOKIE_BYTES) return { reason: "oversized_cookie" };
  let token: string | null = null;
  for (const raw of cookies.split(";")) {
    const pair = raw.trim();
    const equal = pair.indexOf("=");
    if (equal < 1) return { reason: "invalid_cookie" };
    const name = pair.slice(0, equal), value = pair.slice(equal + 1);
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return { reason: "invalid_cookie" };
    // Cookie-octet grammar permits encoded/quoted unrelated cookies, but
    // rejects ambiguous separators, controls and non-ASCII transport values.
    const cookieValue = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    if (!/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(cookieValue)) return { reason: "invalid_cookie" };
    if (name !== "CF_Authorization") continue;
    if (token !== null) return { reason: "duplicate_cookie" };
    if (value.length > MAX_TOKEN_BYTES) return { reason: "oversized_token" };
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return { reason: "invalid_cookie" };
    token = value;
  }
  return token ? { token } : { reason: "no_token" };
}

async function jsonResponse(response: Response): Promise<unknown> {
  if (!response.ok || !response.body || Number(response.headers.get("content-length") ?? "0") > MAX_JWKS_BYTES) throw new Error("Keys unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_JWKS_BYTES) throw new Error("Key response too large");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const joined = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(decoder.decode(joined));
}

/** A fresh verifier owns its bounded key cache. Options inject only I/O/time for
 * real-signature security tests; production uses trusted HTTPS and WebCrypto. */
export function createAccessVerifier(options: VerifierOptions = {}) {
  const fetcher: Fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const cache = new Map<string, KeyCache>();

  async function signingKey(issuer: string, kid: string): Promise<KeyLookup> {
    let entry = cache.get(issuer);
    if (!entry) {
      if (cache.size >= 8) cache.delete(cache.keys().next().value!);
      entry = { keys: new Map(), expiresAt: 0, lastAttempt: -Infinity }; cache.set(issuer, entry);
    }
    const result = (): KeyLookup => entry!.expiresAt > now() && entry!.keys.has(kid) ? { key: entry!.keys.get(kid)! } : { key: null, failure: entry!.failure ?? { reason: entry!.keys.size ? "kid_not_found" : "key_unavailable" } };
    if (entry.expiresAt > now() && entry.keys.has(kid)) return result();
    if (entry.inFlight) { await entry.inFlight; return result(); }
    // Unknown-kid replays cannot trigger an unbounded sequence of key requests.
    // One bounded retry after the cooldown also supports signing-key rotation.
    if (now() - entry.lastAttempt < REFRESH_COOLDOWN_MS) return result();
    entry.lastAttempt = now();
    const current = entry;
    current.inFlight = (async () => {
      let failure: KeyFailure = { reason: "jwks_fetch_failed" };
      try {
        // workerd supports manual/follow, but rejects redirect:'error'. Manual
        // plus the non-2xx rejection below prevents redirecting trusted key I/O.
        const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, { redirect: "manual", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4_000) });
        if (!response.ok) { failure = { reason: "jwks_http_error", jwksHttpStatus: response.status }; throw new Error("Key HTTP error"); }
        failure = { reason: "invalid_jwks" };
        const raw = await jsonResponse(response);
        if (!record(raw) || !Array.isArray(raw.keys) || !raw.keys.length || raw.keys.length > 32) throw new Error("Invalid key set");
        const keys = new Map<string, CryptoKey>(); const seen = new Set<string>();
        for (const key of raw.keys) {
          if (!record(key) || !validKid(key.kid)) continue;
          if (seen.has(key.kid)) { failure = { reason: "duplicate_kid" }; throw new Error("Ambiguous key id"); }
          seen.add(key.kid);
          if (key.kty !== "RSA" || (key.alg !== undefined && key.alg !== "RS256") || (key.use !== undefined && key.use !== "sig") || typeof key.n !== "string" || key.n.length > 1400 || typeof key.e !== "string" || key.e.length > 16) continue;
          failure = { reason: "import_failed" };
          const imported = await crypto.subtle.importKey("jwk", { kty: "RSA", n: key.n, e: key.e, alg: "RS256", ext: true, key_ops: ["verify"] }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
          failure = { reason: "no_usable_keys", rsaModulusAvailable: typeof (imported.algorithm as RsaKeyAlgorithm).modulusLength === "number" };
          if ((imported.algorithm as RsaKeyAlgorithm).modulusLength >= 2048) keys.set(key.kid, imported);
        }
        if (!keys.size) { if (failure.reason !== "no_usable_keys") failure = { reason: "no_usable_keys" }; throw new Error("No usable signing keys"); }
        current.keys = keys; current.expiresAt = now() + KEY_TTL_MS; current.failure = undefined;
      } catch (error) {
        current.keys = new Map(); current.expiresAt = 0;
        current.failure = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError") ? { reason: "jwks_timeout" } : failure;
      }
    })();
    try { await current.inFlight; } finally { current.inFlight = undefined; }
    return result();
  }

  return async function verify(request: Request, config: AccessConfiguration): Promise<AccessIdentity | null> {
    const cookies = request.headers.get("cookie");
    const presence: TokenPresence = { assertionPresent: request.headers.has("cf-access-jwt-assertion"), cookieHeaderPresent: cookies !== null, authorizationCookiePresent: /(?:^|;)\s*CF_Authorization=/.test(cookies ?? "") };
    const reject = (reason: AccessFailureReason, details: Omit<KeyFailure, "reason"> = {}): null => { try { options.onFailure?.(reason, { ...presence, ...details }); } catch { /* Diagnostics must not change authorization. */ } return null; };
    const trusted = configuration(config);
    if (!trusted) return reject("configuration");
    const selection = requestAccessToken(request);
    if ("reason" in selection) return reject(selection.reason);
    const token = selection.token;
    if (token.length > MAX_TOKEN_BYTES) return reject("oversized_token");
    try {
      const segments = token.split(".");
      if (segments.length !== 3 || segments[0].length > 2048) return reject("malformed");
      const header = objectSegment(segments[0]), claims = objectSegment(segments[1]);
      if (header.alg !== "RS256") return reject("algorithm");
      if (!validKid(header.kid) || (header.typ !== undefined && header.typ !== "JWT") || header.crit !== undefined || header.b64 !== undefined || header.jku !== undefined || header.x5u !== undefined) return reject("invalid_header");
      const at = Math.floor(now() / 1000);
      if (claims.iss !== trusted.issuer) return reject("issuer");
      if (!seconds(claims.exp) || claims.exp <= at || (claims.nbf !== undefined && (!seconds(claims.nbf) || claims.nbf > at)) || (claims.iat !== undefined && (!seconds(claims.iat) || claims.iat > at + 30))) return reject("timestamps");
      const audience = claims.aud;
      if (!(audience === trusted.audience || (Array.isArray(audience) && audience.length <= 16 && audience.every(item => typeof item === "string") && audience.includes(trusted.audience)))) return reject("audience");
      if (!subject(claims.sub) || !emailAddress(claims.email)) return reject("identity_claims");
      const signature = bytes(segments[2]);
      if (signature.byteLength < 256 || signature.byteLength > 1024) return reject("malformed");
      const lookup = await signingKey(trusted.issuer, header.kid), key = lookup.key;
      if (!key) { const { reason, ...details } = lookup.failure ?? { reason: "key_unavailable" as const }; return reject(reason, details); }
      if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, encoder.encode(`${segments[0]}.${segments[1]}`))) return reject("signature_invalid");
      if (claims.exp <= Math.floor(now() / 1000)) return reject("timestamps");
      const fullName = typeof claims.name === "string" && claims.name.trim().length > 0 && claims.name.length <= 160 && !/[\u0000-\u001f\u007f]/.test(claims.name) ? claims.name.trim() : undefined;
      return { userId: `cf-access:${claims.sub}`, email: claims.email.toLowerCase(), ...(fullName ? { fullName } : {}) };
    } catch { return reject("malformed"); }
  };
}

export const verifyAccessRequest = createAccessVerifier({ onFailure: (reason, presence) => { console.warn(JSON.stringify({ event: "access_auth_rejected", reason, ...presence })); } });

/** Call only with the result of verifyAccessRequest, in the outer Worker before
 * framework/assets dispatch. Neither Cloudflare's email header nor caller-owned
 * identity headers authenticate a user. The app consumes only these replacements. */
export function injectVerifiedAccessIdentity(request: Request, identity: AccessIdentity): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("oai-authenticated-user-") || name.startsWith("x-qfrontier-user-")) headers.delete(name);
  headers.set(ACCESS_IDENTITY_HEADERS.userId, identity.userId);
  headers.set(ACCESS_IDENTITY_HEADERS.email, identity.email);
  if (identity.fullName) headers.set(ACCESS_IDENTITY_HEADERS.fullName, encodeURIComponent(identity.fullName));
  return new Request(request, { headers });
}

/** Read only inside the framework after the protected outer Worker has replaced
 * the forwarded headers. This parser never treats old ChatGPT/CF email headers
 * as an identity and never serves as a replacement for JWT verification. */
export function readForwardedAccessIdentity(headers: Pick<Headers, "get">): AccessIdentity | null {
  const userId = headers.get(ACCESS_IDENTITY_HEADERS.userId), email = headers.get(ACCESS_IDENTITY_HEADERS.email);
  if (!userId?.startsWith("cf-access:") || !subject(userId.slice("cf-access:".length)) || !emailAddress(email)) return null;
  let fullName: string | undefined;
  try {
    const encoded = headers.get(ACCESS_IDENTITY_HEADERS.fullName);
    if (encoded) { const decoded = decodeURIComponent(encoded); if (decoded.length <= 160 && !/[\u0000-\u001f\u007f]/.test(decoded)) fullName = decoded.trim() || undefined; }
  } catch { /* Invalid optional display text cannot invalidate a verified ID. */ }
  return { userId, email: email.toLowerCase(), ...(fullName ? { fullName } : {}) };
}
