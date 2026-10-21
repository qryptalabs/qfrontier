import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer,weatherFor} from '../lib/mvp/world.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {cloneOperationWorld} from '../lib/mvp/operation-ids.ts';

const NOW=Date.parse('2026-10-17T22:00:00Z');
async function fixture(){
  const db=createSqliteD1();for(const path of ['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'])db.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
  const world=createMvpWorld('admin',NOW),add=(ownerId:string,name:string)=>createPlayer(world,{ownerId,now:NOW,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:name,faction:'cartographers'}),a=add('owner-a','Alba'),b=add('owner-b','Bruno');settleSocial(world,NOW);
  b.inventory[0].provenance.source='FOREIGN_PRIVATE_INVENTORY:'+('x'.repeat(1_100_000));world.jobs['huge-foreign-private-job']={id:'huge-foreign-private-job',playerId:b.id,kind:'craft',status:'completed',createdAt:NOW-1000,startsAt:NOW-1000,endsAt:NOW-1,ruleVersion:world.rulesVersion,weather:weatherFor('r_1_1',NOW),route:[b.position],costs:[],payload:{recipeId:'plank',qty:1,privateBlob:'FOREIGN_PRIVATE_JOB:'+('y'.repeat(1_100_000))},report:[]};
  const store=()=>createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:900});await store().insert(world);return{db,world,a,b,store};
}
test('a cold village read excludes unrelated megabyte inventories and jobs while declaring its exact coverage',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const before=f.db.metrics.bytesRead;f.db.clearTrace();const result=await f.store().readVillage!({ownerId:f.a.ownerId,playerId:f.a.id,now:NOW,command:{type:'craft.start',playerId:f.a.id,recipeId:'plank',qty:1},requestId:crypto.randomUUID()});assert.ok(result);assert.equal(result.kind,'village');assert.deepEqual(Object.keys(result.state.players),[f.a.id]);assert.equal(result.scope.totalPlayerCount,2);assert.equal(result.scope.identities[f.b.id].ownerId,f.b.ownerId);assert.equal(result.state.jobs['huge-foreign-private-job'],undefined);assert.equal(JSON.stringify(result).includes('FOREIGN_PRIVATE_'),false);assert.ok(f.db.metrics.bytesRead-before<300_000);assert.equal(result.entityVersions[`identidad:jugador:${f.a.id}`],1);assert.equal(Object.keys(result.state.tiles).length,81);assert.equal(Object.keys(result.state.regions).length,9);
});
test('a village delta commits without rereading foreign private state or deleting unloaded records',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.store(),snapshot=await store.readVillage!({ownerId:f.a.ownerId,playerId:f.a.id,now:NOW});assert.ok(snapshot);const next=cloneOperationWorld(snapshot.state);next.players[f.a.id].stationName='Aldea mejorada';const before=f.db.metrics.bytesRead;f.db.clearTrace();const saved=await store.commitVillage!(snapshot,next,{ownerId:f.a.ownerId,playerId:f.a.id,now:NOW});assert.ok(saved);assert.equal(saved.kind,'village');assert.equal(saved.state.players[f.a.id].stationName,'Aldea mejorada');assert.equal(saved.state.players[f.b.id],undefined);assert.ok(f.db.metrics.bytesRead-before<50_000);const all=(await f.store().read())!;assert.deepEqual(all.world.players[f.b.id],f.world.players[f.b.id]);assert.deepEqual(all.world.jobs['huge-foreign-private-job'],f.world.jobs['huge-foreign-private-job']);
});
test('a missing or stale bounded index returns an explicit fallback without reconstructing the world',async t=>{
  const f=await fixture();t.after(()=>f.db.close());f.db.sqlite.exec('DELETE FROM world_village_index_state');f.db.clearTrace();const result=await f.store().readVillage!({ownerId:f.a.ownerId,playerId:f.a.id,now:NOW});assert.equal(result,null);assert.ok(f.db.queries.every(query=>query.changes===0));
});
test('the empty candidate bootstrap keeps the declared forty-statement budget',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());for(const path of ['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'])db.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));const store=createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:40});await store.insert(createMvpWorld('admin',NOW));assert.ok(db.calls.filter(call=>call.method==='batch').every(call=>call.sql.length<=40));
});
