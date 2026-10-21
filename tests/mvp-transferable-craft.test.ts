import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMvp, quoteMvp, readMvpView } from '../lib/mvp/engine.ts';
import { dispatchProduction } from '../lib/mvp/production.ts';
import { getPlayerProgress } from '../lib/mvp/player-progress.ts';
import { available, give } from '../lib/mvp/helpers.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { MvpCommand, MvpWorld } from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-16T07:30:00Z');
class MemoryStore implements MvpStore {record:{revision:number;world:MvpWorld}|null=null;async read(){return structuredClone(this.record);}async insert(world:MvpWorld){this.record??={revision:0,world:structuredClone(world)};}async compareAndSwap(revision:number,world:MvpWorld){assert.equal(revision,this.record!.revision);this.record={revision:revision+1,world:structuredClone(world)};return true;}}
async function setup(){const store=new MemoryStore(),owner='new-craft-owner',created=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Primera venta',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=created.player!.id;await readMvpView(store,owner,id,NOW);return{store,owner,id,at:NOW};}
type Fixture=Awaited<ReturnType<typeof setup>>;
const p=(s:Fixture)=>s.store.record!.world.players[s.id],latest=(s:Fixture)=>Object.values(s.store.record!.world.jobs).at(-1)!,act=(s:Fixture,command:MvpCommand,at=s.at,request=crypto.randomUUID())=>executeMvp(s.store,s.owner,{...command,playerId:s.id},request,undefined,at);
async function complete(s:Fixture){const j=latest(s);s.at=j.endsAt;await readMvpView(s.store,s.owner,s.id,s.at);return s.store.record!.world.jobs[j.id];}
async function extractTwo(s:Fixture){const forest='t_4_3';await act(s,{type:'world.survey',tileId:forest});await complete(s);await act(s,{type:'world.travel',tileId:forest});await complete(s);const layer=s.store.record!.world.tiles[forest].deposits.find(d=>d.itemId==='timber')!.layers[0],before=structuredClone(layer);await act(s,{type:'mining.reserve',tileId:forest,itemId:'timber',qty:2});const reserved=latest(s);assert.equal(layer.remaining,before.remaining);const job=await complete(s);return{before,job,reserved};}

test('a new player extracts two finite timber, crafts one transferable plank, sells it once and leaves the entire bound tutorial kit intact',async()=>{
  const s=await setup(),kit=structuredClone(p(s).inventory.filter(l=>l.bound)),{before,job:extraction}=await extractTwo(s),world=s.store.record!.world,deposit=world.tiles.t_4_3.deposits.find(d=>d.itemId==='timber')!.layers[0];assert.equal(deposit.remaining,before.remaining-2);assert.equal(deposit.extracted,before.extracted+2);assert.equal(deposit.reserved,before.reserved);const timber=p(s).inventory.find(l=>l.itemId==='timber'&&!l.bound)!;assert.equal(timber.provenance.source,`deposit:t_4_3:${extraction.payload.layerId}:${extraction.id}`);assert.equal(available(p(s),'timber',s.at,true),2);
  const cmd={type:'craft.start',recipeId:'plank',qty:1,transferableOnly:true},request=crypto.randomUUID(),quote=await quoteMvp(s.store,s.owner,{...cmd,playerId:s.id},request,s.at);assert.deepEqual(quote.changes,[{itemId:'timber',delta:-2}]);await executeMvp(s.store,s.owner,{...cmd,playerId:s.id},request,quote.revision,s.at);const craft=latest(s);assert.equal(craft.payload.transferableOnly,true);assert.equal(craft.endsAt-craft.startsAt,300000);assert.equal(craft.costs.length,1);assert.equal(craft.costs[0].id,timber.id);assert.deepEqual(craft.costs[0].provenance,timber.provenance);assert.ok(craft.costs.every(l=>!l.bound));await act(s,cmd,s.at,request);assert.equal(Object.values(s.store.record!.world.jobs).filter(j=>j.kind==='craft').length,1);await complete(s);
  const plank=p(s).inventory.find(l=>l.itemId==='plank')!;assert.equal(plank.qty,1);assert.equal(plank.bound,false);assert.deepEqual(plank.provenance.inputs,[{itemId:'timber',qty:2}]);assert.equal(plank.provenance.source,`recipe:plank:${craft.id}`);const sale={type:'npc.sell',itemId:'plank',qty:1},saleId=crypto.randomUUID(),budget=s.store.record!.world.social.npc.remaining;await act(s,sale,s.at,saleId);assert.equal(available(p(s),'plank',s.at,true),0);assert.equal(s.store.record!.world.social.accounts[s.id].credits,6);assert.equal(s.store.record!.world.social.npc.remaining,budget-6);assert.equal(s.store.record!.world.social.ledger.filter(l=>(l.from===s.id||l.to===s.id)&&l.reason.includes('encargo')).length,1);assert.equal(s.store.record!.world.social.ledger.filter(l=>l.currency==='credits'&&l.from==='npc-season'&&l.to===s.id).length,1);await act(s,sale,s.at,saleId);assert.equal(s.store.record!.world.social.accounts[s.id].credits,6);assert.deepEqual(p(s).inventory.filter(l=>l.bound),kit);assert.equal(getPlayerProgress(s.store.record!.world,p(s),s.at).foundation.find(v=>v.id==='trade')!.done,true);
});

test('transferable-only preflights every ingredient before any consumption and a bound-only tutorial cannot satisfy it',async()=>{
  const s=await setup(),before=structuredClone(s.store.record);await assert.rejects(act(s,{type:'craft.start',recipeId:'plank',qty:1,transferableOnly:true}),/insumos transferibles/);assert.deepEqual(s.store.record,before);
  give(p(s),'grain',2,s.at,'existing-unbound-test-grain',[],false);const world=s.store.record!.world,inventory=structuredClone(p(s).inventory),count=world.counters.job;assert.throws(()=>dispatchProduction(world,{type:'craft.start',playerId:s.id,recipeId:'ration',qty:1,transferableOnly:true},{ownerId:s.owner,requestId:crypto.randomUUID(),now:s.at,actor:p(s)}),/insumos transferibles/);assert.deepEqual(p(s).inventory,inventory);assert.equal(world.counters.job,count);
});

test('the opt-in flag accepts only booleans and invalid commands never reserve resources or jobs',async()=>{
  const s=await setup();for(const value of['true',1,null,{},[]]){const before=structuredClone(s.store.record);await assert.rejects(act(s,{type:'craft.start',recipeId:'plank',qty:1,transferableOnly:value}),/verdadera o falsa/);assert.deepEqual(s.store.record,before);}
});

test('default and explicit false retain legacy bound-first crafting and bound outputs even when natural timber is also present',async()=>{
  for(const flag of[undefined,false]){const s=await setup();await extractTwo(s);const natural=structuredClone(p(s).inventory.filter(l=>l.itemId==='timber'&&!l.bound)),boundBefore=available(p(s),'timber',s.at)-available(p(s),'timber',s.at,true);await act(s,{type:'craft.start',recipeId:'plank',qty:1,...(flag!==undefined?{transferableOnly:flag}:{})});assert.equal(latest(s).payload.transferableOnly,undefined);assert.ok(latest(s).costs.every(l=>l.bound));await complete(s);assert.equal(p(s).inventory.find(l=>l.itemId==='plank')!.bound,true);assert.deepEqual(p(s).inventory.filter(l=>l.itemId==='timber'&&!l.bound),natural);assert.equal(available(p(s),'timber',s.at)-available(p(s),'timber',s.at,true),boundBefore-2);}
});

test('transferable-only consumes eligible ingredients in FEFO order and preserves each input lot metadata',async()=>{
  const s=await setup(),early=give(p(s),'grain',1,s.at,'existing-early-grain',[],false),late=give(p(s),'grain',1,s.at,'existing-later-grain',[],false),spare=give(p(s),'grain',2,s.at,'existing-spare-grain',[],false);early.expiresAt=s.at+3600000;late.expiresAt=s.at+7200000;early.quality=2;late.quality=3;give(p(s),'water',1,s.at,'existing-unbound-water',[],false);const expected=[structuredClone(early),structuredClone(late)];await act(s,{type:'craft.start',recipeId:'ration',qty:1,transferableOnly:true});const food=latest(s);assert.deepEqual(food.costs.filter(l=>l.itemId==='grain'),expected);assert.equal(p(s).inventory.find(l=>l.id===spare.id)!.qty,2);assert.ok(food.costs.every(l=>!l.bound));await complete(s);const ration=p(s).inventory.find(l=>l.provenance.source===`recipe:ration:${food.id}`)!;assert.equal(ration.bound,false);assert.equal(ration.expiresAt,food.endsAt+72*3600000);
});

test('a changed transferable-only flag cannot reuse a confirmed request fingerprint',async()=>{
  const s=await setup();await extractTwo(s);const id=crypto.randomUUID(),cmd={type:'craft.start',recipeId:'plank',qty:1,transferableOnly:true};await act(s,cmd,s.at,id);const before=structuredClone(s.store.record);await assert.rejects(act(s,{...cmd,transferableOnly:false},s.at,id),/orden diferente/);assert.deepEqual(s.store.record,before);
});
