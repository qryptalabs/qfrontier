import dimensions from './public-station-bounds.json' with {type:'json'};
import {stableSeed} from './scene-data.ts';
import {sampleWorld,type WorldBiome} from './world-geography.ts';
import type {BuildingType} from '../mvp/types.ts';
import type {PhysicalObstacle} from './kinematic-physics.ts';

export interface PublicStationLayoutInput{id:string;plot:{x:number;y:number};buildings:Record<BuildingType,number>}
export interface PublicStationPlacement{id:string;source:'building'|'asset';kind:string;level:number;x:number;y:number;scale:number;rotation:number;water?:boolean;obstacle:PhysicalObstacle}
type Bounds={minX:number;minZ:number;maxX:number;maxZ:number;height:number};

/** The existing neighbour display, including its exact seeded positions; never used for the own authored station. */
export function publicStationLayout(place:PublicStationLayoutInput,biome:WorldBiome=sampleWorld(place.plot.x,place.plot.y).biome):readonly PublicStationPlacement[]{
  const seed=stableSeed(place.id),rotation=(seed%4)*Math.PI/2,result:PublicStationPlacement[]=[],family=biome==='ice'?'igloo':'adobe';
  const add=(source:PublicStationPlacement['source'],kind:string,x:number,y:number,level:number,scale:number,yaw=rotation,water=false)=>{const box:Bounds=source==='building'?(dimensions.buildings as Record<string,Bounds[]>)[kind][Math.max(0,Math.min(2,Math.round(level)-1))]:(dimensions.assets as Record<string,Bounds>)[kind],cx=(box.minX+box.maxX)*scale/2,cy=(box.minZ+box.maxZ)*scale/2,c=Math.cos(yaw),s=Math.sin(yaw),id=`public-station:${place.id}:${kind}:${result.length}`;result.push({id,source,kind,level,x:place.plot.x+x,y:place.plot.y+y,scale,rotation:yaw,...(water?{water:true}:{}),obstacle:{id,x:place.plot.x+x+cx*c+cy*s,y:place.plot.y+y-cx*s+cy*c,width:(box.maxX-box.minX)*scale,depth:(box.maxZ-box.minZ)*scale,height:box.height*scale,rotation:yaw,kind:'building'}});};
  if(biome==='ice'||biome==='desert')add('asset',family,-5,-3,1,.9);else add('building','home',-5,-3,1,1.9);
  const order:readonly BuildingType[]=['workshop','garden','kitchen','laboratory','barracks','warehouse','logistics'];
  order.forEach((kind,i)=>{const level=place.buildings[kind];if(!level)return;const variant=seed%4,angle=i*Math.PI*2/7,x=variant===0?-11+(i%4)*7:variant===1?Math.cos(angle)*12:variant===2?(i%2?9:-9):[-11,-3,6,12,-11,0,11][i],y=variant===0?(i<4?-10:8):variant===1?Math.sin(angle)*12:variant===2?-12+i*4:[-11,-12,-11,-4,8,11,8][i];add('building',kind,x,y,level,1.6);});
  add('asset','market',5,0,1,.65,0);if(Math.max(...Object.values(place.buildings))>=2)add('asset','windmill',-12,11,1,.8,0);
  if(biome==='coast'||biome==='ocean')add('asset','boat',16,14,1,1,0,true);
  return result;
}

export function publicStationObstacles(place:PublicStationLayoutInput,biome?:WorldBiome):readonly PhysicalObstacle[]{return publicStationLayout(place,biome).filter(part=>!part.water).map(part=>part.obstacle);}
