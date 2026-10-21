import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {basename,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createSqliteD1} from '../tests/support/d1-sqlite.ts';

// Test-only bridge. No application file or fixture is changed on disk.
const root=resolve(import.meta.dirname,'..'),engineUrl=pathToFileURL(resolve(root,'lib/mvp/engine.ts')).href;
const preloadUrl=import.meta.url,testFile=resolve(process.argv[1]??''),legacyFaultSuite=basename(testFile)==='storage-availability.test.ts';
const entityVersioning=process.env.QFRONTIER_TEST_ENTITY_VERSIONS==='1';
const villageWrites=process.env.QFRONTIER_TEST_VILLAGE_WRITES==='1';
const villageReads=process.env.QFRONTIER_TEST_VILLAGE_READS==='1';
assert.ok(!villageWrites||entityVersioning,'Village regression mode requires entity versions.');
assert.ok(!villageReads||villageWrites&&entityVersioning,'Bounded regression mode requires versioned village writes.');
const testExecutionContract=process.env.QFRONTIER_TEST_CONTRACT??'original-assertions';
assert.ok(['original-assertions','village-ids-v1'].includes(testExecutionContract),'Unknown reviewed assertion contract.');
assert.ok(testExecutionContract==='original-assertions'||villageWrites,'Reviewed village ID assertions require actual village writes.');
const reviewedManifest=testExecutionContract==='village-ids-v1'?JSON.parse(readFileSync(resolve(root,'scripts/reviewed-village-id-contract.json'),'utf8')):null;
if(reviewedManifest){assert.equal(reviewedManifest.contract,testExecutionContract);assert.equal(reviewedManifest.file,'tests/mvp-test-boosts.test.ts');}
const reviewedTestUrl=reviewedManifest?pathToFileURL(resolve(root,reviewedManifest.file)).href:null;
const schema=readFileSync(resolve(root,'drizzle/0000_odd_warlock.sql'),'utf8')+'\n'+readFileSync(resolve(root,'db/partitioned-world.sql'),'utf8')+(entityVersioning?'\n'+readFileSync(resolve(root,'db/player-read-model.sql'),'utf8'):'')+(villageWrites?'\n'+readFileSync(resolve(root,'db/village-writes.sql'),'utf8'):'')+(villageReads?'\n'+readFileSync(resolve(root,'db/bounded-village-reads.sql'),'utf8'):'');
const bridges=new WeakMap(),alreadyBridged=new WeakSet(),stores=[],engineEntries={};
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value===null?null:{revision:value.revision,world:value.world})??'undefined').digest('hex');
const options={realmId:'partitioned-regression-only',maxBatchStatements:entityVersioning?900:40,...(entityVersioning?{metadataVersioning:true,playerReads:villageReads}:{}),...(villageWrites?{villageWrites:true}:{}),...(villageReads?{villageReads:true}:{})};
const report={testFile,legacyFaultSuite,localOnly:true,cloudflareConnections:0,entityVersioning,villageWrites,villageReads,testExecutionContract,reviewedCaseAdaptations:[],assertionsExecutedUnmodified:true,playerReads:villageReads,maxBatchStatements:options.maxBatchStatements,engineEntries,fixtureImports:0,fixtureImportRows:0,fixtureImportCalls:0,fixtureImportBytesBound:0,fixtureMetadataImports:0,fixtureVersionFloorMax:0,fixtureAssertionFullReads:0,villageReadReasons:{village:{},maintenance:{}},productionCalls:{reads:0,inserts:0,compareAndSwaps:0,villageCompareAndSwaps:0,villageReads:0,villageReadFallbacks:0,villageCommits:0,villageCommitConfirmed:0,villageCommitConflicts:0,villageProjections:0,maintenanceReads:0,maintenanceReadFallbacks:0,maintenanceReadRetries:0,maintenanceCommits:0,maintenanceConfirmed:0,maintenanceConflicts:0,confirmed:0,villageConfirmed:0,conflicts:0,villageConflicts:0},transformedEngine:false};

export function sqlBridge(original){
  if(legacyFaultSuite||alreadyBridged.has(original))return original;
  if(bridges.has(original))return bridges.get(original);
  assert.ok(original&&typeof original.read==='function'&&typeof original.insert==='function'&&typeof original.compareAndSwap==='function');
  const db=createSqliteD1();db.sqlite.exec(schema);
  const state={db,lastFixtureHash:undefined,queue:Promise.resolve(),observed:new Map(),villageObserved:new WeakMap(),villageMaintenanceTimes:new WeakMap(),villageFallbackAdapters:new Map(),mirrorQueue:Promise.resolve(),fixtureVersionFloor:0,productionCalls:0,pendingMirror:null,mirrorEpoch:0};stores.push(state);
  // Load application dependencies only after the engine hook is installed.
  // A future adapter -> projection -> engine import must never bypass interception.
  const factory=async()=>{const {createPartitionedMvpStore}=await import('../lib/mvp/partitioned-store.ts');return createPartitionedMvpStore(db,{...options,...(villageReads?{onVillageReadOutcome:event=>{if(event.result==='fallback'){const reasons=report.villageReadReasons[event.operation];reasons[event.reason]=(reasons[event.reason]??0)+1;}}}:{})});};
  const villageQueryKey=query=>JSON.stringify([query.ownerId,query.playerId??null,query.now]);
  async function observeFixture(){
    if(state.pendingMirror)await state.pendingMirror;
    const epoch=state.mirrorEpoch;
    const record=await original.read(),hash=fingerprint(record);
    if(state.pendingMirror||state.mirrorEpoch!==epoch)return observeFixture();
    // Revisions and world mutations here come from explicit existing fixture
    // setup, never from a production command or a live database.
    const sync=async()=>{
      if(state.lastFixtureHash===hash)return;
      const initial=state.lastFixtureHash===undefined;state.lastFixtureHash=hash;
      if(initial&&record===null)return;
      assert.equal(state.productionCalls,0,'Fixtures may not be edited during in-flight engine storage operations.');
      const before=db.metrics;
      if(entityVersioning){const maximum=db.sqlite.prepare('SELECT COALESCE(MAX(version),0) AS maximum FROM world_entity_versions').get().maximum;assert.ok(Number.isSafeInteger(maximum)&&maximum>=0);state.fixtureVersionFloor=Math.max(state.fixtureVersionFloor,maximum)+1;assert.ok(Number.isSafeInteger(state.fixtureVersionFloor));report.fixtureVersionFloorMax=Math.max(report.fixtureVersionFloorMax,state.fixtureVersionFloor);}
      if(entityVersioning)db.sqlite.exec('DELETE FROM world_player_view_parts; DELETE FROM world_player_view_heads; DELETE FROM world_public_actor_parts; DELETE FROM world_public_actor_heads; DELETE FROM world_entity_versions; DELETE FROM world_read_model_state;');
      if(villageReads)db.sqlite.exec('DELETE FROM world_village_ledger_participants; DELETE FROM world_village_fact_parts; DELETE FROM world_village_record_index; DELETE FROM world_village_index_state;');
      db.sqlite.exec('DELETE FROM world_partition_parts; DELETE FROM world_partition_heads; DELETE FROM world_state;');
      state.observed.clear();state.villageObserved=new WeakMap();state.villageMaintenanceTimes=new WeakMap();state.villageFallbackAdapters.clear();
      if(record!==null){
        assert.ok(Number.isSafeInteger(record.revision)&&record.revision>=0&&record.world);
        await (await factory()).insert(record.world);
        db.sqlite.exec('BEGIN');
        try{
          db.sqlite.prepare('UPDATE world_partition_heads SET revision = ?').run(record.revision);
          if(entityVersioning){db.sqlite.prepare('UPDATE world_entity_versions SET version = ?').run(state.fixtureVersionFloor);db.sqlite.prepare('UPDATE world_read_model_state SET source_revision = ?').run(record.revision);report.fixtureMetadataImports++;}
          if(villageReads){db.sqlite.prepare('UPDATE world_village_index_state SET source_revision = ?').run(record.revision);db.sqlite.prepare('UPDATE world_read_model_state SET public_revision = ? WHERE public_token = commit_token').run(record.revision);}
          db.sqlite.exec('COMMIT');
        }catch(error){db.sqlite.exec('ROLLBACK');throw error;}
        const stored=await (await factory()).read();
        assert.equal(fingerprint(stored),fingerprint(record),'The SQL fixture import must be lossless at the persisted JSON boundary.');
        if(entityVersioning){assert.ok(stored.entityVersions,'Known fixture imports must have a coherent metadata stamp.');assert.ok(Object.values(stored.entityVersions).every(version=>version>=state.fixtureVersionFloor),'A fixture import cannot reset versions and resurrect an earlier quote.');}
      }
      const after=db.metrics;report.fixtureImports++;report.fixtureImportRows+=after.rowsWritten-before.rowsWritten;
      report.fixtureImportCalls+=after.calls-before.calls;report.fixtureImportBytesBound+=after.bytesBound-before.bytesBound;
    };
    const pending=state.queue.then(sync);state.queue=pending.catch(()=>{});await pending;
  }
  async function mirror(operation){
    const pending=(async()=>{await operation();state.lastFixtureHash=fingerprint(await original.read());state.mirrorEpoch++;})();
    state.pendingMirror=pending;try{await pending;}finally{if(state.pendingMirror===pending)state.pendingMirror=null;}
  }
  async function mirrorCommittedSql(context){
    // This queue mirrors historical fixture assertions only after SQL commits.
    // It never decides or serializes the application transaction itself.
    const task=state.mirrorQueue.then(async()=>{
      report.fixtureAssertionFullReads++;const authoritative=await(await factory()).read();assert.ok(authoritative);
      let fixture=await original.read();assert.ok(fixture&&fixture.revision<=authoritative.revision);
      while(fixture.revision<authoritative.revision){const mirrored=await original.compareAndSwap(fixture.revision,authoritative.world,context);assert.equal(mirrored,true,'Confirmed SQL writes must be reflected by the historical assertion mirror.');fixture=await original.read();}
      assert.equal(fingerprint(fixture),fingerprint(authoritative),'The mirror may not invent a different saved village world.');
      state.lastFixtureHash=fingerprint(fixture);state.mirrorEpoch++;
    });
    state.mirrorQueue=task.catch(()=>{});state.pendingMirror=task;try{await task;}finally{if(state.pendingMirror===task)state.pendingMirror=null;}
  }
  const bridge={
    ...(entityVersioning?{capabilities:{entityVersions:true,...(villageWrites?{villageWrites:true}:{}),...(villageReads?{villageReads:true}:{})}}:{}),
    async read(){
      await observeFixture();report.productionCalls.reads++;state.productionCalls++;
      try{const adapter=await factory(),record=await adapter.read();if(record){state.observed.set(record.revision,adapter);state.villageObserved.set(record,adapter);}return record;}
      finally{state.productionCalls--;}
    },
    async insert(world){
      await observeFixture();report.productionCalls.inserts++;state.productionCalls++;
      try{await (await factory()).insert(world);await mirror(()=>original.insert(world));}
      finally{state.productionCalls--;}
    },
    async compareAndSwap(revision,world,context){
      await observeFixture();report.productionCalls.compareAndSwaps++;state.productionCalls++;
      try{
        const adapter=state.observed.get(revision),committed=adapter?await adapter.compareAndSwap(revision,world,context):false;
        if(!committed){report.productionCalls.conflicts++;return false;}
        report.productionCalls.confirmed++;
        // Mirror only the confirmed result for historical test assertions on
        // .record/.writes. The SQL adapter, not this mirror, decides the CAS.
        if(villageWrites)await mirrorCommittedSql(context);
        else await mirror(async()=>{const mirrored=await original.compareAndSwap(revision,world,context);assert.equal(mirrored,true,'A confirmed SQL CAS must match the existing fixture mirror.');});
        return true;
      }finally{state.productionCalls--;}
    },
    ...(villageWrites?{async compareAndSwapVillage(record,world,context){
      await observeFixture();report.productionCalls.villageCompareAndSwaps++;state.productionCalls++;
      try{
        const adapter=state.villageObserved.get(record),saved=adapter?await adapter.compareAndSwapVillage(record,world,context):null;
        if(!saved){report.productionCalls.conflicts++;report.productionCalls.villageConflicts++;return null;}
        report.productionCalls.confirmed++;report.productionCalls.villageConfirmed++;state.villageObserved.set(saved,adapter);
        // Serialize only the assertion mirror AFTER SQL has made each decision.
        // The application writes and their SQL transaction guards remain concurrent.
        await mirrorCommittedSql(context);
        return saved;
      }finally{state.productionCalls--;}
    }}:{}),
    ...(villageReads?{
      async readVillage(query){
        await observeFixture();report.productionCalls.villageReads++;state.productionCalls++;
        try{const adapter=await factory(),snapshot=await adapter.readVillage(query);if(snapshot)state.villageObserved.set(snapshot,adapter);else{report.productionCalls.villageReadFallbacks++;const key=villageQueryKey(query),pending=state.villageFallbackAdapters.get(key)??[];pending.push(adapter);state.villageFallbackAdapters.set(key,pending);}return snapshot;}
        finally{state.productionCalls--;}
      },
      async commitVillage(snapshot,next,context){
        await observeFixture();report.productionCalls.villageCommits++;state.productionCalls++;
        try{
          const adapter=state.villageObserved.get(snapshot),saved=adapter?await adapter.commitVillage(snapshot,next,context):null;
          if(!saved){report.productionCalls.conflicts++;report.productionCalls.villageCommitConflicts++;return null;}
          report.productionCalls.confirmed++;report.productionCalls.villageCommitConfirmed++;state.villageObserved.set(saved,adapter);
          // Historical .record assertions need a separate full SQL mirror only
          // AFTER the real scoped decision. This is test-only, never the load
          // adapter or the commit journal; its count is reported independently.
          await mirrorCommittedSql(context);return saved;
        }finally{state.productionCalls--;}
      },
      async projectVillageView(snapshot,ownerId,now,playerId){
        const adapter=state.villageObserved.get(snapshot);assert.ok(adapter,'Projection needs the adapter that owns this covered snapshot.');
        report.productionCalls.villageProjections++;state.productionCalls++;
        try{return await adapter.projectVillageView(snapshot,ownerId,now,playerId);}finally{state.productionCalls--;}
      },
      async readVillageMaintenance(query){
        await observeFixture();report.productionCalls.maintenanceReads++;state.productionCalls++;
        try{
          const key=villageQueryKey(query),pending=state.villageFallbackAdapters.get(key),adapter=pending?.shift()??await factory();if(pending?.length===0)state.villageFallbackAdapters.delete(key);
          const record=await adapter.readVillageMaintenance(query);if(record?.kind==='village-maintenance'){state.villageObserved.set(record,adapter);state.villageMaintenanceTimes.set(record,query.now);}else if(record?.kind==='village-maintenance-retry')report.productionCalls.maintenanceReadRetries++;else report.productionCalls.maintenanceReadFallbacks++;return record;
        }finally{state.productionCalls--;}
      },
      async commitVillageMaintenance(record,next){
        await observeFixture();report.productionCalls.maintenanceCommits++;state.productionCalls++;
        try{
          const adapter=state.villageObserved.get(record),saved=adapter?await adapter.commitVillageMaintenance(record,next):false;
          if(!saved){report.productionCalls.conflicts++;report.productionCalls.maintenanceConflicts++;return false;}
          report.productionCalls.confirmed++;report.productionCalls.maintenanceConfirmed++;
          const now=state.villageMaintenanceTimes.get(record);assert.ok(Number.isSafeInteger(now),'Maintenance mirror needs its actual observed request time.');await mirrorCommittedSql({ownerId:record.snapshot.scope.ownerId,playerId:record.snapshot.scope.playerId,now});return true;
        }finally{state.productionCalls--;}
      },
    }:{}),
  };
  bridges.set(original,bridge);alreadyBridged.add(bridge);return bridge;
}

export function recordEngineEntry(name){engineEntries[name]=(engineEntries[name]??0)+1;}

registerHooks({load(url,context,nextLoad){
  if(reviewedManifest&&url===reviewedTestUrl){
    const original=readFileSync(fileURLToPath(url),'utf8'),sha=value=>createHash('sha256').update(value).digest('hex');
    assert.equal(sha(original),reviewedManifest.originalSha256,'The reviewed identity contract cannot apply to a different test source.');
    let transformed=original.replaceAll('\r\n','\n');
    assert.equal(reviewedManifest.changes.length,2,'Only two reviewed identity comparisons may change.');
    for(const change of reviewedManifest.changes){
      assert.equal(sha(change.from),change.fromSha256);assert.equal(sha(change.to),change.toSha256);
      assert.equal(transformed.split(change.from).length-1,1,'Each reviewed test hunk must match exactly once.');transformed=transformed.replace(change.from,change.to);
      report.reviewedCaseAdaptations.push({file:reviewedManifest.file,caseName:change.caseName,originalFileSha256:reviewedManifest.originalSha256,transformedLfSha256:reviewedManifest.transformedLfSha256,fromSha256:change.fromSha256,toSha256:change.toSha256,diff:change.diff});
    }
    assert.equal(sha(transformed),reviewedManifest.transformedLfSha256,'Unexpected reviewed test transformation.');report.assertionsExecutedUnmodified=false;
    return{format:'module',source:ts.transpileModule(transformed,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText,shortCircuit:true};
  }
  if(url!==engineUrl||legacyFaultSuite)return nextLoad(url,context);
  const input=readFileSync(fileURLToPath(url),'utf8'),source=ts.createSourceFile(url,input,ts.ScriptTarget.Latest,true),inserts=[];
  const names=new Set(['readMvpView','executeMvp','quoteMvp','validateMvpQuote']);
  for(const node of source.statements)if(ts.isFunctionDeclaration(node)&&node.name&&names.has(node.name.text)){
    assert.ok(node.body&&node.parameters[0].name.getText(source)==='store');
    inserts.push({at:node.body.getStart(source)+1,text:`\n store=__partitionedSqlBridge(store);__partitionedEntry(${JSON.stringify(node.name.text)});\n`});
  }
  assert.equal(inserts.length,4,'The harness must intercept all four storage-bearing engine entries.');
  let transformed=input;for(const insertion of inserts.sort((a,b)=>b.at-a.at))transformed=transformed.slice(0,insertion.at)+insertion.text+transformed.slice(insertion.at);
  transformed=`import {sqlBridge as __partitionedSqlBridge,recordEngineEntry as __partitionedEntry} from ${JSON.stringify(preloadUrl)};\n`+transformed;
  report.transformedEngine=true;
  return{format:'module',source:ts.transpileModule(transformed,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText,shortCircuit:true};
}});

process.on('exit',()=>{
  const metrics=stores.map(state=>state.db.metrics),total=key=>metrics.reduce((sum,value)=>sum+value[key],0);
  const result={...report,stores:stores.length,sql:{calls:total('calls'),statements:total('statements'),batches:total('batches'),commits:total('commits'),rollbacks:total('rollbacks'),rowsWritten:total('rowsWritten'),bytesBound:total('bytesBound'),bytesRead:total('bytesRead'),sqlMilliseconds:total('sqlMilliseconds')},sourceHashes:Object.fromEntries(['lib/mvp/engine.ts','lib/mvp/partitioned-store.ts','lib/mvp/partitioned-codec.ts','lib/mvp/entity-versions.ts','lib/mvp/player-read-model.ts','tests/support/d1-sqlite.ts','db/partitioned-world.sql','db/player-read-model.sql',...(villageWrites?['db/village-writes.sql']:[]),...(villageReads?['db/bounded-village-reads.sql','lib/mvp/village-snapshot.ts']:[])].map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]))};
  const folder=process.env.QFRONTIER_SQL_TEST_REPORT_DIR;
  if(folder){mkdirSync(folder,{recursive:true});writeFileSync(resolve(folder,basename(testFile)+'.json'),JSON.stringify(result,null,2));}
  for(const state of stores)state.db.close();
});
