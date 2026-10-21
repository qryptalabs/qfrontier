import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {emit} from '../lib/mvp/helpers.ts';
import {hashRecord} from '../lib/mvp/partitioned-codec.ts';
import {executeMvp,quoteMvp,validateMvpQuote,readMvpView} from '../lib/mvp/engine.ts';
import {readPartitionedIndexHealth} from '../scripts/load-test-index-health.mjs';
import type {MvpCommand} from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-17T12:30:00Z');
const schemas=['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'];

test('25 independent villages retain complete index stamps and facts across concurrent survey, travel, farm and capped chronicle settlement',async()=>{
  const sourcePaths=['lib/mvp/engine.ts','lib/mvp/partitioned-store.ts','lib/mvp/village-read-index.ts'],hashes=()=>Object.fromEntries(sourcePaths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),sourceHashes=hashes();
  const db=createSqliteD1(),world=createMvpWorld('outside-administrator',NOW),actors=Array.from({length:25},(_,index)=>{
    const ownerId=`index-owner-${index}`,player=createPlayer(world,{ownerId,requestId:`index-player-${index}`,now:NOW,actor:null},{type:'player.create',name:`Aldeano ${index}`,stationName:`Aldea ${index}`,faction:'cartographers'});return{ownerId,id:player.id};
  });
  settleSocial(world,NOW);
  // Historical chronicle fixture deliberately starts just below the real cap.
  // All observed additions and completions below use public engine methods.
  while(world.events.length<149)emit(world,world.players[actors[0].id],NOW,'Historia de la región.');
  for(const path of schemas)db.sqlite.exec(readFileSync(path,'utf8'));
  const outcomes:unknown[]=[],epochs:unknown[]=[],batches:(ReturnType<typeof readPartitionedIndexHealth>&{epoch:string;sequence:number})[]=[],store=()=>createPartitionedMvpStore(db,{metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:40,onVillageReadOutcome:event=>outcomes.push(event)});
  await createPartitionedMvpStore(db,{metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:900}).insert(world);
  let epoch='seed';
  const health=()=>readPartitionedIndexHealth(db.sqlite);
  const audit=async()=>{
    const facts=db.sqlite.prepare("SELECT entity_id,facts_json FROM world_village_record_index WHERE collection='players'").all(),fleetHashMismatches:string[]=[];
    for(const row of facts){const fact=JSON.parse(String(row.facts_json));if(!fact.fleetHash)continue;const pieces=db.sqlite.prepare("SELECT body FROM world_village_fact_parts WHERE kind='fleet' AND entity_id=? ORDER BY part_index").all(row.entity_id);if(await hashRecord(pieces.map(piece=>String(piece.body)).join(''))!==fact.fleetHash)fleetHashMismatches.push(String(row.entity_id));}
    return{...health(),fleetHashMismatchCount:fleetHashMismatches.length,eventCount:Number(db.sqlite.prepare("SELECT COUNT(*) AS n FROM world_partition_parts WHERE collection='events' AND part_index=0").get()!.n)};
  };
  db.afterCall=call=>{if(call.sql.some(sql=>/UPDATE world_partition_heads SET revision=revision\+1/.test(sql))){batches.push({epoch,sequence:batches.length+1,...health()});}};
  const inspect=async()=>{const entry={epoch,...await audit()};epochs.push(entry);assert.equal(entry.indexHealthy,true,`Index storage lost coverage: ${JSON.stringify(entry)}`);assert.equal(entry.fleetHashMismatchCount,0);};
  const commands=async(type:MvpCommand['type'],tileId?:string)=>{
    const prepared=await Promise.all(actors.map(async actor=>{const command={type,playerId:actor.id,...(tileId?{tileId}:{})}as MvpCommand,requestId=crypto.randomUUID(),quote=await quoteMvp(store(),actor.ownerId,command,requestId,NOW);const authorization=await validateMvpQuote(store(),actor.ownerId,command,requestId,quote.revision,quote.token,quote.expiresAt,NOW);return{actor,command,requestId,quote,authorization};}));
    const results=await Promise.allSettled(prepared.map(({actor,command,requestId,quote,authorization})=>executeMvp(store(),actor.ownerId,command,requestId,quote.revision,NOW,authorization)));
    const errors=results.filter(result=>result.status==='rejected');assert.ok(results.some(result=>result.status==='fulfilled'),'At least one real command must confirm.');for(const error of errors)assert.equal((error as PromiseRejectedResult).reason.status,409,'Only real contention is an acceptable rejection.');
    return results.filter((result):result is PromiseFulfilledResult<Awaited<ReturnType<typeof executeMvp>>>=>result.status==='fulfilled').map(result=>result.value);
  };
  try{
    await inspect();
    for(const [kind,tileId]of[['world.survey','t_4_3'],['world.travel','t_4_3'],['farm.start',undefined]]as const){
      epoch=`${kind}:start`;const views=await commands(kind,tileId);await inspect();
      const ends=views.flatMap(view=>view.jobs.filter(job=>['running','reserved'].includes(job.status)).map(job=>job.endsAt)),at=Math.max(NOW,...ends)+1;
      epoch=`${kind}:settle`;await Promise.all(actors.map(actor=>readMvpView(store(),actor.ownerId,actor.id,at)));await inspect();
    }
    assert.ok(batches.length>=25,'The test must execute actual concurrent commits.');
  }finally{
    const report={createdAt:new Date().toISOString(),localOnly:true,remoteConnections:0,players:25,seedEvents:149,sourceHashes,sourceFrozen:JSON.stringify(hashes())===JSON.stringify(sourceHashes),epochs,batches,firstBrokenBatch:batches.find(value=>!value.indexHealthy)??null,outcomes};
    const path=process.env.QFRONTIER_INDEX_HEALTH_REPORT;if(path)writeFileSync(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    db.close();
  }
});
