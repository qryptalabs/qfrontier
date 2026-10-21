import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMvp, quoteMvp, readMvpView, validateMvpQuote } from '../lib/mvp/engine.ts';
import { getFirstTradeView } from '../lib/mvp/first-trade.ts';
import { available, give } from '../lib/mvp/helpers.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { MvpWorld } from '../lib/mvp/types.ts';
import type { MvpView } from '../lib/mvp/view.ts';

const NOW=Date.parse('2026-10-17T07:30:00Z');
class MemoryStore implements MvpStore {record:{revision:number;world:MvpWorld}|null=null;writes=0;async read(){return structuredClone(this.record);}async insert(world:MvpWorld){if(this.record)throw Error('No reset allowed');this.record={revision:0,world:structuredClone(world)};}async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};this.writes++;return true;}}
async function setup(){const store=new MemoryStore(),owner='first-trade-owner',view=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Primera feria',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=view.player!.id;await readMvpView(store,owner,id,NOW);return{store,owner,id,at:NOW};}
type Fixture=Awaited<ReturnType<typeof setup>>;
const p=(s:Fixture)=>s.store.record!.world.players[s.id],read=(s:Fixture,at=s.at)=>readMvpView(s.store,s.owner,s.id,at);
async function confirm(s:Fixture,view:MvpView,request=crypto.randomUUID()) {assert.ok(view.firstTrade.command);assert.equal(view.firstTrade.canAct,true);const command=view.firstTrade.command,quote=await quoteMvp(s.store,s.owner,command,request,s.at);await validateMvpQuote(s.store,s.owner,command,request,quote.revision,quote.token,quote.expiresAt,s.at);const result=await executeMvp(s.store,s.owner,command,request,quote.revision,s.at);return{view:result,request,command,quote};}
async function finish(s:Fixture,view:MvpView){assert.equal(view.firstTrade.stage,'wait');assert.ok(view.firstTrade.job);s.at=view.firstTrade.job.endsAt;return read(s);}

test('the derived guide completes a genuine new-player sale with signed existing commands, reloads, interruptions and receipt replay',async()=>{
  const s=await setup(),kit=structuredClone(p(s).inventory),source=s.store.record!.world.tiles.t_4_3.deposits.find(d=>d.itemId==='timber')!.layers[0],initial=structuredClone(source),budget=s.store.record!.world.social.npc.remaining,demand=s.store.record!.world.social.npc.demand.plank!.remaining;let view=await read(s);const stages:string[]=[];
  for(let step=0;step<8&&view.firstTrade.stage!=='complete';step++){
    stages.push(view.firstTrade.stage);const before=structuredClone(s.store.record),projected=getFirstTradeView(s.store.record!.world,p(s),s.at);assert.deepEqual(s.store.record,before);assert.deepEqual(projected,view.firstTrade);const confirmed=await confirm(s,view);view=confirmed.view;if(confirmed.command.type==='craft.start'){assert.equal(confirmed.command.transferableOnly,true);assert.equal(confirmed.command.qty,1);}
    const count=Object.keys(s.store.record!.world.jobs).length;await executeMvp(s.store,s.owner,confirmed.command,confirmed.request,confirmed.quote.revision,s.at);assert.equal(Object.keys(s.store.record!.world.jobs).length,count);
    if(view.firstTrade.stage==='wait'){
      assert.ok(view.firstTrade.job!.remainingSeconds>0);s.at++;view=await read(s);assert.equal(view.firstTrade.stage,'wait');const saved=structuredClone(s.store.record);view=await read(s);assert.deepEqual(s.store.record,saved);view=await finish(s,view);
    }
  }
  assert.deepEqual(stages,['survey','travel','extract','craft','sell']);assert.equal(view.firstTrade.stage,'complete');assert.equal(view.firstTrade.command,null);assert.equal(view.firstTrade.cash.balance,6);assert.equal(view.firstTrade.cash.received,6);assert.equal(view.firstTrade.cash.totalSales,1);assert.equal(view.firstTrade.cash.lastPaidAt,s.at);assert.ok(view.firstTrade.steps.every(step=>step.done));assert.deepEqual(p(s).inventory,kit);const layer=s.store.record!.world.tiles.t_4_3.deposits.find(d=>d.itemId==='timber')!.layers[0];assert.equal(layer.remaining,initial.remaining-2);assert.equal(layer.extracted,initial.extracted+2);assert.equal(layer.reserved,initial.reserved);assert.equal(s.store.record!.world.social.npc.remaining,budget-6);assert.equal(s.store.record!.world.social.npc.demand.plank!.remaining,demand-1);const complete=structuredClone(s.store.record),writes=s.store.writes;await read(s,s.at+1000);assert.deepEqual(s.store.record,complete);assert.equal(s.store.writes,writes);
});

test('known exhausted sources, exhausted account quotas and unavailable buyer funds never trigger extraction or offer invented goods',async()=>{
  for(const condition of['source','quota','demand','budget']){const s=await setup();if(condition==='source')for(const tile of Object.values(s.store.record!.world.tiles))for(const dep of tile.deposits.filter(d=>d.itemId==='timber'))for(const layer of dep.layers)layer.remaining=layer.reserved;
    if(condition==='quota'){const world=s.store.record!.world;world.jobs.used={id:'used',playerId:s.id,kind:'extract',status:'completed',createdAt:NOW-5000,startsAt:NOW-4000,endsAt:NOW-1000,ruleVersion:world.rulesVersion,weather:{regionId:'r_1_1',state:'clear',startsAt:NOW,endsAt:NOW+10000,movementFactor:1,waterFactor:1},route:['t_4_3'],costs:[],payload:{tileId:'t_4_3',itemId:'timber',qty:30},report:[]};}
    if(condition==='demand')s.store.record!.world.social.npc.demand.plank!.remaining=0;if(condition==='budget')s.store.record!.world.social.npc.remaining=0;const before=structuredClone(s.store.record),guide=getFirstTradeView(s.store.record!.world,p(s),s.at);assert.equal(guide.stage,'blocked');assert.equal(guide.command,null);assert.equal(guide.canAct,false);assert.ok(guide.reason);assert.deepEqual(s.store.record,before);}
});

test('a pending eligible plank waits for its real job while an old bound plank never becomes a sale suggestion',async()=>{
  const s=await setup();await executeMvp(s.store,s.owner,{type:'craft.start',playerId:s.id,recipeId:'plank',qty:1},crypto.randomUUID(),undefined,s.at);let view=await read(s);assert.notEqual(view.firstTrade.stage,'sell');const job=view.jobs.find(j=>j.kind==='craft')!;s.at=job.endsAt;view=await read(s);assert.equal(view.firstTrade.stock.boundPlanks,1);assert.equal(view.firstTrade.stock.transferablePlanks,0);assert.equal(view.firstTrade.stage,'survey');assert.equal(p(s).inventory.find(l=>l.itemId==='plank')!.bound,true);
});

test('a recipe consumes only the actually missing natural timber; tutorial wood is never counted toward the two-unit requirement',async()=>{
  const s=await setup();give(p(s),'timber',1,s.at,'existing-natural-test-lot',[],false);p(s).position='t_4_3';p(s).surveyed.push('t_4_3');const guide=getFirstTradeView(s.store.record!.world,p(s),s.at);assert.equal(guide.stage,'extract');assert.equal(guide.ingredients[0].available,1);assert.equal(guide.ingredients[0].missing,1);assert.equal(guide.stock.boundTimber,12);assert.equal(guide.command!.qty,1);assert.equal(guide.command!.itemId,'timber');assert.equal(guide.canAct,true);
});

test('products in a real shed generate a validated walk and then an exact lot withdrawal before sale',async()=>{
  const s=await setup();await executeMvp(s.store,s.owner,{type:'habitat.profile',playerId:s.id,appearance:'pine',profession:'carrier'},crypto.randomUUID(),undefined,s.at);await executeMvp(s.store,s.owner,{type:'habitat.build',playerId:s.id,templateId:'shed',x:7,y:3,rotation:0},crypto.randomUUID(),undefined,s.at);const shed=p(s).habitable!.buildings[0];s.at=shed.endsAt;await read(s);const lot=give(p(s),'plank',1,s.at,'genuine-stored-test-plank',[{itemId:'timber',qty:2}],false);p(s).inventory=p(s).inventory.filter(l=>l.id!==lot.id);lot.location=`habitat:${shed.id}`;p(s).habitable!.buildings[0].storage=[lot];let view=await read(s);assert.equal(view.firstTrade.stage,'collect');assert.equal(view.firstTrade.command!.type,'habitat.walk');assert.equal(view.firstTrade.collection!.lotId,lot.id);assert.equal(view.firstTrade.canAct,true);view=(await confirm(s,view)).view;s.at=p(s).habitable!.movement!.endsAt;view=await read(s);assert.equal(view.firstTrade.command!.type,'habitat.storage.withdraw');assert.equal(view.firstTrade.command!.lotId,lot.id);assert.equal(view.firstTrade.command!.qty,1);view=(await confirm(s,view)).view;assert.equal(view.firstTrade.stage,'sell');assert.deepEqual(p(s).inventory.find(l=>l.id===lot.id)!.provenance,lot.provenance);assert.equal(available(p(s),'plank',s.at,true),1);
});

test('other profiles and their payments never complete the selected explorer first sale; money already spent does not erase a real payment',async()=>{
  const s=await setup(),peer=(await executeMvp(s.store,s.owner,{type:'player.create',name:'Bruma',stationName:'Otra ruta',faction:'forgers'},crypto.randomUUID(),undefined,s.at)).player!,world=s.store.record!.world;world.social.ledger.push({id:'peer-paid',at:s.at,currency:'credits',amount:6,from:'npc-season',to:peer.id,reason:'Encargo NPC con presupuesto limitado'});assert.notEqual(getFirstTradeView(world,p(s),s.at).stage,'complete');world.social.ledger.push({id:'own-paid',at:s.at,currency:'credits',amount:6,from:'npc-season',to:s.id,reason:'Encargo NPC con presupuesto limitado'});world.social.accounts[s.id].credits=0;const own=getFirstTradeView(world,p(s),s.at);assert.equal(own.stage,'complete');assert.equal(own.cash.balance,0);assert.equal(own.cash.received,6);assert.equal(own.cash.totalSales,1);
});

test('a foreign or changed suggested command still faces ordinary ownership, quote and receipt validation',async()=>{
  const s=await setup(),view=await read(s),request=crypto.randomUUID(),command=view.firstTrade.command!,quote=await quoteMvp(s.store,s.owner,command,request,s.at);await assert.rejects(validateMvpQuote(s.store,'foreign-owner',command,request,quote.revision,quote.token,quote.expiresAt,s.at),/cotización/);await assert.rejects(validateMvpQuote(s.store,s.owner,{...command,tileId:'t_4_4'},request,quote.revision,quote.token,quote.expiresAt,s.at),/cotización/);const before=structuredClone(s.store.record);await assert.rejects(executeMvp(s.store,'foreign-owner',command,request,quote.revision,s.at),/pertenece/);assert.deepEqual(s.store.record,before);
});

test('the projection rejects a now-impossible domain action without mutating a stale view or hiding its finite restriction',async()=>{
  const s=await setup();give(p(s),'timber',2,s.at,'existing-natural-timber',[],false);const first=getFirstTradeView(s.store.record!.world,p(s),s.at);assert.equal(first.stage,'craft');assert.equal(first.command!.transferableOnly,true);assert.equal(first.canAct,true);p(s).buildings.workshop=0;const before=structuredClone(s.store.record),blocked=getFirstTradeView(s.store.record!.world,p(s),s.at);assert.equal(blocked.stage,'craft');assert.equal(blocked.canAct,false);assert.match(blocked.reason!,/nivel/);assert.deepEqual(s.store.record,before);
});

test('a visitor gets a creation hint with no suggested actor command, inventory or private progress',async()=>{
  const s=await setup(),before=structuredClone(s.store.record),view=getFirstTradeView(s.store.record!.world,null,s.at);assert.equal(view.stage,'create');assert.equal(view.playerId,null);assert.equal(view.command,null);assert.equal(view.job,null);assert.equal(view.cash.received,0);assert.equal(view.stock.boundTimber,0);assert.deepEqual(s.store.record,before);
});

test('the guide prefers another known available source over a nearby deposit with both shared extraction slots occupied',async()=>{
  const s=await setup(),one=(await executeMvp(s.store,'other-one',{type:'player.create',name:'Bruma',stationName:'Otra reserva',faction:'forgers'},crypto.randomUUID(),undefined,s.at)).player!,two=(await executeMvp(s.store,'other-two',{type:'player.create',name:'Cauce',stationName:'Otro bosque',faction:'forgers'},crypto.randomUUID(),undefined,s.at)).player!,world=s.store.record!.world;p(s).discovered.push('t_3_1');for(const actor of[one,two]){const id=`other-source:${actor.id}`;world.jobs[id]={id,playerId:actor.id,kind:'extract',status:'running',createdAt:NOW,startsAt:NOW,endsAt:NOW+10000,ruleVersion:world.rulesVersion,weather:{regionId:'r_1_1',state:'clear',startsAt:NOW,endsAt:NOW+10000,movementFactor:1,waterFactor:1},route:['t_4_3'],costs:[],payload:{tileId:'t_4_3',itemId:'timber',qty:1,layerId:'layer_0'},report:[]};}world.tiles.t_4_3.deposits.find(d=>d.itemId==='timber')!.layers[0].reserved+=2;const before=structuredClone(world),guide=getFirstTradeView(world,p(s),s.at);assert.equal(guide.sector!.id,'t_3_1');assert.equal(guide.stage,'travel');assert.equal(guide.canAct,true);assert.equal(guide.job,null);assert.deepEqual(world,before);
});

test('cancelling the suggested extraction releases its real reservation and the guide offers only the missing work after reload',async()=>{
  const s=await setup();let view=await read(s);for(let i=0;i<2;i++){view=(await confirm(s,view)).view;view=await finish(s,view);}assert.equal(view.firstTrade.stage,'extract');const before=s.store.record!.world.tiles.t_4_3.deposits.find(d=>d.itemId==='timber')!.layers[0].remaining;view=(await confirm(s,view)).view;const id=view.firstTrade.job!.id,cancel={type:'job.cancel',playerId:s.id,jobId:id},request=crypto.randomUUID();view=await executeMvp(s.store,s.owner,cancel,request,undefined,s.at);assert.equal(view.firstTrade.stage,'extract');assert.equal(view.firstTrade.command!.qty,2);assert.equal(view.firstTrade.stock.transferableTimber,0);assert.equal(view.firstTrade.steps.find(v=>v.id==='extract')!.done,false);const layer=s.store.record!.world.tiles.t_4_3.deposits.find(d=>d.itemId==='timber')!.layers[0];assert.equal(layer.reserved,0);assert.equal(layer.remaining,before);await executeMvp(s.store,s.owner,cancel,request,undefined,s.at);assert.equal(s.store.record!.world.tiles.t_4_3.deposits.find(d=>d.itemId==='timber')!.layers[0].remaining,before);assert.equal((await read(s)).firstTrade.stage,'extract');
});

test('an unrelated active bound-recipe queue exposes its actual capacity error rather than pretending the suggested craft can start',async()=>{
  const s=await setup();give(p(s),'timber',2,s.at,'existing-natural-timber',[],false);for(let n=0;n<3;n++)await executeMvp(s.store,s.owner,{type:'craft.start',playerId:s.id,recipeId:'plank',qty:1},crypto.randomUUID(),undefined,s.at);const before=structuredClone(s.store.record),guide=getFirstTradeView(s.store.record!.world,p(s),s.at);assert.equal(guide.stage,'craft');assert.equal(guide.command!.transferableOnly,true);assert.equal(guide.canAct,false);assert.match(guide.reason!,/cola/);assert.equal(guide.stock.transferableTimber,2);assert.deepEqual(s.store.record,before);
});
