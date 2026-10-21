/** Read-only, offline save verification for the private PC test server.
 * This script never contacts Cloudflare or imports into a persistent database.
 * SQL input is evaluated only in an isolated in-memory SQLite database.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const REALM = 'frontier-pdf-mvp-v2';
const sha = value => createHash('sha256').update(value).digest('hex');
const quote = value => `"${value.replaceAll('"', '""')}"`;
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value instanceof Uint8Array) return JSON.stringify({ sqliteBlob: Buffer.from(value).toString('base64') });
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function argsOf(values) {
  const options = {};
  for (let i = 0; i < values.length; i += 2) {
    assert.ok(/^--(?:source|target|out)$/.test(values[i] ?? ''), 'Use --source, optional --target, and --out only.');
    const key = values[i].slice(2);
    assert.ok(values[i + 1] && !values[i + 1].startsWith('--') && !Object.hasOwn(options, key), `Invalid or duplicate --${key}.`);
    options[key] = resolve(values[i + 1]);
  }
  assert.ok(options.source && options.out, 'Usage: node scripts/private-pc-preservation.mjs --source BACKUP.sql [--target LOCAL.sqlite] --out REPORT.json');
  assert.notEqual(options.out, options.source, 'Report cannot overwrite the source.');
  assert.notEqual(options.out, options.target, 'Report cannot overwrite the target.');
  return options;
}
async function openInput(path) {
  const info = await stat(path);
  assert.ok(info.isFile(), 'Input must be an existing regular file.');
  if (extname(path).toLowerCase() !== '.sql') {
    const db = new DatabaseSync(path, { readOnly: true });
    db.exec('PRAGMA query_only=ON');
    return { db, kind: 'sqlite-read-only', bytes: info.size };
  }
  const data = await readFile(path), text = data.toString('utf8');
  // An export may contain pragmas and transactions; it may never attach a file,
  // invoke an extension, or use functions capable of writing to the host PC.
  assert.ok(!/\b(?:ATTACH|DETACH|VACUUM|load_extension|writefile|readfile|writable_schema)\b|CREATE\s+VIRTUAL\s+TABLE/i.test(text), 'Input is not a safe ordinary D1 SQL export.');
  const db = new DatabaseSync(':memory:');
  try { db.exec(text); db.exec('PRAGMA query_only=ON'); }
  catch (error) { db.close(); throw error; }
  return { db, kind: 'sql-in-memory-only', bytes: data.byteLength, exportSha256: sha(data) };
}
function collection(value, name) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `Save collection ${name} is missing or invalid.`);
  return { count: Object.keys(value).length, sha256: sha(canonical(value)) };
}
function describe(input) {
  const integrity = input.db.prepare('PRAGMA quick_check').all();
  assert.deepEqual(integrity.map(row => Object.values(row)[0]), ['ok'], 'SQLite quick_check failed.');
  const row = input.db.prepare('SELECT id, revision, state, updated_at FROM world_state WHERE id=?').get(REALM);
  assert.ok(row && Number.isSafeInteger(row.revision) && row.revision >= 0 && typeof row.state === 'string', 'The original authoritative realm/revision is missing.');
  const world = JSON.parse(row.state);
  assert.equal(world.schemaVersion, 2, 'Unexpected save schema; do not seed or reinterpret the save.');
  const players = collection(world.players, 'players'), jobs = collection(world.jobs, 'jobs'), receipts = collection(world.receipts, 'receipts');
  const owners = [...new Set(Object.values(world.players).map(player => player.ownerId))].sort();
  assert.ok(owners.every(owner => typeof owner === 'string' && owner.length > 0), 'A saved profile lacks its stable owner ID.');
  const tableNames = input.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(entry => entry.name);
  const tables = Object.fromEntries(tableNames.map(name => {
    const rows = input.db.prepare(`SELECT * FROM ${quote(name)}`).all().map(canonical).sort();
    return [name, { count: rows.length, sha256: sha(canonical(rows)) }];
  }));
  return {
    kind: input.kind, bytes: input.bytes, ...(input.exportSha256 ? { exportSha256: input.exportSha256 } : {}),
    quickCheck: 'ok', realm: row.id, revision: row.revision, updatedAt: row.updated_at,
    stateBytes: Buffer.byteLength(row.state), stateSha256: sha(row.state), semanticSha256: sha(canonical(world)),
    players, jobs, receipts, ownerCount: owners.length, ownerIdsSha256: sha(canonical(owners)),
    identityTypeCounts: {
      cloudflareAccessSubject: owners.filter(owner => owner.startsWith('cf-access:')).length,
      other: owners.filter(owner => !owner.startsWith('cf-access:')).length,
    },
    tables,
  };
}

const options = argsOf(process.argv.slice(2));
let sourceInput, targetInput;
try {
  sourceInput = await openInput(options.source);
  const source = describe(sourceInput);
  const report = {
    createdAt: new Date().toISOString(), localOnly: true, remoteConnections: 0, persistentWrites: 0,
    sourcePath: options.source, source,
    checks: { sourceQuickCheck: true, authorityRealmPresent: true, validSchema: true },
    note: 'Offline verification only. A historical export does not establish the latest live progress. Owner identities must remain unchanged; a matching email alone does not prove an Access subject matches.',
  };
  if (options.target) {
    targetInput = await openInput(options.target);
    const target = describe(targetInput);
    report.targetPath = options.target;
    report.target = target;
    const checks = {
      targetQuickCheck: true,
      sameRevision: source.revision === target.revision,
      exactSavedJson: source.stateSha256 === target.stateSha256,
      sameSemanticWorld: source.semanticSha256 === target.semanticSha256,
      sameUpdatedAt: source.updatedAt === target.updatedAt,
      sameOwners: source.ownerIdsSha256 === target.ownerIdsSha256,
      sameProfiles: canonical(source.players) === canonical(target.players),
      sameJobs: canonical(source.jobs) === canonical(target.jobs),
      sameReceipts: canonical(source.receipts) === canonical(target.receipts),
      allSourceTablesExact: Object.entries(source.tables).every(([name, value]) => canonical(value) === canonical(target.tables[name])),
    };
    Object.assign(report.checks, checks);
    report.extraTargetTables = Object.keys(target.tables).filter(name => !Object.hasOwn(source.tables, name));
  }
  report.allPassed = Object.values(report.checks).every(value => value === true);
  await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ report: options.out, allPassed: report.allPassed, revision: source.revision, players: source.players.count, jobs: source.jobs.count, receipts: source.receipts.count, stateSha256: source.stateSha256, checkedTarget: Boolean(options.target), remoteConnections: 0, persistentDatabaseWrites: 0 }));
  if (!report.allPassed) process.exitCode = 1;
} finally {
  targetInput?.db.close(); sourceInput?.db.close();
}
