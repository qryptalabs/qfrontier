import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

// Only the framework is substituted: the real outer Worker, identity injector,
// RS256 verification and email authorization all execute in these tests.
const frameworkModule = `export default { async fetch(request) {
  return Response.json({ framework: true, method: request.method,
    body: request.method === 'POST' ? await request.text() : null,
    headers: Object.fromEntries(request.headers) });
} };`;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'vinext/server/fetch-handler') return {
      url: `data:text/javascript,${encodeURIComponent(frameworkModule)}`, shortCircuit: true,
    };
    return next(specifier, context);
  },
});
const { default: worker } = await import('../build/cloudflare-worker.ts');
hook.deregister();

const issuer = 'https://qfrontier-worker-tests.cloudflareaccess.com';
const audience = 'c'.repeat(64);
const pair = await crypto.subtle.generateKey({
  name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
}, true, ['sign', 'verify']) as CryptoKeyPair;
const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'worker-key', alg: 'RS256', use: 'sig' };
const originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
  assert.equal(String(input), `${issuer}/cdn-cgi/access/certs`);
  return Response.json({ keys: [jwk] });
};
after(() => { globalThis.fetch = originalFetch; });

async function token(email = 'tester-1@example.invalid') {
  const encode = (value: string | ArrayBuffer) => Buffer.from(typeof value === 'string' ? value : new Uint8Array(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const content = [encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'worker-key' })),
    encode(JSON.stringify({ iss: issuer, aud: [audience], exp: now + 300, iat: now,
      sub: 'real-worker-subject', email, name: 'Explorador de Pruebas' }))].join('.');
  return `${content}.${encode(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(content)))}`;
}
function fixture() {
  let calls = 0, status = 200;
  const env = {
    ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: audience,
    ACCESS_ALLOWED_EMAILS: 'tester-1@example.invalid,tester-2@example.invalid',
    ASSETS: { async fetch(request: Request) { calls++; return status === 404 ? new Response(null, { status }) : Response.json({ asset: true, headers: Object.fromEntries(request.headers) }); } } as Fetcher,
    DB: {} as D1Database,
  };
  return { env, calls: () => calls, assetStatus: (next: number) => { status = next; } };
}
function request(path: string, jwt?: string, method = 'GET') {
  return new Request(`https://frontier.example${path}`, {
    method, ...(method === 'POST' ? { body: '{"action":"quote"}' } : {}),
    headers: { ...(jwt ? { 'cf-access-jwt-assertion': jwt } : {}),
      'oai-authenticated-user-id': 'forged-owner', 'x-qfrontier-user-id': 'cf-access:forged',
      'x-qfrontier-user-email': 'attacker@example.com', 'x-qfrontier-user-extra': 'forged',
    },
  });
}
const ctx = {} as ExecutionContext;

test('missing Access or email configuration closes every path before assets/framework', async () => {
  for (const field of ['ACCESS_AUD', 'ACCESS_ALLOWED_EMAILS'] as const) {
    const f = fixture(); f.env[field] = '';
    for (const path of ['/', '/assets/game.js', '/api/mvp', '/health']) {
      const response = await worker.fetch(request(path), f.env, ctx);
      assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
    assert.equal(f.calls(), 0);
  }
});

test('forged identity headers never authorize a page, asset or API request', async () => {
  const f = fixture();
  for (const path of ['/', '/assets/game.js', '/api/mvp', '/health']) {
    assert.equal((await worker.fetch(request(path), f.env, ctx)).status, 401);
  }
  assert.equal(f.calls(), 0);
});

test('a genuinely signed session outside the exact two-email list receives 403', async () => {
  const f = fixture(), jwt = await token('someone-else@example.com');
  assert.equal((await worker.fetch(request('/assets/game.js', jwt), f.env, ctx)).status, 403);
  assert.equal((await worker.fetch(request('/api/mvp', jwt, 'POST'), f.env, ctx)).status, 403);
  assert.equal(f.calls(), 0);
});

test('both allowed signed identities can fetch assets only after forged headers are replaced', async () => {
  const f = fixture();
  for (const email of ['tester-1@example.invalid', 'tester-2@example.invalid']) {
    const response = await worker.fetch(request('/assets/game.js', await token(email)), f.env, ctx);
    assert.equal(response.status, 200);
    const body = await response.json() as { asset: boolean; headers: Record<string, string> };
    assert.equal(body.asset, true); assert.equal(body.headers['x-qfrontier-user-id'], 'cf-access:real-worker-subject');
    assert.equal(body.headers['x-qfrontier-user-email'], email);
    assert.equal(body.headers['oai-authenticated-user-id'], undefined); assert.equal(body.headers['x-qfrontier-user-extra'], undefined);
  }
  assert.equal(f.calls(), 2);
});

test('authenticated missing assets fall back to SSR and POST APIs preserve their bodies', async () => {
  const f = fixture(), jwt = await token(); f.assetStatus(404);
  const page = await worker.fetch(request('/', jwt), f.env, ctx);
  assert.equal((await page.json() as { framework: boolean }).framework, true);
  assert.equal(f.calls(), 1);
  const api = await worker.fetch(request('/api/mvp', jwt, 'POST'), f.env, ctx);
  const body = await api.json() as { framework: boolean; method: string; body: string; headers: Record<string, string> };
  assert.equal(body.framework, true); assert.equal(body.method, 'POST'); assert.equal(body.body, '{"action":"quote"}');
  assert.equal(body.headers['x-qfrontier-user-id'], 'cf-access:real-worker-subject');
  assert.equal(f.calls(), 1, 'POST APIs bypass static lookup only after authentication');
});
