import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {dispatchProduction} from '../lib/mvp/production.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {readMvpView} from '../lib/mvp/engine.ts';
import {readSettlementWithProgress,SHARED_SETTLEMENT_BUDGET_ERROR} from '../scripts/load-test-settlement-verifier.mjs';
import type {MvpStore} from '../lib/mvp/store.ts';

const NOW=Date.parse('2026-10-17T12:30:00Z');

test('verification retries the actual ninth shared lease at the same time, retaining the first503 and its eight confirmed settlements',async()=>{
  const db=createSqliteD1();
  try{
    for(const path of['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'])db.sqlite.exec(readFileSync(path,'utf8'));
    const seed=createMvpWorld('outside-admin',NOW),add=(ownerId:string)=>createPlayer(seed,{ownerId,requestId:crypto.randomUUID(),actor:null,now:NOW},{type:'player.create',name:ownerId,stationName:ownerId,faction:'cartographers'}),actor=add('Viewer');
    const tiles=Object.values(seed.tiles).filter(tile=>tile.terrain!=='water'&&tile.deposits.some(deposit=>deposit.itemId==='timber'));
    for(let index=0;index<9;index++){const p=add(`Source${index}`),tile=tiles[Math.floor(index/2)];p.position=tile.id;p.surveyed.push(tile.id);dispatchProduction(seed,{type:'mining.reserve',playerId:p.id,tileId:tile.id,itemId:'timber',qty:1},{ownerId:p.ownerId,requestId:crypto.randomUUID(),now:NOW,actor:p});}
    settleSocial(seed,NOW);
    const raw=()=>createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:40});
    await createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:900}).insert(seed);
    let maintenanceCommits=0,globalReads=0;const at=NOW+10001,times:number[]=[],observations:Record<string,unknown>[]=[],budget={used:0,limit:30};
    const read=async()=>{
      times.push(at);const store=new Proxy(raw(),{get(target,key,receiver){if(key==='read')return()=>{globalReads++;throw new Error('Forbidden application global read');};if(key==='commitVillageMaintenance')return async(...args:Parameters<NonNullable<MvpStore['commitVillageMaintenance']>>)=>{const saved=await target.commitVillageMaintenance!(...args);if(saved)maintenanceCommits++;return saved;};const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;}})as MvpStore;
      try{return{status:200,view:await readMvpView(store,actor.ownerId,actor.id,at)};}catch(error){return{status:(error as {status:number}).status,error:(error as Error).message};}
    };
    const snapshot=async()=>(await raw().read())!.world;
    const result=await readSettlementWithProgress({actor,read,world:snapshot,beforeWorld:seed,at,budget,observations,role:'racer'});
    assert.equal(result.status,200);assert.equal(maintenanceCommits,9);assert.equal(globalReads,0);assert.equal(budget.used,2);assert.deepEqual(times,[at,at]);
    assert.equal(observations.length,2);assert.deepEqual(observations.map(entry=>entry.status),[503,200]);assert.equal(observations[0].reason,'shared-settlement-budget');assert.equal(observations[0].expiredSharedLeasesBefore,9);assert.equal(observations[0].expiredSharedLeasesAfter,1);assert.equal(observations[0].strictProgress,true);assert.equal(observations[0].retried,true);
    assert.equal(Object.values((await snapshot()).jobs).filter(job=>job.kind==='extract'&&job.status==='completed').length,9);
  }finally{db.close();}
});

const sample=(count:number)=>({players:{},jobs:Object.fromEntries(Array.from({length:count},(_,index)=>[`job${index}`,{id:`job${index}`,playerId:`p${index}`,kind:'extract',status:'running',endsAt:NOW}]))});

test('verification never retries transport failures, another503, or an exact budget503 without authoritative progress',async()=>{
  for(const result of[{status:0,error:'TimeoutError'},{status:503,error:'Other failure'},{status:503,error:SHARED_SETTLEMENT_BUDGET_ERROR}]){
    let calls=0;const observations:Record<string,unknown>[]=[],budget={used:0,limit:30},before=sample(9);
    assert.equal(await readSettlementWithProgress({actor:{},read:async()=>{calls++;return result;},world:async()=>before,beforeWorld:before,at:NOW,budget,observations,role:'racer'}),result);
    assert.equal(calls,1);assert.equal(budget.used,1);assert.equal(observations.length,1);assert.equal(observations[0].status,result.status);assert.equal(observations[0].retried,false);
  }
});

test('verification503 retries share the same strict total HTTP-read budget as owner polling',async()=>{
  let calls=0;const observations:Record<string,unknown>[]=[],budget={used:0,limit:1};
  await assert.rejects(readSettlementWithProgress({actor:{},read:async()=>{calls++;return{status:503,error:SHARED_SETTLEMENT_BUDGET_ERROR};},world:async()=>sample(1),beforeWorld:sample(9),at:NOW,budget,observations,role:'due-owner'}),/total HTTP-read budget/);
  assert.equal(calls,1);assert.equal(budget.used,1);assert.equal(observations[0].status,503);assert.equal(observations[0].strictProgress,true);assert.equal(observations[0].retried,false);
});
