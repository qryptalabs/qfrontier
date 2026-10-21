import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {auditReadD1} from './support/read-audit-d1.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {dispatchProduction} from '../lib/mvp/production.ts';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {MvpCommand} from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-21T12:00:00Z'),OWNER='bounded-own',FOREIGN='bounded-neighbor',MARKER='FOREIGN_PRIVATE_PAYLOAD_DO_NOT_LOAD';
const schemas=['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'];
const sourceManifest=()=>{
  const paths:string[]=[];const collect=(directory:string)=>{for(const entry of readdirSync(directory,{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory())collect(path);else if(entry.isFile())paths.push(path);else throw new Error(`Unexpected source link: ${path}`);}};
  collect('lib');paths.push(...schemas,'tests/support/d1-sqlite.ts','tests/support/read-audit-d1.ts');
  return Object.fromEntries(paths.sort().map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
};

async function fixture(foreignPadding:number){
  const binding=createSqliteD1();for(const path of schemas)binding.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
  const world=createMvpWorld('bounded-admin',NOW);
  const add=(ownerId:string,name:string)=>createPlayer(world,{ownerId,now:NOW,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:`Aldea ${name}`,faction:'cartographers'});
  const own=add(OWNER,'Alba'),foreign=add(FOREIGN,'Beto');settleSocial(world,NOW);
  const hidden=MARKER+'x'.repeat(foreignPadding);foreign.inventory[0].provenance.source=hidden;
  dispatchProduction(world,{type:'craft.start',playerId:foreign.id,recipeId:'plank',qty:1},{ownerId:FOREIGN,now:NOW,actor:foreign,requestId:crypto.randomUUID()});
  const foreignJob=Object.values(world.jobs).find(job=>job.playerId===foreign.id)!;foreignJob.payload.privateAuditNote=hidden;
  // Import is deliberately outside the observation and can use larger fixture
  // batches. Every observed application store keeps the real 40-statement cap.
  await createPartitionedMvpStore(binding,{metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:900}).insert(world);
  const audit=auditReadD1(binding,[MARKER]);
  const store=()=>{
    const raw=createPartitionedMvpStore(audit.database,{metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:40});
    return new Proxy(raw,{get(target,key,receiver){if(key==='read')return()=>{throw new Error('QA_GLOBAL_READ_FORBIDDEN');};const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;}})as MvpStore;
  };
  const reset=()=>{audit.reset();binding.clearTrace();};
  const evidence=()=>{
    const summary=audit.summary();assert.deepEqual(summary.sentinelMatches,[],'Private foreign player and job bodies must never be returned.');
    assert.ok(summary.partitionKeys.every(key=>key.collection!=='players'||key.entityId===own.id),'Private player SQL must be restricted to this account.');
    assert.ok(summary.partitionKeys.every(key=>key.collection!=='jobs'||key.entityId!==foreignJob.id),'Unrelated private jobs cannot be loaded and then filtered in JavaScript.');
    const plans=binding.queries.filter(query=>/^\s*SELECT\b/i.test(query.sql)&&/world_partition_parts/i.test(query.sql)).map(query=>({sql:query.sql,details:binding.sqlite.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(...query.bindings as never[]).map(row=>String(row.detail))}));
    assert.ok(plans.length,'The test must observe actual authoritative SQL, not only a cached result.');
    for(const plan of plans){
      const privateSearch=plan.details.filter(detail=>/world_partition_parts|\bp\b.*(?:INDEX|SCAN)/i.test(detail));
      assert.ok(privateSearch.length,`Partition lookup plan was not recognized: ${JSON.stringify(plan)}`);
      assert.ok(privateSearch.every(detail=>!/SCAN\s+(?:p|world_partition_parts)\b/i.test(detail)&&/entity_id\s*=\s*\?/i.test(detail)),`Private lookup must search complete record keys, not scan all realm bodies: ${JSON.stringify(plan)}`);
    }
    return{...summary,plans};
  };
  return{binding,own,foreign,foreignJob,audit,store,reset,evidence};
}

test('cold view, quote, validation, confirmation, settlement and receipt replay never load unrelated fragmented private records',async()=>{
  const frozen=sourceManifest(),results: {padding:number;steps:{name:string;returnedRows:number;returnedCellBytes:number;plans:unknown[]}[]}[]=[];
  for(const padding of[16,2_200_000]){
    const f=await fixture(padding),steps:{name:string;returnedRows:number;returnedCellBytes:number;plans:unknown[]}[]=[];
    try{
      const observe=async<T>(name:string,run:()=>Promise<T>)=>{f.reset();const value=await run(),evidence=f.evidence();steps.push({name,returnedRows:evidence.returnedRows,returnedCellBytes:evidence.returnedCellBytes,plans:evidence.plans});return value;};
      const view=await observe('cold-view',()=>readMvpView(f.store(),OWNER,f.own.id,NOW));assert.equal(view.player!.id,f.own.id);assert.ok(view.people.some(person=>person.id===f.foreign.id),'Public identities remain visible without private neighbor inventories.');
      const command:MvpCommand={type:'craft.start',playerId:f.own.id,recipeId:'plank',qty:1},requestId=crypto.randomUUID();
      const quote=await observe('cold-quote',()=>quoteMvp(f.store(),OWNER,command,requestId,NOW));
      const authorization=await observe('validate',()=>validateMvpQuote(f.store(),OWNER,command,requestId,quote.revision,quote.token,quote.expiresAt,NOW));
      const started=await observe('confirm',()=>executeMvp(f.store(),OWNER,command,requestId,quote.revision,NOW,authorization));
      const job=started.jobs.find(job=>job.playerId===f.own.id&&job.kind==='craft')!;assert.ok(job);
      const completed=await observe('settle',()=>readMvpView(f.store(),OWNER,f.own.id,job.endsAt));assert.equal(completed.jobs.find(saved=>saved.id===job.id)!.status,'completed');
      const planks=completed.player!.inventory.filter(lot=>lot.itemId==='plank');assert.equal(planks.reduce((sum,lot)=>sum+lot.qty,0),1);assert.equal(planks[0].provenance.source,`recipe:plank:${job.id}`);
      const replay=await observe('receipt-replay',()=>executeMvp(f.store(),OWNER,command,requestId,quote.revision,job.endsAt+1,authorization));
      assert.equal(replay.player!.inventory.filter(lot=>lot.itemId==='plank').reduce((sum,lot)=>sum+lot.qty,0),1);
      const authoritative=await createPartitionedMvpStore(f.binding,{metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:900}).read();assert.ok(authoritative);
      assert.equal(authoritative.world.jobs[f.foreignJob.id].status,'running','Reading this village must not silently settle a neighbor job.');
      assert.equal(authoritative.world.players[f.foreign.id].inventory[0].provenance.source,MARKER+'x'.repeat(padding));
      results.push({padding,steps});
    }finally{f.binding.close();}
  }
  assert.equal(results[0].steps.length,6);assert.equal(results[1].steps.length,6);
  for(let index=0;index<results[0].steps.length;index++){
    const small=results[0].steps[index],large=results[1].steps[index];assert.equal(large.name,small.name);
    assert.ok(large.returnedCellBytes<=small.returnedCellBytes+4096,`${large.name}: unrelated multi-megabyte records changed actual SQL bytes from ${small.returnedCellBytes} to ${large.returnedCellBytes}.`);
    assert.ok(large.returnedRows<=small.returnedRows+4,`${large.name}: unrelated fragments entered the returned row set.`);
  }
  assert.deepEqual(sourceManifest(),frozen,'All application and schema sources must remain frozen during the SQL footprint proof.');
  const output=process.env.QFRONTIER_BOUNDED_PROOF_REPORT;
  if(output)writeFileSync(output,JSON.stringify({createdAt:new Date().toISOString(),localOnly:true,remoteConnections:0,sourceHashes:frozen,sourceFrozen:true,passed:true,checks:['real public engine caller sequence','global store.read forbidden','unrelated private player/job fragments excluded','actual SQL returned rows and UTF-8 cell bytes independent of foreign payload size','record-key SQL lookup plans','craft output provenance and single receipt replay','neighbor job not settled'],results,limitations:['Public identities, metadata cardinality and shared read closures are still global or broad where explicitly audited. Returned rows are not SQL rows visited or hosted D1 billed rows.','Synthetic local SQLite and Node execution does not certify hosted runtime, network, cost or production capacity.']},null,2)+'\n',{flag:'wx'});
});

test('an unrelated neighbor edit keeps a private quote valid while an own-village edit invalidates it',async()=>{
  const f=await fixture(16);
  try{
    const command:MvpCommand={type:'craft.start',playerId:f.own.id,recipeId:'plank',qty:1},requestId=crypto.randomUUID();
    const quote=await quoteMvp(f.store(),OWNER,command,requestId,NOW);
    await executeMvp(f.store(),FOREIGN,{type:'habitat.profile',playerId:f.foreign.id,appearance:'pine',profession:'carrier'},crypto.randomUUID(),undefined,NOW);
    const authorization=await validateMvpQuote(f.store(),OWNER,command,requestId,quote.revision,quote.token,quote.expiresAt,NOW);
    const saved=await executeMvp(f.store(),OWNER,command,requestId,quote.revision,NOW,authorization);assert.ok(saved.jobs.some(job=>job.playerId===f.own.id&&job.kind==='craft'));
    const secondId=crypto.randomUUID(),second=await quoteMvp(f.store(),OWNER,command,secondId,NOW);
    const changed=await executeMvp(f.store(),OWNER,{type:'habitat.profile',playerId:f.own.id,appearance:'frost',profession:'farmer'},crypto.randomUUID(),undefined,NOW);
    assert.equal(changed.player!.habitable!.appearance,'frost');assert.equal(changed.player!.habitable!.profession,'farmer');
    // Validation authenticates the signed scope. Its versions are checked at
    // execution/commit, where a stale authorization must actually be rejected.
    const stale=await validateMvpQuote(f.store(),OWNER,command,secondId,second.revision,second.token,second.expiresAt,NOW);
    await assert.rejects(executeMvp(f.store(),OWNER,command,secondId,second.revision,NOW,stale),error=>(error as {status?:number}).status===409);
  }finally{f.binding.close();}
});

test('an unsupported participant closure and a failed read both revoke a previous covered write authority',async()=>{
  const f=await fixture(16);
  try{
    const store=createPartitionedMvpStore(f.binding,{metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:40}),query={ownerId:OWNER,playerId:f.own.id,now:NOW};
    const first=await store.readVillage!(query);assert.ok(first);const next=structuredClone(first.state);next.players[f.own.id].name+=' stale';
    assert.equal(await store.readVillage!({...query,command:{type:'market.fill',playerId:f.own.id,offerId:'requires-other-party'}}),null,'An unaudited multilateral operation must decline coverage explicitly.');
    assert.equal(await store.commitVillage!(first,next,query),null,'A null read cannot leave an older authority usable.');
    const second=await store.readVillage!(query);assert.ok(second);
    f.binding.failNext({phase:'before-statement',statementIndex:0,error:new Error('bounded-read-fault')});
    await assert.rejects(store.readVillage!(query),/bounded-read-fault/);
    assert.equal(await store.commitVillage!(second,next,query),null,'A failed read cannot leave an older authority usable.');
  }finally{f.binding.close();}
});

test('index corruption after an atomic read cannot authorize a commit or alter authoritative record bodies',async()=>{
  const f=await fixture(16);
  try{
    const store=createPartitionedMvpStore(f.binding,{metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:40}),query={ownerId:OWNER,playerId:f.own.id,now:NOW};
    let pending=true;
    f.binding.afterCall=call=>{if(pending&&call.sql.some(sql=>sql.includes('world_village_index_state'))){pending=false;f.binding.sqlite.prepare("DELETE FROM world_village_record_index WHERE collection='jobs' AND entity_id=?").run(f.foreignJob.id);}};
    const covered=await store.readVillage!(query);assert.ok(covered,'The original atomic read is valid at its own snapshot.');assert.equal(pending,false);
    f.binding.afterCall=undefined;
    const bodies=()=>JSON.stringify(f.binding.sqlite.prepare('SELECT * FROM world_partition_parts ORDER BY collection,entity_id,part_index').all());
    const before=bodies(),next=structuredClone(covered.state);next.players[f.own.id].name+=' must not save';
    assert.equal(await store.commitVillage!(covered,next,query),null,'A mismatching index stamp/count must fail closed.');
    assert.equal(bodies(),before,'A failed authority may not write even one child body.');
  }finally{f.binding.close();}
});
