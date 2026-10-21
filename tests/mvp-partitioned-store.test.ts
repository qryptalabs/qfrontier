import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {hashRecord} from '../lib/mvp/partitioned-codec.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {executeMvp} from '../lib/mvp/engine.ts';
import {MvpStorageUnavailableError} from '../lib/mvp/storage-availability.ts';
import {createSqliteD1} from './support/d1-sqlite.ts';

const NOW=Date.parse('2026-10-17T18:00:00Z'),REALM='partition-tests';
const legacySchema=readFileSync(new URL('../drizzle/0000_odd_warlock.sql',import.meta.url),'utf8');
const partitionSchema=readFileSync(new URL('../db/partitioned-world.sql',import.meta.url),'utf8');
function fixture(){
  const db=createSqliteD1();db.sqlite.exec(legacySchema);db.sqlite.exec(partitionSchema);
  const world=createMvpWorld('storage-owner',NOW);
  const player=createPlayer(world,{ownerId:'storage-owner',requestId:'seed-one',now:NOW,actor:null},{type:'player.create',name:'Alba',stationName:'Aldea conservada',faction:'cartographers'});
  const other=createPlayer(world,{ownerId:'other-owner',requestId:'seed-two',now:NOW,actor:null},{type:'player.create',name:'Bruno',stationName:'Otra aldea',faction:'forgers'});
  world.events.push({id:'storage-event-a',playerId:player.id,playerName:player.name,text:'Primero',at:NOW},{id:'storage-event-b',playerId:other.id,playerName:other.name,text:'Segundo',at:NOW});
  world.receipts['storage-owner:previous-request']='a'.repeat(64);
  const store=()=>createPartitionedMvpStore(db,{realmId:REALM});
  return{db,world,player,other,store};
}
function raw(db:ReturnType<typeof createSqliteD1>){return{heads:db.sqlite.prepare('SELECT * FROM world_partition_heads ORDER BY realm_id').all(),parts:db.sqlite.prepare('SELECT * FROM world_partition_parts ORDER BY realm_id,collection,entity_id,part_index').all(),legacy:db.sqlite.prepare('SELECT * FROM world_state ORDER BY id').all()};}

test('a truly empty realm stays empty on read; insert and repeated insert preserve the whole world without mutation',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store(),original=structuredClone(f.world);assert.equal(await store.read(),null);assert.equal(f.db.queries.filter(q=>q.changes>0).length,0);
  await store.insert(f.world);assert.deepEqual(f.world,original);assert.deepEqual(await store.read(),{revision:0,world:original});const saved=raw(f.db);
  const replacement=structuredClone(f.world);replacement.players[f.player.id].stationName='No debe sustituir';await f.store().insert(replacement);assert.deepEqual(raw(f.db),saved);assert.deepEqual(await f.store().read(),{revision:0,world:original});
});

test('legacy fallback is read-only and cannot be silently migrated or replaced by insert/CAS',async t=>{
  const f=fixture();t.after(()=>f.db.close());f.db.sqlite.prepare('INSERT INTO world_state VALUES(?,?,?,?)').run(REALM,17,JSON.stringify(f.world),'original-date');const before=raw(f.db),store=f.store();
  assert.deepEqual(await store.read(),{revision:17,world:f.world});await store.insert(f.world);assert.deepEqual(await store.read(),{revision:17,world:f.world});await assert.rejects(store.compareAndSwap(17,f.world),/migración explícita/);assert.deepEqual(raw(f.db),before);
});

test('more than two megabytes of complete state round-trip through bounded rows, including order-sensitive histories',async t=>{
  const f=fixture();t.after(()=>f.db.close());for(let i=0;i<12;i++)f.world.events.push({id:`large-${i}`,playerId:f.player.id,playerName:f.player.name,text:`${i}:`+'frontera '.repeat(24000),at:NOW+i});assert.ok(Buffer.byteLength(JSON.stringify(f.world),'utf8')>2000000);
  const store=f.store();await store.insert(f.world);assert.deepEqual(await store.read(),{revision:0,world:f.world});const size=f.db.sqlite.prepare('SELECT MAX(length(CAST(body AS BLOB))) AS bytes FROM world_partition_parts').get()!;assert.ok(Number(size.bytes)<=65536);assert.ok(f.db.queries.every(q=>q.bindings.length<=100));
});

test('one oversized entity is split by UTF-8 bytes and rejoins emoji and accented text exactly',async t=>{
  const f=fixture();t.after(()=>f.db.close());const event={id:'oversized-entity',playerId:f.player.id,playerName:f.player.name,text:'ñ🌲城'.repeat(270000),at:NOW};f.world.events.push(event);assert.ok(Buffer.byteLength(JSON.stringify(event),'utf8')>2000000);
  const store=createPartitionedMvpStore(f.db,{realmId:REALM,chunkBytes:65536});await store.insert(f.world);const parts=f.db.sqlite.prepare('SELECT part_index,part_count,body FROM world_partition_parts WHERE realm_id=? AND collection=? AND entity_id=? ORDER BY part_index').all(REALM,'events','id:oversized-entity');assert.ok(parts.length>30);assert.ok(parts.every((p,i)=>p.part_index===i&&p.part_count===parts.length&&Buffer.byteLength(String(p.body),'utf8')<=65536));assert.deepEqual((await store.read())!.world,f.world);
});

test('competing request-scoped snapshots have one CAS winner and the loser performs zero child changes',async t=>{
  const f=fixture();t.after(()=>f.db.close());await f.store().insert(f.world);const a=f.store(),b=f.store();assert.ok(await a.read());assert.ok(await b.read());const one=structuredClone(f.world),two=structuredClone(f.world);one.players[f.player.id].stationName='Ganador';two.players[f.player.id].stationName='Perdedor';
  assert.equal(await a.compareAndSwap(0,one),true);const won=raw(f.db);f.db.clearTrace();assert.equal(await b.compareAndSwap(0,two),false);assert.deepEqual(raw(f.db),won);assert.equal(f.db.queries.filter(q=>/world_partition_parts/i.test(q.sql)&&q.changes>0).length,0);assert.deepEqual(await f.store().read(),{revision:1,world:one});
  const c=f.store(),d=f.store();await c.read();await d.read();const results=await Promise.all([c.compareAndSwap(1,one),d.compareAndSwap(1,two)]);assert.equal(results.filter(Boolean).length,1);assert.equal((await f.store().read())!.revision,2);
});

test('a failure after head and child mutations rolls back the real SQLite transaction in full',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);await store.read();const before=raw(f.db),next=structuredClone(f.world);next.players[f.player.id].stationName='No confirmado';
  f.db.failNext({phase:'after-statement',match:/^INSERT INTO world_partition_parts/i,error:new Error('SQLITE_CONSTRAINT: injected late failure')});await assert.rejects(store.compareAndSwap(0,next),/injected late failure/);assert.deepEqual(raw(f.db),before);assert.ok(f.db.queries.some(q=>q.rolledBack&&q.changes>0));assert.equal(await store.compareAndSwap(0,next),false,'a failed write invalidates its previously observed authority');
});

test('a failed first insert cannot leave a head, partial children or a fake new world',async t=>{
  const f=fixture();t.after(()=>f.db.close());f.db.failNext({phase:'after-statement',match:/^INSERT INTO world_partition_parts/i,error:new Error('SQLITE_CONSTRAINT: injected insert failure')});await assert.rejects(f.store().insert(f.world),/injected insert failure/);assert.deepEqual(raw(f.db),{heads:[],parts:[],legacy:[]});assert.equal(await f.store().read(),null);
});

test('a lost CAS response is not replayed and the engine resolves the same request from its committed receipt',async t=>{
  const f=fixture();t.after(()=>f.db.close());await f.store().insert(f.world);const owner='storage-owner',request=crypto.randomUUID(),command={type:'craft.start',playerId:f.player.id,recipeId:'plank',qty:1};
  f.db.failNext({phase:'after-commit',match:/UPDATE world_partition_heads/i,error:new Error('Network connection lost.')});await assert.rejects(executeMvp(f.store(),owner,command,request,undefined,NOW),MvpStorageUnavailableError);const committed=(await f.store().read())!;assert.equal(Object.keys(committed.world.players).length,2);assert.equal(Object.keys(committed.world.jobs).length,1);assert.equal(Object.keys(committed.world.receipts).filter(id=>id===`${owner}:${request}`).length,1);
  const before=raw(f.db);await executeMvp(f.store(),owner,command,request,undefined,NOW);assert.deepEqual(raw(f.db),before,'same command receipt must not repeat the economic operation or advance revision');
});

test('unchanged entities are never rewritten when one player changes',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);await store.read();f.db.sqlite.exec('CREATE TABLE writes(collection TEXT,entity_id TEXT); CREATE TRIGGER trace_part_insert AFTER INSERT ON world_partition_parts BEGIN INSERT INTO writes VALUES(NEW.collection,NEW.entity_id); END; CREATE TRIGGER trace_part_delete AFTER DELETE ON world_partition_parts BEGIN INSERT INTO writes VALUES(OLD.collection,OLD.entity_id); END; CREATE TRIGGER trace_part_update AFTER UPDATE ON world_partition_parts BEGIN INSERT INTO writes VALUES(NEW.collection,NEW.entity_id); END;');
  const original=f.db.sqlite.prepare('SELECT * FROM world_partition_parts WHERE collection<>? OR entity_id<>? ORDER BY collection,entity_id,part_index').all('players',f.player.id),next=structuredClone(f.world);next.players[f.player.id].stats.trades++;
  assert.equal(await store.compareAndSwap(0,next),true);assert.deepEqual(f.db.sqlite.prepare('SELECT DISTINCT collection,entity_id FROM writes').all().map(r=>({...r})),[{collection:'players',entity_id:f.player.id}]);assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM world_partition_parts WHERE collection<>? OR entity_id<>? ORDER BY collection,entity_id,part_index').all('players',f.player.id),original);
});

test('head, parts and legacy are read from one transaction even when another commit follows immediately',async t=>{
  const f=fixture();t.after(()=>f.db.close());await f.store().insert(f.world);const writer=f.store();await writer.read();const next=structuredClone(f.world);next.players[f.player.id].stationName='Estado posterior';let pending=true;
  f.db.afterCall=async call=>{if(pending&&call.sql.every(sql=>/^SELECT/i.test(sql))){pending=false;assert.equal(await writer.compareAndSwap(0,next),true);}};
  const record=await f.store().read();assert.deepEqual(record,{revision:0,world:f.world},'the older complete snapshot is valid; mixing its revision with newer children is not');assert.equal(pending,false);f.db.afterCall=undefined;assert.deepEqual(await f.store().read(),{revision:1,world:next});
  const reads=f.db.calls.filter(call=>call.sql.some(sql=>/^SELECT \* FROM world_partition_heads/i.test(sql)));assert.ok(reads.every(call=>call.method==='batch'&&call.sql.length===3));
});

test('realm isolation and conservative write budgets fail before modifying any stored entity',async t=>{
  const f=fixture();t.after(()=>f.db.close());await f.store().insert(f.world);const other=createPartitionedMvpStore(f.db,{realmId:'other-realm'});assert.equal(await other.read(),null);await other.insert(f.world);const before=raw(f.db),limited=createPartitionedMvpStore(f.db,{realmId:REALM,maxBatchStatements:1});await limited.read();f.db.clearTrace();const next=structuredClone(f.world);next.players[f.player.id].stationName='Fuera del presupuesto';await assert.rejects(limited.compareAndSwap(0,next),/presupuesto/);assert.equal(f.db.calls.length,0);assert.deepEqual(raw(f.db),before);
  for(const options of[{chunkBytes:1023},{chunkBytes:262145},{maxBatchStatements:0},{maxBatchStatements:901}])assert.throws(()=>createPartitionedMvpStore(f.db,options),/configuración/);
});

test('missing parts, tampered payloads, inconsistent manifests and stray children fail closed without writes',async t=>{
  const mutations=[
    'DELETE FROM world_partition_parts WHERE collection=\'players\' AND part_index=0',
    "UPDATE world_partition_parts SET body='broken' WHERE collection='players'",
    'UPDATE world_partition_heads SET record_count=record_count+1,part_count=part_count+1',
    "UPDATE world_partition_parts SET ordinal=ordinal+1 WHERE collection='events'",
    'DELETE FROM world_partition_parts WHERE collection=\'$root\'',
  ];
  for(const sql of mutations){const f=fixture();try{await f.store().insert(f.world);f.db.sqlite.exec(sql);const before=raw(f.db);await assert.rejects(f.store().read(),/inválido|incompleto|JSON|Unexpected/);assert.deepEqual(raw(f.db),before);}finally{f.db.close();}}
  const f=fixture();t.after(()=>f.db.close());f.db.sqlite.exec('PRAGMA foreign_keys=OFF');f.db.sqlite.prepare('INSERT INTO world_partition_parts VALUES(?,?,?,?,?,?,?,?)').run(REALM,'players','orphan',0,1,0,'a'.repeat(64),'{}');await assert.rejects(f.store().read(),/inválido|incompleto/);
});

test('a valid hash cannot turn a malformed root descriptor into an accepted or rewritten world',async t=>{
  const f=fixture();t.after(()=>f.db.close());await f.store().insert(f.world);const row=f.db.sqlite.prepare("SELECT body FROM world_partition_parts WHERE collection='$root'").get()!,body=JSON.parse(String(row.body));body.collections.push({...body.collections[0]});const changed=JSON.stringify(body);f.db.sqlite.prepare("UPDATE world_partition_parts SET body=?,record_hash=? WHERE collection='$root'").run(changed,await hashRecord(changed));const before=raw(f.db);await assert.rejects(f.store().read(),/inválido|incompleto/);assert.deepEqual(raw(f.db),before);
});

test('a failed integrity read revokes an older observed snapshot instead of authorizing an overwrite',async t=>{
  const f=fixture();t.after(()=>f.db.close());const store=f.store();await store.insert(f.world);await store.read();f.db.sqlite.exec("UPDATE world_partition_parts SET body='corrupt' WHERE collection='players'");await assert.rejects(store.read());const before=raw(f.db);assert.equal(await store.compareAndSwap(0,f.world),false);assert.deepEqual(raw(f.db),before);
});
