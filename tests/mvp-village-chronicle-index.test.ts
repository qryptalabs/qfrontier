import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {cloneOperationWorld} from '../lib/mvp/operation-ids.ts';

const NOW=Date.parse('2026-10-17T22:00:00Z');

test('concurrent chronicle appends at the cap keep raw rows and the bounded authority index consistent',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());
  for(const path of ['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'])db.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
  const world=createMvpWorld('admin',NOW),add=(ownerId:string,name:string)=>createPlayer(world,{ownerId,now:NOW,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:name,faction:'cartographers'}),a=add('owner-a','Alba'),b=add('owner-b','Bruno');settleSocial(world,NOW);
  world.events=Array.from({length:149},(_,index)=>({id:`seed-event-${index}`,playerId:a.id,playerName:a.name,text:`Historical event ${index}`,at:NOW-index-1}));
  // Import fixture setup may exceed the normal transaction budget; both measured commits use forty.
  await createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:900}).insert(world);
  const store=()=>createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:40}),first=store(),second=store(),qa={ownerId:a.ownerId,playerId:a.id,now:NOW},qb={ownerId:b.ownerId,playerId:b.id,now:NOW};
  const sa=await first.readVillage!(qa),sb=await second.readVillage!(qb);assert.ok(sa);assert.ok(sb);assert.equal(sa.revision,sb.revision);
  const na=cloneOperationWorld(sa.state),nb=cloneOperationWorld(sb.state);
  na.events.unshift({id:'concurrent-event-a',playerId:a.id,playerName:a.name,text:'First independent append',at:NOW});
  nb.events.unshift({id:'concurrent-event-b',playerId:b.id,playerName:b.name,text:'Second independent append',at:NOW+1});
  assert.equal(na.events.length,150);assert.equal(nb.events.length,150);
  assert.ok(await first.commitVillage!(sa,na,qa));assert.ok(await second.commitVillage!(sb,nb,qb));
  const counts=db.sqlite.prepare(`SELECT
    (SELECT record_count FROM world_partition_heads) AS head_count,
    (SELECT COUNT(*) FROM world_partition_parts WHERE part_index=0) AS raw_count,
    (SELECT record_count FROM world_village_index_state) AS stamped_index_count,
    (SELECT COUNT(*) FROM world_village_record_index) AS index_count,
    (SELECT COUNT(*) FROM world_partition_parts WHERE part_index=0 AND collection='events') AS raw_events,
    (SELECT COUNT(*) FROM world_village_record_index WHERE collection='events') AS indexed_events`).get()!;
  assert.equal(counts.raw_events,150);assert.equal(counts.indexed_events,150,'SQL chronicle trimming must remove orphan authority-index rows even when the stale local slice removed nothing.');
  assert.equal(counts.head_count,counts.raw_count);assert.equal(counts.stamped_index_count,counts.index_count);assert.equal(counts.index_count,counts.head_count);
  assert.ok(await store().readVillage!(qa));assert.ok(await store().readVillage!(qb));
  const complete=await store().read();assert.ok(complete);assert.ok(complete.world.events.some(event=>event.id==='concurrent-event-a'));assert.ok(complete.world.events.some(event=>event.id==='concurrent-event-b'));assert.deepEqual(complete.world.players,world.players);assert.deepEqual(complete.world.receipts,world.receipts);
});
