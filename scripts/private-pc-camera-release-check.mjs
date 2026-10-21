/** Read-only post-build gate. Does not build, prepare, activate or open a DB. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = path.join(root, 'work', 'private-pc');
const sha = value => createHash('sha256').update(value).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const slash = value => value.replaceAll('\\', '/');
assert(process.argv.length === 4 && process.argv[2] === '--baseline', 'Usage: node scripts/private-pc-camera-release-check.mjs --baseline work/private-pc/camera-source-baseline-N.json');
const baselinePath = path.resolve(root, process.argv[3]);
assert(path.dirname(baselinePath).toLowerCase() === profile.toLowerCase(), 'Use a provenance report inside the private PC profile.');
const baseline = await json(baselinePath);
assert(baseline.currentDistByteIdenticalToActiveRuntime && baseline.legacyFactoryMatchesExpected && baseline.candidateBackendStillNotActivated && baseline.backendMatchesVerifiedStudySource, 'The baseline provenance audit is not qualified.');
const checksDirectory = path.join(profile, 'cameras-20261017');
const buildRecords = (await readdir(checksDirectory)).filter(name => /^build-\d+\.json$/.test(name)).sort((a, b) => b.localeCompare(a));
assert(buildRecords.length > 0, 'A recorded complete local camera build is required.');
const buildStatusPath = path.join(checksDirectory, buildRecords[0]);
const buildStatus = await json(buildStatusPath);
assert(buildStatus.check === 'build' && buildStatus.finished === true && buildStatus.code === 0 && buildStatus.command?.at(-1) === 'build' && buildStatus.command?.some(value => typeof value === 'string' && value.endsWith('vinext/dist/cli.js')), 'The latest recorded camera build did not finish successfully; partial output cannot be released.');
assert(sha(await readFile(buildStatus.log)) === buildStatus.logSha256, 'The recorded build log checksum changed.');

const allowedChanged = new Set(['app/graphics/habitable-scene.tsx', 'app/habitable-client.tsx', 'lib/graphics/world-terrain-renderer.ts', 'lib/graphics/habitable-district.ts']);
const allowedAdded = new Set(['app/graphics/habitable-scene.css', 'lib/client/district-controls.ts', 'lib/graphics/district-navigation.ts']);
const summary = await json(path.join(root, 'work', 'projection-expiry-final-summary.json'));
const libraryRows = Object.entries(summary.source.snapshots).map(([name, expected]) => ({ path: name, sha256: expected.sha256 }));
const expectedSource = [...libraryRows, ...baseline.nonLibraryBaselineFiles.map(row => ({ path: row.path, sha256: row.expectedSha256 }))];
const protectedManifest = await json(path.join(baseline.activeRuntimeRelease, 'manifest.json'));
const latestExport = await json(path.join(root, baseline.priorExportPackages[0].directory, 'EXPORT-MANIFEST.json'));
for (const expected of [...protectedManifest.protectedSources, ...latestExport.files.filter(row => row.path.startsWith('vendor/'))]) {
  if (!expectedSource.some(row => row.path === expected.path)) expectedSource.push({ path: expected.path, sha256: expected.sha256 });
}
const expectedNames = new Set(expectedSource.map(row => row.path));
const sourceChanges = [];
for (const expected of expectedSource) {
  let current;
  try { current = sha(await readFile(path.join(root, expected.path))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current !== expected.sha256) sourceChanges.push({ path: expected.path, beforeSha256: expected.sha256, afterSha256: current ?? null, allowed: allowedChanged.has(expected.path) });
}
async function list(base, relative = '') {
  const result = [];
  for (const item of (await readdir(path.join(base, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    assert(!item.isSymbolicLink(), 'Linked source/build entries are not allowed.');
    const name = path.join(relative, item.name);
    if (item.isDirectory()) result.push(...await list(base, name)); else if (item.isFile()) result.push(slash(name));
  }
  return result;
}
const sourceAdditions = [];
for (const directory of ['app', 'lib', 'components', 'hooks', 'public', 'db', 'drizzle', 'vendor', 'build']) {
  for (const file of await list(path.join(root, directory))) {
    const relative = `${directory}/${file}`;
    if (!expectedNames.has(relative)) sourceAdditions.push({ path: relative, sha256: sha(await readFile(path.join(root, relative))), allowed: allowedAdded.has(relative) || (directory === 'build' && !relative.endsWith('cloudflare-worker.ts')) });
  }
}
const manifest = await json(path.join(root, 'dist', 'server', '.vite', 'manifest.json'));
const originalManifest = await json(path.join(baseline.activeRuntimeRelease, 'dist', 'server', '.vite', 'manifest.json'));
const backendChunks = [];
for (const name of ['engine', 'http', 'cloudflare-access', 'app/api/mvp/route.ts', 'app/api/mvp/quote/route.ts']) {
  const locate = data => name.startsWith('app/') ? data[name]?.file : Object.values(data).find(row => row.name === name)?.file;
  const currentFile = locate(manifest), originalFile = locate(originalManifest);
  assert(currentFile && originalFile, `Missing backend chunk: ${name}`);
  const currentHash = sha(await readFile(path.join(root, 'dist', 'server', currentFile)));
  const originalHash = sha(await readFile(path.join(baseline.activeRuntimeRelease, 'dist', 'server', originalFile)));
  backendChunks.push({ name, currentFile, originalFile, currentHash, originalHash, byteIdentical: currentHash === originalHash });
}
const compiled = [];
const signatures = { setDistrictCameraMode: false, getDistrictCameraMode: false, setNavigationInput: false, lookDistrict: false, interactDistrict: false, recenterDistrict: false, firstPerson: false, thirdPerson: false };
for (const name of await list(path.join(root, 'dist'))) {
  const bytes = await readFile(path.join(root, 'dist', name)); compiled.push({ path: name, bytes: bytes.byteLength, sha256: sha(bytes) });
  if (name.endsWith('.js')) {
    const text = bytes.toString('utf8');
    for (const key of ['setDistrictCameraMode', 'getDistrictCameraMode', 'setNavigationInput', 'lookDistrict', 'interactDistrict', 'recenterDistrict']) signatures[key] ||= text.includes(key);
    signatures.firstPerson ||= text.includes('first-person'); signatures.thirdPerson ||= text.includes('third-person');
  }
}
const storeSource = await readFile(path.join(root, 'lib', 'mvp', 'store.ts'), 'utf8');
const factoryAt = storeSource.indexOf('export function getMvpStore(');
const factoryExact = factoryAt >= 0 && sha(storeSource.slice(factoryAt)) === baseline.legacyFactorySha256 && storeSource.includes("const REALM_ID = 'frontier-pdf-mvp-v2';");
const settings = await json(path.join(profile, 'settings.json'));
const profileConfig = await json(path.join(profile, 'wrangler.local.json'));
const localProfileUnchanged = settings.hostname === 'qfrontier.example.invalid' && profileConfig.dev.ip === '127.0.0.1' && profileConfig.dev.local_protocol === 'http' && profileConfig.dev.host === settings.hostname && profileConfig.dev.upstream_protocol === 'https' && profileConfig.d1_databases.length === 1 && profileConfig.d1_databases[0].database_id === '8b7617dc-1530-4fc4-91d7-56ac105106bc' && profileConfig.d1_databases[0].remote === false;
const allPassed = sourceChanges.every(row => row.allowed) && sourceAdditions.every(row => row.allowed) && backendChunks.every(row => row.byteIdentical) && Object.values(signatures).every(Boolean) && factoryExact && localProfileUnchanged;
const report = {
  createdAt: new Date().toISOString(), allPassed, approvedToPreparePrivateProfile: allPassed,
  baseline: slash(path.relative(root, baselinePath)), originalRuntimeRelease: baseline.activeRuntimeRelease,
  completeBuild: { status: slash(path.relative(root, buildStatusPath)), code: buildStatus.code, finishedAt: buildStatus.finishedAt, logSha256: buildStatus.logSha256 },
  sourceChanges, sourceAdditions, backendChunks, cameraSignatures: signatures, factoryExact, localProfileUnchanged,
  compiledFiles: compiled.length, compiledBytes: compiled.reduce((total, row) => total + row.bytes, 0),
  buildSha256: sha(JSON.stringify(compiled)), compiled,
  note: 'This gate requires backend chunks to remain byte-identical as well as source hashes. A failure must be reviewed, not waived automatically. The whole Vinext build must be prepared as one coherent client/SSR/manifest unit. No save migration, partitioned-store activation, resource provisioning or original-domain deployment is authorized by this report.',
  buildExecutedByThisScript: false, runtimePrepared: false, servicesRestarted: false, databaseOpened: false, databaseWrites: 0, remoteWrites: 0,
};
const output = path.join(profile, `camera-release-gate-${Date.now()}.json`);
await mkdir(profile, { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ report: output, allPassed, approvedToPreparePrivateProfile: allPassed, backendChunks: backendChunks.map(row => ({ name: row.name, byteIdentical: row.byteIdentical })), sourceChanges: sourceChanges.map(row => ({ path: row.path, allowed: row.allowed })), unexpectedAdditions: sourceAdditions.filter(row => !row.allowed).map(row => row.path), cameraSignatures: signatures, factoryExact, localProfileUnchanged }, null, 2));
if (!allPassed) process.exitCode = 1;
