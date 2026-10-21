import { sampleWorld, WORLD_CHUNK_SIZE } from './world-geography.ts';
import type { BuildingType } from '../mvp/types.ts';

export interface LivingPoint { readonly x:number;readonly y:number }
export interface LivingPlace extends LivingPoint {readonly id:string;readonly name:string;readonly width:number;readonly depth:number;readonly height:number}
export interface LivingPath {readonly id:string;readonly owner:string;readonly width:number;readonly points:readonly LivingPoint[];readonly surface:'stone'|'earth'}
export interface LivingBuilding extends LivingPoint {readonly id:string;readonly owner:string;readonly kind:BuildingType|'home'|'market'|'windmill'|'keep'|'hall'|'tower';readonly level:1|2|3;readonly scale:number;readonly rotation:number;readonly width:number;readonly depth:number}
export interface LivingResident {readonly id:string;readonly owner:string;readonly role:'worker'|'guard'|'merchant'|'farmer'|'woodcutter'|'builder';readonly route:readonly LivingPoint[];readonly speed:number;readonly phase:number;readonly working:boolean}
const city=Object.freeze({id:'npc-costa-ambar',name:'Costa Ámbar',x:-408,y:-312,width:168,depth:160,height:1.5});
const village=Object.freeze({id:'npc-las-brumas',name:'Las Brumas',x:-216,y:168,width:56,depth:60,height:.5});
const pt=(place:LivingPoint,x:number,y:number):LivingPoint=>Object.freeze({x:place.x+x,y:place.y+y});
const route:readonly LivingPoint[]=Object.freeze([pt(city,0,72),{x:-390,y:-205},{x:-363,y:-151},{x:-340,y:-100},{x:-312,y:-48},{x:-290,y:8},{x:-268,y:62},{x:-245,y:111},pt(village,0,-30)].map(p=>Object.freeze(p)));
/** This fixed visual district never allocates plots, accounts, inventory or rewards. */
export const LIVING_ZONE=Object.freeze({city,village,road:route});
const paths:LivingPath[]=[];
function path(id:string,place:LivingPlace,width:number,points:readonly[number,number][],surface:LivingPath['surface']='stone') {paths.push(Object.freeze({id,owner:place.id,width,points:Object.freeze(points.map(([x,y])=>pt(place,x,y))),surface}));}
path('city-east-west',city,6,[[-80,0],[80,0]]);
path('city-south-gate',city,5,[[0,0],[0,77]]);
path('city-north-gate',city,5,[[0,0],[0,-18],[-12,-18],[-12,-63],[0,-63],[0,-72]]);
for(const x of[-43,43])path(`city-avenue-${x}`,city,3,[[x,-72],[x,72]]);
for(const y of[-36,36])path(`city-cross-${y}`,city,3,[[-80,y],[80,y]]);
path('city-market-lane',city,3,[[-18,12],[18,12]]);
path('city-plaza-south',city,3,[[-6,6],[6,6]]);
path('city-plaza-west',city,3,[[-6,-6],[-6,6]]);
path('city-plaza-east',city,3,[[6,-6],[6,6]]);
path('city-field-lane',city,2,[[-64,77],[64,77]]);
for(const x of[-24,24])path(`city-field-approach-${x}`,city,1.4,[[x,77],[x,78]]);
for(const x of[-6.5,6.5])path(`city-market-front-${x}`,city,1.4,[[0,20],[x,20]]);
path('city-building-yard',city,1.6,[[0,8],[-18,8]]);
path('city-timber-yard',city,1.6,[[-74,36],[-74,18]]);
path('village-north-south',village,3,[[0,-30],[0,30]],'earth');
path('village-cross',village,3,[[-25,-8],[25,-8]],'earth');
path('village-garden-lane',village,2,[[-22,7],[22,7]],'earth');
for(const x of[-7,7])path(`village-field-approach-${x}`,village,1.4,[[x,7],[x,10]],'earth');
path('village-market-front',village,1.4,[[0,1],[4.5,1]],'earth');
path('village-building-yard',village,1.4,[[-17,7],[-17,3]],'earth');
path('village-timber-yard',village,1.4,[[-24,-8],[-24,-3]],'earth');
paths.push(Object.freeze({id:'amber-brumas-road',owner:'road',width:3.8,points:route,surface:'earth'}));
export const LIVING_PATHS:readonly LivingPath[]=Object.freeze(paths);

const buildings:LivingBuilding[]=[];
function building(place:LivingPlace,kind:LivingBuilding['kind'],x:number,y:number,scale:number,level:1|2|3=2,rotation=0,width?:number,depth?:number) {
  const footprint=kind==='windmill'?[3.8,4.5]:kind==='market'?[5.8,4.3]:kind==='keep'?[3.8,3.4]:kind==='hall'?[2.8,2.3]:kind==='tower'?[2.4,2.4]:[1.95,1.9];
  buildings.push(Object.freeze({...pt(place,x,y),id:`${place.id}-structure-${buildings.length}`,owner:place.id,kind,scale,level,rotation,width:width??footprint[0]*scale,depth:depth??footprint[1]*scale}));
}
// Four quarters have varied workshop/roof silhouettes and house sizes. Streets
// are laid out first; every footprint has clearance from the shared route graph.
const columns=[-64,-50,-36,-22,22,36,50,64],rows=[-56,-43,-30,-17,17,30,43,56];
for(let row=0;row<rows.length;row++)for(let col=0;col<columns.length;col++) {
  const x=columns[col],y=rows[row],index=row*columns.length+col;
  const kind:LivingBuilding['kind']=col<2&&row%3===0?'workshop':col>5&&row%3===1?'warehouse':index%13===0?'kitchen':index%19===0?'laboratory':'home';
  building(city,kind,x,y,3.15+(index%4)*.15,kind==='home'?(index%3===0?3:2):3,x<0?Math.PI/2:-Math.PI/2);
}
building(city,'keep',0,-49,4.6,3,0,18,17);
building(city,'hall',12,49,4.4,3,Math.PI,13,11);
for(const x of[-10,10])for(const y of[-10,20,31])building(city,'market',x,y,.9,3,x<0?Math.PI/2:-Math.PI/2);
for(const[x,y]of[[-80,-72],[80,-72],[-80,72],[80,72],[-80,-52],[80,52],[-62,72],[62,-72]])building(city,'tower',x,y,2.25,3,0,5.4,5.4);
building(city,'windmill',-64,84,1.35,3);
building(city,'windmill',64,84,1.2,3);
for(const x of[-39,-24,24,39])building(city,'garden',x,84,4.6,1,0,9.2,9.2);

for(const[x,y]of[[-17,-14],[-7,-14],[7,-14],[17,-14],[-17,13],[17,13]])building(village,'home',x,y,2.7,2);
building(village,'workshop',-17,-1,3,2);
building(village,'warehouse',17,-1,3.2,2);
building(village,'kitchen',-8,1,2.5,2);
building(village,'market',8,1,.85,2);
building(village,'garden',-7,15,3.2,1,0,6.4,6.4);
building(village,'garden',7,15,3.2,1,0,6.4,6.4);
building(village,'garden',-8,23,2.5,1,0,5,5);
building(village,'windmill',19,20,1.05,2);
building(village,'barracks',-19,20,2.1,2);
building(village,'logistics',12,-23,2,2);
export const LIVING_BUILDINGS:readonly LivingBuilding[]=Object.freeze(buildings);
export const LIVING_PROPS=Object.freeze([
  Object.freeze({...pt(city,0,-28),id:'amber-forecourt-fountain',kind:'fountain' as const,width:9,depth:9}),
  Object.freeze({...pt(city,-18,10),id:'amber-building-workbench',kind:'workbench' as const,width:3,depth:1.1}),
  Object.freeze({...pt(city,-76,18),id:'amber-timber-stack',kind:'timber' as const,width:1.2,depth:3}),
  Object.freeze({...pt(village,-17,1.9),id:'brumas-building-workbench',kind:'workbench' as const,width:2.4,depth:.7}),
]);
const minX=city.x-city.width/2-14,maxX=village.x+village.width/2+14,minY=city.y-city.depth/2-14,maxY=village.y+village.depth/2+14;
export const LIVING_ZONE_BOUNDS=Object.freeze({minX,maxX,minY,maxY});
const nearZone=(x:number,y:number)=>x>=minX&&x<=maxX&&y>=minY&&y<=maxY;

export function distanceToSegment(x:number,y:number,a:LivingPoint,b:LivingPoint):{distance:number;t:number;x:number;y:number} {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)):0;
  const px=a.x+dx*t,py=a.y+dy*t;return{distance:Math.hypot(x-px,y-py),t,x:px,y:py};
}
export function livingRoadAt(x:number,y:number):boolean {
  if(!nearZone(x,y))return false;
  return LIVING_PATHS.some(p=>p.points.slice(1).some((b,i)=>distanceToSegment(x,y,p.points[i],b).distance<=p.width/2));
}
export function isLivingSettlement(id:string):boolean{return id===city.id||id===village.id;}
export function livingOccupiedAt(x:number,y:number,padding=0):boolean {
  if(!Number.isFinite(x)||!Number.isFinite(y)||!nearZone(x,y))return false;
  if(LIVING_BUILDINGS.some(b=>Math.abs(x-b.x)<=b.width/2+padding&&Math.abs(y-b.y)<=b.depth/2+padding))return true;
  // Keep the whole inhabited interior free of randomly spawned trees/animals;
  // authored gardens, avenue trees and flowers fill that space intentionally.
  if([city,village].some(p=>Math.abs(x-p.x)<=p.width/2+padding&&Math.abs(y-p.y)<=p.depth/2+padding))return true;
  return LIVING_PATHS.some(p=>p.points.slice(1).some((b,i)=>distanceToSegment(x,y,p.points[i],b).distance<=p.width/2+padding));
}
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const roadGrades=route.slice(1).map((b,i)=>{const a=route[i];return{a,b,ha:i===0?city.height:sampleWorld(a.x,a.y).height,hb:i===route.length-2?village.height:sampleWorld(b.x,b.y).height};});
/** Global height grading remains identical across chunk boundaries and LOD. */
export function livingTerrainHeight(x:number,y:number,base:number):number {
  if(!nearZone(x,y))return base;
  let height=base;
  for(const place of[city,village]) {
    const edge=Math.max(Math.abs(x-place.x)-place.width/2,Math.abs(y-place.y)-place.depth/2),blend=1-smooth(Math.max(0,edge)/10);
    if(blend>0)height+=(place.height-height)*blend;
  }
  for(const{a,b,ha,hb}of roadGrades) {
    const near=distanceToSegment(x,y,a,b),blend=1-smooth(Math.max(0,near.distance-1.9)/2.5);
    if(blend<=0)continue;
    const grade=ha+(hb-ha)*near.t;
    height+=(grade-height)*blend;
  }
  return height;
}
export function livingChunkFor(point:LivingPoint):{cx:number;cy:number}{return{cx:Math.floor(point.x/WORLD_CHUNK_SIZE),cy:Math.floor(point.y/WORLD_CHUNK_SIZE)};}
export function livingBuildingContains(x:number,y:number,padding=0):boolean{return[...LIVING_BUILDINGS,...LIVING_PROPS].some(b=>Math.abs(x-b.x)<b.width/2+padding&&Math.abs(y-b.y)<b.depth/2+padding);}

const residents:LivingResident[]=[];
function resident(place:LivingPlace,role:LivingResident['role'],points:readonly[number,number][],working:boolean,index:number) {
  residents.push(Object.freeze({id:`${place.id}-resident-${index}`,owner:place.id,role,route:Object.freeze(points.map(([x,y])=>pt(place,x,y))),working,speed:.65+(index%4)*.09,phase:index*.137}));
}
// All walkers use the same streets as carts. Workers pause in open frontage
// beside their workshop or field rather than walking through building geometry.
for(let i=0;i<40;i++) {
  const sign=Math.floor(i/6)%2?-1:1,lane=i%4,role:LivingResident['role']=(['worker','merchant','farmer','guard','builder','woodcutter']as const)[i%6];
  if(role==='farmer')resident(city,role,[[0,66],[0,77],[sign*24,77],[sign*24,78]],true,i);
  else if(role==='merchant')resident(city,role,[[0,8],[0,20],[sign*6.5,20]],true,i);
  else if(role==='builder')resident(city,role,[[0,8],[-18,8]],true,i);
  else if(role==='woodcutter')resident(city,role,[[-43,36],[-74,36],[-74,18]],true,i);
  else if(lane===0)resident(city,role,[[-72,sign*.6],[72,sign*.6]],false,i);
  else if(lane===1)resident(city,role,[[sign*43+.7,-64],[sign*43+.7,64]],false,i);
  else if(lane===2)resident(city,role,[[-70,sign*36+.65],[70,sign*36+.65]],false,i);
  else resident(city,role,[[sign*.85,6],[sign*.85,66]],false,i);
}
for(let i=0;i<12;i++) {
  const role:LivingResident['role']=(['farmer','worker','merchant','guard','woodcutter','builder']as const)[i%6];
  const sign=Math.floor(i/6)%2?-1:1;
  if(role==='farmer')resident(village,role,[[0,7],[sign*7,7],[sign*7,10]],true,i);
  else if(role==='merchant')resident(village,role,[[.5,-8],[.5,1],[4.5,1]],true,i);
  else if(role==='builder')resident(village,role,[[0,7],[-17,7],[-17,3]],true,i);
  else if(role==='woodcutter')resident(village,role,[[0,-8],[-24,-8],[-24,-3]],true,i);
  else if(i%3===0)resident(village,role,[[-22,-7.6],[22,-7.6]],false,i);
  else resident(village,role,[[.6,-20],[.6,20]],false,i);
}
export const LIVING_RESIDENTS:readonly LivingResident[]=Object.freeze(residents);

export interface LivingRoutePose extends LivingPoint {readonly yaw:number;readonly walking:boolean;readonly working:boolean;readonly progress:number}
/** Ping-pong routes include a visible work/idle stop at either end. */
export function livingRoutePose(resident:LivingResident,time:number):LivingRoutePose {
  const lengths=resident.route.slice(1).map((b,i)=>Math.hypot(b.x-resident.route[i].x,b.y-resident.route[i].y)),length=lengths.reduce((a,b)=>a+b,0),travel=length/resident.speed,pause=resident.working?5:1.5,cycle=(travel+pause)*2;
  const phase=((Math.max(0,time)+resident.phase*cycle)%cycle+cycle)%cycle,back=phase>=travel+pause,offset=back?phase-travel-pause:phase,walking=offset<travel;
  const progress=Math.min(1,offset/travel),distance=(back?1-progress:progress)*length;
  let travelled=0,index=lengths.length-1;for(let i=0;i<lengths.length;i++){if(distance<=travelled+lengths[i]){index=i;break;}travelled+=lengths[i];}
  const a=resident.route[index],b=resident.route[index+1],t=lengths[index]?(distance-travelled)/lengths[index]:0;
  return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,yaw:Math.atan2((b.x-a.x)*(back?-1:1),(b.y-a.y)*(back?-1:1)),walking,working:!walking&&resident.working,progress};
}
