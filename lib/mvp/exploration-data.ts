import {sampleWorld,WORLD_SETTLEMENTS,type WorldBiome} from '../graphics/world-geography.ts';
import {geographicWorldBounds} from '../graphics/world-navigation.ts';
import {continuousTerrainHeight,waterfallPool} from '../graphics/world-terrain-height.ts';
import {HABITABLE_POINTS,HABITABLE_OBSTACLES,HABITABLE_TREE_OBSTACLES,habitableGroundHeight,habitableTerrainWalkableAt,habitableWorkerAt,habitableWorkerVisibleAt,houseClearsProceduralTree,habitableBuildingDimensions,type HabitableState} from './habitable-data.ts';
import {islandContains} from '../graphics/settlement-layout.ts';
import {landCellPrepared} from '../graphics/land-terrain.ts';
import {landBridgeAt} from '../graphics/land-infrastructure.ts';
import {LIVING_ZONE} from '../graphics/living-zone-data.ts';
import {FISHING_NETWORK_PLACES} from '../graphics/fishing-network-data.ts';
import {physicalObstaclesNear,physicalTerrainSample,physicalLineClear,type PhysicalCapsule,type PhysicalWorldContext} from '../graphics/world-collision.ts';
import {sweptObstacleHit,obstacleAllowsEgress,capsuleAxis,segmentDistance,type PhysicalObstacle} from '../graphics/kinematic-physics.ts';
import {publicStationObstacles,type PublicStationLayoutInput} from '../graphics/public-station-layout.ts';
import {explorationBoatLegPositionAt,explorationBoatPoseAt} from './exploration-vessel.ts';
import {explorationTimedPosition,explorationTimedHeading} from './exploration-timing.ts';
export {explorationHoldAt} from './exploration-timing.ts';

export interface ExplorationPoint{x:number;y:number}
export type ExplorationTransport='walk'|'carriage'|'boat';
export interface ExplorationMovementLeg{mode:ExplorationTransport;fromIndex:number;toIndex:number;startsAt:number;endsAt:number;routeId?:string;fromPortId?:string;toPortId?:string}
export interface ExplorationTrafficHold{pointIndex:number;startsAt:number;endsAt:number;resourceId:string}
export interface ExplorationMovement{points:ExplorationPoint[];startsAt:number;endsAt:number;legs?:ExplorationMovementLeg[];manualSessionId?:string;holds?:ExplorationTrafficHold[]}
/** Optional and additive: existing local positions, buildings and economic tiles are retained. */
export interface ExplorationState{version:1;position:ExplorationPoint;homePosition:ExplorationPoint;departedAt:number;movement?:ExplorationMovement;destinationId?:string;returning?:boolean}
export type PublicExplorationState=Pick<ExplorationState,'version'|'position'|'departedAt'|'movement'|'destinationId'|'returning'>;
export interface ExplorationDestinationView{id:string;name:string;kind:'city'|'village';biome:WorldBiome;position:ExplorationPoint;distance:number;reachable:boolean;blockedReason:string|null;seconds:number|null}
export interface ExplorationView{status:'home'|'exploring'|'walking'|'traveling'|'returning';isOutside:boolean;position:ExplorationPoint;home:ExplorationPoint;movement:ExplorationMovement|null;destinationId:string|null;remainingSeconds:number;destinations:ExplorationDestinationView[];canLeave:boolean;canStop:boolean;canReturn:boolean;blockedReason:string|null;speed:number;maxWalkDistance:number}
export type ExplorationObstacle=PhysicalObstacle;
export interface ExplorationNeighborContext{plot:ExplorationPoint&{width?:number;depth?:number};state:HabitableState;station?:PublicStationLayoutInput}
export interface ExplorationHomeContext extends ExplorationNeighborContext{neighbors?:readonly ExplorationNeighborContext[]}
export const EXPLORATION_SPEED=3.5,EXPLORATION_MAX_WALK_DISTANCE=8,EXPLORATION_MAX_ROUTE_DISTANCE=1800,EXPLORATION_MAX_ROUTE_POINTS=256,EXPLORATION_MAX_SEARCH_NODES=18000;
export const EXPLORATION_REGIONAL_DESTINATIONS:readonly string[]=Object.freeze([LIVING_ZONE.city.id,LIVING_ZONE.village.id]);
/** This is the existing visible catalogue, not generated private profiles or economic cities. */
export const EXPLORATION_DESTINATIONS:readonly Omit<ExplorationDestinationView,'distance'|'reachable'|'blockedReason'|'seconds'>[]=Object.freeze([...new Map([...WORLD_SETTLEMENTS,...FISHING_NETWORK_PLACES].map(place=>[place.id,place])).values()].map(place=>Object.freeze({id:place.id,name:place.name,kind:place.kind,biome:place.biome,position:Object.freeze({x:place.x,y:place.y})})));
export function explorationPositionAt(state:Pick<ExplorationState,'position'|'movement'>,now:number):ExplorationPoint{
  const move=state.movement;if(!move)return{...state.position};const leg=explorationLegAt(state,now);if(leg?.mode==='boat')return explorationBoatLegPositionAt(move,leg,now);if(move.holds?.length)return explorationTimedPosition(move,now);const points=leg?move.points.slice(leg.fromIndex,leg.toIndex+1):move.points,start=leg?.startsAt??move.startsAt,end=leg?.endsAt??move.endsAt;
  const lengths=points.slice(1).map((point,i)=>Math.hypot(point.x-points[i].x,point.y-points[i].y)),total=lengths.reduce((sum,n)=>sum+n,0),distance=total*Math.max(0,Math.min(1,(now-start)/Math.max(1,end-start)));let traversed=0;
  for(let i=0;i<lengths.length;i++){if(traversed+lengths[i]>=distance||i===lengths.length-1){const a=points[i],b=points[i+1],t=lengths[i]?(distance-traversed)/lengths[i]:0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}traversed+=lengths[i];}return points[0]?{...points[0]}:{...state.position};
}
export function explorationLegAt(state:Pick<ExplorationState,'position'|'movement'>|ExplorationMovement,now:number):ExplorationMovementLeg|undefined{const move='points'in state?state:state.movement;return move?.legs?.find(leg=>now<leg.endsAt)??move?.legs?.at(-1);}
export function explorationTransportAt(state:Pick<ExplorationState,'position'|'movement'>|ExplorationMovement,now:number):ExplorationTransport{const move='points'in state?state:state.movement;return move&&now<move.endsAt?explorationLegAt(state,now)?.mode??'walk':'walk';}
export function explorationHeadingAt(state:Pick<ExplorationState,'position'|'movement'>|ExplorationMovement,now:number,fallback=0):number{const move='points'in state?state:state.movement;if(move&&explorationTransportAt(move,now)==='boat'){const boat=explorationBoatPoseAt({position:move.points[0],movement:move},now);if(boat)return boat.heading;}return explorationTimedHeading(move,now,fallback);}
export function explorationRouteLength(points:readonly ExplorationPoint[]):number{return points.slice(1).reduce((sum,point,i)=>sum+Math.hypot(point.x-points[i].x,point.y-points[i].y),0);}
export function explorationInWorld(point:ExplorationPoint):boolean{return Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=geographicWorldBounds.minX&&point.x<=geographicWorldBounds.maxX&&point.y>=geographicWorldBounds.minY&&point.y<=geographicWorldBounds.maxY;}

export function explorationStaticObstaclesNear(point:ExplorationPoint,radius=9):readonly ExplorationObstacle[]{return physicalObstaclesNear(point,radius);}
export function explorationStaticHeightAt(point:ExplorationPoint):number{return physicalTerrainSample(point).height;}
export function explorationStaticWalkableAt(point:ExplorationPoint,padding=.3):boolean{
  if(!explorationInWorld(point))return false;
  for(const[dx,dy]of[[0,0],[padding,0],[-padding,0],[0,padding],[0,-padding]])if(!physicalTerrainSample({x:point.x+dx,y:point.y+dy}).walkable)return false;
  return!explorationStaticObstaclesNear(point,padding).some(b=>sweptObstacleHit(point,point,b,padding));
}
export function explorationStaticLineClear(from:ExplorationPoint,to:ExplorationPoint):boolean{
  return physicalLineClear(from,to);
}
/** Null means ordinary world terrain: no ownership boundary is invented here. */
export function explorationHomeSample(point:ExplorationPoint,home:ExplorationHomeContext):{walkable:boolean;height:number}|null{
  const local={x:point.x-home.plot.x,y:point.y-home.plot.y};if(Math.abs(local.x)>20||Math.abs(local.y)>20)return null;
  if(!islandContains(local.x,local.y)&&!landCellPrepared(home.state,local.x,local.y)&&!landBridgeAt(home.state,local.x,local.y))return null;
  const base=sampleWorld(home.plot.x,home.plot.y).height,height=islandContains(local.x,local.y)?base+habitableGroundHeight(local.x,local.y,home.state)-2:continuousTerrainHeight(point.x,point.y,{...home.plot,land:home.state.land,landVisual:home.state.landVisual});
  return{walkable:habitableTerrainWalkableAt(local,home.state,0),height};
}
/** Terrain is sampled once; the moving capsule sweeps these exact authored solids separately. */
export function explorationHomeObstacles(home:ExplorationHomeContext):readonly PhysicalObstacle[]{const fixed=[...HABITABLE_OBSTACLES,...HABITABLE_TREE_OBSTACLES.filter(b=>!(b.width===.55&&houseClearsProceduralTree(home.state,b.x,b.y)))];return[...fixed.map(b=>({...b,id:`home-solid:${home.plot.x}:${home.plot.y}:${b.id}`,x:home.plot.x+b.x,y:home.plot.y+b.y,height:b.id.startsWith('tree-')?6:3,kind:b.id.startsWith('tree-')?'tree':'building'})),...home.state.buildings.map(b=>({id:`home-building:${home.plot.x}:${home.plot.y}:${b.id}`,x:home.plot.x+b.x,y:home.plot.y+b.y,...habitableBuildingDimensions(b),height:3,kind:'building'}))];}
/** Neighbours use the public plateau and the models actually drawn there, not the own authored island. */
export function explorationNeighborSample(point:ExplorationPoint,neighbor:ExplorationNeighborContext):{walkable:boolean;height:number}|null{const local={x:point.x-neighbor.plot.x,y:point.y-neighbor.plot.y};if(Math.abs(local.x)>26||Math.abs(local.y)>26)return null;const base=sampleWorld(neighbor.plot.x,neighbor.plot.y).height,plateau={...neighbor.plot,height:base,radius:18,land:neighbor.state.land,landVisual:neighbor.state.landVisual},prepared=landCellPrepared(neighbor.state,local.x,local.y)||!!landBridgeAt(neighbor.state,local.x,local.y),x=prepared?point.x:Math.floor(point.x/2)*2+1,y=prepared?point.y:Math.floor(point.y/2)*2+1,height=Math.fround(continuousTerrainHeight(x,y,undefined,[plateau])),sample=sampleWorld(point.x,point.y);return{height,walkable:!sample.water||height>sample.waterLevel+.12};}
export function explorationNeighborObstacles(neighbor:ExplorationNeighborContext):readonly PhysicalObstacle[]{return[...(neighbor.station?publicStationObstacles(neighbor.station):[]),...neighbor.state.buildings.map(b=>({id:`neighbor-building:${neighbor.plot.x}:${neighbor.plot.y}:${b.id}`,x:neighbor.plot.x+b.x,y:neighbor.plot.y+b.y,...habitableBuildingDimensions(b),height:3,kind:'building'}))];}
/** The plateau blends beyond the plot; it does not hide authored objects throughout that fringe. */
export function explorationNeighborHidesObstacle(obstacle:PhysicalObstacle,neighbor:ExplorationNeighborContext):boolean{const padding=Math.max(2,obstacle.width/2,obstacle.depth/2);return Math.abs(obstacle.x-neighbor.plot.x)<(neighbor.plot.width??34)/2+padding&&Math.abs(obstacle.y-neighbor.plot.y)<(neighbor.plot.depth??30)/2+padding;}
export function physicalHomeNpcCapsulesNear(point:ExplorationPoint,home:ExplorationHomeContext,nowMs=0,radius=9,includeDistrict=true):readonly PhysicalCapsule[]{const bodies:PhysicalCapsule[]=[...(includeDistrict?HABITABLE_POINTS.map(p=>({id:`district-${p.id}`,x:home.plot.x+p.x+.7,y:home.plot.y+p.y,radius:.325,height:1.6})):[]),...(home.state.workers??[]).filter(w=>habitableWorkerVisibleAt(w,home.state,nowMs)).map(w=>{const p=habitableWorkerAt(w,nowMs);return{id:w.id,x:home.plot.x+p.x,y:home.plot.y+p.y,radius:.325,height:1.6};})];return bodies.filter(p=>Math.hypot(p.x-point.x,p.y-point.y)<=radius+p.radius);}
export function explorationLineClearWithHome(from:ExplorationPoint,to:ExplorationPoint,home:ExplorationHomeContext,nowMs?:number,players:readonly PhysicalCapsule[]=[],context?:PhysicalWorldContext,endsAt?:number):boolean{
  const neighbors=(home.neighbors??[]).filter(n=>Math.abs(n.plot.x-from.x)<=40&&Math.abs(n.plot.y-from.y)<=40),homes=[home,...neighbors],homeAt=(point:ExplorationPoint)=>{const own=explorationHomeSample(point,home);if(own)return own;for(const h of neighbors){const result=explorationNeighborSample(point,h);if(result)return result;}return null;};
  const sample=(point:ExplorationPoint)=>{const authored=homeAt(point);if(authored)return authored;const terrain=physicalTerrainSample(point);return{...terrain,walkable:!waterfallPool(point.x,point.y,home.plot)&&terrain.walkable};};
  const obstacles=new Map([...(context?.obstacles??[]),...explorationHomeObstacles(home),...neighbors.flatMap(explorationNeighborObstacles)].map(b=>[b.id,b])),physicsContext={...(context??{plots:homes.map(h=>h.plot),clearAt:(x:number,y:number)=>homes.some(h=>houseClearsProceduralTree(h.state,x-h.plot.x,y-h.plot.y))}),obstacles:[...obstacles.values()]};
  if(!physicalLineClear(from,to,{sample,context:physicsContext,ignoreStaticAt:p=>!!explorationHomeSample(p,home)||neighbors.some(n=>explorationNeighborHidesObstacle(p,n)),now:nowMs,endsAt,includeNpcs:nowMs!==undefined,players}))return false;
  if(nowMs!==undefined){const distance=Math.hypot(to.x-from.x,to.y-from.y),count=Math.max(1,Math.ceil(distance/.15));for(let i=0;i<=count;i++){const p={x:from.x+(to.x-from.x)*i/count,y:from.y+(to.y-from.y)*i/count},previous={x:from.x+(to.x-from.x)*Math.max(0,i-1)/count,y:from.y+(to.y-from.y)*Math.max(0,i-1)/count},time=nowMs+((endsAt??nowMs+distance/3.5*1000)-nowMs)*i/count;for(const h of homes)for(const body of physicalHomeNpcCapsulesNear(p,h,time,1,h===home)){const[a,b]=capsuleAxis(body),shape={...body,width:body.radius*2,depth:body.radius*2,height:body.height};if(segmentDistance(previous,p,a,b)<.3+body.radius&&!obstacleAllowsEgress(from,to,shape,.3))return false;}}}return true;
}
