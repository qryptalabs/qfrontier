/** Manual, coherent online backups of the isolated PC save. No remote access.
 * Run: node scripts/private-pc-backup.mjs
 * Never copies a live .sqlite file with filesystem copy: SQLite's backup API
 * includes committed WAL contents in one pinned read transaction instead.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, lstat, open } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as sqlite from 'node:sqlite';

const REPOSITORY = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PROFILE = join(REPOSITORY, 'work', 'private-pc');
const DATABASE_ID = '8b7617dc-1530-4fc4-91d7-56ac105106bc';
const DATABASE_NAME = 'qfrontier-private-pc-local';
const DATABASE_FILE = 'b1d06bf10e4ebb26476b6dde2cfa6cd82134b1129a654e7c74bcbb604a3a15cd.sqlite';
const REALM = 'frontier-pdf-mvp-v2';
const sha = value => createHash('sha256').update(value).digest('hex');
const quoted = name => `"${name.replaceAll('"', '""')}"`;
function canonical(value) {
  if (typeof value === 'bigint') return JSON.stringify({ sqliteInteger: value.toString() });
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Uint8Array) return JSON.stringify({ sqliteBlob: Buffer.from(value).toString('base64') });
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function inside(parent, path) {
  const child = relative(parent, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}
async function checkedPath(path, base, kind) {
  const resolved = resolve(path), actual = await realpath(resolved);
  assert.ok(inside(base, resolved) && inside(base, actual), 'Backup path must stay inside the private PC profile.');
  assert.equal(actual.toLowerCase(), resolved.toLowerCase(), 'Symlink and junction targets are not accepted.');
  const info = await lstat(resolved);
  assert.ok(!info.isSymbolicLink() && (kind === 'file' ? info.isFile() : info.isDirectory()), 'Backup path has an unexpected file type.');
  return actual;
}
function tableManifest(db) {
  const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
  return Object.fromEntries(tables.map(({ name, sql }) => {
    const statement = db.prepare(`SELECT * FROM ${quoted(name)}`);
    statement.setReadBigInts(true);
    const rows = [...statement.iterate()].map(canonical).sort();
    return [name, { rows: rows.length, schemaSha256: sha(sql ?? ''), rowsSha256: sha(canonical(rows)) }];
  }));
}
function authority(db) {
  const row = db.prepare('SELECT id, revision, state, updated_at FROM world_state WHERE id=?').get(REALM);
  assert.ok(row && Number.isSafeInteger(row.revision) && row.revision >= 0 && typeof row.state === 'string', 'The original local authoritative save is missing.');
  const world = JSON.parse(row.state);
  assert.equal(world.schemaVersion, 2, 'Unexpected local save schema.');
  for (const name of ['players', 'jobs', 'receipts']) assert.ok(world[name] && typeof world[name] === 'object' && !Array.isArray(world[name]), 'Local save collections are invalid.');
  return {
    revision: row.revision, updatedAt: row.updated_at, stateBytes: Buffer.byteLength(row.state), stateSha256: sha(row.state),
    profiles: Object.keys(world.players).length, jobs: Object.keys(world.jobs).length, receipts: Object.keys(world.receipts).length,
  };
}
function quickCheck(db) {
  assert.deepEqual(db.prepare('PRAGMA quick_check').all().map(row => Object.values(row)[0]), ['ok'], 'Local SQLite integrity check failed.');
}

/** Alternate profiles are accepted only below PROFILE/backup-fixtures for
 * isolated tests. The CLI never accepts a source, destination, or profile path.
 */
export async function backupPrivatePcProfile(profilePath = PROFILE) {
  assert.equal(typeof sqlite.backup, 'function', 'This Node runtime lacks the SQLite online backup API.');
  const base = await checkedPath(PROFILE, REPOSITORY, 'directory');
  const chosen = resolve(profilePath);
  assert.ok(chosen === PROFILE || inside(join(PROFILE, 'backup-fixtures'), chosen), 'Only the private PC profile or an isolated backup fixture may be used.');
  const profile = await checkedPath(chosen, base, 'directory');
  const configPath = await checkedPath(join(profile, 'wrangler.local.json'), profile, 'file');
  const configBytes = await readFile(configPath), config = JSON.parse(configBytes);
  assert.equal(config.name, DATABASE_NAME, 'Unexpected private PC Worker name.');
  assert.equal(config.d1_databases?.length, 1, 'Private PC profile must have exactly one database.');
  assert.deepEqual(config.d1_databases[0], { binding: 'DB', database_name: DATABASE_NAME, database_id: DATABASE_ID, remote: false }, 'The PC database must remain isolated and local.');
  const sourcePath = await checkedPath(join(profile, 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', DATABASE_FILE), profile, 'file');
  const backupsPath = join(profile, 'backups');
  await mkdir(backupsPath, { recursive: true });
  const backups = await checkedPath(backupsPath, profile, 'directory');
  const stem = `local-auto-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  const destination = join(backups, `${stem}.sqlite`), manifest = join(backups, `${stem}.json`);
  // Reserve a fresh file exclusively; the backup API otherwise overwrites paths.
  const reserved = await open(destination, 'wx', 0o600); await reserved.close();
  const db = new sqlite.DatabaseSync(sourcePath, { readOnly: true });
  let transaction = false, target;
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000; BEGIN'); transaction = true;
    const snapshot = authority(db); // Pins the committed snapshot, including WAL.
    quickCheck(db);
    const tables = tableManifest(db);
    await sqlite.backup(db, destination, { source: 'main', target: 'main', rate: 128 });
    target = new sqlite.DatabaseSync(destination, { readOnly: true });
    target.exec('PRAGMA query_only=ON');
    quickCheck(target);
    assert.deepEqual(authority(target), snapshot, 'Backup does not match the pinned authoritative revision.');
    assert.deepEqual(tableManifest(target), tables, 'Backup lost or changed a table, schema, or row.');
    target.close(); target = undefined;
    db.exec('ROLLBACK'); transaction = false;
    assert.equal(sha(await readFile(configPath)), sha(configBytes), 'The private PC profile changed during its backup.');
    const file = await readFile(destination);
    const report = {
      formatVersion: 1, createdAt: new Date().toISOString(), allPassed: true,
      localOnly: true, remoteConnections: 0, remoteWrites: 0,
      method: 'SQLite online backup API from a read-only connection with a pinned read transaction; includes committed WAL state',
      profile, sourcePath, destination, databaseId: DATABASE_ID, realm: REALM,
      configSha256: sha(configBytes), ...snapshot, tables,
      backupBytes: file.byteLength, backupSha256: sha(file),
      checks: { localConfiguration: true, boundedPaths: true, pinnedSnapshot: true, sqliteQuickCheck: true, exactAuthority: true, allTablesAndRows: true, originalDataReadOnly: true, uniqueDestination: true },
      retention: 'No backups removed. PC and hosted game progress remain independent.',
    };
    await writeFile(manifest, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { manifest, destination, allPassed: true, ...snapshot, backupSha256: report.backupSha256, localOnly: true, remoteWrites: 0 };
  } catch (error) {
    // Keep failed output for diagnosis; never delete or replace the source.
    await writeFile(join(backups, `${stem}.failed.json`), `${JSON.stringify({ createdAt: new Date().toISOString(), allPassed: false, localOnly: true, destination, remoteWrites: 0, errorType: error instanceof Error ? error.name : 'UnknownError', sqliteCode: typeof error?.code === 'string' ? error.code : undefined, sourceDataOpenedReadOnly: true }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    throw error;
  } finally {
    target?.close();
    if (transaction) db.exec('ROLLBACK');
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/private-pc-backup.mjs (no path or remote arguments accepted).');
  console.log(JSON.stringify(await backupPrivatePcProfile()));
}
