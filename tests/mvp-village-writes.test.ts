import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import type {MvpRecord} from '../lib/mvp/store.ts';
import type {MvpWorld} from '../lib/mvp/types.ts';
import {createSqliteD1} from './support/d1-sqlite.ts';

const NOW=Date.parse('2026-10-17T20:00:00Z'),REALM='village-writes';
const schemas=['../drizzle/0000_odd_warlock.sql','../db/partitioned-world.sql','../db/player-read-model.sql','../db/village-writes.sql'].map(path=>readFileSync(new URL(path,import.meta.url),'utf8'));
async function fixture(){
  const db=createSqliteD1();schemas.forEach(schema=>db.sqlite.exec(schema));
  const world=createMvpWorld('administrator',NOW);
  const a=createPlayer(world,{ownerId:'owner-a',requestId:'seed-a',now:NOW,actor:null},{type:'player.create',name:'Alba',stationName:'Bosque',faction:'cartographers'});
  const b=createPlayer(world,{ownerId:'owner-b',requestId:'seed-b',now:NOW,actor:null},{type:'player.create',name:'Bruno',stationName:'Cumbre',faction:'forgers'});
  const store=()=>createPartitionedMvpStore(db,{realmId:REALM,metadataVersioning:true,playerReads:true,villageWrites:true,maxBatchStatements:900});
  await store().insert(world);return{db,world,a,b,store};
}
function context(record:MvpRecord,world:MvpWorld,playerId:string){
  const ownerId=world.players[playerId].ownerId;
  return{now:NOW,ownerId,playerId,readVersions:Object.fromEntries(['politicas',`cuenta:${ownerId}`,`aldea:${playerId}`].map(key=>[key,record.entityVersions![key]??0]))};
}
function state(db:ReturnType<typeof createSqliteD1>){return ['world_partition_heads','world_partition_parts','world_entity_versions','world_read_model_state','world_public_actor_heads','world_public_actor_parts','world_village_write_operations'].map(table=>db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all());}
function newEvent(world:MvpWorld,playerId:string,id:string){world.events.unshift({id,playerId,playerName:world.players[playerId].name,text:`Obra ${id}`,at:NOW});world.events=world.events.slice(0,150);}

test('independent villages commit from the same snapshot and return the real merged revision',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const a=f.store(),b=f.store(),beforeA=(await a.read())!,beforeB=(await b.read())!;
  const nextA=structuredClone(beforeA.world),nextB=structuredClone(beforeB.world);nextA.players[f.a.id].stationName='Bosque ampliado';nextB.players[f.b.id].stationName='Cumbre ampliada';
  const savedA=await a.compareAndSwapVillage!(beforeA,nextA,context(beforeA,nextA,f.a.id)),savedB=await b.compareAndSwapVillage!(beforeB,nextB,context(beforeB,nextB,f.b.id));
  assert.equal(savedA?.revision,1);assert.equal(savedB?.revision,2);assert.equal(savedB!.world.players[f.a.id].stationName,'Bosque ampliado');assert.equal(savedB!.world.players[f.b.id].stationName,'Cumbre ampliada');
  assert.equal(savedB!.entityVersions![`aldea:${f.a.id}`],2);assert.equal(savedB!.entityVersions![`aldea:${f.b.id}`],2);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM world_village_write_operations').get()!.n,0);
});

test('a stale village or shared read dependency loses without child writes',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const a=f.store(),b=f.store(),ra=(await a.read())!,rb=(await b.read())!;
  const na=structuredClone(ra.world),nb=structuredClone(rb.world);na.players[f.a.id].stats.crafted++;nb.players[f.a.id].stats.crafted+=5;
  assert.ok(await a.compareAndSwapVillage!(ra,na,context(ra,na,f.a.id)));const won=state(f.db);f.db.clearTrace();assert.equal(await b.compareAndSwapVillage!(rb,nb,context(rb,nb,f.a.id)),null);assert.deepEqual(state(f.db),won);
  assert.equal(f.db.queries.filter(query=>query.changes>0).length,0);
});

test('shared root state is guarded even if the caller omits its semantic dependency',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const a=f.store(),b=f.store(),ra=(await a.read())!,rb=(await b.read())!;
  const na=structuredClone(ra.world),nb=structuredClone(rb.world);na.social.npc.remaining--;nb.social.npc.remaining-=2;na.players[f.a.id].stats.trades++;nb.players[f.b.id].stats.trades++;
  assert.ok(await a.compareAndSwapVillage!(ra,na,context(ra,na,f.a.id)));const won=state(f.db);assert.equal(await b.compareAndSwapVillage!(rb,nb,context(rb,nb,f.b.id)),null);assert.deepEqual(state(f.db),won);
});

test('concurrent chronicle and ledger appends retain both histories and distinct receipts',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const a=f.store(),b=f.store(),ra=(await a.read())!,rb=(await b.read())!;
  const na=structuredClone(ra.world),nb=structuredClone(rb.world);newEvent(na,f.a.id,'event-a');newEvent(nb,f.b.id,'event-b');
  na.social.ledger.push({id:'ledger-a',at:NOW,currency:'credits',amount:1,from:f.a.id,to:'sink',reason:'A'});nb.social.ledger.push({id:'ledger-b',at:NOW,currency:'credits',amount:1,from:f.b.id,to:'sink',reason:'B'});
  na.receipts['owner-a:request-a']='a'.repeat(64);nb.receipts['owner-b:request-b']='b'.repeat(64);
  assert.ok(await a.compareAndSwapVillage!(ra,na,context(ra,na,f.a.id)));const saved=await b.compareAndSwapVillage!(rb,nb,context(rb,nb,f.b.id));assert.ok(saved);
  assert.ok(saved.world.events.some(event=>event.id==='event-a'));assert.ok(saved.world.events.some(event=>event.id==='event-b'));assert.deepEqual(new Set(saved.world.social.ledger.map(entry=>entry.id)),new Set(['ledger-a','ledger-b']));
  assert.equal(saved.world.receipts['owner-a:request-a'],'a'.repeat(64));assert.equal(saved.world.receipts['owner-b:request-b'],'b'.repeat(64));
});

test('the bounded chronicle keeps 150 events without erasing a concurrent new event',async t=>{
  const f=await fixture();t.after(()=>f.db.close());let seed=f.store();const initial=(await seed.read())!,base=structuredClone(initial.world);for(let i=0;i<150;i++)newEvent(base,f.a.id,`old-${i}`);assert.equal(await seed.compareAndSwap(initial.revision,base,{now:NOW,ownerId:'owner-a'}),true);
  seed=f.store();const other=f.store(),ra=(await seed.read())!,rb=(await other.read())!,na=structuredClone(ra.world),nb=structuredClone(rb.world);newEvent(na,f.a.id,'new-a');newEvent(nb,f.b.id,'new-b');
  assert.ok(await seed.compareAndSwapVillage!(ra,na,context(ra,na,f.a.id)));const saved=await other.compareAndSwapVillage!(rb,nb,context(rb,nb,f.b.id));assert.equal(saved!.world.events.length,150);assert.ok(saved!.world.events.some(event=>event.id==='new-a'));assert.ok(saved!.world.events.some(event=>event.id==='new-b'));
});

test('a late SQL failure rolls back records, versions, projections, revision and operation authority',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.store(),record=(await store.read())!,next=structuredClone(record.world);next.players[f.a.id].stationName='No confirmado';newEvent(next,f.a.id,'rolled-back-event');next.receipts['owner-a:rollback']='c'.repeat(64);const before=state(f.db);
  f.db.failNext({phase:'after-statement',match:/UPDATE world_read_model_state SET source_revision/,error:new Error('late village failure')});await assert.rejects(store.compareAndSwapVillage!(record,next,context(record,next,f.a.id)),/late village failure/);assert.deepEqual(state(f.db),before);assert.equal(await store.compareAndSwapVillage!(record,next,context(record,next,f.a.id)),null);
});

test('a lost commit acknowledgement leaves one authoritative receipt and no lock row',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.store(),record=(await store.read())!,next=structuredClone(record.world);next.players[f.a.id].stats.crafted++;next.receipts['owner-a:lost-ack']='d'.repeat(64);
  f.db.failNext({phase:'after-commit',match:/INSERT INTO world_village_write_operations/,error:new Error('Network connection lost')});await assert.rejects(store.compareAndSwapVillage!(record,next,context(record,next,f.a.id)));const saved=(await f.store().read())!;assert.equal(saved.world.players[f.a.id].stats.crafted,1);assert.equal(saved.world.receipts['owner-a:lost-ack'],'d'.repeat(64));assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM world_village_write_operations').get()!.n,0);
});

test('cross-village exchange changes both inventories and escrow in the same atomic batch',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.store(),record=(await store.read())!,next=structuredClone(record.world),source=next.players[f.a.id].inventory.find(lot=>lot.itemId==='timber')!;
  const moved={...structuredClone(source),id:'trade-transfer',qty:1};source.qty--;next.players[f.b.id].inventory.push(moved);next.receipts['owner-a:exchange']='e'.repeat(64);const ctx=context(record,next,f.a.id);ctx.readVersions[`aldea:${f.b.id}`]=record.entityVersions![`aldea:${f.b.id}`];
  const before=state(f.db);f.db.failNext({phase:'after-statement',match:/INSERT INTO world_partition_parts/,error:new Error('exchange crash')});await assert.rejects(store.compareAndSwapVillage!(record,next,ctx),/exchange crash/);assert.deepEqual(state(f.db),before);
  const retry=f.store(),fresh=(await retry.read())!,saved=await retry.compareAndSwapVillage!(fresh,next,context(fresh,next,f.a.id));assert.ok(saved);assert.equal(saved.world.players[f.a.id].inventory.find(lot=>lot.id===source.id)!.qty,source.qty);assert.equal(saved.world.players[f.b.id].inventory.find(lot=>lot.id==='trade-transfer')!.qty,1);
});

test('readset omissions and foreign ownership cannot create scoped write authority',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.store(),record=(await store.read())!,next=structuredClone(record.world);next.players[f.a.id].stats.crafted++;const ctx=context(record,next,f.a.id),before=state(f.db);delete ctx.readVersions['politicas'];await assert.rejects(store.compareAndSwapVillage!(record,next,ctx),/conjunto completo/);await assert.rejects(store.compareAndSwapVillage!(record,next,{...context(record,next,f.a.id),ownerId:'attacker'}),/propietario/);assert.deepEqual(state(f.db),before);
});

test('the default adapter never enables village writes or silently selects a new backend',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const legacy=createPartitionedMvpStore(f.db,{realmId:REALM});assert.equal(legacy.compareAndSwapVillage,undefined);assert.equal(legacy.capabilities?.villageWrites,undefined);assert.ok(await legacy.read());
});

test('scoped lineage fingerprints are explicit and an unstamped legacy writer still invalidates old authority',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.store(),record=(await store.read())!,next=structuredClone(record.world);next.players[f.a.id].stats.crafted++;
  const saved=await store.compareAndSwapVillage!(record,next,context(record,next,f.a.id));assert.ok(saved);const marker=f.db.sqlite.prepare('SELECT fingerprint FROM world_entity_versions WHERE realm_id=? AND entity_key=?').get(REALM,`aldea:${f.a.id}`)!.fingerprint;assert.match(String(marker),/^delta:[a-f0-9]{64}$/);
  const stale=f.store(),staleRecord=(await stale.read())!,legacy=createPartitionedMvpStore(f.db,{realmId:REALM,maxBatchStatements:900}),legacyRecord=(await legacy.read())!,foreign=structuredClone(legacyRecord.world);foreign.players[f.b.id].stationName='Cambio antiguo';assert.equal(await legacy.compareAndSwap(legacyRecord.revision,foreign),true);
  const rejected=structuredClone(staleRecord.world);rejected.players[f.a.id].stats.crafted++;assert.equal(await stale.compareAndSwapVillage!(staleRecord,rejected,context(staleRecord,rejected,f.a.id)),null);
  const repairing=f.store(),repairRecord=(await repairing.read())!;assert.equal(repairRecord.entityVersions,undefined);await repairing.projectPlayerView!(repairRecord,'owner-a',NOW,f.a.id);const repaired=(await f.store().read())!;assert.ok(repaired.entityVersions![`aldea:${f.a.id}`]>saved.entityVersions![`aldea:${f.a.id}`]);assert.equal(repaired.world.players[f.b.id].stationName,'Cambio antiguo');
});

test('metadata deleted after a read cannot be blessed by an unrelated village commit',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.store(),record=(await store.read())!,next=structuredClone(record.world);next.players[f.a.id].stats.crafted++;
  f.db.sqlite.prepare('DELETE FROM world_entity_versions WHERE realm_id=? AND entity_key=?').run(REALM,`cuenta:${f.b.ownerId}`);const broken=state(f.db);f.db.clearTrace();assert.equal(await store.compareAndSwapVillage!(record,next,context(record,next,f.a.id)),null);assert.deepEqual(state(f.db),broken);assert.equal(f.db.queries.filter(query=>query.changes>0).length,0);
});

test('a public actor deleted after a read cannot be hidden by restamping an unrelated commit',async t=>{
  const f=await fixture();t.after(()=>f.db.close());const store=f.store(),record=(await store.read())!,next=structuredClone(record.world);next.players[f.a.id].stats.crafted++;
  f.db.sqlite.prepare('DELETE FROM world_public_actor_heads WHERE realm_id=? AND player_id=?').run(REALM,f.b.id);const broken=state(f.db);f.db.clearTrace();assert.equal(await store.compareAndSwapVillage!(record,next,context(record,next,f.a.id)),null);assert.deepEqual(state(f.db),broken);assert.equal(f.db.queries.filter(query=>query.changes>0).length,0);
});
