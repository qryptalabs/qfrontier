import * as THREE from 'three';
import {habitableWorkerAt,habitableWorkerVisibleAt,type HabitableWorkerVisual,type HabitableBuilding,type HabitableState} from '../mvp/habitable-data.ts';
import {createHabitableWorkerModelLibrary,type HabitableWorkerModel} from './habitable-worker-models.ts';

/** Rendering reads one public delivery schedule; it never invents a second courier or a meal. */
export function habitableWorkerDailyAt(workers:readonly HabitableWorkerVisual[],worker:HabitableWorkerVisual,now:number){
  const daily=worker.daily;
  if(daily&&now>=daily.startsAt&&now<daily.endsAt){const leg=daily.legs.find(l=>now>=l.startsAt&&now<l.endsAt);if(leg){const serving=now>=leg.arrivesAt,progress=Math.max(0,Math.min(1,(now-leg.arrivesAt)/Math.max(1,leg.endsAt-leg.arrivesAt)));if(leg.kind==='pickup')return{action:serving?progress<.4?'pickup':'eating':'to_storage',mealVisible:serving&&progress>=.4,progress,recipient:false};if(leg.kind==='delivery')return{action:serving?'feeding':'carrying',mealVisible:serving&&progress<.4,progress,recipient:false};if(leg.kind==='maintenance')return{action:serving?'maintaining':'carrying',mealVisible:false,progress,recipient:false,maintenance:true};return{action:'returning',mealVisible:false,progress,recipient:false};}}
  for(const courier of workers){const schedule=courier.daily;if(!schedule||now<schedule.startsAt||now>=schedule.endsAt)continue;const leg=schedule.legs.find(l=>l.kind==='delivery'&&l.residentId===worker.id&&now>=l.arrivesAt&&now<l.endsAt);if(!leg)continue;const progress=(now-leg.arrivesAt)/Math.max(1,leg.endsAt-leg.arrivesAt),point=leg.points.at(-1)!;return{action:progress<.4?'receiving_food':'eating',mealVisible:progress>=.4,progress,recipient:true,from:point};}
  return null;
}

/** Tools follow an already authorized phase, never local proximity or unconfirmed resources. */
export function habitableWorkerActionAt(worker:HabitableWorkerVisual,now:number,building?:HabitableBuilding):string{
  const daily=habitableWorkerDailyAt([worker],worker,now);if(daily)return daily.action;
  const pose=habitableWorkerAt(worker,now);
  if(pose.state==='working'){
    const tool=worker.crew?.legs.find(leg=>leg.phase==='working'&&now>=leg.startsAt&&now<leg.endsAt)?.tool;if(tool)return tool==='axe'?'chopping':tool==='hoe'?'tending':tool==='survey'?'surveying':'crafting';
    if(worker.role==='builder')return'crafting';
    if(worker.role==='forester')return'chopping';
    if(worker.role==='sawyer')return'sawing';
    if(worker.role==='farmer'){const progress=Math.max(0,Math.min(1,(now-worker.startsAt)/Math.max(1,worker.workEndsAt-worker.startsAt)));return progress<.18?'sowing':progress<.66?'watering':'tending';}
    return building?.visual?.recipeId==='cloth'?'sewing':building?.visual?.recipeId==='plank'?'crafting':'packing';
  }
  if(pose.state==='loading')return'pickup';
  if(pose.state==='receiving')return'unloading';
  if(pose.state==='collecting')return worker.role==='farmer'&&now>=worker.workEndsAt?'harvesting':'pickup';
  return pose.state;
}

export function createHabitableWorkerLayer(options:{groundHeight(x:number,y:number):number}){
  const group=new THREE.Group();group.name='server-confirmed-facility-workers';const models=new Map<string,HabitableWorkerModel>();let library:ReturnType<typeof createHabitableWorkerModelLibrary>|null=null,disposed=false;
  function update(state:HabitableState,now:number,reducedMotion=false){
    if(disposed)return;const buildings=new Map(state.buildings.map(building=>[building.id,building])),visible=new Set<string>();
    for(const worker of state.workers??[]){
      if(!habitableWorkerVisibleAt(worker,state,now))continue;const building=buildings.get(worker.buildingId),daily=habitableWorkerDailyAt(state.workers??[],worker,now),pose=habitableWorkerAt(worker,now);visible.add(worker.id);
      let actor=models.get(worker.id);if(actor&&actor.group.userData.habitableWorkerRole!==worker.role){actor.dispose();models.delete(worker.id);actor=undefined;}
      if(!actor){library??=createHabitableWorkerModelLibrary();let seed=0;for(const char of worker.id)seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0;actor=library.get(worker.role==='farmer'?'farmer':worker.role==='forester'?'forester':worker.role==='sawyer'?'sawyer':'builder',seed%12);actor.group.name=`habitable-worker-${worker.id}`;actor.group.userData.habitableWorkerId=worker.id;actor.group.userData.habitableWorkerRole=worker.role;models.set(worker.id,actor);group.add(actor.group);}
      const carrying=!daily?.recipient&&pose.carrying&&pose.cargoUnits>0,action=daily?.action??habitableWorkerActionAt(worker,now,building);actor.group.position.set(pose.x,options.groundHeight(pose.x,pose.y)+.035,pose.y);actor.group.rotation.y=daily?.recipient&&daily.from?Math.atan2(daily.from.x-pose.x,daily.from.y-pose.y):pose.yaw;actor.animate({action,walking:!daily?.recipient&&pose.walking,carrying,cargoKind:daily?.maintenance?'timber':daily?'food':pose.state==='supplying'||pose.state==='receiving'?'crate':worker.role==='farmer'?'sack':worker.role==='forester'?'timber':worker.role==='sawyer'?'plank':'crate',mealVisible:daily?.mealVisible,mealProgress:daily?.progress},now/1000,reducedMotion);actor.group.userData.habitableWorkerState=daily?.action??pose.state;actor.group.userData.habitableWorkerCargoUnits=carrying?pose.cargoUnits:0;actor.group.userData.habitableWorkerBlockedReason=worker.blockedReason;actor.group.userData.habitableFedUntil=worker.fedUntil??null;
    }
    for(const[id,model]of models)if(!visible.has(id)){model.dispose();models.delete(id);}group.userData.workerCount=models.size;
  }
  return{group,update,dispose(){if(disposed)return;disposed=true;models.forEach(model=>model.dispose());models.clear();library?.dispose();library=null;group.clear();group.removeFromParent();}};
}
