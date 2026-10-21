import { sampleWorld, WORLD_CHUNK_SIZE } from './world-geography.ts';
import type { LivingPoint } from './living-zone-data.ts';
import { distanceToSegment } from './living-zone-data.ts';

export type FishingBoatState='preparing'|'outbound'|'fishing'|'inbound'|'unloading'|'resting';
export type FishingWorkerState='walking'|'lifting'|'carrying'|'unloading'|'waiting'|'working';
export type FishingCartState='approaching'|'loading'|'outbound'|'unloading'|'inbound'|'parking'|'resting';
export interface FishingStructure extends LivingPoint {readonly id:string;readonly owner:string;readonly kind:'home'|'warehouse'|'fishstall'|'workshop'|'kitchen'|'garden'|'market'|'hall'|'tower'|'windmill'|'logistics';readonly yaw:number;readonly scale:number;readonly width:number;readonly depth:number;readonly height?:number}
export interface FishingProp extends LivingPoint {readonly id:string;readonly kind:'dock'|'rack'|'crate'|'landing'|'net';readonly yaw:number;readonly scale:number;readonly width:number;readonly depth:number;readonly height?:number}
export interface FishingPath {readonly id:string;readonly width:number;readonly points:readonly LivingPoint[];readonly surface:'land'|'dock'}
export interface FishingCrew {readonly id:string;readonly x:number;readonly y:number;readonly state:'sailing'|'fishing'|'handling';readonly carrying:boolean}
export interface FishingBoatPose extends LivingPoint {readonly id:string;readonly name:string;readonly yaw:number;readonly state:FishingBoatState;readonly cargo:number;readonly cargoIds:readonly string[];readonly batchId:string;readonly speed:number;readonly waterLevel:number;readonly crew:readonly FishingCrew[];readonly dockSlot:string;readonly progress:number}
export interface FishingWorkerPose extends LivingPoint {readonly id:string;readonly name:string;readonly yaw:number;readonly state:FishingWorkerState;readonly carrying:boolean;readonly cargoId?:string;readonly height?:number;readonly speed:number;readonly role:'porter'|'merchant'}
export interface FishingCartPose extends LivingPoint {readonly id:string;readonly name:string;readonly yaw:number;readonly state:FishingCartState;readonly cargo:number;readonly cargoIds:readonly string[];readonly batchId:string;readonly speed:number;readonly animal:'horse';readonly height?:number;readonly destinationId:string;readonly progress:number}
export interface FishingSnapshot {readonly time:number;readonly boats:readonly FishingBoatPose[];readonly workers:readonly FishingWorkerPose[];readonly carts:readonly FishingCartPose[];readonly loads:readonly {id:string;batchId:string;quantity:number;cargoIds:readonly string[];location:'boat'|'worker'|'staging'|'cart'|'city'}[]}
const p=(x:number,y:number):LivingPoint=>Object.freeze({x,y});
const city=Object.freeze({id:'fishing-ciudad-estuario',name:'Ciudad del Estuario',alias:'AlbaEstuario',kind:'city' as const,x:900,y:6784,width:120,depth:108,biome:'coast' as const,stage:'city' as const,tier:3 as const});
const port=Object.freeze({id:'fishing-bahia-del-viento',name:'Bahía del Viento',alias:'NicoMarea',kind:'village' as const,x:1080,y:6740,width:80,depth:80,biome:'coast' as const,stage:'village' as const,tier:2 as const});
const dock=Object.freeze({x:1152,y:6723,yaw:Math.PI/2,heading:Math.PI/2,width:34,length:64,deckHeight:.95,shore:p(1112,6723),end:p(1184,6723)});
export const FISHING_PLACES=Object.freeze([port,city]);
export const FISHING_COMMUNITY=Object.freeze({...port,waterLevel:0,city,dock,boats:Object.freeze([{id:'fishing-boat-aurora',name:'La Aurora',slot:'fishing-north-berth',offset:0},{id:'fishing-boat-brisa',name:'Brisa del Alba',slot:'fishing-south-berth',offset:270}]),bounds:Object.freeze({minX:832,maxX:1344,minY:6632,maxY:6860})});
export const FISHING_CYCLE_SECONDS=540;
export const FISHING_BOAT_ROUTES=Object.freeze([
  Object.freeze({id:'fishing-boat-aurora',slot:'fishing-north-berth',offset:0,points:Object.freeze([p(1180,6699),p(1208,6699),p(1240,6680),p(1280,6656),p(1320,6644)])}),
  Object.freeze({id:'fishing-boat-brisa',slot:'fishing-south-berth',offset:270,points:Object.freeze([p(1180,6747),p(1210,6747),p(1244,6760),p(1280,6776),p(1320,6772)])}),
]);
const landPaths:FishingPath[]=[
  {id:'fishing-road-city',width:7,points:[p(1112,6723),p(1080,6740),p(1040,6764),p(1000,6784),p(900,6784)],surface:'land'},
  {id:'fishing-city-cross',width:6,points:[p(900,6732),p(900,6836)],surface:'land'},
  {id:'fishing-port-cross',width:5,points:[p(1042,6740),p(1118,6740)],surface:'land'},
  {id:'fishing-city-east-west',width:6,points:[p(842,6784),p(958,6784)],surface:'land'},
  {id:'fishing-city-food-delivery',width:5.5,points:[p(890,6784),p(890,6791.5)],surface:'land'},
  {id:'fishing-city-turning-yard',width:5.5,points:[...Array.from({length:25},(_,i)=>p(885.5+Math.cos(i*Math.PI/24)*4.5,6790+Math.sin(i*Math.PI/24)*4.5)),p(881,6784),p(890,6784)],surface:'land'},
  {id:'fishing-dock-access',width:10,points:[p(1112,6723),p(1184,6723)],surface:'dock'},
];
for(const y of[6716,6730])landPaths.push({id:`fishing-wharf-lane-${y}`,width:6,points:[p(1124,6723),p(1140,6723),p(1150,y),p(1161,y)],surface:'dock'});
export const FISHING_LAND_PATHS:readonly FishingPath[]=Object.freeze(landPaths.map(path=>Object.freeze({...path,points:Object.freeze(path.points)})));
export const FISHING_DOCK_PATHS=Object.freeze([
  Object.freeze({id:'fishing-main-wharf',width:34,points:Object.freeze([p(1120,6723),p(1184,6723)]),surface:'dock' as const}),
  ...FISHING_BOAT_ROUTES.flatMap((route,index)=>[1178,1182].map(x=>Object.freeze({id:`${route.id}-gangway-${x}`,width:1.4,points:Object.freeze([p(x,index?6737:6709),p(x,index?6746:6700)]),surface:'dock' as const}))),
]);
const structures:FishingStructure[]=[];
function building(owner:string,kind:FishingStructure['kind'],x:number,y:number,scale:number,yaw=0,width=2.7*scale,depth=2.6*scale){structures.push(Object.freeze({id:`${owner}-building-${structures.length}`,owner,kind,x,y,yaw,scale,width,depth}));}
for(const[x,y]of[[1056,6718],[1072,6718],[1090,6718],[1080,6776],[1072,6758],[1090,6758]])building(port.id,'home',x,y,2.8);
building(port.id,'warehouse',1102,6758,3.7);building(port.id,'fishstall',1054,6730,1,0,7.2,5.2);building(port.id,'workshop',1098,6774,3);building(port.id,'kitchen',1054,6772,2.7);
for(const y of[-34,-18,18,34])for(const x of[-42,-26,-10,10,26,42])building(city.id,x===-10&&y===18?'warehouse':x===-42&&y===-34?'workshop':x===42&&y===34?'kitchen':'home',city.x+x,city.y+y,x===-10&&y===18?2.9:2.8,x===-10&&y===18?Math.PI:x<0?Math.PI/2:-Math.PI/2);
for(const x of[-10,10])building(city.id,'market',city.x+x,city.y-7,.8,0,5.6,4);
building(city.id,'hall',city.x-10,city.y-48,3.2,0,14,12);building(city.id,'garden',city.x+14,city.y+48,3.2);building(city.id,'windmill',city.x+42,city.y-48,1.15,0,8.7,5.8);
for(const x of[-57,57])for(const y of[-51,51])building(city.id,'tower',city.x+x,city.y+y,1.8,0,5,5);
building(city.id,'logistics',city.x-42,city.y+48,2.5);
export const FISHING_STRUCTURES:readonly FishingStructure[]=Object.freeze(structures);
export const FISHING_PROPS:readonly FishingProp[]=Object.freeze([
  Object.freeze({id:'fishing-wharf-platform',kind:'dock',x:1152,y:6723,yaw:Math.PI/2,scale:1,width:64,depth:34,height:dock.deckHeight}),
  Object.freeze({id:'fishing-north-stage',kind:'rack',x:1170,y:6708,yaw:0,scale:1,width:6,depth:3,height:dock.deckHeight}),
  Object.freeze({id:'fishing-south-stage',kind:'rack',x:1170,y:6738,yaw:0,scale:1,width:6,depth:3,height:dock.deckHeight}),
  Object.freeze({id:'fishing-net-rack',kind:'net',x:1094,y:6768,yaw:0,scale:1,width:4,depth:2}),
]);
function roundedPath(points:readonly LivingPoint[],radius=4.3):readonly LivingPoint[] {
  const result:LivingPoint[]=[points[0]];
  for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],l1=Math.hypot(b.x-a.x,b.y-a.y),l2=Math.hypot(c.x-b.x,c.y-b.y),ux=(b.x-a.x)/l1,uy=(b.y-a.y)/l1,vx=(c.x-b.x)/l2,vy=(c.y-b.y)/l2,cross=ux*vy-uy*vx,turn=Math.acos(Math.max(-1,Math.min(1,ux*vx+uy*vy)));if(turn<.025||turn>Math.PI-.025){result.push(b);continue;}const tangent=Math.min(radius*Math.tan(turn/2),l1*.75,l2*.75),r=tangent/Math.tan(turn/2),sign=Math.sign(cross),start=p(b.x-ux*tangent,b.y-uy*tangent),center=p(start.x-uy*sign*r,start.y+ux*sign*r),angle=Math.atan2(start.y-center.y,start.x-center.x),n=Math.ceil(turn/(Math.PI/24));result.push(start);for(let step=1;step<=n;step++){const theta=angle+sign*turn*step/n;result.push(p(center.x+Math.cos(theta)*r,center.y+Math.sin(theta)*r));}}
  result.push(points.at(-1)!);return Object.freeze(result);
}
const cityTurn=Object.freeze(Array.from({length:25},(_,i)=>p(885.5+Math.cos(i*Math.PI/24)*4.5,6790+Math.sin(i*Math.PI/24)*4.5)));
export const FISHING_CART_ROUTES=Object.freeze(FISHING_BOAT_ROUTES.map((boat,index)=>{
  const bay=p(1161,index?6730:6716),parking=p(1136,index?6734:6712),points=roundedPath([bay,p(1150,bay.y),p(1140,6723),p(1112,6723),p(1080,6740),p(1040,6764),p(1000,6784),p(920,6784),p(890,6784),p(890,6790)]);
  const approach:LivingPoint[]=[parking,p(1136,index?6721:6725),p(1176,index?6721:6725)];const centerY=index?6725.5:6720.5,sign=index?1:-1;for(let step=1;step<=24;step++){const a=(index?-Math.PI/2:Math.PI/2)+sign*Math.PI*step/24;approach.push(p(1176+Math.cos(a)*4.5,centerY+Math.sin(a)*4.5));}approach.push(bay);
  const returnPoints=Object.freeze([...cityTurn,...roundedPath([cityTurn.at(-1)!,p(881,6784),p(920,6784),p(1000,6784),p(1040,6764),p(1080,6740),p(1112,6723),p(1140,6723),p(1150,bay.y),bay]).slice(1)]);
  return Object.freeze({id:`${boat.id}-haulage`,boatId:boat.id,offset:boat.offset,loadStart:385,parking,points,returnPoints,approachPoints:roundedPath(approach)});
}));

const pathMetrics=new WeakMap<readonly LivingPoint[],{lengths:number[];length:number}>();
function metrics(points:readonly LivingPoint[]){let value=pathMetrics.get(points);if(!value){const lengths=points.slice(1).map((b,i)=>Math.hypot(b.x-points[i].x,b.y-points[i].y));value={lengths,length:lengths.reduce((a,b)=>a+b,0)};pathMetrics.set(points,value);}return value;}
export function fishingPathLength(points:readonly LivingPoint[]):number{return metrics(points).length;}
export function fishingPathPose(points:readonly LivingPoint[],progress:number):LivingPoint&{yaw:number;distance:number} {
  const {lengths,length}=metrics(points),distance=Math.max(0,Math.min(1,progress))*length;let accumulated=0,index=lengths.length-1;
  for(let i=0;i<lengths.length;i++){if(distance<=accumulated+lengths[i]){index=i;break;}accumulated+=lengths[i];}
  const a=points[index],b=points[index+1],t=lengths[index]?(distance-accumulated)/lengths[index]:0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,yaw:Math.atan2(b.x-a.x,b.y-a.y),distance};
}
const mod=(v:number,n:number)=>((v%n)+n)%n;
const cargoIds=(batch:string)=>Array.from({length:6},(_,i)=>`${batch}-crate-${i}`);
function boatTiming(time:number,offset:number){const value=time+offset;return{cycle:Math.floor(value/FISHING_CYCLE_SECONDS),phase:mod(value,FISHING_CYCLE_SECONDS)};}
const unloadingStages=(phase:number,tripLength=30,pickup=12,drop=23)=>{let picked=0,dropped=0;for(let trip=0;trip<3;trip++){if(phase>=trip*tripLength+pickup)picked+=2;if(phase>=trip*tripLength+drop)dropped+=2;}return{picked,dropped};};
const foundationIndex=new Map<string,FishingStructure[]>();for(const b of structures){const padding=10;for(let cx=Math.floor((b.x-b.width/2-padding)/64);cx<=Math.floor((b.x+b.width/2+padding)/64);cx++)for(let cy=Math.floor((b.y-b.depth/2-padding)/64);cy<=Math.floor((b.y+b.depth/2+padding)/64);cy++){const key=`${cx}:${cy}`,list=foundationIndex.get(key)??[];list.push(b);foundationIndex.set(key,list);}}
const foundationHeights=new Map(structures.map(b=>{const s=sampleWorld(b.x,b.y);return[b.id,Math.round(Math.max(.5,s.height,s.water?s.waterLevel+.6:-Infinity)*2)/2];}));
export function fishingRoadAt(x:number,y:number):boolean {const bounds=FISHING_COMMUNITY.bounds;if(x<bounds.minX||x>bounds.maxX||y<bounds.minY||y>bounds.maxY)return false;const road=FISHING_LAND_PATHS.some(path=>path.surface==='land'&&path.points.slice(1).some((b,i)=>distanceToSegment(x,y,path.points[i],b).distance<=path.width/2));return road&&!sampleWorld(x,y).water;}
export function fishingOccupiedAt(x:number,y:number,padding=0):boolean{return FISHING_PLACES.some(place=>Math.abs(x-place.x)<=place.width/2+padding&&Math.abs(y-place.y)<=place.depth/2+padding)||fishingRoadAt(x,y)||Math.abs(x-dock.x)<=dock.length/2+padding&&Math.abs(y-dock.y)<=dock.width/2+padding;}
export function fishingTerrainHeight(x:number,y:number,base:number,sample?:{water:boolean;river:boolean;waterLevel:number}):number {
  const candidates=foundationIndex.get(`${Math.floor(x/WORLD_CHUNK_SIZE)}:${Math.floor(y/WORLD_CHUNK_SIZE)}`);if(!candidates)return base;const exact=candidates.find(b=>Math.abs(x-b.x)<=b.width/2+.15&&Math.abs(y-b.y)<=b.depth/2+.15);if(exact)return foundationHeights.get(exact.id)!;if(sample?.water)return base;
  let sum=base,total=1;for(const b of candidates){const d=Math.max(Math.abs(x-b.x)-b.width/2,Math.abs(y-b.y)-b.depth/2);if(d>=8)continue;const t=Math.max(0,Math.min(1,d/8)),influence=1-t*t*(3-2*t),weight=influence*influence/Math.max(1e-8,1-influence);sum+=foundationHeights.get(b.id)!*weight;total+=weight;}return sum/total;
}
export function fishingSurfaceHeight(x:number,y:number,base:number):number {
  if(x>=1120&&x<=1184&&Math.abs(y-dock.y)<=17)return dock.deckHeight;
  if(x>=1112&&x<1120&&Math.abs(y-dock.y)<=5){const t=(x-1112)/8;return base+(dock.deckHeight-base)*t;}
  return FISHING_DOCK_PATHS.slice(1).some(path=>path.points.slice(1).some((b,i)=>distanceToSegment(x,y,path.points[i],b).distance<=path.width/2))?dock.deckHeight:base;
}
function dockHeight(point:LivingPoint):number|undefined {if(point.x<1112)return undefined;const sample=sampleWorld(point.x,point.y);return fishingSurfaceHeight(point.x,point.y,sample.height);}
function boatUnloadRoute(index:number,worker:number):readonly LivingPoint[] {const x=worker?1182:1178,y=index?6735:6711;return[ p(worker?1172:1168,y),p(x,y),p(x,index?6746:6700) ];}
function cartLoadRoute(index:number,worker:number):readonly LivingPoint[] {const start=p(worker?1172:1168,index?6735:6711),bay=index?6730:6716,side=(index?1:-1)*(worker?-1:1),drop=p(1161.5,bay+side*1.7);return worker?[start,p(1176,start.y),p(1176,bay+side*2.4),p(1161.5,bay+side*2.4),drop]:[start,p(1161.5,start.y),drop];}
function workerPose(id:string,name:string,route:readonly LivingPoint[],phase:number,mode:'boat'|'cart'|'city',crateId:string):FishingWorkerPose {
  const duration=mode==='boat'?30:mode==='cart'?45:20,u=mod(phase,duration);let progress=0,state:FishingWorkerState='waiting',carrying=false,speed=0,reverse=false;
  if(mode==='cart'){
    if(u<3)state='lifting';else if(u<21){state='carrying';carrying=true;progress=(u-3)/18;speed=1.4;}else if(u<24){state='unloading';progress=1;}else if(u<42){state='walking';progress=1-(u-24)/18;speed=1.4;reverse=true;}
  }else{const walk=mode==='boat'?9:3.5,pickup=mode==='boat'?12:6,drop=mode==='boat'?23:12,finish=mode==='boat'?25:14;if(u<walk){state='walking';progress=u/walk;speed=1.7;}else if(u<pickup){state='lifting';progress=1;}else if(u<drop){state='carrying';carrying=true;progress=1-(u-pickup)/(drop-pickup);speed=1.4;reverse=true;}else if(u<finish)state='unloading';}
  if(speed){const seconds=mode==='cart'?18:state==='carrying'?(mode==='boat'?11:6):mode==='boat'?9:3.5;speed=fishingPathLength(route)/seconds;}
  const pose=fishingPathPose(route,progress);return{id,name,x:pose.x,y:pose.y,yaw:pose.yaw+(reverse?Math.PI:0),state,carrying,cargoId:carrying?crateId:undefined,height:dockHeight(pose),speed,role:'porter'};
}

export function fishingSnapshot(timeSeconds:number):FishingSnapshot {
  const time=Number.isFinite(timeSeconds)?Math.max(0,timeSeconds):0,boats:FishingBoatPose[]=[],workers:FishingWorkerPose[]=[],cartPoses:FishingCartPose[]=[],loads:FishingSnapshot['loads'][number][]=[];
  for(let index=0;index<FISHING_BOAT_ROUTES.length;index++) {
    const route=FISHING_BOAT_ROUTES[index],timing=boatTiming(time,route.offset),batchId=`${route.id}-batch-${timing.cycle}`,ids=cargoIds(batchId),phase=timing.phase;
    let state:FishingBoatState='preparing',progress=0,speed=0,quantity=0;
    if(phase<25)state='preparing';else if(phase<120){state='outbound';progress=(phase-25)/95;speed=1.7;}else if(phase<200){state='fishing';progress=1;quantity=Math.min(6,Math.floor((phase-120)/80*6));}else if(phase<295){state='inbound';progress=1-(phase-200)/95;speed=1.7;quantity=6;}else if(phase<385){state='unloading';quantity=6-unloadingStages(phase-295).picked;}else state='resting';
    if(speed)speed=fishingPathLength(route.points)/95;
    const pose=fishingPathPose(route.points,progress);let yaw=state==='inbound'?pose.yaw+Math.PI:state==='preparing'||state==='unloading'||state==='resting'?Math.PI/2:pose.yaw;
    if(state==='fishing'&&phase>=192)yaw+=Math.PI*((phase-192)/8);
    if(state==='inbound'&&phase>=287){const t=(phase-287)/8;yaw+=(Math.PI/2-yaw)*t;}
    const sample=sampleWorld(pose.x,pose.y);boats.push({id:route.id,name:FISHING_COMMUNITY.boats[index].name,...pose,yaw,state,cargo:quantity,cargoIds:Object.freeze(ids.slice(6-quantity)),batchId,speed,waterLevel:sample.waterLevel,dockSlot:route.slot,progress,crew:Object.freeze([0,1].map(crew=>({id:`${route.id}-crew-${crew}`,x:crew?.45:-.45,y:crew?-.7:.7,state:(state==='fishing'?'fishing':state==='unloading'?'handling':'sailing') as FishingCrew['state'],carrying:state==='unloading'&&quantity>0})))});
    if(quantity)loads.push({id:`${batchId}-aboard`,batchId,quantity,cargoIds:Object.freeze(ids.slice(6-quantity)),location:'boat'});
  }
  for(let index=0;index<FISHING_CART_ROUTES.length;index++) {
    const route=FISHING_CART_ROUTES[index],boat=FISHING_BOAT_ROUTES[index],clock=time+route.offset-375,cycle=Math.floor(clock/540),phase=mod(clock,540),batchId=`${route.boatId}-batch-${cycle}`,ids=cargoIds(batchId),bay=route.points[0];
    let state:FishingCartState='resting',progress=0,pose={...route.parking,yaw:-Math.PI/2,distance:0},quantity=0,speed=0;
    if(phase<10){state='approaching';pose=fishingPathPose(route.approachPoints,phase/10);speed=5;}else if(phase<145){state='loading';pose={...bay,yaw:-Math.PI/2,distance:0};quantity=unloadingStages(phase-10,45,3,21).dropped;}else if(phase<245){state='outbound';progress=(phase-145)/100;pose=fishingPathPose(route.points,progress);quantity=6;speed=3.2;}else if(phase<305){state='unloading';progress=1;pose=fishingPathPose(route.points,1);quantity=6-unloadingStages(phase-245,20,6,12).picked;}else if(phase<405){state='inbound';progress=(phase-305)/100;pose=fishingPathPose(route.returnPoints,progress);speed=3.2;}else if(phase<415){state='parking';pose=fishingPathPose([...route.approachPoints].reverse(),(phase-405)/10);speed=5;}
    if(speed)speed=fishingPathLength(state==='approaching'||state==='parking'?route.approachPoints:state==='inbound'?route.returnPoints:route.points)/(state==='approaching'||state==='parking'?10:100);
    const carryingIds=state==='unloading'?ids.slice(6-quantity):ids.slice(0,quantity);cartPoses.push({id:route.id,name:index?'Carro de Mateo':'Carro de Lucía',x:pose.x,y:pose.y,yaw:pose.yaw,state,cargo:quantity,cargoIds:Object.freeze(carryingIds),batchId,speed,animal:'horse',height:dockHeight(pose),destinationId:city.id,progress});if(quantity)loads.push({id:`${batchId}-cart`,batchId,quantity,cargoIds:Object.freeze(carryingIds),location:'cart'});
    const bt=boatTiming(time,boat.offset),boatBatch=`${boat.id}-batch-${bt.cycle}`,boatIds=cargoIds(boatBatch),boatPhase=bt.phase;
    for(let worker=0;worker<2;worker++) {
      const id=`${boat.id}-porter-${worker}`,name=worker?(index?'Mara Salas':'Luna Rojas'):(index?'Diego Mora':'Leo Vargas');
      if(boatPhase>=295&&boatPhase<385){const u=boatPhase-295,trip=Math.min(2,Math.floor(u/30));workers.push(workerPose(id,name,boatUnloadRoute(index,worker),u,'boat',boatIds[trip*2+worker]));}
      else if(phase>=10&&phase<145){const u=phase-10,trip=Math.min(2,Math.floor(u/45));workers.push(workerPose(id,name,cartLoadRoute(index,worker),u,'cart',ids[trip*2+worker]));}
      else {const start=boatUnloadRoute(index,worker)[0];workers.push({id,name,...start,yaw:Math.PI/2,state:'waiting',carrying:false,height:dock.deckHeight,speed:0,role:'porter'});}
    }
    let staged=0,stagedStart=0;if(boatPhase>=295&&boatPhase<385)staged=unloadingStages(boatPhase-295).dropped;else if(boatPhase>=385){stagedStart=unloadingStages(boatPhase-385,45,3,21).picked;staged=6-stagedStart;}
    if(staged>0)loads.push({id:`${boatBatch}-staging`,batchId:boatBatch,quantity:staged,cargoIds:Object.freeze(boatIds.slice(stagedStart,stagedStart+staged)),location:'staging'});
    // Keep a bounded record of completed deliveries, allowing the same crate
    // identities to be inspected before and after a trip without an endless log.
    const previousBatch=`${route.boatId}-batch-${cycle-1}`;loads.push({id:`${previousBatch}-city`,batchId:previousBatch,quantity:6,cargoIds:Object.freeze(cargoIds(previousBatch)),location:'city'});
    if(phase>=245){const delivered=phase>=305?6:unloadingStages(phase-245,20,6,12).dropped;if(delivered)loads.push({id:`${batchId}-city`,batchId,quantity:delivered,cargoIds:Object.freeze(ids.slice(0,delivered)),location:'city'});}
  }
  for(let worker=0;worker<2;worker++) {
    const active=cartPoses.find(cart=>cart.state==='unloading'),x=890+(worker?1.7:-1.7),route=[p(x,6797.4),p(x,6789.5)];
    if(active){const cartIndex=cartPoses.indexOf(active),clock=time+FISHING_CART_ROUTES[cartIndex].offset-375,phase=mod(clock,540)-245,trip=Math.min(2,Math.floor(phase/20));workers.push(workerPose(`fishing-city-porter-${worker}`,worker?'Ana del Puerto':'Hugo Estuario',route,phase,'city',cargoIds(active.batchId)[trip*2+worker]));}
    else workers.push({id:`fishing-city-porter-${worker}`,name:worker?'Ana del Puerto':'Hugo Estuario',...route[0],yaw:Math.PI,state:'waiting',carrying:false,speed:0,role:'merchant'});
  }
  for(const worker of workers)if(worker.cargoId)loads.push({id:worker.cargoId,batchId:worker.cargoId.replace(/-crate-\d+$/,''),quantity:1,cargoIds:Object.freeze([worker.cargoId]),location:'worker'});
  return{time,boats,workers,carts:cartPoses,loads};
}
