import {shopLoaderReserved,shopLoadingWorker} from './city-shop-production-data.ts';
import {getLandWorkers} from './land-grid.ts';
import { HABITABLE_POINTS, HABITABLE_SPAWN, getHabitableStorageCapacity, habitableBuildingEntrance, habitableBuildingDimensions, habitableLineClear, habitablePath, habitablePositionAt, habitableWalkableAt, habitableWorkerAt } from './habitable-data.ts';
import { applyHabitableDailyWorkers } from './habitable-daily.ts';
import type { HabitableBuilding, HabitableMovement, HabitableObstacle, HabitablePoint, HabitableShipment, HabitableState, HabitableWorkerVisual } from './habitable-data.ts';
import {recordManagerProducedLot,recordManagerShipmentDelivery} from './habitable-manager-balance.ts';
import {getManagerCarrierWorker,isManagerCourierReserved,settleManagerTransport} from './habitable-manager-transport.ts';
import { give, MvpError } from './helpers.ts';
import type { InventoryLot, ItemAmount, ItemId, Job, MvpWorld, Player } from './types.ts';
import { getStationUpgradeWorkers } from './station-upgrades.ts';
import { getHabitableCommerceObstacles, guardHabitableCommerceMovement, guardHabitableCommerceConstruction } from './habitable-commerce.ts';

export const HABITABLE_CARRIER_SPEED=1.6;
const alive=(lot:InventoryLot,now:number)=>lot.qty>0&&(lot.expiresAt===null||lot.expiresAt>now);
const quantity=(lots:InventoryLot[])=>lots.reduce((n,l)=>n+l.qty,0);
const active=(job:Job)=>job.status==='running'||job.status==='reserved';
const staticPeople:HabitableObstacle[]=HABITABLE_POINTS.map(p=>({id:`district-${p.id}`,x:p.x+.7,y:p.y,width:.65,depth:.65}));
const obstacle=(id:string,p:HabitablePoint):HabitableObstacle=>({id,x:p.x,y:p.y,width:.85,depth:.85});
const routeLength=(points:HabitablePoint[])=>points.slice(1).reduce((n,b,i)=>n+Math.hypot(b.x-points[i].x,b.y-points[i].y),0);
const pointNearRoute=(point:HabitablePoint,points:HabitablePoint[])=>points.some((b,i)=>{if(!i)return Math.hypot(point.x-b.x,point.y-b.y)<.8;const a=points[i-1],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t)<.8;});

export function habitableReservedStorage(state:HabitableState,shedId:string):number {
  return state.buildings.reduce((sum,b)=>sum+(b.shipment?.destinationBuildingId===shedId&&b.shipment.depositedAt===undefined?quantity(b.shipment.cargo)+(b.shipment.managerCourier&&b.shipment.pickedUpAt===undefined?quantity(b.pending??[]):0):0)+(b.supply?.sourceBuildingId===shedId&&b.supply.cancelledAt===undefined&&b.supply.consumedAt===undefined?quantity(b.supply.cargo):0)+(b.construction?.sourceBuildingId===shedId&&b.construction.unloadedAt===undefined?quantity(b.construction.cargo):0),0);
}
export function habitableLogisticsBusy(b:HabitableBuilding,now:number):boolean{return!!b.construction&&b.construction.crew.endsAt>now||!!b.pending?.length||!!b.shipment&&(b.shipment.endsAt>now||!!b.shipment.managerCourier&&b.shipment.depositedAt===undefined)||!!b.supply&&b.supply.cancelledAt===undefined&&b.supply.consumedAt===undefined;}

export function getHabitableWorkers(world:MvpWorld,p:Player,now=Date.now()):HabitableWorkerVisual[] {
  const state=p.habitable;if(!state)return[];const workers:HabitableWorkerVisual[]=[];
  const add=(b:HabitableBuilding,id:string,stand:HabitablePoint,allowJob:boolean)=>{
    const j=b.operation?world.jobs[b.operation.jobId]:undefined,match=allowJob&&j&&j.playerId===p.id&&j.status!=='cancelled',s=match&&typeof j.payload.managerCourierId!=='string'?b.shipment:undefined,u=match?b.supply:undefined;
    workers.push({id,buildingId:b.id,role:b.templateId==='planter'?'farmer':b.templateId==='woodlot'?'forester':b.templateId==='sawmill'?'sawyer':'worker',stand:{...stand},yaw:Math.atan2(b.x-stand.x,b.y-stand.y),startsAt:match?j.startsAt:0,workEndsAt:match?j.endsAt:0,pendingUnits:match?quantity(b.pending??[]):0,blockedReason:match?b.deliveryBlockedReason??null:null,
      ...(s?{shipment:{points:structuredClone(s.points),startsAt:s.startsAt,pickupAt:s.pickupAt,arrivesAt:s.arrivesAt,unloadsAt:s.unloadsAt,endsAt:s.endsAt,quantity:s.quantity,destinationBuildingId:s.destinationBuildingId,unloadYaw:s.unloadYaw}}:{}),
      ...(u&&u.cancelledAt===undefined?{supply:{points:structuredClone(u.points),startsAt:u.startsAt,arrivesAtSource:u.arrivesAtSource,pickupAt:u.pickupAt,arrivesAt:u.arrivesAt,unloadsAt:u.unloadsAt,sourceBuildingId:u.sourceBuildingId,quantity:u.quantity,pickupYaw:u.pickupYaw}}:{})});
  };
  if(state.workforce){
    for(const r of state.workforce.residents){if(shopLoaderReserved(p,r.id,now)||isManagerCourierReserved(p,r.id,now)||state.buildings.some(b=>b.construction?.residentId===r.id&&b.construction.crew.endsAt>now))continue;const b=state.buildings.find(b=>b.id===r.assignment?.buildingId),j=b?.operation?world.jobs[b.operation.jobId]:undefined;
      if(r.relocation||!b){workers.push({id:r.id,buildingId:b?.id??r.homeBuildingId??'',role:b?.templateId==='planter'?'farmer':b?.templateId==='woodlot'?'forester':b?.templateId==='sawmill'?'sawyer':'worker',stand:{...r.position},yaw:0,startsAt:0,workEndsAt:0,pendingUnits:0,blockedReason:null,...(r.relocation?{relocation:structuredClone(r.relocation)}:{})});continue;}
      const match=j?.payload.residentId===r.id||!j?.payload.residentId&&r.id===`worker:${b.id}`;add(b,r.id,r.assignment!.stand,!!match);
    }
  }else for(const b of state.buildings){const j=b.operation?world.jobs[b.operation.jobId]:undefined,stand=j?.payload.workerStand as HabitablePoint|undefined;if(j&&j.playerId===p.id&&j.payload.habitableLogistics===1&&stand&&j.status!=='cancelled')add(b,`worker:${b.id}`,stand,true);}
  for(const b of state.buildings)if(!b.construction&&b.constructionStand&&b.startsAt<=now&&now<b.endsAt)workers.push({id:`builder:${b.id}`,buildingId:b.id,role:'builder',stand:{...b.constructionStand},yaw:Math.atan2(b.x-b.constructionStand.x,b.y-b.constructionStand.y),startsAt:b.startsAt,workEndsAt:b.endsAt,pendingUnits:0,blockedReason:null});
  for(const b of state.buildings){const c=b.construction;if(c&&c.crew.startsAt<=now&&now<c.crew.endsAt)workers.push({id:c.workerId,buildingId:b.id,role:'builder',stand:{...c.crew.legs[0].points[0]},yaw:0,startsAt:c.crew.startsAt,workEndsAt:b.endsAt,pendingUnits:0,blockedReason:null,crew:structuredClone(c.crew)});}
  for(const b of state.buildings)if(b.upgrade&&b.upgrade.startsAt<=now&&now<b.upgrade.endsAt)workers.push({id:`builder:upgrade:${b.id}`,buildingId:b.id,role:'builder',stand:{...b.upgrade.constructionStand},yaw:Math.atan2(b.x-b.upgrade.constructionStand.x,b.y-b.upgrade.constructionStand.y),startsAt:b.upgrade.startsAt,workEndsAt:b.upgrade.endsAt,pendingUnits:0,blockedReason:null});
  const courier=state.manager?getManagerCarrierWorker(p,state.manager,now):null;
  const loader=shopLoadingWorker(p,now);return applyHabitableDailyWorkers(p,[...workers,...(loader?[loader]:[]),...getLandWorkers(world,p,now),...(courier?[courier]:[])]);
}
export function habitableWorkerObstacles(world:MvpWorld,p:Player,now:number,excludeBuildingId?:string,includeDistrict=true,excludeWorkerId?:string):HabitableObstacle[] {
  return[...(includeDistrict?staticPeople:[]),...getHabitableCommerceObstacles(world,p,now),...[...getHabitableWorkers(world,p,now),...getStationUpgradeWorkers(world,p)].filter(w=>(w.role!=='builder'||w.startsAt<=now&&now<(w.crew?.endsAt??w.workEndsAt))&&w.buildingId!==excludeBuildingId&&w.id!==excludeWorkerId).map(w=>obstacle(w.id,habitableWorkerAt(w,now)))];
}
export function habitableWorkStand(world:MvpWorld,p:Player,b:HabitableBuilding,now:number,excludeWorkerId?:string):HabitablePoint|null {
  const state=p.habitable!,access=habitableBuildingEntrance(state,b);if(!access)return null;const dx=access.x-b.x,dy=access.y-b.y,length=Math.hypot(dx,dy)||1,avatar=habitablePositionAt(state,now),extra=habitableWorkerObstacles(world,p,now,b.templateId==='house'?undefined:b.id,true,excludeWorkerId);
  const candidates:HabitablePoint[]=[.95,-.95,1.2,-1.2,1.5,-1.5,1.8,-1.8].map(distance=>({x:access.x-dx/length*.25+dy/length*distance,y:access.y-dy/length*.25-dx/length*distance}));
  // A dwelling hosts two people. The second reception point may use another
  // exterior wall, reached around the actual footprint rather than through it.
  if(b.templateId==='house'){const {width,depth}=habitableBuildingDimensions(b);for(const tangent of[0,.95,-.95])for(const sign of[1,-1])candidates.push({x:b.x+sign*(width/2+.45),y:b.y+tangent},{x:b.x+tangent,y:b.y+sign*(depth/2+.45)});}
  for(const point of candidates){
    if(Math.hypot(point.x-avatar.x,point.y-avatar.y)<.8||state.buildings.some(other=>other.shipment&&other.shipment.endsAt>now&&pointNearRoute(point,other.shipment.points)||other.supply&&other.supply.cancelledAt===undefined&&other.supply.unloadsAt>now&&pointNearRoute(point,other.supply.points))||state.workforce?.residents.some(r=>r.id!==excludeWorkerId&&r.relocation&&r.relocation.endsAt>now&&pointNearRoute(point,r.relocation.points))||!habitableWalkableAt(point,state,.32,extra)||!(b.templateId==='house'?habitablePath(state,access,point,extra):habitableLineClear(access,point,state,extra))||!habitablePath(state,point,HABITABLE_SPAWN,extra)||getLandWorkers(world,p,now).some(w=>w.crew?.legs.some(l=>l.endsAt>now&&pointNearRoute(point,l.points)))||!habitablePath(state,HABITABLE_SPAWN,access,[...extra,obstacle('proposed-worker',point)]))continue;
    return point;
  }
  return null;
}

/** Only explicitly opted-in jobs own pending goods; old jobs retain their original inventory delivery. */
export function giveHabitableOutput(world:MvpWorld,p:Player,job:Job,itemId:ItemId,qty:number,at:number,source:string,inputs:ItemAmount[],bound:boolean):void {
  const lot=give(p,itemId,qty,at,source,inputs,bound);if(job.payload.habitableLogistics!==1)return;
  const b=p.habitable?.buildings.find(b=>b.id===job.payload.habitableBuildingId);if(!b)throw new MvpError('No se encuentra la instalación propietaria de la producción.',500);
  p.inventory=p.inventory.filter(l=>l.id!==lot.id);lot.location=`production:${b.id}`;(b.pending??=[]).push(lot);recordManagerProducedLot(p,job,lot,at);
}

function finishShipment(state:HabitableState,b:HabitableBuilding,now:number,p:Player):void {
  const s=b.shipment;if(!s||s.managerCourier||s.depositedAt!==undefined||s.unloadsAt>now)return;
  const shed=state.buildings.find(v=>v.id===s.destinationBuildingId&&v.templateId==='shed'&&v.endsAt<=s.unloadsAt);
  if(!shed){b.pending=[...(b.pending??[]),...s.cargo];delete b.shipment;b.deliveryBlockedReason='Falta el cobertizo de destino.';b.deliveryRetryAt=now;return;}
  const stored=(shed.storage??[]).filter(l=>alive(l,s.unloadsAt)),cargo=s.cargo.filter(l=>alive(l,s.unloadsAt));
  if(quantity(stored)+quantity(cargo)>getHabitableStorageCapacity(shed)){b.pending=[...(b.pending??[]),...s.cargo];delete b.shipment;b.deliveryBlockedReason='El cobertizo no tiene espacio para recibir la entrega.';b.deliveryRetryAt=now;return;}
  for(const lot of cargo)lot.location=`habitat:${shed.id}`;shed.storage=[...stored,...cargo];recordManagerShipmentDelivery(p,s.jobId,s.cargo,s.unloadsAt);s.deliveredQuantity=quantity(cargo);s.expiredQuantity=s.quantity-s.deliveredQuantity;s.cargo=[];s.depositedAt=s.unloadsAt;delete b.deliveryBlockedReason;
}
function tryShipment(world:MvpWorld,p:Player,b:HabitableBuilding,now:number):void {
  const state=p.habitable!,job=b.operation?world.jobs[b.operation.jobId]:undefined;if(!b.pending?.length||!job||job.payload.habitableLogistics!==1||active(job)||job.status==='cancelled')return;
  if(typeof job.payload.managerCourierId==='string')return;
  if(b.shipment&&b.shipment.endsAt>now)return;
  const stand=job.payload.workerStand as HabitablePoint,earliest=Math.max(job.endsAt,b.deliveryBlockedReason?now:b.deliveryRetryAt??0,...state.buildings.map(v=>Math.max(v.shipment?.endsAt??0,v.supply&&v.supply.cancelledAt===undefined?v.supply.unloadsAt:0)),...(state.workforce?.residents??[]).map(r=>r.relocation?.endsAt??0),...state.buildings.map(b=>b.construction?.crew.endsAt??0),...getLandWorkers(world,p,now).map(w=>w.crew?.endsAt??0)),extra=habitableWorkerObstacles(world,p,earliest,b.id),avatar=habitablePositionAt(state,earliest);extra.push(obstacle('avatar',avatar));
  b.pending=b.pending.filter(l=>alive(l,earliest));if(!b.pending.length){delete b.deliveryBlockedReason;return;}
  let reason='Construye un cobertizo propio y espera a que termine.';
  for(const shed of state.buildings.filter(v=>v.templateId==='shed'&&!v.demolition&&v.endsAt<=now&&(!job.payload.outputShedId||v.id===job.payload.outputShedId)).sort((a,b)=>Math.hypot(a.x-stand.x,a.y-stand.y)-Math.hypot(b.x-stand.x,b.y-stand.y)||a.id.localeCompare(b.id))){
    if(quantity(shed.storage??[])+habitableReservedStorage(state,shed.id)+quantity(b.pending)>getHabitableStorageCapacity(shed)){reason='Libera espacio en un cobertizo: las entregas en ruta también reservan capacidad.';continue;}
    const access=habitableBuildingEntrance(state,shed),points=access?habitablePath(state,stand,access,extra):null;if(!points){reason='El paso está ocupado o no hay una ruta segura hasta el cobertizo. Apártate del acceso para dejar pasar al obrero.';continue;}
    const travel=Math.max(1000,Math.ceil(routeLength(points)/HABITABLE_CARRIER_SPEED*1000)),startsAt=Math.max(earliest,shed.endsAt),pickupAt=startsAt+2500,arrivesAt=pickupAt+travel,unloadsAt=arrivesAt+2000;
    const s:HabitableShipment={id:`shipment:${job.id}`,jobId:job.id,workerId:typeof job.payload.residentId==='string'?job.payload.residentId:`worker:${b.id}`,sourceBuildingId:b.id,destinationBuildingId:shed.id,points,startsAt,pickupAt,arrivesAt,unloadsAt,endsAt:unloadsAt+travel,cargo:b.pending,quantity:quantity(b.pending),unloadYaw:Math.atan2(shed.x-access!.x,shed.y-access!.y)};
    // A moving avatar's entire timed route is checked, rather than rendering a local avoidance illusion.
    if(state.movement&&state.movement.endsAt>startsAt&&shipmentHitsMovement(s,state.movement)){reason='El obrero espera a que termine tu paso por la ruta de entrega.';continue;}
    try{guardHabitableCommerceMovement(world,p,{points:s.points,startsAt:s.pickupAt,endsAt:s.arrivesAt});guardHabitableCommerceMovement(world,p,{points:[...s.points].reverse(),startsAt:s.unloadsAt,endsAt:s.endsAt});}catch(error){if(error instanceof MvpError&&error.status<500){reason=error.message;continue;}throw error;}
    b.pending=[];b.shipment=s;delete b.deliveryBlockedReason;delete b.deliveryRetryAt;return;
  }
  b.deliveryBlockedReason=reason;b.deliveryRetryAt??=now;
}
function shipmentHitsMovement(s:HabitableShipment,move:HabitableMovement):boolean {
  const w:HabitableWorkerVisual={id:s.workerId,buildingId:s.sourceBuildingId,role:'worker',stand:s.points[0],yaw:0,startsAt:s.startsAt,workEndsAt:s.startsAt,pendingUnits:0,blockedReason:null,shipment:s};
  const state={position:move.points[0],movement:move}as HabitableState,start=Math.max(s.startsAt,move.startsAt),end=s.endsAt;
  for(let at=start;at<=end+100;at+=100){const timestamp=Math.min(end,at),npc=habitableWorkerAt(w,timestamp),avatar=habitablePositionAt(state,timestamp);if(Math.hypot(npc.x-avatar.x,npc.y-avatar.y)<.75)return true;}return false;
}
export function guardHabitableWorkerMovement(world:MvpWorld,p:Player,move:HabitableMovement,excludeWorkerId?:string):void {
  guardHabitableCommerceMovement(world,p,move);
  const state={position:move.points[0],movement:move}as HabitableState;
  for(const w of[...getHabitableWorkers(world,p,move.startsAt),...getStationUpgradeWorkers(world,p)]){if(w.id===excludeWorkerId)continue;const end=Math.max(move.endsAt,w.shipment?.endsAt??0,w.supply?.unloadsAt??0,w.relocation?.endsAt??0,w.daily?.endsAt??0,w.crew?.endsAt??0);for(let at=move.startsAt;at<=end+100;at+=100){const timestamp=Math.min(end,at);if(w.role==='builder'&&(timestamp<w.startsAt||timestamp>=(w.crew?.endsAt??w.workEndsAt)))continue;const npc=habitableWorkerAt(w,timestamp),traveler=habitablePositionAt(state,timestamp);if(Math.hypot(npc.x-traveler.x,npc.y-traveler.y)<.75)throw new MvpError('Espera a que pase el obrero por esa ruta de entrega o elige otro camino.',409);}}
}
export function guardHabitableWorkerConstruction(world:MvpWorld,p:Player,proposed:HabitableState,now:number):void {
  guardHabitableCommerceConstruction(world,p,proposed,now);
  const operator=p.habitable?.manager?.operatorState;
  // Reserve a place to return, not a phantom standing actor: pedestrians may
  // still cross it, but a new permanent footprint cannot erase that origin.
  if(operator&&operator.releasedAt===undefined&&(!habitableWalkableAt(operator.origin,proposed,.32)||habitablePath(p.habitable!,HABITABLE_SPAWN,operator.origin)&&!habitablePath(proposed,HABITABLE_SPAWN,operator.origin)))throw new MvpError('La obra bloquearía el puesto original o el regreso del operador reservado para el turno.',409);
  const workers=[...getHabitableWorkers(world,p,now),...getStationUpgradeWorkers(world,p)];
  const reserved=(p.habitable?.buildings??[]).flatMap(b=>[...(b.shipment&&b.shipment.endsAt>now?[b.shipment.points]:[]),...(b.supply&&b.supply.cancelledAt===undefined&&b.supply.unloadsAt>now?[b.supply.points]:[])]);
  if(reserved.some(points=>points.some((point,i)=>i>0&&!habitableLineClear(points[i-1],point,proposed)))||workers.some(w=>!habitableWalkableAt(w.stand,proposed)||[...(w.shipment&&w.shipment.endsAt>now?[w.shipment.points]:[]),...(w.supply&&w.supply.unloadsAt>now?[w.supply.points]:[]),...(w.relocation&&w.relocation.endsAt>now?[w.relocation.points]:[]),...(w.daily?.legs.filter(l=>l.endsAt>now).map(l=>l.points)??[]),...(w.crew?.legs.filter(l=>l.endsAt>now).map(l=>l.points)??[])].some(points=>points.some((point,i)=>i>0&&!habitableLineClear(points[i-1],point,proposed)))))throw new MvpError('La obra bloquearía el puesto de un obrero o una ruta de entrega reservada.',409);
}

/** Each read catches up logical timestamps once; cargo is owned by exactly one pending/vehicle/shelf container. */
export function settleHabitableLogistics(world:MvpWorld,now:number,scope?:{playerId:string;buildingIds?:ReadonlySet<string>}):void {
  for(const p of Object.values(world.players)){const state=p.habitable;if(!state||scope&&p.id!==scope.playerId)continue;const buildings=scope?.buildingIds?state.buildings.filter(b=>scope.buildingIds!.has(b.id)):state.buildings;
    if(!scope?.buildingIds&&state.manager)settleManagerTransport(world,p,state.manager,now);
    for(const b of buildings)finishShipment(state,b,now,p);
    for(const b of [...buildings].sort((a,b)=>(world.jobs[a.operation?.jobId??'']?.endsAt??0)-(world.jobs[b.operation?.jobId??'']?.endsAt??0)||a.id.localeCompare(b.id))){tryShipment(world,p,b,now);finishShipment(state,b,now,p);}
    for(const b of buildings){if(b.pending)b.pending=b.pending.filter(l=>alive(l,now));if(b.storage)b.storage=b.storage.filter(l=>alive(l,now));}
  }
}
