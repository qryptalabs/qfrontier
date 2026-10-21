import test from 'node:test';
import assert from 'node:assert/strict';
// The local launcher is intentionally independent of Worker application code.
import { localConfig, settingsValid } from '../scripts/private-pc-runtime.mjs';

function profile() {
  return { version: 1, hostname: 'pc-private.example.com', accessTeamDomain: 'private-team.cloudflareaccess.com', accessAudience: 'separate-private-app-audience', allowedEmails: ['one@example.com', 'two@example.com'], port: 5180, compatibilityDateOverride: null };
}
const built = { main: 'index.js', compatibility_date: '2026-10-14', compatibility_flags: ['nodejs_compat'], rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }], assets: { run_worker_first: true, binding: 'ASSETS' }, account_id: 'production-account-must-not-copy', services: [{ binding: 'REMOTE', service: 'production' }], vars: { SECRET: 'do-not-copy' }, d1_databases: [{ binding: 'DB', database_id: 'production-database-must-not-copy', remote: true }], routes: ['production.example/*'] };

test('private PC runtime excludes production resources and protects assets before routing', () => {
  const config = localConfig(built, 'D:/workspace/work/private-pc/runtime/release', profile());
  assert.equal(Object.hasOwn(config, 'account_id'), false);
  assert.equal(Object.hasOwn(config, 'routes'), false);
  assert.equal(Object.hasOwn(config, 'services'), false);
  assert.equal(Object.hasOwn(config.vars, 'SECRET'), false);
  assert.equal(config.vars.ACCESS_AUD, profile().accessAudience);
  assert.deepEqual(config.d1_databases, [{ binding: 'DB', database_name: 'qfrontier-private-pc-local', database_id: '8b7617dc-1530-4fc4-91d7-56ac105106bc', remote: false }]);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.dev.ip, '127.0.0.1');
  assert.equal(config.dev.local_protocol, 'http');
  assert.equal(config.dev.host, profile().hostname);
  assert.equal(config.dev.upstream_protocol, 'https');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
});

test('private PC origin is pinned to the configured public HTTPS hostname without adding any origin or auth bypass variable', () => {
  const settings = { ...profile(), hostname: 'qfrontier.example.invalid' };
  const config = localConfig(built, 'D:/release', settings);
  assert.equal(`${config.dev.upstream_protocol}://${config.dev.host}`, 'https://qfrontier.example.invalid');
  assert.equal(config.dev.ip, '127.0.0.1');
  assert.equal(config.dev.local_protocol, 'http');
  assert.deepEqual(Object.keys(config.vars).sort(), ['ACCESS_ALLOWED_EMAILS', 'ACCESS_AUD', 'ACCESS_TEAM_DOMAIN']);
  assert.equal(config.d1_databases[0].remote, false);
});

test('private PC runtime rejects current domain, current audience, empty permissions and malformed configuration', () => {
  assert.equal(settingsValid(profile()).port, 5180);
  assert.throws(() => settingsValid({ ...profile(), hostname: 'qfrontier-preview.example.invalid' }));
  assert.throws(() => settingsValid({ ...profile(), accessAudience: 'REPLACE_WITH_ACCESS_APPLICATION_AUDIENCE' }));
  assert.throws(() => settingsValid({ ...profile(), allowedEmails: [] }));
  assert.throws(() => settingsValid({ ...profile(), accessTeamDomain: 'https://evil.example/keys' }));
  assert.throws(() => settingsValid({ ...profile(), port: 0 }));
  assert.throws(() => localConfig({ ...built, assets: { ...built.assets, run_worker_first: false } }, 'D:/release', profile()));
});

test('private PC compatibility override is explicit and never mutates the original build settings', () => {
  assert.equal(localConfig(built, 'D:/release', profile()).compatibility_date, '2026-10-14');
  assert.equal(localConfig(built, 'D:/release', { ...profile(), compatibilityDateOverride: '2026-05-22' }).compatibility_date, '2026-05-22');
  assert.equal(built.compatibility_date, '2026-10-14');
  assert.equal(built.d1_databases[0].remote, true);
});
