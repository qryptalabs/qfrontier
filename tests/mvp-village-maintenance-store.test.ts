import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {dispatchProduction,settleProduction} from '../lib/mvp/production.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {cloneOperationWorld} from '../lib/mvp/operation-ids.ts';
import type {VillageReadOutcome} from '../lib/mvp/village-snapshot.ts';

const NOW=Date.parse('2026-10-17T22:00:00Z');
async function fixture(){
  const db=createSqliteD1();for(const path of['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'])db.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
  const world=createMvpWorld('admin',NOW),add=(ownerId:string,name:string)=>createPlayer(world,{ownerId,now:NOW,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:name,faction:'cartographers'}),a=add('owner-a','Alba'),b=add('owner-b','Bruno'),c=add('owner-c','Clara');settleSocial(world,NOW);
  const forest=Object.values(world.tiles).find(tile=>tile.deposits.some(deposit=>deposit.itemId==='timber'))!;b.position=forest.id;b.surveyed.push(forest.id);
  dispatchProduction(world,{type:'mining.reserve',playerId:b.id,tileId:forest.id,itemId:'timber',qty:1},{ownerId:b.ownerId,actor:b,now:NOW,requestId:crypto.randomUUID()});
  dispatchProduction(world,{type:'craft.start',playerId:c.id,recipeId:'plank',qty:1},{ownerId:c.ownerId,actor:c,now:NOW,requestId:crypto.randomUUID()});
  const extract=Object.values(world.jobs).find(job=>job.playerId===b.id)!,otherCraft=Object.values(world.jobs).find(job=>job.playerId===c.id)!,now=otherCraft.endsAt+1,outcomes:VillageReadOutcome[]=[];
  const factory=(observe:(outcome:VillageReadOutcome)=>void=value=>outcomes.push(value))=>createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:40,onVillageReadOutcome:observe});await factory().insert(createMvpWorld('admin',NOW));const setup=factory(),empty=await setup.read();assert.ok(empty);assert.equal(await setup.compareAndSwap(empty.revision,world),true);
  return{db,world,a,b,c,extract,otherCraft,now,outcomes,factory,query:{ownerId:a.ownerId,playerId:a.id,now}};
}

test('an internal maintenance grant closes the real extractor without projecting or changing the requester and unrelated private jobs',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.factory();assert.equal(await store.readVillage!(f.query),null);assert.deepEqual(f.outcomes.at(-1),{operation:'village',result:'fallback',reason:'shared-deadline'});
  f.db.clearTrace();const pending=await store.readVillageMaintenance!(f.query);assert.ok(pending?.kind==='village-maintenance');assert.equal(pending.kind,'village-maintenance');assert.equal(pending.snapshot.scope.mode,'maintenance');assert.equal(pending.snapshot.scope.ownerId,f.b.ownerId);assert.deepEqual(Object.keys(pending.snapshot.state.players),[f.b.id]);assert.deepEqual(pending.leases,[{kind:'extract',id:f.extract.id,playerId:f.b.id,dueAt:f.extract.endsAt}]);
  assert.equal(f.db.calls.filter(call=>call.method==='batch').length,1,'The preceding failed read already supplied current selection metadata.');
  assert.equal(await store.commitVillage!(pending.snapshot,cloneOperationWorld(pending.snapshot.state),{...f.query}),null);
  assert.throws(()=>store.projectVillageView!(pending.snapshot,f.b.ownerId,f.now,f.b.id),/no se puede proyectar/);
  const next=cloneOperationWorld(pending.snapshot.state);settleProduction(next,f.now,undefined,f.b.id);settleSocial(next,f.now,f.b.id);assert.equal(await store.commitVillageMaintenance!(pending,next),true);assert.equal(await store.commitVillageMaintenance!(pending,next),false);
  const requester=await f.factory().readVillage!(f.query);assert.ok(requester);assert.equal(requester.state.players[f.b.id],undefined);assert.deepEqual(requester.state.players[f.a.id],f.world.players[f.a.id]);
  const complete=await f.factory().read();assert.ok(complete);assert.equal(complete.world.jobs[f.extract.id].status,'completed');assert.deepEqual(complete.world.jobs[f.otherCraft.id],f.world.jobs[f.otherCraft.id]);assert.deepEqual(complete.world.players[f.c.id],f.world.players[f.c.id]);assert.equal(complete.world.players[f.b.id].inventory.filter(lot=>lot.provenance.source.endsWith(`:${f.extract.id}`)).reduce((sum,lot)=>sum+lot.qty,0),1);assert.deepEqual(complete.world.receipts,f.world.receipts);
});

test('two grants for the same due participant cannot both settle its resource reservation',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const first=f.factory(),second=f.factory(),a=await first.readVillageMaintenance!(f.query),b=await second.readVillageMaintenance!(f.query);assert.ok(a?.kind==='village-maintenance'&&b?.kind==='village-maintenance');
  const advance=(record:typeof a)=>{const next=cloneOperationWorld(record.snapshot.state);settleProduction(next,f.now,undefined,f.b.id);settleSocial(next,f.now,f.b.id);return next;};assert.equal(await first.commitVillageMaintenance!(a,advance(a)),true);assert.equal(await second.commitVillageMaintenance!(b,advance(b)),false);
  const complete=await f.factory().read();assert.ok(complete);const tileId=String(f.extract.payload.tileId),itemId=f.extract.payload.itemId,layerId=f.extract.payload.layerId,before=f.world.tiles[tileId].deposits.find(deposit=>deposit.itemId===itemId)!.layers.find(layer=>layer.id===layerId)!,after=complete.world.tiles[tileId].deposits.find(deposit=>deposit.itemId===itemId)!.layers.find(layer=>layer.id===layerId)!;assert.equal(after.remaining,before.remaining-1);assert.equal(after.reserved,before.reserved-1);assert.equal(after.extracted,before.extracted+1);
});

test('maintenance does not accept user commands or action receipts and failed reads revoke previous grants',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.factory();assert.equal(await store.readVillageMaintenance!({...f.query,command:{type:'npc.sell'}}as typeof f.query),null);
  const grant=await store.readVillageMaintenance!(f.query);assert.ok(grant?.kind==='village-maintenance');const withReceipt=cloneOperationWorld(grant.snapshot.state);withReceipt.receipts['owner-a:forbidden']='x';await assert.rejects(store.commitVillageMaintenance!(grant,withReceipt),/recibo de acción/);assert.equal(await store.commitVillageMaintenance!(grant,cloneOperationWorld(grant.snapshot.state)),false);
  const second=await store.readVillageMaintenance!(f.query);assert.ok(second?.kind==='village-maintenance');f.db.failNext({phase:'before-statement',statementIndex:0,error:new Error('maintenance-read-fault')});await assert.rejects(store.readVillageMaintenance!(f.query),/maintenance-read-fault/);assert.equal(await store.commitVillageMaintenance!(second,cloneOperationWorld(second.snapshot.state)),false);assert.deepEqual((await f.factory().read())!.world,f.world);
});

test('fallback observation contains only enumerated outcomes and observer errors cannot change authority',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const diagnostics:VillageReadOutcome[]=[],store=f.factory(value=>{diagnostics.push(value);throw new Error('ignored diagnostics failure');});assert.equal(await store.readVillage!(f.query),null);const grant=await store.readVillageMaintenance!(f.query);assert.ok(grant?.kind==='village-maintenance');assert.equal(diagnostics.length,2);for(const result of diagnostics)assert.deepEqual(Object.keys(result).sort(),['operation','reason','result']);assert.equal(JSON.stringify(diagnostics).includes(f.b.ownerId),false);
});

test('an index missing the separate social version fails closed instead of fabricating a fresh projection dependency',async t=>{
  const f=await fixture();t.after(()=>f.db.close());f.db.sqlite.exec("DELETE FROM world_entity_versions WHERE entity_key='lectura:social'; UPDATE world_read_model_state SET entity_count=entity_count-1");assert.equal(await f.factory().readVillageMaintenance!(f.query),null);
});

test('a concurrent completed lease returns a read-only retry instead of falling back to a global world',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const losingReader=f.factory(),winner=f.factory();assert.equal(await losingReader.readVillage!(f.query),null);const grant=await winner.readVillageMaintenance!(f.query);assert.ok(grant?.kind==='village-maintenance');const next=cloneOperationWorld(grant.snapshot.state);settleProduction(next,f.now,undefined,f.b.id);settleSocial(next,f.now,f.b.id);assert.equal(await winner.commitVillageMaintenance!(grant,next),true);
  const retry=await losingReader.readVillageMaintenance!(f.query);assert.deepEqual(retry,{kind:'village-maintenance-retry'});assert.equal(Object.isFrozen(retry),true);assert.deepEqual(f.outcomes.at(-1),{operation:'maintenance',result:'retry',reason:'maintenance-race'});assert.ok(await losingReader.readVillage!(f.query));
});

test('unsupported commands retain their own rejection and cannot trigger a maintenance cold lookup',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.factory();f.db.clearTrace();assert.equal(await store.readVillage!({...f.query,command:{type:'market.fill',playerId:f.a.id,offerId:'unreviewed'}}),null);assert.equal(await store.readVillageMaintenance!(f.query),null);assert.equal(f.db.calls.length,0);assert.deepEqual(f.outcomes.slice(-2),[{operation:'village',result:'fallback',reason:'unsupported-command'},{operation:'maintenance',result:'fallback',reason:'unsupported-command'}]);
});

