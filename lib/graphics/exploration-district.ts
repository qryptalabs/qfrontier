import {explorationPositionAt,explorationTransportAt,explorationHeadingAt,explorationNeighborObstacles,type ExplorationPoint} from '../mvp/exploration-data.ts';
import {habitablePositionAt,houseClearsProceduralTree} from '../mvp/habitable-data.ts';
import {physicalDeckHeightAt,type PhysicalWorldContext} from './world-collision.ts';
import {createTradeSceneryClearance} from './world-scenery-clearance.ts';
import {publicInfrastructureAt} from '../mvp/exploration-network-data.ts';
import {explorationBoatPoseAt} from '../mvp/exploration-vessel.ts';
import type {SceneInput} from './scene-data.ts';
import type {PhysicalCapsule} from './kinematic-physics.ts';

/** Match rendered bridge decks while retaining dynamic player terrain and foundations. */
export function explorationRenderGround(point:ExplorationPoint,renderHeight:number):number {
  const infrastructure=publicInfrastructureAt(point);if(infrastructure?.kind==='ramp')return infrastructure.height;
  const deck=physicalDeckHeightAt(point);
  return deck===null?renderHeight:Math.max(renderHeight,deck);
}

/** Cameras and scene layers share this origin; authoritative positions stay global. */
export function districtFloatingOrigin(point:ExplorationPoint,origin:ExplorationPoint):ExplorationPoint {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||Math.abs(point.x-origin.x)<=96&&Math.abs(point.y-origin.y)<=96)return origin;
  return{x:Math.floor(point.x/64)*64,y:Math.floor(point.y/64)*64};
}

/** The same flora exclusions feed rendering, camera clearance and movement checks. */
export function createExplorationWorldContext(input:SceneInput,ownState=input.player?.habitable):PhysicalWorldContext {
  const trade=createTradeSceneryClearance(input.view.habitable?.commerce?.caravans??[]),homes=(input.view.habitable?.actors??[]).map(actor=>({playerId:actor.playerId,plot:actor.plot,state:actor.playerId===input.player?.id&&ownState?ownState:{...actor.state,exploration:undefined,version:1 as const},station:input.view.settlements.find(place=>place.playerId===actor.playerId)}));
  return{plots:input.view.settlements.map(place=>place.plot),clearAt:(x,y,padding)=>trade(x,y,padding)||homes.some(home=>houseClearsProceduralTree(home.state,x-home.plot.x,y-home.plot.y)),obstacles:homes.filter(home=>home.playerId!==input.player?.id).flatMap(explorationNeighborObstacles),ignoreActorId:input.player?.id};
}

/** Public, confirmed bodies only. A mounted passenger reserves the footprint of their vehicle. */
export function explorationPlayerBodies(input:SceneInput,now:number):readonly PhysicalCapsule[]{
  return(input.view.habitable?.actors??[]).flatMap(actor=>{
    const state={...actor.state,exploration:undefined,version:1 as const},local=habitablePositionAt(state,now),outside=actor.state.exploration,point=outside?explorationPositionAt(outside,now):{x:actor.plot.x+local.x,y:actor.plot.y+local.y},nextLocal=habitablePositionAt(state,now+50),next=outside?explorationPositionAt(outside,now+50):{x:actor.plot.x+nextLocal.x,y:actor.plot.y+nextLocal.y},mode=outside?explorationTransportAt(outside,now):'walk',vessel=outside?explorationBoatPoseAt(outside,now):null,yaw=vessel?.heading??(outside?explorationHeadingAt(outside,now):Math.atan2(next.x-point.x,next.y-point.y)),body:PhysicalCapsule={id:actor.playerId,...(vessel?.vehicle??point),height:mode==='walk'?1.6:3,radius:mode==='boat'?1.1:mode==='carriage'?1.15:.3,yaw,...(mode==='boat'?{length:2.8}:mode==='carriage'?{length:5.2,offset:1.55}:{})};
    return[body,...(vessel?.boarding?[{id:`${actor.playerId}:boarding`,...vessel.passenger,radius:.3,height:1.6}]:[])];
  });
}
