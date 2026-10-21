import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import {beginVillageOperation,cloneOperationWorld,lastWorldId,nextWorldId,nextSocialId} from '../lib/mvp/operation-ids.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {give} from '../lib/mvp/helpers.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {MvpCommand,MvpWorld,Player} from '../lib/mvp/types.ts';

const now=Date.parse('2026-10-17T12:30:00Z');
async function fixture(configure?:(world:MvpWorld,a:Player,b:Player)=>void){
  const db=createSqliteD1();
  for(const path of ['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql'])db.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
  const world=createMvpWorld('administrator',now);
  const add=(ownerId:string,name:string)=>createPlayer(world,{ownerId,now,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:`Aldea ${name}`,faction:'cartographers'});
  const a=add('owner-alba','Alba'),b=add('owner-beto','Beto');
  settleSocial(world,now);
  configure?.(world,a,b);
  const make=()=>createPartitionedMvpStore(db,{metadataVersioning:true,villageWrites:true,maxBatchStatements:900});
  await make().insert(world);
  let globalCommits=0,localCommits=0;
  const store=():MvpStore=>{
    const target=make();return new Proxy(target,{get(base,key,receiver){
      if(key==='compareAndSwap')return async(...args:Parameters<MvpStore['compareAndSwap']>)=>{globalCommits++;return base.compareAndSwap(...args);};
      if(key==='compareAndSwapVillage')return async(...args:Parameters<NonNullable<MvpStore['compareAndSwapVillage']>>)=>{const committed=await base.compareAndSwapVillage!(...args);if(committed)localCommits++;return committed;};
      const value=Reflect.get(base,key,receiver);return typeof value==='function'?value.bind(base):value;
    }});
  };
  return{db,a,b,store,read:()=>make().read(),metrics:()=>({globalCommits,localCommits})};
}
const craft=(playerId:string):MvpCommand=>({type:'craft.start',playerId,recipeId:'plank',qty:1});
async function draft(store:MvpStore,owner:string,command:MvpCommand){const request=crypto.randomUUID(),quote=await quoteMvp(store,owner,command,request,now);return{request,quote};}
async function confirm(store:MvpStore,owner:string,command:MvpCommand,d:Awaited<ReturnType<typeof draft>>,at=now){const auth=await validateMvpQuote(store,owner,command,d.request,d.quote.revision,d.quote.token,d.quote.expiresAt,at);return executeMvp(store,owner,command,d.request,d.quote.revision,at,auth);}

test('engine commits independent villages from the same revision without a global economic CAS',async()=>{
  const f=await fixture();try{
    const ca=craft(f.a.id),cb=craft(f.b.id),a=await draft(f.store(),f.a.ownerId,ca),b=await draft(f.store(),f.b.ownerId,cb);
    assert.equal(a.quote.revision,b.quote.revision);
    let arrivals=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const blocked=():MvpStore=>{const target=f.store();return new Proxy(target,{get(base,key,receiver){if(key==='compareAndSwapVillage')return async(...args:Parameters<NonNullable<MvpStore['compareAndSwapVillage']>>)=>{if(++arrivals===2)release();await gate;return base.compareAndSwapVillage!(...args);};const value=Reflect.get(base,key,receiver);return typeof value==='function'?value.bind(base):value;}});};
    const views=await Promise.all([confirm(blocked(),f.a.ownerId,ca,a),confirm(blocked(),f.b.ownerId,cb,b)]);
    const final=(await f.read())!,jobs=Object.values(final.world.jobs);
    assert.equal(arrivals,2,'No village needed to retry a disjoint commit.');
    assert.equal(jobs.length,2);assert.equal(new Set(jobs.map(j=>j.id)).size,2);
    assert.ok(jobs.every(j=>j.id.startsWith('job_v_')));assert.equal(final.world.counters.job,0);
    assert.equal(final.world.receipts[`${f.a.ownerId}:${a.request}`]?.length,64);assert.equal(final.world.receipts[`${f.b.ownerId}:${b.request}`]?.length,64);
    assert.equal(views[0].player!.id,f.a.id);assert.equal(views[1].player!.id,f.b.id);
    assert.deepEqual(f.metrics(),{globalCommits:0,localCommits:2});
  }finally{f.db.close();}
});

test('reading one village settles its due work once while preserving the neighbor until queried',async()=>{
  const f=await fixture();try{
    for(const p of[f.a,f.b]){const command=craft(p.id),d=await draft(f.store(),p.ownerId,command);await confirm(f.store(),p.ownerId,command,d);}
    const before=(await f.read())!,otherJob=Object.values(before.world.jobs).find(j=>j.playerId===f.b.id)!;
    const otherPlayer=JSON.stringify(before.world.players[f.b.id]),at=Math.max(...Object.values(before.world.jobs).map(j=>j.endsAt))+1;
    await readMvpView(f.store(),f.a.ownerId,f.a.id,at);
    const afterA=(await f.read())!;
    assert.equal(Object.values(afterA.world.jobs).find(j=>j.playerId===f.a.id)!.status,'completed');
    assert.equal(afterA.world.jobs[otherJob.id].status,'running');assert.equal(JSON.stringify(afterA.world.players[f.b.id]),otherPlayer);
    const revision=afterA.revision;await readMvpView(f.store(),f.a.ownerId,f.a.id,at);assert.equal((await f.read())!.revision,revision);
    await readMvpView(f.store(),f.b.ownerId,f.b.id,at);
    const final=(await f.read())!;
    assert.equal(final.world.jobs[otherJob.id].status,'completed');
    for(const p of[f.a,f.b]){assert.equal(final.world.players[p.id].stats.crafted,1);assert.equal(final.world.players[p.id].inventory.filter(l=>l.itemId==='plank').reduce((n,l)=>n+l.qty,0),1);}
    assert.equal(f.metrics().globalCommits,0);
  }finally{f.db.close();}
});

test('duplicate village commands retain their receipt and never start a second job',async()=>{
  const f=await fixture();try{
    const command=craft(f.a.id),d=await draft(f.store(),f.a.ownerId,command);
    await Promise.all([confirm(f.store(),f.a.ownerId,command,d),confirm(f.store(),f.a.ownerId,command,d)]);
    const final=(await f.read())!;assert.equal(Object.keys(final.world.jobs).length,1);assert.equal(Object.keys(final.world.receipts).length,1);
  }finally{f.db.close();}
});

test('village identifiers are unique without serializing counters and survive committed manager trial clones',()=>{
  const a=createMvpWorld('admin',now),b=structuredClone(a),legacy=nextWorldId(a,'job');assert.equal(legacy,'job_1');
  beginVillageOperation(a);beginVillageOperation(b);
  const a1=nextWorldId(a,'job'),b1=nextWorldId(b,'job'),trial=cloneOperationWorld(a),a2=nextWorldId(trial,'job');
  Object.assign(a,trial);
  const a3=nextWorldId(a,'job');assert.equal(new Set([a1,b1,a2,a3]).size,4);assert.equal(lastWorldId(a,'job'),a3);
  assert.equal(a.counters.job,1);assert.equal(b.counters.job,0);
  assert.notEqual(nextSocialId(a.social,'ledger'),nextSocialId(b.social,'ledger'));
  assert.equal(a.social.sequence,0);assert.equal(b.social.sequence,0);
  assert.equal(JSON.stringify(a).includes('operation-ids'),false);
});

test('unreviewed political commands retain the original transaction capability',async()=>{
  const f=await fixture();try{
    const command={type:'clan.create',playerId:f.a.id,name:'Clanes del Alba'},d=await draft(f.store(),f.a.ownerId,command);
    await confirm(f.store(),f.a.ownerId,command,d);
    assert.ok(f.metrics().globalCommits>0);assert.equal((await f.read())!.world.social.clans.length,1);
  }finally{f.db.close();}
});

test('simultaneous NPC sales preserve the shared treasury and require the loser to review its changed quote',async()=>{
  const f=await fixture((_world,a,b)=>{for(const p of[a,b])give(p,'timber',2,now,'village-sale-fixture',[],false);});try{
    const command=(id:string):MvpCommand=>({type:'npc.sell',playerId:id,itemId:'timber',qty:1});
    const a=await draft(f.store(),f.a.ownerId,command(f.a.id)),b=await draft(f.store(),f.b.ownerId,command(f.b.id));
    const before=(await f.read())!,budget=before.world.social.npc.remaining,demand=before.world.social.npc.demand.timber!;
    const results=await Promise.allSettled([confirm(f.store(),f.a.ownerId,command(f.a.id),a),confirm(f.store(),f.b.ownerId,command(f.b.id),b)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.match(rejected.reason.message,/aldea|recurso|cotizaci/i);
    const after=(await f.read())!;assert.equal(after.world.social.npc.remaining,budget-demand.price);assert.equal(after.world.social.npc.demand.timber!.remaining,demand.remaining-1);
    assert.equal(Object.keys(after.world.receipts).length,1);assert.equal(after.world.social.ledger.filter(l=>l.from==='npc-season'&&l.to.startsWith('p_')).length,1);
    const loser=results[0].status==='rejected'?f.a:f.b,d=await draft(f.store(),loser.ownerId,command(loser.id));await confirm(f.store(),loser.ownerId,command(loser.id),d);
    const final=(await f.read())!;assert.equal(final.world.social.npc.remaining,budget-demand.price*2);assert.equal(Object.keys(final.world.receipts).length,2);
    assert.equal(f.metrics().globalCommits,0);
  }finally{f.db.close();}
});

test('a real market fill transfers escrow and payment atomically and retains its exact replay receipt',async()=>{
  const f=await fixture((world,a,b)=>{give(a,'timber',2,now,'village-market-fixture',[],false);world.social.accounts[a.id].credits=20;world.social.accounts[b.id].credits=20;});try{
    const publish:MvpCommand={type:'market.publish',playerId:f.a.id,mode:'credits',itemId:'timber',qty:1,price:4};
    const listed=await draft(f.store(),f.a.ownerId,publish);await confirm(f.store(),f.a.ownerId,publish,listed);
    const reserved=(await f.read())!,offer=reserved.world.social.offers[0];assert.equal(offer.status,'open');assert.equal(offer.lots.reduce((n,l)=>n+l.qty,0),1);
    const command={type:'market.fill',playerId:f.b.id,offerId:offer.id},d=await draft(f.store(),f.b.ownerId,command);
    await confirm(f.store(),f.b.ownerId,command,d);
    const filled=(await f.read())!,buyer=filled.world.players[f.b.id],seller=filled.world.players[f.a.id];
    assert.equal(filled.world.social.offers[0].status,'filled');assert.equal(filled.world.social.offers[0].lots.length,0);
    assert.equal(buyer.inventory.filter(l=>l.itemId==='timber'&&!l.bound).reduce((n,l)=>n+l.qty,0),1);
    assert.equal(seller.inventory.filter(l=>l.itemId==='timber'&&!l.bound).reduce((n,l)=>n+l.qty,0),1);
    const cash=filled.world.social.accounts[f.a.id].credits+filled.world.social.accounts[f.b.id].credits+filled.world.social.creditFees;
    assert.equal(cash,40);const revision=filled.revision;
    await confirm(f.store(),f.b.ownerId,command,d);assert.equal((await f.read())!.revision,revision);
    assert.equal(f.metrics().globalCommits,0);
  }finally{f.db.close();}
});

test('shared deposit reservation cannot be accepted twice from stale village drafts',async()=>{
  const f=await fixture((world,a,b)=>{const tile=Object.values(world.tiles).find(t=>t.deposits.some(d=>d.itemId==='timber'))!;for(const p of[a,b]){p.position=tile.id;p.surveyed.push(tile.id);}});try{
    const tile=(await f.read())!.world.players[f.a.id].position,command=(id:string):MvpCommand=>({type:'mining.reserve',playerId:id,tileId:tile,itemId:'timber',qty:1});
    const a=await draft(f.store(),f.a.ownerId,command(f.a.id)),b=await draft(f.store(),f.b.ownerId,command(f.b.id));
    const results=await Promise.allSettled([confirm(f.store(),f.a.ownerId,command(f.a.id),a),confirm(f.store(),f.b.ownerId,command(f.b.id),b)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const after=(await f.read())!,jobs=Object.values(after.world.jobs).filter(j=>j.kind==='extract');assert.equal(jobs.length,1);
    const deposit=after.world.tiles[tile].deposits.find(d=>d.itemId==='timber')!;assert.equal(deposit.layers.reduce((n,l)=>n+l.reserved,0),1);
    assert.equal(f.metrics().globalCommits,0);
  }finally{f.db.close();}
});
