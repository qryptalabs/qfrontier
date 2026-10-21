import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMvp, quoteMvp, readMvpView } from '../lib/mvp/engine.ts';
import { habitableBuildingEntrance, habitableLineClear, habitableWorkerAt } from '../lib/mvp/habitable-data.ts';
import { habitableForestSource, settleHabitableIndustry } from '../lib/mvp/habitable-industry.ts';
import { getHabitableWorkers } from '../lib/mvp/habitable-logistics.ts';
import { give } from '../lib/mvp/helpers.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { InventoryLot, MvpCommand, MvpWorld } from '../lib/mvp/types.ts';

class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;writes=0;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){this.record??={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(!this.record||this.record.revision!==revision)return false;this.writes++;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}
const NOW=Date.parse('2026-10-16T03:30:00Z');
async function setup(){
  const store=new MemoryStore(),owner='industry-owner',created=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Circuito forestal',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=created.player!.id;
  await executeMvp(store,owner,{type:'habitat.profile',playerId:id,appearance:'pine',profession:'carpenter'},crypto.randomUUID(),undefined,NOW);
  let at=NOW;for(const plan of[{templateId:'shed',x:7,y:3,rotation:0},{templateId:'woodlot',x:-12,y:1,rotation:0},{templateId:'sawmill',x:-12,y:5,rotation:0}]){const v=await executeMvp(store,owner,{type:'habitat.build',playerId:id,...plan},crypto.randomUUID(),undefined,at);at=v.player!.habitable!.buildings.at(-1)!.endsAt+1;await readMvpView(store,owner,id,at);}await executeMvp(store,owner,{type:'habitat.residents.initialize',playerId:id},crypto.randomUUID(),undefined,at);
  const s={store,owner,id,at};for(const[index,kind]of['woodlot','sawmill'].entries()){const resident=p(s).habitable!.workforce!.residents[index];await act(s,{type:'habitat.resident.assign',residentId:resident.id,buildingId:b(s,kind).id},s.at);s.at=p(s).habitable!.workforce!.residents[index].relocation!.endsAt+1;await read(s,s.at);}return s;
}
type Fixture={store:MemoryStore;owner:string;id:string;at:number};
const p=(s:Fixture)=>s.store.record!.world.players[s.id];
const b=(s:Fixture,type:string)=>p(s).habitable!.buildings.find(v=>v.templateId===type)!;
const act=(s:Fixture,command:MvpCommand,at=s.at,requestId=crypto.randomUUID())=>executeMvp(s.store,s.owner,{...command,playerId:s.id},requestId,undefined,at);
const read=(s:Fixture,at=s.at)=>readMvpView(s.store,s.owner,s.id,at);
async function walk(s:Fixture,point:{x:number;y:number},at=s.at){const moved=await act(s,{type:'habitat.walk',...point},at),end=moved.player!.habitable!.movement!.endsAt+1;await read(s,end);return end;}
async function go(s:Fixture,type:string,at=s.at){return walk(s,habitableBuildingEntrance(p(s).habitable!,b(s,type))!,at);}
const owned=(s:Fixture)=>[...p(s).inventory,...p(s).habitable!.buildings.flatMap(v=>[...(v.storage??[]),...(v.pending??[]),...(v.shipment?.cargo??[]),...(v.supply?.cargo??[])])];
const units=(lots:InventoryLot[],itemId:string)=>lots.filter(l=>l.itemId===itemId).reduce((n,l)=>n+l.qty,0);
async function stock(s:Fixture,qty=4,bound=false){const lot=give(p(s),'timber',qty,s.at,'existing-industry-stock',[],bound),shed=b(s,'shed');p(s).inventory=p(s).inventory.filter(v=>v.id!==lot.id);lot.location=`habitat:${shed.id}`;(shed.storage??=[]).push(lot);return lot;}

test('forestry reserves genuine finite stock, respects its duration and deposits one traceable transferable lot exactly once',async()=>{
  const s=await setup(),world=s.store.record!.world,source=habitableForestSource(world,p(s),s.at,4)!;assert.ok(source);const layerBefore=structuredClone(source.layer),timberBefore=units(owned(s),'timber');let at=await go(s,'woodlot');const request=crypto.randomUUID(),command={type:'habitat.woodlot.start',buildingId:b(s,'woodlot').id,qty:4};await act(s,command,at,request);const job=s.store.record!.world.jobs[b(s,'woodlot').operation!.jobId],layer=s.store.record!.world.tiles[String(job.payload.tileId)].deposits.find(d=>d.itemId==='timber')!.layers.find(l=>l.id===job.payload.layerId)!;assert.equal(job.endsAt-job.startsAt,60000);assert.equal(layer.remaining,layerBefore.remaining);assert.equal(layer.reserved,layerBefore.reserved+4);assert.equal(units(owned(s),'timber'),timberBefore);await act(s,command,at,request);assert.equal(layer.reserved,layerBefore.reserved+4);at=await walk(s,{x:0,y:1.5},at+1);
  await read(s,job.endsAt-1);assert.equal(units(owned(s),'timber'),timberBefore);await read(s,job.endsAt+300000);const goods=b(s,'shed').storage!.find(l=>l.provenance.source===`deposit:${job.payload.tileId}:${job.payload.layerId}:${job.id}`)!;assert.ok(goods);assert.equal(goods.qty,4);assert.equal(goods.bound,false);assert.equal(units(owned(s),'timber'),timberBefore+4);const finalLayer=s.store.record!.world.tiles[String(job.payload.tileId)].deposits.find(d=>d.itemId==='timber')!.layers.find(l=>l.id===job.payload.layerId)!;assert.equal(finalLayer.remaining,layerBefore.remaining-4);assert.equal(finalLayer.reserved,layerBefore.reserved);assert.equal(finalLayer.extracted,layerBefore.extracted+4);const done=structuredClone(s.store.record);await read(s,job.endsAt+300001);assert.deepEqual(s.store.record,done);
});

test('cancelling forestry releases only unextracted reserves and never grants timber or repeats the reservation',async()=>{
  const s=await setup();let at=await go(s,'woodlot');const before=units(owned(s),'timber');await act(s,{type:'habitat.woodlot.start',buildingId:b(s,'woodlot').id,qty:3},at);const job=s.store.record!.world.jobs[b(s,'woodlot').operation!.jobId],layer=s.store.record!.world.tiles[String(job.payload.tileId)].deposits.find(d=>d.itemId==='timber')!.layers.find(l=>l.id===job.payload.layerId)!,remaining=layer.remaining,reserved=layer.reserved;const request=crypto.randomUUID(),cmd={type:'habitat.facility.cancel',buildingId:b(s,'woodlot').id,jobId:job.id};await act(s,cmd,at+1,request);await act(s,cmd,at+1,request);const current=s.store.record!.world.tiles[String(job.payload.tileId)].deposits.find(d=>d.itemId==='timber')!.layers.find(l=>l.id===job.payload.layerId)!;assert.equal(current.remaining,remaining);assert.equal(current.reserved,reserved-3);await read(s,job.endsAt+300000);assert.equal(units(owned(s),'timber'),before);assert.equal(b(s,'woodlot').pending,undefined);
});

test('forestry shares per-account source quotas and active slots with legacy extraction and never invents a new deposit',async()=>{
  const s=await setup(),world=s.store.record!.world,source=habitableForestSource(world,p(s),s.at)!;for(const tile of Object.values(world.tiles))for(const d of tile.deposits)if(d.itemId==='timber')for(const layer of d.layers)if(layer!==source.layer)layer.remaining=0;
  const at=await go(s,'woodlot');world.jobs.quota={id:'quota',playerId:s.id,kind:'extract',status:'completed',createdAt:NOW,startsAt:NOW,endsAt:NOW,ruleVersion:world.rulesVersion,weather:{...Object.values(world.jobs)[0]?.weather},route:[source.tile.id],costs:[],payload:{tileId:source.tile.id,itemId:'timber',qty:28,layerId:source.layer.id},report:[]}as never;
  // Refresh the mutable reference after walking committed a new transaction clone.
  s.store.record!.world.jobs.quota=world.jobs.quota;const count=Object.keys(s.store.record!.world.tiles).length;await assert.rejects(act(s,{type:'habitat.woodlot.start',buildingId:b(s,'woodlot').id,qty:3},at),/cuota/);assert.equal(Object.keys(s.store.record!.world.tiles).length,count);assert.equal(habitableForestSource(s.store.record!.world,p(s),at,2)!.available,2);await assert.rejects(act(s,{type:'habitat.woodlot.start',buildingId:b(s,'woodlot').id,qty:11},at),/entero/);
});

test('an industrial saw consumes one two-timber cycle at a time and future cycles never complete from an offline backlog',async()=>{
  const s=await setup();await stock(s,6);let at=await go(s,'sawmill');await act(s,{type:'habitat.sawmill.order',buildingId:b(s,'sawmill').id,supplyShedId:b(s,'shed').id,target:3},at);let saw=b(s,'sawmill'),job=s.store.record!.world.jobs[saw.operation!.jobId];assert.equal(job.endsAt-job.startsAt,60000);assert.equal(saw.workOrder!.started,1);assert.equal(saw.workOrder!.completed,0);assert.equal(units(b(s,'shed').storage!,'timber'),4);assert.equal(units(saw.supply!.cargo,'timber'),2);at=await walk(s,{x:0,y:1.5},at+1);
  const late=job.endsAt+3600000;await read(s,late);settleHabitableIndustry(s.store.record!.world,late);saw=b(s,'sawmill');assert.equal(saw.workOrder!.completed,1);assert.equal(saw.workOrder!.started,2);job=s.store.record!.world.jobs[saw.operation!.jobId];assert.ok(job.createdAt>=late);assert.ok(job.startsAt>=late);assert.ok(job.endsAt>late);assert.equal(units(b(s,'shed').storage!,'plank'),1);assert.equal(units(saw.supply!.cargo,'timber'),2);assert.equal(units(b(s,'shed').storage!,'timber'),2);
  await read(s,job.endsAt+300000);settleHabitableIndustry(s.store.record!.world,job.endsAt+300000);saw=b(s,'sawmill');job=s.store.record!.world.jobs[saw.operation!.jobId];await read(s,job.endsAt+300000);settleHabitableIndustry(s.store.record!.world,job.endsAt+300000);assert.equal(b(s,'sawmill').workOrder!.status,'completed');assert.equal(b(s,'sawmill').workOrder!.completed,3);assert.equal(units(b(s,'shed').storage!,'plank'),3);assert.equal(units(owned(s),'timber'),units(p(s).inventory,'timber'));
});

test('orders pause safely on missing timber, do not write repeatedly, and resume one future cycle after genuine stock appears',async()=>{
  const s=await setup();await stock(s,2);let at=await go(s,'sawmill');await act(s,{type:'habitat.sawmill.order',buildingId:b(s,'sawmill').id,supplyShedId:b(s,'shed').id,target:2},at);const first=s.store.record!.world.jobs[b(s,'sawmill').operation!.jobId];at=await walk(s,{x:0,y:1.5},at+1);at=first.endsAt+300000;await read(s,at);settleHabitableIndustry(s.store.record!.world,at);assert.equal(b(s,'sawmill').workOrder!.completed,1);assert.equal(b(s,'sawmill').workOrder!.started,1);assert.ok(b(s,'sawmill').workOrder!.blockedReason);const before=structuredClone(s.store.record!.world);settleHabitableIndustry(s.store.record!.world,at+1000);assert.deepEqual(s.store.record!.world,before);await stock(s,2);const release=at+2000;settleHabitableIndustry(s.store.record!.world,release);const next=s.store.record!.world.jobs[b(s,'sawmill').operation!.jobId];assert.ok(next.createdAt>=release);assert.equal(b(s,'sawmill').workOrder!.started,2);
});

test('stop preserves the current input, production and delivery while preventing future cycles; resume retains the same order',async()=>{
  const s=await setup();await stock(s,4);let at=await go(s,'sawmill');await act(s,{type:'habitat.sawmill.order',buildingId:b(s,'sawmill').id,supplyShedId:b(s,'shed').id,target:2},at);const saw=b(s,'sawmill'),job=structuredClone(s.store.record!.world.jobs[saw.operation!.jobId]),orderId=saw.workOrder!.id;await act(s,{type:'habitat.sawmill.stop',buildingId:saw.id},at+1);assert.equal(b(s,'sawmill').workOrder!.status,'stopping');assert.deepEqual(s.store.record!.world.jobs[job.id],job);await assert.rejects(act(s,{type:'habitat.facility.cancel',buildingId:saw.id,jobId:job.id},at+2),/Detén el pedido/);at=await walk(s,{x:0,y:1.5},at+3);at=job.endsAt+300000;await read(s,at);settleHabitableIndustry(s.store.record!.world,at);assert.equal(b(s,'sawmill').workOrder!.status,'stopped');assert.equal(b(s,'sawmill').workOrder!.started,1);assert.equal(units(b(s,'shed').storage!,'timber'),2);assert.equal(units(b(s,'shed').storage!,'plank'),1);at=await go(s,'sawmill',at+1);await act(s,{type:'habitat.sawmill.resume',buildingId:saw.id},at);assert.equal(b(s,'sawmill').workOrder!.id,orderId);settleHabitableIndustry(s.store.record!.world,at);assert.equal(b(s,'sawmill').workOrder!.started,2);
});

test('mixed bound timber keeps the resulting plank bound and resident schedules share the existing collision geometry',async()=>{
  const s=await setup();await stock(s,1,true);await stock(s,1,false);let at=await go(s,'sawmill');const cmd={type:'habitat.sawmill.order',buildingId:b(s,'sawmill').id,supplyShedId:b(s,'shed').id,target:1},quote=await quoteMvp(s.store,s.owner,{...cmd,playerId:s.id},crypto.randomUUID(),at);assert.ok(quote.changes.some(c=>c.itemId==='timber'&&c.delta===-2));await act(s,cmd,at);const job=s.store.record!.world.jobs[b(s,'sawmill').operation!.jobId],supply=b(s,'sawmill').supply!;assert.equal(supply.cargo.filter(l=>l.bound).length,1);at=await walk(s,{x:0,y:1.5},at+1);const workers=getHabitableWorkers(s.store.record!.world,p(s),at);for(const worker of workers){for(let time=at;time<supply.unloadsAt;time+=100){const pose=habitableWorkerAt(worker,time);if(worker.supply)for(let i=1;i<worker.supply.points.length;i++)assert.ok(habitableLineClear(worker.supply.points[i-1],worker.supply.points[i],p(s).habitable!));assert.ok(Number.isFinite(pose.x));}}
  await read(s,job.endsAt+300000);settleHabitableIndustry(s.store.record!.world,job.endsAt+300000);const plank=b(s,'shed').storage!.find(l=>l.itemId==='plank')!;assert.equal(plank.bound,true);assert.deepEqual(plank.provenance.inputs,[{itemId:'timber',qty:2}]);assert.equal(plank.provenance.source,`recipe:plank:${job.id}`);
});
