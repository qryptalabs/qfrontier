import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer,weatherFor} from '../lib/mvp/world.ts';
import {quoteMvp,readMvpView} from '../lib/mvp/engine.ts';
import type {MvpWorld} from '../lib/mvp/types.ts';

const now=Date.parse('2026-10-18T08:00:00Z');
async function fixture(){
  const db=createSqliteD1();
  for(const path of ['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql'])db.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
  const world=createMvpWorld('administrator',now),add=(ownerId:string,name:string)=>createPlayer(world,{ownerId,now,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:`Aldea ${name}`,faction:'cartographers'});
  const a=add('shared-account','Alba'),peer=add(a.ownerId,'Bruma'),foreign=add('other-account','Cauce');
  const make=()=>createPartitionedMvpStore(db,{metadataVersioning:true,villageWrites:true,maxBatchStatements:900});
  await make().insert(world);
  return{db,a,peer,foreign,make};
}

test('one village read initializes the common account baseline before either own profile drafts an order',async()=>{
  const f=await fixture();try{
    await readMvpView(f.make(),f.a.ownerId,f.a.id,now);
    const initialized=(await f.make().read())!;
    for(const p of[f.a,f.peer]){assert.deepEqual(initialized.world.social.accounts[p.id],{credits:0,boundCredits:50,simUnits:1000});assert.ok(initialized.world.social.activity[p.id]);}
    assert.equal(initialized.world.social.accounts[f.foreign.id],undefined);assert.equal(initialized.world.social.activity[f.foreign.id],undefined);
    const quotes=await Promise.all([f.a,f.peer].map(p=>quoteMvp(f.make(),p.ownerId,{type:'craft.start',playerId:p.id,recipeId:'plank',qty:1},crypto.randomUUID(),now)));
    assert.equal(quotes[0].revision,quotes[1].revision);assert.equal(quotes[0].revision,initialized.revision);
    assert.ok(quotes.every(q=>q.token.startsWith('v2.')));
  }finally{f.db.close();}
});

test('initializing an account does not settle an alternate profile job or bootstrap a foreign account',async()=>{
  const f=await fixture();try{
    const store=f.make(),before=(await store.read())!,next:MvpWorld=structuredClone(before.world);
    next.jobs['peer-prior-job']={id:'peer-prior-job',playerId:f.peer.id,kind:'survey',status:'running',createdAt:now-20_000,startsAt:now-20_000,endsAt:now-1000,ruleVersion:next.rulesVersion,weather:weatherFor(next.tiles[f.peer.position].regionId,now),route:[f.peer.position],costs:[],payload:{tileId:f.peer.position},report:[]};
    assert.ok(await store.compareAndSwap(before.revision,next));
    const peerBefore=JSON.stringify(next.players[f.peer.id]),jobBefore=JSON.stringify(next.jobs['peer-prior-job']);
    await readMvpView(f.make(),f.a.ownerId,f.a.id,now);
    const final=(await f.make().read())!;
    assert.equal(JSON.stringify(final.world.players[f.peer.id]),peerBefore);assert.equal(JSON.stringify(final.world.jobs['peer-prior-job']),jobBefore);
    assert.ok(final.world.social.accounts[f.peer.id]);assert.equal(final.world.social.accounts[f.foreign.id],undefined);
  }finally{f.db.close();}
});
