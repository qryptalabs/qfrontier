import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {setImmediate as yieldImmediate,setTimeout as delay} from 'node:timers/promises';
import { createPartitionedMvpStore } from '../lib/mvp/partitioned-store.ts';
import { createSqliteD1 } from '../tests/support/d1-sqlite.ts';
import {readPartitionedIndexHealth} from './load-test-index-health.mjs';

/** Adapter bridge only. Engine identity is independently pinned by the runner.
 * The partitioned adapter owns request-scoped observed revisions, so each HTTP
 * request gets its own instance. Sharing that cache across requests is invalid.
 * @param {{databasePath?:string,rowLimitBytes?:number,ioLatencyMs?:number,context?:import('node:async_hooks').AsyncLocalStorage<any>,playerReads?:boolean,villageWrites?:boolean,villageReads?:boolean}} [options]
 */
export async function createLoadStore({ databasePath = ':memory:', rowLimitBytes = 2_000_000, ioLatencyMs = 0, context,playerReads=false,villageWrites=false,villageReads=false } = {}) {
  const binding = createSqliteD1({ path: databasePath, rowLimitBytes, ioLatencyMs:0, retainTrace: false });
  binding.afterCall=call=>{const current=context?.getStore();if(!current)return;const counters=current.storeOperations??={read:0,insert:0,cas:0,conflicts:0};counters.sqlCalls=(counters.sqlCalls??0)+1;counters.sqlStatements=(counters.sqlStatements??0)+call.sql.length;counters.maxSqlBatchStatements=Math.max(counters.maxSqlBatchStatements??0,call.sql.length);counters.sqlReturnedRows=(counters.sqlReturnedRows??0)+(call.returnedRows??0);counters.sqlReturnedCellBytes=(counters.sqlReturnedCellBytes??0)+(call.returnedCellBytes??0);};
  binding.sqlite.exec(await readFile(new URL('../drizzle/0000_odd_warlock.sql', import.meta.url), 'utf8'));
  binding.sqlite.exec(await readFile(new URL('../db/partitioned-world.sql', import.meta.url), 'utf8'));
  if(playerReads||villageWrites||villageReads)binding.sqlite.exec(await readFile(new URL('../db/player-read-model.sql',import.meta.url),'utf8'));
  if(villageWrites||villageReads)binding.sqlite.exec(await readFile(new URL('../db/village-writes.sql',import.meta.url),'utf8'));
  if(villageReads)binding.sqlite.exec(await readFile(new URL('../db/bounded-village-reads.sql',import.meta.url),'utf8'));
  let operations,baseline;
  const diagnosticKey=type=>type==='readVillageMaintenance'?'maintenanceFallbackReasons':'villageFallbackReasons';
  const recordFallback=(type,reason)=>{
    const counts=operations[type].fallbackReasons;counts[reason]=(counts[reason]??0)+1;
    const current=context?.getStore();if(current){const diagnostics=current.storeDiagnostics??={},reasons=diagnostics[diagnosticKey(type)]??={};reasons[reason]=(reasons[reason]??0)+1;}
  };
  /** @param {import('../lib/mvp/village-snapshot.ts').VillageReadOutcome} event */
  const onVillageReadOutcome=event=>{
    const type=event.operation==='maintenance'?'readVillageMaintenance':'readVillage';
    if(event.result==='fallback')recordFallback(type,event.reason);else if(event.result==='retry')operations[type].retryOutcomes++;else operations[type].coveredOutcomes++;
  };
  const options = { chunkBytes: 65_536, maxBatchStatements: 40,playerReads,metadataVersioning:playerReads||villageWrites||villageReads,villageWrites:villageWrites||villageReads,villageReads,...(villageReads?{onVillageReadOutcome}:{}) };
  const local = () => createPartitionedMvpStore(binding, options);
  let fallback = local();
  const reset = () => { operations = { read: { calls: 0, wallMs: 0 },readPlayerView:{calls:0,wallMs:0},projectPlayerView:{calls:0,wallMs:0},readVillage:{calls:0,wallMs:0,fallbacks:0,coveredOutcomes:0,retryOutcomes:0,fallbackReasons:{}},readVillageMaintenance:{calls:0,wallMs:0,fallbacks:0,retries:0,coveredOutcomes:0,retryOutcomes:0,fallbackReasons:{}},commitVillageMaintenance:{calls:0,wallMs:0,conflicts:0,committed:0},projectVillageView:{calls:0,wallMs:0},commitVillage:{calls:0,wallMs:0,conflicts:0,committed:0},insert: { calls: 0, wallMs: 0 }, cas: { calls: 0, wallMs: 0, conflicts: 0, committed: 0 },villageCas:{calls:0,wallMs:0,conflicts:0,committed:0} }; baseline = binding.metrics; };
  reset();
  const forRequest = () => { const c = context?.getStore(); if (!c) return fallback; return c.partitionedStore ??= local(); };
  const run = async (type, args) => {
    const current = context?.getStore(); if (current) { current.storeOperations ??= { read: 0, insert: 0, cas: 0, conflicts: 0 }; current.storeOperations[type]=(current.storeOperations[type]??0)+1; }
    const readOutcome=type==='readVillage'||type==='readVillageMaintenance',reasonCount=()=>Object.values(current?current.storeDiagnostics?.[diagnosticKey(type)]??{}:operations[type].fallbackReasons??{}).reduce((sum,value)=>sum+Number(value),0),beforeReasons=readOutcome?reasonCount():0;
    const started = performance.now(); operations[type].calls++;
    try {
      // Same application-operation asynchronous boundary as the legacy runner.
      // Do not rely on the shim's zero-latency batch implementation yielding.
      await(ioLatencyMs>0?delay(ioLatencyMs):yieldImmediate());
      const method=type==='cas'?'compareAndSwap':type==='villageCas'?'compareAndSwapVillage':type;
      const result = await forRequest()[method](...args);
      if (type === 'cas'||type==='villageCas'||type==='commitVillage'||type==='commitVillageMaintenance') { if (result) operations[type].committed++; else { operations[type].conflicts++; if (current) current.storeOperations.conflicts++; } }
      if(type==='readVillage'&&result===null){operations[type].fallbacks++;if(current)current.storeOperations.readVillageFallbacks=(current.storeOperations.readVillageFallbacks??0)+1;}
      if(type==='readVillageMaintenance'&&result===null){operations[type].fallbacks++;if(current)current.storeOperations.maintenanceReadFallbacks=(current.storeOperations.maintenanceReadFallbacks??0)+1;}
      if(type==='readVillageMaintenance'&&result?.kind==='village-maintenance-retry'){operations[type].retries++;if(current)current.storeOperations.maintenanceReadRetries=(current.storeOperations.maintenanceReadRetries??0)+1;}
      if(readOutcome&&result===null&&reasonCount()===beforeReasons)recordFallback(type,'unreported');
      return result;
    } finally { operations[type].wallMs += performance.now() - started; }
  };
  const modulePaths = ['./load-test-partitioned.mjs','./load-test.mjs','./load-test-support.mjs','./load-test-identity.mjs','../lib/mvp/partitioned-store.ts', '../lib/mvp/partitioned-codec.ts','./load-test-request-metrics.mjs','./load-test-index-health.mjs','./load-test-settlement-verifier.mjs', '../tests/support/d1-sqlite.ts', '../db/partitioned-world.sql',...(playerReads||villageWrites||villageReads?['../db/player-read-model.sql']:[]),...(villageWrites||villageReads?['../db/village-writes.sql']:[]),...(villageReads?['../db/bounded-village-reads.sql','../lib/mvp/village-snapshot.ts']:[])];
  const modules = await Promise.all(modulePaths.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex') })));
  const wrapped={read:()=>run('read',[]),insert:world=>run('insert',[world]),compareAndSwap:(revision,world,...contexts)=>run('cas',[revision,world,...contexts])};
  const store=/** @type {import('../lib/mvp/store.ts').MvpStore} */(new Proxy(wrapped,{get(target,key,receiver){if(Reflect.has(target,key))return Reflect.get(target,key,receiver);const instance=forRequest(),value=Reflect.get(instance,key);if(key==='compareAndSwapVillage'&&typeof value==='function')return(...args)=>run('villageCas',args);if(['readPlayerView','projectPlayerView','readVillage','projectVillageView','commitVillage','readVillageMaintenance','commitVillageMaintenance'].includes(String(key))&&typeof value==='function')return(...args)=>run(key,args);return typeof value==='function'?value.bind(instance):value;},has(target,key){return Reflect.has(target,key)||Reflect.has(forRequest(),key);}}));
  return {
    store,
    get metrics() { const value = binding.metrics; return { ...structuredClone(operations), sqlite: Object.fromEntries(Object.entries(value).map(([key, count]) => [key, count - (baseline[key] ?? 0)])) }; },
    adapterInfo: { name: 'partitioned-real-sqlite-d1-shim', options, rowLimitBytes, ioLatencyMs, asynchronousBarrier:'setImmediate before each store operation; optional explicit synthetic latency, same as legacy runner',requestScopedStore: true,requestSqlStatementMetrics:'Completed calls/batches and actual returned rows/UTF-8 cell bytes attributed by AsyncLocalStorage; failed transactional calls are excluded from per-request counts. Returned rows are not SQLite rows visited or hosted D1 billable rows.',fallbackReasonObservation:villageReads?'Optional fixed-enum outcomes; per-request ordinary/maintenance reasons are separate. A null without an outcome is counted explicitly as unreported. Observation executes no SQL.':null,retainTrace:false,modules, scope: 'Real local SQL with transaction batches; D1 latency, network, per-invocation plan quotas and production capacity are not simulated.' },
    async snapshot() { fallback = local(); return fallback.read(); },
    storageShape() { return {...binding.sqlite.prepare('SELECT COUNT(*) AS rows, MAX(length(CAST(body AS BLOB))) AS maxBodyBytes, SUM(length(CAST(body AS BLOB))) AS totalBodyBytes FROM world_partition_parts').get(),indexHealth:villageReads?readPartitionedIndexHealth(binding.sqlite):null}; },
    resetMetrics: reset,
    close() { binding.close(); },
  };
}
