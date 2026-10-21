import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {readPartitionedIndexHealth} from '../scripts/load-test-index-health.mjs';
import {compareLoadReports} from '../scripts/load-test-compare.mjs';

test('post-drain index health distinguishes conservation from orphan, stamp, hash and cardinality coverage failures without repairing data',async()=>{
  const db=createSqliteD1(),now=Date.parse('2026-10-17T12:30:00Z');
  try{
    for(const path of['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'])db.sqlite.exec(readFileSync(path,'utf8'));
    const world=createMvpWorld('admin',now),p=createPlayer(world,{ownerId:'own',requestId:'seed',now,actor:null},{type:'player.create',name:'Alba',stationName:'Aldea',faction:'cartographers'});settleSocial(world,now);
    world.social.ledger.push({id:'history',at:now,currency:'credits',amount:1,from:p.id,to:'npc',reason:'Coverage fixture'});
    await createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:900}).insert(world);
    const read=()=>readPartitionedIndexHealth(db.sqlite);assert.equal(read().indexHealthy,true);
    const bodies=JSON.stringify(db.sqlite.prepare('SELECT * FROM world_partition_parts ORDER BY collection,entity_id,part_index').all());
    const check=(mutate:()=>void,field:string,expected:unknown)=>{db.sqlite.exec('SAVEPOINT health_fixture');try{mutate();const health=read();assert.equal(health.indexHealthy,false);assert.equal(health[field as keyof typeof health],expected);}finally{db.sqlite.exec('ROLLBACK TO health_fixture; RELEASE health_fixture');}assert.equal(read().indexHealthy,true);};
    check(()=>db.sqlite.exec("INSERT INTO world_village_record_index SELECT realm_id,collection,'id:orphan',record_hash,owner_id,player_id,kind,status,resource_key,from_id,to_id,due_at,facts_json FROM world_village_record_index WHERE collection='events' LIMIT 1"),'orphanIndexEvents',1);
    check(()=>db.sqlite.exec('UPDATE world_village_index_state SET source_revision=source_revision-1'),'indexStampMatches',false);
    check(()=>db.sqlite.exec("UPDATE world_village_record_index SET record_hash='bad' WHERE collection='players'"),'recordHashMismatches',1);
    check(()=>db.sqlite.exec('DELETE FROM world_village_ledger_participants'),'actualParticipantCount',0);
    check(()=>db.sqlite.exec('DELETE FROM world_entity_versions WHERE entity_key=(SELECT entity_key FROM world_entity_versions LIMIT 1)'),'indexHealthy',false);
    assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM world_partition_parts ORDER BY collection,entity_id,part_index').all()),bodies);
    assert.equal(JSON.stringify(read()).includes(p.id),false,'Health observations contain counts and booleans, not player identities.');
  }finally{db.close();}
});

test('a format-six comparison cannot approve conserved goods with an absent or failed village-index gate',()=>{
  const baseline={sourceLibSha256:'same',config:{users:100},setup:{stateBytes:1},integrity:{passed:true}};
  const candidate={...baseline,formatVersion:6,storeCapabilities:{requestedVillageReads:true}};
  assert.throws(()=>compareLoadReports(baseline,candidate),/independent post-drain/);
  assert.throws(()=>compareLoadReports(baseline,{...candidate,indexIntegrity:{passed:false}}),/independent post-drain/);
  assert.throws(()=>compareLoadReports(baseline,{...candidate,indexIntegrity:{passed:true},benchmarkPassed:false}),/failed benchmark/);
});
