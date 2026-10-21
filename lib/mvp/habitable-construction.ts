import {HABITABLE_BUILDING_TEMPLATES,HABITABLE_OBSTACLES,habitableConstructionPoint,habitablePath,habitablePositionAt,habitableWalkableAt} from './habitable-data.ts';
import type {HabitableBuilding,HabitableConstruction,HabitablePoint,HabitableState} from './habitable-data.ts';
import {getHabitableWorkers,guardHabitableWorkerMovement,habitableWorkerObstacles} from './habitable-logistics.ts';
import {habitableResidentBusy} from './habitable-residents.ts';
import {takeHabitableSupply} from './habitable-supplies.ts';
import {getStationUpgradeWorkers} from './station-upgrades.ts';
import type {LandCrewLeg,LandCrewSchedule} from './land-grid.ts';
import {MvpError} from './helpers.ts';
import type {MvpWorld,Player} from './types.ts';

const distance=(points:HabitablePoint[])=>points.slice(1).reduce((n,b,i)=>n+Math.hypot(b.x-points[i].x,b.y-points[i].y),0);
/** Planning runs only for an explicit signed order, never for polling views. */
export function planHabitableConstruction(world:MvpWorld,p:Player,b:HabitableBuilding,shed:HabitableBuilding,now:number,residentId?:unknown,approvalId?:string):{construction:HabitableConstruction;stand:HabitablePoint;startsAt:number;endsAt:number}|null {
  const state=p.habitable!,roster=state.workforce,resident=roster?.residents.find(r=>r.id===residentId)??roster?.residents.find(r=>!r.assignment&&!habitableResidentBusy(world,p,r,now));
  if(roster&&(!resident||resident.assignment||habitableResidentBusy(world,p,resident,now)))throw new MvpError('Dejá un habitante propio sin asignación y disponible hasta regresar de la obra.',409);
  if(!roster&&residentId!==undefined)throw new MvpError('Organizá primero el registro de habitantes o usá la cuadrilla del distrito.',409);
  if(residentId!==undefined&&(!resident||resident.id!==residentId))throw new MvpError('El constructor no pertenece a tu comunidad o no está disponible.',403);
  if(shed.demolition||shed.templateId!=='shed'||shed.endsAt>now)throw new MvpError('Elegí un cobertizo propio terminado y sin desmontaje.',409);
  const proposed:HabitableState={...state,buildings:[...state.buildings,b]},plannedPlayer={...p,habitable:proposed},workers=[...getHabitableWorkers(world,p,now),...getStationUpgradeWorkers(world,p)],stand=habitableConstructionPoint({...proposed,workers:workers.filter(w=>w.id!==resident?.id)},b,now);if(!stand)return null;
  const workerId=resident?.id??`builder:${b.id}`,avatar=habitablePositionAt(state,now),extra=habitableWorkerObstacles(world,p,now,undefined,true,resident?.id);extra.push({id:'avatar',...avatar,width:.85,depth:.85});
  const warehouse=HABITABLE_OBSTACLES.find(o=>o.id==='warehouse')!,origins:HabitablePoint[]=resident?[{...resident.position}]:[0,-.9,.9].flatMap(t=>[{x:warehouse.x+warehouse.width/2+.65,y:warehouse.y+t},{x:warehouse.x-warehouse.width/2-.65,y:warehouse.y+t},{x:warehouse.x+t,y:warehouse.y+warehouse.depth/2+.65},{x:warehouse.x+t,y:warehouse.y-warehouse.depth/2-.65}]);
  const sourceAccess=habitablePathAccess(proposed,shed);if(!sourceAccess)return null;
  for(const origin of origins){if(!habitableWalkableAt(origin,proposed,.32,extra))continue;const legs:LandCrewLeg[]=[],template=HABITABLE_BUILDING_TEMPLATES.find(t=>t.id===b.templateId)!,quantity=template.costs.reduce((n,i)=>n+i.qty,0);let at=now,current={...origin},failed=false;
    const walk=(target:HabitablePoint,phase:'outbound'|'between'|'returning',cargoUnits=0)=>{const points=habitablePath(proposed,current,target,extra);if(!points){failed=true;return;}const end=at+Math.max(150,Math.ceil(distance(points)/1.6*1000));try{guardHabitableWorkerMovement(world,plannedPlayer,{points,startsAt:at,endsAt:end},workerId);}catch{failed=true;return;}legs.push({phase,points,startsAt:at,endsAt:end,cargoUnits});current={...target};at=end;};
    const hold=(phase:'loading'|'unloading'|'working',milliseconds:number,cargoUnits=0,yaw=0)=>{if(failed)return;const end=at+milliseconds;try{guardHabitableWorkerMovement(world,plannedPlayer,{points:[current,current],startsAt:at,endsAt:end},workerId);}catch{failed=true;return;}legs.push({phase,points:[{...current},{...current}],startsAt:at,endsAt:end,cargoUnits,yaw,...(phase==='working'?{tool:'hammer' as const}:{})});at=end;};
    walk(sourceAccess,'outbound');hold('loading',2500,0,Math.atan2(shed.x-current.x,shed.y-current.y));if(failed)continue;
    walk(stand,'between',quantity);hold('unloading',2000,quantity,Math.atan2(b.x-current.x,b.y-current.y));if(failed)continue;const startsAt=at;hold('working',template.seconds*1000,0,Math.atan2(b.x-current.x,b.y-current.y));const endsAt=at;walk(origin,'returning');if(failed)continue;
    const crew:LandCrewSchedule={kind:'construction',legs,startsAt:now,endsAt:at};
    // Existing and already-confirmed future avatar movement retains priority.
    for(const leg of legs)for(let time=leg.startsAt;time<=leg.endsAt+100;time+=100){const t=Math.min(time,leg.endsAt),npc=constructionPosition(leg,t),pos=habitablePositionAt(state,t);if(Math.hypot(npc.x-pos.x,npc.y-pos.y)<.75){failed=true;break;}}
    if(failed)continue;const cargo=takeHabitableSupply(p,shed,template.costs,startsAt,0,approvalId);for(const lot of cargo)lot.location=`construction:${b.id}`;
    return{construction:{sourceBuildingId:shed.id,workerId,...(resident?{residentId:resident.id}:{}),cargo,crew},stand,startsAt,endsAt};
  }
  return null;
}
import {habitableBuildingEntrance} from './habitable-data.ts';
const habitablePathAccess=(state:HabitableState,b:HabitableBuilding)=>habitableBuildingEntrance(state,b);
function constructionPosition(leg:LandCrewLeg,now:number):HabitablePoint {const length=distance(leg.points),wanted=length*Math.max(0,Math.min(1,(now-leg.startsAt)/Math.max(1,leg.endsAt-leg.startsAt)));let used=0;for(let i=1;i<leg.points.length;i++){const a=leg.points[i-1],b=leg.points[i],d=Math.hypot(b.x-a.x,b.y-a.y);if(used+d>=wanted||i===leg.points.length-1){const t=d?(wanted-used)/d:0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}used+=d;}return leg.points.at(-1)!;}
/** Held stock is consumed exactly at the real work start; a later read only catches up once. */
export function settleHabitableConstruction(world:MvpWorld,now:number,scope?:{playerId:string;buildingIds?:ReadonlySet<string>}):void {for(const p of Object.values(world.players)){if(scope&&p.id!==scope.playerId)continue;for(const b of p.habitable?.buildings??[]){if(scope?.buildingIds&&!scope.buildingIds.has(b.id))continue;const c=b.construction;if(!c)continue;if(c.unloadedAt===undefined&&b.startsAt<=now){b.constructionCosts=structuredClone(c.cargo);c.cargo=[];c.unloadedAt=b.startsAt;}if(c.completedAt===undefined&&c.crew.endsAt<=now)c.completedAt=c.crew.endsAt;}}}
