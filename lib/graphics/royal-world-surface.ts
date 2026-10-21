import {inhabitedRoadAt} from './inhabited-world-data.ts';
import {continuousTerrainHeight} from './world-terrain-height.ts';
import {sampleWorld} from './world-geography.ts';
import {ROYAL_WORLD_LOCATION as site,ROYAL_WORLD_BOUNDS as bounds,royalLocalToWorld} from './royal-world-location.ts';
import {royalRegionalTerrain,royalRiver,royalRoadDeck} from './royal-regional-terrain.ts';
import {royalCitadelWalkHeight} from './royal-citadel-layout.ts';
import {ROYAL_PORT_OFFSET,HUMAN_ASCENTS,HUMAN_LANDINGS,humanApproachHeight,humanInteriorWalkHeight,HUMAN_INTERIOR_THRONE,ROYAL_CASTLE_SCALE} from './royal-proportions.ts';
import {royalMaritimeWalkHeight} from './royal-maritime-layout.ts';
import {royalAvenueDeck} from './royal-canal-layout.ts';
import {ROYAL_PALACE_AVENUE,ROYAL_PUBLIC_BRIDGE_ROUTE} from './royal-urban-plan.ts';
import {oldTownWalkHeight} from './royal-old-town-plan.ts';

export const ROYAL_WORLD_BASE_Y=sampleWorld(site.x,site.y).height+1;
/** Exact triangle interpolation used by the planet mesh and the Reino camera.
 * Values here are relative to the regional base; local Z is the original castle Z. */
export function createRoyalSurface(baseY=ROYAL_WORLD_BASE_Y){
 const cache=new Map<string,number>();
 const raw=(x:number,z:number)=>{const key=x+':'+z;let h=cache.get(key);if(h===undefined){h=royalRegionalTerrain(site.x+x,site.y+z,continuousTerrainHeight(site.x+x,site.y+z),baseY)-baseY;if(cache.size>150000)cache.clear();cache.set(key,h);}return h;};
 const triangle=(x:number,z:number,step:number,offsetZ=0)=>{const x0=Math.floor(x/step)*step,z0=Math.floor((z-offsetZ)/step)*step+offsetZ,u=(x-x0)/step,v=(z-z0)/step,a=raw(x0,z0),b=raw(x0+step,z0),c=raw(x0,z0+step),d=raw(x0+step,z0+step);return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);};
 const core=(x:number,z:number)=>triangle(x,z,4);
 const ground=(x:number,z:number)=>Math.abs(x)<=192&&z>=40&&z<=296?triangle(x,z+ROYAL_PORT_OFFSET,2,ROYAL_PORT_OFFSET):core(x,z+ROYAL_PORT_OFFSET);
 const walk=(x:number,z:number,referenceY?:number):number|null=>{
  const oldTown=oldTownWalkHeight(x,z);if(oldTown!==null)return oldTown;
  const maritime=royalMaritimeWalkHeight(x,z,referenceY);if(maritime!==null)return maritime;
  // Original stairs, gardens, multi-level palace and watch bridges retain their exact treads.
  const interior=humanInteriorWalkHeight(x,z,referenceY);if(interior!==null)return interior;
  if(z<=-4){const approach=HUMAN_ASCENTS.some(a=>z<=a.startZ&&z>=a.endZ&&Math.abs(x)<=a.width/2);if(approach)return humanApproachHeight(z);for(const a of HUMAN_LANDINGS)if(z<=a.startZ&&z>=a.endZ&&Math.abs(x)<=a.width/2)return a.y;const lx=x/ROYAL_CASTLE_SCALE,lz=(z+ROYAL_PORT_OFFSET)/ROYAL_CASTLE_SCALE,ax=Math.abs(lx),steps=Math.ceil(10.35*ROYAL_CASTLE_SCALE/.16),q=(t:number)=>Math.min(steps,Math.floor(Math.max(0,Math.min(1,t))*steps+1e-6)+1)/steps;
   if(ax>=3&&ax<=18&&Math.abs(lz-28)<=2.75)return (1.3+q((ax-3)/15)*10.35)*ROYAL_CASTLE_SCALE+16;
   if(ax>=3&&ax<=18&&Math.abs(lz-19.5)<=2.75)return (11.65+q((18-ax)/15)*10.35)*ROYAL_CASTLE_SCALE+16;
   const authored=royalCitadelWalkHeight(x*30,z*30);if(authored!==null)return authored/30;}
  const h=ground(x,z),deck=royalRoadDeck(x,z,h),world=royalLocalToWorld(x,z),r=royalRiver(x,z),sample=sampleWorld(world.x,world.y);
  if(deck!==null)return deck;
  // The new human-scale avenue actually meets the foot of the monumental staircase.
  if(Math.abs(x)<=1.2&&z>=-4&&z<=20)return royalAvenueDeck(z);
  if(r.water)return null;
  if(sample.river&&inhabitedRoadAt(world.x,world.y))return Math.max(h+.12,sample.waterLevel+.45-baseY);
  const onRoad=ROYAL_REGIONAL_ROUTES.some(route=>route.points.slice(1).some((b,i)=>{const a=route.points[i],vx=b[0]-a[0],vz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*vx+(z+ROYAL_PORT_OFFSET-a[1])*vz)/(vx*vx+vz*vz)));return Math.hypot(x-a[0]-t*vx,z+ROYAL_PORT_OFFSET-a[1]-t*vz)<5.5;}));
  if(sample.water&&onRoad)return Math.max(h+.15,sample.waterLevel-baseY+.5);
  if(sample.water&&h+baseY<sample.waterLevel+.2)return null;
  return h+.12;
 };
 return{raw,core,ground,walk,inside:(x:number,z:number)=>x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ};
}
export const ROYAL_REGIONAL_ROUTES=Object.freeze([
 {id:'royal-port-to-los-cedros',points:[[-246,ROYAL_PORT_OFFSET+320],[-370,600],[-500,1600],[-350,2800],[800,3800],[1608,4008]]},
 {id:'royal-east-gate-to-paso-del-norte',points:[[246,ROYAL_PORT_OFFSET+320],[450,500],[920,1500],[1750,3000],[2260,3864],[2376,3864]]},
 {id:'royal-east-fort-road',points:[[3640/30,122/30],[180,60],[210,150],[450,500],[920,1500],[1750,3000],[2260,3864],[2376,3864]]},
]);
export const ROYAL_TOWN_TO_THRONE=Object.freeze([
 ...[...ROYAL_REGIONAL_ROUTES[1].points].reverse().map(([x,z])=>({x,z:z-ROYAL_PORT_OFFSET})),
 ...ROYAL_PALACE_AVENUE.slice(1).map(({x,z})=>({x,z})),...[[0,-2488.5],[0,-2808.75],[0,-2946],[594.75,-2946],[594.75,-3205.25],[91.5,-3205.25],[0,-3205.25],[0,-3331]].map(([x,z])=>({x:x/30,z:z/30})),
 {x:0,z:-124.2},{x:-10,z:-124.2},{x:-10,z:-127},{x:-8.4,z:-127},{x:1.2,z:-127},{x:3,z:-127},{x:3,z:-132},{x:0,z:-132},{x:HUMAN_INTERIOR_THRONE.x,z:HUMAN_INTERIOR_THRONE.z},
]);
