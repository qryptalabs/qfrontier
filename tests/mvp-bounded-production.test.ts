import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {auditReadD1} from './support/read-audit-d1.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import {createPlayer} from '../lib/mvp/world.ts';
import {dispatchProduction} from '../lib/mvp/production.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {getHabitableWorkers} from '../lib/mvp/habitable-logistics.ts';
import {habitableWorkerAt} from '../lib/mvp/habitable-data.ts';
import {getManagerActiveOrders,managerCommittedUnits} from '../lib/mvp/habitable-manager.ts';
import {getTestBoostsView} from '../lib/mvp/test-boosts.ts';
import {createOperatorFixture,operatorConfig,operatorWorld,operatorState,operatorBuilding,operatorAct,operatorRead,operatorGo,operatorDeposit,operatorWalk} from './fixtures/manager-operator.ts';
import type {OperatorFixture} from './fixtures/manager-operator.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {InventoryLot,ItemId,MvpCommand,MvpWorld} from '../lib/mvp/types.ts';

const schemas=['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'];
const FOREIGN_OWNER='bounded-production-neighbor',PRIVATE_MARKER='BOUNDED_PRODUCTION_FOREIGN_PRIVATE';

/** Both seeds come from exactly the same real-action fixture. No item grant,
 * quota reset or scenery/resource alteration funds the tested production. */
async function pair(s:OperatorFixture){
  const seed=structuredClone(operatorWorld(s));
  // The old fixture deliberately owns its realm. This new test must exercise
  // bounded production rather than accidentally accepting the admin fallback.
  seed.adminOwnerId='qa-admin-aparte';
  const other=createPlayer(seed,{ownerId:FOREIGN_OWNER,now:s.at,requestId:crypto.randomUUID(),actor:null},{type:'player.create',name:'Nora',stationName:'Vecina sin liquidar',faction:'cartographers'});
  settleSocial(seed,s.at);
  dispatchProduction(seed,{type:'craft.start',playerId:other.id,recipeId:'plank',qty:1},{ownerId:FOREIGN_OWNER,now:s.at,requestId:crypto.randomUUID(),actor:other});
  const foreignJob=Object.values(seed.jobs).find(job=>job.playerId===other.id)!;
  foreignJob.payload.privateAuditNote=PRIVATE_MARKER+'x'.repeat(100_000);
  const bindings=[createSqliteD1(),createSqliteD1()];
  for(const binding of bindings){
    for(const path of schemas)binding.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
    await createPartitionedMvpStore(binding,{metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:900}).insert(structuredClone(seed));
    binding.clearTrace();
  }
  const audit=auditReadD1(bindings[0],[PRIVATE_MARKER]);
  const counts={boundedReads:0,boundedCommits:0,globalReads:0};
  const store=(index:number):MvpStore=>{
    const target=createPartitionedMvpStore(index===0?audit.database:bindings[1],{metadataVersioning:true,playerReads:true,villageWrites:true,...(index===0?{villageReads:true}:{}),maxBatchStatements:40});
    return new Proxy(target,{get(base,key,receiver){
      if(index===0&&key==='read')return()=>{counts.globalReads++;throw new Error('QA_ADVANCED_PRODUCTION_GLOBAL_READ_FORBIDDEN');};
      if(index===0&&key==='readVillage')return async(...args:Parameters<NonNullable<MvpStore['readVillage']>>)=>{const value=await base.readVillage!(...args);assert.ok(value,'Every tested operation must have an actual bounded dependency closure.');counts.boundedReads++;return value;};
      if(index===0&&key==='commitVillage')return async(...args:Parameters<NonNullable<MvpStore['commitVillage']>>)=>{const value=await base.commitVillage!(...args);if(value)counts.boundedCommits++;return value;};
      const value=Reflect.get(base,key,receiver);return typeof value==='function'?value.bind(base):value;
    }});
  };
  const state=async(index:number,at:number):Promise<MvpWorld>=>{
    if(index===0){const snapshot=await store(0).readVillage!({ownerId:s.owner,playerId:s.id,now:at});assert.ok(snapshot);return snapshot.state;}
    const record=await store(1).read();assert.ok(record);return record.world;
  };
  const read=(index:number,at:number)=>readMvpView(store(index),s.owner,s.id,at);
  const act=(index:number,command:MvpCommand,requestId:string,at:number)=>executeMvp(store(index),s.owner,{...command,playerId:s.id},requestId,undefined,at);
  const confirm=async(index:number,command:MvpCommand,requestId:string,at:number)=>{
    const complete={...command,playerId:s.id},quote=await quoteMvp(store(index),s.owner,complete,requestId,at);
    const authorization=await validateMvpQuote(store(index),s.owner,complete,requestId,quote.revision,quote.token,quote.expiresAt,at);
    return{quote,view:await executeMvp(store(index),s.owner,complete,requestId,quote.revision,at,authorization)};
  };
  const evidence=()=>{
    const actual=audit.summary();assert.equal(counts.globalReads,0);assert.ok(counts.boundedReads>0&&counts.boundedCommits>0);
    assert.deepEqual(actual.sentinelMatches,[]);
    assert.ok(actual.partitionKeys.every(key=>key.collection!=='players'||key.entityId===s.id),'The non-admin path may not read a private neighbor Player.');
    assert.ok(actual.partitionKeys.every(key=>key.collection!=='jobs'||key.entityId!==foreignJob.id),'The foreign job must not be loaded and filtered afterwards.');
    const parts=bindings[0].sqlite.prepare("SELECT body FROM world_partition_parts WHERE collection='jobs' AND entity_id=? ORDER BY part_index").all(foreignJob.id);
    assert.equal(JSON.parse(parts.map(row=>String(row.body)).join('')).status,'running','A neighbor craft must not be silently settled by this village.');
    assert.ok(bindings[0].calls.filter(call=>call.method==='batch').every(call=>call.sql.length<=40));
  };
  return{seed,bindings,counts,store,state,read,act,confirm,evidence,close:()=>bindings.forEach(binding=>binding.close())};
}

const qty=(lots:readonly InventoryLot[],itemId:ItemId)=>lots.filter(lot=>lot.itemId===itemId).reduce((sum,lot)=>sum+lot.qty,0);
const shed=(world:MvpWorld,id:string)=>world.players[id].habitable!.buildings.find(b=>b.templateId==='shed')!;
const plan=(world:MvpWorld,id:string)=>world.players[id].habitable!.manager!;
const managed=(world:MvpWorld,id:string)=>Object.values(world.jobs).filter(job=>job.payload.managerPlanId===plan(world,id).id);
const materialRows=(lots:readonly InventoryLot[])=>lots.map(({itemId,qty,bound,quality,wear,expiresAt,provenance})=>({itemId,qty,bound,quality,wear,expiresAt,inputs:provenance.inputs})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));

/** Compare economic facts, not the intentionally independent operation UUIDs. */
function economy(world:MvpWorld,id:string,at:number){
  const player=world.players[id],m=plan(world,id);
  return{
    inventory:materialRows(player.inventory),storage:materialRows(shed(world,id).storage??[]),
    pending:player.habitable!.buildings.map(b=>({id:b.id,pending:materialRows(b.pending??[]),supply:materialRows(b.supply?.cargo??[]),shipment:materialRows(b.shipment?.cargo??[]),delivered:b.shipment?.deliveredQuantity??null})),
    jobs:managed(world,id).map(job=>({kind:job.kind,status:job.status,recipe:job.payload.recipeId,qty:job.payload.qty,residentId:job.payload.residentId,courier:job.payload.managerCourierId,startsAt:job.startsAt,endsAt:job.endsAt,costs:materialRows(job.costs)})).sort((a,b)=>a.startsAt-b.startsAt||JSON.stringify(a).localeCompare(JSON.stringify(b))),
    farmCycles:player.farmCycles,regions:world.regions,tiles:world.tiles,account:world.social.accounts[id],npc:world.social.npc,
    manager:{status:m.status,started:m.turn.startedOrders,completed:m.turn.completedOrders,committed:m.turn.committedInputs,extracted:m.turn.extractionCommitted??0,total:managerCommittedUnits(m.turn),active:getManagerActiveOrders(m).length,transportReleased:m.transport?.releasedAt??null,operatorReleased:m.operatorState?.releasedAt??null},
    boosts:getTestBoostsView(world,player.ownerId,at),
  };
}

async function compare(f:Awaited<ReturnType<typeof pair>>,s:OperatorFixture,at:number){
  const actual=await f.state(0,at),expected=await f.state(1,at);
  assert.deepEqual(economy(actual,s.id,at),economy(expected,s.id,at),'Bounded settlement must preserve the full-read village writer economics.');
  return actual;
}

test('bounded SQL runs a parallel forest/sawmill operator and urgent courier, preserves quotas and replays the real turn and manual boost once',async()=>{
  const s=await createOperatorFixture(),command:MvpCommand={...operatorConfig(s),reserves:{grain:1},priority:'food',reserveBuildMaterials:true,urgentTransport:true},f=await pair(s);
  try{
    assert.notEqual(f.seed.adminOwnerId,s.owner);
    const initial=structuredClone(f.seed.players[s.id].inventory),beforeBoost=getTestBoostsView(f.seed,s.owner,s.at),requestId=crypto.randomUUID();
    for(const index of[0,1]){
      await assert.rejects(f.act(index,{...command,useTestBoost:true},crypto.randomUUID(),s.at),/no admite/);
      const started=await f.confirm(index,command,requestId,s.at);assert.equal(started.view.habitable.manager.plan!.turn.startedOrders,0);
      await f.act(index,command,requestId,s.at);
      await f.read(index,s.at+1);
    }
    const active=await compare(f,s,s.at+1),m=plan(active,s.id),work=managed(active,s.id);
    assert.equal(getManagerActiveOrders(m).length,2);assert.equal(work.length,2);
    assert.ok(Math.max(work[0].createdAt,work[1].createdAt)<Math.min(work[0].endsAt,work[1].endsAt),'Two authorized producer lifecycles, including their real input transport, must overlap.');
    assert.ok(work.every(job=>job.payload.managerCourierId===command.courierResidentId));
    const workers=getHabitableWorkers(active,active.players[s.id],s.at+1);
    assert.equal(workers.filter(worker=>worker.id===command.courierResidentId).length,1);
    assert.ok(workers.every(worker=>Number.isFinite(habitableWorkerAt(worker,s.at+1).x)));
    const at=s.at+1_800_000;for(const index of[0,1])await f.read(index,at);
    const finished=await compare(f,s,at),finishedPlan=plan(finished,s.id),orders=managed(finished,s.id);
    assert.equal(orders.length,4);assert.ok(orders.every(job=>job.status==='completed'&&job.payload.testBoost===undefined));
    assert.equal(qty(shed(finished,s.id).storage??[],'plank'),2);assert.equal(qty(shed(finished,s.id).storage??[],'ration'),1);
    assert.equal(finishedPlan.turn.extractionCommitted,4);assert.equal(managerCommittedUnits(finishedPlan.turn),11);
    assert.equal(finishedPlan.status,'expired');assert.ok(finishedPlan.transport?.releasedAt!==undefined&&finishedPlan.operatorState?.releasedAt!==undefined);
    assert.deepEqual(finished.players[s.id].inventory,initial);
    const forest=command.forestry as {tileId:string;layerId:string};
    const layer=(world:MvpWorld)=>world.tiles[forest.tileId].deposits.find(d=>d.itemId==='timber')!.layers.find(l=>l.id===forest.layerId)!;
    assert.equal(layer(finished).remaining,layer(f.seed).remaining-4);assert.equal(layer(finished).reserved,layer(f.seed).reserved);
    assert.equal(getTestBoostsView(finished,s.owner,at).passes.spent,beforeBoost.passes.spent,'Autonomous work cannot spend manual boost passes.');
    for(const index of[0,1]){await f.act(index,command,requestId,at);await f.read(index,at);}
    assert.deepEqual(economy(await f.state(0,at),s.id,at),economy(finished,s.id,at),'Receipt replay and repeated settlement may not duplicate cargo or production.');

    const boostCommand={type:'craft.start',recipeId:'plank',qty:1,useTestBoost:true},boostRequest=crypto.randomUUID();
    for(const index of[0,1]){
      const started=await f.confirm(index,boostCommand,boostRequest,at+1);assert.equal(started.quote.boost!.savedSeconds,60);
      assert.equal(started.quote.boost!.savedSeconds/started.quote.boost!.baseSeconds,.2);
      const ownJob=started.view.jobs.find(job=>job.createdAt===at+1&&job.payload.testBoost)!;assert.ok(ownJob);
      await f.act(index,boostCommand,boostRequest,at+1);
      await f.read(index,ownJob.endsAt+1);
    }
    const afterBoost=await compare(f,s,at+300_001),boosts=getTestBoostsView(afterBoost,s.owner,at+300_001);
    assert.equal(boosts.usedSeconds,60);assert.equal(boosts.remainingSeconds,1740);assert.equal(boosts.limitSeconds,1800);assert.equal(boosts.maxReductionPercent,20);
    assert.equal(boosts.passes.spent,beforeBoost.passes.spent+1);
    f.evidence();
  }finally{f.close();}
});

test('bounded SQL uses real seed and nutrient lots, harvests finite soil and transports food with the same protected reserves and turn balance',async()=>{
  const s=await createOperatorFixture();
  // Reconfigure a spare real resident and move only existing kit/shelf lots.
  // All preparation uses ordinary domain actions before the two SQL imports.
  const planter=operatorBuilding(s,'planter'),resident=operatorState(s).workforce!.residents.find(r=>!r.assignment)!;
  await operatorAct(s,{type:'habitat.resident.assign',residentId:resident.id,buildingId:planter.id});
  s.at=operatorState(s).workforce!.residents.find(r=>r.id===resident.id)!.relocation!.endsAt+1;await operatorRead(s);
  await operatorGo(s,'shed');
  for(const lot of structuredClone(operatorBuilding(s,'shed').storage??[]))await operatorAct(s,{type:'habitat.storage.withdraw',buildingId:operatorBuilding(s,'shed').id,lotId:lot.id,qty:lot.qty});
  for(const[itemId,amount]of[['seed',1],['nutrient',1],['water',4]]as const)await operatorDeposit(s,itemId,amount);
  await operatorWalk(s,{x:5.4,y:5.9});
  const command:MvpCommand={type:'habitat.manager.start',supplyShedId:operatorBuilding(s,'shed').id,workbenchId:operatorBuilding(s,'workbench').id,planterId:planter.id,parallel:true,courierResidentId:operatorState(s).workforce!.residents.find(r=>!r.assignment)!.id,goals:{ration:1,plank:0,cloth:0},durationMinutes:20,maxOrders:12,inputBudget:80,replenishFarmInputs:false,reserves:{grain:1,water:1},priority:'food',reserveBuildMaterials:true,urgentTransport:true},f=await pair(s);
  try{
    const requestId=crypto.randomUUID(),initial=f.seed.players[s.id],regionId=f.seed.tiles[initial.settlement!.homeTileId].regionId;
    for(const index of[0,1]){await f.confirm(index,command,requestId,s.at);await f.act(index,command,requestId,s.at);}
    const at=s.at+1_800_000;for(const index of[0,1])await f.read(index,at);
    const finished=await compare(f,s,at),p=finished.players[s.id],m=plan(finished,s.id),orders=managed(finished,s.id);
    assert.deepEqual(orders.sort((a,b)=>a.createdAt-b.createdAt).map(job=>job.payload.recipeId??job.kind),['farm','ration'],m.blockedReason);
    assert.ok(orders.every(job=>job.status==='completed'&&job.payload.testBoost===undefined));
    assert.equal(m.turn.startedOrders,2);assert.equal(m.turn.completedOrders,2);assert.equal(managerCommittedUnits(m.turn),7);
    assert.equal(p.farmCycles,initial.farmCycles+1);assert.equal(finished.regions[regionId].farmRemaining,f.seed.regions[regionId].farmRemaining-1);
    assert.equal(qty(shed(finished,s.id).storage??[],'ration'),1);assert.equal(qty(shed(finished,s.id).storage??[],'grain'),1);assert.equal(qty(shed(finished,s.id).storage??[],'water'),1);
    assert.deepEqual(p.inventory,initial.inventory);assert.deepEqual(finished.social.accounts[s.id],f.seed.social.accounts[s.id]);
    assert.ok(m.transport?.releasedAt!==undefined);assert.equal(getManagerActiveOrders(m).length,0);
    assert.ok(shed(finished,s.id).storage!.every(lot=>lot.bound),'Tutorial inputs must keep every resulting output bound.');
    for(const b of p.habitable!.buildings){assert.equal(b.pending?.length??0,0);assert.equal(b.shipment?.cargo.length??0,0);assert.equal(b.supply?.cargo.length??0,0);}
    const expected=economy(finished,s.id,at);for(const index of[0,1]){await f.act(index,command,requestId,at);await f.read(index,at);}
    assert.deepEqual(economy(await f.state(0,at),s.id,at),expected,'A finished turn and every delivery must remain idempotent.');
    f.evidence();
  }finally{f.close();}
});
