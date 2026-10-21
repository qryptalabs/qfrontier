/** Shared, additive public transport infrastructure. No player state or WebGL. */
import network from './exploration-network.generated.json' with {type:'json'};
export interface NetworkPoint{x:number;y:number}
export interface PublicLanding{id:string;name:string;land:NetworkPoint;water:NetworkPoint;end?:NetworkPoint;mooring?:NetworkPoint;width:number;deckHeight:number;biome:string;destinationIds:string[]}
export interface PublicRiverBridge{id:string;a:NetworkPoint;b:NetworkPoint;width:number;deckHeight:number}
export interface PublicNetworkNode{id:string;kind:'destination'|'landing'|'junction';position:NetworkPoint;landingId?:string;destinationId?:string}
export interface PublicNetworkEdge{id:string;from:string;to:string;mode:'walk'|'carriage'|'boat';points:NetworkPoint[];distance:number;seconds:number;fromPortId?:string;toPortId?:string;road?:boolean}
export interface PublicTerrainRamp{id:string;a:NetworkPoint;b:NetworkPoint;width:number;fromHeight:number;toHeight:number}
export interface PublicTownGate extends NetworkPoint{id:string;width:number;depth:number;rotation:number;owner:string}
export interface ExplorationNetworkData{version:1;validated:boolean;landings:PublicLanding[];bridges:PublicRiverBridge[];gates?:PublicTownGate[];ramps?:PublicTerrainRamp[];nodes:PublicNetworkNode[];edges:PublicNetworkEdge[];destinations:{id:string;nodeId:string}[];sourceSha256?:string;checks?:Record<string,unknown>}
export const EXPLORATION_NETWORK=network as ExplorationNetworkData;
export const EXPLORATION_PUBLIC_LANDINGS:readonly PublicLanding[]=EXPLORATION_NETWORK.landings;
export const EXPLORATION_PUBLIC_RAMPS:readonly PublicTerrainRamp[]=EXPLORATION_NETWORK.ramps??[];
export const EXPLORATION_PUBLIC_BRIDGES:readonly PublicRiverBridge[]=EXPLORATION_NETWORK.bridges;
type Segment={a:NetworkPoint;b:NetworkPoint;width:number;height?:number;fromHeight?:number;toHeight?:number;kind?:'bridge'|'landing'|'ramp';id:string};
const infraIndex=new Map<string,Segment[]>(),roadIndex=new Map<string,Segment[]>(),CHUNK=128;
function index(map:Map<string,Segment[]>,s:Segment){const pad=s.width/2+16;for(let x=Math.floor((Math.min(s.a.x,s.b.x)-pad)/CHUNK);x<=Math.floor((Math.max(s.a.x,s.b.x)+pad)/CHUNK);x++)for(let y=Math.floor((Math.min(s.a.y,s.b.y)-pad)/CHUNK);y<=Math.floor((Math.max(s.a.y,s.b.y)+pad)/CHUNK);y++){const key=`${x}:${y}`,entries=map.get(key)??[];entries.push(s);map.set(key,entries);}}
for(const r of EXPLORATION_PUBLIC_RAMPS)index(infraIndex,{...r,kind:'ramp'});
for(const b of EXPLORATION_PUBLIC_BRIDGES)index(infraIndex,{...b,height:b.deckHeight,kind:'bridge'});
for(const d of EXPLORATION_PUBLIC_LANDINGS)index(infraIndex,{a:d.land,b:d.end??d.water,width:d.width,height:d.deckHeight,kind:'landing',id:d.id});
for(const edge of EXPLORATION_NETWORK.edges)if(edge.mode==='carriage'||edge.road)for(let i=1;i<edge.points.length;i++)index(roadIndex,{a:edge.points[i-1],b:edge.points[i],width:3,id:edge.id});
function distance(point:NetworkPoint,s:Segment){const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,t=Math.max(0,Math.min(1,((point.x-s.a.x)*dx+(point.y-s.a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(point.x-s.a.x-dx*t,point.y-s.a.y-dy*t);}
export function publicInfrastructureAt(point:NetworkPoint,padding=0):{height:number;kind:'bridge'|'landing'|'ramp';id:string}|null{let result:null|{height:number;kind:'bridge'|'landing'|'ramp';id:string}=null;for(const s of infraIndex.get(`${Math.floor(point.x/CHUNK)}:${Math.floor(point.y/CHUNK)}`)??[])if(distance(point,s)<=s.width/2+padding){const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,raw=((point.x-s.a.x)*dx+(point.y-s.a.y)*dy)/(dx*dx+dy*dy||1);if(raw<-.00001||raw>1.00001)continue;const t=Math.max(0,Math.min(1,raw)),height=s.kind==='ramp'?s.fromHeight!+(s.toHeight!-s.fromHeight!)*t:s.height!;if(!result||height>result.height)result={height,kind:s.kind!,id:s.id};}return result;}
/** Public roads clear procedural flora only. Fixed buildings, walls and gates remain solid. */
export function publicRoadAt(point:NetworkPoint,padding=0):boolean{return(roadIndex.get(`${Math.floor(point.x/CHUNK)}:${Math.floor(point.y/CHUNK)}`)??[]).some(s=>distance(point,s)<=s.width/2+padding);}


const gates=EXPLORATION_NETWORK.gates??[];
/** Explicit open span shared by the visible town boundary and its collision shapes. */
export function publicTownGateAt(point:NetworkPoint,padding=0):boolean{return gates.some(g=>Math.abs(point.x-g.x)<=g.width/2+padding&&Math.abs(point.y-g.y)<=g.depth/2+padding);}


export interface PublicRoadSegment{id:string;routeId:string;a:NetworkPoint;b:NetworkPoint;width:number;kind:'road'|'bridge'|'landing';mode:'walk'|'carriage';sourceIndex:number}
/** Exact predefined corridors, including the supported walk along each pier. */
export const roadSegments:readonly PublicRoadSegment[]=Object.freeze(EXPLORATION_NETWORK.edges.filter(e=>e.mode!=='boat').flatMap(e=>e.points.slice(1).map((b,index)=>{const a=e.points[index],support=publicInfrastructureAt({x:(a.x+b.x)/2,y:(a.y+b.y)/2});return{id:`${e.id}:${index}`,routeId:e.id,a,b,width:support?.kind==='bridge'?EXPLORATION_PUBLIC_BRIDGES.find(bridge=>bridge.id===support.id)?.width??3:3,kind:support?.kind==='bridge'?'bridge' as const:support?.kind==='landing'?'landing' as const:'road' as const,mode:e.mode as 'walk'|'carriage',sourceIndex:index};})));
export function isPointOnPublicRoad(point:NetworkPoint,padding=0):boolean{return publicRoadAt(point,padding)||!!publicInfrastructureAt(point,padding);}
export interface PublicRoadAtom{ id:string;a:NetworkPoint;b:NetworkPoint;width:number;routeId:string;routeIds:string[];sourceIndex:number }
let topology:readonly PublicRoadAtom[]|undefined;
const coordinateKey=(p:NetworkPoint)=>`${p.x.toFixed(6)},${p.y.toFixed(6)}`;
/** Split only at true intersections or collinear overlaps. No gap is made into a road. */
export function publicRoadTopology():readonly PublicRoadAtom[]{if(topology)return topology;const cuts=roadSegments.map(()=>[0,1]),buckets=new Map<string,number[]>(),pairs=new Set<string>(),cross=(a:NetworkPoint,b:NetworkPoint)=>a.x*b.y-a.y*b.x;
  for(let i=0;i<roadSegments.length;i++){const s=roadSegments[i];for(let x=Math.floor(Math.min(s.a.x,s.b.x)/128);x<=Math.floor(Math.max(s.a.x,s.b.x)/128);x++)for(let y=Math.floor(Math.min(s.a.y,s.b.y)/128);y<=Math.floor(Math.max(s.a.y,s.b.y)/128);y++){const key=`${x}:${y}`,entries=buckets.get(key)??[];for(const j of entries)pairs.add(`${j}:${i}`);entries.push(i);buckets.set(key,entries);}}
  for(const pair of pairs){const[i,j]=pair.split(':').map(Number),a=roadSegments[i],b=roadSegments[j],r={x:a.b.x-a.a.x,y:a.b.y-a.a.y},s={x:b.b.x-b.a.x,y:b.b.y-b.a.y},q={x:b.a.x-a.a.x,y:b.a.y-a.a.y},den=cross(r,s),rr=r.x*r.x+r.y*r.y,ss=s.x*s.x+s.y*s.y;if(rr<1e-12||ss<1e-12)continue;
    if(Math.abs(den)>1e-8){const t=cross(q,s)/den,u=cross(q,r)/den;if(t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8){cuts[i].push(Math.max(0,Math.min(1,t)));cuts[j].push(Math.max(0,Math.min(1,u)));}}
    else if(Math.abs(cross(q,r))<=1e-6){for(const p of[b.a,b.b]){const t=((p.x-a.a.x)*r.x+(p.y-a.a.y)*r.y)/rr;if(t>0&&t<1)cuts[i].push(t);}for(const p of[a.a,a.b]){const u=((p.x-b.a.x)*s.x+(p.y-b.a.y)*s.y)/ss;if(u>0&&u<1)cuts[j].push(u);}}
  }
  const atoms=new Map<string,PublicRoadAtom>();for(let i=0;i<roadSegments.length;i++){const s=roadSegments[i],values=[...new Set(cuts[i].map(t=>Math.round(t*1e10)/1e10))].sort((a,b)=>a-b);for(let j=1;j<values.length;j++){const point=(t:number)=>({x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t}),a=point(values[j-1]),b=point(values[j]);if(Math.hypot(a.x-b.x,a.y-b.y)<1e-6)continue;const ka=coordinateKey(a),kb=coordinateKey(b),key=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`,old=atoms.get(key);if(old){if(!old.routeIds.includes(s.routeId))old.routeIds.push(s.routeId);continue;}atoms.set(key,{id:`road:${key}`,a,b,width:s.width,routeId:s.routeId,routeIds:[s.routeId],sourceIndex:s.sourceIndex});}}
  topology=Object.freeze([...atoms.values()].map(atom=>Object.freeze({...atom,routeIds:atom.routeIds.sort()})));return topology;
}
