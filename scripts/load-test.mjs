import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createLoadStore, DEFAULT_ROW_LIMIT_BYTES, summary, seededSchedule, assertScenarioIntegrity, assertLoadWorldIdentifiers } from './load-test-support.mjs';
import {inspectLoadEngine} from './load-test-identity.mjs';
import {summarizeStoreRequests} from './load-test-request-metrics.mjs';
import {readSettlementWithProgress} from './load-test-settlement-verifier.mjs';

const argumentsMap = new Map();
for (let i = 2; i < process.argv.length; i++) { const key = process.argv[i]; if (!key.startsWith('--')) throw new Error(`Unexpected argument ${key}`); argumentsMap.set(key.slice(2), process.argv[++i]); }
const option = (key, fallback) => argumentsMap.get(key) ?? fallback;
const numberOption = (key, fallback, min, max) => { const value = Number(option(key, fallback)); if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid --${key}`); return value; };
const source = resolve(option('source', '../qa-baselines/scalability-source'));
const out = resolve(option('out', 'work/scalability-load-baseline.json'));
try{await access(out);throw new Error(`Report already exists: ${out}. Choose a new --out; previous measurements are never overwritten.`);}catch(error){if(error.code!=='ENOENT')throw error;}
const config = {
  users: numberOption('users', 100, 5, 3000), seconds: numberOption('seconds', 60, 1, 60),
  seed: option('seed', 'scalability-ae6a8054-v1'), clockRate: numberOption('clock-rate', 1, .01, 60),
  ioLatencyMs: numberOption('io-latency-ms', 0, 0, 1000), rowLimitBytes: numberOption('row-limit-bytes', DEFAULT_ROW_LIMIT_BYTES, 1, DEFAULT_ROW_LIMIT_BYTES),
  profileEvery: numberOption('profile-every', 1, 1, 3000), buildEvery: numberOption('build-every', 5, 1, 3000),
  requestTimeoutMs: numberOption('request-timeout-ms', 30000, 1000, 60000), reviewMs: numberOption('review-ms', 750, 0, 10000),
  baseNow: Date.parse(option('now', '2026-10-17T12:30:00Z')),
};
for (const key of ['users', 'profileEvery', 'buildEvery', 'rowLimitBytes']) if (!Number.isSafeInteger(config[key])) throw new Error(`Expected integer --${key}`);
if (!Number.isSafeInteger(config.baseNow)) throw new Error('Invalid --now');
const identity=await inspectLoadEngine({source,metadataPath:resolve(option('baseline-metadata','scripts/load-test-baseline.json')),mode:option('engine-mode','baseline'),label:option('engine-label')});
const engine = await import(pathToFileURL(join(source, 'lib/mvp/engine.ts')).href);
const { RECIPE_CATALOG } = await import(pathToFileURL(join(source, 'lib/mvp/catalog.ts')).href);
const context = new AsyncLocalStorage();
const factory = argumentsMap.has('adapter') ? (await import(pathToFileURL(resolve(option('adapter'))).href)).createLoadStore : createLoadStore;
const playerReads=option('player-reads','false')==='true';
const villageWrites=option('village-writes','false')==='true';
const villageReads=option('village-reads','false')==='true';
const assertGranular=option('assert-granular','false')==='true';
const assertMaintenance=option('assert-maintenance','false')==='true';
const bundle = await factory({ databasePath: option('database', ':memory:'), rowLimitBytes: config.rowLimitBytes, ioLatencyMs: config.ioLatencyMs, context,playerReads,villageWrites,villageReads });
assert.ok(bundle.store && bundle.snapshot && bundle.close, 'Adapter must expose store, snapshot and close.');
assert.equal(await bundle.snapshot(),null,'Load tests require an empty local database. Existing realms are never reset.');
const rawStore = bundle.store, journal = [], committed = new Set();
let phase = 'setup', fixedClock = config.baseNow, clockStart = performance.now(), realClock = false;
const now = () => realClock ? fixedClock + Math.floor((performance.now() - clockStart) * config.clockRate) : fixedClock;
const pin = at => { fixedClock = at; realClock = false; };
const startClock = () => { clockStart = performance.now(); realClock = true; };
const instrumentedCas=async(revision,world,...options)=>{
    const saved = await rawStore.compareAndSwap(revision, world,...options), c = context.getStore();
    if (saved && c?.requestId) { const key = `${c.ownerId}:${c.requestId}`; if (world.receipts[key] && !committed.has(key)) { committed.add(key); journal.push({ ownerId: c.ownerId, requestId: c.requestId, command: structuredClone(c.command), now: c.now }); } }
    return saved;
  };
const instrumentedVillageCas=async(record,world,...options)=>{
    const saved=await rawStore.compareAndSwapVillage(record,world,...options),c=context.getStore();
    if(saved&&c?.requestId){const key=`${c.ownerId}:${c.requestId}`;if(saved.world.receipts[key]&&!committed.has(key)){committed.add(key);journal.push({ownerId:c.ownerId,requestId:c.requestId,command:structuredClone(c.command),now:c.now});}}
    return saved;
  };
const instrumentedVillageCommit=async(snapshot,state,...options)=>{
    const saved=await rawStore.commitVillage(snapshot,state,...options),c=context.getStore();
    // A covered snapshot contains this exact receipt; observing it must never
    // introduce a global read after each scoped commit merely for the journal.
    if(saved&&c?.requestId){const key=`${c.ownerId}:${c.requestId}`;if(saved.state.receipts[key]&&!committed.has(key)){committed.add(key);journal.push({ownerId:c.ownerId,requestId:c.requestId,command:structuredClone(c.command),now:c.now});}}
    return saved;
  };
// Preserve future scoped read/version capabilities. A three-method wrapper
// would silently force a new engine back onto the legacy global read path.
const store=new Proxy(rawStore,{get(target,key,receiver){if(key==='compareAndSwap')return instrumentedCas;if(key==='compareAndSwapVillage'&&typeof target[key]==='function')return instrumentedVillageCas;if(key==='commitVillage'&&typeof target[key]==='function')return instrumentedVillageCommit;const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;}});
const serverMetrics = [], clientMetrics = [], completionLags = [], firstObserved = new Set(), dropped = new Set();
let serverActive = 0, serverPeak = 0, clientActive = 0, clientPeak = 0;
const serverTasks=new Set();
const server = createServer((req, res) => {
  serverActive++; serverPeak = Math.max(serverPeak, serverActive);
  const started = performance.now(), requestPhase = phase;
  const task=(async () => {
    let endpoint = 'unknown', status = 500, requestBytes = 0, responseBytes = 0;
    const c = { endpoint, ownerId: String(req.headers['x-load-owner'] ?? ''), now: now() };
    try {
      const url = new URL(req.url, 'http://127.0.0.1'); endpoint = url.pathname; c.endpoint = endpoint;
      assert.ok(c.ownerId.startsWith('synthetic-load-'), 'Only synthetic local owners allowed.');
      let body; if (req.method === 'POST') { const buffers = []; for await (const chunk of req) { requestBytes += chunk.length; if (requestBytes > 16000) throw Object.assign(new Error('Request too large'), { status: 413 }); buffers.push(chunk); } body = JSON.parse(Buffer.concat(buffers).toString('utf8')); c.requestId = body.requestId; c.command = body.command; }
      await context.run(c, async () => {
        let value;
        if (req.method === 'GET' && endpoint === '/view') value = { view: await engine.readMvpView(store, c.ownerId, url.searchParams.get('playerId') ?? undefined, c.now) };
        else if (req.method === 'POST' && endpoint === '/quote') value = { quote: await engine.quoteMvp(store, c.ownerId, body.command, body.requestId, c.now) };
        else if (req.method === 'POST' && endpoint === '/command') {
          let authorization;
          if (body.command.type !== 'player.create') authorization=await engine.validateMvpQuote(store, c.ownerId, body.command, body.requestId, body.expectedRevision, body.quoteToken, body.quoteExpiresAt, c.now);
          value = { view: await engine.executeMvp(store, c.ownerId, body.command, body.requestId, body.expectedRevision, c.now,authorization) };
        } else throw Object.assign(new Error('Not found'), { status: 404 });
        const serialized = JSON.stringify(value); status = 200; responseBytes = Buffer.byteLength(serialized);
        // Simulate a lost ACK only after commit. Its retry must reuse the same ID.
        if (req.headers['x-load-drop-response'] === 'once' && !dropped.has(c.requestId)) { dropped.add(c.requestId); res.destroy(); return; }
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(serialized);
      });
    } catch (error) {
      status = typeof error.status === 'number' ? error.status : 500;
      const serialized = JSON.stringify({ error: error.message, ...(error.code ? { code: error.code } : {}) }); responseBytes = Buffer.byteLength(serialized);
      if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(serialized); }
    } finally {
      serverMetrics.push({ phase: requestPhase, endpoint, status, ms: performance.now() - started, requestBytes, responseBytes, storeOperations: c.storeOperations ?? null,storeDiagnostics:c.storeDiagnostics??null }); serverActive--;
    }
  })();
  serverTasks.add(task);void task.finally(()=>serverTasks.delete(task));
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
async function request(actor, endpoint, body, { drop = false } = {}) {
  const started = performance.now(), requestPhase = phase; clientActive++; clientPeak = Math.max(clientPeak, clientActive);
  const requestBody=body?JSON.stringify(body):undefined;
  let status = 0, bytes = 0, value, failure,failureCode;
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, { method: body ? 'POST' : 'GET', headers: { 'x-load-owner': actor.ownerId, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(drop ? { 'x-load-drop-response': 'once' } : {}) }, ...(body ? { body:requestBody } : {}), signal: AbortSignal.timeout(config.requestTimeoutMs) });
    status = response.status; const text = await response.text(); bytes = Buffer.byteLength(text); value = JSON.parse(text);
    if (value.view) { actor.view = value.view; for (const job of value.view.jobs.filter(j => j.playerId === actor.id && j.status === 'completed')) if (!firstObserved.has(job.id)) { firstObserved.add(job.id); completionLags.push({ phase: requestPhase, kind: job.kind, ms: Math.max(0, value.view.now - job.endsAt) }); } }
    return { status, ...value,localEndpoint:endpoint.split('?')[0] };
  } catch (error) { failure = error.name;failureCode=error.cause?.code??error.name;return { status: 0,localEndpoint:endpoint.split('?')[0],error: `${error.name}: ${error.message}`, ...(error.cause?.code ? { transportCode: error.cause.code } : {}) }; }
  finally { clientMetrics.push({ phase: requestPhase, endpoint: endpoint.split('?')[0], status, bytes,requestBytes:requestBody?Buffer.byteLength(requestBody):0, ms: performance.now() - started, ...(failure ? { failure,failureCode,censoredTimeout:failure==='TimeoutError'||failure==='AbortError' } : {}) }); clientActive--; }
}
const read = actor => request(actor, `/view?playerId=${actor.id}`);
const commandBody = (command, requestId, quote) => ({ command, requestId, ...(quote ? { expectedRevision: quote.revision, quoteToken: quote.token, quoteExpiresAt: quote.expiresAt } : {}) });
async function quoted(actor, command, { review = 0, retryStale = 0, drop = false } = {}) {
  const requestId = randomUUID(); command = { ...command, ...(actor.id ? { playerId: actor.id } : {}) };
  for (let attempt = 0; attempt <= retryStale; attempt++) {
    const preview = await request(actor, '/quote', { command, requestId }); if (preview.status !== 200) return preview;
    if (review) await delay(review);
    const body = commandBody(command, requestId, preview.quote), result = await request(actor, '/command', body, { drop });
    if (result.status === 0) return request(actor, '/command', body); // unknown outcome: exact same receipt, never a new ID
    if (result.status !== 409 || !/mundo cambió|cotización venció|(?:tu aldea|los recursos de esta orden).*cambi|cotización con la versión actual/i.test(result.error ?? '') || attempt === retryStale) return result;
  }
}
const must = result => {try{assert.equal(result.status,200,`${result.status}: ${result.error}`);}catch(error){Object.assign(error,{loadPhase:phase,loadEndpoint:result.localEndpoint??null,serverActiveAtFailure:serverActive});throw error;}return result;};
const actors = [], setupStarted = performance.now();
let setupError = null, report, before, journalStart = 0;
function groupMetrics(records) {
  const groups = {};
  for (const record of records) {
    const key=record.endpoint,group=groups[key]??={records:[],statuses:{},samplesByStatus:{},failures:{},censoredTimeouts:0,requestBodyBytes:0,responseBodyBytes:0,reads:0,playerViewReads:0,playerViewProjections:0,villageReads:0,villageReadFallbacks:0,villageViewProjections:0,maintenanceReads:0,maintenanceReadFallbacks:0,maintenanceReadRetries:0,maintenanceCommits:0,cas:0,villageCas:0,villageCommits:0,sqlCalls:0,sqlStatements:0,sqlReturnedRows:0,sqlReturnedCellBytes:0,maxSqlStatementsPerRequest:0,maxSqlBatchStatements:0,conflicts:0};
    group.records.push(record.ms);(group.samplesByStatus[record.status]??=[]).push(record.ms);group.statuses[record.status]=(group.statuses[record.status]??0)+1;
    if(record.failureCode)group.failures[record.failureCode]=(group.failures[record.failureCode]??0)+1;if(record.censoredTimeout)group.censoredTimeouts++;
    group.requestBodyBytes+=record.requestBytes??0;group.responseBodyBytes+=record.responseBytes??record.bytes??0;
    for(const [field,operation] of Object.entries({reads:'read',playerViewReads:'readPlayerView',playerViewProjections:'projectPlayerView',villageReads:'readVillage',villageReadFallbacks:'readVillageFallbacks',villageViewProjections:'projectVillageView',maintenanceReads:'readVillageMaintenance',maintenanceReadFallbacks:'maintenanceReadFallbacks',maintenanceReadRetries:'maintenanceReadRetries',maintenanceCommits:'commitVillageMaintenance',cas:'cas',villageCas:'villageCas',villageCommits:'commitVillage',sqlCalls:'sqlCalls',sqlStatements:'sqlStatements',sqlReturnedRows:'sqlReturnedRows',sqlReturnedCellBytes:'sqlReturnedCellBytes',conflicts:'conflicts'}))group[field]+=record.storeOperations?.[operation]??0;
    group.maxSqlStatementsPerRequest=Math.max(group.maxSqlStatementsPerRequest,record.storeOperations?.sqlStatements??0);group.maxSqlBatchStatements=Math.max(group.maxSqlBatchStatements,record.storeOperations?.maxSqlBatchStatements??0);
  }
  return Object.fromEntries(Object.entries(groups).map(([key, value]) => { const { records: latencies,samplesByStatus, ...rest } = value; return [key, { ...rest, status409Rate: (value.statuses[409] ?? 0) / latencies.length, latencyMs: summary(latencies),latencyByStatusMs:Object.fromEntries(Object.entries(samplesByStatus).map(([status,values])=>[status,summary(values)])),storeRequests:summarizeStoreRequests(records.filter(record=>record.endpoint===key)),extraReadsAboveEndpointMinimum: value.reads ? Math.max(0, value.reads - latencies.length * (key === '/view' ? 1 : 2)) : 0 }]; }));
}
const dbMetrics = () => structuredClone(bundle.metrics ?? {});
const timedPhase = async (name, task) => {
  phase = name; const cpu = process.cpuUsage(), started = performance.now(), lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable(); const serverStart = serverMetrics.length, clientStart = clientMetrics.length; bundle.resetMetrics?.(); serverPeak = serverActive; clientPeak = clientActive;
  const memory = { samplingIntervalMs: 10000, samples: 0, peakRssBytes: 0, peakHeapUsedBytes: 0, peakExternalBytes: 0 }, sample = () => { const usage = process.memoryUsage(); memory.samples++; memory.peakRssBytes = Math.max(memory.peakRssBytes, usage.rss); memory.peakHeapUsedBytes = Math.max(memory.peakHeapUsedBytes, usage.heapUsed); memory.peakExternalBytes = Math.max(memory.peakExternalBytes, usage.external); }; sample(); const memoryTimer = setInterval(sample, 10000);
  let result; try { result = await task(); } finally { sample(); clearInterval(memoryTimer); lag.disable(); }
  const elapsedMs = performance.now() - started, usage = process.cpuUsage(cpu);
  return { ...result, elapsedMs, memory, processCpuMs: { user: usage.user / 1000, system: usage.system / 1000, total: (usage.user + usage.system) / 1000 }, eventLoopDelayMs: { p50: lag.percentile(50) / 1e6, p95: lag.percentile(95) / 1e6, p99: lag.percentile(99) / 1e6, max: lag.max / 1e6 }, server: groupMetrics(serverMetrics.slice(serverStart)), client: groupMetrics(clientMetrics.slice(clientStart)), database: dbMetrics(), peakServerInFlight: serverPeak, peakClientInFlight: clientPeak, requestsPerSecond: (clientMetrics.length - clientStart) / (elapsedMs / 1000) };
};
try {
  for (let i = 0; i < config.users; i++) {
    const actor = { ownerId: `synthetic-load-${String(i).padStart(5, '0')}`, index: i, role: ['village', 'farmer', 'crafter', 'explorer', 'traveler'][i % 5], view: null };
    const created = must(await request(actor, '/command', { command: { type: 'player.create', name: `Carga ${i}`, stationName: `Aldea ${i}`, faction: ['cartographers', 'forgers', 'custodians'][i % 3] }, requestId: randomUUID() })); actor.id = created.view.player.id; actors.push(actor);
    if (i % config.profileEvery === 0) must(await quoted(actor, { type: 'habitat.profile', appearance: 'pine', profession: 'carrier' }));
    if (i % config.buildEvery === 0 && actor.view.player.habitable) must(await quoted(actor, { type: 'habitat.build', templateId: 'shed', x: 7, y: 3, rotation: 0 }));
    if ((i + 1) % 10 === 0) process.stdout.write(`${JSON.stringify({ phase: 'setup', usersCreated: i + 1, stateBytes: Buffer.byteLength(JSON.stringify((await bundle.snapshot()).world)) })}\n`);
  }
} catch (error) { setupError = { message:error.message,usersCreated:actors.length,rowLimitRejections:bundle.metrics?.rowLimitRejections??null,phase:error.loadPhase??phase,endpoint:error.loadEndpoint??null,serverActive:error.serverActiveAtFailure??serverActive,stack:typeof error.stack==='string'?error.stack:null }; }
const setupElapsedMs = performance.now() - setupStarted;
try {
  before = (await bundle.snapshot())?.world; journalStart = journal.length;
  if (!before) throw new Error(`Setup produced no realm: ${setupError?.message ?? 'unknown failure'}`);
  report = { formatVersion: 5, createdAt: new Date().toISOString(), release:identity.engineIdentity.mode==='candidate'?`unpublished:${identity.engineIdentity.label}`:identity.metadata.deployedVersion,engineIdentity:identity.engineIdentity,source,sourceLibSha256:identity.sourceLibSha256,config, adapter: bundle.adapterInfo, environment: { node: process.version, platform: process.platform, architecture: process.arch }, scope: 'Local single-process Node HTTP + SQLite semantic baseline. Synthetic authentication; no Cloudflare/Access/network/production capacity certification. No latency is inferred for hosted D1.',metricDefinitions:{requestScopedProjections:'storeRequests counts only observed store projectPlayerView/projectVillageView calls per request, not all internal visual functions. Histograms/max/repeat counts come from real request contexts. Missing observations stay null. Maintenance reads and commits and optional fixed-enum fallback reasons are separate; measuring them adds no SQL or application calls.',sqlReturnedData:'Completed SQL result rows and cell bytes. Text is counted in UTF-8, binary by byte length, other SQL scalar cells as 8 bytes using the existing shim. Includes SELECT and RETURNING results, excludes failed calls. Does not measure rows visited or hosted D1 billing.',responseBodyBytes:'Exact UTF-8 generated JSON bodies on server; received JSON bodies on client. Lost-ACK generated bytes were not delivered. Excludes HTTP/TLS headers and compression.',wallMs:'Summed overlapping store waits are not CPU nor additive elapsed time.',cpu:'Whole benchmark process, including HTTP generator, application, instrumentation and SQLite.',memory:'Sampled at phase start/end and every10s; may miss brief peaks. Baseline formatVersion1 did not measure memory nor latency split bystatus.',databaseQueryCounts:'Server endpoint groups count completed SQL calls/batches and their statements per HTTP request context, including projection and retries; failed transactional calls do not reach the afterCall attribution hook; a 40-statement batch does not imply 40 total statements per invocation. Plan-specific Cloudflare quotas are not simulated.',timeouts:'status0 retains transport failures; only AbortError/TimeoutError count as censored timeouts. No latency percentile is extrapolated beyond a timeout.'}, clock: 'Explicit engine timestamp; fixed during setup/burst/races, wall-scaled only during mixed segment. Security randomness is untouched.', setup: { elapsedMs: setupElapsedMs, usersCreated: actors.length, error: setupError, stateBytes: Buffer.byteLength(JSON.stringify(before)), database: dbMetrics() }, phases: {}, integrity: null };
  report.storeCapabilities={requestedPlayerReads:playerReads,requestedVillageWrites:villageWrites,requestedVillageReads:villageReads,entityVersions:store.capabilities?.entityVersions??false,playerReads:store.capabilities?.playerReads??false,villageWrites:store.capabilities?.villageWrites??false,villageReads:store.capabilities?.villageReads??false,readPlayerView:typeof store.readPlayerView==='function',projectPlayerView:typeof store.projectPlayerView==='function',compareAndSwapVillage:typeof store.compareAndSwapVillage==='function',readVillage:typeof store.readVillage==='function',projectVillageView:typeof store.projectVillageView==='function',commitVillage:typeof store.commitVillage==='function',readVillageMaintenance:typeof store.readVillageMaintenance==='function',commitVillageMaintenance:typeof store.commitVillageMaintenance==='function',operationReadScope:villageReads?'Covered village snapshots are requested. Actual scoped calls, explicit null fallbacks and legacy full reads are counted separately; SQL returned rows/bytes are measured, not inferred from this capability.':'Full world read remains required for a cold command/quote; village writes do not imply scoped operation reads.'};
  report.additionalAssertions={granularIndependentConfirmations:assertGranular,scopedMaintenanceCapabilities:assertMaintenance};
  if(playerReads)assert.ok(report.storeCapabilities.readPlayerView&&report.storeCapabilities.projectPlayerView,'Requested scoped reads were hidden or are unavailable.');
  if(assertMaintenance)assert.ok(report.storeCapabilities.readVillageMaintenance&&report.storeCapabilities.commitVillageMaintenance,'Requested scoped maintenance capabilities were hidden or are unavailable.');
  if(villageWrites)assert.ok(report.storeCapabilities.villageWrites&&report.storeCapabilities.compareAndSwapVillage,'Requested per-village writes were hidden or are unavailable.');
  if(villageReads)assert.ok(report.storeCapabilities.villageReads&&report.storeCapabilities.readVillage&&report.storeCapabilities.projectVillageView&&report.storeCapabilities.commitVillage,'Requested covered village reads/commits were hidden or are unavailable.');
  if (setupError) throw new Error('Setup did not create the requested legal population; inspect setup.error. No row limit was bypassed.');
  report.phases.readBurst = await timedPhase('read-burst', async () => { const results = await Promise.all(actors.map(read)); return { users: actors.length, ok: results.filter(r => r.status === 200).length, errors: results.filter(r => r.status !== 200).length }; });
  const scheduleRandom = seededSchedule(config.seed), runStarted = performance.now(); startClock();
  report.phases.mixed = await timedPhase('mixed', async () => {
    let issuedPolls = 0, issuedActions = 0, schedulingLag = [], decisions = 0;
    const stopAt = runStarted + config.seconds * 1000;
    const progress = setInterval(() => process.stdout.write(`${JSON.stringify({ phase: 'mixed', elapsedSeconds: Math.round((performance.now() - runStarted) / 1000), issuedPolls, issuedActions, requestsCompleted: clientMetrics.filter(r => r.phase === 'mixed').length, casConflicts: bundle.metrics?.cas?.conflicts ?? null })}\n`), 10000);
    try {
      await Promise.all(actors.map(async actor => {
        const random = seededSchedule(`${config.seed}:${actor.index}`), cadence = actor.index % 5 === 0 ? 3500 : 12000;
        let nextPoll = runStarted + scheduleRandom() * cadence, nextAction = runStarted + 2000 + random() * 10000;
        while (performance.now() < stopAt) {
          const next = Math.min(nextPoll, nextAction); if (next > performance.now()) await delay(Math.min(next - performance.now(), Math.max(0, stopAt - performance.now())));
          if (performance.now() >= stopAt) break;
          schedulingLag.push(Math.max(0, performance.now() - next));
          if (nextPoll <= nextAction) { issuedPolls++; await read(actor); nextPoll = performance.now() + cadence; continue; }
          const view = actor.view, p = view.player, jobs = view.jobs.filter(j => j.playerId === actor.id && ['running', 'reserved'].includes(j.status)); let command;
          const stock = id => p.inventory.filter(l => l.itemId === id && (!l.expiresAt || l.expiresAt > view.now)).reduce((n, l) => n + l.qty, 0);
          if (actor.role === 'explorer' && view.firstTrade.canAct) command = view.firstTrade.command;
          else if (actor.role === 'farmer' && p.farmCycles < 2 && !jobs.some(j => j.kind === 'farm') && stock('seed') && stock('nutrient') && stock('water') >= 2) command = { type: 'farm.start' };
          else if (actor.role === 'crafter' || actor.role === 'farmer') { const id = actor.role === 'farmer' ? 'ration' : random() < .5 ? 'cloth' : 'plank'; const recipe = RECIPE_CATALOG[id]; if (recipe.inputs.every(c => stock(c.itemId) >= c.qty)) command = { type: 'craft.start', recipeId: id, qty: 1 }; }
          else if (actor.role === 'village' && p.habitable && !p.habitable.movement) command = { type: 'habitat.walk', x: 0, y: Math.abs(p.habitable.position.y - 1.5) < .1 ? 2.5 : 1.5 };
          else if (actor.role === 'traveler' && !jobs.some(j => j.kind === 'travel')) { const tileId = p.position === 't_4_4' ? 't_4_5' : 't_4_4'; command = !p.surveyed.includes(tileId) ? { type: 'world.survey', tileId } : { type: 'world.travel', tileId }; }
          decisions++; if (command) { issuedActions++; await quoted(actor, command, { review: config.reviewMs + Math.floor(random() * config.reviewMs), retryStale: 1 }); } else { issuedPolls++; await read(actor); }
          nextAction = performance.now() + 8000 + random() * 8000;
        }
      }));
    } finally { clearInterval(progress); }
    pin(now()); return { configuredWindowMs: config.seconds * 1000, users: actors.length, pollCadenceMs: { roam: 3500, other: 12000 }, roamUsers: actors.filter(a => a.index % 5 === 0).length, thinkingMs: '8,000–16,000 after action, seeded per actor; review before confirmation separately configured', issuedPolls, issuedActions, decisions, schedulingLagMs: summary(schedulingLag), closedLoop: true, description: 'One outstanding request per actor. Slow responses reduce achieved rate; no claim of an open-loop fixed request rate.' };
  });
  report.phases.races = await timedPhase('integrity-races', async () => {
    const racer = actors.find(a => a.role === 'traveler'), checks = [],settlementPasses=[],settlementAttempts=[],racesStarted=performance.now();
    report.settlementVerification={scope:'Verification only after the comparable window. All original HTTP statuses remain in integrity-races metrics. Only the exact shared-maintenance budget503 can retry, and only after a proven strict reduction of overdue shared leases at the same pinned time.',requestAttempts:settlementAttempts,passes:settlementPasses};
    const checked=message=>{checks.push(message);process.stdout.write(`${JSON.stringify({phase:'integrity-races',completedChecks:checks.length,check:message,elapsedSeconds:Math.round((performance.now()-racesStarted)/1000)})}\n`);};
    const settle = async () => {
      const snapshot = await bundle.snapshot(), ends = Object.values(snapshot.world.jobs).filter(j => ['running', 'reserved'].includes(j.status)).map(j => j.endsAt);
      pin(Math.max(now(), ...ends) + 1);
      const budget={used:0,limit:actors.length*2+10},at=now(),world=async()=>{const snapshot=await bundle.snapshot();assert.ok(snapshot);return snapshot.world;},observations=[];
      const verifiedRead=(actor,beforeWorld,role)=>readSettlementWithProgress({actor,read,world,beforeWorld,at,budget,observations,role});
      try{must(await verifiedRead(racer,snapshot.world,'racer'));}finally{settlementAttempts.push(...observations.map(entry=>({...entry,pass:settlementPasses.length+1})));observations.length=0;}
      if(!villageWrites&&!villageReads)return;
      // Verification only, outside the comparable mixed window. A shared lease
      // may already have triggered safe global maintenance during the first read.
      // Recompute the real due-owner closure instead of polling 100 empty villages.
      const polled=[racer.id];
      for(;;){
        const current=await bundle.snapshot(),overdue=Object.values(current.world.jobs).filter(job=>['running','reserved'].includes(job.status)&&job.endsAt<=now());
        if(!overdue.length){settlementPasses.push({pass:settlementPasses.length+1,ownerPolls:polled.length,httpReadAttempts:budget.used,readBudget:budget.limit,retriedBudget503:settlementAttempts.filter(entry=>entry.pass===settlementPasses.length+1&&entry.retried).length,distinctOwners:new Set(polled).size,overdueJobsRemaining:0});process.stdout.write(`${JSON.stringify({phase:'integrity-races',settlementPass:settlementPasses.length,ownerPolls:polled.length,httpReadAttempts:budget.used,distinctOwners:new Set(polled).size,overdueJobsRemaining:0,elapsedSeconds:Math.round((performance.now()-racesStarted)/1000)})}\n`);break;}
        const actor=actors.find(actor=>actor.id===overdue[0].playerId);assert.ok(actor,'Every due test job must belong to an actual test actor.');
        try{must(await verifiedRead(actor,current.world,'due-owner'));}finally{settlementAttempts.push(...observations.map(entry=>({...entry,pass:settlementPasses.length+1})));observations.length=0;}polled.push(actor.id);
        if(polled.length%20===0)process.stdout.write(`${JSON.stringify({phase:'integrity-races',settlementPass:settlementPasses.length+1,ownerPolls:polled.length,distinctOwners:new Set(polled).size,overdueJobsBeforeLastRead:overdue.length,elapsedSeconds:Math.round((performance.now()-racesStarted)/1000)})}\n`);
      }
    };
    await settle();
    const duplicate = async (command, drop = false) => {
      const requestId = randomUUID(), full = { ...command, playerId: racer.id }, q = must(await request(racer, '/quote', { command: full, requestId })).quote, body = commandBody(full, requestId, q), initial = await bundle.snapshot();
      let results; if (drop) { const lost = await request(racer, '/command', body, { drop: true }); assert.equal(lost.status, 0); results = [await request(racer, '/command', body)]; } else results = await Promise.all([request(racer, '/command', body), request(racer, '/command', body)]);
      for (const result of results) must(result);
      const final = await bundle.snapshot(); assert.equal(Object.keys(final.world.receipts).length, Object.keys(initial.world.receipts).length + 1); assert.equal(Object.keys(final.world.jobs).length, Object.keys(initial.world.jobs).length + 1);
      assert.equal(final.world.players[racer.id].inventory.filter(l => l.itemId === 'timber').reduce((n, l) => n + l.qty, 0), initial.world.players[racer.id].inventory.filter(l => l.itemId === 'timber').reduce((n, l) => n + l.qty, 0) - 2);
    };
    await duplicate({ type: 'craft.start', recipeId: 'plank', qty: 1 }); checked('concurrent identical confirmation reserves two timber once');
    await duplicate({ type: 'craft.start', recipeId: 'plank', qty: 1 }, true); checked('lost acknowledgement replays original receipt without another debit');
    await settle();
    if (racer.view.player.position !== 't_4_4') { must(await quoted(racer, { type: 'world.travel', tileId: 't_4_4' })); await settle(); }
    if (!racer.view.player.surveyed.includes('t_4_3')) { must(await quoted(racer, { type: 'world.survey', tileId: 't_4_3' })); await settle(); }
    if (racer.view.player.position !== 't_4_3') { must(await quoted(racer, { type: 'world.travel', tileId: 't_4_3' })); await settle(); }
    const initial = await bundle.snapshot(), layer = initial.world.tiles.t_4_3.deposits.find(d => d.itemId === 'timber').layers[0];
    must(await quoted(racer, { type: 'mining.reserve', tileId: 't_4_3', itemId: 'timber', qty: 2 }));
    const extraction = racer.view.jobs.filter(j => j.playerId === racer.id && j.kind === 'extract').at(-1), cancelCommand = { type: 'job.cancel', playerId: racer.id, jobId: extraction.id };
    const prepared = await Promise.all([0, 1].map(async () => { const id = randomUUID(), q = must(await request(racer, '/quote', { command: cancelCommand, requestId: id })).quote; return commandBody(cancelCommand, id, q); }));
    const cancellations = await Promise.all(prepared.map(body => request(racer, '/command', body))); assert.equal(cancellations.filter(r => r.status === 200).length, 1); assert.equal(cancellations.filter(r => r.status === 409).length, 1);
    const cancelled = await bundle.snapshot(), finalLayer = cancelled.world.tiles.t_4_3.deposits.find(d => d.itemId === 'timber').layers[0]; assert.equal(finalLayer.reserved, layer.reserved); assert.equal(finalLayer.remaining, layer.remaining); checked('two cancellation commands release a finite reservation once');
    must(await quoted(racer, { type: 'mining.reserve', tileId: 't_4_3', itemId: 'timber', qty: 2 })); await settle(); must(await quoted(racer, { type: 'craft.start', recipeId: 'plank', qty: 1, transferableOnly: true })); await settle();
    const sale = { type: 'npc.sell', playerId: racer.id, itemId: 'plank', qty: 1 }, offers = await Promise.all([0, 1].map(async () => { const id = randomUUID(), q = must(await request(racer, '/quote', { command: sale, requestId: id })).quote; return commandBody(sale, id, q); })), old = await bundle.snapshot();
    const sold = await Promise.all(offers.map(body => request(racer, '/command', body))); assert.equal(sold.filter(r => r.status === 200).length, 1); assert.equal(sold.filter(r => r.status === 409).length, 1);
    must(await request(racer, '/command', offers[sold.findIndex(r => r.status === 200)])); const end = await bundle.snapshot(); assert.equal(end.world.social.accounts[racer.id].credits, old.world.social.accounts[racer.id].credits + 6); assert.equal(end.world.social.npc.remaining, old.world.social.npc.remaining - 6); checked('two sales competing for one natural plank pay once, including receipt replay');
    if(assertGranular){
      await settle();
      const initial=await bundle.snapshot(),timber=p=>p.inventory.filter(l=>l.itemId==='timber'&&(!l.expiresAt||l.expiresAt>now())).reduce((n,l)=>n+l.qty,0),independent=actors.filter(a=>timber(initial.world.players[a.id])>=2).sort((a,b)=>(a.role==='village'?-1:0)-(b.role==='village'?-1:0)).slice(0,2);
      assert.equal(independent.length,2,'Granular confirmation check requires two real actors with plank inputs.');
      const prepared=await Promise.all(independent.map(async actor=>{const command={type:'craft.start',playerId:actor.id,recipeId:'plank',qty:1},requestId=randomUUID(),q=must(await request(actor,'/quote',{command,requestId})).quote;return{actor,body:commandBody(command,requestId,q)};}));
      const baseline=await bundle.snapshot(),results=await Promise.all(prepared.map(({actor,body})=>request(actor,'/command',body)));
      results.forEach(must);
      const after=await bundle.snapshot();
      for(const {actor,body} of prepared){assert.equal(timber(after.world.players[actor.id]),timber(baseline.world.players[actor.id])-2);assert.equal(Object.values(after.world.jobs).filter(j=>j.playerId===actor.id).length,Object.values(baseline.world.jobs).filter(j=>j.playerId===actor.id).length+1);assert.ok(after.world.receipts[`${actor.ownerId}:${body.requestId}`]);}
      for(const {actor,body} of prepared)must(await request(actor,'/command',body));
      assert.deepEqual((await bundle.snapshot()).world,after.world,'Replaying both granular confirmations must not change the saved world.');
      checked('two separately quoted independent players both confirm, debit once and replay exactly despite concurrent global commits');
    }
    return { checks, granularAssertionsEnabled:assertGranular,clockFastForwarded: true,settlementPasses,raceSettlementStrategy:villageWrites||villageReads?'Poll racer, recompute actual due owners and poll their remaining closure until none remain. The precise maintenance-budget503 retries only with strict lease progress, fixed time and the same total HTTP-read budget; all statuses remain recorded.':'One reader uses the legacy global settlement path.',performanceComparableToMixed: false };
  });
  phase = 'final'; const final = await bundle.snapshot(); report.integrity = { passed: true, checks: assertScenarioIntegrity(before, final.world, journal.slice(journalStart), RECIPE_CATALOG),identifierChecks:assertLoadWorldIdentifiers(final.world), finalRevision: final.revision, players: Object.keys(final.world.players).length, jobs: Object.keys(final.world.jobs).length, receipts: Object.keys(final.world.receipts).length, stateBytes: Buffer.byteLength(JSON.stringify(final.world)), completionObservationLagMs: summary(completionLags.filter(l => l.phase === 'mixed').map(l => l.ms)), completionObservationByKind: Object.fromEntries([...new Set(completionLags.map(l => l.kind))].map(kind => [kind, summary(completionLags.filter(l => l.phase === 'mixed' && l.kind === kind).map(l => l.ms))])) };
} catch (error) { report ??= { config, setup: { error: setupError } }; report.failure = { name:error.name,message:error.message,phase:error.loadPhase??setupError?.phase??phase,endpoint:error.loadEndpoint??setupError?.endpoint??null,serverActive:error.serverActiveAtFailure??setupError?.serverActive??serverActive,stack:setupError?.stack??(typeof error.stack==='string'?error.stack:null) }; process.exitCode = 1; }
finally {
  report.formatVersion=6;
  const drainStarted = performance.now(); while (serverActive && performance.now() - drainStarted < 60000) await delay(25);
  report.serverDrainMs = performance.now() - drainStarted; report.remainingServerRequests = serverActive;
  await new Promise(close => server.close(close));
  report.postCloseServerRequests=serverActive;
  const handlerDrainStarted=performance.now();await Promise.allSettled([...serverTasks]);
  report.handlerDrainAfterCloseMs=performance.now()-handlerDrainStarted;report.postHandlerDrainServerRequests=serverActive;
  assert.equal(serverActive,0,'All handlers must finish before taking a final snapshot or closing the local database.');
  report.serverCompletionTotals={requests:serverMetrics.length,committedJournalEntries:journal.length,committedAfterSetup:Math.max(0,journal.length-journalStart),phaseCutoffMetricsIncludeLateCompletions:false};
  // Observe storage only after every timed window and all server handlers. No
  // diagnostic query changes a traffic phase, repairs data or grants authority.
  try{
    report.storageShape=await bundle.storageShape?.();
    if(report.metricDefinitions)report.metricDefinitions.indexHealth='Read-only cardinality, hash and revision/token equality diagnostics after all workload phases and server handlers drain. No repair, record bodies or IDs. Separate from economic conservation and excluded from timed phase metrics.';
    report.indexIntegrity={required:villageReads,observedAfterHandlerDrain:true,passed:villageReads?report.storageShape?.indexHealth?.indexHealthy===true:null};
    if(villageReads)assert.equal(report.indexIntegrity.passed,true,'The final village index must be healthy; economic conservation alone cannot approve an unusable read index.');
  }catch(error){
    report.indexIntegrity={required:villageReads,observedAfterHandlerDrain:true,passed:false,error:error.message};
    report.failure??={name:error.name,message:error.message,phase:'post-drain-index-health',endpoint:null,serverActive};process.exitCode=1;
  }
  if(report.failure&&before&&!report.integrity){
    try{
      const settled=await bundle.snapshot();assert.ok(settled);
      report.postDrainReconciliation={passed:true,checks:assertScenarioIntegrity(before,settled.world,journal.slice(journalStart),RECIPE_CATALOG),identifierChecks:assertLoadWorldIdentifiers(settled.world),finalRevision:settled.revision,players:Object.keys(settled.world.players).length,jobs:Object.keys(settled.world.jobs).length,receipts:Object.keys(settled.world.receipts).length,scope:'Supplementary reconciliation after all server handlers complete. The timed workload or race suite still failed; this does not approve the benchmark or certify capacity.'};
    }catch(error){report.postDrainReconciliation={passed:false,error:error.message,scope:'Supplementary only. Main benchmark remains failed.'};}
  }
  report.benchmarkPassed=!report.failure&&report.integrity?.passed===true&&(!villageReads||report.indexIntegrity?.passed===true);
  await bundle.close(); await mkdir(dirname(out), { recursive: true }); await writeFile(out, `${JSON.stringify(report, null, 2)}\n`,{flag:'wx'});
  process.stdout.write(`${JSON.stringify({ report: out, users: actors.length, integrity: report.integrity?.passed ?? false, failure: report.failure ?? null })}\n`);
}
