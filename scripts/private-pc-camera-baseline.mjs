/** Read-only source/build provenance for a camera-only private PC release.
 * Creates an evidence report only. Never builds, starts, stops, deploys or opens a DB.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const slash = value => value.replaceAll('\\', '/');
async function fingerprint(relative) {
  try { const bytes = await readFile(path.join(root, relative)); return { path: slash(relative), bytes: bytes.byteLength, sha256: sha(bytes) }; }
  catch (error) { if (error.code === 'ENOENT') return { path: slash(relative), missing: true }; throw error; }
}
async function list(base, relative = '') {
  const result = [];
  for (const item of (await readdir(path.join(base, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, item.name); assert(!item.isSymbolicLink(), `Refusing linked source: ${name}`);
    if (item.isDirectory()) result.push(...await list(base, name)); else if (item.isFile()) result.push(slash(name));
  }
  return result;
}
const summary = await json(path.join(root, 'work', 'projection-expiry-final-summary.json'));
const freeze = await json(path.join(root, 'work', 'projection-expiry-before-freeze.json'));
const active = await json(path.join(root, 'work', 'private-pc', 'active-runtime.json'));
const activeManifest = await json(path.join(active.release, 'manifest.json'));
const sourceSnapshots = summary.source.snapshots;
const backend = [];
for (const [name, expected] of Object.entries(sourceSnapshots).filter(([name]) => name.startsWith('lib/') && !name.startsWith('lib/graphics/'))) {
  const actual = await fingerprint(name); backend.push({ ...actual, expectedSha256: expected.sha256, matched: actual.sha256 === expected.sha256 });
}
const backendNames = new Set(backend.map(row => row.path));
const unknownBackendFiles = (await list(path.join(root, 'lib'))).map(name => `lib/${name}`).filter(name => !name.startsWith('lib/graphics/') && !backendNames.has(name));
const allowedNewClientFiles = ['lib/client/district-controls.ts'];
const unexpectedBackendFiles = unknownBackendFiles.filter(name => !allowedNewClientFiles.includes(name));
const appAndConfig = [];
for (const expected of freeze.files.filter(row => /^(?:app|components|hooks|public|db|drizzle|vendor|build)\//.test(row.path) || /^(?:package(?:-lock)?\.json|vite\.config\.ts|wrangler\.jsonc|tsconfig\.json|next\.config\.ts|postcss\.config\.mjs|cloudflare-env\.d\.ts)$/.test(row.path))) {
  const actual = await fingerprint(expected.path); appAndConfig.push({ ...actual, expectedSha256: expected.sha256, matched: actual.sha256 === expected.sha256 });
}
const compiled = [];
for (const expected of activeManifest.files) {
  const relative = `dist/${expected.path}`; const actual = await fingerprint(relative);
  const copied = await readFile(path.join(active.release, relative));
  compiled.push({ path: relative, sourceSha256: actual.sha256, runtimeSha256: sha(copied), expectedSha256: expected.sha256, matched: actual.sha256 === expected.sha256 && sha(copied) === expected.sha256 });
}
const packages = [];
for (const entry of (await readdir(path.join(root, 'outputs'), { withFileTypes: true })).filter(item => item.isDirectory() && /^package-\d+$/.test(item.name)).sort((a, b) => b.name.localeCompare(a.name))) {
  const packageRoot = path.join(root, 'outputs', entry.name, 'qfrontier-cloudflare');
  const manifest = await json(path.join(packageRoot, 'EXPORT-MANIFEST.json'));
  const packageBuild = manifest.files.filter(file => file.path.startsWith('dist/'));
  const currentBuildByPath = new Map(compiled.map(row => [row.path, row.expectedSha256]));
  const buildDifferences = packageBuild.filter(file => currentBuildByPath.get(file.path) !== file.sha256).map(file => file.path);
  const missingFromPackage = compiled.filter(row => !packageBuild.some(file => file.path === row.path)).map(row => row.path);
  packages.push({ directory: slash(path.relative(root, packageRoot)), exportedAtUtc: new Date(Number(entry.name.slice(8))).toISOString(), buildFiles: packageBuild.length, matchedFiles: packageBuild.length - buildDifferences.length, differingOrOldFiles: buildDifferences, missingCurrentFiles: missingFromPackage, exactCurrentBuild: buildDifferences.length === 0 && missingFromPackage.length === 0 && packageBuild.length === compiled.length });
}
const latest = await json(path.join(root, packages[0].directory, 'EXPORT-MANIFEST.json'));
const latestBackendDifferences = [];
for (const expected of latest.files.filter(row => row.path.startsWith('lib/mvp/') || row.path.startsWith('lib/auth/') || row.path.startsWith('app/api/') || row.path === 'app/game-page.tsx')) {
  const actual = await fingerprint(expected.path); if (actual.sha256 !== expected.sha256) latestBackendDifferences.push({ path: expected.path, packageSha256: expected.sha256, currentSha256: actual.sha256 });
}
const storeBytes = await readFile(path.join(root, 'lib', 'mvp', 'store.ts'), 'utf8');
const factoryAt = storeBytes.indexOf('export function getMvpStore(');
assert(factoryAt >= 0, 'The legacy factory must be present.');
const factory = storeBytes.slice(factoryAt);
const factorySha256 = sha(factory);
const engine = await readFile(path.join(root, 'dist', 'server', '_next', 'static', 'engine-OBJ97AsA.js'), 'utf8');
const publicEntries = ['app/api/mvp/route.ts', 'app/api/mvp/quote/route.ts', 'app/game-page.tsx'];
const activation = await Promise.all(publicEntries.map(async name => { const source = await readFile(path.join(root, name), 'utf8'); return { path: name, callsLegacyFactory: source.includes('getMvpStore('), importsPartitionedStore: /(?:from|import\()[^\n]*partitioned-store/.test(source) }; }));
const report = {
  createdAt: new Date().toISOString(), operation: 'Read-only camera release provenance audit', buildExecuted: false, serverRestarted: false, databaseOpened: false, databaseWrites: 0, remoteWrites: 0,
  activeRuntimeRelease: active.release, activeRuntimeBuildSha256: activeManifest.buildSha256, activeRuntimeBuildFiles: compiled.length,
  currentDistByteIdenticalToActiveRuntime: compiled.every(row => row.matched), compiled,
  backendMatchesVerifiedStudySource: backend.every(row => row.matched) && unexpectedBackendFiles.length === 0, backend, unknownBackendFiles, allowedNewClientFiles, unexpectedBackendFiles,
  legacyFactorySha256: factorySha256, legacyFactoryMatchesExpected: factorySha256 === '0b712695de5cf610b8bd8309aa5582423fc8be1800904a9f50cc4403de901deb',
  publicEntryPoints: activation, candidateBackendStillNotActivated: activation.every(row => row.callsLegacyFactory && !row.importsPartitionedStore),
  activeBaseAlreadyContainsCandidateCapableEngine: engine.includes('readVillageMaintenance') && engine.includes('Hay reservas compartidas terminando'),
  provenance: { buildStatus: 'work/projection-expiry-build-1792279037048-status.json', builtAtUtc: '2026-10-17T23:17:24.991Z', sourceStudy: 'work/projection-expiry-final-summary.json', sourceFreeze: 'work/projection-expiry-before-freeze.json' },
  priorExportPackages: packages, latestExportBackendDifferences: latestBackendDifferences,
  nonLibraryBaselineFiles: appAndConfig, nonLibraryBaselineDifferences: appAndConfig.filter(row => !row.matched),
  recommendation: 'Use one complete Vinext build from the current source after camera changes are frozen, gated on unchanged non-graphics backend/auth/API/config source hashes and the original legacy factory. Preserve the active immutable runtime as rollback. Do not combine old SSR/client chunks or overlay the older export source. Compare the new server engine/HTTP/API chunks against this baseline after building; explain any dependency-driven chunk drift before activation. Local prepare must sanitize the generated build config into the canonical HTTPS-origin loopback profile with the existing local DB ID and state directory. No migrations or partitioned-store activation.',
  exactOriginalDeployedSourceClaimed: false,
};
const output = path.join(root, 'work', 'private-pc', `camera-source-baseline-${Date.now()}.json`);
await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ report: output, activeBuild: activeManifest.buildSha256, compiledFiles: compiled.length, currentDistByteIdentical: report.currentDistByteIdenticalToActiveRuntime, backendFiles: backend.length, backendMatched: backend.filter(row => row.matched).length, unknownBackendFiles, factoryExact: report.legacyFactoryMatchesExpected, candidateBackendInactive: report.candidateBackendStillNotActivated, activeBaseAlreadyContainsCandidateCapableEngine: report.activeBaseAlreadyContainsCandidateCapableEngine, oldPackages: packages.map(row => ({ directory: row.directory, exactCurrentBuild: row.exactCurrentBuild, matchedFiles: row.matchedFiles, buildFiles: row.buildFiles })), latestExportBackendDifferences: latestBackendDifferences.map(row => row.path), nonLibraryDifferences: report.nonLibraryBaselineDifferences.map(row => row.path), buildExecuted: false, databaseOpened: false }, null, 2));
