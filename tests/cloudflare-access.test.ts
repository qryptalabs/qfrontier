import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCESS_IDENTITY_HEADERS, createAccessVerifier, hasAccessConfiguration, injectVerifiedAccessIdentity, readForwardedAccessIdentity } from "../lib/auth/cloudflare-access.ts";

const issuer = "https://qfrontier-tests.cloudflareaccess.com";
const audience = "a".repeat(64);
const config = { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: audience };
const at = 1_800_000_000_000;
const algorithm = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
const pairA = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]) as CryptoKeyPair;
const pairB = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]) as CryptoKeyPair;
const jwkA = { ...await crypto.subtle.exportKey("jwk", pairA.publicKey), kid: "current-key", alg: "RS256", use: "sig" };
const jwkB = { ...await crypto.subtle.exportKey("jwk", pairB.publicKey), kid: "rotated-key", alg: "RS256", use: "sig" };
const encode = (value: string | ArrayBuffer) => Buffer.from(typeof value === "string" ? value : new Uint8Array(value)).toString("base64url");
async function token(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}, signer = pairA.privateKey): Promise<string> {
  const parts = [encode(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "current-key", ...header })), encode(JSON.stringify({ iss: issuer, aud: [audience], exp: Math.floor(at / 1000) + 600, iat: Math.floor(at / 1000), sub: "4ad17766-0dbf-4a91-91a0-5fa6df35fab7", email: "Explorer@example.com", name: "María del Río", ...claims }))];
  return `${parts.join(".")}.${encode(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signer, new TextEncoder().encode(parts.join("."))))}`;
}
function request(jwt?: string, extra: Record<string, string> = {}): Request {
  return new Request("https://frontier.example/api/mvp", { headers: { ...extra, ...(jwt ? { "cf-access-jwt-assertion": jwt } : {}) } });
}
function fixture() {
  let time = at, calls = 0, keys: JsonWebKey[] = [jwkA], fail = false;
  const verify = createAccessVerifier({ now: () => time, fetcher: async (url, init) => {
    calls++;
    assert.equal(String(url), `${issuer}/cdn-cgi/access/certs`);
    assert.equal(init?.redirect, "manual");
    return fail ? new Response("upstream unavailable", { status: 503 }) : Response.json({ keys });
  } });
  return { verify, calls: () => calls, advance: (ms: number) => { time += ms; }, keys: (next: JsonWebKey[]) => { keys = next; }, fail: () => { fail = true; } };
}

test("a genuine RS256 Access token yields stable subject identity and Unicode display text", async () => {
  const f = fixture(), jwt = await token();
  const user = await f.verify(request(jwt), config);
  assert.deepEqual(user, { userId: "cf-access:4ad17766-0dbf-4a91-91a0-5fa6df35fab7", email: "explorer@example.com", fullName: "María del Río" });
  // An Access bearer session is intentionally reusable until expiry, not a one-time game command.
  assert.deepEqual(await f.verify(request(jwt), config), user);
  assert.equal(f.calls(), 1);
  f.advance(600_000);
  assert.equal(await f.verify(request(jwt), config), null);
});

test("malformed, oversized, or unsigned tokens are rejected without requesting public keys", async () => {
  const f = fixture();
  for (const jwt of ["not-a-jwt", "a.b.c", "a.b.c.d", "a".repeat(16_385), `${encode(JSON.stringify({ alg: "none", kid: "current-key" }))}.${encode("{}")}.`, "_._._"]) assert.equal(await f.verify(request(jwt), config), null);
  assert.equal(f.calls(), 0);
});

test("forged signatures and a tampered email never authenticate", async () => {
  const f = fixture();
  assert.equal(await f.verify(request(await token({}, {}, pairB.privateKey)), config), null);
  const parts = (await token()).split(".");
  parts[1] = encode(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], "base64url").toString()), email: "attacker@example.com" }));
  assert.equal(await f.verify(request(parts.join(".")), config), null);
});

test("algorithm confusion, critical extensions and attacker-selected JWKS locations fail closed", async () => {
  const f = fixture();
  for (const header of [{ alg: "HS256" }, { alg: "none" }, { crit: ["example"] }, { b64: false }, { jku: "https://attacker.example/keys" }, { x5u: "https://attacker.example/cert" }]) assert.equal(await f.verify(request(await token({}, header)), config), null);
  assert.equal(f.calls(), 0);
});

test("a valid signature for another issuer or application does not authorize this application", async () => {
  const f = fixture();
  for (const claims of [{ iss: "https://attacker.cloudflareaccess.com" }, { iss: `${issuer}/` }, { aud: ["b".repeat(64)] }, { aud: [audience, 17] }]) assert.equal(await f.verify(request(await token(claims)), config), null);
  assert.equal(f.calls(), 0);
  assert.ok(await f.verify(request(await token({ aud: audience })), config));
});

test("expiration and not-before enforce strict NumericDate boundaries", async () => {
  const f = fixture(), second = Math.floor(at / 1000);
  for (const claims of [{ exp: second }, { exp: second - 1 }, { exp: "2000000000" }, { exp: undefined }, { nbf: second + 1 }, { nbf: "0" }, { exp: second + .5 }, { iat: second + 31 }]) assert.equal(await f.verify(request(await token(claims)), config), null);
  assert.ok(await f.verify(request(await token({ nbf: second })), config));
});

test("expiry is checked again after fetching keys rather than accepting a now-expired token", async () => {
  let time = at;
  const verify = createAccessVerifier({ now: () => time, fetcher: async () => { time += 2000; return Response.json({ keys: [jwkA] }); } });
  assert.equal(await verify(request(await token({ exp: Math.floor(at / 1000) + 1 })), config), null);
});

test("a human subject and valid email are required even when the signature is genuine", async () => {
  const f = fixture();
  for (const claims of [{ sub: "" }, { sub: "identity\r\ninjection" }, { sub: undefined }, { email: undefined }, { email: "not-an-email" }, { email: "x@example.com\nforged" }, { email: ".x@example.com" }, { email: "x@-example.com" }]) assert.equal(await f.verify(request(await token(claims)), config), null);
});

test("untrusted email and ChatGPT identity headers cannot replace an Access JWT", async () => {
  const f = fixture();
  assert.equal(await f.verify(request(undefined, { "cf-access-authenticated-user-email": "explorer@example.com", "oai-authenticated-user-id": "admin", "oai-authenticated-user-email": "admin@example.com", "x-qfrontier-user-id": "cf-access:admin", "x-qfrontier-user-email": "admin@example.com" }), config), null);
  assert.equal(f.calls(), 0);
});

test("forwarding removes every caller-owned identity header before injecting verified identity", async () => {
  const f = fixture(), signed = await token({ name: undefined });
  const incoming = new Request("https://frontier.example/api/mvp", { method: "POST", body: "{\"command\":\"keep\"}", headers: { "cf-access-jwt-assertion": signed, "oai-authenticated-user-id": "admin", "oai-authenticated-user-anything": "spoof", "x-qfrontier-user-name": "%61dmin", "x-qfrontier-user-admin": "true", "x-qfrontier-user-id": "admin", "x-qfrontier-user-email": "admin@example.com", "content-type": "application/json" } });
  const user = await f.verify(incoming, config); assert.ok(user);
  const forwarded = injectVerifiedAccessIdentity(incoming, user);
  assert.equal(forwarded.headers.get("oai-authenticated-user-id"), null);
  assert.equal(forwarded.headers.get("oai-authenticated-user-anything"), null);
  assert.equal(forwarded.headers.get("x-qfrontier-user-admin"), null);
  assert.equal(forwarded.headers.get(ACCESS_IDENTITY_HEADERS.fullName), null);
  assert.equal(forwarded.headers.get(ACCESS_IDENTITY_HEADERS.userId), user.userId);
  assert.equal(forwarded.headers.get(ACCESS_IDENTITY_HEADERS.email), "explorer@example.com");
  assert.equal(await forwarded.text(), '{"command":"keep"}');
  assert.deepEqual(readForwardedAccessIdentity(forwarded.headers), user);
});

test("the framework ignores old identity headers and safely decodes only the verified forwarder", async () => {
  assert.equal(readForwardedAccessIdentity(new Headers({ "oai-authenticated-user-id": "admin", "oai-authenticated-user-email": "admin@example.com" })), null);
  const f = fixture(), user = await f.verify(request(await token()), config); assert.ok(user);
  assert.deepEqual(readForwardedAccessIdentity(injectVerifiedAccessIdentity(request(), user).headers), user);
  const headers = new Headers({ [ACCESS_IDENTITY_HEADERS.userId]: user.userId, [ACCESS_IDENTITY_HEADERS.email]: user.email, [ACCESS_IDENTITY_HEADERS.fullName]: "%broken" });
  assert.deepEqual(readForwardedAccessIdentity(headers), { userId: user.userId, email: user.email });
});

test("unknown-kid replay is throttled and a genuine rotated key is accepted after bounded refresh", async () => {
  const f = fixture();
  assert.ok(await f.verify(request(await token()), config));
  const rotated = await token({}, { kid: "rotated-key" }, pairB.privateKey);
  const unknown = await token({}, { kid: "unknown-key" }, pairB.privateKey);
  for (let i = 0; i < 12; i++) assert.equal(await f.verify(request(unknown), config), null);
  assert.equal(f.calls(), 1);
  f.advance(30_001); f.keys([jwkA, jwkB]);
  assert.ok(await f.verify(request(rotated), config));
  assert.equal(f.calls(), 2);
  for (let i = 0; i < 12; i++) assert.equal(await f.verify(request(unknown), config), null);
  assert.equal(f.calls(), 2);
});

test("concurrent verification shares a key fetch and expired key caches fail closed on upstream failure", async () => {
  const f = fixture(), jwt = await token();
  const users = await Promise.all(Array.from({ length: 12 }, () => f.verify(request(jwt), config)));
  assert.ok(users.every(Boolean)); assert.equal(f.calls(), 1);
  f.advance(300_001); f.fail();
  assert.equal(await f.verify(request(jwt), config), null);
  assert.equal(await f.verify(request(jwt), config), null);
  assert.equal(f.calls(), 2);
});

test("configuration only permits an HTTPS Cloudflare team origin and an explicit audience", async () => {
  const f = fixture(), jwt = await token();
  assert.ok(hasAccessConfiguration(config));
  assert.ok(hasAccessConfiguration({ ...config, ACCESS_TEAM_DOMAIN: "qfrontier-tests.cloudflareaccess.com" }));
  for (const domain of ["", "http://qfrontier-tests.cloudflareaccess.com", "https://qfrontier-tests.cloudflareaccess.com.evil.example", "https://user@qfrontier-tests.cloudflareaccess.com", `${issuer}/untrusted`, `${issuer}?other=1`, "https://localhost", "https://qfrontier-tests.cloudflareaccess.com:8443"]) { const candidate = { ...config, ACCESS_TEAM_DOMAIN: domain }; assert.equal(hasAccessConfiguration(candidate), false); assert.equal(await f.verify(request(jwt), candidate), null); }
  assert.equal(hasAccessConfiguration({ ...config, ACCESS_AUD: "" }), false);
  assert.equal(f.calls(), 0);
});

test("ambiguous key ids, encryption keys and oversized malformed JWKS are rejected", async () => {
  for (const body of [{ keys: [jwkA, jwkA] }, { keys: [{ ...jwkA, use: "enc" }] }, { keys: [] }, { keys: [{ ...jwkA, kty: "EC" }] }, { keys: [jwkA], padding: "x".repeat(132_000) }]) {
    const verify = createAccessVerifier({ now: () => at, fetcher: async () => Response.json(body) });
    assert.equal(await verify(request(await token()), config), null);
  }
});

test("a genuine signed CF_Authorization browser cookie authenticates when the assertion header is absent", async () => {
  const f = fixture(), jwt = await token();
  const cookieUser = await f.verify(request(undefined, { Cookie: `theme=forest; CF_Authorization=${jwt}; preference="compact"; encoded=%20` }), config);
  assert.ok(cookieUser);
  assert.deepEqual(cookieUser, await f.verify(request(jwt), config));
  assert.equal(f.calls(), 1);
});

test("cookie transport still rejects forged signatures, expired tokens, wrong issuer and wrong audience", async () => {
  const f = fixture();
  const invalid = [await token({}, {}, pairB.privateKey), await token({ exp: Math.floor(at / 1000) }), await token({ iss: "https://other.cloudflareaccess.com" }), await token({ aud: ["b".repeat(64)] })];
  for (const jwt of invalid) assert.equal(await f.verify(request(undefined, { Cookie: `CF_Authorization=${jwt}` }), config), null);
});

test("duplicate Access cookies are rejected instead of choosing a browser- or proxy-dependent identity", async () => {
  const f = fixture(), jwt = await token(), other = await token({ sub: "another-user" });
  for (const cookie of [`CF_Authorization=${jwt}; CF_Authorization=${jwt}`, `CF_Authorization=${jwt}; CF_Authorization=${other}`, `CF_Authorization=broken; CF_Authorization=${jwt}`]) assert.equal(await f.verify(request(undefined, { Cookie: cookie }), config), null);
  assert.equal(f.calls(), 0);
});

test("cookie fallback requires the exact cookie name and rejects malformed or oversized transport", async () => {
  const f = fixture(), jwt = await token();
  const cookies = [`prefixCF_Authorization=${jwt}`, `cf_authorization=${jwt}`, `CF_Authorization_extra=${jwt}`, "CF_Authorization", "CF_Authorization=", `CF_Authorization =${jwt}`, `CF_Authorization="${jwt}"`, `CF_Authorization=%65${jwt.slice(1)}`, `CF_Authorization=${jwt}=`, `CF_Authorization=${jwt}, other=x`, `CF_Authorization=${jwt}; malformed`, `CF_Authorization=${"a".repeat(16_385)}`, `other=${"x".repeat(32_768)}; CF_Authorization=${jwt}`];
  for (const cookie of cookies) assert.equal(await f.verify(request(undefined, { Cookie: cookie }), config), null);
  assert.equal(f.calls(), 0);
});

test("assertion header wins over cookies and an invalid or empty assertion cannot fall back to a valid cookie", async () => {
  const f = fixture(), cookie = await token({ sub: "cookie-user" }), header = await token({ sub: "header-user" });
  const user = await f.verify(request(header, { Cookie: `CF_Authorization=${cookie}` }), config);
  assert.equal(user?.userId, "cf-access:header-user");
  assert.equal((await f.verify(request(header, { Cookie: "CF_Authorization=malformed; malformed" }), config))?.userId, "cf-access:header-user");
  assert.equal(await f.verify(request("invalid", { Cookie: `CF_Authorization=${cookie}` }), config), null);
  assert.equal(await f.verify(request(undefined, { "cf-access-jwt-assertion": "", Cookie: `CF_Authorization=${cookie}` }), config), null);
});

test("the edge-compatible JWKS fetch refuses redirects without following a replacement key URL", async () => {
  for (const status of [301, 302, 307, 308]) {
    let calls = 0, rejected: { reason: string; status?: number } | undefined;
    const verify = createAccessVerifier({ now: () => at, fetcher: async (url, init) => {
      calls++;
      assert.equal(String(url), `${issuer}/cdn-cgi/access/certs`);
      // Real workerd rejects redirect:'error'. Manual is supported and returns
      // the redirect for application-level rejection instead of following it.
      assert.equal(init?.redirect, "manual");
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(null, { status, headers: { Location: "https://replacement.example/keys" } });
    }, onFailure: (reason, details) => { rejected = { reason, status: details.jwksHttpStatus }; } });
    assert.equal(await verify(request(await token()), config), null);
    assert.equal(calls, 1);
    assert.deepEqual(rejected, { reason: "jwks_http_error", status });
  }
});
