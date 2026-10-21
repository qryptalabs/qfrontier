import {HABITABLE_SPAWN,getHabitableStorageCapacity,habitableBuildingEntrance,habitablePath,habitablePositionAt,habitableWalkableAt} from './habitable-data.ts';
import type {HabitableBuilding,HabitableObstacle,HabitablePoint,HabitableWorkerVisual} from './habitable-data.ts';
import type {LandCrewLeg,LandCrewSchedule} from './land-grid.ts';
import type {HabitableManagerState} from './habitable-manager.ts';
import {habitableResidentBusy} from './habitable-residents.ts';
import {guardHabitableWorkerMovement,habitableReservedStorage,habitableWorkerObstacles} from './habitable-logistics.ts';
import {recordManagerShipmentDelivery} from './habitable-manager-balance.ts';
import {classifyManagerDelivery,managerPriorityOrder} from './habitable-manager-priorities.ts';
import {MvpError} from './helpers.ts';
import type {InventoryLot,ItemAmount,Job,MvpWorld,Player} from './types.ts';

export interface ManagerTransportState {
  residentId:string;origin:HabitablePoint;base:HabitablePoint;initializedAt:number;
  crew?:LandCrewSchedule;shipmentBuildingId?:string;blockedReason?:string;waitingAt?:number;releasedAt?:number;reason?:string;
}
export interface ManagerTransportView {
  residentId:string;name:string;phase:'idle'|'approaching'|'loading'|'carrying'|'unloading'|'returning'|'blocked';
  queue:number;cargoUnits:number;sourceBuildingId:string|null;destinationBuildingId:string|null;
  endsAt:number|null;blockedReason:string|null;reserved:boolean;
  reason?:string|null;queuedDeliveries?:{buildingId:string;reason:string;units:number}[];
}
export interface ManagerCourierChoice {residentId:string;name:string;available:boolean;reason:string|null}

const SPEED=1.6,LOADING_MS=2500,UNLOADING_MS=2000;
export const MANAGER_DELIVERY_AGING_MS=120000;
const quantity=(lots:readonly InventoryLot[])=>lots.reduce((n,l)=>n+l.qty,0);
const alive=(lot:InventoryLot,now:number)=>lot.qty>0&&(lot.expiresAt===null||lot.expiresAt>now);
const active=(job:Job|undefined)=>job?.status==='running'||job?.status==='reserved';
const obstacle=(id:string,point:HabitablePoint):HabitableObstacle=>({id,...point,width:.85,depth:.85});
const milliseconds=(points:readonly HabitablePoint[])=>Math.max(150,Math.ceil(points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0)/SPEED*1000));
const building=(p:Player,id:string|undefined)=>id?p.habitable?.buildings.find(b=>b.id===id):undefined;
const carrierShipment=(p:Player,m:HabitableManagerState)=>{const b=building(p,m.transport?.shipmentBuildingId),s=b?.shipment;return b&&s?.managerCourier&&s.workerId===m.transport?.residentId?{building:b,shipment:s}:null;};

/** State-only guard: safe to call from residentBusy/getWorkers without recursion. */
export function isManagerCourierReserved(p:Player,residentId:string,now:number):boolean {
  const m=p.habitable?.manager,t=m?.transport;if(!m?.parallel||!t||t.residentId!==residentId||t.releasedAt!==undefined)return false;
  const current=carrierShipment(p,m);
  return m.status==='active'||m.status==='draining'||!!t.crew&&t.crew.endsAt>now||!!current&&current.shipment.depositedAt===undefined;
}

export function getManagerCourierChoices(world:MvpWorld,p:Player,now:number):ManagerCourierChoice[] {
  return(p.habitable?.workforce?.residents??[]).map(r=>{const reason=r.assignment?'Este habitante tiene un puesto asignado.':isManagerCourierReserved(p,r.id,now)?'Este habitante está reservado para el transporte del turno.':habitableResidentBusy(world,p,r,now)?'Esperá a que termine su trabajo, traslado o regreso.':null;return{residentId:r.id,name:r.name,available:reason===null,reason};});
}

export function initializeManagerTransport(world:MvpWorld,p:Player,m:HabitableManagerState,now:number,residentId:string):void {
  if(!m.parallel)return;
  const state=p.habitable,r=state?.workforce?.residents.find(r=>r.id===residentId);
  if(!state||!r||r.assignment||habitableResidentBusy(world,p,r,now))throw new MvpError('Elegí un habitante propio sin puesto y disponible para el transporte completo del turno.',409);
  const origin=r.relocation?.endsAt!==undefined&&r.relocation.endsAt<=now?{...r.relocation.points.at(-1)!}:{...r.position},extra=habitableWorkerObstacles(world,p,now,undefined,true,r.id),avatar=habitablePositionAt(state,now);
  extra.push(obstacle('avatar',avatar));
  if(!Number.isFinite(origin.x)||!Number.isFinite(origin.y)||!habitableWalkableAt(origin,state,.32,extra))throw new MvpError('El lugar actual del transportista necesita un espacio propio, seco y libre.',409);
  const withCarrier=[...extra,obstacle(r.id,origin)];
  for(const b of state.buildings){const access=habitableBuildingEntrance(state,b);if(access&&habitablePath(state,HABITABLE_SPAWN,access,extra)&&!habitablePath(state,HABITABLE_SPAWN,access,withCarrier))throw new MvpError('El puesto de espera del transportista bloquearía una entrada; elegí otro habitante disponible.',409);}
  m.transport={residentId:r.id,origin:{...origin},base:{...origin},initializedAt:now};
}

function ownsJob(p:Player,m:HabitableManagerState,b:HabitableBuilding,job:Job|undefined):job is Job {
  return!!m.parallel&&!!m.transport&&m.transport.releasedAt===undefined&&!!job&&job.playerId===p.id&&job.payload.habitableLogistics===1&&job.payload.managerPlanId===m.id&&job.payload.managerTurnId===m.turn.id&&job.payload.managerCourierId===m.transport.residentId&&job.payload.outputShedId===m.supplyShedId&&job.payload.habitableBuildingId===b.id;
}
function queue(world:MvpWorld,p:Player,m:HabitableManagerState){
  return(p.habitable?.buildings??[]).flatMap(b=>{const job=b.operation?world.jobs[b.operation.jobId]:undefined;return ownsJob(p,m,b,job)&&!active(job)&&job.status==='completed'&&!!b.pending?.length&&!(b.shipment?.managerCourier&&b.shipment.jobId===job.id)?[{building:b,job}]:[];}).sort((a,b)=>a.job.endsAt-b.job.endsAt||a.job.id.localeCompare(b.job.id)||a.building.id.localeCompare(b.building.id));
}
const deliveryItems=(b:HabitableBuilding,now:number):ItemAmount[]=>(b.pending??[]).filter(l=>alive(l,now)).map(l=>({itemId:l.itemId,qty:l.qty}));
function rankedQueue(world:MvpWorld,p:Player,m:HabitableManagerState,now:number){
  const candidates=queue(world,p,m),stock=(building(p,m.supplyShedId)?.storage??[]).filter(l=>alive(l,now)).map(l=>({itemId:l.itemId,qty:l.qty}));
  const ranked=candidates.map(candidate=>{
    const signal=classifyManagerDelivery(m,deliveryItems(candidate.building,now),stock),aged=m.urgentTransport===true&&now-candidate.job.endsAt>=MANAGER_DELIVERY_AGING_MS;
    return{...candidate,rank:aged?-1:managerPriorityOrder(m.priority).indexOf(signal.priority),reason:m.urgentTransport===true?(aged?`Espera de al menos 2 minutos; ${signal.reason}`:signal.reason):'Orden de finalización (FIFO).'};
  });
  return m.urgentTransport===true?ranked.sort((a,b)=>a.rank-b.rank||a.job.endsAt-b.job.endsAt||a.job.id.localeCompare(b.job.id)||a.building.id.localeCompare(b.building.id)):ranked;
}
function guardLegs(world:MvpWorld,p:Player,residentId:string,legs:readonly LandCrewLeg[]){
  for(const leg of legs)guardHabitableWorkerMovement(world,p,{points:leg.points,startsAt:leg.startsAt,endsAt:leg.endsAt},residentId);
}

function planTrip(world:MvpWorld,p:Player,m:HabitableManagerState,b:HabitableBuilding,job:Job,now:number):boolean {
  const state=p.habitable!,t=m.transport!,shed=building(p,m.supplyShedId);
  if(!shed||shed.templateId!=='shed'||shed.endsAt>now||shed.demolition){t.blockedReason='Falta el cobertizo elegido, terminado y sin desmontaje.';return false;}
  const pending=(b.pending??[]).filter(l=>alive(l,now));if(!pending.length)return false;
  if(quantity((shed.storage??[]).filter(l=>alive(l,now)))+habitableReservedStorage(state,shed.id)+quantity(pending)>getHabitableStorageCapacity(shed)){t.blockedReason='El transportista espera espacio para toda la entrega en el cobertizo elegido.';b.deliveryBlockedReason=t.blockedReason;return false;}
  const earliest=Math.max(now,job.endsAt,...state.buildings.map(other=>Math.max(other.shipment?.endsAt??0,other.supply&&other.supply.cancelledAt===undefined?other.supply.unloadsAt:0)),...(state.workforce?.residents??[]).map(r=>r.relocation?.endsAt??0)),extra=habitableWorkerObstacles(world,p,earliest,undefined,true,t.residentId);
  extra.push(obstacle('avatar',habitablePositionAt(state,earliest)));
  const pickup=habitableBuildingEntrance(state,b),destination=habitableBuildingEntrance(state,shed),approach=pickup?habitablePath(state,t.base,pickup,extra):null,loaded=pickup&&destination?habitablePath(state,pickup,destination,extra):null,home=destination?habitablePath(state,destination,t.base,extra):null;
  if(!approach||!loaded||!home){t.blockedReason='El transportista espera una ruta libre de su puesto a la instalación, el cobertizo y su regreso.';b.deliveryBlockedReason=t.blockedReason;return false;}
  const arrivesAtSource=earliest+milliseconds(approach),pickupAt=arrivesAtSource+LOADING_MS,arrivesAt=pickupAt+milliseconds(loaded),unloadsAt=arrivesAt+UNLOADING_MS,endsAt=unloadsAt+milliseconds(home),cargoUnits=quantity(pending);
  const legs:LandCrewLeg[]=[{phase:'outbound',points:approach,startsAt:earliest,endsAt:arrivesAtSource},{phase:'loading',points:[pickup!,pickup!],startsAt:arrivesAtSource,endsAt:pickupAt,yaw:Math.atan2(b.x-pickup!.x,b.y-pickup!.y)},{phase:'between',points:loaded,startsAt:pickupAt,endsAt:arrivesAt,cargoUnits},{phase:'unloading',points:[destination!,destination!],startsAt:arrivesAt,endsAt:unloadsAt,yaw:Math.atan2(shed.x-destination!.x,shed.y-destination!.y),cargoUnits},{phase:'returning',points:home,startsAt:unloadsAt,endsAt}];
  try{guardLegs(world,p,t.residentId,legs);}catch(error){if(error instanceof MvpError&&error.status<500){t.blockedReason=error.message;b.deliveryBlockedReason=t.blockedReason;return false;}throw error;}
  b.shipment={id:`shipment:${job.id}`,jobId:job.id,workerId:t.residentId,sourceBuildingId:b.id,destinationBuildingId:shed.id,points:loaded,startsAt:earliest,pickupAt,arrivesAt,unloadsAt,endsAt,cargo:[],quantity:cargoUnits,managerCourier:true,unloadYaw:Math.atan2(shed.x-destination!.x,shed.y-destination!.y)};
  t.crew={kind:'transport',legs,startsAt:earliest,endsAt};t.shipmentBuildingId=b.id;delete t.blockedReason;delete t.waitingAt;delete b.deliveryBlockedReason;delete b.deliveryRetryAt;return true;
}

/** A failed shelf check keeps cargo physically with the courier at the destination. */
function settleTrip(world:MvpWorld,p:Player,m:HabitableManagerState,now:number):void {
  const current=carrierShipment(p,m),t=m.transport;if(!current||!t)return;const {building:b,shipment:s}=current;
  if(s.pickedUpAt===undefined&&now>=s.pickupAt){s.cargo=b.pending??[];b.pending=[];s.pickedUpAt=s.pickupAt;}
  if(s.pickedUpAt===undefined||s.depositedAt!==undefined||now<s.unloadsAt)return;
  const state=p.habitable!,shed=building(p,s.destinationBuildingId),deliveryAt=t.waitingAt===undefined?s.unloadsAt:now,stored=(shed?.storage??[]).filter(l=>alive(l,deliveryAt)),cargo=s.cargo.filter(l=>alive(l,deliveryAt));
  if(!shed||shed.templateId!=='shed'||shed.endsAt>s.unloadsAt||quantity(stored)+quantity(cargo)>getHabitableStorageCapacity(shed)){
    t.blockedReason=!shed?'La entrega espera el cobertizo elegido; la carga permanece con el transportista.':'La entrega espera espacio; la carga permanece con el transportista.';t.waitingAt??=s.arrivesAt;b.deliveryBlockedReason=t.blockedReason;return;
  }
  if(t.waitingAt!==undefined){
    const from=s.points.at(-1)!,extra=habitableWorkerObstacles(world,p,now,undefined,true,t.residentId);extra.push(obstacle('avatar',habitablePositionAt(state,now)));const home=habitablePath(state,from,t.base,extra);
    if(!home)return;const unloadsAt=now+UNLOADING_MS,endsAt=unloadsAt+milliseconds(home),legs:LandCrewLeg[]=[{phase:'unloading',points:[from,from],startsAt:now,endsAt:unloadsAt,cargoUnits:quantity(s.cargo.filter(l=>alive(l,now))),yaw:s.unloadYaw},{phase:'returning',points:home,startsAt:unloadsAt,endsAt}];
    try{guardLegs(world,p,t.residentId,legs);}catch(error){if(error instanceof MvpError&&error.status<500){t.blockedReason=error.message;return;}throw error;}
    s.unloadsAt=unloadsAt;s.endsAt=endsAt;t.crew={kind:'transport',legs,startsAt:now,endsAt};delete t.waitingAt;delete t.blockedReason;delete b.deliveryBlockedReason;return;
  }
  for(const lot of cargo)lot.location=`habitat:${shed.id}`;shed.storage=[...stored,...cargo];recordManagerShipmentDelivery(p,s.jobId,s.cargo,s.unloadsAt);s.deliveredQuantity=quantity(cargo);s.expiredQuantity=s.quantity-s.deliveredQuantity;s.cargo=[];s.depositedAt=s.unloadsAt;delete t.blockedReason;delete b.deliveryBlockedReason;
}

export function settleManagerTransport(world:MvpWorld,p:Player,m:HabitableManagerState,now:number):void {
  const t=m.transport;if(!m.parallel||!t||t.releasedAt!==undefined)return;
  settleTrip(world,p,m,now);const current=carrierShipment(p,m);
  if(current&&(current.shipment.depositedAt===undefined||current.shipment.endsAt>now))return;
  if(t.crew&&t.crew.endsAt>now)return;
  const waiting=rankedQueue(world,p,m,now);
  // Legacy plans retain their original head-of-line/FIFO behavior. An opted-in
  // courier may serve the next feasible source while an urgent route is blocked.
  let firstBlockedReason:string|undefined;
  for(const next of m.urgentTransport===true?waiting:waiting.slice(0,1)){
    if(planTrip(world,p,m,next.building,next.job,now)){if(m.urgentTransport===true)t.reason=next.reason;return;}
    firstBlockedReason??=t.blockedReason;
  }
  if(m.urgentTransport===true){if(waiting[0]){t.reason=waiting[0].reason;if(firstBlockedReason)t.blockedReason=firstBlockedReason;}else delete t.reason;}
}

export function managerTransportBusy(p:Player,m:HabitableManagerState,now:number):boolean {
  const t=m.transport;if(!m.parallel||!t||t.releasedAt!==undefined)return false;
  const current=carrierShipment(p,m);return!!current&&(current.shipment.depositedAt===undefined||current.shipment.endsAt>now)||!!t.crew&&t.crew.endsAt>now||(m.activeOrders??[]).some(a=>!!building(p,a.buildingId)?.pending?.length);
}
export function getManagerTransportDeadline(p:Player,m:HabitableManagerState,after:number):number|null {
  const t=m.transport;if(!m.parallel||!t||t.releasedAt!==undefined)return null;const current=carrierShipment(p,m),at:number[]=[];
  if(t.waitingAt===undefined&&t.crew)at.push(...t.crew.legs.map(leg=>leg.endsAt));
  if(current&&current.shipment.depositedAt===undefined)at.push(...current.shipment.cargo.flatMap(l=>l.expiresAt===null?[]:[l.expiresAt]));
  return at.filter(time=>time>after).sort((a,b)=>a-b)[0]??null;
}
export function releaseManagerTransport(world:MvpWorld,p:Player,m:HabitableManagerState,now:number):boolean {
  if(!m.parallel||!m.transport||m.transport.releasedAt!==undefined)return true;settleManagerTransport(world,p,m,now);
  if(m.status==='active'||m.active||(m.activeOrders?.length??0)>0||managerTransportBusy(p,m,now))return false;
  m.transport.releasedAt=now;return true;
}

/** One public actor replaces the existing resident; geometry and counts only. */
export function getManagerCarrierWorker(p:Player,m:HabitableManagerState,now:number):HabitableWorkerVisual|null {
  const t=m.transport;if(!m.parallel||!t||!isManagerCourierReserved(p,t.residentId,now))return null;
  const current=carrierShipment(p,m);let crew=t.crew&&now<t.crew.endsAt?structuredClone(t.crew):undefined;
  if(t.waitingAt!==undefined&&current){const point=current.shipment.points.at(-1)!;crew={kind:'transport',startsAt:t.waitingAt,endsAt:now+60000,legs:[{phase:'unloading',points:[point,point],startsAt:t.waitingAt,endsAt:now+60000,cargoUnits:quantity(current.shipment.cargo.filter(l=>alive(l,now))),yaw:current.shipment.unloadYaw}]};}
  if(crew&&current)for(const leg of crew.legs)if(leg.cargoUnits)leg.cargoUnits=quantity((current.shipment.pickedUpAt===undefined?current.building.pending??[]:current.shipment.cargo).filter(l=>alive(l,Math.max(now,leg.startsAt))));
  return{id:t.residentId,buildingId:current?.building.id??m.supplyShedId,role:'worker',stand:{...t.base},yaw:0,startsAt:0,workEndsAt:0,pendingUnits:0,blockedReason:t.blockedReason??null,...(crew?{crew}:{})};
}
export function getManagerTransportView(p:Player,m:HabitableManagerState,now:number,world?:MvpWorld):ManagerTransportView|null {
  const t=m.transport;if(!m.parallel||!t)return null;const current=carrierShipment(p,m),leg=t.crew?.legs.find(l=>now>=l.startsAt&&now<l.endsAt);
  const phase:ManagerTransportView['phase']=t.waitingAt!==undefined||t.blockedReason?'blocked':leg?.phase==='outbound'?'approaching':leg?.phase==='loading'?'loading':leg?.phase==='between'?'carrying':leg?.phase==='unloading'?'unloading':leg?.phase==='returning'?'returning':'idle';
  const waiting=world?rankedQueue(world,p,m,now):null,reason=m.urgentTransport===true?t.reason??null:'Orden de finalización (FIFO).';
  return{residentId:t.residentId,name:p.habitable?.workforce?.residents.find(r=>r.id===t.residentId)?.name??'Transportista',phase,queue:waiting?.length??(m.activeOrders??[]).filter(a=>a.buildingId!==t.shipmentBuildingId&&!!building(p,a.buildingId)?.pending?.length).length,cargoUnits:current&&current.shipment.pickedUpAt!==undefined&&current.shipment.depositedAt===undefined?quantity(current.shipment.cargo.filter(l=>alive(l,now))):0,sourceBuildingId:current?.building.id??null,destinationBuildingId:current?.shipment.destinationBuildingId??null,endsAt:t.waitingAt===undefined&&t.crew&&t.crew.endsAt>now?t.crew.endsAt:null,blockedReason:t.blockedReason??null,reserved:isManagerCourierReserved(p,t.residentId,now),reason,queuedDeliveries:waiting?.map(q=>({buildingId:q.building.id,reason:q.reason,units:deliveryItems(q.building,now).reduce((n,i)=>n+i.qty,0)}))??[]};
}
