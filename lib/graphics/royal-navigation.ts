import {TAVERN_COUNTER,TAVERN_RECEIVING} from './tavern-supply-route.ts';
import {ROYAL_URBAN_STREETS,ROYAL_PUBLIC_BRIDGE_ROUTE} from './royal-urban-plan.ts';
import {sitePoint} from './city-shop-sites.ts';
import {shopLocalPath} from './city-shop-route.ts';
import {physicalObstaclesNear} from './world-collision.ts';
import {ROYAL_WORLD_ORIGIN,royalLocalToWorld} from './royal-world-location.ts';
import data from './royal-navigation.generated.json' with {type:'json'};
import {createRoyalSurface,ROYAL_TOWN_TO_THRONE} from './royal-world-surface.ts';
import {moveRoyalWalker,type RoyalObstacle} from './royal-harbor-layout.ts';
import {HUMAN_CITADEL_SPAWN,HUMAN_INTERIOR_THRONE,HUMAN_INTERIOR_LOOKOUT,HUMAN_TOWER,humanTowerPoint} from './royal-proportions.ts';
import {ROYAL_SHOP,SHOP_PATH,SHOP_YARD_PATH} from './city-shop-layout.ts';
export type RoyalPose={x:number;y:number;z:number};
export const ROYAL_RECEPTION=data.reception;
export const ROYAL_WORKS=data.works;
export const ROYAL_GATE=HUMAN_CITADEL_SPAWN;
export const ROYAL_NAV_OBSTACLES:readonly RoyalObstacle[]=data.obstacles;
export type RoyalTarget='tavern'|'warehouse'|'gate'|'reception'|'throne'|'lookout'|'shop'|'pickup'|'north-shop'|'north-pickup';
export const royalTarget=(target:RoyalTarget):RoyalPose=>target==='tavern'?TAVERN_COUNTER:target==='warehouse'?TAVERN_RECEIVING:target==='north-shop'?sitePoint('paso-del-norte',ROYAL_SHOP.counter):target==='north-pickup'?sitePoint('paso-del-norte',ROYAL_SHOP.pickup):target==='shop'?ROYAL_SHOP.counter:target==='pickup'?ROYAL_SHOP.pickup:target==='gate'?ROYAL_GATE:target==='reception'?{x:0,y:ROYAL_RECEPTION.y,z:-119.2}:target==='throne'?HUMAN_INTERIOR_THRONE:HUMAN_INTERIOR_LOOKOUT;
/** CPU-only authority contract exported from the actual rendered solids. No
 * WebGL, timers, client coordinates or economy is used to calculate a floor. */
export function royalNavigation(extraObstacles:readonly RoyalObstacle[]=[]){
 const surface=createRoyalSurface();
 const solids=extraObstacles.length?[...ROYAL_NAV_OBSTACLES,...extraObstacles]:ROYAL_NAV_OBSTACLES;
 function line(from:RoyalPose,to:{x:number;z:number},targetY?:number,radius=.4){let p={...from};const mid=royalLocalToWorld((from.x+to.x)/2,(from.z+to.z)/2);const localSolids=Math.hypot(from.x,from.z)>500?[...solids,...physicalObstaclesNear(mid,Math.hypot(to.x-from.x,to.z-from.z)/2+3).filter(o=>o.kind!=='tree').map(o=>({x:o.x-ROYAL_WORLD_ORIGIN.x,z:o.y-ROYAL_WORLD_ORIGIN.y,halfWidth:(Math.abs(Math.cos(o.rotation??0))*o.width+Math.abs(Math.sin(o.rotation??0))*o.depth)/2,halfDepth:(Math.abs(Math.sin(o.rotation??0))*o.width+Math.abs(Math.cos(o.rotation??0))*o.depth)/2,minY:surface.ground(o.x-ROYAL_WORLD_ORIGIN.x,o.y-ROYAL_WORLD_ORIGIN.y),maxY:surface.ground(o.x-ROYAL_WORLD_ORIGIN.x,o.y-ROYAL_WORLD_ORIGIN.y)+o.height}))]:solids;const d=Math.hypot(to.x-p.x,to.z-p.z),steps=Math.max(1,Math.ceil(d/.15));
  for(let i=0;i<steps;i++){const dx=(to.x-from.x)/steps,dz=(to.z-from.z)/steps,q=moveRoyalWalker(p,dx,dz,localSolids,radius,surface.walk);if(Math.hypot(q.x-(p.x+dx),q.z-(p.z+dz))>.005)return null;p=q;}
  return targetY!==undefined&&Math.abs(p.y-targetY)>.3?null:p;
 }
 function route(from:RoyalPose,target:RoyalTarget):RoyalPose[]|null{
  const goal=royalTarget(target);if(target==='north-shop'||target==='north-pickup'){const path=shopLocalPath('paso-del-norte',target==='north-shop'?'counter':'pickup',surface.walk);let best=-1,cost=Infinity;for(let i=0;i<path.length;i++){const d=Math.hypot(from.x-path[i].x,from.z-path[i].z);if(d<cost&&line(from,path[i],path[i].y)){cost=d;best=i;}}if(best<0)return null;const result=[{...from},...path.slice(best)];return result.every((p,i)=>!i||line(result[i-1],p,p.y))?result:null;}const direct=Math.hypot(from.x-goal.x,from.z-goal.z)<35?line(from,goal,goal.y):null;if(direct)return[{...from},goal];
  const shopNodes=[SHOP_PATH,SHOP_YARD_PATH].flatMap(path=>path.flatMap((p,i)=>i?Array.from({length:Math.max(1,Math.ceil(Math.hypot(p.x-path[i-1].x,p.z-path[i-1].z)/20))},(_,j)=>{const t=(j+1)/Math.max(1,Math.ceil(Math.hypot(p.x-path[i-1].x,p.z-path[i-1].z)/20));return{x:path[i-1].x+(p.x-path[i-1].x)*t,y:p.y,z:path[i-1].z+(p.z-path[i-1].z)*t};}):[p]));
  const urbanNodes=[...ROYAL_URBAN_STREETS.map(s=>s.points),ROYAL_PUBLIC_BRIDGE_ROUTE].flatMap(path=>path.flatMap((b,i)=>{if(!i)return [b];const a=path[i-1],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/20));return Array.from({length:n},(_,j)=>({x:a.x+(b.x-a.x)*(j+1)/n,z:a.z+(b.z-a.z)*(j+1)/n,y:a.y+(b.y-a.y)*(j+1)/n}));})).map(p=>({...p,y:surface.walk(p.x,p.z,p.y)!}));
  const nodes:RoyalPose[]=[...urbanNodes,...shopNodes.map(p=>({...p,y:surface.walk(p.x,p.z)!})),...[20,40,60,80].map(z=>({x:0,z,y:surface.walk(0,z)!})),...ROYAL_TOWN_TO_THRONE.filter(p=>Math.hypot(p.x,p.z)<500).map(p=>({...p,y:surface.walk(p.x,p.z)!})),{x:0,y:ROYAL_RECEPTION.y,z:-119.2},ROYAL_GATE,goal,...Array.from({length:HUMAN_TOWER.steps+1},(_,i)=>humanTowerPoint(i)),{x:20,y:HUMAN_TOWER.startY,z:-132},{x:22,y:HUMAN_TOWER.startY,z:-132},{x:22,y:HUMAN_TOWER.startY,z:-112},{...from}].filter(p=>Number.isFinite(p.y));
  const start=nodes.length-1,dist=new Map<number,number>([[start,0]]),prev=new Map<number,number>(),todo=new Set([start]),done=new Set<number>();let end=-1;
  while(todo.size){let a=-1;for(const i of todo)if(a<0||dist.get(i)!<dist.get(a)!)a=i;todo.delete(a);done.add(a);const p=nodes[a];if(Math.hypot(p.x-goal.x,p.z-goal.z)<.02&&Math.abs(p.y-goal.y)<.2){end=a;break;}
   for(let b=0;b<nodes.length;b++){if(done.has(b))continue;const q=nodes[b],d=Math.hypot(q.x-p.x,q.z-p.z),vertical=Math.abs(q.y-p.y);if(d>32||vertical>d*.85+.2||!line(p,q,q.y))continue;const cost=dist.get(a)!+Math.hypot(d,vertical);if(cost<(dist.get(b)??Infinity)){dist.set(b,cost);prev.set(b,a);todo.add(b);}}
  }
  if(end<0)return null;const result:RoyalPose[]=[];for(let i:number|undefined=end;i!==undefined;i=prev.get(i))result.unshift(nodes[i]);return result;
 }
 return{surface,line,route};
}
