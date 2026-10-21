import {shopLoaderReserved} from './city-shop-production-data.ts';
import { HABITABLE_BUILDING_TEMPLATES, HABITABLE_INTERACTION_RADIUS, HABITABLE_SPAWN, habitableBuildingEntrance, habitableLineClear, habitablePath, habitablePositionAt, habitableWalkableAt } from './habitable-data.ts';
import type { HabitableBuilding, HabitableMovement, HabitablePoint, HabitableResident } from './habitable-data.ts';
import { actor, field, MvpError } from './helpers.ts';
import { guardHabitableWorkerMovement, habitableLogisticsBusy, habitableWorkerObstacles, habitableWorkStand } from './habitable-logistics.ts';
import type { Context, MvpCommand, MvpWorld, Player } from './types.ts';
import { habitableDailyBusy } from './habitable-daily.ts';
import {isManagerCourierReserved} from './habitable-manager-transport.ts';
import {isManagerOperatorBuildingReserved,isManagerOperatorReserved} from './habitable-manager-operator.ts';

export interface HabitableResidentView {id:string;name:string;homeBuildingId:string|null;assignmentBuildingId:string|null;assignmentLabel:string|null;status:'idle'|'working'|'supplying'|'carrying'|'waiting'|'relocating';busy:boolean;canUnassign:boolean}
export interface HabitableResidentsView {initialized:boolean;baseCapacity:number;capacity:number;occupied:number;residents:HabitableResidentView[];houses:{buildingId:string;ready:boolean;capacity:number;occupied:number;near:boolean;canRecruit:boolean;reason:string|null}[];canInitialize:boolean}
const active=(status:string)=>status==='running'||status==='reserved';
function stationary(world:MvpWorld,p:Player,now:number){if(p.habitable?.movement&&p.habitable.movement.endsAt>now||Object.values(world.jobs).some(j=>j.playerId===p.id&&active(j.status)&&(j.kind==='travel'||j.kind==='convoy')))throw new MvpError('Espera a terminar tu desplazamiento para organizar los habitantes.',409);}
const nameFor=(id:string)=>{const names=['Lucía','Mateo','Nora','Elías','Iris','Bruno','Ana','Tomás','Sara','Leo'];let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))>>>0;return names[hash%names.length];};
export function habitableResidentBusy(world:MvpWorld,p:Player,r:HabitableResident,now:number):boolean {
  if(shopLoaderReserved(p,r.id,now)||isManagerCourierReserved(p,r.id,now)||isManagerOperatorReserved(p,r.id))return true;
  if(p.habitable?.buildings.some(b=>b.construction?.residentId===r.id&&b.construction.crew.endsAt>now))return true;
  if(habitableDailyBusy(p,r.id,now))return true;
  if(r.relocation&&r.relocation.endsAt>now)return true;const b=p.habitable?.buildings.find(b=>b.id===r.assignment?.buildingId);if(!b)return false;const job=b.operation?world.jobs[b.operation.jobId]:undefined;return!!job&&active(job.status)||habitableLogisticsBusy(b,now)||!!b.supply&&b.supply.consumedAt===undefined&&b.supply.cancelledAt===undefined;
}
export function habitableAssignedResident(p:Player,b:HabitableBuilding):HabitableResident|undefined{return p.habitable?.workforce?.residents.find(r=>r.assignment?.buildingId===b.id);}
export function requireHabitableResident(world:MvpWorld,p:Player,b:HabitableBuilding,now:number,id?:unknown,managerPlanId?:string):HabitableResident|undefined {
  if(!p.habitable?.workforce){if(id!==undefined)throw new MvpError('Organiza primero el registro de habitantes.',409);return undefined;}
  const r=habitableAssignedResident(p,b);if(!r||id!==undefined&&id!==r.id)throw new MvpError('Asigna un habitante propio a esta instalación.',409);if(isManagerOperatorReserved(p,r.id)&&managerPlanId!==p.habitable.manager?.id)throw new MvpError('El operador está reservado para su turno; esperá su regreso antes de iniciar una orden manual.',409);if(habitableDailyBusy(p,r.id,now))throw new MvpError('Espera a que termine el reparto de alimentos y regrese el habitante.',409);if(r.relocation&&r.relocation.endsAt>now)throw new MvpError('Espera a que el habitante llegue a su nuevo puesto.',409);return r;
}
function parking(world:MvpWorld,p:Player,now:number):HabitablePoint|null {
  const state=p.habitable!,avatar=habitablePositionAt(state,now),extra=habitableWorkerObstacles(world,p,now);
  for(const point of[{x:-1.5,y:1.5},{x:1.5,y:1.5},{x:-2,y:1.5},{x:2,y:1.5},{x:-3,y:1.5},{x:0,y:2}])if(Math.hypot(point.x-avatar.x,point.y-avatar.y)>=.8&&habitableWalkableAt(point,state,.32,extra)&&habitablePath(state,HABITABLE_SPAWN,point,extra))return point;return null;
}
/** Plans the existing physical relocation without changing assignment or position. */
export function planHabitableResidentRelocation(world:MvpWorld,p:Player,r:HabitableResident,target:HabitablePoint,now:number):HabitableMovement {
  if(r.relocation&&r.relocation.endsAt>now)throw new MvpError('Espera a que el habitante llegue a su nuevo puesto.',409);
  const state=p.habitable!,from=r.relocation?.points.at(-1)??r.assignment?.stand??r.position,extra=habitableWorkerObstacles(world,p,now,undefined,true,r.id),avatar=habitablePositionAt(state,now);extra.push({id:'avatar',...avatar,width:.85,depth:.85});const points=habitablePath(state,from,target,extra);if(!points)throw new MvpError('No hay un camino seguro para que el habitante cambie de puesto; despeja el paso.',409);const length=points.slice(1).reduce((sum,b,i)=>sum+Math.hypot(b.x-points[i].x,b.y-points[i].y),0),move={points,startsAt:now,endsAt:now+Math.max(150,Math.ceil(length/1.6*1000))};guardHabitableWorkerMovement(world,p,move,r.id);
  if(state.movement&&state.movement.endsAt>now){
    const end=Math.max(move.endsAt,state.movement.endsAt),steps=Math.ceil((end-now)/100),traveler={...state,position:from,movement:move};
    // Normal district walks take seconds. Reject an invalid/unbounded schedule
    // instead of skipping future collisions or spending unbounded server time.
    if(!Number.isFinite(steps)||steps>20000)throw new MvpError('El desplazamiento pendiente es demasiado largo para reservar un traslado seguro; esperá a que termine.',409);
    for(let step=0;step<=steps;step++){const at=Math.min(end,now+step*100),npc=habitablePositionAt(traveler,at),player=habitablePositionAt(state,at);if(Math.hypot(npc.x-player.x,npc.y-player.y)<.75)throw new MvpError('El habitante espera a que termine tu desplazamiento por su ruta o puesto de llegada.',409);}
  }
  return move;
}
function relocation(world:MvpWorld,p:Player,r:HabitableResident,target:HabitablePoint,now:number){
  const move=planHabitableResidentRelocation(world,p,r,target,now);r.position={...move.points[0]};r.relocation=move;
}
export function getHabitableResidentsView(world:MvpWorld,p:Player|null,now:number):HabitableResidentsView {
  const state=p?.habitable,roster=state?.workforce,capacity=2+(state?.buildings.filter(b=>b.templateId==='house'&&b.endsAt<=now).length??0)*2,position=state?habitablePositionAt(state,now):HABITABLE_SPAWN;
  return{initialized:!!roster,baseCapacity:2,capacity,occupied:roster?.residents.length??2,canInitialize:!!state&&!roster,residents:(roster?.residents??[]).map(r=>{const building=state!.buildings.find(b=>b.id===r.assignment?.buildingId),job=building?.operation?world.jobs[building.operation.jobId]:undefined,busy=!!p&&habitableResidentBusy(world,p,r,now),status:HabitableResidentView['status']=state!.buildings.some(b=>b.construction?.residentId===r.id&&b.construction.crew.endsAt>now)?'working':r.relocation&&r.relocation.endsAt>now?'relocating':building?.supply&&building.supply.consumedAt===undefined&&building.supply.cancelledAt===undefined?'supplying':job&&active(job.status)?'working':building?.shipment&&building.shipment.endsAt>now?'carrying':building?.pending?.length?'waiting':'idle';return{id:r.id,name:r.name,homeBuildingId:r.homeBuildingId,assignmentBuildingId:building?.id??null,assignmentLabel:building?HABITABLE_BUILDING_TEMPLATES.find(t=>t.id===building.templateId)!.label:null,status,busy,canUnassign:!!building&&!busy};}),houses:(state?.buildings??[]).filter(b=>b.templateId==='house').map(b=>{const access=state?habitableBuildingEntrance(state,b):null,occupied=roster?.residents.filter(r=>r.homeBuildingId===b.id).length??0,ready=b.endsAt<=now,near=!!access&&!!state&&!state.movement&&Math.hypot(position.x-access.x,position.y-access.y)<=HABITABLE_INTERACTION_RADIUS&&habitableLineClear(position,access,state),reason=!roster?'Organiza primero los habitantes.':!ready?'Espera a que termine la vivienda.':occupied>=2?'La vivienda tiene sus dos plazas ocupadas.':!near?'Acércate a la entrada de la vivienda.':null;return{buildingId:b.id,ready,capacity:2,occupied,near,canRecruit:reason===null,reason};})};
}
export function settleHabitableResidents(world:MvpWorld,now:number,playerId?:string):void {for(const p of Object.values(world.players)){if(playerId!==undefined&&p.id!==playerId)continue;for(const r of p.habitable?.workforce?.residents??[])if(r.relocation&&r.relocation.endsAt<=now){r.position={...r.relocation.points.at(-1)!};delete r.relocation;}}}
export function dispatchHabitableResidents(world:MvpWorld,command:MvpCommand,ctx:Context):boolean {
  if(!['habitat.residents.initialize','habitat.resident.assign','habitat.resident.unassign','habitat.resident.recruit'].includes(command.type))return false;const p=actor(ctx),state=p.habitable,now=ctx.now;if(!state)throw new MvpError('Crea primero tu personaje del distrito.',409);stationary(world,p,now);
  if(command.type==='habitat.residents.initialize'){
    if(state.workforce)return true;const existing=state.buildings.filter(b=>!b.demolition&&b.endsAt<=now&&(b.templateId==='workbench'||b.templateId==='planter')).slice(0,2),residents:HabitableResident[]=[];
    state.workforce={residents,sequence:2,initializedAt:now};for(let i=0;i<2;i++){const building=existing[i],job=building?.operation?world.jobs[building.operation.jobId]:undefined,stand=building?(job?.payload.workerStand as HabitablePoint|undefined)??habitableWorkStand(world,p,building,now):null,id=building?`worker:${building.id}`:`resident:${p.id}:base:${i}`;const pos=stand??parking(world,p,now);if(!pos)throw new MvpError('Despeja un lugar seguro para organizar los habitantes.',409);residents.push({id,name:nameFor(id),homeBuildingId:null,position:{...pos},createdAt:now,...(building&&stand?{assignment:{buildingId:building.id,stand:{...stand}}}:{})});}
    state.workforce={residents,sequence:2,initializedAt:now};return true;
  }
  const roster=state.workforce;if(!roster)throw new MvpError('Organiza primero el registro de habitantes.',409);
  if(command.type==='habitat.resident.recruit'){
    const houseId=field(command,'houseId'),house=state.buildings.find(b=>b.id===houseId&&b.templateId==='house'),view=getHabitableResidentsView(world,p,now).houses.find(h=>h.buildingId===houseId);if(!house||!view)throw new MvpError('La vivienda no pertenece a tu parcela.',403);if(!view.canRecruit)throw new MvpError(view.reason??'No hay plaza disponible.',409);const pos=habitableWorkStand(world,p,house,now);if(!pos)throw new MvpError('Despeja el acceso de la vivienda para recibir un habitante.',409);guardHabitableWorkerMovement(world,p,{points:[pos,pos],startsAt:now,endsAt:now+150});roster.sequence++;const id=`resident:${p.id}:${roster.sequence}`;roster.residents.push({id,name:nameFor(id),homeBuildingId:house.id,position:pos,createdAt:now});return true;
  }
  const r=roster.residents.find(r=>r.id===field(command,'residentId'));if(!r)throw new MvpError('El habitante no pertenece a tu parcela.',403);if(habitableResidentBusy(world,p,r,now))throw new MvpError('Espera a que el habitante termine su trabajo, traslado y entrega.',409);
  if(command.type==='habitat.resident.unassign'){if(!r.assignment)return true;const target=parking(world,p,now);if(!target)throw new MvpError('No hay un lugar de descanso seguro.',409);relocation(world,p,r,target,now);delete r.assignment;return true;}
  const id=field(command,'buildingId'),building=state.buildings.find(b=>b.id===id&&['workbench','planter','woodlot','sawmill'].includes(b.templateId));if(!building)throw new MvpError('Asigna el habitante a una mesa, bancal, puesto forestal o aserradero propios.',403);if(building.endsAt>now)throw new MvpError('Espera a que termine la instalación.',409);if(isManagerOperatorBuildingReserved(p,id))throw new MvpError('Este puesto está reservado para el operador del turno; esperá su regreso antes de reasignarlo.',409);if(r.assignment?.buildingId===id)return true;if(roster.residents.some(other=>other.id!==r.id&&other.assignment?.buildingId===id))throw new MvpError('Esa instalación ya tiene un habitante asignado.',409);const stand=habitableWorkStand(world,p,building,now);if(!stand)throw new MvpError('No hay un puesto de trabajo accesible y libre.',409);relocation(world,p,r,stand,now);r.assignment={buildingId:id,stand};return true;
}
