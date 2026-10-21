import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer,weatherFor} from '../lib/mvp/world.ts';
import {buildMvpView,executeMvp,readMvpView} from '../lib/mvp/engine.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {HABITABLE_SPAWN} from '../lib/mvp/habitable-data.ts';
import type {MvpWorld} from '../lib/mvp/types.ts';
import {deriveEntityValues} from '../lib/mvp/entity-versions.ts';
import {hashRecord} from '../lib/mvp/partitioned-codec.ts';

const NOW=Date.parse('2026-10-17T13:01:00Z'),REALM='player-read-fixture';
const sql=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
function fixture(withReadSchema=true){
  const db=createSqliteD1();db.exec(sql('../drizzle/0000_odd_warlock.sql'));db.exec(sql('../db/partitioned-world.sql'));if(withReadSchema)db.exec(sql('../db/player-read-model.sql'));
  const world=createMvpWorld('separate-admin',NOW),make=(ownerId:string,requestId:string)=>createPlayer(world,{ownerId,requestId,now:NOW,actor:null},{type:'player.create',name:`Explorador ${requestId}`,stationName:`Aldea ${requestId}`,faction:'cartographers'});
  const player=make('account-a','a'),second=make('account-a','a-second'),neighbor=make('account-b','b');
  for(const p of[player,neighbor]){const lot=p.inventory.pop()!;lot.id=`private-stock-${p.id}`;p.habitable={version:1,appearance:'amber',profession:'carpenter',position:{...HABITABLE_SPAWN},buildings:[{id:`shed:${p.id}`,templateId:'shed',x:-2,y:-8,rotation:0,startsAt:NOW-30000,endsAt:NOW-1000,bound:true,storage:[lot]}]};}
  settleSocial(world,NOW);
  const store=()=>createPartitionedMvpStore(db,{realmId:REALM,playerReads:true,maxBatchStatements:900});
  return{db,world,player,second,neighbor,store};
}
function allRows(db:ReturnType<typeof createSqliteD1>){return db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'world_%' ORDER BY name").all().map(row=>({name:row.name,rows:db.sqlite.prepare(`SELECT * FROM ${row.name} ORDER BY rowid`).all()}));}
async function commit(f:ReturnType<typeof fixture>,next:MvpWorld,now=NOW+1000){const store=f.store(),record=await store.read();assert.ok(record);assert.equal(await store.compareAndSwap(record.revision,next,{ownerId:'account-b',playerId:f.neighbor.id,now}),true);}

test('default adapter remains independent of the opt-in schema and capabilities',async t=>{
  const f=fixture(false);t.after(()=>f.db.close());const store=createPartitionedMvpStore(f.db,{realmId:REALM});await store.insert(f.world);assert.equal(store.capabilities,undefined);assert.equal(store.readPlayerView,undefined);assert.deepEqual(await store.read(),{revision:0,world:f.world});assert.ok(f.db.calls.every(call=>call.sql.every(statement=>!statement.includes('world_entity_versions')&&!statement.includes('world_player_view'))));
});

test('indexed player reads match the full projection and never read authoritative world parts',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);const record=await store.read();assert.ok(record?.entityVersions);assert.equal(record.entityVersions[`aldea:${f.player.id}`],1);
  const view=await store.projectPlayerView!(record,'account-a',NOW,f.player.id);assert.deepEqual(plain(view),plain(buildMvpView(f.world,0,'account-a',NOW,f.player.id)));
  f.db.clearTrace();const cached=await f.store().readPlayerView!('account-a',f.player.id,NOW+1000);assert.ok(cached);assert.equal(cached.now,NOW+1000);assert.deepEqual(plain(cached),plain(buildMvpView(f.world,0,'account-a',NOW+1000,f.player.id)));assert.equal(f.db.metrics.rowsWritten,0);assert.ok(f.db.queries.every(query=>!query.sql.includes('world_partition_parts')));assert.equal(f.db.calls.length,1);assert.ok(f.db.queries.some(query=>query.sql.includes('owner_id = ? AND selection_id = ?')));
});

test('private caches cannot cross owners or requested profiles; public actors contain only visual fields',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);const record=await store.read();assert.ok(record);await store.projectPlayerView!(record,'account-a',NOW,f.player.id);
  assert.equal(await f.store().readPlayerView!('account-b',f.player.id,NOW),null);assert.equal(await f.store().readPlayerView!('account-a',f.neighbor.id,NOW),null);await assert.rejects(store.projectPlayerView!(record,'account-a',NOW,f.neighbor.id),/no pertenece/);
  const cached=await store.readPlayerView!('account-a',f.player.id,NOW);assert.ok(cached);assert.deepEqual(cached.players.map(p=>p.id),[f.player.id,f.second.id]);const actor=cached.habitable.actors.find(a=>a.playerId===f.neighbor.id);assert.ok(actor);assert.equal(actor.state.buildings[0].storage,undefined);assert.equal(actor.state.buildings[0].constructionCosts,undefined);assert.ok(!JSON.stringify(actor).includes(`private-stock-${f.neighbor.id}`));assert.ok(!JSON.stringify(cached).includes(`private-stock-${f.neighbor.id}`));
});

test('an unrelated private edit keeps the cache valid while real neighboring improvements become visible',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);const record=await store.read();assert.ok(record);await store.projectPlayerView!(record,'account-a',NOW,f.player.id);
  const next=structuredClone(f.world);next.players[f.neighbor.id].inventory[0].qty--;next.players[f.neighbor.id].habitable!.buildings[0].level=2;await commit(f,next);
  f.db.clearTrace();const cached=await f.store().readPlayerView!('account-a',f.player.id,NOW+1000);assert.ok(cached,'neighbor private values are not account-a dependencies');assert.equal(cached.revision,1);const actor=cached.habitable.actors.find(a=>a.playerId===f.neighbor.id);assert.equal(actor?.state.buildings[0].level,2);assert.equal(actor?.state.buildings[0].visual?.capacity,160);assert.ok(f.db.queries.every(query=>!query.sql.includes('world_partition_parts')));
});

test('shared resource changes invalidate a private projection and entity counters survive ABA changes',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);const initial=await store.read();assert.ok(initial?.entityVersions);await store.projectPlayerView!(initial,'account-a',NOW,f.player.id);
  const next=structuredClone(f.world);next.social.npc.remaining--;await commit(f,next);assert.equal(await f.store().readPlayerView!('account-a',f.player.id,NOW+1000),null);const after=await f.store().read();assert.ok(after?.entityVersions);assert.equal(after.entityVersions['npc:budget'],initial.entityVersions['npc:budget']+1);
  await commit(f,f.world,NOW+2000);const restored=await f.store().read();assert.ok(restored?.entityVersions);assert.equal(restored.entityVersions['npc:budget'],initial.entityVersions['npc:budget']+2);
});

test('due work, derived boost release and UTC boundaries fall back instead of serving old eligibility',async t=>{
  const f=fixture();t.after(()=>f.db.close());const start=NOW-86_400_000+2000;
  f.world.jobs['boost-history']={id:'boost-history',playerId:f.player.id,kind:'craft',status:'cancelled',createdAt:start,startsAt:start,endsAt:start+8000,ruleVersion:f.world.rulesVersion,weather:weatherFor('r_1_1',start),route:['t_4_4'],costs:[],payload:{recipeId:'plank',qty:1,testBoost:{version:1,mode:'test',reservedAt:start,baseSeconds:10,durationSeconds:8,savedSeconds:2}},report:[]};
  const store=f.store();await store.insert(f.world);const record=await store.read();assert.ok(record);const view=await store.projectPlayerView!(record,'account-a',NOW,f.player.id);assert.equal(view.boosts.nextReleaseAt,NOW+2000);assert.ok(await store.readPlayerView!('account-a',f.player.id,NOW+1000));assert.equal(await store.readPlayerView!('account-a',f.player.id,NOW+2000),null);
  const late=Date.parse('2026-10-17T23:59:59Z');const latest=await f.store().read();assert.ok(latest);await f.store().readPlayerView!('account-a',f.player.id,late);const fresh=f.store();const freshRecord=await fresh.read();assert.ok(freshRecord);await fresh.projectPlayerView!(freshRecord,'account-a',late,f.player.id);assert.equal(await fresh.readPlayerView!('account-a',f.player.id,late+1000),null);
});

test('economic CAS, metadata counters and public geometry roll back together; losing writers publish nothing',async t=>{
  const f=fixture();t.after(()=>f.db.close());const one=f.store(),two=f.store();await one.insert(f.world);assert.ok(await one.read());assert.ok(await two.read());const before=allRows(f.db),changed=structuredClone(f.world);changed.players[f.neighbor.id].habitable!.buildings[0].level=2;
  f.db.failNext({phase:'after-statement',match:/INSERT INTO world_public_actor_heads/i,error:new Error('SQLITE_CONSTRAINT: read-plane rollback')});await assert.rejects(one.compareAndSwap(0,changed,{ownerId:'account-b',now:NOW+1000}),/read-plane rollback/);assert.deepEqual(allRows(f.db),before);
  const winner=f.store();assert.ok(await winner.read());assert.equal(await winner.compareAndSwap(0,changed,{ownerId:'account-b',now:NOW+1000}),true);const won=allRows(f.db);assert.equal(await two.compareAndSwap(0,f.world,{ownerId:'account-b',now:NOW+1000}),false);assert.deepEqual(allRows(f.db),won);
});

test('a legacy writer invalidates the read stamp and cannot restore old entity authorization through A→B→A',async t=>{
  const f=fixture();t.after(()=>f.db.close());const current=f.store();await current.insert(f.world);const first=await current.read();assert.ok(first?.entityVersions);await current.projectPlayerView!(first,'account-a',NOW,f.player.id);
  const legacy=()=>createPartitionedMvpStore(f.db,{realmId:REALM}),b=structuredClone(f.world);b.players[f.player.id].inventory[0].qty--;const old=legacy();assert.ok(await old.read());assert.equal(await old.compareAndSwap(0,b),true);const oldAgain=legacy();assert.ok(await oldAgain.read());assert.equal(await oldAgain.compareAndSwap(1,f.world),true);
  const repaired=f.store();assert.equal(await repaired.readPlayerView!('account-a',f.player.id,NOW+1000),null);const stale=await repaired.read();assert.ok(stale);assert.equal(stale.entityVersions,undefined,'stale bookkeeping must never authorize entity-scoped quotes');await repaired.projectPlayerView!(stale,'account-a',NOW+1000,f.player.id);const renewed=await repaired.read();assert.ok(renewed?.entityVersions);assert.ok(renewed.entityVersions[`aldea:${f.player.id}`]>first.entityVersions[`aldea:${f.player.id}`]);assert.ok(await repaired.readPlayerView!('account-a',f.player.id,NOW+1000));
});

test('corrupt or incomplete derived cache fails closed, leaves economic state unchanged and can be rebuilt',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);const record=await store.read();assert.ok(record);await store.projectPlayerView!(record,'account-a',NOW,f.player.id);const authoritative=f.db.sqlite.prepare('SELECT * FROM world_partition_parts ORDER BY collection,entity_id,part_index').all();
  f.db.sqlite.prepare('UPDATE world_player_view_parts SET body=? WHERE realm_id=? AND owner_id=?').run('broken',REALM,'account-a');assert.equal(await store.readPlayerView!('account-a',f.player.id,NOW),null);assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM world_partition_parts ORDER BY collection,entity_id,part_index').all(),authoritative);await store.projectPlayerView!(record,'account-a',NOW,f.player.id);assert.ok(await store.readPlayerView!('account-a',f.player.id,NOW));
  f.db.sqlite.prepare('DELETE FROM world_public_actor_parts WHERE realm_id=? AND player_id=?').run(REALM,f.neighbor.id);assert.equal(await store.readPlayerView!('account-a',f.player.id,NOW),null);
  await store.projectPlayerView!(record,'account-a',NOW,f.player.id);f.db.sqlite.prepare('DELETE FROM world_public_actor_heads WHERE realm_id=? AND player_id=?').run(REALM,f.neighbor.id);assert.equal(await store.readPlayerView!('account-a',f.player.id,NOW),null,'a missing entire foreign actor must not silently disappear');
});

test('engine fast path preserves authoritative state and still settles work after the next boundary',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);await readMvpView(store,'account-a',f.player.id,NOW);const before=allRows(f.db);f.db.clearTrace();await readMvpView(f.store(),'account-a',f.player.id,NOW+1000);assert.ok(f.db.queries.every(query=>!query.sql.includes('world_partition_parts')));assert.deepEqual(allRows(f.db),before);
  const sent=await executeMvp(f.store(),'account-a',{type:'craft.start',playerId:f.player.id,recipeId:'plank',qty:1},crypto.randomUUID(),undefined,NOW+2000),job=sent.jobs.find(j=>j.kind==='craft'&&j.status==='running');assert.ok(job);const completed=await readMvpView(f.store(),'account-a',f.player.id,job.endsAt);assert.equal(completed.jobs.find(j=>j.id===job.id)?.status,'completed');assert.equal(completed.player?.inventory.filter(l=>l.itemId==='plank').reduce((n,l)=>n+l.qty,0),1);const settled=allRows(f.db);await readMvpView(f.store(),'account-a',f.player.id,job.endsAt+1000);assert.deepEqual(allRows(f.db),settled,'a completion is not executed twice by the cached path');
});

test('private and public cache bodies are split into bounded UTF-8 parts, including long movement schedules',async t=>{
  const f=fixture();t.after(()=>f.db.close());f.neighbor.habitable!.movement={startsAt:NOW,endsAt:NOW+60000,points:Array.from({length:75},(_,i)=>({x:HABITABLE_SPAWN.x+(i%2)*.01,y:HABITABLE_SPAWN.y}))};
  const store=createPartitionedMvpStore(f.db,{realmId:REALM,playerReads:true,maxBatchStatements:900,chunkBytes:1024});await store.insert(f.world);const record=await store.read();assert.ok(record);await store.projectPlayerView!(record,'account-a',NOW,f.player.id);assert.ok(Number(f.db.sqlite.prepare('SELECT part_count FROM world_player_view_heads WHERE owner_id=?').get('account-a')!.part_count)>10);assert.ok(Number(f.db.sqlite.prepare('SELECT part_count FROM world_public_actor_heads WHERE player_id=?').get(f.neighbor.id)!.part_count)>1);assert.ok(Number(f.db.sqlite.prepare('SELECT MAX(length(CAST(body AS BLOB))) AS bytes FROM world_player_view_parts').get()!.bytes)<=1024);assert.ok(f.db.queries.every(q=>q.bindings.length<=100));assert.deepEqual(plain(await store.readPlayerView!('account-a',f.player.id,NOW)),plain(buildMvpView(f.world,0,'account-a',NOW,f.player.id)));
});

test('a version-aware writer without public projections cannot leave an old public cache looking current',async t=>{
  const f=fixture();t.after(()=>f.db.close());const initial=f.store();await initial.insert(f.world);const record=await initial.read();assert.ok(record);await initial.projectPlayerView!(record,'account-a',NOW,f.player.id);
  const writer=createPartitionedMvpStore(f.db,{realmId:REALM,metadataVersioning:true,maxBatchStatements:900}),before=await writer.read();assert.ok(before?.entityVersions);const next=structuredClone(f.world);next.players[f.neighbor.id].habitable!.buildings[0].level=2;assert.equal(await writer.compareAndSwap(before.revision,next,{ownerId:'account-b',now:NOW+1000}),true);const reader=f.store();assert.equal(await reader.readPlayerView!('account-a',f.player.id,NOW+1000),null);const fresh=await reader.read();assert.ok(fresh?.entityVersions);await reader.projectPlayerView!(fresh,'account-a',NOW+1000,f.player.id);const cached=await reader.readPlayerView!('account-a',f.player.id,NOW+1000);assert.equal(cached?.habitable.actors.find(a=>a.playerId===f.neighbor.id)?.state.buildings[0].level,2);
});

test('a coherent metadata stamp avoids semantic rehashes and bounds concurrent world digest work',async t=>{
  const f=fixture();t.after(()=>f.db.close());await f.store().insert(f.world);const expected=Number(f.db.sqlite.prepare('SELECT record_count FROM world_partition_heads WHERE realm_id=?').get(REALM)!.record_count),original=crypto.subtle.digest.bind(crypto.subtle);let active=0,peak=0;
  const digest=t.mock.method(crypto.subtle,'digest',async(...args:Parameters<typeof crypto.subtle.digest>)=>{active++;peak=Math.max(peak,active);try{return await original(...args);}finally{active--;}});
  const record=await f.store().read();assert.ok(record?.entityVersions);assert.equal(digest.mock.calls.length,expected,'only authoritative record hashes are verified; metadata hashes are already covered by the atomic stamp');assert.ok(peak<=8,`digest concurrency must stay bounded, got ${peak}`);
});

test('a matching stamp with a missing version row fails closed without recomputing or replacing metadata',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);const before=await store.read();assert.ok(before);await store.projectPlayerView!(before,'account-a',NOW,f.player.id);f.db.sqlite.prepare('DELETE FROM world_entity_versions WHERE realm_id=? AND entity_key=?').run(REALM,`aldea:${f.neighbor.id}`);const saved=allRows(f.db);
  assert.equal(await store.readPlayerView!('account-a',f.player.id,NOW),null);await assert.rejects(store.read(),/inválido|incompleto/);assert.deepEqual(allRows(f.db),saved);assert.equal(await store.compareAndSwap(before.revision,f.world,{ownerId:'account-a',now:NOW}),false);
});

test('a coherent CAS hashes only changed semantic keys and preserves untouched fingerprints',async t=>{
  const f=fixture();t.after(()=>f.db.close());await f.store().insert(f.world);const writer=createPartitionedMvpStore(f.db,{realmId:REALM,metadataVersioning:true,maxBatchStatements:900}),record=await writer.read();assert.ok(record?.entityVersions);const before=f.db.sqlite.prepare('SELECT entity_key,version,fingerprint FROM world_entity_versions ORDER BY entity_key').all(),next=structuredClone(record.world);next.players[f.player.id].inventory[0].qty--;
  const digest=t.mock.method(crypto.subtle,'digest');assert.equal(await writer.compareAndSwap(record.revision,next,{ownerId:'account-a',now:NOW+1000}),true);assert.equal(digest.mock.calls.length,3,'one changed world record plus the village and account metadata; not every metadata entity');
  const changed=new Set([`aldea:${f.player.id}`,'cuenta:account-a']),after=f.db.sqlite.prepare('SELECT entity_key,version,fingerprint FROM world_entity_versions ORDER BY entity_key').all();assert.equal(after.length,before.length);for(let i=0;i<before.length;i++){if(changed.has(String(before[i].entity_key)))assert.equal(after[i].version,Number(before[i].version)+1);else assert.deepEqual(after[i],before[i]);}
});

test('CAS rebuilds all fingerprints after an unstamped writer and retains deleted-entity tombstones',async t=>{
  const f=fixture();t.after(()=>f.db.close());await f.store().insert(f.world);const old=createPartitionedMvpStore(f.db,{realmId:REALM}),oldRecord=await old.read();assert.ok(oldRecord);const unstamped=structuredClone(oldRecord.world);unstamped.players[f.player.id].inventory[0].qty--;assert.equal(await old.compareAndSwap(oldRecord.revision,unstamped),true);
  const repaired=createPartitionedMvpStore(f.db,{realmId:REALM,metadataVersioning:true,maxBatchStatements:900}),record=await repaired.read();assert.ok(record);assert.equal(record.entityVersions,undefined);const next=structuredClone(record.world);delete next.players[f.neighbor.id];assert.equal(await repaired.compareAndSwap(record.revision,next,{ownerId:'account-a',now:NOW+1000}),true);
  const values=deriveEntityValues(next),row=(key:string)=>f.db.sqlite.prepare('SELECT version,fingerprint FROM world_entity_versions WHERE realm_id=? AND entity_key=?').get(REALM,key)!;assert.equal(row(`aldea:${f.player.id}`).fingerprint,await hashRecord(values[`aldea:${f.player.id}`]));const tombstone=row(`aldea:${f.neighbor.id}`);assert.equal(tombstone.fingerprint,await hashRecord(`deleted:aldea:${f.neighbor.id}`));
  const beforeRecreate=await repaired.read();assert.ok(beforeRecreate);const recreated=structuredClone(next);recreated.players[f.neighbor.id]=structuredClone(f.neighbor);assert.equal(await repaired.compareAndSwap(beforeRecreate.revision,recreated,{ownerId:'account-b',now:NOW+2000}),true);assert.equal(row(`aldea:${f.neighbor.id}`).version,Number(tombstone.version)+1);assert.equal(row(`aldea:${f.neighbor.id}`).fingerprint,await hashRecord(deriveEntityValues(recreated)[`aldea:${f.neighbor.id}`]));
});
