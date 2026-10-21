import {HABITABLE_OBSTACLES,HABITABLE_TREE_OBSTACLES,HABITABLE_SPAWN,habitablePath,habitableWalkableAt,habitablePositionAt,houseClearsProceduralTree} from './habitable-data.ts';
import type {HabitablePoint,HabitableState} from './habitable-data.ts';
import {habitableWorkerObstacles,guardHabitableWorkerMovement} from './habitable-logistics.ts';
import {landCellAt,landCellFromId,landCellInSquare} from './land-grid.ts';
import type {LandCrewSchedule,LandCrewLeg,LandOperation} from './land-grid.ts';
import type {MvpWorld,Player} from './types.ts';

export const LAND_CREW_SPEED=1.6;
const length=(points:HabitablePoint[])=>points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
interface WorkTarget {cellId?:string;point:HabitablePoint;stand?:HabitablePoint;tool?:'axe'|'hoe'|'hammer'|'survey'}
/** A bounded temporary hired crew. Every walk and stationary task is reserved
 * against the same authoritative people and routes as resident logistics. */
export function planLandCrew(world:MvpWorld,p:Player,kind:LandOperation,cellIds:string[],workSeconds:number,now:number,options:{workerStand?:HabitablePoint;target?:HabitablePoint}={}):LandCrewSchedule|null {
  const state=p.habitable;if(!state)return null;const virtual:HabitableState=structuredClone(state),legs:LandCrewLeg[]=[],warehouse=HABITABLE_OBSTACLES.find(o=>o.id==='warehouse')!,home=HABITABLE_OBSTACLES.find(o=>o.id==='home')!,avatar=habitablePositionAt(state,now),initial=habitableWorkerObstacles(world,p,now);
  initial.push({id:'avatar',...avatar,width:.85,depth:.85});
  const origins:HabitablePoint[]=[];for(const o of kind==='center'?[warehouse]:[warehouse,home])for(const t of[0,-.9,.9])origins.push({x:o.x+o.width/2+.65,y:o.y+t},{x:o.x-o.width/2-.65,y:o.y+t},{x:o.x+t,y:o.y+o.depth/2+.65},{x:o.x+t,y:o.y-o.depth/2-.65});
  const firstTarget=cellIds.length?landCellFromId(cellIds[0])!:options.target??options.workerStand??home;
  origins.sort((a,b)=>Math.hypot(a.x-firstTarget.x,a.y-firstTarget.y)-Math.hypot(b.x-firstTarget.x,b.y-firstTarget.y));
  const origin=origins.find(point=>habitableWalkableAt(point,virtual,.32,initial)&&habitablePath(virtual,HABITABLE_SPAWN,point,initial.filter(o=>o.id!=='avatar')));if(!origin)return null;
  let current={...origin},clock=now;
  const targets:WorkTarget[]=cellIds.map(id=>{const c=landCellFromId(id)!;const tree=kind==='clear'?HABITABLE_TREE_OBSTACLES.find(t=>t.width===.55&&landCellAt(t.x,t.y)?.id===id&&!houseClearsProceduralTree(virtual,t.x,t.y)):undefined;return{cellId:id,point:tree?{x:tree.x,y:tree.y}:{x:c.x,y:c.y},tool:kind==='clear'?tree?'axe' as const:'hoe' as const:kind==='explore'?'survey' as const:'hammer' as const};});
  if(!targets.length)targets.push({point:options.target??options.workerStand??{x:home.x,y:home.y},stand:options.workerStand});
  const workMs=Math.max(1000,Math.ceil(workSeconds*1000/targets.length));
  while(targets.length){
    const extra=habitableWorkerObstacles(world,p,clock);extra.push({id:'avatar',...avatar,width:.85,depth:.85});
    let best:{target:WorkTarget;stand:HabitablePoint;points:HabitablePoint[];distance:number}|undefined;
    for(const target of targets){const candidates:HabitablePoint[]=target.stand?[target.stand]:[target.point];if(!target.stand)for(const radius of[kind==='clear'?.85:1.1,1.5,2.1,2.65])for(let a=0;a<16;a++)candidates.push({x:target.point.x+Math.sin(a*Math.PI/8)*radius,y:target.point.y+Math.cos(a*Math.PI/8)*radius});
      for(const stand of candidates){if(Math.hypot(stand.x-avatar.x,stand.y-avatar.y)<.8||!habitableWalkableAt(stand,virtual,.32,extra))continue;const points=habitablePath(virtual,current,stand,extra);if(!points)continue;const distance=length(points),arrives=clock+Math.max(150,Math.ceil(distance/LAND_CREW_SPEED*1000));
        try{guardHabitableWorkerMovement(world,p,{points,startsAt:clock,endsAt:arrives});guardHabitableWorkerMovement(world,p,{points:[stand,stand],startsAt:arrives,endsAt:arrives+workMs});}catch{continue;}
        if(!best||distance<best.distance)best={target,stand,points,distance};break;
      }
    }
    if(!best)return null;const arrivesAt=clock+Math.max(150,Math.ceil(best.distance/LAND_CREW_SPEED*1000));legs.push({phase:legs.length?'between':'outbound',points:best.points,startsAt:clock,endsAt:arrivesAt});legs.push({phase:'working',points:[{...best.stand},{...best.stand}],startsAt:arrivesAt,endsAt:arrivesAt+workMs,...(best.target.cellId?{cellId:best.target.cellId}:{}),yaw:Math.atan2(best.target.point.x-best.stand.x,best.target.point.y-best.stand.y),tool:best.target.tool??'hammer'});clock=arrivesAt+workMs;current={...best.stand};targets.splice(targets.indexOf(best.target),1);
    if(best.target.cellId&&virtual.land){const record=virtual.land.cells[best.target.cellId]??={},cell=landCellFromId(best.target.cellId)!;if(kind==='clear'){record.clearedAt=clock;if(landCellInSquare(cell,21))record.claimedAt??=clock;}if(kind==='claim')record.claimedAt=clock;if(kind==='road')(virtual.land.roads??={})[cell.id]={completedAt:clock};}
  }
  const extra=habitableWorkerObstacles(world,p,clock);extra.push({id:'avatar',...avatar,width:.85,depth:.85});const points=habitablePath(virtual,current,origin,extra);if(!points)return null;const endsAt=clock+Math.max(150,Math.ceil(length(points)/LAND_CREW_SPEED*1000));try{guardHabitableWorkerMovement(world,p,{points,startsAt:clock,endsAt});}catch{return null;}legs.push({phase:'returning',points,startsAt:clock,endsAt});return{kind,legs,startsAt:now,endsAt};
}
