#!/usr/bin/env node
// Local-only launcher. This file deliberately has no deploy, remote or database-import command.
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = path.join(ROOT, 'work', 'private-pc');
const SETTINGS = path.join(PROFILE, 'settings.json');
const ACTIVE = path.join(PROFILE, 'active-runtime.json');
const CONFIG = path.join(PROFILE, 'wrangler.local.json');
const STATE = path.join(PROFILE, 'state');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const LOCAL_DB_NAME = 'qfrontier-private-pc-local';
const LOCAL_DB_ID = '8b7617dc-1530-4fc4-91d7-56ac105106bc';
const criticalFiles = ['wrangler.jsonc', 'build/cloudflare-worker.ts', 'lib/auth/cloudflare-access.ts', 'lib/mvp/store.ts', 'package-lock.json'];
const template = {
  version: 1,
  hostname: 'REPLACE_WITH_NEW_PRIVATE_HOSTNAME',
  accessTeamDomain: 'REPLACE_WITH_ACCESS_TEAM.cloudflareaccess.com',
  accessAudience: 'REPLACE_WITH_NEW_APPLICATION_AUDIENCE',
  allowedEmails: ['tester-1@example.invalid', 'tester-2@example.invalid'],
  port: 5180,
  compatibilityDateOverride: null,
};
function assert(value, message) { if (!value) throw new Error(message); }
const sha = data => createHash('sha256').update(data).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const slash = value => value.replaceAll('\\', '/');
function beneath(base, value) {
  const relative = path.relative(base, value);
  assert(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Path leaves private profile: ${value}`);
  return value;
}
async function exists(file) { try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function filesUnder(base, relative = '') {
  const rows = [];
  for (const entry of (await readdir(path.join(base, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, entry.name);
    assert(!entry.isSymbolicLink(), `Symbolic links are not allowed in a runtime snapshot: ${name}`);
    if (entry.isDirectory()) rows.push(...await filesUnder(base, name));
    else { assert(entry.isFile(), `Unsupported runtime entry: ${name}`); const bytes = await readFile(path.join(base, name)); rows.push({ path: slash(name), bytes: bytes.byteLength, sha256: sha(bytes) }); }
  }
  return rows;
}
async function sources() {
  return Promise.all(criticalFiles.map(async name => ({ path: name, sha256: sha(await readFile(path.join(ROOT, name))) })));
}
export function settingsValid(value) {
  assert(value && value.version === 1, 'settings.json needs version 1.');
  assert(typeof value.hostname === 'string' && /^[a-z0-9](?:[a-z0-9.-]{1,250}[a-z0-9])?$/.test(value.hostname) && value.hostname.includes('.') && !value.hostname.includes('..'), 'Set the new private hostname without a scheme or path.');
  assert(value.hostname !== 'qfrontier-preview.example.invalid', 'The existing test hostname must remain untouched.');
  assert(typeof value.accessTeamDomain === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(value.accessTeamDomain), 'Set the Cloudflare Access team domain.');
  assert(typeof value.accessAudience === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(value.accessAudience) && !value.accessAudience.includes('REPLACE'), 'Set the audience of the NEW Access application.');
  assert(value.accessAudience !== 'REPLACE_WITH_ACCESS_APPLICATION_AUDIENCE', 'Use a separate Access application audience for the PC.');
  assert(Array.isArray(value.allowedEmails) && value.allowedEmails.length > 0 && value.allowedEmails.length <= 20 && value.allowedEmails.every(email => typeof email === 'string' && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)), 'Set a nonempty allowedEmails list.');
  assert(Number.isInteger(value.port) && value.port >= 1024 && value.port <= 65535, 'The loopback port must be an integer from 1024 to 65535.');
  assert(value.compatibilityDateOverride === null || (typeof value.compatibilityDateOverride === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.compatibilityDateOverride)), 'compatibilityDateOverride must be null or YYYY-MM-DD.');
  return value;
}
async function settings() {
  assert(await exists(SETTINGS), `Create ${SETTINGS} using settings.example.json and the NEW private Access application.`);
  return settingsValid(await json(SETTINGS));
}
export function localConfig(built, release, settings) {
  assert(built.main === 'index.js' && built.assets?.run_worker_first === true && built.assets?.binding === 'ASSETS', 'The compiled protected Worker layout is not recognized.');
  const date = settings.compatibilityDateOverride ?? built.compatibility_date;
  return {
    name: 'qfrontier-private-pc-local',
    main: slash(path.join(release, 'dist', 'server', 'index.js')),
    compatibility_date: date,
    compatibility_flags: built.compatibility_flags,
    no_bundle: true,
    rules: built.rules,
    workers_dev: false,
    preview_urls: false,
    assets: { directory: slash(path.join(release, 'dist', 'client')), binding: 'ASSETS', not_found_handling: 'none', html_handling: 'none', run_worker_first: true },
    vars: { ACCESS_TEAM_DOMAIN: settings.accessTeamDomain, ACCESS_AUD: settings.accessAudience, ACCESS_ALLOWED_EMAILS: [...new Set(settings.allowedEmails.map(email => email.trim().toLowerCase()))].join(',') },
    d1_databases: [{ binding: 'DB', database_name: LOCAL_DB_NAME, database_id: LOCAL_DB_ID, remote: false }],
    // Tunnel terminates public HTTPS while the listener stays on HTTP loopback.
    // Pin the URL seen by the Worker to the public origin; retain the browser's
    // Origin header unchanged so the application's existing CSRF check applies.
    dev: { ip: '127.0.0.1', port: settings.port, local_protocol: 'http', host: settings.hostname, upstream_protocol: 'https', generate_types: false },
    observability: { enabled: false },
  };
}
async function prepare() {
  await mkdir(PROFILE, { recursive: true });
  if (!await exists(path.join(PROFILE, 'settings.example.json'))) await writeFile(path.join(PROFILE, 'settings.example.json'), `${JSON.stringify(template, null, 2)}\n`, { flag: 'wx' });
  const profile = await settings();
  const source = path.join(ROOT, 'dist');
  const built = await json(path.join(source, 'server', 'wrangler.json'));
  const before = await filesUnder(source);
  assert(before.some(row => row.path === 'server/index.js') && before.some(row => row.path.startsWith('client/')), 'Run the existing build before preparing the private runtime.');
  const id = `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID().slice(0, 8)}`;
  const release = beneath(PROFILE, path.join(PROFILE, 'runtime', id));
  await mkdir(release, { recursive: true });
  await cp(source, path.join(release, 'dist'), { recursive: true, force: false, errorOnExist: true });
  const copied = await filesUnder(path.join(release, 'dist'));
  const after = await filesUnder(source);
  assert(JSON.stringify(before) === JSON.stringify(copied) && JSON.stringify(before) === JSON.stringify(after), 'The build changed while being copied; nothing was activated.');
  const config = localConfig(built, release, profile);
  const metadata = {
    version: 1, preparedAt: new Date().toISOString(), release: slash(release), sourceBuild: slash(source),
    buildSha256: sha(JSON.stringify(before)), files: before, protectedSources: await sources(),
    sourceCompatibilityDate: built.compatibility_date, effectiveCompatibilityDate: config.compatibility_date,
    localCompatibilityOverride: profile.compatibilityDateOverride !== null,
    exactProductionCompatibilityQualified: false,
    publicOrigin: `https://${profile.hostname}`,
    settingsSha256: sha(JSON.stringify(profile)), configSha256: sha(`${JSON.stringify(config, null, 2)}\n`),
    database: { binding: 'DB', name: LOCAL_DB_NAME, id: LOCAL_DB_ID, localOnly: true, persistence: slash(STATE) },
    preservedProduction: true, databaseImported: false, serverStarted: false,
  };
  await writeFile(path.join(release, 'manifest.json'), `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
  await writeFile(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(ACTIVE, `${JSON.stringify({ version: 1, release: slash(release), manifest: slash(path.join(release, 'manifest.json')) }, null, 2)}\n`);
  console.log(JSON.stringify({ prepared: true, hostname: profile.hostname, localOrigin: `http://127.0.0.1:${profile.port}`, config: slash(CONFIG), persistence: slash(STATE), localDatabase: LOCAL_DB_NAME, compatibilityDate: config.compatibility_date, localCompatibilityOverride: metadata.localCompatibilityOverride, databaseImported: false, serverStarted: false }, null, 2));
}
async function check() {
  const profile = await settings();
  const active = await json(ACTIVE);
  const release = beneath(path.join(PROFILE, 'runtime'), path.resolve(active.release));
  const canonical = await realpath(release);
  assert(path.resolve(canonical).toLowerCase() === release.toLowerCase(), 'Runtime release cannot be a symlink or junction.');
  const metadata = await json(path.join(release, 'manifest.json'));
  const configBytes = await readFile(CONFIG);
  const config = JSON.parse(configBytes);
  assert(metadata.settingsSha256 === sha(JSON.stringify(profile)), 'Settings changed; run prepare again before starting.');
  assert(metadata.configSha256 === sha(configBytes), 'The generated local config changed; run prepare again.');
  assert(JSON.stringify(await sources()) === JSON.stringify(metadata.protectedSources), 'A protected application source changed after preparation; review it and prepare again.');
  const files = await filesUnder(path.join(release, 'dist'));
  assert(sha(JSON.stringify(files)) === metadata.buildSha256 && JSON.stringify(files) === JSON.stringify(metadata.files), 'The immutable runtime build was modified.');
  const expected = localConfig(await json(path.join(release, 'dist', 'server', 'wrangler.json')), release, profile);
  assert(JSON.stringify(config) === JSON.stringify(expected), 'Unexpected local configuration or remote binding.');
  for (const name of ['.dev.vars', '.env', '.env.local']) assert(!await exists(path.join(PROFILE, name)), `Remove unexpected local environment override ${name}; configure Access only in settings.json.`);
  assert(await exists(WRANGLER), 'The pinned project Wrangler is missing.');
  return { ok: true, hostname: profile.hostname, publicOrigin: `https://${profile.hostname}`, localOrigin: `http://127.0.0.1:${profile.port}`, config: slash(CONFIG), persistence: slash(STATE), localDatabase: LOCAL_DB_NAME, release: slash(release), buildFiles: files.length, buildSha256: metadata.buildSha256, sourceCompatibilityDate: metadata.sourceCompatibilityDate, effectiveCompatibilityDate: metadata.effectiveCompatibilityDate, localCompatibilityOverride: metadata.localCompatibilityOverride, exactProductionCompatibilityQualified: false, remoteBindings: false, loopbackOnly: true, preservedProduction: true };
}
async function run() {
  const verified = await check();
  const profile = await settings();
  await mkdir(STATE, { recursive: true });
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (/^(CLOUDFLARE_(API|ACCOUNT)|CF_API_|WRANGLER_API_)/.test(name)) delete environment[name];
  Object.assign(environment, { WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false', WRANGLER_LOG_PATH: path.join(PROFILE, 'wrangler-logs'), WRANGLER_REGISTRY_PATH: path.join(PROFILE, 'dev-registry'), MINIFLARE_REGISTRY_PATH: path.join(PROFILE, 'registry') });
  console.log(JSON.stringify({ event: 'private_pc_local_start', ...verified }));
  const child = spawn(process.execPath, [WRANGLER, 'dev', '--config', CONFIG, '--local', '--persist-to', STATE, '--ip', '127.0.0.1', '--port', String(profile.port), '--local-upstream', profile.hostname, '--upstream-protocol', 'https', '--inspector-ip', '127.0.0.1', '--inspector-port', '0', '--live-reload', 'false', '--show-interactive-dev-session', 'false'], { cwd: PROFILE, env: environment, stdio: 'inherit', windowsHide: true });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!child.killed) child.kill(signal); });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
async function main() {
const command = process.argv[2] ?? 'help';
try {
  assert(process.argv.length <= 3, 'No extra arguments accepted; configure the isolated profile in settings.json.');
  if (command === 'prepare') await prepare();
  else if (command === 'check') console.log(JSON.stringify(await check(), null, 2));
  else if (command === 'run') await run();
  else {
    assert(command === 'help', 'Supported commands: prepare, check, run.');
    console.log('node scripts/private-pc-runtime.mjs prepare|check|run\nProfile: work/private-pc/settings.json\nprepare copies an existing compiled build; check starts nothing; run binds loopback only.\nThere are no deploy, database import or remote-resource commands.');
  }
} catch (error) { console.error(`Private PC runtime: ${error.message}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) await main();
