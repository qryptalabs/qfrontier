import { getHabitableStorageCapacity, habitableBuildingEntrance, habitablePath, habitablePositionAt, habitableWorkerAt } from './habitable-data.ts';
import type { HabitableBuilding, HabitablePoint, HabitableSupply } from './habitable-data.ts';
import { habitableAssignedResident } from './habitable-residents.ts';
import { HABITABLE_CARRIER_SPEED, guardHabitableWorkerMovement, habitableWorkerObstacles, habitableWorkStand } from './habitable-logistics.ts';
import { available, MvpError, nextLotId } from './helpers.ts';
import type { InventoryLot, ItemAmount, Job, MvpWorld, Player } from './types.ts';
import { habitableDailyBusy } from './habitable-daily.ts';
import {commercialLot} from './city-shop-production-data.ts';
import {freeManagerLot,freeManagerMaterial} from './habitable-manager-reservations.ts';

export interface HabitableSupplySourceView {supplyShedId:string|null;label:string;available:boolean;reason:string|null;transportSeconds:number}
export interface HabitableSuppliesView {status:'queued'|'to_storage'|'loading'|'supplying'|'receiving'|'consumed'|'cancelled';sourceBuildingId:string;sourceName:string;quantity:number;cargo:InventoryLot[];startsAt:number;arrivesAtSource:number;pickupAt:number;arrivesAt:number;workStartsAt:number;canCancel:boolean}
const active=(status:string)=>status==='reserved'||status==='running';
const usable=(l:InventoryLot,at:number)=>l.expiresAt===null||l.expiresAt>at;
export function habitableWorkerReason(p:Player,b:HabitableBuilding,now:number):string|null {if(!p.habitable?.workforce)return null;const r=habitableAssignedResident(p,b);return!r?'Asigna un habitante a esta instalación.':habitableDailyBusy(p,r.id,now)?'Espera a que termine el reparto y regrese el habitante.':r.relocation&&r.relocation.endsAt>now?'Espera a que el habitante llegue a su puesto.':null;}
export function planHabitableSupply(world:MvpWorld,p:Player,b:HabitableBuilding,shed:HabitableBuilding,now:number,stand?:HabitablePoint):Omit<HabitableSupply,'id'|'jobId'|'workerId'|'cargo'|'quantity'>|null {
  if(shed.demolition||b.demolition)return null;const state=p.habitable!,origin=stand??habitableAssignedResident(p,b)?.assignment?.stand??habitableWorkStand(world,p,b,now);if(!origin)return null;
  const startsAt=Math.max(now,...state.buildings.map(v=>Math.max(v.shipment?.endsAt??0,v.supply?.cancelledAt===undefined&&v.supply?.consumedAt===undefined?v.supply?.unloadsAt??0:0)),...(state.workforce?.residents??[]).map(r=>r.relocation?.endsAt??0)),extra=habitableWorkerObstacles(world,p,startsAt,b.id),avatar=habitablePositionAt(state,startsAt);extra.push({id:'avatar',...avatar,width:.85,depth:.85});const access=habitableBuildingEntrance(state,shed),points=access?habitablePath(state,origin,access,extra):null;if(!points)return null;
  const length=points.slice(1).reduce((sum,v,i)=>sum+Math.hypot(v.x-points[i].x,v.y-points[i].y),0),travel=Math.max(1000,Math.ceil(length/HABITABLE_CARRIER_SPEED*1000)),arrivesAtSource=startsAt+travel,pickupAt=arrivesAtSource+2500,arrivesAt=pickupAt+travel,unloadsAt=arrivesAt+2000;
  // The same timed collision guard handles the empty approach and loaded return.
  const workerId=habitableAssignedResident(p,b)?.id??`worker:${b.id}`,inward={points:[...points].reverse(),startsAt:pickupAt,endsAt:arrivesAt},outward={points,startsAt,endsAt:arrivesAtSource};try{guardHabitableWorkerMovement(world,p,outward,workerId);guardHabitableWorkerMovement(world,p,inward,workerId);}catch{return null;}
  const worker={id:workerId,buildingId:b.id,role:'worker' as const,stand:origin,yaw:0,startsAt:unloadsAt,workEndsAt:unloadsAt,pendingUnits:0,blockedReason:null,supply:{points,startsAt,arrivesAtSource,pickupAt,arrivesAt,unloadsAt,sourceBuildingId:shed.id,quantity:0}};
  for(let at=now;at<=unloadsAt+100;at+=100){const time=Math.min(at,unloadsAt),pose=habitableWorkerAt(worker,time),player=habitablePositionAt(state,time);if(Math.hypot(pose.x-player.x,pose.y-player.y)<.75)return null;}
  return{points,startsAt,arrivesAtSource,pickupAt,arrivesAt,unloadsAt,sourceBuildingId:shed.id,pickupYaw:Math.atan2(shed.x-access!.x,shed.y-access!.y)};
}
export function getHabitableSupplySources(world:MvpWorld,p:Player,b:HabitableBuilding,inputs:ItemAmount[],now:number,blockedReason:string|null):HabitableSupplySourceView[] {
  const workerReason=habitableWorkerReason(p,b,now),base=blockedReason??workerReason,stationReason=base??(inputs.every(i=>available(p,i.itemId,now)>=i.qty)?null:'Faltan insumos en el inventario de la Estación.');
  return[{supplyShedId:null,label:'Inventario de la Estación',available:stationReason===null,reason:stationReason,transportSeconds:0},...(p.habitable?.buildings??[]).filter(s=>s.templateId==='shed'&&!s.demolition).map(s=>{const plan=!base&&s.endsAt<=now?planHabitableSupply(world,p,b,s,now):null,reason=base??(s.endsAt>now?'Espera a que termine el cobertizo.':!plan?'No hay una ruta libre y segura para abastecer desde este cobertizo. Apártate del acceso y deja pasar al obrero.':!inputs.every(i=>freeManagerMaterial(p,s.id,i.itemId,plan.unloadsAt)>=i.qty)?'Faltan insumos válidos en este cobertizo para la hora de entrega.':null);return{supplyShedId:s.id,label:'Cobertizo',available:reason===null,reason,transportSeconds:plan?Math.ceil((plan.unloadsAt-now)/1000):0};})];
}
export function takeHabitableSupply(p:Player,shed:HabitableBuilding,inputs:ItemAmount[],workStartsAt:number,minQuality=0,approvalId?:string,transferableOnly=false):InventoryLot[] {
  const eligible=(l:InventoryLot)=>usable(l,workStartsAt)&&l.quality>=minQuality&&(!transferableOnly||commercialLot(l,workStartsAt));
  if(!inputs.every(i=>(shed.storage??[]).filter(l=>l.itemId===i.itemId&&eligible(l)).reduce((n,l)=>n+freeManagerLot(p,shed.id,l,workStartsAt,approvalId),0)>=i.qty))throw new MvpError('El cobertizo no tiene los insumos válidos libres para la hora de entrega; los materiales asignados a otras obras están protegidos.',409);const result:InventoryLot[]=[];
  for(const input of inputs){let left=input.qty;for(const lot of[...(shed.storage??[])].filter(l=>l.itemId===input.itemId&&eligible(l)).sort((a,b)=>Number(b.bound)-Number(a.bound)||(a.expiresAt??Infinity)-(b.expiresAt??Infinity))){if(!left)break;const qty=Math.min(left,freeManagerLot(p,shed.id,lot,workStartsAt,approvalId));if(!qty)continue;const taken=structuredClone(lot);taken.qty=qty;if(qty<lot.qty){lot.originLotId??=lot.id;taken.originLotId=lot.originLotId;taken.id=nextLotId(p);}lot.qty-=qty;result.push(taken);left-=qty;}shed.storage=shed.storage!.filter(l=>l.qty>0);}
  return result;
}
export function getHabitableSuppliesView(b:HabitableBuilding,job:Job|undefined,now:number,near:boolean):HabitableSuppliesView|undefined {const s=b.supply;if(!s||s.jobId!==job?.id)return undefined;return{status:s.cancelledAt!==undefined?'cancelled':s.consumedAt!==undefined?'consumed':now<s.startsAt?'queued':now<s.arrivesAtSource?'to_storage':now<s.pickupAt?'loading':now<s.arrivesAt?'supplying':'receiving',sourceBuildingId:s.sourceBuildingId,sourceName:'Cobertizo',quantity:s.quantity,cargo:structuredClone(s.cargo),startsAt:s.startsAt,arrivesAtSource:s.arrivesAtSource,pickupAt:s.pickupAt,arrivesAt:s.arrivesAt,workStartsAt:s.unloadsAt,canCancel:near&&s.cancelledAt===undefined&&s.consumedAt===undefined&&now<s.startsAt};}
export function cancelHabitableSupply(world:MvpWorld,p:Player,b:HabitableBuilding,job:Job,now:number):boolean {
  const s=b.supply;if(!s||s.jobId!==job.id||s.cancelledAt!==undefined||s.consumedAt!==undefined)return false;if(now>=s.startsAt)throw new MvpError('El suministro ya está en traslado; espera a que llegue antes de cancelar la producción.',409);const shed=p.habitable!.buildings.find(v=>v.id===s.sourceBuildingId&&v.templateId==='shed');if(!shed)throw new MvpError('No se encuentra el cobertizo propietario de los insumos.',409);if((shed.storage??[]).reduce((n,l)=>n+l.qty,0)+s.cargo.reduce((n,l)=>n+l.qty,0)>getHabitableStorageCapacity(shed))throw new MvpError('El retorno de los insumos no concilia con la reserva de almacenamiento.',500);
  shed.storage=[...(shed.storage??[]),...s.cargo];s.cargo=[];s.cancelledAt=now;if(job.kind==='farm'){p.farmCycles--;world.regions[String(job.payload.regionId)].farmRemaining++;}job.status='cancelled';job.report=['Suministro cancelado antes de recoger: los insumos y el ciclo reservado vuelven a su origen.'];return true;
}
/** Runs before production settlement so held goods become consumed costs at the exact start time. */
export function settleHabitableSupplies(world:MvpWorld,now:number,scope?:{playerId:string;buildingIds?:ReadonlySet<string>}):void {
  for(const p of Object.values(world.players))for(const b of p.habitable?.buildings??[]){if(scope&&(p.id!==scope.playerId||scope.buildingIds&&!scope.buildingIds.has(b.id)))continue;const s=b.supply;if(!s||s.cancelledAt!==undefined||s.consumedAt!==undefined)continue;const job=world.jobs[s.jobId];if(!job||!active(job.status))continue;
    if(s.pickedUpAt===undefined&&now>=s.pickupAt){s.pickedUpAt=s.pickupAt;for(const lot of s.cargo)lot.location=`supply:${s.id}`;}
    if(now>=s.unloadsAt){if(job.costs.length)throw new MvpError('Los insumos del suministro ya fueron consumidos.',500);if(s.cargo.some(l=>!usable(l,s.unloadsAt)))throw new MvpError('Los insumos del suministro vencieron antes de su inicio autorizado.',500);job.costs=s.cargo;s.cargo=[];s.consumedAt=s.unloadsAt;}
  }
}
