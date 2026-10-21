import {isManagerOperatorBuildingReserved} from './habitable-manager-operator.ts';
import {HABITABLE_BUILDING_TEMPLATES,habitableBuildingEntrance,habitableLineClear,habitablePath,habitablePositionAt,habitableWalkableAt} from './habitable-data.ts';
import type {HabitableBuilding} from './habitable-data.ts';
import {habitableReservedStorage,habitableLogisticsBusy} from './habitable-logistics.ts';
import {landMaintenance,landCellAt,landCellOwned} from './land-grid.ts';
import type {LandCivilView,LandCrewSchedule,LandCrewLeg} from './land-grid.ts';
import {LAND_BRIDGE_PRESETS,landBridgePreset} from '../graphics/land-infrastructure.ts';
import {available,addLots,nextLotId} from './helpers.ts';
import type {InventoryLot,ItemAmount,ItemId,Job,MvpWorld,Player} from './types.ts';

export const LAND_ROAD_UNIT_COSTS:ItemAmount[]=[{itemId:'stone',qty:1}];
export const LAND_ROAD_SECONDS=10;
export const LAND_BRIDGE_COSTS:ItemAmount[]=[{itemId:'plank',qty:2},{itemId:'timber',qty:2},{itemId:'stone',qty:2}];
export const LAND_BRIDGE_SECONDS=60;
export const LAND_DEMOLITION_SECONDS=30;
const active=(j:Job|undefined)=>j?.status==='running'||j?.status==='reserved';
const ownBuilding=(p:Player,id:string)=>p.habitable?.buildings.find(b=>b.id===id);
export function demolitionReason(world:MvpWorld,p:Player,b:HabitableBuilding,now:number):string|null {
  const state=p.habitable!;
  if(isManagerOperatorBuildingReserved(p,b.id))return'Esperá a que el operador del turno vuelva a su puesto original antes de desmontar esta instalación.';
  if(b.endsAt>now)return'Esperá a que termine la construcción.';
  if(b.demolition)return'Esta instalación ya está reservada para desmontaje.';
  if(b.upgrade&&b.upgrade.endsAt>now||active(b.operation?world.jobs[b.operation.jobId]:undefined)||habitableLogisticsBusy(b,now))return'Esperá a que terminen la mejora, producción, carga y regreso del obrero.';
  if((b.storage??[]).some(l=>l.qty>0)||(b.pending??[]).some(l=>l.qty>0)||habitableReservedStorage(state,b.id)>0)return'Vaciá el almacén, las salidas y las reservas antes de desmontar.';
  if(state.workforce?.residents.some(r=>r.homeBuildingId===b.id))return'La vivienda está ocupada. No se puede desmontar mientras aloje habitantes; la reubicación de hogares todavía no está disponible.';
  if(state.workforce?.residents.some(r=>r.assignment?.buildingId===b.id))return'Quitá la asignación del habitante y esperá su regreso antes de desmontar.';
  if(b.workOrder&&(b.workOrder.status==='active'||b.workOrder.status==='stopping'))return'Detené el pedido industrial y esperá su último regreso.';
  if(state.buildings.some(other=>other.id!==b.id&&(other.shipment?.destinationBuildingId===b.id&&(other.shipment.endsAt>now||other.shipment.depositedAt===undefined)||other.supply?.sourceBuildingId===b.id&&other.supply.cancelledAt===undefined&&(other.supply.unloadsAt>now||other.supply.consumedAt===undefined)||other.workOrder?.supplyShedId===b.id&&(other.workOrder.status==='active'||other.workOrder.status==='stopping'))))return'Otra instalación todavía usa este cobertizo en una ruta o pedido.';
  if(state.buildings.some(other=>other.construction?.sourceBuildingId===b.id&&other.construction.crew.endsAt>now))return'Esperá a que el constructor termine de recoger, construir y regresar antes de desmontar este cobertizo.';
  if(state.daily&&state.daily.journey.sourceBuildingId===b.id&&state.daily.journey.endsAt>now)return'Esperá el regreso de la jornada de alimentos.';
  if(state.commerce?.contracts.some(c=>c.buildingId===b.id&&!['completed','cancelled','expired'].includes(c.status)))return'Esperá a cerrar el encargo y la recogida comercial de este cobertizo.';
  return null;
}
/** Only recorded, genuinely consumed construction lots can become recyclable
 * material. A legacy building without that record yields nothing invented. */
export function demolitionRecovery(b:HabitableBuilding,at:number):InventoryLot[] {
  const costs=b.constructionCosts??[],items=new Map<ItemId,number>();for(const l of costs)items.set(l.itemId,(items.get(l.itemId)??0)+l.qty);
  const remaining=new Map([...items].map(([id,qty])=>[id,Math.floor(qty*.5)])),result:InventoryLot[]=[];
  for(const l of costs){const qty=Math.min(l.qty,remaining.get(l.itemId)??0);remaining.set(l.itemId,(remaining.get(l.itemId)??0)-qty);if(qty>0&&(l.expiresAt===null||l.expiresAt>at))result.push({...structuredClone(l),qty});}return result;
}
export function demolitionAccess(world:MvpWorld,p:Player,b:HabitableBuilding,now:number):string|null {const state=p.habitable!,access=habitableBuildingEntrance(state,b),pos=habitablePositionAt(state,now);return!access||Math.hypot(access.x-pos.x,access.y-pos.y)>1.65||!habitableLineClear(pos,access,state)?'Acercate al acceso de la instalación para confirmar su desmontaje.':null;}
export function bridgeReason(world:MvpWorld,p:Player,id:string,now:number):string|null {
  const preset=landBridgePreset(id),state=p.habitable;if(!preset||!state)return'Plano de puente desconocido.';
  if(state.land?.bridges?.some(b=>b.presetId===id))return'El puente ya está terminado.';
  for(const end of[preset.from,preset.to]){const cell=landCellAt(end.x,end.y);if(!cell||!landCellOwned(state,cell)||!habitableWalkableAt(end,state)||!habitablePath(state,{x:0,y:1.5},end))return'Conservá ambas orillas propias, secas y conectadas al distrito.';}
  if(LAND_BRIDGE_COSTS.some(i=>available(p,i.itemId,now)<i.qty))return'Faltan materiales reales en Estación para este puente.';
  return null;
}
const amounts=(lots:InventoryLot[])=>{const values=new Map<ItemId,number>();for(const l of lots)values.set(l.itemId,(values.get(l.itemId)??0)+l.qty);return[...values].map(([itemId,qty])=>({itemId,qty}));};
export function getLandCivilView(world:MvpWorld,p:Player,now:number):LandCivilView {
  const state=p.habitable!,land=state.land,running=Object.values(world.jobs).find(j=>j.playerId===p.id&&j.kind==='land'&&active(j)),extra=landMaintenance(state),rations=(state.workforce?.residents.length??0)+extra.extraRations,timber=Math.ceil(state.buildings.filter(b=>b.endsAt<=now).length/3)+extra.extraTimber;
  return{roads:{builtCells:Object.keys(land?.roads??{}),unitCosts:structuredClone(LAND_ROAD_UNIT_COSTS),secondsPerCell:LAND_ROAD_SECONDS},bridges:LAND_BRIDGE_PRESETS.map(preset=>{const completed=land?.bridges?.some(b=>b.presetId===preset.id),building=running?.payload.landOperation==='bridge'&&running.payload.presetId===preset.id,reason=completed?'El puente ya está terminado.':running?'Esperá a que regrese la cuadrilla de la orden actual.':bridgeReason(world,p,preset.id,now);return{id:preset.id,label:preset.name,from:{...preset.from},to:{...preset.to},width:preset.width,costs:structuredClone(LAND_BRIDGE_COSTS),seconds:LAND_BRIDGE_SECONDS,status:completed?'completed' as const:building?'building' as const:'available' as const,canStart:reason===null,reason};}),demolitions:state.buildings.map(b=>{const reason=running?'Esperá a que regrese la cuadrilla de la orden actual.':demolitionReason(world,p,b,now)??demolitionAccess(world,p,b,now);return{buildingId:b.id,label:HABITABLE_BUILDING_TEMPLATES.find(t=>t.id===b.templateId)!.label,seconds:LAND_DEMOLITION_SECONDS,recovery:amounts(demolitionRecovery(b,now+LAND_DEMOLITION_SECONDS*1000)),canStart:reason===null,reason};}),maintenance:{current:{rations,timber},afterRoadBatch:{rations,timber:timber+1},note:'Previsión de la próxima jornada manual: hasta ocho tramos nuevos añaden una madera; cada puente terminado añade otra. La comparación después de caminos supone un lote completo de ocho, sin cobros retroactivos.'}};
}
export function applyCivilWork(world:MvpWorld,p:Player,job:Job,leg:LandCrewLeg,at:number):void {
  const land=p.habitable!.land!,kind=job.payload.landOperation;
  if(kind==='road'&&leg.cellId){(land.roads??={})[leg.cellId]={completedAt:at};return;}
  if(kind==='bridge'){const preset=String(job.payload.presetId);if(!land.bridges?.some(b=>b.presetId===preset))(land.bridges??=[]).push({presetId:preset,completedAt:at});return;}
  if(kind!=='demolish')return;
  const id=String(job.payload.buildingId);if(land.demolished?.some(d=>d.jobId===job.id))return;const building=ownBuilding(p,id);
  const reason=building?demolitionReason(world,p,{...building,demolition:undefined},at):'La instalación reservada ya no está disponible.';
  if(reason){job.payload.demolitionAborted=reason;if(building)delete building.demolition;for(const back of (job.payload.crew as LandCrewSchedule).legs)if(back.phase==='returning')back.cargoUnits=0;return;}
  if(!building)return;
  const recovery=(job.payload.recovery as InventoryLot[]??[]).filter(l=>l.qty>0&&(l.expiresAt===null||l.expiresAt>at)).map(l=>({...structuredClone(l),id:nextLotId(p),originLotId:l.originLotId??l.id,location:`civil:${job.id}`}));
  const snapshot=structuredClone(building);delete snapshot.demolition;(land.demolished??=[]).push({id:`demolished:${job.id}`,jobId:job.id,building:snapshot,removedAt:at,recoveryCargo:recovery,recoveredLots:[]});p.habitable!.buildings=p.habitable!.buildings.filter(b=>b.id!==id);
}
export function finishCivilRecovery(p:Player,job:Job,at:number):void {const record=p.habitable?.land?.demolished?.find(d=>d.jobId===job.id);if(!record||record.recoveredAt!==undefined)return;const lots=(record.recoveryCargo??[]).filter(l=>l.expiresAt===null||l.expiresAt>at);for(const l of lots)l.location='station';record.recoveredLots=structuredClone(lots);record.recoveryCargo=[];record.recoveredAt=at;addLots(p,lots);}
export function reserveDemolition(p:Player,building:HabitableBuilding,job:Job,crew:LandCrewSchedule):void {const work=crew.legs.find(l=>l.phase==='working')!;job.payload.recovery=demolitionRecovery(building,crew.endsAt);const back=crew.legs.find(l=>l.phase==='returning');if(back)back.cargoUnits=(job.payload.recovery as InventoryLot[]).reduce((n,l)=>n+l.qty,0);building.demolition={jobId:job.id,startsAt:crew.startsAt,workStartsAt:work.startsAt,endsAt:work.endsAt};}
