import { sampleWorld, WORLD_CHUNK_SIZE } from './world-geography.ts';
import type { WorldBiome } from './world-geography.ts';
import { distanceToSegment } from './living-zone-data.ts';
import type { LivingPoint } from './living-zone-data.ts';
import { FISHING_COMMUNITY, FISHING_PLACES, FISHING_STRUCTURES, FISHING_PROPS, FISHING_LAND_PATHS, FISHING_DOCK_PATHS, FISHING_BOAT_ROUTES, FISHING_CART_ROUTES, fishingSnapshot, fishingSurfaceHeight } from './fishing-community-data.ts';
import type { FishingStructure, FishingProp, FishingPath, FishingBoatPose, FishingWorkerPose, FishingCartPose, FishingSnapshot } from './fishing-community-data.ts';

/** Fixed, offline-validated rigid placements. No geography, accounts or economy are generated here. */
export interface FishingNetworkPlace extends LivingPoint {
  readonly id:string;readonly name:string;readonly alias:string;readonly kind:'village'|'city';readonly width:number;readonly depth:number;readonly biome:WorldBiome;readonly stage:'village'|'city';readonly tier:2|3;readonly communityId:string;
}
export interface FishingCommunityDefinition extends FishingNetworkPlace {
  readonly port:FishingNetworkPlace;readonly city:FishingNetworkPlace;readonly waterLevel:number;readonly rotation:number;readonly quarterTurns:0|1|2|3;readonly phaseOffset:number;
  /** Width is across the jetty, length is along it, independent of rotation. */
  readonly dock:{readonly x:number;readonly y:number;readonly yaw:number;readonly heading:number;readonly width:number;readonly length:number;readonly deckHeight:number;readonly shore:LivingPoint;readonly end:LivingPoint};
  readonly boats:readonly {readonly id:string;readonly name:string;readonly slot:string;readonly offset:number;readonly effectiveOffset:number}[];
  readonly bounds:{readonly minX:number;readonly maxX:number;readonly minY:number;readonly maxY:number};
  readonly stagingPoints:readonly LivingPoint[];readonly cityDeposit:LivingPoint;readonly accessStart:LivingPoint;readonly accessEnd:LivingPoint;
  readonly toWorld:(point:LivingPoint)=>LivingPoint;readonly toTemplate:(point:LivingPoint)=>LivingPoint;readonly toLocal:(point:LivingPoint)=>LivingPoint;readonly mapId:(id:string)=>string;
}
export type FishingNetworkStructure=FishingStructure&{readonly communityId:string;readonly biome:WorldBiome};
export type FishingNetworkProp=FishingProp&{readonly communityId:string;readonly biome:WorldBiome};
export type FishingNetworkPath=FishingPath&{readonly communityId:string};
export type FishingNetworkSnapshot=Omit<FishingSnapshot,'boats'|'workers'|'carts'|'loads'>&{
  readonly boats:readonly (FishingBoatPose&{readonly communityId:string;readonly biome:WorldBiome})[];
  readonly workers:readonly (FishingWorkerPose&{readonly communityId:string;readonly biome:WorldBiome})[];
  readonly carts:readonly (Omit<FishingCartPose,'animal'>&{readonly animal:'horse'|'ox';readonly communityId:string;readonly biome:WorldBiome})[];
  readonly loads:readonly (FishingSnapshot['loads'][number]&{readonly communityId:string})[];
};
type Site={id:string;port:string;city:string;portAlias:string;cityAlias:string;cityId:string;x:number;y:number;q:0|1|2|3;biome:WorldBiome;phase:number;boatNames:readonly [string,string]};
const p=(x:number,y:number):LivingPoint=>Object.freeze({x,y});
const rotate=(point:LivingPoint,q:number):LivingPoint=>q===1?p(-point.y,point.x):q===2?p(-point.x,-point.y):q===3?p(point.y,-point.x):p(point.x,point.y);
const sites:readonly Site[]=[
  {id:FISHING_COMMUNITY.id,port:FISHING_COMMUNITY.name,city:FISHING_COMMUNITY.city.name,portAlias:FISHING_COMMUNITY.alias,cityAlias:FISHING_COMMUNITY.city.alias,cityId:FISHING_COMMUNITY.city.id,x:1152,y:6723,q:0,biome:'coast',phase:0,boatNames:['La Aurora','Brisa del Alba']},
  {id:'fishing-puerto-cedros',port:'Puerto de los Cedros',city:'Ciudad del Sauce',portAlias:'SofiaCedros',cityAlias:'MateoSauce',cityId:'fishing-ciudad-sauce',x:-14400,y:11520,q:2,biome:'forest',phase:73,boatNames:['La Alondra','Viento del Sur']},
  {id:'fishing-bahia-ambar',port:'Bahía del Ámbar',city:'Ciudad de las Salinas',portAlias:'NoraAmbar',cityAlias:'IlanSalinas',cityId:'fishing-ciudad-salinas',x:-16472,y:4608,q:0,biome:'desert',phase:147,boatNames:['Duna Dorada','Estrella de Sal']},
  {id:'fishing-puerto-mangle',port:'Puerto del Mangle',city:'Ciudad de las Mareas',portAlias:'LiaMangle',cityAlias:'DiegoMareas',cityId:'fishing-ciudad-mareas',x:28608,y:-1536,q:3,biome:'tropical',phase:211,boatNames:['Flor de Coral','La Esmeralda']},
  {id:'fishing-puerto-aurora',port:'Puerto de la Aurora',city:'Ciudad del Deshielo',portAlias:'ElenaBoreal',cityAlias:'GaelDeshielo',cityId:'fishing-ciudad-deshielo',x:-25920,y:-12480,q:1,biome:'ice',phase:319,boatNames:['Luz Boreal','La Gaviota Blanca']},
];
function createCommunity(site:Site):FishingCommunityDefinition {
  const original=site.id===FISHING_COMMUNITY.id,rotation=site.q*Math.PI/2;
  const toWorld=(point:LivingPoint)=>{const r=rotate(p(point.x-1152,point.y-6723),site.q);return p(site.x+r.x,site.y+r.y);};
  const toTemplate=(point:LivingPoint)=>{const r=rotate(p(point.x-site.x,point.y-site.y),(4-site.q)%4);return p(1152+r.x,6723+r.y);};
  const mapId=(id:string)=>original?id:id===FISHING_COMMUNITY.id?site.id:id===FISHING_COMMUNITY.city.id?site.cityId:`${site.id}:${id}`;
  const place=(base:typeof FISHING_PLACES[number],name:string,alias:string):FishingNetworkPlace=>Object.freeze({...base,...toWorld(base),id:mapId(base.id),name,alias,biome:site.biome,width:site.q%2?base.depth:base.width,depth:site.q%2?base.width:base.depth,communityId:site.id});
  const port=place(FISHING_PLACES[0],site.port,site.portAlias),city=place(FISHING_PLACES[1],site.city,site.cityAlias);
  const boundsPoints=[p(832,6632),p(832,6860),p(1344,6632),p(1344,6860)].map(toWorld),bounds=Object.freeze({minX:Math.min(...boundsPoints.map(v=>v.x)),maxX:Math.max(...boundsPoints.map(v=>v.x)),minY:Math.min(...boundsPoints.map(v=>v.y)),maxY:Math.max(...boundsPoints.map(v=>v.y))});
  return Object.freeze({...port,port,city,rotation,quarterTurns:site.q,phaseOffset:site.phase,waterLevel:0,dock:Object.freeze({...FISHING_COMMUNITY.dock,...toWorld(FISHING_COMMUNITY.dock),yaw:FISHING_COMMUNITY.dock.yaw-rotation,heading:FISHING_COMMUNITY.dock.heading-rotation,shore:toWorld(FISHING_COMMUNITY.dock.shore),end:toWorld(FISHING_COMMUNITY.dock.end)}),boats:Object.freeze(FISHING_COMMUNITY.boats.map((boat,index)=>Object.freeze({...boat,id:mapId(boat.id),name:site.boatNames[index],slot:mapId(boat.slot),effectiveOffset:boat.offset+site.phase}))),bounds,stagingPoints:Object.freeze([toWorld(p(1170,6708)),toWorld(p(1170,6738))]),cityDeposit:toWorld(p(896.5,6802)),accessStart:toWorld(p(1112,6723)),accessEnd:toWorld(p(1120,6723)),toWorld,toTemplate,toLocal:toTemplate,mapId});
}
export const FISHING_COMMUNITIES:readonly FishingCommunityDefinition[]=Object.freeze(sites.map(createCommunity));
export const FISHING_NETWORK_PLACES:readonly FishingNetworkPlace[]=Object.freeze(FISHING_COMMUNITIES.flatMap(c=>[c.port,c.city]));
const dimensions=(item:{width:number;depth:number},site:FishingCommunityDefinition)=>site.quarterTurns%2?{width:item.depth,depth:item.width}:{width:item.width,depth:item.depth};
export const FISHING_NETWORK_STRUCTURES:readonly FishingNetworkStructure[]=Object.freeze(FISHING_COMMUNITIES.flatMap(site=>FISHING_STRUCTURES.map(b=>Object.freeze({...b,...site.toWorld(b),...dimensions(b,site),id:site.mapId(b.id),owner:site.mapId(b.owner),yaw:b.yaw-site.rotation,communityId:site.id,biome:site.biome}))));
export const FISHING_NETWORK_PROPS:readonly FishingNetworkProp[]=Object.freeze(FISHING_COMMUNITIES.flatMap(site=>FISHING_PROPS.map(b=>Object.freeze({...b,...site.toWorld(b),...dimensions(b,site),id:site.mapId(b.id),yaw:b.yaw-site.rotation,communityId:site.id,biome:site.biome}))));
const transformPaths=(paths:readonly FishingPath[]):readonly FishingNetworkPath[]=>Object.freeze(FISHING_COMMUNITIES.flatMap(site=>paths.map(path=>Object.freeze({...path,id:site.mapId(path.id),points:Object.freeze(path.points.map(site.toWorld)),communityId:site.id}))));
export const FISHING_NETWORK_LAND_PATHS=transformPaths(FISHING_LAND_PATHS);
export const FISHING_NETWORK_DOCK_PATHS=transformPaths(FISHING_DOCK_PATHS);
export const FISHING_NETWORK_BOAT_ROUTES=Object.freeze(FISHING_COMMUNITIES.flatMap(site=>FISHING_BOAT_ROUTES.map(route=>Object.freeze({...route,id:site.mapId(route.id),slot:site.mapId(route.slot),offset:route.offset+site.phaseOffset,points:Object.freeze(route.points.map(site.toWorld)),communityId:site.id}))));
export const FISHING_NETWORK_CART_ROUTES=Object.freeze(FISHING_COMMUNITIES.flatMap(site=>FISHING_CART_ROUTES.map(route=>Object.freeze({...route,id:site.mapId(route.id),boatId:site.mapId(route.boatId),offset:route.offset+site.phaseOffset,parking:site.toWorld(route.parking),points:Object.freeze(route.points.map(site.toWorld)),returnPoints:Object.freeze(route.returnPoints.map(site.toWorld)),approachPoints:Object.freeze(route.approachPoints.map(site.toWorld)),communityId:site.id}))));

const communityById=new Map(FISHING_COMMUNITIES.map(site=>[site.id,site]));
const communityByPlace=new Map(FISHING_NETWORK_PLACES.map(place=>[place.id,communityById.get(place.communityId)!]));
const localNames:Readonly<Record<string,{workers:readonly string[];carters:readonly [string,string]}>>=Object.freeze({
  'fishing-puerto-cedros':{workers:['Alba Robles','Tomás Pino','Eva Ladera','Simón Bruma','Clara del Sauce','Julián Ríos'],carters:['Sara','Bruno']},
  'fishing-bahia-ambar':{workers:['Amal Salinas','Vera Ocre','Iker Dunas','Nadia Sol','Elio Marfil','Noa Ámbar'],carters:['Yara','Omar']},
  'fishing-puerto-mangle':{workers:['Luna Palma','Tiago Coral','Alma Juncos','Darío Brisa','Iris Marea','Nico Estero'],carters:['Ciro','Marina']},
  'fishing-puerto-aurora':{workers:['Liv Nieve','Erik Norte','Freya Boreal','Nilo Escarcha','Astrid Hielo','Gael Aurora'],carters:['Soren','Elena']},
});
export function fishingCommunityForPlace(id:string):FishingCommunityDefinition|undefined{return communityByPlace.get(id);}
export function fishingCommunityForActivity(id:string):FishingCommunityDefinition|undefined{return FISHING_COMMUNITIES.find(site=>site.boats.some(boat=>id===boat.id||id.startsWith(`${boat.id}-`))||site.mapId('fishing-city-porter-0')===id||site.mapId('fishing-city-porter-1')===id);}
export function resolveFishingCommunity(id:string):FishingCommunityDefinition|undefined{return communityById.get(id)??communityByPlace.get(id)??fishingCommunityForActivity(id);}
function surfaceHeight(site:FishingCommunityDefinition,x:number,y:number,base:number):number {const point=site.toTemplate(p(x,y));return fishingSurfaceHeight(point.x,point.y,base);}
export function fishingCommunitySnapshot(id:string,timeSeconds:number):FishingNetworkSnapshot {
  const site=communityById.get(id);if(!site)throw new RangeError(`Comunidad pesquera desconocida: ${id}`);
  const time=Number.isFinite(timeSeconds)?Math.max(0,timeSeconds):0,source=fishingSnapshot(time+site.phaseOffset),mapIds=(ids:readonly string[])=>Object.freeze(ids.map(site.mapId));
  const pose=<T extends LivingPoint&{id:string;yaw:number;height?:number}>(item:T)=>{const point=site.toWorld(item);return{...item,...point,id:site.mapId(item.id),yaw:item.yaw-site.rotation,height:item.height===undefined?undefined:surfaceHeight(site,point.x,point.y,sampleWorld(point.x,point.y).height),communityId:site.id,biome:site.biome};};
  return{time,boats:source.boats.map((boat,index)=>({...pose(boat),name:site.boats[index].name,batchId:site.mapId(boat.batchId),cargoIds:mapIds(boat.cargoIds),dockSlot:site.mapId(boat.dockSlot),crew:Object.freeze(boat.crew.map(crew=>({...crew,id:site.mapId(crew.id)})))})),workers:source.workers.map((worker,index)=>({...pose(worker),name:localNames[site.id]?.workers[index]??worker.name,cargoId:worker.cargoId?site.mapId(worker.cargoId):undefined})),carts:source.carts.map((cart,index)=>({...pose(cart),name:localNames[site.id]?`Carro de ${localNames[site.id].carters[index]}`:cart.name,animal:site.biome==='ice'||site.biome==='forest'?'ox':'horse',batchId:site.mapId(cart.batchId),cargoIds:mapIds(cart.cargoIds),destinationId:site.city.id})),loads:source.loads.map(load=>({...load,id:site.mapId(load.id),batchId:site.mapId(load.batchId),cargoIds:mapIds(load.cargoIds),communityId:site.id}))};
}
export function fishingNetworkSnapshot(timeSeconds:number):FishingNetworkSnapshot {const snapshots=FISHING_COMMUNITIES.map(site=>fishingCommunitySnapshot(site.id,timeSeconds));return{time:snapshots[0].time,boats:snapshots.flatMap(s=>s.boats),workers:snapshots.flatMap(s=>s.workers),carts:snapshots.flatMap(s=>s.carts),loads:snapshots.flatMap(s=>s.loads)};}

const cell=(x:number,y:number)=>`${Math.floor(x/WORLD_CHUNK_SIZE)}:${Math.floor(y/WORLD_CHUNK_SIZE)}`;
const siteIndex=new Map<string,FishingCommunityDefinition[]>(),padIndex=new Map<string,FishingNetworkStructure[]>(),padHeights=new Map<string,number>();
function index<T>(map:Map<string,T[]>,item:T,minX:number,maxX:number,minY:number,maxY:number){for(let cx=Math.floor(minX/64);cx<=Math.floor(maxX/64);cx++)for(let cy=Math.floor(minY/64);cy<=Math.floor(maxY/64);cy++){const key=`${cx}:${cy}`,list=map.get(key)??[];list.push(item);map.set(key,list);}}
for(const site of FISHING_COMMUNITIES)index(siteIndex,site,site.bounds.minX-12,site.bounds.maxX+12,site.bounds.minY-12,site.bounds.maxY+12);
for(const b of FISHING_NETWORK_STRUCTURES){index(padIndex,b,b.x-b.width/2-10,b.x+b.width/2+10,b.y-b.depth/2-10,b.y+b.depth/2+10);const sample=sampleWorld(b.x,b.y);padHeights.set(b.id,Math.round(Math.max(.5,sample.height,sample.water?sample.waterLevel+.6:-Infinity)*2)/2);}
const pathsBySite=new Map(FISHING_COMMUNITIES.map(site=>[site.id,FISHING_NETWORK_LAND_PATHS.filter(path=>path.communityId===site.id&&path.surface==='land')]));
export function fishingNetworkRoadAt(x:number,y:number):boolean {const sites=siteIndex.get(cell(x,y));if(!sites)return false;const road=sites.some(site=>pathsBySite.get(site.id)!.some(path=>path.points.slice(1).some((b,i)=>distanceToSegment(x,y,path.points[i],b).distance<=path.width/2)));return road&&!sampleWorld(x,y).water;}
export function fishingNetworkOccupiedAt(x:number,y:number,padding=0):boolean {const sites=siteIndex.get(cell(x,y));if(!sites)return false;return sites.some(site=>{const point=site.toTemplate(p(x,y));return FISHING_PLACES.some(place=>Math.abs(point.x-place.x)<=place.width/2+padding&&Math.abs(point.y-place.y)<=place.depth/2+padding)||Math.abs(point.x-1152)<=32+padding&&Math.abs(point.y-6723)<=17+padding;})||fishingNetworkRoadAt(x,y);}
export function fishingNetworkSurfaceHeight(x:number,y:number,base:number):number {for(const site of siteIndex.get(cell(x,y))??[]){const height=surfaceHeight(site,x,y,base);if(height!==base)return height;}return base;}
export function fishingNetworkTerrainHeight(x:number,y:number,base:number,sample?:{water:boolean;river:boolean;waterLevel:number}):number {const candidates=padIndex.get(cell(x,y));if(!candidates)return base;const exact=candidates.find(b=>Math.abs(x-b.x)<=b.width/2+.15&&Math.abs(y-b.y)<=b.depth/2+.15);if(exact)return padHeights.get(exact.id)!;if(sample?.water)return base;let sum=base,total=1;for(const b of candidates){const distance=Math.max(Math.abs(x-b.x)-b.width/2,Math.abs(y-b.y)-b.depth/2);if(distance>=8)continue;const t=Math.max(0,Math.min(1,distance/8)),influence=1-t*t*(3-2*t),weight=influence*influence/Math.max(1e-8,1-influence);sum+=padHeights.get(b.id)!*weight;total+=weight;}return sum/total;}
export function getFishingCommunityData(id:string){const community=communityById.get(id);if(!community)throw new RangeError(`Comunidad pesquera desconocida: ${id}`);return{community,structures:FISHING_NETWORK_STRUCTURES.filter(item=>item.communityId===id),props:FISHING_NETWORK_PROPS.filter(item=>item.communityId===id),landPaths:FISHING_NETWORK_LAND_PATHS.filter(item=>item.communityId===id),dockPaths:FISHING_NETWORK_DOCK_PATHS.filter(item=>item.communityId===id),toWorld:community.toWorld,toTemplate:community.toTemplate,worldToLocal:community.toTemplate,localToWorld:community.toWorld,snapshot:(time:number)=>fishingCommunitySnapshot(id,time),surfaceHeight:(x:number,y:number,base:number)=>surfaceHeight(community,x,y,base)};}
