import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer,weatherFor} from '../lib/mvp/world.ts';
import {dispatchSocial,settleSocial} from '../lib/mvp/social.ts';
import type {MvpWorld,Player} from '../lib/mvp/types.ts';
import type {HabitableTrade} from '../lib/mvp/habitable-commerce.ts';

const NOW=Date.parse('2026-10-17T22:00:00Z');
const schemas=['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'];
function profile(player:Player){return player.habitable??={version:1,appearance:'amber',profession:'carpenter',position:{x:0,y:1.5},buildings:[]};}
function extractor(world:MvpWorld,player:Player,endsAt:number){world.jobs['shared-extractor']={id:'shared-extractor',playerId:player.id,kind:'extract',status:'running',createdAt:NOW-1000,startsAt:NOW-1000,endsAt,ruleVersion:world.rulesVersion,weather:weatherFor('r_1_1',NOW),route:[player.position],costs:[],payload:{tileId:'t_0_0',itemId:'timber',qty:1},report:[]};}
function completedTrade(player:Player):HabitableTrade{return{id:'fleet-one',buildingId:'shed-one',status:'completed',quantity:2,price:12,escrow:0,acceptedAt:NOW-5000,deadline:NOW+5000,cargo:[],caravan:{id:'caravan-one',playerId:player.id,plot:{x:0,y:0},destination:{name:'Distrito',x:10,y:10},route:{points:[],length:0,bridges:[]},approachStartsAt:NOW-5000,approachEndsAt:NOW-4000,quantity:2}};}
async function fixture(prepare?:(world:MvpWorld,a:Player,b:Player)=>void){
  const db=createSqliteD1();for(const path of schemas)db.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
  const world=createMvpWorld('admin',NOW),add=(ownerId:string,name:string)=>createPlayer(world,{ownerId,now:NOW,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:name,faction:'cartographers'}),a=add('owner-a','Alba'),b=add('owner-b','Bruno');settleSocial(world,NOW);prepare?.(world,a,b);
  const store=(villageReads=true)=>createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,villageReads,maxBatchStatements:900});await store().insert(world);return{db,world,a,b,store,query:{ownerId:a.ownerId,playerId:a.id,now:NOW}};
}

test('administrators and owners with current clan membership explicitly retain the complete transaction path',async()=>{
  for(const mode of['admin','clan']as const){const f=await fixture((world,a)=>{if(mode==='admin')world.adminOwnerId=a.ownerId;else{world.social.accounts[a.id].credits=100;dispatchSocial(world,{type:'clan.create',playerId:a.id,name:'Historical members'},{ownerId:a.ownerId,actor:a,now:NOW,requestId:crypto.randomUUID()});}});try{assert.equal(await f.store().readVillage!(f.query),null);}finally{f.db.close();}}
});

test('an alternate own profile cannot keep shared extraction or district leases alive past their deadline',async()=>{
  for(const mode of['extract','district']as const){const f=await fixture((world,a)=>{const alternate=createPlayer(world,{ownerId:a.ownerId,now:NOW,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name:'Alterna',stationName:'Segundo hogar',faction:'cartographers'});settleSocial(world,NOW);if(mode==='extract')extractor(world,alternate,NOW+10);else profile(alternate).job={id:'district-lease',status:'active',escrow:1,rewardCredits:16,acceptedAt:NOW-1000,expiresAt:NOW+10,sourceTileId:'t_0_0',layerId:'layer',timberQty:1,plankQty:1,reservedTimber:1,harvested:false};});try{const before=await f.store().readVillage!(f.query);assert.ok(before);assert.equal(before.scope.nextSharedDueAt,NOW+10);assert.equal(await f.store().readVillage!({...f.query,now:NOW+10}),null);}finally{f.db.close();}}
});

test('a missing fleet-fact group is incomplete evidence rather than an empty shared fleet',async t=>{
  const f=await fixture((_world,_a,b)=>{profile(b).commerce={contracts:[completedTrade(b)],sequence:1};});t.after(()=>f.db.close());const snapshot=await f.store().readVillage!(f.query);assert.ok(snapshot);assert.equal(snapshot.scope.commerceFleet.length,1);f.db.sqlite.exec('DELETE FROM world_village_fact_parts');assert.equal(await f.store().readVillage!(f.query),null);
});

test('historical incoming battles cannot disappear from the owner reports through a filtered attacker-only slice',async t=>{
  const f=await fixture((world,a,b)=>{world.battles.incoming={id:'incoming',attackerId:b.id,targetId:a.id,npc:false,convoyId:null,status:'resolved',jobId:'historical-job',rounds:[],winnerId:a.id,loot:[],report:['Defensa conservada'],resolvedAt:NOW-1};});t.after(()=>f.db.close());assert.equal(await f.store().readVillage!(f.query),null);
});

test('duplicate or noncanonical imported plots require the deterministic global repair path',async()=>{
  for(const mode of['duplicate','noncanonical']as const){const f=await fixture((_world,a,b)=>{if(mode==='duplicate')b.settlement=structuredClone(a.settlement);else b.settlement!.x++;});try{assert.equal(await f.store().readVillage!(f.query),null);}finally{f.db.close();}}
});

test('a later complete CAS cannot bless an unindexed legacy-writer interval using only its own delta',async t=>{
  const f=await fixture((world,_a,b)=>extractor(world,b,NOW+10_000));t.after(()=>f.db.close());const old=f.store(false),before=await old.read();assert.ok(before);before.world.jobs['shared-extractor'].status='completed';before.world.jobs['shared-extractor'].payload.itemId='stone';assert.equal(await old.compareAndSwap(before.revision,before.world),true);assert.equal(await f.store().readVillage!(f.query),null);
  const current=f.store(),full=await current.read();assert.ok(full);full.world.players[f.a.id].stationName='Cambio independiente';assert.equal(await current.compareAndSwap(full.revision,full.world),true);assert.equal(await f.store().readVillage!(f.query),null,'Only an explicit complete index rebuild may close the unknown interval.');assert.equal((await f.store().read())!.world.jobs['shared-extractor'].status,'completed');
});

test('large fleet facts use bounded JSON values and preserve their exact UTF-8 bytes',async t=>{
  const marker='🌊'.repeat(550_000),f=await fixture((_world,_a,b)=>{const trade=completedTrade(b);trade.cargo=[structuredClone(b.inventory[0])];trade.cargo[0].provenance.source=marker;profile(b).commerce={contracts:[trade],sequence:1};});t.after(()=>f.db.close());const bindings=f.db.queries.flatMap(query=>query.bindings).filter((value):value is string=>typeof value==='string');assert.ok(bindings.every(value=>Buffer.byteLength(value,'utf8')<=2_000_000));const loaded=await f.store().readVillage!(f.query);assert.ok(loaded);assert.equal(loaded.scope.commerceFleet[0].cargo[0].provenance.source,marker);
});

test('a missing ledger-participant relation revokes covered history and write authority without changing the main index stamp',async t=>{
  const f=await fixture((world,a)=>{world.social.ledger.push({id:'owned-history',at:NOW,currency:'credits',amount:1,from:a.id,to:'npc',reason:'History coverage probe'});});t.after(()=>f.db.close());
  const store=f.store(),covered=await store.readVillage!(f.query);assert.ok(covered);assert.ok(covered.state.social.ledger.some(entry=>entry.id==='owned-history'));
  const stamp=f.db.sqlite.prepare('SELECT * FROM world_village_index_state').get(),bodies=()=>JSON.stringify(f.db.sqlite.prepare('SELECT * FROM world_partition_parts ORDER BY collection,entity_id,part_index').all()),before=bodies();
  const deleted=f.db.sqlite.prepare("DELETE FROM world_village_ledger_participants WHERE player_id=? AND entity_id='id:owned-history'").run(f.a.id);assert.equal(deleted.changes,1);assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM world_village_index_state').get(),stamp);
  assert.equal(await f.store().readVillage!(f.query),null,'Incomplete relation coverage cannot certify ownLedger:true.');
  const proposed=structuredClone(covered.state);proposed.players[f.a.id].name+=' must not save';assert.equal(await store.commitVillage!(covered,proposed,f.query),null,'A relationship deleted after the original read cannot authorize a delta.');assert.equal(bodies(),before);
  const global=f.store(),complete=await global.read();assert.ok(complete);complete.world.players[f.b.id].stationName+=' independent';assert.equal(await global.compareAndSwap(complete.revision,complete.world),true);assert.equal(await f.store().readVillage!(f.query),null,'An unrelated complete CAS cannot bless the damaged relationship index.');
});
