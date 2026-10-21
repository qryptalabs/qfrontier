import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMvp, readMvpView} from '../lib/mvp/engine.ts';
import {RECIPE_CATALOG} from '../lib/mvp/catalog.ts';
import type {Job} from '../lib/mvp/types.ts';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {createLoadStore, summary, seededSchedule, assertScenarioIntegrity,assertLoadWorldIdentifiers} from '../scripts/load-test-support.mjs';
import {inspectLoadEngine} from '../scripts/load-test-identity.mjs';
import {compareLoadReports} from '../scripts/load-test-compare.mjs';

const NOW=Date.parse('2026-10-17T12:30:00Z');
const owner='synthetic-load-unit';
const create={type:'player.create',name:'Carga local',stationName:'Prueba SQLite',faction:'cartographers'};

test('load SQLite adapter exposes genuine asynchronous revision conflicts without a global application lock',async()=>{
  const b=createLoadStore();
  try{await b.store.insert({value:0});const [a,c]=await Promise.all([b.store.read(),b.store.read()]);assert.equal(a!.revision,c!.revision);const results=await Promise.all([b.store.compareAndSwap(a!.revision,{value:1}),b.store.compareAndSwap(c!.revision,{value:2})]);assert.equal(results.filter(Boolean).length,1);assert.equal(b.metrics.cas.conflicts,1);assert.equal(b.snapshot()!.revision,1);}
  finally{b.close();}
});
test('load row guard counts UTF-8 bytes and rejects oversized writes atomically',async()=>{
  const b=createLoadStore({rowLimitBytes:25});
  try{await b.store.insert({value:'é'});const before=b.snapshot();await assert.rejects(b.store.compareAndSwap(0,{value:'🌱'.repeat(10)}),{code:'LOCAL_ROW_LIMIT'});assert.deepEqual(b.snapshot(),before);assert.equal(b.metrics.rowLimitRejections,1);assert.ok(b.metrics.peakStateBytes>25);}
  finally{b.close();}
});
test('load SQLite adapter preserves the real engine receipt during concurrent duplicate creation and a later replay',async()=>{
  const b=createLoadStore(),id=crypto.randomUUID();
  try{const [a,c]=await Promise.all([executeMvp(b.store,owner,create,id,undefined,NOW),executeMvp(b.store,owner,create,id,undefined,NOW)]);assert.equal(a.player!.id,c.player!.id);assert.equal(Object.keys(b.snapshot()!.world.players).length,1);assert.equal(Object.keys(b.snapshot()!.world.receipts).length,1);const saved=b.snapshot();await executeMvp(b.store,owner,create,id,undefined,NOW);assert.deepEqual(b.snapshot(),saved);assert.equal(a.player!.inventory.reduce((n,l)=>n+l.qty,0),113);}
  finally{b.close();}
});
test('load reconciliation independently detects missing inventory and duplicate paid-sale effects',async()=>{
  const b=createLoadStore();
  try{const created=await executeMvp(b.store,owner,create,crypto.randomUUID(),undefined,NOW),playerId=created.player!.id;await readMvpView(b.store,owner,playerId,NOW);const before=b.snapshot()!.world,requestId=crypto.randomUUID(),command={type:'farm.start',playerId};await executeMvp(b.store,owner,command,requestId,undefined,NOW);const job=Object.values(b.snapshot()!.world.jobs)[0] as Job;await readMvpView(b.store,owner,playerId,job.endsAt);const after=b.snapshot()!.world,journal=[{ownerId:owner,requestId,command,now:NOW}];assert.equal(assertScenarioIntegrity(before,after,journal,RECIPE_CATALOG).length,8);const missing=structuredClone(after);missing.players[playerId].inventory[0].qty--;assert.throws(()=>assertScenarioIntegrity(before,missing,journal,RECIPE_CATALOG));const paid=structuredClone(after);paid.social.accounts[playerId].credits++;assert.throws(()=>assertScenarioIntegrity(before,paid,journal,RECIPE_CATALOG));}
  finally{b.close();}
});
test('load schedules and nearest-rank latency summaries are deterministic without replacing cryptographic randomness',()=>{
  const a=seededSchedule('sample'),b=seededSchedule('sample'),c=seededSchedule('other');const first=Array.from({length:100},()=>a());assert.deepEqual(first,Array.from({length:100},()=>b()));assert.notDeepEqual(first,Array.from({length:100},()=>c()));assert.equal(new Set(first).size,100);assert.deepEqual(summary([1,2,3,4,100]),{count:5,min:1,p50:3,p95:100,p99:100,max:100,mean:22});assert.equal(summary([]).count,0);
});

test('load identifier checks accept namespaced IDs and detect duplicate append entries or invalid legacy counters',async()=>{
  const b=createLoadStore();
  try{
    const created=await executeMvp(b.store,owner,create,crypto.randomUUID(),undefined,NOW),world=b.snapshot()!.world;
    assert.ok(created.player);assert.equal(assertLoadWorldIdentifiers(world).length,3);
    const duplicate=structuredClone(world);assert.ok(duplicate.events.length);duplicate.events.push(structuredClone(duplicate.events[0]));
    assert.throws(()=>assertLoadWorldIdentifiers(duplicate),/events IDs/);
    const corrupt=structuredClone(world);corrupt.counters.job=-1;assert.throws(()=>assertLoadWorldIdentifiers(corrupt),/counter job/);
  }finally{b.close();}
});

test('load source identity requires an explicitly labeled candidate and never rewrites the frozen reference',async()=>{
  const parent=resolve(tmpdir()),directory=await mkdtemp(join(parent,'qfrontier-load-identity-'));
  try{
    await mkdir(join(directory,'lib','mvp'),{recursive:true});
    const enginePath=join(directory,'lib','mvp','engine.ts'),referencePath=join(directory,'reference.json'),original='export const version=1;\n';
    await writeFile(enginePath,original);
    const reference=JSON.stringify({deployedVersion:'frozen-test',sourceFilesAndHashes:[{path:'lib/mvp/engine.ts',sha256:createHash('sha256').update(original).digest('hex')}]});await writeFile(referencePath,reference);
    const baseline=await inspectLoadEngine({source:directory,metadataPath:referencePath});assert.equal(baseline.engineIdentity.referenceFilesMatch,true);
    await writeFile(enginePath,'export const version=2;\n');await writeFile(join(directory,'lib','mvp','new-reader.ts'),'export const scoped=true;\n');
    await assert.rejects(inspectLoadEngine({source:directory,metadataPath:referencePath}),/Immutable source mismatch/);
    await assert.rejects(inspectLoadEngine({source:directory,metadataPath:referencePath,mode:'candidate'}),/engine-label/);
    const candidate=await inspectLoadEngine({source:directory,metadataPath:referencePath,mode:'candidate',label:'player-versions-v2'});
    assert.equal(candidate.engineIdentity.releaseStatus,'unpublished-candidate');assert.equal(candidate.engineIdentity.changes.length,1);assert.equal(candidate.engineIdentity.additionalFiles.length,1);assert.notEqual(candidate.sourceLibSha256,baseline.sourceLibSha256);assert.equal(await readFile(referencePath,'utf8'),reference);
  }finally{
    const target=resolve(directory),child=relative(parent,target);assert.ok(child&&!child.startsWith('..')&&!child.includes(':')&&target.startsWith(join(parent,'qfrontier-load-identity-')),'Temporary cleanup must remain inside the resolved test directory.');await rm(target,{recursive:true,force:true});
  }
});

test('load report comparison distinguishes changed engines, unchanged workloads and missing measurements',()=>{
  const group={statuses:{'200':1},latencyMs:{count:1,p95:1},responseBodyBytes:1,requestBodyBytes:1},report={formatVersion:2,sourceLibSha256:'old-engine',release:'frozen',config:{users:100,seconds:60},setup:{elapsedMs:1,stateBytes:100},phases:{readBurst:{elapsedMs:1,ok:100,client:{'/view':group},server:{'/view':group}},mixed:{configuredWindowMs:60000,elapsedMs:60001,requestsPerSecond:1,client:{'/command':group},server:{'/command':group},database:{read:{calls:1,sqlMs:1},cas:{calls:1,committed:1,conflicts:0,sqlMs:1},insert:{sqlMs:0}}}},integrity:{passed:true,checks:['conservation'],players:100,jobs:1,receipts:1,stateBytes:100}};
  const candidate={...structuredClone(report),sourceLibSha256:'new-engine',release:'unpublished:player-versions-v2',engineIdentity:{mode:'candidate',label:'player-versions-v2'}};candidate.setup.stateBytes=120;
  assert.throws(()=>compareLoadReports(report,candidate),/allow-engine-change/);
  const comparison=compareLoadReports(report,candidate,{allowEngineChange:true});assert.equal(comparison.comparisonMode,'candidate-engine');assert.equal(comparison.sameEngineSource,false);assert.equal(comparison.sameSetupStateByteCount,false);assert.equal(comparison.baseline.mixed.memory,null);assert.equal(comparison.engineIdentities.candidate.label,'player-versions-v2');
  const mismatched=structuredClone(candidate);mismatched.config.users=101;assert.throws(()=>compareLoadReports(report,mismatched,{allowEngineChange:true}),/Different scenario settings/);
  assert.throws(()=>compareLoadReports(report,{...candidate,engineIdentity:undefined},{allowEngineChange:true}),/explicitly identify/);
  assert.equal(compareLoadReports(report,structuredClone(report)).comparisonMode,'storage-layout');
  const village=structuredClone(candidate);Object.assign(village.phases.mixed.database,{villageCas:{calls:9,committed:8,conflicts:1}});
  const scoped=compareLoadReports(report,village,{allowEngineChange:true}).partitioned.mixed;
  assert.equal(scoped.casAttempts,1);assert.equal(scoped.villageCasAttempts,9);
  assert.equal(scoped.allWriteAttempts,10);assert.equal(scoped.allWriteCommits,9);assert.equal(scoped.allWriteConflicts,1);
});
