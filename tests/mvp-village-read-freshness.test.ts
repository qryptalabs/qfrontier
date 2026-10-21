import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {executeMvp,readMvpView} from '../lib/mvp/engine.ts';
import {HABITABLE_SPAWN} from '../lib/mvp/habitable-data.ts';
import {give} from '../lib/mvp/helpers.ts';
import {createSqliteD1} from './support/d1-sqlite.ts';
import type {MvpWorld,Player} from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-17T20:00:00Z');
async function fixture(configure?:(world:MvpWorld,a:Player,b:Player)=>void){
  const db=createSqliteD1();for(const path of ['../drizzle/0000_odd_warlock.sql','../db/partitioned-world.sql','../db/player-read-model.sql','../db/village-writes.sql'])db.sqlite.exec(readFileSync(new URL(path,import.meta.url),'utf8'));
  const world=createMvpWorld('administrator',NOW),add=(ownerId:string,name:string)=>createPlayer(world,{ownerId,requestId:crypto.randomUUID(),now:NOW,actor:null},{type:'player.create',name,stationName:name,faction:'cartographers'}),a=add('owner-a','Alba'),b=add('owner-b','Bruno');
  b.habitable={version:1,appearance:'amber',profession:'carpenter',position:{...HABITABLE_SPAWN},buildings:[]};configure?.(world,a,b);
  const store=()=>createPartitionedMvpStore(db,{playerReads:true,villageWrites:true,maxBatchStatements:900});await store().insert(world);return{db,world,a,b,store};
}

test('an offline neighbor with overdue private work does not prevent another village from serving a warm read',async t=>{
  const f=await fixture();t.after(()=>f.db.close());await executeMvp(f.store(),f.b.ownerId,{type:'craft.start',playerId:f.b.id,recipeId:'plank',qty:1},crypto.randomUUID(),undefined,NOW);
  const pending=(await f.store().read())!,job=Object.values(pending.world.jobs).find(job=>job.playerId===f.b.id)!,at=job.endsAt+1;
  await readMvpView(f.store(),f.a.ownerId,f.a.id,at);const confirmed=(await f.store().read())!;
  assert.equal(confirmed.world.jobs[job.id].status,'running');assert.equal(confirmed.world.players[f.b.id].stats.crafted,0);const before=JSON.stringify(confirmed);
  f.db.clearTrace();const warm=await f.store().readPlayerView!(f.a.ownerId,f.a.id,at);assert.ok(warm);assert.equal(warm.player!.id,f.a.id);assert.ok(warm.habitable.actors.some(actor=>actor.playerId===f.b.id));assert.ok(f.db.queries.every(query=>!query.sql.includes('world_partition_parts')));
  assert.equal(JSON.stringify(await f.store().read()),before,'Serving a neighbor projection cannot settle or mutate the offline village.');
});

test('own due work still invalidates its private cache and settles once despite another overdue village',async t=>{
  const f=await fixture();t.after(()=>f.db.close());for(const player of[f.a,f.b])await executeMvp(f.store(),player.ownerId,{type:'craft.start',playerId:player.id,recipeId:'plank',qty:1},crypto.randomUUID(),undefined,NOW);
  const running=(await f.store().read())!,jobs=Object.values(running.world.jobs),at=Math.max(...jobs.map(job=>job.endsAt))+1;await readMvpView(f.store(),f.a.ownerId,f.a.id,NOW);
  assert.equal(await f.store().readPlayerView!(f.a.ownerId,f.a.id,at),null,'An own completion must require authoritative settlement.');
  const view=await readMvpView(f.store(),f.a.ownerId,f.a.id,at);assert.equal(view.player!.stats.crafted,1);const after=(await f.store().read())!;assert.equal(after.world.jobs[jobs.find(job=>job.playerId===f.a.id)!.id].status,'completed');assert.equal(after.world.jobs[jobs.find(job=>job.playerId===f.b.id)!.id].status,'running');
  assert.ok(await f.store().readPlayerView!(f.a.ownerId,f.a.id,at));const revision=after.revision;await readMvpView(f.store(),f.a.ownerId,f.a.id,at+1);assert.equal((await f.store().read())!.revision,revision);
});

test('future public animation boundaries refresh geometry without inventing a foreign economic completion',async t=>{
  const f=await fixture((_world,_a,b)=>{b.habitable!.movement={startsAt:NOW,endsAt:NOW+2000,points:[{...HABITABLE_SPAWN},{x:HABITABLE_SPAWN.x+1,y:HABITABLE_SPAWN.y}]};});t.after(()=>f.db.close());
  await readMvpView(f.store(),f.a.ownerId,f.a.id,NOW);assert.ok(await f.store().readPlayerView!(f.a.ownerId,f.a.id,NOW+1000));assert.equal(await f.store().readPlayerView!(f.a.ownerId,f.a.id,NOW+2000),null,'A future public movement endpoint must refresh the actor projection.');
  const before=(await f.store().read())!,at=NOW+2001;await readMvpView(f.store(),f.a.ownerId,f.a.id,at);const warm=await f.store().readPlayerView!(f.a.ownerId,f.a.id,at);assert.ok(warm);assert.equal(warm.habitable.actors.find(actor=>actor.playerId===f.b.id)!.state.movement!.endsAt,NOW+2000);assert.deepEqual((await f.store().read())!.world.players[f.b.id],before.world.players[f.b.id]);
});

test('food expiry hidden inside a foreign offer wakes shared settlement before the public offer deadline',async t=>{
  const f=await fixture((world,_a,b)=>{const lot=give(b,'ration',1,NOW,'existing-market-food',[],false);b.inventory.splice(b.inventory.indexOf(lot),1);lot.expiresAt=NOW+1000;world.social.offers.push({id:'food-expiry-cache',makerId:b.id,mode:'credits',itemId:'ration',qty:1,lots:[lot],wantItemId:null,wantQty:0,price:5,fee:0,status:'open',createdAt:NOW,expiresAt:NOW+86_400_000,takerId:null});});t.after(()=>f.db.close());
  await readMvpView(f.store(),f.a.ownerId,f.a.id,NOW);assert.ok(await f.store().readPlayerView!(f.a.ownerId,f.a.id,NOW+500));assert.equal(await f.store().readPlayerView!(f.a.ownerId,f.a.id,NOW+1000),null);
  const view=await readMvpView(f.store(),f.a.ownerId,f.a.id,NOW+1001);assert.equal(view.social.offers.find(offer=>offer.id==='food-expiry-cache')!.status,'expired');assert.ok(await f.store().readPlayerView!(f.a.ownerId,f.a.id,NOW+1001));
});

test('a strict treaty deadline cannot become cached indefinitely when read at its exact boundary',async t=>{
  const f=await fixture(world=>{world.social.alliances.push({id:'strict-treaty-clock',name:'Pacto',clanIds:[],acceptedClanIds:[],status:'active',expiresAt:NOW+1000,noAggression:true});});t.after(()=>f.db.close());
  await readMvpView(f.store(),f.a.ownerId,f.a.id,NOW);const boundary=await readMvpView(f.store(),f.a.ownerId,f.a.id,NOW+1000);assert.equal(boundary.social.alliances[0].status,'active');assert.equal(await f.store().readPlayerView!(f.a.ownerId,f.a.id,NOW+1001),null);
  const ended=await readMvpView(f.store(),f.a.ownerId,f.a.id,NOW+1001);assert.equal(ended.social.alliances[0].status,'ended');assert.equal(ended.social.alliances[0].noAggression,false);
});
