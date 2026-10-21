import {HABITABLE_POINTS,habitableWorkerAt,habitableWorkerVisibleAt,type HabitableState} from '../mvp/habitable-data.ts';
import type {FishingSnapshot} from '../graphics/fishing-community-data.ts';
import type {SoundEmitter,SoundKind} from './model.ts';
export function tutorialSounds(step:string|undefined,plot={x:0,y:0},ground:(x:number,y:number)=>number=()=>0):SoundEmitter[]{
  const point=HABITABLE_POINTS.find(p=>p.id===(step==='extracting'?'wood':step==='crafting'?'sawmill':null));
  return point?[{id:'tutorial:'+point.id,kind:step==='extracting'?'axe':'saw',x:plot.x+point.x+.7,y:ground(point.x,point.y)+.7,z:plot.y+point.y,radius:20,volume:.55}]:[];
}

/** Reads the same public worker schedule as the visible animation. No settlement. */
export function villageSounds(state:Pick<HabitableState,'workers'|'buildings'>,now:number,plot={x:0,y:0},ground:(x:number,y:number)=>number=()=>0):SoundEmitter[]{
  const result:SoundEmitter[]=[];
  const add=(id:string,kind:SoundKind,x:number,z:number,volume=.6)=>result.push({id,kind,x:plot.x+x,y:ground(x,z)+.7,z:plot.y+z,volume,radius:kind==='saw'?26:18});
  for(const worker of state.workers??[]){
    if(!habitableWorkerVisibleAt(worker,state,now))continue;
    const pose=habitableWorkerAt(worker,now),building=state.buildings.find(b=>b.id===worker.buildingId);
    if(pose.state==='working'&&building&&now>=building.endsAt){
      const op=building.visual?.operation;
      if(building.visual?.state==='working'&&now>=(building.visual.startsAt??Infinity)&&now<(building.visual.endsAt??-Infinity))add(worker.id,op==='saw'?'saw':op==='extract'?'axe':op==='grow'?'harvest':'hammer',pose.x,pose.y,op==='grow'?.35:.6);
    }else if(['loading','unloading','collecting','receiving'].includes(pose.state))add(worker.id,'crate',pose.x,pose.y,.45);
    else if(pose.walking)add(worker.id,'worker-step',pose.x,pose.y,.25);
  }
  for(const building of state.buildings){
    const work=building.upgrade&&now>=building.upgrade.startsAt&&now<building.upgrade.endsAt||now>=building.startsAt&&now<building.endsAt;
    if(work)add('construction:'+building.id,'hammer',building.constructionStand?.x??building.x,building.constructionStand?.y??building.y,.5);
  }
  return result;
}
export function fishingSounds(snapshot:Pick<FishingSnapshot,'boats'|'workers'>&{carts:readonly Omit<FishingSnapshot['carts'][number],'animal'>[]},ground:(x:number,y:number)=>number=()=>0):SoundEmitter[]{
  const sources:SoundEmitter[]=[];
  for(const cart of snapshot.carts){if(cart.speed>.01&&['outbound','inbound','approaching'].includes(cart.state)){sources.push({id:cart.id+':animal',kind:'hooves',x:cart.x,y:ground(cart.x,cart.y)+.7,z:cart.y,radius:28,volume:.65},{id:cart.id+':wheels',kind:'creak',x:cart.x,y:ground(cart.x,cart.y)+.8,z:cart.y,radius:20,volume:.4});}else if(['loading','unloading'].includes(cart.state))sources.push({id:cart.id,kind:'crate',x:cart.x,y:ground(cart.x,cart.y)+.7,z:cart.y,radius:18});}
  for(const boat of snapshot.boats){if(boat.speed>.01||boat.state==='fishing')sources.push({id:boat.id,kind:'splash',x:boat.x,y:boat.waterLevel+.5,z:boat.y,radius:32,volume:.4});if(boat.state==='unloading')sources.push({id:boat.id+':load',kind:'crate',x:boat.x,y:boat.waterLevel+1,z:boat.y,radius:20});}
  for(const worker of snapshot.workers){if(worker.state==='unloading'||worker.state==='lifting')sources.push({id:worker.id,kind:'crate',x:worker.x,y:ground(worker.x,worker.y)+.7,z:worker.y,radius:12,volume:.3});else if(worker.speed>.01&&['walking','carrying'].includes(worker.state))sources.push({id:worker.id,kind:'dock-step',x:worker.x,y:ground(worker.x,worker.y)+.7,z:worker.y,radius:12,volume:.25});}
  return sources;
}
