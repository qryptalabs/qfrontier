import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMvp, readMvpView } from '../lib/mvp/engine.ts';
import { HABITABLE_POINTS, habitableBuildingEntrance, habitablePositionAt } from '../lib/mvp/habitable-data.ts';
import { habitableTradePoseAt, settleHabitableCommerce } from '../lib/mvp/habitable-commerce.ts';
import { TRADE_BAY } from '../lib/graphics/trade-routes.ts';
import { give } from '../lib/mvp/helpers.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { MvpCommand, MvpWorld } from '../lib/mvp/types.ts';

class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){this.record??={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(!this.record||this.record.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}
const NOW=Date.parse('2026-10-16T03:30:00Z');
async function setup(bound=false,qty=4){
  const store=new MemoryStore(),owner='commerce-owner',created=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Mercado de prueba',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=created.player!.id;
  await executeMvp(store,owner,{type:'habitat.profile',playerId:id,appearance:'pine',profession:'carrier'},crypto.randomUUID(),undefined,NOW);const built=await executeMvp(store,owner,{type:'habitat.build',playerId:id,templateId:'shed',x:7,y:3,rotation:0},crypto.randomUUID(),undefined,NOW),buildingId=built.player!.habitable!.buildings[0].id,at=built.player!.habitable!.buildings[0].endsAt+1;
  await readMvpView(store,owner,id,at);const s={store,owner,id,buildingId,at};const lot=give(player(s),'plank',qty,at,'existing-transferable-test-stock',[{itemId:'timber',qty:2}],bound);lot.quality=2;lot.wear=3;player(s).inventory=player(s).inventory.filter(l=>l.id!==lot.id);lot.location=`habitat:${buildingId}`;shed(s).storage=[lot];s.at=await walk(s,habitableBuildingEntrance(player(s).habitable!,shed(s))!,at);return s;
}
type Fixture={store:MemoryStore;owner:string;id:string;buildingId:string;at:number};
const player=(s:Fixture)=>s.store.record!.world.players[s.id];
const shed=(s:Fixture)=>player(s).habitable!.buildings.find(b=>b.id===s.buildingId)!;
const current=(s:Fixture)=>player(s).habitable!.commerce!.contracts.at(-1)!;
const act=(s:Fixture,command:MvpCommand,at=s.at,request=crypto.randomUUID())=>executeMvp(s.store,s.owner,{...command,playerId:s.id},request,undefined,at);
const read=(s:Fixture,at:number)=>readMvpView(s.store,s.owner,s.id,at);
async function walk(s:Fixture,point:{x:number;y:number},at=s.at){const moved=await act(s,{type:'habitat.walk',...point},at),end=moved.player!.habitable!.movement!.endsAt+1;await read(s,end);return end;}
const stock=(s:Fixture)=>(shed(s).storage??[]).filter(l=>l.itemId==='plank').reduce((n,l)=>n+l.qty,0);
const credits=(s:Fixture)=>s.store.record!.world.social.accounts[s.id].credits;
const npc=(s:Fixture)=>s.store.record!.world.social.npc;
async function accept(s:Fixture,at=s.at,request=crypto.randomUUID()){return act(s,{type:'habitat.trade.accept',buildingId:s.buildingId},at,request);}
async function arrivedAndClear(s:Fixture){const arrival=current(s).caravan.approachEndsAt+1;await read(s,arrival);return walk(s,{x:5.8,y:5.9},arrival);}
async function addPeer(s:Fixture){
  const owner='other-commerce-owner',created=await executeMvp(s.store,owner,{type:'player.create',name:'Bruma',stationName:'Segundo mercado',faction:'cartographers'},crypto.randomUUID(),undefined,s.at),id=created.player!.id;
  await executeMvp(s.store,owner,{type:'habitat.profile',playerId:id,appearance:'pine',profession:'carrier'},crypto.randomUUID(),undefined,s.at);const built=await executeMvp(s.store,owner,{type:'habitat.build',playerId:id,templateId:'shed',x:7,y:3,rotation:0},crypto.randomUUID(),undefined,s.at),building=built.player!.habitable!.buildings[0],peer={store:s.store,owner,id,buildingId:building.id,at:building.endsAt+1};
  await read(peer,peer.at);peer.at=await walk(peer,habitableBuildingEntrance(player(peer).habitable!,shed(peer))!,peer.at);s.at=peer.at;return peer;
}

test('acceptance reserves exactly twelve existing credits and two units of real demand once, without paying or taking stock',async()=>{
  const s=await setup(),budget=npc(s).remaining,demand=npc(s).demand.plank!.remaining,balance=credits(s),goods=structuredClone(shed(s).storage),request=crypto.randomUUID();await accept(s,s.at,request);const c=current(s);assert.equal(npc(s).remaining,budget-12);assert.equal(npc(s).demand.plank!.remaining,demand-2);assert.equal(c.escrow,12);assert.equal(c.cargo.length,0);assert.equal(credits(s),balance);assert.deepEqual(shed(s).storage,goods);assert.equal(c.caravan.route.points[0].x,player(s).settlement!.x-13.5);assert.ok(player(s).habitable!.commerce!.gateway);await accept(s,s.at,request);assert.equal(npc(s).remaining,budget-12);assert.equal(player(s).habitable!.commerce!.contracts.length,1);await assert.rejects(accept(s,s.at+1),/encargo comercial actual/);
});

test('cancellation refunds the reservation once and preserves an empty visible physical return before the next contract',async()=>{
  const s=await setup(),budget=npc(s).remaining,demand=npc(s).demand.plank!.remaining;await accept(s);const at=s.at+1000,pose=habitableTradePoseAt(current(s).caravan,at),request=crypto.randomUUID();await act(s,{type:'habitat.trade.cancel',buildingId:s.buildingId},at,request);let c=current(s);assert.equal(c.status,'cancelled');assert.equal(c.escrow,0);assert.equal(npc(s).remaining,budget);assert.equal(npc(s).demand.plank!.remaining,demand);assert.equal(stock(s),4);assert.equal(c.cargo.length,0);assert.ok(c.caravan.returnTrip);const afterCancel=habitableTradePoseAt(c.caravan,at);assert.ok(Math.hypot(afterCancel.cart.x-pose.cart.x,afterCancel.cart.y-pose.cart.y)<1e-7);assert.equal(afterCancel.phase,'approaching');assert.ok(c.caravan.returnTrip!.startsAt>=c.caravan.approachEndsAt);assert.equal(habitableTradePoseAt(c.caravan,c.caravan.returnTrip!.startsAt).phase,'returning');await act(s,{type:'habitat.trade.cancel',buildingId:s.buildingId},at,request);assert.equal(npc(s).remaining,budget);await assert.rejects(accept(s,at+1),/regreso|otro encargo/);const returned=c.caravan.returnTrip!.endsAt+3001;await read(s,returned);await accept(s,returned);c=current(s);assert.equal(c.status,'accepted');assert.equal(player(s).habitable!.commerce!.contracts.length,2);assert.equal(npc(s).remaining,budget-12);
});

test('the global fleet stays reserved for another player until the completed carriage actually disappears',async()=>{
  const s=await setup(),peer=await addPeer(s);await accept(s);const at=await arrivedAndClear(s);await act(s,{type:'habitat.trade.dispatch',buildingId:s.buildingId},at);const unload=current(s).caravan.delivery!.unloadsAt;await read(s,unload);const budget=npc(s).remaining,demand=npc(s).demand.plank!.remaining;
  assert.equal(current(s).status,'completed');assert.equal(habitableTradePoseAt(current(s).caravan,unload+5999).visible,true);await assert.rejects(accept(peer,unload+5999),/carreta regional|regreso/);assert.equal(npc(s).remaining,budget);assert.equal(npc(s).demand.plank!.remaining,demand);assert.equal(player(peer).habitable!.commerce,undefined);
  assert.equal(habitableTradePoseAt(current(s).caravan,unload+6000).visible,false);await accept(peer,unload+6000);assert.equal(current(peer).status,'accepted');assert.equal(npc(s).remaining,budget-12);assert.equal(npc(s).demand.plank!.remaining,demand-2);
});

test('a cancelled returning carriage also blocks another player for its final three visible seconds',async()=>{
  const s=await setup(),peer=await addPeer(s);await accept(s);await act(s,{type:'habitat.trade.cancel',buildingId:s.buildingId},s.at+1000);const returned=current(s).caravan.returnTrip!.endsAt,budget=npc(s).remaining;
  assert.equal(habitableTradePoseAt(current(s).caravan,returned+2999).visible,true);await assert.rejects(accept(peer,returned+2999),/carreta regional|regreso/);assert.equal(npc(s).remaining,budget);assert.equal(player(peer).habitable!.commerce,undefined);
  assert.equal(habitableTradePoseAt(current(s).caravan,returned+3000).visible,false);await accept(peer,returned+3000);assert.equal(current(peer).status,'accepted');assert.equal(npc(s).remaining,budget-12);
});

test('an uncollected expired contract returns its exact budget and demand once and never pays the owner',async()=>{
  const s=await setup(),budget=npc(s).remaining,demand=npc(s).demand.plank!.remaining,balance=credits(s);await accept(s);const deadline=current(s).deadline;settleHabitableCommerce(s.store.record!.world,deadline+1);let c=current(s);assert.equal(c.status,'expired');assert.equal(c.escrow,0);assert.ok(c.caravan.returnTrip);assert.equal(npc(s).remaining,budget);assert.equal(npc(s).demand.plank!.remaining,demand);assert.equal(credits(s),balance);assert.equal(stock(s),4);const state=structuredClone(s.store.record!.world);settleHabitableCommerce(s.store.record!.world,deadline+1000);assert.deepEqual(s.store.record!.world,state);await assert.rejects(accept(s,deadline+2),/regreso|otro encargo/);
});

test('bound or expiring timber products cannot be sold and a rejected loading retains both goods and escrow',async()=>{
  const s=await setup(true,2);await accept(s);const at=await arrivedAndClear(s),before=structuredClone(s.store.record!.world);await assert.rejects(act(s,{type:'habitat.trade.dispatch',buildingId:s.buildingId},at),/transferibles|vinculados/);assert.deepEqual(s.store.record!.world,before);assert.equal(stock(s),2);assert.equal(current(s).escrow,12);
  shed(s).storage![0].bound=false;shed(s).storage![0].quality=0;await assert.rejects(act(s,{type:'habitat.trade.dispatch',buildingId:s.buildingId},at),/transferibles|vinculados/);assert.equal(current(s).cargo.length,0);shed(s).storage![0].quality=2;shed(s).storage![0].expiresAt=at+1;await assert.rejects(act(s,{type:'habitat.trade.dispatch',buildingId:s.buildingId},at),/transferibles|vinculados/);assert.equal(current(s).cargo.length,0);assert.equal(current(s).status,'accepted');
});

test('a real shipment takes two exact lots once, pays only after unloading, preserves provenance and cannot pay twice',async()=>{
  const s=await setup(),budget=npc(s).remaining,demand=npc(s).demand.plank!.remaining,balance=credits(s),original=structuredClone(shed(s).storage![0]);await accept(s);await assert.rejects(act(s,{type:'habitat.trade.dispatch',buildingId:s.buildingId},s.at+1),/todavía viene/);const at=await arrivedAndClear(s),request=crypto.randomUUID(),cmd={type:'habitat.trade.dispatch',buildingId:s.buildingId};await act(s,cmd,at,request);let c=current(s);assert.equal(c.status,'in_transit');assert.equal(stock(s),2);assert.equal(c.cargo.reduce((n,l)=>n+l.qty,0),2);assert.equal(credits(s),balance);assert.deepEqual(c.cargo[0].provenance,original.provenance);assert.equal(c.cargo[0].quality,original.quality);assert.equal(c.cargo[0].wear,original.wear);assert.equal(c.cargo[0].expiresAt,original.expiresAt);assert.equal(c.cargo[0].originLotId,original.id);assert.equal(shed(s).storage![0].originLotId,original.id);const spectator=await readMvpView(s.store,'spectator-owner',undefined,at);assert.ok(!JSON.stringify(spectator.habitable).includes(original.provenance.source));assert.ok(!JSON.stringify(spectator.habitable.actors).includes('contracts'));assert.ok(spectator.habitable.actors[0].state.commerceGateway);await act(s,cmd,at,request);assert.equal(stock(s),2);await assert.rejects(act(s,cmd,at+1),/listo para cargar/);
  const unload=c.caravan.delivery!.unloadsAt;settleHabitableCommerce(s.store.record!.world,unload-1);assert.equal(credits(s),balance);assert.equal(current(s).escrow,12);settleHabitableCommerce(s.store.record!.world,unload);c=current(s);assert.equal(c.status,'completed');assert.equal(credits(s),balance+12);assert.equal(c.escrow,0);assert.equal(c.cargo.length,0);assert.equal(c.deliveredUnits,2);assert.equal(c.deliveredLots!.reduce((n,l)=>n+l.qty,0),2);assert.deepEqual(c.deliveredLots![0].provenance,original.provenance);assert.equal(c.deliveredLots![0].location,'npc:valleverde');assert.equal(npc(s).remaining,budget-12);assert.equal(npc(s).demand.plank!.remaining,demand-2);const completed=structuredClone(s.store.record!.world);settleHabitableCommerce(s.store.record!.world,unload+10000);assert.deepEqual(s.store.record!.world,completed);
});

test('ownership, budget and stock checks reject orders without creating cargo, new money or a foreign contract',async()=>{
  const s=await setup();const before=structuredClone(s.store.record);await assert.rejects(executeMvp(s.store,'foreign-owner',{type:'habitat.trade.accept',playerId:s.id,buildingId:s.buildingId},crypto.randomUUID(),undefined,s.at),/pertenece/);assert.deepEqual(s.store.record,before);await assert.rejects(act(s,{type:'habitat.trade.accept',buildingId:'foreign-shed'}),/cobertizo propio/);npc(s).remaining=11;await assert.rejects(accept(s),/presupuesto|demanda/);assert.equal(player(s).habitable!.commerce,undefined);npc(s).remaining=100;npc(s).demand.plank!.remaining=1;await assert.rejects(accept(s),/presupuesto|demanda/);assert.equal(credits(s),0);assert.equal(stock(s),4);
});

test('the first shed can trade before industry exists, its reserved gateway permits both later factories, and collection avoids real bodies',async()=>{
  const s=await setup();await accept(s);const gateway=structuredClone(player(s).habitable!.commerce!.gateway);let at=s.at+1;
  for(const plan of[{templateId:'woodlot',x:-12,y:1,rotation:0},{templateId:'sawmill',x:-12,y:5,rotation:0}]){const result=await act(s,{type:'habitat.build',...plan},at);at=result.player!.habitable!.buildings.at(-1)!.endsAt+1;await read(s,at);}assert.deepEqual(player(s).habitable!.commerce!.gateway,gateway);assert.equal(player(s).habitable!.buildings.length,3);
  at=await arrivedAndClear(s);await act(s,{type:'habitat.trade.dispatch',buildingId:s.buildingId},at);const c=current(s),collection=c.caravan.collection!,plot=player(s).settlement!,hero=habitablePositionAt(player(s).habitable!,at),fixed=HABITABLE_POINTS.map(p=>({x:p.x+.7,y:p.y}));
  for(let time=collection.startsAt;time<=collection.departsAt;time+=100){const pose=habitableTradePoseAt(c.caravan,time);if(pose.driverOnCart||pose.seatProgress>.001)continue;const driver={x:pose.driver.x-plot.x,y:pose.driver.y-plot.y};assert.ok(Math.hypot(driver.x-hero.x,driver.y-hero.y)>=.75,'driver respects the avatar');for(const other of fixed)assert.ok(Math.hypot(driver.x-other.x,driver.y-other.y)>=.75,'driver respects fixed district inhabitants');assert.ok(Math.hypot(pose.driver.x-pose.animal.x,pose.driver.y-pose.animal.y)>=.75,'horse leaves a real path');assert.ok(Math.hypot(pose.driver.x-pose.cart.x,pose.driver.y-pose.cart.y)>=.75,'walking conductor stays outside the parked cart');}
  assert.equal(stock(s),2);assert.equal(c.cargo.reduce((n,l)=>n+l.qty,0),2);await assert.rejects(act(s,{type:'habitat.trade.dispatch',buildingId:s.buildingId},at+1),/listo para cargar/);assert.equal(stock(s),2);
});

test('a zero-quality lot placed before two valid planks stays in storage and is never loaded as part of the sale',async()=>{
  const s=await setup(false,2),bad=give(player(s),'plank',1,s.at,'existing-rejected-quality-stock',[{itemId:'timber',qty:2}],false);player(s).inventory=player(s).inventory.filter(l=>l.id!==bad.id);bad.quality=0;bad.location=`habitat:${s.buildingId}`;shed(s).storage!.unshift(bad);await accept(s);const at=await arrivedAndClear(s);await act(s,{type:'habitat.trade.dispatch',buildingId:s.buildingId},at);assert.equal(current(s).cargo.reduce((n,l)=>n+l.qty,0),2);assert.ok(current(s).cargo.every(l=>l.quality>=1&&l.id!==bad.id));assert.equal(shed(s).storage!.length,1);assert.equal(shed(s).storage![0].id,bad.id);assert.equal(shed(s).storage![0].quality,0);assert.equal(shed(s).storage![0].qty,1);
});
