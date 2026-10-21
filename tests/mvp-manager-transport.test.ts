import test from 'node:test';
import assert from 'node:assert/strict';
import {createMvpWorld,createPlayer,weatherFor} from '../lib/mvp/world.ts';
import {takeLot} from '../lib/mvp/helpers.ts';
import {getHabitableWorkers,giveHabitableOutput,habitableLogisticsBusy,habitableReservedStorage,habitableWorkStand,habitableWorkerObstacles,settleHabitableLogistics} from '../lib/mvp/habitable-logistics.ts';
import {habitableBuildingEntrance,habitableWorkerAt,habitableWalkableAt} from '../lib/mvp/habitable-data.ts';
import {habitableResidentBusy,dispatchHabitableResidents} from '../lib/mvp/habitable-residents.ts';
import {createManagerBalance} from '../lib/mvp/habitable-manager-balance.ts';
import {getManagerCarrierWorker,getManagerCourierChoices,getManagerTransportDeadline,getManagerTransportView,initializeManagerTransport,isManagerCourierReserved,managerTransportBusy,releaseManagerTransport,settleManagerTransport} from '../lib/mvp/habitable-manager-transport.ts';
import {createHabitableWorkerLayer} from '../lib/graphics/habitable-workers.ts';
import type {HabitableBuilding,HabitableShipment,HabitableState} from '../lib/mvp/habitable-data.ts';
import type {HabitableManagerState,ManagerActiveOrder} from '../lib/mvp/habitable-manager.ts';
import type {ItemId,Job} from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-16T20:00:00Z');
function shipmentOf(building:HabitableBuilding):HabitableShipment{const shipment=building.shipment;assert.ok(shipment);return shipment;}
function fixture(){
  const world=createMvpWorld('transport-owner',NOW),p=createPlayer(world,{ownerId:'transport-owner',requestId:crypto.randomUUID(),now:NOW,actor:null},{type:'player.create',name:'Alba',stationName:'Transporte',faction:'cartographers'});
  const shed:HabitableBuilding={id:'shed',templateId:'shed',x:-2,y:-8,rotation:0,startsAt:NOW-30000,endsAt:NOW-1,bound:true,storage:[]},bench:HabitableBuilding={id:'bench',templateId:'workbench',x:7,y:3,rotation:0,startsAt:NOW-30000,endsAt:NOW-1,bound:true},planter:HabitableBuilding={id:'planter',templateId:'planter',x:8,y:6,rotation:0,startsAt:NOW-30000,endsAt:NOW-1,bound:true};
  const h:HabitableState={version:1,appearance:'pine',profession:'farmer',position:{x:0,y:1.5},buildings:[shed,bench,planter],workforce:{sequence:3,initializedAt:NOW-60000,residents:[{id:'bench-worker',name:'Iris',createdAt:NOW-60000,homeBuildingId:null,position:{x:1.5,y:1.5}},{id:'farm-worker',name:'Tomás',createdAt:NOW-60000,homeBuildingId:null,position:{x:-1.5,y:1.5}},{id:'courier',name:'Nora',createdAt:NOW-60000,homeBuildingId:null,position:{x:-2,y:1.5}}]}};p.habitable=h;
  for(const [residentId,b]of[['bench-worker',bench],['farm-worker',planter]] as const){const r=h.workforce!.residents.find(r=>r.id===residentId)!,stand=habitableWorkStand(world,p,b,NOW);assert.ok(stand);r.assignment={buildingId:b.id,stand};r.position={...stand};}
  const manager:HabitableManagerState={version:1,id:'manager-transport',supplyShedId:shed.id,workbenchId:bench.id,planterId:planter.id,goals:{ration:2,plank:1,cloth:0},status:'active',parallel:true,courierResidentId:'courier',activeOrders:[],turn:{id:'turn-transport',startsAt:NOW,endsAt:NOW+1200000,maxOrders:12,inputBudget:80,startedOrders:0,completedOrders:0,committedInputs:[],sequence:0,balance:createManagerBalance(p,shed.id,NOW)},approvals:[],cursor:NOW,nextAt:null};h.manager=manager;
  initializeManagerTransport(world,p,manager,NOW,'courier');
  const output=(b:HabitableBuilding,itemId:ItemId,qty:number,endsAt=NOW+1000)=>{const id=`job-${b.id}-${endsAt}`,stand=p.habitable!.workforce!.residents.find(r=>r.assignment?.buildingId===b.id)!.assignment!.stand,job:Job={id,playerId:p.id,kind:itemId==='grain'?'farm':'craft',status:'completed',createdAt:NOW,startsAt:NOW,endsAt,ruleVersion:world.rulesVersion,weather:weatherFor(world.tiles[p.position].regionId,NOW),route:[p.position],costs:[],payload:{habitableLogistics:1,habitableBuildingId:b.id,residentId:b.id==='bench'?'bench-worker':'farm-worker',workerStand:stand,outputShedId:shed.id,managerPlanId:manager.id,managerTurnId:manager.turn.id,managerCourierId:'courier',recipeId:itemId,qty:1},report:[]};world.jobs[job.id]=job;b.operation={jobId:job.id};const order:ManagerActiveOrder={id:`order-${job.id}`,kind:itemId==='grain'?'farm':'craft',...(itemId==='plank'?{recipeId:'plank' as const}:{}),jobId:job.id,buildingId:b.id,inputs:[],outputs:[{itemId,qty}],createdAt:NOW};manager.activeOrders!.push(order);giveHabitableOutput(world,p,job,itemId,qty,endsAt,'transport-test-production',[],true);return job;};
  return{world,p,manager,shed,bench,planter,output};
}

test('one real courier approaches, picks up, delivers and returns while the producer remains at its own stand',()=>{
  const f=fixture(),job=f.output(f.bench,'plank',1),at=job.endsAt;settleManagerTransport(f.world,f.p,f.manager,at);const s=f.bench.shipment;assert.ok(s?.managerCourier);const crew=f.manager.transport!.crew!;
  assert.equal(s.workerId,'courier');assert.equal(f.bench.pending!.length,1);assert.equal(s.cargo.length,0);assert.equal(habitableReservedStorage(f.p.habitable!,f.shed.id),1);assert.ok(s.pickupAt>crew.startsAt);
  for(let time=crew.startsAt;time<=crew.endsAt;time+=100){const courier=getManagerCarrierWorker(f.p,f.manager,time);assert.ok(courier);const pose=habitableWorkerAt(courier,time),extra=habitableWorkerObstacles(f.world,f.p,time,undefined,true,'courier');assert.ok(habitableWalkableAt(pose,f.p.habitable!,.32,extra),`physical route at ${time}`);const workers=getHabitableWorkers(f.world,f.p,time);assert.equal(workers.filter(w=>w.id==='courier').length,1);const producer=workers.find(w=>w.id==='bench-worker')!;assert.equal(producer.shipment,undefined);assert.deepEqual({x:habitableWorkerAt(producer,time).x,y:habitableWorkerAt(producer,time).y},producer.stand);assert.ok(Math.hypot(pose.x-producer.stand.x,pose.y-producer.stand.y)>=.75);}
  settleManagerTransport(f.world,f.p,f.manager,s.pickupAt);assert.equal(f.bench.pending!.length,0);assert.equal(s.cargo.length,1);assert.equal(f.shed.storage!.length,0);assert.equal(getManagerTransportView(f.p,f.manager,s.pickupAt)!.cargoUnits,1);
  settleManagerTransport(f.world,f.p,f.manager,s.unloadsAt);assert.equal(s.cargo.length,0);assert.equal(f.shed.storage!.length,1);assert.equal(s.deliveredQuantity,1);assert.equal(f.shed.storage![0].provenance.source,'transport-test-production');assert.equal(managerTransportBusy(f.p,f.manager,s.unloadsAt),true,'the single vehicle remains occupied throughout its empty return');assert.equal(getManagerTransportView(f.p,f.manager,s.unloadsAt)!.cargoUnits,0);
  const end=habitableWorkerAt(getManagerCarrierWorker(f.p,f.manager,s.endsAt)!,s.endsAt);assert.deepEqual({x:end.x,y:end.y},f.manager.transport!.origin);assert.equal(getManagerTransportDeadline(f.p,f.manager,s.endsAt),null);
});

test('two producers queue FIFO and a second pickup cannot start before the same courier returns',()=>{
  const f=fixture(),first=f.output(f.planter,'grain',3,NOW+1000),second=f.output(f.bench,'plank',1,NOW+2000);settleManagerTransport(f.world,f.p,f.manager,second.endsAt);const firstTrip=f.planter.shipment;assert.ok(firstTrip);assert.equal(firstTrip.jobId,first.id);assert.equal(f.bench.shipment,undefined);assert.equal(getManagerTransportView(f.p,f.manager,second.endsAt)!.queue,1);
  settleManagerTransport(f.world,f.p,f.manager,firstTrip.pickupAt);settleManagerTransport(f.world,f.p,f.manager,firstTrip.unloadsAt);settleManagerTransport(f.world,f.p,f.manager,firstTrip.endsAt-1);assert.equal(f.bench.shipment,undefined);
  settleManagerTransport(f.world,f.p,f.manager,firstTrip.endsAt);const next=shipmentOf(f.bench);assert.ok(next.startsAt>=firstTrip.endsAt);assert.equal(next.workerId,firstTrip.workerId);assert.equal(f.bench.pending!.length,1);assert.equal(next.cargo.length,0);
  const duplicate=JSON.stringify(f.world);settleManagerTransport(f.world,f.p,f.manager,firstTrip.endsAt);assert.equal(JSON.stringify(f.world),duplicate,'repeated settlement does not assign a second trip or copy goods');
});

test('the reserved resident cannot be reassigned and is released only after all orders and the empty return drain',()=>{
  const f=fixture(),courier=f.p.habitable!.workforce!.residents.find(r=>r.id==='courier')!;assert.equal(habitableResidentBusy(f.world,f.p,courier,NOW),true);assert.equal(getManagerCourierChoices(f.world,f.p,NOW).find(r=>r.residentId==='courier')!.available,false);
  assert.throws(()=>dispatchHabitableResidents(f.world,{type:'habitat.resident.assign',residentId:'courier',buildingId:f.bench.id},{ownerId:f.p.ownerId,requestId:crypto.randomUUID(),now:NOW,actor:f.p}),/termine|traslado|entrega/);
  const job=f.output(f.bench,'plank',1);settleManagerTransport(f.world,f.p,f.manager,job.endsAt);const s=f.bench.shipment!;f.manager.status='draining';assert.equal(releaseManagerTransport(f.world,f.p,f.manager,s.pickupAt),false);settleManagerTransport(f.world,f.p,f.manager,s.unloadsAt);assert.equal(releaseManagerTransport(f.world,f.p,f.manager,s.endsAt-1),false);
  settleManagerTransport(f.world,f.p,f.manager,s.endsAt);assert.equal(releaseManagerTransport(f.world,f.p,f.manager,s.endsAt),false,'an active order must be acknowledged by the manager before release');f.manager.activeOrders=[];assert.equal(releaseManagerTransport(f.world,f.p,f.manager,s.endsAt),true);f.manager.status='paused';assert.equal(isManagerCourierReserved(f.p,'courier',s.endsAt),false);assert.equal(habitableResidentBusy(f.world,f.p,courier,s.endsAt),false);assert.deepEqual(courier.position,f.manager.transport!.origin);
});

test('capacity backpressure leaves goods at their source and unexpected delivery blockage keeps cargo with the courier',()=>{
  const f=fixture();f.output(f.bench,'plank',1);
  // Move finite starter lots, rather than minting stock, to exercise a full shelf.
  let left=80;for(const lot of [...f.p.inventory]){const qty=Math.min(left,lot.qty);if(qty){const stored=takeLot(f.p,lot.id,qty,NOW);stored.location=`habitat:${f.shed.id}`;f.shed.storage!.push(stored);left-=qty;}if(!left)break;}assert.equal(left,0);
  settleManagerTransport(f.world,f.p,f.manager,NOW+1000);assert.equal(f.bench.shipment,undefined);assert.equal(f.bench.pending!.length,1);assert.match(getManagerTransportView(f.p,f.manager,NOW+1000)!.blockedReason!,/espacio/);
  const removed=f.shed.storage!.pop()!;f.p.inventory.push(removed);settleManagerTransport(f.world,f.p,f.manager,NOW+1001);const s=shipmentOf(f.bench);settleManagerTransport(f.world,f.p,f.manager,s.pickupAt);const carried=s.cargo[0];assert.ok(carried);assert.equal(f.bench.pending!.length,0);
  // An externally inconsistent shelf must not teleport the courier's cargo back to the producer.
  f.shed.storage!.push(removed);f.p.inventory=f.p.inventory.filter(l=>l.id!==removed.id);settleManagerTransport(f.world,f.p,f.manager,s.unloadsAt);assert.equal(s.depositedAt,undefined);assert.equal(s.cargo[0],carried);assert.equal(f.bench.pending!.length,0);assert.equal(getManagerTransportView(f.p,f.manager,s.unloadsAt)!.phase,'blocked');assert.equal(managerTransportBusy(f.p,f.manager,s.unloadsAt),true);
  const late=s.endsAt+10000;settleManagerTransport(f.world,f.p,f.manager,late);assert.equal(habitableLogisticsBusy(f.bench,late),true,'the manual producer slot also stays reserved while its courier still owns the cargo');assert.equal(getManagerTransportView(f.p,f.manager,late)!.cargoUnits,1);
  f.shed.storage!.pop();f.p.inventory.push(removed);settleManagerTransport(f.world,f.p,f.manager,late+1000);const delayed=s.unloadsAt;assert.ok(delayed>late);settleManagerTransport(f.world,f.p,f.manager,delayed);assert.equal(s.deliveredQuantity,1);assert.equal(s.cargo.length,0);assert.equal(f.shed.storage!.filter(l=>l.id===carried.id).length,1);
});

test('the existing renderer reuses one courier model, shows loads only after pickup, and pauses without losing cargo',()=>{
  const f=fixture(),job=f.output(f.bench,'plank',1);settleManagerTransport(f.world,f.p,f.manager,job.endsAt);const s=f.bench.shipment!,layer=createHabitableWorkerLayer({groundHeight:()=>2});
  for(const time of[job.endsAt,s.pickupAt,s.unloadsAt,s.endsAt]){settleManagerTransport(f.world,f.p,f.manager,time);const state={...f.p.habitable!,workers:getHabitableWorkers(f.world,f.p,time)};layer.update(state,time,true);const actor=layer.group.getObjectByName('habitable-worker-courier');assert.ok(actor);assert.equal(layer.group.getObjectsByProperty('name','habitable-worker-courier').length,1);assert.equal(actor.getObjectByName('actor-load')!.visible,time>=s.pickupAt&&time<s.unloadsAt);assert.equal(actor.getObjectByName('habitable-worker-hand-tool')!.visible,false,'no autonomous hammer on the courier');assert.equal(actor.position.y,2.035);}
  layer.dispose();layer.dispose();assert.equal(layer.group.children.length,0);
});

test('legacy serial state has no transport mutations and retains its existing worker and output ownership',()=>{
  const f=fixture();delete f.manager.parallel;delete f.manager.courierResidentId;delete f.manager.transport;delete f.manager.activeOrders;const before=structuredClone(f.world);
  initializeManagerTransport(f.world,f.p,f.manager,NOW,'missing');settleManagerTransport(f.world,f.p,f.manager,NOW+1000);assert.equal(releaseManagerTransport(f.world,f.p,f.manager,NOW+1000),true);assert.equal(getManagerTransportView(f.p,f.manager,NOW),null);assert.equal(getManagerCarrierWorker(f.p,f.manager,NOW),null);settleHabitableLogistics(f.world,NOW);assert.deepEqual(f.world,before);
});

test('urgent food dispatch overtakes newer stock only when explicitly enabled and preserves every physical lot',()=>{
  const f=fixture();f.manager.priority='food';f.manager.urgentTransport=true;
  f.output(f.bench,'cloth',1,NOW+1000);f.output(f.planter,'grain',3,NOW+2000);
  const lots=[...f.bench.pending!,...f.planter.pending!].map(l=>({id:l.id,qty:l.qty,provenance:structuredClone(l.provenance)}));
  settleManagerTransport(f.world,f.p,f.manager,NOW+2000);const first=shipmentOf(f.planter);
  assert.equal(f.bench.shipment,undefined);assert.match(getManagerTransportView(f.p,f.manager,NOW+2000,f.world)!.reason!,/raciones/);
  assert.deepEqual(getManagerTransportView(f.p,f.manager,NOW+2000,f.world)!.queuedDeliveries!.map(d=>d.buildingId),[f.bench.id]);
  settleManagerTransport(f.world,f.p,f.manager,first.pickupAt);settleManagerTransport(f.world,f.p,f.manager,first.unloadsAt);settleManagerTransport(f.world,f.p,f.manager,first.endsAt);const second=shipmentOf(f.bench);
  settleManagerTransport(f.world,f.p,f.manager,second.pickupAt);settleManagerTransport(f.world,f.p,f.manager,second.unloadsAt);
  assert.deepEqual(f.shed.storage!.map(l=>({id:l.id,qty:l.qty,provenance:l.provenance})).sort((a,b)=>a.id.localeCompare(b.id)),lots.sort((a,b)=>a.id.localeCompare(b.id)));
});

test('construction priority explains a real approved material need and never preempts an assigned trip',()=>{
  const f=fixture();f.manager.priority='construction';f.manager.urgentTransport=true;
  f.manager.approvals=[{id:'approved-house',templateId:'house',x:-9,y:9,rotation:0,costs:[{itemId:'plank',qty:1}],approvedAt:NOW,status:'approved'}];
  f.output(f.planter,'grain',3,NOW+1000);f.output(f.bench,'plank',1,NOW+2000);settleManagerTransport(f.world,f.p,f.manager,NOW+2000);
  const trip=shipmentOf(f.bench),saved=structuredClone({shipment:trip,crew:f.manager.transport!.crew});assert.match(getManagerTransportView(f.p,f.manager,NOW+2000,f.world)!.reason!,/obra aprobada/);
  f.manager.priority='food';settleManagerTransport(f.world,f.p,f.manager,trip.startsAt+100);
  assert.deepEqual({shipment:trip,crew:f.manager.transport!.crew},saved,'an updated preference cannot move an already assigned courier or its cargo');assert.equal(f.planter.shipment,undefined);
});

test('a delivery waiting two minutes ages ahead of fresh urgent goods with a stable FIFO tie break',()=>{
  const f=fixture();f.manager.priority='food';f.manager.urgentTransport=true;
  f.output(f.bench,'cloth',1,NOW+1000);f.output(f.planter,'grain',3,NOW+120000);const now=NOW+121000;
  settleManagerTransport(f.world,f.p,f.manager,now);assert.equal(shipmentOf(f.bench).sourceBuildingId,f.bench.id);assert.equal(f.planter.shipment,undefined);
  assert.match(getManagerTransportView(f.p,f.manager,now,f.world)!.reason!,/al menos 2 minutos/);
});

test('a blocked urgent pickup allows another feasible delivery while leaving the blocked goods at their source',()=>{
  const f=fixture();f.manager.priority='food';f.manager.urgentTransport=true;
  f.output(f.planter,'grain',3,NOW+1000);f.output(f.bench,'cloth',1,NOW+2000);
  const entrance=habitableBuildingEntrance(f.p.habitable!,f.planter);assert.ok(entrance);f.p.habitable!.position={...entrance};
  settleManagerTransport(f.world,f.p,f.manager,NOW+2000);assert.equal(f.planter.shipment,undefined);assert.equal(f.planter.pending!.reduce((n,l)=>n+l.qty,0),3);assert.match(f.planter.deliveryBlockedReason!,/ruta|movimiento|coincide|paso|ocupad/);
  const trip=shipmentOf(f.bench);assert.equal(trip.cargo.length,0);assert.equal(f.manager.transport!.shipmentBuildingId,f.bench.id);assert.equal(getHabitableWorkers(f.world,f.p,NOW+2000).filter(w=>w.id==='courier').length,1);
});

test('urgent capacity fallback fits a smaller real lot and priority alone leaves the legacy FIFO head unchanged',()=>{
  for(const urgent of[false,true]){const f=fixture();f.manager.priority='food';f.manager.urgentTransport=urgent;f.output(f.planter,'grain',3,NOW+1000);f.output(f.bench,'cloth',1,NOW+2000);
    let left=79;for(const lot of[...f.p.inventory]){const qty=Math.min(left,lot.qty);if(qty){const moved=takeLot(f.p,lot.id,qty,NOW);moved.location=`habitat:${f.shed.id}`;f.shed.storage!.push(moved);left-=qty;}if(left===0)break;}assert.equal(left,0);
    settleManagerTransport(f.world,f.p,f.manager,NOW+2000);assert.equal(f.planter.shipment,undefined);assert.equal(!!f.bench.shipment,urgent);assert.equal(f.planter.pending!.reduce((n,l)=>n+l.qty,0),3);
  }
});
