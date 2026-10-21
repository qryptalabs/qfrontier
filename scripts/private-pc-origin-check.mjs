/** Isolated loopback URL/Origin regression. No game, credentials, DB or tunnel. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, Log, LogLevel } from 'miniflare';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hostname = 'qfrontier.example.invalid';
const publicOrigin = `https://${hostname}`;
const source = `export default {async fetch(request) {
  const origin=request.headers.get('origin');
  const url=new URL(request.url);
  const allowed=!origin||origin===url.origin;
  return Response.json({requestUrl:request.url,requestOrigin:url.origin,browserOrigin:origin,host:request.headers.get('host'),allowed},{status:allowed?200:403});
}};`;
const rows = [];
for (const fixed of [false, true]) {
  const runtime = new Miniflare({
    name: `private-pc-origin-${fixed ? 'fixed' : 'before'}`, modules: true, script: source,
    host: '127.0.0.1', port: 0, compatibilityDate: '2026-05-22', cf: false,
    upstream: fixed ? publicOrigin : undefined, log: new Log(LogLevel.NONE),
  });
  try {
    const address = await runtime.ready;
    assert.equal(address.hostname, '127.0.0.1'); assert.equal(address.protocol, 'http:');
    const cases = [
      { name: 'canonical-browser', origin: publicOrigin, expected: fixed ? 200 : 403 },
      { name: 'foreign-browser', origin: 'https://foreign.example', expected: 403 },
      { name: 'wrong-public-scheme', origin: `http://${hostname}`, expected: 403 },
      { name: 'forged-forwarded-headers', origin: 'https://foreign.example', expected: 403, extra: { 'X-Forwarded-Host': hostname, 'X-Forwarded-Proto': 'https' } },
    ];
    for (const item of cases) {
      const response = await fetch(new URL('/api/mvp/quote?isolated-fixture=1', address), { method: 'POST', redirect: 'manual', headers: { Origin: item.origin, ...item.extra }, body: '{}' });
      const result = await response.json();
      assert.equal(response.status, item.expected, `${fixed ? 'fixed' : 'before'} ${item.name}`);
      assert.equal(result.browserOrigin, item.origin, 'The browser Origin must never be rewritten.');
      if (fixed) { assert.equal(result.requestOrigin, publicOrigin); assert.equal(result.host, hostname); }
      rows.push({ fixed, name: item.name, expectedStatus: item.expected, actualStatus: response.status, requestOrigin: result.requestOrigin, browserOriginUnchanged: result.browserOrigin === item.origin, passed: true });
    }
  } finally { await runtime.dispose(); }
}
const report = {
  createdAt: new Date().toISOString(), allPassed: true, cases: rows, loopbackOnly: true,
  gameServerStarted: false, tunnelStarted: false, gameDatabaseAccessed: false, gameCodeModified: false, credentialsUsed: false, remoteWrites: 0,
  fixtureSha256: createHash('sha256').update(source).digest('hex'),
  scope: 'Exercises the same conditional Origin equality as actionRequest using Miniflare real HTTP ingress. This fixture does not replace or bypass JWT authentication, does not exercise the game engine and does not write game data.',
};
await mkdir(path.join(root, 'work', 'private-pc'), { recursive: true });
const output = path.join(root, 'work', 'private-pc', `origin-regression-${Date.now()}.json`);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ allPassed: true, cases: rows.length, report: output, gameDatabaseAccessed: false, tunnelStarted: false }));
