import {nextWorldId} from './operation-ids.ts';
import { HABITABLE_OBSTACLES, HABITABLE_POINTS, HABITABLE_SPAWN, habitableLineClear, habitablePath, habitablePositionAt, habitableWalkableAt, habitableWorkerAt } from './habitable-data.ts';
import type { HabitablePoint, HabitableState, HabitableWorkerVisual } from './habitable-data.ts';
import { SETTLEMENT_ANCHORS } from '../graphics/settlement-layout.ts';
import { actor, emit, field, MvpError, spendMany } from './helpers.ts';
import type { BuildingType, Context, MvpCommand, MvpWorld, Player } from './types.ts';
import { weatherFor } from './world.ts';

export interface StationUpgradeVisual {id:string;building:BuildingType;startsAt:number;endsAt:number;stand:HabitablePoint;yaw:number}
export const STATION_UPGRADE_SECONDS_PER_LEVEL=60;
const kinds:readonly BuildingType[]=['workshop','garden','kitchen','laboratory','barracks','warehouse','logistics'];
const labels:Record<BuildingType,string>={workshop:'taller',garden:'huerto',kitchen:'cocina',laboratory:'laboratorio',barracks:'cuartel',warehouse:'almacén',logistics:'puesto logístico'};
const active=(status:string)=>status==='running'||status==='reserved';

export function getStationUpgradeVisuals(world:MvpWorld,p:Player):StationUpgradeVisual[]{
  return Object.values(world.jobs).filter(j=>j.playerId===p.id&&j.kind==='upgrade'&&active(j.status)).flatMap(j=>{
    const building=j.payload.building as BuildingType,stand=j.payload.constructionStand as HabitablePoint|undefined;
    if(!kinds.includes(building)||!stand)return[];const anchor=SETTLEMENT_ANCHORS[building],target=building==='garden'?{x:anchor[0]-2.6,y:anchor[2]+.7}:{x:anchor[0],y:anchor[2]};
    return[{id:j.id,building,startsAt:j.startsAt,endsAt:j.endsAt,stand:{...stand},yaw:Math.atan2(target.x-stand.x,target.y-stand.y)}];
  });
}

/** Obstacle metadata only. Upgrade crews are drawn by the upgrade layer, including without an avatar. */
export function getStationUpgradeWorkers(world:MvpWorld,p:Player):HabitableWorkerVisual[]{
  return getStationUpgradeVisuals(world,p).map(v=>({id:`upgrade-builder:${v.id}`,buildingId:`station:${v.building}`,role:'builder' as const,stand:v.stand,yaw:v.yaw,startsAt:v.startsAt,workEndsAt:v.endsAt,pendingUnits:0,blockedReason:null}));
}

function constructionStand(world:MvpWorld,p:Player,building:BuildingType,now:number,workers:HabitableWorkerVisual[]):HabitablePoint|null{
  const state:HabitableState=p.habitable??{version:1,appearance:'pine',profession:'carpenter',position:{...HABITABLE_SPAWN},buildings:[]};
  const anchor=SETTLEMENT_ANCHORS[building],footprint=HABITABLE_OBSTACLES.find(o=>o.id===(building==='garden'?'garden-shed':building))??{x:anchor[0],y:anchor[2],width:3,depth:3};
  const people=[...workers,...getStationUpgradeWorkers(world,p)].filter(w=>w.role!=='builder'||(w.crew?.endsAt??w.workEndsAt)>now);
  const extra=[...HABITABLE_POINTS.map(point=>({id:point.id,x:point.x+.7,y:point.y,width:.65,depth:.65})),...people.map(w=>({id:w.id,...habitableWorkerAt(w,now),width:.85,depth:.85}))];
  const avatar=habitablePositionAt(state,now),candidates:HabitablePoint[]=[];
  for(const offset of[0,-.7,.7,-1.1,1.1])candidates.push({x:footprint.x+offset,y:footprint.y+footprint.depth/2+.7},{x:footprint.x+offset,y:footprint.y-footprint.depth/2-.7},{x:footprint.x+footprint.width/2+.7,y:footprint.y+offset},{x:footprint.x-footprint.width/2-.7,y:footprint.y+offset});
  for(const point of candidates){
    if(Math.hypot(point.x-avatar.x,point.y-avatar.y)<.85||!habitableWalkableAt(point,state,.32,extra)||!habitablePath(state,HABITABLE_SPAWN,point,extra))continue;
    const occupiedRoute=people.some(worker=>[worker.shipment,worker.supply,worker.relocation,...(worker.daily?.legs??[]),...(worker.crew?.legs??[])].some(route=>route&&('endsAt' in route?route.endsAt:route.unloadsAt)>now&&route.points.some((b,i,points)=>{if(!i)return Math.hypot(point.x-b.x,point.y-b.y)<.85;const a=points[i-1],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t)<.85;})));
    if(occupiedRoute)continue;
    if(state.movement&&state.movement.endsAt>now&&state.movement.points.some((b,i,points)=>i>0&&!habitableLineClear(points[i-1],b,state,[{id:'new-crew',...point,width:.85,depth:.85}])))continue;
    return point;
  }return null;
}

export function dispatchStationUpgrade(world:MvpWorld,command:MvpCommand,ctx:Context,workers:HabitableWorkerVisual[]=[]):boolean{
  if(command.type!=='building.upgrade')return false;const p=actor(ctx),building=field(command,'building') as BuildingType;
  if(!kinds.includes(building))throw new MvpError('Edificio desconocido.');const level=p.buildings[building];
  if(level>=3)throw new MvpError('Nivel máximo del piloto: tres.',409);
  if(Object.values(world.jobs).some(j=>j.playerId===p.id&&j.kind==='upgrade'&&j.payload.building===building&&active(j.status)))throw new MvpError('Este edificio ya tiene una mejora en construcción.',409);
  const stand=constructionStand(world,p,building,ctx.now,workers);if(!stand)throw new MvpError('Deja un acceso seguro para la cuadrilla antes de mejorar este edificio.',409);
  const costs=spendMany(p,[{itemId:'plank',qty:level*2},{itemId:'iron_ingot',qty:level},{itemId:'stone',qty:level*2}],ctx.now);
  const home=world.tiles[p.settlement?.homeTileId??p.position];const id=nextWorldId(world,'job');
  world.jobs[id]={id,playerId:p.id,kind:'upgrade',status:'running',createdAt:ctx.now,startsAt:ctx.now,endsAt:ctx.now+STATION_UPGRADE_SECONDS_PER_LEVEL*level*1000,ruleVersion:world.rulesVersion,weather:weatherFor(home.regionId,ctx.now),route:[home.id],costs,payload:{building,fromLevel:level,toLevel:level+1,constructionStand:stand},report:[]};
  return true;
}

export function settleStationUpgrades(world:MvpWorld,now:number,playerId?:string):void{
  for(const job of Object.values(world.jobs)){
    if(job.kind!=='upgrade'||!active(job.status)||job.endsAt>now||playerId!==undefined&&job.playerId!==playerId)continue;const p=world.players[job.playerId],building=job.payload.building as BuildingType;
    if(!p||!kinds.includes(building))throw new MvpError('No se pudo comprobar la obra de mejora.',500);
    p.buildings[building]=Math.max(p.buildings[building],Number(job.payload.toLevel));job.status='completed';job.report=[`Terminó la mejora del ${labels[building]} a nivel ${p.buildings[building]}; sus cuotas y reservas se conservan.`];emit(world,p,job.endsAt,job.report[0]);
  }
}
