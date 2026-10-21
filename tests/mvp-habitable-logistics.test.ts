import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMvp, readMvpView } from '../lib/mvp/engine.ts';
import { habitableBuildingEntrance, habitableLineClear, habitablePath, habitablePlacementError, habitableWorkerAt } from '../lib/mvp/habitable-data.ts';
import type { HabitableBuilding, HabitableMovement } from '../lib/mvp/habitable-data.ts';
import { getHabitableWorkers, guardHabitableWorkerMovement, guardHabitableWorkerConstruction, habitableReservedStorage, habitableWorkStand } from '../lib/mvp/habitable-logistics.ts';
import { give, nextLotId } from '../lib/mvp/helpers.ts';
import { dispatchSocial, settleSocial } from '../lib/mvp/social.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { MvpCommand, MvpWorld } from '../lib/mvp/types.ts';

class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;writes=0;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){this.record??={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(!this.record||this.record.revision!==revision)return false;this.writes++;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}
const NOW=Date.parse('2026-10-16T03:30:00Z');
async function setup(shed=true){
  const store=new MemoryStore(),owner='logistics-owner',created=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Prueba logística',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=created.player!.id;
  await executeMvp(store,owner,{type:'habitat.profile',playerId:id,appearance:'pine',profession:'farmer'},crypto.randomUUID(),undefined,NOW);
  const plans=[{templateId:'workbench',x:-2,y:-8,rotation:1},...(shed?[{templateId:'shed',x:7,y:3,rotation:0}]:[]),{templateId:'planter',x:8,y:6,rotation:0}];
  let at=NOW;for(const plan of plans){const built=await executeMvp(store,owner,{type:'habitat.build',playerId:id,...plan},crypto.randomUUID(),undefined,at);at=built.player!.habitable!.buildings.at(-1)!.endsAt+1;await readMvpView(store,owner,id,at);}
  return{store,owner,id,at};
}
type Fixture=Awaited<ReturnType<typeof setup>>;
const p=(s:Fixture)=>s.store.record!.world.players[s.id];
const b=(s:Fixture,type:string)=>p(s).habitable!.buildings.find(v=>v.templateId===type)!;
const act=(s:Fixture,command:MvpCommand,at=s.at,requestId=crypto.randomUUID())=>executeMvp(s.store,s.owner,{...command,playerId:s.id},requestId,undefined,at);
const read=(s:Fixture,at:number)=>readMvpView(s.store,s.owner,s.id,at);
const allLots=(s:Fixture)=>[...p(s).inventory,...p(s).habitable!.buildings.flatMap(v=>[...(v.storage??[]),...(v.pending??[]),...(v.shipment?.cargo??[])])];
async function walk(s:Fixture,target:{x:number;y:number},at=s.at){const moved=await act(s,{type:'habitat.walk',...target},at),ends=moved.player!.habitable!.movement!.endsAt+1;await read(s,ends);return ends;}
async function start(s:Fixture,type:'workbench'|'planter',at=s.at,recipeId='cloth'){const source=b(s,type),access=habitableBuildingEntrance(p(s).habitable!,source)!;at=await walk(s,access,at);const view=await act(s,{type:type==='workbench'?'habitat.workbench.start':'habitat.planter.start',buildingId:source.id,...(type==='workbench'?{recipeId}:{})},at),job=view.jobs.find(j=>j.id===view.habitable.facilities.find(f=>f.buildingId===source.id)!.operation!.jobId)!;return{at,job,sourceId:source.id};}
async function clearRoute(s:Fixture,at:number){return walk(s,{x:0,y:1.5},at);}
const from=(s:Fixture,id:string)=>p(s).habitable!.buildings.find(v=>v.id===id)!;

test('a new workshop job owns exactly one output through pickup, carrying, unloading and return with original provenance',async()=>{
  const s=await setup(),ordered=await start(s,'workbench');await clearRoute(s,ordered.at+1);assert.equal(ordered.job.endsAt-ordered.job.startsAt,300000);
  await read(s,ordered.job.endsAt-1);assert.equal(allLots(s).filter(l=>l.itemId==='cloth').length,0);
  const ready=await read(s,ordered.job.endsAt),source=from(s,ordered.sourceId),shipment=source.shipment;assert.ok(shipment,source.deliveryBlockedReason);assert.equal(source.pending!.length,0);assert.equal(p(s).inventory.filter(l=>l.itemId==='cloth').length,0);assert.equal(shipment.cargo.length,1);assert.equal(habitableReservedStorage(p(s).habitable!,b(s,'shed').id),1);assert.equal(shipment.startsAt,ordered.job.endsAt);
  const lot=structuredClone(shipment.cargo[0]),worker=ready.habitable.state!.workers![0];assert.equal(lot.provenance.source,`recipe:cloth:${ordered.job.id}`);assert.equal(lot.bound,true);assert.deepEqual(lot.provenance.inputs,[{itemId:'fiber',qty:3}]);
  assert.equal(habitableWorkerAt(worker,shipment.startsAt).state,'collecting');assert.equal(habitableWorkerAt(worker,shipment.pickupAt).state,'carrying');assert.equal(habitableWorkerAt(worker,shipment.arrivesAt).state,'unloading');assert.equal(habitableWorkerAt(worker,shipment.unloadsAt).state,'returning');
  await read(s,shipment.unloadsAt-1);assert.equal(b(s,'shed').storage,undefined);await read(s,shipment.unloadsAt);assert.equal(from(s,source.id).shipment!.cargo.length,0);const stored=b(s,'shed').storage![0];assert.deepEqual({...stored,location:lot.location},lot);assert.equal(stored.location,`habitat:${b(s,'shed').id}`);assert.equal(habitableReservedStorage(p(s).habitable!,b(s,'shed').id),0);
  await read(s,shipment.endsAt+1);await read(s,shipment.endsAt+10000);assert.equal(b(s,'shed').storage!.length,1);assert.equal(new Set(allLots(s).map(l=>l.id)).size,allLots(s).length);assert.equal(p(s).inventory.filter(l=>l.itemId==='cloth').length,0);
});

test('an offline read catches up production and a complete delivery once without waiting for browser animation',async()=>{
  const s=await setup(),ordered=await start(s,'planter');await clearRoute(s,ordered.at+1);const done=await read(s,ordered.job.endsAt+300000);assert.equal(done.habitable.facilities.find(f=>f.buildingId===ordered.sourceId)!.logistics!.status,'delivered');assert.equal(b(s,'shed').storage!.reduce((n,l)=>n+l.qty,0),4);assert.equal(from(s,ordered.sourceId).shipment!.cargo.length,0);assert.equal(from(s,ordered.sourceId).shipment!.startsAt,ordered.job.endsAt);
  const before=structuredClone(s.store.record),writes=s.store.writes;await read(s,ordered.job.endsAt+300001);assert.deepEqual(s.store.record,before);assert.equal(s.store.writes,writes);assert.equal(p(s).stats.farms,1);
});

test('missing storage leaves real pending goods and repeated blocked reads do not write or refresh timestamps',async()=>{
  const s=await setup(false),ordered=await start(s,'planter');await clearRoute(s,ordered.at+1);await read(s,ordered.job.endsAt);const source=from(s,ordered.sourceId);assert.equal(source.pending!.reduce((n,l)=>n+l.qty,0),4);assert.equal(source.shipment,undefined);const before=structuredClone(s.store.record),writes=s.store.writes;
  await read(s,ordered.job.endsAt+1000);await read(s,ordered.job.endsAt+2000);assert.deepEqual(s.store.record,before);assert.equal(s.store.writes,writes);
  const built=await act(s,{type:'habitat.build',templateId:'shed',x:7,y:3,rotation:0},ordered.job.endsAt+3000),shed=built.player!.habitable!.buildings.find(v=>v.templateId==='shed')!;await read(s,shed.endsAt+1);const shipped=from(s,source.id).shipment!;assert.ok(shipped);assert.ok(shipped.startsAt>=shed.endsAt);assert.equal(from(s,source.id).pending!.length,0);await read(s,shipped.endsAt+1);assert.equal(b(s,'shed').storage!.reduce((n,l)=>n+l.qty,0),4);
});

test('manual deposits and queued deliveries share the same eighty-unit reservation and space release never backdates transport',async()=>{
  const s=await setup(),ordered=await start(s,'planter');await clearRoute(s,ordered.at+1);const shed=b(s,'shed');shed.storage=[give(p(s),'stone',80,ordered.at,'existing-test-stock')];p(s).inventory=p(s).inventory.filter(l=>l.id!==shed.storage![0].id);shed.storage[0].location=`habitat:${shed.id}`;
  await read(s,ordered.job.endsAt);assert.equal(from(s,ordered.sourceId).pending!.reduce((n,l)=>n+l.qty,0),4);assert.equal(from(s,ordered.sourceId).shipment,undefined);
  let at=await walk(s,habitableBuildingEntrance(p(s).habitable!,shed)!,ordered.job.endsAt+1000);await act(s,{type:'habitat.storage.withdraw',buildingId:shed.id,lotId:b(s,'shed').storage![0].id,qty:4},at);const releaseAt=at;
  // The avatar stands in the unloading entrance, so the source waits rather than crossing its body.
  await read(s,at+1);assert.equal(from(s,ordered.sourceId).shipment,undefined);at=await clearRoute(s,at+2);await read(s,at+1);const shipment=from(s,ordered.sourceId).shipment!;assert.ok(shipment);assert.ok(shipment.startsAt>=releaseAt);assert.equal(habitableReservedStorage(p(s).habitable!,shed.id),4);
  at=await walk(s,habitableBuildingEntrance(p(s).habitable!,b(s,'shed'))!,shipment.endsAt+1);assert.equal(b(s,'shed').storage!.reduce((n,l)=>n+l.qty,0),80);await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:shed.id,lotId:p(s).inventory.find(l=>l.itemId==='stone')!.id,qty:1},at),/ochenta/);
});

test('reservation rejects an overfilling manual deposit before cargo arrives',async()=>{
  const s=await setup(),ordered=await start(s,'workbench');await clearRoute(s,ordered.at+1);await read(s,ordered.job.endsAt);const source=from(s,ordered.sourceId),shipment=source.shipment!;assert.ok(shipment);
  // Put the interacting avatar at a legal station-side point without advancing the cargo schedule.
  const shed=b(s,'shed'),access=habitableBuildingEntrance(p(s).habitable!,shed)!;p(s).habitable!.position={x:access.x-.8,y:access.y};const stone=give(p(s),'stone',80,shipment.startsAt,'test-deposit-stock');
  await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:shed.id,lotId:stone.id,qty:80},shipment.startsAt+1),/reservaron/);assert.equal(from(s,source.id).shipment!.cargo.length,1);assert.equal(b(s,'shed').storage,undefined);
});

test('two completed facilities serialize carrier routes and preserve each destination lot exactly once',async()=>{
  const s=await setup(),first=await start(s,'workbench'),second=await start(s,'planter',first.at+1);await clearRoute(s,second.at+1);
  // Match finish times to exercise queue scheduling without changing recipe durations.
  const craft=s.store.record!.world.jobs[first.job.id],farm=s.store.record!.world.jobs[second.job.id];craft.endsAt=farm.endsAt;await read(s,farm.endsAt);
  const routes=p(s).habitable!.buildings.flatMap(v=>v.shipment?[v.shipment]:[]);assert.equal(routes.length,2);routes.sort((a,b)=>a.startsAt-b.startsAt);assert.ok(routes[1].startsAt>=routes[0].endsAt);assert.equal(habitableReservedStorage(p(s).habitable!,b(s,'shed').id),5);
  await read(s,routes[1].endsAt+1);assert.equal(b(s,'shed').storage!.reduce((n,l)=>n+l.qty,0),5);assert.equal(new Set(allLots(s).map(l=>l.id)).size,allLots(s).length);
});

test('public workers expose only authoritative schedules while foreign views never expose pending or in-transit lot metadata',async()=>{
  const s=await setup(),ordered=await start(s,'workbench');await clearRoute(s,ordered.at+1);await read(s,ordered.job.endsAt);const source=from(s,ordered.sourceId);source.shipment!.cargo[0].provenance.source='private-cargo-proof';source.pending=[{...structuredClone(source.shipment!.cargo[0]),id:'private-pending-id',qty:1}];
  const view=await readMvpView(s.store,'foreign-reader',undefined,ordered.job.endsAt+1),actor=view.habitable.actors.find(a=>a.playerId===s.id)!;assert.ok(actor.state.workers?.length);assert.equal(actor.state.workers![0].shipment!.quantity,1);const text=JSON.stringify(view);assert.ok(!text.includes('private-cargo-proof'));assert.ok(!text.includes('private-pending-id'));assert.ok(!text.includes('"cargo":'));assert.ok(!text.includes('"pending":'));
});

test('legacy jobs without the opt-in marker retain station delivery and old saves do not gain workers or logistics',async()=>{
  const s=await setup(),ordered=await start(s,'workbench'),job=s.store.record!.world.jobs[ordered.job.id];delete job.payload.habitableLogistics;delete job.payload.workerStand;await read(s,job.endsAt);assert.equal(p(s).inventory.filter(l=>l.itemId==='cloth').length,1);assert.equal(from(s,ordered.sourceId).pending,undefined);assert.equal(from(s,ordered.sourceId).shipment,undefined);assert.equal(getHabitableWorkers(s.store.record!.world,p(s)).length,0);
  const before=structuredClone(s.store.record);await read(s,job.endsAt+1);assert.deepEqual(s.store.record,before);
});

test('worker stands and shipment routes respect authored geometry, other workers, the avatar and district figures',async()=>{
  const s=await setup(),ordered=await start(s,'workbench'),worker=getHabitableWorkers(s.store.record!.world,p(s))[0],access=habitableBuildingEntrance(p(s).habitable!,b(s,'workbench'))!;assert.ok(Math.hypot(worker.stand.x-access.x,worker.stand.y-access.y)>=.8);assert.ok(Math.hypot(worker.stand.x-p(s).habitable!.position.x,worker.stand.y-p(s).habitable!.position.y)>=.8);assert.equal(habitableWorkerAt(worker,worker.startsAt-1).working,false);
  await clearRoute(s,ordered.at+1);await read(s,ordered.job.endsAt);const shipment=from(s,ordered.sourceId).shipment!;for(let i=1;i<shipment.points.length;i++)assert.equal(habitableLineClear(shipment.points[i-1],shipment.points[i],p(s).habitable!),true);
  const carrying=habitableWorkerAt(getHabitableWorkers(s.store.record!.world,p(s))[0],shipment.pickupAt),move:HabitableMovement={points:[{x:carrying.x,y:carrying.y},{x:carrying.x+.1,y:carrying.y}],startsAt:shipment.pickupAt,endsAt:shipment.pickupAt+100};assert.throws(()=>guardHabitableWorkerMovement(s.store.record!.world,p(s),move),/obrero/);
});

test('active shipments and stationary worker posts cannot be covered by a new construction',async()=>{
  const s=await setup(),ordered=await start(s,'workbench');await clearRoute(s,ordered.at+1);await read(s,ordered.job.endsAt);const source=from(s,ordered.sourceId),shipment=source.shipment!;assert.ok(shipment);
  const longest=shipment.points.slice(1).map((point,i)=>({a:shipment.points[i],b:point,length:Math.hypot(point.x-shipment.points[i].x,point.y-shipment.points[i].y)})).sort((a,b)=>b.length-a.length)[0];
  const candidate:HabitableBuilding={id:'new-obstruction',templateId:'workbench',rotation:0,x:(longest.a.x+longest.b.x)/2,y:(longest.a.y+longest.b.y)/2,startsAt:shipment.startsAt+1,endsAt:shipment.startsAt+15001,bound:true};
  const proposed={...p(s).habitable!,buildings:[...p(s).habitable!.buildings,candidate]};
  assert.throws(()=>guardHabitableWorkerConstruction(s.store.record!.world,p(s),proposed,shipment.startsAt+1),/entrega reservada/);
  const before=structuredClone(s.store.record);await assert.rejects(act(s,{type:'habitat.build',templateId:candidate.templateId,rotation:candidate.rotation,x:candidate.x,y:candidate.y},shipment.startsAt+1));assert.deepEqual(s.store.record,before);
  const worker=getHabitableWorkers(s.store.record!.world,p(s))[0],onStand={...candidate,x:worker.stand.x,y:worker.stand.y};assert.throws(()=>guardHabitableWorkerConstruction(s.store.record!.world,p(s),{...p(s).habitable!,buildings:[...p(s).habitable!.buildings,onStand]},shipment.endsAt+1),/puesto de un obrero/);
});

test('pending, cargo and shelf ownership preserves quality origin and new lot IDs across all containers',async()=>{
  const s=await setup(false),ordered=await start(s,'workbench');await clearRoute(s,ordered.at+1);await read(s,ordered.job.endsAt);const source=from(s,ordered.sourceId),lot=source.pending![0];lot.quality=2;lot.originLotId=lot.id;
  const score=()=>{const world=structuredClone(s.store.record!.world);settleSocial(world,ordered.job.endsAt);dispatchSocial(world,{type:'reward.close',playerId:s.id},{ownerId:s.owner,requestId:crypto.randomUUID(),now:ordered.job.endsAt,actor:world.players[s.id]});return world.social.rewards.allocations.find(a=>a.playerId===s.id)!.multiplier;};
  const expected=score(),at=ordered.job.endsAt+1;await act(s,{type:'habitat.build',templateId:'shed',x:7,y:3,rotation:0},at);await read(s,at+30001);const shipment=from(s,ordered.sourceId).shipment!;assert.ok(shipment);assert.equal(score(),expected);assert.equal(shipment.cargo[0].originLotId,lot.id);p(s).lotSequence=100;shipment.cargo[0].id=`lot_${s.id}_101`;assert.equal(nextLotId(p(s)),`lot_${s.id}_102`);
  await read(s,shipment.endsAt+1);assert.equal(score(),expected);assert.equal(from(s,ordered.sourceId).shipment!.cargo.length,0);assert.equal(b(s,'shed').storage![0].originLotId,lot.id);
});

test('a normally legal construction is rejected before debit when its footprint cuts a reserved dry route',async()=>{
  const s=await setup(),state=p(s).habitable!;state.buildings=state.buildings.filter(v=>v.templateId!=='workbench');const source=b(s,'planter'),shed=b(s,'shed'),stand=habitableWorkStand(s.store.record!.world,p(s),source,s.at)!;
  const candidate:HabitableBuilding={id:'proposed',templateId:'workbench',x:-2,y:-8,rotation:0,startsAt:s.at,endsAt:s.at+15000,bound:true};assert.equal(habitablePlacementError(state,candidate,s.at),null);
  const first=habitablePath(state,stand,{x:-2,y:-8})!,second=habitablePath(state,{x:-2,y:-8},habitableBuildingEntrance(state,shed)!)!,points=[...first,...second.slice(1)];assert.ok(first);assert.ok(second);for(let i=1;i<points.length;i++)assert.equal(habitableLineClear(points[i-1],points[i],state),true);
  source.shipment={id:'test-reserved-delivery',jobId:'test-completed-job',workerId:'test-carrier',sourceBuildingId:source.id,destinationBuildingId:shed.id,points,startsAt:s.at+1000,pickupAt:s.at+3500,arrivesAt:s.at+40000,unloadsAt:s.at+42000,endsAt:s.at+80000,cargo:[],quantity:1};
  const before=structuredClone(s.store.record);await assert.rejects(act(s,{type:'habitat.build',templateId:candidate.templateId,x:candidate.x,y:candidate.y,rotation:0},s.at),/entrega reservada/);assert.deepEqual(s.store.record,before);
  assert.doesNotThrow(()=>guardHabitableWorkerConstruction(s.store.record!.world,p(s),{...state,buildings:[...state.buildings,candidate]},source.shipment!.endsAt+1));
});

test('expired blocked food is never scheduled after capacity appears and never claims a successful delivery',async()=>{
  const s=await setup(false),ordered=await start(s,'workbench',s.at,'ration');await clearRoute(s,ordered.at+1);await read(s,ordered.job.endsAt);const expiry=from(s,ordered.sourceId).pending![0].expiresAt!;assert.equal(expiry,ordered.job.endsAt+72*3600000);
  const expired=await read(s,expiry+1);assert.equal(expired.habitable.facilities.find(v=>v.buildingId===ordered.sourceId)!.logistics!.status,'expired');assert.equal(from(s,ordered.sourceId).pending!.length,0);assert.equal(from(s,ordered.sourceId).shipment,undefined);
  const created=await act(s,{type:'habitat.build',templateId:'shed',x:7,y:3,rotation:0},expiry+2),shed=created.player!.habitable!.buildings.find(v=>v.templateId==='shed')!;await read(s,shed.endsAt+1);assert.equal(from(s,ordered.sourceId).shipment,undefined);assert.equal(b(s,'shed').storage,undefined);
});

test('food expiring in transit records zero delivered while real completed deliveries remain historical after shelf expiry',async()=>{
  const s=await setup(),ordered=await start(s,'workbench',s.at,'ration');await clearRoute(s,ordered.at+1);await read(s,ordered.job.endsAt);const source=from(s,ordered.sourceId),shipment=source.shipment!;assert.ok(shipment);shipment.cargo[0].expiresAt=shipment.pickupAt+1;
  const expired=await read(s,shipment.endsAt+1);assert.equal(from(s,source.id).shipment!.deliveredQuantity,0);assert.equal(from(s,source.id).shipment!.expiredQuantity,1);assert.equal(expired.habitable.facilities.find(v=>v.buildingId===source.id)!.logistics!.status,'expired');assert.equal(b(s,'shed').storage!.length,0);
  const next=await setup(),normal=await start(next,'workbench',next.at,'ration');await clearRoute(next,normal.at+1);await read(next,normal.job.endsAt);const shipping=from(next,normal.sourceId).shipment!,expires=shipping.cargo[0].expiresAt!;await read(next,shipping.endsAt+1);assert.equal(b(next,'shed').storage!.length,1);const oldDelivery=await read(next,expires+1);assert.equal(b(next,'shed').storage!.length,0);assert.equal(oldDelivery.habitable.facilities.find(v=>v.buildingId===normal.sourceId)!.logistics!.status,'delivered');
});

test('a previously authorized avatar route prevents a later shipment from crossing its future position',async()=>{
  const s=await setup(),ordered=await start(s,'workbench');await clearRoute(s,ordered.at+1);const destination=habitableBuildingEntrance(p(s).habitable!,b(s,'shed'))!,moving=await act(s,{type:'habitat.walk',...destination},ordered.job.endsAt-1000),arrived=moving.player!.habitable!.movement!.endsAt+1;
  assert.ok(arrived>ordered.job.endsAt);await read(s,ordered.job.endsAt);assert.equal(from(s,ordered.sourceId).shipment,undefined);assert.equal(from(s,ordered.sourceId).pending!.length,1);
  await read(s,arrived);assert.equal(from(s,ordered.sourceId).shipment,undefined);await clearRoute(s,arrived+1);await read(s,p(s).habitable!.movement?.endsAt??arrived+20000);assert.ok(from(s,ordered.sourceId).shipment);
});

test('a new worker cannot reserve a stand in an already scheduled carrier corridor',async()=>{
  const s=await setup(),ordered=await start(s,'workbench');await clearRoute(s,ordered.at+1);await read(s,ordered.job.endsAt);const stand=habitableWorkStand(s.store.record!.world,p(s),b(s,'planter'),ordered.job.endsAt)!;assert.ok(stand);
  const shipment=from(s,ordered.sourceId).shipment!;shipment.points=[{...stand},{...stand}];shipment.startsAt=ordered.job.endsAt+1000;shipment.endsAt=ordered.job.endsAt+30000;
  const alternative=habitableWorkStand(s.store.record!.world,p(s),b(s,'planter'),ordered.job.endsAt);assert.ok(!alternative||Math.hypot(alternative.x-stand.x,alternative.y-stand.y)>=.8);
});
